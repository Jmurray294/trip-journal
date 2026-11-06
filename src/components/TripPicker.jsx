// Pick a trip or a gathering: two labelled groups of chips. `active` is highlighted; `extra` adds
// chips after each group ({ trips: [...], gatherings: [...] } of { id, label }), like "+ New trip".
export default function TripPicker({ trips, active, onPick, disabled, extra = {} }) {
  const groups = [
    ['Gatherings', trips.filter((t) => t.gathering), extra.gatherings || []],
    ['Trips', trips.filter((t) => !t.gathering), extra.trips || []],
  ];
  return (
    <>
      {groups.map(([label, list, more]) => (list.length > 0 || more.length > 0) && (
        <div key={label} className="trip-pick-group">
          <div className="trip-pick-label">{label}</div>
          <div className="chips wrap">
            {list.map((t) => (
              <button key={t.id} className={'chip' + (t.id === active ? ' active' : '')} disabled={disabled} onClick={() => onPick(t.id)}>{t.title}</button>
            ))}
            {more.map((x) => (
              <button key={x.id} className="chip" disabled={disabled} onClick={() => onPick(x.id)}>{x.label}</button>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
