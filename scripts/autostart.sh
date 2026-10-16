#!/bin/zsh
# Starts SocialHub at login and keeps it running (macOS launchd).
#   zsh scripts/autostart.sh          install / reinstall
#   zsh scripts/autostart.sh remove   uninstall
set -e
LABEL=com.socialhub.app
PLIST=~/Library/LaunchAgents/$LABEL.plist
DIR=$(cd "$(dirname "$0")/.." && pwd)
NODE=$(command -v node)

launchctl bootout gui/$(id -u)/$LABEL 2>/dev/null || true
if [[ "$1" == remove ]]; then rm -f $PLIST; echo "Autostart removed."; exit 0; fi
[[ -z "$NODE" ]] && { echo "node not found on PATH"; exit 1; }
mkdir -p "$DIR/data" ~/Library/LaunchAgents
cat > $PLIST <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>--no-warnings</string><string>server.mjs</string></array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$DIR/data/socialhub.log</string>
  <key>StandardErrorPath</key><string>$DIR/data/socialhub.log</string>
</dict></plist>
PL
launchctl bootstrap gui/$(id -u) $PLIST
echo "SocialHub runs at http://127.0.0.1:4310 and starts at login. Restart: launchctl kickstart -k gui/\$(id -u)/$LABEL"
