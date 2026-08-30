#!/bin/bash
# Regenerates every derived icon from the single source of truth, assets/icon.svg.
#
# The browser tab serves public/favicon.svg (hand-drawn, 32px-specific); the PNG
# and .icns below — including the copy inside the .app bundle, which must be a
# real file because `cp -R` into /Applications would leave a symlink dangling —
# are build artifacts. Edit the SVG, run this, commit the result.
#
# Requires rsvg-convert (brew install librsvg) plus macOS iconutil.
set -euo pipefail

cd "$(dirname "$0")/.."
SRC="assets/icon.svg"
BUNDLE_ICNS="KortingScanner.app/Contents/Resources/icon.icns"
mkdir -p assets "$(dirname "$BUNDLE_ICNS")"

RSVG="$(command -v rsvg-convert || true)"
# miniforge ships one but isn't always on PATH for a double-clicked shell.
[ -n "$RSVG" ] || RSVG="/usr/local/Caskroom/miniforge/base/bin/rsvg-convert"
if [ ! -x "$RSVG" ]; then
  echo "rsvg-convert not found. Install it with: brew install librsvg" >&2
  exit 1
fi

render() { "$RSVG" -w "$1" -h "$1" "$SRC" -o "$2"; }

# Each size is rendered from the vector rather than downscaled, so the 16px slice
# stays legible instead of turning to mush.
ICONSET="$(mktemp -d)/icon.iconset"
mkdir -p "$ICONSET"
for size in 16 32 128 256 512; do
  render "$size" "$ICONSET/icon_${size}x${size}.png"
  render "$((size * 2))" "$ICONSET/icon_${size}x${size}@2x.png"
done

render 512 assets/icon.png
iconutil -c icns "$ICONSET" -o assets/icon.icns
cp assets/icon.icns "$BUNDLE_ICNS"
rm -rf "$(dirname "$ICONSET")"

echo "Regenerated from $SRC:"
echo "  assets/icon.png"
echo "  assets/icon.icns"
echo "  $BUNDLE_ICNS"
