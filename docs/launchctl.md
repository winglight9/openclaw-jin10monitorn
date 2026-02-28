# Run with launchctl (macOS)

This keeps the monitor running in background and auto-restarts on crash.

## 1) Create plist

Save as `~/Library/LaunchAgents/com.openclaw.jin10monitorn.plist` (edit paths):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.openclaw.jin10monitorn</string>

    <key>ProgramArguments</key>
    <array>
      <string>/usr/bin/env</string>
      <string>node</string>
      <string>/ABSOLUTE/PATH/TO/openclaw-jin10monitorn/jin10-monitor/monitor.mjs</string>
    </array>

    <key>WorkingDirectory</key>
    <string>/ABSOLUTE/PATH/TO/openclaw-jin10monitorn/jin10-monitor</string>

    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>/ABSOLUTE/PATH/TO/openclaw-jin10monitorn/jin10-monitor/stdout.log</string>
    <key>StandardErrorPath</key>
    <string>/ABSOLUTE/PATH/TO/openclaw-jin10monitorn/jin10-monitor/stderr.log</string>
  </dict>
</plist>
```

## 2) Load & start

```bash
launchctl unload ~/Library/LaunchAgents/com.openclaw.jin10monitorn.plist 2>/dev/null || true
launchctl load ~/Library/LaunchAgents/com.openclaw.jin10monitorn.plist
launchctl start com.openclaw.jin10monitorn
```

## 3) Check status

```bash
launchctl list | grep com.openclaw.jin10monitorn
```

## 4) Stop

```bash
launchctl stop com.openclaw.jin10monitorn
```
