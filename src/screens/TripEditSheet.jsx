import { useEffect, useState } from 'react';
import { GRADIENTS } from '../lib/derive.js';
import { rangeText, datesForEdit } from '../lib/dates.js';
import PlaceMap from '../components/PlaceMap.jsx';
import TripPicker from '../components/TripPicker.jsx';

// Change a trip's or gathering's name, place, dates and cover (and which of the two it is).
// `others` / `onMoveInto`: move everything here into another trip or gathering, and remove this one.
export default function TripEditSheet({ trip, home, onSave, onClose, others = [], onMoveInto }) {
  const [moveTo, setMoveTo] = useState('');
  const [f, setF] = useState({ title: trip.title || '', place: trip.place || '', grad: trip.grad || GRADIENTS[0], gathering: !!trip.gathering });
  const [when, setWhen] = useState(() => datesForEdit(trip.dates));

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const dates = when.typed ? when.text.trim() : rangeText(when.start, when.end);
  const save = () => onSave({ ...f, title: f.title.trim(), place: f.place.trim(), dates: dates || trip.dates || '' });
  const g = f.gathering;

  return (
    <div className="sheet-root">
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={g ? 'Edit gathering' : 'Edit trip'}>
        <div className="grab" />
        <div className="serif" style={{ fontSize: 22, fontWeight: 600 }}>{g ? 'Edit gathering' : 'Edit trip'}</div>
        <div className="order-segs" style={{ marginTop: 10, marginBottom: 6 }}>
          <button className={'seg' + (!g ? ' active' : '')} onClick={() => setF({ ...f, gathering: false })}>Trip</button>
          <button className={'seg' + (g ? ' active' : '')} onClick={() => setF({ ...f, gathering: true })}>Gathering</button>
        </div>

        <div className="field-label" style={{ marginTop: 12 }}>Name</div>
        <input className="field" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <div className="field-label" style={{ marginTop: 16 }}>{g ? 'Where' : 'Place'}</div>
        <input className="field" value={f.place} onChange={(e) => setF({ ...f, place: e.target.value })} placeholder={g ? 'Home' : 'Where to?'} />
        <PlaceMap place={f.place || (g ? 'Home' : '')} home={home} />

        <div className="field-label" style={{ marginTop: 16 }}>{g ? 'Date' : 'Dates'}</div>
        {when.typed ? (
          <>
            <input className="field" value={when.text} onChange={(e) => setWhen({ ...when, text: e.target.value })} placeholder="e.g. Aug 2026, or 2028" />
            <button className="btn-link inline date-switch" onClick={() => setWhen({ ...when, typed: false })}>Pick dates on a calendar</button>
          </>
        ) : (
          <>
            <div className="date-pair">
              <label className="date-field"><span>{g ? 'Day' : 'From'}</span>
                <input className="field" type="date" value={when.start} onChange={(e) => setWhen({ ...when, start: e.target.value, end: when.end && when.end < e.target.value ? '' : when.end })} />
              </label>
              <label className="date-field"><span>{g ? 'Until (optional)' : 'To'}</span>
                <input className="field" type="date" value={when.end} min={when.start || undefined} onChange={(e) => setWhen({ ...when, end: e.target.value })} />
              </label>
            </div>
            {when.start && <div className="date-read">{rangeText(when.start, when.end)}</div>}
            <button className="btn-link inline date-switch" onClick={() => setWhen({ ...when, typed: true, text: when.text || rangeText(when.start, when.end) })}>Not sure yet? Type something like “Aug 2026”</button>
          </>
        )}

        <div className="field-label" style={{ marginTop: 16 }}>Cover</div>
        <div className="swatches">
          {GRADIENTS.map((gr) => (
            <button key={gr} className="swatch" aria-label="Cover colour" onClick={() => setF({ ...f, grad: gr })}
              style={{ background: gr, border: f.grad === gr ? '3px solid #1B3FA8' : '3px solid transparent' }} />
          ))}
        </div>

        <button className="btn-primary press" style={{ marginTop: 22 }} disabled={!f.title.trim()} onClick={save}>Save</button>
        <button className="btn-link" onClick={onClose}>Cancel</button>

        {onMoveInto && others.length > 0 && (
          <div className="move-into">
            <div className="field-label" style={{ marginBottom: 4 }}>Move into another trip or gathering</div>
            <div className="sheet-copy" style={{ marginTop: 0 }}>
              Belongs with something else, like tickets for a gathering? Everything here (bookings, notes, photos, costs and emails) moves there, and {g ? 'this gathering' : 'this trip'} is removed.
            </div>
            <TripPicker trips={others} active={moveTo} onPick={(id) => setMoveTo(id === moveTo ? '' : id)} />
            {moveTo && (
              <button className="btn-secondary press" style={{ marginTop: 14 }} onClick={() => onMoveInto(moveTo)}>
                Move into {(others.find((t) => t.id === moveTo) || {}).title}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
