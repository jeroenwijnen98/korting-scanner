import { getProducts, addProduct, removeProduct, searchProducts, getProductDetail, getProductHistory, getGroupHistory, syncProductImages } from '../api.js';
import { createProductCard } from '../components/productCard.js';
import { createProductDetail } from '../components/productDetail.js';
import { createSearchResult } from '../components/searchResult.js';
import { showToast } from '../components/toast.js';
import { parseUnitSize, calcPricePerUnit } from '../utils/unitPrice.js';

const panel = document.getElementById('panel-my-products');
let savedProducts = [];
let activeStore = 'ah';
let searchTimeout = null;
let unavailableIds = [];

export function setUnavailableIds(ids) {
  unavailableIds = ids || [];
  renderSaved();
}

export async function initMyProducts() {
  panel.innerHTML = '';

  // Store pills
  const pills = document.createElement('div');
  pills.className = 'store-pills';
  ['alle', 'ah', 'dirk', 'kruidvat', 'etos'].forEach(store => {
    const pill = document.createElement('button');
    pill.className = `store-pill${store === 'ah' ? ' active' : ''}`;
    const storeLabels = { alle: 'Alle', ah: 'AH', dirk: 'Dirk', kruidvat: 'Kruidvat', etos: 'Etos' };
    pill.textContent = storeLabels[store] || store.toUpperCase();
    pill.dataset.store = store;
    pill.addEventListener('click', () => {
      pills.querySelectorAll('.store-pill').forEach(p => p.classList.toggle('active', p === pill));
      activeStore = store;
      renderSaved();
      // Clear search when switching store
      searchInput.value = '';
      clearBtn.hidden = true;
      resultsContainer.innerHTML = '';
      resultsContainer.style.display = 'none';
    });
    pills.appendChild(pill);
  });
  panel.appendChild(pills);

  // Search bar
  const searchBar = document.createElement('div');
  searchBar.className = 'search-bar';
  searchBar.innerHTML = `
    <svg class="search-bar-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="8"></circle>
      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
    </svg>
    <input type="text" placeholder="Zoek producten..." id="search-input">
    <button type="button" class="search-bar-clear" aria-label="Wissen" hidden>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  `;
  panel.appendChild(searchBar);
  const searchInput = searchBar.querySelector('input');
  const clearBtn = searchBar.querySelector('.search-bar-clear');

  // Search results container
  const resultsContainer = document.createElement('div');
  resultsContainer.className = 'card-list';
  resultsContainer.style.display = 'none';
  panel.appendChild(resultsContainer);

  // Saved products container
  const savedContainer = document.createElement('div');
  savedContainer.id = 'saved-products';
  panel.appendChild(savedContainer);

  const resetSearch = () => {
    resultsContainer.innerHTML = '';
    resultsContainer.style.display = 'none';
    savedContainer.style.display = '';
    renderSaved();
  };

  clearBtn.addEventListener('click', () => {
    clearTimeout(searchTimeout);
    searchInput.value = '';
    clearBtn.hidden = true;
    resetSearch();
    searchInput.focus();
  });

  // Search input handler with debounce
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const query = searchInput.value.trim();
    clearBtn.hidden = searchInput.value.length === 0;
    if (!query) {
      resetSearch();
      return;
    }
    searchTimeout = setTimeout(async () => {
      const store = activeStore === 'alle' ? 'ah' : activeStore;
      try {
        savedContainer.style.display = 'none';
        resultsContainer.style.display = '';
        resultsContainer.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Zoeken...</p></div>';
        const results = await searchProducts(store, query);
        renderSearchResults(results, resultsContainer);
      } catch (err) {
        showToast(err.message, 'error');
        resultsContainer.innerHTML = '';
      }
    }, 300);
  });

  await loadSaved();
}

async function loadSaved() {
  try {
    savedProducts = await getProducts();
    renderSaved();

    // Backfill images for existing saved products (fire once, re-render when done)
    const hasMissingImages = savedProducts.some(p => !p.imageUrl);
    if (hasMissingImages) {
      syncProductImages().then(enriched => {
        savedProducts = enriched;
        renderSaved();
      }).catch(() => {});
    }
  } catch (err) {
    showToast('Kon producten niet laden', 'error');
  }
}

function getUnitPriceForSort(product) {
  if (product.currentPrice == null) return null;
  const { volume, unit } = parseUnitSize(product.salesUnitSize);
  const result = calcPricePerUnit(product.currentPrice, volume, unit);
  return result ? result.unitPrice : null;
}

function renderSaved() {
  const container = document.getElementById('saved-products');
  if (!container) return;
  container.innerHTML = '';

  const filtered = activeStore === 'alle'
    ? savedProducts
    : savedProducts.filter(p => p.store === activeStore);

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">+</div>
        <h3>Geen producten</h3>
        <p>Zoek hierboven om producten toe te voegen</p>
      </div>
    `;
    return;
  }

  // Split into grouped and ungrouped
  const withGroup = filtered.filter(p => p.productGroup);
  const withoutGroup = filtered.filter(p => !p.productGroup);

  // Group withGroup products by productGroup name
  const groups = {};
  withGroup.forEach(p => {
    if (!groups[p.productGroup]) groups[p.productGroup] = [];
    groups[p.productGroup].push(p);
  });

  // Sort each group by unit price ascending (null prices last, fallback to title)
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
      const card = createProductCard(product, {
        isUnavailable: unavailableIds.includes(product.id),
        onRemove: async (p) => {
          try {
            await removeProduct(p.id);
            savedProducts = savedProducts.filter(s => s.id !== p.id);
            renderSaved();
            showToast('Product verwijderd', 'success');
          } catch (err) {
            showToast(err.message, 'error');
          }
        },
      });
      card.addEventListener('click', () => showProductDetail(product));
      list.appendChild(card);
    });
    section.appendChild(list);
    container.appendChild(section);
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
      const card = createProductCard(product, {
        isUnavailable: unavailableIds.includes(product.id),
        onRemove: async (p) => {
          try {
            await removeProduct(p.id);
            savedProducts = savedProducts.filter(s => s.id !== p.id);
            renderSaved();
            showToast('Product verwijderd', 'success');
          } catch (err) {
            showToast(err.message, 'error');
          }
        },
      });
      card.addEventListener('click', () => showProductDetail(product));
      list.appendChild(card);
    });
    section.appendChild(list);

    container.appendChild(section);
  });
}

async function showProductDetail(product) {
  panel.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Laden...</p></div>';
  const productId = product.id || `${product.store}-${product.storeProductId}`;

  let history = [];
  let groupHistory = [];
  let detail = null;

  try {
    [history, groupHistory, detail] = await Promise.all([
      getProductHistory(productId).catch(() => []),
      product.productGroup ? getGroupHistory(product.productGroup) : Promise.resolve([]),
      getProductDetail(product.store, product.storeProductId),
    ]);
  } catch { /* detail fetch failed, fall through */ }

  // Merge saved product's id and productGroup into the live detail object
  const enrichedDetail = detail
    ? { ...detail, id: product.id, productGroup: product.productGroup || null }
    : { ...product };

  const existingGroups = [...new Set(
    savedProducts.map(s => s.productGroup).filter(Boolean)
  )];

  // The savedProduct is the object from savedProducts that matches this product
  const savedProduct = savedProducts.find(s => s.id === productId) || null;

  panel.innerHTML = '';
  const detailEl = createProductDetail(enrichedDetail, {
    showBonus: enrichedDetail.isBonus || false,
    history,
    groupHistory,
    savedProduct,
    existingGroups,
    onProductGroupChange: (id, groupName) => {
      // Update savedProducts in memory
      const idx = savedProducts.findIndex(s => s.id === id);
      if (idx !== -1) {
        savedProducts[idx] = { ...savedProducts[idx], productGroup: groupName || null };
      }
      // Re-render saved list
      renderSaved();
      // Re-open detail with updated product
      const updatedProduct = idx !== -1
        ? savedProducts[idx]
        : { ...product, productGroup: groupName || null };
      showProductDetail(updatedProduct);
    },
    onBack: () => initMyProducts(),
  });
  panel.appendChild(detailEl);
}

function renderSearchResults(results, container) {
  container.innerHTML = '';

  if (results.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>Geen resultaten</h3>
        <p>Probeer een andere zoekterm</p>
      </div>
    `;
    return;
  }

  results.forEach(product => {
    const savedIds = savedProducts.map(p => p.id);
    const store = activeStore === 'alle' ? 'ah' : activeStore;
    const productId = `${store}-${product.productId}`;
    const isSaved = savedIds.includes(productId);

    const row = createSearchResult(product, {
      isSaved,
      onAdd: async (p) => {
        try {
          const entry = await addProduct({
            store,
            storeProductId: p.productId,
            title: p.title,
            brand: p.brand,
            salesUnitSize: p.salesUnitSize,
            mainCategory: p.mainCategory,
            subCategory: p.subCategory,
          });
          savedProducts.push(entry);
          showToast('Product toegevoegd', 'success');
          // Re-render search results to show checkmark
          renderSearchResults(results, container);
        } catch (err) {
          showToast(err.message, 'error');
        }
      },
    });
    container.appendChild(row);
  });
}
