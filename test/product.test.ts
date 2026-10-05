import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProduct, type Bonus, type ProductFields } from '../src/stores/product.ts';
import type { Product } from '../src/types.ts';

const fields: ProductFields = {
  productId: '1', title: 'Tandpasta', salesUnitSize: '75 ml', mainCategory: '', subCategory: '',
  brand: '', imageUrl: null, store: 'kruidvat',
};

const dates = { startDate: '2026-09-22', endDate: '2026-10-05' };

const cases: [name: string, normalPrice: number | null, bonus: Bonus | null, expected: Partial<Product>][] = [
  ['no bonus: before price null, mechanism and dates empty', 2.49, null,
    { isBonus: false, bonusMechanism: '', currentPrice: 2.49, priceBeforeBonus: null, bonusStartDate: '', bonusEndDate: '' }],
  ['no bonus and no price', null, null,
    { isBonus: false, currentPrice: null, priceBeforeBonus: null }],
  ['a bonus with a store-given price, over the mechanism', 2.49, { mechanism: '1+1 gratis', price: 1.79, ...dates },
    { isBonus: true, bonusMechanism: '1+1 gratis', currentPrice: 1.79, priceBeforeBonus: 2.49, bonusStartDate: '2026-09-22', bonusEndDate: '2026-10-05' }],
  ['a bonus priced from the mechanism', 2.49, { mechanism: '1+1 gratis', ...dates },
    { isBonus: true, bonusMechanism: '1+1 gratis', currentPrice: 1.25, priceBeforeBonus: 2.49, bonusStartDate: '2026-09-22', bonusEndDate: '2026-10-05' }],
  ['a store-given price of null is priced from the mechanism', 2.49, { mechanism: '25%', price: null },
    { isBonus: true, currentPrice: 1.87, priceBeforeBonus: 2.49 }],
  ['a mechanism that yields no price falls back to the normal price, with no before price', 2.49, { mechanism: 'Extra voordeel' },
    { isBonus: true, bonusMechanism: 'Extra voordeel', currentPrice: 2.49, priceBeforeBonus: null, bonusStartDate: '', bonusEndDate: '' }],
  ['a bonus price without a normal price', null, { mechanism: 'deal', price: 64.95 },
    { isBonus: true, currentPrice: 64.95, priceBeforeBonus: null }],
  ['a bonus without dates has empty dates', 2.49, { mechanism: '25%', startDate: null, endDate: undefined },
    { bonusStartDate: '', bonusEndDate: '' }],
];

for (const [name, normalPrice, bonus, expected] of cases) {
  test(`buildProduct: ${name}`, () => {
    const product = buildProduct(fields, normalPrice, bonus);
    const actual = Object.fromEntries(Object.keys(expected).map(k => [k, product[k as keyof Product]]));
    assert.deepEqual(actual, expected);
  });
}

test('buildProduct: keeps the store-independent fields', () => {
  const product = buildProduct({ ...fields, store: 'ah', isOnlineOnly: true }, 2.49, null);
  assert.equal(product.title, 'Tandpasta');
  assert.equal(product.store, 'ah');
  assert.equal(product.isOnlineOnly, true);
});
