import { test } from 'node:test';
import assert from 'node:assert/strict';
import { savedProductId } from '../public/js/utils/savedProductId.js';

test('savedProductId is <store>-<storeProductId>', () => {
  assert.equal(savedProductId('ah', '12345'), 'ah-12345');
  assert.equal(savedProductId('dirk', '987'), 'dirk-987');
  assert.equal(savedProductId('kruidvat', '2843021'), 'kruidvat-2843021');
});
