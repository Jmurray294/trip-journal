import { useEffect, useState } from 'react';
import { geocode } from '../lib/geo.js';

// A small street map of a place or address, with a pin and a link to open it in a maps app.
// "Home" means the family's home base (home.home, with its saved coordinates).
export function resolvePlace(place, home) {
  const p = String(place || '').trim();
  if (/^home$/i.test(p) && home && home.home) {
    return { query: home.home, label: home.home, c: typeof home.homeLon === 'number' ? [home.homeLon, home.homeLat] : null };
  }
  return { query: p, label: p, c: null };
}

export default function PlaceMap({ place, home, height = 170 }) {
  const { query, label, c: known } = resolvePlace(place, home);
  const [c, setC] = useState(known);
  const [missing, setMissing] = useState(false);

  // look the place up a moment after typing stops
  useEffect(() => {
    setMissing(false);
    if (known) { setC(known); return undefined; }
    if (query.length < 3 || /^home$/i.test(query)) { setC(null); return undefined; }
    let live = true;
    const t = setTimeout(async () => {
      const r = await geocode(query);
      if (!live) return;
      setC(r); setMissing(!r);
    }, 700);
    return () => { live = false; clearTimeout(t); };
  }, [query, known && known.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  if (/^home$/i.test(query)) return <div className="place-map-note">Set your home address under Map to see it here.</div>;
  if (missing) return <div className="place-map-note">Couldn’t find that on the map. A street address or a town works best.</div>;
  if (!c) return null;
  const [lon, lat] = c, d = 0.006;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${lon - d * 1.6},${lat - d},${lon + d * 1.6},${lat + d}&layer=mapnik&marker=${lat},${lon}`;
  const open = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  return (
    <div className="place-map">
      <iframe title={'Map of ' + label} src={src} style={{ height }} loading="lazy" />
      <a className="place-map-open" href={open} target="_blank" rel="noreferrer">{label} · Open in Maps ›</a>
    </div>
  );
}
