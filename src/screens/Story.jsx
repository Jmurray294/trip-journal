import { Chevron, Printer } from '../components/Icons.jsx';
import { countPhotos, countPlaces, coverBg, photoBg } from '../lib/derive.js';

export default function Story({ trip, onClose, onPrint }) {
  return (
    <div className="screen pad-tab" style={{ background: '#FBF6EC' }}>
      <div className="hero story-hero">
        <div className="fill" style={coverBg(trip)} />
        <div className="fill" style={{ background: 'linear-gradient(to top, rgba(26,22,18,0.82) 0%, rgba(26,22,18,0.15) 55%, rgba(26,22,18,0.3) 100%)' }} />
        <button className="back-btn press" style={{ zIndex: 3 }} onClick={onClose} aria-label="Close story"><Chevron /></button>
        <div className="story-cover-text">
          <div className="story-eyebrow">A trip story</div>
          <div className="story-title">{trip.title}</div>
          <div className="story-rule" />
          <div style={{ fontSize: 14, opacity: 0.9 }}>{trip.place}</div>
          <div className="mono-12" style={{ opacity: 0.75, marginTop: 4 }}>{trip.dates}</div>
        </div>
      </div>

      <div className="story-body">
      <div className="story-stats">
        <div><div className="story-stat">{trip.days.length}</div><div className="stat-label" style={{ fontSize: 10 }}>entries</div></div>
        <div><div className="story-stat">{countPlaces(trip)}</div><div className="stat-label" style={{ fontSize: 10 }}>places</div></div>
        <div><div className="story-stat">{countPhotos(trip)}</div><div className="stat-label" style={{ fontSize: 10 }}>photos</div></div>
      </div>

      {trip.days.length === 0 && (
        <div className="empty-block" style={{ padding: '50px 26px' }}>
          <div className="empty-block-title" style={{ fontSize: 19 }}>Nothing to tell yet</div>
          <div className="empty-sub">Add a few memories and your story will build itself.</div>
        </div>
      )}

      {trip.days.map((d, i) => (
        <div key={i} style={{ padding: '34px 0 10px' }}>
          <div style={{ padding: '0 22px' }}>
            <div className="spread-head">
              <div className="spread-day">Day {d.num}</div>
              <div className="spread-rule" />
              <div className="spread-date">{d.date}</div>
            </div>
            <div className="spread-title">{d.title}</div>
            {d.place && <div className="place-row" style={{ marginTop: 8 }}><span className="olive-dot" style={{ width: 5, height: 5 }} />{d.place}</div>}
          </div>
          {(d.photos || []).length > 0 && (
            <div className="story-photos">
              {d.photos.map((p, j) => (
                <div key={j} className="story-photo">
                  <div className="fill" style={photoBg(p)} />
                  {p.label && p.label.trim() && <div className="story-caption"><div>{p.label}</div></div>}
                </div>
              ))}
            </div>
          )}
          {d.note && d.note.trim() && <div className="story-note">{d.note}</div>}
        </div>
      ))}

      {trip.song && (
        <div className="story-song">
          <div className="story-song-eyebrow">The trip song</div>
          <div className="story-song-title">{trip.song.title}</div>
          <div style={{ fontSize: 12.5, color: '#7A7060', marginTop: 3 }}>{trip.song.mood}</div>
          <div className="story-song-lines">
            {trip.song.lines.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        </div>
      )}

      <div style={{ padding: '30px 22px 0' }}>
        <button className="btn-primary press" style={{ fontSize: 15.5, boxShadow: '0 6px 16px rgba(164,80,47,0.36)' }} onClick={onPrint}>
          <Printer /> Save as PDF / print
        </button>
        <div className="print-hint">On iPhone: choose <strong>Options → Save as PDF</strong> in the share sheet.</div>
      </div>
      </div>
    </div>
  );
}

// Compact layout shown only in @media print (letter page, 0.55in margins).
export function StoryPrint({ trip }) {
  return (
    <div className="story-print">
      <div className="print-page" style={{ textAlign: 'center', paddingBottom: 34 }}>
        <div style={{ position: 'relative', height: 300, borderRadius: 10, overflow: 'hidden' }}>
          <div className="fill" style={coverBg(trip)} />
          <div className="fill" style={{ background: 'linear-gradient(to top, rgba(26,22,18,0.72), rgba(26,22,18,0.18))' }} />
          <div style={{ position: 'absolute', left: 30, right: 30, bottom: 34, color: '#fff' }}>
            <div className="mono" style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', opacity: 0.85 }}>A trip story</div>
            <div className="serif" style={{ fontSize: 44, fontWeight: 600, lineHeight: 1.03, marginTop: 12 }}>{trip.title}</div>
            <div style={{ width: 40, height: 1.5, background: 'rgba(255,255,255,0.6)', margin: '16px auto' }} />
            <div style={{ fontSize: 16, opacity: 0.92 }}>{trip.place}</div>
            <div className="mono" style={{ fontSize: 13, opacity: 0.78, marginTop: 5 }}>{trip.dates}</div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 40, marginTop: 24 }}>
          {[[trip.days.length, 'entries'], [countPlaces(trip), 'places'], [countPhotos(trip), 'photos']].map(([n, l]) => (
            <div key={l}><div className="serif" style={{ fontSize: 24, fontWeight: 600, lineHeight: 1 }}>{n}</div><div className="stat-label" style={{ fontSize: 10, letterSpacing: 1, marginTop: 4 }}>{l}</div></div>
          ))}
        </div>
      </div>

      {trip.days.map((d, i) => {
        const n = (d.photos || []).length;
        const hp = n <= 2 ? 150 : 132;
        return (
          <div key={i} className="print-page" style={{ paddingBottom: 34 }}>
            <div className="spread-head" style={{ gap: 12 }}>
              <div className="spread-day" style={{ letterSpacing: 2 }}>Day {d.num}</div>
              <div className="spread-rule" />
              <div className="spread-date">{d.date}</div>
            </div>
            <div className="serif" style={{ fontSize: 28, fontWeight: 600, lineHeight: 1.12, marginTop: 12 }}>{d.title}</div>
            {d.place && <div style={{ fontSize: 13, color: '#7A7060', marginTop: 6 }}>{d.place}</div>}
            {n > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: n === 1 ? '1fr' : '1fr 1fr', gap: 8, marginTop: 14 }}>
                {d.photos.map((p, j) => <div key={j} style={{ ...photoBg(p), width: '100%', height: hp, borderRadius: 14 }} />)}
              </div>
            )}
            {d.note && d.note.trim() && <div className="serif" style={{ fontSize: '14pt', lineHeight: 1.6, color: '#3A342C', marginTop: 16 }}>{d.note}</div>}
          </div>
        );
      })}

      {trip.song && (
        <div className="print-page print-break" style={{ textAlign: 'center', padding: '40px 30px', background: '#EFE7D8', borderRadius: 12 }}>
          <div className="mono" style={{ fontSize: 11, letterSpacing: 2.5, color: '#A4502F', textTransform: 'uppercase' }}>The trip song</div>
          <div className="serif" style={{ fontSize: 30, fontWeight: 600, marginTop: 10 }}>{trip.song.title}</div>
          <div style={{ fontSize: 13, color: '#7A7060', marginTop: 4 }}>{trip.song.mood}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 22 }}>
            {trip.song.lines.map((l, i) => <div key={i} className="serif" style={{ fontSize: '13pt', fontStyle: 'italic', lineHeight: 1.5, color: '#4A433A' }}>{l}</div>)}
          </div>
        </div>
      )}
    </div>
  );
}
