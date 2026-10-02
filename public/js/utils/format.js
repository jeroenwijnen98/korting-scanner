// @ts-check
// Shared by the browser and the server (the bonus email), so it stays plain JS
// that the browser can load as it is, typed with JSDoc.

/**
 * A price in euros, e.g. `€ 1,99`; `-` when there is none.
 * @param {number | null | undefined} price
 * @returns {string}
 */
export function formatPrice(price) {
  if (price == null) return '-';
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
  }).format(price);
}

/**
 * A date as day and short month, e.g. `3 okt`; `-` when there is none.
 * @param {string | null | undefined} dateStr
 * @returns {string}
 */
export function formatDate(dateStr) {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleDateString('nl-NL', {
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return dateStr;
  }
}

/**
 * Escape text for use inside HTML markup: for user and store data that has to
 * go into a template string rather than through textContent.
 * @param {string | number | null | undefined} text
 * @returns {string}
 */
export function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * A number of products, e.g. `1 product`, `3 producten`.
 * @param {number} n
 * @returns {string}
 */
export function productCount(n) {
  return `${n} product${n !== 1 ? 'en' : ''}`;
}
