import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseExif, parsePhotoTime, placePhotos, photoKey } from '../src/lib/photos.js';

// A minimal JPEG: SOI + APP1 Exif with IFD0 → Exif IFD (DateTimeOriginal) and GPS IFD.
function jpegWithExif({ taken, lat, lon }) {
  const t = [];
  const u16 = (n) => t.push(n & 0xff, (n >> 8) & 0xff); // little-endian TIFF
  const u32 = (n) => { u16(n & 0xffff); u16((n >>> 16) & 0xffff); };
  const ascii = (s) => [...s].map((c) => c.charCodeAt(0)).concat(0);
  const rat = (x) => { const d = Math.floor(x), m = Math.floor((x - d) * 60), s = Math.round(((x - d) * 60 - m) * 60 * 100); return [[d, 1], [m, 1], [s, 100]]; };
  // layout: header 8 | IFD0 (2 entries) @8 | Exif IFD (1) @38 | GPS IFD (4) @56 | data @110
  u16(0x4949); u16(42); u32(8);
  u16(2); u16(0x8769); u16(4); u32(1); u32(38); u16(0x8825); u16(4); u32(1); u32(56); u32(0);
  const date = ascii(taken);
  u16(1); u16(0x9003); u16(2); u32(date.length); u32(110); u32(0);
  const latR = rat(Math.abs(lat)), lonR = rat(Math.abs(lon));
  u16(4);
  u16(1); u16(2); u32(2); t.push((lat < 0 ? 'S' : 'N').charCodeAt(0), 0, 0, 0);
  u16(2); u16(5); u32(3); u32(110 + date.length);
  u16(3); u16(2); u32(2); t.push((lon < 0 ? 'W' : 'E').charCodeAt(0), 0, 0, 0);
  u16(4); u16(5); u32(3); u32(110 + date.length + 24);
  u32(0);
  while (t.length < 110) t.push(0);
  t.push(...date);
  for (const [n, d] of [...latR, ...lonR]) { u32(n); u32(d); }
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...t];
  const len = app1.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 0xff, ...app1, 0xff, 0xda]).buffer;
}

test('EXIF date taken and GPS are read from a JPEG', () => {
  const r = parseExif(jpegWithExif({ taken: '2026:10:31 14:22:05', lat: 43.0389, lon: -87.9065 }));
  assert.equal(r.taken, '2026:10:31 14:22:05');
  assert.ok(Math.abs(r.lat - 43.0389) < 0.001 && Math.abs(r.lon + 87.9065) < 0.001);
  assert.equal(parseExif(new Uint8Array([1, 2, 3, 4]).buffer), null);
  assert.equal(parsePhotoTime('2026:10:31 14:22:05').getHours(), 14);
  assert.equal(parsePhotoTime('2026-10-31 09:05').getMinutes(), 5);
});

const milwaukee = {
  id: 'mke', place: 'Milwaukee', dates: 'Oct 31 – Nov 2, 2026',
  days: [
    { id: 'b1', date: 'Oct 31', title: 'Hotel Metro', place: 'Milwaukee', lon: -87.909, lat: 43.039, photos: [] },
    { id: 'b2', date: 'Nov 1', title: 'Lake Geneva day trip', place: 'Lake Geneva', lon: -88.433, lat: 42.592, photos: [] },
  ],
};
let n = 0;
const id = () => 'new' + (++n);
const at = (s) => parsePhotoTime(s);

test('photos go into one photos memory per day and place, by GPS or the day\'s place', () => {
  n = 0;
  const items = [
    { key: photoKey(at('2026-10-31 10:00')), taken: at('2026-10-31 10:00'), lat: 43.04, lon: -87.91, src: 'a' },
    { key: photoKey(at('2026-10-31 18:00')), taken: at('2026-10-31 18:00'), lat: 43.03, lon: -87.92, src: 'b' },
    { key: photoKey(at('2026-11-01 13:00')), taken: at('2026-11-01 13:00'), lat: 42.59, lon: -88.43, src: 'c' },
    { key: photoKey(at('2026-11-01 20:00')), taken: at('2026-11-01 20:00'), src: 'd' }, // no GPS: that day's place
  ];
  const r = placePhotos(milwaukee, items, id);
  assert.equal(r.added, 4);
  assert.equal(r.created, 2);
  const photos = r.trip.days.filter((d) => d.source === 'photos');
  assert.deepEqual(photos.map((d) => [d.date, d.place, d.photos.map((p) => p.src).join('')]), [
    ['Oct 31', 'Milwaukee', 'ab'], ['Nov 1', 'Lake Geneva', 'cd'],
  ]);
  assert.equal(photos[0].title, 'Photos in Milwaukee');
});

test('the same shot imported again is skipped; the original trip is untouched', () => {
  n = 0;
  const shot = { key: photoKey(at('2026-10-31 10:00')), taken: at('2026-10-31 10:00'), src: 'a' };
  const once = placePhotos(milwaukee, [shot], id).trip;
  const twice = placePhotos(once, [{ ...shot, src: 'a2' }], id);
  assert.equal(twice.added, 0);
  assert.equal(milwaukee.days.length, 2);
});
