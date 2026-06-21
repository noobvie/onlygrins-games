#!/usr/bin/env bash
#
# validate.sh — pre-flight lint for every game folder. Run before commit and
# at the top of deploy-games.sh so a broken manifest never reaches the server.
#
#   bash tools/validate.sh
#
# Full validation needs Node (or python3). With neither, falls back to a
# minimal existence check and warns; the games:sync command validates again
# server-side via the Laravel Game model regardless.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GAMES="$ROOT/games"

works() { "$@" >/dev/null 2>&1; }

echo "Validating games in $GAMES"

if works node -e 'process.exit(0)'; then
  exec node "$HERE/_validate.js" "$GAMES"
fi

# ---- minimal fallback (no Node) ----
echo "  (Node not found — minimal checks only)"
errors=0
shopt -s nullglob
for dir in "$GAMES"/*/; do
  slug="$(basename "$dir")"
  [ "${slug#.}" != "$slug" ] && continue
  [ -f "$dir/game.json" ]  || { echo "  ✗ [$slug] missing game.json"; errors=$((errors+1)); }
  [ -f "$dir/index.html" ] || { echo "  ✗ [$slug] missing index.html"; errors=$((errors+1)); }
  # JSON validity via any available parser
  if works python3 -c 'pass'; then
    python3 -c "import json,sys; json.load(open(sys.argv[1]))" "$dir/game.json" 2>/dev/null \
      || { echo "  ✗ [$slug] game.json is not valid JSON"; errors=$((errors+1)); }
  fi
  [ "$errors" -eq 0 ] && echo "  ✓ $slug"
done
[ "$errors" -eq 0 ] && echo "OK" || { echo "$errors error(s)"; exit 1; }
