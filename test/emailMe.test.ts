import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMAIL_ME, EMAIL_ME_PYTHON, SEND_TIMEOUT_MS, sendToMe, type Runner } from '../src/services/emailMe.ts';

// No test runs email-me: CI has no ~/claude-setup, and a test must never mail.

interface Call { file: string; args: string[]; input: string; timeout: number }

function fakeRunner(result: { status?: number | null; stderr?: string; error?: Error } = {}): Runner & { calls: Call[] } {
  const calls: Call[] = [];
  const runner = (file: string, args: string[], options: { input: string; timeout: number }) => {
    calls.push({ file, args, ...options });
    return { status: result.status === undefined ? 0 : result.status, stderr: result.stderr ?? '', error: result.error };
  };
  return Object.assign(runner, { calls });
}

test('the HTML goes in on stdin and the call names no recipient', () => {
  const runner = fakeRunner();
  sendToMe({ subject: 'Korting Scanner Update - 1 november 2026', html: '<p>Melk</p>' }, runner);
  assert.equal(runner.calls.length, 1);
  const [call] = runner.calls;
  assert.equal(call.file, EMAIL_ME_PYTHON);
  assert.deepEqual(call.args, [EMAIL_ME, '--subject', 'Korting Scanner Update - 1 november 2026', '--html']);
  assert.equal(call.input, '<p>Melk</p>');
  assert.equal(call.timeout, SEND_TIMEOUT_MS);
  assert.ok(!call.args.some(arg => arg.includes('@')));
});

test('the paths are absolute, for the bare PATH under sleepwatcher', () => {
  assert.ok(EMAIL_ME_PYTHON.startsWith('/'));
  assert.ok(EMAIL_ME.startsWith('/'));
  assert.ok(EMAIL_ME.endsWith('/claude-setup/bin/email-me'));
});

test('a refusal throws with what email-me said', () => {
  const runner = fakeRunner({ status: 2, stderr: 'email-me: ~/.config/email-me/.env missing\n' });
  assert.throws(() => sendToMe({ subject: 's', html: 'h' }, runner), /\.env missing/);
});

test('a failure without stderr still says the exit code', () => {
  assert.throws(() => sendToMe({ subject: 's', html: 'h' }, fakeRunner({ status: 1 })), /exit 1/);
});

test('a timeout or a missing email-me throws', () => {
  const timedOut = Object.assign(new Error('spawnSync ETIMEDOUT'), { code: 'ETIMEDOUT' });
  assert.throws(() => sendToMe({ subject: 's', html: 'h' }, fakeRunner({ status: null, error: timedOut })), /did not finish/);
  const missing = Object.assign(new Error('spawnSync ENOENT'), { code: 'ENOENT' });
  assert.throws(() => sendToMe({ subject: 's', html: 'h' }, fakeRunner({ status: null, error: missing })), /claude-setup/);
});
