// Gatherings: a get-together at home or nearby (Thanksgiving, a birthday, a weekend with friends).
// A gathering is a trip with `gathering: true`. Instead of bookings it has a plan, kept as entries
// with kind 'Plan' (one row each, so the family and the guests can add to it at the same time):
//   planType 'time'   — the schedule: "4pm · Dinner"
//   planType 'bring'  — who's bringing what: "Pies · Lauren"
//   planType 'coming' — who's coming: "Grandma Murray"
//   planType 'idea'   — things to choose from: "Christmas lights drive", with optional details or a
//                       link, and votes (the names of everyone who said "I'm in"). The family puts the
//                       ones they pick on the schedule (scheduleIdea), which turns them into 'time' items.
// The same rules run in the inbound-email function for guests (keep the two in step).

import { groupTrips, tripStage } from './stages.js';

export const isGathering = (t) => !!(t && t.gathering);
export const isPlanItem = (d) => !!d && d.kind === 'Plan';

export const PLAN_TYPES = ['idea', 'time', 'bring', 'coming'];
export const PLAN_SECTIONS = [
  ['idea', 'Ideas to choose from', 'e.g. Christmas lights drive', 'Details or link'],
  ['time', 'Schedule', 'e.g. Dinner', 'Time'],
  ['bring', 'Who’s bringing what', 'e.g. Pies', 'Who'],
  ['coming', 'Who’s coming', 'e.g. Grandma Murray', ''],
];

// "4pm", "4:30 pm", "16:00", "noon" → minutes after midnight; null when it isn't a time
export function timeMinutes(s) {
  const t = String(s || '').trim().toLowerCase();
  if (!t) return null;
  if (/^noon\b/.test(t)) return 12 * 60;
  if (/^midnight\b/.test(t)) return 0;
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/.exec(t);
  if (!m) return null;
  let h = +m[1];
  const min = m[2] ? +m[2] : 0;
  if (h > 23 || min > 59) return null;
  if (m[3]) { const pm = m[3][0] === 'p'; if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12; }
  return h * 60 + min;
}

// the plan in its three lists: the schedule by time (untimed last, in the order added), the rest as added
export function planLists(trip) {
  const items = (trip && trip.days ? trip.days : []).filter(isPlanItem);
  const added = (d) => d.added || d.pos || 0;
  const byAdded = (a, b) => added(a) - added(b);
  const out = { idea: [], time: [], bring: [], coming: [] };
  for (const d of items) (out[d.planType] || out.time).push(d);
  out.time.sort((a, b) => {
    const x = timeMinutes(a.time), y = timeMinutes(b.time);
    if (x == null && y == null) return byAdded(a, b);
    if (x == null) return 1;
    if (y == null) return -1;
    return x - y || byAdded(a, b);
  });
  // ideas: the most wanted first
  out.idea.sort((a, b) => votesOf(b).length - votesOf(a).length || byAdded(a, b));
  out.bring.sort(byAdded);
  out.coming.sort(byAdded);
  return out;
}

const clean = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
export const votesOf = (d) => (Array.isArray(d && d.votes) ? d.votes : []);
const sameName = (a, b) => clean(a, 40).toLowerCase() === clean(b, 40).toLowerCase();
export const hasVoted = (d, name) => !!clean(name, 40) && votesOf(d).some((v) => sameName(v, name));

// "I'm in" on an idea, or take it back
export function toggleVote(d, name) {
  const n = clean(name, 40);
  if (!n) return d;
  const votes = hasVoted(d, n) ? votesOf(d).filter((v) => !sameName(v, n)) : [...votesOf(d), n];
  return { ...d, votes };
}

// the family picks an idea: it goes on the schedule (at a time, if given) and keeps its details and
// everyone who said "I'm in" (on the schedule, that's who's going)
export function scheduleIdea(d, time, day) {
  const rest = { ...d };
  const t = clean(time, 20);
  return { ...rest, planType: 'time', ...(t ? { time: t } : {}), ...(clean(day, 12) ? { date: clean(day, 12) } : {}) };
}

// a new plan entry. `first` is the gathering's first day label ("Nov 26"), `now` a timestamp.
// Schedule items can name their day (`day`, a label like "Nov 27"), an end time (`until`) and who it's
// for (`group`: "Kids"); things to bring have a course and a note (`detail`), and no `who` until
// someone says they'll bring it.
export function makePlanItem({ planType, text, time, until, group, day, course, who, detail, by }, { id, first, place, now }) {
  const type = PLAN_TYPES.includes(planType) ? planType : 'time';
  return {
    id, kind: 'Plan', planType: type, title: clean(text, 120), date: (type === 'time' && clean(day, 12)) || first || '', place: place || '',
    ...(type === 'time' && clean(time, 20) ? { time: clean(time, 20) } : {}),
    ...(type === 'time' && clean(time, 20) && clean(until, 20) ? { until: clean(until, 20) } : {}),
    ...(type === 'time' && clean(group, 40) ? { group: clean(group, 40) } : {}),
    ...(type === 'bring' ? { course: courseOf({ course }) } : {}),
    ...(type === 'bring' && clean(who, 40) ? { who: clean(who, 40) } : {}),
    ...(type !== 'coming' && clean(detail, 300) ? { detail: clean(detail, 300) } : {}),
    ...(type === 'idea' ? { votes: [] } : {}),
    ...(by ? { by: clean(by, 40) } : {}),
    photos: [], source: 'plan', pos: now, added: now,
  };
}

// apply an edit to a plan entry: its words, and for the schedule its day and times
export function editPlanItem(d, { text, time, until, group, day, course, who, detail, going }) {
  const next = { ...d };
  const set = (k, v, n) => { const c = clean(v, n); if (c) next[k] = c; else delete next[k]; };
  if (text !== undefined) next.title = clean(text, 120);
  if (time !== undefined) set('time', time, 20);
  if (until !== undefined) set('until', until, 20);
  if (!next.time) delete next.until;
  if (group !== undefined) set('group', group, 40);
  if (day !== undefined && clean(day, 12)) next.date = clean(day, 12);
  if (course !== undefined && d.planType === 'bring') next.course = courseOf({ course });
  if (who !== undefined) set('who', who, 40);
  if (detail !== undefined) set('detail', detail, 300);
  if (going !== undefined && d.planType === 'time') next.votes = namesFrom(going);
  return next;
}

// ---- the schedule, day by day ----
const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const dayLabel = (dt) => MON3[dt.getMonth()] + ' ' + dt.getDate();

// the days of a gathering from its span ([first, last] dates): [{ label: 'Nov 26', name: 'Thu Nov 26' }]
export function gatheringDays(span) {
  if (!span || !span[0]) return [];
  const out = [];
  const d = new Date(span[0].getFullYear(), span[0].getMonth(), span[0].getDate());
  const end = span[1] || span[0];
  for (let i = 0; i < 14 && d <= end; i++, d.setDate(d.getDate() + 1)) out.push({ label: dayLabel(d), name: WD3[d.getDay()] + ' ' + dayLabel(d) });
  return out;
}

// minutes → "4pm", "4:30pm", "noon"
export function fmtTime(min) {
  if (min == null) return '';
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  if (m === 12 * 60) return 'noon';
  const h = Math.floor(m / 60), mm = m % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return h12 + (mm ? ':' + String(mm).padStart(2, '0') : '') + (h < 12 ? 'am' : 'pm');
}
// "4:30pm" → "16:30", for a time picker; '' when it isn't a time
export function pickerTime(s) {
  const m = timeMinutes(s);
  return m == null ? '' : String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}

const byTime = (a, b) => {
  const x = timeMinutes(a.time), y = timeMinutes(b.time);
  if (x == null && y == null) return (a.added || a.pos || 0) - (b.added || b.pos || 0);
  if (x == null) return 1;
  if (y == null) return -1;
  return x - y || (a.added || a.pos || 0) - (b.added || b.pos || 0);
};

// the schedule grouped by day: every day of the gathering (even empty ones), then any other day an
// item is on. Within a day: by time, the ones without a time ("Anytime") last.
export function scheduleByDay(items, days = []) {
  const groups = days.map((d) => ({ ...d, items: [] }));
  const at = new Map(groups.map((g) => [g.label, g]));
  for (const d of items || []) {
    const label = d.date || (days[0] && days[0].label) || '';
    if (!at.has(label)) { const g = { label, name: label || 'Anytime', items: [] }; at.set(label, g); groups.push(g); }
    at.get(label).items.push(d);
  }
  for (const g of groups) g.items.sort(byTime);
  return groups;
}

// move a schedule item by some minutes (its end time goes with it); untimed items don't move
export function shiftItem(d, minutes) {
  const a = timeMinutes(d.time);
  if (a == null) return d;
  const clamp = (m) => Math.min(23 * 60 + 59, Math.max(0, m));
  const next = { ...d, time: fmtTime(clamp(a + minutes)) };
  const z = timeMinutes(d.until);
  if (z != null) next.until = fmtTime(clamp(z + minutes));
  return next;
}

// "push the rest back": this item and everything after it on the same day move by `minutes`.
// Returns only the items that changed.
export function shiftFrom(items, id, minutes) {
  const me = (items || []).find((d) => d.id === id);
  const from = me ? timeMinutes(me.time) : null;
  if (from == null) return [];
  return items
    .filter((d) => d.kind === 'Plan' && d.planType === 'time' && d.date === me.date && timeMinutes(d.time) != null && timeMinutes(d.time) >= from)
    .map((d) => shiftItem(d, minutes));
}

// ---- who's bringing what, course by course ----
export const COURSES = ['Main', 'Sides', 'Desserts', 'Drinks', 'Supplies', 'Other'];
export function courseOf(d) {
  const c = clean(d && d.course, 20).toLowerCase();
  return COURSES.find((k) => k.toLowerCase() === c) || 'Other';
}
// [{ course, items }] for the courses that have something, in menu order
export function bringByCourse(items) {
  return COURSES.map((course) => ({ course, items: (items || []).filter((d) => courseOf(d) === course) })).filter((g) => g.items.length);
}
export const stillNeeded = (d) => !!d && d.planType === 'bring' && !clean(d.who, 40);
// "I'll bring it", or take it back (only the person who said they would)
export function claimItem(d, name) {
  const n = clean(name, 40);
  if (!n) return d;
  if (!clean(d.who, 40)) return { ...d, who: n };
  if (sameName(d.who, n)) { const { who: _w, ...rest } = d; return rest; }
  return d;
}

// one line for a plan item, as the follower page and the copied plan show it
export function planLine(d) {
  if (d.planType === 'bring') return `${d.title} · ${d.who || 'still needed'}`;
  if (d.planType === 'time') {
    const when = d.time ? (d.until ? `${d.time}–${d.until}` : d.time) : '';
    return (when ? `${when} · ` : '') + d.title + (d.group ? ` (${d.group})` : '');
  }
  if (d.planType === 'idea') { const v = votesOf(d); return v.length ? `${d.title} (${v.length} in: ${v.join(', ')})` : d.title; }
  return d.title;
}

// the message that goes with a gathering's guest link: the ideas to choose from (if any), then the link
export function guestMessage(trip, link) {
  const ideas = planLists(trip).idea;
  if (!ideas.length) return `${trip.title}: see the plan, add to it (what you're bringing, who's coming), and add your photos and notes.\n\n${link}`;
  return [
    `${trip.title}: here are some ideas for while you're here. Open the link and tap "I'm in" on the ones you'd like, or add your own:`,
    '',
    ...ideas.map((d) => '• ' + d.title),
    '',
    link,
  ].join('\n');
}

// gatherings for their own list: coming up (soonest first), then past (most recent first)
export function gatheringsInOrder(trips, today = new Date()) {
  const g = groupTrips((trips || []).filter(isGathering), today);
  return [...g.upcoming, ...g.possible, ...g.past].map((t) => ({ t, upcoming: tripStage(t, today) !== 'past' }));
}

// ---- who's going, and things at the same time ----
// "Joe, Roger" → ['Joe', 'Roger'] (the family types who's in when they change an item)
export const namesFrom = (s) => [...new Set(String(s || '').split(/[,;&]|\band\b/).map((x) => clean(x, 40)).filter(Boolean))];

// a day's schedule in slots: things whose times overlap (the same start, or starting before another
// ends) share a slot, so they show side by side as a choice; anything without a time is its own slot
export function daySlots(items) {
  const slots = [];
  let cur = null, end = -1, start = -1;
  for (const d of items || []) {
    const a = timeMinutes(d.time);
    if (a == null) { slots.push([d]); cur = null; continue; }
    const z = timeMinutes(d.until);
    const e = z != null && z > a ? z : a;
    if (cur && (a < end || a === start)) { cur.push(d); end = Math.max(end, e); continue; }
    cur = [d]; slots.push(cur); end = e; start = a;
  }
  return slots;
}

// a short name for a link: "Map" for directions, the site's name for the rest ("AllTrails")
const SITES = {
  alltrails: 'AllTrails', raceroster: 'Race Roster', ticketmaster: 'Ticketmaster', opentable: 'OpenTable', eventbrite: 'Eventbrite',
  tripadvisor: 'Tripadvisor', youtube: 'YouTube', youtu: 'YouTube', facebook: 'Facebook', instagram: 'Instagram', resy: 'Resy',
  stubhub: 'StubHub', seatgeek: 'SeatGeek', yelp: 'Yelp', espn: 'ESPN', nfl: 'NFL', golfnow: 'GolfNow',
};
export function linkLabel(url) {
  let u;
  try { u = new URL(url); } catch (e) { return 'Link'; }
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const path = u.pathname.toLowerCase();
  if (/^maps\./.test(host) || host === 'maps.app.goo.gl' || host === 'waze.com'
    || ((host === 'goo.gl' || /(^|\.)(google|bing)\.[a-z.]+$/.test(host)) && path.startsWith('/maps'))) return 'Map';
  const parts = host.split('.');
  // "bbc.co.uk" → bbc; "events.raceroster.com" → raceroster
  const at = parts.length > 2 && parts[parts.length - 2].length <= 3 && parts[parts.length - 1].length === 2 ? parts.length - 3 : Math.max(0, parts.length - 2);
  return SITES[parts[at]] || parts.slice(at).join('.');
}

// ---- "Send an update" to the guests ----
// the text: what's new or changed on the plan since the last update (`since`, a timestamp; 0 = never),
// what's still needed, then the link. With nothing new to point at, a short day-by-day schedule.
export function updateMessage(trip, link, since = 0, days = []) {
  const items = ((trip && trip.days) || []).filter(isPlanItem);
  const dayName = (label) => { const d = days.find((x) => x.label === label); return d ? d.name.split(' ')[0] : label; };
  const line = (d) => (d.planType === 'time' ? `${dayName(d.date)} ${planLine(d)}`
    : d.planType === 'idea' ? `Idea: ${d.title}` : d.planType === 'bring' ? `Bring: ${planLine(d)}` : `Coming: ${d.title}`);
  const fresh = since ? items.filter((d) => (d.added || 0) > since) : [];
  const changed = since ? items.filter((d) => !fresh.includes(d) && (d.changed || 0) > since) : [];
  const needed = items.filter(stillNeeded);
  const out = [`${trip.title}: the plan's been updated.`];
  const list = (title, ds) => { if (ds.length) out.push('', title, ...ds.slice(0, 8).map((d) => '• ' + line(d)), ...(ds.length > 8 ? [`• and ${ds.length - 8} more`] : [])); };
  list('New:', fresh);
  list('Changed:', changed);
  if (!fresh.length && !changed.length) {
    const sched = scheduleByDay(items.filter((d) => d.planType === 'time'), days).filter((g) => g.items.length);
    if (sched.length) out.push('', ...sched.map((g) => `${g.name.split(' ')[0]}: ${g.items.map((d) => (d.time ? d.time + ' ' : '') + d.title).join(', ')}`));
  }
  if (needed.length) out.push('', `Still needed: ${needed.map((d) => d.title).join(', ')}. Tap "I'll bring it" if you can.`);
  out.push('', `See the plan and tap "I'm in" on what you're doing: ${link}`);
  return out.join('\n');
}
