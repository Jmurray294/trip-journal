import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attention, urgentCount } from '../src/lib/attention.js';

const today = new Date(2026, 9, 31); // Oct 31, 2026

const milwaukee = {
  id: 'mke', title: 'Milwaukee 2026', dates: 'Oct 31 – Nov 2, 2026',
  costs: [
    { id: 'a', title: 'Flights', amount: 1763.58, currency: 'USD', status: 'paid' },
    { id: 'b', title: 'Hotel balance', amount: 400, currency: 'USD', status: 'due', date: '2026-10-20' },
    { id: 'c', title: 'Pending authorization', amount: 25, currency: 'USD', status: 'due', date: '2026-10-31' },
  ],
};
const japan = {
  id: 'jp', title: 'Japan 2027', dates: 'Apr 2–16, 2027',
  costs: [
    { id: 'd', title: 'Ryokan deposit', amount: 300, currency: 'USD', status: 'due', date: '2026-11-08' },
    { id: 'e', title: 'Tour balance', amount: 900, currency: 'USD', status: 'due', date: '2027-02-01' },
  ],
};
const past = { id: 'old', title: 'Old trip', dates: 'Jun 1–5, 2025', costs: [{ id: 'f', title: 'Never paid', amount: 5, status: 'due', date: '2025-06-01' }] };
const possible = { id: 'p', title: 'Maybe', possible: true, dates: 'Nov 3, 2026', costs: [] };

test('overdue and soon-due payments, the trip underway and To sort come up; the rest stay quiet', () => {
  const items = attention([milwaukee, japan, past, possible], { toSort: 2, today });
  const texts = items.map((i) => i.text);
  assert.ok(texts.some((t) => t.startsWith('Hotel balance') && t.includes('was due')), 'overdue');
  assert.ok(texts.some((t) => t.startsWith('Ryokan deposit') && t.includes('due Nov')), 'due within two weeks');
  assert.ok(!texts.some((t) => t.startsWith('Tour balance')), 'months away');
  assert.ok(!texts.some((t) => t.startsWith('Pending')), 'pending charges settle on their own');
  assert.ok(!texts.some((t) => t.startsWith('Never paid')), 'past trips');
  assert.ok(!texts.some((t) => t.startsWith('Maybe')), 'possible trips');
  assert.ok(texts.includes('Milwaukee 2026 is happening now'));
  assert.ok(texts.includes('2 emails are waiting under To sort'));
  assert.equal(items[0].level, 'bad');
  assert.equal(items[items.length - 1].level, 'info');
  assert.equal(urgentCount(items), 3);
  assert.deepEqual(items.find((i) => i.text.startsWith('Hotel')).open, { tripId: 'mke', section: 'budget' });
});

test('nothing to look at gives an empty list', () => {
  assert.deepEqual(attention([past], { today }), []);
});
