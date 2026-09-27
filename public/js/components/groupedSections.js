// @ts-check
import { parseUnitSize, calcPricePerUnit } from '../utils/unitPrice.js';

/**
 * @typedef {import('./productCard.js').DisplayedProduct} DisplayedProduct
 */

/**
 * Render products as sections: "Niet gecategoriseerd" first, then one section
 * per productgroup (in first-seen order), each group sorted by unit price
 * ascending with unknown unit prices last.
 * @template {DisplayedProduct & { productGroup?: string | null }} P
 * @param {HTMLElement} container sections are appended to it
 * @param {P[]} products
 * @param {(product: P) => HTMLElement} makeCard
 */
export function renderGroupedSections(container, products, makeCard) {
  /** @type {Map<string, P[]>} */
  const groups = new Map();
  /** @type {P[]} */
  const withoutGroup = [];
  for (const p of products) {
    if (!p.productGroup) {
      withoutGroup.push(p);
      continue;
    }
    const group = groups.get(p.productGroup);
    if (group) group.push(p);
    else groups.set(p.productGroup, [p]);
  }

  for (const items of groups.values()) {
    items.sort((a, b) => {
      const ua = getUnitPriceForSort(a);
      const ub = getUnitPriceForSort(b);
      if (ua == null && ub == null) return 0;
      if (ua == null) return 1;
      if (ub == null) return -1;
      return ua - ub;
    });
  }

  if (withoutGroup.length > 0) {
    container.appendChild(createSection('Niet gecategoriseerd', withoutGroup, makeCard));
  }
  for (const [groupName, items] of groups) {
    container.appendChild(createSection(groupName, items, makeCard));
  }
}

/**
 * @template P
 * @param {string} name
 * @param {P[]} items
 * @param {(product: P) => HTMLElement} makeCard
 * @returns {HTMLDivElement}
 */
function createSection(name, items, makeCard) {
  const section = document.createElement('div');
  section.className = 'group-section';

  const header = document.createElement('div');
  header.className = 'group-section-header';
  const nameEl = document.createElement('span');
  nameEl.className = 'group-section-name';
  nameEl.textContent = name;
  const countEl = document.createElement('span');
  countEl.className = 'group-section-count';
  countEl.textContent = `${items.length} product${items.length !== 1 ? 'en' : ''}`;
  header.append(nameEl, countEl);
  section.appendChild(header);

  const list = document.createElement('div');
  list.className = 'card-list';
  for (const item of items) list.appendChild(makeCard(item));
  section.appendChild(list);

  return section;
}

/** @param {DisplayedProduct} product */
function getUnitPriceForSort(product) {
  if (product.currentPrice == null) return null;
  const { volume, unit } = parseUnitSize(product.salesUnitSize);
  const result = calcPricePerUnit(product.currentPrice, volume, unit);
  return result ? result.unitPrice : null;
}
