# openclaw-jin10monitorn

稳定版“金十红色快讯”监控：抓取金十网页的红色重要新闻，并附带结构化 AI 分析。

A stable, battle-tested Jin10 (金十数据) red-flash-news monitor with structured AI analysis.

- 作者 / Author: Kevin Qu (GitHub: winglight9)
- 语言 / Language: 中文 + English
- License: MIT

---

## 这是啥 / What It Does

- 抓取金十网页“红色重要快讯”
- 去重（默认 72 小时窗口）
- 推送适配：当前示例是 Telegram；你也可以替换为自己的推送 App（只需要改发送函数）
- AI 分析：通过 `openclaw agent` 生成固定格式分析；AI 挂了也不会卡住主循环
- 健康检查：输出一份 JSON（进程是否存活、最近成功/推送时间等）

---

## 快速开始 / Quick Start

### 0) 前置要求 / Prerequisites

- Node.js 22+
- Playwright 运行环境
- 本机能跑 `openclaw`（用于 AI 分析；如果不需要 AI，可把分析逻辑关掉/改成本地）

### 1) 安装 / Install

```bash
git clone https://github.com/winglight9/openclaw-jin10monitorn
cd openclaw-jin10monitorn/jin10-monitor
npm install
npx playwright install --with-deps chromium
```

### 2) 配置推送 / Configure push

本项目默认使用 Telegram 作为推送示例：

```bash
cp config.example.json config.json
$EDITOR config.json
```

如果你不用 Telegram：
- 你可以保留抓取 + AI 分析逻辑
- 把 `tgSend()` 换成你自己的推送实现（企业微信/飞书/Slack/钉钉/自建 webhook 等）

---

## 详细说明文档 / Detailed Docs

- 中文：`docs/README_zh.md`
- English：`docs/README_en.md`

---

## 常见问题与排查 / Troubleshooting

### 1) 没有任何推送 / No messages are sent

中文：
- 先看终端日志有没有出现 `✅ 已推送`。
- 如果每轮都显示 `红色新闻: N 条` 但没有 `✅ 已推送`，通常是：
  - 都被去重了（`dedup.json` 里已有记录）
  - 或都被过滤了（广告/“点击查看”占位）

English:
- Check terminal logs for `✅ 已推送`.
- If you see `红色新闻: N 条` but never see `✅ 已推送`, usually:
  - everything was deduped (already in `dedup.json`)
  - or filtered (ads / "click to view" placeholders)

### 2) Playwright / Chromium 启动失败

中文：
- 现象：`browserType.launch` 报错、或提示缺系统依赖。
- 处理：重新执行：

```bash
npx playwright install --with-deps chromium
```

English:
- Symptom: `browserType.launch` errors or missing system dependencies.
- Fix:

```bash
npx playwright install --with-deps chromium
```

### 3) 金十页面能打开，但抓不到内容（一直 0 条）

中文：
- 可能原因：金十网页改版，DOM 结构/选择器变了。
- 你需要检查 `monitor.mjs` 里的 `SCRAPE_EVAL` 选择器：
  - `.jin-flash-item-container`
  - `.jin-flash-item.is-important`

English:
- Cause: Jin10 changed DOM/markup.
- Check selectors in `monitor.mjs` (`SCRAPE_EVAL`):
  - `.jin-flash-item-container`
  - `.jin-flash-item.is-important`

### 4) Telegram 推送失败（但你用的是别的推送 App 就忽略这条）

中文：
- 现象：errors.log 里出现 `TG: ...`。
- 检查：token / chat id / bot 权限。

English:
- Symptom: `TG: ...` in `errors.log`.
- Check token/chat id/bot permissions.

### 5) AI 分析不工作 / AI analysis fails

中文：
- 现象：日志出现 `AI (openclaw): ...` 错误。
- 说明：AI 是 best-effort；失败不会阻塞推送。
- 检查：本机 `openclaw` 是否可用：

```bash
openclaw --help
openclaw agent --help
```

English:
- Symptom: `AI (openclaw): ...` errors.
- Note: AI is best-effort; failures do not block pushing.
- Verify `openclaw` works:

```bash
openclaw --help
openclaw agent --help
```

---

## 健康检查 / Health Check

```bash
node jin10-monitor/bin/health-check.mjs
```

---

## 安全与仓库卫生 / Security & Repo Hygiene

不要提交这些文件（它们已经在 `jin10-monitor/.gitignore` 里忽略了）：
- `jin10-monitor/config.json`
- `jin10-monitor/state.json`
- `jin10-monitor/dedup.json`
- `jin10-monitor/*.log`

