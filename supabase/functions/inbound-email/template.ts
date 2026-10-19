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

import Anthropic from "npm:@anthropic-ai/sdk@0.131.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

/*__PARSER__*/

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
type Reading = { summary: string; destination: string; bookings: Booking[]; costs: Cost[]; placement: Placement | null };

const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

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
  },
  required: ["summary", "destination", "bookings", "costs", "trip"],
  additionalProperties: false,
};

type TripBrief = { id: string; title: string; place: string; dates: string; items: string[] };

async function readWithClaude(text: string, subject: string, trips: TripBrief[]): Promise<Reading | null> {
  if (!Deno.env.get("ANTHROPIC_API_KEY")) return null;
  // an organization-wide API key must name the workspace to use (ANTHROPIC_WORKSPACE_ID secret)
  const workspace = Deno.env.get("ANTHROPIC_WORKSPACE_ID");
  const client = new Anthropic(workspace ? { defaultHeaders: { "anthropic-workspace-id": workspace } } : {});
  const today = new Date().toISOString().slice(0, 10);
  const response = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: "You read forwarded travel emails for a family's trip journal: confirmations, changes, cancellations, " +
      "invoices, payment receipts and reminders. You pull out what was booked and what was paid or is owed, and say which of the family's trips it belongs to.",
    messages: [{
      role: "user",
      content:
        `Today is ${today}.\n\n` +
        "BOOKINGS: list every reservation the email confirms, changes or cancels — flights (each segment separately), " +
        "hotels and rentals, cruises, car rentals, trains, transfers, tours and activities, restaurants, tickets. Titles: flights " +
        "like 'United UA1234 · SEA → SFO', stays use the property name, cruises the line and ship, cars like 'Hertz car rental'. " +
        "Notes are one short line, e.g. 'Departs 7:45am · Conf ABC123' or 'Check-in Aug 10 · check-out Aug 13 · 3 nights'. " +
        "A changed booking is listed once with its new details and status 'changed'; a cancelled one with status 'cancelled'.\n\n" +
        "COSTS: list money paid, owed or refunded — deposits, final payments, receipts, invoices, balances due (with the due date), refunds. " +
        "A confirmation that shows a price is also a cost (status 'paid' if it was charged, 'due' if it is owed). If part was paid and " +
        "a balance remains, give two costs. Payment and receipt emails are costs, not bookings, unless they also confirm a reservation.\n\n" +
        "TRIP: these are the family's trips (id, title, place, dates, some items already in each):\n" +
        JSON.stringify(trips) + "\n" +
        "Choose 'existing' with its trip_id only when the email clearly belongs to that trip (same destination, cruise or " +
        "itinerary, overlapping dates, or a confirmation number already in it). Choose 'new' when it is a reservation for travel " +
        "that matches none of them, and name the trip. Choose 'unsure' when it could fit more than one trip, or when it is a " +
        "payment or notice you cannot tie to a trip.\n\n" +
        "Skip marketing and anything not booked or paid. Infer missing years from today's date. If the email has no bookings " +
        "and no costs, return empty lists.\n\n" +
        `SUBJECT: ${subject}\n\nEMAIL:\n${text.slice(0, 60000)}`,
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
  const t = p.trip || {};
  return {
    summary: str(p.summary, 200), destination: str(p.destination, 60), bookings, costs,
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
  return { summary: "", destination: stay ? stay.place : "", bookings, costs: [], placement: null };
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
  // Answer 200 for unknown addresses so the forwarder does not keep retrying junk mail.
  if (!household) return ok({ ignored: "unknown address" });
  const hid = household.id;

  const sender = String(mail.From || "").slice(0, 200);
  const subject = String(mail.Subject || "").slice(0, 300);
  const text = String(mail.TextBody || "").trim() || htmlToText(String(mail.HtmlBody || ""));
  const log = (fields: Record<string, unknown>) =>
    admin.from("inbound_emails").insert({ household_id: hid, sender, subject, body: text.slice(0, 100000), ...fields });

  // ---- the family's trips and what is already in them ----
  const { data: tripRows } = await admin.from("trips").select("id, doc").eq("household_id", hid).eq("deleted", false);
  const trips = (tripRows || []).map((r: { id: string; doc: Record<string, any> }) => ({ id: r.id, doc: r.doc, range: tripRange(r.doc.dates) }));
  const { data: itemRows } = await admin.from("entries")
    .select("id, trip_id, title:doc->>title, bconf:doc->booking->>confirmation, cconf:doc->>confirmation")
    .eq("household_id", hid).eq("deleted", false);
  const items = (itemRows || []) as { id: string; trip_id: string; title: string | null; bconf: string | null; cconf: string | null }[];
  const briefs: TripBrief[] = trips.map((t) => ({
    id: t.id, title: t.doc.title || "", place: t.doc.place || "", dates: t.doc.dates || "",
    items: items.filter((e) => e.trip_id === t.id).slice(0, 15).map((e) => [e.title, e.bconf || e.cconf].filter(Boolean).join(" · ")),
  }));

  let read: Reading | null = null;
  let reader = "claude";
  try { read = await readWithClaude(subject + "\n" + text, subject, briefs); } catch (e) {
    read = null;
    reader = "scanner: " + String((e as Error)?.message || e).slice(0, 300);
    console.error("Claude could not read the email:", reader);
  }
  if (!read) { if (reader === "claude") reader = "scanner"; read = readWithScanner(subject + "\n" + text); }
  if (!read.bookings.length && !read.costs.length) { await log({ items: 0, status: "nothing found", reader }); return ok({ added: 0 }); }

  // ---- which trip ----
  // 1. a confirmation number already filed in a trip settles it
  const confs = new Set([...read.bookings.map((b) => confKey(b.confirmation)), ...read.costs.map((c) => confKey(c.confirmation))].filter((c) => c.length >= 4));
  const confHit = items.find((e) => confs.has(confKey(e.bconf || "")) || confs.has(confKey(e.cconf || "")));
  let target = confHit ? trips.find((t) => t.id === confHit.trip_id) : undefined;
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
    const { error } = await admin.from("inbox_items").insert({
      household_id: hid, subject, sender, summary: read.summary || subject, suggestion, entries: bRows, costs: cRows, status: "open",
    });
    if (error) { await log({ items: 0, status: "error: " + error.message, reader }); return ok({ error: error.message }, 500); }
    await log({ items: count, status: "to sort", reader });
    return ok({ toSort: count });
  }

  // ---- file it ----
  let tripId: string;
  let tripDoc: Record<string, any>;
  const future = first ? day(first) >= day(new Date()) : false;
  if (target) {
    tripId = target.id; tripDoc = { ...target.doc };
    // trips this inbox started grow to cover new bookings; trips people named keep their dates text
    if (tripDoc.source === "email" && target.range && first) {
      const a = new Date(Math.min(target.range[0].getTime(), first.getTime())), b = new Date(Math.max(target.range[1].getTime(), last!.getTime()));
      tripDoc.dates = rangeLabel(a, b);
      if (tripDoc.planning) tripDoc.countdown = countdown(a);
    }
  } else {
    tripId = "u" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    tripDoc = {
      title: read.placement?.title || (dest ? `Trip to ${dest}` : "New trip"), place: dest, dates: rangeLabel(first!, last!),
      grad: GRADIENTS[Math.floor(Math.random() * GRADIENTS.length)], planning: future, countdown: future ? countdown(first!) : undefined,
      statusLabel: future ? "Planning" : "My trip", timelineLabel: "Itinerary", members: [], song: null, source: "email",
    };
  }
  delete tripDoc.id;
  if (!target || tripDoc.dates !== target.doc.dates) {
    const { error: tErr } = await admin.from("trips").upsert({ household_id: hid, id: tripId, doc: JSON.parse(JSON.stringify(tripDoc)), deleted: false }, { onConflict: "household_id,id" });
    if (tErr) { await log({ items: 0, status: "error: " + tErr.message, reader }); return ok({ error: tErr.message }, 500); }
  }

  // same item forwarded again → same row id, so it is updated rather than duplicated; keep photos people added
  const all = [...bRows, ...cRows];
  const { data: existing } = await admin.from("entries").select("id, photos:doc->photos").eq("household_id", hid).in("id", all.map((r) => r.id));
  const photos = new Map((existing || []).map((r: { id: string; photos: unknown }) => [r.id, r.photos]));
  const rows = all.map((r) => {
    const doc = { ...r.doc };
    if (!doc.type && Array.isArray(photos.get(r.id))) doc.photos = photos.get(r.id);
    return { household_id: hid, id: r.id, trip_id: tripId, deleted: false, doc };
  });
  const { error: eErr } = await admin.from("entries").upsert(rows, { onConflict: "household_id,id" });
  if (eErr) { await log({ items: 0, status: "error: " + eErr.message, reader }); return ok({ error: eErr.message }, 500); }

  await log({ items: count, status: "added", reader, trip_title: tripDoc.title, trip_id: tripId });
  return ok({ added: count, trip: tripDoc.title });
});
