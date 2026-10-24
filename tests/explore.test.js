import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stopsOf, mergeSuggestions } from '../src/lib/explore.js';

test('stops come from the itinerary in order; a flight-only departure city is not a stop', () => {
  const trip = {
    place: 'Japan',
    days: [
      { date: 'Apr 10', kind: 'Flight', title: 'AA175 DFW → HND', place: 'Dallas' },
      { date: 'Apr 13', kind: 'Cruise', title: 'Regent Seven Seas', place: 'Tokyo' },
      { date: 'Apr 18', kind: 'Activity', title: 'Miyajima', place: 'Hiroshima' },
      { date: 'Apr 21', kind: 'Activity', title: 'Highlights of Nagasaki', place: 'Nagasaki' },
      { date: 'Apr 23', title: 'Dinner', place: 'tokyo' },
    ],
  };
  const s = stopsOf(trip);
  assert.deepEqual(s.map((x) => x.place), ['Tokyo', 'Hiroshima', 'Nagasaki']);
  assert.deepEqual(s[0].dates, ['Apr 13', 'Apr 23']);
  assert.deepEqual(stopsOf({ place: 'Scotland', days: [] }).map((x) => x.place), ['Scotland']);
});

test('more suggestions add to the list without repeating or undoing what was kept', () => {
  let n = 0;
  const id = () => 's' + (++n);
  const first = mergeSuggestions(null, { summary: 'One day ashore', items: [{ kind: 'see', title: 'Glover Garden' }] }, id, 1);
  first.items[0].status = 'added';
  const more = mergeSuggestions(first, { summary: '', items: [{ kind: 'see', title: 'glover garden' }, { kind: 'eat', title: 'Champon' }] }, id, 2);
  assert.deepEqual(more.items.map((i) => [i.title, i.status]), [['Glover Garden', 'added'], ['Champon', 'new']]);
  assert.equal(more.summary, 'One day ashore');
});
