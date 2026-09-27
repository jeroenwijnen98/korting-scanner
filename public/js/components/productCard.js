// @ts-check
import { parseUnitSize, calcPricePerUnit } from '../utils/unitPrice.js';
import { formatPrice, formatDate, escapeHtml } from '../utils/format.js';
import { STORES } from '../utils/stores.js';

/**
 * @typedef {import('../../../src/types.ts').Product} Product
 */

/**
 * What a product card or the product detail shows: a product from a store
 * adapter, or a saved product, which carries no price or bonus state.
 * @typedef {Pick<Product, 'title' | 'store' | 'salesUnitSize' | 'brand' | 'imageUrl'>
 *   & Partial<Pick<Product, 'currentPrice' | 'priceBeforeBonus' | 'isBonus' | 'bonusMechanism' | 'bonusEndDate'>>} DisplayedProduct
 */

/**
 * @template {DisplayedProduct} P
 * @param {P} product
 * @param {{ onRemove?: (product: P) => void, showBonus?: boolean, isUnavailable?: boolean }} options
 * @returns {HTMLDivElement}
 */
export function createProductCard(product, { onRemove, showBonus = false, isUnavailable = false }) {
  const el = document.createElement('div');
  el.className = 'product-card';

  // Outer body: image + content side-by-side
  const body = document.createElement('div');
  body.className = 'product-card-body';

  // Optional image on the left
  if (product.imageUrl) {
    const img = document.createElement('img');
    img.className = 'product-card-image';
    img.src = product.imageUrl;
    img.alt = '';
    img.loading = 'lazy';
    body.appendChild(img);
  }

  // Content wrapper (everything except the image)
  const content = document.createElement('div');
  content.className = 'product-card-content';

  // Header: title + remove button
  const header = document.createElement('div');
  header.className = 'product-card-header';

  const titleEl = document.createElement('div');
  titleEl.className = 'product-card-title';
  titleEl.textContent = product.title;
  header.appendChild(titleEl);

  if (isUnavailable) {
    const badge = document.createElement('span');
    badge.className = 'badge-unavailable';
    badge.textContent = '!';
    badge.title = 'Niet meer beschikbaar';
    header.appendChild(badge);
  }

  if (onRemove) {
    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn btn-ghost btn-sm';
    removeBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onRemove(product);
    });
    header.appendChild(removeBtn);
  }

  content.appendChild(header);

  // Meta: size, brand, store badge
  const meta = document.createElement('div');
  meta.className = 'product-card-meta';
  const parts = [product.salesUnitSize, product.brand].filter(Boolean);
  meta.innerHTML = `${storeBadge(product.store)} ${escapeHtml(parts.join(' · '))}`;
  content.appendChild(meta);

  // Unit price
  if (product.currentPrice != null) {
    const { volume, unit } = parseUnitSize(product.salesUnitSize);
    const unitPriceData = calcPricePerUnit(product.currentPrice, volume, unit);
    if (unitPriceData) {
      const unitPriceEl = document.createElement('p');
      unitPriceEl.className = 'product-card-unit-price';
      unitPriceEl.textContent = `€${unitPriceData.unitPrice.toFixed(2)} per ${unitPriceData.standardUnit}`;
      content.appendChild(unitPriceEl);
    }
  }

  // Bonus info (only in bonus view)
  if (showBonus && product.isBonus) {
    const bonusRow = document.createElement('div');
    bonusRow.className = 'product-card-bonus';

    if (product.bonusMechanism) {
      const badge = document.createElement('span');
      badge.className = 'badge badge-bonus';
      badge.textContent = product.bonusMechanism;
      bonusRow.appendChild(badge);
    }

    const prices = document.createElement('div');
    prices.className = 'product-card-prices';
    if (product.currentPrice != null) {
      const curr = document.createElement('span');
      curr.className = 'price-current';
      curr.textContent = formatPrice(product.currentPrice);
      prices.appendChild(curr);
    }
    if (product.priceBeforeBonus != null && product.priceBeforeBonus !== product.currentPrice) {
      const before = document.createElement('span');
      before.className = 'price-before';
      before.textContent = formatPrice(product.priceBeforeBonus);
      prices.appendChild(before);
    }
    bonusRow.appendChild(prices);
    content.appendChild(bonusRow);

    if (product.bonusEndDate) {
      const dates = document.createElement('div');
      dates.className = 'product-card-dates';
      dates.textContent = `t/m ${formatDate(product.bonusEndDate)}`;
      content.appendChild(dates);
    }
  }

  body.appendChild(content);
  el.appendChild(body);

  return el;
}

/**
 * The store badge of a card or the detail: the store's short label.
 * @param {import('../../../src/types.ts').StoreName} store
 * @returns {string} markup
 */
export function storeBadge(store) {
  const label = STORES[store]?.label ?? store ?? '';
  return `<span class="badge-store badge-store-${escapeHtml(store)}">${escapeHtml(label.toUpperCase())}</span>`;
}
