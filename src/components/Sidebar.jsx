import { Fragment } from 'react';
import { Plus } from './Icons.jsx';
import { accentFor, short } from '../lib/derive.js';
import { groupTrips, STAGES } from '../lib/stages.js';
import { byCountry } from '../lib/someday.js';
import { isGathering, gatheringsInOrder } from '../lib/gathering.js';

// Every trip by stage, plus Someday ideas by country: a card beside the page on a computer (≥900px),
// and with `inline`, the list under the trip up next on a phone's Trips home.
export default function Sidebar({ tab, trips, tripId, onNewTrip, onNewGathering, onOpenTrip, someday = [], onSomeday, inline = false }) {
  // trips by stage; gatherings (get-togethers at home or nearby) have their own list below
  const groups = groupTrips(trips.filter((t) => !isGathering(t)));
  const gatherings = gatheringsInOrder(trips);
  return (
    <aside className={'sidebar' + (inline ? ' inline' : '')}>
      <div className="side-title">Your trips</div>

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

      <div className="side-stage">
        <div className="side-label">Gatherings {gatherings.length > 0 && <span className="side-count">{gatherings.length}</span>}</div>
        <div className="side-trips">
          {gatherings.map(({ t, upcoming }) => (
            <button key={t.id} className={'side-trip' + (tab === 'trips' && tripId === t.id ? ' active' : '') + (upcoming ? '' : ' side-past')} onClick={() => onOpenTrip(t.id)} title={t.title}>
              <span className="accent-dot" style={{ background: '#C9822B' }} />
              <span className="side-trip-name">{short(t.title, 22)}</span>
            </button>
          ))}
          {onNewGathering && <button className="side-trip side-new" onClick={onNewGathering}><Plus size={12} w={1.8} /> New gathering</button>}
        </div>
      </div>

      {someday.length > 0 && (
        <div className="side-stage">
          <button className="side-label side-label-link" onClick={() => onSomeday(null)}>Someday <span className="side-count">{someday.reduce((n, g) => n + g.items.length, 0)}</span></button>
          <div className="side-trips">
            {byCountry(someday).map((c) => (
              <Fragment key={c.country}>
                <button className="side-trip" onClick={() => onSomeday(c.country)} title={c.country}>
                  <span className="accent-dot" style={{ background: '#6E8B3D' }} />
                  <span className="side-trip-name">{short(c.country, 18)}</span>
                  <span className="side-count" style={{ marginLeft: 'auto' }}>{c.count}</span>
                </button>
                {c.places.filter((g) => g.state).map((g) => (
                  <button key={g.place} className="side-trip side-sub" onClick={() => onSomeday(g.place)} title={g.place}>
                    <span className="side-trip-name">{short(g.state, 18)}</span>
                    <span className="side-count" style={{ marginLeft: 'auto' }}>{g.items.length}</span>
                  </button>
                ))}
              </Fragment>
            ))}
          </div>
        </div>
      )}

    </aside>
  );
}
