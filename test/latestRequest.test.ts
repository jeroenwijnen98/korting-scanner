import { test } from 'node:test';
import assert from 'node:assert/strict';
import { latestRequest } from '../public/js/utils/latestRequest.js';

test('latestRequest: the only request started is current', () => {
  const requests = latestRequest();
  const isCurrent = requests.start();
  assert.equal(isCurrent(), true);
});

test('latestRequest: an older request answering after a newer one is not current', async () => {
  const requests = latestRequest();
  const shown: string[] = [];
  const search = async (query: string, delay: number) => {
    const isCurrent = requests.start();
    await new Promise(resolve => setTimeout(resolve, delay));
    if (isCurrent()) shown.push(query);
  };
  // "melk" starts first but answers last
  await Promise.all([search('melk', 20), search('melkpoeder', 5)]);
  assert.deepEqual(shown, ['melkpoeder']);
});

test('latestRequest: cancel makes a request in flight stale', () => {
  const requests = latestRequest();
  const isCurrent = requests.start();
  requests.cancel();
  assert.equal(isCurrent(), false);
});

test('latestRequest: a request started after cancel is current', () => {
  const requests = latestRequest();
  const stale = requests.start();
  requests.cancel();
  const isCurrent = requests.start();
  assert.equal(stale(), false);
  assert.equal(isCurrent(), true);
});
