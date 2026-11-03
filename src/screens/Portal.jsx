import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { coverBg, photoBg, songAudioSrc } from '../lib/derive.js';
import { onMediaReady } from '../lib/media.js';
import { countdown } from '../lib/stages.js';
import { loadPortal, portalSections, latestMoments, hasBook, hasSong } from '../lib/followers.js';
import PhotoViewer from '../components/PhotoViewer.jsx';
import { BookReader } from './PhotoBook.jsx';
import '../portal.css';

// The family portal (?follow): people a family invited to follow along. Sign in with an emailed
// 6-digit code, then see the trips the family shared — what's happening now on a trip underway
// (refreshed every minute), what's coming up, and past trips with their photo book and song.
// Read only. What a follower can see is decided in supabase/followers.sql.
// `preview`: a member's look at their own family's portal (opened over the journal), with a Close button.

const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k) || ''; if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private window */ } return v || ''; };
const REFRESH_MS = 60000;

function SignIn({ onDone }) {
  const [step, setStep] = useState('email'); // email | code
  const [email, setEmail] = useState('');
  const [name, setName] = useState(() => store('followName'));
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const okEmail = email.includes('@');

  const send = async () => {
    if (!okEmail) return;
    setBusy(true); setMsg('');
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true, emailRedirectTo: window.location.href } });
    setBusy(false);
    if (error) { setMsg(/rate|seconds/i.test(error.message) ? 'Too many codes sent just now. Wait a minute and try again.' : error.message); return; }
    store('followName', name.trim());
    setStep('code');
  };
  const verify = async () => {
    const token = code.replace(/\D/g, '');
    if (token.length < 6) return;
    setBusy(true); setMsg('');
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token, type: 'email' });
    setBusy(false);
    if (error) { setMsg('That code didn’t work. Check the newest email, or send a new code.'); return; }
    onDone();
  };

  return (
    <div className="pt-signin">
      <div className="pt-card pt-signin-card">
        <img src={import.meta.env.BASE_URL + 'icons/icon-192.png'} alt="" width="48" height="48" className="pt-logo" />
        <h1 className="pt-h1">Follow our trips</h1>
        {step === 'email' ? (<>
          <p className="pt-p">Sign in with the email address you were invited with. We’ll email you a 6-digit code. No password.</p>
          <label className="field-label" htmlFor="pt-name">Your name</label>
          <input id="pt-name" className="field" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="So the family knows who's following" />
          <label className="field-label" htmlFor="pt-email" style={{ marginTop: 12 }}>Email</label>
          <input id="pt-email" className="field" type="email" inputMode="email" autoComplete="email" value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" onKeyDown={(e) => { if (e.key === 'Enter') send(); }} />
          {msg && <div className="pt-msg">{msg}</div>}
          <button className="btn-primary press" style={{ marginTop: 18 }} disabled={busy || !okEmail} onClick={send}>{busy ? 'Sending…' : 'Email me a code'}</button>
        </>) : (<>
          <p className="pt-p">We sent a code to <strong>{email.trim()}</strong>. Enter it here. It may take a minute, so check your spam folder too.</p>
          <label className="field-label" htmlFor="pt-code">6-digit code</label>
          <input id="pt-code" className="field pt-code" inputMode="numeric" autoComplete="one-time-code" value={code}
            onChange={(e) => setCode(e.target.value)} placeholder="123456" onKeyDown={(e) => { if (e.key === 'Enter') verify(); }} autoFocus />
          {msg && <div className="pt-msg">{msg}</div>}
          <button className="btn-primary press" style={{ marginTop: 18 }} disabled={busy || code.replace(/\D/g, '').length < 6} onClick={verify}>{busy ? 'Checking…' : 'Sign in'}</button>
          <button className="btn-link" onClick={() => { setStep('email'); setCode(''); setMsg(''); }}>Use a different email or send a new code</button>
        </>)}
      </div>
    </div>
  );
}

function Song({ trip }) {
  const s = trip.song;
  const url = songAudioSrc(s);
  const [lyrics, setLyrics] = useState(false);
  return (
    <div className="pt-card pt-song">
      <div className="mono-label">Our trip song</div>
      <div className="pt-song-title">{s.title || trip.title + ' song'}</div>
      {s.audioPath ? (url ? <audio className="pt-audio" controls preload="metadata" src={url} /> : <div className="pt-sub">Loading the song…</div>)
        : <div className="pt-sub">The words are written. The recording isn’t ready yet.</div>}
      {(s.lines || []).length > 0 && (<>
        <button className="btn-link inline" onClick={() => setLyrics((v) => !v)}>{lyrics ? 'Hide the words' : 'Show the words'}</button>
        {lyrics && <div className="pt-lyrics">{s.lines.join('\n\n')}</div>}
      </>)}
    </div>
  );
}

// a day's notes and photos, the way the journal tells it
function Moment({ d, trip, onPhoto, showTrip }) {
  const photos = d.photos || [];
  return (
    <div className="pt-moment">
      <div className="pt-when">{[showTrip && trip.title, d.date, d.place].filter(Boolean).join(' · ')}{d.by ? ' · from ' + d.by : ''}</div>
      {d.title && !(d.booking || d.kind) && <div className="pt-mtitle">{d.title}</div>}
      {(d.note || '').trim() && <div className="pt-note">{d.note}</div>}
      {photos.length > 0 && (
        <div className={'pt-photos n' + Math.min(photos.length, 4)}>
          {photos.map((p, i) => <button key={i} className="pt-photo" style={photoBg(p)} onClick={() => onPhoto(d, i)} aria-label={p.label || 'Photo'} />)}
        </div>
      )}
    </div>
  );
}

function TripCard({ trip, onOpen, tag }) {
  return (
    <button className="pt-trip press" onClick={onOpen}>
      <div className="pt-trip-cover" style={coverBg(trip)}>{tag && <span className="pt-tag">{tag}</span>}</div>
      <div className="pt-trip-body">
        <div className="pt-trip-title">{trip.title}</div>
        <div className="pt-sub">{[trip.place, trip.dates].filter(Boolean).join(' · ')}</div>
        <div className="pt-badges">
          {hasBook(trip) && <span className="pt-badge">Photo book</span>}
          {hasSong(trip) && <span className="pt-badge">Song</span>}
        </div>
      </div>
    </button>
  );
}

function TripPage({ trip, onBack, onBook, onPhoto, live }) {
  const days = (trip.days || []).filter((d) => (d.note || '').trim() || (d.photos || []).length || d.booking || d.kind);
  return (
    <div className="pt-page">
      <button className="pt-back" onClick={onBack}>‹ All trips</button>
      <div className="pt-hero" style={coverBg(trip)}>
        <div className="pt-hero-text">
          {live && <span className="pt-tag live">On the road now</span>}
          <div className="pt-hero-title">{trip.title}</div>
          <div className="pt-hero-sub">{[trip.place, trip.dates].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
      {(hasBook(trip) || hasSong(trip)) && (
        <div className="pt-keeps">
          {hasBook(trip) && (
            <div className="pt-card pt-bookcard">
              <div className="mono-label">Photo book</div>
              <div className="pt-song-title">{trip.book.draft.title || trip.title}</div>
              <button className="btn-primary small press" onClick={onBook}>Read the book</button>
            </div>
          )}
          {hasSong(trip) && <Song trip={trip} />}
        </div>
      )}
      <div className="pt-card">
        <div className="mono-label">{live ? 'The journal so far' : 'The journal'}</div>
        {days.length === 0 && <div className="pt-sub" style={{ marginTop: 8 }}>Nothing here yet.</div>}
        {days.map((d) => (d.booking || d.kind)
          ? <div key={d.id} className="pt-plan"><span className="pt-when">{d.date}</span> {d.kind ? d.kind + ': ' : ''}{d.title}{d.place ? ' · ' + d.place : ''}</div>
          : <Moment key={d.id} d={d} trip={trip} onPhoto={onPhoto} />)}
      </div>
    </div>
  );
}

export default function Portal({ preview = false, onClose }) {
  const root = useRef(null);
  const [session, setSession] = useState(undefined); // undefined while reading the saved session
  const [families, setFamilies] = useState(null);
  const [error, setError] = useState('');
  const [isMember, setIsMember] = useState(false);
  const [open, setOpen] = useState(null); // trip id
  const [reading, setReading] = useState(null); // trip id whose book is open
  const [viewer, setViewer] = useState(null); // { items, index }
  const [, tick] = useState(0);

  useEffect(() => {
    if (!supabase) return undefined;
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s || null));
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => onMediaReady(() => tick((n) => n + 1)), []);

  const load = useCallback(async () => {
    try {
      const f = await loadPortal(store('followName'), { preview });
      setFamilies(f); setError('');
      if (preview) return;
      if (f.length) store('portal', '1');
      else {
        const { data } = await supabase.from('household_members').select('household_id').limit(1);
        setIsMember(!!(data && data.length));
      }
    } catch (e) { setError(e.message || 'Could not load — try again'); setFamilies((f) => f || []); }
  }, [preview]);

  useEffect(() => { if (session) load(); }, [session, load]);

  const all = useMemo(() => (families || []).flatMap((f) => f.trips.map((t) => ({ ...t, family: f.name }))), [families]);
  const sections = useMemo(() => portalSections(all), [all]);

  // keep a trip that's underway fresh while the page is open
  useEffect(() => {
    if (!sections.live.length) return undefined;
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, REFRESH_MS);
    const onShow = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onShow);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onShow); };
  }, [sections.live.length, load]);

  useEffect(() => { window.scrollTo(0, 0); if (root.current) root.current.scrollTop = 0; }, [open]);
  useEffect(() => {
    if (!preview) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !reading && !viewer) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const signOut = async () => { store('portal', null); await supabase.auth.signOut(); setFamilies(null); setOpen(null); };
  const openJournal = () => { store('portal', null); window.location.href = import.meta.env.BASE_URL; };
  const showPhoto = (trip, d, i) => {
    const items = [];
    let at = 0;
    for (const x of trip.days || []) (x.photos || []).forEach((p, k) => { if (x === d && k === i) at = items.length; items.push({ p, trip: trip.title, caption: p.label || x.place || '' }); });
    setViewer({ items, index: at });
  };

  if (!supabase) return <div className="pt-root"><div className="pt-signin"><div className="pt-card">The portal isn’t available here.</div></div></div>;
  if (session === undefined) return <div className="pt-root"><div className="loading"><div className="spinner" /></div></div>;
  if (!session) return <div className="pt-root"><SignIn onDone={load} /></div>;

  const trip = all.find((t) => t.id === open);
  const readingTrip = all.find((t) => t.id === reading);
  const familyName = families && families.length === 1 ? families[0].name : '';
  const title = familyName && familyName !== 'Our family' && familyName !== 'Our trips' ? familyName : 'Our trips';

  let body;
  if (families === null) body = <div className="loading"><div className="spinner" /></div>;
  else if (!families.length && preview) {
    body = (
      <div className="pt-signin">
        <div className="pt-card pt-signin-card">
          <h1 className="pt-h1">Nothing shared yet</h1>
          <p className="pt-p">Followers see only the trips you switch on. Open a trip and set its Followers card to “Followers can see it”.</p>
          {error && <div className="pt-msg">{error}</div>}
          <button className="btn-primary press" onClick={onClose}>Close preview</button>
        </div>
      </div>
    );
  } else if (!families.length) {
    body = (
      <div className="pt-signin">
        <div className="pt-card pt-signin-card">
          <h1 className="pt-h1">{isMember ? 'You’re in the journal' : 'Nothing shared yet'}</h1>
          <p className="pt-p">{isMember
            ? 'This page is for people following along. You can see everything in the journal itself.'
            : `No family has invited ${session.user.email} to follow along yet. Ask them to add this email under Followers, then check again.`}</p>
          {error && <div className="pt-msg">{error}</div>}
          {isMember ? <button className="btn-primary press" onClick={openJournal}>Open the journal</button>
            : <button className="btn-primary press" onClick={load}>Check again</button>}
          <button className="btn-link" onClick={signOut}>Sign out</button>
        </div>
      </div>
    );
  } else if (trip) {
    body = <TripPage trip={trip} live={sections.live.includes(trip)} onBack={() => setOpen(null)} onBook={() => setReading(trip.id)} onPhoto={(d, i) => showPhoto(trip, d, i)} />;
  } else {
    const songs = all.filter(hasSong);
    body = (
      <div className="pt-page">
        <div className="pt-head">
          <div>
            <div className="pt-eyebrow">Following along</div>
            <h1 className="pt-title">{title}</h1>
          </div>
          {preview ? <button className="pt-signout" onClick={onClose}>Close</button> : <button className="pt-signout" onClick={signOut}>Sign out</button>}
        </div>
        {error && <div className="pt-card pt-msg">{error}</div>}

        {sections.live.map((t) => {
          const moments = latestMoments(t, 12);
          return (
            <div key={t.id} className="pt-card pt-live">
              <div className="pt-live-head">
                <span className="pt-tag live">On the road now</span>
                <button className="btn-link inline" onClick={() => setOpen(t.id)}>See the whole trip ›</button>
              </div>
              <div className="pt-trip-title big">{t.title}</div>
              <div className="pt-sub">{[t.place, t.dates].filter(Boolean).join(' · ')}</div>
              {moments.length === 0 && <div className="pt-sub" style={{ marginTop: 10 }}>Nothing posted yet today. Check back soon.</div>}
              {moments.map((d) => <Moment key={d.id} d={d} trip={t} onPhoto={(dd, i) => showPhoto(t, dd, i)} />)}
            </div>
          );
        })}

        {sections.next && (
          <button className="pt-card pt-next press" onClick={() => setOpen(sections.next.id)}>
            <div className="mono-label">Coming up</div>
            <div className="pt-trip-title big">{sections.next.title}</div>
            <div className="pt-sub">{[sections.next.place, sections.next.dates].filter(Boolean).join(' · ')}{countdown(sections.next) ? ' · ' + countdown(sections.next) : ''}</div>
          </button>
        )}

        {sections.past.length > 0 && (<>
          <div className="pt-section">Our trips</div>
          <div className="pt-grid">{sections.past.map((t) => <TripCard key={t.id} trip={t} onOpen={() => setOpen(t.id)} />)}</div>
        </>)}

        {songs.length > 0 && (<>
          <div className="pt-section">Trip songs</div>
          <div className="pt-songs">{songs.map((t) => <Song key={t.id} trip={t} />)}</div>
        </>)}

        {!sections.live.length && !sections.next && !sections.past.length && (
          <div className="pt-card"><div className="pt-sub">No trips shared yet. They’ll show up here when the family shares one.</div></div>
        )}
      </div>
    );
  }

  return (
    <div ref={root} className={'pt-root' + (preview ? ' pt-preview' : '')} role={preview ? 'dialog' : undefined} aria-label={preview ? 'Follower preview' : undefined}>
      {preview && (
        <div className="pt-preview-bar">
          <span><strong>Preview:</strong> this is what your followers see</span>
          <button onClick={onClose}>Close</button>
        </div>
      )}
      {body}
      {readingTrip && <BookReader trip={readingTrip} onClose={() => setReading(null)} />}
      {viewer && <PhotoViewer items={viewer.items} index={viewer.index} onIndex={(i) => setViewer((v) => ({ ...v, index: i }))} onClose={() => setViewer(null)} />}
    </div>
  );
}
