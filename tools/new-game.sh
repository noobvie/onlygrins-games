#!/usr/bin/env bash
#
# new-game.sh — scaffold a new game folder from templates/starter-game.
#
#   bash tools/new-game.sh <slug> ["Nice Title"]
#
# Copies the starter template to games/<slug>/, rewrites game.json (slug,
# title, import_id, is_active), and prints how to run it in the dev host.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE="$ROOT/templates/starter-game"

SLUG="${1:-}"
if [ -z "$SLUG" ]; then
  echo "usage: bash tools/new-game.sh <slug> [\"Nice Title\"]" >&2
  echo "  e.g. bash tools/new-game.sh grin-coin-counter \"Grin Coin Counter\"" >&2
  exit 1
fi

# validate slug: kebab-case
if ! printf '%s' "$SLUG" | grep -Eq '^[a-z0-9]+(-[a-z0-9]+)*$'; then
  echo "✗ slug must be kebab-case [a-z0-9-], got: $SLUG" >&2
  exit 1
fi

DEST="$ROOT/games/$SLUG"
if [ -e "$DEST" ]; then
  echo "✗ games/$SLUG already exists — pick another slug or delete it first." >&2
  exit 1
fi
if [ ! -d "$TEMPLATE" ]; then
  echo "✗ template missing: $TEMPLATE" >&2
  exit 1
fi

# Title: arg 2, or Title-Case the slug
TITLE="${2:-}"
if [ -z "$TITLE" ]; then
  TITLE="$(printf '%s' "$SLUG" | sed -E 's/-/ /g' | awk '{ for (i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) substr($i,2) } 1')"
fi

mkdir -p "$ROOT/games"
cp -R "$TEMPLATE" "$DEST"
# keep shared/edu-sdk.js the single source of truth — refresh the bundled copy
[ -f "$ROOT/shared/edu-sdk.js" ] && cp -f "$ROOT/shared/edu-sdk.js" "$DEST/edu-sdk.js"
echo "→ copied templates/starter-game → games/$SLUG"

# Rewrite game.json. Prefer Node for safe JSON editing; fall back to sed.
MANIFEST="$DEST/game.json"
if node -e 'process.exit(0)' >/dev/null 2>&1; then
  SLUG="$SLUG" TITLE="$TITLE" node -e '
    const fs = require("fs");
    const p = process.argv[1];
    const m = JSON.parse(fs.readFileSync(p, "utf8"));
    m.slug = process.env.SLUG;
    m.title = process.env.TITLE;
    m.import_id = "edu:" + process.env.SLUG;
    m.is_active = true;
    m.short_description = "TODO: one-line description of " + process.env.TITLE + ".";
    m.description = "TODO: full description of " + process.env.TITLE + ".";
    m.tags = ["grin", "education"];
    fs.writeFileSync(p, JSON.stringify(m, null, 2) + "\n");
  ' "$MANIFEST"
else
  # minimal fallback (assumes the template's known values)
  sed -i -E \
    -e "s/\"slug\": *\"[^\"]*\"/\"slug\": \"$SLUG\"/" \
    -e "s/\"title\": *\"[^\"]*\"/\"title\": \"$TITLE\"/" \
    -e "s/\"import_id\": *\"[^\"]*\"/\"import_id\": \"edu:$SLUG\"/" \
    -e "s/\"is_active\": *false/\"is_active\": true/" \
    "$MANIFEST"
fi
echo "→ wrote games/$SLUG/game.json (slug, title, import_id=edu:$SLUG, is_active=true)"

cat <<EOF

✓ Created games/$SLUG

Next:
  1. Edit games/$SLUG/index.html and game.json (fill the TODOs).
  2. Run it in the dev host:
       bash tools/dev-serve.sh $SLUG
  3. Validate before commit:
       bash tools/validate.sh
EOF
