// @ts-check
import { parseUnitSize, calcPricePerUnit } from '../utils/unitPrice.js';
import { sectionLayout } from '../utils/pausedLayout.js';

/**
 * @typedef {import('./productCard.js').DisplayedProduct} DisplayedProduct
 * @typedef {import('../utils/pausedLayout.js').Pausable} Pausable
 */

/**
 * Render products as sections: "Niet gecategoriseerd" first, then one section
 * per productgroup (in first-seen order), each group sorted by unit price
 * ascending with unknown unit prices last. In a mixed group the paused members
 * hide behind a "N gepauzeerd" row that opens and closes them.
 * @template {DisplayedProduct & Pausable} P
 * @param {HTMLElement} container sections are appended to it
 * @param {P[]} products
 * @param {(product: P) => HTMLElement} makeCard
 * @param {{
 *   makeGroupAction?: (groupName: string) => HTMLElement,
 *   expandedPausedRows?: Set<string | null>,
 * }} [options] `makeGroupAction` makes an extra control for the header of
 *   each product group (not "Niet gecategoriseerd"); `expandedPausedRows`
 *   holds the product groups (null for "Niet gecategoriseerd") whose
 *   "N gepauzeerd" row is open, and is updated as the user opens and closes them
 */
export function renderGroupedSections(container, products, makeCard, { makeGroupAction, expandedPausedRows = new Set() } = {}) {
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
    container.appendChild(createSection(null, withoutGroup, makeCard, expandedPausedRows));
  }
  for (const [groupName, items] of groups) {
    container.appendChild(createSection(groupName, items, makeCard, expandedPausedRows, makeGroupAction?.(groupName)));
  }
}

/**
 * @template {Pausable} P
 * @param {string | null} productGroup null for "Niet gecategoriseerd"
 * @param {P[]} items
 * @param {(product: P) => HTMLElement} makeCard
 * @param {Set<string | null>} expandedPausedRows
 * @param {HTMLElement} [action] goes at the end of the header
 * @returns {HTMLDivElement}
 */
function createSection(productGroup, items, makeCard, expandedPausedRows, action) {
  const section = document.createElement('div');
  section.className = 'group-section';

  const header = document.createElement('div');
  header.className = 'group-section-header';
  const nameEl = document.createElement('span');
  nameEl.className = 'group-section-name';
  nameEl.textContent = productGroup ?? 'Niet gecategoriseerd';
  const countEl = document.createElement('span');
  countEl.className = 'group-section-count';
  countEl.textContent = sectionLayout(items, false).countLabel;
  header.append(nameEl, countEl);
  if (action) header.appendChild(action);
  section.appendChild(header);

  const list = document.createElement('div');
  list.className = 'card-list';
  fillCardList(list, productGroup, items, makeCard, expandedPausedRows);
  section.appendChild(list);

  return section;
}

/**
 * The section's cards, and in a mixed group the row that hides or shows its
 * paused members. Clicking the row refills just this list.
 * @template {Pausable} P
 * @param {HTMLElement} list emptied and filled
 * @param {string | null} productGroup keys the row's open state
 * @param {P[]} items
 * @param {(product: P) => HTMLElement} makeCard
 * @param {Set<string | null>} expandedPausedRows
 */
function fillCardList(list, productGroup, items, makeCard, expandedPausedRows) {
  const expanded = expandedPausedRows.has(productGroup);
  const { shown, rowLabel, underRow } = sectionLayout(items, expanded);
  list.replaceChildren(...shown.map(makeCard));
  if (rowLabel == null) {
    // No longer mixed: once it is again, its row starts closed
    expandedPausedRows.delete(productGroup);
    return;
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'paused-row';
  button.textContent = rowLabel;
  button.setAttribute('aria-expanded', String(expanded));
  button.addEventListener('click', () => {
    if (expanded) expandedPausedRows.delete(productGroup);
    else expandedPausedRows.add(productGroup);
    fillCardList(list, productGroup, items, makeCard, expandedPausedRows);
    // The row is a new element now; keep keyboard focus on it
    /** @type {HTMLElement | null} */ (list.querySelector('.paused-row'))?.focus();
  });
  list.append(button, ...underRow.map(makeCard));
}

/** @param {DisplayedProduct} product */
function getUnitPriceForSort(product) {
  if (product.currentPrice == null) return null;
  const { volume, unit } = parseUnitSize(product.salesUnitSize);
  const result = calcPricePerUnit(product.currentPrice, volume, unit);
  return result ? result.unitPrice : null;
}
