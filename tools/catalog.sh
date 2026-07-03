#!/usr/bin/env bash
#
# catalog.sh — print the game catalog grouped by category.
#
#   bash tools/catalog.sh          # grouped table, one line per game
#   bash tools/catalog.sh --counts # just the per-category totals
#
# Reads each games/<slug>/game.json and groups by its `category` field, so it
# never goes stale — it's generated from the manifests the pipeline actually
# uses. Games without a game.json are listed separately as "no manifest yet".
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GAMES="$ROOT/games"

MODE="${1:-full}"

node -e '
  const fs = require("fs"), path = require("path");
  const dir = process.argv[1], mode = process.argv[2];
  const byCat = {}, noManifest = [];
  for (const g of fs.readdirSync(dir)) {
    const p = path.join(dir, g, "game.json");
    if (g === ".gitkeep") continue;
    if (!fs.existsSync(p)) { if (fs.statSync(path.join(dir, g)).isDirectory()) noManifest.push(g); continue; }
    try {
      const m = JSON.parse(fs.readFileSync(p, "utf8"));
      const c = m.category || "(uncategorized)";
      (byCat[c] = byCat[c] || []).push(m.slug || g);
    } catch (e) { noManifest.push(g + "  (invalid game.json)"); }
  }
  const cats = Object.keys(byCat).sort();
  const total = cats.reduce((n, c) => n + byCat[c].length, 0);

  if (mode === "--counts") {
    console.log("Games by category (" + total + " total, " + cats.length + " categories):\n");
    for (const c of cats) console.log("  " + c.padEnd(12) + byCat[c].length);
  } else {
    console.log("OnlyGrins catalog — " + total + " games across " + cats.length + " categories\n");
    for (const c of cats) {
      console.log("[" + c + "]  (" + byCat[c].length + ")");
      byCat[c].sort().forEach(s => console.log("   " + s));
      console.log("");
    }
  }
  if (noManifest.length) {
    console.log("No game.json yet (category undeclared):");
    noManifest.sort().forEach(g => console.log("   " + g));
  }
' "$GAMES" "$MODE"
