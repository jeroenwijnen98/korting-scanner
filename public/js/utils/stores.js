// @ts-check
// Shared by the browser and the server (the bonus email), so it stays plain JS
// that the browser can load as it is, typed with JSDoc.
//
// The store catalogue: the only place that knows a store's key, label, name,
// colour and display order. StoreName (src/types.ts) is derived from its keys,
// the My Products pills follow its order and store badges take their colour
// from it. A new store needs an entry here and a store adapter in
// src/stores/index.ts; missing either fails the typecheck.

/**
 * @typedef {object} StoreInfo
 * @property {string} label short name, as on the store pills and badges
 * @property {string} name full name, as in the bonus email
 * @property {string} color brand colour, for the badges and the bonus email
 */

/** @satisfies {Record<string, StoreInfo>} */
export const STORES = {
  ah: { label: 'AH', name: 'Albert Heijn', color: '#00A0E2' },
  dirk: { label: 'Dirk', name: 'Dirk', color: '#ED1C24' },
  kruidvat: { label: 'Kruidvat', name: 'Kruidvat', color: '#FF5500' },
  etos: { label: 'Etos', name: 'Etos', color: '#7B2D8B' },
  trekpleister: { label: 'Trekpleister', name: 'Trekpleister', color: '#26348B' },
  bol: { label: 'bol', name: 'bol.com', color: '#0000A4' },
};
