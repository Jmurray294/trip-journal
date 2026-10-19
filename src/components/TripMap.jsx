import { useEffect, useRef, useState } from 'react';
import { geoMercator, geoPath, geoGraticule10 } from 'd3-geo';
import { feature } from 'topojson-client';
import { haversineKm } from '../lib/geo.js';

// Real geographic trip map: Natural Earth 1:110m countries projected with d3-geo Mercator.
// The geometry is bundled with the app (and precached), so the map works offline.

const C = {
  ocean: '#BFD9DD', oceanDeep: '#A6C9CF', land: '#E3D6B4', border: 'rgba(42,37,32,0.16)',
  route: '#A4502F', ink: '#2A2520', cream: '#FBF6EC', accent: '#A4502F', pin: '#BE6A47'
};

let landPromise = null;
export function loadLand() {
  if (!landPromise) {
    landPromise = import('world-atlas/countries-110m.json')
      .then((m) => { const topo = m.default || m; return feature(topo, topo.objects.countries); })
      .catch((e) => { landPromise = null; throw e; });
  }
  return landPromise;
}

export default function TripMap({ stops, activeIndex, onSelect }) {
  const hostRef = useRef(null);
  const [land, setLand] = useState(null);
  const [failed, setFailed] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    let live = true;
    loadLand().then((l) => live && setLand(l)).catch(() => live && setFailed(true));
    return () => { live = false; };
  }, []);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pts = stops.filter((s) => typeof s.lon === 'number' && typeof s.lat === 'number');
  const { w, h } = size;

  let note = null;
  if (failed) note = ['Map needs one download', 'Open this once with a signal and the world map is saved for offline use.'];
  else if (!land) note = ['Loading map…', ''];
  else if (!pts.length) note = ['No places pinned yet', 'Add a memory with a place and it will appear here.'];

  let body = null;
  if (!note && w && h) {
    // ---- fit projection to the trip, with a sane minimum span ----
    const lons = pts.map((p) => p.lon), lats = pts.map((p) => p.lat);
    let w0 = Math.min(...lons), e0 = Math.max(...lons), s0 = Math.min(...lats), n0 = Math.max(...lats);
    const spanMax = Math.max(e0 - w0, n0 - s0);
    const padDeg = Math.max(spanMax < 0.6 ? 0.28 : 0.45, spanMax * 0.32);
    w0 -= padDeg; e0 += padDeg; s0 -= padDeg; n0 += padDeg;
    s0 = Math.max(-84, s0); n0 = Math.min(84, n0);
    // MultiPoint, not Polygon: d3 treats polygon winding spherically and a clockwise box fits the globe.
    const bbox = { type: 'MultiPoint', coordinates: [[w0, s0], [e0, s0], [e0, n0], [w0, n0]] };
    const projection = geoMercator().fitExtent([[10, 10], [w - 10, h - 10]], bbox);
    const path = geoPath(projection);

    const activeIds = pts.map((p) => p.index);
    // a selected stop that isn't located yet (e.g. home with no address) highlights nothing
    const activeId = activeIds.includes(activeIndex) ? activeIndex : null;

    const segs = [];
    for (let i = 1; i < pts.length; i++) {
      const a = [pts[i - 1].lon, pts[i - 1].lat], b = [pts[i].lon, pts[i].lat];
      const flight = haversineKm(a, b) > 400;
      const d = path({ type: 'LineString', coordinates: [a, b] });
      if (d) segs.push(<path key={i} d={d} fill="none" stroke={C.route} strokeWidth={flight ? 1.8 : 2.4} strokeDasharray={flight ? '5 4' : undefined} strokeLinecap="round" strokeOpacity={0.85} />);
    }

    // inactive pins first, active last so it sits on top
    let activePin = null;
    const pinEls = [];
    pts.forEach((s, i) => {
      const xy = projection([s.lon, s.lat]);
      if (!xy) return;
      const active = s.index === activeId;
      if (active) activePin = { s, xy };
      let inner;
      if (s.isHome) {
        const r = active ? 17 : 14;
        inner = (<>
          <circle r={r + 2.5} fill={active ? C.accent : C.cream} />
          <circle r={r} fill={C.ink} />
          <path d="M-5.4,0 L0,-5 L5.4,0 L5.4,5.4 L-5.4,5.4 Z" fill="none" stroke={C.cream} strokeWidth={1.5} strokeLinejoin="round" />
        </>);
      } else if (s.photo) {
        const r = active ? 19 : 13;
        inner = (<>
          <clipPath id={'clip' + i}><circle r={r} /></clipPath>
          <circle r={r + 2.5} fill={active ? C.accent : C.cream} />
          <image href={s.photo} x={-r} y={-r} width={r * 2} height={r * 2} clipPath={`url(#clip${i})`} preserveAspectRatio="xMidYMid slice" />
        </>);
      } else {
        const r = active ? 9 : 6;
        inner = (<>
          <circle r={r + 2.5} fill={C.cream} />
          <circle r={r} fill={active ? C.accent : C.pin} />
        </>);
      }
      const g = (
        <g key={'p' + s.index} className="pin" transform={`translate(${xy[0]},${xy[1]})`} onClick={(e) => { e.stopPropagation(); onSelect(s.index); }}>
          <circle r={24} fill="transparent" />
          {inner}
        </g>
      );
      if (active) pinEls.push(g); else pinEls.unshift(g);
    });

    // active label on its own layer so no pin can cover it
    let labelEl = null;
    if (activePin) {
      const { s, xy } = activePin;
      const label = (s.name || '') + (s.date ? '  ·  ' + s.date : '');
      const tw = Math.min(w - 20, label.length * 6.5 + 22);
      const lift = s.isHome ? 30 : s.photo ? 34 : 24;
      const lx = Math.max(tw / 2 + 6, Math.min(w - tw / 2 - 6, xy[0]));
      let ly = xy[1] - lift;
      if (ly < 26) ly = xy[1] + lift + 20;
      // if the label box would sit over another pin, move it
      const hits = (cy) => pts.some((p) => {
        if (p === s) return false;
        const q = projection([p.lon, p.lat]);
        return q && Math.abs(q[1] - cy) < 20 && Math.abs(q[0] - lx) < tw / 2 + 14;
      });
      if (hits(ly)) {
        const alt = xy[1] - lift < 26 ? xy[1] - lift - 4 : xy[1] + lift + 20;
        if (!hits(alt) && alt > 20 && alt < h - 8) ly = alt;
        else ly = Math.max(22, ly - 26);
      }
      labelEl = (
        <g transform={`translate(${lx},${ly})`} pointerEvents="none">
          <rect x={-tw / 2} y={-16} width={tw} height={22} rx={7} fill={C.ink} fillOpacity={0.94} />
          <text x={0} y={-1} textAnchor="middle" fill={C.cream} fontSize={11} fontFamily='"Spline Sans Mono", ui-monospace, monospace'>{label}</text>
        </g>
      );
    }

    body = (
      <svg viewBox={`0 0 ${w} ${h}`} className="trip-map-svg">
        <defs>
          <linearGradient id="og" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={C.ocean} /><stop offset="1" stopColor={C.oceanDeep} />
          </linearGradient>
        </defs>
        <rect x={0} y={0} width={w} height={h} fill="url(#og)" />
        <path d={path(geoGraticule10())} fill="none" stroke="rgba(42,37,32,0.05)" strokeWidth={1} />
        <g>{land.features.map((f, i) => { const d = path(f); return d ? <path key={i} d={d} fill={C.land} stroke={C.border} strokeWidth={0.8} strokeLinejoin="round" /> : null; })}</g>
        <g>{segs}</g>
        <g>{pinEls}</g>
        {labelEl}
      </svg>
    );
  }

  return (
    <div ref={hostRef} className="trip-map">
      {body}
      {note && (
        <div className="trip-map-msg">
          <b>{note[0]}</b>
          {note[1] && <span>{note[1]}</span>}
        </div>
      )}
    </div>
  );
}
