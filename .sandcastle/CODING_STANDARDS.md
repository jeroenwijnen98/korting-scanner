# Coding Standards

The reviewer agent loads this file via @.sandcastle/CODING_STANDARDS.md. It
supplements `CLAUDE.md` (and `CONTEXT.md`, once there is one) in the repo root;
where they differ, those win.

## Style

- ES modules throughout (`"type": "module"`).
- The Node side is moving to **TypeScript, run as it is**: Node strips the types
  itself, with no build step and no emitted files. So:
  - only erasable syntax: no `enum`, `namespace`, parameter properties or
    `import x = require()`;
  - every relative import names its file with its real extension (`.ts` or `.js`);
  - a type-only import says so (`import type`): Node deletes it, and a plain
    import of a name that exists only as a type fails at run time.
- `public/` stays vanilla JS that the browser loads as it is: no framework, no
  bundler, no build step. It is typed with JSDoc and `// @ts-check`, against the
  same shared domain types the server uses. Change a shape there, not in two places.
- Every outbound call lives in a store adapter in `src/stores/`, which extends
  `StoreAdapter` and returns the common product schema from `CLAUDE.md`. The
  frontend only talks to this server, through `public/js/api.js`.
- A new store is registered in `src/stores/index.js` and gets a section in
  `CLAUDE.md` for its API and bonus mechanism.
- Theme tokens live in `public/css/variables.css`; raw hex appears only there.
- User-facing text is Dutch.

## Data

- Saved products never store price or bonus state: those are fetched live.
- A price snapshot is appended only when `currentPrice`, `isBonus` or
  `bonusMechanism` changes. Keep that dedup when touching `priceHistory.js`.
- `src/data/` and `.env` are gitignored runtime state; never commit them and
  never assume they exist.

## Things that break silently

- AH products are keyed by `webshopId`, never `hqId` (bundles have `hqId: 0`).
- Dirk product IDs are integers; `productAssortment` calls are batched with
  GraphQL aliases.
- The idle shutdown counts `/api/session` SSE connections. Keep it when touching
  server startup or routes.
- The .app launcher, `restart.command` and `run.sh` name the server entry
  and the bonus email script. Renaming either file means updating them in
  the same commit.
