import { getBonus, getProducts, getProductHistory, getGroupHistory } from '../api.js';
import { createProductCard } from '../components/productCard.js';
import { createProductDetail } from '../components/productDetail.js';
import { showToast } from '../components/toast.js';
import { parseUnitSize, calcPricePerUnit } from '../utils/unitPrice.js';
import { setUnavailableIds } from './myProducts.js';

const panel = document.getElementById('panel-on-sale');

export async function initOnSale() {
  panel.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Bonus checken...</p></div>';

  // Animate refresh button
  const refreshBtn = document.getElementById('refresh-btn');
  refreshBtn.classList.add('refreshing');

  try {
    const [bonusData, savedProducts] = await Promise.all([getBonus(), getProducts()]);
    refreshBtn.classList.remove('refreshing');

    const { bonusProducts, notFound } = bonusData;

    // Share notFound ids with myProducts view for unavailability indicators
    setUnavailableIds(notFound);

    // Enrich bonus products with productGroup from matching saved product
    const enriched = bonusProducts.map(p => {
      const savedId = `${p.store}-${p.productId}`;
      const match = savedProducts.find(s => s.id === savedId);
      return match?.productGroup ? { ...p, productGroup: match.productGroup } : p;
    });

    render(enriched, savedProducts, notFound);
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

async function showDetail(product, allProducts, savedProducts, notFound = []) {
  panel.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Laden...</p></div>';
  const productId = product.savedId || `${product.store}-${product.productId}`;

  let history = [];
  let groupHistory = [];
  try {
    [history, groupHistory] = await Promise.all([
      getProductHistory(productId),
      product.productGroup ? getGroupHistory(product.productGroup) : Promise.resolve([]),
    ]);
  } catch { /* ignore */ }

  const existingGroups = [...new Set(
    savedProducts.map(s => s.productGroup).filter(Boolean)
  )];

  const savedId = `${product.store}-${product.productId}`;
  const savedProduct = savedProducts.find(s => s.id === savedId) || null;

  panel.innerHTML = '';
  const detail = createProductDetail(product, {
    showBonus: true,
    history,
    groupHistory,
    savedProduct,
    existingGroups,
    onProductGroupChange: (id, groupName) => {
      // Update in allProducts (enriched bonus list)
      const idx = allProducts.findIndex(p => {
        const sid = `${p.store}-${p.productId}`;
        return sid === id || p.savedId === id;
      });
      if (idx !== -1) {
        allProducts[idx] = { ...allProducts[idx], productGroup: groupName || null };
      }

      // Update in savedProducts
      const sIdx = savedProducts.findIndex(s => s.id === id);
      if (sIdx !== -1) {
        savedProducts[sIdx] = { ...savedProducts[sIdx], productGroup: groupName || null };
      }

      // Re-open detail with updated product
      const updatedProduct = idx !== -1 ? allProducts[idx] : { ...product, productGroup: groupName || null };
      showDetail(updatedProduct, allProducts, savedProducts, notFound);
    },
    onBack: () => render(allProducts, savedProducts, notFound),
  });
  panel.appendChild(detail);
}

function getUnitPriceForSort(product) {
  if (product.currentPrice == null) return null;
  const { volume, unit } = parseUnitSize(product.salesUnitSize);
  const result = calcPricePerUnit(product.currentPrice, volume, unit);
  return result ? result.unitPrice : null;
}

function render(products, savedProducts, notFound = []) {
  panel.innerHTML = '';

  // Warning banner for unavailable products
  if (notFound.length > 0) {
    const unavailableNames = notFound
      .map(id => savedProducts.find(s => s.id === id)?.title || id)
      .join(', ');
    const banner = document.createElement('div');
    banner.className = 'unavailable-banner';
    banner.innerHTML = `<strong>Niet meer beschikbaar:</strong> ${unavailableNames}`;
    panel.appendChild(banner);
  }

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

  // Split into grouped and ungrouped
  const withGroup = products.filter(p => p.productGroup);
  const withoutGroup = products.filter(p => !p.productGroup);

  // Group withGroup products by productGroup name
  const groups = {};
  withGroup.forEach(p => {
    if (!groups[p.productGroup]) groups[p.productGroup] = [];
    groups[p.productGroup].push(p);
  });

  // Sort each group by unit price ascending (null prices last)
  Object.values(groups).forEach(items => {
    items.sort((a, b) => {
      const ua = getUnitPriceForSort(a);
      const ub = getUnitPriceForSort(b);
      if (ua == null && ub == null) return 0;
      if (ua == null) return 1;
      if (ub == null) return -1;
      return ua - ub;
    });
  });

  // Render ungrouped products first with a section header
  if (withoutGroup.length > 0) {
    const section = document.createElement('div');
    section.className = 'group-section';

    const header = document.createElement('div');
    header.className = 'group-section-header';
    header.innerHTML = `
      <span class="group-section-name">Niet gecategoriseerd</span>
      <span class="group-section-count">${withoutGroup.length} product${withoutGroup.length !== 1 ? 'en' : ''}</span>
    `;
    section.appendChild(header);

    const list = document.createElement('div');
    list.className = 'card-list';
    withoutGroup.forEach(product => {
      const card = createProductCard(product, { showBonus: true });
      card.addEventListener('click', () => showDetail(product, products, savedProducts, notFound));
      list.appendChild(card);
    });
    section.appendChild(list);
    panel.appendChild(section);
  }

  // Render group sections
  Object.entries(groups).forEach(([groupName, items]) => {
    const section = document.createElement('div');
    section.className = 'group-section';

    const header = document.createElement('div');
    header.className = 'group-section-header';
    header.innerHTML = `
      <span class="group-section-name">${groupName}</span>
      <span class="group-section-count">${items.length} product${items.length !== 1 ? 'en' : ''}</span>
    `;
    section.appendChild(header);

    const list = document.createElement('div');
    list.className = 'card-list';
    items.forEach(product => {
      const card = createProductCard(product, { showBonus: true });
      card.addEventListener('click', () => showDetail(product, products, savedProducts, notFound));
      list.appendChild(card);
    });
    section.appendChild(list);

    panel.appendChild(section);
  });
}
