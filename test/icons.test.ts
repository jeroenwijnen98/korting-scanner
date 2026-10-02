import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.ts';
import { useTempDataDir } from './tempDataDir.ts';

await useTempDataDir();

let server: Server;
let base: string;

before(async () => {
  server = createApp({ stores: {}, idleShutdown: { enabled: false } }).listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});

after(() => new Promise(resolve => server.close(resolve)));

test('the source app icon and its PNG are served from /assets', async () => {
  const svg = await fetch(`${base}/assets/icon.svg`);
  assert.equal(svg.status, 200);
  assert.match(svg.headers.get('content-type') ?? '', /^image\/svg\+xml/);
  assert.equal(await svg.text(), await readFile('assets/icon.svg', 'utf8'));

  const png = await fetch(`${base}/assets/icon.png`);
  assert.equal(png.status, 200);
  assert.equal(png.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await png.arrayBuffer()), await readFile('assets/icon.png'));
});

test('there is no separate favicon', async () => {
  // Spelled in parts so this file isn't itself a reference to it.
  const favicon = ['favicon', 'svg'].join('.');
  assert.equal((await fetch(`${base}/${favicon}`)).status, 404);
  const grep = spawnSync('git', ['grep', '-lF', favicon], { encoding: 'utf8' });
  assert.equal(grep.stdout, '', `still referenced in:\n${grep.stdout}`);
});

test('the page links the source icon, a PNG fallback and an apple-touch-icon', async () => {
  const html = await (await fetch(`${base}/`)).text();
  const head = html.slice(0, html.indexOf('</head>'));
  assert.ok(head.includes('<link rel="icon" href="/assets/icon.svg" type="image/svg+xml">'));
  assert.ok(head.includes('<link rel="icon" href="/assets/icon.png" type="image/png" sizes="512x512">'));
  assert.ok(head.includes('<link rel="apple-touch-icon" href="/assets/icon.png">'));
});

const has = (cmd: string) => spawnSync('sh', ['-c', `command -v ${cmd}`]).status === 0;
const canGenerate = (has('rsvg-convert') || existsSync('/usr/local/Caskroom/miniforge/base/bin/rsvg-convert')) && has('iconutil');

test('the committed icons match a fresh render of assets/icon.svg', { skip: !canGenerate && 'needs rsvg-convert and iconutil' }, async () => {
  const out = await mkdtemp(join(tmpdir(), 'korting-icons-'));
  try {
    execFileSync('scripts/generate-icons.sh', { env: { ...process.env, ICON_OUT_DIR: out }, stdio: 'pipe' });
    for (const file of ['assets/icon.png', 'assets/icon.icns', 'KortingScanner.app/Contents/Resources/icon.icns']) {
      assert.ok((await readFile(join(out, file))).equals(await readFile(file)), `${file} is stale; run scripts/generate-icons.sh`);
    }
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});
