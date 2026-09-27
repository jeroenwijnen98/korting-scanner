# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start server (development); same as npm start
node server.ts

# Type check (tsc, no emit): the server (tsconfig.json; Node strips the
# types itself) and the page (public/tsconfig.json; JSDoc + // @ts-check)
npm run typecheck

# Install/refresh /Applications/KortingScanner.app (only when the bundle changes)
./install-app.command

# Regenerate icon.png / icon.icns from assets/icon.svg
./scripts/generate-icons.sh

# Run bonus email script manually
node src/scripts/sendBonusEmail.ts
```

No build step, no tests. `tsconfig.json` and `public/tsconfig.json` are for type checking only (Node >= 22.18). The browser loads `public/js` as plain `.js`; every file there is `// @ts-check`ed against the shared types via JSDoc `import('../../src/types.ts')`. Server runs on port 3001 (`PORT` in `.env`, read by `src/config.ts`).

## Architecture

Node.js/Express backend (ES modules) serving a vanilla JS frontend. The backend proxies all store API calls — this keeps CORS clean and AH's bearer token server-side.

```
server.ts              → Entry: loads .env (dotenv/config, first import), createApp(), listen
src/app.ts             → createApp(): builds the Express app (/api, static public/,
                         idle shutdown) without listening
src/config.ts          → PORT (default 3001) and KORTING_AUTOQUIT, from env
src/types.ts           → Domain types (product, saved product, price snapshot, API
                         response shapes), shared with the page
src/routes/api.ts      → All REST endpoints
src/stores/            → Store adapters (base.ts, index.ts, ah.ts, dirk.ts, etos.ts, kruidvat.ts)
                         + bonusMechanism.ts (shared bonus-mechanism parser)
src/services/
  productStore.ts      → JSON file CRUD for saved products (src/data/products.json)
  priceHistory.ts      → Price snapshot storage (src/data/price-history.json)
  jsonFile.ts          → Serialized JSON file read/update (per-file queue) used by both
  idleShutdown.ts      → SSE session tracking + auto-quit (see App Bundle below)
src/scripts/
  sendBonusEmail.ts    → Standalone bonus email script (run via run.sh / sleepwatcher)
public/js/
  api.js               → Fetch wrapper for all /api/* calls
  app.js               → Init + tab switching
  session.js           → Holds the SSE connection that keeps the server alive
  views/               → onSale.js, myProducts.js
  components/          → productCard.js, searchResult.js, productDetail.js, toast.js
  utils/               → unitPrice.js (parseUnitSize, calcPricePerUnit); also
                         imported by the server, so it stays plain JS + JSDoc;
                         errorMessage.js (message of a caught error)
KortingScanner.app/    → macOS launcher bundle (installed via install-app.command)
assets/                → icon.svg (source) + generated icon.png / icon.icns
```

`src/data/` is auto-created and gitignored. Data persists in JSON files across runs.

## Store Adapter Pattern

Each store extends `StoreAdapter` (src/stores/base.ts) and implements:
- `searchProducts(query)` → normalized product array
- `getProductDetail(storeProductId)` → single normalized product

`StoreAdapter` provides `checkBonus(savedProducts)` → `{ results, notFound }`: normalized products where `isBonus: true` (with `savedId`), plus saved ids the store did not know. The default fetches each detail in turn via `getProductDetail`; a detail that throws or returns null goes to `notFound`. An adapter narrows what counts as bonus by overriding `countsAsBonus(product)` (AH drops online-only products), or overrides `checkBonus` itself to batch (Dirk).

Register in `src/stores/index.ts`. All methods normalize to the common schema below; its type (`Product`) and the other domain types live in `src/types.ts`. Each adapter types its raw API responses next to itself (only the fields it reads) and casts `res.json()` to them once, in its fetch helper.

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
| `GET` | `/api/session` | SSE stream held open by each page; drives the auto-quit |

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
- The search term is sent as a GraphQL variable (`$q`), never interpolated into the query
- Dirk product IDs are integers

## Bonus Mechanisms

### AH and Kruidvat (`parseBonusMechanism` in src/stores/bonusMechanism.ts)
The one shared parser: label + regular price → price per item (or null). Case-insensitive; spaces around `+` are optional (`1+1 gratis`) and so is `euro` in `X voor Y`.
- `2e gratis` / `1 + 1 gratis` / `2 + 2 gratis` → 50% off (× 0.5)
- `2 + 1 gratis` → 33% off (× 2/3)
- `2e halve prijs` → 25% off (× 0.75)
- `XX%` → dynamic percentage
- `X voor Y euro` / `X voor Y` → bundle price (total / count)
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
  "imageUrl": "string|null",
  "store": "ah|dirk|kruidvat|etos"
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
  "imageUrl": "...",
  "addedAt": "ISO timestamp",
  "productGroup": "string|null (optional)"
}
```

Bonus/pricing is NOT saved — always fetched live (changes weekly).

## Price History (priceHistory.ts)

Keyed by `{store}-{storeProductId}` (e.g. `ah-588920`). A new snapshot is only appended when `currentPrice`, `isBonus`, or `bonusMechanism` differs from the last entry. Snapshots are recorded automatically on every detail fetch and bonus check.

## App Bundle (KortingScanner.app)

`KortingScanner.app` is a plain shell-script bundle — the executable is
`Contents/MacOS/KortingScanner`. Double-clicking it starts the server if port
3001 is free, waits for it to answer, opens the browser, and exits. Same shape
as Moneybird.app and NextSeason.app.

- The bundle lives in the repo; `./install-app.command` copies it to
  `/Applications` and ad-hoc codesigns it. Run that **only** when the bundle
  itself changes — the launcher `cd`s into the repo, so app code changes
  (server.ts, src/, public/) need no reinstall.
- The copy in `/Applications` finds the repo via the hardcoded fallback path in
  the launcher, since three-levels-up no longer resolves there. Update that path
  if the repo moves again.
- The launcher and `restart.command` start `server.ts` and hardcode port 3001,
  matching `PORT=3001` in `.env` (see `.env.example`). Renaming the entry or
  changing the port means updating them in the same commit, then reinstalling.
- Node lookup prefers `/opt/homebrew/bin/node` (arm64) over `/usr/local/bin/node`
  (x86_64, runs under Rosetta). Same order in the launcher, `restart.command`
  and `run.sh`.

### Idle shutdown

The bundle sets `KORTING_AUTOQUIT=1`, which arms `src/services/idleShutdown.ts`.
Each page holds an SSE connection to `/api/session` (`public/js/session.js`);
when the last one drops the process exits after a 15s grace, so closing the
window returns to zero RAM. A 60s startup grace covers the browser never
connecting at all. Running `node server.ts` by hand leaves the server up as
before — the auto-quit is opt-in via the env var.

Note: after an auto-quit, a still-open browser tab pointing at localhost:3001
does not reload on its own. Relaunching the app focuses that stale tab; the
page's `EventSource` reconnects once the tab is foregrounded and unfrozen.

## Design Decisions

- Backend proxies store calls: CORS + AH token kept server-side
- Dirk search: GraphQL full catalog (not offer-filtered). Bonus data comes from `productAssortment`.
- AH bonus check: individual detail calls per product (acceptable for <50 products)
- Dirk bonus check: batched via `productAssortment` aliases in a single GraphQL request
- Price history deduplication: only write when price/bonus state changes (not every poll)
- Every read-modify-write of a data file goes through `updateJson` (src/services/jsonFile.ts), queued per file, so concurrent requests (e.g. the unawaited snapshots of a bonus check) cannot overwrite each other. The queue is per process: the bonus email script running at the same moment as the server is not covered
- Idle shutdown uses an SSE connection rather than a polling heartbeat: an open connection is not throttled in a background tab and drops the instant the tab closes
- `run.sh` derives its own project directory instead of hardcoding one, so moving the repo does not silently break the weekly bonus email
- `restart.command` sets `KORTING_AUTOQUIT=1` like the bundle does: every double-clickable way of starting the server produces one that quits with the last window. Only `node server.ts` (or `npm start`) leaves a server up, and that is the development case

## Known Limitations

- Dirk `storeProductId` is an integer product ID (stable); previously used `offerId` which changed weekly
- AH individual product checks scale linearly — optimize with bonus page endpoint if needed for large lists

## Agent skills

### Issue tracker

GitHub Issues on jeroenwijnen98/korting-scanner via `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five labels (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.
