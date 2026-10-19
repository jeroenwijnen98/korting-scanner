import type { StoreAdapter } from '../stores/base.ts';
import type { BonusProduct, CheckStatus, CheckSummary, Product, SavedProduct, StoreName } from '../types.ts';
import { errorMessage } from '../../public/js/utils/errorMessage.js';
import * as priceHistory from './priceHistory.ts';
import * as productStore from './productStore.ts';

/**
 * The one place a saved product is observed. Groups the saved products by
 * store and hands each group to its store adapter's `observe` (so Dirk
 * batches). Answers exactly one check status per saved product, in the order
 * asked. Every observed product, on bonus or not, gets a price snapshot, so a
 * regular price shows up again once a bonus ends. A saved product whose
 * observed image is changed or missing takes the observed `imageUrl`: stores
 * replace images and the old URL stops working. A store whose observation
 * throws does not sink the others: only its saved products are store down,
 * as is a saved product without a store adapter or that its store adapter
 * did not answer for. A failing snapshot or image sync is logged and keeps
 * the observation.
 */
export async function observeSavedProducts(
  stores: Partial<Record<StoreName, StoreAdapter>>,
  savedProducts: SavedProduct[],
): Promise<CheckStatus[]> {
  const answered = new Map<string, CheckStatus>();
  for (const [storeName, adapter] of Object.entries(stores)) {
    const storeProducts = savedProducts.filter(p => p.store === storeName);
    if (!adapter || storeProducts.length === 0) continue;
    let statuses: CheckStatus[];
    try {
      statuses = await adapter.observe(storeProducts);
    } catch (err) {
      console.error(`Error checking ${storeName}:`, errorMessage(err));
      continue;
    }
    const observed = observedProducts(statuses);
    await priceHistory.recordSnapshots(observed.map(product => ({
      productId: product.savedId,
      data: product,
    }))).catch((err) => {
      console.error(`Error recording ${storeName} snapshots:`, errorMessage(err));
    });
    await syncImages(observed, storeProducts).catch((err) => {
      console.error(`Error syncing ${storeName} images:`, errorMessage(err));
    });
    for (const status of statuses) answered.set(status.savedId, status);
  }
  return savedProducts.map(p =>
    answered.get(p.id) ?? { status: 'storeDown', savedId: p.id, store: p.store });
}

/**
 * What a check tells the user: the stores that were down (in the order first
 * met), the saved products they could not check, and those that are gone.
 * The only place check statuses turn into that.
 */
export function summarize(statuses: CheckStatus[]): CheckSummary {
  const storesDown = new Set<StoreName>();
  const unchecked: string[] = [];
  const gone: string[] = [];
  for (const s of statuses) {
    if (s.status === 'storeDown') {
      storesDown.add(s.store);
      unchecked.push(s.savedId);
    } else if (s.status === 'gone') {
      gone.push(s.savedId);
    }
  }
  return { storesDown: [...storesDown], unchecked, gone };
}

/** The observed products among the check statuses. */
export function observedProducts(statuses: CheckStatus[]): BonusProduct[] {
  return statuses.flatMap(s => (s.status === 'observed' ? [s.product] : []));
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
