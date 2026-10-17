// Values derived from trips, never stored.

export const countPhotos = (t) => (t.days || []).reduce((n, d) => n + (d.photos || []).length, 0);
export const countPlaces = (t) => new Set((t.days || []).map((d) => d.place).filter(Boolean)).size;

const ACCENTS = ['#2E7C86', '#BE5F28', '#C0761A', '#6E8B3D', '#A9538C'];
export function accentFor(id) {
  let h = 0; const k = String(id);
  for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}

export const short = (txt, n) => (txt && txt.length > n ? txt.slice(0, n) + '…' : txt || '');

const STRIPE = 'repeating-linear-gradient(135deg, rgba(255,255,255,0.06) 0 7px, rgba(0,0,0,0.05) 7px 14px)';
const SAND = '#D8BE97';

// Seed photos are relative paths served from /public; user photos are data URLs.
export const src = (p) => (p && !p.startsWith('data:') && !p.startsWith('/') && !p.startsWith('http') ? import.meta.env.BASE_URL + p : p);

export function coverBg(t) {
  if (t && t.coverSrc) return { backgroundImage: `url("${src(t.coverSrc)}")`, backgroundSize: 'cover', backgroundPosition: 'center' };
  return { background: STRIPE + ', ' + (t ? t.grad : SAND) };
}

export function photoBg(p) {
  if (p && p.src) return { backgroundImage: `url("${src(p.src)}")`, backgroundSize: 'cover', backgroundPosition: 'center' };
  return { background: STRIPE + ', ' + ((p && p.tone) || SAND) };
}

// The cover photo, else the trip's first photo, for use in image elements.
export function coverPhoto(t) {
  if (t.coverSrc) return src(t.coverSrc);
  for (const d of t.days || []) for (const p of d.photos || []) if (p.src) return src(p.src);
  return null;
}

export const GRADIENTS = [
  'linear-gradient(150deg,#5E7E78,#324F4A)',
  'linear-gradient(150deg,#C56B43,#8C3A22)',
  'linear-gradient(150deg,#C9A85C,#866A34)',
  'linear-gradient(150deg,#8DA1A8,#46585F)',
  'linear-gradient(150deg,#7E8A66,#47533A)'
];
