// Supabase Edge Function: turn forwarded travel emails into itinerary entries and trip costs.
// The Gmail forwarder (supabase/gmail-forwarder.gs) posts each email here; the "+code" in the
// address it was sent to says which family it is for. (Any inbound service posting the same JSON works.)
//
// Each email is read into bookings (flights, stays, cruises, cars, ...), costs (payments, deposits,
// balances due, refunds) and a guess at which trip it belongs to. Confident guesses are filed
// straight into the trip; the rest wait in inbox_items for someone to pick the trip in the app.
//
// GENERATED index.ts — edit template.ts, then run `node scripts/build-inbound.mjs`
// (that inlines src/lib/parser.js so the app and the server parse confirmations the same way).
//
// Secrets: INBOUND_SECRET (also in the forwarder, sent as ?key=...), ANTHROPIC_API_KEY, and
// ANTHROPIC_WORKSPACE_ID when that key is organization-wide rather than scoped to one workspace.
// Deploy with "Verify JWT" OFF — the forwarder cannot sign in; the secret key protects it instead.
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
    const pair = near.match(/\b([A-Z]{3})\s*(?:–|-|—|to|→)\s*([A-Z]{3})\b/);
    if (pair) route = pair[1] + ' → ' + pair[2];
    else {
      const codes = []; let am;
      const ar = /\(([A-Z]{3})\)/g;
      while ((am = ar.exec(near))) codes.push(am[1]);
      if (codes.length >= 2) route = codes[0] + ' → ' + codes[1];
    }
    const d = dates.find((x) => Math.abs(x.idx - fm.index) < 400) || dates[0];
    const t = times.find((x) => Math.abs(x.idx - fm.index) < 400);
    entries.push({
      kind: 'Flight', sortDate: d ? d.date : null,
      date: d ? fmtDate(d.date) : todayLabel(),
      title: AIRLINES[code] + ' ' + code + num + (route ? ' · ' + route : ''),
      place: route || 'Flight',
      note: [t ? 'Departs ' + t.label : '', 'From confirmation email'].filter(Boolean).join(' · ')
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
    if (brandLine && brandLine.length > name.length && !/\d{2}/.test(brandLine)) name = brandLine.replace(/[,•|].*$/, '').trim();
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
      note: parts.join(' · ') || 'From confirmation email'
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


const TOLERANCE_DAYS = 3;
const GRADIENTS = [
  "linear-gradient(150deg,#5E7E78,#324F4A)", "linear-gradient(150deg,#C56B43,#8C3A22)",
  "linear-gradient(150deg,#C9A85C,#866A34)", "linear-gradient(150deg,#8DA1A8,#46585F)",
  "linear-gradient(150deg,#7E8A66,#47533A)",
];

type Booking = {
  kind: string; status: string; date: Date; endDate: Date | null; time: string; title: string;
  provider: string; confirmation: string; place: string; address: string; travelers: string; note: string;
};
type Cost = {
  category: string; title: string; vendor: string; amount: number; currency: string;
  status: string; date: Date | null; confirmation: string; note: string;
};
type Placement = { decision: "existing" | "new" | "unsure"; tripId: string; title: string; place: string; reason: string };
type Idea = { title: string; place: string; dates: string; start: Date | null; end: Date | null; people: string; summary: string; tripId: string };
type Saved = { title: string; place: string; spot: string; note: string; url: string };
type Reading = { summary: string; destination: string; bookings: Booking[]; costs: Cost[]; placement: Placement | null; ideas: Idea[]; someday: Saved[] };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const label = (d: Date) => MONTHS[d.getMonth()] + " " + d.getDate();
const isoDay = (d: Date | null) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "");
const confKey = (s: string) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// "Aug 8–15, 2026" · "Dec 28, 2026 – Jan 3, 2027" · "Aug 2026" → [start, end]
function tripRange(text: string): [Date, Date] | null {
  const s = String(text || "");
  const years = [...s.matchAll(/\b(20\d{2})\b/g)].map((m) => +m[1]);
  const year = years.length ? years[years.length - 1] : new Date().getFullYear();
  const mi = (w: string) => MONTHS.map((m) => m.toLowerCase()).indexOf(w.slice(0, 3).toLowerCase());
  const points: Date[] = [];
  // whole month names or abbreviations only, so "decided" isn't December (same as src/lib/stages.js)
  const month = "\\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\b";
  const re = new RegExp(month + "\\.?\\s+(\\d{1,2})(?!\\d)(?:\\s*[–—-]\\s*(\\d{1,2})\\b(?!\\s*[a-z]))?(?:,?\\s*(20\\d{2}))?", "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const mo = mi(m[1]); const y = m[4] ? +m[4] : year;
    points.push(new Date(y, mo, +m[2]));
    if (m[3]) points.push(new Date(y, mo, +m[3]));
  }
  if (points.length) {
    // a range that wraps the year ("Dec 28 – Jan 3, 2027") puts the start in the previous year
    if (points.length >= 2 && points[0] > points[points.length - 1]) points[0] = new Date(points[0].getFullYear() - 1, points[0].getMonth(), points[0].getDate());
    return [new Date(Math.min(...points.map(Number))), new Date(Math.max(...points.map(Number)))];
  }
  const mm = s.match(new RegExp(month, "i"));
  if (mm) { const mo = mi(mm[1]); return [new Date(year, mo, 1), new Date(year, mo + 1, 0)]; }
  return null;
}

function rangeLabel(a: Date, b: Date) {
  if (a.getTime() === b.getTime()) return `${label(a)}, ${a.getFullYear()}`;
  if (a.getFullYear() !== b.getFullYear()) return `${label(a)}, ${a.getFullYear()} – ${label(b)}, ${b.getFullYear()}`;
  if (a.getMonth() === b.getMonth()) return `${label(a)}–${b.getDate()}, ${b.getFullYear()}`;
  return `${label(a)} – ${label(b)}, ${b.getFullYear()}`;
}

function countdown(start: Date) {
  const days = Math.round((day(start).getTime() - day(new Date()).getTime()) / 86400000);
  if (days <= 0) return "now";
  if (days < 14) return `in ${days} day${days === 1 ? "" : "s"}`;
  if (days < 70) return `in ${Math.round(days / 7)} weeks`;
  return `in ${Math.round(days / 30)} months`;
}

// "7:45am", "19:30", "3 PM" → minutes after midnight, so same-day bookings sort by time
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
          note: { type: "string" },
        },
        required: ["kind", "status", "date", "end_date", "time", "title", "provider", "confirmation", "place", "address", "travelers", "note"],
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
        },
        required: ["category", "title", "vendor", "amount", "currency", "status", "date", "confirmation", "note"],
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
          dates: { type: "string", description: "Dates as known, e.g. 'June 2027', 'Mar 3–10, 2027', or empty" },
          start_date: { type: "string", description: "YYYY-MM-DD if a start date is known, else empty" },
          end_date: { type: "string", description: "YYYY-MM-DD if an end date is known, else empty" },
          people: { type: "string", description: "Who else is proposing or going (names or families), comma separated — not our own family" },
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
          title: { type: "string", description: "What it is, short, e.g. 'Positano cliffside hotels', 'Northern lights in Tromsø', 'Noma'" },
          place: { type: "string", description: "Where, for grouping: the country, or the US state or Canadian province, e.g. 'Italy', 'Alaska'" },
          spot: { type: "string", description: "The particular town, area or venue within it, e.g. 'Amalfi Coast', or empty" },
          note: { type: "string", description: "One or two lines: why it's worth going, best season, who recommended it, rough cost" },
          url: { type: "string", description: "The link it came from, or empty" },
        },
        required: ["title", "place", "spot", "note", "url"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "destination", "bookings", "costs", "trip", "ideas", "someday"],
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

async function readWithClaude(text: string, subject: string, trips: TripBrief[], files: Attachment[] = [], family = "", watched = false, saving = false): Promise<Reading | null> {
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
        (names.length ? `The email's attachments (${names.join(", ")}) come first; they often hold the real details — read them as part of the email.\n\n` : "") +
        "BOOKINGS: list every reservation the email confirms, changes or cancels — flights (each segment separately), " +
        "hotels and rentals, cruises, car rentals, trains, transfers, tours and activities, restaurants, tickets. Titles: flights " +
        "like 'United UA1234 · SEA → SFO', stays use the property name, cruises the line and ship, cars like 'Hertz car rental'. " +
        "Notes are one short line, e.g. 'Departs 7:45am · Conf ABC123' or 'Check-in Aug 10 · check-out Aug 13 · 3 nights'. " +
        "A changed booking is listed once with its new details and status 'changed'; a cancelled one with status 'cancelled'.\n\n" +
        "COSTS: list money paid, owed or refunded — deposits, final payments, receipts, invoices, balances due (with the due date), refunds. " +
        "A confirmation that shows a price is also a cost (status 'paid' if it was charged, 'due' if it is owed). If part was paid and " +
        "a balance remains, give two costs. Payment and receipt emails are costs, not bookings, unless they also confirm a reservation. " +
        "A card authorization that has not been charged yet is 'due', with a note like 'Card authorized'. An itinerary or invoice that " +
        "lists the trip's sailings, flights or hotels is also a source of bookings.\n\n" +
        "TRIP: these are the family's trips (id, title, place, dates, some items already in each):\n" +
        JSON.stringify(trips) + "\n" +
        "Choose 'existing' with its trip_id only when the email clearly belongs to that trip (same destination, cruise or " +
        "itinerary, overlapping dates, or a confirmation number already in it). Choose 'new' when it is a reservation for travel " +
        "that matches none of them, and name the trip. Choose 'unsure' when it could fit more than one trip, or when it is a " +
        "payment or notice you cannot tie to a trip.\n\n" +
        "IDEAS: list trips that are being proposed, planned or discussed but not booked — invitations, 'want to come with us…', " +
        "group trip plans, save-the-dates, a friend's itinerary we might join. One per distinct trip. If an idea is about one of the " +
        "family's trips above (including ones marked possible), give its trip_id so we don't make it twice. Ideas are not bookings: " +
        "list nothing under BOOKINGS for a trip that is only being proposed. " +
        `People are the friends or relatives involved, not us${family ? ` (we are ${family})` : ""}.\n\n` +
        "SOMEDAY: list places and things someone in the family saved as inspiration for a trip one day — a shared article or " +
        "link, a screenshot, a friend's recommendation, a note like 'we should go here' — that aren't part of a trip being planned " +
        "(those are IDEAS) or booked. One per distinct place or thing; group them by country (or US state / Canadian province) " +
        "in place, with the town, area or venue in spot.\n\n" +
        "Skip marketing and travel deals: newsletters and promotions are not inspiration unless someone forwarded one with a note. " +
        "Infer missing years from today's date. If the email has no bookings, no costs, no trip ideas and nothing for someday, return empty lists.\n\n" +
        (watched ? "This email arrived at the family's trips address directly rather than being forwarded on purpose, so it may not be travel. Unless it is " +
          "about the family's own travel (a reservation, a change, a payment, a trip being planned with us, or a place one of us wants to go), return empty lists.\n\n" : "") +
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
      travelers: str(b.travelers, 200), note: str(b.note, 200),
    });
  }
  const costs: Cost[] = [];
  for (const c of p.costs || []) {
    const amount = Math.abs(Number(c.amount));
    if (!isFinite(amount) || amount <= 0 || !c.title) continue;
    costs.push({
      category: c.category, title: str(c.title, 120), vendor: str(c.vendor, 80), amount: Math.round(amount * 100) / 100,
      currency: str(c.currency || "USD", 3).toUpperCase(), status: c.status, date: iso(c.date), confirmation: str(c.confirmation, 40), note: str(c.note, 200),
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
    summary: str(p.summary, 200), destination: str(p.destination, 60), bookings, costs, ideas, someday,
    placement: { decision: t.decision, tripId: str(t.trip_id, 40), title: str(t.new_title, 60), place: str(t.new_place, 60), reason: str(t.reason, 200) },
  };
}

function readWithScanner(text: string): Reading {
  const found = parseConfirmation(text);
  const bookings: Booking[] = found.filter((f: { sortDate: Date | null }) => f.sortDate).map((f: { kind: string; sortDate: Date; title: string; place: string; note: string }) => ({
    kind: f.kind === "Booking" ? "Other" : f.kind, status: "confirmed", date: f.sortDate, endDate: null, time: "", title: f.title,
    provider: "", confirmation: "", place: f.place || "", address: "", travelers: "", note: f.note,
  }));
  const stay = bookings.find((b) => b.kind === "Stay");
  return { summary: "", destination: stay ? stay.place : "", bookings, costs: [], placement: null, ideas: [], someday: [] };
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
    const note = (b.status === "cancelled" ? "Cancelled · " : b.status === "changed" ? "Changed · " : "") +
      (b.note || [b.time && "Starts " + b.time, b.confirmation && "Conf " + b.confirmation].filter(Boolean).join(" · ") || "From confirmation email");
    out.push({
      id,
      doc: {
        id, date: label(b.date), title: b.title, place: b.place || fallbackPlace || "", note, photos: [],
        pos: b.date.getTime() + minutesOf(b.time) * 60000, kind: b.kind, source: "email",
        booking: {
          status: b.status, provider: b.provider, confirmation: b.confirmation, start: isoDay(b.date), end: isoDay(b.endDate),
          time: b.time, address: b.address, travelers: b.travelers,
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
        pos: (c.date || new Date()).getTime(),
      },
    });
  }
  return out;
}

// ---- webhook (the Gmail forwarder, with ?key=) and uploads from the app (a signed-in family member) ----
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  const secret = Deno.env.get("INBOUND_SECRET");
  const fromForwarder = !!secret && url.searchParams.get("key") === secret;
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!fromForwarder && !jwt) return ok({ error: "forbidden" }, 403);
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
    items: items.filter((e) => e.trip_id === t.id).slice(0, 15).map((e) => [e.title, e.bconf || e.cconf].filter(Boolean).join(" · ")),
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
  try { read = await readWithClaude(subject + "\n" + text + previewText, subject, briefs, files, family, watched, saving); } catch (e) {
    read = null;
    reader = "scanner: " + String((e as Error)?.message || e).slice(0, 300);
    console.error("Claude could not read the email:", reader);
  }
  // the scanner would find "bookings" in ordinary mail; the watcher tries again on a later run
  if (!read && watched) return ok({ error: "could not read the email, try later" }, 503);
  if (!read) { if (reader === "claude") reader = "scanner"; read = readWithScanner(subject + "\n" + text); }
  // personal mail that isn't travel: keep nothing, not even a log line
  if (watched && !read.bookings.length && !read.costs.length && !read.ideas.length && !read.someday.length) return ok({ ignored: "not travel" });

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
      doc: { id: nid, date: label(new Date()), title: idea.people ? `Idea from ${idea.people}` : "Trip idea", place: idea.place, note, photos: [], pos: (idea.start || new Date()).getTime() - 60000, source: "email-idea" },
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

  if (!read.bookings.length && !read.costs.length) {
    if (ideaTitles.length || savedNames.length) {
      const names = [...ideaTitles, ...(savedNames.length ? ["Someday"] : [])].join(", ");
      await log({ items: ideaTitles.length + savedNames.length, status: "added", reader, trip_title: names, trip_id: ideaTripId });
      return ok({ added: ideaTitles.length + savedNames.length, trip: ideaTitles.join(", "), tripId: ideaTripId, ideas: ideaTitles.length, someday: savedNames });
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
  // only costs marked as card authorizations — equal installments still due are real
  const isAuthorization = (d: Record<string, any>) => d.status === "due" &&
    /authori[sz]/i.test(`${d.title} ${d.note}`) && paid.some((p) => sameMoney(p, d));
  const keptCosts = cRows.filter((r) => !isAuthorization(r.doc));
  const settled = oldCosts.filter((r) => isAuthorization(r.doc)).map((r) => r.id);
  if (settled.length) await admin.from("entries").update({ deleted: true }).eq("household_id", hid).in("id", settled);

  // same item forwarded again → same row id, so it is updated rather than duplicated; keep photos people added
  const all = [...bRows, ...keptCosts];
  const { data: existing } = await admin.from("entries").select("id, photos:doc->photos").eq("household_id", hid).in("id", all.map((r) => r.id));
  const photos = new Map((existing || []).map((r: { id: string; photos: unknown }) => [r.id, r.photos]));
  const rows = all.map((r) => {
    const doc = { ...r.doc };
    if (!doc.type && Array.isArray(photos.get(r.id))) doc.photos = photos.get(r.id);
    return { household_id: hid, id: r.id, trip_id: tripId, deleted: false, doc };
  });
  const { error: eErr } = rows.length ? await admin.from("entries").upsert(rows, { onConflict: "household_id,id" }) : { error: null };
  if (eErr) { await log({ items: 0, status: "error: " + eErr.message, reader }); return ok({ error: eErr.message }, 500); }

  await log({ items: count, status: "added", reader, trip_title: tripDoc.title, trip_id: tripId });
  return ok({ added: count, trip: tripDoc.title, tripId });
});
