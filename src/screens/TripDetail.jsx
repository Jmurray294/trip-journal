import { useState } from 'react';
import { Chevron, Share, Book, Plus, Trash, Play, Pause, ToSuno, Upload, Note, Rewrite, Music } from '../components/Icons.jsx';
import { countPhotos, countPlaces, coverBg, photoBg, songAudioSrc, money, dayLabel, costTotals } from '../lib/derive.js';
import { fmtTime, activeLine } from '../lib/song.js';
import { stageLabel, tripStage } from '../lib/stages.js';
import { collagePhotos, coverRef, isCover } from '../lib/cover.js';
import TripAlerts from '../components/TripAlerts.jsx';
import Explore from './Explore.jsx';
import PhotoViewer from '../components/PhotoViewer.jsx';

import { Itinerary, Budget, Documents, isPlan } from './TripSections.jsx';

// Paid / still-due totals at a glance; the full list lives in the Budget tab.
function CostsCard({ costs, onOpen }) {
  const { totals, nextDue, pending } = costTotals(costs);
  return (
    <button className="costs-card press-soft" onClick={onOpen}>
      <div className="mono-label">Costs</div>
      <div className="costs-totals">
        {totals.map((t) => (
          <div key={t.currency} className="row-22">
            <div><div className="stat-num" style={{ color: '#2A7D34' }}>{money(t.paid, t.currency)}</div><div className="stat-label">paid</div></div>
            {t.due > 0 && <div><div className="stat-num" style={{ color: '#B06A1F' }}>{money(t.due, t.currency)}</div><div className="stat-label">still due</div></div>}
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

// the whole photo, never cropped: a blurred, dimmed copy of it fills the space around a tall shot
function WholePhoto({ p }) {
  const bg = photoBg(p);
  return (<>
    <span className="whole-blur" style={bg} />
    <span className="whole-img" style={{ ...bg, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }} />
  </>);
}

// an on/off switch with its label and one line saying what it means
function ShareRow({ title, sub, on, onToggle, children }) {
  return (
    <div className={'share-row' + (on ? ' on' : '')}>
      <div className="share-row-head">
        <div className="grow">
          <div className="share-row-title">{title}</div>
          <div className="share-row-sub">{sub}</div>
        </div>
        <button className={'switch' + (on ? ' on' : '')} role="switch" aria-checked={on} aria-label={title} onClick={onToggle}><span /></button>
      </div>
      {on && children && <div className="share-row-more">{children}</div>}
    </div>
  );
}

// Who can see this trip, in one place: followers (family at home, in the portal: read only) and the
// travel crew (people on the trip, by link: they add their photos and notes). Neither ever sees costs,
// confirmation numbers or documents.
function SharingCard({ trip, followers, link, p }) {
  const fOn = !!trip.followers;
  const n = followers ? followers.followers.length + followers.invites.length : 0;
  const book = !!(trip.book && trip.book.draft);
  const song = !!(trip.song && (trip.song.audioPath || trip.song.audio));
  return (
    <div className="trip-link-card share-card">
      <div className="mono-label">Sharing</div>
      {followers && (
        <ShareRow title="Followers" sub={fOn ? 'Family at home can follow this trip: journal, photos, book and song.' : 'Family at home can’t see this trip.'}
          on={fOn} onToggle={() => p.onFollowers({ followers: !fOn })}>
          <div className="share-links">
            <span>{n ? `${n} following` : 'No one invited yet'}</span>
            <button className="btn-link inline" onClick={p.onManageFollowers}>{n ? 'Manage' : 'Invite'}</button>
            <button className="btn-link inline" onClick={p.onPreviewFollowers}>Preview</button>
          </div>
          <label className="share-select">
            <span>Posting</span>
            <select value={trip.followersLater ? 'later' : 'live'} onChange={(e) => p.onFollowers({ followersLater: e.target.value === 'later' })}>
              <option value="live">Live, as you post</option>
              <option value="later">A day late (safer while away)</option>
            </select>
          </label>
          {(book || song) && n > 0 && (
            <div className="stack-9" style={{ marginTop: 10 }}>
              {book && <button className="btn-secondary press" style={{ marginTop: 0 }} onClick={() => p.onAnnounce('book')}>Email followers: the book is ready</button>}
              {song && <button className="btn-secondary press" style={{ marginTop: 0 }} onClick={() => p.onAnnounce('song')}>Email followers: the song is ready</button>}
            </div>
          )}
        </ShareRow>
      )}
      <ShareRow title="Travel crew" sub={trip.shareToken ? 'Anyone with the link can see the plan and add their photos and notes.' : 'Send the people on this trip a link to add their photos and notes.'}
        on={!!trip.shareToken} onToggle={() => (trip.shareToken ? p.onStopLink() : p.onMakeLink())}>
        <div className="row-8">
          <button className="btn-primary small press" onClick={p.onSendLink}><Share /> Send link</button>
          <button className="btn-muted press" onClick={p.onCopyLink}>Copy link</button>
        </div>
        <div className="trip-link-url">{link}</div>
      </ShareRow>
      <button className="btn-link inline share-copy" onClick={p.onShare}>Copy itinerary as text</button>
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

const TABS = [['itinerary', 'Itinerary'], ['journal', 'Journal'], ['photos', 'Photos'], ['budget', 'Budget'], ['explore', 'Explore'], ['documents', 'Documents']];

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
  const [tab, setTab] = useState(p.initialTab || 'itinerary');
  // while planning, what just came in matters most; a finished trip reads as its story, day by day
  const [order, setOrder] = useState(() => (tripStage(trip) === 'past' ? 'trip' : 'newest'));
  const when = (d) => (typeof d.added === 'number' ? d.added : d.pos ?? 0);
  // Itinerary is the plan (bookings, planned activities); Journal is what you wrote or dictated; Photos has the photos
  const shown = trip.days.map((d, idx) => ({ d, idx })).filter(({ d }) => d.source !== 'photos' && !isPlan(d)); // idx: its place in trip.days, for delete
  if (order === 'newest') shown.sort((a, b) => when(b.d) - when(a.d) || b.idx - a.idx);
  const planCount = (trip.days || []).filter(isPlan).length;
  const counts = { itinerary: planCount, journal: shown.length, photos: countPhotos(trip), budget: (trip.costs || []).length };
  const photoCount = counts.photos;
  const collage = trip.coverSrc ? [] : collagePhotos(trip, 5);
  const extra = photoCount - collage.length;
  return (
    <div className="screen pad-tab">
      <div className={'hero detail-hero' + (!collage.length && !trip.coverSrc ? ' short' : '') + (collage.length >= 3 ? ' collage' : '')}>
        {collage.length >= 3 ? (
          // the cover big on the left, more of the trip's photos beside it; any tile opens the Photos tab
          <div className={'fill hero-collage n' + collage.length}>
            {collage.map((c, i) => (
              <button key={c.ref} className={'hero-tile' + (i === 0 ? ' main' : '')} style={i === 0 ? undefined : photoBg(c.p)} onClick={() => setTab('photos')}
                aria-label={i === 0 ? 'Trip photos' : 'More photos'} tabIndex={i === 0 ? 0 : -1}>
                {i === 0 && <WholePhoto p={c.p} />}
                {/* phones show three tiles, wider screens all of them: each counts what's left */}
                {i === 2 && photoCount > 3 && <span className="hero-more ph">+{photoCount - 3}</span>}
                {i === collage.length - 1 && extra > 0 && <span className="hero-more wd">+{extra}</span>}
              </button>
            ))}
          </div>
        ) : !trip.coverSrc && collage.length ? <div className="fill"><WholePhoto p={collage[0].p} /></div> : <div className="fill" style={coverBg(trip)} />}
        <div className="fill hero-shade" style={{ background: 'linear-gradient(to top, rgba(10,18,32,0.82) 0%, rgba(10,18,32,0.10) 52%, rgba(10,18,32,0.18) 100%)' }} />
        <button className="back-btn press" onClick={p.onBack} aria-label="Back"><Chevron /></button>
        <div className="hero-text">
          <div className="status-chip">{stageLabel(trip)}</div>
          <div className="hero-title">{trip.title}</div>
          <div className="meta-row" style={{ marginTop: 8 }}><span>{trip.place}</span><span className="dot-sep">·</span><span>{trip.dates}</span>{photoCount > 0 && <><span className="dot-sep">·</span><span>{photoCount} {photoCount === 1 ? 'photo' : 'photos'}</span></>}</div>
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
          <div><div className="stat-num" style={{ color: '#1F2329' }}>{planCount + shown.length}</div><div className="stat-label">entries</div></div>
          <div><div className="stat-num" style={{ color: '#1B3FA8' }}>{countPlaces(trip)}</div><div className="stat-label">places</div></div>
          <div><div className="stat-num" style={{ color: '#6B3FA0' }}>{countPhotos(trip)}</div><div className="stat-label">photos</div></div>
        </div>
      </div>

      {p.household && <SharingCard trip={trip} followers={p.followers} link={p.tripLink} p={p} />}

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

        {tab === 'itinerary' && <Itinerary trip={trip} inbox={p.inbox} toast={p.toast} onUpload={p.household ? p.onUpload : null} onDelete={p.onDeleteEntry} />}
        {tab === 'budget' && <Budget trip={trip} onAddCost={p.onAddCost} onDeleteCost={p.onDeleteCost} onMarkPaid={p.onMarkPaid} onEditCost={p.onEditCost} />}
        {tab === 'explore' && <Explore trip={trip} signedIn={p.canExplore} busy={p.exploreBusy || new Set()}
          onAsk={p.onAskSuggestions} onAdd={p.onAddSuggestion} onDismiss={p.onDismissSuggestion} />}
        {tab === 'photos' && <TripPhotos trip={trip} onAddPhotos={p.onAddPhotos} onDeletePhoto={p.onDeletePhoto} onCaption={p.onPhotoCaption} onCover={p.onSetCover} />}
        {tab === 'documents' && <Documents trip={trip} household={p.household} inbox={p.inbox} toast={p.toast} onUpload={p.onUpload} />}

        {tab === 'journal' && <>
        <div className="timeline-head">
          <div className="mono-label">Journal</div>
          <div className="row-8">
            <button className="btn-soft-pill press" onClick={p.onAdd}><Plus size={13} w={1.8} /> Add memory</button>
          </div>
        </div>

        {shown.length === 0 && (
          <div className="empty-first press" onClick={p.onAdd} role="button" tabIndex={0}>
            <Plus size={26} />
            <div className="empty-title">Add your first memory</div>
            <div className="empty-sub">What happened, in a few words: type it, or use Dictate.</div>
          </div>
        )}

        {shown.length > 1 && (
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
              {d.note && d.note.trim() && <div className="entry-note">{d.note}</div>}
              {(d.photos || []).length > 0 && (
                <button className="link-btn entry-photos" onClick={() => setTab('photos')}>
                  {d.photos.length} {d.photos.length === 1 ? 'photo' : 'photos'} →
                </button>
              )}
            </div>
          </div>
        ))}
        </>}

        <button className="btn-delete-trip press" style={{ marginTop: 26 }} onClick={p.onDeleteTrip}><Trash color="#9E1B1B" /> Delete this trip</button>
      </div>
      </div>
    </div>
  );
}

// A trip's photos, by the day they were taken: tap one to see it full size.
function TripPhotos({ trip, onAddPhotos, onDeletePhoto, onCaption, onCover }) {
  const [open, setOpen] = useState(null);
  const days = new Map(); // date label → { pos, items }
  (trip.days || []).forEach((d, idx) => (d.photos || []).forEach((ph, pi) => {
    const k = d.date || 'Undated';
    if (!days.has(k)) days.set(k, { pos: d.pos ?? 0, items: [] });
    const g = days.get(k);
    g.pos = Math.min(g.pos, d.pos ?? 0);
    g.items.push({ p: ph, idx, pi, caption: (ph.label && ph.label.trim()) || (d.source === 'photos' ? '' : d.title), by: ph.by });
  }));
  const groups = [...days.entries()].sort((a, b) => a[1].pos - b[1].pos);
  const all = groups.flatMap(([, g]) => g.items);
  return (
    <>
      <div className="timeline-head">
        <div className="mono-label">Photos</div>
        <label className="btn-soft-pill press" title="Pick a day's or a trip's photos: each goes on the day it was taken">
          <input type="file" accept="image/*" multiple hidden onChange={(e) => { const f = e.target.files; if (f && f.length) onAddPhotos([...f]); e.target.value = ''; }} />
          <Plus size={13} w={1.8} /> Add photos
        </label>
      </div>
      {all.length === 0 && <div className="empty-sub" style={{ marginTop: 10 }}>No photos yet. Add them here or with the Photos button; each goes on the day it was taken.</div>}
      {groups.map(([label, g]) => (
        <div key={label} className="photo-day">
          <div className="photo-day-head">{label} <span>· {g.items.length} {g.items.length === 1 ? 'photo' : 'photos'}</span></div>
          <div className="photo-grid">
            {g.items.map((it) => (
              <div key={it.idx + ':' + it.pi} className="photo-cell">
                <button className="photo-open press-soft" style={photoBg(it.p)} onClick={() => setOpen(all.indexOf(it))} aria-label={'Open photo' + (it.caption ? ': ' + it.caption : '')} />
                {(it.p.label || '').trim()
                  ? <div className="photo-cap">{it.by && <span className="photo-cap-by">{it.by}</span>}{it.p.label.trim()}</div>
                  : it.by && <div className="strip-label">{it.by}</div>}
                <button className="thumb-x strip-x" onClick={() => onDeletePhoto(it.idx, it.pi)} aria-label="Remove photo"><span>×</span></button>
              </div>
            ))}
          </div>
        </div>
      ))}
      {open != null && all[open] && <PhotoViewer items={all.map((it) => ({ ...it, trip: '' }))} index={open} onIndex={setOpen} onClose={() => setOpen(null)}
        onCaption={onCaption && ((it, text) => onCaption(it.idx, it.pi, text))}
        onCover={onCover && ((it) => trip.days[it.idx] && onCover(trip.days[it.idx].id, it.pi))}
        isCover={(it) => !!trip.days[it.idx] && isCover(trip, trip.days[it.idx].id, it.pi)} />}
    </>
  );
}
