// Confirmation-email parser: pasted flight/hotel confirmations -> itinerary entries.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtDate(d) { return MONTHS[d.getMonth()] + ' ' + d.getDate(); }
export function todayLabel() { return fmtDate(new Date()); }

function monthIdx(s) {
  const i = MONTHS.map((m) => m.toLowerCase()).indexOf(s.slice(0, 3).toLowerCase());
  return i < 0 ? null : i;
}

export function findDates(text) {
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

export function findTimes(text) {
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

export function parseConfirmation(raw) {
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
    let route = ''; let dest = '';
    const near = text.slice(Math.max(0, fm.index - 260), fm.index + 320);
    const pair = near.match(/\b([A-Z]{3})\s*(?:–|-|—|to|→)\s*([A-Z]{3})\b/);
    if (pair) { route = pair[1] + ' → ' + pair[2]; dest = pair[2]; }
    else {
      const codes = []; let am;
      const ar = /\(([A-Z]{3})\)/g;
      while ((am = ar.exec(near))) codes.push(am[1]);
      if (codes.length >= 2) { route = codes[0] + ' → ' + codes[1]; dest = codes[1]; }
    }
    const d = dates.find((x) => Math.abs(x.idx - fm.index) < 400) || dates[0];
    const t = times.find((x) => Math.abs(x.idx - fm.index) < 400);
    entries.push({
      kind: 'Flight', sortDate: d ? d.date : null,
      date: d ? fmtDate(d.date) : todayLabel(),
      title: AIRLINES[code] + ' ' + code + num + (route ? ' · ' + route : ''),
      place: dest || 'Flight', // where it lands, not where it leaves from
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
