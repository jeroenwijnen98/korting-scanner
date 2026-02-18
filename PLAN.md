# Plan: Prijsgeschiedenis + Dirk Productzoeken

## Context

Two issues to fix:
1. **No price history** — When clicking a product detail, there's no way to see historical price changes or past bonus periods. Users want to track price trends over time.
2. **Dirk search broken** — The current Dirk search only filters current weekly offers by `headerText`. If no offers are active or the product isn't on sale, you can't find it. Dirk's website uses a GraphQL API at `web-gateway.dirk.nl/graphql` (with public API key `6d3a42a3-6d93-4f98-838d-bcc0ab2307fd`) that supports full product catalog search.

---

## Feature 1: Price History

### Approach
Create a new `src/services/priceHistory.js` that stores snapshots of product price/bonus data in `src/data/price-history.json`. Record a snapshot every time we fetch product data (via bonus check, detail view, or email script). Show history table at bottom of product detail view.

### Data model (`src/data/price-history.json`)
```json
{
  "ah-588920": [
    {
      "date": "2026-02-18",
      "currentPrice": 3.99,
      "priceBeforeBonus": 3.99,
      "isBonus": false,
      "bonusMechanism": "",
      "bonusEndDate": ""
    },
    {
      "date": "2026-02-10",
      "currentPrice": 1.99,
      "priceBeforeBonus": 3.99,
      "isBonus": true,
      "bonusMechanism": "1 + 1 gratis",
      "bonusEndDate": "2026-02-15"
    }
  ]
}
```

Key rules:
- Key = product id (e.g. `ah-588920`)
- Only add a new entry if the last entry differs in `currentPrice`, `isBonus`, or `bonusMechanism` (avoid duplicates for same week)
- Store same columns as the email table: currentPrice, priceBeforeBonus, isBonus, bonusMechanism, bonusEndDate

### Steps

#### 1.1 Create `src/services/priceHistory.js`
- `async recordSnapshot(productId, data)` — appends entry if changed since last
- `async getHistory(productId)` — returns array sorted newest-first
- File: `src/data/price-history.json` (auto-created, already gitignored via `src/data/`)

#### 1.2 Record snapshots in existing code paths
- `src/routes/api.js` — in `GET /api/bonus` handler, after getting bonus results, call `recordSnapshot` for each product
- `src/routes/api.js` — in `GET /api/product/:store/:storeProductId` handler, call `recordSnapshot` after fetching detail
- `src/scripts/sendBonusEmail.js` — after checking bonus, record snapshots

#### 1.3 Add `GET /api/history/:productId` endpoint
- `src/routes/api.js` — returns history array from priceHistory service
- `public/js/api.js` — add `getProductHistory(productId)` function

#### 1.4 Show history in product detail view
- `public/js/components/productDetail.js` — accept optional `history` array param
- Render a "Prijsgeschiedenis" section at the bottom with a table:
  - Columns: Datum, Prijs, Actie, Per eenheid, Normaal /eenheid
  - Reuse `parseUnitSize`/`calcPricePerUnit` from `public/js/utils/unitPrice.js`
  - Bonus rows highlighted with accent color
- `public/css/components.css` — add history table styles

#### 1.5 Fetch history in views
- `public/js/views/onSale.js` — in `showDetail()`, fetch history and pass to `createProductDetail`
- `public/js/views/myProducts.js` — in `showProductDetail()`, fetch history and pass to `createProductDetail`

---

## Feature 2: Dirk Full Product Search

### Approach
Replace the offers-only search with the dirk.nl GraphQL API (`web-gateway.dirk.nl/graphql`). This provides full catalog search. Keep the existing offers API for bonus checking.

### Discovery needed during implementation
The exact GraphQL query/mutation for product search needs to be determined. I'll:
1. Try GraphQL introspection on the endpoint
2. If that fails, inspect a Nuxt JS bundle from dirk.nl for the query string

### Steps

#### 2.1 Add GraphQL search to `src/stores/dirk.js`
- Add `searchProductsGraphQL(query)` method using `web-gateway.dirk.nl/graphql`
- Headers: `x-gateway-apikey: 6d3a42a3-6d93-4f98-838d-bcc0ab2307fd`, `Content-Type: application/json`
- Normalize GraphQL response to existing product schema
- Keep `fetchAllOffers()` for bonus checking (unchanged)
- Update `searchProducts()` to use GraphQL instead of offer filtering
- GraphQL results won't have bonus info — set `isBonus: false` for search results

#### 2.2 Update `getProductDetail` for Dirk
- Currently only looks in offers cache — also try GraphQL for non-offer products
- Saved Dirk products that aren't currently on offer should still return detail data

---

## Files to modify

| File | Change |
|------|--------|
| `src/services/priceHistory.js` | **New** — snapshot storage |
| `src/routes/api.js` | Add history endpoint + record snapshots |
| `src/scripts/sendBonusEmail.js` | Record snapshots after bonus check |
| `public/js/api.js` | Add `getProductHistory()` |
| `public/js/components/productDetail.js` | Add history table section |
| `public/js/views/onSale.js` | Fetch + pass history |
| `public/js/views/myProducts.js` | Fetch + pass history |
| `public/css/components.css` | History table styles |
| `src/stores/dirk.js` | GraphQL search + updated detail |

---

## Verification

1. Start server, open "In de Bonus" tab → click product → history section visible (may be empty initially)
2. Refresh bonus → click same product → history now shows entry
3. Switch to "Mijn Producten" → select DIRK pill → search "koffie" → results from full catalog appear
4. Add a Dirk product from search → it saves correctly
5. Run `node src/scripts/sendBonusEmail.js` → snapshots recorded in `src/data/price-history.json`
