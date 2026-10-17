import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeRemote, stableStringify, tripDoc, entryDoc } from '../src/lib/sync.js';
import { normalize, seed } from '../src/lib/seed.js';

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
