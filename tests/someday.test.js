import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupByPlace } from '../src/lib/someday.js';

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
