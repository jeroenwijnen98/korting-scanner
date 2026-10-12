import type { GroupHistoryEntry, PriceSnapshot, SavedProduct } from '../types.ts';
import { unitPriceOf } from '../../public/js/utils/unitPrice.js';
import * as priceHistory from './priceHistory.ts';
import * as productStore from './productStore.ts';

/**
 * The cheapest-per-date history of a product group: its saved products joined
 * with their price history (see cheapestPerDate). Newest first; empty for a
 * group with no saved products.
 */
export async function getGroupHistory(groupName: string): Promise<GroupHistoryEntry[]> {
  const members = (await productStore.getAll()).filter(p => p.productGroup === groupName);
  const entries = await Promise.all(
    members.map(async saved => ({ saved, history: await priceHistory.getHistory(saved.id) })),
  );
  return cheapestPerDate(entries);
}

/**
 * For each date in the combined price history of a product group, the saved
 * product with the lowest unit price that day, going by each product's most
 * recent snapshot on or before it. Products without a unit price that day are
 * skipped: no price, or a size such as "0 g" (see unitPriceOf). One whose size
 * does not parse competes per stuk, on its plain price.
 * `history` is newest-first (as `getHistory` returns it); so is the result.
 */
export function cheapestPerDate(
  entries: { saved: SavedProduct; history: PriceSnapshot[] }[],
): GroupHistoryEntry[] {
  const dates = [...new Set(entries.flatMap(({ history }) => history.map(e => e.date)))].sort();

  const results: GroupHistoryEntry[] = [];
  for (const date of dates) {
    let cheapest: GroupHistoryEntry | null = null;
    let cheapestUnitPrice = Infinity;

    for (const { saved, history } of entries) {
      const snapshot = history.find(e => e.date <= date);
      if (!snapshot) continue;
      const pricePerUnit = unitPriceOf(snapshot.currentPrice, saved.salesUnitSize);
      if (!pricePerUnit) continue;

      if (pricePerUnit.unitPrice < cheapestUnitPrice) {
        cheapestUnitPrice = pricePerUnit.unitPrice;
        cheapest = {
          date,
          title: saved.title,
          store: saved.store,
          salesUnitSize: saved.salesUnitSize,
          currentPrice: snapshot.currentPrice,
          priceBeforeBonus: snapshot.priceBeforeBonus,
          isBonus: snapshot.isBonus,
          bonusMechanism: snapshot.bonusMechanism,
          unitPrice: pricePerUnit.unitPrice,
          standardUnit: pricePerUnit.standardUnit,
        };
      }
    }

    if (cheapest) results.push(cheapest);
  }

  return results.reverse();
}
