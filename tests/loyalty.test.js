import { test } from 'node:test';
import assert from 'node:assert/strict';
import { programKey, bookingProgram, last4 } from '../src/lib/loyalty.js';
import { loyaltyAlerts } from '../src/lib/travelers.js';

test('brands and program names map to one program', () => {
  assert.equal(programKey('AAdvantage'), 'aadvantage');
  assert.equal(programKey('American Airlines AAdvantage'), 'aadvantage');
  assert.equal(programKey('Marriott Bonvoy'), 'bonvoy');
  assert.equal(bookingProgram('The Westin Tokyo', '').key, 'bonvoy');
  assert.equal(bookingProgram('Regent Seven Seas Cruises', '').key, 'regent');
  assert.equal(bookingProgram('Philippine Airlines', 'PR431 · NRT → MNL'), null);
  assert.equal(last4('****-1234'), '1234');
});

const today = new Date(2026, 9, 23);
const joe = { name: 'Joe', doc: { passport: { name: 'JOSEPH MURRAY' }, loyalty: [{ program: 'AAdvantage', number: 'ABC1234' }] } };
const cathy = { name: 'Cathy', doc: { loyalty: [{ program: 'AAdvantage', number: 'XYZ9876' }, { program: 'Bonvoy', number: '555000111' }] } };
const flight = (loyalty, travelers = '') => ({
  days: [{ title: 'American Airlines AA175 · DFW → HND', booking: { provider: 'American Airlines', start: '2027-04-10', loyalty, travelers } }],
});

test('a booking without a traveler\'s number is flagged; one showing it is not', () => {
  assert.deepEqual(loyaltyAlerts(flight('****1234'), [joe, cathy], today).map((a) => a.text),
    ['No AAdvantage # for Cathy on American Airlines AA175 · DFW → HND — add it before you go.']);
  assert.deepEqual(loyaltyAlerts(flight('****1234, XYZ9876'), [joe, cathy], today), []);
});

test('only the travelers named on a booking count; older bookings are not checked', () => {
  assert.equal(loyaltyAlerts(flight('', 'JOSEPH MURRAY'), [joe, cathy], today)[0].text.includes('for Joe on'), true);
  const old = { days: [{ title: 'AA175', booking: { provider: 'American Airlines', start: '2027-04-10' } }] };
  assert.deepEqual(loyaltyAlerts(old, [joe, cathy], today), []);
});
