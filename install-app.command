#!/bin/bash
# Installs (or refreshes) /Applications/KortingScanner.app from the copy in this repo.
# Only needed when KortingScanner.app itself changes — never when the app's own
# code (server.js, public/, src/) changes.
set -e
cd "$(dirname "$0")"
rm -rf /Applications/KortingScanner.app
cp -R KortingScanner.app /Applications/KortingScanner.app
codesign --force -s - /Applications/KortingScanner.app
echo "Installed /Applications/KortingScanner.app"
