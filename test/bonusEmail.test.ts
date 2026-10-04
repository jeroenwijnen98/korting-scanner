import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildHtml } from '../src/services/bonusEmail.ts';
import type { OverviewProduct } from '../src/types.ts';

const fixture: OverviewProduct[] = JSON.parse(
  await readFile(new URL('./fixtures/bonus-overview.json', import.meta.url), 'utf-8'));
const AT = 1_790_000_000_000;

function render(grocerUrl: string | null): string {
  return buildHtml(fixture, { appUrl: 'http://localhost:3001', today: '2 oktober 2026', grocerUrl, at: AT });
}

/** The [href, label] of every link in the bonus rows (not Open Dashboard). */
function rowLinks(html: string): [string, string][] {
  const rows = html.split('<tbody>').slice(1).join('');
  return [...rows.matchAll(/<a href="([^"]*)"[^>]*>([^<]*)<\/a>/g)].map(m => [m[1], m[2]]);
}

test('each physical-store row gets one Toevoegen link and bol gets Bestel', () => {
  const links = rowLinks(render('https://grocer.example.nl'));
  const toevoegen = links.filter(([, label]) => label === 'Toevoegen').map(([href]) => href);
  assert.equal(toevoegen.length, 4);
  for (const [i, store] of ['ah', 'dirk', 'kruidvat', 'trekpleister'].entries()) {
    assert.ok(toevoegen[i].startsWith('https://grocer.example.nl/add?'));
    assert.ok(toevoegen[i].includes(`&amp;store=${store}&amp;`), toevoegen[i]);
    assert.ok(toevoegen[i].endsWith(`&amp;at=${AT}`), 'one at for the whole email');
  }
  assert.ok(toevoegen[0].includes('name=Melk&amp;'));
  assert.ok(toevoegen[1].includes('name=Dirk%20Pindakaas&amp;'));
  assert.ok(toevoegen[3].includes('endsOn=2026-10-11&amp;'));
  assert.deepEqual(links.filter(([, label]) => label === 'Bestel'),
    [['https://www.bol.com/nl/nl/p/x/9300000238030673/', 'Bestel']]);
  assert.equal(links.length, 5);
});

test('without GROCER_URL there is no Toevoegen, but bol still gets Bestel', () => {
  const html = render(null);
  assert.doesNotMatch(html, /Toevoegen|\/add\?/);
  assert.deepEqual(rowLinks(html), [['https://www.bol.com/nl/nl/p/x/9300000238030673/', 'Bestel']]);
});

test('each row shows its unit price and normal unit price as € 1,23 / kg', () => {
  const rows = render(null).split('<tbody>').slice(1).join('');
  const cells = [...rows.matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map(m => m[1]);
  // € and the amount are split by a no-break space (Intl, nl-NL)
  for (const text of ['€\u00a00,97 / liter', '€\u00a01,29 / liter',
    '€\u00a03,57 / kg', '€\u00a07,11 / kg', '€\u00a06,25 / liter', '€\u00a020,00 / liter',
    '€\u00a099,99 / stuk', '€\u00a0129,99 / stuk']) {
    assert.ok(cells.includes(text), text);
  }
});
