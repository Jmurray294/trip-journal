import { Plus, People, Chevron } from '../components/Icons.jsx';
import { coverBg } from '../lib/derive.js';
import { groupTrips, countdown } from '../lib/stages.js';
import SomedayBoard from './SomedayBoard.jsx';
import Sidebar from '../components/Sidebar.jsx';
import { BellButton } from '../components/Bell.jsx';

// The Trips home is the trip up next. On a computer the Your trips card beside it lists the rest; on a
// phone that same list follows below. Someday ideas have their own page (view 'someday').
export default function TripsHome({ trips, onOpen, onNewTrip, family, onFamily, toSort = 0, onSort, someday, address, onSaveIdea, onPlanPlace, onRemoveIdea, unread, onBell, view, onSomeday, onHome }) {
  const [featured] = groupTrips(trips).upcoming;

  if (view === 'someday') {
    return (
      <div className="screen pad-tab">
        <header className="page-head wash">
          <button className="home-back" onClick={onHome}><Chevron /> Up next</button>
          <div className="eyebrow">Saved for one day</div>
          <h1 className="title-xl">Someday</h1>
        </header>
        {someday && <SomedayBoard groups={someday} address={address} onSave={onSaveIdea} onPlan={onPlanPlace} onRemove={onRemoveIdea} />}
      </div>
    );
  }

  return (
    <div className="screen pad-tab">
      <header className="page-head wash" style={{ position: 'relative' }}>
        {unread != null && <BellButton unread={unread} onClick={onBell} />}
        {family.available && (
          <button className={'family-btn press ' + (family.household ? family.status.state : 'none')} onClick={onFamily} aria-label="Account and sharing">
            <People color="#1340A1" />
            {family.household && <span className="family-btn-dot" />}
          </button>
        )}
        <div className="eyebrow">My journal</div>
        <h1 className="title-xl">Up next</h1>
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

      <section className="sec" style={{ paddingTop: 8 }}>
        {featured ? (
          <div className="featured press-soft" onClick={() => onOpen(featured.id)} role="button" tabIndex={0}>
            <div className="fill" style={coverBg(featured)} />
            <div className="fill" style={{ background: 'linear-gradient(to top, rgba(10,25,50,0.78) 0%, rgba(10,25,50,0.12) 46%, rgba(10,25,50,0) 72%)' }} />
            <div className="status-pill">Upcoming · {countdown(featured) || 'planned'}</div>
            <div className="featured-text">
              <div className="featured-title">{featured.title}</div>
              <div className="meta-row"><span>{featured.place}</span><span className="dot-sep">·</span><span>{featured.dates}</span></div>
            </div>
          </div>
        ) : (
          <div className="new-trip press" onClick={onNewTrip} role="button" tabIndex={0}>
            <Plus /> Nothing booked yet — start a new trip
          </div>
        )}
      </section>

      <section className="sec home-list">
        <Sidebar inline tab="trips" tripId={null} trips={trips} onOpenTrip={onOpen} onNewTrip={onNewTrip}
          someday={someday || []} onSomeday={onSomeday} />
      </section>
    </div>
  );
}
