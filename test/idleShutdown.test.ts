import { mock, test } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { get } from 'node:http';
import type { ClientRequest, Server } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { setImmediate } from 'node:timers/promises';
import express from 'express';
import { createApp } from '../src/app.ts';
import { attachIdleShutdown } from '../src/services/idleShutdown.ts';

// The grace rule itself is tested in idleTracker.test.ts. These cover the
// route and createApp's handle on the tracker, on mock timers, with no sleeps.

const GRACE_MS = 15_000;
const STARTUP_GRACE_MS = 60_000;

/** An app with idle shutdown on, whose `exit` counts instead of exiting. */
function appWithIdleShutdown() {
  const state = { exits: 0 };
  const korting = createApp({
    stores: {},
    idleShutdown: {
      enabled: true,
      exit: () => { state.exits += 1; },
      graceMs: GRACE_MS,
      startupGraceMs: STARTUP_GRACE_MS,
    },
    grocerUrl: null,
  });
  return { state, ...korting };
}

/**
 * Opens a session (like a page's EventSource); resolves once connected, with
 * the server's socket for it. The request is destroyed in t.after.
 */
async function openSession(t: TestContext, server: Server) {
  const port = (server.address() as AddressInfo).port;
  const accepted = once(server, 'connection') as Promise<[Socket]>;
  const session = await new Promise<ClientRequest>((resolve, reject) => {
    const req = get(`http://localhost:${port}/api/session`, res => {
      res.once('data', () => resolve(req));
    });
    t.after(() => req.destroy());
    req.on('error', err => {
      if ((err as NodeJS.ErrnoException).code !== 'ECONNRESET') reject(err);
    });
  });
  const [serverSocket] = await accepted;
  return { session, serverSocket };
}

test('/api/session: the tracker sees a window connect and disconnect', async (t) => {
  // Every handle is closed in t.after, so a failing assert cannot hang the run
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { state, app, closeIdleTracker } = appWithIdleShutdown();
  t.after(closeIdleTracker);
  const server = app.listen(0);
  t.after(() => {
    server.closeAllConnections();
    return new Promise(resolve => server.close(resolve));
  });
  await once(server, 'listening');

  const { session, serverSocket } = await openSession(t, server);
  t.mock.timers.tick(STARTUP_GRACE_MS * 2);
  assert.equal(state.exits, 0, 'a window is open, well past the startup grace');

  // Wait for the server to see the close, then a turn for its handlers
  const closed = once(serverSocket, 'close');
  session.destroy();
  await closed;
  await setImmediate();

  t.mock.timers.tick(GRACE_MS - 1);
  assert.equal(state.exits, 0, 'still within the grace period');
  t.mock.timers.tick(1);
  assert.equal(state.exits, 1);
});

test('closing the idle tracker from createApp cancels the startup quit', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { state, closeIdleTracker } = appWithIdleShutdown();
  closeIdleTracker();
  t.mock.timers.tick(STARTUP_GRACE_MS * 2);
  assert.equal(state.exits, 0);
});

test('does nothing when not enabled', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const app = express();
    let exits = 0;
    attachIdleShutdown(app, { enabled: false, exit: () => { exits += 1; }, graceMs: 10, startupGraceMs: 10 });
    mock.timers.tick(60_000);
    assert.equal(exits, 0);
  } finally {
    mock.timers.reset();
  }
});
