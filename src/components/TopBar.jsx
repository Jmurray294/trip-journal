import { Plus, TabTrips, TabMap, TabAlbums, TabTravelers } from './Icons.jsx';
import { BellIcon } from './Bell.jsx';
import { statusLabel } from '../screens/FamilySheet.jsx';

// Desktop header (≥900px wide): a letterhead with the family and account, then the navy band with the
// Add button, the section tabs and where you are. On phones the tab bar does this job.

function initials(name) {
  const w = (name || '').replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  return ((w[0] || '?')[0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase();
}

export default function TopBar({ tab, crumb, onTrips, onMap, onAlbums, onTravelers, onAdd, unread = null, onBell, family, onFamily }) {
  const me = family.members && family.members.find((m) => m.user_id === family.uid);
  const name = (me && me.display_name) || family.email || '';
  const tabs = [['trips', 'Trips', TabTrips, onTrips], ['map', 'Map', TabMap, onMap], ['albums', 'Albums', TabAlbums, onAlbums], ['travelers', 'Travelers', TabTravelers, onTravelers]];
  const here = tabs.find((t) => t[0] === tab);
  return (
    <header className="topbar">
      <div className="tb-letter">
        <button className="tb-brand" onClick={onTrips} title="All trips">
          <img src={import.meta.env.BASE_URL + 'icons/icon-192.png'} alt="" width="34" height="34" />
          <span>
            <span className="tb-brand-name">Trip Journal</span>
            <span className="tb-brand-sub">{family.household ? family.household.name : 'Family travel'}</span>
          </span>
        </button>
        <div className="grow" />
        {unread != null && (
          <button className="tb-icon" onClick={onBell} aria-label="What's new">
            <BellIcon size={20} />
            {unread > 0 && <span className="bell-count">{unread > 9 ? '9+' : unread}</span>}
          </button>
        )}
        {family.available && (
          <button className="tb-account" onClick={onFamily}>
            <span className="tb-account-text">
              <span className="tb-account-name">{family.session ? name || 'Signed in' : 'Sign in'}</span>
              <span className="tb-account-sub">{family.household ? statusLabel(family.status) || 'Connecting…' : 'Account & sharing'}</span>
            </span>
            <span className="tb-avatar">{family.session ? initials(name) : '?'}</span>
          </button>
        )}
      </div>
      <div className="tb-band">
        <div className="tb-row">
          <button className="tb-add press" onClick={onAdd}><Plus size={14} color="#fff" w={2.4} /> Add memory</button>
          <nav className="tb-tabs">
            {tabs.map(([key, label, Icon, on]) => (
              <button key={key} className={'tb-tab' + (tab === key ? ' on' : '')} onClick={on}><Icon /><span>{label}</span></button>
            ))}
          </nav>
        </div>
        <div className="tb-crumb">
          <strong>{here ? here[1] : 'Trips'}</strong>{crumb ? <> · {crumb}</> : null}
        </div>
      </div>
    </header>
  );
}
