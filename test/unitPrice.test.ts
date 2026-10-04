import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUnitSize, calcPricePerUnit, unitPriceOf, formatUnitPrice } from '../public/js/utils/unitPrice.js';

test('parseUnitSize reads number and unit', () => {
  assert.deepEqual(parseUnitSize('500 g'), { volume: 500, unit: 'g' });
  assert.deepEqual(parseUnitSize('1 kg'), { volume: 1, unit: 'kg' });
  assert.deepEqual(parseUnitSize('330 ml'), { volume: 330, unit: 'ml' });
  assert.deepEqual(parseUnitSize('75 cl'), { volume: 75, unit: 'cl' });
  assert.deepEqual(parseUnitSize('1.5l'), { volume: 1.5, unit: 'l' });
  assert.deepEqual(parseUnitSize('1 kg (ca. 10 stuks)'), { volume: 1, unit: 'kg' });
});

test('parseUnitSize takes a decimal comma', () => {
  assert.deepEqual(parseUnitSize('1,5 L'), { volume: 1.5, unit: 'l' });
});

test('parseUnitSize folds plurals of stuks and rollen', () => {
  assert.deepEqual(parseUnitSize('6 stuks'), { volume: 6, unit: 'stuk' });
  assert.deepEqual(parseUnitSize('1 stuk'), { volume: 1, unit: 'stuk' });
  assert.deepEqual(parseUnitSize('8 rollen'), { volume: 8, unit: 'rol' });
});

test('parseUnitSize falls back to one piece on an empty or unknown size', () => {
  assert.deepEqual(parseUnitSize(''), { volume: 1, unit: 'stuk' });
  assert.deepEqual(parseUnitSize(null), { volume: 1, unit: 'stuk' });
  assert.deepEqual(parseUnitSize(undefined), { volume: 1, unit: 'stuk' });
  assert.deepEqual(parseUnitSize('per bos'), { volume: 1, unit: 'stuk' });
});

test('calcPricePerUnit per standard unit', () => {
  assert.deepEqual(calcPricePerUnit(2, 500, 'g'), { unitPrice: 4, standardUnit: 'kg' });
  assert.deepEqual(calcPricePerUnit(3, 2, 'kg'), { unitPrice: 1.5, standardUnit: 'kg' });
  assert.deepEqual(calcPricePerUnit(1, 250, 'ml'), { unitPrice: 4, standardUnit: 'liter' });
  assert.deepEqual(calcPricePerUnit(1.5, 75, 'cl'), { unitPrice: 2, standardUnit: 'liter' });
  assert.deepEqual(calcPricePerUnit(3, 1.5, 'l'), { unitPrice: 2, standardUnit: 'liter' });
  assert.deepEqual(calcPricePerUnit(3, 6, 'stuk'), { unitPrice: 0.5, standardUnit: 'stuk' });
  assert.deepEqual(calcPricePerUnit(4, 8, 'rol'), { unitPrice: 0.5, standardUnit: 'rol' });
});

test('calcPricePerUnit is null without a price, volume or known unit', () => {
  assert.equal(calcPricePerUnit(null, 500, 'g'), null);
  assert.equal(calcPricePerUnit(undefined, 500, 'g'), null);
  assert.equal(calcPricePerUnit(2, 0, 'g'), null);
  assert.equal(calcPricePerUnit(2, -1, 'g'), null);
  assert.equal(calcPricePerUnit(2, 1, 'doos'), null);
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
