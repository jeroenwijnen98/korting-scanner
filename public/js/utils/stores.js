// @ts-check
// Shared by the browser and the server (the bonus email), so it stays plain JS
// that the browser can load as it is, typed with JSDoc.

/**
 * @typedef {import('../../../src/types.ts').StoreName} StoreName
 * @typedef {object} StoreInfo
 * @property {string} label short name, as on the store pills and badges
 * @property {string} name full name, as in the bonus email
 * @property {string} color brand colour (the page's --store-* CSS variables match)
 */

/** @type {Record<StoreName, StoreInfo>} */
export const STORES = {
  ah: { label: 'AH', name: 'Albert Heijn', color: '#00A0E2' },
  dirk: { label: 'Dirk', name: 'Dirk', color: '#ED1C24' },
  kruidvat: { label: 'Kruidvat', name: 'Kruidvat', color: '#FF5500' },
  etos: { label: 'Etos', name: 'Etos', color: '#7B2D8B' },
};
