import assert from 'node:assert/strict';
import test from 'node:test';

import { swapRs } from '../public/w-speech.js';

test('turns every lowercase and uppercase r into w', () => {
  assert.equal(swapRs('Rear delt raise - Progress'), 'Weaw delt waise - Pwogwess');
});

test('leaves text without r unchanged', () => {
  assert.equal(swapRs('slow snail gains'), 'slow snail gains');
});
