export function parseUnitSize(salesUnitSize) {
  if (!salesUnitSize) return { volume: 1, unit: 'stuk' };

  const s = salesUnitSize.trim().toLowerCase();
  const match = s.match(/([\d.,]+)\s*(ml|cl|l|kg|g|stuks?|rollen?)\b/);
  if (!match) return { volume: 1, unit: 'stuk' };

  const volume = parseFloat(match[1].replace(',', '.'));
  let unit = match[2];

  if (unit === 'stuks') unit = 'stuk';
  if (unit === 'rollen') unit = 'rol';

  return { volume, unit };
}

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
