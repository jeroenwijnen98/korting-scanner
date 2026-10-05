// The shapes that cross a boundary (common product schema, saved product,
// price snapshot) live here, for the server and the page alike. The server
// imports them with `import type`; the page reaches them through JSDoc
// `import('../../src/types.ts')`. Types only: nothing here survives stripping.

import type { STORES } from '../public/js/utils/stores.js';

/**
 * A key of the store catalogue (STORES); every one has a store adapter. Also
 * the prefix of a saved product id.
 */
export type StoreName = keyof typeof STORES;

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
  /**
   * The store adapter's verdict: the bonus counts, for the bonus overview and
   * everywhere else. False for a bonus the store flags but that does not
   * count (AH online-only); the product then reads as not on bonus.
   */
  isBonus: boolean;
  imageUrl: string | null;
  store: StoreName;
  /** AH only: sold online only, filtered out of search and never on bonus. */
  isOnlineOnly?: boolean;
}

/**
 * A product as a store adapter observed it for a saved product, on bonus or
 * not, tied to that saved product. The bonus overview holds only those on
 * bonus.
 */
export interface BonusProduct extends Product {
  savedId: string;
}

/**
 * What a store adapter's `observe` returns: every saved product it found, on
 * bonus or not, and the ids of those it could not find.
 */
export interface ObservationResult {
  observed: BonusProduct[];
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
  /**
   * Paused: still observed and snapshotted, but left out of the bonus
   * overview. Missing (or null/false) means not paused.
   */
  paused?: boolean | null;
}

/**
 * One entry of a product's price history (price-history.json, keyed by saved
 * product id). Appended only when currentPrice, isBonus or bonusMechanism
 * changes.
 */
export interface PriceSnapshot {
  /** YYYY-MM-DD. */
  date: string;
  currentPrice: number | null;
  priceBeforeBonus: number | null;
  isBonus: boolean;
  bonusMechanism: string;
}

/**
 * The saved product's own fields that ride along on each of its bonus products
 * in the bonus overview, joined on `savedId` by the saved-product store.
 */
export interface SavedProductView {
  productGroup: string | null;
}

/** A bonus product in the bonus overview, with its saved product's view. */
export interface OverviewProduct extends BonusProduct, SavedProductView {}

/** Every saved product on bonus, across stores. */
export interface BonusOverview {
  bonusProducts: OverviewProduct[];
  notFound: string[];
}

/**
 * What `GET /api/bonus` returns: the bonus overview and GROCER_URL, from which
 * the On sale view builds its Toevoegen links (none when it is null).
 */
export interface BonusAnswer extends BonusOverview {
  grocerUrl: string | null;
}

/** The unit a unit price is expressed per (see public/js/utils/unitPrice.js). */
export type StandardUnit = 'liter' | 'kg' | 'stuk' | 'rol';

/**
 * One day of `GET /api/group-history/:groupName`: the product in the group with
 * the lowest unit price on that date, per its most recent price snapshot.
 */
export interface GroupHistoryEntry {
  /** YYYY-MM-DD. */
  date: string;
  title: string;
  store: StoreName;
  salesUnitSize: string;
  currentPrice: number | null;
  priceBeforeBonus: number | null;
  isBonus: boolean;
  bonusMechanism: string;
  /**
   * The unit price of `currentPrice` for `salesUnitSize` (see unitPriceOf).
   * Always set: a snapshot without one never becomes an entry.
   */
  unitPrice: number;
  standardUnit: StandardUnit;
}
