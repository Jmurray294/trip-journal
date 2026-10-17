import { useCallback, useEffect, useRef, useState } from 'react';
import { kvGet, saveJournal, SCHEMA_V, requestPersistence } from './lib/db.js';
import { migrate, normalize, newTripId, newEntryId, FAMILY } from './lib/seed.js';
import { onMediaReady } from './lib/media.js';
import { useFamily } from './lib/useFamily.js';
import FamilySheet from './screens/FamilySheet.jsx';
import { geocode } from './lib/geo.js';
import { todayLabel } from './lib/parser.js';
import { writeSong as composeSong, sunoText } from './lib/song.js';
import TripsHome from './screens/TripsHome.jsx';
import TripDetail from './screens/TripDetail.jsx';
import MapView from './screens/MapView.jsx';
import Albums from './screens/Albums.jsx';
import Story, { StoryPrint } from './screens/Story.jsx';
import AddSheet from './screens/AddSheet.jsx';
import TabBar from './components/TabBar.jsx';
import Sidebar from './components/Sidebar.jsx';

const AUTO_SPEED = 46; // story auto-scroll, px per second

function resizePhoto(file) {
  return new Promise((res) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const sc = Math.min(1, 1400 / Math.max(img.width, img.height));
      const cw = Math.round(img.width * sc), ch = Math.round(img.height * sc);
      const c = document.createElement('canvas'); c.width = cw; c.height = ch;
      c.getContext('2d').drawImage(img, 0, 0, cw, ch);
      URL.revokeObjectURL(url);
      try { res(c.toDataURL('image/jpeg', 0.82)); } catch (e) { res(null); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); res(null); };
    img.src = url;
  });
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e2) { return false; }
  }
}

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [trips, setTrips] = useState([]);
  const [home, setHome] = useState({ home: '', homeLon: null, homeLat: null });
  const [nav, setNav] = useState({ tab: 'trips', tripId: null, storyId: null });
  const [mapSel, setMapSel] = useState({ tripId: 'tofino', stop: 0 });
  const [albumFilter, setAlbumFilter] = useState('all');
  const [add, setAdd] = useState(null); // { mode, tripId }
  const [song, setSong] = useState({ playing: false, progress: 0, lyricsOpen: false, audioDur: 0 });
  const [songBusy, setSongBusy] = useState(null);
  const [audioBusy, setAudioBusy] = useState(false);
  const [autoScroll, setAutoScroll] = useState(false);
  const [toast, setToast] = useState(null);

  const scroller = useRef(null);
  // Trips change through applyTrips only, which updates the ref synchronously so sync and edits
  // always build on the latest state (a queued setState could otherwise be overwritten).
  const tripsRef = useRef(trips);
  const applyTrips = useCallback((fn) => {
    const next = typeof fn === 'function' ? fn(tripsRef.current) : fn;
    tripsRef.current = next;
    setTrips(next);
  }, []);
  const homeRef = useRef(home); homeRef.current = home;
  const navRef = useRef(nav); navRef.current = nav;
  const toastT = useRef(null);
  const songT = useRef(null);
  const audio = useRef(null);
  const audioSrc = useRef(null);
  const auto = useRef({ on: false, raf: null, start: null });
  const stopDictationRef = useRef(() => {});

  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast(null), 1900);
  }, []);

  // ---- load + persist ----
  useEffect(() => {
    (async () => {
      const raw = await kvGet('journal');
      const { changed, data } = migrate(raw, SCHEMA_V);
      const norm = normalize(data.trips);
      if (changed || norm.changed) await saveJournal({ ...data, trips: norm.trips });
      applyTrips(norm.trips);
      setHome({ home: data.home || '', homeLon: data.homeLon ?? null, homeLat: data.homeLat ?? null });
      setLoaded(true);
      requestPersistence();
    })();
  }, []);

  useEffect(() => { if (loaded) saveJournal({ trips, ...home }); }, [loaded, trips, home]);

  // ---- family sharing + sync ----
  const [familyOpen, setFamilyOpen] = useState(false);
  const family = useFamily({ getTrips: () => tripsRef.current, applyTrips, enabled: loaded });
  useEffect(() => { if (loaded) family.schedule(); }, [loaded, trips]); // eslint-disable-line react-hooks/exhaustive-deps

  // synced photos/audio arrive asynchronously; re-render when one is ready
  const [, setMediaTick] = useState(0);
  useEffect(() => onMediaReady(() => setMediaTick((n) => n + 1)), []);

  // ---- geocoding: fill in anything still unplaced, ≤1 request/second ----
  const setDayCoords = (tripId, dayId, place, c) => applyTrips((ts) => ts.map((t) => t.id !== tripId ? t : {
    ...t, days: t.days.map((d) => (d.id === dayId && (d.place || '').trim() === place ? { ...d, lon: c[0], lat: c[1] } : d))
  }));
  const locating = useRef(false);
  const locateMissing = useCallback(async () => {
    if (locating.current) return;
    locating.current = true;
    try {
      for (const t of tripsRef.current) {
        for (let i = 0; i < (t.days || []).length; i++) {
          const d = t.days[i];
          const place = (d.place || '').trim();
          if (!place || typeof d.lon === 'number') continue;
          const c = await geocode(place);
          if (c) setDayCoords(t.id, d.id, place, c);
          await new Promise((r) => setTimeout(r, 1100));
        }
      }
      const h = homeRef.current;
      if (h.home && h.homeLon == null) {
        const c = await geocode(h.home);
        if (c) setHome((cur) => (cur.home === h.home ? { ...cur, homeLon: c[0], homeLat: c[1] } : cur));
      }
    } finally { locating.current = false; }
  }, []);
  useEffect(() => {
    if (!loaded) return undefined;
    const t = setTimeout(locateMissing, 2500);
    const onOnline = () => locateMissing();
    window.addEventListener('online', onOnline);
    return () => { clearTimeout(t); window.removeEventListener('online', onOnline); };
  }, [loaded, locateMissing]);

  // ---- song playback ----
  const stopSong = useCallback(() => {
    if (songT.current) { clearInterval(songT.current); songT.current = null; }
    if (audio.current) { try { audio.current.pause(); } catch (e) { /* ignore */ } }
  }, []);

  const playAudio = (srcUrl) => {
    if (!audio.current || audioSrc.current !== srcUrl) {
      if (audio.current) { try { audio.current.pause(); } catch (e) { /* ignore */ } }
      const a = new Audio(srcUrl);
      a.preload = 'metadata';
      a.onloadedmetadata = () => { if (isFinite(a.duration) && a.duration > 0) setSong((s) => ({ ...s, audioDur: a.duration })); };
      a.ontimeupdate = () => setSong((s) => ({ ...s, progress: a.currentTime }));
      a.onended = () => setSong((s) => ({ ...s, playing: false, progress: 0 }));
      a.onerror = () => { setSong((s) => ({ ...s, playing: false })); showToast('Could not play that audio'); };
      audio.current = a; audioSrc.current = srcUrl;
    }
    const a = audio.current;
    a.play().then(() => setSong((s) => ({ ...s, playing: true }))).catch(() => showToast('Tap play again to allow audio'));
  };

  const toggleSong = (dur, srcUrl, stillLoading) => {
    if (stillLoading) { showToast(navigator.onLine ? 'Song audio is still downloading' : 'Song audio needs a connection once'); return; }
    if (srcUrl) {
      if (song.playing && audio.current) { audio.current.pause(); setSong((s) => ({ ...s, playing: false })); return; }
      playAudio(srcUrl); return;
    }
    if (song.playing) { stopSong(); setSong((s) => ({ ...s, playing: false })); return; }
    stopSong();
    setSong((s) => ({ ...s, playing: true }));
    // no audio attached: simulate playback so the lyrics still follow along
    songT.current = setInterval(() => {
      setSong((s) => {
        const np = s.progress + 1;
        if (np >= dur) { clearInterval(songT.current); songT.current = null; return { ...s, progress: 0, playing: false }; }
        return { ...s, progress: np };
      });
    }, 1000);
  };

  // ---- story auto-scroll ----
  const stopAuto = useCallback(() => {
    auto.current.on = false;
    if (auto.current.raf) { cancelAnimationFrame(auto.current.raf); auto.current.raf = null; }
    clearTimeout(auto.current.start);
    setAutoScroll(false);
  }, []);
  const startAuto = useCallback(() => {
    if (auto.current.on) return;
    auto.current.on = true; setAutoScroll(true);
    let last = 0, carry = 0;
    const step = (now) => {
      if (!auto.current.on) { auto.current.raf = null; return; }
      const el = scroller.current;
      if (!el) { auto.current.raf = requestAnimationFrame(step); return; }
      let dt = last ? now - last : 16.7;
      if (!(dt > 0 && dt < 200)) dt = 16.7; // ignore tab-throttled gaps
      last = now;
      carry += (dt / 1000) * AUTO_SPEED;
      const px = Math.floor(carry);
      if (px) { el.scrollTop += px; carry -= px; }
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) { stopAuto(); return; }
      auto.current.raf = requestAnimationFrame(step);
    };
    auto.current.raf = requestAnimationFrame(step);
  }, [stopAuto]);
  const toggleAuto = () => {
    clearTimeout(auto.current.start);
    if (auto.current.on) { stopAuto(); return; }
    const el = scroller.current;
    if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 2) el.scrollTop = 0;
    startAuto();
  };

  // ---- navigation ----
  const resetScroll = () => requestAnimationFrame(() => { if (scroller.current) scroller.current.scrollTop = 0; });
  const go = (patch) => {
    stopSong(); stopAuto(); stopDictationRef.current();
    setSong((s) => ({ ...s, playing: false, progress: 0, lyricsOpen: false }));
    setNav((n) => ({ ...n, storyId: null, ...patch }));
    resetScroll();
  };
  const openStory = (id) => {
    go({ storyId: id });
    auto.current.start = setTimeout(() => { if (navRef.current.storyId === id) startAuto(); }, 1100);
  };
  const closeStory = () => go({ storyId: null });

  // Android back button / browser back: step back through the app instead of leaving it.
  useEffect(() => {
    const depth = nav.storyId ? 2 : nav.tripId && nav.tab === 'trips' ? 1 : 0;
    const cur = (history.state && history.state.tj) || 0;
    if (depth > cur) history.pushState({ tj: depth }, '');
    else if (depth < cur) history.replaceState({ tj: depth }, '');
  }, [nav]);
  useEffect(() => {
    const onPop = () => {
      const n = navRef.current;
      if (n.storyId) go({ storyId: null });
      else if (n.tripId) go({ tripId: null });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  });

  // ---- mutations ----
  const updateTrip = (id, fn) => applyTrips((ts) => ts.map((t) => (t.id === id ? fn(t) : t)));

  const openAddFor = (id, mode = 'memory') => {
    const fallback = (trips.find((t) => !t.planning) || trips[0] || {}).id;
    setAdd({ mode, tripId: id || fallback });
  };

  const saveMemory = ({ tripId, title, place, note, photos }) => {
    if (!title && !note && !place && photos.length === 0) { showToast('Add a photo or a note first'); return false; }
    const trip = trips.find((t) => t.id === tripId);
    if (!trip) return true;
    const where = (place || trip.place || '').trim();
    const id = newEntryId();
    updateTrip(tripId, (t) => ({
      ...t, days: [...t.days, { id, pos: Date.now(), num: t.days.length + 1, date: todayLabel(), title: title || 'A new moment', place: place || t.place, note: note || '', photos: photos.map((s) => ({ src: s, label: '' })) }]
    }));
    showToast('Memory saved to journal');
    if (where) geocode(where).then((c) => { if (c) setDayCoords(tripId, id, where, c); });
    return true;
  };

  const saveTrip = ({ title, place, dates, grad }) => {
    if (!title.trim()) { showToast('Give your trip a name'); return false; }
    const trip = { id: newTripId(), title: title.trim(), place: place.trim(), dates: dates.trim() || todayLabel(), grad, planning: false, statusLabel: 'My trip', timelineLabel: 'Timeline', members: FAMILY, song: null, days: [] };
    applyTrips((ts) => {
      const next = [...ts]; const idx = next.findIndex((t) => !t.planning);
      if (idx < 0) next.push(trip); else next.splice(idx, 0, trip);
      return next;
    });
    go({ tab: 'trips', tripId: trip.id });
    showToast('Trip created');
    return true;
  };

  const importParsed = (tripId, parsed) => {
    if (!trips.some((t) => t.id === tripId)) { showToast('Pick a trip first'); return false; }
    updateTrip(tripId, (t) => {
      const base = Date.now();
      const days = [...t.days, ...parsed.map((p, i) => ({ id: newEntryId(), pos: base + i, date: p.date, title: p.title, place: p.place || t.place, note: p.note, photos: [] }))];
      return { ...t, days: days.map((d, i) => ({ ...d, num: i + 1 })) };
    });
    go({ tab: 'trips', tripId });
    const n = parsed.length;
    showToast(n + (n === 1 ? ' item added' : ' items added'));
    return true;
  };

  const deleteEntry = (tripId, idx) => {
    if (!window.confirm('Delete this memory?')) return;
    updateTrip(tripId, (t) => ({ ...t, days: t.days.filter((_, i) => i !== idx).map((d, i) => ({ ...d, num: i + 1 })) }));
    showToast('Memory removed');
  };

  const deleteTrip = (id) => {
    if (!window.confirm('Delete this whole trip and all of its memories? This cannot be undone.')) return;
    const rest = trips.filter((t) => t.id !== id);
    applyTrips(rest);
    if (mapSel.tripId === id) setMapSel({ tripId: (rest[0] && rest[0].id) || '', stop: 0 });
    go({ tab: 'trips', tripId: null });
    showToast('Trip deleted');
  };

  const shareTrip = async (t) => {
    const lines = [t.title, [t.place, t.dates].filter(Boolean).join(' · '), ''];
    t.days.forEach((d) => lines.push(`${d.date} — ${d.title}${d.place ? ' (' + d.place + ')' : ''}`));
    const text = lines.join('\n');
    if (navigator.share) {
      try { await navigator.share({ title: t.title, text }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    showToast((await copyText(text)) ? 'Trip summary copied' : 'Sharing not available');
  };

  const writeSong = (id) => {
    const t = trips.find((x) => x.id === id);
    if (!t) return;
    if ((t.days || []).length < 2) { showToast('Add a couple of memories first'); return; }
    stopSong(); audio.current = null;
    setSongBusy(id);
    // brief pause so the busy state reads as intentional
    setTimeout(() => {
      const s = composeSong(t);
      updateTrip(id, (x) => ({ ...x, song: s }));
      setSongBusy(null);
      setSong({ playing: false, progress: 0, lyricsOpen: true, audioDur: 0 });
      showToast(s.title + ' is ready');
    }, 700);
  };

  const sendToSuno = async (t) => {
    if (!t.song || !t.song.lines.length) { showToast('Write the song first'); return; }
    const ok = await copyText(sunoText(t.song));
    showToast(ok ? 'Lyrics copied — paste into Suno' : 'Could not copy the lyrics');
    try { window.open('https://suno.com/create', '_blank', 'noopener'); } catch (e) { /* ignore */ }
  };

  const attachAudio = async (id, file) => {
    if (!file) return;
    if (file.size > 24 * 1024 * 1024) { showToast('That file is too large (24MB max)'); return; }
    setAudioBusy(true);
    try {
      const dataUrl = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error);
        fr.readAsDataURL(file);
      });
      // probe the real duration now so the total-time label is right before first play
      const realDur = await new Promise((res) => {
        const probe = new Audio(); probe.preload = 'metadata';
        let settled = false;
        const done = (v) => { if (settled) return; settled = true; probe.onloadedmetadata = probe.onerror = null; res(v); };
        probe.onloadedmetadata = () => done(isFinite(probe.duration) && probe.duration > 0 ? probe.duration : 0);
        probe.onerror = () => done(0);
        setTimeout(() => done(0), 6000);
        probe.src = dataUrl;
      });
      updateTrip(id, (x) => ({ ...x, song: { ...(x.song || { title: x.title + ' Song', mood: 'From Suno', lines: [], duration: 180 }), audio: dataUrl, audioPath: undefined, audioName: file.name, audioDur: realDur || null } }));
      stopSong(); audio.current = null;
      setSong((s) => ({ ...s, playing: false, progress: 0, audioDur: realDur || 0 }));
      showToast('Audio added — press play');
    } catch (err) {
      showToast('Could not read that file');
    } finally { setAudioBusy(false); }
  };

  const removeAudio = (id) => {
    updateTrip(id, (x) => (x.song ? { ...x, song: { ...x.song, audio: null, audioPath: undefined, audioName: null, audioDur: null } } : x));
    stopSong(); audio.current = null;
    setSong((s) => ({ ...s, playing: false, progress: 0, audioDur: 0 }));
    showToast('Audio removed');
  };

  const saveHome = (draft) => {
    const h = (draft || '').trim();
    setHome({ home: h, homeLon: null, homeLat: null });
    showToast(h ? 'Home address saved' : 'Home address cleared');
    if (h) geocode(h).then((c) => { if (c) setHome((cur) => (cur.home === h ? { ...cur, homeLon: c[0], homeLat: c[1] } : cur)); });
  };

  // stop timers on unmount
  useEffect(() => () => { stopSong(); stopAuto(); clearTimeout(toastT.current); }, [stopSong, stopAuto]);

  if (!loaded) {
    return (
      <div className="app">
        <div className="loading"><div className="spinner" /><div>Loading your journal…</div></div>
      </div>
    );
  }

  const trip = trips.find((t) => t.id === nav.tripId);
  const storyTrip = trips.find((t) => t.id === nav.storyId);
  const screen = storyTrip ? 'story' : nav.tab === 'trips' ? (trip ? 'detail' : 'list') : nav.tab;

  return (
    <>
      <div className="app" data-print-hide="1">
        <div className="scroller" ref={scroller}>
          {screen === 'list' && (
            <TripsHome trips={trips} onOpen={(id) => go({ tab: 'trips', tripId: id })} onNewTrip={() => openAddFor(null, 'trip')}
              family={family} onFamily={() => setFamilyOpen(true)} />
          )}
          {screen === 'detail' && (
            <TripDetail
              trip={trip} song={song} songBusy={songBusy === trip.id} audioBusy={audioBusy}
              onBack={() => go({ tripId: null })}
              onShare={() => shareTrip(trip)}
              onStory={() => openStory(trip.id)}
              onAdd={() => openAddFor(trip.id)}
              onDeleteEntry={(i) => deleteEntry(trip.id, i)}
              onDeleteTrip={() => deleteTrip(trip.id)}
              onWriteSong={() => writeSong(trip.id)}
              onToggleSong={toggleSong}
              onToggleLyrics={() => setSong((s) => ({ ...s, lyricsOpen: !s.lyricsOpen }))}
              onSendToSuno={() => sendToSuno(trip)}
              onPickAudio={(f) => attachAudio(trip.id, f)}
              onRemoveAudio={() => removeAudio(trip.id)}
            />
          )}
          {screen === 'story' && <Story trip={storyTrip} onClose={closeStory} onPrint={() => setTimeout(() => window.print(), 60)} />}
          {screen === 'map' && (
            <MapView
              trips={trips} home={home} sel={mapSel}
              onSelectTrip={(id) => setMapSel({ tripId: id, stop: 0 })}
              onSelectStop={(i) => setMapSel((m) => ({ ...m, stop: i }))}
              onSaveHome={saveHome}
            />
          )}
          {screen === 'albums' && (
            <Albums trips={trips} filter={albumFilter} onFilter={setAlbumFilter} />
          )}
        </div>

        <Sidebar
          tab={nav.tab} trips={trips} tripId={nav.tripId}
          onTrips={() => go({ tab: 'trips', tripId: null })}
          onMap={() => go({ tab: 'map' })}
          onAlbums={() => go({ tab: 'albums' })}
          onAdd={() => openAddFor(nav.tripId)}
          onNewTrip={() => openAddFor(null, 'trip')}
          onOpenTrip={(id) => go({ tab: 'trips', tripId: id })}
          family={family} onFamily={() => setFamilyOpen(true)}
        />

        <TabBar
          tab={nav.tab}
          onTrips={() => go({ tab: 'trips', tripId: null })}
          onMap={() => go({ tab: 'map' })}
          onAlbums={() => go({ tab: 'albums' })}
          onAdd={() => openAddFor(nav.tripId)}
        />

        {screen === 'story' && (
          <div className="story-pill-wrap">
            <button className="story-pill press" onClick={toggleAuto}>
              {autoScroll
                ? <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="2.5" y="1.5" width="2.8" height="9" rx="0.9" fill="#FBF6EC" /><rect x="6.7" y="1.5" width="2.8" height="9" rx="0.9" fill="#FBF6EC" /></svg>
                : <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.6l7 4.4-7 4.4z" fill="#FBF6EC" /></svg>}
              {autoScroll ? 'Pause' : 'Play story'}
            </button>
          </div>
        )}

        {toast && <div className="toast" role="status">{toast}</div>}

        {add && (
          <AddSheet
            initial={add} trips={trips}
            onClose={() => setAdd(null)}
            registerStopDictation={(fn) => { stopDictationRef.current = fn; }}
            resizePhoto={resizePhoto}
            onSaveMemory={(m) => { if (saveMemory(m)) setAdd(null); }}
            onSaveTrip={(t) => { if (saveTrip(t)) setAdd(null); }}
            onImport={(id, parsed) => { if (importParsed(id, parsed)) setAdd(null); }}
            toast={showToast}
          />
        )}

        {familyOpen && <FamilySheet family={family} onClose={() => setFamilyOpen(false)} toast={showToast} />}
      </div>
      {storyTrip && <StoryPrint trip={storyTrip} />}
    </>
  );
}
