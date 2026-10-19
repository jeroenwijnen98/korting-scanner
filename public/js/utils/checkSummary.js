// @ts-check
// Shared by the browser (On sale) and the server (the bonus email), so a store
// that was down reads the same in both. Plain JS the browser loads as it is.

import { productCount } from './format.js';
import { STORES } from './stores.js';

/**
 * @typedef {import('../../../src/types.ts').CheckSummary} CheckSummary
 */

/**
 * What follows "Niet bereikbaar:" for a check whose stores were down, e.g.
 * "AH, Dirk. Bonus van 3 producten onbekend.": their saved products may be on
 * bonus, or gone, without the check knowing. Null when no store was down.
 * @param {CheckSummary} summary
 * @returns {string | null}
 */
export function storesDownNotice(summary) {
  if (summary.storesDown.length === 0) return null;
  const labels = summary.storesDown.map(store => STORES[store].label);
  return `${labels.join(', ')}. Bonus van ${productCount(summary.unchecked.length)} onbekend.`;
}
