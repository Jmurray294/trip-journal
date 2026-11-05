import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rangeText } from '../src/lib/dates.js';
import { datesRange } from '../src/lib/stages.js';

test('picked dates are written the way trips show them, and read back to the same days', () => {
  const cases = [
    ['2026-11-26', '', 'Nov 26, 2026', [2026, 10, 26], [2026, 10, 26]],
    ['2026-11-26', '2026-11-28', 'Nov 26–28, 2026', [2026, 10, 26], [2026, 10, 28]],
    ['2026-11-30', '2026-12-02', 'Nov 30 – Dec 2, 2026', [2026, 10, 30], [2026, 11, 2]],
    ['2026-12-30', '2027-01-02', 'Dec 30, 2026 – Jan 2, 2027', [2026, 11, 30], [2027, 0, 2]],
    ['2026-11-26', '2026-11-20', 'Nov 26, 2026', [2026, 10, 26], [2026, 10, 26]],
  ];
  for (const [s, e, text, a, z] of cases) {
    assert.equal(rangeText(s, e), text);
    const r = datesRange(text);
    assert.equal(r[0].toDateString(), new Date(...a).toDateString(), text);
    assert.equal(r[1].toDateString(), new Date(...z).toDateString(), text);
  }
  assert.equal(rangeText('', ''), '');
});
