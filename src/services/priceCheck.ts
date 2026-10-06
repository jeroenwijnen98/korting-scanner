import type { StoreAdapter } from '../stores/base.ts';
import type { BonusOverview, StoreName } from '../types.ts';
import { observeSavedProducts } from './priceObservation.ts';
import * as productStore from './productStore.ts';

/**
 * The price check: loads the saved products and observes them (with the
 * snapshots and image sync that come with it). The overview lists only those
 * on bonus (`isBonus`, the store adapter's verdict), each with its saved
 * product's view (`productGroup`); a paused saved product is observed like
 * any other but left out of the overview.
 */
export async function checkSavedProducts(
  stores: Partial<Record<StoreName, StoreAdapter>>,
): Promise<BonusOverview> {
  const saved = await productStore.getAll();
  const { observed, notFound } = await observeSavedProducts(stores, saved);
  const pausedIds = new Set(saved.filter(p => p.paused).map(p => p.id));
  const bonusProducts = observed.filter(product => product.isBonus && !pausedIds.has(product.savedId));
  return { bonusProducts: productStore.withSavedProductView(bonusProducts, saved), notFound };
}
