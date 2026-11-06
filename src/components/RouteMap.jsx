import { useState } from 'react';
import TripMap from './TripMap.jsx';
import { awayStops } from '../lib/geo.js';

// The trip's route for followers and guests: country outlines with a pin per place (tap one for its
// name and date). No street detail and no Home pin. Shows nothing until a place has been located.
export default function RouteMap({ days, height = 240 }) {
  const stops = awayStops(days);
  const [active, setActive] = useState(null);
  if (!stops.length) return null;
  return (
    <div className="route-map" style={{ height }}>
      <TripMap stops={stops} activeIndex={active} onSelect={(i) => setActive((a) => (a === i ? null : i))} />
    </div>
  );
}
