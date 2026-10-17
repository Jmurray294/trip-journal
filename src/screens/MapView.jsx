import { useEffect, useRef, useState } from 'react';
import TripMap from '../components/TripMap.jsx';
import Chips from '../components/Chips.jsx';
import { House, Pencil } from '../components/Icons.jsx';
import { buildStops } from '../lib/geo.js';
import { photoBg, short, src } from '../lib/derive.js';

const STONE = { tone: '#9E9684' };
const TONES = ['#8DA1A8', '#9CA886', '#B5663F', '#BE7A50', '#C9A85C', '#7E8A66', '#6F7E84', '#C7A06E', '#9E9684'];

export default function MapView({ trips, home, sel, onSelectTrip, onSelectStop, onSaveHome }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const carousel = useRef(null);

  const trip = trips.find((t) => t.id === sel.tripId);
  const stops = buildStops(trip, home);
  const geoStops = stops
    .map((s, i) => ({ i, s }))
    .filter(({ s }) => typeof s.lon === 'number' && typeof s.lat === 'number')
    .map(({ i, s }) => ({ index: i, name: s.name, date: s.date, isHome: s.isHome, lon: s.lon, lat: s.lat, photo: s.photo && s.photo.src ? src(s.photo.src) : null }));
  const unplaced = stops.filter((s) => !s.isHome && typeof s.lon !== 'number').map((s) => s.name);
  const homeUnplaced = !!home.home && typeof home.homeLon !== 'number';
  const names = (homeUnplaced ? ['home'] : []).concat(unplaced);

  // keep the selected card in view when a pin is tapped
  useEffect(() => {
    const el = carousel.current && carousel.current.children[sel.stop];
    if (el) el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [sel.stop, sel.tripId]);

  return (
    <div className="screen map-screen">
      <div className="map-head">
        <div className="eyebrow">Where we've been</div>
        <h1 className="title-lg">Trip map</h1>
        <div style={{ marginTop: 15 }}>
          <Chips items={trips.map((t) => ({ id: t.id, label: short(t.title, 13) }))} active={sel.tripId} onSelect={onSelectTrip} />
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
    </div>
  );
}
