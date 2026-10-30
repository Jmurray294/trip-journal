import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixMojibake, repairTrips } from '../src/lib/mojibake.js';

// pairs of [right, garbled]: the garbled side made by Windows' own CP437 decoder (.NET Encoding 437)
const PAIRS = [
  ['S · D', 'S ┬╖ D'],
  ['L — P', 'L ΓÇö P'],
  ['1–8', '1ΓÇô8'],
  ['Café Mü', 'Caf├⌐ M├╝'],
  ['Zü → B', 'Z├╝ ΓåÆ B'],
  ['It’s “g”…', 'ItΓÇÖs ΓÇ£gΓÇ¥ΓÇª'],
];

test('garbled text from the email function reads right again', () => {
  assert.equal(fixMojibake('Starts 9:03am ┬╖ DFW'), 'Starts 9:03am · DFW');
  for (const [right, garbled] of PAIRS) assert.equal(fixMojibake(garbled), right);
});

test('ordinary text, accents and photos are left alone', () => {
  for (const s of ['café', 'Zürich', 'Starts 9:03am · DFW', 'Señor Frog’s', 'data:image/jpeg;base64,┬╖']) assert.equal(fixMojibake(s), s);
});

test('trips are repaired in place, untouched ones keep their identity', () => {
  const ok = { id: 'a', title: 'Big Sur', days: [{ note: 'fine' }] };
  const bad = { id: 'b', title: 'Milwaukee', days: [{ note: 'fine' }, { note: 'Starts 9:03am ┬╖ MKE' }] };
  const trips = [ok, bad];
  const out = repairTrips(trips);
  assert.equal(out[0], ok);
  assert.equal(out[1].days[0], bad.days[0]);
  assert.equal(out[1].days[1].note, 'Starts 9:03am · MKE');
  assert.equal(repairTrips(out), out);
});
