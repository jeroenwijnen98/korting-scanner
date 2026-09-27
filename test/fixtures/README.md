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
