#!/bin/bash
PROJECT_DIR="/Users/marcwijnen/Documents/GitHub/_apps/korting-scanner"
LOG_DIR="$PROJECT_DIR/logs/sleepwatcher"
LOG_FILE="$LOG_DIR/korting-scanner.log"
mkdir -p "$LOG_DIR"
cd "$PROJECT_DIR"
/usr/local/bin/node src/scripts/sendBonusEmail.js > "$LOG_FILE" 2>&1
