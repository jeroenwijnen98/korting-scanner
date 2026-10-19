import type { StoreAdapter } from '../stores/base.ts';
import type { BonusProduct, ObservationResult, Product, SavedProduct, StoreName } from '../types.ts';
import { errorMessage } from '../../public/js/utils/errorMessage.js';
import * as priceHistory from './priceHistory.ts';
import * as productStore from './productStore.ts';

/**
 * The one place a saved product is observed. Groups the saved products by
 * store and hands each group to its store adapter's `observe` (so Dirk
 * batches). Every observed product, on bonus or not, gets a price snapshot,
 * so a regular price shows up again once a bonus ends. A saved product whose
 * observed image is changed or missing takes the observed `imageUrl`: stores
 * replace images and the old URL stops working. A store whose observation
 * throws does not sink the others: only its saved products go to `unreachable`.
 * A failing snapshot or image sync is logged and keeps the observation.
 */
export async function observeSavedProducts(
  stores: Partial<Record<StoreName, StoreAdapter>>,
  savedProducts: SavedProduct[],
): Promise<ObservationResult> {
  const result: ObservationResult = { observed: [], notFound: [], unreachable: [] };
  for (const [storeName, adapter] of Object.entries(stores)) {
    const storeProducts = savedProducts.filter(p => p.store === storeName);
    if (!adapter || storeProducts.length === 0) continue;
    let observation: ObservationResult;
    try {
      observation = await adapter.observe(storeProducts);
    } catch (err) {
      console.error(`Error checking ${storeName}:`, errorMessage(err));
      result.unreachable.push(...storeProducts.map(p => p.id));
      continue;
    }
    const { observed, notFound, unreachable } = observation;
    await priceHistory.recordSnapshots(observed.map(product => ({
      productId: product.savedId,
      data: product,
    }))).catch((err) => {
      console.error(`Error recording ${storeName} snapshots:`, errorMessage(err));
    });
    await syncImages(observed, storeProducts).catch((err) => {
      console.error(`Error syncing ${storeName} images:`, errorMessage(err));
    });
    result.observed.push(...observed);
    result.notFound.push(...notFound);
    result.unreachable.push(...unreachable);
  }
  return result;
}

/** Gives each saved product the observed image when its own differs or is ''. */
async function syncImages(observed: BonusProduct[], saved: SavedProduct[]): Promise<void> {
  const savedImages = new Map(saved.map(p => [p.id, p.imageUrl]));
  const updates = observed.flatMap(p =>
    p.imageUrl && p.imageUrl !== savedImages.get(p.savedId)
      ? [{ id: p.savedId, fields: { imageUrl: p.imageUrl } }]
      : []);
  if (updates.length > 0) await productStore.bulkUpdate(updates);
}

/** An observed product as the store has it, without the saved id. */
export function withoutSavedId({ savedId: _, ...product }: BonusProduct): Product {
  return product;
}
