// @ts-check
import { getBonus, getProductHistory, getGroupHistory } from '../api.js';
import { createProductCard } from '../components/productCard.js';
import { createProductDetail } from '../components/productDetail.js';
import { createBonusAction } from '../components/bonusAction.js';
import { showToast } from '../components/toast.js';
import { renderGroupedSections } from '../components/groupedSections.js';
import { errorMessage } from '../utils/errorMessage.js';
import { escapeHtml } from '../utils/format.js';
import { savedList } from '../savedList.js';

/**
 * @typedef {import('../../../src/types.ts').OverviewProduct} OverviewProduct
 * @typedef {import('../../../src/types.ts').PriceSnapshot} PriceSnapshot
 * @typedef {import('../../../src/types.ts').GroupHistoryEntry} GroupHistoryEntry
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

    const { bonusProducts, notFound, grocerUrl } = bonusData;
    savedList.setUnavailable(notFound);

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
 * @param {OverviewProduct} bonusProduct
 * @param {OverviewProduct[]} bonusProducts
 * @param {string | null} [grocerUrl]
 */
async function showDetail(bonusProduct, bonusProducts, grocerUrl = null) {
  panel.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Laden...</p></div>';
  const product = withListGroup(bonusProduct);

  /** @type {PriceSnapshot[]} */
  let history = [];
  /** @type {GroupHistoryEntry[]} */
  let groupHistory = [];
  try {
    [history, groupHistory] = await Promise.all([
      getProductHistory(product.savedId),
      product.productGroup ? getGroupHistory(product.productGroup) : Promise.resolve([]),
    ]);
  } catch { /* ignore */ }

  panel.innerHTML = '';
  const detail = createProductDetail(product, {
    showBonus: true,
    history,
    groupHistory,
    savedProduct: savedList.get(product.savedId),
    existingGroups: savedList.productGroups(),
    onProductGroupChange: async (id, productGroup) => {
      await savedList.setProductGroup(id, productGroup);
      // Re-open detail with the product group from the list
      showDetail(bonusProduct, bonusProducts, grocerUrl);
    },
    onBack: () => render(bonusProducts, grocerUrl),
  });
  panel.appendChild(detail);
}

/**
 * @param {OverviewProduct[]} bonusProducts
 * @param {string | null} [grocerUrl] GROCER_URL; without it no Toevoegen
 */
function render(bonusProducts, grocerUrl = null) {
  panel.innerHTML = '';

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
    panel.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">%</div>
        <h3>Geen bonus producten</h3>
        <p>Voeg producten toe via "Mijn Producten" om te zien wanneer ze in de bonus zijn</p>
      </div>
    `;
    return;
  }

  renderGroupedSections(panel, bonusProducts.map(withListGroup), product => {
    const card = createProductCard(product, {
      showBonus: true,
      bonusAction: createBonusAction(product, grocerUrl),
    });
    card.addEventListener('click', () => showDetail(product, bonusProducts, grocerUrl));
    return card;
  });
}
