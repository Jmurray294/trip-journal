import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timeMinutes, planLists, makePlanItem, editPlanItem, planLine, gatheringsInOrder, isGathering, toggleVote, hasVoted, scheduleIdea } from '../src/lib/gathering.js';

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

test('ideas: "I am in" toggles by name, the most wanted come first, and a picked one goes on the schedule', () => {
  const lights = makePlanItem({ planType: 'idea', text: 'Christmas lights drive', detail: 'Trail of Lights, after dark', time: '6pm', who: 'x' }, { id: 'i1', now: 1 });
  assert.equal(lights.detail, 'Trail of Lights, after dark');
  assert.deepEqual(lights.votes, []);
  assert.ok(!('time' in lights) && !('who' in lights));
  let hike = makePlanItem({ planType: 'idea', text: 'Hike Mount Bonnell' }, { id: 'i2', now: 2 });
  hike = toggleVote(toggleVote(hike, 'Lauren'), ' grandma ');
  assert.ok(hasVoted(hike, 'lauren') && hasVoted(hike, 'Grandma'));
  assert.ok(!hasVoted(toggleVote(hike, 'LAUREN'), 'Lauren'));
  assert.deepEqual(toggleVote(hike, '  ').votes, hike.votes);
  const l = planLists({ days: [lights, hike] });
  assert.deepEqual(l.idea.map((d) => d.id), ['i2', 'i1']);
  assert.equal(planLine(hike), 'Hike Mount Bonnell (2 in: Lauren, grandma)');
  const s = scheduleIdea(lights, ' Fri 6pm ');
  assert.equal(s.planType, 'time');
  assert.equal(s.time, 'Fri 6pm');
  assert.equal(s.detail, 'Trail of Lights, after dark');
  assert.deepEqual(s.votes, lights.votes); // who was in is who's going
  assert.deepEqual(planLists({ days: [s] }).time.map((d) => d.id), ['i1']);
  assert.equal(editPlanItem(lights, { detail: '' }).detail, undefined);
});

test('the guest message lists the ideas, most wanted first, then the link', async () => {
  const { guestMessage } = await import('../src/lib/gathering.js');
  const a = makePlanItem({ planType: 'idea', text: 'Hike' }, { id: 'a', now: 1 });
  const b = toggleVote(makePlanItem({ planType: 'idea', text: 'Lights drive' }, { id: 'b', now: 2 }), 'Lauren');
  const m = guestMessage({ title: 'Thanksgiving', days: [a, b] }, 'https://x/?t=1');
  assert.ok(m.startsWith('Thanksgiving: here are some ideas'));
  assert.ok(m.indexOf('• Lights drive') < m.indexOf('• Hike'));
  assert.ok(m.endsWith('https://x/?t=1'));
  assert.ok(guestMessage({ title: 'T', days: [] }, 'L').includes('see the plan'));
});

import { gatheringDays, scheduleByDay, fmtTime, pickerTime, shiftItem, shiftFrom, courseOf, bringByCourse, stillNeeded, claimItem } from '../src/lib/gathering.js';

test('a gathering has a day for each date, named with the weekday', () => {
  const days = gatheringDays([new Date(2026, 10, 25), new Date(2026, 10, 28)]);
  assert.deepEqual(days.map((d) => d.name), ['Wed Nov 25', 'Thu Nov 26', 'Fri Nov 27', 'Sat Nov 28']);
  assert.equal(days[1].label, 'Nov 26');
  assert.deepEqual(gatheringDays(null), []);
});

test('the schedule groups by day (empty days too), by time, anytime last; items off the dates get their own day', () => {
  const days = gatheringDays([new Date(2026, 10, 26), new Date(2026, 10, 28)]);
  const at = { first: 'Nov 26', place: 'Home' };
  const items = [
    makePlanItem({ planType: 'time', text: 'Dinner', time: '4pm' }, { ...at, id: 'a', now: 1 }),
    makePlanItem({ planType: 'time', text: 'Turkey trot', time: '8am', day: 'Nov 26' }, { ...at, id: 'b', now: 2 }),
    makePlanItem({ planType: 'time', text: 'Games' }, { ...at, id: 'c', now: 3 }),
    makePlanItem({ planType: 'time', text: 'Lights drive', time: '6pm', day: 'Nov 28' }, { ...at, id: 'd', now: 4 }),
    makePlanItem({ planType: 'time', text: 'Brunch', time: '10am', day: 'Nov 30' }, { ...at, id: 'e', now: 5 }),
  ];
  const g = scheduleByDay(items, days);
  assert.deepEqual(g.map((x) => x.name), ['Thu Nov 26', 'Fri Nov 27', 'Sat Nov 28', 'Nov 30']);
  assert.deepEqual(g[0].items.map((d) => d.id), ['b', 'a', 'c']);
  assert.equal(g[1].items.length, 0);
  assert.deepEqual(g[2].items.map((d) => d.id), ['d']);
});

test('times are written the short way and read back for the picker', () => {
  assert.equal(fmtTime(16 * 60), '4pm');
  assert.equal(fmtTime(16 * 60 + 30), '4:30pm');
  assert.equal(fmtTime(12 * 60), 'noon');
  assert.equal(fmtTime(0), '12am');
  assert.equal(fmtTime(9 * 60 + 5), '9:05am');
  assert.equal(pickerTime('4:30pm'), '16:30');
  assert.equal(pickerTime('after dinner'), '');
});

test('moving an item moves its end time with it; pushing back moves the rest of that day only', () => {
  const at = { first: 'Nov 26', place: 'Home' };
  const a = makePlanItem({ planType: 'time', text: 'Football', time: '11:30am', until: '2:30pm' }, { ...at, id: 'a', now: 1 });
  assert.deepEqual([shiftItem(a, 30).time, shiftItem(a, 30).until], ['noon', '3pm']);
  const days = [
    makePlanItem({ planType: 'time', text: 'Trot', time: '8am' }, { ...at, id: 'x', now: 0 }),
    a,
    makePlanItem({ planType: 'time', text: 'Dinner', time: '4pm' }, { ...at, id: 'b', now: 2 }),
    makePlanItem({ planType: 'time', text: 'Games' }, { ...at, id: 'c', now: 3 }),
    makePlanItem({ planType: 'time', text: 'Movie', time: '7pm', day: 'Nov 27' }, { ...at, id: 'd', now: 4 }),
  ];
  const moved = shiftFrom(days, 'a', 60);
  assert.deepEqual(moved.map((d) => [d.id, d.time]), [['a', '12:30pm'], ['b', '5pm']]);
  assert.equal(moved[0].until, '3:30pm');
  assert.deepEqual(shiftFrom(days, 'c', 60), []);
});

test('edits can move an item to another day and set or clear its end time', () => {
  const d = makePlanItem({ planType: 'time', text: 'Dinner', time: '4pm', until: '6pm', group: 'Everyone' }, { id: 'a', first: 'Nov 26', place: 'Home', now: 1 });
  assert.equal(d.until, '6pm');
  assert.equal(d.group, 'Everyone');
  const e = editPlanItem(d, { day: 'Nov 27' });
  assert.equal(e.date, 'Nov 27');
  assert.equal(e.time, '4pm');
  const f = editPlanItem(d, { time: '' });
  assert.ok(!('time' in f) && !('until' in f));
});

test('things to bring sit under their course; empty Who means still needed, and a guest can claim it', () => {
  const at = { first: 'Nov 26', place: 'Home' };
  const pie = makePlanItem({ planType: 'bring', text: 'Pumpkin pie', course: 'desserts' }, { ...at, id: 'p', now: 1 });
  const rolls = makePlanItem({ planType: 'bring', text: 'Rolls', course: 'Sides', who: 'Lauren' }, { ...at, id: 'r', now: 2 });
  const old = { id: 'o', kind: 'Plan', planType: 'bring', title: 'Wine', who: 'Bob' };
  assert.equal(pie.course, 'Desserts');
  assert.equal(courseOf(old), 'Other');
  assert.deepEqual(bringByCourse([pie, rolls, old]).map((g) => g.course), ['Sides', 'Desserts', 'Other']);
  assert.ok(stillNeeded(pie) && !stillNeeded(rolls));
  assert.equal(planLine(pie), 'Pumpkin pie · still needed');
  const mine = claimItem(pie, 'Diane');
  assert.equal(mine.who, 'Diane');
  assert.equal(claimItem(mine, 'Someone else').who, 'Diane');
  assert.ok(!('who' in claimItem(mine, 'diane')));
});

test('an idea put on the schedule lands on the day picked', () => {
  const idea = makePlanItem({ planType: 'idea', text: 'Lights drive' }, { id: 'i', first: 'Nov 26', place: 'Home', now: 1 });
  const s = scheduleIdea(idea, '6pm', 'Nov 28');
  assert.equal(s.planType, 'time');
  assert.equal(s.date, 'Nov 28');
  assert.equal(s.time, '6pm');
});

import { daySlots, linkLabel, namesFrom } from '../src/lib/gathering.js';

test('links are named for where they go', () => {
  assert.equal(linkLabel('https://www.bing.com/maps?q=Stewart+Peninsula+Golf+C'), 'Map');
  assert.equal(linkLabel('https://www.google.com/maps/place/Galleria'), 'Map');
  assert.equal(linkLabel('https://maps.app.goo.gl/abc'), 'Map');
  assert.equal(linkLabel('https://www.alltrails.com/trail/us/texas/blackjack-t'), 'AllTrails');
  assert.equal(linkLabel('https://raceroster.com/events/2026/117103/2026-d'), 'Race Roster');
  assert.equal(linkLabel('https://www.dallascowboys.com/tickets'), 'dallascowboys.com');
  assert.equal(linkLabel('not a link'), 'Link');
});

test('things at the same time share a slot; anytime items stand alone', () => {
  const at = { first: 'Nov 25', place: 'Home' };
  let n = 0;
  const mk = (text, time, until) => makePlanItem({ planType: 'time', text, time, until }, { ...at, id: text, now: n++ });
  const day = [mk('Golf', '7am', '11am'), mk('Hike', '10am'), mk('Universal', '10am'), mk('Shopping', '1pm'), mk('Game', '7:30pm'), mk('Games')];
  assert.deepEqual(daySlots(day).map((s) => s.map((d) => d.id)), [['Golf', 'Hike', 'Universal'], ['Shopping'], ['Game'], ['Games']]);
  const noEnds = [mk('A', '10am'), mk('B', '10am'), mk('C', '10:30am')];
  assert.deepEqual(daySlots(noEnds).map((s) => s.length), [2, 1]);
});

test('who is going: I am in on a schedule item, or typed names', () => {
  const d = makePlanItem({ planType: 'time', text: 'Golf', time: '7am' }, { id: 'g', first: 'Nov 25', place: 'Home', now: 1 });
  assert.deepEqual(toggleVote(d, 'Joe').votes, ['Joe']);
  assert.deepEqual(namesFrom('Joe, Roger and Randy & Joe'), ['Joe', 'Roger', 'Randy']);
  assert.deepEqual(editPlanItem(d, { going: 'Joe, Roger' }).votes, ['Joe', 'Roger']);
  assert.deepEqual(editPlanItem(d, { going: '' }).votes, []);
});

import { updateMessage } from '../src/lib/gathering.js';

test('the update text says what is new and changed since the last one, what is still needed, and the link', () => {
  const at = { first: 'Nov 26', place: 'Home' };
  const days = gatheringDays([new Date(2026, 10, 25), new Date(2026, 10, 27)]);
  const golf = makePlanItem({ planType: 'time', text: 'Golfing', time: '7am', day: 'Nov 25' }, { ...at, id: 'g', now: 10 });
  const dinner = { ...makePlanItem({ planType: 'time', text: 'Dinner', time: '1pm' }, { ...at, id: 'd', now: 11 }), changed: 50 };
  const pickle = makePlanItem({ planType: 'time', text: 'Pickleball', time: '7am', day: 'Nov 27' }, { ...at, id: 'p', now: 60 });
  const rolls = makePlanItem({ planType: 'bring', text: 'Rolls', course: 'Sides' }, { ...at, id: 'r', now: 12 });
  const trip = { title: 'Thanksgiving', days: [golf, dinner, pickle, rolls] };
  const m = updateMessage(trip, 'https://link', 40, days);
  assert.match(m, /New:\n• Fri 7am · Pickleball/);
  assert.match(m, /Changed:\n• Thu 1pm · Dinner/);
  assert.ok(!m.includes('Golfing'));
  assert.match(m, /Still needed: Rolls\./);
  assert.ok(m.trim().endsWith('https://link'));
  // never sent before: the schedule, day by day
  const first = updateMessage(trip, 'https://link', 0, days);
  assert.match(first, /Wed: 7am Golfing\nThu: 1pm Dinner\nFri: 7am Pickleball/);
});

import { bringByEvent, bringCounts, defaultEvent, eventLabel } from '../src/lib/gathering.js';

test('the bring list goes event by event; things for no event (or a removed one) come last', () => {
  const at = { first: 'Nov 26', place: 'Home' };
  const days = gatheringDays([new Date(2026, 10, 24), new Date(2026, 10, 26)]);
  const party = makePlanItem({ planType: 'time', text: "Lucy's Birthday Party", time: '3pm', day: 'Nov 24' }, { ...at, id: 'party', now: 1 });
  const dinner = makePlanItem({ planType: 'time', text: 'Thanksgiving Dinner', time: 'noon' }, { ...at, id: 'dinner', now: 2 });
  const golf = makePlanItem({ planType: 'time', text: 'Golf', time: '7am', day: 'Nov 25' }, { ...at, id: 'golf', now: 3 });
  const b = (text, event, who) => makePlanItem({ planType: 'bring', text, event, who }, { ...at, id: text, now: 9 });
  const bring = [b('Rolls', 'dinner'), b('Cake', 'party', 'Diane'), b('Ice'), b('Pie', 'dinner', 'Krys'), b('Old', 'gone')];
  const g = bringByEvent(bring, [dinner, party, golf], days);
  assert.deepEqual(g.map((x) => x.event && x.event.id), ['party', 'dinner', null]);
  assert.deepEqual(g[2].items.map((d) => d.id), ['Ice', 'Old']);
  assert.deepEqual(bringCounts(bring, 'dinner'), { total: 2, needed: 1 });
  assert.equal(eventLabel(dinner, days), 'Thanksgiving Dinner · Thu noon');
  assert.equal(defaultEvent(bring, [dinner, party, golf]), 'dinner');
  assert.equal(defaultEvent([], [golf, party, dinner]), 'party');
  assert.equal(defaultEvent([], [golf]), '');
  assert.equal(editPlanItem(bring[2], { event: 'party' }).event, 'party');
  assert.ok(!('event' in editPlanItem(bring[0], { event: '' })));
});
