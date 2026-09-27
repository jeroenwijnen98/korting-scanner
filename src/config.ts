// Read from the environment, which server.ts fills from .env first.
export const PORT = Number(process.env.PORT) || 3001;

// Set by KortingScanner.app and restart.command: quit with the last window.
export const AUTOQUIT = process.env.KORTING_AUTOQUIT === '1';
