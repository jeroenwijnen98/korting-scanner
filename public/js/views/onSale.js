// @ts-check
import { getBonus } from '../api.js';
import { createProductCard } from '../components/productCard.js';
import { createBonusAction } from '../components/bonusAction.js';
import { showToast } from '../components/toast.js';
import { renderGroupedSections } from '../components/groupedSections.js';
import { errorMessage } from '../utils/errorMessage.js';
import { escapeHtml, productCount } from '../utils/format.js';
import { STORES } from '../utils/stores.js';
import { savedList } from '../savedList.js';
import { openSavedProductDetail } from '../savedProductDetail.js';

/**
 * @typedef {import('../../../src/types.ts').OverviewProduct} OverviewProduct
 */

const panel = document.getElementById('panel-on-sale');

export async function initOnSale() {
  panel.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Bonus checken...</p></div>';

  // Animate refresh button
  const refreshBtn = document.getElementById('refresh-btn');
  refreshBtn.classList.add('refreshing');

  try {
    const [bonusData] = await Promise.all([getBonus(), savedList.load()]);
    refreshBtn.classList.remove('refreshing');

    const { bonusProducts, notFound, unreachable, grocerUrl } = bonusData;
    savedList.setUnavailable(notFound);

    render(bonusProducts, grocerUrl, unreachable);
  } catch (err) {
    refreshBtn.classList.remove('refreshing');
    showToast('Kon bonus niet laden', 'error');
    panel.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">!</div>
        <h3>Fout bij laden</h3>
        <p>${escapeHtml(errorMessage(err))}</p>
      </div>
    `;
  }
}

/**
 * The bonus product with its product group as the saved-product list has it
 * now, which may have changed since the bonus check.
 * @param {OverviewProduct} product
 * @returns {OverviewProduct}
 */
function withListGroup(product) {
  const saved = savedList.get(product.savedId);
  return saved ? { ...product, productGroup: saved.productGroup || null } : product;
}

/**
 * A banner naming the stores the bonus check could not reach: their saved
 * products may be on bonus, or gone, without the overview knowing.
 * @param {string[]} unreachable saved product ids
 * @returns {HTMLElement | null}
 */
function unreachableBanner(unreachable) {
  const stores = new Set(unreachable.map(id => savedList.get(id)?.store).filter(store => store !== undefined));
  if (stores.size === 0) return null;
  const labels = [...stores].map(store => STORES[store].label);
  const banner = document.createElement('div');
  banner.className = 'unreachable-banner';
  banner.innerHTML = `<strong>Niet bereikbaar:</strong> ${escapeHtml(labels.join(', '))}. Bonus van ${productCount(unreachable.length)} onbekend.`;
  return banner;
}

/**
 * @param {OverviewProduct[]} bonusProducts
 * @param {string | null} [grocerUrl] GROCER_URL; without it no Toevoegen
 * @param {string[]} [unreachable] saved product ids whose store failed
 */
function render(bonusProducts, grocerUrl = null, unreachable = []) {
  panel.innerHTML = '';

  const unreachableNotice = unreachableBanner(unreachable);
  if (unreachableNotice) panel.appendChild(unreachableNotice);

  // Warning banner for unavailable products
  const notFound = savedList.unavailableIds();
  if (notFound.length > 0) {
    const unavailableNames = notFound
      .map(id => savedList.get(id)?.title || id)
      .join(', ');
    const banner = document.createElement('div');
    banner.className = 'unavailable-banner';
    banner.innerHTML = `<strong>Niet meer beschikbaar:</strong> ${escapeHtml(unavailableNames)}`;
    panel.appendChild(banner);
  }

  if (bonusProducts.length === 0) {
    // Appended, not set: the banners above stay
    panel.insertAdjacentHTML('beforeend', `
      <div class="empty-state">
        <div class="empty-state-icon">%</div>
        <h3>Geen bonus producten</h3>
        <p>Voeg producten toe via "Mijn Producten" om te zien wanneer ze in de bonus zijn</p>
      </div>
    `);
    return;
  }

  renderGroupedSections(panel, bonusProducts.map(withListGroup), product => {
    const card = createProductCard(product, {
      showBonus: true,
      bonusAction: createBonusAction(product, grocerUrl),
    });
    card.addEventListener('click', () => openSavedProductDetail(product.savedId, {
      panel,
      onBack: () => render(bonusProducts, grocerUrl, unreachable),
    }));
    return card;
  });
}
