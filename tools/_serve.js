/*
 * _serve.js — tiny zero-dependency static file server for the dev loop.
 * Used by tools/dev-serve.sh when Node is available (no npm install needed).
 *
 *   node tools/_serve.js [port] [rootDir]
 *
 * Sends Last-Modified + no-store so arcade-host.html's auto-reload (a HEAD
 * poll on the game's index.html) reliably detects saves.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const port = parseInt(process.argv[2], 10) || 8765;
const root = path.resolve(process.argv[3] || process.cwd());

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
  '.wav': 'audio/wav', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

const server = http.createServer((req, res) => {
  let urlPath;
  try { urlPath = decodeURIComponent(req.url.split('?')[0]); } catch { urlPath = req.url.split('?')[0]; }
  if (urlPath === '/') urlPath = '/index.html';

  // resolve safely inside root (no path traversal)
  const filePath = path.join(root, path.normalize(urlPath));
  if (!filePath.startsWith(root)) { res.writeHead(403); res.end('forbidden'); return; }

  fs.stat(filePath, (err, st) => {
    let target = filePath, stat = st;
    if (!err && st.isDirectory()) { target = path.join(filePath, 'index.html'); stat = null; }

    const send = (p, s) => {
      const type = TYPES[path.extname(p).toLowerCase()] || 'application/octet-stream';
      const headers = {
        'Content-Type': type,
        'Cache-Control': 'no-store, max-age=0',
        'Last-Modified': s.mtime.toUTCString(),
      };
      if (req.method === 'HEAD') { res.writeHead(200, headers); res.end(); return; }
      res.writeHead(200, headers);
      fs.createReadStream(p).pipe(res);
    };

    if (stat && stat.isFile()) return send(target, stat);
    fs.stat(target, (e2, s2) => {
      if (e2 || !s2.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('404 not found: ' + urlPath); return; }
      send(target, s2);
    });
  });
});

server.listen(port, () => {
  console.log('  static server (node) on http://localhost:' + port + '/  root=' + root);
});
