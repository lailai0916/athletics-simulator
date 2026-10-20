'use strict';
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const net = require('node:net');
const { once } = require('node:events');

async function main() {
  const child = spawn(
    process.execPath,
    [path.join(__dirname, '..', 'scripts', 'serve.cjs'), '--port', '0'],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  let stderr = '';
  child.stderr.on('data', (data) => {
    stderr += data;
  });
  try {
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Server startup timed out')), 10000);
      let text = '';
      child.stdout.on('data', (data) => {
        text += data;
        const match = text.match(/http:\/\/127\.0\.0\.1:\d+/);
        if (match) {
          clearTimeout(timer);
          resolve(match[0]);
        }
      });
      child.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`Server exited ${code}: ${stderr}`));
      });
    });
    const page = await fetch(url);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /text\/html; charset=utf-8/);
    assert.match(await page.text(), /<title>Athletics Simulator<\/title>/);
    assert.equal((await fetch(url + '/index.html', { method: 'HEAD' })).status, 200);
    assert.equal((await fetch(url + '/missing')).status, 404);
    assert.equal((await fetch(url, { method: 'POST' })).status, 405);
    const malformed = await new Promise((resolve, reject) => {
      const socket = net.connect(Number(new URL(url).port), '127.0.0.1');
      let response = '';
      socket.setTimeout(5000, () => socket.destroy(new Error('Malformed request timed out')));
      socket.on('connect', () =>
        socket.write('GET //[ HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n')
      );
      socket.on('data', (data) => {
        response += data;
      });
      socket.on('error', reject);
      socket.on('end', () => resolve(response));
    });
    assert.match(malformed, /^HTTP\/1\.1 400 /);
    assert.equal(
      (await fetch(url)).status,
      200,
      'Malformed requests must not terminate the server'
    );
    console.log('Server: GET/HEAD, 404/405, malformed target, and recovery passed.');
  } finally {
    child.kill();
    if (child.exitCode === null) await once(child, 'exit');
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
