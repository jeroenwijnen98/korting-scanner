// @ts-check
// Shared by the browser and the server (the group history service and the bonus
// email), so it stays plain JS that the browser can load as it is, typed with
// JSDoc. unitPriceOf and formatUnitPrice are its interface; parseUnitSize and
// calcPricePerUnit are internal steps.

import { formatPrice } from './format.js';

/**
 * @typedef {'ml' | 'cl' | 'l' | 'g' | 'kg' | 'stuk' | 'rol'} SizeUnit
 * @typedef {import('../../../src/types.ts').StandardUnit} StandardUnit
 * @typedef {{ volume: number, unit: SizeUnit }} UnitSize
 * @typedef {{ unitPrice: number, standardUnit: StandardUnit }} PricePerUnit
 */

/**
 * Parse salesUnitSize string into volume and unit.
 * Examples: "500 g" → { volume: 500, unit: 'g' },
 * "1.5 l" → { volume: 1.5, unit: 'l' }
 * @param {string | null | undefined} salesUnitSize
 * @returns {UnitSize}
 */
function parseUnitSize(salesUnitSize) {
  if (!salesUnitSize) return { volume: 1, unit: 'stuk' };

  const s = salesUnitSize.trim().toLowerCase();

  // Match first number+unit pair like "500 g", "1.5l", "1 kg (ca. 10 stuks)"
  const match = s.match(/([\d.,]+)\s*(ml|cl|l|kg|g|stuks?|rollen?)\b/);
  if (!match) return { volume: 1, unit: 'stuk' };

  const volume = parseFloat(match[1].replace(',', '.'));
  let unit = match[2];

  // Normalize plural
  if (unit === 'stuks') unit = 'stuk';
  if (unit === 'rollen') unit = 'rol';

  return { volume, unit: /** @type {SizeUnit} */ (unit) };
}

/**
 * Calculate price per standard unit.
 * Returns { unitPrice, standardUnit } or null if not calculable.
 * @param {number | null | undefined} price
 * @param {number} volume
 * @param {string} unit
 * @returns {PricePerUnit | null}
 */
function calcPricePerUnit(price, volume, unit) {
  if (price == null || !volume || volume <= 0) return null;

  switch (unit) {
    case 'ml':
      return { unitPrice: (price / volume) * 1000, standardUnit: 'liter' };
    case 'cl':
      return { unitPrice: (price / volume) * 100, standardUnit: 'liter' };
    case 'l':
      return { unitPrice: price / volume, standardUnit: 'liter' };
    case 'g':
      return { unitPrice: (price / volume) * 1000, standardUnit: 'kg' };
    case 'kg':
      return { unitPrice: price / volume, standardUnit: 'kg' };
    case 'stuk':
      return { unitPrice: price / volume, standardUnit: 'stuk' };
    case 'rol':
      return { unitPrice: price / volume, standardUnit: 'rol' };
    default:
      return null;
  }
}

/**
 * The unit price of a price for a product of the given sales unit size, e.g.
 * 2 for "500 g" → { unitPrice: 4, standardUnit: 'kg' }.
 *
 * A size that does not parse (empty, or no known unit such as "per bos") counts
 * as one `stuk`, so its unit price is the price itself per stuk.
 *
 * Null when there is no price, or when the size has a known unit but a number
 * of zero or one that cannot be read (e.g. "0 g"): then there is nothing to
 * compare by. Callers choose their own placeholder for it.
 * @param {number | null | undefined} price
 * @param {string | null | undefined} salesUnitSize
 * @returns {PricePerUnit | null}
 */
export function unitPriceOf(price, salesUnitSize) {
  const { volume, unit } = parseUnitSize(salesUnitSize);
  return calcPricePerUnit(price, volume, unit);
}

/**
 * A unit price for display, e.g. `€ 1,23 / kg` (nl-NL, as formatPrice).
 * @param {PricePerUnit} pricePerUnit
 * @returns {string}
 */
export function formatUnitPrice({ unitPrice, standardUnit }) {
  return `${formatPrice(unitPrice)} / ${standardUnit}`;
}
