# openclaw-jin10monitorn

稳定版“金十红色快讯”监控：抓取金十网页的红色重要新闻，推送到 Telegram，并附带结构化 AI 分析。

A stable, battle-tested Jin10 (金十数据) red-flash-news monitor: scrape Jin10 important (red) news, push to Telegram, with structured AI analysis.

- 作者 / Author: Kevin Qu (GitHub: winglight9)
- 语言 / Language: 中文 + English
- License: MIT

---

## 这是啥 / What It Does

- 抓取金十网页“红色重要快讯”
- 去重（默认 72 小时窗口）
- 推送到 Telegram（HTML 格式，默认关闭网页预览）
- AI 分析：通过 `openclaw agent` 生成固定格式分析；AI 挂了也不会卡住推送
- 健康检查：输出一份 JSON（进程是否存活、最近成功/推送时间等）

---

## 稳定性承诺 / Stability Guarantees

1) 推送不依赖 OpenClaw Gateway 浏览器
- 抓取用的是 Playwright headless Chromium（脚本自己拉浏览器）
- 所以 gateway 挂了，不影响“抓取 + Telegram 推送”这条主链路

2) 网页/页面异常能自愈
- 如果 page 被关/崩，脚本会重建 page 并继续跑
- 如果金十改版（DOM 选择器失效），需要更新选择器（这是唯一常见的人为维护点）

3) AI 分析不会拖死主循环
- 有超时、重试、格式校验 + 熔断（circuit breaker）
- 分析失败会降级为“无分析/暂不可用”，但快讯本体仍然照推

---

## 快速开始 / Quick Start

### 0) 前置要求 / Prerequisites

- Node.js 22+
- Telegram Bot token
- Telegram Chat ID（推送目标）
- 本机能跑 `openclaw`（用于 AI 分析；如果不想要 AI，也可以后续改成关闭）

### 1) 安装依赖 / Install deps

```bash
cd jin10-monitor
npm install
npx playwright install --with-deps chromium
```

### 2) 配置 / Configure

```bash
cp config.example.json config.json
$EDITOR config.json
```

你需要填写：
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

可选：
- `OPENCLAW_BIN`：默认 `openclaw`
- `OPENCLAW_AI_SESSION`：默认 `jin10-ai-v4`

### 3) 运行 / Run

```bash
node monitor.mjs
```

---

## 如何拿到 Telegram Chat ID / How to get Telegram Chat ID

最靠谱的方法（不需要第三方 bot，隐私友好）：

1) 把你的 bot 拉进目标对话（私聊/群聊/频道都可以）
2) 在目标对话里随便发一句话（让 bot “看到” update）
3) 浏览器打开：

```
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
```

在返回 JSON 里找到 `chat.id`（一个数字），这就是 `TELEGRAM_CHAT_ID`。

---

## 常驻运行（macOS）/ Run as a Daemon (macOS)

- 看这里：`docs/launchctl.md`

---

## 健康检查 / Health Check

```bash
node jin10-monitor/bin/health-check.mjs
```

输出是 JSON，你可以拿去做 cron 检查或监控报警。

---

## 安全与仓库卫生 / Security & Repo Hygiene

不要提交这些文件（它们已经在 `jin10-monitor/.gitignore` 里忽略了）：
- `jin10-monitor/config.json`（密钥/ChatID）
- `jin10-monitor/state.json`（运行状态）
- `jin10-monitor/dedup.json`（去重库）
- `jin10-monitor/*.log`（日志）

