#!/usr/bin/env node
/**
 * 金十红色新闻监控 - 彻底解决重复推送问题
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync, unlinkSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCK_FILE = join(__dirname, '.lock');
const DEDUP_FILE = join(__dirname, 'dedup.json');
const STATE_FILE = join(__dirname, 'state.json');

// 配置
const JIN10_URL = 'https://www.jin10.com/';
const POLL_MS = 60_000;
const CDP_PORT = 18800;
const DEDUP_HOURS = 72;

// 从 config.json 读取配置
const cfg = existsSync(join(__dirname, 'config.json')) 
  ? JSON.parse(readFileSync(join(__dirname, 'config.json'), 'utf-8')) : {};
const TG_TOKEN = cfg.TELEGRAM_BOT_TOKEN || '';
const TG_CHAT_ID = cfg.TELEGRAM_CHAT_ID || '';

// AI analysis: we intentionally do NOT use minimax fallback.
// The goal is: always route through OpenClaw's main model chain (yunyi-codex) for stability.
const AI_API_KEY = cfg.MINIMAX_API_KEY || '';
const OPENCLAW_BIN = cfg.OPENCLAW_BIN || 'openclaw';
// Use a versioned session id so prompt format changes take effect immediately
// (otherwise the model may follow earlier in-session formatting).
const OPENCLAW_AI_SESSION = cfg.OPENCLAW_AI_SESSION || 'jin10-ai-v4';

// 工具函数
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ts = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace('T', ' ');

function log(m) { console.log(`[${ts()}] ${m}`); }
function logErr(m) { console.error(`[${ts()}] ERROR: ${m}`); appendFileSync(join(__dirname, 'errors.log'), `[${ts()}] ${m}\n`); }
function esc(t) { return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function mdToHtml(t) { return t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'); }

// 确保只有一个实例
function acquireLock() {
  if (existsSync(LOCK_FILE)) {
    const pid = parseInt(readFileSync(LOCK_FILE, 'utf-8').trim(), 10);
    if (pid && pid !== process.pid) {
      try { process.kill(pid, 0); process.exit(0); } catch {}
    }
  }
  writeFileSync(LOCK_FILE, String(process.pid));
  process.on('exit', () => { try { unlinkSync(LOCK_FILE); } catch {} });
}

// 去重
function loadDedup() {
  if (!existsSync(DEDUP_FILE)) return {};
  try { return JSON.parse(readFileSync(DEDUP_FILE, 'utf-8')); } catch { return {}; }
}
function loadState() {
  if (!existsSync(STATE_FILE)) {
    return {
      ok: 0,
      fail: 0,
      consecutiveFail: 0,
      lastSuccessAt: null,
      lastPushAt: null,
      lastErrorAt: null,
      lastError: '',
      aiFailConsecutive: 0,
      aiDisabledUntil: null,
      pendingAnalyses: {},
    };
  }
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return {
      ok: 0,
      fail: 0,
      consecutiveFail: 0,
      lastSuccessAt: null,
      lastPushAt: null,
      lastErrorAt: null,
      lastError: 'state.json parse error',
      aiFailConsecutive: 0,
      aiDisabledUntil: null,
      pendingAnalyses: {},
    };
  }
}

function saveState(s) {
  try { writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); } catch {}
}

function saveDedup(d) { writeFileSync(DEDUP_FILE, JSON.stringify(d, null, 2)); }
function cleanDedup(d) {
  const cut = Date.now() - DEDUP_HOURS * 3600_000;
  return Object.fromEntries(Object.entries(d).filter(([, v]) => v.ts > cut));
}
function getKey(item) { return createHash('sha1').update(item.time + '|' + item.content.substring(0,100)).digest('hex'); }

// 广告过滤
const AD_PATTERNS = /(?:\d+折.*VIP|VIP[·\s]*\d*折|VIP.*折|立省\d+|立即抢购|限时|优惠|折扣|新春福利|解锁.*利器|领取.*礼|猜金价|竞猜.*赢|资金监测器)/;
function isAd(item) {
  const text = (item.title || '') + ' ' + (item.content || '');
  return AD_PATTERNS.test(text);
}

// 过滤「点击查看」类占位内容（通常是引流/截断，信息不完整）
const CLICK_TO_VIEW_PATTERNS = /(?:点击查看|点击查看详情|点击看详情|点击查看全文|查看更多|展开全文)/;
function isClickToView(item) {
  const text = (item.title || '') + ' ' + (item.content || '');
  return CLICK_TO_VIEW_PATTERNS.test(text);
}

// Telegram
async function tgSend(text) {
  if (!TG_TOKEN || !TG_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT_ID, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
  } catch (e) { logErr(`TG: ${e.message}`); }
}

function fmtMsg(item, analysis = '', analysisSource = '', analysisError = '', technical = '') {
  const t = item.title ? `\n📌 <b>${esc(item.title)}</b>` : '';
  const src = analysisSource ? `（${esc(analysisSource)}）` : '';

  let a;
  if (analysis) {
    a = `\n\n📊 <b>AI 分析${src}</b>\n${esc(mdToHtml(analysis)).replace(/&lt;b&gt;/g, '<b>').replace(/&lt;\/b&gt;/g, '</b>').replace(/\n\n/g, '\n')}`;
  } else {
    const reason = analysisError ? `：${esc(analysisError)}` : '';
    a = `\n\n🤖 <b>AI 分析</b>${reason}\n<i>本条未生成分析（已合并在同一条消息里，避免补发/拆分）</i>`;
  }

  const techBlock = technical
    ? `\n\n📈 <b>技术面（人话）</b>\n${esc(mdToHtml(technical)).replace(/&lt;b&gt;/g, '<b>').replace(/&lt;\/b&gt;/g, '</b>').replace(/\n\n/g, '\n')}`
    : '';

  return `📡 <b>金十重要新闻推送</b>\n⏰ ${esc(item.time)}${t}\n${esc(item.content)}${a}${techBlock}`;
}

function extractTickersFromAnalysis(analysisText) {
  const m = String(analysisText || '').match(/^标的：\s*(.+)$/m);
  if (!m) return [];
  return m[1]
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function mapToTradingViewSymbol(ticker) {
  const raw = String(ticker || '').trim();
  const t = raw.toUpperCase();
  const direct = {
    XAUUSD: 'XAUUSD',
    GOLD: 'XAUUSD',
    '黄金': 'XAUUSD',
    BTC: 'BTCUSD',
    BTCUSD: 'BTCUSD',
    ETH: 'ETHUSD',
    ETHUSD: 'ETHUSD',
    DXY: 'TVC:DXY',
    '美元指数DXY': 'TVC:DXY',
    '美元指数': 'TVC:DXY',
    SPX: 'SPX',
    '标普500': 'SPX',
    '标普500指数': 'SPX',
    NDX: 'NASDAQ:NDX',
    '纳斯达克100': 'NASDAQ:NDX',
    '纳斯达克100指数': 'NASDAQ:NDX',
  };
  if (direct[t]) return direct[t];

  // HK stocks like "(01347.HK)" or "01347.HK" → HKEX-1347
  const hk = raw.match(/\(?\s*(\d{4,5})\.HK\s*\)?/i);
  if (hk) {
    const num = String(parseInt(hk[1], 10));
    return `HKEX:${num}`;
  }

  // If it looks like a US stock ticker, try it as-is.
  if (/^[A-Z]{1,5}$/.test(t)) return t;

  return null;
}

function tradingViewTechnicalsUrl(tvSymbol) {
  // TradingView uses different URL shapes for some symbols.
  if (tvSymbol === 'TVC:DXY') return 'https://www.tradingview.com/symbols/TVC-DXY/technicals/';
  if (tvSymbol === 'NASDAQ:NDX') return 'https://www.tradingview.com/symbols/NASDAQ-NDX/technicals/';
  if (tvSymbol === 'SPX') return 'https://www.tradingview.com/symbols/SPX/technicals/';
  if (tvSymbol === 'SPY') return 'https://www.tradingview.com/symbols/SPY/technicals/';
  if (tvSymbol === 'QQQ') return 'https://www.tradingview.com/symbols/QQQ/technicals/';

  // Exchange-prefixed symbols.
  // Example: HKEX:1347 → /symbols/HKEX-1347/technicals/
  const ex = String(tvSymbol || '').match(/^([A-Z]+):(\d+)$/);
  if (ex) return `https://www.tradingview.com/symbols/${ex[1]}-${ex[2]}/technicals/`;

  // default: /symbols/<SYMBOL>/technicals/
  return `https://www.tradingview.com/symbols/${encodeURIComponent(tvSymbol)}/technicals/`;
}

function parseTradingViewRows(lines) {
  const pat = /^(?<name>.*?)(?<value>[\d,\.\-−]+)(?<action>Strong sell|Strong buy|Sell|Buy|Neutral)$/;
  const out = {};
  for (const raw of lines || []) {
    const line = String(raw || '').replace(/\s+/g, ' ').trim();
    const m = line.replaceAll('−', '-').match(pat);
    if (!m) continue;
    const { name, value, action } = m.groups;
    out[name.trim()] = { value: value.replaceAll(',', ''), action };
  }
  return out;
}

async function fetchTradingViewTechnicals(tvSymbol) {
  const url = tradingViewTechnicalsUrl(tvSymbol);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(2500);
  const rows = await page.evaluate(() => Array.from(document.querySelectorAll('table tr')).map((r) => r.textContent));
  await browser.close();
  return { url, data: parseTradingViewRows(rows) };
}

function explainRsi(value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return '';
  if (v < 30) return '接近/进入超卖区（弱势，可能跌过头）';
  if (v < 40) return '偏弱（但未到超卖）';
  if (v <= 60) return '中性区间';
  if (v <= 70) return '偏强';
  return '接近/进入超买区（强势，可能涨过头）';
}

function explainTrend(ema20, ema50, sma200) {
  const a20 = ema20?.action;
  const a50 = ema50?.action;
  const a200 = sma200?.action;
  const actions = [a20, a50, a200].filter(Boolean);
  if (actions.length === 0) return '';

  const sell = actions.filter((x) => x === 'Sell' || x === 'Strong sell').length;
  const buy = actions.filter((x) => x === 'Buy' || x === 'Strong buy').length;

  if (sell >= 2) return '趋势偏空（多数均线信号为 Sell）';
  if (buy >= 2) return '趋势偏多（多数均线信号为 Buy）';
  return '趋势分歧（均线信号不一致）';
}

function fmtTechLine({ label, rsi, ema20, ema50, sma200 }) {
  if (!rsi && !ema20 && !ema50 && !sma200) return `${label}：缺数据`;

  const rsiVal = rsi ? Number(rsi.value).toFixed(1) : null;
  const rsiTxt = rsi ? `RSI14 ${rsiVal}（${explainRsi(rsi.value)}）` : 'RSI14 缺数据';
  const trendTxt = explainTrend(ema20, ema50, sma200) || '趋势缺数据';

  const maTxtParts = [];
  if (ema20) maTxtParts.push(`EMA20=${ema20.action}`);
  if (ema50) maTxtParts.push(`EMA50=${ema50.action}`);
  if (sma200) maTxtParts.push(`SMA200=${sma200.action}`);
  const maTxt = maTxtParts.length ? `均线：${maTxtParts.join(' / ')}` : '均线：缺数据';

  return `${label}：${trendTxt}；${rsiTxt}；${maTxt}`;
}

async function buildTechnicalSummary(analysisText) {
  const tickers = extractTickersFromAnalysis(analysisText)
    .map((t) => ({ raw: t, tv: mapToTradingViewSymbol(t) }))
    .filter((x) => x.tv);

  if (tickers.length === 0) return '';

  const targets = tickers.slice(0, 2);
  const lines = [];

  for (const t of targets) {
    try {
      const { data } = await fetchTradingViewTechnicals(t.tv);
      const rsi = data['Relative Strength Index (14)'];
      const ema20 = data['Exponential Moving Average (20)'];
      const ema50 = data['Exponential Moving Average (50)'];
      const sma200 = data['Simple Moving Average (200)'];
      lines.push(fmtTechLine({ label: t.raw, rsi, ema20, ema50, sma200 }));
    } catch {
      lines.push(`${t.raw}=缺数据`);
    }
  }

  return lines.join('\n');
}

// AI 分析 - 最硬的一招：通过 OpenClaw 自己的调用链路跑主模型（yunyi-codex），
// 复用网关的重试/超时/连接策略，避免脚本裸奔直连造成的 502/超时。
async function analyze(item, state) {
  const now = Date.now();
  if (state?.aiDisabledUntil && now < state.aiDisabledUntil) return null;

  const prompt = `你是一个“可交易”的金融快讯分析器。请严格按下面格式输出，仅允许这 7 行（每行一句），不允许出现其他行/空行/项目符号。注意：第二行的字段名必须是“方向：”，不要输出“判断：/说明：/结论：”。

标的：给出最相关的交易标的（1-3 个），优先：美股/指数/中概/加密/港股/A股；用逗号分隔；不确定就写“未知”
方向：只允许输出“利好/利空/中性 + 置信度(0-100)”，不要写“判断/说明/结论”
逻辑链：用“→”写 3-5 步因果链，从新闻到标的价格
核心驱动：一句话点名定价因子（利率预期/风险偏好/盈利预期/监管/资金面/供需/汇率等）
关键风险：只写 1-2 条，必须具体
确认信号：只写 1-2 个，必须可验证（例如 2Y/10Y、DXY、期指、成交量、后续数据/发言）
技术面：对“标的”里最相关的 1-2 个给出 RSI(14)/EMA20/EMA50/SMA200（仅用 TradingView 技术面数据；拿不到就写“缺数据”）

新闻："${item.title || ''} ${item.content}"`;

  const runOpenclaw = (timeoutMs) => new Promise((resolve, reject) => {
    const args = [
      'agent',
      '--session-id',
      OPENCLAW_AI_SESSION,
      '--channel',
      'last',
      '--message',
      prompt,
      '--json',
      '--timeout',
      String(Math.ceil(timeoutMs / 1000)),
    ];

    execFile(OPENCLAW_BIN, args, { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr?.trim() || err.message));
      try {
        const out = JSON.parse(String(stdout || '{}'));
        const txt = out?.result?.payloads?.[0]?.text;
        const model = out?.result?.meta?.agentMeta?.model || out?.result?.meta?.systemPromptReport?.model || '';
        if (typeof txt === 'string' && txt.trim()) return resolve({ text: txt.trim(), model });
        return reject(new Error('bad openclaw response'));
      } catch (e) {
        return reject(new Error(`openclaw json parse error: ${e.message}`));
      }
    });
  });

  const looksOk = (t) => {
    const s = String(t || '').trim();
    const hasRequired = (
      /^标的：/m.test(s) &&
      /^方向：/m.test(s) &&
      /^逻辑链：/m.test(s) &&
      /^核心驱动：/m.test(s) &&
      /^关键风险：/m.test(s) &&
      /^确认信号：/m.test(s) &&
      /^技术面：/m.test(s)
    );

    const hasLegacy = (
      /^结论：/m.test(s) ||
      /^驱动：/m.test(s) ||
      /^风险：/m.test(s) ||
      /^关注：/m.test(s)
    );

    return hasRequired && !hasLegacy;
  };

  // 稳定性策略：最多 2 次重试 + 小退避（openclaw 内部也会重试，所以这里不用太激进）。
  // 同时做格式校验：如果没按 4 行格式输出，就视为失败再试一次。
  const plan = [90_000, 120_000];
  for (let i = 0; i < plan.length; i++) {
    try {
      const res = await runOpenclaw(plan[i]);
      if (!looksOk(res?.text)) {
        throw new Error('bad format (missing 标的/方向/逻辑链/核心驱动/关键风险/确认信号/技术面)');
      }
      state.aiFailConsecutive = 0;
      state.aiDisabledUntil = null;
      saveState(state);
      log(`🤖 AI (openclaw/${res?.model || 'unknown'}): OK`);
      return { text: res?.text || '', source: res?.model || 'openclaw' };
    } catch (e) {
      logErr(`AI (openclaw): ${e.message}`);
      await sleep(900 + i * 900);
    }
  }

  state.aiFailConsecutive = (state.aiFailConsecutive || 0) + 1;
  state.lastErrorAt = Date.now();
  state.lastError = 'AI(openclaw): failed';

  // circuit breaker
  const N = 5;
  const COOL_MS = 5 * 60_000;
  if (state.aiFailConsecutive >= N) {
    state.aiDisabledUntil = Date.now() + COOL_MS;
    state.aiFailConsecutive = 0;
  }
  saveState(state);

  return null;
}

// 抓取逻辑
const SCRAPE_EVAL = () => {
  const out = [];
  document.querySelectorAll('.jin-flash-item-container').forEach(el => {
    const fi = el.querySelector('.jin-flash-item');
    if (!fi || !fi.classList.contains('is-important')) return;
    const te = el.querySelector('.item-time');
    const ti = el.querySelector('.right-common-title');
    const co = el.querySelector('.right-content');
    if (!co) return;
    out.push({
      time: te?.textContent?.trim() || '',
      title: ti?.textContent?.trim() || '',
      content: co.textContent.trim(),
    });
  });
  return out;
};

// 浏览器 - 让 Playwright 自己管理而不是连接 CDP
let browser = null;
async function connectBrowser() {
  if (browser?.isConnected()) return true;
  if (browser) { try { await browser.close(); } catch {} }
  // 直接启动浏览器而不是连接 CDP
  browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  return true;
}

async function getPage() {
  if (!browser?.isConnected()) { await connectBrowser(); }
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(JIN10_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(5000);
  return page;
}

// 主程序
async function main() {
  acquireLock();
  log('🔴 金十监控启动');

  await connectBrowser();
  let page = await getPage();
  log(`   页面: ${page.url()}`);

  let dedup = loadDedup();
  let state = loadState();
  // NOTE: Kevin prefers "原文 + AI 分析" in a single message.
  // So we do AI analysis inline (best-effort) and never do separate "补发" messages.

  let loop = 0;

  while (true) {
    loop++;
    log(`--- #${loop} ---`);

    try {
      // page 可能被关/崩溃；如果不可用就重建
      if (page.isClosed()) {
        log('  ♻️ page 已关闭，重建');
        page = await getPage();
      }

      // 抓取
      let news = await page.evaluate(SCRAPE_EVAL);
      
      // 去重 - 基于内容
      const seen = new Set();
      news = news.filter(item => {
        const k = getKey(item);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      
      log(`  红色新闻: ${news.length} 条`);
      
      // 处理每条新闻
      for (const item of news) {
        const k = getKey(item);

        // 已推送过，跳过
        if (dedup[k]) {
          log(`  ⏭️ 跳过: ${item.time} ${item.title?.substring(0,20)}`);
          continue;
        }

        // 广告过滤
        if (isAd(item)) {
          log(`  🚫 广告过滤: ${item.title?.substring(0,30)}`);
          dedup[k] = { ts: Date.now(), ad: true };
          saveDedup(dedup);
          continue;
        }

        // 过滤「点击查看」占位内容
        if (isClickToView(item)) {
          log(`  🚫 点击查看过滤: ${item.time} ${item.title?.substring(0,30)}`);
          dedup[k] = { ts: Date.now(), click_to_view: true };
          saveDedup(dedup);
          continue;
        }

        // 生成 AI 分析（尽量在同一条消息里发出，避免补发/拆分）
        let analysisText = '';
        let analysisSource = '';
        let analysisError = '';
        try {
          const res = await analyze(item, state);
          analysisText = res?.text || '';
          analysisSource = res?.source || '';
          if (!analysisText) analysisError = '暂不可用';
        } catch (e) {
          analysisError = e?.message ? String(e.message).slice(0, 120) : '暂不可用';
        }

        const technical = await buildTechnicalSummary(analysisText);
        await tgSend(fmtMsg(item, analysisText, analysisSource, analysisError, technical));
        state.lastPushAt = Date.now();
        await sleep(500);

        // 立即保存
        dedup[k] = { ts: Date.now() };
        saveDedup(dedup);
        log(`  ✅ 已推送`);
      }
      
      // 清理旧去重
      dedup = cleanDedup(dedup);
      saveDedup(dedup);

      state.ok = (state.ok || 0) + 1;
      state.consecutiveFail = 0;
      state.lastSuccessAt = Date.now();
      saveState(state);

    } catch (e) {
      logErr(`loop: ${e.message}`);

      state.fail = (state.fail || 0) + 1;
      state.consecutiveFail = (state.consecutiveFail || 0) + 1;
      state.lastErrorAt = Date.now();
      state.lastError = String(e.message || e);
      saveState(state);
    }

    await sleep(POLL_MS);
  }
}

main().catch(e => { logErr(`crash: ${e.message}`); process.exit(1); });
