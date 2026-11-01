import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseConfirmation } from '../src/lib/parser.js';
import { migrate, seed } from '../src/lib/seed.js';
import { buildStops } from '../src/lib/geo.js';
import { activeLine } from '../src/lib/song.js';

test('United flight with route and time', () => {
  const r = parseConfirmation('Your United itinerary\nFlight UA 1234\nSEA → SFO\nDeparts Aug 8, 2026 at 7:45 AM');
  assert.equal(r.length, 1);
  assert.equal(r[0].kind, 'Flight');
  assert.equal(r[0].title, 'United UA1234 · SEA → SFO');
  assert.equal(r[0].place, 'SFO');
  assert.equal(r[0].date, 'Aug 8');
  assert.equal(r[0].note, 'Departs 7:45am · From confirmation email');
});

test('Delta flight with airport codes in parentheses, deduped', () => {
  const r = parseConfirmation('DL 456 Seattle (SEA) to Los Angeles (LAX) on 2026-03-02 10:05pm. Reminder: DL 456');
  assert.equal(r.length, 1);
  assert.equal(r[0].title, 'Delta DL456 · SEA → LAX');
  assert.equal(r[0].place, 'LAX');
  assert.equal(r[0].date, 'Mar 2');
});

test('Marriott stay prefers the brand line and forward dates', () => {
  const r = parseConfirmation('Reservation confirmed\nCourtyard by Marriott Monterey\nMonterey, CA\nCheck-in: Aug 10, 2026\nCheck-out: Aug 13, 2026\n3 nights');
  assert.equal(r.length, 1);
  assert.equal(r[0].kind, 'Stay');
  assert.equal(r[0].title, 'Courtyard by Marriott Monterey');
  assert.equal(r[0].place, 'Monterey, CA');
  assert.equal(r[0].note, 'Check-in Aug 10 · check-out Aug 13 · 3 nights');
});

test('Airbnb falls back to the listing name', () => {
  const r = parseConfirmation('Your Airbnb reservation\nCozy Cabin in Big Sur\nCheck-in Aug 11\nCheckout Aug 14');
  assert.equal(r[0].kind, 'Stay');
  assert.equal(r[0].title, 'Cozy Cabin in Big Sur');
});

test('fallback booking and empty text', () => {
  assert.deepEqual(parseConfirmation('   '), []);
  const r = parseConfirmation('Whale watching tour confirmed\nSep 4, 2026');
  assert.equal(r[0].kind, 'Booking');
  assert.equal(r[0].title, 'Whale watching tour confirmed');
});

test('migration keeps user trips and refreshes demo trips', () => {
  const mine = { id: 'u1', title: 'Mine', days: [] };
  const { changed, data } = migrate({ v: 5, trips: [{ id: 'tofino', days: [] }, mine] }, 6);
  assert.ok(changed);
  assert.deepEqual(data.trips.map((t) => t.id), ['tofino', 'u1']);
  assert.ok(data.trips[0].days.length > 0);
  assert.equal(migrate({ v: 6, trips: seed() }, 6).changed, false);
  assert.equal(migrate(null, 6).data.trips.length, 4);
  // deleting every trip must not bring the samples back
  assert.deepEqual(migrate({ v: 6, trips: [] }, 6).data.trips, []);
  assert.deepEqual(migrate({ v: 5, trips: [] }, 6).data.trips, []);
});

test('map stops merge repeated places and start from home', () => {
  const t = { place: 'X', days: [
    { num: 1, place: 'A', title: 'a', photos: [{ src: '1' }] },
    { num: 2, place: 'B', title: 'b', photos: [] },
    { num: 3, place: 'A', title: 'c', photos: [{ src: '2' }] }
  ] };
  const s = buildStops(t, { home: 'Portland', homeLon: 1, homeLat: 2 });
  assert.deepEqual(s.map((x) => x.name), ['Home', 'A', 'B']);
  assert.equal(s[0].day, 'Departure');
  assert.equal(s[1].day, 'Day 1–3');
  assert.equal(s[1].photos.length, 2);
  assert.deepEqual(buildStops({ days: [] }, { home: '' }), []);
});

test('lyric lines are spread evenly over the track', () => {
  assert.equal(activeLine(0, 120, 12), 0);
  assert.equal(activeLine(60, 120, 12), 6);
  assert.equal(activeLine(119, 120, 12), 11);
});
