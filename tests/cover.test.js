import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverPhoto, collagePhotos, isCover, coverRef } from '../src/lib/cover.js';

const ph = (n) => ({ path: `h/${n}.jpg` });
const trip = {
  days: [
    { id: 'a', photos: [ph(1), ph(2)] },
    { id: 'b', kind: 'Flight', photos: [] },
    { id: 'c', photos: [ph(3), ph(4), ph(5), ph(6), ph(7), ph(8)] },
  ],
};

test('cover: pinned photo, else the book cover, else the first photo', () => {
  assert.equal(coverPhoto(trip).ref, 'a#0');
  assert.equal(coverPhoto({ ...trip, book: { draft: { cover: 'c#2' } } }).ref, 'c#2');
  assert.equal(coverPhoto({ ...trip, cover: 'c#4', book: { draft: { cover: 'c#2' } } }).ref, 'c#4');
  // a pin that no longer points at a photo falls back
  assert.equal(coverPhoto({ ...trip, cover: 'gone#0' }).ref, 'a#0');
  assert.equal(coverPhoto({ days: [] }), null);
});

test('collage: the cover first, then distinct photos spread across the trip', () => {
  const c = collagePhotos({ ...trip, cover: 'c#3' }, 5);
  assert.equal(c.length, 5);
  assert.equal(c[0].ref, 'c#3');
  assert.equal(new Set(c.map((x) => x.ref)).size, 5);
  assert.equal(collagePhotos({ days: [{ id: 'x', photos: [ph(1), ph(2)] }] }).length, 2);
  assert.deepEqual(collagePhotos({ days: [] }), []);
});

test('collage puts the photo book chapter openers ahead of the rest', () => {
  const c = collagePhotos({ ...trip, book: { draft: { chapters: [{ hero: 'c#5' }, { hero: 'a#1' }] } } }, 3);
  assert.deepEqual(c.map((x) => x.ref), ['a#0', 'c#5', 'a#1']);
});

test('isCover', () => {
  assert.equal(isCover({ ...trip, cover: coverRef('c', 1) }, 'c', 1), true);
  assert.equal(isCover(trip, 'c', 1), false);
});
