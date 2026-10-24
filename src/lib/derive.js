import { mediaUrl } from './media.js';

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

export function money(amount, currency) {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' }).format(amount || 0); }
  catch (e) { return (currency || '') + ' ' + Number(amount || 0).toFixed(2); }
}

// "2027-02-01" → "Feb 1, 2027"
export function dayLabel(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return '';
  return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// A card authorization: approved on the card, waiting to be charged — not a bill to pay.
export const isPending = (c) => !!c && c.status === 'due' && /authori[sz]|pending/i.test(`${c.title || ''} ${c.note || ''}`);

// Paid (net of refunds) and still-due totals per currency, the next payment due (bills only), and
// the charges pending on a card.
export function costTotals(costs) {
  const by = {};
  let nextDue = null;
  const pending = [];
  for (const c of costs || []) {
    const cur = c.currency || 'USD';
    const t = by[cur] || (by[cur] = { currency: cur, paid: 0, due: 0 });
    if (c.status === 'due') {
      t.due += c.amount || 0;
      if (isPending(c)) pending.push(c);
      else if (c.date && (!nextDue || c.date < nextDue.date)) nextDue = c;
    } else if (c.status === 'refund') t.paid -= c.amount || 0;
    else t.paid += c.amount || 0;
  }
  return { totals: Object.values(by), nextDue, pending };
}

const STRIPE = 'repeating-linear-gradient(135deg, rgba(255,255,255,0.06) 0 7px, rgba(0,0,0,0.05) 7px 14px)';
const SAND = '#D8BE97';

// Seed photos are relative paths served from /public; user photos are data URLs.
export const src = (p) => (p && !p.startsWith('data:') && !p.startsWith('/') && !p.startsWith('http') ? import.meta.env.BASE_URL + p : p);

export function coverBg(t) {
  if (t && t.coverSrc) return { backgroundImage: `url("${src(t.coverSrc)}")`, backgroundSize: 'cover', backgroundPosition: 'center' };
  return { background: STRIPE + ', ' + (t ? t.grad : SAND) };
}

// A photo is inline (`src`: data URL or bundled sample) or synced (`path` in family storage).
export const photoSrc = (p) => (!p ? null : p.src ? src(p.src) : mediaUrl(p.path));

export function photoBg(p) {
  const u = photoSrc(p);
  if (u) return { backgroundImage: `url("${u}")`, backgroundSize: 'cover', backgroundPosition: 'center' };
  return { background: STRIPE + ', ' + ((p && p.tone) || SAND) };
}

export const songAudioSrc = (sg) => (!sg ? null : sg.audio || mediaUrl(sg.audioPath));

export const GRADIENTS = [
  'linear-gradient(150deg,#5E7E78,#324F4A)',
  'linear-gradient(150deg,#C56B43,#8C3A22)',
  'linear-gradient(150deg,#C9A85C,#866A34)',
  'linear-gradient(150deg,#8DA1A8,#46585F)',
  'linear-gradient(150deg,#7E8A66,#47533A)'
];
