import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunkSpans } from '../chunking';

const never = () => false;

test('no functions: splits into 10-line blocks', () => {
  assert.deepEqual(chunkSpans(25, [], never), [
    { start: 0, end: 9 }, { start: 10, end: 19 }, { start: 20, end: 24 },
  ]);
});

test('function in the middle: gaps around it', () => {
  assert.deepEqual(chunkSpans(30, [{ start: 5, end: 14, name: 'f' }], never), [
    { start: 0, end: 4 },
    { start: 5, end: 14, name: 'f' },
    { start: 15, end: 24 }, { start: 25, end: 29 },
  ]);
});

test('nested functions are skipped', () => {
  const fns = [{ start: 0, end: 10, name: 'outer' }, { start: 2, end: 5, name: 'inner' }];
  assert.deepEqual(chunkSpans(11, fns, never), [{ start: 0, end: 10, name: 'outer' }]);
});

test('unsorted input is sorted', () => {
  const fns = [{ start: 6, end: 9, name: 'b' }, { start: 0, end: 5, name: 'a' }];
  assert.deepEqual(chunkSpans(10, fns, never), [
    { start: 0, end: 5, name: 'a' }, { start: 6, end: 9, name: 'b' },
  ]);
});

test('blank blocks are dropped', () => {
  const blank = (s: number) => s === 0;
  assert.deepEqual(chunkSpans(15, [], blank), [{ start: 10, end: 14 }]);
});

test('function range past end of document is clamped', () => {
  assert.deepEqual(chunkSpans(5, [{ start: 2, end: 99, name: 'f' }], never), [
    { start: 0, end: 1 }, { start: 2, end: 4, name: 'f' },
  ]);
});

test('empty document gives no chunks', () => {
  assert.deepEqual(chunkSpans(1, [], () => true), []);
});
