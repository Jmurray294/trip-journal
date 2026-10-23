import { useEffect, useRef, useState } from 'react';
import TripMap from '../components/TripMap.jsx';
import Chips from '../components/Chips.jsx';
import { House, Pencil } from '../components/Icons.jsx';
import { buildStops, tripPoint, geocode, haversineKm, miles } from '../lib/geo.js';
import { photoBg, photoSrc, short, coverBg } from '../lib/derive.js';
import { groupTrips, countdown } from '../lib/stages.js';

const STONE = { tone: '#9E9684' };
const TONES = ['#8DA1A8', '#9CA886', '#B5663F', '#BE7A50', '#C9A85C', '#7E8A66', '#6F7E84', '#C7A06E', '#9E9684'];

// pin colours on the all-trips map, matching the Trips page's section ticks
const KINDS = {
  upcoming: { color: '#C0761A', label: 'Upcoming' },
  past: { color: '#2E7C86', label: 'Been' },
  possible: { color: '#A9538C', label: 'Possible' },
  someday: { color: '#6E8B3D', label: 'Someday' },
};

// Someday places (countries, states) looked up once and kept for the session; the geocoder caches too.
function useSomedaySpots(groups) {
  const [spots, setSpots] = useState({});
  const names = groups.map((g) => g.place).filter((p) => p !== 'Anywhere').join('|');
  useEffect(() => {
    let live = true;
    (async () => {
      for (const p of names ? names.split('|') : []) {
        const k = p.toLowerCase();
        if (spots[k] !== undefined) continue;
        const c = await geocode(p);
        if (!live) return;
        setSpots((s) => ({ ...s, [k]: c }));
        await new Promise((r) => setTimeout(r, 1100));
      }
    })();
    return () => { live = false; };
  }, [names]); // eslint-disable-line react-hooks/exhaustive-deps
  return spots;
}

function AllTrips({ trips, home, someday, active, onSelect, onOpenTrip, onSomeday }) {
  const carousel = useRef(null);
  const spots = useSomedaySpots(someday);
  const g = groupTrips(trips);
  const marks = [];
  const missing = [];
  for (const kind of ['upcoming', 'past', 'possible']) {
    for (const t of g[kind]) {
      const p = tripPoint(t, home);
      if (p) marks.push({ kind, t, lon: p[0], lat: p[1] }); else missing.push(t.title);
    }
  }
  for (const s of someday) {
    const c = spots[s.place.toLowerCase()];
    if (c) marks.push({ kind: 'someday', s, lon: c[0], lat: c[1] });
  }
  // distance from home, as the crow flies
  const hasHome = typeof home.homeLon === 'number' && typeof home.homeLat === 'number';
  const away = (m) => (hasHome ? miles(haversineKm([home.homeLon, home.homeLat], [m.lon, m.lat])) : '');
  const pins = marks.map((m, i) => ({
    index: i, lon: m.lon, lat: m.lat, color: KINDS[m.kind].color, hollow: m.kind === 'someday',
    name: m.t ? m.t.title : m.s.place, date: [m.t ? m.t.dates : `${m.s.items.length} saved`, away(m)].filter(Boolean).join(' · '),
  }));
  if (hasHome) pins.push({ index: -1, lon: home.homeLon, lat: home.homeLat, isHome: true, name: 'Home', date: short(home.home, 28) });
  const counts = Object.fromEntries(Object.keys(KINDS).map((k) => [k, marks.filter((m) => m.kind === k).length]));

  useEffect(() => {
    const el = carousel.current && carousel.current.children[active];
    if (el) el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [active]);

  return (
    <>
      <div className="map-box">
        <TripMap stops={pins} activeIndex={active} onSelect={onSelect} route={false} spokes
          empty={['No trips on the map yet', 'Trips appear here once their place is found — give each trip a place.']} />
      </div>
      <div className="map-legend">
        {Object.entries(KINDS).filter(([k]) => counts[k]).map(([k, v]) => (
          <span key={k} className="map-legend-item">
            <span className={'map-legend-dot' + (k === 'someday' ? ' hollow' : '')} style={{ '--c': v.color }} />{v.label} {counts[k]}
          </span>
        ))}
      </div>
      {missing.length > 0 && (
        <div className="unplaced">Not on the map yet: {missing.slice(0, 3).join(', ')}{missing.length > 3 ? ' and more' : ''} — open with a signal to locate them.</div>
      )}
      {marks.length > 0 && (
        <div className="carousel-wrap">
          <div className="carousel" ref={carousel}>
            {marks.map((m, i) => {
              const on = i === active;
              const k = KINDS[m.kind];
              const sub = m.t
                ? [m.kind === 'upcoming' ? countdown(m.t) : '', m.t.dates].filter(Boolean).join(' · ')
                : `${m.s.items.length} ${m.s.items.length === 1 ? 'idea' : 'ideas'} saved`;
              const dist = away(m);
              return (
                <div key={i} className={'stop-card' + (on ? ' active' : '')} onClick={() => onSelect(i)} role="button" tabIndex={0}>
                  <div className="stop-photo"><div className="fill" style={m.t ? coverBg(m.t) : photoBg({ tone: '#B9C7A0' })} /></div>
                  <div className="stop-day" style={{ color: k.color }}>{k.label}</div>
                  <div className="stop-name">{m.t ? m.t.title : m.s.place}</div>
                  <div className="stop-sub">{sub}</div>
                  {dist && <div className="stop-count">{dist} from home</div>}
                  {on && (
                    <button className="btn-soft-pill press" style={{ marginTop: 10, minHeight: 36 }}
                      onClick={(e) => { e.stopPropagation(); if (m.t) onOpenTrip(m.t.id); else onSomeday(m.s.place); }}>
                      {m.t ? 'See the route' : 'See the ideas'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

export default function MapView({ trips, home, sel, someday = [], onSelectTrip, onSelectStop, onSaveHome, onSomeday }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const carousel = useRef(null);

  const trip = trips.find((t) => t.id === sel.tripId);
  const stops = buildStops(trip, home);
  const geoStops = stops
    .map((s, i) => ({ i, s }))
    .filter(({ s }) => typeof s.lon === 'number' && typeof s.lat === 'number')
    .map(({ i, s }) => ({ index: i, name: s.name, date: s.date, isHome: s.isHome, lon: s.lon, lat: s.lat, photo: photoSrc(s.photo) }));
  const unplaced = stops.filter((s) => !s.isHome && typeof s.lon !== 'number').map((s) => s.name);
  const homeUnplaced = !!home.home && typeof home.homeLon !== 'number';
  const names = (homeUnplaced ? ['home'] : []).concat(unplaced);

  // keep the selected card in view when a pin is tapped
  useEffect(() => {
    const el = carousel.current && carousel.current.children[sel.stop];
    if (el) el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [sel.stop, sel.tripId]);

  const chips = [{ id: 'all', label: 'All trips' }, ...trips.map((t) => ({ id: t.id, label: short(t.title, 13) }))];

  return (
    <div className="screen map-screen">
      <div className="map-head">
        <div className="eyebrow">Where we've been</div>
        <h1 className="title-lg">Trip map</h1>
        <div style={{ marginTop: 15 }}>
          <Chips items={chips} active={trip ? trip.id : 'all'} onSelect={onSelectTrip} />
        </div>

        {!editing ? (
          <button className="home-row press" onClick={() => { setDraft(home.home); setEditing(true); }}>
            <span className="home-disc"><House /></span>
            <span style={{ fontSize: 13, fontWeight: 600, color: home.home ? '#5A5346' : '#A4502F' }}>{home.home ? 'From ' + home.home : 'Set your home address'}</span>
            <Pencil />
          </button>
        ) : (
          <div style={{ marginTop: 13 }}>
            <div className="mono-label" style={{ fontSize: 10, letterSpacing: 1, marginBottom: 7 }}>Home address</div>
            <input className="field" style={{ borderRadius: 12, padding: '11px 13px', fontSize: 14.5 }} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="e.g. Portland, OR" autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') { onSaveHome(draft); setEditing(false); } }} />
            <div className="row-8" style={{ marginTop: 9 }}>
              <button className="btn-primary small press" onClick={() => { onSaveHome(draft); setEditing(false); }}>Save</button>
              <button className="btn-muted press" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {!trip ? (
        <AllTrips trips={trips} home={home} someday={someday} active={sel.stop} onSelect={onSelectStop} onOpenTrip={onSelectTrip} onSomeday={onSomeday} />
      ) : (
        <>
          <div className="map-box">
            <TripMap stops={geoStops} activeIndex={sel.stop} onSelect={onSelectStop} />
          </div>
          {names.length > 0 && (
            <div className="unplaced">Not on the map yet: {names.slice(0, 4).join(', ')}{names.length > 4 ? ' and more' : ''} — open with a signal to locate them.</div>
          )}

          {stops.length > 0 && (
            <div className="carousel-wrap">
              <div className="carousel" ref={carousel}>
                {stops.map((s, i) => {
                  const active = i === sel.stop;
                  return (
                    <div key={i} className={'stop-card' + (active ? ' active' : '')} onClick={() => onSelectStop(i)} role="button" tabIndex={0}>
                      <div className="stop-photo"><div className="fill" style={photoBg(s.photo || (s.isHome ? STONE : { tone: TONES[i % TONES.length] }))} /></div>
                      <div className="stop-day">{s.day}</div>
                      <div className="stop-name">{s.name}</div>
                      <div className="stop-sub">{s.sub}</div>
                      {s.photos.length > 0 && <div className="stop-count">{s.photos.length === 1 ? '1 photo' : s.photos.length + ' photos'}</div>}
                      {active && s.photos.length > 1 && (
                        <div className="stop-strip">
                          {s.photos.slice(0, 8).map((p, j) => <div key={j} className="stop-thumb" style={photoBg(p)} />)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
