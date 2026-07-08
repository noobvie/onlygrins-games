# onlygrins-games

Educational HTML5 games **for children (~age 10) — math, language, science** —
for the **OnlyGrins** arcade. Each game posts its score through the Arcade SDK
→ leaderboard → **GP (Grin Points)**. Architecture, SDK, and manifest details:
[PLAN.md](PLAN.md).

## First-time server setup (once)

Two things must exist on the server before the first deploy:

**1. The `games:sync` command in the app.** Check with
`cd /home/arcade && php artisan list games` — if it errors with
*"no commands defined in the games namespace"*, copy the command file over
and clear caches:

```bash
# from Windows (WSL):
scp /mnt/d/Git_noob/Onlygrins/app/Console/Commands/GamesSyncCommand.php \
    root@<vps>:/home/arcade/app/Console/Commands/

# on the VPS:
cd /home/arcade && php artisan optimize:clear && php artisan list games
```

**2. This repo cloned onto the server** (the deploy script lives in it):

```bash
git clone https://github.com/noobvie/onlygrins-games.git /home/arcade-games
bash /home/arcade-games/deploy/deploy-games.sh
```

That's the only manual clone you'll ever do — from then on the script pulls
the latest commits itself on every run. (Use the HTTPS URL — the repo is
public, so no SSH keys are needed.)

## The whole process

Ship = three arrows: **git pull → sync files → tell the admin panel**.
On the server, one command does all three:

```bash
bash /home/arcade-games/deploy/deploy-games.sh
```

What it does, in order:

1. **git pull** this repo into `/home/arcade-games` (the clone you made in
   first-time setup)
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
| Test/iterate on ONE game by hand | see [Testing one game by upload](#testing-one-game-by-upload--fix--re-upload) below |

## Testing one game by upload → fix → re-upload

To iterate on a **single game** against the real platform without touching
the pipeline or redeploying everything:

1. **Pack it:** `bash tools/pack-game.sh <slug>` → `dist/<slug>.zip`
   (`index.html` at the zip root, as the platform requires; `game.json` and
   thumbnails are excluded).
2. **Upload it:** admin → Games → Add game → type **HTML5** → upload the zip,
   fill in title/category, upload the thumbnail via the form's image field —
   and leave it **inactive**.
3. **Test it:** open `/play/<slug>` while logged in as an admin — real SDK,
   real scoring/leaderboard; the public gets a 404 until it's active.
4. **Fix & repeat:** edit the game locally → re-run `pack-game.sh` → in
   admin, edit that game and re-upload the new zip. Hard-refresh the browser
   if you still see old assets (HTTP cache).
5. **When done:** either mark it active (it stays a manually-managed game),
   **or**, if it should be managed by the pipeline like the rest:
   **delete the manual entry in the admin first**, then ship it through the
   normal deploy. Manual uploads have no `edu:` import_id, so `games:sync`
   can't adopt them — deploying without deleting would create a duplicate.

## Configuration

`deploy-games.sh` is configured by env vars (shown with defaults):
`GAMES_REPO=https://github.com/noobvie/onlygrins-games.git`,
`GAMES_SRC=/home/arcade-games`, `APP_DIR=/home/arcade`,
`GAMES_BRANCH=master`, `WEB_USER=www-data`.

## Requirements

- **Windows (dev):** a browser; Node.js + Git Bash for
  `dev-serve.sh` / `validate.sh` (dependency-free, no `npm install`).
- **Server (one-time):** `git`, `rsync`, `php`, and the `games:sync` command
  in the app (see [First-time server setup](#first-time-server-setup-once)).

## Notes

- The dev host's mock SDK is mirrored from the OnlyGrins app at
  `d:\Git_noob\Onlygrins\public\sdk\arcade-sdk.js`; override with
  `ARCADE_SDK_SRC=/path/to/arcade-sdk.js bash tools/dev-serve.sh`.
- Thumbnails: author `thumbnail.svg` (960×540), export `thumbnail.png` and
  reference the PNG in `game.json` (crawlers can't render SVG — PLAN.md §5.2).
- If a browser shows old assets after an update, it's HTTP caching — hard
  refresh, or rename the changed asset file.
- New-game standards checklist: PLAN.md §12.
