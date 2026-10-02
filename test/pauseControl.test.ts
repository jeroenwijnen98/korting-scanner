import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pauseControlText } from '../public/js/utils/pauseControl.js';

test('pauseControlText offers "Pauzeren" for an unpaused saved product', () => {
  assert.equal(pauseControlText(false).label, 'Pauzeren');
  assert.equal(pauseControlText(false).title, 'Bonus voorlopig niet melden');
});

test('pauseControlText offers "Hervatten" for a paused saved product', () => {
  assert.equal(pauseControlText(true).label, 'Hervatten');
  assert.equal(pauseControlText(true).title, 'Bonus weer melden');
});
