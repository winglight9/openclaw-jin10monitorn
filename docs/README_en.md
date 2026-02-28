# Guide (English)

This guide is for a first-time user.

It helps you run:
- Scraping Jin10 red important flash news
- Dedup/filter
- Pushing to your own app (custom webhook / Slack / Feishu / WeCom / any HTTP endpoint)
- Optional structured AI analysis via OpenClaw

---

## 1) How it works (pipeline)

1) Playwright opens `https://www.jin10.com/`
2) Locates "red important" flash items in the DOM
3) Normalizes each item: time / title / content
4) Dedup: do not resend items within 72h window
5) Filter: ads and "click to view" placeholder content
6) AI analysis (best-effort): call `openclaw agent` to produce a strict 7-line format
7) Push: deliver "news + analysis" to your push channel (Telegram by default, replaceable)

---

## 2) Prerequisites

- A machine that can run continuously (macOS/Linux)
- Node.js 22+
- Network access to Jin10
- For AI analysis: `openclaw` installed and callable

---

## 3) Install

```bash
git clone https://github.com/winglight9/openclaw-jin10monitorn
cd openclaw-jin10monitorn/jin10-monitor
npm install
npx playwright install --with-deps chromium
```

---

## 4) Configure

```bash
cp config.example.json config.json
$EDITOR config.json
```

---

## 5) Run

```bash
node monitor.mjs
```

---

## 6) Push to your own app

Replace the `tgSend()` function in `monitor.mjs` with your own delivery implementation.
A common approach is to POST a JSON payload to your webhook endpoint.

---

## 7) Health check

```bash
node bin/health-check.mjs
```
