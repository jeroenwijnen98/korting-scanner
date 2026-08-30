#!/bin/bash
# Weekly bonus email, run from the sleepwatcher wake script.
# PROJECT_DIR is derived from this script's own location so the repo can be
# moved without editing anything here.
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$PROJECT_DIR/logs/sleepwatcher"
LOG_FILE="$LOG_DIR/korting-scanner.log"
mkdir -p "$LOG_DIR"
cd "$PROJECT_DIR" || exit 1

# Prefer the native arm64 Homebrew node; /usr/local is the x86_64 build, which
# runs under Rosetta. launchd/sleepwatcher gives us a bare PATH, so look in the
# known install locations rather than relying on `command -v node`.
if [ -x "/opt/homebrew/bin/node" ]; then
  NODE=/opt/homebrew/bin/node
elif [ -x "/usr/local/bin/node" ]; then
  NODE=/usr/local/bin/node
elif command -v node &>/dev/null; then
  NODE=$(command -v node)
else
  echo "node not found" > "$LOG_FILE"
  exit 1
fi

"$NODE" src/scripts/sendBonusEmail.js > "$LOG_FILE" 2>&1
