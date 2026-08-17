import assert from 'node:assert/strict';
import test from 'node:test';

import { swapRs } from '../public/w-speech.js';

test('uses w-speech only for a curated set of playful words', () => {
  assert.equal(
    swapRs('Ready for a STRONG workout: progress while crawling; very rabbit.'),
    'Weady for a STWONG wowkout: pwogwess while cwawling; vewy wabbit.',
  );
});

test('keeps ordinary r words, names, and exercises readable', () => {
  assert.equal(swapRs('Petra records rear delt raise'), 'Petra records rear delt raise');
});
