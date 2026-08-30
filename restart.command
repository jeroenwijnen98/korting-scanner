#!/bin/bash
cd "$(dirname "$0")"

TERMINAL_WINDOWS=$(osascript -e 'tell application "Terminal" to count windows' 2>/dev/null || echo 1)

# Find node
# Prefer the native arm64 Homebrew node; /usr/local holds the x86_64 build,
# which runs under Rosetta.
if [ -x "/opt/homebrew/bin/node" ]; then
  NODE=/opt/homebrew/bin/node
elif [ -x "/usr/local/bin/node" ]; then
  NODE=/usr/local/bin/node
elif command -v node &>/dev/null; then
  NODE=$(command -v node)
else
  osascript -e 'display alert "Node.js not found" message "Install it with: brew install node"'
  exit 1
fi

# Kill the server listening on 3001 and wait for it to release the port.
# -sTCP:LISTEN matters: a plain `lsof -ti:3001` also matches browser tabs
# connected to the server, and killing those would kill Chrome.
PIDS=$(lsof -ti:3001 -sTCP:LISTEN)
if [ -n "$PIDS" ]; then
  kill $PIDS 2>/dev/null
  for i in {1..20}; do
    sleep 0.25
    [ -z "$(lsof -ti:3001 -sTCP:LISTEN)" ] && break
  done
  REMAINING=$(lsof -ti:3001 -sTCP:LISTEN)
  [ -n "$REMAINING" ] && kill -9 $REMAINING 2>/dev/null
fi

# Start fresh in background (survives terminal close)
nohup $NODE server.js > /dev/null 2>&1 &

for i in {1..20}; do
  sleep 0.5
  curl -s -o /dev/null http://localhost:3001 && break
done
open "http://localhost:3001"

if [ "$TERMINAL_WINDOWS" -le 1 ]; then
  osascript -e 'tell application "Terminal" to quit' 2>/dev/null &
else
  osascript -e 'tell application "Terminal" to close front window' 2>/dev/null &
fi
exit 0
