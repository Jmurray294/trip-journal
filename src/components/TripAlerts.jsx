import { useEffect, useState } from 'react';
import { geoContains } from 'd3-geo';
import { loadLand } from './TripMap.jsx';
import { tripPoint } from '../lib/geo.js';
import { tripDocAlerts } from '../lib/travelers.js';

const USA = '840'; // ISO numeric id in the bundled world map

// true when the trip's pin is outside the US, false inside, null while unknown (no pin yet, or a
// coastal spot that falls in the sea on the simplified map)
function useInternational(trip, home) {
  const p = tripPoint(trip, home);
  const key = p ? p.join(',') : '';
  const [intl, setIntl] = useState(null);
  useEffect(() => {
    if (!p) { setIntl(null); return undefined; }
    let live = true;
    loadLand().then((land) => {
      const f = land.features.find((x) => geoContains(x, p));
      if (live) setIntl(f ? String(f.id) !== USA : null);
    }).catch(() => {});
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return intl;
}

// Passport, Global Entry and license problems for an upcoming trip, shown under its header.
export default function TripAlerts({ trip, travelers, home, onOpen }) {
  const intl = useInternational(trip, home);
  if (trip.possible || !travelers.length) return null;
  const alerts = tripDocAlerts(trip, travelers, intl);
  if (!alerts.length) return null;
  return (
    <div className="trip-alerts">
      {alerts.map((a, i) => <div key={i} className={'trip-alert ' + a.level}>{a.text}</div>)}
      <button className="btn-link" style={{ width: 'auto', minHeight: 32, marginTop: 4 }} onClick={onOpen}>Open Travelers →</button>
    </div>
  );
}
