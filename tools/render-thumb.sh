#!/usr/bin/env bash
#
# render-thumb.sh — rasterize games/<slug>/thumbnail.svg → thumbnail.png at
# 960×540 using headless Chrome/Edge (no extra deps). The SVG stays the source
# of truth (edit it, re-render); the PNG is what the arcade catalog shows.
#
#   bash tools/render-thumb.sh <slug> [<slug> ...]
#   bash tools/render-thumb.sh --all
#
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GAMES="$ROOT/games"

# locate a Chromium-family browser
BROWSER=""
for c in \
  "/c/Program Files/Google/Chrome/Application/chrome.exe" \
  "/c/Program Files (x86)/Google/Chrome/Application/chrome.exe" \
  "/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
  "/c/Program Files/Microsoft/Edge/Application/msedge.exe"; do
  [ -x "$c" ] && { BROWSER="$c"; break; }
done
[ -n "$BROWSER" ] || { echo "✗ no Chrome/Edge found for rendering" >&2; exit 1; }

render() {
  local slug="$1"
  local dir="$GAMES/$slug"
  local svg="$dir/thumbnail.svg"
  [ -f "$svg" ] || { echo "  ! $slug: no thumbnail.svg, skipping"; return; }
  # wrap the SVG in a 960×540 page so the screenshot is pixel-exact
  local html="$dir/.thumb.html"
  {
    printf '<!doctype html><meta charset="utf-8"><style>*{margin:0;padding:0}html,body{width:960px;height:540px;overflow:hidden}svg{display:block;width:960px;height:540px}</style>'
    cat "$svg"
  } > "$html"
  local htmlw pngw
  htmlw="$(cygpath -w "$html" 2>/dev/null || printf '%s' "$html")"
  pngw="$(cygpath -w "$dir/thumbnail.png" 2>/dev/null || printf '%s' "$dir/thumbnail.png")"
  "$BROWSER" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size=960,540 --default-background-color=00000000 \
    --screenshot="$pngw" "file:///$htmlw" >/dev/null 2>&1 || true
  rm -f "$html"
  if [ -f "$dir/thumbnail.png" ]; then echo "  ✓ $slug → thumbnail.png"; else echo "  ✗ $slug: render failed"; fi
}

if [ "${1:-}" = "--all" ]; then
  for d in "$GAMES"/*/; do [ -f "${d}thumbnail.svg" ] && render "$(basename "$d")"; done
else
  [ $# -ge 1 ] || { echo "usage: bash tools/render-thumb.sh <slug> [<slug> ...] | --all" >&2; exit 1; }
  for s in "$@"; do render "$s"; done
fi
