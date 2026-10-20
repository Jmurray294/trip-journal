import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeRemote, stableStringify, tripDoc, entryDoc, itemDoc } from '../src/lib/sync.js';
import { normalize, seed } from '../src/lib/seed.js';
import { fileRows } from '../src/lib/inbox.js';

const none = new Map();
const S = stableStringify;
const trip = (id, days = [], extra = {}) => ({ id, title: id, place: 'P', days, ...extra });
const day = (id, pos, extra = {}) => ({ id, pos, num: 0, title: id, place: 'X', note: '', photos: [], ...extra });

test('stableStringify ignores key order and undefined', () => {
  assert.equal(S({ b: 1, a: { d: 2, c: undefined } }), S({ a: { d: 2 }, b: 1 }));
});

test('remote wins for rows this device never synced; local-only rows are kept', () => {
  const snap = { t: {}, e: {} };
  const local = [trip('mine'), trip('shared', [day('e1', 1)])];
  const out = mergeRemote(local, [{ id: 'shared', doc: { title: 'Family title', place: 'P' }, deleted: false }],
    [{ id: 'e2', trip_id: 'shared', doc: day('e2', 2, { num: undefined }), deleted: false }], snap, none);
  const shared = out.find((t) => t.id === 'shared');
  assert.equal(shared.title, 'Family title');
  assert.deepEqual(shared.days.map((d) => [d.id, d.num]), [['e1', 1], ['e2', 2]]);
  assert.ok(out.some((t) => t.id === 'mine'));
  assert.ok('shared' in snap.t && 'e2' in snap.e);
});

test('a local edit since the last sync is not overwritten by a pull', () => {
  const synced = { title: 'Old', place: 'P', id: 't' };
  const snap = { t: { t: S(synced) }, e: {} };
  const local = [trip('t', [], { title: 'Edited here' })];
  const out = mergeRemote(local, [{ id: 't', doc: { title: 'Remote', place: 'P' }, deleted: false }], [], snap, none);
  assert.equal(out[0].title, 'Edited here');
});

test('remote deletions remove the trip or memory; pending local deletes are respected', () => {
  const e1 = day('e1', 1);
  const snap = { t: { t: S(tripDoc(trip('t'), none)) }, e: { e1: ['t', S(entryDoc(e1, none))] } };
  let out = mergeRemote([trip('t', [e1])], [], [{ id: 'e1', trip_id: 't', doc: {}, deleted: true }], snap, none);
  assert.equal(out[0].days.length, 0);
  out = mergeRemote(out, [{ id: 't', doc: {}, deleted: true }], [], snap, none);
  assert.equal(out.length, 0);
  // locally deleted (still in snapshot) → a remote update does not resurrect it
  const snap2 = { t: { gone: S({ id: 'gone', title: 'gone', place: 'P' }) }, e: {} };
  out = mergeRemote([], [{ id: 'gone', doc: { title: 'changed' }, deleted: false }], [], snap2, none);
  assert.equal(out.length, 0);
});

test('cost rows go to trip.costs, not the itinerary, and stay out of the trip doc', () => {
  const snap = { t: {}, e: {} };
  const cost = { type: 'cost', title: 'Final payment', amount: 1200, currency: 'USD', status: 'paid', pos: 5 };
  let out = mergeRemote([trip('t', [day('e1', 1)])], [], [{ id: 'c1', trip_id: 't', doc: { ...cost, id: 'c1' }, deleted: false }], snap, none);
  assert.deepEqual(out[0].days.map((d) => d.id), ['e1']);
  assert.deepEqual(out[0].costs.map((c) => c.id), ['c1']);
  assert.ok(!('costs' in tripDoc(out[0], none)));
  // a row the server wrote with its id in the doc reads as unchanged here after the pull
  const snap2 = { t: {}, e: {} };
  const o2 = mergeRemote([trip('t')], [], [{ id: 'c2', trip_id: 't', doc: { ...cost, id: 'c2' }, deleted: false }], snap2, none);
  assert.equal(snap2.e.c2[1], S(itemDoc(o2[0].costs[0], none)));
  // a later remote deletion removes it from costs
  out = mergeRemote(out, [], [{ id: 'c1', trip_id: 't', doc: {}, deleted: true }], snap, none);
  assert.equal(out[0].costs.length, 0);
});

test('pulling an edited trip row keeps the trip\'s costs', () => {
  const cost = { type: 'cost', title: 'Hotel', amount: 500, currency: 'USD', status: 'paid', id: 'c1' };
  const t0 = trip('t', [day('e1', 1)], { costs: [cost] });
  const snap = { t: { t: S(tripDoc(t0, none)) }, e: { c1: ['t', S(itemDoc(cost, none))] } };
  const out = mergeRemote([t0], [{ id: 't', doc: { title: 'Renamed', place: 'P' }, deleted: false }], [], snap, none);
  assert.equal(out[0].title, 'Renamed');
  assert.deepEqual(out[0].costs.map((c) => c.id), ['c1']);
  assert.equal(out[0].days.length, 1);
});

test('filing a to-sort email moves its rows into the chosen trip, keeping photos', () => {
  const pic = [{ src: 'data:x', label: '' }];
  const trips = [trip('a', [day('b1', 1, { photos: pic })]), trip('j', [day('m1', 9)])];
  const out = fileRows(trips, 'j',
    [{ id: 'b1', doc: { title: 'Cruise', pos: 5, photos: [] } }],
    [{ id: 'c1', doc: { type: 'cost', title: 'Deposit', amount: 500, currency: 'USD', status: 'paid', pos: 3 } }]);
  assert.deepEqual(out[0].days, []);
  assert.deepEqual(out[1].days.map((d) => [d.id, d.num]), [['b1', 1], ['m1', 2]]);
  assert.deepEqual(out[1].days[0].photos, pic);
  assert.deepEqual(out[1].costs.map((c) => c.id), ['c1']);
});

test('uploaded photos are sent as storage paths, pending ones as changed', () => {
  const d = day('e1', 1, { photos: [{ src: 'data:image/jpeg;base64,AAA', label: 'x' }, { src: 'photos/a.jpg', label: 'y' }] });
  const up = new Map([['data:image/jpeg;base64,AAA', 'hh/1.jpg']]);
  assert.deepEqual(entryDoc(d, up).photos, [{ label: 'x', path: 'hh/1.jpg' }, { src: 'photos/a.jpg', label: 'y' }]);
  assert.ok(!('num' in entryDoc(d, up)));
});

test('sample trips get the same memory ids on every device', () => {
  const a = normalize(seed()).trips, b = normalize(seed()).trips;
  assert.deepEqual(a[1].days.map((d) => d.id), ['tofino-1', 'tofino-2', 'tofino-3']);
  assert.deepEqual(a.map((t) => t.days.map((d) => d.id)), b.map((t) => t.days.map((d) => d.id)));
  assert.equal(normalize(a).changed, false);
});
