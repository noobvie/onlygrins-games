# onlygrins-games

Educational HTML5 games for the **OnlyGrins** arcade, versioned independently of
the Laravel app and deployed via a bash sync script.

**Read [PLAN.md](PLAN.md) first** — it documents the architecture, the platform's
game model, the Arcade SDK, the `game.json` manifest, the `games:sync` artisan
command, and the deploy flow.

## TL;DR

- Each game = a folder under `games/<slug>/` with `index.html` (includes
  `/sdk/arcade-sdk.js`) + a `game.json` manifest.
- `deploy/deploy-games.sh` (on the server) pulls this repo, rsyncs each game into
  `storage/app/public/uploads/games/html5/<slug>/`, and runs `php artisan
  games:sync` to upsert the catalog rows. Deploy-safe: never touches vendor core.
- Open `onlygrins-games.code-workspace` in VSCode (multi-root: this repo + the
  OnlyGrins app for editing the `games:sync` command).

Nothing is built yet — this is the plan/scaffold stage.
