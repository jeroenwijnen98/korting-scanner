// @ts-check
import { getBonus } from '../api.js';
import { createProductCard } from '../components/productCard.js';
import { createBonusAction } from '../components/bonusAction.js';
import { showToast } from '../components/toast.js';
import { renderGroupedSections } from '../components/groupedSections.js';
import { errorMessage } from '../utils/errorMessage.js';
import { escapeHtml } from '../utils/format.js';
import { storesDownNotice } from '../utils/checkSummary.js';
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

    const { bonusProducts, summary, grocerUrl } = bonusData;
    savedList.setCheckSummary(summary);

    render(bonusProducts, grocerUrl);
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
 * A banner naming the stores the last bonus check could not reach: their
 * saved products may be on bonus, or gone, without the overview knowing.
 * @returns {HTMLElement | null}
 */
function storesDownBanner() {
  const notice = storesDownNotice(savedList.checkSummary());
  if (!notice) return null;
  const banner = document.createElement('div');
  banner.className = 'unreachable-banner';
  banner.innerHTML = `<strong>Niet bereikbaar:</strong> ${escapeHtml(notice)}`;
  return banner;
}

/**
 * @param {OverviewProduct[]} bonusProducts
 * @param {string | null} [grocerUrl] GROCER_URL; without it no Toevoegen
 */
function render(bonusProducts, grocerUrl = null) {
  panel.innerHTML = '';

  const downBanner = storesDownBanner();
  if (downBanner) panel.appendChild(downBanner);

  // Warning banner for unavailable products
  const notFound = savedList.checkSummary().gone;
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
      onBack: () => render(bonusProducts, grocerUrl),
    }));
    return card;
  });
}
