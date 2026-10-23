import { Plus, TabTrips, TabMap, TabAlbums, TabTravelers, People } from './Icons.jsx';
import { accentFor, short } from '../lib/derive.js';
import { statusLabel } from '../screens/FamilySheet.jsx';
import { groupTrips, STAGES } from '../lib/stages.js';

// Desktop navigation (≥900px wide); the tab bar takes over on phones.
export default function Sidebar({ tab, trips, tripId, onTrips, onMap, onAlbums, onTravelers, onAdd, onNewTrip, onOpenTrip, someday = [], onSomeday, family, onFamily }) {
  const cls = (t) => 'side-nav' + (tab === t ? ' active' : '');
  const groups = groupTrips(trips);
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
        <button className={cls('travelers')} onClick={onTravelers}><TabTravelers /><span>Travelers</span></button>
      </nav>

      {STAGES.map(([key, title]) => groups[key].length > 0 && (
        <div key={key} className="side-stage">
          <div className="side-label">{title} <span className="side-count">{groups[key].length}</span></div>
          <div className="side-trips">
            {groups[key].map((t) => (
              <button key={t.id} className={'side-trip' + (tab === 'trips' && tripId === t.id ? ' active' : '')} onClick={() => onOpenTrip(t.id)} title={t.title}>
                <span className="accent-dot" style={{ background: accentFor(t.id) }} />
                <span className="side-trip-name">{short(t.title, 22)}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="side-trips">
        <button className="side-trip side-new" onClick={onNewTrip}><Plus size={12} w={1.8} /> New trip</button>
      </div>

      {someday.length > 0 && (
        <div className="side-stage">
          <div className="side-label">Someday <span className="side-count">{someday.reduce((n, g) => n + g.items.length, 0)}</span></div>
          <div className="side-trips">
            {someday.map((g) => (
              <button key={g.place} className="side-trip" onClick={() => onSomeday(g.place)} title={g.place}>
                <span className="accent-dot" style={{ background: '#6E8B3D' }} />
                <span className="side-trip-name">{short(g.place, 18)}</span>
                <span className="side-count" style={{ marginLeft: 'auto' }}>{g.items.length}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {family.available && (
        <button className="side-family" onClick={onFamily}>
          <People />
          <span className="side-family-text">
            <span>{family.session ? 'Account & sharing' : 'Sign in'}</span>
            <span className={'side-family-sub ' + family.status.state}>
              {family.household ? (statusLabel(family.status) || 'Connecting…') : family.session ? 'Start your journal' : 'Back up & share your trips'}
            </span>
          </span>
        </button>
      )}
    </aside>
  );
}
