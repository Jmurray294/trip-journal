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
  assert.ok(!texts.some((t) => t.includes('happening now')), 'the trip itself is not a bell item');
  assert.ok(texts.includes('2 emails are waiting under To sort'));
  assert.equal(items[0].level, 'bad');
  assert.equal(urgentCount(items), 3);
  assert.deepEqual(items.find((i) => i.text.startsWith('Hotel')).open, { tripId: 'mke', section: 'budget' });
});

test('nothing to look at gives an empty list', () => {
  assert.deepEqual(attention([past], { today }), []);
});

test('charges that came in by email this past week show under Charges, newest first', () => {
  const now = today.getTime();
  const trip = {
    id: 'mke', title: 'Milwaukee 2026', dates: 'Oct 31 – Nov 2, 2026',
    costs: [
      { id: 'p', title: 'Lunch', vendor: 'Panera Bread', amount: 36.55, currency: 'USD', status: 'paid', date: '2026-10-31', source: 'email', card: 'Amex …66003', added: now - 3600000 },
      { id: 'q', title: 'Coffee', vendor: 'Colectivo', amount: 8, currency: 'USD', status: 'paid', date: '2026-10-31', source: 'email', added: now - 60000 },
      { id: 'r', title: 'Old', amount: 50, currency: 'USD', status: 'paid', source: 'email', added: now - 10 * 86400000 },
      { id: 's', title: 'Typed in', amount: 20, currency: 'USD', status: 'paid', added: now },
      { id: 't', title: 'Deposit due', amount: 99, currency: 'USD', status: 'due', source: 'email', added: now },
    ],
  };
  const charges = attention([trip], { today }).filter((i) => i.kind === 'charges');
  assert.deepEqual(charges.map((c) => c.key), ['charge:mke:q', 'charge:mke:p']);
  assert.ok(charges[1].text.startsWith('Panera Bread: $36.55'));
  assert.equal(charges[1].sub, 'Milwaukee 2026 · Amex …66003');
  assert.deepEqual(charges[1].open, { tripId: 'mke', section: 'budget' });
  assert.equal(urgentCount(charges), 0);
});
