'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { assemblePage } = require('./assemble.cjs');
const args = process.argv.slice(2);
const preview = args.includes('--preview');
function option(name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith('--'))
    throw new Error(`${name} needs a value`);
  return args[index + 1];
}
const port = Number(option('--port', preview ? 4173 : 5173));
const host = option('--host', '127.0.0.1');
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid --port');
const built = path.join(__dirname, '..', 'dist', 'index.html');
if (preview && !fs.existsSync(built)) throw new Error('Run npm run build before npm run preview.');
const server = http.createServer((request, response) => {
  let url;
  try {
    url = new URL(request.url, 'http://localhost');
  } catch {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Bad request');
    return;
  }
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end();
    return;
  }
  if (!['/', '/index.html'].includes(url.pathname)) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  try {
    const html = preview ? fs.readFileSync(built) : assemblePage();
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': Buffer.byteLength(html),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(request.method === 'HEAD' ? undefined : html);
  } catch (error) {
    console.error(error);
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Build failed. See the development server console.');
  }
});
server.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
server.listen(port, host, () => {
  console.log(`${preview ? 'Preview' : 'Development'}: http://${host}:${server.address().port}`);
  if (!preview) console.log('Source changes appear on reload. Press Ctrl+C to stop.');
});
