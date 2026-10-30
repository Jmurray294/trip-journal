import { useState } from 'react';
import { Plus } from '../components/Icons.jsx';
import { mediaUrl } from '../lib/media.js';
import { searchIdeas, byCountry, partsOf } from '../lib/someday.js';

// The Trips page's Someday section: saved inspiration by country, then state. "Start planning" turns a
// place into a Possible trip carrying its ideas.

const SHOW = 3;
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return 'link'; } };

export function Idea({ it, onRemove }) {
  const img = it.image_path ? mediaUrl(it.image_path) : it.image_url;
  return (
    <div className="someday-idea">
      {img ? <div className="someday-thumb" style={{ backgroundImage: `url("${img}")` }} /> : <div className="someday-thumb empty" />}
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="someday-title">{it.title}</div>
        {(it.spot || it.note) && <div className="someday-note">{[it.spot && it.spot !== it.title ? it.spot : '', it.note].filter(Boolean).join(' · ')}</div>}
        {it.url && <a className="someday-link" href={it.url} target="_blank" rel="noopener noreferrer">{host(it.url)} ↗</a>}
      </div>
      {onRemove && <button className="thumb-x static" onClick={() => onRemove(it)} aria-label={'Remove ' + it.title}><span>×</span></button>}
    </div>
  );
}

const placeId = (place) => 'someday-' + place.toLowerCase().replace(/W+/g, '-');
const count = (n, of) => (of != null ? `${n} of ${of} ideas` : `${n} ${n === 1 ? 'idea' : 'ideas'}`);

// One place's ideas. As a state inside a country it has its own small heading; alone, the country's.
function Place({ g, heading, searching, onPlan, onRemove }) {
  const [all, setAll] = useState(false);
  const shown = all || searching ? g.items : g.items.slice(0, SHOW);
  const total = (g.all || g).items.length;
  return (
    <div className="someday-state" id={g.state ? placeId(g.place) : undefined}>
      {heading && (
        <div className="someday-head">
          <div className="grow">
            <div className="someday-sub">{heading}</div>
            <div className="someday-count">{count(g.items.length, searching ? total : null)}</div>
          </div>
          <button className="btn-soft-pill press" onClick={() => onPlan(g.all || g)}>Start planning</button>
        </div>
      )}
      <div className="stack-9">
        {shown.map((it) => <Idea key={it.id} it={it} onRemove={onRemove} />)}
      </div>
      {!searching && g.items.length > SHOW && (
        <button className="btn-link" style={{ width: 'auto', marginTop: 8 }} onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `Show all ${g.items.length}`}
        </button>
      )}
    </div>
  );
}

// A country's card: its states inside it, or just its ideas when they name no state.
function Country({ c, searching, onPlan, onRemove }) {
  const only = c.places.length === 1 && !c.places[0].state ? c.places[0] : null;
  const total = c.places.reduce((n, g) => n + (g.all || g).items.length, 0);
  const parts = c.places.filter((g) => g.state).length;
  return (
    <div className="someday-place" id={placeId(c.country)}>
      <div className="someday-head">
        <div className="grow">
          <div className="someday-name">{c.country}</div>
          <div className="someday-count">
            {count(c.count, searching ? total : null)}
            {!only && ` · ${parts} ${parts === 1 ? partsOf(c.country).slice(0, -1) : partsOf(c.country)}`}
          </div>
        </div>
        {only && <button className="btn-soft-pill press" onClick={() => onPlan(only.all || only)}>Start planning</button>}
      </div>
      {only ? (
        <Place g={only} searching={searching} onPlan={onPlan} onRemove={onRemove} />
      ) : (
        <div className="someday-states">
          {c.places.map((g) => (
            <Place key={g.place} g={g} heading={g.state || `Around ${c.country}`} searching={searching} onPlan={onPlan} onRemove={onRemove} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function SomedayBoard({ groups, address, onSave, onPlan, onRemove }) {
  const [query, setQuery] = useState('');
  const searching = !!query.trim();
  const found = searchIdeas(groups, query);
  return (
    <section className="sec" style={{ paddingTop: 28 }} id="someday">
      <div className="timeline-head" style={{ margin: '0 4px 13px' }}>
        <div className="sec-label" style={{ margin: 0 }}><span className="tick" style={{ background: '#F0B968' }} />Someday</div>
        <button className="btn-soft-pill press" onClick={onSave}><Plus size={13} w={1.8} /> Save idea</button>
      </div>
      {groups.length === 0 ? (
        <div className="someday-empty">
          Places you'd love to go one day. Send a link, screenshot or note{address ? <> to <strong>{address}</strong></> : ''}, or tap <strong>Save idea</strong> — they're sorted by place here, ready for when you start planning.
        </div>
      ) : (
        <>
          <div className="someday-search">
            <input className="field" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search: Italy, Maine, beach, wine…" aria-label="Search ideas" />
            {searching && <button className="someday-clear" onClick={() => setQuery('')} aria-label="Clear search">×</button>}
          </div>
          {found.length === 0 ? (
            <div className="someday-empty">No ideas match “{query.trim()}”.</div>
          ) : (
            <div className="someday-grid">
              {byCountry(found).map((c) => <Country key={c.country} c={c} searching={searching} onPlan={onPlan} onRemove={onRemove} />)}
            </div>
          )}
        </>
      )}
    </section>
  );
}
