// Where a trip stands — possible, upcoming or past — worked out from its dates every time, so a trip
// moves to Past on its own once it's over and countdowns never go stale.

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
// whole month names or abbreviations only, so "decided" isn't December
const MONTH = '\\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\b';
const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// "Sep 3–14, 2026", "Dec 28 – Jan 3, 2027", "April 2027" → [first day, last day]; null without dates.
// Same reading as tripRange in the inbound-email function.
export function datesRange(text) {
  const s = String(text || '');
  const years = [...s.matchAll(/\b(20\d{2})\b/g)].map((m) => +m[1]);
  const year = years.length ? years[years.length - 1] : new Date().getFullYear();
  const mi = (w) => MONTHS.indexOf(w.slice(0, 3).toLowerCase());
  const points = [];
  const re = new RegExp(MONTH + '\\.?\\s+(\\d{1,2})(?!\\d)(?:\\s*[–—-]\\s*(\\d{1,2})\\b(?!\\s*[a-z]))?(?:,?\\s*(20\\d{2}))?', 'gi');
  let m;
  while ((m = re.exec(s))) {
    const mo = mi(m[1]); const y = m[4] ? +m[4] : year;
    points.push(new Date(y, mo, +m[2]));
    if (m[3]) points.push(new Date(y, mo, +m[3]));
  }
  if (points.length) {
    if (points.length >= 2 && points[0] > points[points.length - 1]) points[0] = new Date(points[0].getFullYear() - 1, points[0].getMonth(), points[0].getDate());
    return [new Date(Math.min(...points)), new Date(Math.max(...points))];
  }
  const mm = s.match(new RegExp(MONTH, 'i'));
  if (mm) { const mo = mi(mm[1]); return [new Date(year, mo, 1), new Date(year, mo + 1, 0)]; }
  return null;
}

const iso = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };

// The trip's span: its bookings when it has any (they're exact), otherwise its dates text.
export function tripSpan(t) {
  const pts = [];
  for (const d of t.days || []) {
    if (!d.booking || d.booking.status === 'cancelled') continue;
    const a = iso(d.booking.start); if (a) pts.push(a);
    const z = iso(d.booking.end); if (z) pts.push(z);
  }
  if (pts.length) return [new Date(Math.min(...pts)), new Date(Math.max(...pts))];
  return datesRange(t.dates);
}

// 'possible' | 'upcoming' | 'past'
export function tripStage(t, today = new Date()) {
  if (t.possible) return 'possible';
  const span = tripSpan(t);
  if (span) return day(span[1]) < day(today) ? 'past' : 'upcoming';
  return t.planning ? 'upcoming' : 'past';
}

export function countdown(t, today = new Date()) {
  const span = tripSpan(t);
  if (!span) return '';
  const days = Math.round((day(span[0]) - day(today)) / 86400000);
  if (days <= 0) return day(span[1]) >= day(today) ? 'happening now' : '';
  if (days === 1) return 'tomorrow';
  if (days < 14) return `in ${days} days`;
  if (days < 70) return `in ${Math.round(days / 7)} weeks`;
  return `in ${Math.round(days / 30)} months`;
}

// The chip on a trip's page.
export function stageLabel(t, today = new Date()) {
  const st = tripStage(t, today);
  if (st === 'possible') return 'Possible';
  if (st === 'past') return 'Past trip';
  const c = countdown(t, today);
  return c ? 'Upcoming · ' + c : 'Upcoming';
}

// Trips in their stages: upcoming soonest first, past most recent first, possible as they come.
export function groupTrips(trips, today = new Date()) {
  const start = (t) => { const s = tripSpan(t); return s ? s[0].getTime() : null; };
  const g = { upcoming: [], possible: [], past: [] };
  for (const t of trips) g[tripStage(t, today)].push(t);
  g.upcoming.sort((a, b) => (start(a) ?? Infinity) - (start(b) ?? Infinity));
  g.past.sort((a, b) => (start(b) ?? -Infinity) - (start(a) ?? -Infinity));
  return g;
}

export const STAGES = [['upcoming', 'Upcoming'], ['possible', 'Possible'], ['past', 'Past']];
