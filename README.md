# onlygrins-games

Educational HTML5 games **for children (~age 10) — math, language, science** —
for the **OnlyGrins** arcade. Each game posts its score through the Arcade SDK
→ leaderboard → **GP (Grin Points)**. Architecture, SDK, and manifest details:
[PLAN.md](PLAN.md).

## The whole process

Ship = three arrows: **git pull → sync files → tell the admin panel**.
On the server, one command does all three:

```bash
bash deploy/deploy-games.sh
```

What it does, in order:

1. **git pull** this repo (clones on first run)
2. validates every `game.json`
3. **rsync** each `games/<slug>/` → `storage/app/public/uploads/games/html5/<slug>/`
4. **`php artisan games:sync`** — reads each `game.json` and upserts the
   catalog rows in the DB. *This* is what makes the admin panel and the site
   see the games. Rows are matched on `import_id`, so re-deploys update in
   place and scores/leaderboards survive.
5. fixes file ownership + clears the app cache

## Day-to-day

**1. Create or edit a game (on Windows):**

```bash
bash tools/new-game.sh my-game "My Game"   # scaffold a new game (skip when editing)
bash tools/dev-serve.sh my-game            # play it + watch SDK calls live
```

(Or just double-click `games/<slug>/index.html` — games run standalone;
scoring no-ops without the platform.)

Edit `games/<slug>/index.html` (the game) and `games/<slug>/game.json`
(title, category, thumbnail — the metadata `games:sync` imports).

**2. Ship it:**

```bash
bash tools/validate.sh
git add -A && git commit -m "add my-game" && git push
ssh <you>@<vps> 'bash /home/arcade-games/deploy/deploy-games.sh'
```

Updating an existing game is the **same steps** — there is no separate update
path. New game, changed game, changed metadata: edit → push → deploy.

## Occasional needs

| Want to… | Do this |
|---|---|
| Preview what a deploy would change | `bash deploy/deploy-games.sh --dry-run` |
| Test on the real platform before going public | `STAGING=1 bash deploy/deploy-games.sh` → deploys everything hidden, prints `/play/<slug>` URLs you can open as admin |
| Hide a game | set `"is_active": false` in its `game.json` → push → deploy |
| Remove a game | delete `games/<slug>/` → push → `PRUNE=1 bash deploy/deploy-games.sh` (row is deactivated, never deleted — scores survive) |
| Manually upload one game without the pipeline | `bash tools/pack-game.sh <slug>` → in admin: Add game → HTML5 → upload `dist/<slug>.zip` |

`deploy-games.sh` is configured by env vars (shown with defaults):
`GAMES_REPO=git@github.com:noobvie/onlygrins-games.git`,
`GAMES_SRC=/home/arcade-games`, `APP_DIR=/home/arcade`,
`GAMES_BRANCH=master`, `WEB_USER=www-data`.

## Requirements

- **Windows (dev):** a browser; Node.js + Git Bash for
  `dev-serve.sh` / `validate.sh` (dependency-free, no `npm install`).
- **Server (one-time):** `git`, `rsync`, `php`, and the OnlyGrins app with the
  `games:sync` command deployed (`app/Console/Commands/GamesSyncCommand.php` —
  already in the app repo; see PLAN.md §6).

## Notes

- The dev host's mock SDK is mirrored from the OnlyGrins app at
  `d:\Git_noob\Onlygrins\public\sdk\arcade-sdk.js`; override with
  `ARCADE_SDK_SRC=/path/to/arcade-sdk.js bash tools/dev-serve.sh`.
- Thumbnails: author `thumbnail.svg` (960×540), export `thumbnail.png` and
  reference the PNG in `game.json` (crawlers can't render SVG — PLAN.md §5.2).
- If a browser shows old assets after an update, it's HTTP caching — hard
  refresh, or rename the changed asset file.
- New-game standards checklist: PLAN.md §12.
