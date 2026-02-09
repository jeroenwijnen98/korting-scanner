import { Router } from 'express';
import * as productStore from '../services/productStore.js';
import { stores } from '../stores/index.js';

export const router = Router();

// List saved products
router.get('/products', async (req, res) => {
  try {
    const products = await productStore.getAll();
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save a product
router.post('/products', async (req, res) => {
  try {
    const entry = await productStore.add(req.body);
    if (!entry) {
      return res.status(409).json({ error: 'Product already saved' });
    }
    res.status(201).json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remove a saved product
router.delete('/products/:id', async (req, res) => {
  try {
    const removed = await productStore.remove(req.params.id);
    if (!removed) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Search products from a store
router.get('/search', async (req, res) => {
  try {
    const { store, q } = req.query;
    if (!store || !q) {
      return res.status(400).json({ error: 'store and q params required' });
    }
    const adapter = stores[store];
    if (!adapter) {
      return res.status(400).json({ error: `Unknown store: ${store}` });
    }
    const results = await adapter.searchProducts(q);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check bonus status for saved products
router.get('/bonus', async (req, res) => {
  try {
    const saved = await productStore.getAll();
    if (saved.length === 0) {
      return res.json([]);
    }
    const results = [];
    for (const [storeName, adapter] of Object.entries(stores)) {
      const storeProducts = saved.filter(p => p.store === storeName);
      if (storeProducts.length === 0) continue;
      const bonusResults = await adapter.checkBonus(storeProducts);
      results.push(...bonusResults);
    }
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
