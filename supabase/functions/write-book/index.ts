// Supabase Edge Function: write a trip's photo book with Claude — title, intro, a chapter per day or
// place, photo captions and a closing, from the family's journal entries, bookings and photos.
// The app sends small copies of the photos (p0, p1, ...); Claude picks the cover and each chapter's
// photos by those ids. Only signed-in family members can call it; requests count toward the same
// daily cap as songs (song_requests).
//
// Secrets: ANTHROPIC_API_KEY, and ANTHROPIC_WORKSPACE_ID when that key is organization-wide.

import Anthropic from "npm:@anthropic-ai/sdk@0.131.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const DAILY_LIMIT = 20;
const MAX_ENTRIES = 80;
const MAX_PHOTOS = 60;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const clip = (v: unknown, n: number) => String(v ?? "").replace(/[ \t]+/g, " ").trim().slice(0, n);

const BOOK_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Book title, 2-6 words" },
    subtitle: { type: "string", description: "One short line under the title, e.g. 'Ten days in Japan, April 2027'" },
    cover_photo: { type: "string", description: "id of the best cover photo (e.g. 'p3'), or empty if there are no photos" },
    intro: { type: "string", description: "Opening, 1-3 short paragraphs separated by a blank line" },
    chapters: {
      type: "array",
      items: {
        type: "object",
        properties: {
          heading: { type: "string", description: "Chapter title, 2-6 words" },
          when: { type: "string", description: "Day or dates, e.g. 'Day 3 · Apr 15' or 'Apr 15–17'" },
          place: { type: "string" },
          story: { type: "string", description: "The chapter, 1-3 paragraphs separated by a blank line, about 80-220 words" },
          hero_photo: { type: "string", description: "id of the photo that opens the chapter, or empty" },
          photos: { type: "array", items: { type: "string" }, description: "ids of the other photos for this chapter, best first" },
        },
        required: ["heading", "when", "place", "story", "hero_photo", "photos"],
        additionalProperties: false,
      },
    },
    captions: {
      type: "array",
      items: {
        type: "object",
        properties: { photo: { type: "string" }, caption: { type: "string", description: "Up to 15 words" } },
        required: ["photo", "caption"],
        additionalProperties: false,
      },
    },
    closing: { type: "string", description: "A short closing, 1-2 paragraphs" },
  },
  required: ["title", "subtitle", "cover_photo", "intro", "chapters", "captions", "closing"],
  additionalProperties: false,
};

// reads ANTHROPIC_API_KEY; an organization-wide key must also name the workspace (ANTHROPIC_WORKSPACE_ID)
const workspace = Deno.env.get("ANTHROPIC_WORKSPACE_ID");
const client = new Anthropic(workspace ? { defaultHeaders: { "anthropic-workspace-id": workspace } } : {});

type Photo = { id?: string; data?: string; entry?: number; label?: string };
type Day = { date?: string; title?: string; place?: string; note?: string; kind?: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  // ---- who is asking ----
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: "Sign in to make a photo book" }, 401);

  const { count: journals } = await supabase.from("household_members")
    .select("household_id", { count: "exact", head: true }).eq("user_id", user.id);
  if (!journals) return json({ error: "Start or join a journal first" }, 403);

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count: used } = await supabase.from("song_requests")
    .select("id", { count: "exact", head: true }).eq("user_id", user.id).gt("created_at", since);
  if ((used ?? 0) >= DAILY_LIMIT) return json({ error: "That's today's limit for AI writing — try again tomorrow" }, 429);

  // ---- the trip ----
  let body: { trip?: { title?: string; place?: string; dates?: string; companions?: string; days?: Day[] }; photos?: Photo[]; bookings?: string[] };
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const t = body.trip ?? {};
  const days = (t.days ?? []).slice(0, MAX_ENTRIES);
  const photos = (body.photos ?? []).filter((p) => p.id && p.data).slice(0, MAX_PHOTOS);
  if (!days.length && !photos.length) return json({ error: "Add some memories or photos first" }, 400);

  const journal = days.map((d, i) => {
    const head = [`#${i}`, clip(d.date, 40), clip(d.kind, 20), clip(d.title, 140), clip(d.place, 120)].filter(Boolean).join(" | ");
    const note = clip(d.note, 2000);
    const pics = photos.filter((p) => p.entry === i).map((p) => p.id + (p.label ? ` ("${clip(p.label, 80)}")` : ""));
    return "- " + head + (note ? "\n  " + note : "") + (pics.length ? "\n  photos: " + pics.join(", ") : "");
  }).join("\n");
  const bookings = (body.bookings ?? []).slice(0, 40).map((b) => "- " + clip(b, 200)).join("\n");

  const content: Record<string, unknown>[] = [];
  for (const p of photos) {
    content.push({ type: "text", text: `Photo ${p.id}` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: String(p.data).replace(/^data:[^,]+,/, "") } });
  }
  content.push({
    type: "text",
    text:
      "Write a printed photo book of this family trip, to be laid out as a landscape hardcover.\n\n" +
      `TRIP: ${clip(t.title, 120)} — ${clip(t.place, 120)}, ${clip(t.dates, 60)}${t.companions ? `, with ${clip(t.companions, 200)}` : ""}\n\n` +
      `JOURNAL (in order; '#n' is the entry, then its photos by id):\n${journal || "(no written entries)"}\n\n` +
      (bookings ? `BOOKINGS (for dates and where we stayed, travelled and ate):\n${bookings}\n\n` : "") +
      "Write in the family's voice ('we'), warm and specific, built from their own notes and what the photos show — real places, " +
      "names, meals and moments. Don't invent events, people or facts that the notes and photos don't support; where an entry is " +
      "thin, keep that chapter short rather than padding it. One chapter per day or per place, in trip order; merge entries that " +
      "belong together. Give each chapter a hero photo and its other photos, using every good photo once; leave out blurry, " +
      "near-duplicate or accidental shots. Caption every photo you use. Plain text only — no markdown, no emoji, no quotation " +
      "marks around titles.",
  });

  await supabase.from("song_requests").insert({ user_id: user.id });

  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      // re-runs on Anthropic's recommended model if a safety classifier declines
      fallbacks: "default",
      system: "You are a travel writer and photo-book designer who turns a family's trip journal and photos into a book they will keep.",
      messages: [{ role: "user", content }],
      output_config: { effort: "medium", format: { type: "json_schema", schema: BOOK_SCHEMA } },
    } as any);

    if (response.stop_reason === "refusal") return json({ error: "Couldn't write this one — try again" }, 422);
    if (response.stop_reason === "max_tokens") return json({ error: "The book ran long — try again" }, 502);

    const text = response.content.filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
    const raw = JSON.parse(text);
    const ids = new Set(photos.map((p) => p.id));
    const pid = (v: unknown) => { const s = clip(v, 12); return ids.has(s) ? s : ""; };
    const used = new Set<string>();
    const take = (v: unknown) => { const s = pid(v); if (!s || used.has(s)) return ""; used.add(s); return s; };

    const cover = pid(raw.cover_photo);
    const chapters = (Array.isArray(raw.chapters) ? raw.chapters : []).slice(0, 60).map((c: Record<string, unknown>) => {
      const hero = take(c.hero_photo);
      return {
        heading: clip(c.heading, 80), when: clip(c.when, 60), place: clip(c.place, 100),
        story: String(c.story ?? "").trim().slice(0, 3000), hero,
        photos: (Array.isArray(c.photos) ? c.photos : []).map(take).filter(Boolean),
      };
    }).filter((c: { heading: string; story: string }) => c.heading || c.story);
    const captions: Record<string, string> = {};
    for (const c of Array.isArray(raw.captions) ? raw.captions : []) { const id = pid(c.photo); if (id) captions[id] = clip(c.caption, 140); }

    return json({
      title: clip(raw.title, 80) || clip(t.title, 80), subtitle: clip(raw.subtitle, 120), cover,
      intro: String(raw.intro ?? "").trim().slice(0, 3000), chapters, captions,
      closing: String(raw.closing ?? "").trim().slice(0, 2000),
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: "The writer is busy — try again in a minute" }, 429);
    if (e instanceof Anthropic.AuthenticationError) return json({ error: "Book writing isn't set up (API key)" }, 500);
    if (e instanceof Anthropic.APIError) return json({ error: `Book writing error (${e.status})` }, 502);
    return json({ error: "Couldn't write the book" }, 500);
  }
});
