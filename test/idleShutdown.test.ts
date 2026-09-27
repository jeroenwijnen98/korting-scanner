import { test } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'node:http';
import type { ClientRequest, Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import express from 'express';
import { attachIdleShutdown } from '../src/services/idleShutdown.ts';

const GRACE_MS = 100;

/** An app with only the idle shutdown, whose `exit` counts instead of exiting. */
async function start(startupGraceMs: number) {
  const app = express();
  const state = { exits: 0 };
  attachIdleShutdown(app, { enabled: true, exit: () => { state.exits += 1; }, graceMs: GRACE_MS, startupGraceMs });
  const server: Server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const port = (server.address() as AddressInfo).port;

  /** Opens a session (like a page's EventSource); resolves once connected. */
  const openSession = () => new Promise<ClientRequest>((resolve, reject) => {
    const req = get(`http://localhost:${port}/api/session`, res => {
      res.once('data', () => resolve(req));
    });
    req.on('error', err => {
      if ((err as NodeJS.ErrnoException).code !== 'ECONNRESET') reject(err);
    });
  });

  const stop = () => {
    server.closeAllConnections();
    return new Promise(resolve => server.close(resolve));
  };
  return { state, openSession, stop };
}

test('exits after the startup grace when no window ever connects', async () => {
  const { state, stop } = await start(50);
  await sleep(150);
  assert.equal(state.exits, 1);
  await stop();
});

test('stays up while a session is open, exits one grace period after the last closes', async () => {
  const { state, openSession, stop } = await start(50);
  const first = await openSession();
  const second = await openSession();

  // Well past the startup grace, with windows open
  await sleep(200);
  assert.equal(state.exits, 0);

  first.destroy();
  await sleep(GRACE_MS * 2);
  assert.equal(state.exits, 0, 'one window is still open');

  second.destroy();
  await sleep(GRACE_MS / 2);
  assert.equal(state.exits, 0, 'still within the grace period');
  await sleep(GRACE_MS);
  assert.equal(state.exits, 1);
  await stop();
});

test('a window that reconnects within the grace period keeps the server up', async () => {
  const { state, openSession, stop } = await start(50);
  (await openSession()).destroy();
  await sleep(GRACE_MS / 2);
  const reloaded = await openSession();
  await sleep(GRACE_MS * 2);
  assert.equal(state.exits, 0);
  reloaded.destroy();
  await sleep(GRACE_MS * 2);
  assert.equal(state.exits, 1);
  await stop();
});

test('does nothing when not enabled', async () => {
  const app = express();
  let exits = 0;
  attachIdleShutdown(app, { enabled: false, exit: () => { exits += 1; }, graceMs: 10, startupGraceMs: 10 });
  await sleep(50);
  assert.equal(exits, 0);
});
