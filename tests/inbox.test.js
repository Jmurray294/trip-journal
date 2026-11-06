import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeTrip, moveEntry } from '../src/lib/inbox.js';

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

test('tickets move into a gathering with their cost; the trip the email made goes away', () => {
  const trips = [
    { id: 'att', source: 'email', title: 'AT&T Stadium Tour', days: [{ id: 'b1', kind: 'Activity', title: 'Stadium tour', pos: 20, booking: { confirmation: 'AB-1234' } }],
      costs: [{ id: 'c1', title: 'Tour tickets', confirmation: 'ab1234', pos: 5 }, { id: 'c2', title: 'Parking', pos: 6 }] },
    { id: 'rd', title: 'Roger & Diane visit', gathering: true, days: [{ id: 'p1', kind: 'Plan', pos: 10 }] },
  ];
  const out = moveEntry(trips, 'att', 'b1', 'rd');
  const rd = out.find((t) => t.id === 'rd');
  assert.deepEqual(rd.days.map((d) => d.id).sort(), ['b1', 'p1']);
  assert.deepEqual(rd.costs.map((c) => c.id), ['c1']);
  // parking is still there, so the trip stays
  assert.deepEqual(out.find((t) => t.id === 'att').costs.map((c) => c.id), ['c2']);

  const only = [{ ...trips[0], costs: [trips[0].costs[0]] }, trips[1]];
  const out2 = moveEntry(only, 'att', 'b1', 'rd');
  assert.deepEqual(out2.map((t) => t.id), ['rd']);
});

test('a trip the family made stays even when its last item moves', () => {
  const trips = [{ id: 'jp', title: 'Japan', days: [{ id: 'x', title: 'Hotel' }] }, { id: 'tg', gathering: true, days: [] }];
  const out = moveEntry(trips, 'jp', 'x', 'tg');
  assert.deepEqual(out.map((t) => t.id), ['jp', 'tg']);
  assert.deepEqual(out[0].days, []);
  assert.equal(moveEntry(trips, 'jp', 'nope', 'tg'), trips);
});
