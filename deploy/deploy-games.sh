#!/usr/bin/env bash
#
# deploy-games.sh — Tier 3: ship the educational games catalog to a live
# OnlyGrins server. Run ON THE SERVER as the deploy user.
#
# Pulls this content repo, rsyncs each game's files into the app's storage, and
# runs `php artisan games:sync` to upsert the catalog rows. Independent of the
# app's own deploy.sh — it touches ONLY storage/ + edu: DB rows, so it survives
# the app's `git reset --hard` vendor-overlay deploys.
#
# Usage (env overrides shown with defaults):
#   GAMES_REPO=https://github.com/noobvie/onlygrins-games.git \
#   GAMES_SRC=/home/arcade-games \
#   APP_DIR=/home/arcade \
#   bash deploy/deploy-games.sh                 # full deploy (live)
#   bash deploy/deploy-games.sh --dry-run       # validate + show sync plan, no writes
#   PRUNE=1 bash deploy/deploy-games.sh         # also deactivate removed games
#   STAGING=1 bash deploy/deploy-games.sh       # deploy HIDDEN (is_active=false) for
#                                               # admin preview at /play/<slug>, then
#                                               # prints the preview URLs
#
# Staging tip: point GAMES_SRC/GAMES_BRANCH at a separate checkout + branch so
# staging content is isolated from production, e.g.
#   GAMES_SRC=/home/arcade-games-staging GAMES_BRANCH=staging STAGING=1 \
#     bash deploy/deploy-games.sh
#
set -euo pipefail

GAMES_REPO="${GAMES_REPO:-https://github.com/noobvie/onlygrins-games.git}"
GAMES_SRC="${GAMES_SRC:-/home/arcade-games}"
APP_DIR="${APP_DIR:-/home/arcade}"
BRANCH="${GAMES_BRANCH:-master}"
WEB_USER="${WEB_USER:-www-data}"
HTML5_DIR="${HTML5_DIR:-$APP_DIR/storage/app/public/uploads/games/html5}"

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1
PRUNE_FLAG=""
[ "${PRUNE:-0}" = "1" ] && PRUNE_FLAG="--prune"
STAGING="${STAGING:-0}"
INACTIVE_FLAG=""
[ "$STAGING" = "1" ] && INACTIVE_FLAG="--inactive"

log() { printf '\n\033[1;32m▸ %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

command -v rsync >/dev/null 2>&1 || die "rsync not found"
[ -d "$APP_DIR" ] || die "APP_DIR not found: $APP_DIR"

# 1) clone or update the content repo --------------------------------------
if [ -d "$GAMES_SRC/.git" ]; then
  log "Updating $GAMES_SRC ($BRANCH)"
  git -C "$GAMES_SRC" fetch --quiet origin "$BRANCH"
  git -C "$GAMES_SRC" reset --hard "origin/$BRANCH"
else
  log "Cloning $GAMES_REPO → $GAMES_SRC"
  git clone --branch "$BRANCH" "$GAMES_REPO" "$GAMES_SRC"
fi

# 2) validate before touching anything -------------------------------------
log "Validating manifests"
bash "$GAMES_SRC/tools/validate.sh" || die "validation failed — aborting"

# 3) rsync each game's files into storage -----------------------------------
log "Syncing game files → $HTML5_DIR"
mkdir -p "$HTML5_DIR"
shopt -s nullglob
for dir in "$GAMES_SRC"/games/*/; do
  slug="$(basename "$dir")"
  [ -f "$dir/index.html" ] || { echo "  ! skip $slug (no index.html)"; continue; }
  RSYNC_OPTS=(-a --delete --exclude 'game.json')
  [ "$DRY_RUN" = "1" ] && RSYNC_OPTS+=(--dry-run -v)
  echo "  → $slug"
  rsync "${RSYNC_OPTS[@]}" "$dir" "$HTML5_DIR/$slug/"
done

# 4) upsert the catalog rows ------------------------------------------------
log "Upserting catalog (php artisan games:sync)${STAGING:+ [staging: hidden]}"
SYNC_OPTS=(--path="$GAMES_SRC/games")
[ -n "$PRUNE_FLAG" ] && SYNC_OPTS+=("$PRUNE_FLAG")
[ -n "$INACTIVE_FLAG" ] && SYNC_OPTS+=("$INACTIVE_FLAG")
[ "$DRY_RUN" = "1" ] && SYNC_OPTS+=(--dry-run)
( cd "$APP_DIR" && php artisan games:sync "${SYNC_OPTS[@]}" )

# 5) fix ownership + clear caches (skip on dry-run) -------------------------
if [ "$DRY_RUN" = "0" ]; then
  log "Fixing ownership + clearing caches"
  if command -v chown >/dev/null 2>&1; then
    chown -R "$WEB_USER:$WEB_USER" "$HTML5_DIR" 2>/dev/null || \
      echo "  ! could not chown (need sudo?) — set WEB_USER or run as root"
  fi
  ( cd "$APP_DIR" && php artisan cache:clear >/dev/null 2>&1 || true )
fi

# 6) staging: print admin-preview URLs --------------------------------------
if [ "$STAGING" = "1" ]; then
  # APP_URL from env, else read it out of the app's .env
  APP_URL="${APP_URL:-}"
  if [ -z "$APP_URL" ] && [ -f "$APP_DIR/.env" ]; then
    APP_URL="$(grep -E '^APP_URL=' "$APP_DIR/.env" | head -1 | cut -d= -f2- | tr -d '"' )"
  fi
  APP_URL="${APP_URL%/}"
  log "Staging preview (open while logged in as an ADMIN — hidden from the public):"
  for dir in "$GAMES_SRC"/games/*/; do
    slug="$(basename "$dir")"
    [ -f "$dir/index.html" ] || continue
    echo "  ${APP_URL:-<your-domain>}/play/${slug}"
  done
  echo
  echo "  When happy: set is_active:true (or just run the LIVE deploy without STAGING) to publish."
fi

log "Done${DRY_RUN:+ (dry-run)}${STAGING:+ (staging)}."
