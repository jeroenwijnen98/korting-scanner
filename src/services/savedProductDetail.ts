import type { StoreAdapter } from '../stores/base.ts';
import type { GroupHistoryEntry, PriceSnapshot, SavedProductDetail, StoreName } from '../types.ts';
import { errorMessage } from '../../public/js/utils/errorMessage.js';
import { getGroupHistory } from './groupHistory.ts';
import * as priceHistory from './priceHistory.ts';
import { observeSavedProducts, withoutSavedId } from './priceObservation.ts';
import * as productStore from './productStore.ts';

/**
 * Everything a saved product's detail shows, for the saved id: the product as
 * observed now (through the price observation module, so viewing it records a
 * snapshot and syncs its image), its price history (read after observing, so
 * it holds today's snapshot), its product group's history and its saved
 * fields. A failing part degrades on its own: a store that fails or does not
 * find the product gives `product: null`, a failing history gives [] (as
 * does a saved product without a product group). Null
 * only for an unknown saved id.
 */
export async function getSavedProductDetail(
  stores: Partial<Record<StoreName, StoreAdapter>>,
  id: string,
): Promise<SavedProductDetail | null> {
  const saved = (await productStore.getAll()).find(p => p.id === id);
  if (!saved) return null;

  const { observed } = await observeSavedProducts({ [saved.store]: stores[saved.store] }, [saved]);
  const product = observed[0] ? withoutSavedId(observed[0]) : null;

  const [stored, history, groupHistory] = await Promise.all([
    // Removed meanwhile, or unreadable: the saved fields as first read
    productStore.getAll().then(all => all.find(p => p.id === id), () => undefined),
    priceHistory.getHistory(id).catch((err): PriceSnapshot[] => {
      console.error(`Error reading the history of ${id}:`, errorMessage(err));
      return [];
    }),
    saved.productGroup
      ? getGroupHistory(saved.productGroup).catch((err): GroupHistoryEntry[] => {
        console.error(`Error reading the group history of ${id}:`, errorMessage(err));
        return [];
      })
      : [],
  ]);

  return { saved: stored ?? saved, product, history, groupHistory };
}
