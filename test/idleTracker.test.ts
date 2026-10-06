import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { createIdleTracker } from '../src/services/idleTracker.ts';

const GRACE_MS = 15_000;
const STARTUP_GRACE_MS = 60_000;

afterEach(() => {
  mock.timers.reset();
});

/** A tracker on mock timers, whose `exit` counts instead of exiting. */
function start() {
  mock.timers.enable({ apis: ['setTimeout'] });
  const state = { exits: 0 };
  const tracker = createIdleTracker({
    graceMs: GRACE_MS,
    startupGraceMs: STARTUP_GRACE_MS,
    exit: () => { state.exits += 1; },
  });
  return { state, tracker };
}

test('exits at the startup grace when no window ever connects', () => {
  const { state } = start();
  mock.timers.tick(STARTUP_GRACE_MS - 1);
  assert.equal(state.exits, 0);
  mock.timers.tick(1);
  assert.equal(state.exits, 1);
});

test('exits exactly one grace period after the last window closes', () => {
  const { state, tracker } = start();
  tracker.connected();
  tracker.disconnected();
  mock.timers.tick(GRACE_MS - 1);
  assert.equal(state.exits, 0);
  mock.timers.tick(1);
  assert.equal(state.exits, 1);
});

test('does not exit while any window is open', () => {
  const { state, tracker } = start();
  tracker.connected();
  tracker.connected();
  mock.timers.tick(STARTUP_GRACE_MS * 2);
  assert.equal(state.exits, 0, 'well past the startup grace');

  tracker.disconnected();
  mock.timers.tick(GRACE_MS * 2);
  assert.equal(state.exits, 0, 'one window is still open');

  tracker.disconnected();
  mock.timers.tick(GRACE_MS);
  assert.equal(state.exits, 1);
});

test('a window that reconnects within the grace period keeps it up', () => {
  const { state, tracker } = start();
  tracker.connected();
  tracker.disconnected();
  mock.timers.tick(GRACE_MS - 1);
  tracker.connected();
  mock.timers.tick(GRACE_MS * 2);
  assert.equal(state.exits, 0);

  // The grace starts over from the new last disconnect
  tracker.disconnected();
  mock.timers.tick(GRACE_MS - 1);
  assert.equal(state.exits, 0);
  mock.timers.tick(1);
  assert.equal(state.exits, 1);
});

test('close cancels a pending quit', () => {
  const { state, tracker } = start();
  tracker.connected();
  tracker.disconnected();
  tracker.close();
  mock.timers.tick(STARTUP_GRACE_MS * 2);
  assert.equal(state.exits, 0);
});

test('close cancels the startup grace, and later disconnects schedule no quit', () => {
  const { state, tracker } = start();
  tracker.connected();
  tracker.close();
  tracker.disconnected();
  mock.timers.tick(STARTUP_GRACE_MS * 2);
  assert.equal(state.exits, 0);
});
