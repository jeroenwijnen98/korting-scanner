// @ts-check
import { bonusLink } from '../utils/bonusLink.js';

/** @typedef {import('../../../src/types.ts').OverviewProduct} OverviewProduct */

// Saved products added to grocer's list since the page loaded; not stored.
const added = new Set();

// grocer's /add page closes itself once it has added the bonus.
const POPUP = 'popup,width=420,height=560';

/**
 * The action on a bonus card: "Toevoegen" (a physical store, with grocerUrl)
 * opens grocer's /add page in a small popup and then reads "Toegevoegd";
 * "Bestel" (an online store) opens the product page in a new tab. Null when
 * the bonus has neither.
 * @param {OverviewProduct} product
 * @param {string | null} grocerUrl
 * @returns {HTMLButtonElement | null}
 */
export function createBonusAction(product, grocerUrl) {
  const link = bonusLink(product, { grocerUrl, at: Date.now() });
  if (!link) return null;

  const btn = document.createElement('button');
  btn.className = 'btn btn-secondary btn-sm product-card-action';

  if (link.kind === 'order') {
    btn.textContent = 'Bestel';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.open(link.url, '_blank', 'noopener');
    });
    return btn;
  }

  btn.textContent = added.has(product.savedId) ? 'Toegevoegd' : 'Toevoegen';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    // `at` is the click, so grocer can tell this add from an older one.
    const clicked = bonusLink(product, { grocerUrl, at: Date.now() });
    if (!clicked) return;
    window.open(clicked.url, 'grocer-add', POPUP);
    added.add(product.savedId);
    btn.textContent = 'Toegevoegd';
  });
  return btn;
}
