# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start server (development)
node server.js

# Start via macOS launcher (installs deps, opens browser, survives terminal close)
./start.command

# Run bonus email script manually
node src/scripts/sendBonusEmail.js
```

No build step, no tests. Server runs on port 3001 (`src/config.js`).

## Architecture

Node.js/Express backend (ES modules) serving a vanilla JS frontend. The backend proxies all store API calls — this keeps CORS clean and AH's bearer token server-side.

```
server.js              → Express entry, mounts /api and static public/
src/config.js          → Port config (3001)
src/routes/api.js      → All REST endpoints
src/stores/            → Store adapters (base.js, ah.js, dirk.js, index.js)
src/services/
  productStore.js      → JSON file CRUD for saved products (src/data/products.json)
  priceHistory.js      → Price snapshot storage (src/data/price-history.json)
src/scripts/
  sendBonusEmail.js    → Standalone bonus email script (run via run.sh / sleepwatcher)
public/js/
  api.js               → Fetch wrapper for all /api/* calls
  app.js               → Init + tab switching
  views/               → onSale.js, myProducts.js
  components/          → productCard.js, searchResult.js, productDetail.js, toast.js
  utils/               → unitPrice.js (parseUnitSize, calcPricePerUnit)
```

`src/data/` is auto-created and gitignored. Data persists in JSON files across runs.

## Store Adapter Pattern

Each store extends `StoreAdapter` (src/stores/base.js) and implements:
- `searchProducts(query)` → normalized product array
- `getProductDetail(storeProductId)` → single normalized product
- `checkBonus(savedProducts)` → normalized products where `isBonus: true`

Register in `src/stores/index.js`. All methods normalize to the common schema below.

## Backend API Routes

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/products` | List saved products |
| `POST` | `/api/products` | Save a product |
| `DELETE` | `/api/products/:id` | Remove a saved product |
| `GET` | `/api/search?store=ah&q=koffie` | Proxy search to store |
| `GET` | `/api/product/:store/:storeProductId` | Fetch product detail + record price snapshot |
| `GET` | `/api/bonus` | Check saved products for current bonus status + record snapshots |
| `GET` | `/api/history/:productId` | Get price history for a product |

## Store APIs

### Albert Heijn (AH)
- **Base URL**: `https://api.ah.nl`
- **Auth**: Anonymous bearer token — `POST /mobile-auth/v1/auth/token/anonymous` with `{"clientId": "appie"}`. Token cached in memory with expiry.
- **Headers**: `Authorization: Bearer {token}`, `x-application: AHWEBSHOP`
- **Search**: `GET /mobile-services/product/search/v2?query={term}&page=0&size=25` → `data.products`
- **Detail**: `GET /mobile-services/product/detail/v4/fir/{webshopId}` → `data.productCard`
- **Important**: Use `webshopId` (not `hqId`) as the stable product ID. Bundle products have `hqId: 0`.
- Bonus info in search results is in `discountLabels[0].defaultDescription`

### Dirk van den Broek
- **GraphQL** (full catalog search + product detail): `POST https://web-gateway.dirk.nl/graphql` with header `x-gateway-apikey: 6d3a42a3-6d93-4f98-838d-bcc0ab2307fd`
  - Search: `newSearchProducts(query: { searchTerm, limit })` → `[{ productId }]`
  - Batch details: `listProducts(productIds: [...])` → `{ products: [{ productId, headerText, packaging, brand, department, webgroup }] }`
  - Pricing/offers: `productAssortment(productId, storeId: 36)` → `{ normalPrice, offerPrice, productOffer { productOfferId, textPriceSign, startDate, endDate } }`
  - Single product: `product(productId: N)` → same fields as listProducts
- `productAssortment` is batched using GraphQL aliases (`p0:`, `p1:`, …)
- Dirk product IDs are integers

## Bonus Mechanisms

### AH (`parseBonusMechanism` in src/stores/ah.js)
- `2e gratis` / `1 + 1 gratis` / `2 + 2 gratis` → 50% off (× 0.5)
- `2 + 1 gratis` → 33% off (× 2/3)
- `2e halve prijs` → 25% off (× 0.75)
- `XX%` → dynamic percentage
- `X voor Y euro` → bundle price (total / count)
- `voor Y` → fixed single-item price

### Dirk
- `offerPrice` is the final price; `normalPrice` is the pre-offer price. No calculation needed.
- `textPriceSign` is the bonus mechanism label (normalized: underscores/spaces stripped)

## Common Product Schema

```json
{
  "productId": "string",
  "title": "string",
  "salesUnitSize": "string",
  "bonusMechanism": "string",
  "priceBeforeBonus": "number|null",
  "currentPrice": "number|null",
  "bonusStartDate": "string",
  "bonusEndDate": "string",
  "mainCategory": "string",
  "subCategory": "string",
  "brand": "string",
  "isBonus": "boolean",
  "store": "ah|dirk"
}
```

## Saved Product Data Model (products.json)

```json
{
  "id": "ah-12345",
  "store": "ah",
  "storeProductId": "12345",
  "title": "...",
  "brand": "...",
  "salesUnitSize": "...",
  "mainCategory": "...",
  "subCategory": "...",
  "addedAt": "ISO timestamp"
}
```

Bonus/pricing is NOT saved — always fetched live (changes weekly).

## Price History (priceHistory.js)

Keyed by `{store}-{storeProductId}` (e.g. `ah-588920`). A new snapshot is only appended when `currentPrice`, `isBonus`, or `bonusMechanism` differs from the last entry. Snapshots are recorded automatically on every detail fetch and bonus check.

## Design Decisions

- Backend proxies store calls: CORS + AH token kept server-side
- Dirk search: GraphQL full catalog (not offer-filtered). Bonus data comes from `productAssortment`.
- AH bonus check: individual detail calls per product (acceptable for <50 products)
- Dirk bonus check: batched via `productAssortment` aliases in a single GraphQL request
- Price history deduplication: only write when price/bonus state changes (not every poll)
- `start.command`: survives terminal close via `nohup`; if port 3001 already in use, just opens browser

## Known Limitations

- Dirk `storeProductId` is an integer product ID (stable); previously used `offerId` which changed weekly
- AH individual product checks scale linearly — optimize with bonus page endpoint if needed for large lists
