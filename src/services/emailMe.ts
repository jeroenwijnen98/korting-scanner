// Mails Jeroen through ~/claude-setup/bin/email-me, the one sender on this Mac.
// email-me fixes the recipient and holds the Gmail credentials, so nothing here
// names an address or reads a password.

import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Absolute paths: sleepwatcher runs run.sh with a bare PATH.
export const EMAIL_ME_PYTHON = '/usr/bin/python3';
export const EMAIL_ME = join(homedir(), 'claude-setup', 'bin', 'email-me');

// email-me gives SMTP 30 seconds; this leaves it room to report that itself.
export const SEND_TIMEOUT_MS = 60_000;

export interface RunResult { status: number | null; stderr: string; error?: Error }

/** Runs a program with stdin; injectable so tests never spawn email-me. */
export type Runner = (file: string, args: string[], options: { input: string; timeout: number }) => RunResult;

const spawnRunner: Runner = (file, args, { input, timeout }) => {
  const result = spawnSync(file, args, { input, timeout, encoding: 'utf-8' });
  return { status: result.status, stderr: result.stderr ?? '', error: result.error };
};

/** Sends one HTML mail; throws when email-me refuses, fails, stalls or is missing. */
export function sendToMe(mail: { subject: string; html: string }, runner: Runner = spawnRunner): void {
  const result = runner(EMAIL_ME_PYTHON, [EMAIL_ME, '--subject', mail.subject, '--html'],
    { input: mail.html, timeout: SEND_TIMEOUT_MS });
  if (result.error) {
    const code = (result.error as NodeJS.ErrnoException).code;
    if (code === 'ETIMEDOUT') throw new Error(`email-me did not finish within ${SEND_TIMEOUT_MS / 1000}s`);
    throw new Error(`Could not run ${EMAIL_ME}: ${result.error.message}. Is ~/claude-setup on this machine?`);
  }
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `email-me failed: exit ${result.status}`);
  }
}
