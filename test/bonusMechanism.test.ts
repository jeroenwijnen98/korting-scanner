import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBonusMechanism } from '../src/stores/bonusMechanism.ts';

const cases: [label: string | null, priceBeforeBonus: number | null, expected: number | null][] = [
  // Every form in CLAUDE.md
  ['2e gratis', 3, 1.5],
  ['1 + 1 gratis', 3, 1.5],
  ['2 + 2 gratis', 3, 1.5],
  ['2 + 1 gratis', 3, 2],
  ['2e halve prijs', 4, 3],
  ['25%', 4, 3],
  ['40% korting', 10, 6],
  ['2 voor 3 euro', 5, 1.5],
  ['voor 16.99', 20, 16.99],
  ['voor 16,99', 20, 16.99],
  // The loose forms
  ['1+1 gratis', 3, 1.5],
  ['2+1 GRATIS', 3, 2],
  ['2 +2 gratis', 3, 1.5],
  ['3 voor 5', 2, 5 / 3],
  ['2 voor 4,50', 3, 2.25],
  ['VOOR 16.99', 20, 16.99],
  ['2E HALVE PRIJS', 4, 3],
  // Any "X + Y gratis" (pay X of X + Y) and "Ne gratis" (pay N - 1 of N)
  ['2 + 3 gratis', 5, 2],
  ['2+3 GRATIS', 5, 2],
  ['3 + 1 gratis', 4, 3],
  ['1 + 2 gratis', 3, 1],
  ['3e gratis', 3, 2],
  ['2 + 3 gratis', null, null],
  // "Ne (product|artikel) ...": the Nth item cheaper, price per item over N
  ['2e product voor 1.00', 19.99, 10.495],
  ['2E PRODUCT VOOR 1,00', 20, 10.5],
  ['2e product voor € 1.00', 20, 10.5],
  ['3e product voor 1.00', 4, 3],
  ['2e artikel halve prijs', 4, 3],
  ['3e halve prijs', 6, 5],
  ['2e artikel gratis', 3, 1.5],
  ['2e product voor 1.00', null, null],
  // Mechanisms that need a regular price but have none
  ['1 + 1 gratis', null, null],
  ['25%', null, null],
  ['2e halve prijs', null, null],
  // A bundle or fixed price does not need one
  ['2 voor 3 euro', null, 1.5],
  ['voor 2', null, 2],
  // Unknown labels
  ['OP=OP', 3, null],
  ['gratis bezorging', 3, null],
  ['', 3, null],
  [null, 3, null],
];

for (const [label, price, expected] of cases) {
  test(`parseBonusMechanism(${JSON.stringify(label)}, ${price}) → ${expected}`, () => {
    const actual = parseBonusMechanism(label, price);
    if (expected === null) {
      assert.equal(actual, null);
    } else {
      assert.ok(actual !== null && Math.abs(actual - expected) < 1e-9, `got ${actual}`);
    }
  });
}
