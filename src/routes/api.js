import { Router } from 'express';
import * as productStore from '../services/productStore.js';
import * as priceHistory from '../services/priceHistory.js';
import { stores } from '../stores/index.js';
import { parseUnitSize, calcPricePerUnit } from '../utils/unitPrice.js';

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

// Get product detail from store
router.get('/product/:store/:storeProductId', async (req, res) => {
  try {
    const { store, storeProductId } = req.params;
    const adapter = stores[store];
    if (!adapter) {
      return res.status(400).json({ error: `Unknown store: ${store}` });
    }
    const detail = await adapter.getProductDetail(storeProductId);
    if (!detail) {
      return res.status(404).json({ error: 'Product not found' });
    }
    priceHistory.recordSnapshot(`${store}-${storeProductId}`, detail).catch(() => {});
    res.json(detail);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Backfill imageUrl for saved products that are missing it
router.post('/products/sync-images', async (req, res) => {
  try {
    const saved = await productStore.getAll();
    const missing = saved.filter(p => !p.imageUrl);
    await Promise.all(missing.map(async (p) => {
      try {
        const adapter = stores[p.store];
        if (!adapter) return;
        const detail = await adapter.getProductDetail(p.storeProductId);
        if (detail?.imageUrl) {
          await productStore.update(p.id, { imageUrl: detail.imageUrl });
        }
      } catch { /* skip on error */ }
    }));
    res.json(await productStore.getAll());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get price history for a product
router.get('/history/:productId', async (req, res) => {
  try {
    const history = await priceHistory.getHistory(req.params.productId);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check bonus status for saved products
router.get('/bonus', async (req, res) => {
  try {
    const saved = await productStore.getAll();
    if (saved.length === 0) {
      return res.json({ bonusProducts: [], notFound: [] });
    }
    const bonusProducts = [];
    const notFound = [];
    for (const [storeName, adapter] of Object.entries(stores)) {
      const storeProducts = saved.filter(p => p.store === storeName);
      if (storeProducts.length === 0) continue;
      const { results, notFound: storeNotFound } = await adapter.checkBonus(storeProducts);
      for (const product of results) {
        priceHistory.recordSnapshot(product.savedId || `${storeName}-${product.productId}`, product).catch(() => {});
      }
      bonusProducts.push(...results);
      notFound.push(...(storeNotFound || []));
    }
    res.json({ bonusProducts, notFound });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update a saved product (e.g. set productGroup)
router.patch('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { productGroup } = req.body;
    const updated = await productStore.update(id, { productGroup: productGroup ?? null });
    if (!updated) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get cheapest-per-unit history for a product group
router.get('/group-history/:groupName', async (req, res) => {
  try {
    const { groupName } = req.params;

    // 1. Find all saved products in this group
    const all = await productStore.getAll();
    const groupProducts = all.filter(p => p.productGroup === groupName);
    if (groupProducts.length === 0) {
      return res.json([]);
    }

    // 2. Load price history for each product (oldest-first)
    const historiesByProduct = await Promise.all(
      groupProducts.map(async (p) => {
        const entries = await priceHistory.getHistory(p.id); // newest-first
        return {
          saved: p,
          entries: [...entries].reverse(), // oldest-first
        };
      })
    );

    // 3. Collect all unique dates across all histories
    const dateSet = new Set();
    for (const { entries } of historiesByProduct) {
      for (const entry of entries) {
        dateSet.add(entry.date);
      }
    }
    const allDates = [...dateSet].sort(); // ascending

    if (allDates.length === 0) {
      return res.json([]);
    }

    // 4. For each date, find each product's effective state (most recent snapshot <= date)
    //    then compute unit price and pick the cheapest
    const results = [];
    for (const date of allDates) {
      let cheapest = null;
      let cheapestUnitPrice = Infinity;

      for (const { saved, entries } of historiesByProduct) {
        // Most recent snapshot on or before this date
        const snapshot = [...entries].reverse().find(e => e.date <= date);
        if (!snapshot) continue;

        const price = snapshot.currentPrice;
        if (price == null) continue;

        const { volume, unit } = parseUnitSize(saved.salesUnitSize);
        const calc = calcPricePerUnit(price, volume, unit);

        const unitPriceVal = calc ? calc.unitPrice : price;
        const standardUnit = calc ? calc.standardUnit : null;

        if (unitPriceVal < cheapestUnitPrice) {
          cheapestUnitPrice = unitPriceVal;
          cheapest = {
            date,
            title: saved.title,
            store: saved.store,
            salesUnitSize: saved.salesUnitSize,
            currentPrice: snapshot.currentPrice,
            priceBeforeBonus: snapshot.priceBeforeBonus,
            isBonus: snapshot.isBonus,
            bonusMechanism: snapshot.bonusMechanism,
            unitPrice: calc ? calc.unitPrice : null,
            standardUnit,
          };
        }
      }

      if (cheapest) {
        results.push(cheapest);
      }
    }

    // 5. Return newest-first
    res.json(results.reverse());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
