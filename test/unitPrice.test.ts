import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUnitSize, calcPricePerUnit } from '../public/js/utils/unitPrice.js';

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

test('parseUnitSize feeds calcPricePerUnit', () => {
  const { volume, unit } = parseUnitSize('1,5 l');
  assert.deepEqual(calcPricePerUnit(3, volume, unit), { unitPrice: 2, standardUnit: 'liter' });
});
