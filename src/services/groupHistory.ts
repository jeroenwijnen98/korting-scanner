import type { GroupHistoryEntry, PriceSnapshot, SavedProduct } from '../types.ts';
import { unitPriceOf } from '../../public/js/utils/unitPrice.js';

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
      const calc = unitPriceOf(snapshot.currentPrice, saved.salesUnitSize);
      if (!calc) continue;

      if (calc.unitPrice < cheapestUnitPrice) {
        cheapestUnitPrice = calc.unitPrice;
        cheapest = {
          date,
          title: saved.title,
          store: saved.store,
          salesUnitSize: saved.salesUnitSize,
          currentPrice: snapshot.currentPrice,
          priceBeforeBonus: snapshot.priceBeforeBonus,
          isBonus: snapshot.isBonus,
          bonusMechanism: snapshot.bonusMechanism,
          unitPrice: calc.unitPrice,
          standardUnit: calc.standardUnit,
        };
      }
    }

    if (cheapest) results.push(cheapest);
  }

  return results.reverse();
}
