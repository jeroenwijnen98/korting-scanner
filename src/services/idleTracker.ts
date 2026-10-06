// The grace rule behind idle shutdown, with no HTTP in it: count the open
// windows, and once none is left for a grace period, exit. A window that
// reconnects within the grace (a page reload) cancels the quit.
//
// Timers come from the global setTimeout, so node:test mock.timers drives it.

export interface IdleTrackerOptions {
  /** How long after the last window closes to quit. */
  graceMs: number;
  /** How long to wait for the first window. */
  startupGraceMs: number;
  /** Ends the process; tests pass a spy. */
  exit: () => void;
}

export interface IdleTracker {
  /** A window opened its session. */
  connected(): void;
  /** A window's session closed. */
  disconnected(): void;
  /** Cancels any pending quit; later disconnects schedule none. */
  close(): void;
}

/** Starts the startup grace at once: no window by then, and it exits. */
export function createIdleTracker({ graceMs, startupGraceMs, exit }: IdleTrackerOptions): IdleTracker {
  let clients = 0;
  let closed = false;
  let timer: NodeJS.Timeout | undefined;

  const scheduleQuit = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      console.log('No open windows — shutting down.');
      exit();
    }, ms);
  };

  scheduleQuit(startupGraceMs);

  return {
    connected() {
      clients += 1;
      clearTimeout(timer);
    },
    disconnected() {
      clients -= 1;
      if (clients <= 0 && !closed) scheduleQuit(graceMs);
    },
    close() {
      closed = true;
      clearTimeout(timer);
    },
  };
}
