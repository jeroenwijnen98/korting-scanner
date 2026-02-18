import { getBonus, getProductHistory } from '../api.js';
import { createProductCard } from '../components/productCard.js';
import { createProductDetail } from '../components/productDetail.js';
import { showToast } from '../components/toast.js';

const panel = document.getElementById('panel-on-sale');

export async function initOnSale() {
  panel.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Bonus checken...</p></div>';

  // Animate refresh button
  const refreshBtn = document.getElementById('refresh-btn');
  refreshBtn.classList.add('refreshing');

  try {
    const bonusProducts = await getBonus();
    refreshBtn.classList.remove('refreshing');
    render(bonusProducts);
  } catch (err) {
    refreshBtn.classList.remove('refreshing');
    showToast('Kon bonus niet laden', 'error');
    panel.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">!</div>
        <h3>Fout bij laden</h3>
        <p>${err.message}</p>
      </div>
    `;
  }
}

async function showDetail(product, allProducts) {
  panel.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Laden...</p></div>';
  const productId = product.savedId || `${product.store}-${product.productId}`;
  let history = [];
  try {
    history = await getProductHistory(productId);
  } catch { /* ignore */ }
  panel.innerHTML = '';
  const detail = createProductDetail(product, {
    showBonus: true,
    history,
    onBack: () => render(allProducts),
  });
  panel.appendChild(detail);
}

function render(products) {
  panel.innerHTML = '';

  if (products.length === 0) {
    panel.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">%</div>
        <h3>Geen bonus producten</h3>
        <p>Voeg producten toe via "Mijn Producten" om te zien wanneer ze in de bonus zijn</p>
      </div>
    `;
    return;
  }

  // Group by store
  const grouped = {};
  products.forEach(p => {
    if (!grouped[p.store]) grouped[p.store] = [];
    grouped[p.store].push(p);
  });

  const storeNames = { ah: 'Albert Heijn', dirk: 'Dirk' };

  Object.entries(grouped).forEach(([store, items]) => {
    const section = document.createElement('div');
    section.className = 'store-section';

    const header = document.createElement('div');
    header.className = 'store-section-header';
    header.innerHTML = `
      <span class="store-section-name badge-store-${store}">${storeNames[store] || store}</span>
      <span class="store-section-count">${items.length} product${items.length !== 1 ? 'en' : ''}</span>
    `;
    section.appendChild(header);

    const list = document.createElement('div');
    list.className = 'card-list';
    items.forEach(product => {
      const card = createProductCard(product, { showBonus: true });
      card.addEventListener('click', () => showDetail(product, products));
      list.appendChild(card);
    });
    section.appendChild(list);

    panel.appendChild(section);
  });
}
