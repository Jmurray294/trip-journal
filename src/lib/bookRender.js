import { geoMercator, geoPath } from 'd3-geo';
import { loadLand } from '../components/TripMap.jsx';
import { src as assetSrc } from './derive.js';
import { ensureMedia } from './media.js';
import { photoByRef } from './book.js';

// Draws photo-book pages onto a canvas. The same code makes the on-screen preview (low dpi) and the
// print files (300 dpi), so what you see is what prints. Measurements are in inches; type in points.
// Two looks: 'scrapbook' (the default — paper, taped-in snapshots, handwritten notes) and 'classic'
// (clean full-bleed photos and serif type).

const PAPER = '#FBF6EC', INK = '#2A2520', MUTED = '#7A7060', ACCENT = '#A4502F', SAND = '#D8BE97';
const SERIF = 'Spectral, Georgia, serif', SANS = '"Hanken Grotesk", system-ui, sans-serif', MONO = '"Spline Sans Mono", ui-monospace, monospace';
const HAND = 'Caveat, "Segoe Print", "Bradley Hand", cursive';

export const STYLES = { scrapbook: 'Scrapbook', classic: 'Classic' };

export async function ensureFonts() {
  if (!document.fonts) return;
  await Promise.all(['600 40px Spectral', '500 20px Spectral', 'italic 500 20px Spectral', '500 20px "Hanken Grotesk"',
    '600 20px "Hanken Grotesk"', '500 20px "Spline Sans Mono"', '500 20px Caveat', '700 20px Caveat'].map((f) => document.fonts.load(f).catch(() => null)));
}

// every image the pages use, loaded (synced photos are downloaded first)
export async function loadImages(trip, pages) {
  const refs = new Set();
  for (const p of pages) { if (p.photo) refs.add(p.photo); for (const r of p.photos || []) refs.add(r); }
  const out = new Map();
  await Promise.all([...refs].map(async (ref) => {
    const ph = photoByRef(trip, ref);
    if (!ph) return;
    const url = ph.src ? assetSrc(ph.src) : await ensureMedia(ph.path);
    if (!url) return;
    const img = new Image();
    img.decoding = 'async';
    await new Promise((res) => { img.onload = res; img.onerror = res; img.src = url; });
    if (img.naturalWidth) out.set(ref, img);
  }));
  return out;
}

// places in trip order, for the map page
export async function mapData(trip) {
  const seen = new Set();
  const stops = (trip.days || []).filter((d) => typeof d.lon === 'number' && typeof d.lat === 'number' && d.place)
    .filter((d) => { const k = d.place.trim().toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .map((d) => ({ name: d.place.trim(), lon: d.lon, lat: d.lat }));
  let land = null;
  try { land = await loadLand(); } catch (e) { /* map page draws without coastlines */ }
  return { stops, land };
}

// ---------- helpers ----------
function cover(ctx, img, x, y, w, h) {
  if (!img) { ctx.fillStyle = SAND; ctx.fillRect(x, y, w, h); return; }
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / s, sh = h / s;
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
}

function wrap(ctx, text, maxW) {
  const lines = [];
  for (const para of String(text || '').split(/\n\s*\n/)) {
    const words = para.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
    }
    if (line) lines.push(line);
    lines.push(''); // paragraph gap
  }
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

// Fit text into a box, shrinking from `startPt` to `minPt`; returns the height used.
function textBox(ctx, text, { x, y, w, h, font, startPt, minPt = 8, lead = 1.45, color = INK, align = 'left' }, P) {
  let size = startPt, lines;
  for (;; size -= 0.5) {
    ctx.font = font(P(size));
    lines = wrap(ctx, text, w);
    const used = lines.reduce((n, l) => n + (l ? 1 : 0.55), 0) * P(size) * lead;
    if (used <= h || size <= minPt) break;
  }
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'top';
  let yy = y;
  const ax = align === 'center' ? x + w / 2 : x;
  for (const l of lines) {
    if (yy + P(size) > y + h + P(size) * 0.2) break;
    if (l) ctx.fillText(l, ax, yy);
    yy += P(size) * lead * (l ? 1 : 0.55);
  }
  ctx.textAlign = 'left';
  return yy - y;
}

function line(ctx, text, x, y, font, color, align = 'left', maxW) {
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'top';
  let t = String(text || '');
  if (maxW) while (t.length > 1 && ctx.measureText(t).width > maxW) t = t.slice(0, -2).trimEnd() + '…';
  ctx.fillText(t, x, y);
  ctx.textAlign = 'left';
}

// where 1-4 photos sit on a photo page (inches): [x, y, w, h], leaving `cap` under each for its caption
function photoBoxes(n, W, H, m, cap) {
  const g = 0.2, top = m, avail = H - 2 * m - 0.2, ww = W - 2 * m;
  if (n === 1) return [[m, top, ww, avail - cap]];
  if (n === 2) { const w2 = (ww - g) / 2; return [[m, top, w2, avail - cap], [m + w2 + g, top, w2, avail - cap]]; }
  if (n === 3) {
    const wl = ww * 0.6, wr = ww - wl - g, hr = (avail - g - 2 * cap) / 2;
    return [[m, top, wl, avail - cap], [m + wl + g, top, wr, hr], [m + wl + g, top + hr + cap + g, wr, hr]];
  }
  const w2 = (ww - g) / 2, h2 = (avail - g - 2 * cap) / 2;
  return [[m, top, w2, h2], [m + w2 + g, top, w2, h2], [m, top + h2 + cap + g, w2, h2], [m + w2 + g, top + h2 + cap + g, w2, h2]];
}

// the trip's stops on a little map, inside `area` (pixels)
function drawMap(ctx, area, map, L, P, bg = '#BFD9DD') {
  const { stops = [], land } = map || {};
  ctx.fillStyle = bg; ctx.fillRect(area.x, area.y, area.w, area.h);
  if (!stops.length) return;
  // fit the stops, padded by at least 1.5° so nearby places don't zoom in to street level
  const lons = stops.map((s) => s.lon), lats = stops.map((s) => s.lat);
  const padDeg = Math.max(1.5, (Math.max(...lons) - Math.min(...lons)) * 0.15);
  const pts = { type: 'MultiPoint', coordinates: [...stops.map((s) => [s.lon, s.lat]),
    [Math.min(...lons) - padDeg, Math.min(...lats) - padDeg], [Math.max(...lons) + padDeg, Math.max(...lats) + padDeg]] };
  const pad = Math.min(area.w, area.h) * 0.08;
  const proj = geoMercator().fitExtent([[area.x + pad, area.y + pad], [area.x + area.w - pad, area.y + area.h - pad]], pts);
  ctx.save(); ctx.beginPath(); ctx.rect(area.x, area.y, area.w, area.h); ctx.clip();
  if (land) {
    const path = geoPath(proj, ctx);
    ctx.beginPath(); path(land); ctx.fillStyle = '#E3D6B4'; ctx.fill();
    ctx.strokeStyle = 'rgba(42,37,32,0.18)'; ctx.lineWidth = Math.max(1, L(0.008)); ctx.stroke();
  }
  const xy = stops.map((s) => proj([s.lon, s.lat]));
  ctx.setLineDash([L(0.06), L(0.05)]); ctx.strokeStyle = ACCENT; ctx.lineWidth = L(0.025);
  ctx.beginPath(); xy.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.stroke(); ctx.setLineDash([]);
  xy.forEach(([px, py], i) => {
    ctx.beginPath(); ctx.arc(px, py, L(0.09), 0, Math.PI * 2); ctx.fillStyle = ACCENT; ctx.fill();
    ctx.lineWidth = L(0.02); ctx.strokeStyle = PAPER; ctx.stroke();
    line(ctx, String(i + 1), px, py - P(4.2), `600 ${P(7)}px ${SANS}`, '#FFFFFF', 'center');
    ctx.font = `600 ${P(10)}px ${SANS}`;
    const tw = ctx.measureText(stops[i].name).width;
    ctx.fillStyle = 'rgba(251,246,236,0.9)'; ctx.fillRect(px + L(0.13), py - P(7), tw + L(0.12), P(14));
    line(ctx, stops[i].name, px + L(0.19), py - P(5.5), `600 ${P(10)}px ${SANS}`, INK);
  });
  ctx.restore();
}

// ---------- pages ----------
export function drawPage(canvas, page, size, dpi, { images, map, captions = {}, style = 'scrapbook' }) {
  const b = size.bleed, W = size.w, H = size.h;
  canvas.width = Math.round((W + 2 * b) * dpi);
  canvas.height = Math.round((H + 2 * b) * dpi);
  const ctx = canvas.getContext('2d');
  const X = (i) => (b + i) * dpi, L = (i) => i * dpi, P = (pt) => (pt / 72) * dpi;
  const img = (ref) => images.get(ref) || null;
  if (style !== 'classic') { scrapbookPage(ctx, page, { W, H, dpi, X, L, P, img, map, captions, cw: canvas.width, ch: canvas.height }); return; }

  const full = { x: 0, y: 0, w: canvas.width, h: canvas.height };
  const m = 0.6; // safe margin
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, full.w, full.h);
  // page number, centred under the text (not on a chapter's photo)
  const folio = () => {
    if (page.n <= 1) return;
    const fx = page.type === 'chapter' && page.photo ? W * 0.75 : W / 2;
    line(ctx, String(page.n), X(fx), X(H - 0.42), `500 ${P(8)}px ${MONO}`, MUTED, 'center');
  };

  if (page.type === 'cover') {
    if (page.photo) cover(ctx, img(page.photo), full.x, full.y, full.w, full.h);
    else { ctx.fillStyle = '#5E7E78'; ctx.fillRect(0, 0, full.w, full.h); }
    const g = ctx.createLinearGradient(0, full.h, 0, full.h * 0.35);
    g.addColorStop(0, 'rgba(26,22,18,0.78)'); g.addColorStop(1, 'rgba(26,22,18,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, full.w, full.h);
    line(ctx, 'A trip journal'.toUpperCase(), X(m + 0.1), X(H - 2.55), `500 ${P(10)}px ${MONO}`, 'rgba(251,246,236,0.85)');
    textBox(ctx, page.title, { x: X(m + 0.1), y: X(H - 2.25), w: L(W * 0.7), h: L(1.2), font: (s) => `600 ${s}px ${SERIF}`, startPt: 54, minPt: 30, lead: 1.05, color: '#FFFFFF' }, P);
    line(ctx, page.subtitle, X(m + 0.1), X(H - 1.0), `500 ${P(15)}px ${SANS}`, 'rgba(255,255,255,0.92)', 'left', L(W - 2 * m));
    line(ctx, page.dates, X(m + 0.1), X(H - 0.7), `500 ${P(10)}px ${MONO}`, 'rgba(255,255,255,0.75)');
    return;
  }

  if (page.type === 'text') {
    line(ctx, String(page.eyebrow || '').toUpperCase(), X(W / 2), X(1.0), `500 ${P(9.5)}px ${MONO}`, ACCENT, 'center');
    textBox(ctx, page.heading, { x: X(1.5), y: X(1.35), w: L(W - 3), h: L(0.9), font: (s) => `600 ${s}px ${SERIF}`, startPt: 30, minPt: 20, lead: 1.1, align: 'center' }, P);
    ctx.fillStyle = ACCENT; ctx.fillRect(X(W / 2 - 0.3), X(2.35), L(0.6), Math.max(1, L(0.02)));
    textBox(ctx, page.body, { x: X(1.9), y: X(2.7), w: L(W - 3.8), h: L(H - 3.5), font: (s) => `500 ${s}px ${SERIF}`, startPt: 14, minPt: 9.5, lead: 1.55, align: 'center' }, P);
    folio(); return;
  }

  if (page.type === 'map') {
    line(ctx, 'WHERE WE WENT', X(m), X(m), `500 ${P(9.5)}px ${MONO}`, ACCENT);
    drawMap(ctx, { x: X(m), y: X(m + 0.55), w: L(W - 2 * m), h: L(H - 2 * m - 0.85) }, map, L, P);
    folio(); return;
  }

  if (page.type === 'chapter') {
    const textX = page.photo ? W / 2 + 0.45 : 1.6, textW = page.photo ? W / 2 - 0.45 - m : W - 3.2;
    if (page.photo) cover(ctx, img(page.photo), 0, 0, X(W / 2), full.h);
    let y = 1.0;
    line(ctx, String(page.when || '').toUpperCase(), X(textX), X(y), `500 ${P(9.5)}px ${MONO}`, ACCENT, 'left', L(textW));
    y += 0.3;
    const hh = textBox(ctx, page.heading, { x: X(textX), y: X(y), w: L(textW), h: L(1.2), font: (s) => `600 ${s}px ${SERIF}`, startPt: 30, minPt: 18, lead: 1.08 }, P);
    y += hh / dpi + 0.08;
    if (page.place) { line(ctx, page.place, X(textX), X(y), `500 ${P(11)}px ${SANS}`, MUTED, 'left', L(textW)); y += 0.3; }
    ctx.fillStyle = ACCENT; ctx.fillRect(X(textX), X(y + 0.05), L(0.5), Math.max(1, L(0.02)));
    y += 0.3;
    const qh = page.quote ? 0.8 : 0;
    textBox(ctx, page.story, { x: X(textX), y: X(y), w: L(textW), h: L(H - y - m - 0.3 - qh), font: (s) => `500 ${s}px ${SERIF}`, startPt: 13, minPt: 8.5, lead: 1.5 }, P);
    if (page.quote) textBox(ctx, '“' + page.quote + '”', { x: X(textX), y: X(H - m - 0.3 - qh + 0.1), w: L(textW), h: L(qh - 0.1), font: (s) => `italic 500 ${s}px ${SERIF}`, startPt: 12, minPt: 8.5, lead: 1.3, color: ACCENT }, P);
    folio(); return;
  }

  if (page.type === 'photos') {
    const refs = page.photos, cap = 0.32;
    photoBoxes(refs.length, W, H, m, cap).forEach(([bx, by, bw, bh], i) => {
      const ref = refs[i];
      cover(ctx, img(ref), X(bx), X(by), L(bw), L(bh));
      const c = captions[ref];
      if (c) textBox(ctx, c, { x: X(bx), y: X(by + bh + 0.08), w: L(bw), h: L(cap - 0.06), font: (s) => `italic 500 ${s}px ${SERIF}`, startPt: 10, minPt: 7.5, lead: 1.2, color: MUTED }, P);
    });
    folio(); return;
  }

  if (page.type === 'glance') {
    line(ctx, 'AT A GLANCE', X(1.2), X(1.0), `500 ${P(9.5)}px ${MONO}`, ACCENT);
    line(ctx, 'How we got there, where we stayed', X(1.2), X(1.3), `600 ${P(24)}px ${SERIF}`, INK);
    let y = 2.1;
    for (const it of page.items) {
      textBox(ctx, it, { x: X(1.2), y: X(y), w: L(W - 2.4), h: L(0.36), font: (s) => `500 ${s}px ${SANS}`, startPt: 11.5, minPt: 8, lead: 1.25 }, P);
      ctx.fillStyle = 'rgba(42,37,32,0.1)'; ctx.fillRect(X(1.2), X(y + 0.36), L(W - 2.4), Math.max(1, L(0.01)));
      y += 0.42;
    }
    folio(); return;
  }

  if (page.type === 'closing') {
    const hasSong = !!page.song;
    const colW = hasSong ? (W - 2 * m - 0.6) / 2 : W - 3.6, x0 = hasSong ? m + 0.2 : 1.8;
    if (page.body) {
      line(ctx, 'HOME AGAIN', X(x0 + colW / 2), X(1.1), `500 ${P(9.5)}px ${MONO}`, ACCENT, 'center');
      textBox(ctx, page.body, { x: X(x0), y: X(1.6), w: L(colW), h: L(H - 2.6), font: (s) => `500 ${s}px ${SERIF}`, startPt: 14, minPt: 9.5, lead: 1.55, align: 'center' }, P);
    }
    if (hasSong) {
      const sx = page.body ? x0 + colW + 0.6 : 1.8, sw = page.body ? colW : W - 3.6;
      ctx.fillStyle = '#EFE7D8'; ctx.fillRect(X(sx - 0.25), X(0.8), L(sw + 0.5), L(H - 1.6));
      line(ctx, 'OUR TRIP SONG', X(sx + sw / 2), X(1.1), `500 ${P(9.5)}px ${MONO}`, ACCENT, 'center');
      line(ctx, page.song.title, X(sx + sw / 2), X(1.4), `600 ${P(20)}px ${SERIF}`, INK, 'center', L(sw));
      textBox(ctx, page.song.lines.join('\n\n'), { x: X(sx), y: X(2.0), w: L(sw), h: L(H - 3.1), font: (s) => `italic 500 ${s}px ${SERIF}`, startPt: 12, minPt: 8, lead: 0.95, color: '#4A433A', align: 'center' }, P);
    }
    folio();
  }
}

// ---------- scrapbook look ----------
const KRAFT = '#C9A77B', CREAM = '#F3EAD6', CARD = '#FFFDF6', STICKY = '#F6E49B', PEN = '#2F3A4A';
const TAPES = ['rgba(222,196,150,0.72)', 'rgba(167,196,186,0.70)', 'rgba(226,170,160,0.68)', 'rgba(200,190,225,0.68)'];
const deg = (a) => (a * Math.PI) / 180;

// the same "random" every time for a page, so the preview matches the print
function rng(seed) {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// paper with a little grain and darker edges
function paperBg(ctx, w, h, dpi, base, seed) {
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  const r = rng(seed), n = Math.round(((w * h) / (dpi * dpi)) * 16);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = r() < 0.6 ? 'rgba(110,80,40,0.09)' : 'rgba(255,255,255,0.28)';
    const s = (0.006 + r() * 0.014) * dpi;
    ctx.fillRect(r() * w, r() * h, s, s);
  }
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(90,60,30,0.14)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}

// a strip of washi tape centred on (x, y) in the current drawing frame, with torn ends
function tape(ctx, x, y, w, h, angle, color) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(deg(angle));
  const teeth = 6, t = h / teeth, z = w * 0.03;
  ctx.beginPath(); ctx.moveTo(-w / 2, -h / 2); ctx.lineTo(w / 2, -h / 2);
  for (let i = 1; i <= teeth; i++) ctx.lineTo(w / 2 - (i % 2 ? z : 0), -h / 2 + i * t);
  ctx.lineTo(-w / 2, h / 2);
  for (let i = teeth - 1; i >= 0; i--) ctx.lineTo(-w / 2 + (i % 2 ? z : 0), -h / 2 + i * t);
  ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  ctx.restore();
}

const shadowOn = (ctx, L) => { ctx.shadowColor = 'rgba(40,28,16,0.32)'; ctx.shadowBlur = L(0.09); ctx.shadowOffsetX = L(0.025); ctx.shadowOffsetY = L(0.045); };
const shadowOff = (ctx) => { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; };

// A piece of paper (card, sticky note, snapshot) centred at (cx, cy) inches, turned `angle` degrees.
// `draw(left, top)` paints its contents in the card's own frame (pixels from the card's centre).
function piece(ctx, S, { cx, cy, w, h, angle = 0, color = CARD, tapes = 0, seed = 1, rule = 0 }, draw) {
  const { X, L } = S, r = rng(seed);
  ctx.save(); ctx.translate(X(cx), X(cy)); ctx.rotate(deg(angle));
  const left = -L(w / 2), top = -L(h / 2);
  shadowOn(ctx, L); ctx.fillStyle = color; ctx.fillRect(left, top, L(w), L(h)); shadowOff(ctx);
  if (rule) { // notebook lines
    ctx.fillStyle = 'rgba(80,120,170,0.22)';
    for (let y = top + L(rule * 2.2); y < -top - L(0.15); y += L(rule)) ctx.fillRect(left + L(0.2), y, L(w - 0.4), Math.max(1, L(0.008)));
  }
  draw && draw(left, top);
  const tw = Math.min(1.25, w * 0.3), th = Math.min(0.36, tw * 0.3);
  if (tapes === 1) tape(ctx, 0, top, L(tw), L(th), -4 + r() * 8, TAPES[Math.floor(r() * TAPES.length)]);
  if (tapes >= 2) {
    tape(ctx, left + L(0.12), top + L(0.08), L(tw), L(th), -40 + r() * 10, TAPES[Math.floor(r() * TAPES.length)]);
    tape(ctx, -left - L(0.12), top + L(0.08), L(tw), L(th), 35 + r() * 10, TAPES[Math.floor(r() * TAPES.length)]);
  }
  ctx.restore();
}

// a printed snapshot with a white border; with a caption the bottom border is deeper and handwritten on
function snapshot(ctx, S, image, { cx, cy, w, h, angle, caption = '', seed, tapes = 2 }) {
  const { L, P } = S, border = Math.max(0.1, Math.min(0.18, w * 0.035)), foot = caption ? Math.max(0.42, h * 0.1) : border;
  piece(ctx, S, { cx, cy, w: w + 2 * border, h: h + border + foot, angle, color: '#FFFEFA', tapes, seed }, (left, top) => {
    cover(ctx, image, left + L(border), top + L(border), L(w), L(h));
    if (caption) textBox(ctx, caption, { x: left + L(border), y: top + L(border + h + 0.05), w: L(w), h: L(foot - 0.08), font: (s) => `500 ${s}px ${HAND}`, startPt: Math.min(20, 10 + w * 2), minPt: 11, lead: 1.0, color: PEN, align: 'center' }, P);
  });
}

// a rubber-stamped date
function stamp(ctx, S, text, x, y, angle) {
  const { X, L, P } = S;
  if (!text) return 0;
  ctx.save();
  ctx.font = `600 ${P(10)}px ${MONO}`;
  const t = String(text).toUpperCase(), tw = Math.min(ctx.measureText(t).width, L(3.6)), pw = tw + L(0.3), ph = P(10) + L(0.18);
  ctx.translate(X(x) + pw / 2, X(y) + ph / 2); ctx.rotate(deg(angle));
  ctx.strokeStyle = 'rgba(164,80,47,0.85)'; ctx.lineWidth = Math.max(1, L(0.018));
  ctx.strokeRect(-pw / 2, -ph / 2, pw, ph);
  ctx.strokeRect(-pw / 2 + L(0.035), -ph / 2 + L(0.035), pw - L(0.07), ph - L(0.07));
  line(ctx, t, 0, -P(5), `600 ${P(10)}px ${MONO}`, 'rgba(164,80,47,0.9)', 'center', tw);
  ctx.restore();
  return ph / L(1);
}

function scrapbookPage(ctx, page, S) {
  const { W, H, dpi, X, L, P, img, map, captions, cw, ch } = S;
  const seed = (page.n || 1) * 7919;
  const r = rng(seed + 3);
  const tilt = (max) => (r() * 2 - 1) * max;
  paperBg(ctx, cw, ch, dpi, page.type === 'cover' ? KRAFT : CREAM, seed);
  const folio = () => { if (page.n > 1) line(ctx, String(page.n), X(W / 2), X(H - 0.4), `600 ${P(14)}px ${HAND}`, MUTED, 'center'); };

  if (page.type === 'cover') {
    const has = !!page.photo;
    if (has) snapshot(ctx, S, img(page.photo), { cx: W * 0.37, cy: H * 0.5, w: W * 0.54, h: H * 0.7, angle: -2.5, seed });
    const lw = has ? W * 0.37 : W * 0.6, lh = has ? H * 0.46 : H * 0.5;
    piece(ctx, S, { cx: has ? W * 0.77 : W / 2, cy: has ? H * 0.56 : H / 2, w: lw, h: lh, angle: has ? 3 : -1.5, tapes: 1, seed: seed + 1 }, (left, top) => {
      const pad = L(0.3), iw = L(lw) - 2 * pad;
      line(ctx, 'A TRIP JOURNAL', 0, top + L(0.35), `500 ${P(9)}px ${MONO}`, ACCENT, 'center');
      textBox(ctx, page.title, { x: left + pad, y: top + L(0.6), w: iw, h: L(lh * 0.45), font: (s) => `700 ${s}px ${HAND}`, startPt: 58, minPt: 26, lead: 0.95, color: PEN, align: 'center' }, P);
      textBox(ctx, page.subtitle, { x: left + pad, y: top + L(0.7 + lh * 0.45), w: iw, h: L(lh * 0.28), font: (s) => `italic 500 ${s}px ${SERIF}`, startPt: 13, minPt: 9, lead: 1.3, color: INK, align: 'center' }, P);
      line(ctx, page.dates, 0, -top - L(0.45), `500 ${P(9)}px ${MONO}`, MUTED, 'center', iw);
    });
    return;
  }

  if (page.type === 'text') {
    piece(ctx, S, { cx: W / 2, cy: H / 2 + 0.05, w: W - 2.4, h: H - 1.4, angle: tilt(1), tapes: 1, seed }, (left, top) => {
      const iw = L(W - 2.4) - L(1.2);
      line(ctx, String(page.eyebrow || '').toUpperCase(), 0, top + L(0.5), `500 ${P(9)}px ${MONO}`, ACCENT, 'center');
      textBox(ctx, page.heading, { x: left + L(0.6), y: top + L(0.8), w: iw, h: L(0.9), font: (s) => `700 ${s}px ${HAND}`, startPt: 40, minPt: 24, lead: 1.0, color: PEN, align: 'center' }, P);
      textBox(ctx, page.body, { x: left + L(0.9), y: top + L(1.9), w: iw - L(0.6), h: L(H - 1.4 - 2.4), font: (s) => `500 ${s}px ${SERIF}`, startPt: 14, minPt: 9.5, lead: 1.55, align: 'center' }, P);
    });
    folio(); return;
  }

  if (page.type === 'map') {
    const cw2 = W - 1.5, ch2 = H - 1.3;
    piece(ctx, S, { cx: W / 2, cy: H / 2, w: cw2, h: ch2, angle: tilt(1.2), tapes: 2, seed }, (left, top) => {
      line(ctx, 'Where we went', left + L(0.35), top + L(0.2), `700 ${P(28)}px ${HAND}`, PEN);
      drawMap(ctx, { x: left + L(0.3), y: top + L(0.85), w: L(cw2 - 0.6), h: L(ch2 - 1.15) }, map, L, P);
    });
    folio(); return;
  }

  if (page.type === 'chapter') {
    const has = !!page.photo;
    if (has) snapshot(ctx, S, img(page.photo), { cx: W * 0.27, cy: H * 0.47, w: W * 0.4, h: H * 0.6, angle: page.ci % 2 ? 2.5 : -2.5, caption: captions[page.photo] || '', seed });
    const x0 = has ? W * 0.53 : 1.8, tw = has ? W - x0 - 0.7 : W - 3.6;
    let y = 0.85;
    y += stamp(ctx, S, page.when, x0, y, tilt(2.5)) + 0.18;
    const hh = textBox(ctx, page.heading, { x: X(x0), y: X(y), w: L(tw), h: L(1.25), font: (s) => `700 ${s}px ${HAND}`, startPt: 42, minPt: 24, lead: 0.98, color: PEN }, P);
    y += hh / dpi + 0.05;
    if (page.place) { line(ctx, page.place, X(x0), X(y), `500 ${P(11)}px ${SANS}`, MUTED, 'left', L(tw)); y += 0.35; }
    const qh = page.quote ? 1.35 : 0;
    textBox(ctx, page.story, { x: X(x0), y: X(y), w: L(tw), h: L(H - y - 0.85 - qh), font: (s) => `500 ${s}px ${SERIF}`, startPt: 12.5, minPt: 8.5, lead: 1.5 }, P);
    if (page.quote) {
      const nw = Math.min(tw, 3.4);
      piece(ctx, S, { cx: x0 + tw - nw / 2, cy: H - 0.8 - qh / 2, w: nw, h: qh - 0.1, angle: 1.5 + tilt(1.5), color: STICKY, tapes: 1, seed: seed + 5 }, (left, top) => {
        textBox(ctx, '“' + page.quote + '”', { x: left + L(0.2), y: top + L(0.2), w: L(nw - 0.4), h: L(qh - 0.45), font: (s) => `500 ${s}px ${HAND}`, startPt: 20, minPt: 11, lead: 1.0, color: PEN, align: 'center' }, P);
      });
    }
    folio(); return;
  }

  if (page.type === 'photos') {
    const refs = page.photos;
    photoBoxes(refs.length, W, H, 0.55, 0).forEach(([bx, by, bw, bh], i) => {
      const ref = refs[i], caption = captions[ref] || '';
      const pad = refs.length === 1 ? 0.35 : 0.22, border = Math.max(0.1, Math.min(0.18, bw * 0.035));
      const foot = caption ? Math.max(0.42, (bh - 2 * pad) * 0.1) : border;
      const w = bw - 2 * pad - 2 * border, h = bh - 2 * pad - border - foot;
      snapshot(ctx, S, img(ref), { cx: bx + bw / 2 + tilt(0.08), cy: by + bh / 2 + tilt(0.06), w, h, angle: tilt(3.5), caption, seed: seed + i * 31, tapes: refs.length > 2 ? 1 : 2 });
    });
    folio(); return;
  }

  if (page.type === 'glance') {
    const gw = W - 2, gh = H - 1.2;
    piece(ctx, S, { cx: W / 2, cy: H / 2, w: gw, h: gh, angle: tilt(1), tapes: 1, seed }, (left, top) => {
      ctx.fillStyle = 'rgba(200,80,70,0.35)'; ctx.fillRect(left + L(0.75), top, Math.max(1, L(0.012)), L(gh));
      line(ctx, 'How we got there, where we stayed', left + L(1.0), top + L(0.35), `700 ${P(26)}px ${HAND}`, PEN, 'left', L(gw - 1.3));
      let y = 1.15;
      for (const it of page.items) {
        textBox(ctx, it, { x: left + L(1.0), y: top + L(y), w: L(gw - 1.4), h: L(0.34), font: (s) => `500 ${s}px ${SANS}`, startPt: 11, minPt: 8, lead: 1.25 }, P);
        ctx.fillStyle = 'rgba(80,120,170,0.25)'; ctx.fillRect(left + L(0.2), top + L(y + 0.36), L(gw - 0.4), Math.max(1, L(0.008)));
        y += 0.42;
      }
    });
    folio(); return;
  }

  if (page.type === 'closing') {
    const song = page.song, body = page.body;
    const colW = song && body ? (W - 2.2) / 2 : W - 3.4;
    if (body) {
      const bx = song ? 0.8 : 1.7;
      line(ctx, 'Home again', X(bx + colW / 2), X(1.0), `700 ${P(34)}px ${HAND}`, PEN, 'center');
      textBox(ctx, body, { x: X(bx + 0.2), y: X(1.85), w: L(colW - 0.4), h: L(H - 2.8), font: (s) => `500 ${s}px ${SERIF}`, startPt: 14, minPt: 9.5, lead: 1.55, align: 'center' }, P);
    }
    if (song) {
      const sw = body ? colW : W - 3.4, sh = H - 1.5, scx = body ? W - 0.8 - sw / 2 : W / 2;
      piece(ctx, S, { cx: scx, cy: H / 2, w: sw, h: sh, angle: 1.5, tapes: 2, seed: seed + 9, rule: 0.3 }, (left, top) => {
        line(ctx, 'OUR TRIP SONG', 0, top + L(0.4), `500 ${P(9)}px ${MONO}`, ACCENT, 'center');
        line(ctx, song.title, 0, top + L(0.65), `700 ${P(26)}px ${HAND}`, PEN, 'center', L(sw - 0.5));
        textBox(ctx, song.lines.join('\n\n'), { x: left + L(0.35), y: top + L(1.35), w: L(sw - 0.7), h: L(sh - 1.7), font: (s) => `500 ${s}px ${HAND}`, startPt: 17, minPt: 10, lead: 0.95, color: PEN, align: 'center' }, P);
      });
    }
    folio();
  }
}

// ---------- files ----------
function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

const fileName = (trip, ext) => (String(trip.title || 'trip').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'trip') + '-photo-book.' + ext;

export async function exportBook({ trip, pages, size, images, map, captions, style, onProgress }) {
  await ensureFonts();
  const dpi = 300;
  const canvas = document.createElement('canvas');
  const opts = { trip, images, map, captions, style, total: pages.length };
  if (size.output === 'images') {
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    for (let i = 0; i < pages.length; i++) {
      onProgress && onProgress(i + 1, pages.length);
      drawPage(canvas, pages[i], size, dpi, opts);
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
      zip.file(`page-${String(i + 1).padStart(2, '0')}.jpg`, blob);
    }
    canvas.width = canvas.height = 0;
    saveBlob(await zip.generateAsync({ type: 'blob' }), fileName(trip, 'zip'));
    return;
  }
  const { jsPDF } = await import('jspdf');
  const pw = size.w + 2 * size.bleed, ph = size.h + 2 * size.bleed;
  const doc = new jsPDF({ orientation: pw >= ph ? 'landscape' : 'portrait', unit: 'in', format: [pw, ph], compress: true });
  for (let i = 0; i < pages.length; i++) {
    onProgress && onProgress(i + 1, pages.length);
    drawPage(canvas, pages[i], size, dpi, opts);
    if (i) doc.addPage([pw, ph], pw >= ph ? 'landscape' : 'portrait');
    doc.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, pw, ph, undefined, 'FAST');
  }
  canvas.width = canvas.height = 0;
  saveBlob(doc.output('blob'), fileName(trip, 'pdf'));
}
