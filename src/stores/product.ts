import type { Product } from '../types.ts';
import { bonusPrice } from './bonusMechanism.ts';

/** The product fields that do not depend on the price or the bonus. */
export type ProductFields = Omit<Product,
  'bonusMechanism' | 'priceBeforeBonus' | 'currentPrice' | 'bonusStartDate' | 'bonusEndDate' | 'isBonus'>;

/** A bonus as a store adapter found it in the raw response. */
export interface Bonus {
  /** The bonus mechanism label as the store shows it. */
  mechanism: string;
  /** The bonus price, when the store gives it; otherwise it is priced from the mechanism. */
  price?: number | null;
  startDate?: string | null;
  endDate?: string | null;
}

/**
 * The one way a store adapter builds its `Product`, so the bonus fields mean
 * the same in every store.
 *
 * Without a bonus: `currentPrice` is the normal price, `priceBeforeBonus` is
 * null, and the mechanism and dates are ''.
 *
 * With a bonus: `currentPrice` is the bonus price (the store's, else priced
 * from the mechanism, else the normal price) and `priceBeforeBonus` the normal
 * price, or null when the bonus price is no different from it.
 */
export function buildProduct(fields: ProductFields, normalPrice: number | null, bonus: Bonus | null): Product {
  if (!bonus) {
    return {
      ...fields,
      bonusMechanism: '',
      priceBeforeBonus: null,
      currentPrice: normalPrice,
      bonusStartDate: '',
      bonusEndDate: '',
      isBonus: false,
    };
  }
  const currentPrice = bonus.price ?? bonusPrice(bonus.mechanism, normalPrice) ?? normalPrice;
  return {
    ...fields,
    bonusMechanism: bonus.mechanism,
    priceBeforeBonus: currentPrice === normalPrice ? null : normalPrice,
    currentPrice,
    bonusStartDate: bonus.startDate || '',
    bonusEndDate: bonus.endDate || '',
    isBonus: true,
  };
}
