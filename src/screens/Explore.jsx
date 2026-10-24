import { useState } from 'react';
import { Plus } from '../components/Icons.jsx';
import { stopsOf, placeKey } from '../lib/explore.js';

// The trip page's Explore tab: for each stop, what to see, do and eat and what to know, from Claude
// with a web search, fitted to the dates, what's booked there and the travelers' preferences.

const KINDS = [['see', 'See'], ['do', 'Do'], ['eat', 'Eat'], ['know', 'Know']];
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return 'link'; } };

function Stop({ stop, data, busy, onAsk, onAdd, onDismiss }) {
  const [asking, setAsking] = useState(false);
  const [focus, setFocus] = useState('');
  const items = ((data && data.items) || []).filter((i) => i.status !== 'dismissed');
  const ask = (f) => { onAsk(stop.place, f); setAsking(false); setFocus(''); };
  return (
    <section className="ex-stop">
      <div className="ex-head">
        <div className="grow">
          <div className="ex-place">{stop.place}</div>
          {stop.dates.length > 0 && <div className="ex-dates">{stop.dates.join(' · ')}</div>}
        </div>
        {!busy && !data && <button className="btn-soft-pill press" onClick={() => ask('')}>Get suggestions</button>}
        {!busy && data && !asking && <button className="btn-soft-pill press" onClick={() => setAsking(true)}><Plus size={13} w={1.8} /> More</button>}
      </div>

      {busy && <div className="ex-busy"><span className="spin-sm" /> Looking up {stop.place} — this takes about a minute…</div>}

      {asking && !busy && (
        <div className="ex-ask">
          <input className="field" value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Anything in particular? e.g. more food, a rainy day, gardens"
            onKeyDown={(e) => { if (e.key === 'Enter') ask(focus); }} autoFocus />
          <div className="row-8" style={{ marginTop: 8 }}>
            <button className="btn-muted press" onClick={() => setAsking(false)}>Cancel</button>
            <button className="btn-primary small press" onClick={() => ask(focus)}>Suggest more</button>
          </div>
        </div>
      )}

      {data && data.summary && <div className="ex-summary">{data.summary}</div>}

      {KINDS.map(([k, label]) => {
        const list = items.filter((i) => i.kind === k);
        if (!list.length) return null;
        return (
          <div key={k} className="ex-group">
            <div className={'ex-kind ' + k}>{label}</div>
            {list.map((i) => (
              <div key={i.id} className="ex-item">
                <div className="grow">
                  <div className="ex-title">{i.title}</div>
                  {i.why && <div className="ex-why">{i.why}</div>}
                  {(i.when || i.where) && <div className="ex-meta">{[i.when, i.where].filter(Boolean).join(' · ')}</div>}
                  <div className="ex-actions">
                    {i.url && <a className="someday-link" href={i.url} target="_blank" rel="noopener noreferrer">{host(i.url)} ↗</a>}
                    {k !== 'know' && (i.status === 'added'
                      ? <span className="ex-added">✓ In the itinerary</span>
                      : <button className="ex-add press" onClick={() => onAdd(stop, i)}>+ Add to itinerary</button>)}
                  </div>
                </div>
                <button className="thumb-x static" onClick={() => onDismiss(stop.place, i.id)} aria-label={'Not for us: ' + i.title}><span>×</span></button>
              </div>
            ))}
          </div>
        );
      })}
    </section>
  );
}

export default function Explore({ trip, signedIn, busy, onAsk, onAdd, onDismiss }) {
  if (!signedIn) return <div className="section-empty"><div className="empty-sub">Sign in to get suggestions for this trip.</div></div>;
  const stops = stopsOf(trip);
  if (!stops.length) return <div className="section-empty"><div className="empty-sub">Give the trip a place, or add bookings, to get suggestions for each stop.</div></div>;
  const all = trip.suggestions || {};
  return (
    <div className="stack-16">
      <div className="ex-intro">Things to see, do and eat at each stop — picked for your dates, around what's already booked, using current information from the web.</div>
      {stops.map((s) => (
        <Stop key={placeKey(s.place)} stop={s} data={all[placeKey(s.place)]} busy={busy.has(placeKey(s.place))}
          onAsk={onAsk} onAdd={onAdd} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
