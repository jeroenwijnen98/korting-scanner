import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after } from 'node:test';

/**
 * Points KORTING_DATA_DIR at a fresh temp dir, removed after the test file.
 * `dataFile()` reads the variable on each call, so this works after imports.
 */
export async function useTempDataDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'korting-test-'));
  process.env.KORTING_DATA_DIR = dir;
  after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
