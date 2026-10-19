// Photo book: the pages, worked out from a trip and its written draft. Pure (no DOM), so it can be tested;
// src/lib/bookRender.js draws them.
//
// A draft (stored on the trip as trip.book.draft) refers to photos by ref: "<entry id>#<photo index>".
// draft = { title, subtitle, cover, intro, chapters: [{ heading, when, place, story, hero, photos: [ref] }],
//           captions: { ref: text }, closing }

// Page sizes in inches. Shutterfly takes page images (no bleed); Lulu and Blurb take a PDF with
// 0.125in bleed on every edge; home printing is a plain letter-size PDF.
export const SIZES = {
  shutterfly: { label: 'Shutterfly · 11 × 8 in', w: 11, h: 8, bleed: 0, output: 'images' },
  lulu: { label: 'Lulu · 11 × 8.5 in', w: 11, h: 8.5, bleed: 0.125, output: 'pdf' },
  blurb: { label: 'Blurb · 10 × 8 in', w: 10, h: 8, bleed: 0.125, output: 'pdf' },
  home: { label: 'Print at home · 11 × 8.5 in', w: 11, h: 8.5, bleed: 0, output: 'pdf' },
};

// fewest pages the printers accept for a hardcover photo book
export const MIN_PAGES = { shutterfly: 20, lulu: 24, blurb: 20, home: 0 };

export const photoRef = (entry, i) => `${entry.id}#${i}`;

// every photo in the trip, in itinerary order
export function collectPhotos(trip) {
  const out = [];
  (trip.days || []).forEach((d, entryIndex) => {
    (d.photos || []).forEach((p, i) => out.push({ ref: photoRef(d, i), photo: p, entryIndex, label: (p.label || '').trim() }));
  });
  return out;
}

export function photoByRef(trip, ref) {
  const [id, i] = String(ref || '').split('#');
  const d = (trip.days || []).find((x) => x.id === id);
  return d && d.photos ? d.photos[Number(i)] || null : null;
}

// itinerary bookings as short lines (for the writer, and the "at a glance" page)
export function bookingLines(trip) {
  return (trip.days || []).filter((d) => d.booking || (d.source === 'email' && d.kind)).map((d) => {
    const b = d.booking || {};
    return [d.kind, d.date, d.title, b.provider && b.provider !== d.title ? b.provider : '', d.place].filter(Boolean).join(' · ');
  });
}

// group a chapter's photos onto pages: 1, 2, 3 or 4 to a page, never leaving a lone photo after a full page
export function chunkPhotos(refs) {
  const out = [];
  let rest = [...refs];
  while (rest.length) {
    const n = rest.length === 4 ? 4 : rest.length >= 5 ? (rest.length === 5 ? 2 : 3) : rest.length;
    out.push(rest.slice(0, n));
    rest = rest.slice(n);
  }
  return out;
}

const located = (trip) => {
  const seen = new Set();
  return (trip.days || []).filter((d) => typeof d.lon === 'number' && typeof d.lat === 'number' && d.place)
    .filter((d) => { const k = d.place.trim().toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
};

export function buildPages(trip, draft) {
  if (!draft) return [];
  const pages = [];
  const exists = (ref) => !!ref && !!photoByRef(trip, ref);
  pages.push({ type: 'cover', title: draft.title || trip.title, subtitle: draft.subtitle || '', dates: trip.dates || '', photo: exists(draft.cover) ? draft.cover : '' });
  if ((draft.intro || '').trim()) pages.push({ type: 'text', eyebrow: trip.place || 'Our trip', heading: draft.title || trip.title, body: draft.intro });
  if (located(trip).length >= 2) pages.push({ type: 'map' });
  (draft.chapters || []).forEach((c, ci) => {
    pages.push({ type: 'chapter', ci, heading: c.heading, when: c.when, place: c.place, story: c.story, photo: exists(c.hero) ? c.hero : '' });
    for (const group of chunkPhotos((c.photos || []).filter(exists))) pages.push({ type: 'photos', ci, photos: group });
  });
  const lines = bookingLines(trip);
  for (let i = 0; i < lines.length; i += 14) pages.push({ type: 'glance', items: lines.slice(i, i + 14) });
  if ((draft.closing || '').trim() || trip.song) {
    pages.push({ type: 'closing', body: draft.closing || '', song: trip.song && trip.song.lines && trip.song.lines.length ? { title: trip.song.title, lines: trip.song.lines } : null });
  }
  return pages.map((p, i) => ({ ...p, n: i + 1 }));
}

// photos the draft doesn't use anywhere (to add back in the editor)
export function unusedPhotos(trip, draft) {
  const used = new Set([draft && draft.cover, ...((draft && draft.chapters) || []).flatMap((c) => [c.hero, ...(c.photos || [])])].filter(Boolean));
  return collectPhotos(trip).filter((p) => !used.has(p.ref));
}

// the writer's answer (photo ids p0, p1, ...) as a stored draft (photo refs)
export function draftFromWriter(answer, sentRefs) {
  const ref = (id) => (id && sentRefs[id]) || '';
  const captions = {};
  for (const [id, text] of Object.entries(answer.captions || {})) if (ref(id)) captions[ref(id)] = text;
  return {
    title: answer.title || '', subtitle: answer.subtitle || '', cover: ref(answer.cover), intro: answer.intro || '',
    chapters: (answer.chapters || []).map((c) => ({
      heading: c.heading || '', when: c.when || '', place: c.place || '', story: c.story || '',
      hero: ref(c.hero), photos: (c.photos || []).map(ref).filter(Boolean),
    })),
    captions, closing: answer.closing || '', written: Date.now(),
  };
}
