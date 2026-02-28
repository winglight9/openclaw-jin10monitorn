# 使用说明（中文）

这份文档写给“第一次装的龙虾”。你照着做，能把：

- 从金十网页抓取「红色重要快讯」
- 去重过滤
- 推送到你自己的 App（自定义 webhook / 企业微信 / 飞书 / Slack / 任意 HTTP 接口都行）
- 同时附带结构化 AI 分析（通过 OpenClaw）

跑起来。

---

## 1. 它到底在干嘛（工作流）

1) Playwright 打开 `https://www.jin10.com/`
2) 在页面 DOM 里找到“红色重要新闻”条目
3) 把每条新闻标准化成：时间 / 标题 / 内容
4) 去重：72 小时内推过的就不再推
5) 广告/占位过滤：营销广告 & “点击查看”这类不完整内容直接丢掉
6) AI 分析（best-effort）：调用 `openclaw agent` 生成固定格式的 7 行分析
7) 推送：把“原文 + 分析”发到你的推送渠道（默认 Telegram，你可以替换）

---

## 2. 安装前你需要准备什么

- 一台能长期运行脚本的机器（macOS/Linux 都行）
- Node.js 22+
- 能联网访问金十网页
- 如果你需要 AI 分析：本机能跑 `openclaw`（已安装并能正常调用）

---

## 3. 安装步骤（照抄即可）

### 3.1 下载代码

```bash
git clone https://github.com/winglight9/openclaw-jin10monitorn
cd openclaw-jin10monitorn/jin10-monitor
```

### 3.2 安装依赖

```bash
npm install
npx playwright install --with-deps chromium
```

如果这一步报缺系统库，优先重跑上面这条命令（`--with-deps` 会尽量补齐）。

### 3.3 配置

```bash
cp config.example.json config.json
$EDITOR config.json
```

说明：
- 如果你不用 Telegram，可以先随便填个占位（或后面直接改代码把 Telegram 发送关掉）
- `OPENCLAW_BIN` 默认 `openclaw`，除非你机器上名字不一样

### 3.4 运行（前台测试）

```bash
node monitor.mjs
```

你会在终端看到每分钟一轮日志；如果当下有红色快讯并且没被去重/过滤，会看到 `✅ 已推送`。

---

## 4. 推送到你自己的 App（自定义）

默认实现是 `tgSend()`（Telegram）。如果你有自己的推送 App（例如一个 webhook）：

1) 打开 `jin10-monitor/monitor.mjs`
2) 搜索 `async function tgSend(text)`
3) 用你自己的发送函数替换它，保持接口不变：`send(text)` 只要能把字符串发出去即可。

最简单的通用做法：HTTP POST 一个 JSON 到你的 webhook。

示例（伪代码）：

```js
async function tgSend(text) {
  await fetch('https://your-app.example.com/webhook/jin10', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
}
```

如果你的 App 支持富文本/markdown，你也可以改 `fmtMsg()` 的格式化逻辑。

---

## 5. AI 分析说明（不想用可以关）

- AI 分析调用的是：`openclaw agent --json ...`
- 它是 best-effort：失败不会影响推送主流程

如果你不想要 AI：
- 直接在 `monitor.mjs` 里把 `analyze()` 调用部分改成空字符串即可（最简单：让 `analysisText=''`）。

---

## 6. 常见问题（排查顺序）

1) 没有推送
- 看日志里是否出现 `✅ 已推送`
- 如果没有，可能全被 dedup/过滤了（需要等新的红色快讯）

2) 抓不到内容（一直 0 条）
- 金十页面可能改版，检查 `SCRAPE_EVAL` 的选择器

3) Playwright 启动失败
- 重跑：`npx playwright install --with-deps chromium`

4) AI 分析失败
- 先确认 `openclaw` 可用：`openclaw --help`

---

## 7. 健康检查（给监控用）

```bash
node bin/health-check.mjs
```

会输出 JSON：包含进程 pid 是否存活、state.json 状态等。
