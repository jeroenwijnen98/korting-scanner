import type { StoreAdapter } from '../stores/base.ts';
import type { BonusOverview, BonusProduct, SavedProduct, StoreName } from '../types.ts';
import { errorMessage } from '../../public/js/utils/errorMessage.js';
import * as priceHistory from './priceHistory.ts';
import * as productStore from './productStore.ts';

/**
 * The price check: loads the saved products, observes them store by store and
 * records a price snapshot for each one observed, on bonus or not, so a
 * regular price shows up again once a bonus ends. The overview lists only
 * those on bonus (`isBonus`, the store adapter's verdict), each with its saved product's
 * view (`productGroup`); a paused saved product is observed and snapshotted
 * like any other but left out of the overview. A saved product whose observed
 * image differs takes the new `imageUrl`: stores replace images and the old
 * URL stops working. A store whose check throws does not sink the others: its
 * saved products go to `notFound`.
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
      await syncImages(observed, storeProducts).catch((err) => {
        console.error(`Error syncing ${storeName} images:`, errorMessage(err));
      });
      const pausedIds = new Set(storeProducts.filter(p => p.paused).map(p => p.id));
      const bonusProducts = observed.filter(product =>
        product.isBonus && !pausedIds.has(product.savedId),
      );
      overview.bonusProducts.push(...productStore.withSavedProductView(bonusProducts, storeProducts));
      overview.notFound.push(...notFound);
    } catch (err) {
      console.error(`Error checking ${storeName}:`, errorMessage(err));
      overview.notFound.push(...storeProducts.map(p => p.id));
    }
  }
  return overview;
}

async function syncImages(observed: BonusProduct[], saved: SavedProduct[]): Promise<void> {
  const savedImages = new Map(saved.map(p => [p.id, p.imageUrl]));
  const updates = observed
    .filter(p => p.imageUrl && p.imageUrl !== savedImages.get(p.savedId))
    .map(p => ({ id: p.savedId, fields: { imageUrl: p.imageUrl! } }));
  if (updates.length > 0) await productStore.bulkUpdate(updates);
}
