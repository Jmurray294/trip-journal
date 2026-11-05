import { datesRange } from './stages.js';

// Dates picked in a calendar ("2026-11-26") written the way the app reads and shows them
// (stages.js datesRange reads every form below back).
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const parse = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null; };

// "2026-11-26" → "Nov 26, 2026"; with an end: "Nov 26–28, 2026", "Nov 30 – Dec 2, 2026",
// "Dec 30, 2026 – Jan 2, 2027". '' without a start.
export function rangeText(startIso, endIso) {
  const a = parse(startIso);
  if (!a) return '';
  let z = parse(endIso);
  if (z && (z.y * 400 + z.m * 32 + z.d) < (a.y * 400 + a.m * 32 + a.d)) z = null; // an end before the start
  if (!z || (z.y === a.y && z.m === a.m && z.d === a.d)) return `${MON[a.m]} ${a.d}, ${a.y}`;
  if (z.y !== a.y) return `${MON[a.m]} ${a.d}, ${a.y} – ${MON[z.m]} ${z.d}, ${z.y}`;
  if (z.m !== a.m) return `${MON[a.m]} ${a.d} – ${MON[z.m]} ${z.d}, ${a.y}`;
  return `${MON[a.m]} ${a.d}–${z.d}, ${a.y}`;
}

const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// The dates a trip already has, ready for the calendar: exact days go in the pickers; anything vaguer
// ("Aug 2026", "2028", "Dates to be decided") stays as typed text.
export function datesForEdit(text) {
  const s = String(text || '').trim();
  const r = datesRange(s);
  const hasDay = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/i.test(s);
  if (r && hasDay) return { start: isoOf(r[0]), end: r[1] - r[0] > 0 ? isoOf(r[1]) : '', typed: false, text: s };
  return { start: '', end: '', typed: !!s, text: s };
}
