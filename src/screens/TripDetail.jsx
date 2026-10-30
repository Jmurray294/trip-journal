import { useState } from 'react';
import { Chevron, Share, Book, Plus, Trash, Play, Pause, ToSuno, Upload, Note, Rewrite, Music } from '../components/Icons.jsx';
import { countPhotos, countPlaces, coverBg, photoBg, songAudioSrc, money, dayLabel, costTotals } from '../lib/derive.js';
import { fmtTime, activeLine } from '../lib/song.js';
import { stageLabel, tripStage } from '../lib/stages.js';
import TripAlerts from '../components/TripAlerts.jsx';
import Explore from './Explore.jsx';

import { Bookings, Budget, Documents } from './TripSections.jsx';

// Paid / still-due totals at a glance; the full list lives in the Budget tab.
function CostsCard({ costs, onOpen }) {
  const { totals, nextDue, pending } = costTotals(costs);
  return (
    <button className="costs-card press-soft" onClick={onOpen}>
      <div className="mono-label">Costs</div>
      <div className="costs-totals">
        {totals.map((t) => (
          <div key={t.currency} className="row-22">
            <div><div className="stat-num" style={{ color: '#6E8B3D' }}>{money(t.paid, t.currency)}</div><div className="stat-label">paid</div></div>
            {t.due > 0 && <div><div className="stat-num" style={{ color: '#BE5F28' }}>{money(t.due, t.currency)}</div><div className="stat-label">still due</div></div>}
          </div>
        ))}
      </div>
      {pending.map((c) => (
        <div key={c.id} className="costs-next pending">Pending charge {money(c.amount, c.currency)}{c.date ? ' · authorized ' + dayLabel(c.date) : ''}</div>
      ))}
      {nextDue && <div className="costs-next">Next payment {money(nextDue.amount, nextDue.currency)} due {dayLabel(nextDue.date)}</div>}
      <div className="costs-more">See budget →</div>
    </button>
  );
}

// The trip link for fellow travelers: they see the plan and add photos and notes, no account.
function TripLinkCard({ trip, onMake, onSend, onStop }) {
  return (
    <div className="trip-link-card">
      <div className="mono-label">Trip link</div>
      <div className="sheet-copy">
        {trip.shareToken
          ? 'Anyone with the link can see the plan and add their photos and notes. Costs, confirmation numbers and travel documents stay private.'
          : 'Send the people you travel with a link. They can see the plan and add their photos and notes for the story and album, no account needed.'}
      </div>
      {trip.shareToken ? (
        <div className="row-8" style={{ marginTop: 12 }}>
          <button className="btn-primary small press" onClick={onSend}><Share /> Send link</button>
          <button className="btn-muted press" onClick={onStop}>Turn off</button>
        </div>
      ) : (
        <button className="btn-secondary press" onClick={onMake}>Create trip link</button>
      )}
    </div>
  );
}

// " · added Oct 22" when an item went into the journal on a different day from the one it's about
// (with the year when it isn't this one)
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function addedNote(d) {
  if (typeof d.added !== 'number') return '';
  const a = new Date(d.added);
  const l = MON[a.getMonth()] + ' ' + a.getDate();
  if (l === d.date) return '';
  return ' · added ' + l + (a.getFullYear() !== new Date().getFullYear() ? ', ' + a.getFullYear() : '');
}

const TABS = [['itinerary', 'Itinerary'], ['bookings', 'Bookings'], ['budget', 'Budget'], ['explore', 'Explore'], ['documents', 'Documents']];

function Spinner({ size = 16 }) {
  return <span className="spin-sm" style={{ width: size, height: size }} />;
}

function SongCard({ trip, song, busy, audioBusy, onWrite, onToggle, onToggleLyrics, onSuno, onPickAudio, onRemoveAudio }) {
  const sg = trip.song;
  if (!sg) {
    return (
      <div className="song-card" style={{ padding: 20, boxShadow: '0 10px 28px rgba(58,42,31,0.28)' }}>
        <div className="song-eyebrow">Trip song</div>
        <div className="song-heading">Turn this trip into a song</div>
        <div className="song-hint">
          {trip.days.length >= 2 ? 'We will turn your entries into lyrics you can play back.' : 'Add at least two memories and we can write your song.'}
        </div>
        {busy
          ? <div className="song-busy"><Spinner size={17} /><span>Writing your song…</span></div>
          : <button className="btn-song press" onClick={onWrite}><Music /> Write our song</button>}
      </div>
    );
  }

  const audioUrl = songAudioSrc(sg);
  const hasAudio = !!(sg.audio || sg.audioPath);
  const dur = hasAudio ? (song.audioDur || sg.audioDur || sg.duration) : sg.duration;
  const active = activeLine(song.progress, dur, sg.lines.length);
  const pct = Math.min(100, (song.progress / dur) * 100);

  return (
    <div className="song-card">
      <div className="row-14">
        <div className="song-thumb">
          <div className="fill" style={coverBg(trip)} />
          {song.playing && (
            <div className="eq">
              {[0, 0.15, 0.3, 0.45].map((d) => <div key={d} className="eq-bar" style={{ animationDelay: d + 's' }} />)}
            </div>
          )}
        </div>
        <div className="grow">
          <div className="song-eyebrow">Your trip song</div>
          <div className="song-title">{sg.title}</div>
          <div className="song-mood">{sg.mood}</div>
        </div>
        <button className="song-play press" onClick={() => (hasAudio && !audioUrl ? onToggle(dur, null, true) : onToggle(dur, audioUrl))} aria-label={song.playing ? 'Pause song' : 'Play song'}>
          {song.playing ? <Pause /> : <Play />}
        </button>
      </div>
      <div className="transport">
        <span className="t-time">{fmtTime(song.progress)}</span>
        <div className="t-track"><div className="t-fill" style={{ width: pct + '%' }} /></div>
        <span className="t-time" style={{ textAlign: 'right' }}>{fmtTime(dur)}</span>
      </div>

      {!hasAudio && (
        <div className="audio-attach">
          <div className="audio-copy">Send these lyrics to Suno, then bring the MP3 back here and it will really play, in time with the words.</div>
          {sg.lines.length > 0 && <button className="btn-suno press" onClick={onSuno}><ToSuno /> Copy lyrics &amp; open Suno</button>}
          {audioBusy
            ? <div className="row-9" style={{ marginTop: 10 }}><Spinner size={15} /><span className="audio-copy">Adding audio…</span></div>
            : (
              <label className="btn-audio press">
                <input type="file" accept="audio/*" onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; onPickAudio(f); }} hidden />
                <Upload /> Add song audio
              </label>
            )}
        </div>
      )}
      {hasAudio && (
        <div className="audio-row">
          <Note />
          <span className="audio-name">{sg.audioName || 'audio attached'}</span>
          <button className="audio-remove" onClick={onRemoveAudio}>Remove</button>
        </div>
      )}

      <div className="row-8" style={{ marginTop: 14 }}>
        <button className="btn-lyrics" onClick={onToggleLyrics}>{song.lyricsOpen ? 'Hide lyrics' : 'Show lyrics'}</button>
        {!busy && <button className="btn-rewrite" onClick={onWrite}><Rewrite /> Rewrite</button>}
      </div>
      {busy && <div className="song-busy" style={{ marginTop: 12, padding: 12, borderRadius: 12 }}><Spinner /><span>Writing a new version…</span></div>}
      {song.lyricsOpen && (
        <div className="lyrics">
          {sg.lines.map((l, i) => <div key={i} className={'lyric' + (i === active ? ' on' : '')}>{l}</div>)}
        </div>
      )}
    </div>
  );
}

export default function TripDetail(p) {
  const { trip } = p;
  const [tab, setTab] = useState('itinerary');
  // while planning, what just came in matters most; a finished trip reads as its story, day by day
  const [order, setOrder] = useState(() => (tripStage(trip) === 'past' ? 'trip' : 'newest'));
  const when = (d) => (typeof d.added === 'number' ? d.added : d.pos ?? 0);
  const shown = trip.days.map((d, idx) => ({ d, idx })); // idx: its place in trip.days, for delete
  if (order === 'newest') shown.sort((a, b) => when(b.d) - when(a.d) || b.idx - a.idx);
  const bookingCount = (trip.days || []).filter((d) => d.booking || (d.source === 'email' && d.kind)).length;
  const counts = { itinerary: trip.days.length, bookings: bookingCount, budget: (trip.costs || []).length };
  return (
    <div className="screen pad-tab">
      <div className="hero detail-hero">
        <div className="fill" style={coverBg(trip)} />
        <div className="fill" style={{ background: 'linear-gradient(to top, rgba(48,26,14,0.82) 0%, rgba(48,26,14,0.10) 52%, rgba(30,20,14,0.22) 100%)' }} />
        <button className="back-btn press" onClick={p.onBack} aria-label="Back"><Chevron /></button>
        <div className="hero-text">
          <div className="status-chip">{stageLabel(trip)}</div>
          <div className="hero-title">{trip.title}</div>
          <div className="meta-row" style={{ marginTop: 8 }}><span>{trip.place}</span><span className="dot-sep">·</span><span>{trip.dates}</span></div>
        </div>
      </div>

      <TripAlerts trip={trip} travelers={p.travelers || []} home={p.home || {}} onOpen={p.onTravelers} />

      {trip.possible && (
        <div className="possible-banner">
          <div className="grow">
            <div className="possible-banner-title">Possible trip{trip.companions ? ' with ' + trip.companions : ''}</div>
            <div className="possible-banner-sub">Not booked yet. Bookings you forward for it will turn it into a plan.</div>
          </div>
          <div className="row-8">
            <button className="btn-muted press" onClick={p.onDeleteTrip}>Not going</button>
            <button className="btn-primary small press" onClick={p.onConfirmTrip}>We're going</button>
          </div>
        </div>
      )}

      <div className="detail-body">
      <div className="detail-side">
      <div className="stats-card">
        <div className="row-22">
          <div><div className="stat-num" style={{ color: '#BE5F28' }}>{trip.days.length}</div><div className="stat-label">entries</div></div>
          <div><div className="stat-num" style={{ color: '#2E7C86' }}>{countPlaces(trip)}</div><div className="stat-label">places</div></div>
          <div><div className="stat-num" style={{ color: '#C0761A' }}>{countPhotos(trip)}</div><div className="stat-label">photos</div></div>
        </div>
        <button className="btn-share press" onClick={p.onShare}><Share /> Share</button>
      </div>

      {p.household && <TripLinkCard trip={trip} onMake={p.onMakeLink} onSend={p.onSendLink} onStop={p.onStopLink} />}

      <button className="btn-story press" onClick={p.onStory}><Book /> View trip story</button>
      <button className="btn-story press" onClick={p.onBook}><Book /> {trip.book && trip.book.draft ? 'Open photo book' : 'Make a photo book'}</button>

      {(trip.costs || []).length > 0 && <CostsCard costs={trip.costs} onOpen={() => setTab('budget')} />}

      <div className="detail-song">
        <SongCard
          trip={trip} song={p.song} busy={p.songBusy} audioBusy={p.audioBusy}
          onWrite={p.onWriteSong} onToggle={p.onToggleSong} onToggleLyrics={p.onToggleLyrics}
          onSuno={p.onSendToSuno} onPickAudio={p.onPickAudio} onRemoveAudio={p.onRemoveAudio}
        />
      </div>
      </div>

      <div className="detail-main">
        <div className="trip-tabs" role="tablist" aria-label="Trip sections">
          {TABS.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={'trip-tab' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>
              {label}{counts[k] ? <span className="trip-tab-n">{counts[k]}</span> : null}
            </button>
          ))}
        </div>

        {tab === 'bookings' && <Bookings trip={trip} inbox={p.inbox} toast={p.toast} onUpload={p.household ? p.onUpload : null} />}
        {tab === 'budget' && <Budget trip={trip} onAddCost={p.onAddCost} onDeleteCost={p.onDeleteCost} onMarkPaid={p.onMarkPaid} onEditCost={p.onEditCost} />}
        {tab === 'explore' && <Explore trip={trip} signedIn={p.canExplore} busy={p.exploreBusy || new Set()}
          onAsk={p.onAskSuggestions} onAdd={p.onAddSuggestion} onDismiss={p.onDismissSuggestion} />}
        {tab === 'documents' && <Documents trip={trip} household={p.household} inbox={p.inbox} toast={p.toast} onUpload={p.onUpload} />}

        {tab === 'itinerary' && <>
        <div className="timeline-head">
          <div className="mono-label">{trip.timelineLabel}</div>
          <div className="row-8">
            {/* many photos at once: each goes to its day and place by when and where it was taken */}
            <label className="btn-soft-pill press" title="Select a day's or a trip's photos — they're sorted by date and place">
              <input type="file" accept="image/*" multiple hidden onChange={(e) => { const f = e.target.files; if (f && f.length) p.onAddPhotos([...f]); e.target.value = ''; }} />
              <Plus size={13} w={1.8} /> Add photos
            </label>
            <button className="btn-soft-pill press" onClick={p.onAdd}><Plus size={13} w={1.8} /> Add memory</button>
          </div>
        </div>

        {trip.days.length === 0 && (
          <div className="empty-first press" onClick={p.onAdd} role="button" tabIndex={0}>
            <Plus size={26} />
            <div className="empty-title">Add your first memory</div>
            <div className="empty-sub">A photo, a place, and a few words.</div>
          </div>
        )}

        {trip.days.length > 1 && (
          <div className="order-segs">
            <button className={'seg' + (order === 'newest' ? ' active' : '')} onClick={() => setOrder('newest')}>Newest first</button>
            <button className={'seg' + (order === 'trip' ? ' active' : '')} onClick={() => setOrder('trip')}>Trip order</button>
          </div>
        )}

        {shown.map(({ d, idx }, i) => (
          <div key={d.id || idx} className={'entry' + (d.booking && d.booking.status === 'cancelled' ? ' cancelled' : '')}>
            <div className="entry-gutter">
              <div className="entry-num">{i + 1}</div>
              <div className="entry-line" />
            </div>
            <div className="entry-body">
              <div className="entry-top">
                <div style={{ minWidth: 0 }}>
                  <div className="entry-date">{d.kind && d.kind !== 'Booking' ? d.kind + ' · ' : ''}{d.date}{d.by ? ' · from ' + d.by : ''}{addedNote(d)}</div>
                  <div className="entry-title">{d.title}</div>
                </div>
                <button className="del-btn press" onClick={() => p.onDeleteEntry(idx)} aria-label="Delete memory"><span><Trash /></span></button>
              </div>
              {d.place && <div className="place-row"><span className="olive-dot" />{d.place}</div>}
              {(d.photos || []).length > 0 && (
                <div className="photo-strip">
                  {d.photos.map((ph, i) => (
                    <div key={i} className="strip-tile">
                      <div className="fill" style={photoBg(ph)} />
                      {((ph.label && ph.label.trim()) || ph.by) && <div className="strip-label">{(ph.label && ph.label.trim()) || ph.by}</div>}
                    </div>
                  ))}
                </div>
              )}
              {d.note && d.note.trim() && <div className="entry-note">{d.note}</div>}
            </div>
          </div>
        ))}
        </>}

        <button className="btn-delete-trip press" style={{ marginTop: 26 }} onClick={p.onDeleteTrip}><Trash color="#A4502F" /> Delete this trip</button>
      </div>
      </div>
    </div>
  );
}
