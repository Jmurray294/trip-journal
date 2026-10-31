import { tripSpan, tripStage, countdown } from './stages.js';
import { money, isPending } from './derive.js';
import { tripDocAlerts, loyaltyAlerts } from './travelers.js';

// What's worth a look when you sign in, worked out fresh from the trips every time, so an item goes
// away on its own once it's dealt with. Each: { key, level: 'bad' | 'warn' | 'info', text, sub, open }
// where open is { sort: true } or { tripId, section }. 'bad' and 'warn' count on the bell.
// kind (sort | payments | docs | trips) picks the chip it counts on in the desktop band.

const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const iso = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
const short = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const DAY = 86400000;

export function attention(trips, { toSort = 0, travelers = [], today = new Date() } = {}) {
  const t0 = day(today);
  const out = [];

  if (toSort > 0) {
    out.push({ key: 'sort', kind: 'sort', level: 'warn', text: `${toSort} ${toSort === 1 ? 'email is' : 'emails are'} waiting under To sort`, sub: 'Pick which trip each belongs to', open: { sort: true } });
  }

  for (const t of trips) {
    if (tripStage(t, today) !== 'upcoming') continue;
    const span = tripSpan(t);
    const until = span ? Math.round((day(span[0]) - t0) / DAY) : null;

    // payments: anything overdue, or due in the next two weeks (pending card charges settle on their own)
    for (const c of t.costs || []) {
      if (c.status !== 'due' || isPending(c)) continue;
      const due = iso(c.date);
      const amt = money(c.amount, c.currency);
      if (due && due < t0) out.push({ key: `due:${t.id}:${c.id}`, kind: 'payments', level: 'bad', text: `${c.title}: ${amt} was due ${short(due)}`, sub: t.title, open: { tripId: t.id, section: 'budget' } });
      else if (due && due - t0 <= 14 * DAY) out.push({ key: `due:${t.id}:${c.id}`, kind: 'payments', level: 'warn', text: `${c.title}: ${amt} due ${short(due)}`, sub: t.title, open: { tripId: t.id, section: 'budget' } });
    }

    // documents and loyalty numbers, for trips in the next six months
    if (until !== null && until <= 180 && travelers.length) {
      [...tripDocAlerts(t, travelers, false, today), ...loyaltyAlerts(t, travelers, today)]
        .filter((a) => a.level !== 'info')
        .forEach((a, i) => out.push({ key: `doc:${t.id}:${i}`, kind: 'docs', level: a.level, text: a.text, sub: t.title, open: { tripId: t.id } }));
    }

    // the trip itself, when it's on or about to be
    if (until !== null && until <= 7) {
      const c = countdown(t, today);
      out.push({ key: `trip:${t.id}`, kind: 'trips', level: 'info', text: `${t.title} is ${c === 'happening now' ? 'happening now' : 'coming up ' + c}`, sub: 'Itinerary, bookings and the trip link', open: { tripId: t.id } });
    }
  }

  const rank = { bad: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}

export const urgentCount = (items) => items.filter((a) => a.level !== 'info').length;
