// @ts-check
import { parseUnitSize, calcPricePerUnit } from '../utils/unitPrice.js';
import { pausedLast } from '../utils/pausedSection.js';

/**
 * @typedef {import('./productCard.js').DisplayedProduct} DisplayedProduct
 */

/**
 * Render products as sections: "Niet gecategoriseerd" first, then one section
 * per productgroup (in first-seen order), each group sorted by unit price
 * ascending with unknown unit prices last, and paused members after the
 * unpaused ones.
 * @template {DisplayedProduct & { productGroup?: string | null, paused?: boolean | null }} P
 * @param {HTMLElement} container sections are appended to it
 * @param {P[]} products
 * @param {(product: P) => HTMLElement} makeCard
 * @param {(groupName: string) => HTMLElement} [makeGroupAction] an extra
 *   control for the header of each product group (not "Niet gecategoriseerd")
 */
export function renderGroupedSections(container, products, makeCard, makeGroupAction) {
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

  for (const [groupName, items] of groups) {
    items.sort((a, b) => {
      const ua = getUnitPriceForSort(a);
      const ub = getUnitPriceForSort(b);
      if (ua == null && ub == null) return 0;
      if (ua == null) return 1;
      if (ub == null) return -1;
      return ua - ub;
    });
    groups.set(groupName, pausedLast(items));
  }

  if (withoutGroup.length > 0) {
    container.appendChild(createSection('Niet gecategoriseerd', pausedLast(withoutGroup), makeCard));
  }
  for (const [groupName, items] of groups) {
    container.appendChild(createSection(groupName, items, makeCard, makeGroupAction?.(groupName)));
  }
}

/**
 * @template {{ paused?: boolean | null }} P
 * @param {string} name
 * @param {P[]} items
 * @param {(product: P) => HTMLElement} makeCard
 * @param {HTMLElement} [action] goes at the end of the header
 * @returns {HTMLDivElement}
 */
function createSection(name, items, makeCard, action) {
  const section = document.createElement('div');
  section.className = 'group-section';

  const header = document.createElement('div');
  header.className = 'group-section-header';
  const nameEl = document.createElement('span');
  nameEl.className = 'group-section-name';
  nameEl.textContent = name;
  const countEl = document.createElement('span');
  countEl.className = 'group-section-count';
  countEl.textContent = countLabel(items);
  header.append(nameEl, countEl);
  if (action) header.appendChild(action);
  section.appendChild(header);

  const list = document.createElement('div');
  list.className = 'card-list';
  for (const item of items) list.appendChild(makeCard(item));
  section.appendChild(list);

  return section;
}

/**
 * "3 producten", or "3 producten · 1 gepauzeerd" when only some are paused (a
 * section that is all paused says nothing more: it sits under Gepauzeerd).
 * @param {{ paused?: boolean | null }[]} items
 */
function countLabel(items) {
  const total = `${items.length} product${items.length !== 1 ? 'en' : ''}`;
  const paused = items.filter(p => p.paused).length;
  return paused > 0 && paused < items.length ? `${total} · ${paused} gepauzeerd` : total;
}

/** @param {DisplayedProduct} product */
function getUnitPriceForSort(product) {
  if (product.currentPrice == null) return null;
  const { volume, unit } = parseUnitSize(product.salesUnitSize);
  const result = calcPricePerUnit(product.currentPrice, volume, unit);
  return result ? result.unitPrice : null;
}
