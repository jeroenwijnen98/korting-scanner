import type { GroupHistoryEntry, PriceSnapshot, SavedProduct } from '../types.ts';
import { parseUnitSize, calcPricePerUnit } from '../../public/js/utils/unitPrice.js';

/**
 * For each date in the combined price history of a product group, the saved
 * product with the lowest unit price that day, going by each product's most
 * recent snapshot on or before it. Products without a price that day are
 * skipped; one whose size does not parse competes on its plain price.
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
      if (!snapshot || snapshot.currentPrice == null) continue;

      const { volume, unit } = parseUnitSize(saved.salesUnitSize);
      const calc = calcPricePerUnit(snapshot.currentPrice, volume, unit);
      const unitPrice = calc ? calc.unitPrice : snapshot.currentPrice;

      if (unitPrice < cheapestUnitPrice) {
        cheapestUnitPrice = unitPrice;
        cheapest = {
          date,
          title: saved.title,
          store: saved.store,
          salesUnitSize: saved.salesUnitSize,
          currentPrice: snapshot.currentPrice,
          priceBeforeBonus: snapshot.priceBeforeBonus,
          isBonus: snapshot.isBonus,
          bonusMechanism: snapshot.bonusMechanism,
          unitPrice: calc ? calc.unitPrice : null,
          standardUnit: calc ? calc.standardUnit : null,
        };
      }
    }

    if (cheapest) results.push(cheapest);
  }

  return results.reverse();
}
