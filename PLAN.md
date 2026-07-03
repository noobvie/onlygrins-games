# OnlyGrins Educational Games — Build & Deploy Plan

Status: **design / plan** (no code yet). Repo: `onlygrins-games` (separate from the
`onlygrins` Laravel app, by design). Target platform: the OnlyGrins arcade
(`d:\Git_noob\Onlygrins`, branch `arcade-platform`).

---

## 1. Goal

Author a catalog of **educational HTML5 games for children (~age 10)** that
teach **math, language, and science** — fun icons, light strategy, age-appropriate
difficulty. Version them in their own git repo and deploy them to the live
OnlyGrins arcade with a single bash command, on a content cadence that is
**independent** of the app's vendor-overlay deploys.

The OnlyGrins arcade supplies the **reward layer for free**: every game posts a
score via the SDK → leaderboard → **GP (Grin Points)**, the platform's cumulative
points/XP currency. A kid plays, learns, and earns points; a future **GP → Grin
converter** can turn that accumulated XP into real grin. The grin theme also
gives the *content* a natural hook (e.g. counting grin coins to teach decimals),
but the subjects are general K-12 STEM + language, not crypto.

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
reward ("learn, earn points") — the GP that a future converter turns into grin.

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
    <slug>/                   ← one folder per game, slug == games.slug; SELF-CONTAINED
      index.html              ← entry; loads /sdk/arcade-sdk.js (platform) + ./edu-sdk.js
      edu-sdk.js              ← bundled copy of the helper (relative, ships with the game)  ✅
      game.json               ← manifest (see §5); pipeline-only, not in the upload zip
      thumbnail.svg|png       ← 16:9 catalog art (optional)
      assets/                 ← js/css/img/sound for the game
  shared/
    edu-sdk.js                ← MASTER copy of the helper; new-game.sh bundles it per game  ✅
    edu.css                   ← shared lesson/quiz styling (optional)
  templates/
    starter-game/             ← copyable skeleton (index.html + edu-sdk.js + game.json)  ✅
  tools/
    arcade-host.html          ← mock platform host: iframes a game, answers every  ✅
                                 SDK call, live console of every message
    dev-serve.sh              ← serve repo root + open the host on one game  ✅
    _serve.js                 ← zero-dep Node static server used by dev-serve.sh  ✅
    new-game.sh               ← scaffold a new game folder from the template  ✅
    pack-game.sh              ← zip a game (index.html at root) for admin upload  ✅
    validate.sh / _validate.js← lint: each game has index.html + valid game.json  ✅
  sdk/                        ← git-ignored; dev-serve.sh mirrors the platform's
                                 /sdk/arcade-sdk.js here so the absolute path resolves
  dist/                       ← git-ignored; pack-game.sh writes <slug>.zip here
  deploy/
    deploy-games.sh           ← server-side: pull + rsync + artisan games:sync  ✅
    games-manifest.schema.json← JSON Schema for game.json (CI validation)  ✅
```

**Self-containment (important):** a game references the platform SDK by its
absolute path `/sdk/arcade-sdk.js` (the arcade serves it) but bundles our
`edu-sdk.js` helper *relatively* inside its own folder. That means a game folder
is fully portable: it runs by just opening `index.html` (SDK absent → scoring
no-ops gracefully), inside the dev host, and on the real platform — with no
`/shared/` runtime dependency. `thumbnail` is optional (platform tolerates null).

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

### 5.1 Categorization convention — subject vs. grade level

Two independent axes, kept separate on purpose (the platform `games` table has a
single required `category_id` FK plus a free-form `tags` array — no grade column):

| Axis | What | Where it lives | Notes |
|---|---|---|---|
| **Subject** | Math / Language / Science | `category` (the single FK slug) | The primary catalog browse axis; exactly one per game. Slugs: `math`, `language`, `science`. |
| **Grade / class level** | G1, G2, G3 … (or bands K-2, 3-5, 6-8) | `tags` (`grade-1`…`grade-5`) **+ an in-game grade picker** | A good game spans several grades; tag the whole range it supports. |
| **Strand (optional)** | arithmetic, fractions, place-value, geometry … | `tags` (`strand-arithmetic`) | For finer search/filtering within a subject. |

**Difficulty model — ONE game per concept, grade chosen *inside* the game.**
Not a separate game (slug) per grade. Rationale:

- **Leaderboards & GP stay whole** — one game = one leaderboard; splitting by
  grade fragments scores/GP into thin lists.
- **One codebase** — a grade is just a config (operator set + number range +
  target cap), not a fork to maintain.
- **Real differentiation** — a strong pupil pushes into a higher band, a
  struggling one drops down, within the same game.
- **Simpler pipeline** — fewer slugs/folders to sync & deploy.

So: the start screen offers a **grade picker**; the chosen grade swaps the
difficulty band; levels still ramp within the band. `tags` carry the supported
grade range so the catalog can still be filtered by grade. The per-play grade is
also passed to `saveScore` as `extra.grade` for analytics.

*Reference implementation:* `games/grin-math-snake/` — `GRADES[]` config drives
operators/ranges/target-cap; `tags` list `grade-1`…`grade-5`. Copy this pattern
for every new educational game.

> If grade ever needs to be a first-class, sortable column (not just a tag), add
> an optional `"grades": [1,5]` to the manifest schema and have `games:sync` map
> it into `tags` — but tags are sufficient today, no schema/app change required.

### 5.2 SEO & metadata standard (per game)

**Where SEO actually happens:** the platform's public `/play/<slug>` page. The
app builds JSON-LD (`VideoGame` + breadcrumbs — `app/Services/JsonLdService.php`)
and the Open Graph social card (`app/Services/SocialMetaService.php`) from the
`games` DB row — i.e. from this repo's `game.json` via `games:sync`. The game's
own `index.html` is iframe content and is **not** the indexed surface. Hence:

1. **`noindex` the raw game file (required).** Every game `index.html` (and the
   starter template) must carry, right after the viewport meta:
   ```html
   <meta name="robots" content="noindex" />
   ```
   The raw files are publicly reachable at
   `/storage/uploads/games/html5/<slug>/index.html` and would otherwise be
   indexed as thin, chrome-less duplicates competing with `/play/<slug>`.
2. **Write `description` / `short_description` as search snippets.** They become
   the meta description and JSON-LD description of the public game page. Name
   the subject, skill and grade range in natural language ("free online French
   vocabulary game for kids in grades 1–5 …"), lead with what the player does,
   keep `short_description` ≲ 160 chars. `tags` feed the platform's indexable
   tag pages — include subject, strand and grade tags.
3. **`thumbnail.png` is required (960×540, 16:9).** `og:image` must be PNG/JPG —
   social crawlers (Facebook/X/Discord) do not render SVG, and `games:sync`
   points every platform image size at this one file. Keep `thumbnail.svg` as
   the editable source and export the PNG:
   ```
   chrome --headless=new --disable-gpu --window-size=960,540 --hide-scrollbars \
     --screenshot=games/<slug>/thumbnail.png  file:///…/games/<slug>/thumbnail.svg
   ```
   `game.json` must reference it: `"thumbnail": "thumbnail.png"`.
4. **Language attributes:** page `lang="en"`; wrap foreign-language vocabulary
   (e.g. the French games) in `lang="fr"` spans — mainly a screen-reader /
   pronunciation win, minor SEO.

**Do not** add per-game OG tags, JSON-LD, sitemaps or meta descriptions inside
game files — search engines will always prefer the platform page; it's
duplicated effort and extra standardization surface.

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

There are two equally-valid paths. Pick by volume — both produce the same
catalog rows + SDK scoring.

**Simple (a few games):**
```
bash tools/new-game.sh grin-coin-counter "Grin Coin Counter"
# edit games/grin-coin-counter/{index.html, edu-sdk.js, assets/, game.json}
# TEST: just open games/grin-coin-counter/index.html in a browser (scoring no-ops)
bash tools/pack-game.sh grin-coin-counter        # → dist/grin-coin-counter.zip
# SHIP: OnlyGrins admin → Add game → HTML5 → upload the zip; fill title/category
```

**At scale (automated, git-driven):**
```
bash tools/new-game.sh grin-coin-counter "Grin Coin Counter"
bash tools/dev-serve.sh grin-coin-counter        # mock host w/ live SDK console
bash tools/validate.sh
git add games/grin-coin-counter && git commit -m "add Grin Coin Counter" && git push
bash deploy/deploy-games.sh                       # on the server (or STAGING=1 first)
```

Because games are self-contained (§4), they run standalone during development —
the SDK calls just no-op when the platform isn't present.

### 8.1 Fast dev loop (Tier 1 — local SDK harness) ✅ built

The slow path is: build a zip → upload via admin → play → tweak → repeat. The
fast path removes the platform from the inner loop entirely with a **local mock
host** that speaks the exact same `postMessage` protocol as the Laravel score
bridge.

```
  ┌─ Tier 1: local SDK harness ──────────────────────────────────────┐
  │  bash tools/dev-serve.sh [slug]                                   │
  │    → serves the repo root over HTTP (Node/_serve.js, no install)  │
  │    → mirrors the platform SDK to /sdk/arcade-sdk.js               │
  │    → opens tools/arcade-host.html?game=<slug>                     │
  │                                                                   │
  │  arcade-host.html  iframes the game and ANSWERS every SDK call    │
  │  (session/level/score/ad/share) with the real response shape,     │
  │  echoing _id. A live console shows each message in/out. Toggles:  │
  │  "logged in" (→ saveScore success / not_authenticated),           │
  │  "VIP" (→ ads skipped). Tracks personal-best across saves.        │
  │                                                                   │
  │  Edit index.html in place → tick "auto-reload" → save → reloads.  │
  └───────────────────────────────────────────────────────────────────┘
            │ or skip the host entirely: just open index.html in a browser
            ▼
   Tier 2: real platform, HIDDEN — preview before the public sees it
            │   STAGING=1 deploy-games.sh  (games:sync --inactive)  OR
            │   admin-upload the zip and leave it inactive
            │   → admins open /play/<slug>: real player iframe, real SDK,
            │     real leaderboard/GP/EXP; the public gets 404
            ▼
   Tier 3: publish — deploy-games.sh (no STAGING) / mark is_active → live
```

Why Tier 2 works: `PlayController` lets admins (and a game's author) open
inactive/in-review games at `/play/<slug>` (`GameRepository::bySlug` is
unscoped; visibility is gated after), so staging needs **no** platform changes —
just deploy with `is_active=false`. And the local host works because
`arcade-host.html` mirrors `TYPES_TO_RESPONSE` from `public/sdk/arcade-sdk.js`,
so a game that behaves in the harness behaves on the platform.

Quickstart:

```
bash tools/dev-serve.sh                    # opens the starter-game in the host
bash tools/dev-serve.sh grin-coin-counter  # opens games/grin-coin-counter
PORT=9000 bash tools/dev-serve.sh          # custom port
```

The harness is dev-only and never ships: `sdk/` (the mirrored vendor SDK) is
git-ignored, and `tools/` is not part of any game folder rsynced to the server.

---

## 9. First educational game ideas (catalog v1)

Audience: ~10-year-olds. `game_type: html5`, SDK-wired, fun icons, light
strategy. The grin (ツ) coin theme is used as a *vehicle* for the math, not as a
crypto lesson.

**Math**
1. **Grin Coin Counter** ✅ *(built)* — add grin coins (ツ) to hit a target
   amount; rounds ramp whole → tenths → hundredths → teaches addition, place
   value, and **decimals** (with a nanogrin fun-fact). `category: math`.
2. **Grin Change Maker** — give the fewest coins of change from a payment →
   subtraction + optimization.
3. **Times-Table Towers** — stack blocks by answering ×/÷ facts under gentle
   time pressure → multiplication fluency.

**Language**
4. **Word Builder** — drag letters to spell the pictured word → spelling /
   phonics.
5. **Sentence Sort** — order jumbled words into a correct sentence → grammar.

**Science**
6. **Sort the Science** — drag items into buckets (living/non-living,
   solid/liquid/gas, planets vs. stars) → classification.
7. **Food Chain Climb** — arrange organisms in the right order → ecosystems.

Each ends a lesson with `endLevel()` + `saveScore()` so completion feeds the
leaderboard and GP rewards (the future GP → grin converter). Categories are
manifest slugs (`math`, `language`, `science`) auto-created by `games:sync`.

### 9.1 Competitive play — weak AI bot, NOT live matchmaking

Goal: let kids *race* (e.g. "fastest to the target"). Decision: deliver this with
a **soft in-browser AI opponent**, not real-time online matchmaking. The Arcade
SDK provides `saveScore` + leaderboards but **no** realtime/socket/room/opponent
primitives (verified), so live play would mean standing up a whole websocket +
matchmaking backend — which also breaks the static-files-in-`storage/` deploy
model. On top of cost, online random pairing is a poor fit for a children's
product:

- **Empty-lobby cold-start** — a new game has too few simultaneous players to
  match in real time; a bot is available instantly, every time.
- **Child safety** — pairing minors with random strangers is a COPPA/moderation
  liability even without chat. A bot removes that surface entirely.
- **Tunable difficulty** — the bot is dialed to be *beatable but pushy* per grade;
  a random human is uncontrollable.

**The pattern (reference impl: `games/grin-math-snake/`):** the opponent is a
second snake that reuses the same move-validation logic, with weakness from three
knobs tuned per grade — `speed` (fraction of player speed), `react` (seconds
between decisions) and `mistake` (chance it grabs a sub-optimal but *safe* token,
wasting time — it never makes an illegal move). First snake to the target wins
the round: player-win ramps the level + scores; bot-win costs a heart and serves
a fresh target. Modes are a start-screen toggle (Solo / Race). The per-play mode
is passed to `saveScore` as `extra.mode`.

**Later (optional), to make the AI feel human:** seed the bot from real players'
recorded best runs ("ghosts") pulled from leaderboard data — *asynchronous
multiplayer disguised as real-time*, still no netcode, no live pool, no safety
surface. Reserve true live play for **private room codes between known friends**,
never random pairing of minors — and only if it becomes a real product goal.

---

## 10. Open items / next steps

- [ ] Create `onlygrins-games.code-workspace` (done in this scaffold) + decide
      whether to also add the `onlygrins` app folder to the same workspace for
      cross-editing the `games:sync` command.
- [x] Confirm the `education` category: `games:sync` auto-creates it via
      `Category::firstOrCreate` from the manifest's `category` slug.
- [x] Build `GamesSyncCommand.php` in the OnlyGrins overlay
      (`onlygrins`: `app/Console/Commands/GamesSyncCommand.php`) — the one
      app-side file. Keyed on `import_id` (`edu:*`), idempotent, `--prune` +
      `--dry-run`. **Not yet committed to the onlygrins repo.**
- [x] Build the Tier 1 local harness: `tools/arcade-host.html`,
      `tools/dev-serve.sh`, `tools/_serve.js` (see §8.1).
- [x] Build `templates/starter-game/` (index.html + game.json + SDK wired +
      shared/edu-sdk.js helper) — a playable 3-question quiz exercising the full
      SDK lifecycle, ready to copy.
- [x] Build `tools/new-game.sh`, `tools/validate.sh` (+ `tools/_validate.js`),
      `deploy/deploy-games.sh`, and `deploy/games-manifest.schema.json`.
- [x] Author game #1 (Grin Coin Counter) end-to-end — `games/grin-coin-counter/`,
      scaffolded via `new-game.sh`, validates clean.
- [x] Add a `thumbnail.png` (960×540, 16:9) to each game — exported from each
      game's `thumbnail.svg` via headless Chrome; `game.json` now references the
      PNG (required by the SEO standard, §5.2).
- [ ] Add `tools/sync-sdk.sh` (re-stamp bundled `edu-sdk.js` from the master)
      and a hash-compare in `validate.sh` so bundled copies can't drift (§12.2).
- [ ] Decide repo remote (GitHub `noobvie/onlygrins-games`?) + CI to run
      `validate.sh` on push.
- [ ] Commit + push `GamesSyncCommand.php` to the `onlygrins` repo's
      `arcade-platform` branch so the server has it for Tier 3.

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

---

## 12. Standards checklist for every new game (scale rules)

Every new game MUST follow these; they exist so the catalog stays uniform as it
grows across topics and tech. `tools/validate.sh` enforces the mechanical ones.

1. **Scaffold, don't hand-roll.** `bash tools/new-game.sh <slug> "Title"` from
   `templates/starter-game/` — folder is self-contained (§4): `index.html`,
   bundled `edu-sdk.js`, `game.json`, `thumbnail.svg` + `thumbnail.png`.
2. **`edu-sdk.js` never forks.** The bundled copy must stay byte-identical to
   the master `shared/edu-sdk.js`. Fix bugs in the master, then re-stamp every
   game's copy (planned: `tools/sync-sdk.sh` + a hash check in `validate.sh` —
   see §10). Never patch one game's copy in place.
3. **`import_id` = `edu:<slug>`, and the `edu:` prefix is load-bearing forever.**
   It is the idempotency/ownership key that protects operator-uploaded games
   from `games:sync`. Even if the catalog expands beyond education, `edu:`
   means "owned by this repo's pipeline" — never rename it (renaming orphans
   every synced row and its scores).
4. **One subject category; honest grade tags.** `category` = exactly one subject
   slug (`math`, `language`, `science`; new subjects are fine — `games:sync`
   auto-creates them). Grade tags (`grade-1`…`grade-5`) must reflect the range
   the in-game grade picker *actually* supports — don't blanket-tag all five or
   the grade filter carries no information.
5. **One game per concept; grade picked inside the game** (§5.1). Pass
   `extra.grade` (and `extra.mode` if there's a race/solo toggle) to `saveScore`.
6. **SEO standard (§5.2):** `noindex` meta in `index.html`, snippet-quality
   descriptions in `game.json`, `thumbnail.png` 960×540 referenced from the
   manifest.
7. **Game families — reuse the engine, rewrite only the content.** Most quiz /
   drag-and-drop games are the same engine reskinned. When authoring a sibling
   of an existing game, copy that game as the engine and isolate topic content
   (word lists, question banks) in one clearly-marked data block or `data.json`
   — a new topic should be a content edit, not new code.
8. **Other tech is welcome, same contract.** The platform contract is just
   "files in `games/<slug>/` with `index.html` at the root". Phaser/Kaboom/Godot
   HTML5 exports work unchanged — commit the *built output* into the game
   folder; keep sources/build chains out of this repo (or in an untracked
   sibling). No npm build step in the pipeline.
9. **Competitive play = tunable AI bot, never live matchmaking of minors**
   (§9.1). Knobs: `speed`, `react`, `mistake`.
10. **Ship gate:** `bash tools/validate.sh` clean before commit; test via
    `tools/dev-serve.sh` (Tier 1) and, when it matters, STAGING deploy (Tier 2).
