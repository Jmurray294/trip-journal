import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeTrip } from '../src/lib/inbox.js';

test('a trip moved into a gathering brings its bookings, notes and costs, and goes away', () => {
  const trips = [
    { id: 'att', title: 'AT&T Stadium Tour', days: [{ id: 'b1', kind: 'Activity', title: 'Stadium tour', pos: 20 }], costs: [{ id: 'c1', title: 'Tickets', amount: 80, pos: 5 }] },
    { id: 'tg', title: 'Thanksgiving', gathering: true, days: [{ id: 'p1', kind: 'Plan', title: 'Dinner', pos: 10 }, { id: 'n1', title: 'Note', pos: 30 }], costs: [{ id: 'c0', pos: 1 }] },
    { id: 'jp', title: 'Japan', days: [] },
  ];
  const out = mergeTrip(trips, 'att', 'tg');
  assert.deepEqual(out.map((t) => t.id), ['tg', 'jp']);
  const tg = out[0];
  assert.equal(tg.gathering, true);
  assert.deepEqual(tg.days.map((d) => d.id).sort(), ['b1', 'n1', 'p1']);
  assert.deepEqual(tg.costs.map((c) => c.id), ['c0', 'c1']);
  assert.equal(out[1], trips[2]);
});

test('moving into itself or a trip that is gone changes nothing', () => {
  const trips = [{ id: 'a', days: [] }, { id: 'b', days: [] }];
  assert.equal(mergeTrip(trips, 'a', 'a'), trips);
  assert.equal(mergeTrip(trips, 'a', 'zz'), trips);
  assert.equal(mergeTrip(trips, 'zz', 'b'), trips);
});
