import { Chevron, Share, Book, Plus, Trash, Play, Pause, ToSuno, Upload, Note, Rewrite, Music } from '../components/Icons.jsx';
import { countPhotos, countPlaces, coverBg, photoBg, songAudioSrc } from '../lib/derive.js';
import { fmtTime, activeLine } from '../lib/song.js';

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
  return (
    <div className="screen pad-tab">
      <div className="hero detail-hero">
        <div className="fill" style={coverBg(trip)} />
        <div className="fill" style={{ background: 'linear-gradient(to top, rgba(48,26,14,0.82) 0%, rgba(48,26,14,0.10) 52%, rgba(30,20,14,0.22) 100%)' }} />
        <button className="back-btn press" onClick={p.onBack} aria-label="Back"><Chevron /></button>
        <div className="hero-text">
          <div className="status-chip">{trip.statusLabel}</div>
          <div className="hero-title">{trip.title}</div>
          <div className="meta-row" style={{ marginTop: 8 }}><span>{trip.place}</span><span className="dot-sep">·</span><span>{trip.dates}</span></div>
        </div>
      </div>

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

      <button className="btn-story press" onClick={p.onStory}><Book /> View trip story</button>

      <div className="detail-song">
        <SongCard
          trip={trip} song={p.song} busy={p.songBusy} audioBusy={p.audioBusy}
          onWrite={p.onWriteSong} onToggle={p.onToggleSong} onToggleLyrics={p.onToggleLyrics}
          onSuno={p.onSendToSuno} onPickAudio={p.onPickAudio} onRemoveAudio={p.onRemoveAudio}
        />
      </div>
      </div>

      <div className="detail-main">
        <div className="timeline-head">
          <div className="mono-label">{trip.timelineLabel}</div>
          <button className="btn-soft-pill press" onClick={p.onAdd}><Plus size={13} w={1.8} /> Add memory</button>
        </div>

        {trip.days.length === 0 && (
          <div className="empty-first press" onClick={p.onAdd} role="button" tabIndex={0}>
            <Plus size={26} />
            <div className="empty-title">Add your first memory</div>
            <div className="empty-sub">A photo, a place, and a few words.</div>
          </div>
        )}

        {trip.days.map((d, idx) => (
          <div key={idx} className="entry">
            <div className="entry-gutter">
              <div className="entry-num">{d.num}</div>
              <div className="entry-line" />
            </div>
            <div className="entry-body">
              <div className="entry-top">
                <div style={{ minWidth: 0 }}>
                  <div className="entry-date">{d.date}</div>
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
                      {ph.label && ph.label.trim() && <div className="strip-label">{ph.label}</div>}
                    </div>
                  ))}
                </div>
              )}
              {d.note && d.note.trim() && <div className="entry-note">{d.note}</div>}
            </div>
          </div>
        ))}

        <button className="btn-delete-trip press" onClick={p.onDeleteTrip}><Trash color="#A4502F" /> Delete this trip</button>
      </div>
      </div>
    </div>
  );
}
