## Context

Use `GLOSSARY.md`'s terms and the code's own names: store adapter, saved product, price
snapshot, bonus mechanism.

You are in a sandbox, not on the Mac that runs Korting Scanner. There is no `.env` and no
`src/data/`: never call the store APIs (AH, Dirk, Kruidvat, Trekpleister, bol) and never run
`src/scripts/sendBonusEmail.ts`. The .app launcher, `install-app.command`, `restart.command`,
`run.sh` and sleepwatcher cannot be exercised here either; edit them if the issue asks, but
you cannot run them.

## Execution

Add or update tests for what you change; store responses go in `test/fixtures/`, never a live
store call.

Frontend files in `public/` are served to the browser as they are: never add a build step, a
bundler or emitted files there. Backend TypeScript runs through Node's own type stripping, so
use erasable syntax only.

## Checks

While iterating, run one test file: `node --test test/<name>.test.ts`. The tests need no
network.

Before committing, run the full gate and make sure it passes:

1. `npm test`: typecheck, lint and every `test/*.test.ts` (about 15 seconds).
2. Smoke boot: `PORT=3999 node server.ts > /tmp/boot.log 2>&1 &`, then
   `curl -s -o /dev/null -w '%{http_code}\n'` against `/` and `/api/products`. Expect 200
   and 200. Do not curl `/api/search`, `/api/product/*` or `/api/bonus` (they reach the
   stores) or `/api/session` (it never ends). Kill the server afterwards.

## Review

- Does `public/` still run in the browser as it is, with no build step or emitted files?
- Does every store call stay in `src/stores/`, normalized to the common product schema?

## Host only

Some acceptance criteria can only be checked on the host (launching the .app, autoquit
timing, a real store response, the bonus email). Do not claim them. Once the rest is done,
comment on the issue listing which criteria you verified and which are left for a human on
the host.
