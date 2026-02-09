# Korting Scanner

Browser-based discount scanner for Dutch supermarkets. Monitors product bonuses/sales across stores.

## Architecture Reference

Based on **sports-tracker** pattern:
- Node.js/Express backend serving static frontend
- `start.command` launcher (detects node, manages port, opens browser, cleans Terminal)
- Port 3001 (3000 is sports-tracker), vanilla JS frontend in `public/`, backend in `src/`
- ES modules (`"type": "module"` in package.json)

## Store APIs

### Albert Heijn (AH)
- **Base URL**: `https://api.ah.nl`
- **Auth**: Anonymous bearer token via `POST /mobile-auth/v1/auth/token/anonymous` with body `{"clientId": "appie"}`
- **Headers**: `Authorization: Bearer {token}`, `x-application: AHWEBSHOP`, `Content-Type: application/json`
- **Product search**: `GET /mobile-services/product/search/v2?query={term}&page=0&size=25`
- **Bonus page**: `GET /mobile-services/bonuspage/v1/segment?date={date}&segmentId=&includeActivatableDiscount=false`
- **Product detail**: `GET /mobile-services/product/detail/v4/fir/{product_id}`
- Key fields: `hqId`, `title`, `salesUnitSize`, `bonusMechanism`, `priceBeforeBonus`, `bonusStartDate`, `bonusEndDate`, `mainCategory`, `subCategory`, `brand`, `isBonus`

### Dirk van den Broek
- **Base URL**: `https://www.dirk.nl/api`
- **Auth**: None (public API)
- **Current offers**: `GET /offers/current/{page}` — paginated, returns `currentOffers` array
- **Search**: Filter offers locally by `headerText` (case-insensitive)
- Key fields: `offerId`, `headerText`, `offerPrice`, `packaging`, `textPriceSign`, `startDate`, `endDate`, `products[0].productInformation.{department,webgroup,brand}`
- Bonus multipliers: `actie_` and `vr, za & zo_actie` both map to 1.0 (offerPrice is already the final price)

## Bonus Mechanisms (from Bonus Scanner)

### AH multipliers
- `2e gratis` / `1 + 1 gratis` / `2 + 2 gratis` → 50% off
- `2 + 1 gratis` → 33% off
- `2e halve prijs` → 25% off
- `XX%` → dynamic percentage
- `X voor Y euros` → bundle price

### Dirk
- Price given directly as `offerPrice` (no calculation needed)

## Common Product Schema (normalized)

```json
{
  "productId": "string|number",
  "title": "string",
  "salesUnitSize": "string (e.g. 250ml, 500g)",
  "bonusMechanism": "string",
  "priceBeforeBonus": "number",
  "currentPrice": "number (calculated)",
  "bonusStartDate": "string",
  "bonusEndDate": "string",
  "mainCategory": "string",
  "subCategory": "string",
  "brand": "string",
  "isBonus": "boolean",
  "store": "string (ah|dirk)"
}
```

## Store Adapter Pattern

Each store implements: `searchProducts(query)`, `checkBonus(savedProducts)`, normalize internally.
New stores added by creating adapter file in `src/stores/` and registering in `src/stores/index.js`.

## Implementation Plan

### File Structure

```
korting-scanner/
├── server.js                          # Express entry point
├── package.json                       # ES module, express only
├── start.command                      # macOS launcher (sports-tracker pattern)
├── .gitignore
├── CLAUDE.md
├── src/
│   ├── config.js                      # Port config
│   ├── routes/
│   │   └── api.js                     # All REST endpoints
│   ├── stores/
│   │   ├── base.js                    # StoreAdapter base class
│   │   ├── ah.js                      # Albert Heijn (token auth + search + detail)
│   │   ├── dirk.js                    # Dirk (public API, offers cache, local filter)
│   │   └── index.js                   # Store registry { ah, dirk }
│   ├── services/
│   │   └── productStore.js            # JSON file CRUD for saved products
│   └── data/                          # Auto-created, gitignored
│       └── products.json
└── public/
    ├── index.html                     # App shell: header + 2 tabs
    ├── css/
    │   ├── reset.css                  # From sports-tracker
    │   ├── variables.css              # Dark theme, orange accent, store colors
    │   ├── layout.css                 # Header, tabs, panels
    │   └── components.css             # Cards, search, badges, pills, toast
    └── js/
        ├── app.js                     # Init + tab switching
        ├── api.js                     # Fetch wrapper for /api/*
        ├── components/
        │   ├── productCard.js         # Product card (bonus info + remove btn)
        │   ├── searchResult.js        # Search result row (+ add btn)
        │   └── toast.js               # Toast notifications
        └── views/
            ├── onSale.js              # "In de Bonus" tab — bonus products by store
            └── myProducts.js          # "Mijn Producten" tab — saved list + search
```

### Backend API Routes

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/products` | List all saved products |
| `POST` | `/api/products` | Save a product `{store, storeProductId, title, ...}` |
| `DELETE` | `/api/products/:id` | Remove a saved product |
| `GET` | `/api/search?store=ah&q=koffie` | Proxy search to store API |
| `GET` | `/api/bonus` | Check saved products for current bonus status |

### Saved Product Data Model

```json
{
  "id": "ah-12345",
  "store": "ah",
  "storeProductId": "12345",
  "title": "Douwe Egberts Aroma Rood",
  "brand": "Douwe Egberts",
  "salesUnitSize": "500g",
  "mainCategory": "Koffie",
  "subCategory": "Filterkoffie",
  "addedAt": "2026-02-09T12:00:00Z"
}
```

Bonus/pricing info is NOT saved — fetched live from APIs (changes weekly).

### Frontend Tabs

**Tab 1: "In de Bonus"** — Calls `GET /api/bonus`, renders products grouped by store section. Each card shows: title, unit size, bonus mechanism, price, end date. Empty state if nothing on sale.

**Tab 2: "Mijn Producten"** — Store filter pills (Alle / AH / Dirk) + search input. Default: shows saved products. When typing: live search results from selected store with add buttons. Debounced 300ms. Saved products show remove button.

### Implementation Phases

1. **Skeleton**: package.json, server.js, config, start.command, index.html, CSS, tab switching
2. **Data layer**: productStore.js, CRUD routes, api.js fetch wrapper
3. **Store adapters**: base.js, ah.js, dirk.js, index.js, search + bonus routes
4. **My Products tab**: toast, searchResult, productCard components, myProducts view
5. **On Sale tab**: onSale view with store sections
6. **Polish**: loading states, error toasts, refresh button, responsive

### Design Decisions

- Backend proxies all store API calls (CORS + AH token kept server-side)
- Saved products in JSON file (persists across browser clears, simple for small dataset)
- Dirk offers cached 10min in memory (no search API, filter locally)
- AH bonus check via individual product detail endpoint (fine for <50 products)
- Dirk search only returns current offers (no full catalog API available — acceptable)
- Notifications deferred to future version (core browse/save experience first)

### Known Limitations

- Dirk search only covers current offers, not full product catalog
- Dirk `offerId` may change weekly; saved products only match when exact offer is active
- AH individual product checks scale linearly; optimize with bonus page endpoint if needed later
