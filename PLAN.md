# OnlyGrins Educational Games — Build & Deploy Plan

Status: **design / plan** (no code yet). Repo: `onlygrins-games` (separate from the
`onlygrins` Laravel app, by design). Target platform: the OnlyGrins arcade
(`d:\Git_noob\Onlygrins`, branch `arcade-platform`).

---

## 1. Goal

Author a catalog of **educational HTML5 games** (teaching Grin / Mimblewimble /
crypto basics), version them in their own git repo, and deploy them to the live
OnlyGrins arcade with a single bash command — on a content cadence that is
**independent** of the app's vendor-overlay deploys.

---

## 2. How the OnlyGrins platform serves a game (the facts we build on)

A game on the platform is **two coupled things** — miss either and it doesn't work:

1. **A DB row** in the `games` table (`onlygrins`:
   `database/migrations/2026_04_17_140006_create_games_table.php`). Key columns:
   `title`, `slug` (unique), `description`, `short_description`, `category_id`
   (FK, required), `thumbnail` (json), `game_type`, `game_file` (path),
   `width` (default 800), `height` (default 600), `controls`, `tags`,
   `is_active`, `is_mobile_compatible`, `api_enabled`, `import_id` (string, the
   stable external id for idempotent re-import).
2. **The files on disk.** For `game_type=html5`, the upload is a zip with
   `index.html` **at the root**; `app/Services/GameFileService.php` (`storeHtml`)
   extracts it to `storage/app/public/uploads/games/html5/{stub}/`. `game_file`
   then stores the path to `index.html`, served publicly at
   `/storage/uploads/games/html5/{stub}/index.html`.

Allowed `game_type` values (`app/Http/Requests/Dashboard/GameBaseRequest.php`):
`html5`, `flash`, `rom`, `tic80`, `tv_controller`, `embed`. **We use `html5`.**

### Scoring / leaderboards / rewards — the Arcade SDK

A game gets scoring, leaderboards, GP (Grin Points), levels and interlevel ads
**for free** by including the platform SDK (`onlygrins`: `public/sdk/arcade-sdk.js`,
served at `/sdk/arcade-sdk.js`). It's a `postMessage` bridge — no build step, no
deps. Public API:

| Method | Use |
|---|---|
| `ArcadeSDK.startSession(data?)` | mark play start |
| `ArcadeSDK.endSession(data?)` | mark play end |
| `ArcadeSDK.startLevel(level, data?)` | begin a level/lesson |
| `ArcadeSDK.restartLevel(level, data?)` | retry |
| `ArcadeSDK.endLevel(level, data?)` | complete a level/lesson |
| `ArcadeSDK.saveScore(score, extra?) → Promise` | persist score; resolves `{ isPersonalBest, ... }` |
| `ArcadeSDK.showInterlevelAd(placement?)` | optional ad break |
| `ArcadeSDK.share(data?)` | social share |

Legacy `__ctlArcade*` globals alias the same calls. **Every educational game we
ship uses the SDK** so a finished lesson/quiz posts a score → leaderboard → GP
reward ("learn Grin, earn points").

### The deploy constraint that decides our architecture

The app uses **git layering** (`onlygrins/deploy/README.md`): vendor Arcade core
is the baseline, OnlyGrins customizations overlay on top, and `deploy.sh` does
`git reset --hard origin/arcade-platform` + build + migrate on every update.
**`storage/` (all uploads, incl. games) is git-ignored and lives only on the
server.** Therefore:

- Game files **cannot** ride along on the app's `deploy.sh`.
- We must **never** commit game files into the `onlygrins` repo (it would break
  the clean vendor overlay and still be git-ignored anyway).
- A separate content pipeline that writes only into `storage/` + the DB is the
  correct, deploy-safe seam.

---

## 3. Architecture decision

**A dedicated `onlygrins-games` git repo + a bash sync script that does BOTH
file placement AND DB-row upsert.** File-copy alone is insufficient: a game with
no `games` row never appears in the catalog, has no slug/category, and gets no
SDK scoring.

```
   onlygrins-games (git)
        │  git pull on server
        ▼
   deploy-games.sh ──┬─ rsync games/<slug>/  →  storage/app/public/uploads/games/html5/<slug>/
                     └─ php artisan games:sync  →  upsert games table rows from each game.json
```

Runs on its **own cadence**, touches only `storage/` + DB rows, never vendor
core — survives the app's `git reset --hard` cleanly. This mirrors the
Grin-Node-Toolkit pattern (git repo → bash pull → sync to the right server dir).

Rejected alternatives:
- *Games as a subfolder of the `onlygrins` repo* — tangles with the vendor
  overlay and the storage git-ignore; wrong cadence.
- *Raw file copy into the games dir, no DB step* — game never enters the catalog.
- *Manual admin-panel upload per game* — fine for one-offs, doesn't scale to a
  versioned educational catalog or CI.

---

## 4. Repo layout (`onlygrins-games`)

```
onlygrins-games/
  PLAN.md                     ← this doc
  README.md                   ← quickstart for authors
  onlygrins-games.code-workspace
  .gitignore
  .editorconfig
  games/
    <slug>/                   ← one folder per game, slug == games.slug
      index.html              ← entry point; includes /sdk/arcade-sdk.js
      game.json               ← manifest (see §5)
      thumbnail.png           ← 16:9 catalog art (e.g. 800×450)
      assets/                 ← js/css/img/sound for the game
  shared/                     ← optional: reusable helpers across games
    edu-sdk.js                ← thin wrapper over ArcadeSDK for quiz/lesson flow
    edu.css                   ← shared lesson/quiz styling
  templates/
    starter-game/             ← copyable skeleton (index.html + game.json + SDK wired)
  tools/
    new-game.sh               ← scaffold a new game folder from the template
    validate.sh               ← lint: each game has index.html + valid game.json
  deploy/
    deploy-games.sh           ← server-side: pull + rsync + artisan games:sync
    games-manifest.schema.json← JSON Schema for game.json (CI validation)
```

`thumbnail.png` is optional at first (the platform tolerates a null thumbnail).

---

## 5. `game.json` manifest schema (per game)

Drives the `games:sync` upsert. One file per game folder.

```json
{
  "slug": "grin-coin-counter",
  "title": "Grin Coin Counter",
  "category": "education",
  "short_description": "Count confirmed Grin outputs before the timer runs out.",
  "description": "A fast-paced intro to how Grin outputs and confirmations work...",
  "game_type": "html5",
  "entry": "index.html",
  "width": 960,
  "height": 600,
  "controls": "Mouse / tap. Arrow keys to move.",
  "tags": ["grin", "education", "beginner"],
  "is_mobile_compatible": true,
  "api_enabled": true,
  "is_active": true,
  "is_featured": false,
  "import_id": "edu:grin-coin-counter"
}
```

Notes:
- `slug` is the identity (folder name must match). `import_id` (prefixed `edu:`)
  marks rows owned by this pipeline so `games:sync` only ever touches its own
  rows — never operator-uploaded games.
- `category` is a **slug**; `games:sync` resolves it to `category_id`, creating
  the category if missing (e.g. a new `education` category — the seeded set is
  Action/Guides/News/Reviews/Tips & Tricks/… so we add `education`).
- `api_enabled: true` turns on the score API for that game (SDK `saveScore`).
- `width`/`height` set the player iframe size.

---

## 6. `games:sync` artisan command (lives in the OnlyGrins overlay, vendor-safe)

A small custom command added to the OnlyGrins side (in
`resources`/`app` overlay, NOT vendor core) — e.g.
`app/Console/Commands/GamesSyncCommand.php`, signature `games:sync
{--path=storage/app/games-src} {--prune}`.

Behaviour (idempotent):
1. Scan `<path>/<slug>/game.json` for every game.
2. For each: resolve/create `category_id` from the `category` slug.
3. `Game::updateOrCreate(['import_id' => $m->import_id], [...mapped fields, game_file => "uploads/games/html5/{slug}/index.html"])`.
4. `--prune`: deactivate (`is_active=false`) any `edu:`-owned row whose folder
   disappeared (soft, never hard-delete — keeps scores/leaderboards intact).
5. Print a summary table (created / updated / pruned).

Why an artisan command (not raw SQL): reuses the platform's `Game` model,
casts, and slug/category rules; runs inside the app so config/paths are correct;
testable; vendor-upgrade-safe because it's an overlay file.

**This command is the one piece that must be added to the `onlygrins` repo.**
Everything else lives in `onlygrins-games`.

---

## 7. `deploy/deploy-games.sh` (server, run as the deploy user)

```
ENV (override as needed):
  GAMES_REPO   = git@github.com:noobvie/onlygrins-games.git
  GAMES_SRC    = /home/arcade-games            # checkout dir (outside the app)
  APP_DIR      = /home/arcade                  # onlygrins app root
  HTML5_DIR    = $APP_DIR/storage/app/public/uploads/games/html5

Flow:
  1. clone or `git pull` GAMES_REPO into GAMES_SRC
  2. tools/validate.sh   (fail fast if any game.json/index.html missing/invalid)
  3. for each games/<slug>/:
        rsync -a --delete  games/<slug>/   $HTML5_DIR/<slug>/
     (exclude game.json + thumbnail source from the served dir if desired)
  4. cd $APP_DIR && php artisan games:sync --path="$GAMES_SRC/games" [--prune]
  5. php artisan cache:clear / queue cache warmup as needed
  6. chown -R to the web user; print summary
```

Idempotent and re-runnable. Independent of the app's `deploy.sh`. Add an
optional `--dry-run` that runs `games:sync` with no writes.

Decision to confirm later: keep `deploy-games.sh` in **this** repo (ships with
the content) vs. in the Grin-Node-Toolkit (consistent with your other ops
scripts). Default: here, so content + its deployer version together.

---

## 8. Authoring workflow

```
# scaffold
bash tools/new-game.sh grin-coin-counter        # copies templates/starter-game → games/grin-coin-counter
# edit games/grin-coin-counter/{index.html, game.json, assets/}
# test locally (open index.html; SDK no-ops gracefully outside the iframe)
bash tools/validate.sh
git add games/grin-coin-counter && git commit -m "add Grin Coin Counter" && git push
# on server:
bash deploy/deploy-games.sh
```

The SDK rejects/ignores calls when not inside the platform iframe, so a game
runs standalone during development (scoring just no-ops).

---

## 9. First educational game ideas (catalog v1)

All `category: education`, `game_type: html5`, SDK-wired:

1. **Grin Coin Counter** — count confirmed outputs vs. a timer → teaches
   outputs/confirmations. (beginner)
2. **Mimblewimble Match** — memory/match pairs of MW concepts
   (kernel/blinding factor/Pedersen commitment). (beginner)
3. **Build-a-Block** — drag transactions into a block under the weight limit →
   teaches block construction + fees. (intermediate)
4. **Cut-Through Cleanup** — puzzle: remove intermediate outputs to show MW
   cut-through shrinking the chain. (intermediate)
5. **Confirmation Climb** — endless runner; survive 1440 blocks to "mature" a
   coinbase → teaches coinbase maturity. (fun, ties to toolkit lore)

Each ends a lesson with `endLevel()` + `saveScore()` so completion feeds the
leaderboard and GP rewards.

---

## 10. Open items / next steps

- [ ] Create `onlygrins-games.code-workspace` (done in this scaffold) + decide
      whether to also add the `onlygrins` app folder to the same workspace for
      cross-editing the `games:sync` command.
- [ ] Confirm the `education` category: add a seeder/`games:sync` auto-create.
- [ ] Build `GamesSyncCommand.php` in the OnlyGrins overlay.
- [ ] Build `templates/starter-game/` (index.html + game.json + SDK wired +
      shared/edu-sdk.js helper).
- [ ] Build `tools/new-game.sh`, `tools/validate.sh`, `deploy/deploy-games.sh`.
- [ ] Author game #1 (Grin Coin Counter) end-to-end to validate the path.
- [ ] Decide repo remote (GitHub `noobvie/onlygrins-games`?) + CI to run
      `validate.sh` on push.

---

## 11. Why this is the right shape (summary)

- **Deploy-safe:** writes only `storage/` + DB; untouched by the app's
  `git reset --hard` vendor-overlay deploys.
- **Right cadence:** educational content ships independently of app/vendor
  releases.
- **First-class games:** manifest → `games:sync` upsert gives real catalog rows,
  categories, and SDK scoring/leaderboards/GP — not orphaned static files.
- **Vendor-upgrade-safe:** the only app-side addition is one overlay artisan
  command.
- **Familiar:** same git-repo → bash-pull → sync-to-server-dir pattern as the
  Grin-Node-Toolkit.
