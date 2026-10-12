// @ts-check

/**
 * @typedef {import('../../../src/types.ts').Product} Product
 * @typedef {import('../../../src/types.ts').SavedProduct} SavedProduct
 * @typedef {import('../../../src/types.ts').SavedProductDetail} SavedProductDetail
 * @typedef {import('../../../src/types.ts').PriceSnapshot} PriceSnapshot
 * @typedef {import('../../../src/types.ts').GroupHistoryEntry} GroupHistoryEntry
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
 */

/**
 * The detail of a saved product, from the answer of
 * `GET /api/products/:id/detail`. Whatever loaded is shown: without the
 * store's product the saved fields stand in, without the answer at all the
 * saved product from the list does, with no history. Null when there is
 * neither.
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
  };
}
