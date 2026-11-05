import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timeMinutes, planLists, makePlanItem, editPlanItem, planLine, gatheringsInOrder, isGathering } from '../src/lib/gathering.js';

test('times are read the way people write them', () => {
  assert.equal(timeMinutes('4pm'), 16 * 60);
  assert.equal(timeMinutes('4:30 PM'), 16 * 60 + 30);
  assert.equal(timeMinutes('16:00'), 16 * 60);
  assert.equal(timeMinutes('12am'), 0);
  assert.equal(timeMinutes('12 p.m.'), 12 * 60);
  assert.equal(timeMinutes('noon'), 12 * 60);
  assert.equal(timeMinutes('after dinner'), null);
  assert.equal(timeMinutes(''), null);
});

test('the plan splits into schedule (by time, untimed last), bring and coming', () => {
  const at = { first: 'Nov 26', place: 'Home' };
  const days = [
    makePlanItem({ planType: 'time', text: 'Dinner', time: '4pm' }, { ...at, id: 'a', now: 1 }),
    makePlanItem({ planType: 'time', text: 'Football', time: '11:30am' }, { ...at, id: 'b', now: 2 }),
    makePlanItem({ planType: 'time', text: 'Games, whenever' }, { ...at, id: 'c', now: 3 }),
    makePlanItem({ planType: 'bring', text: 'Pies', who: 'Lauren', by: 'Lauren' }, { ...at, id: 'd', now: 4 }),
    makePlanItem({ planType: 'coming', text: 'Grandma' }, { ...at, id: 'e', now: 5 }),
    { id: 'j', title: 'A journal entry', note: 'not part of the plan' },
  ];
  const l = planLists({ days });
  assert.deepEqual(l.time.map((d) => d.id), ['b', 'a', 'c']);
  assert.deepEqual(l.bring.map((d) => d.id), ['d']);
  assert.deepEqual(l.coming.map((d) => d.id), ['e']);
  assert.equal(l.bring[0].by, 'Lauren');
  assert.equal(planLine(l.time[0]), '11:30am · Football');
  assert.equal(planLine(l.bring[0]), 'Pies · Lauren');
  assert.equal(planLine(l.coming[0]), 'Grandma');
});

test('a plan item keeps only the fields that fit its list, and edits change only the words', () => {
  const d = makePlanItem({ planType: 'coming', text: '  Uncle   Bob ', time: '4pm', who: 'x' }, { id: 'p', first: 'Nov 26', place: 'Home', now: 9 });
  assert.equal(d.title, 'Uncle Bob');
  assert.equal(d.kind, 'Plan');
  assert.ok(!('time' in d) && !('who' in d));
  const t = makePlanItem({ planType: 'time', text: 'Dinner', time: '4pm' }, { id: 'q', now: 1 });
  const e = editPlanItem(t, { text: 'Dinner is served', time: '' });
  assert.equal(e.title, 'Dinner is served');
  assert.ok(!('time' in e));
  assert.equal(e.id, 'q');
});

test('gatherings are listed apart: coming up first, then past, most recent first', () => {
  const today = new Date(2026, 10, 5);
  const trips = [
    { id: 'trip', title: 'Milwaukee', dates: 'Oct 31 – Nov 2, 2026', days: [] },
    { id: 'bday', title: 'Birthday', dates: 'Sep 12, 2026', gathering: true, days: [] },
    { id: 'tday', title: 'Thanksgiving', dates: 'Nov 26, 2026', gathering: true, days: [] },
    { id: 'july', title: 'Fourth of July', dates: 'Jul 4, 2026', gathering: true, days: [] },
  ];
  const g = gatheringsInOrder(trips, today);
  assert.deepEqual(g.map((x) => x.t.id), ['tday', 'bday', 'july']);
  assert.deepEqual(g.map((x) => x.upcoming), [true, false, false]);
  assert.ok(!isGathering(trips[0]) && isGathering(trips[1]));
});
