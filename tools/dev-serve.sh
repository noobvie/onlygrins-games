#!/usr/bin/env bash
#
# dev-serve.sh — Tier 1 local dev loop for OnlyGrins games.
#
# Serves the repo root over HTTP so that:
#   * games can load the SDK at the SAME absolute path the platform uses
#     (/sdk/arcade-sdk.js), and
#   * tools/arcade-host.html can iframe a game + mock every SDK call.
#
# Then opens the host in your browser pointed at one game. Edit files in
# place; flip "auto-reload" in the host to reload on save. No build, no
# download-zip-upload cycle.
#
# Usage:
#   bash tools/dev-serve.sh                         # host + starter-game
#   bash tools/dev-serve.sh grin-coin-counter       # host + games/grin-coin-counter
#   PORT=9000 bash tools/dev-serve.sh               # custom port
#
set -euo pipefail

# repo root = parent of this tools/ dir
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-8765}"

# Which game to open. A bare name is treated as games/<name>; a path with a
# slash is used as-is (so "templates/starter-game" works too).
ARG="${1:-templates/starter-game}"
case "$ARG" in
  */*) GAME="$ARG" ;;
  *)   GAME="games/$ARG" ;;
esac

# --- keep a dev copy of the platform SDK at /sdk/arcade-sdk.js -------------
# Games reference the absolute platform path. Mirror the real file locally so
# what you test is byte-for-byte what ships. Override the source via env.
SDK_SRC="${ARCADE_SDK_SRC:-/d/Git_noob/Onlygrins/public/sdk/arcade-sdk.js}"
mkdir -p "$ROOT/sdk"
if [ -f "$SDK_SRC" ]; then
  cp -f "$SDK_SRC" "$ROOT/sdk/arcade-sdk.js"
  echo "→ mirrored SDK from $SDK_SRC"
elif [ -f "$ROOT/sdk/arcade-sdk.js" ]; then
  echo "→ using existing sdk/arcade-sdk.js (platform source not found at $SDK_SRC)"
else
  echo "!! No SDK found. Set ARCADE_SDK_SRC to the platform's public/sdk/arcade-sdk.js" >&2
  echo "   (games will 404 on /sdk/arcade-sdk.js until then)" >&2
fi

HOST_URL="http://localhost:${PORT}/tools/arcade-host.html?game=${GAME}&autoload=1"

echo
echo "  repo root : $ROOT"
echo "  serving   : http://localhost:${PORT}/"
echo "  game      : ${GAME}/index.html"
echo "  host      : ${HOST_URL}"
echo
echo "  Ctrl-C to stop."
echo

# --- open the browser (best-effort, backgrounded) -------------------------
( sleep 1
  if command -v powershell.exe >/dev/null 2>&1; then powershell.exe -NoProfile -Command "Start-Process '${HOST_URL}'" >/dev/null 2>&1
  elif command -v xdg-open >/dev/null 2>&1;     then xdg-open "$HOST_URL" >/dev/null 2>&1
  elif command -v open >/dev/null 2>&1;          then open "$HOST_URL" >/dev/null 2>&1
  fi ) &

# --- pick a static server -------------------------------------------------
# Note: on Windows, `python`/`python3` may be the Store stub that resolves on
# PATH but fails to run — so we test that an interpreter actually executes.
works() { "$@" >/dev/null 2>&1; }

cd "$ROOT"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if works node -e 'process.exit(0)'; then
  exec node "$HERE/_serve.js" "$PORT" "$ROOT"
elif works python3 -c 'pass'; then
  exec python3 -m http.server "$PORT"
elif works python -c 'pass'; then
  exec python -m http.server "$PORT"
elif works php --version; then
  exec php -S "localhost:${PORT}" -t "$ROOT"
elif command -v npx >/dev/null 2>&1; then
  exec npx --yes http-server -p "$PORT" -c-1
else
  echo "No working static server found. Install Node (recommended), Python, or PHP." >&2
  exit 1
fi
