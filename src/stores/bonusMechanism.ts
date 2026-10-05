/**
 * The bonus price per item, rounded to cents: what a store adapter whose API
 * gives only the bonus mechanism label, not the bonus price, shows as the
 * current price. Null when the mechanism is not recognised or cannot be applied
 * (a percentage or "gratis" mechanism without a regular price).
 */
export function bonusPrice(mechanism: string | null, regularPrice: number | null): number | null {
  const price = parseBonusMechanism(mechanism, regularPrice);
  return price == null ? null : Math.round(price * 100) / 100;
}

/**
 * The price per item under a bonus mechanism (a Dutch promo label such as
 * "1 + 1 gratis", "25%" or "2 voor 3 euro"), or null when the mechanism is not
 * recognised. Percentage and "gratis" mechanisms need the regular price;
 * without one they yield null too. Not rounded: the store adapters use
 * bonusPrice instead.
 */
export function parseBonusMechanism(label: string | null, priceBeforeBonus: number | null): number | null {
  if (!label) return null;
  // Normalize spaces around "+" so "1+1 gratis" matches "1 + 1 gratis"
  const m = label.toLowerCase().replace(/\s*\+\s*/g, ' + ');
  const discounted = (factor: number) => (priceBeforeBonus == null ? null : priceBeforeBonus * factor);

  // "X + Y gratis": pay for X of X + Y
  const plusMatch = m.match(/^(\d+) \+ (\d+) gratis$/);
  if (plusMatch) {
    const paid = parseInt(plusMatch[1]);
    return discounted(paid / (paid + parseInt(plusMatch[2])));
  }
  // "Ne ... ": the Nth item is cheaper, the other N - 1 cost the regular
  // price. "product" / "artikel" is optional: "2e gratis", "2e artikel halve
  // prijs", "2e product voor € 1.00"
  const nthMatch = m.match(/^(\d+)e (?:product |artikel )?(gratis|halve prijs|voor (?:€\s*)?(\d+(?:[.,]\d+)?))$/);
  if (nthMatch) {
    if (priceBeforeBonus == null) return null;
    const n = parseInt(nthMatch[1]);
    let nth: number;
    if (nthMatch[2] === 'gratis') nth = 0;
    else if (nthMatch[2] === 'halve prijs') nth = priceBeforeBonus / 2;
    else nth = parseFloat(nthMatch[3].replace(',', '.'));
    return ((n - 1) * priceBeforeBonus + nth) / n;
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
