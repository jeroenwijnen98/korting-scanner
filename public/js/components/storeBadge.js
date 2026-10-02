// @ts-check
import { escapeHtml } from '../utils/format.js';
import { STORES } from '../utils/stores.js';

/**
 * The store badge of a card or the detail: the store's short label, in the
 * store's colour from the catalogue (through --store-color).
 * @param {import('../../../src/types.ts').StoreName} store
 * @returns {string} markup
 */
export function storeBadge(store) {
  const info = STORES[store];
  const label = info?.label ?? store ?? '';
  const style = info ? ` style="--store-color: ${escapeHtml(info.color)}"` : '';
  return `<span class="badge-store"${style}>${escapeHtml(label.toUpperCase())}</span>`;
}
