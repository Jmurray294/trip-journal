import { useRef } from 'react';
import { Plus, TabTrips, TabMap, TabAlbums, TabTravelers } from './Icons.jsx';

// Phone bottom bar: Photos and Dictate for the trip you're in (or the one happening now), always in
// reach, above the section tabs. The trip name opens a picker; inside a trip it's fixed to that trip.
export default function TabBar({ tab, onTrips, onMap, onAlbums, onTravelers, onAdd, capture }) {
  const cls = (t) => 'nav-btn' + (tab === t ? ' active' : '');
  const pick = useRef(null);
  return (
    <nav className="tabbar">
      {capture && capture.trip && (
        <div className="capture">
          <label className={'capture-trip' + (capture.fixed ? ' fixed' : '')}>
            <span className="capture-to">Adding to</span>
            <span className="capture-name">{capture.trip.title}{!capture.fixed && ' ▾'}</span>
            {!capture.fixed && (
              <select value={capture.trip.id} onChange={(e) => capture.onPick(e.target.value)} aria-label="Which trip Photos and Dictate add to">
                {capture.trips.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            )}
          </label>
          <button className="capture-btn press" onClick={() => pick.current && pick.current.click()}>
            <CameraIcon /> Photos
          </button>
          <input ref={pick} type="file" accept="image/*" multiple hidden onChange={(e) => { const f = e.target.files; if (f && f.length) capture.onPhotos([...f]); e.target.value = ''; }} />
          <button className="capture-btn mic-btn press" onClick={capture.onDictate}>
            <MicIcon /> Dictate
          </button>
        </div>
      )}
      <div className="tabbar-row">
        <button className={cls('trips')} onClick={onTrips}><TabTrips /><span>Trips</span></button>
        <button className={cls('map')} onClick={onMap}><TabMap /><span>Map</span></button>
        <button className="fab press" onClick={onAdd} aria-label="Add memory"><Plus size={22} color="#FBF6EC" w={2.4} /></button>
        <button className={cls('albums')} onClick={onAlbums}><TabAlbums /><span>Albums</span></button>
        <button className={cls('travelers')} onClick={onTravelers}><TabTravelers /><span>Travelers</span></button>
      </div>
    </nav>
  );
}

const CameraIcon = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true">
    <path d="M2.5 6.5h3l1.5-2h6l1.5 2h3v9.5h-15z" /><circle cx="10" cy="11" r="3" />
  </svg>
);
const MicIcon = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
    <rect x="7" y="2.5" width="6" height="10" rx="3" /><path d="M4 10a6 6 0 0012 0M10 16v2" />
  </svg>
);
