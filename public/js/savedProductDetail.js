// @ts-check
import { getSavedProductDetail } from './api.js';
import { createProductDetail } from './components/productDetail.js';
import { showToast } from './components/toast.js';
import { errorMessage } from './utils/errorMessage.js';
import { savedProductDetailView } from './utils/savedProductDetailView.js';
import { savedList } from './savedList.js';

/**
 * @typedef {import('../../src/types.ts').SavedProductDetail} SavedProductDetail
 */

/**
 * Pauses or resumes a saved product, for the card and the detail.
 * @param {string} id
 * @returns {Promise<boolean>} whether it is paused afterwards, also when that
 *   failed
 */
export async function togglePause(id) {
  const paused = !savedList.get(id)?.paused;
  try {
    await savedList.setPaused(id, paused);
    showToast(paused ? 'Product gepauzeerd' : 'Product hervat', 'success');
  } catch (err) {
    showToast(errorMessage(err), 'error');
  }
  return Boolean(savedList.get(id)?.paused);
}

/**
 * Opens a saved product's detail in `panel`, for My products and On sale
 * alike. It is loaded in one request; after a product group change it opens
 * again, so it shows the new group and its history.
 * @param {string} savedId
 * @param {{ panel: HTMLElement, onBack: () => void }} options `onBack` puts
 *   the view that opened it back in the panel
 */
export async function openSavedProductDetail(savedId, { panel, onBack }) {
  panel.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Laden...</p></div>';

  /** @type {SavedProductDetail | null} */
  let detail = null;
  try {
    detail = await getSavedProductDetail(savedId);
    // The server synced its image while observing it
    savedList.merge([detail.saved]);
  } catch (err) {
    showToast(errorMessage(err), 'error');
  }

  const view = savedProductDetailView(detail, savedList.get(savedId));
  if (!view) {
    onBack();
    return;
  }

  panel.innerHTML = '';
  panel.appendChild(createProductDetail(view.product, {
    showBonus: view.showBonus,
    history: view.history,
    groupHistory: view.groupHistory,
    savedProduct: view.saved,
    existingGroups: savedList.productGroups(),
    onProductGroupChange: async (id, productGroup) => {
      await savedList.setProductGroup(id, productGroup);
      openSavedProductDetail(savedId, { panel, onBack });
    },
    onTogglePause: () => togglePause(savedId),
    onBack,
  }));
}
