import { Plus, People } from '../components/Icons.jsx';
import { accentFor, countPhotos, coverBg } from '../lib/derive.js';

export default function TripsHome({ trips, onOpen, onNewTrip, family, onFamily }) {
  const featured = trips.find((t) => t.planning);
  const others = trips.filter((t) => t !== featured);

  return (
    <div className="screen pad-tab">
      <header className="page-head wash" style={{ position: 'relative' }}>
        {family.available && (
          <button className={'family-btn press ' + (family.household ? family.status.state : 'none')} onClick={onFamily} aria-label="Family sharing">
            <People color="#2A2520" />
            {family.household && <span className="family-btn-dot" />}
          </button>
        )}
        <div className="eyebrow">My journal</div>
        <h1 className="title-xl">Journals</h1>
      </header>

      {featured && (
        <section className="sec" style={{ paddingTop: 8 }}>
          <div className="sec-label"><span className="tick" style={{ background: '#E2A32B' }} />Up next</div>
          <div className="featured press-soft" onClick={() => onOpen(featured.id)} role="button" tabIndex={0}>
            <div className="fill" style={coverBg(featured)} />
            <div className="fill" style={{ background: 'linear-gradient(to top, rgba(48,26,14,0.76) 0%, rgba(48,26,14,0.10) 46%, rgba(48,26,14,0) 72%)' }} />
            <div className="status-pill">Planning · {featured.countdown || 'planned'}</div>
            <div className="featured-text">
              <div className="featured-title">{featured.title}</div>
              <div className="meta-row"><span>{featured.place}</span><span className="dot-sep">·</span><span>{featured.dates}</span></div>
            </div>
          </div>
        </section>
      )}

      <section className="sec" style={{ paddingTop: 28 }}>
        <div className="sec-label" style={{ marginBottom: 13 }}><span className="tick" style={{ background: '#2E7C86' }} />Your journeys</div>
        <div className="stack-16 journeys">
          <div className="new-trip press" onClick={onNewTrip} role="button" tabIndex={0}>
            <Plus /> Start a new trip
          </div>
          {others.map((t) => {
            const accent = accentFor(t.id);
            return (
              <div key={t.id} className="trip-card press-soft" onClick={() => onOpen(t.id)} role="button" tabIndex={0}>
                <div className="trip-card-cover">
                  <div className="fill" style={coverBg(t)} />
                  <div className="fill" style={{ background: 'linear-gradient(to top, rgba(26,22,18,0.6), rgba(26,22,18,0) 62%)' }} />
                  <div className="trip-card-text">
                    <div className="trip-card-title">{t.title}</div>
                    <div className="trip-card-place">{t.place}</div>
                  </div>
                </div>
                <div className="trip-card-meta">
                  <span className="mono-13">{t.dates}</span>
                  <span className="accent-pill" style={{ background: accent + '1F', color: accent }}>
                    <span className="accent-dot" style={{ background: accent }} />{countPhotos(t)} photos
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
