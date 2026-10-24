import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costTotals, isPending } from '../src/lib/derive.js';

test('a card authorization is a pending charge, not the next payment due', () => {
  const auth = { id: 'a', title: 'Partial payment - Tokyo Indulgence', note: 'Card authorized Oct 24, 2026; advisor has 30 days to charge', status: 'due', amount: 8704.3, date: '2026-10-24' };
  const bill = { id: 'b', title: 'Final balance', status: 'due', amount: 10000, date: '2027-01-15' };
  const r = costTotals([auth, bill, { id: 'c', title: 'Deposit', status: 'paid', amount: 3284.7 }]);
  assert.equal(isPending(auth), true);
  assert.equal(isPending(bill), false);
  assert.deepEqual(r.pending.map((c) => c.id), ['a']);
  assert.equal(r.nextDue.id, 'b');
  assert.equal(r.totals[0].due, 18704.3); // pending still counts as still due
});
