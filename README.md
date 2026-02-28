# openclaw-jin10monitorn

Jin10 () "" (important red flash news) monitor + Telegram push + structured AI analysis.

- Author: Kevin Qu (GitHub: winglight9)
- Language: Chinese/English
- License: MIT

---

## 



- : 
- :  72 
- : Telegram  (HTML )
- :  AI  (, )
- :  JSON health check output



This repo is intended to be **safe to share**:
- No secrets included
- No runtime state/logs included
- Clear, reproducible setup steps

---

##  / Key Stability Guarantees

1) **Telegram push does not depend on OpenClaw Gateway uptime**
   - Scraping uses Playwright headless Chromium directly.
   - AI analysis uses `openclaw agent` best-effort; failures do not block pushing.

2) **Web page / browser failures self-heal**
   - The monitor recreates the page when closed/crashed.
   - (Note) If Jin10 page structure changes, scraping selectors may need updates.

3) **AI analysis never blocks the main loop**
   - Strict output format validation.
   - Retries + circuit breaker; analysis is skipped when unhealthy.

---

##  / Quick Start

### 1) 

- Node.js 22+
- Telegram bot token
- Telegram chat id

Install dependencies:

```bash
cd jin10-monitor
npm install
npx playwright install --with-deps chromium
```

### 2) 

```bash
cp config.example.json config.json
$EDITOR config.json
```

### 3) Run

```bash
node monitor.mjs
```

---

## Telegram Chat ID 

### Option A (Recommended): Use Telegram bot API `getUpdates`

1) Add your bot to the target chat (DM / group / channel).
2) Send a message in that chat.
3) Then open:

```
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
```

Find the numeric `chat.id`.

### Option B: Use existing tools

You can also use any Telegram ID bot (beware privacy).

---

## Run as a Daemon / 

- macOS `launchctl` guide: `docs/launchctl.md`

---

## Health Check

```bash
node jin10-monitor/bin/health-check.mjs
```

---

## Repo Hygiene / 

Never commit:
- `jin10-monitor/config.json`
- `jin10-monitor/state.json`
- `jin10-monitor/dedup.json`
- `jin10-monitor/*.log`

These are ignored by `jin10-monitor/.gitignore`.
