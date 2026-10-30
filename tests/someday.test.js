import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupByPlace, searchIdeas, countryOf, byCountry } from '../src/lib/someday.js';

test('ideas group by place, biggest place first, newest first within a place', () => {
  const items = [
    { id: 1, place: 'Italy', title: 'Positano', created_at: '2026-10-01' },
    { id: 2, place: 'Japan', title: 'Naoshima', created_at: '2026-10-20' },
    { id: 3, place: 'italy ', title: 'Dolomites', created_at: '2026-10-10' },
    { id: 4, place: '', title: 'Overwater bungalow', created_at: '2026-09-01' },
  ];
  const g = groupByPlace(items);
  assert.deepEqual(g.map((x) => x.place), ['Italy', 'Japan', 'Anywhere']);
  assert.deepEqual(g[0].items.map((x) => x.id), [3, 1]);
});

test('search matches every word across place, title and note, keeping the whole place for planning', () => {
  const g = groupByPlace([
    { id: 1, place: 'Italy', title: 'Positano', note: 'lemon groves by the sea', created_at: '2026-10-01' },
    { id: 2, place: 'Italy', title: 'Dolomites', note: 'September hiking', created_at: '2026-10-10' },
    { id: 3, place: 'Japan', title: 'Naoshima', note: 'art island', created_at: '2026-10-20' },
  ]);
  assert.equal(searchIdeas(g, '  '), g);
  assert.deepEqual(searchIdeas(g, 'italy').map((x) => x.items.length), [2]);
  const sea = searchIdeas(g, 'Italy SEA');
  assert.deepEqual(sea[0].items.map((x) => x.id), [1]);
  assert.equal(sea[0].all.items.length, 2);
  assert.deepEqual(searchIdeas(g, 'island').map((x) => x.place), ['Japan']);
  assert.deepEqual(searchIdeas(g, 'paris'), []);
});

test('places read as country, then state', () => {
  assert.deepEqual(countryOf('Alaska'), { country: 'United States', state: 'Alaska' });
  assert.deepEqual(countryOf('british columbia'), { country: 'Canada', state: 'british columbia' });
  assert.deepEqual(countryOf('Italy'), { country: 'Italy', state: '' });
  assert.deepEqual(countryOf('USA'), { country: 'United States', state: '' });
  assert.deepEqual(countryOf('Tuscany, Italy'), { country: 'Italy', state: 'Tuscany' });
  assert.deepEqual(countryOf('Maine, USA'), { country: 'United States', state: 'Maine' });
  assert.deepEqual(countryOf('Sicily'), { country: 'Italy', state: 'Sicily' });
  assert.deepEqual(countryOf('Campania, Italy'), { country: 'Italy', state: 'Campania' });
  assert.deepEqual(countryOf(''), { country: 'Anywhere', state: '' });
});

test('the board gathers states under their country, biggest country first, Anywhere last', () => {
  const g = groupByPlace([
    { id: 1, place: 'Alaska', title: 'Denali', created_at: '2026-10-01' },
    { id: 2, place: 'Maine', title: 'Acadia', created_at: '2026-10-02' },
    { id: 3, place: 'USA', title: 'Route 66', created_at: '2026-10-03' },
    { id: 4, place: '', title: 'Overwater bungalow', created_at: '2026-10-04' },
    { id: 5, place: '', title: 'Safari', created_at: '2026-10-05' },
    { id: 6, place: 'Italy', title: 'Positano', created_at: '2026-10-06' },
  ]);
  const c = byCountry(g);
  assert.deepEqual(c.map((x) => [x.country, x.count]), [['United States', 3], ['Italy', 1], ['Anywhere', 2]]);
  assert.equal(c[0].places[0].state, '');
  assert.deepEqual(c[0].places.slice(1).map((x) => x.state).sort(), ['Alaska', 'Maine']);
});
