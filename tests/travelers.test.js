import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tripDocAlerts, expiryNote } from '../src/lib/travelers.js';

const today = new Date(2026, 9, 23);
const japan = { dates: 'Apr 10–24, 2027', days: [{ kind: 'Car', booking: { start: '2027-04-15', end: '2027-04-18' } }] };
const t = (name, doc) => ({ name, doc });

test('passports are checked against the 6-month rule for international trips', () => {
  const alerts = tripDocAlerts(japan, [
    t('Joe', { passport: { expires: '2030-01-01' } }),
    t('Cathy', { passport: { expires: '2027-08-01' } }),
    t('Barbara', { passport: { expires: '2027-04-16' } }), // the bookings end the trip Apr 18
    t('Sam', {}),
  ], true, today);
  assert.deepEqual(alerts.map((a) => [a.level, a.text.split(' ')[0]]), [
    ['warn', "Cathy's"], ['bad', "Barbara's"], ['info', 'No'],
  ]);
});

test('domestic trips skip passports; Global Entry and licenses still count', () => {
  const alerts = tripDocAlerts(japan, [
    t('Joe', { passport: { expires: '2026-12-01' }, ktn: { program: 'Global Entry', number: '123', expires: '2027-03-01' }, license: { expires: '2027-04-16' } }),
  ], false, today);
  assert.equal(alerts.length, 2);
  assert.match(alerts[0].text, /Global Entry expires/);
  assert.match(alerts[1].text, /driver's license/);
});

test('past trips raise nothing; expiry notes flag soon and expired', () => {
  assert.deepEqual(tripDocAlerts({ dates: 'Jul 12–18, 2025' }, [t('Joe', {})], true, today), []);
  assert.equal(expiryNote('2026-01-01', 6, today).level, 'bad');
  assert.equal(expiryNote('2027-02-01', 6, today).level, 'warn');
  assert.equal(expiryNote('2028-02-01', 6, today), null);
});
