import type { StoreAdapter } from '../stores/base.ts';
import type { BonusOverview, StoreName } from '../types.ts';
import { errorMessage } from '../../public/js/utils/errorMessage.js';
import * as priceHistory from './priceHistory.ts';
import * as productStore from './productStore.ts';

/**
 * The price check: loads the saved products, observes them store by store and
 * records a price snapshot for each one observed, on bonus or not, so a
 * regular price shows up again once a bonus ends. The overview lists only
 * those the store adapter counts as a bonus, each with its saved product's
 * view (`productGroup`); a paused saved product is observed and snapshotted
 * like any other but left out of the overview. A store whose check throws does not sink the others:
 * its saved products go to `notFound`.
 */
export async function checkSavedProducts(
  stores: Partial<Record<StoreName, StoreAdapter>>,
): Promise<BonusOverview> {
  const saved = await productStore.getAll();
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
      const pausedIds = new Set(storeProducts.filter(p => p.paused).map(p => p.id));
      const bonusProducts = observed.filter(product =>
        adapter.countsAsBonus(product) && !pausedIds.has(product.savedId));
      overview.bonusProducts.push(...productStore.withSavedProductView(bonusProducts, storeProducts));
      overview.notFound.push(...notFound);
    } catch (err) {
      console.error(`Error checking ${storeName}:`, errorMessage(err));
      overview.notFound.push(...storeProducts.map(p => p.id));
    }
  }
  return overview;
}
