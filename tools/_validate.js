/*
 * _validate.js — validates every games/<slug>/game.json against the manifest
 * rules. Used by tools/validate.sh (preferred runtime: Node).
 *
 *   node tools/_validate.js [gamesDir]
 *
 * Exit 0 = all good, 1 = at least one error. Warnings don't fail.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const gamesDir = path.resolve(process.argv[2] || 'games');

const REQUIRED = ['slug', 'title', 'category', 'short_description', 'game_type', 'entry', 'import_id'];
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

let errors = 0, warnings = 0, games = 0;
const seenSlug = new Map(), seenImport = new Map();

function err(slug, msg) { console.error(`  ✗ [${slug}] ${msg}`); errors++; }
function warn(slug, msg) { console.warn(`  ! [${slug}] ${msg}`); warnings++; }

if (!fs.existsSync(gamesDir)) {
  console.error(`games dir not found: ${gamesDir}`);
  process.exit(1);
}

const entries = fs.readdirSync(gamesDir, { withFileTypes: true })
  .filter(d => d.isDirectory() && !d.name.startsWith('.'));

for (const dir of entries) {
  const slug = dir.name;
  const folder = path.join(gamesDir, slug);
  const manifestPath = path.join(folder, 'game.json');
  games++;

  if (!fs.existsSync(manifestPath)) { err(slug, 'missing game.json'); continue; }

  let m;
  try { m = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); }
  catch (e) { err(slug, 'game.json is not valid JSON: ' + e.message); continue; }

  // required fields
  for (const f of REQUIRED) {
    if (m[f] === undefined || m[f] === null || m[f] === '') err(slug, `missing required field "${f}"`);
  }

  // slug identity == folder name
  if (m.slug && m.slug !== slug) err(slug, `slug "${m.slug}" must match folder name "${slug}"`);
  if (m.slug && !SLUG_RE.test(m.slug)) err(slug, `slug "${m.slug}" must be kebab-case [a-z0-9-]`);

  // game_type
  if (m.game_type && m.game_type !== 'html5') err(slug, `game_type must be "html5" (got "${m.game_type}")`);

  // import_id convention — this pipeline only owns edu:* rows
  if (m.import_id && !String(m.import_id).startsWith('edu:')) err(slug, `import_id must start with "edu:" (got "${m.import_id}")`);

  // entry file must exist
  const entry = m.entry || 'index.html';
  if (!fs.existsSync(path.join(folder, entry))) err(slug, `entry file "${entry}" not found in folder`);

  // category should be a slug too
  if (m.category && !SLUG_RE.test(m.category)) warn(slug, `category "${m.category}" is not kebab-case`);

  // dimensions sane
  for (const dim of ['width', 'height']) {
    if (m[dim] !== undefined && (typeof m[dim] !== 'number' || m[dim] <= 0)) err(slug, `${dim} must be a positive number`);
  }

  // booleans
  for (const b of ['is_mobile_compatible', 'api_enabled', 'is_active', 'is_featured']) {
    if (m[b] !== undefined && typeof m[b] !== 'boolean') err(slug, `${b} must be true/false`);
  }

  // thumbnail (optional) — warn if referenced but missing, or if none at all
  if (m.thumbnail) {
    if (!fs.existsSync(path.join(folder, m.thumbnail))) warn(slug, `thumbnail "${m.thumbnail}" not found`);
  } else if (!fs.existsSync(path.join(folder, 'thumbnail.png')) && !fs.existsSync(path.join(folder, 'thumbnail.svg'))) {
    warn(slug, 'no thumbnail (catalog art); platform tolerates null');
  }

  // uniqueness
  if (m.slug) {
    if (seenSlug.has(m.slug)) err(slug, `duplicate slug, also in "${seenSlug.get(m.slug)}"`);
    else seenSlug.set(m.slug, slug);
  }
  if (m.import_id) {
    if (seenImport.has(m.import_id)) err(slug, `duplicate import_id, also in "${seenImport.get(m.import_id)}"`);
    else seenImport.set(m.import_id, slug);
  }

  if (errors === 0) console.log(`  ✓ ${slug}`);
}

console.log(`\n${games} game(s) checked — ${errors} error(s), ${warnings} warning(s).`);
process.exit(errors ? 1 : 0);
