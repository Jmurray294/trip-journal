import { useCallback, useEffect, useRef, useState } from 'react';
import { coverBg } from '../lib/derive.js';
import { parseExif } from '../lib/photos.js';
import { resizePhoto } from '../lib/resize.js';
import { onUpdateReady, applyUpdate } from '../lib/update.js';
import { Plus, Note } from '../components/Icons.jsx';

// A trip opened from its shared link (jcmurraytrips.com/?t=<token>): fellow travelers see the plan
// and everyone's photos and notes, and add their own — no account, just a name. Everything goes
// through the inbound-email function (?share=), which leaves out costs and confirmation numbers.

const API = (import.meta.env.VITE_SUPABASE_URL || '') + '/functions/v1/inbound-email';
const pad = (n) => String(n).padStart(2, '0');
// local time as the function reads it: "2026-10-31 14:22:05"
const stamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

function store(key, value) {
  try { if (value === undefined) return localStorage.getItem(key) || ''; localStorage.setItem(key, value); } catch (e) { /* private window */ }
  return value || '';
}

async function call(token, body) {
  const res = await fetch(`${API}?share=${encodeURIComponent(token)}`, body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : undefined);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || 'Something went wrong — try again');
  return data;
}

export default function GuestTrip({ token }) {
  const nameKey = 'guestName:' + token;
  const [name, setName] = useState(() => store(nameKey));
  const [draft, setDraft] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [toast, setToast] = useState('');

  // no Update button here: a new version goes in by itself, once nothing is sending
  const busyRef = useRef(false);
  const updateWaiting = useRef(false);
  useEffect(() => onUpdateReady(() => { updateWaiting.current = true; if (!busyRef.current) applyUpdate(); }), []);
  useEffect(() => {
    busyRef.current = !!busy || noteOpen;
    if (!busyRef.current && updateWaiting.current) applyUpdate();
  }, [busy, noteOpen]);

  const say = (msg) => { setToast(msg); setTimeout(() => setToast((t) => (t === msg ? '' : t)), 3200); };

  const load = useCallback(async () => {
    try { setData(await call(token)); setError(''); } catch (e) { setError(e.message); }
  }, [token]);

  useEffect(() => {
    load();
    const onShow = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onShow);
    const t = setInterval(load, 2 * 60 * 1000);
    return () => { document.removeEventListener('visibilitychange', onShow); clearInterval(t); };
  }, [load]);

  useEffect(() => { if (data) document.title = data.trip.title; }, [data]);

  const join = () => {
    const n = draft.replace(/\s+/g, ' ').trim();
    if (!n) return;
    setName(store(nameKey, n));
  };

  // one at a time, so a phone on a weak signal gets through a big batch
  const addPhotos = async (files) => {
    let added = 0, had = 0, failed = 0;
    for (let i = 0; i < files.length; i++) {
      setBusy(`Sending ${i + 1} of ${files.length}…`);
      const f = files[i];
      try {
        const meta = parseExif(await f.arrayBuffer());
        const image = await resizePhoto(f);
        if (!image) { failed++; continue; }
        const r = await call(token, {
          action: 'photo', name, image,
          taken: (meta && meta.taken) || stamp(new Date(f.lastModified || Date.now())),
          ...(meta && meta.lat != null ? { lat: meta.lat, lon: meta.lon } : {}),
        });
        if (r.added) added++; else had++;
      } catch (e) { failed++; }
    }
    setBusy('');
    say(failed ? `Added ${added}, ${failed} didn't send — try those again`
      : added ? `Added ${added} ${added === 1 ? 'photo' : 'photos'} — thank you!`
        : had ? 'Those photos are already in the trip' : 'Could not read those photos');
    load();
  };

  const addNote = async () => {
    const text = noteText.trim();
    if (!text) return;
    setBusy('Adding your note…');
    try {
      await call(token, { action: 'note', name, text, when: stamp(new Date()) });
      setNoteText(''); setNoteOpen(false); say('Note added');
      load();
    } catch (e) { say(e.message); }
    setBusy('');
  };

  if (error && !data) {
    return (
      <div className="app"><div className="scroller"><div className="empty-block">
        <div className="empty-block-title">{error}</div>
        <div className="empty-sub" style={{ marginTop: 8 }}>Ask whoever sent it for a new link.</div>
      </div></div></div>
    );
  }
  if (!data) return <div className="app"><div className="scroller"><div className="empty-block"><span className="spin-sm" /></div></div></div>;

  const { trip, days } = data;
  return (
    <div className="app">
      <div className="scroller">
        <div className="screen" style={{ paddingBottom: 60 }}>
          <div className="hero detail-hero">
            <div className="fill" style={coverBg(trip)} />
            <div className="fill" style={{ background: 'linear-gradient(to top, rgba(48,26,14,0.82) 0%, rgba(48,26,14,0.10) 52%, rgba(30,20,14,0.22) 100%)' }} />
            <div className="hero-text">
              <div className="status-chip">Shared trip</div>
              <div className="hero-title">{trip.title}</div>
              <div className="meta-row" style={{ marginTop: 8 }}>
                {trip.place && <span>{trip.place}</span>}
                {trip.place && trip.dates && <span className="dot-sep">·</span>}
                {trip.dates && <span>{trip.dates}</span>}
              </div>
            </div>
          </div>

          <div className="stats-card" style={{ display: 'block' }}>
            {!name ? (
              <>
                <div className="field-label">Who's this?</div>
                <div className="sheet-copy" style={{ marginTop: 0, marginBottom: 12 }}>
                  Add your name so everyone knows whose photos and notes are whose.
                </div>
                <input className="field" placeholder="Your first name" value={draft} autoComplete="given-name"
                  onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') join(); }} />
                <button className="btn-primary" style={{ marginTop: 12 }} disabled={!draft.trim()} onClick={join}>Join the trip</button>
              </>
            ) : (
              <>
                <div className="sheet-copy" style={{ marginTop: 0 }}>
                  Hi {name}. Add your photos and notes from the trip — they go into the trip's story and photo album.
                </div>
                {busy ? (
                  <div className="row-9" style={{ marginTop: 14, minHeight: 44 }}><span className="spin-sm" /><span className="sheet-copy" style={{ margin: 0 }}>{busy}</span></div>
                ) : (
                  <div className="row-8" style={{ marginTop: 14 }}>
                    <label className="btn-primary small press" style={{ cursor: 'pointer' }}>
                      <input type="file" accept="image/*" multiple hidden onChange={(e) => { const f = e.target.files; if (f && f.length) addPhotos([...f]); e.target.value = ''; }} />
                      <Plus size={15} color="#FBF6EC" w={2} /> Add photos
                    </label>
                    <button className="btn-soft-pill press" style={{ flex: 1, justifyContent: 'center', minHeight: 46 }} onClick={() => setNoteOpen(true)}>
                      <Note /> Add a note
                    </button>
                  </div>
                )}
                <button className="btn-link inline" style={{ marginTop: 8 }} onClick={() => { setDraft(name); setName(store(nameKey, '')); }}>Not {name}?</button>
              </>
            )}
          </div>

          <div className="detail-main">
            <div className="timeline-head"><div className="mono-label">The trip</div></div>
            {days.length === 0 && (
              <div className="section-empty">Nothing here yet — be the first to add a photo.</div>
            )}
            {days.map((d, i) => (
              <div key={d.id} className={'entry' + (d.cancelled ? ' cancelled' : '')}>
                <div className="entry-gutter">
                  <div className="entry-num">{i + 1}</div>
                  <div className="entry-line" />
                </div>
                <div className="entry-body">
                  <div className="entry-date">{d.kind && d.kind !== 'Booking' ? d.kind + ' · ' : ''}{d.date}{d.by ? ' · from ' + d.by : ''}</div>
                  <div className="entry-title">{d.title}</div>
                  {d.place && <div className="place-row"><span className="olive-dot" />{d.place}</div>}
                  {d.photos.length > 0 && (
                    <div className="photo-strip">
                      {d.photos.map((ph, j) => (
                        <a key={j} className="strip-tile" href={ph.url} target="_blank" rel="noreferrer">
                          <div className="fill" style={{ backgroundImage: `url("${ph.url}")`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                          {(ph.label || ph.by) && <div className="strip-label">{ph.label || ph.by}</div>}
                        </a>
                      ))}
                    </div>
                  )}
                  {d.note && <div className="entry-note">{d.note}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {noteOpen && (
        <div className="sheet-root">
          <div className="sheet-backdrop" onClick={() => !busy && setNoteOpen(false)} />
          <div className="sheet">
            <div className="grab" />
            <div className="field-label">A note for today</div>
            <textarea className="field" rows={5} autoFocus value={noteText} onChange={(e) => setNoteText(e.target.value)}
              placeholder="What happened, what you ate, what made you laugh…" />
            <button className="btn-primary" style={{ marginTop: 14 }} disabled={!noteText.trim() || !!busy} onClick={addNote}>
              {busy || 'Add note'}
            </button>
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
