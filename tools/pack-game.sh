#!/usr/bin/env bash
#
# pack-game.sh — zip a game into dist/<slug>.zip, ready to upload through the
# OnlyGrins admin ("Add game" → HTML5 → upload zip). The zip has index.html at
# its ROOT, which is what the platform requires.
#
#   bash tools/pack-game.sh <slug>
#   bash tools/pack-game.sh templates/starter-game
#
# This is the simple, manual alternative to deploy/deploy-games.sh — good for a
# handful of games. (The admin form captures title/category/etc; game.json is
# for the automated pipeline and is excluded from the zip.)
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ARG="${1:-}"
if [ -z "$ARG" ]; then
  echo "usage: bash tools/pack-game.sh <slug>" >&2
  exit 1
fi
case "$ARG" in
  */*) SRC="$ROOT/$ARG"; SLUG="$(basename "$ARG")" ;;
  *)   SRC="$ROOT/games/$ARG"; SLUG="$ARG" ;;
esac

[ -d "$SRC" ] || { echo "✗ not found: $SRC" >&2; exit 1; }
[ -f "$SRC/index.html" ] || { echo "✗ $SRC has no index.html at its root" >&2; exit 1; }

OUT_DIR="$ROOT/dist"
OUT="$OUT_DIR/$SLUG.zip"
mkdir -p "$OUT_DIR"
rm -f "$OUT"

# Exclude pipeline-only files from the uploaded game.
EXCLUDES=(game.json thumbnail.svg thumbnail.png)

if command -v zip >/dev/null 2>&1; then
  ( cd "$SRC" && zip -r -q "$OUT" . -x "${EXCLUDES[@]}" )
elif command -v powershell.exe >/dev/null 2>&1; then
  # Stage to a temp dir minus the excludes, then Compress-Archive (entries land
  # at the zip root because we archive the staging dir's contents).
  STAGE="$(mktemp -d)"
  cp -R "$SRC"/. "$STAGE"/
  for e in "${EXCLUDES[@]}"; do rm -f "$STAGE/$e"; done
  STAGEW="$(cygpath -w "$STAGE" 2>/dev/null || printf '%s' "$STAGE")"
  OUTW="$(cygpath -w "$OUT" 2>/dev/null || printf '%s' "$OUT")"
  powershell.exe -NoProfile -Command "Compress-Archive -Path '${STAGEW}\\*' -DestinationPath '${OUTW}' -Force" >/dev/null
  rm -rf "$STAGE"
else
  echo "✗ need 'zip' or PowerShell to build the archive" >&2
  exit 1
fi

echo "✓ packed → dist/$SLUG.zip"
echo "  Upload it in OnlyGrins: Dashboard → Games → Add game → type HTML5 → upload this zip."
echo "  (index.html is at the zip root, as the platform requires.)"
