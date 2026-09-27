# Coding Standards

The reviewer agent loads this file via @.sandcastle/CODING_STANDARDS.md. It
supplements `CLAUDE.md` (and `CONTEXT.md`, once there is one) in the repo root;
where they differ, those win.

## Style

- ES modules throughout (`"type": "module"`), plain JavaScript on both sides.
- `public/` stays vanilla JS that the browser loads as it is: no framework, no
  bundler, no build step.
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
- The .app launcher, `restart.command` and `run.sh` name `server.js` and
  `src/scripts/sendBonusEmail.js`. Renaming either file means updating them in
  the same commit.
