import { Plus, People } from '../components/Icons.jsx';
import { accentFor, countPhotos, coverBg } from '../lib/derive.js';
import { groupTrips, countdown } from '../lib/stages.js';

function TripCard({ t, onOpen, upcoming }) {
  const accent = accentFor(t.id);
  return (
    <div className="trip-card press-soft" onClick={() => onOpen(t.id)} role="button" tabIndex={0}>
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
          <span className="accent-dot" style={{ background: accent }} />{upcoming ? countdown(t) || 'planned' : countPhotos(t) + ' photos'}
        </span>
      </div>
    </div>
  );
}

export default function TripsHome({ trips, onOpen, onNewTrip, family, onFamily, toSort = 0, onSort }) {
  // upcoming (soonest first), possible (ideas from friends and family, not booked) and past trips
  const { upcoming, possible, past } = groupTrips(trips);
  const [featured, ...later] = upcoming;

  return (
    <div className="screen pad-tab">
      <header className="page-head wash" style={{ position: 'relative' }}>
        {family.available && (
          <button className={'family-btn press ' + (family.household ? family.status.state : 'none')} onClick={onFamily} aria-label="Account and sharing">
            <People color="#2A2520" />
            {family.household && <span className="family-btn-dot" />}
          </button>
        )}
        <div className="eyebrow">My journal</div>
        <h1 className="title-xl">Journals</h1>
      </header>

      {toSort > 0 && (
        <section className="sec" style={{ paddingTop: 4, paddingBottom: 8 }}>
          <button className="sort-banner press-soft" onClick={onSort}>
            <span className="sort-count">{toSort}</span>
            <span className="grow">
              <span className="sort-banner-title">{toSort === 1 ? 'An email to sort' : `${toSort} emails to sort`}</span>
              <span className="sort-banner-sub">Pick the trip they belong to</span>
            </span>
          </button>
        </section>
      )}

      {featured && (
        <section className="sec" style={{ paddingTop: 8 }}>
          <div className="sec-label"><span className="tick" style={{ background: '#E2A32B' }} />Up next</div>
          <div className="featured press-soft" onClick={() => onOpen(featured.id)} role="button" tabIndex={0}>
            <div className="fill" style={coverBg(featured)} />
            <div className="fill" style={{ background: 'linear-gradient(to top, rgba(48,26,14,0.76) 0%, rgba(48,26,14,0.10) 46%, rgba(48,26,14,0) 72%)' }} />
            <div className="status-pill">Upcoming · {countdown(featured) || 'planned'}</div>
            <div className="featured-text">
              <div className="featured-title">{featured.title}</div>
              <div className="meta-row"><span>{featured.place}</span><span className="dot-sep">·</span><span>{featured.dates}</span></div>
            </div>
          </div>
        </section>
      )}

      <section className="sec" style={{ paddingTop: featured ? 24 : 8 }}>
        <div className="sec-label" style={{ marginBottom: 13 }}><span className="tick" style={{ background: '#E2A32B' }} />{featured ? 'Also upcoming' : 'Upcoming'}</div>
        <div className="stack-16 journeys">
          <div className="new-trip press" onClick={onNewTrip} role="button" tabIndex={0}>
            <Plus /> Start a new trip
          </div>
          {later.map((t) => <TripCard key={t.id} t={t} onOpen={onOpen} upcoming />)}
        </div>
      </section>

      {possible.length > 0 && (
        <section className="sec" style={{ paddingTop: 24 }}>
          <div className="sec-label"><span className="tick" style={{ background: '#A9538C' }} />Possible trips</div>
          <div className="stack-9 possible-list">
            {possible.map((t) => (
              <div key={t.id} className="possible-card press-soft" onClick={() => onOpen(t.id)} role="button" tabIndex={0}>
                <div className="possible-swatch" style={coverBg(t)} />
                <div className="grow">
                  <div className="possible-title">{t.title}</div>
                  <div className="possible-sub">{[t.place, t.dates].filter(Boolean).join(' · ')}</div>
                  {t.companions && <div className="possible-who">with {t.companions}</div>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section className="sec" style={{ paddingTop: 28 }}>
          <div className="sec-label" style={{ marginBottom: 13 }}><span className="tick" style={{ background: '#2E7C86' }} />Past trips</div>
          <div className="stack-16 journeys">
            {past.map((t) => <TripCard key={t.id} t={t} onOpen={onOpen} />)}
          </div>
        </section>
      )}
    </div>
  );
}
