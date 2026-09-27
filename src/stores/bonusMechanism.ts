/**
 * The price per item under a bonus mechanism (a Dutch promo label such as
 * "1 + 1 gratis", "25%" or "2 voor 3 euro"), or null when the mechanism is not
 * recognised. Percentage and "gratis" mechanisms need the regular price;
 * without one they yield null too. Shared by the store adapters whose API
 * gives only the label, not the bonus price.
 */
export function parseBonusMechanism(label: string | null, priceBeforeBonus: number | null): number | null {
  if (!label) return null;
  // Normalize spaces around "+" so "1+1 gratis" matches "1 + 1 gratis"
  const m = label.toLowerCase().replace(/\s*\+\s*/g, ' + ');
  const discounted = (factor: number) => (priceBeforeBonus == null ? null : priceBeforeBonus * factor);

  if (m === '2e gratis' || m === '1 + 1 gratis' || m === '2 + 2 gratis') {
    return discounted(0.5);
  }
  if (m === '2 + 1 gratis') {
    return discounted(2 / 3);
  }
  if (m === '2e halve prijs') {
    return discounted(0.75);
  }

  const pctMatch = m.match(/(\d+)%/);
  if (pctMatch) {
    return discounted(1 - parseInt(pctMatch[1]) / 100);
  }

  // "2 voor 3 euro" or "3 voor 5": the bundle price per item
  const bundleMatch = m.match(/(\d+)\s*voor\s*(\d+(?:[.,]\d+)?)(?:\s*euro)?/);
  if (bundleMatch) {
    const count = parseInt(bundleMatch[1]);
    const total = parseFloat(bundleMatch[2].replace(',', '.'));
    return total / count;
  }

  // "VOOR 16.99" or "voor 16,99" — single item fixed price
  const voorMatch = m.match(/^voor\s+(\d+(?:[.,]\d+)?)$/);
  if (voorMatch) {
    return parseFloat(voorMatch[1].replace(',', '.'));
  }

  return null;
}
