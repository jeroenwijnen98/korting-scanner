// @ts-check
import { getProducts, addProduct, removeProduct, updateProduct, searchProducts, getProductDetail, getProductHistory, getGroupHistory, syncProductImages } from '../api.js';
import { createProductCard } from '../components/productCard.js';
import { createProductDetail } from '../components/productDetail.js';
import { createSearchResult } from '../components/searchResult.js';
import { showToast } from '../components/toast.js';
import { renderGroupedSections } from '../components/groupedSections.js';
import { errorMessage } from '../utils/errorMessage.js';
import { STORES } from '../utils/stores.js';
import { savedProductId } from '../utils/savedProductId.js';
import { groupPauseAction } from '../utils/groupPause.js';

/**
 * @typedef {import('../../../src/types.ts').StoreName} StoreName
 * @typedef {import('../../../src/types.ts').Product} Product
 * @typedef {import('../../../src/types.ts').SavedProduct} SavedProduct
 * @typedef {import('../../../src/types.ts').PriceSnapshot} PriceSnapshot
 * @typedef {import('../../../src/types.ts').GroupHistoryEntry} GroupHistoryEntry
 * @typedef {StoreName | 'alle'} StoreFilter
 */

const panel = document.getElementById('panel-my-products');
/** @type {SavedProduct[]} */
let savedProducts = [];
/** @type {StoreFilter} */
let activeStore = 'ah';
/** @type {number | undefined} */
let searchTimeout;
/** @type {string[]} */
let unavailableIds = [];

/** @param {string[]} ids saved product ids the last bonus check could not find */
export function setUnavailableIds(ids) {
  unavailableIds = ids || [];
  renderSaved();
}

export async function initMyProducts() {
  panel.innerHTML = '';

  // Store pills
  const pills = document.createElement('div');
  pills.className = 'store-pills';
  /** @type {StoreFilter[]} */
  const stores = ['alle', .../** @type {StoreName[]} */ (Object.keys(STORES))];
  stores.forEach(store => {
    const pill = document.createElement('button');
    pill.className = `store-pill${store === 'ah' ? ' active' : ''}`;
    pill.textContent = store === 'alle' ? 'Alle' : STORES[store].label;
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
  const clearBtn = /** @type {HTMLButtonElement} */ (searchBar.querySelector('.search-bar-clear'));

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
        showToast(errorMessage(err), 'error');
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

  renderGroupedSections(container, filtered, product => {
    const card = createProductCard(product, {
      isUnavailable: unavailableIds.includes(product.id),
      isPaused: Boolean(product.paused),
      onTogglePause: async (p) => {
        const paused = !p.paused;
        try {
          const updated = await updateProduct(p.id, { paused });
          savedProducts = savedProducts.map(s => (s.id === updated.id ? updated : s));
          renderSaved();
          showToast(paused ? 'Product gepauzeerd' : 'Product hervat', 'success');
        } catch (err) {
          showToast(errorMessage(err), 'error');
        }
      },
      onRemove: async (p) => {
        try {
          await removeProduct(p.id);
          savedProducts = savedProducts.filter(s => s.id !== p.id);
          renderSaved();
          showToast('Product verwijderd', 'success');
        } catch (err) {
          showToast(errorMessage(err), 'error');
        }
      },
    });
    card.addEventListener('click', () => showProductDetail(product));
    return card;
  }, createGroupPauseButton);
}

/**
 * The header button that pauses or resumes a whole product group. It acts on,
 * and takes its label from, every member across all stores, not only the ones
 * the store filter shows.
 * @param {string} productGroup
 * @returns {HTMLButtonElement}
 */
function createGroupPauseButton(productGroup) {
  const { paused } = groupPauseAction(savedProducts, productGroup);
  const btn = document.createElement('button');
  btn.className = 'btn btn-ghost btn-sm group-section-pause';
  btn.textContent = paused ? 'Pauzeren' : 'Hervatten';
  btn.title = paused ? 'Bonus van de hele groep voorlopig niet melden' : 'Bonus van de hele groep weer melden';
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    // Taken again on click: the list may have changed since this render
    const action = groupPauseAction(savedProducts, productGroup);
    const results = await Promise.allSettled(
      action.ids.map(id => updateProduct(id, { paused: action.paused })),
    );
    const updated = new Map();
    for (const r of results) if (r.status === 'fulfilled') updated.set(r.value.id, r.value);
    savedProducts = savedProducts.map(s => updated.get(s.id) || s);
    renderSaved();
    const failed = results.find(r => r.status === 'rejected');
    if (failed) showToast(errorMessage(/** @type {PromiseRejectedResult} */ (failed).reason), 'error');
    else showToast(action.paused ? 'Groep gepauzeerd' : 'Groep hervat', 'success');
  });
  return btn;
}

/** @param {SavedProduct} product */
async function showProductDetail(product) {
  panel.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Laden...</p></div>';
  const productId = product.id || savedProductId(product.store, product.storeProductId);

  /** @type {PriceSnapshot[]} */
  let history = [];
  /** @type {GroupHistoryEntry[]} */
  let groupHistory = [];
  /** @type {Product | null} */
  let detail = null;

  try {
    [history, groupHistory, detail] = await Promise.all([
      getProductHistory(productId).catch(() => /** @type {PriceSnapshot[]} */ ([])),
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
    showBonus: detail?.isBonus || false,
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

/**
 * @param {Product[]} results
 * @param {HTMLElement} container
 */
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
    const productId = savedProductId(store, product.productId);
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
            imageUrl: p.imageUrl,
          });
          savedProducts.push(entry);
          showToast('Product toegevoegd', 'success');
          // Re-render search results to show checkmark
          renderSearchResults(results, container);
        } catch (err) {
          showToast(errorMessage(err), 'error');
        }
      },
    });
    container.appendChild(row);
  });
}
