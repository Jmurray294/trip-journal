// Supabase Edge Function: write a trip song's lyrics with Claude.
// The Anthropic API key stays here (secret ANTHROPIC_API_KEY); the app sends the trip's entries.
// Only signed-in family members can call it, and each person is capped per day.

import Anthropic from "npm:@anthropic-ai/sdk@0.131.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const DAILY_LIMIT = 20;
const MAX_ENTRIES = 40;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const clip = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

const SONG_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Song title, 1-5 words" },
    mood: { type: "string", description: "Musical style in 2-4 words, e.g. 'Bouncy pop jingle'" },
    lines: { type: "array", items: { type: "string" }, description: "6 to 8 short lyric lines" },
  },
  required: ["title", "mood", "lines"],
  additionalProperties: false,
};

// reads ANTHROPIC_API_KEY; an organization-wide key must also name the workspace (ANTHROPIC_WORKSPACE_ID)
const workspace = Deno.env.get("ANTHROPIC_WORKSPACE_ID");
const client = new Anthropic(workspace ? { defaultHeaders: { "anthropic-workspace-id": workspace } } : {});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  // ---- who is asking ----
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: "Sign in to write songs" }, 401);

  const { count: families } = await supabase.from("household_members")
    .select("household_id", { count: "exact", head: true }).eq("user_id", user.id);
  if (!families) return json({ error: "Join a family journal to write songs" }, 403);

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count: used } = await supabase.from("song_requests")
    .select("id", { count: "exact", head: true }).eq("user_id", user.id).gt("created_at", since);
  if ((used ?? 0) >= DAILY_LIMIT) return json({ error: "That's today's song limit — try again tomorrow" }, 429);

  // ---- the trip ----
  let body: { trip?: { title?: string; place?: string; dates?: string; days?: Record<string, unknown>[] } };
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const t = body.trip ?? {};
  const days = (t.days ?? []).slice(0, MAX_ENTRIES);
  if (days.length < 2) return json({ error: "Add a couple of memories first" }, 400);

  const journal = days.map((d) => {
    const head = [clip(d.date, 40), clip(d.title, 120), clip(d.place, 120)].filter(Boolean).join(" | ");
    const note = clip(d.note, 1000);
    return "- " + head + (note ? "\n  " + note : "");
  }).join("\n");

  const prompt =
    "Write an original, short, funny, catchy jingle from this family travel journal.\n\n" +
    `TRIP: ${clip(t.title, 120)} (${clip(t.place, 120)}, ${clip(t.dates, 60)})\n` +
    `JOURNAL ENTRIES:\n${journal}\n\n` +
    "Make it a catchy, upbeat jingle like a TV ad or a radio station ID: bouncy rhythm, simple rhymes, playful jokes " +
    "about the real places, names and funny moments above (gentle teasing, never mean). " +
    "The kind of thing the family gets stuck in their heads and sings in the car. Open or close on a short hook that repeats. " +
    "6 to 8 short lines, under 30 seconds sung. No verse or chorus labels, no quotation marks, no emoji.";

  await supabase.from("song_requests").insert({ user_id: user.id });

  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      // re-runs on Anthropic's recommended model if a safety classifier declines
      fallbacks: "default",
      system: "You are a jingle writer who turns families' travel journals into short, funny, catchy jingles.",
      messages: [{ role: "user", content: prompt }],
      output_config: { effort: "medium", format: { type: "json_schema", schema: SONG_SCHEMA } },
    } as any);

    if (response.stop_reason === "refusal") return json({ error: "Couldn't write this one — try Rewrite" }, 422);
    if (response.stop_reason === "max_tokens") return json({ error: "The song ran long — try again" }, 502);

    const text = response.content.filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
    const song = JSON.parse(text);
    const lines = (Array.isArray(song.lines) ? song.lines : []).map((l: unknown) => clip(l, 200)).filter(Boolean).slice(0, 18);
    if (lines.length < 4) return json({ error: "The song came back empty — try again" }, 502);

    return json({ title: clip(song.title, 80) || clip(t.title, 80), mood: clip(song.mood, 60) || "Upbeat jingle", lines });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: "Songwriter is busy — try again in a minute" }, 429);
    if (e instanceof Anthropic.AuthenticationError) return json({ error: "Song service isn't set up (API key)" }, 500);
    if (e instanceof Anthropic.APIError) return json({ error: `Song service error (${e.status})` }, 502);
    return json({ error: "Couldn't write the song" }, 500);
  }
});
