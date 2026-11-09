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

// the family picks an idea: it goes on the schedule (at a time, if given) and keeps its details
export function scheduleIdea(d, time) {
  const { votes: _v, ...rest } = d;
  const t = clean(time, 20);
  return { ...rest, planType: 'time', ...(t ? { time: t } : {}) };
}

// a new plan entry. `first` is the gathering's first day label ("Nov 26"), `now` a timestamp.
export function makePlanItem({ planType, text, time, who, detail, by }, { id, first, place, now }) {
  const type = PLAN_TYPES.includes(planType) ? planType : 'time';
  return {
    id, kind: 'Plan', planType: type, title: clean(text, 120), date: first || '', place: place || '',
    ...(type === 'time' && clean(time, 20) ? { time: clean(time, 20) } : {}),
    ...(type === 'bring' && clean(who, 40) ? { who: clean(who, 40) } : {}),
    ...(type === 'idea' && clean(detail, 300) ? { detail: clean(detail, 300) } : {}),
    ...(type === 'idea' ? { votes: [] } : {}),
    ...(by ? { by: clean(by, 40) } : {}),
    photos: [], source: 'plan', pos: now, added: now,
  };
}

// apply an edit to a plan entry; only its words change
export function editPlanItem(d, { text, time, who, detail }) {
  const next = { ...d };
  if (text !== undefined) next.title = clean(text, 120);
  if (time !== undefined) { const v = clean(time, 20); if (v) next.time = v; else delete next.time; }
  if (who !== undefined) { const v = clean(who, 40); if (v) next.who = v; else delete next.who; }
  if (detail !== undefined) { const v = clean(detail, 300); if (v) next.detail = v; else delete next.detail; }
  return next;
}

// one line for a plan item, as the follower page and the copied plan show it
export function planLine(d) {
  if (d.planType === 'bring') return d.who ? `${d.title} · ${d.who}` : d.title;
  if (d.planType === 'time') return d.time ? `${d.time} · ${d.title}` : d.title;
  if (d.planType === 'idea') { const v = votesOf(d); return v.length ? `${d.title} (${v.length} in: ${v.join(', ')})` : d.title; }
  return d.title;
}

// gatherings for their own list: coming up (soonest first), then past (most recent first)
export function gatheringsInOrder(trips, today = new Date()) {
  const g = groupTrips((trips || []).filter(isGathering), today);
  return [...g.upcoming, ...g.possible, ...g.past].map((t) => ({ t, upcoming: tripStage(t, today) !== 'past' }));
}
