// @ts-check
import { STORES } from './stores.js';

/**
 * @typedef {import('../../../src/types.ts').Product} Product
 * @typedef {import('../../../src/types.ts').SavedProduct} SavedProduct
 * @typedef {import('../../../src/types.ts').SavedProductDetail} SavedProductDetail
 * @typedef {import('../../../src/types.ts').PriceSnapshot} PriceSnapshot
 * @typedef {import('../../../src/types.ts').GroupHistoryEntry} GroupHistoryEntry
 * @typedef {import('../../../src/types.ts').DetailCheck} DetailCheck
 */

/**
 * Why the detail shows the saved fields instead of the store's product.
 * @typedef {object} DetailNotice
 * @property {'storeDown' | 'gone'} kind
 * @property {string} text e.g. "AH is niet bereikbaar"
 */

/**
 * What a saved product's detail shows.
 * @typedef {object} SavedProductDetailView
 * @property {Product | SavedProduct} product the product as the store has it
 *   now, or the saved fields when the store did not answer
 * @property {boolean} showBonus whether the detail shows the bonus: only when
 *   the store says the product is on bonus now
 * @property {SavedProduct} saved
 * @property {PriceSnapshot[]} history newest first
 * @property {GroupHistoryEntry[]} groupHistory newest first
 * @property {DetailNotice | null} notice set when the store was down or the
 *   product is gone; null when observed or when the request failed
 */

/**
 * The detail of a saved product, from the answer of
 * `GET /api/products/:id/detail`. Whatever loaded is shown: without the
 * store's product the saved fields stand in, with a notice saying whether
 * the store was down or the product is gone; without the answer at all the
 * saved product from the list does, with no history or notice. Null when
 * there is neither.
 * @param {SavedProductDetail | null} detail null when the request failed
 * @param {SavedProduct | null} listed the saved product as the list has it
 * @returns {SavedProductDetailView | null}
 */
export function savedProductDetailView(detail, listed) {
  const saved = detail?.saved ?? listed;
  if (!saved) return null;
  const product = detail?.product ?? null;
  return {
    product: product ?? saved,
    showBonus: Boolean(product?.isBonus),
    saved,
    history: detail?.history ?? [],
    groupHistory: detail?.groupHistory ?? [],
    notice: detail ? detailNotice(detail.check) : null,
  };
}

/**
 * @param {DetailCheck} check
 * @returns {DetailNotice | null}
 */
function detailNotice(check) {
  if (check.status === 'storeDown') {
    return { kind: 'storeDown', text: `${STORES[check.store].label} is niet bereikbaar` };
  }
  if (check.status === 'gone') return { kind: 'gone', text: 'Niet meer beschikbaar' };
  return null;
}
