# Store fixtures

Raw store API responses for the adapter `normalize` tests
(`test/adapters.test.ts`). These were written by hand from the typed raw
response shapes in `src/stores/*.ts`, not captured: the sandbox that wrote them
cannot reach the stores. Replace a file with a real capture (same file name,
whole response body) and adjust the expected values in the test.

- `ah-search.json`: `GET /mobile-services/product/search/v2` body
- `ah-detail.json`: `GET /mobile-services/product/detail/v4/fir/{webshopId}` body
- `dirk-list-products.json`: GraphQL `listProducts` response
- `dirk-assortment.json`: GraphQL aliased `productAssortment` response (`p0`, `p1`, …)
- `kruidvat-search.json`: `GET /search?fields=FULL` body

bol.com pages (`test/bol.test.ts`) are real captures (2026-10-02). Each page
embeds its React Router loader data as a turbo-stream; the `.html` files carry
only that data, trimmed to the product fields the adapter reads and
re-encoded. `bol-product-deal-meestal.real.html.gz` is that page untouched,
to keep the decoder honest against bol's own encoder.

- `bol-search.html`: `GET /nl/nl/s/?searchtext=airfryer`, four results
- `bol-product-deal-meestal.html`: `GET /nl/nl/p/x/9300000238030673/`, "deal" with a "Meestal" price
- `bol-product-deal-adviesprijs.html`: `…/9300000157956429/`, "deal" with only an adviesprijs
- `bol-product-no-bonus.html`: `…/9200000011447768/`, no discount label
- `bol-product-outlet.html`: `…/9300000127503207/`, "Outlet" label
- `bol-product-no-offer.html`: `…/9200000104617870/`, no buy box
