// Supabase Edge Function: turn forwarded booking emails into itinerary entries.
// Postmark Inbound posts each email here; the address's "+token" part says which family it's for.
//
// GENERATED index.ts — edit template.ts, then run `node scripts/build-inbound.mjs`
// (that inlines src/lib/parser.js so the app and the server parse confirmations the same way).
//
// Secrets: INBOUND_SECRET (also in the Postmark webhook URL as ?key=...), ANTHROPIC_API_KEY.
// Deploy with "Verify JWT" OFF — Postmark can't sign in; the secret key protects it instead.

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

type Booking = { kind: string; date: Date; endDate: Date | null; title: string; place: string; note: string };

const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const label = (d: Date) => MONTHS[d.getMonth()] + " " + d.getDate();

// "Aug 8–15, 2026" · "Dec 28, 2026 – Jan 3, 2027" · "Aug 2026" → [start, end]
function tripRange(text: string): [Date, Date] | null {
  const s = String(text || "");
  const years = [...s.matchAll(/\b(20\d{2})\b/g)].map((m) => +m[1]);
  const year = years.length ? years[years.length - 1] : new Date().getFullYear();
  const mi = (w: string) => MONTHS.map((m) => m.toLowerCase()).indexOf(w.slice(0, 3).toLowerCase());
  const points: Date[] = [];
  const re = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?!\d)(?:\s*[–—-]\s*(\d{1,2})\b(?!\s*[a-z]))?(?:,?\s*(20\d{2}))?/gi;
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
  const mm = s.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/i);
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
const BOOKINGS_SCHEMA = {
  type: "object",
  properties: {
    destination: { type: "string", description: "Main destination city/area of these bookings, or empty" },
    bookings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["Flight", "Stay", "Car", "Booking"] },
          date: { type: "string", description: "Start date, YYYY-MM-DD" },
          end_date: { type: "string", description: "End date (check-out, drop-off) YYYY-MM-DD, or empty" },
          title: { type: "string" },
          place: { type: "string", description: "City or place name, short" },
          note: { type: "string" },
        },
        required: ["kind", "date", "end_date", "title", "place", "note"],
        additionalProperties: false,
      },
    },
  },
  required: ["destination", "bookings"],
  additionalProperties: false,
};

async function readWithClaude(text: string, subject: string): Promise<{ destination: string; bookings: Booking[] } | null> {
  if (!Deno.env.get("ANTHROPIC_API_KEY")) return null;
  const client = new Anthropic();
  const today = new Date().toISOString().slice(0, 10);
  const response = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: "You extract travel bookings from forwarded confirmation emails for a family's trip journal.",
    messages: [{
      role: "user",
      content:
        `Today is ${today}. List every flight, hotel/rental stay, car rental and other dated reservation ` +
        "(tours, restaurants, tickets) confirmed in this email. Skip marketing, ads and anything not booked. " +
        "Each flight segment is its own booking. Titles: flights like 'United UA1234 · SEA → SFO', stays use the " +
        "property name, cars like 'Hertz car rental'. Notes are one short line, e.g. 'Departs 7:45am · Conf ABC123' " +
        "or 'Check-in Aug 10 · check-out Aug 13 · 3 nights'. Infer missing years from today's date. " +
        "If nothing is booked, return an empty list.\n\n" +
        `SUBJECT: ${subject}\n\nEMAIL:\n${text.slice(0, 30000)}`,
    }],
    output_config: { effort: "low", format: { type: "json_schema", schema: BOOKINGS_SCHEMA } },
  } as any);
  if (response.stop_reason !== "end_turn") return null;
  const raw = response.content.filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
  const parsed = JSON.parse(raw);
  const iso = (s: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "").trim()); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  const bookings: Booking[] = [];
  for (const b of parsed.bookings || []) {
    const date = iso(b.date);
    if (!date || !b.title) continue;
    bookings.push({ kind: b.kind, date, endDate: iso(b.end_date), title: String(b.title).slice(0, 140), place: String(b.place || "").slice(0, 80), note: String(b.note || "").slice(0, 200) });
  }
  return { destination: String(parsed.destination || "").slice(0, 60), bookings };
}

function readWithScanner(text: string): { destination: string; bookings: Booking[] } {
  const found = parseConfirmation(text);
  const bookings = found.filter((f: { sortDate: Date | null }) => f.sortDate).map((f: { kind: string; sortDate: Date; title: string; place: string; note: string }) => ({
    kind: f.kind, date: f.sortDate, endDate: null, title: f.title, place: f.place || "", note: f.note,
  }));
  const stay = bookings.find((b: Booking) => b.kind === "Stay");
  return { destination: stay ? stay.place : "", bookings };
}

// ---- webhook ----
Deno.serve(async (req) => {
  const url = new URL(req.url);
  const secret = Deno.env.get("INBOUND_SECRET");
  if (!secret || url.searchParams.get("key") !== secret) return ok({ error: "forbidden" }, 403);
  if (req.method !== "POST") return ok({ error: "POST only" }, 405);

  let mail: Record<string, any>;
  try { mail = await req.json(); } catch { return ok({ error: "bad json" }, 400); }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  // which family: the +token on the address it was sent to
  const hashes = [mail.MailboxHash, ...((mail.ToFull || []) as { MailboxHash?: string }[]).map((t) => t.MailboxHash), ...((mail.CcFull || []) as { MailboxHash?: string }[]).map((t) => t.MailboxHash)]
    .filter(Boolean).map((h: string) => h.toLowerCase());
  let household: { id: string } | null = null;
  for (const h of hashes) {
    const { data } = await admin.from("households").select("id").eq("inbox_token", h).maybeSingle();
    if (data) { household = data; break; }
  }
  // Answer 200 for unknown addresses so Postmark doesn't keep retrying junk mail.
  if (!household) return ok({ ignored: "unknown address" });

  const sender = String(mail.From || "").slice(0, 200);
  const subject = String(mail.Subject || "").slice(0, 300);
  const text = String(mail.TextBody || "").trim() || htmlToText(String(mail.HtmlBody || ""));
  const log = (fields: Record<string, unknown>) => admin.from("inbound_emails").insert({ household_id: household!.id, sender, subject, ...fields });

  let read: { destination: string; bookings: Booking[] } | null = null;
  let reader = "claude";
  try { read = await readWithClaude(subject + "\n" + text, subject); } catch { read = null; }
  if (!read) { reader = "scanner"; read = readWithScanner(subject + "\n" + text); }
  if (!read.bookings.length) { await log({ items: 0, status: "nothing found", reader }); return ok({ added: 0 }); }

  // ---- pick the trip whose dates cover these bookings, else start one ----
  const { data: tripRows } = await admin.from("trips").select("id, doc").eq("household_id", household.id).eq("deleted", false);
  const trips = (tripRows || []).map((r: { id: string; doc: Record<string, any> }) => ({ id: r.id, doc: r.doc, range: tripRange(r.doc.dates) }));
  const tol = TOLERANCE_DAYS * 86400000;
  const fits = (t: { range: [Date, Date] | null }, d: Date) => !!t.range && d.getTime() >= t.range[0].getTime() - tol && d.getTime() <= t.range[1].getTime() + tol;
  const first = read.bookings.reduce((a, b) => (b.date < a.date ? b : a)).date;
  const last = read.bookings.reduce((a, b) => { const e = b.endDate || b.date; return e > a ? e : a; }, first);

  let trip = trips.filter((t) => fits(t, first) || fits(t, last))
    .sort((a, b) => (a.range![1].getTime() - a.range![0].getTime()) - (b.range![1].getTime() - b.range![0].getTime()))[0];

  let tripDoc: Record<string, any>;
  let tripId: string;
  const future = day(first) >= day(new Date());
  if (trip) {
    tripId = trip.id; tripDoc = { ...trip.doc };
    // trips this inbox started grow to cover new bookings; trips people named keep their dates text
    if (tripDoc.source === "email" && trip.range) {
      const a = new Date(Math.min(trip.range[0].getTime(), first.getTime())), b = new Date(Math.max(trip.range[1].getTime(), last.getTime()));
      tripDoc.dates = rangeLabel(a, b);
      if (tripDoc.planning) tripDoc.countdown = countdown(a);
    }
  } else {
    const dest = read.destination || read.bookings.find((b) => b.kind === "Stay")?.place || read.bookings[0].place || "";
    tripId = "u" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    tripDoc = {
      title: dest ? `Trip to ${dest}` : "New trip", place: dest, dates: rangeLabel(first, last),
      grad: GRADIENTS[Math.floor(Math.random() * GRADIENTS.length)], planning: future, countdown: future ? countdown(first) : undefined,
      statusLabel: future ? "Planning" : "My trip", timelineLabel: "Itinerary", members: [], song: null, source: "email",
    };
  }
  delete tripDoc.id;
  const { error: tErr } = await admin.from("trips").upsert({ household_id: household.id, id: tripId, doc: JSON.parse(JSON.stringify(tripDoc)), deleted: false }, { onConflict: "household_id,id" });
  if (tErr) { await log({ items: 0, status: "error: " + tErr.message, reader }); return ok({ error: tErr.message }, 500); }

  // same booking forwarded twice → same row id, so it's updated rather than duplicated
  const rows = [];
  for (const b of read.bookings) {
    const id = "email-" + await sha([household.id, b.kind, b.title.toLowerCase(), label(b.date), b.date.getFullYear()].join("|"));
    rows.push({
      household_id: household.id, id, trip_id: tripId, deleted: false,
      doc: { date: label(b.date), title: b.title, place: b.place || tripDoc.place || "", note: b.note || "From confirmation email", photos: [], pos: b.date.getTime(), kind: b.kind, source: "email" },
    });
  }
  const { error: eErr } = await admin.from("entries").upsert(rows, { onConflict: "household_id,id" });
  if (eErr) { await log({ items: 0, status: "error: " + eErr.message, reader }); return ok({ error: eErr.message }, 500); }

  await log({ items: rows.length, status: "added", reader, trip_title: tripDoc.title });
  return ok({ added: rows.length, trip: tripDoc.title });
});
