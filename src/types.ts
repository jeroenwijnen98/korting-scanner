// The shapes that cross a boundary (common product schema, saved product,
// price snapshot) live here, for the server and the page alike. The server
// imports them with `import type`; the page reaches them through JSDoc
// `import('../../src/types.ts')`. Types only: nothing here survives stripping.

/** Every store a store adapter exists for; also the prefix of a saved product id. */
export type StoreName = 'ah' | 'dirk' | 'kruidvat' | 'etos';

/** The common product schema every store adapter normalizes to. */
export interface Product {
  productId: string;
  title: string;
  salesUnitSize: string;
  /** Bonus mechanism label as the store shows it, '' when not on bonus. */
  bonusMechanism: string;
  priceBeforeBonus: number | null;
  currentPrice: number | null;
  bonusStartDate: string;
  bonusEndDate: string;
  mainCategory: string;
  subCategory: string;
  brand: string;
  isBonus: boolean;
  imageUrl: string | null;
  store: StoreName;
  /** AH only: sold online only, filtered out of search and bonus results. */
  isOnlineOnly?: boolean;
}

/** A product on bonus, as returned by a bonus check: tied to its saved product. */
export interface BonusProduct extends Product {
  savedId: string;
}

/** What `checkBonus` returns: the saved products on bonus, and the ids it could not find. */
export interface BonusCheckResult {
  results: BonusProduct[];
  notFound: string[];
}

/**
 * A saved product, as stored in products.json. Never carries price or bonus
 * state: that is fetched live.
 */
export interface SavedProduct {
  /** `{store}-{storeProductId}`, e.g. `ah-12345`. */
  id: string;
  store: StoreName;
  storeProductId: string;
  title: string;
  brand: string;
  salesUnitSize: string;
  mainCategory: string;
  subCategory: string;
  imageUrl: string;
  /** ISO timestamp. */
  addedAt: string;
  productGroup?: string | null;
}

/**
 * One entry of a product's price history (price-history.json, keyed by saved
 * product id). Appended only when currentPrice, isBonus or bonusMechanism changes.
 */
export interface PriceSnapshot {
  /** YYYY-MM-DD. */
  date: string;
  currentPrice: number | null;
  priceBeforeBonus: number | null;
  isBonus: boolean;
  bonusMechanism: string;
}
