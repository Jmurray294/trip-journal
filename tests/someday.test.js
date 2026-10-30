import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupByPlace, searchIdeas } from '../src/lib/someday.js';

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
