import { test } from 'node:test';
import assert from 'node:assert/strict';
import { datesRange, tripStage, countdown, stageLabel, groupTrips } from '../src/lib/stages.js';

const today = new Date(2026, 9, 23); // Oct 23, 2026
const ymd = (d) => [d.getFullYear(), d.getMonth() + 1, d.getDate()];

test('dates text is read as a range, including month-only and year-wrapping dates', () => {
  assert.deepEqual(datesRange('Sep 3–14, 2026').map(ymd), [[2026, 9, 3], [2026, 9, 14]]);
  assert.deepEqual(datesRange('Dec 28 – Jan 3, 2027').map(ymd), [[2026, 12, 28], [2027, 1, 3]]);
  assert.deepEqual(datesRange('April 2027').map(ymd), [[2027, 4, 1], [2027, 4, 30]]);
  assert.equal(datesRange('Dates to be decided'), null);
});

test('a trip is past once its last day is over, whatever it was labelled', () => {
  assert.equal(tripStage({ dates: 'April 2027', planning: false, statusLabel: 'My trip' }, today), 'upcoming');
  assert.equal(tripStage({ dates: 'Aug 8–15, 2026', planning: true }, today), 'past');
  assert.equal(tripStage({ dates: 'Oct 20–23, 2026', planning: true }, today), 'upcoming');
  assert.equal(tripStage({ dates: 'Oct 20–23, 2026', possible: true }, today), 'possible');
  assert.equal(tripStage({ dates: 'Someday', planning: true }, today), 'upcoming');
  assert.equal(tripStage({ dates: 'Someday' }, today), 'past');
});

test('bookings set the span over the dates text; cancelled ones do not count', () => {
  const t = {
    dates: 'April 2027',
    days: [
      { booking: { start: '2027-04-10', end: '2027-04-11' } },
      { booking: { start: '2027-04-13', end: '2027-04-23' } },
      { booking: { start: '2027-06-01', status: 'cancelled' } },
    ],
  };
  assert.equal(countdown(t, today), 'in 6 months');
  assert.equal(countdown(t, new Date(2027, 3, 9)), 'tomorrow');
  assert.equal(stageLabel(t, new Date(2027, 3, 15)), 'Upcoming · happening now');
  assert.equal(stageLabel(t, new Date(2027, 3, 24)), 'Past trip');
});

test('trips are grouped: upcoming soonest first, past most recent first', () => {
  const trips = [
    { id: 'japan', dates: 'April 2027' },
    { id: 'tofino', dates: 'Jul 12–18, 2025' },
    { id: 'scotland', dates: 'Dec 1–9, 2026', planning: true },
    { id: 'bigsur', dates: 'Aug 8–15, 2026', planning: true },
    { id: 'banff', dates: 'Jul 2027', possible: true },
  ];
  const g = groupTrips(trips, today);
  assert.deepEqual(g.upcoming.map((t) => t.id), ['scotland', 'japan']);
  assert.deepEqual(g.past.map((t) => t.id), ['bigsur', 'tofino']);
  assert.deepEqual(g.possible.map((t) => t.id), ['banff']);
});

test('a photo goes to the trip whose dates cover the day it was taken', async () => {
  const { tripForDay } = await import('../src/lib/stages.js');
  const trips = [
    { id: 'mke', title: 'Milwaukee 2026', dates: 'Oct 31 – Nov 2, 2026' },
    { id: 'jp', title: 'Japan 2027', dates: 'Apr 2–16, 2027' },
    { id: 'maybe', title: 'Maybe', possible: true, dates: 'Oct 30 – Nov 5, 2026' },
  ];
  assert.equal(tripForDay(trips, new Date(2026, 9, 31, 15), 'jp'), 'mke', 'taken in Milwaukee, added from Japan');
  assert.equal(tripForDay(trips, new Date(2026, 10, 3), 'jp'), 'mke', 'a day after counts');
  assert.equal(tripForDay(trips, new Date(2027, 3, 5), 'jp'), 'jp');
  assert.equal(tripForDay(trips, new Date(2026, 5, 1), 'jp'), 'jp', 'no trip that day: stays where it was added');
  assert.equal(tripForDay(trips, null, 'jp'), 'jp', 'no date: stays');
});

test('the phone adds to the trip happening now, else the next one, else the latest', async () => {
  const { currentTrip } = await import('../src/lib/stages.js');
  const trips = [
    { id: 'jp', dates: 'Apr 2–16, 2027' },
    { id: 'mke', dates: 'Oct 31 – Nov 2, 2026' },
    { id: 'old', dates: 'Jun 1–5, 2025' },
    { id: 'maybe', possible: true, dates: 'Nov 1–30, 2026' },
  ];
  assert.equal(currentTrip(trips, new Date(2026, 10, 1)), 'mke');
  assert.equal(currentTrip(trips, new Date(2026, 10, 10)), 'jp');
  assert.equal(currentTrip(trips, new Date(2027, 5, 1)), 'jp');
  assert.equal(currentTrip([], new Date()), null);
});
