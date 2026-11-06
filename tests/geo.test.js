import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeQueries, tripPoint, miles, haversineKm, awayStops } from '../src/lib/geo.js';

test('distances read in miles, rounded past 100', () => {
  assert.equal(miles(50), '31 mi');
  // Lewisville, TX to Tokyo (DFW–NRT is about 6,400 mi)
  assert.equal(miles(haversineKm([-96.99, 33.05], [139.69, 35.69])), '6,440 mi');
});

test('a loose trip place is looked up by its first part first', () => {
  assert.deepEqual(placeQueries('Japan & Seoul'), ['Japan', 'Japan & Seoul']);
  assert.deepEqual(placeQueries('Scotland with Barbara'), ['Scotland', 'Scotland with Barbara']);
  assert.deepEqual(placeQueries('Italy'), ['Italy']);
  assert.deepEqual(placeQueries(''), []);
});

test('a trip pins at its place, else at the stop farthest from home', () => {
  const home = { homeLon: -96.99, homeLat: 33.05 }; // Lewisville, TX
  const days = [{ lon: -96.85, lat: 32.9 }, { lon: 139.78, lat: 35.55 }, { lon: 120.98, lat: 14.6 }];
  assert.deepEqual(tripPoint({ lon: 138.25, lat: 36.2, days }, home), [138.25, 36.2]);
  assert.deepEqual(tripPoint({ days: days.slice(0, 2) }, home), [139.78, 35.55]);
  assert.equal(tripPoint({ days: [] }, home), null);
});

test('the route for followers and guests: one pin per place, in order, never home', () => {
  const days = [
    { date: 'Jul 1', place: 'Rome', lon: 12.5, lat: 41.9 },
    { date: 'Jul 2', place: 'Rome', lon: 12.5, lat: 41.9 },
    { date: 'Jul 3', place: 'Somewhere unplaced' },
    { date: 'Jul 4', place: 'Florence', lon: 11.25, lat: 43.77 },
    { date: 'Jul 5', place: '' },
  ];
  const s = awayStops(days);
  assert.deepEqual(s.map((x) => x.name), ['Rome', 'Florence']);
  assert.deepEqual(s.map((x) => x.index), [0, 1]);
  assert.equal(s[0].date, 'Jul 1');
  assert.ok(s.every((x) => !x.isHome));
  assert.deepEqual(awayStops([]), []);
  assert.deepEqual(awayStops([{ place: 'Rome', lon: 12.5, lat: 41.9 }]).length, 1);
});
