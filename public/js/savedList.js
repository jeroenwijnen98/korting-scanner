// @ts-check
import { getProducts, addProduct, updateProduct, removeProduct } from './api.js';
import { createSavedProductList } from './savedProducts.js';

/** The one saved-product list both views (My products, On sale) read and edit. */
export const savedList = createSavedProductList({ getProducts, addProduct, updateProduct, removeProduct });
