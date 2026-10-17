import { Plus, TabTrips, TabMap, TabAlbums } from './Icons.jsx';
import { accentFor, short } from '../lib/derive.js';

// Desktop navigation (≥900px wide); the tab bar takes over on phones.
export default function Sidebar({ tab, trips, tripId, onTrips, onMap, onAlbums, onAdd, onNewTrip, onOpenTrip }) {
  const cls = (t) => 'side-nav' + (tab === t ? ' active' : '');
  return (
    <aside className="sidebar">
      <div className="side-brand">
        <img src={import.meta.env.BASE_URL + 'icons/icon-192.png'} alt="" width="34" height="34" />
        <span>Trip Journal</span>
      </div>

      <button className="side-add press" onClick={onAdd}><Plus size={16} color="#FBF6EC" w={2.2} /> Add memory</button>

      <nav className="side-group">
        <button className={cls('trips')} onClick={onTrips}><TabTrips /><span>Trips</span></button>
        <button className={cls('map')} onClick={onMap}><TabMap /><span>Map</span></button>
        <button className={cls('albums')} onClick={onAlbums}><TabAlbums /><span>Albums</span></button>
      </nav>

      <div className="side-label">Your trips</div>
      <div className="side-trips">
        {trips.map((t) => (
          <button key={t.id} className={'side-trip' + (tab === 'trips' && tripId === t.id ? ' active' : '')} onClick={() => onOpenTrip(t.id)} title={t.title}>
            <span className="accent-dot" style={{ background: accentFor(t.id) }} />
            <span className="side-trip-name">{short(t.title, 22)}</span>
          </button>
        ))}
        <button className="side-trip side-new" onClick={onNewTrip}><Plus size={12} w={1.8} /> New trip</button>
      </div>
    </aside>
  );
}
