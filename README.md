# onlygrins-games

Educational HTML5 games **for children (~age 10) — math, language, science** —
for the **OnlyGrins** arcade, versioned independently of the Laravel app and
deployed via a bash sync script. Each game posts its score through the Arcade
SDK → leaderboard → **GP (Grin Points)**, so kids learn and earn points (which a
future GP → grin converter can pay out).

**Read [PLAN.md](PLAN.md) first** — it documents the architecture, the platform's
game model, the Arcade SDK, the `game.json` manifest, the `games:sync` artisan
command, and the deploy flow.

## TL;DR

- Each game = a self-contained folder under `games/<slug>/`: `index.html` +
  bundled `edu-sdk.js` + assets, plus a `game.json` manifest for the automated
  pipeline. Games are **self-contained** — they run by just opening
  `index.html`; the platform's `/sdk/arcade-sdk.js` is used when present and
  no-ops gracefully when not.
- **Simplest test:** double-click `games/<slug>/index.html` in a browser. It
  plays; scoring just no-ops (no login/leaderboard locally).
- **Simplest ship:** `bash tools/pack-game.sh <slug>` → `dist/<slug>.zip` →
  upload in the OnlyGrins admin (Add game → HTML5 → upload). Good for a few games.
- **At scale:** `bash tools/dev-serve.sh` (mock host w/ live SDK console) for
  dev, and `deploy/deploy-games.sh` on the server for git-driven deploys + the
  `games:sync` catalog upsert.

---

## Two ways to test, two ways to ship

You do **not** need the dev server or the deploy pipeline. They're conveniences
for working at scale. The minimal path is just: open the file → zip → upload.

| | Quick & simple | Full pipeline |
|---|---|---|
| **Test** | open `index.html` in a browser | `bash tools/dev-serve.sh <slug>` (mock host, see every SDK call) |
| **Ship** | `pack-game.sh` → upload zip in admin | `deploy/deploy-games.sh` on the server (git pull + rsync + `games:sync`) |

## Requirements

- For the simple path: **a browser** (+ PowerShell or `zip` for `pack-game.sh`).
- For the dev server / scaffolder / validator: **Node.js** (no `npm install`;
  dependency-free) and **bash** (Git Bash on Windows is fine).
- For the deploy pipeline (server only): `git`, `rsync`, `php` + the OnlyGrins app.

## Workflow 1 — Test a game

**Quick:** double-click `games/<slug>/index.html` (or open it in a browser). The
game runs; scoring no-ops because the platform isn't there. Perfect for checking
gameplay/visuals on Windows with zero setup.

**With the SDK console (optional):** to *see* the score/level/ad calls a game
makes (and fake login/personal-best), run the mock host:

```bash
bash tools/dev-serve.sh                    # opens the starter template in the dev host
bash tools/dev-serve.sh grin-coin-counter  # opens a specific game
PORT=9000 bash tools/dev-serve.sh          # custom port
```

It serves the repo over HTTP, mirrors the platform SDK to `/sdk/arcade-sdk.js`,
and opens `tools/arcade-host.html` — a **mock platform** that answers every SDK
call and logs each message. Toggle **logged in** / **VIP**; tick **auto-reload**
to reload on save. Ctrl-C to stop.

> The mock SDK is mirrored from the OnlyGrins app at
> `d:\Git_noob\Onlygrins\public\sdk\arcade-sdk.js`. Override with
> `ARCADE_SDK_SRC=/path/to/arcade-sdk.js bash tools/dev-serve.sh`.

Either way, real scoring/leaderboard/GP only happens on the actual platform
(Workflow 4).

## Workflow 2 — Create a new game

```bash
bash tools/new-game.sh times-table-towers "Times-Table Towers"
# → copies templates/starter-game → games/times-table-towers/
#   and sets slug, title, import_id=edu:times-table-towers
bash tools/dev-serve.sh times-table-towers   # build it in the dev host
```

Edit `games/<slug>/index.html` (the game) and `games/<slug>/game.json` (catalog
metadata — see PLAN.md §5). Author catalog art as `thumbnail.svg` (960×540),
export it to `thumbnail.png` (social crawlers can't render SVG — see PLAN.md
§5.2 for the headless-Chrome one-liner) and reference the PNG in `game.json`
(`"thumbnail": "thumbnail.png"`). Follow the new-game standards checklist in
PLAN.md §12.

## Workflow 3 — Validate & commit

```bash
bash tools/validate.sh                       # checks every game.json + files
git add games/<slug> && git commit -m "add <slug>"
git push                                      # CI can run validate.sh on push
```

`validate.sh` enforces: required fields, `slug` == folder name, `import_id`
starts with `edu:`, the entry file exists, and slugs/import_ids are unique.

## Workflow 4 — Ship a game (simple): zip & upload

For one or a handful of games, skip the server pipeline entirely:

```bash
bash tools/pack-game.sh grin-coin-counter    # → dist/grin-coin-counter.zip
```

Then in OnlyGrins: **Dashboard → Games → Add game → type HTML5 → upload the
zip**, fill in title/category/etc., save. The zip has `index.html` at its root
(what the platform requires) and excludes pipeline-only files (`game.json`,
thumbnails — upload the thumbnail via the form's image field).

To **update** a game later: re-run `pack-game.sh`, then edit that game in the
admin and re-upload the zip. To **preview before publishing**, upload it and
leave it inactive — admins can still open it at `/play/<slug>` (real SDK + real
scoring), while the public gets a 404 until you mark it active.

## Workflow 5 — Ship at scale (automated): server deploy (Tier 3)

**One-time, per server:** the `games:sync` artisan command must exist in the
OnlyGrins app (`app/Console/Commands/GamesSyncCommand.php`) and be deployed with
the app. It's the only app-side piece (see PLAN.md §6).

Then, on the server (as the deploy user), every release — first launch *or*
shipping a new version of an existing game — is the **same command**:

```bash
# preview what would change, no writes:
bash deploy/deploy-games.sh --dry-run

# do it for real:
bash deploy/deploy-games.sh

# also deactivate games whose folder was removed:
PRUNE=1 bash deploy/deploy-games.sh
```

It pulls this repo, validates, `rsync`s each game's files into
`storage/app/public/uploads/games/html5/<slug>/`, runs `php artisan games:sync`
to upsert the catalog rows (matched on `import_id`, so it only ever touches its
own `edu:` rows), fixes ownership, and clears caches. Configure via env:

```bash
GAMES_REPO=git@github.com:noobvie/onlygrins-games.git \
GAMES_SRC=/home/arcade-games \
APP_DIR=/home/arcade \
WEB_USER=www-data \
bash deploy/deploy-games.sh
```

### Shipping a new version of a specific game

There is no separate "update" path — versioning is just git + re-running the
deploy:

1. Edit `games/<slug>/` locally; bump anything in `game.json` if needed.
2. `bash tools/validate.sh`, then commit & push.
3. On the server: `bash deploy/deploy-games.sh`.

Because `rsync` runs with `--delete`, removed/renamed files are cleaned from the
server, and `games:sync` updates the existing row in place (same `import_id`) —
scores/leaderboards are preserved. The deploy clears the app cache; if a browser
still shows old assets, it's HTTP caching — a hard refresh or renaming the
changed asset file resolves it.

### Hiding or removing a game

- **Hide:** set `"is_active": false` in `game.json`, commit, redeploy.
- **Remove:** delete `games/<slug>/`, commit, then `PRUNE=1 bash
  deploy/deploy-games.sh` — the row is deactivated (never hard-deleted, so
  historical scores survive).

### Staging on the live server (preview before the public sees it)

Prefer testing on the *real* platform over the Windows local host? Deploy hidden
and preview as an admin — no public exposure:

```bash
# on the server: deploy every game as is_active=false, then print preview URLs
STAGING=1 bash deploy/deploy-games.sh
# point at a separate checkout/branch to isolate staging from production content:
GAMES_SRC=/home/arcade-games-staging GAMES_BRANCH=staging STAGING=1 \
  bash deploy/deploy-games.sh
```

Open the printed `/play/<slug>` URLs **while logged in as an admin**: you get the
real player iframe, real SDK, real leaderboard/GP/EXP — the public still gets a
404. When happy, run the normal (non-STAGING) deploy to publish.

## At a glance

| Goal | Simple | At scale |
|---|---|---|
| **Test** | open `index.html` in a browser | `tools/dev-serve.sh` (mock host) / `STAGING=1 deploy-games.sh` (real platform, hidden) |
| **Ship** | `tools/pack-game.sh` → upload zip | `deploy/deploy-games.sh` (git pull + rsync + `games:sync`) |
