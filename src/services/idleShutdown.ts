// Keeps the server alive only while a browser window is actually open.
//
// Each page holds an SSE connection to /api/session. Unlike a polling
// heartbeat, an open connection is not throttled when the tab is in the
// background, and it drops the instant the tab closes. When the last
// connection goes away the process exits, so closing the window really
// does return to zero RAM.
//
// Only active when KORTING_AUTOQUIT=1 (set by KortingScanner.app). Running
// `node server.ts` by hand keeps the server up as before.

import type { Express } from 'express';
import { createIdleTracker } from './idleTracker.ts';
import type { IdleTracker } from './idleTracker.ts';

const GRACE_MS = 15_000;         // survive a page reload
const STARTUP_GRACE_MS = 60_000; // in case the browser never connects
const PING_MS = 25_000;

export interface IdleShutdownOptions {
  enabled: boolean;
  /** Ends the process; tests pass a spy. */
  exit?: () => void;
  /** How long after the last window closes to quit. */
  graceMs?: number;
  /** How long to wait for the first window. */
  startupGraceMs?: number;
}

/** Does nothing: with idle shutdown off, no quit is ever scheduled. */
const disabledTracker: IdleTracker = {
  connected() {},
  disconnected() {},
  close() {},
};

// The SSE side only: headers and pings. The idle tracker does the counting.
export function attachIdleShutdown(app: Express, {
  enabled,
  exit = () => process.exit(0),
  graceMs = GRACE_MS,
  startupGraceMs = STARTUP_GRACE_MS,
}: IdleShutdownOptions): void {
  const tracker = enabled ? createIdleTracker({ graceMs, startupGraceMs, exit }) : disabledTracker;

  app.get('/api/session', (req, res) => {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.flushHeaders();
    res.write(': connected\n\n');
    tracker.connected();

    const ping = setInterval(() => res.write(': ping\n\n'), PING_MS).unref();
    req.on('close', () => {
      clearInterval(ping);
      tracker.disconnected();
    });
  });
}
