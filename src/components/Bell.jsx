import { useEffect, useState } from 'react';

// The bell: what's new from the trips address and the iPhone Shortcut, with an unread count.

export const BellIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 8.2a5 5 0 0110 0c0 3.6 1.3 5 1.8 5.6H3.2c.5-.6 1.8-2 1.8-5.6z" /><path d="M8.2 16.4a1.9 1.9 0 003.6 0" />
  </svg>
);

function ago(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return 'just now';
  if (s < 3600) return Math.round(s / 60) + ' min ago';
  if (s < 86400) return Math.round(s / 3600) + ' hr ago';
  if (s < 86400 * 7) return Math.round(s / 86400) + (Math.round(s / 86400) === 1 ? ' day ago' : ' days ago');
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
const from = (s) => (String(s || '').match(/^"?([^"<]+?)"?\s*</) || [, s])[1];

function line(m) {
  if (m.status === 'to sort') return { kind: 'sort', where: 'Waiting under To sort — pick its trip' };
  const where = m.trip_title || '';
  if (String(m.message_id || '').startsWith('photos:')) return { kind: 'photos', where: `${m.items} ${m.items === 1 ? 'photo' : 'photos'} → ${where}` };
  if (/^Someday$/.test(where)) return { kind: 'someday', where: 'Saved to Someday' };
  return { kind: 'added', where: where ? `→ ${where}` : 'Added' };
}

export function BellButton({ unread, onClick, className = '' }) {
  return (
    <button className={'bell-btn press ' + className} onClick={onClick} aria-label={unread ? `What's new: ${unread} new` : "What's new"}>
      <BellIcon />
      {unread > 0 && <span className="bell-count">{unread > 9 ? '9+' : unread}</span>}
    </button>
  );
}

export function BellPanel({ activity, attention = [], onClose, onOpenTrip, onSort, onOpenItem }) {
  const [since] = useState(activity.seenAt); // what was new when the panel opened stays marked
  useEffect(() => {
    activity.markSeen();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="sheet-root">
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="grab" />
        <div className="serif" style={{ fontSize: 22, fontWeight: 600 }}>Needs a look</div>
        {attention.length === 0 ? (
          <div className="sheet-copy" style={{ marginTop: 4 }}>All clear: nothing overdue, nothing to sort.</div>
        ) : (
          <div className="bell-list">
            {attention.map((a) => (
              <button key={a.key} className={'bell-item attn press-soft ' + a.level} onClick={() => { onOpenItem(a.open); onClose(); }}>
                <span className={'bell-dot ' + a.level} />
                <span className="grow">
                  <span className="bell-subject">{a.text}</span>
                  {a.sub && <span className="bell-where">{a.sub}</span>}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="serif" style={{ fontSize: 22, fontWeight: 600, marginTop: 22 }}>What's new</div>
        <div className="sheet-copy" style={{ marginTop: 4 }}>Everything that came in to the trips address, newest first.</div>
        {activity.items.length === 0 ? (
          <div className="tv-empty" style={{ marginTop: 16 }}>Nothing yet — forwarded bookings, ideas and photos show up here.</div>
        ) : (
          <div className="bell-list">
            {activity.items.map((m) => {
              const l = line(m);
              const isNew = since && m.created_at > since;
              const open = () => { if (m.status === 'to sort') onSort(); else if (m.trip_id) onOpenTrip(m.trip_id); onClose(); };
              return (
                <button key={m.id} className={'bell-item press-soft' + (isNew ? ' new' : '')} onClick={open}>
                  <span className={'bell-dot ' + l.kind} />
                  <span className="grow">
                    <span className="bell-subject">{m.subject || '(no subject)'}</span>
                    <span className="bell-where">{l.where}</span>
                    <span className="bell-meta">{[from(m.sender), ago(m.created_at)].filter(Boolean).join(' · ')}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
        <button className="btn-primary press" style={{ marginTop: 20 }} onClick={onClose}>Done</button>
      </div>
    </div>
  );
}
