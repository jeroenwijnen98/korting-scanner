#!/bin/bash
# Regenerates every derived icon from the single source of truth, assets/icon.svg.
#
# The PNG and .icns below — including the copy inside the .app bundle, which must
# be a real file because `cp -R` into /Applications would leave a symlink dangling —
# are build artifacts; the browser tab uses the SVG and PNG from /assets. Edit the
# SVG, run this, commit the result.
#
# ICON_OUT_DIR sets where the outputs go (default: the repo root); the staleness
# test renders into a temp dir and compares against the committed files.
#
# Requires rsvg-convert (brew install librsvg) plus macOS iconutil.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${ICON_OUT_DIR:-$ROOT}"
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"
SRC="$ROOT/assets/icon.svg"
BUNDLE_ICNS="KortingScanner.app/Contents/Resources/icon.icns"
mkdir -p "$OUT/assets" "$OUT/$(dirname "$BUNDLE_ICNS")"

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

render 512 "$OUT/assets/icon.png"
iconutil -c icns "$ICONSET" -o "$OUT/assets/icon.icns"
cp "$OUT/assets/icon.icns" "$OUT/$BUNDLE_ICNS"
rm -rf "$(dirname "$ICONSET")"

echo "Regenerated from assets/icon.svg into $OUT:"
echo "  assets/icon.png"
echo "  assets/icon.icns"
echo "  $BUNDLE_ICNS"
