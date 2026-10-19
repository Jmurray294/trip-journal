import { geoMercator, geoPath } from 'd3-geo';
import { loadLand } from '../components/TripMap.jsx';
import { src as assetSrc } from './derive.js';
import { ensureMedia } from './media.js';
import { photoByRef } from './book.js';

// Draws photo-book pages onto a canvas. The same code makes the on-screen preview (low dpi) and the
// print files (300 dpi), so what you see is what prints. Measurements are in inches; type in points.

const PAPER = '#FBF6EC', INK = '#2A2520', MUTED = '#7A7060', ACCENT = '#A4502F', SAND = '#D8BE97';
const SERIF = 'Spectral, Georgia, serif', SANS = '"Hanken Grotesk", system-ui, sans-serif', MONO = '"Spline Sans Mono", ui-monospace, monospace';

export async function ensureFonts() {
  if (!document.fonts) return;
  await Promise.all(['600 40px Spectral', '500 20px Spectral', 'italic 500 20px Spectral', '500 20px "Hanken Grotesk"',
    '600 20px "Hanken Grotesk"', '500 20px "Spline Sans Mono"'].map((f) => document.fonts.load(f).catch(() => null)));
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

// ---------- pages ----------
export function drawPage(canvas, page, size, dpi, { trip, images, map, captions = {}, total = 0 }) {
  const b = size.bleed, W = size.w, H = size.h;
  canvas.width = Math.round((W + 2 * b) * dpi);
  canvas.height = Math.round((H + 2 * b) * dpi);
  const ctx = canvas.getContext('2d');
  const X = (i) => (b + i) * dpi, L = (i) => i * dpi, P = (pt) => (pt / 72) * dpi;
  const full = { x: 0, y: 0, w: canvas.width, h: canvas.height };
  const m = 0.6; // safe margin
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, full.w, full.h);
  const img = (ref) => images.get(ref) || null;
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
    const { stops = [], land } = map || {};
    const area = { x: X(m), y: X(m + 0.55), w: L(W - 2 * m), h: L(H - 2 * m - 0.85) };
    line(ctx, 'WHERE WE WENT', X(m), X(m), `500 ${P(9.5)}px ${MONO}`, ACCENT);
    ctx.fillStyle = '#BFD9DD'; ctx.fillRect(area.x, area.y, area.w, area.h);
    if (stops.length) {
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
    textBox(ctx, page.story, { x: X(textX), y: X(y), w: L(textW), h: L(H - y - m - 0.3), font: (s) => `500 ${s}px ${SERIF}`, startPt: 13, minPt: 8.5, lead: 1.5 }, P);
    folio(); return;
  }

  if (page.type === 'photos') {
    const refs = page.photos, g = 0.2, cap = 0.32, top = m, avail = H - 2 * m - 0.2;
    const boxes = [];
    const ww = W - 2 * m;
    if (refs.length === 1) boxes.push([m, top, ww, avail - cap]);
    else if (refs.length === 2) { const w2 = (ww - g) / 2; boxes.push([m, top, w2, avail - cap], [m + w2 + g, top, w2, avail - cap]); }
    else if (refs.length === 3) {
      const wl = ww * 0.6, wr = ww - wl - g, hr = (avail - g - 2 * cap) / 2;
      boxes.push([m, top, wl, avail - cap], [m + wl + g, top, wr, hr], [m + wl + g, top + hr + cap + g, wr, hr]);
    } else {
      const w2 = (ww - g) / 2, h2 = (avail - g - 2 * cap) / 2;
      boxes.push([m, top, w2, h2], [m + w2 + g, top, w2, h2], [m, top + h2 + cap + g, w2, h2], [m + w2 + g, top + h2 + cap + g, w2, h2]);
    }
    refs.forEach((ref, i) => {
      const [bx, by, bw, bh] = boxes[i];
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

// ---------- files ----------
function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

const fileName = (trip, ext) => (String(trip.title || 'trip').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'trip') + '-photo-book.' + ext;

export async function exportBook({ trip, pages, size, images, map, captions, onProgress }) {
  await ensureFonts();
  const dpi = 300;
  const canvas = document.createElement('canvas');
  const opts = { trip, images, map, captions, total: pages.length };
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
