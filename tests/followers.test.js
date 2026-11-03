import { test } from 'node:test';
import assert from 'node:assert/strict';
import { portalSections, latestMoments, announceEmail, hasBook, hasSong } from '../src/lib/followers.js';

globalThis.window = globalThis.window || { location: { origin: 'https://jcmurraytrips.com' } };

const today = new Date(2026, 10, 3);
const trip = (id, dates, extra = {}) => ({ id, title: id, dates, days: [], ...extra });

test('portal sorts trips into underway, next up and past', () => {
  const s = portalSections([
    trip('milwaukee', 'Oct 30 – Nov 2, 2026'),
    trip('tofino', 'Nov 1–6, 2026'),
    trip('japan', 'April 2027'),
    trip('vegas', 'Dec 5–8, 2026'),
    trip('sedona', 'Mar 3–9, 2025'),
    trip('someday', '', { possible: true }),
  ], today);
  assert.deepEqual(s.live.map((t) => t.id), ['tofino']);
  assert.equal(s.next.id, 'vegas');
  assert.deepEqual(s.past.map((t) => t.id), ['milwaukee', 'sedona']);
});

test('latest moments are journal notes and photos, newest first, never bookings', () => {
  const t = trip('x', 'Nov 1–6, 2026', { days: [
    { id: 'f', kind: 'Flight', title: 'AA 2581', added: 5, note: 'Conf ABC123' },
    { id: 'a', note: 'Landed!', added: 1 },
    { id: 'b', note: '', photos: [{ path: 'h/1.jpg' }], added: 3 },
    { id: 'c', note: '   ', added: 4 },
  ] });
  assert.deepEqual(latestMoments(t).map((d) => d.id), ['b', 'a']);
});

test('the announcement email goes to every follower by bcc with the portal link', () => {
  const href = announceEmail({ title: 'Milwaukee' }, 'book', ['a@x.com', 'b@y.com'], 'Our trips');
  assert.match(href, /^mailto:\?bcc=a%40x\.com%2Cb%40y\.com&subject=/);
  const body = decodeURIComponent(href.split('body=')[1]);
  assert.match(body, /photo book/);
  assert.match(body, /\?follow/);
  assert.doesNotMatch(body, /Our trips/);
  assert.match(decodeURIComponent(announceEmail({ title: 'M' }, 'song', [], 'The Murrays').split('body=')[1]), /— The Murrays$/);
});

test('book and song badges', () => {
  assert.equal(hasBook({ book: { draft: {} } }), true);
  assert.equal(hasBook({ book: {} }), false);
  assert.equal(hasSong({ song: { lines: ['la'] } }), true);
  assert.equal(hasSong({}), false);
});
