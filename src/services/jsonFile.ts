import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';

/**
 * Tail of the queue per file path. Every read-modify-write of a file chains
 * onto it, so overlapping updates run one after another instead of each
 * reading the same state and the last write winning.
 */
const queues = new Map<string, Promise<unknown>>();

function enqueue<T>(filePath: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(filePath) ?? Promise.resolve();
  // Run after the previous task, whether it succeeded or not.
  const run = previous.then(task, task);
  const tail = run.catch(() => {});
  queues.set(filePath, tail);
  // Drop the entry once the queue is idle, so the map does not keep it.
  tail.then(() => {
    if (queues.get(filePath) === tail) queues.delete(filePath);
  });
  return run;
}

async function read<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, 'utf-8'));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw err;
  }
}

/**
 * Read a JSON file, or `fallback` when it does not exist yet. Queued behind
 * pending updates, so it sees their result.
 */
export function readJson<T>(filePath: string, fallback: T): Promise<T> {
  return enqueue(filePath, () => read(filePath, fallback));
}

/**
 * Read a JSON file, let `update` change the data, and write it back — as one
 * step that no other update of the same file can interleave with. `update`
 * returns whether to write (`changed`) and the value to resolve with.
 */
export function updateJson<T, R>(
  filePath: string,
  fallback: T,
  update: (data: T) => { changed: boolean; result: R },
): Promise<R> {
  return enqueue(filePath, async () => {
    const data = await read(filePath, fallback);
    const { changed, result } = update(data);
    if (changed) {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, JSON.stringify(data, null, 2));
    }
    return result;
  });
}
