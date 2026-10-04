import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unitPriceOf, formatUnitPrice } from '../public/js/utils/unitPrice.js';

test('unitPriceOf reads the first number and unit of the size', () => {
  assert.deepEqual(unitPriceOf(2, '500 g'), { unitPrice: 4, standardUnit: 'kg' });
  assert.deepEqual(unitPriceOf(3, '2 kg'), { unitPrice: 1.5, standardUnit: 'kg' });
  assert.deepEqual(unitPriceOf(1, '250 ml'), { unitPrice: 4, standardUnit: 'liter' });
  assert.deepEqual(unitPriceOf(1.5, '75 cl'), { unitPrice: 2, standardUnit: 'liter' });
  assert.deepEqual(unitPriceOf(3, '1.5l'), { unitPrice: 2, standardUnit: 'liter' });
  assert.deepEqual(unitPriceOf(3, '1 kg (ca. 10 stuks)'), { unitPrice: 3, standardUnit: 'kg' });
});

test('unitPriceOf takes a decimal comma and any case', () => {
  assert.deepEqual(unitPriceOf(3, '1,5 L'), { unitPrice: 2, standardUnit: 'liter' });
});

test('unitPriceOf folds plurals of stuks and rollen', () => {
  assert.deepEqual(unitPriceOf(3, '6 stuks'), { unitPrice: 0.5, standardUnit: 'stuk' });
  assert.deepEqual(unitPriceOf(3, '1 stuk'), { unitPrice: 3, standardUnit: 'stuk' });
  assert.deepEqual(unitPriceOf(4, '8 rollen'), { unitPrice: 0.5, standardUnit: 'rol' });
});

/** Size string in, display text out; '—' for null, as a caller would. */
function shown(price: number | null | undefined, salesUnitSize: string | null | undefined): string {
  const pricePerUnit = unitPriceOf(price, salesUnitSize);
  return pricePerUnit ? formatUnitPrice(pricePerUnit) : '—';
}

test('unitPriceOf and formatUnitPrice: a size string in, nl-NL text out', () => {
  assert.deepEqual(unitPriceOf(3, '1,5 l'), { unitPrice: 2, standardUnit: 'liter' });
  // Intl puts a no-break space after the euro sign
  assert.equal(shown(2, '500 g'), '€\u00a04,00 / kg');
  assert.equal(shown(1.23, '1 kg (ca. 10 stuks)'), '€\u00a01,23 / kg');
  assert.equal(shown(0.99, '330 ml'), '€\u00a03,00 / liter');
  assert.equal(shown(3, '6 stuks'), '€\u00a00,50 / stuk');
  assert.equal(shown(4, '8 rollen'), '€\u00a00,50 / rol');
  assert.equal(shown(1234.5, '1 kg'), '€\u00a01.234,50 / kg');
});

test('unitPriceOf counts a size that does not parse as one stuk', () => {
  assert.equal(shown(2.49, 'per bos'), '€\u00a02,49 / stuk');
  assert.equal(shown(2.49, ''), '€\u00a02,49 / stuk');
  assert.equal(shown(2.49, null), '€\u00a02,49 / stuk');
  assert.equal(shown(2.49, undefined), '€\u00a02,49 / stuk');
});

test('unitPriceOf is null without a price', () => {
  assert.equal(unitPriceOf(null, '500 g'), null);
  assert.equal(unitPriceOf(undefined, '500 g'), null);
  assert.equal(shown(null, 'per bos'), '—');
});

test('unitPriceOf is null for a size with a zero or unreadable number', () => {
  assert.equal(unitPriceOf(2, '0 g'), null);
  assert.equal(unitPriceOf(2, '0,0 kg'), null);
  assert.equal(unitPriceOf(2, '. ml'), null);
  assert.equal(shown(2, '0 g'), '—');
});
