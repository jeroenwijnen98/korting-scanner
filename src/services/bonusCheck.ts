import type { StoreAdapter } from '../stores/base.ts';
import type { BonusOverview, SavedProduct, StoreName } from '../types.ts';
import { errorMessage } from '../../public/js/utils/errorMessage.js';
import * as priceHistory from './priceHistory.ts';

/**
 * Observes every saved product, store by store, and records a price snapshot
 * for each one observed, on bonus or not, so a regular price shows up again
 * once a bonus ends. The overview lists only those the store adapter counts
 * as a bonus. A store whose check throws does not sink the others: its saved
 * products go to `notFound`.
 */
export async function checkAllBonuses(
  saved: SavedProduct[],
  stores: Partial<Record<StoreName, StoreAdapter>>,
): Promise<BonusOverview> {
  const overview: BonusOverview = { bonusProducts: [], notFound: [] };
  for (const [storeName, adapter] of Object.entries(stores)) {
    const storeProducts = saved.filter(p => p.store === storeName);
    if (!adapter || storeProducts.length === 0) continue;
    try {
      const { observed, notFound } = await adapter.observe(storeProducts);
      await priceHistory.recordSnapshots(observed.map(product => ({
        productId: product.savedId,
        data: product,
      }))).catch((err) => {
        console.error(`Error recording ${storeName} snapshots:`, errorMessage(err));
      });
      overview.bonusProducts.push(...observed.filter(product => adapter.countsAsBonus(product)));
      overview.notFound.push(...notFound);
    } catch (err) {
      console.error(`Error checking ${storeName}:`, errorMessage(err));
      overview.notFound.push(...storeProducts.map(p => p.id));
    }
  }
  return overview;
}
