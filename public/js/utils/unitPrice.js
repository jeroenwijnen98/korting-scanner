/**
 * Parse salesUnitSize string into volume and unit.
 * Examples: "500 g" → { volume: 500, unit: 'g' }, "1.5 l" → { volume: 1.5, unit: 'l' }
 */
export function parseUnitSize(salesUnitSize) {
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

  return { volume, unit };
}

/**
 * Calculate price per standard unit.
 * Returns { unitPrice, standardUnit } or null if not calculable.
 */
export function calcPricePerUnit(price, volume, unit) {
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
