import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { STORES, type StoreInfo } from '../public/js/utils/stores.js';
import { stores } from '../src/stores/index.ts';
import { storeBadge } from '../public/js/components/storeBadge.js';

async function css(name: string): Promise<string> {
  return readFile(new URL(`../public/css/${name}`, import.meta.url), 'utf-8');
}

test('the store catalogue lists the stores in pill order, each with a store adapter', () => {
  assert.deepEqual(Object.keys(STORES), ['ah', 'dirk', 'kruidvat', 'trekpleister', 'bol']);
  assert.deepEqual(Object.keys(stores).sort(), Object.keys(STORES).sort());
  for (const [key, adapter] of Object.entries(stores)) assert.equal(adapter.name, key);
});

test('every catalogue entry has a label, a name and a hex colour', () => {
  for (const info of Object.values(STORES)) {
    assert.ok(info.label);
    assert.ok(info.name);
    assert.match(info.color, /^#[0-9A-Fa-f]{6}$/);
  }
});

test('a store badge takes its label and colour from the catalogue', () => {
  assert.equal(storeBadge('ah'), '<span class="badge-store" style="--store-color: #00A0E2">AH</span>');
  assert.equal(storeBadge('kruidvat'), '<span class="badge-store" style="--store-color: #FF5500">KRUIDVAT</span>');
});

test('a badge for a store outside the catalogue shows the key, uncoloured', () => {
  assert.equal(storeBadge('nope' as any), '<span class="badge-store">NOPE</span>');
});

test('the CSS has no per-store badge classes or colour variables left', async () => {
  const all = (await css('variables.css')) + (await css('components.css'));
  assert.doesNotMatch(all, /\.badge-store-/);
  assert.doesNotMatch(all, /--store-(?!color\b)/);
  assert.match(await css('components.css'), /\.badge-store \{[^}]*color: var\(--store-color\)/);
});

test('only bol is an online store, and every online store makes a product page URL', () => {
  const entries: [string, StoreInfo][] = Object.entries(STORES);
  const online = entries.filter(([, info]) => info.online);
  assert.deepEqual(online.map(([key]) => key), ['bol']);
  for (const [key, info] of online) {
    assert.ok(info.productUrl, `${key} has no productUrl`);
    assert.match(info.productUrl('123'), /^https:\/\/[^ ]*123/);
  }
  assert.equal(STORES.bol.productUrl('9300000238030673'), 'https://www.bol.com/nl/nl/p/x/9300000238030673/');
});
