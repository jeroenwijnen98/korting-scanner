// @ts-check
// Shared by the browser and the server (the bonus email), so it stays plain JS
// that the browser can load as it is, typed with JSDoc.
//
// The store catalogue: the only place that knows a store's key, label, name,
// colour, display order and whether it is an online store. StoreName
// (src/types.ts) is derived from its keys, the My Products pills follow its
// order and store badges take their colour from it. A new store needs an
// entry here and a store adapter in src/stores/index.ts; missing either fails
// the typecheck.

/**
 * @typedef {object} StoreInfo
 * @property {string} label short name, as on the store pills and badges
 * @property {string} name full name, as in the bonus email
 * @property {string} color brand colour, for the badges and the bonus email
 * @property {boolean} online an online store: its bonus is ordered on its own
 *   site ("Bestel"), not added to grocer's list. The rest are physical stores.
 * @property {(productId: string) => string} [productUrl] an online store's
 *   product page for a product id
 */

/** @satisfies {Record<string, StoreInfo>} */
export const STORES = {
  ah: { label: 'AH', name: 'Albert Heijn', color: '#00A0E2', online: false },
  dirk: { label: 'Dirk', name: 'Dirk', color: '#ED1C24', online: false },
  kruidvat: { label: 'Kruidvat', name: 'Kruidvat', color: '#FF5500', online: false },
  trekpleister: { label: 'Trekpleister', name: 'Trekpleister', color: '#26348B', online: false },
  bol: {
    label: 'bol', name: 'bol.com', color: '#0000A4', online: true,
    productUrl: productId => `https://www.bol.com/nl/nl/p/x/${encodeURIComponent(productId)}/`,
  },
};
