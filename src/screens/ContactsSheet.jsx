import { useEffect, useState } from 'react';
import { mailtoMany, smsTo } from '../lib/contacts.js';
import { portalLink } from '../lib/followers.js';

// The family's contacts, to pick from instead of typing addresses again (lib/contacts.js).
// mode 'followers': tick people and invite them to follow along (email);
// mode 'guests': send a trip's or gathering's guest link (email to everyone ticked, or a text each);
// mode 'manage': just the list. In every mode you can add, change or remove a contact.
export default function ContactsSheet({ mode, contacts, followers, trip, link, gathering, onClose, toast }) {
  const [picked, setPicked] = useState(() => new Set());
  const [editing, setEditing] = useState(null); // contact id, or 'new'
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const following = new Set(followers ? [...followers.followers.map((f) => f.email), ...followers.invites.map((i) => i.email)] : []);
  // who can be ticked: an email to send to, and (for followers) not already following or invited
  const canPick = (c) => !!c.email && !(mode === 'followers' && following.has(c.email));
  const toggle = (id) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const chosen = contacts.list.filter((c) => picked.has(c.id) && canPick(c));

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); } catch (e) { toast((e && e.message) || 'Something went wrong'); } finally { setBusy(false); }
  };

  const guestText = trip ? (gathering
    ? `${trip.title}: see the plan, add to it (what you're bringing, who's coming), and add your photos and notes.\n\n${link}`
    : `${trip.title}: see the plan and add your photos and notes from the trip.\n\n${link}`) : '';

  const inviteFollowers = () => run(async () => {
    for (const c of chosen) await followers.invite(c.email);
    const body = `Follow along with our trips! See where we are, our photos, our photo books and trip songs.\n\n1. Open ${portalLink()}\n2. Sign in with this email address\n3. Enter the 6-digit code we email you (no password)`;
    window.location.href = mailtoMany(chosen.map((c) => c.email), 'Follow along with our trips', body);
    toast(`${chosen.length} invited to follow along`);
    setPicked(new Set());
  });
  const emailGuests = () => {
    window.location.href = mailtoMany(chosen.map((c) => c.email), trip.title, guestText);
    setPicked(new Set());
  };

  const title = mode === 'followers' ? 'Invite followers' : mode === 'guests' ? (gathering ? 'Send the guest link' : 'Send the trip link') : 'Contacts';
  const sub = mode === 'followers' ? 'Tick the people to invite. They get an email with how to sign in.'
    : mode === 'guests' ? 'Tick people to email the link to, or text it to one person.'
      : 'People you invite again and again. Only your family sees this list.';

  return (
    <div className="sheet-root" style={{ zIndex: 90 }}>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="grab" />
        <div className="serif" style={{ fontSize: 22, fontWeight: 600 }}>{title}</div>
        <div className="sheet-copy" style={{ marginTop: 4 }}>{sub}</div>
        {!contacts.ready && <div className="sheet-copy" style={{ color: '#9E1B1B' }}>Contacts need a one-time setup: run supabase/contacts.sql in Supabase.</div>}

        <div className="contacts">
          {contacts.list.length === 0 && editing !== 'new' && <div className="sheet-copy">No contacts yet. Add the people you invite most.</div>}
          {contacts.list.map((c) => (editing === c.id
            ? <ContactForm key={c.id} c={c} busy={busy} onCancel={() => setEditing(null)}
                onSave={(f) => run(async () => { await contacts.save(f, c.id); setEditing(null); })}
                onRemove={() => { if (window.confirm(`Remove ${c.name} from your contacts?`)) run(async () => { await contacts.remove(c.id); setEditing(null); }); }} />
            : (
              <div key={c.id} className={'contact' + (picked.has(c.id) ? ' on' : '')}>
                {mode !== 'manage' && (
                  <input type="checkbox" className="contact-check" checked={picked.has(c.id) && canPick(c)} disabled={!canPick(c)}
                    onChange={() => toggle(c.id)} aria-label={'Pick ' + c.name} />
                )}
                <button className="contact-main" onClick={() => (mode !== 'manage' && canPick(c) ? toggle(c.id) : setEditing(c.id))}>
                  <span className="contact-name">{c.name}</span>
                  <span className="contact-sub">{[c.email, c.phone].filter(Boolean).join(' · ')}</span>
                </button>
                {mode === 'followers' && following.has(c.email) && <span className="contact-tag">Following</span>}
                {mode === 'guests' && c.phone && <a className="btn-link inline" href={smsTo(c.phone, guestText)}>Text</a>}
                <button className="btn-link inline" onClick={() => setEditing(c.id)}>Edit</button>
              </div>
            )))}
          {editing === 'new'
            ? <ContactForm busy={busy} onCancel={() => setEditing(null)} onSave={(f) => run(async () => {
                const c = await contacts.save(f);
                setEditing(null);
                if (mode !== 'manage' && canPick(c)) setPicked((s) => new Set(s).add(c.id));
              })} />
            : <button className="btn-link inline contact-add" onClick={() => setEditing('new')}>+ Add a contact</button>}
        </div>

        {mode === 'followers' && (
          <button className="btn-primary press" style={{ marginTop: 18 }} disabled={busy || !chosen.length} onClick={inviteFollowers}>
            {chosen.length ? `Invite ${chosen.length} to follow along` : 'Tick who to invite'}
          </button>
        )}
        {mode === 'guests' && (
          <button className="btn-primary press" style={{ marginTop: 18 }} disabled={!chosen.length} onClick={emailGuests}>
            {chosen.length ? `Email the link to ${chosen.length}` : 'Tick who to email'}
          </button>
        )}
        <button className="btn-link" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

function ContactForm({ c = {}, busy, onSave, onCancel, onRemove }) {
  const [f, setF] = useState({ name: c.name || '', email: c.email || '', phone: c.phone || '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const ok = f.email.includes('@') || f.phone.replace(/\D/g, '').length >= 7;
  return (
    <div className="contact-form">
      <input className="field" value={f.name} onChange={set('name')} placeholder="Name, e.g. Aunt Karen" autoFocus />
      <input className="field" type="email" inputMode="email" value={f.email} onChange={set('email')} placeholder="Email" />
      <input className="field" type="tel" inputMode="tel" value={f.phone} onChange={set('phone')} placeholder="Mobile number (for texting a link)" />
      <div className="contact-form-btns">
        <button className="btn-primary small press" disabled={busy || !ok} onClick={() => onSave(f)}>Save</button>
        <button className="btn-muted press" onClick={onCancel}>Cancel</button>
        {onRemove && <button className="btn-link inline plan-remove" disabled={busy} onClick={onRemove}>Remove</button>}
      </div>
    </div>
  );
}
