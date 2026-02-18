import { getProducts, addProduct, removeProduct, searchProducts, getProductDetail, getProductHistory } from '../api.js';
import { createProductCard } from '../components/productCard.js';
import { createProductDetail } from '../components/productDetail.js';
import { createSearchResult } from '../components/searchResult.js';
import { showToast } from '../components/toast.js';

const panel = document.getElementById('panel-my-products');
let savedProducts = [];
let activeStore = 'ah';
let searchTimeout = null;

export async function initMyProducts() {
  panel.innerHTML = '';

  // Store pills
  const pills = document.createElement('div');
  pills.className = 'store-pills';
  ['alle', 'ah', 'dirk'].forEach(store => {
    const pill = document.createElement('button');
    pill.className = `store-pill${store === 'ah' ? ' active' : ''}`;
    pill.textContent = store === 'alle' ? 'Alle' : store.toUpperCase();
    pill.dataset.store = store;
    pill.addEventListener('click', () => {
      pills.querySelectorAll('.store-pill').forEach(p => p.classList.toggle('active', p === pill));
      activeStore = store;
      renderSaved();
      // Clear search when switching store
      searchInput.value = '';
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
  `;
  panel.appendChild(searchBar);
  const searchInput = searchBar.querySelector('input');

  // Search results container
  const resultsContainer = document.createElement('div');
  resultsContainer.className = 'card-list';
  resultsContainer.style.display = 'none';
  panel.appendChild(resultsContainer);

  // Saved products container
  const savedContainer = document.createElement('div');
  savedContainer.className = 'card-list';
  savedContainer.id = 'saved-products';
  panel.appendChild(savedContainer);

  // Search input handler with debounce
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const query = searchInput.value.trim();
    if (!query) {
      resultsContainer.innerHTML = '';
      resultsContainer.style.display = 'none';
      savedContainer.style.display = '';
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
  } catch (err) {
    showToast('Kon producten niet laden', 'error');
  }
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

  filtered.forEach(product => {
    const card = createProductCard(product, {
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
    container.appendChild(card);
  });
}

async function showProductDetail(product) {
  panel.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Laden...</p></div>';
  const productId = product.id || `${product.store}-${product.storeProductId}`;
  let history = [];
  try {
    history = await getProductHistory(productId);
  } catch { /* ignore */ }
  try {
    const detail = await getProductDetail(product.store, product.storeProductId);
    panel.innerHTML = '';
    const detailEl = createProductDetail(detail, {
      showBonus: detail.isBonus,
      history,
      onBack: () => initMyProducts(),
    });
    panel.appendChild(detailEl);
  } catch {
    panel.innerHTML = '';
    const detailEl = createProductDetail(product, {
      showBonus: false,
      history,
      onBack: () => initMyProducts(),
    });
    panel.appendChild(detailEl);
  }
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
