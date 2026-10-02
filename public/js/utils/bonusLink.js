// @ts-check
// Shared by the browser and the server (the bonus email), so it stays plain JS
// that the browser can load as it is, typed with JSDoc.
//
// The one action a bonus offers: at a physical store a link to grocer's /add
// page that carries the bonus, at an online store its product page ("Bestel").
// The link carries no secret: the add happens in grocer's own page.

import { STORES } from './stores.js';

/** @typedef {import('../../../src/types.ts').OverviewProduct} OverviewProduct */

/**
 * @typedef {{ kind: 'add', url: string } | { kind: 'order', url: string }} BonusLink
 * `add`: "Toevoegen", to grocer's list; `order`: "Bestel", on the store's site.
 */

const ZONED = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/**
 * A bonus end date as a calendar date (YYYY-MM-DD) in Europe/Amsterdam; null
 * when it is empty or unreadable. Adapters give a date (`2026-10-05`), a
 * datetime with an offset (`2026-10-11T23:59:59+0200`) or nothing; a datetime
 * without one is taken as Amsterdam time already.
 * @param {string | null | undefined} value
 * @returns {string | null}
 */
export function endsOn(value) {
  const s = (value ?? '').trim();
  if (!s) return null;
  if (!ZONED.test(s)) {
    const m = /^(\d{4}-\d{2}-\d{2})(?:T[\d:.]*)?$/.exec(s);
    return m && !Number.isNaN(Date.parse(m[1])) ? m[1] : null;
  }
  // "+0200" is not ISO 8601 and not every browser reads it: make it "+02:00".
  const date = new Date(s.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  if (Number.isNaN(date.getTime())) return null;
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

/**
 * The link for a bonus product: an add link when its store is physical and
 * `grocerUrl` is set, a Bestel link when its store is online, else null. A
 * bonus without a mechanism gets nothing.
 * @param {Pick<OverviewProduct, 'store' | 'productId' | 'title' | 'bonusMechanism' | 'bonusEndDate' | 'productGroup'>} product
 * @param {{ grocerUrl?: string | null, at: number }} options `at`: when the
 *   link was made (the email built, the button clicked), in epoch ms
 * @returns {BonusLink | null}
 */
export function bonusLink(product, { grocerUrl, at }) {
  if (!product.bonusMechanism) return null;
  /** @type {import('./stores.js').StoreInfo | undefined} */
  const store = STORES[product.store];
  if (!store) return null;
  if (store.online) {
    if (!store.productUrl) return null;
    return { kind: 'order', url: store.productUrl(product.productId) };
  }
  if (!grocerUrl) return null;

  /** @type {[string, string | number | null][]} */
  const params = [
    ['name', product.productGroup || product.title],
    ['store', product.store],
    ['mechanism', product.bonusMechanism],
    ['endsOn', endsOn(product.bonusEndDate)],
    ['storeTitle', product.title],
    ['at', at],
  ];
  const query = params
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');
  return { kind: 'add', url: `${grocerUrl.replace(/\/+$/, '')}/add?${query}` };
}
