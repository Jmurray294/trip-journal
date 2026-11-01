// Supabase Edge Function: turn forwarded travel emails into itinerary entries and trip costs.
// The Gmail forwarder (supabase/gmail-forwarder.gs) posts each email here; the "+code" in the
// address it was sent to says which family it is for. (Any inbound service posting the same JSON works.)
//
// Each email is read into bookings (flights, stays, cruises, cars, ...), costs (payments, deposits,
// balances due, refunds) and a guess at which trip it belongs to. Confident guesses are filed
// straight into the trip; the rest wait in inbox_items for someone to pick the trip in the app.
//
// GENERATED index.ts \u2014 edit template.ts, then run `node scripts/build-inbound.mjs`
// (that inlines src/lib/parser.js so the app and the server parse confirmations the same way).
//
// Secrets: INBOUND_SECRET (also in the forwarder, sent as ?key=...), ANTHROPIC_API_KEY, and
// ANTHROPIC_WORKSPACE_ID when that key is organization-wide rather than scoped to one workspace.
// Deploy with "Verify JWT" OFF \u2014 the forwarder cannot sign in; the secret key protects it instead.
// The app also posts uploads here (PDFs, photos, pasted text) with the member's sign-in token, which
// this function checks itself; those go to the member's family, and to TripId when one is given.

import Anthropic from "npm:@anthropic-ai/sdk@0.131.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

// ---- inlined from src/lib/parser.js ----
// deno-lint-ignore-file
// Confirmation-email parser: pasted flight/hotel confirmations -> itinerary entries.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDate(d) { return MONTHS[d.getMonth()] + ' ' + d.getDate(); }
function todayLabel() { return fmtDate(new Date()); }

function monthIdx(s) {
  const i = MONTHS.map((m) => m.toLowerCase()).indexOf(s.slice(0, 3).toLowerCase());
  return i < 0 ? null : i;
}

function findDates(text) {
  const out = [];
  const mn = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*';
  let re = new RegExp(mn + '\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?', 'gi');
  let m;
  while ((m = re.exec(text))) {
    const mo = monthIdx(m[1]); const day = +m[2];
    if (mo == null || day < 1 || day > 31) continue;
    const yr = m[3] ? +m[3] : new Date().getFullYear();
    out.push({ date: new Date(yr, mo, day), idx: m.index });
  }
  re = new RegExp('(\\d{1,2})\\s+' + mn + '\\.?(?:,?\\s*(\\d{4}))?', 'gi');
  while ((m = re.exec(text))) {
    const mo = monthIdx(m[2]); const day = +m[1];
    if (mo == null || day < 1 || day > 31) continue;
    const yr = m[3] ? +m[3] : new Date().getFullYear();
    out.push({ date: new Date(yr, mo, day), idx: m.index });
  }
  re = /(\d{4})-(\d{2})-(\d{2})/g;
  while ((m = re.exec(text))) out.push({ date: new Date(+m[1], +m[2] - 1, +m[3]), idx: m.index });
  re = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/g;
  while ((m = re.exec(text))) {
    let yr = +m[3]; if (yr < 100) yr += 2000;
    out.push({ date: new Date(yr, +m[1] - 1, +m[2]), idx: m.index });
  }
  return out.filter((d) => !isNaN(d.date)).sort((a, b) => a.idx - b.idx);
}

function findTimes(text) {
  const out = []; const re = /\b(\d{1,2}):(\d{2})\s*(am|pm)?/gi; let m;
  while ((m = re.exec(text))) {
    let h = +m[1]; const mi = m[2]; const ap = (m[3] || '').toLowerCase();
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    if (h > 23 || +mi > 59) continue;
    const h12 = h % 12 === 0 ? 12 : h % 12;
    out.push({ label: h12 + ':' + mi + (h < 12 ? 'am' : 'pm'), idx: m.index });
  }
  return out;
}

const AIRLINES = { AA: 'American', DL: 'Delta', UA: 'United', WN: 'Southwest', AS: 'Alaska', B6: 'JetBlue', NK: 'Spirit', F9: 'Frontier', AC: 'Air Canada', BA: 'British Airways', LH: 'Lufthansa', AF: 'Air France', KL: 'KLM', IB: 'Iberia', EK: 'Emirates', QR: 'Qatar Airways', VS: 'Virgin Atlantic', WS: 'WestJet', HA: 'Hawaiian', SY: 'Sun Country' };
const HOTEL_BRAND = /(marriott|hilton|hyatt|sheraton|westin|holiday inn|hampton|courtyard|doubletree|radisson|best western|ritz|four seasons|kimpton|fairmont|embassy suites|residence inn|springhill|comfort inn|la quinta|motel 6|airbnb|vrbo|booking\.com|premier inn|travelodge|novotel|ibis|accor|wyndham|days inn|super 8|extended stay|aloft|moxy|autograph|hotel [a-z][a-z\-']+|[a-z][a-z\-']+ hotel|[a-z][a-z\-']+ resort|[a-z][a-z\-']+ lodge|[a-z][a-z\-']+ inn)/i;

function parseConfirmation(raw) {
  const text = (raw || '').replace(/\r/g, ' ');
  if (!text.trim()) return [];
  const low = text.toLowerCase();
  const dates = findDates(text);
  const times = findTimes(text);
  const entries = [];

  // Flights: airline code + flight number
  const flightRe = /\b([A-Z]{2})\s?-?\s?(\d{2,4})\b/g;
  let fm; const seenFlights = {};
  while ((fm = flightRe.exec(text))) {
    const code = fm[1]; const num = fm[2];
    if (!AIRLINES[code]) continue;
    const key = code + num;
    if (seenFlights[key]) continue;
    seenFlights[key] = 1;
    let route = '';
    const near = text.slice(Math.max(0, fm.index - 260), fm.index + 320);
    const pair = near.match(/\b([A-Z]{3})\s*(?:\u2013|-|\u2014|to|\u2192)\s*([A-Z]{3})\b/);
    if (pair) route = pair[1] + ' \u2192 ' + pair[2];
    else {
      const codes = []; let am;
      const ar = /\(([A-Z]{3})\)/g;
      while ((am = ar.exec(near))) codes.push(am[1]);
      if (codes.length >= 2) route = codes[0] + ' \u2192 ' + codes[1];
    }
    const d = dates.find((x) => Math.abs(x.idx - fm.index) < 400) || dates[0];
    const t = times.find((x) => Math.abs(x.idx - fm.index) < 400);
    entries.push({
      kind: 'Flight', sortDate: d ? d.date : null,
      date: d ? fmtDate(d.date) : todayLabel(),
      title: AIRLINES[code] + ' ' + code + num + (route ? ' \u00b7 ' + route : ''),
      place: route || 'Flight',
      note: [t ? 'Departs ' + t.label : '', 'From confirmation email'].filter(Boolean).join(' \u00b7 ')
    });
  }

  // Hotels / stays
  const hb = text.match(HOTEL_BRAND);
  const isLodging = /check[\s-]?in|check[\s-]?out|reservation|nights?\b|booking/i.test(low) && !!hb;
  if (isLodging) {
    // prefer the whole line the brand appears on (e.g. "Courtyard by Marriott Monterey")
    let name = hb[0].replace(/\s+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase());
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const generic = /reservation|confirmed|confirmation|booking|receipt|itinerary|thank you|your trip/i;
    const brandLine = lines.find((l) => l.length <= 70 && l.toLowerCase().includes(hb[0].toLowerCase().split(' ')[0]) && !/^(check|conf|book|reserv)/i.test(l));
    if (brandLine && brandLine.length > name.length && !/\d{2}/.test(brandLine)) name = brandLine.replace(/[,\u2022|].*$/, '').trim();
    if (!brandLine || generic.test(name)) {
      const alt = lines.find((l) => l.length >= 3 && l.length <= 60 && !/\d/.test(l) && !generic.test(l) && !/^check/i.test(l));
      if (alt) name = alt;
    }
    const ciIdx = low.search(/check[\s-]?in/); const coIdx = low.search(/check[\s-]?out/);
    // dates almost always follow their label, so look forward first
    const nearest = (i) => {
      if (i < 0 || !dates.length) return null;
      const ahead = dates.filter((d) => d.idx >= i).sort((a, b) => a.idx - b.idx);
      if (ahead.length && ahead[0].idx - i < 90) return ahead[0];
      let best = dates[0], bd = Infinity;
      dates.forEach((d) => { const dd = Math.abs(d.idx - i); if (dd < bd) { bd = dd; best = d; } });
      return best;
    };
    const ci = nearest(ciIdx);
    let co = nearest(coIdx);
    if (ci && co && co.date.getTime() <= ci.date.getTime()) {
      const later = dates.filter((d) => d.date.getTime() > ci.date.getTime()).sort((a, b) => a.date - b.date);
      co = later.length ? later[0] : null;
    }
    // same-line only: "\s" would let a hotel name's last word pair with the next line's "City, ST"
    const cityM = text.match(/\b([A-Z][a-z]+(?:[ \t][A-Z][a-z]+)?),[ \t]*([A-Z]{2}|[A-Z][a-z]+)\b/);
    const city = cityM ? cityM[0] : '';
    const nightsM = low.match(/(\d+)\s*nights?/);
    const parts = [];
    if (ci) parts.push('Check-in ' + fmtDate(ci.date));
    if (co) parts.push('check-out ' + fmtDate(co.date));
    if (nightsM) parts.push(nightsM[1] + ' nights');
    entries.push({
      kind: 'Stay', sortDate: ci ? ci.date : (dates[0] ? dates[0].date : null),
      date: ci ? fmtDate(ci.date) : todayLabel(),
      title: name, place: city || name,
      note: parts.join(' \u00b7 ') || 'From confirmation email'
    });
  }

  // Fallback: dated reservation with no recognised flight/hotel
  if (!entries.length && dates.length) {
    const d = dates[0];
    const subj = text.split('\n').map((l) => l.trim()).find((l) => l.length > 8 && l.length < 80) || 'Reservation';
    entries.push({ kind: 'Booking', sortDate: d.date, date: fmtDate(d.date), title: subj, place: '', note: 'From confirmation email' });
  }

  entries.sort((a, b) => (a.sortDate ? a.sortDate.getTime() : 0) - (b.sortDate ? b.sortDate.getTime() : 0));
  return entries;
}


// ---- inlined from src/lib/loyalty.js ----
// Loyalty programs: which program a provider or program name belongs to, so "Westin", "Marriott
// Bonvoy" and "Bonvoy" all mean the same account. Shared with the inbound-email function (inlined by
// scripts/build-inbound.mjs), so keep it plain JavaScript with no imports.

const PROGRAMS = [
  ['aadvantage', 'AAdvantage', /aadvantage|\bamerican( airlines)?\b|\bamerican eagle\b/i],
  ['skymiles', 'Delta SkyMiles', /skymiles|\bdelta\b/i],
  ['mileageplus', 'United MileagePlus', /mileageplus|\bunited( airlines)?\b/i],
  ['rapidrewards', 'Southwest Rapid Rewards', /rapid rewards|southwest/i],
  ['alaska', 'Alaska Mileage Plan', /mileage plan|alaska air/i],
  ['trueblue', 'JetBlue TrueBlue', /trueblue|jetblue/i],
  ['bonvoy', 'Marriott Bonvoy', /bonvoy|marriott|ritz[- ]carlton|westin|sheraton|st\.? regis|courtyard|residence inn|autograph collection|le m[\u00e9e]ridien|fairfield|springhill|renaissance|\baloft\b|luxury collection|\bedition\b|w hotels?/i],
  ['hilton', 'Hilton Honors', /hilton|conrad|waldorf|doubletree|embassy suites|hampton inn|homewood|curio|canopy by|tapestry/i],
  ['hyatt', 'World of Hyatt', /hyatt|andaz|thompson hotels?/i],
  ['ihg', 'IHG One Rewards', /\bihg\b|intercontinental|holiday inn|kimpton|crowne plaza|six senses|hotel indigo/i],
  ['hertz', 'Hertz Gold Plus', /hertz/i],
  ['national', 'National Emerald Club', /emerald club|national car/i],
  ['avis', 'Avis Preferred', /\bavis\b/i],
  ['enterprise', 'Enterprise Plus', /enterprise/i],
  ['regent', 'Regent Seven Seas', /regent seven seas|\brssc\b/i],
  ['amawaterways', 'AmaWaterways', /ama ?waterways/i],
  ['royalcaribbean', 'Royal Caribbean Crown & Anchor', /royal caribbean|crown & anchor/i],
  ['viking', 'Viking', /\bviking\b/i],
  ['amtrak', 'Amtrak Guest Rewards', /amtrak/i],
];

// a stable id for the program a name or provider belongs to ('' when unknown)
function programKey(text) {
  const s = String(text || '');
  if (!s.trim()) return '';
  for (const [key, , re] of PROGRAMS) if (re.test(s)) return key;
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// a known program, for a booking's provider and title (unknown providers have no program)
function bookingProgram(provider, title) {
  const s = `${provider || ''} ${title || ''}`;
  for (const [key, name, re] of PROGRAMS) if (re.test(s)) return { key, name };
  return null;
}

// the last 4 characters of a member number, for matching masked numbers like ****1234
const last4 = (n) => String(n || '').replace(/[^A-Za-z0-9]/g, '').slice(-4).toUpperCase();


// ---- inlined from src/lib/photos.js ----
// Photos filed into a trip by when and where they were taken: one "photos" memory per day and place
// in the trip's timeline, next to the bookings and memories of that day. Used by the app's Add photos
// and by the inbound-email function for the iPhone Shortcut (inlined by scripts/build-inbound.mjs),
// so keep it plain JavaScript with no imports.

const PHOTO_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayLabel_ = (d) => PHOTO_MONTHS[d.getMonth()] + ' ' + d.getDate();
const NEAR_KM = 25;
const TRAVEL_KINDS = ['Flight', 'Train', 'Transfer', 'Car'];

function kmBetween(a, b) {
  const R = Math.PI / 180;
  const dLat = (b[1] - a[1]) * R, dLon = (b[0] - a[0]) * R;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * R) * Math.cos(b[1] * R) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(s)));
}

// "2026:10:31 14:22:05" (EXIF) or "2026-10-31 14:22:05" / "2026-10-31T14:22" \u2192 a local Date
function parsePhotoTime(s) {
  const m = /^(\d{4})[:-](\d{2})[:-](\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(String(s || '').trim());
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 12), +(m[5] || 0), +(m[6] || 0));
  return isNaN(d) ? null : d;
}

// When and where a JPEG was taken, from its EXIF block: { taken: 'YYYY-MM-DD HH:MM:SS' | null, lat, lon }
function parseExif(buf) {
  try {
    const v = new DataView(buf);
    if (v.getUint16(0) !== 0xFFD8) return null;
    let off = 2;
    while (off + 10 < v.byteLength) {
      const marker = v.getUint16(off);
      if ((marker & 0xFF00) !== 0xFF00) return null;
      if (marker === 0xFFE1 && v.getUint32(off + 4) === 0x45786966) return readTiff(v, off + 10);
      if (marker === 0xFFDA) return null; // image data starts: no EXIF
      off += 2 + v.getUint16(off + 2);
    }
  } catch (e) { /* not a JPEG we can read */ }
  return null;
}

function readTiff(v, t) {
  const le = v.getUint16(t) === 0x4949;
  const u16 = (o) => v.getUint16(t + o, le);
  const u32 = (o) => v.getUint32(t + o, le);
  const ifd = (o) => {
    const tags = {};
    const n = u16(o);
    for (let i = 0; i < n; i++) { const e = o + 2 + i * 12; tags[u16(e)] = { count: u32(e + 4), at: e + 8 }; }
    return tags;
  };
  const ascii = (tag) => {
    const o = tag.count > 4 ? u32(tag.at) : tag.at;
    let s = '';
    for (let i = 0; i < tag.count; i++) { const c = v.getUint8(t + o + i); if (!c) break; s += String.fromCharCode(c); }
    return s;
  };
  const dms = (tag) => {
    const o = u32(tag.at);
    const r = (i) => u32(o + i * 8) / (u32(o + i * 8 + 4) || 1);
    return r(0) + r(1) / 60 + r(2) / 3600;
  };
  const ifd0 = ifd(u32(4));
  let taken = null, lat = null, lon = null;
  if (ifd0[0x8769]) {
    const ex = ifd(u32(ifd0[0x8769].at));
    const tag = ex[0x9003] || ex[0x9004];
    if (tag) taken = ascii(tag);
  }
  if (!taken && ifd0[0x0132]) taken = ascii(ifd0[0x0132]);
  if (ifd0[0x8825]) {
    const g = ifd(u32(ifd0[0x8825].at));
    if (g[2] && g[4]) {
      lat = dms(g[2]); lon = dms(g[4]);
      if (g[1] && ascii(g[1]) === 'S') lat = -lat;
      if (g[3] && ascii(g[3]) === 'W') lon = -lon;
      if (!isFinite(lat) || !isFinite(lon) || (lat === 0 && lon === 0)) lat = lon = null;
    }
  }
  return { taken: taken && /^\d{4}:\d{2}:\d{2}/.test(taken) ? taken : null, lat, lon };
}

// A photo's identity across imports (the app and the Shortcut send different copies of the same
// shot): the second it was taken, else whatever the caller gives.
const photoKey = (taken, fallback) => (taken ? 't' + taken.getTime() / 1000 : 'f' + fallback);

// File photos into one trip. items: [{ key, taken: Date | null, lat, lon, ...photo fields (src or path) }]
// Each photo joins the "photos" memory for its day and place (made if needed): the place is the
// nearest stop in the trip within 25 km when the photo has GPS, else that day's place, else the
// trip's. Photos already in the trip (same key) are skipped.
// Returns { trip, added, created } \u2014 `trip` is a new object; `newId()` names new memories.
function placePhotos(trip, items, newId, fallbackDay = new Date()) {
  const days = (trip.days || []).map((d) => ({ ...d, photos: [...(d.photos || [])] }));
  const have = new Set();
  for (const d of days) for (const p of d.photos) if (p.key) have.add(p.key);
  let added = 0, created = 0;
  const sorted = [...items].sort((a, b) => (a.taken ? a.taken.getTime() : 0) - (b.taken ? b.taken.getTime() : 0));
  for (const it of sorted) {
    if (it.key && have.has(it.key)) continue;
    const when = it.taken || fallbackDay;
    const label = dayLabel_(when);
    const gps = typeof it.lat === 'number' && typeof it.lon === 'number' ? [it.lon, it.lat] : null;
    // where: the nearest stop with coordinates, else the place of that day's memories, else the trip's
    let place = '', at = null;
    if (gps) {
      let best = null;
      for (const d of days) {
        if (typeof d.lon !== 'number' || typeof d.lat !== 'number' || !d.place) continue;
        const km = kmBetween(gps, [d.lon, d.lat]);
        if (km <= NEAR_KM && (!best || km < best.km)) best = { km, d };
      }
      if (best) { place = best.d.place; at = [best.d.lon, best.d.lat]; }
    }
    if (!place) {
      // not a flight, train, transfer or car that day: those are filed under where they leave from
      const same = days.filter((d) => d.date === label && d.place && d.source !== 'photos' && !TRAVEL_KINDS.includes(d.kind));
      place = same.length ? same[same.length - 1].place : '';
    }
    if (!place && !gps) place = trip.place || '';
    // the photos memory for this day and place, or for this day near these coordinates
    let target = days.find((d) => d.source === 'photos' && d.date === label && (place
      ? d.place === place
      : gps && typeof d.lon === 'number' && kmBetween(gps, [d.lon, d.lat]) <= NEAR_KM));
    if (!target) {
      const c = at || gps;
      target = {
        id: newId(), date: label, title: place ? `Photos in ${place}` : 'Photos', place: place || trip.place || '',
        note: '', photos: [], pos: when.getTime(), added: Date.now(), source: 'photos',
        ...(c ? { lon: c[0], lat: c[1] } : {}),
      };
      days.push(target);
      created++;
    }
    const { key, taken, lat, lon, ...photo } = it; // eslint-disable-line no-unused-vars
    target.photos.push({ label: '', ...photo, key, ...(it.taken ? { taken: it.taken.getTime() } : {}) });
    if (it.key) have.add(it.key);
    added++;
  }
  return { trip: { ...trip, days }, added, created };
}


const TOLERANCE_DAYS = 3;
const GRADIENTS = [
  "linear-gradient(150deg,#5E7E78,#324F4A)", "linear-gradient(150deg,#C56B43,#8C3A22)",
  "linear-gradient(150deg,#C9A85C,#866A34)", "linear-gradient(150deg,#8DA1A8,#46585F)",
  "linear-gradient(150deg,#7E8A66,#47533A)",
];

type Booking = {
  kind: string; status: string; date: Date; endDate: Date | null; time: string; title: string;
  provider: string; confirmation: string; place: string; address: string; travelers: string; loyalty: string; note: string;
};
type Cost = {
  category: string; title: string; vendor: string; amount: number; currency: string;
  status: string; date: Date | null; confirmation: string; note: string; card: string; travel: boolean;
};
type Placement = { decision: "existing" | "new" | "unsure"; tripId: string; title: string; place: string; reason: string };
type Idea = { title: string; place: string; dates: string; start: Date | null; end: Date | null; people: string; summary: string; tripId: string };
type Saved = { title: string; place: string; spot: string; note: string; url: string };
type Account = { program: string; number: string; traveler: string; status: string; balance: number | null; asOf: string };
type Reading = { cardAlert?: boolean; summary: string; destination: string; bookings: Booking[]; costs: Cost[]; placement: Placement | null; ideas: Idea[]; someday: Saved[]; loyalty: Account[] };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const label = (d: Date) => MONTHS[d.getMonth()] + " " + d.getDate();
const isoDay = (d: Date | null) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "");
const confKey = (s: string) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// "Aug 8\u201315, 2026" \u00b7 "Dec 28, 2026 \u2013 Jan 3, 2027" \u00b7 "Aug 2026" \u2192 [start, end]
function tripRange(text: string): [Date, Date] | null {
  const s = String(text || "");
  const years = [...s.matchAll(/\b(20\d{2})\b/g)].map((m) => +m[1]);
  const year = years.length ? years[years.length - 1] : new Date().getFullYear();
  const mi = (w: string) => MONTHS.map((m) => m.toLowerCase()).indexOf(w.slice(0, 3).toLowerCase());
  const points: Date[] = [];
  // whole month names or abbreviations only, so "decided" isn't December (same as src/lib/stages.js)
  const month = "\\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\b";
  const re = new RegExp(month + "\\.?\\s+(\\d{1,2})(?!\\d)(?:\\s*[\u2013\u2014-]\\s*(\\d{1,2})\\b(?!\\s*[a-z]))?(?:,?\\s*(20\\d{2}))?", "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const mo = mi(m[1]); const y = m[4] ? +m[4] : year;
    points.push(new Date(y, mo, +m[2]));
    if (m[3]) points.push(new Date(y, mo, +m[3]));
  }
  if (points.length) {
    // a range that wraps the year ("Dec 28 \u2013 Jan 3, 2027") puts the start in the previous year
    if (points.length >= 2 && points[0] > points[points.length - 1]) points[0] = new Date(points[0].getFullYear() - 1, points[0].getMonth(), points[0].getDate());
    return [new Date(Math.min(...points.map(Number))), new Date(Math.max(...points.map(Number)))];
  }
  const mm = s.match(new RegExp(month, "i"));
  if (mm) { const mo = mi(mm[1]); return [new Date(year, mo, 1), new Date(year, mo + 1, 0)]; }
  return null;
}

function rangeLabel(a: Date, b: Date) {
  if (a.getTime() === b.getTime()) return `${label(a)}, ${a.getFullYear()}`;
  if (a.getFullYear() !== b.getFullYear()) return `${label(a)}, ${a.getFullYear()} \u2013 ${label(b)}, ${b.getFullYear()}`;
  if (a.getMonth() === b.getMonth()) return `${label(a)}\u2013${b.getDate()}, ${b.getFullYear()}`;
  return `${label(a)} \u2013 ${label(b)}, ${b.getFullYear()}`;
}

function countdown(start: Date) {
  const days = Math.round((day(start).getTime() - day(new Date()).getTime()) / 86400000);
  if (days <= 0) return "now";
  if (days < 14) return `in ${days} day${days === 1 ? "" : "s"}`;
  if (days < 70) return `in ${Math.round(days / 7)} weeks`;
  return `in ${Math.round(days / 30)} months`;
}

// "7:45am", "19:30", "3 PM" \u2192 minutes after midnight, so same-day bookings sort by time
function minutesOf(time: string) {
  const m = /(\d{1,2})(?::(\d{2}))?\s*([ap])?\.?m?\.?/i.exec(String(time || ""));
  if (!m) return 0;
  let h = +m[1] % 24; const min = m[2] ? +m[2] : 0;
  if (m[3]) { h = h % 12; if (m[3].toLowerCase() === "p") h += 12; }
  return h * 60 + min;
}

async function sha(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 20);
}

function htmlToText(html: string) {
  return html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n");
}

// ---- reading the email: Claude first, the app's own scanner as the backup ----
const KINDS = ["Flight", "Stay", "Cruise", "Car", "Train", "Transfer", "Activity", "Dining", "Ticket", "Other"];
const COST_KINDS = [...KINDS.filter((k) => k !== "Other"), "Insurance", "Fees", "Other"];

const READING_SCHEMA = {
  type: "object",
  properties: {
    card_alert: { type: "boolean", description: "True when this email is a card issuer's transaction alert (a purchase, charge, refund or pending authorization on a credit card)" },
    summary: { type: "string", description: "One short line saying what this email is, e.g. 'Final payment receipt for the Regent Japan cruise'" },
    destination: { type: "string", description: "Main destination city/area, or empty" },
    bookings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: KINDS },
          status: { type: "string", enum: ["confirmed", "changed", "cancelled"] },
          date: { type: "string", description: "Start date (departure, check-in, pick-up, embarkation), YYYY-MM-DD" },
          end_date: { type: "string", description: "End date (arrival, check-out, drop-off, disembarkation) YYYY-MM-DD, or empty" },
          time: { type: "string", description: "Start time as printed, e.g. '7:45am', or empty" },
          title: { type: "string" },
          provider: { type: "string", description: "Airline, hotel, cruise line, rental company, venue..." },
          confirmation: { type: "string", description: "Confirmation / booking / record locator number, or empty" },
          place: { type: "string", description: "City or place name, short" },
          address: { type: "string", description: "Street address or terminal/port, or empty" },
          travelers: { type: "string", description: "Names on the booking, comma separated, or empty" },
          loyalty: { type: "string", description: "Frequent flyer / hotel / rental loyalty numbers shown on this reservation, as printed (may be masked), comma separated, or empty" },
          note: { type: "string" },
        },
        required: ["kind", "status", "date", "end_date", "time", "title", "provider", "confirmation", "place", "address", "travelers", "loyalty", "note"],
        additionalProperties: false,
      },
    },
    costs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: { type: "string", enum: COST_KINDS },
          title: { type: "string", description: "e.g. 'Cruise deposit', 'Final payment', 'Hotel balance due'" },
          vendor: { type: "string" },
          amount: { type: "number", description: "Positive number, no currency symbol" },
          currency: { type: "string", description: "ISO code, e.g. USD" },
          status: { type: "string", enum: ["paid", "due", "refund"] },
          date: { type: "string", description: "Date paid, date due by, or refund date, YYYY-MM-DD, or empty" },
          confirmation: { type: "string", description: "Booking/confirmation number this money is for, or empty" },
          note: { type: "string" },
          card: { type: "string", description: "The card charged, as the email names it, e.g. 'Amex Gold \u20261007', 'Luxury Mastercard \u20264421', or empty" },
          travel: { type: "boolean", description: "True when the merchant is travel: an airline, hotel or rental, cruise line, car rental, rail, tour, travel agency or travel insurance" },
        },
        required: ["category", "title", "vendor", "amount", "currency", "status", "date", "confirmation", "note", "card", "travel"],
        additionalProperties: false,
      },
    },
    trip: {
      type: "object",
      properties: {
        decision: { type: "string", enum: ["existing", "new", "unsure"] },
        trip_id: { type: "string", description: "id of the existing trip when decision is 'existing', else empty" },
        new_title: { type: "string", description: "Short trip name when decision is 'new' or 'unsure', e.g. 'Lisbon 2027'" },
        new_place: { type: "string", description: "Destination for a new trip, or empty" },
        reason: { type: "string", description: "A few words on why" },
      },
      required: ["decision", "trip_id", "new_title", "new_place", "reason"],
      additionalProperties: false,
    },
    ideas: {
      type: "array",
      description: "Trips being proposed or discussed but not booked yet",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short trip name, e.g. 'Tuscany with the Smiths'" },
          place: { type: "string", description: "Destination, or empty" },
          dates: { type: "string", description: "Dates as known, e.g. 'June 2027', 'Mar 3\u201310, 2027', or empty" },
          start_date: { type: "string", description: "YYYY-MM-DD if a start date is known, else empty" },
          end_date: { type: "string", description: "YYYY-MM-DD if an end date is known, else empty" },
          people: { type: "string", description: "Who else is proposing or going (names or families), comma separated \u2014 not our own family" },
          summary: { type: "string", description: "One or two lines: what is proposed, rough cost, what they need from us and by when" },
          trip_id: { type: "string", description: "id of the family's trip this idea is about, if one already exists, else empty" },
        },
        required: ["title", "place", "dates", "start_date", "end_date", "people", "summary", "trip_id"],
        additionalProperties: false,
      },
    },
    someday: {
      type: "array",
      description: "Places and things saved as inspiration for a trip one day, not tied to a trip being planned",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "What it is, short, e.g. 'Positano cliffside hotels', 'Northern lights in Troms\u00f8', 'Noma'" },
          place: { type: "string", description: "Where, for grouping: the country, or the US state or Canadian province, or for Italy 'Region, Italy', e.g. 'Japan', 'Alaska', 'Tuscany, Italy'" },
          spot: { type: "string", description: "The particular town, area or venue within it, e.g. 'Amalfi Coast', or empty" },
          note: { type: "string", description: "One or two lines: why it's worth going, best season, who recommended it, rough cost" },
          url: { type: "string", description: "The link it came from, or empty" },
        },
        required: ["title", "place", "spot", "note", "url"],
        additionalProperties: false,
      },
    },
    loyalty: {
      type: "array",
      description: "The family's own loyalty accounts this email reports on: statements, balances, status changes",
      items: {
        type: "object",
        properties: {
          program: { type: "string", description: "e.g. 'AAdvantage', 'Marriott Bonvoy'" },
          number: { type: "string", description: "Member number as printed (may be masked like ****1234), or empty" },
          traveler: { type: "string", description: "Which of the family's travelers the account belongs to, by their name in the list given, or empty" },
          status: { type: "string", description: "Status tier, e.g. 'Gold', 'Platinum Elite', or empty" },
          balance: { type: "number", description: "Points or miles balance, or -1 if not shown" },
          as_of: { type: "string", description: "Statement or balance date YYYY-MM-DD, or empty" },
        },
        required: ["program", "number", "traveler", "status", "balance", "as_of"],
        additionalProperties: false,
      },
    },
  },
  required: ["card_alert", "summary", "destination", "bookings", "costs", "trip", "ideas", "someday", "loyalty"],
  additionalProperties: false,
};

type TripBrief = { id: string; title: string; place: string; dates: string; possible?: boolean; items: string[] };
type Attachment = { Name?: string; ContentType?: string; Content?: string }; // Content is base64

// PDFs (invoices, e-tickets, cruise confirmations) and photos of bookings, as content blocks Claude reads
// before the email text. Capped so one email stays well inside a request.
const MAX_FILES = 6, MAX_BYTES = 20 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
function attachmentBlocks(files: Attachment[]) {
  const blocks: Record<string, unknown>[] = [];
  const names: string[] = [];
  let bytes = 0;
  for (const f of files || []) {
    const type = String(f.ContentType || "").toLowerCase().split(";")[0].trim();
    const data = String(f.Content || "").replace(/\s+/g, "");
    const size = Math.floor(data.length * 3 / 4);
    if (!data || blocks.length >= MAX_FILES || bytes + size > MAX_BYTES) continue;
    if (type === "application/pdf" || /\.pdf$/i.test(f.Name || "")) {
      blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data }, title: String(f.Name || "attachment.pdf").slice(0, 200) });
    } else if (IMAGE_TYPES.includes(type)) {
      blocks.push({ type: "image", source: { type: "base64", media_type: type, data } });
    } else continue;
    bytes += size; names.push(String(f.Name || type));
  }
  return { blocks, names };
}

type StoredFile = { name: string; type: string; path: string; size: number };

// Save attachments in the family's private media bucket (<household>/email/...), keyed by content so
// the same PDF forwarded twice is stored once.
async function storeFiles(admin: any, hid: string, files: Attachment[]): Promise<StoredFile[]> {
  const out: StoredFile[] = [];
  for (const f of files || []) {
    const type = String(f.ContentType || "").toLowerCase().split(";")[0].trim();
    const isPdf = type === "application/pdf" || /\.pdf$/i.test(f.Name || "");
    if (!isPdf && !IMAGE_TYPES.includes(type)) continue;
    const data = String(f.Content || "").replace(/\s+/g, "");
    if (!data || data.length > 28_000_000) continue;
    try {
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      const ext = isPdf ? "pdf" : type.split("/")[1].replace("jpeg", "jpg");
      const path = `${hid}/email/${await sha(data.length + "|" + data.slice(0, 400000))}.${ext}`;
      const mime = isPdf ? "application/pdf" : type;
      const { error } = await admin.storage.from("media").upload(path, bytes, { contentType: mime, upsert: true });
      if (error) { console.error("could not store attachment", f.Name, error.message); continue; }
      out.push({ name: String(f.Name || "attachment." + ext).slice(0, 200), type: mime, path, size: bytes.length });
    } catch (e) { console.error("could not store attachment", f.Name, String(e)); }
  }
  return out;
}

// A link shared on its own ("look at this place") says little. Read each page's title, description
// and preview image so Claude knows what it is and the Someday card has a picture.
type Preview = { url: string; title: string; description: string; image: string };
const entities = (s: string) => s.replace(/&amp;/g, "&").replace(/&#39;|&#x27;|&rsquo;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").trim();
async function linkPreviews(text: string): Promise<Preview[]> {
  const urls = [...new Set(String(text).match(/https?:\/\/[^\s<>"')\]]+/g) || [])].slice(0, 2);
  const out: Preview[] = [];
  for (const url of urls) {
    try {
      // public web pages only, not addresses inside the server's own network
      const host = new URL(url).hostname;
      if (host === "localhost" || /^[\d.]+$|^\[|:/.test(host) || /\.(local|internal)$/.test(host)) continue;
      const res = await fetch(url, {
        headers: { "user-agent": "Mozilla/5.0 (compatible; TripJournal/1.0)", accept: "text/html" },
        redirect: "follow", signal: AbortSignal.timeout(6000),
      });
      if (!res.ok || !/html/i.test(res.headers.get("content-type") || "")) continue;
      const html = (await res.text()).slice(0, 400000);
      const meta = (k: string) => {
        const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*content=["']([^"']*)["']`, "i")) ||
          html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${k}["']`, "i"));
        return m ? entities(m[1]) : "";
      };
      let image = meta("og:image") || meta("twitter:image");
      try { image = image ? new URL(image, res.url).href : ""; } catch { image = ""; }
      out.push({
        url,
        title: (meta("og:title") || entities((html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || "")).slice(0, 200),
        description: (meta("og:description") || meta("description")).slice(0, 500),
        image: image.startsWith("https://") ? image.slice(0, 1000) : "",
      });
    } catch { /* slow or unreachable: Claude still sees the link itself */ }
  }
  return out;
}

async function readWithClaude(text: string, subject: string, trips: TripBrief[], files: Attachment[] = [], family = "", watched = false, saving = false, people = ""): Promise<Reading | null> {
  if (!Deno.env.get("ANTHROPIC_API_KEY")) return null;
  // an organization-wide API key must name the workspace to use (ANTHROPIC_WORKSPACE_ID secret)
  const workspace = Deno.env.get("ANTHROPIC_WORKSPACE_ID");
  const client = new Anthropic(workspace ? { defaultHeaders: { "anthropic-workspace-id": workspace } } : {});
  const today = new Date().toISOString().slice(0, 10);
  const { blocks, names } = attachmentBlocks(files);
  const response = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: "You read forwarded travel emails for a family's trip journal: confirmations, changes, cancellations, " +
      "invoices, payment receipts and reminders. You pull out what was booked and what was paid or is owed, and say which of the family's trips it belongs to.",
    messages: [{
      role: "user",
      content: [...blocks, { type: "text", text:
        `Today is ${today}.\n\n` +
        (names.length ? `The email's attachments (${names.join(", ")}) come first; they often hold the real details \u2014 read them as part of the email.\n\n` : "") +
        "BOOKINGS: list every reservation the email confirms, changes or cancels \u2014 flights (each segment separately), " +
        "hotels and rentals, cruises, car rentals, trains, transfers, tours and activities, restaurants, tickets. Titles: flights " +
        "like 'United UA1234 \u00b7 SEA \u2192 SFO', stays use the property name, cruises the line and ship, cars like 'Hertz car rental'. " +
        "Notes are one short line, e.g. 'Departs 7:45am \u00b7 Conf ABC123' or 'Check-in Aug 10 \u00b7 check-out Aug 13 \u00b7 3 nights'. " +
        "A changed booking is listed once with its new details and status 'changed'; a cancelled one with status 'cancelled'.\n\n" +
        "COSTS: list money paid, owed or refunded \u2014 deposits, final payments, receipts, invoices, balances due (with the due date), refunds. " +
        "A confirmation that shows a price is also a cost (status 'paid' if it was charged, 'due' if it is owed). If part was paid and " +
        "a balance remains, give two costs. Payment and receipt emails are costs, not bookings, unless they also confirm a reservation. " +
        "When a payment, card authorization or receipt is toward a booking already in one of the family's trips, give that booking's " +
        "confirmation number (from the trip's items) even if this email doesn't show it, so it comes off that booking's balance. " +
        "A card authorization that has not been charged yet is 'due', with a note like 'Card authorized'. An itinerary or invoice that " +
        "lists the trip's sailings, flights or hotels is also a source of bookings.\n\n" +
        "TRIP: these are the family's trips (id, title, place, dates, some items already in each):\n" +
        JSON.stringify(trips) + "\n" +
        "Choose 'existing' with its trip_id only when the email clearly belongs to that trip (same destination, cruise or " +
        "itinerary, overlapping dates, or a confirmation number already in it). Choose 'new' when it is a reservation for travel " +
        "that matches none of them, and name the trip. Choose 'unsure' when it could fit more than one trip, or when it is a " +
        "payment or notice you cannot tie to a trip.\n\n" +
        "IDEAS: list trips that are being proposed, planned or discussed but not booked \u2014 invitations, 'want to come with us\u2026', " +
        "group trip plans, save-the-dates, a friend's itinerary we might join. One per distinct trip. If an idea is about one of the " +
        "family's trips above (including ones marked possible), give its trip_id so we don't make it twice. Ideas are not bookings: " +
        "list nothing under BOOKINGS for a trip that is only being proposed. " +
        `People are the friends or relatives involved, not us${family ? ` (we are ${family})` : ""}.\n\n` +
        "SOMEDAY: list places and things someone in the family saved as inspiration for a trip one day \u2014 a shared article or " +
        "link, a screenshot, a friend's recommendation, a note like 'we should go here' \u2014 that aren't part of a trip being planned " +
        "(those are IDEAS) or booked. One per distinct place or thing; group them by country (or US state / Canadian province) " +
        "in place, with the town, area or venue in spot. For Italy, put the region and country in place, e.g. 'Tuscany, Italy', " +
        "'Campania, Italy' (Amalfi Coast), 'Sicily, Italy', using the English region names.\n\n" +
        "CARD ALERTS: a card issuer's transaction alert (American Express, Luxury Card / Barclays and the like) is a cost: the merchant " +
        "as vendor and a short title, the amount, the transaction date, status 'paid' ('refund' for a credit), and the card in card. " +
        "Always list the charge, whatever it is for \u2014 we decide whether it belongs to a trip. Say whether the merchant is travel, " +
        "and for trip, choose 'existing' only when the merchant clearly matches one of the trips' bookings.\n\n" +
        "LOYALTY: for statements, balance updates and status emails about the family's own airline, hotel, rental and cruise " +
        "accounts (not offers or promotions), list each account: program, member number as printed, status tier and points or miles " +
        `balance.${people ? ` Say whose account it is from these travelers: ${people}.` : ""} For bookings, put any loyalty numbers ` +
        "shown on the reservation in that booking's loyalty field.\n\n" +
        "Skip marketing and travel deals: newsletters and promotions are not inspiration unless someone forwarded one with a note. " +
        "Infer missing years from today's date. If the email has no bookings, no costs, no trip ideas and nothing for someday, return empty lists.\n\n" +
        (watched ? "This email arrived at the family's trips address directly rather than being forwarded on purpose, so it may not be travel. Unless it is " +
          "about the family's own travel (a reservation, a change, a payment, a trip being planned with us, a place one of us wants to go, " +
          "or one of our loyalty accounts), return empty lists \u2014 but always list a card transaction alert.\n\n" : "") +
        (saving ? "Someone in the family saved this in the app as inspiration for a trip someday: list it under SOMEDAY, and nothing " +
          "else unless it is plainly a booking or a receipt.\n\n" : "") +
        `SUBJECT: ${subject}\n\nEMAIL:\n${text.slice(0, 60000)}`,
      }],
    }],
    output_config: { effort: "low", format: { type: "json_schema", schema: READING_SCHEMA } },
  } as any);
  if (response.stop_reason !== "end_turn") throw new Error("stopped: " + response.stop_reason);
  const raw = response.content.filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
  const p = JSON.parse(raw);
  const iso = (s: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "").trim()); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  const str = (s: unknown, n: number) => String(s || "").slice(0, n);
  const bookings: Booking[] = [];
  for (const b of p.bookings || []) {
    const date = iso(b.date);
    if (!date || !b.title) continue;
    bookings.push({
      kind: b.kind, status: b.status, date, endDate: iso(b.end_date), time: str(b.time, 20), title: str(b.title, 140),
      provider: str(b.provider, 80), confirmation: str(b.confirmation, 40), place: str(b.place, 80), address: str(b.address, 160),
      travelers: str(b.travelers, 200), loyalty: str(b.loyalty, 200), note: str(b.note, 200),
    });
  }
  const costs: Cost[] = [];
  for (const c of p.costs || []) {
    const amount = Math.abs(Number(c.amount));
    if (!isFinite(amount) || amount <= 0 || !c.title) continue;
    costs.push({
      category: c.category, title: str(c.title, 120), vendor: str(c.vendor, 80), amount: Math.round(amount * 100) / 100,
      currency: str(c.currency || "USD", 3).toUpperCase(), status: c.status, date: iso(c.date), confirmation: str(c.confirmation, 40), note: str(c.note, 200),
      card: str(c.card, 60), travel: c.travel === true,
    });
  }
  const ideas: Idea[] = (p.ideas || []).filter((i: Record<string, string>) => i.title || i.place).map((i: Record<string, string>) => ({
    title: str(i.title || i.place, 60), place: str(i.place, 60), dates: str(i.dates, 60), start: iso(i.start_date), end: iso(i.end_date),
    people: str(i.people, 200), summary: str(i.summary, 400), tripId: str(i.trip_id, 40),
  }));
  const someday: Saved[] = (p.someday || []).filter((s: Record<string, string>) => s.title || s.spot || s.place).map((s: Record<string, string>) => ({
    title: str(s.title || s.spot || s.place, 120), place: str(s.place, 60), spot: str(s.spot, 80), note: str(s.note, 400),
    url: /^https?:\/\//.test(s.url || "") ? str(s.url, 1000) : "",
  }));
  const t = p.trip || {};
  return {
    cardAlert: p.card_alert === true,
    summary: str(p.summary, 200), destination: str(p.destination, 60), bookings, costs, ideas, someday,
    loyalty: (p.loyalty || []).filter((a: Record<string, unknown>) => a.program).map((a: Record<string, unknown>) => ({
      program: str(a.program, 60), number: str(a.number, 40), traveler: str(a.traveler, 60), status: str(a.status, 40),
      balance: typeof a.balance === "number" && a.balance >= 0 ? Math.round(a.balance) : null,
      asOf: /^\d{4}-\d{2}-\d{2}$/.test(String(a.as_of || "")) ? String(a.as_of) : "",
    })),
    placement: { decision: t.decision, tripId: str(t.trip_id, 40), title: str(t.new_title, 60), place: str(t.new_place, 60), reason: str(t.reason, 200) },
  };
}

function readWithScanner(text: string): Reading {
  const found = parseConfirmation(text);
  const bookings: Booking[] = found.filter((f: { sortDate: Date | null }) => f.sortDate).map((f: { kind: string; sortDate: Date; title: string; place: string; note: string }) => ({
    kind: f.kind === "Booking" ? "Other" : f.kind, status: "confirmed", date: f.sortDate, endDate: null, time: "", title: f.title,
    provider: "", confirmation: "", place: f.place || "", address: "", travelers: "", loyalty: "", note: f.note,
  }));
  const stay = bookings.find((b) => b.kind === "Stay");
  return { summary: "", destination: stay ? stay.place : "", bookings, costs: [], placement: null, ideas: [], someday: [], loyalty: [] };
}

// ---- rows for the entries table ----
async function bookingRows(hid: string, bookings: Booking[], fallbackPlace: string) {
  const seen = new Map<string, number>();
  const out: { id: string; doc: Record<string, unknown> }[] = [];
  for (const b of bookings) {
    // keyed by confirmation number when there is one, so a change or cancellation updates the same item
    const conf = confKey(b.confirmation);
    let id: string;
    if (conf) {
      const k = b.kind + "|" + conf; const n = seen.get(k) || 0; seen.set(k, n + 1);
      id = "email-" + await sha([hid, "b", b.kind, conf, n].join("|"));
    } else {
      id = "email-" + await sha([hid, b.kind, b.title.toLowerCase(), label(b.date), b.date.getFullYear()].join("|"));
    }
    const note = (b.status === "cancelled" ? "Cancelled \u00b7 " : b.status === "changed" ? "Changed \u00b7 " : "") +
      (b.note || [b.time && "Starts " + b.time, b.confirmation && "Conf " + b.confirmation].filter(Boolean).join(" \u00b7 ") || "From confirmation email");
    out.push({
      id,
      doc: {
        id, date: label(b.date), title: b.title, place: b.place || fallbackPlace || "", note, photos: [],
        pos: b.date.getTime() + minutesOf(b.time) * 60000, added: Date.now(), kind: b.kind, source: "email",
        booking: {
          status: b.status, provider: b.provider, confirmation: b.confirmation, start: isoDay(b.date), end: isoDay(b.endDate),
          time: b.time, address: b.address, travelers: b.travelers, loyalty: b.loyalty,
        },
      },
    });
  }
  return out;
}

async function costRows(hid: string, costs: Cost[]) {
  const out: { id: string; doc: Record<string, unknown> }[] = [];
  for (const c of costs) {
    const id = "cost-" + await sha([hid, c.status, c.amount.toFixed(2), c.currency, isoDay(c.date), confKey(c.confirmation) || c.title.toLowerCase()].join("|"));
    out.push({
      id,
      doc: {
        id, type: "cost", category: c.category, title: c.title, vendor: c.vendor, amount: c.amount, currency: c.currency,
        status: c.status, date: isoDay(c.date), confirmation: c.confirmation, note: c.note, source: "email",
        ...(c.card ? { card: c.card } : {}),
        pos: (c.date || new Date()).getTime(), added: Date.now(),
      },
    });
  }
  return out;
}

// ---- suggestions: what to see, do and eat at one stop, for the app's Explore tab ----
// Claude searches the web for current picks, knowing the dates, what's already booked there (a
// cruise's shore excursion, say) and the travelers' preferences, and hands them back through the
// save_suggestions tool (a strict schema; JSON output and web-search citations don't mix).
const SUGGESTION_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "One or two lines on this stop for this trip: how much time there is and how to spend it" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["see", "do", "eat", "know"] },
          title: { type: "string", description: "Short name, e.g. 'Glover Garden', 'Champon at Shikairo'" },
          why: { type: "string", description: "One or two sentences: why it's worth it for these travelers" },
          when: { type: "string", description: "Best time, which day of the stop, or how long it takes; or empty" },
          where: { type: "string", description: "Neighborhood or short address, and how far from the port or hotel when useful; or empty" },
          url: { type: "string", description: "Official site or a good source, or empty" },
        },
        required: ["kind", "title", "why", "when", "where", "url"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "items"],
  additionalProperties: false,
};

async function suggestFor(admin: any, hid: string, body: Record<string, any>) {
  if (!Deno.env.get("ANTHROPIC_API_KEY")) return ok({ error: "Suggestions need the Claude key set up" }, 500);
  const tripId = String(body.TripId || ""), place = String(body.Place || "").slice(0, 80);
  if (!tripId || !place) return ok({ error: "Pick a stop first" }, 400);
  const [{ data: tripRow }, { data: rows }, { data: people }, { data: hh }] = await Promise.all([
    admin.from("trips").select("doc").eq("household_id", hid).eq("id", tripId).maybeSingle(),
    admin.from("entries").select("doc").eq("household_id", hid).eq("trip_id", tripId).eq("deleted", false),
    admin.from("travelers").select("name, doc").eq("household_id", hid),
    admin.from("households").select("home").eq("id", hid).maybeSingle(),
  ]);
  if (!tripRow) return ok({ error: "Trip not found" }, 404);
  const trip = (tripRow as { doc: Record<string, any> }).doc;
  const items = ((rows || []) as { doc: Record<string, any> }[]).map((r) => r.doc).filter((d) => d.type !== "cost")
    .sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0));
  const line = (d: Record<string, any>) => [d.date, d.kind, d.title, d.place, d.booking?.time, d.note].filter(Boolean).join(" \u00b7 ").slice(0, 240);
  const here = items.filter((d) => String(d.place || "").toLowerCase() === place.toLowerCase());
  const prefs = ((people || []) as { name: string; doc: Record<string, any> }[]).map((p) => {
    const pr = (p.doc || {}).prefs || {}, em = (p.doc || {}).emergency || {};
    return [p.name, pr.meal && `eats: ${pr.meal}`, em.medical && `health: ${em.medical}`, pr.notes].filter(Boolean).join("; ");
  }).filter(Boolean).join(" | ");
  const have = (Array.isArray(body.Have) ? body.Have : []).map((s: unknown) => String(s).slice(0, 80)).slice(0, 60);
  const focus = String(body.Focus || "").slice(0, 200);
  const home = ((hh as { home?: { home?: string } } | null)?.home || {}).home || "";

  const prompt =
    `Suggest what to see, do and eat in ${place} for this trip, and what to know before going.\n\n` +
    `TRIP: ${trip.title || ""} \u2014 ${trip.place || ""}, ${trip.dates || ""}.${home ? ` They live in ${home}.` : ""}\n` +
    `TRAVELERS: ${prefs || "two adults"}\n\n` +
    `AT THIS STOP (already booked or planned \u2014 don't suggest these again; fit suggestions around them and the time ashore):\n` +
    (here.map(line).join("\n") || "(nothing yet)") + "\n\n" +
    `THE WHOLE ITINERARY, for context (a cruise means limited hours in port):\n` + items.slice(0, 60).map(line).join("\n") + "\n\n" +
    (have.length ? `ALREADY SUGGESTED (give different ones): ${have.join("; ")}\n\n` : "") +
    (focus ? `THEY ASKED FOR: ${focus}\n\n` : "") +
    "Search the web for current information \u2014 what's open on these dates, seasonal events, the best places to eat now. " +
    "Give 10\u201314 picks across see, do, eat and know (practical tips: getting from the port or station, money, customs, what to wear). " +
    "Be specific (named places and dishes), realistic about the time available, and say why each one suits these travelers. " +
    "When you're done, call save_suggestions once with everything.";

  const workspace = Deno.env.get("ANTHROPIC_WORKSPACE_ID");
  const client = new Anthropic(workspace ? { defaultHeaders: { "anthropic-workspace-id": workspace } } : {});
  const tools = [
    { type: "web_search_20260209", name: "web_search", max_uses: 6 },
    { name: "save_suggestions", description: "Save the finished suggestions for this stop. Call once, at the end.", strict: true, input_schema: SUGGESTION_SCHEMA },
  ];
  const messages: any[] = [{ role: "user", content: prompt }];
  for (let turn = 0; turn < 6; turn++) {
    const res: any = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      tools,
      messages,
    } as any);
    const saved = (res.content || []).find((b: any) => b.type === "tool_use" && b.name === "save_suggestions");
    if (saved) {
      const out = saved.input || {};
      const clean = (s: unknown, n: number) => String(s || "").slice(0, n);
      return ok({
        summary: clean(out.summary, 400),
        items: (Array.isArray(out.items) ? out.items : []).filter((i: any) => i && i.title).slice(0, 20).map((i: any) => ({
          kind: ["see", "do", "eat", "know"].includes(i.kind) ? i.kind : "do",
          title: clean(i.title, 100), why: clean(i.why, 400), when: clean(i.when, 120), where: clean(i.where, 160),
          url: /^https?:\/\//.test(String(i.url || "")) ? clean(i.url, 500) : "",
        })),
      });
    }
    if (res.stop_reason === "refusal") return ok({ error: "Couldn't make suggestions for that \u2014 try again" }, 502);
    // a long web search pauses; send the turn back and it carries on
    messages.push({ role: "assistant", content: res.content });
    if (res.stop_reason === "pause_turn") continue;
    // finished without saving: ask for the tool call
    messages.push({ role: "user", content: "Now call save_suggestions with your picks." });
  }
  return ok({ error: "Suggestions took too long \u2014 try again" }, 504);
}

// ---- photos from the family's iPhone Shortcut (?key=\u2026&family=<inbox code>) ----
// GET  &check&date=YYYY-MM-DD \u2192 { trip: "<title>" } when a trip is on that day (a day either side for
//      travel days), else { trip: "" } \u2014 the Shortcut sends nothing on ordinary days.
// POST &photo  { image: base64 JPEG, taken: "YYYY-MM-DD HH:MM:SS", lat?, lon? } \u2192 filed into that day's
//      photos memory by placePhotos, as the app's Add photos does; the same shot twice is skipped.
async function photoDrop(req: Request, url: URL) {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const code = String(url.searchParams.get("family") || "").toLowerCase();
  const { data: hh } = await admin.from("households").select("id").eq("inbox_token", code).maybeSingle();
  if (!hh) return ok({ error: "unknown family code" }, 404);
  const hid = (hh as { id: string }).id;
  const { data: tripRows } = await admin.from("trips").select("id, doc").eq("household_id", hid).eq("deleted", false);
  const DAY = 86400000;
  // the trip on a day: the shortest one whose dates cover it, give or take a day
  const tripOn = (d: Date) => {
    const x = day(d).getTime();
    let best: { r: { id: string; doc: Record<string, any> }; len: number } | null = null;
    for (const r of (tripRows || []) as { id: string; doc: Record<string, any> }[]) {
      if (r.doc.possible) continue;
      const range = tripRange(r.doc.dates);
      if (!range || x < day(range[0]).getTime() - DAY || x > day(range[1]).getTime() + DAY) continue;
      const len = range[1].getTime() - range[0].getTime();
      if (!best || len < best.len) best = { r, len };
    }
    return best ? best.r : null;
  };

  if (req.method === "GET") {
    const t = tripOn(parsePhotoTime(url.searchParams.get("date") || "") || new Date());
    return ok({ trip: t ? String(t.doc.title || "Trip") : "" });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return ok({ error: "bad json" }, 400); }
  const taken = parsePhotoTime(String(body.taken || ""));
  if (!taken) return ok({ error: "no date taken" }, 400);
  const trip = tripOn(taken);
  if (!trip) return ok({ skipped: "no trip that day" });
  return await filePhoto(admin, hid, trip, body, taken, "");
}

// One photo into a trip: stored in the family's media, then filed into its day's photos memory by
// placePhotos, as the app's Add photos does; the same shot twice is skipped. `by` names the
// fellow traveler who sent it from a shared trip link ("" for the family's Shortcut).
async function filePhoto(admin: ReturnType<typeof createClient>, hid: string, trip: { id: string; doc: Record<string, any> },
  body: Record<string, unknown>, taken: Date, by: string) {
  const data = String(body.image || "").replace(/^data:[^,]*,/, "").replace(/\s+/g, "");
  if (!data || data.length > 28_000_000) return ok({ error: "no image, or too big" }, 400);

  // the trip's memories as the app holds them; the photo joins its day and place
  const { data: rows } = await admin.from("entries").select("id, doc").eq("household_id", hid).eq("trip_id", trip.id).eq("deleted", false);
  const days = ((rows || []) as { id: string; doc: Record<string, any> }[]).filter((r) => r.doc.type !== "cost").map((r) => ({ ...r.doc, id: r.id }));
  const before = new Map(days.map((d) => [d.id, JSON.stringify(d.photos || [])]));
  const lat = Number(body.lat), lon = Number(body.lon);
  const gps = isFinite(lat) && isFinite(lon) && (lat || lon) ? { lat, lon } : {};
  const print = await sha(data.length + "|" + data.slice(0, 4000) + "|" + data.slice(-4000));
  // two travelers can take different shots in the same second, so their photos are known by content
  const key = by ? "g" + print : photoKey(taken, "");
  const path = `${hid}/photos/${by ? print : await sha(key + "|" + data.length + "|" + data.slice(0, 2000))}.jpg`;
  const placed = placePhotos({ ...trip.doc, id: trip.id, days }, [{ key, taken, ...gps, path, ...(by ? { by } : {}) }],
    () => "photos-" + crypto.randomUUID().slice(0, 13));
  if (!placed.added) return ok({ skipped: "already added" });

  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  const { error: upErr } = await admin.storage.from("media").upload(path, bytes, { contentType: "image/jpeg", upsert: true });
  if (upErr) return ok({ error: "could not store the photo: " + upErr.message }, 500);
  const changed = (placed.trip.days as Record<string, any>[]).filter((d) => before.get(d.id) !== JSON.stringify(d.photos || []));
  const { error } = await admin.from("entries").upsert(changed.map((d) => {
    const { num, ...doc } = d; // eslint-disable-line no-unused-vars
    return { household_id: hid, id: d.id, trip_id: trip.id, deleted: false, doc };
  }), { onConflict: "household_id,id" });
  if (error) return ok({ error: error.message }, 500);
  // the app's bell: one line per trip day of photos (and per traveler), counting up as they arrive
  const mid = `photos:${trip.id}:${isoDay(taken)}${by ? ":" + by.toLowerCase() : ""}`;
  const { data: logRow } = await admin.from("inbound_emails").select("id, items").eq("household_id", hid).eq("message_id", mid).maybeSingle();
  if (logRow) {
    await admin.from("inbound_emails").update({ items: ((logRow as { items: number }).items || 0) + 1, created_at: new Date().toISOString() }).eq("id", (logRow as { id: number }).id);
  } else {
    await admin.from("inbound_emails").insert({
      household_id: hid, sender: by || "iPhone Shortcut", subject: `${by ? by + "'s photos" : "Photos"} from ${label(taken)}`, items: 1,
      status: "added", reader: by ? "guest" : "shortcut",
      trip_title: String(trip.doc.title || ""), trip_id: trip.id, message_id: mid, body: "", attachments: [],
    });
  }
  return ok({ added: 1, trip: String(trip.doc.title || "") });
}

// ---- a trip shared by link (?share=<token>: the trip's shareToken), no sign-in ----
// GET \u2192 the trip as a fellow traveler sees it: the plan, memories and photos \u2014 no costs, confirmation
//       or loyalty numbers, and nothing from the family's other trips.
// POST { action: "photo", name, image, taken, lat?, lon? } adds a photo; { action: "note", name, text, when }
//       a note on that day. Both are marked with who sent them. Turning the link off in the app ends it.
const noConf = (s: string) => s.replace(/\s*(\u00b7\s*)?\b(conf(irmation)?|record locator|pnr)\b[\s#:.]*[A-Z0-9-]{4,}/gi, "").trim().replace(/^\u00b7\s*/, "");
async function sharedTrip(req: Request, url: URL) {
  const token = String(url.searchParams.get("share") || "");
  if (token.length < 16) return ok({ error: "This trip link isn't complete \u2014 ask for it again" }, 404);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: found } = await admin.from("trips").select("household_id, id, doc").eq("doc->>shareToken", token).eq("deleted", false).limit(1);
  const t = ((found || []) as { household_id: string; id: string; doc: Record<string, any> }[])[0];
  if (!t) return ok({ error: "This trip link has been turned off" }, 404);
  const hid = t.household_id;
  const trip = { id: t.id, doc: t.doc };

  if (req.method === "GET") {
    const { data: rows } = await admin.from("entries").select("id, doc").eq("household_id", hid).eq("trip_id", t.id).eq("deleted", false);
    const days = ((rows || []) as { id: string; doc: Record<string, any> }[]).filter((r) => r.doc.type !== "cost");
    const paths = [...new Set(days.flatMap((r) => (r.doc.photos || []).map((p: Record<string, any>) => p.path).filter(Boolean)))] as string[];
    const signed = new Map<string, string>();
    if (paths.length) {
      const { data } = await admin.storage.from("media").createSignedUrls(paths, 12 * 3600);
      for (const s of data || []) if (s.path && s.signedUrl) signed.set(s.path, s.signedUrl);
    }
    const out = days.map(({ id, doc: d }) => ({
      id, date: String(d.date || ""), title: String(d.title || ""), place: String(d.place || ""), kind: String(d.kind || ""),
      pos: Number(d.pos) || 0, by: String(d.by || ""), cancelled: d.booking?.status === "cancelled",
      // a booking shows when and where, not its confirmation number or who holds it
      note: d.booking ? [d.booking.time && "Starts " + d.booking.time, d.booking.address].filter(Boolean).join(" \u00b7 ") : noConf(String(d.note || "")),
      photos: (d.photos || []).map((p: Record<string, any>) => ({
        url: p.path ? signed.get(p.path) || "" : typeof p.src === "string" && !p.src.startsWith("data:") ? p.src : "",
        label: String(p.label || ""), by: String(p.by || ""),
      })).filter((p: { url: string }) => p.url),
    })).sort((a, b) => a.pos - b.pos);
    return ok({ trip: { title: t.doc.title || "Our trip", place: t.doc.place || "", dates: t.doc.dates || "", grad: t.doc.grad || "" }, days: out });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return ok({ error: "bad json" }, 400); }
  const name = String(body.name || "").replace(/\s+/g, " ").trim().slice(0, 40);
  if (!name) return ok({ error: "Add your name first" }, 400);
  if (body.action === "photo") return await filePhoto(admin, hid, trip, body, parsePhotoTime(String(body.taken || "")) || new Date(), name);
  if (body.action !== "note") return ok({ error: "unknown action" }, 400);

  const text = String(body.text || "").trim().slice(0, 3000);
  if (!text) return ok({ error: "Write something first" }, 400);
  const when = parsePhotoTime(String(body.when || "")) || new Date();
  const { data: rows } = await admin.from("entries").select("doc").eq("household_id", hid).eq("trip_id", t.id).eq("deleted", false);
  const same = ((rows || []) as { doc: Record<string, any> }[]).map((r) => r.doc).filter((d) => d.type !== "cost" && d.date === label(when) && d.place);
  const id = "note-" + crypto.randomUUID().slice(0, 13);
  const doc = {
    id, date: label(when), title: `${name}'s note`, place: same.length ? same[same.length - 1].place : t.doc.place || "",
    note: text, photos: [], pos: when.getTime(), added: Date.now(), by: name, source: "guest",
  };
  const { error } = await admin.from("entries").upsert({ household_id: hid, id, trip_id: t.id, deleted: false, doc }, { onConflict: "household_id,id" });
  if (error) return ok({ error: error.message }, 500);
  await admin.from("inbound_emails").insert({
    household_id: hid, sender: name, subject: `${name}: ${text.length > 60 ? text.slice(0, 57) + "\u2026" : text}`, items: 1, status: "added",
    reader: "guest", trip_title: String(t.doc.title || ""), trip_id: t.id, message_id: "guest:" + id, body: "", attachments: [],
  });
  return ok({ added: 1 });
}

// ---- webhook (the Gmail forwarder, with ?key=) and uploads from the app (a signed-in family member) ----
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  // a fellow traveler with the trip's link: the link itself is the pass
  if (url.searchParams.has("share")) return await sharedTrip(req, url);
  const secret = Deno.env.get("INBOUND_SECRET");
  const fromForwarder = !!secret && url.searchParams.get("key") === secret;
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!fromForwarder && !jwt) return ok({ error: "forbidden" }, 403);
  // the family's iPhone Shortcut: is there a trip today (GET &check), and each of its photos (POST &photo)
  if (url.searchParams.has("check") || url.searchParams.has("photo")) {
    if (!fromForwarder) return ok({ error: "forbidden" }, 403);
    return await photoDrop(req, url);
  }
  if (req.method !== "POST") return ok({ error: "POST only" }, 405);

  let mail: Record<string, any>;
  try { mail = await req.json(); } catch { return ok({ error: "bad json" }, 400); }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  let household: { id: string } | null = null;
  let uploader = "";
  if (fromForwarder) {
    // which family: the +token on the address it was sent to
    const hashes = [mail.MailboxHash, ...((mail.ToFull || []) as { MailboxHash?: string }[]).map((t) => t.MailboxHash), ...((mail.CcFull || []) as { MailboxHash?: string }[]).map((t) => t.MailboxHash)]
      .filter(Boolean).map((h: string) => h.toLowerCase());
    for (const h of hashes) {
      const { data } = await admin.from("households").select("id").eq("inbox_token", h).maybeSingle();
      if (data) { household = data; break; }
    }
    // Answer 200 for unknown addresses so the forwarder does not keep retrying junk mail.
    if (!household) return ok({ ignored: "unknown address" });
  } else {
    // an upload from the app: the signed-in member's own family
    const { data: who } = await admin.auth.getUser(jwt);
    if (!who?.user) return ok({ error: "Sign in to add bookings" }, 401);
    const { data: m } = await admin.from("household_members").select("household_id").eq("user_id", who.user.id).limit(1).maybeSingle();
    if (!m) return ok({ error: "Join or start a family journal first" }, 403);
    household = { id: (m as { household_id: string }).household_id };
    uploader = "Uploaded by " + (who.user.email || "a family member");
  }
  const hid = household.id;
  // the app asking for things to see, do and eat at one stop of a trip
  if (!fromForwarder && mail.Suggest === true) return await suggestFor(admin, hid, mail);
  // uploads made from inside a trip go to that trip
  const chosenTrip = fromForwarder ? "" : String(mail.TripId || "");
  // sent to the plain trips address (bookings made with it) rather than forwarded to the +code address on purpose
  const watched = fromForwarder && mail.Watched === true;

  const sender = (uploader || String(mail.From || "")).slice(0, 200);
  const subject = String(mail.Subject || "").slice(0, 300);
  const text = String(mail.TextBody || "").trim() || htmlToText(String(mail.HtmlBody || ""));
  const files = (Array.isArray(mail.Attachments) ? mail.Attachments : []) as Attachment[];

  // ---- the family's trips and what is already in them ----
  const { data: tripRows } = await admin.from("trips").select("id, doc").eq("household_id", hid).eq("deleted", false);
  const trips = (tripRows || []).map((r: { id: string; doc: Record<string, any> }) => ({ id: r.id, doc: r.doc, range: tripRange(r.doc.dates) }));
  const { data: itemRows } = await admin.from("entries")
    .select("id, trip_id, title:doc->>title, bconf:doc->booking->>confirmation, cconf:doc->>confirmation")
    .eq("household_id", hid).eq("deleted", false);
  const items = (itemRows || []) as { id: string; trip_id: string; title: string | null; bconf: string | null; cconf: string | null }[];
  const briefs: TripBrief[] = trips.map((t) => ({
    id: t.id, title: t.doc.title || "", place: t.doc.place || "", dates: t.doc.dates || "", ...(t.doc.possible ? { possible: true } : {}),
    items: items.filter((e) => e.trip_id === t.id).slice(0, 15).map((e) => [e.title, e.bconf || e.cconf].filter(Boolean).join(" \u00b7 ")),
  }));

  let read: Reading | null = null;
  let reader = "claude";
  // who "we" are, so trip ideas list only the other people involved
  const [{ data: hh }, { data: members }] = await Promise.all([
    admin.from("households").select("name").eq("id", hid).maybeSingle(),
    admin.from("household_members").select("display_name").eq("household_id", hid),
  ]);
  const family = [(hh as { name?: string } | null)?.name, ...((members || []) as { display_name: string }[]).map((m) => m.display_name)]
    .filter(Boolean).join(", ");
  // a short email or note with a link in it: read the linked page too
  const previews = text.length < 3000 ? await linkPreviews(text) : [];
  const previewText = previews.map((p) => `\n\nLINK PREVIEW ${p.url}\n${p.title}\n${p.description}`).join("");
  // saved from the app's "Save idea": inspiration for the Someday board
  const saving = !fromForwarder && mail.Someday === true;
  // the family's travelers and their programs (last 4 of each number only), so statements reach the right card
  const { data: travelerRows } = await admin.from("travelers").select("id, name, doc").eq("household_id", hid);
  const travelers = (travelerRows || []) as { id: string; name: string; doc: Record<string, any> }[];
  const people = travelers.map((t) => {
    const progs = ((t.doc || {}).loyalty || []).map((l: Record<string, string>) => [l.program, l.number && "\u2026" + last4(l.number)].filter(Boolean).join(" "));
    const pp = ((t.doc || {}).passport || {}).name;
    return `${t.name}${pp ? ` (${pp})` : ""}${progs.length ? `: ${progs.join(", ")}` : ""}`;
  }).join("; ");
  try { read = await readWithClaude(subject + "\n" + text + previewText, subject, briefs, files, family, watched, saving, people); } catch (e) {
    read = null;
    reader = "scanner: " + String((e as Error)?.message || e).slice(0, 300);
    console.error("Claude could not read the email:", reader);
  }
  // the scanner would find "bookings" in ordinary mail; the watcher tries again on a later run
  if (!read && watched) return ok({ error: "could not read the email, try later" }, 503);
  if (!read) { if (reader === "claude") reader = "scanner"; read = readWithScanner(subject + "\n" + text); }
  // personal mail that isn't travel: keep nothing, not even a log line
  if (watched && !read.bookings.length && !read.costs.length && !read.ideas.length && !read.someday.length && !read.loyalty.length) return ok({ ignored: "not travel" });

  // keep the PDFs and photos so the trip's Documents can open them later
  const stored = await storeFiles(admin, hid, files);
  const log = async (fields: Record<string, unknown>) => {
    const { data } = await admin.from("inbound_emails").insert({
      household_id: hid, sender, subject, ...fields, body: text.slice(0, 100000), attachments: stored,
      message_id: String(mail.MessageId || "").slice(0, 200) || null,
    }).select("id").single();
    return (data as { id: number } | null)?.id ?? null;
  };
  // ---- trip ideas: each becomes a possible trip (or a note on the trip it is about) ----
  const ideaTitles: string[] = [];
  let ideaTripId = "";
  for (const idea of read.ideas) {
    const known = trips.find((x) => x.id === idea.tripId);
    let tid = known ? known.id : "";
    if (!known) {
      tid = "u" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const start = idea.start, end = idea.end || idea.start;
      const doc: Record<string, unknown> = {
        title: idea.title, place: idea.place, dates: start ? rangeLabel(start, end!) : (idea.dates || "Dates to be decided"),
        grad: GRADIENTS[Math.floor(Math.random() * GRADIENTS.length)], planning: true, possible: true, statusLabel: "Possible",
        countdown: start && day(start) >= day(new Date()) ? countdown(start) : undefined,
        timelineLabel: "Itinerary", members: [], song: null, source: "email", companions: idea.people,
      };
      const { error } = await admin.from("trips").upsert({ household_id: hid, id: tid, doc: JSON.parse(JSON.stringify(doc)), deleted: false }, { onConflict: "household_id,id" });
      if (error) { console.error("could not add possible trip", error.message); continue; }
      trips.push({ id: tid, doc, range: tripRange(String(doc.dates)) });
    }
    // the proposal itself heads that trip's itinerary: who suggested it and what they said
    const nid = "idea-" + await sha([hid, tid, subject.toLowerCase(), idea.title.toLowerCase()].join("|"));
    const note = [idea.summary, !idea.start && idea.dates ? "Dates: " + idea.dates : ""].filter(Boolean).join("\n");
    await admin.from("entries").upsert({
      household_id: hid, id: nid, trip_id: tid, deleted: false,
      doc: { id: nid, date: label(new Date()), title: idea.people ? `Idea from ${idea.people}` : "Trip idea", place: idea.place, note, photos: [], pos: (idea.start || new Date()).getTime() - 60000, source: "email-idea", added: Date.now() },
    }, { onConflict: "household_id,id" });
    ideaTitles.push(known ? String(known.doc.title || "") : idea.title);
    if (!ideaTripId) ideaTripId = tid;
  }

  // ---- someday: inspiration for a trip one day, grouped by place on the Trips page ----
  const savedNames: string[] = [];
  if (read.someday.length) {
    const photo = stored.find((f) => f.type.startsWith("image/"));
    const { data: have } = await admin.from("someday").select("title, place").eq("household_id", hid).neq("status", "removed");
    const key = (s: { title: string; place: string }) => (s.place + "|" + s.title).toLowerCase();
    const known = new Set(((have || []) as { title: string; place: string }[]).map(key));
    const rows = read.someday.filter((s) => !known.has(key(s))).map((s) => ({
      household_id: hid, place: s.place, spot: s.spot, title: s.title, note: s.note, url: s.url || null,
      image_url: (previews.find((p) => p.url === s.url) || (previews.length === 1 ? previews[0] : null))?.image || null,
      image_path: photo ? photo.path : null, source: fromForwarder ? "email" : "app", sender,
    }));
    const { error } = rows.length ? await admin.from("someday").insert(rows) : { error: null };
    if (error) console.error("could not save to someday", error.message);
    // already saved before counts as saved, so a second share of the same link doesn't read as a failure
    else savedNames.push(...read.someday.map((s) => s.spot || s.title || s.place));
  }

  // ---- loyalty: statement balances and status onto the right traveler's card ----
  const accounts: string[] = [];
  for (const a of read.loyalty) {
    const key = programKey(a.program);
    const l4 = last4(a.number);
    // whose: the traveler Claude named, else the one already holding this program's number
    const owner = travelers.find((t) => t.name && a.traveler && t.name.toLowerCase() === a.traveler.toLowerCase().split(/\s+/)[0]) ||
      travelers.find((t) => ((t.doc || {}).loyalty || []).some((l: Record<string, string>) => programKey(l.program) === key && l4 && last4(l.number) === l4));
    if (!owner) continue;
    const doc = { ...(owner.doc || {}) };
    const list = [...(doc.loyalty || [])] as Record<string, string>[];
    let i = list.findIndex((l) => programKey(l.program) === key && (!l4 || !l.number || last4(l.number) === l4));
    if (i < 0) { list.push({ program: a.program, number: a.number }); i = list.length - 1; }
    const masked = /[*\u2022x]{2,}/i.test(a.number);
    list[i] = {
      ...list[i],
      ...(a.number && !masked ? { number: a.number } : {}),
      ...(a.status ? { status: a.status } : {}),
      ...(a.balance != null ? { balance: a.balance.toLocaleString("en-US") } : {}),
      ...(a.asOf ? { asOf: a.asOf } : {}),
    };
    doc.loyalty = list;
    owner.doc = doc;
    const { error } = await admin.from("travelers").update({ doc, updated_at: new Date().toISOString() }).eq("id", owner.id);
    if (error) console.error("could not update loyalty", error.message);
    else accounts.push(`${owner.name} ${list[i].program}`);
  }

  if (!read.bookings.length && !read.costs.length) {
    if (ideaTitles.length || savedNames.length || accounts.length) {
      const names = [...ideaTitles, ...(savedNames.length ? ["Someday"] : []), ...accounts].join(", ");
      const n = ideaTitles.length + savedNames.length + accounts.length;
      await log({ items: n, status: "added", reader, trip_title: names, trip_id: ideaTripId });
      return ok({ added: n, trip: ideaTitles.join(", "), tripId: ideaTripId, ideas: ideaTitles.length, someday: savedNames, loyalty: accounts });
    }
    await log({ items: 0, status: "nothing found", reader });
    return ok({ added: 0 });
  }

  // ---- which trip ----
  // 0. uploaded from inside a trip: that trip
  // 1. a confirmation number already filed in a trip settles it
  const confs = new Set([...read.bookings.map((b) => confKey(b.confirmation)), ...read.costs.map((c) => confKey(c.confirmation))].filter((c) => c.length >= 4));
  const confHit = items.find((e) => confs.has(confKey(e.bconf || "")) || confs.has(confKey(e.cconf || "")));
  let target = trips.find((t) => t.id === chosenTrip) || (confHit ? trips.find((t) => t.id === confHit.trip_id) : undefined);
  let makeNew = false;

  // only the cards the family uses for trips (Travelers \u2192 Trip cards); with none listed, any card counts
  if (read.cardAlert && !read.bookings.length) {
    const digits = (s: string) => (String(s || "").match(/(\d{4,6})\D*$/) || [, ""])[1];
    const allowed = travelers.flatMap((t) => ((t.doc || {}).cards || []) as { last?: string }[]).map((c) => digits(c.last || "")).filter(Boolean);
    if (allowed.length) {
      const mine = (card: string) => { const d = digits(card); return !!d && allowed.some((a) => a.endsWith(d) || d.endsWith(a)); };
      read.costs = read.costs.filter((c) => mine(c.card));
      if (!read.costs.length) return ok({ ignored: "not a trip card" });
    }
  }

  // card purchase alerts cover every purchase: keep a charge only when it was made during a trip (a
  // day either side, for time zones) or Claude ties the merchant to a trip's bookings. A travel
  // charge it can't place waits in To sort; anything else is dropped, and nothing of it is kept.
  if (read.cardAlert && !read.bookings.length && !target) {
    const when = read.costs.find((c) => c.date)?.date || new Date();
    const x = day(when).getTime();
    const during = trips.filter((t) => !t.doc.possible && t.range && x >= day(t.range[0]).getTime() - 86400000 && x <= day(t.range[1]).getTime() + 86400000)
      .sort((a, b) => (a.range![1].getTime() - a.range![0].getTime()) - (b.range![1].getTime() - b.range![0].getTime()))[0];
    const named = read.placement?.decision === "existing" ? trips.find((t) => t.id === read.placement!.tripId) : undefined;
    target = during || named;
    if (!target && !read.costs.some((c) => c.travel)) return ok({ ignored: "not a trip charge" });
    if (!target && read.placement) read.placement.decision = "unsure";
  }

  const dated = read.bookings.map((b) => b.date);
  const first = dated.length ? new Date(Math.min(...dated.map(Number))) : null;
  const last = read.bookings.reduce((a: Date | null, b) => { const e = b.endDate || b.date; return !a || e > a ? e : a; }, first);

  if (!target && read.placement) {
    // 2. Claude's call
    const p = read.placement;
    if (p.decision === "existing") target = trips.find((t) => t.id === p.tripId);
    else if (p.decision === "new" && first) makeNew = true;
  } else if (!target && first) {
    // 3. no Claude: the trip whose dates cover the bookings; otherwise it waits in To sort
    const tol = TOLERANCE_DAYS * 86400000;
    const fits = (t: { range: [Date, Date] | null }, d: Date) => !!t.range && d.getTime() >= t.range[0].getTime() - tol && d.getTime() <= t.range[1].getTime() + tol;
    target = trips.filter((t) => fits(t, first) || fits(t, last!))
      .sort((a, b) => (a.range![1].getTime() - a.range![0].getTime()) - (b.range![1].getTime() - b.range![0].getTime()))[0];
  }

  const dest = read.placement?.place || read.destination || read.bookings.find((b) => b.kind === "Stay")?.place || read.bookings[0]?.place || "";
  const bRows = await bookingRows(hid, read.bookings, target?.doc.place || dest);
  const cRows = await costRows(hid, read.costs);
  const count = bRows.length + cRows.length;

  // ---- not sure: park it for someone to choose the trip in the app ----
  if (!target && !makeNew) {
    const suggestion = {
      decision: read.placement?.decision || "unsure", trip_id: read.placement?.tripId || "", reason: read.placement?.reason || "",
      title: read.placement?.title || (dest ? `Trip to ${dest}` : ""), place: dest,
      dates: first ? rangeLabel(first, last!) : "", planning: first ? day(first) >= day(new Date()) : true,
    };
    const emailId = await log({ items: count, status: "to sort", reader });
    const { error } = await admin.from("inbox_items").insert({
      household_id: hid, subject, sender, summary: read.summary || subject, suggestion, entries: bRows, costs: cRows, status: "open", email_id: emailId,
    });
    if (error) {
      if (emailId) await admin.from("inbound_emails").update({ status: "error: " + error.message }).eq("id", emailId);
      return ok({ error: error.message }, 500);
    }
    return ok({ toSort: count });
  }

  // ---- file it ----
  let tripId: string;
  let tripDoc: Record<string, any>;
  const future = first ? day(first) >= day(new Date()) : false;
  if (target) {
    tripId = target.id; tripDoc = { ...target.doc };
    // trips this inbox started grow to cover new bookings; trips people named keep their dates text
    if (tripDoc.source === "email" && first) {
      const a = target.range ? new Date(Math.min(target.range[0].getTime(), first.getTime())) : first;
      const b = target.range ? new Date(Math.max(target.range[1].getTime(), last!.getTime())) : last!;
      tripDoc.dates = rangeLabel(a, b);
      if (tripDoc.planning) tripDoc.countdown = countdown(a);
    }
    // a booking for a possible trip means it's happening
    if (tripDoc.possible && bRows.length) { tripDoc.possible = false; tripDoc.statusLabel = "Planning"; }
  } else {
    tripId = "u" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    tripDoc = {
      title: read.placement?.title || (dest ? `Trip to ${dest}` : "New trip"), place: dest, dates: rangeLabel(first!, last!),
      grad: GRADIENTS[Math.floor(Math.random() * GRADIENTS.length)], planning: future, countdown: future ? countdown(first!) : undefined,
      statusLabel: future ? "Planning" : "My trip", timelineLabel: "Itinerary", members: [], song: null, source: "email",
    };
  }
  delete tripDoc.id;
  if (!target || tripDoc.dates !== target.doc.dates || tripDoc.possible !== target.doc.possible) {
    const { error: tErr } = await admin.from("trips").upsert({ household_id: hid, id: tripId, doc: JSON.parse(JSON.stringify(tripDoc)), deleted: false }, { onConflict: "household_id,id" });
    if (tErr) { await log({ items: 0, status: "error: " + tErr.message, reader }); return ok({ error: tErr.message }, 500); }
  }

  // A card authorization ("due") and the charge that follows ("paid") are the same money: once the
  // payment is in, the authorization goes, whichever email arrived first.
  const { data: oldCostRows } = await admin.from("entries").select("id, doc").eq("household_id", hid).eq("trip_id", tripId)
    .eq("deleted", false).eq("doc->>type", "cost");
  const oldCosts = (oldCostRows || []) as { id: string; doc: Record<string, any> }[];
  const sameMoney = (a: Record<string, any>, b: Record<string, any>) =>
    Math.abs(Number(a.amount) - Number(b.amount)) < 0.01 && String(a.currency) === String(b.currency);
  const paid = [...oldCosts.map((r) => r.doc), ...cRows.map((r) => r.doc)].filter((d) => d.status === "paid");
  // only costs marked as card authorizations \u2014 equal installments still due are real
  const isAuthorization = (d: Record<string, any>) => d.status === "due" &&
    /authori[sz]/i.test(`${d.title} ${d.note}`) && paid.some((p) => sameMoney(p, d));
  // the same payment reported twice \u2014 a booking email and the card alert for it \u2014 is kept once
  const near = (a: Record<string, any>, b: Record<string, any>) =>
    !!a.date && !!b.date && Math.abs(new Date(a.date).getTime() - new Date(b.date).getTime()) <= 3 * 86400000;
  const already = (d: Record<string, any>) => d.status === "paid" &&
    oldCosts.some((o) => o.id !== d.id && o.doc.status === "paid" && sameMoney(o.doc, d) && near(o.doc, d));
  const keptCosts = cRows.filter((r) => !isAuthorization(r.doc) && !already(r.doc));
  const settled = oldCosts.filter((r) => isAuthorization(r.doc)).map((r) => r.id);
  // A new statement of what's still due on a booking (same confirmation number) already counts the
  // payments made so far, so it replaces the older balances for that booking instead of adding to them.
  const dueKeys = new Set(keptCosts.filter((r) => r.doc.status === "due" && !/authori[sz]/i.test(`${r.doc.title} ${r.doc.note}`))
    .map((r) => `${confKey(r.doc.confirmation)}|${r.doc.currency}`).filter((k) => k.split("|")[0].length >= 4));
  const newIds = new Set(keptCosts.map((r) => r.id));
  const stale = oldCosts.filter((o) => !newIds.has(o.id) && o.doc.status === "due" && !/authori[sz]/i.test(`${o.doc.title} ${o.doc.note}`) &&
    dueKeys.has(`${confKey(o.doc.confirmation)}|${o.doc.currency}`));
  settled.push(...stale.map((o) => o.id));
  if (settled.length) await admin.from("entries").update({ deleted: true }).eq("household_id", hid).in("id", settled);

  // same item forwarded again \u2192 same row id, so it is updated rather than duplicated; keep photos people added
  const all = [...bRows, ...keptCosts];
  const { data: existing } = await admin.from("entries").select("id, doc").eq("household_id", hid).in("id", all.map((r) => r.id));
  const before = new Map(((existing || []) as { id: string; doc: Record<string, any> }[]).map((r) => [r.id, r.doc]));
  const rows = all.map((r) => {
    let doc = { ...r.doc };
    const old = before.get(r.id);
    // a cost someone corrected or marked paid in the app stays as they left it
    if (old && old.edited) doc = old;
    else if (old) {
      // keep photos people added, and when the item first came in
      if (!doc.type && Array.isArray(old.photos)) doc.photos = old.photos;
      if (typeof old.added === "number") doc.added = old.added;
      // a balance that payments have already brought down keeps its running amount
      if (Array.isArray(old.applied) && old.applied.length) { doc.amount = old.amount; doc.note = old.note; doc.applied = old.applied; }
    }
    return { household_id: hid, id: r.id, trip_id: tripId, deleted: false, doc };
  });
  const { error: eErr } = rows.length ? await admin.from("entries").upsert(rows, { onConflict: "household_id,id" }) : { error: null };
  if (eErr) { await log({ items: 0, status: "error: " + eErr.message, reader }); return ok({ error: eErr.message }, 500); }

  // Payments toward a balance: a payment or card authorization for a booking whose balance is due
  // (same confirmation number) settles the balance when the amounts match, or brings it down by that
  // much. `applied` on the balance remembers which payments it took, so reading an email again
  // changes nothing; a charge that only replaces an authorization already taken off isn't taken twice.
  const isAuthDoc = (d: Record<string, any>) => d.status === "due" && /authori[sz]/i.test(`${d.title} ${d.note}`);
  const balances = oldCosts.filter((o) => o.doc.status === "due" && !isAuthDoc(o.doc) && confKey(o.doc.confirmation).length >= 4 &&
    !settled.includes(o.id));
  for (const r of keptCosts) {
    const d = r.doc;
    const k = confKey(d.confirmation);
    if (!(d.status === "paid" || isAuthDoc(d)) || k.length < 4) continue;
    if (d.status === "paid" && oldCosts.some((o) => o.id !== r.id && isAuthDoc(o.doc) && sameMoney(o.doc, d))) continue;
    const b = balances.find((o) => o.id !== r.id && confKey(o.doc.confirmation) === k && String(o.doc.currency) === String(d.currency) &&
      Number(o.doc.amount) + 0.005 >= Number(d.amount) && !(o.doc.applied || []).includes(r.id));
    if (!b) continue;
    const left = Math.round((Number(b.doc.amount) - Number(d.amount)) * 100) / 100;
    if (left < 0.01) {
      await admin.from("entries").update({ deleted: true }).eq("household_id", hid).eq("id", b.id);
      balances.splice(balances.indexOf(b), 1);
    } else {
      const amt = Number(d.amount).toLocaleString("en-US", { style: "currency", currency: String(d.currency || "USD") });
      b.doc = {
        ...b.doc, amount: left, applied: [...(b.doc.applied || []), r.id],
        note: [b.doc.note, `less ${amt} ${d.status === "paid" ? "paid" : "authorized"}${d.date ? " " + d.date : ""}`].filter(Boolean).join(" \u00b7 "),
      };
      await admin.from("entries").update({ doc: b.doc }).eq("household_id", hid).eq("id", b.id);
    }
  }

  await log({ items: count, status: "added", reader, trip_title: tripDoc.title, trip_id: tripId });
  return ok({ added: count, trip: tripDoc.title, tripId });
});
