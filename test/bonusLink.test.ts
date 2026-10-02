import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bonusLink, endsOn } from '../public/js/utils/bonusLink.js';
import type { OverviewProduct } from '../src/types.ts';

const GROCER = 'https://grocer.example.nl';
const AT = 1_790_000_000_000;

function bonus(overrides: Partial<OverviewProduct> = {}): OverviewProduct {
  return {
    savedId: 'kruidvat-2843021', productId: '2843021', title: 'Zwitsal Baby Shampoo', salesUnitSize: '400 ml',
    bonusMechanism: '1+1 gratis', priceBeforeBonus: 4.99, currentPrice: 2.5,
    bonusStartDate: '2026-09-22', bonusEndDate: '2026-10-05', mainCategory: '', subCategory: '',
    brand: 'Zwitsal', isBonus: true, imageUrl: null, store: 'kruidvat', productGroup: 'Zwitsal shampoo',
    ...overrides,
  };
}

function params(product: OverviewProduct): URLSearchParams {
  const link = bonusLink(product, { grocerUrl: GROCER, at: AT });
  assert.equal(link?.kind, 'add');
  return new URL(link!.url).searchParams;
}

test('a physical-store bonus gets an add link to grocer with every field', () => {
  assert.deepEqual(bonusLink(bonus(), { grocerUrl: GROCER, at: AT }), {
    kind: 'add',
    url: 'https://grocer.example.nl/add?name=Zwitsal%20shampoo&store=kruidvat&mechanism=1%2B1%20gratis'
      + '&endsOn=2026-10-05&storeTitle=Zwitsal%20Baby%20Shampoo&at=1790000000000',
  });
});

test('the add link is named after the product group, else the store title', () => {
  assert.equal(params(bonus()).get('name'), 'Zwitsal shampoo');
  assert.equal(params(bonus({ productGroup: null })).get('name'), 'Zwitsal Baby Shampoo');
  assert.equal(params(bonus({ productGroup: '' })).get('name'), 'Zwitsal Baby Shampoo');
});

test('every value is URL-encoded', () => {
  const link = bonusLink(bonus({
    productGroup: 'Thee & koffie', title: 'Pickwick "Earl Grey" 20 st/doos #1?', bonusMechanism: '2e halve prijs = 50%',
  }), { grocerUrl: GROCER, at: AT })!;
  const query = link.url.split('?')[1];
  assert.equal(query.split('&').length, 6);
  assert.doesNotMatch(query, /[ "#?/+]/);
  const p = new URL(link.url).searchParams;
  assert.equal(p.get('name'), 'Thee & koffie');
  assert.equal(p.get('storeTitle'), 'Pickwick "Earl Grey" 20 st/doos #1?');
  assert.equal(p.get('mechanism'), '2e halve prijs = 50%');
});

test('a trailing slash on GROCER_URL does not double up', () => {
  const link = bonusLink(bonus(), { grocerUrl: `${GROCER}/`, at: AT })!;
  assert.ok(link.url.startsWith('https://grocer.example.nl/add?'));
});

test('endsOn reads each adapter\'s end date shape as an Amsterdam calendar date', () => {
  // AH, Dirk and Kruidvat: a date.
  assert.equal(endsOn('2026-09-27'), '2026-09-27');
  // Trekpleister: a datetime with an offset, here and across midnight in Amsterdam.
  assert.equal(endsOn('2026-10-11T23:59:59+0200'), '2026-10-11');
  assert.equal(endsOn('2026-10-11T22:30:00Z'), '2026-10-12');
  assert.equal(endsOn('2026-10-11T23:59:59+02:00'), '2026-10-11');
  // A datetime without an offset is Amsterdam time already.
  assert.equal(endsOn('2026-10-11T23:59:59'), '2026-10-11');
  // bol: empty.
  assert.equal(endsOn(''), null);
  assert.equal(endsOn('nog onbekend'), null);
  assert.equal(endsOn('2026-13-45'), null);
});

test('endsOn is left out of the link when the end date is empty or unreadable', () => {
  for (const bonusEndDate of ['', 'nog onbekend']) {
    const p = params(bonus({ bonusEndDate }));
    assert.equal(p.has('endsOn'), false);
    assert.equal(p.get('at'), String(AT));
  }
  assert.equal(params(bonus({ store: 'trekpleister', bonusEndDate: '2026-10-11T23:59:59+0200' })).get('endsOn'), '2026-10-11');
});

test('at is passed through as given', () => {
  assert.equal(params(bonus()).get('at'), String(AT));
  assert.equal(new URL(bonusLink(bonus(), { grocerUrl: GROCER, at: 42 })!.url).searchParams.get('at'), '42');
});

test('a bol bonus gets a Bestel link to its product page, with or without GROCER_URL', () => {
  const bol = bonus({ store: 'bol', productId: '9300000238030673', bonusMechanism: 'Deal', bonusEndDate: '' });
  const expected = { kind: 'order', url: 'https://www.bol.com/nl/nl/p/x/9300000238030673/' };
  assert.deepEqual(bonusLink(bol, { grocerUrl: GROCER, at: AT }), expected);
  assert.deepEqual(bonusLink(bol, { grocerUrl: null, at: AT }), expected);
  assert.deepEqual(bonusLink(bol, { at: AT }), expected);
});

test('without GROCER_URL a physical-store bonus gets no link', () => {
  for (const store of ['ah', 'dirk', 'kruidvat', 'trekpleister'] as const) {
    assert.equal(bonusLink(bonus({ store }), { grocerUrl: null, at: AT }), null);
    assert.equal(bonusLink(bonus({ store }), { grocerUrl: '', at: AT }), null);
  }
});

test('a bonus without a mechanism gets nothing', () => {
  assert.equal(bonusLink(bonus({ bonusMechanism: '' }), { grocerUrl: GROCER, at: AT }), null);
  assert.equal(bonusLink(bonus({ store: 'bol', bonusMechanism: '' }), { grocerUrl: GROCER, at: AT }), null);
});

test('the link carries no secret', () => {
  const p = params(bonus());
  assert.deepEqual([...p.keys()], ['name', 'store', 'mechanism', 'endsOn', 'storeTitle', 'at']);
});
