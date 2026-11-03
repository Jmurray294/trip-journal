import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPages, chunkPhotos, draftFromWriter, unusedPhotos, collectPhotos, withWeekday } from '../src/lib/book.js';

test('entry dates get their weekday from the trip year', () => {
  const t = { dates: 'Oct 30 – Nov 2, 2026', days: [] };
  assert.equal(withWeekday('Nov 1', t), 'Sun Nov 1');
  assert.equal(withWeekday('Nov 2', t), 'Mon Nov 2');
  assert.equal(withWeekday('Jan 2', { dates: 'Dec 28 – Jan 3, 2027', days: [] }), 'Sat Jan 2');
  assert.equal(withWeekday('Mon Nov 2', t), 'Mon Nov 2');
  assert.equal(withWeekday('someday', t), 'someday');
});

const photo = (label = '') => ({ src: 'data:image/jpeg;base64,AAA', label });
const trip = {
  title: 'Japan 2027', place: 'Japan', dates: 'April 2027',
  days: [
    { id: 'a', date: 'Apr 10', title: 'Arrive Tokyo', place: 'Tokyo', lon: 139.7, lat: 35.7, photos: [photo('Shibuya'), photo(), photo()] },
    { id: 'b', date: 'Apr 12', title: 'Kyoto', place: 'Kyoto', lon: 135.8, lat: 35.0, photos: [photo(), photo()] },
    { id: 'c', date: 'Apr 13', title: 'Regent cruise', kind: 'Cruise', source: 'email', booking: { provider: 'Regent' }, photos: [] },
  ],
};

test('photos are grouped 1-4 to a page without a lone straggler', () => {
  const n = (k) => chunkPhotos(Array.from({ length: k }, (_, i) => i)).map((g) => g.length);
  assert.deepEqual(n(1), [1]);
  assert.deepEqual(n(4), [4]);
  assert.deepEqual(n(5), [2, 3]);
  assert.deepEqual(n(6), [3, 3]);
  assert.deepEqual(n(7), [3, 4]);
  assert.deepEqual(n(0), []);
});

test('the writer answer becomes a draft of photo refs, and pages follow it', () => {
  const sent = { p0: 'a#0', p1: 'a#1', p2: 'a#2', p3: 'b#0', p4: 'b#1' };
  const draft = draftFromWriter({
    title: 'Spring in Japan', subtitle: 'Ten days', cover: 'p0', intro: 'We went.',
    chapters: [
      { heading: 'Tokyo', when: 'Day 1', place: 'Tokyo', story: 'Neon.', hero: 'p1', photos: ['p2', 'p9'] },
      { heading: 'Kyoto', when: 'Day 3', place: 'Kyoto', story: 'Temples.', hero: 'p3', photos: [] },
    ],
    captions: { p1: 'Crossing', p9: 'not sent' }, closing: 'Home again.',
  }, sent);
  assert.equal(draft.cover, 'a#0');
  assert.deepEqual(draft.chapters[0].photos, ['a#2']); // unknown id dropped
  assert.deepEqual(draft.captions, { 'a#1': 'Crossing' });

  const pages = buildPages(trip, draft);
  assert.deepEqual(pages.map((p) => p.type), ['cover', 'text', 'map', 'chapter', 'photos', 'chapter', 'glance', 'closing']);
  assert.equal(pages[0].photo, 'a#0');
  assert.deepEqual(pages[4].photos, ['a#2']);
  assert.match(pages[6].items[0], /Cruise · Apr 13 · Regent cruise · Regent/);
  assert.deepEqual(pages.map((p) => p.n), [1, 2, 3, 4, 5, 6, 7, 8]);

  assert.deepEqual(unusedPhotos(trip, draft).map((p) => p.ref), ['b#1']);
  assert.equal(collectPhotos(trip)[0].label, 'Shibuya');
});

test('a photo deleted from the trip drops out of the book', () => {
  const pages = buildPages(trip, { title: 'X', cover: 'zz#0', chapters: [{ heading: 'H', hero: 'a#9', photos: ['a#1', 'gone#0'] }] });
  assert.equal(pages[0].photo, '');
  const ch = pages.find((p) => p.type === 'chapter');
  assert.equal(ch.photo, '');
  assert.deepEqual(pages.find((p) => p.type === 'photos').photos, ['a#1']);
});

test('journal entries are told apart from bookings and photo imports, and new ones are noticed', async () => {
  const { entryType, newSinceWritten } = await import('../src/lib/book.js');
  assert.equal(entryType({ note: 'We ate cheese curds' }), 'journal');
  assert.equal(entryType({ kind: 'Flight' }), 'booking');
  assert.equal(entryType({ booking: { provider: 'Hilton' } }), 'booking');
  assert.equal(entryType({ source: 'photos' }), 'photos');
  const t = { days: [{ id: 'a', note: 'old', added: 100 }, { id: 'b', note: 'new', added: 300 }, { id: 'c', kind: 'Flight', added: 400 }] };
  assert.equal(newSinceWritten(t, { written: 200 }), 1);
  assert.equal(newSinceWritten(t, null), 0);
});

test('a chapter keeps its journal quote through to the page', () => {
  const draft = draftFromWriter({ title: 'T', chapters: [{ heading: 'H', story: 'S', quote: 'best curds ever', hero: '', photos: [] }] }, {});
  assert.equal(draft.chapters[0].quote, 'best curds ever');
  const pages = buildPages({ title: 'T', days: [] }, draft);
  assert.equal(pages.find((p) => p.type === 'chapter').quote, 'best curds ever');
});
