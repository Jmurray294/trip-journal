import { useEffect, useState } from 'react';
import { mailtoMany, smsTo, smsMany, formatPhone, textGroups } from '../lib/contacts.js';
import { portalLink } from '../lib/followers.js';
import { guestMessage, updateMessage, shortUpdate, gatheringDays, respondedNames, contactsNamed } from '../lib/gathering.js';
import { datesRange, tripSpan } from '../lib/stages.js';

// The family's contacts, to pick from instead of typing addresses again (lib/contacts.js).
// mode 'followers': tick people and invite them to follow along (email);
// mode 'guests': send a trip's or gathering's guest link (email to everyone ticked, or a text each);
//   with `update`, it's "Send an update": the people already sent the link are ticked, and the message
//   says what's new or changed since the last one. onSent(contact ids) remembers who was sent it, and when.
// mode 'manage': just the list. In every mode you can add, change or remove a contact.
export default function ContactsSheet({ mode, contacts, followers, trip, link, gathering, update: asked = false, onSent, onClose, toast }) {
  // once a gathering's link has gone out and people have answered, sending it again is an update, with
  // the people already sent it, or who answered and are in the contacts, ticked
  const [answered] = useState(() => (mode === 'guests' && gathering && trip ? contactsNamed(contacts.list, respondedNames(trip)) : []));
  const [update] = useState(() => asked || (mode === 'guests' && gathering && !!((trip && trip.guestIds && trip.guestIds.length) || answered.length)));
  const [picked, setPicked] = useState(() => new Set(update && trip ? [...(trip.guestIds || []), ...answered] : []));
  // an update is short unless the details are asked for (a long text gets cut off or split); 'invite'
  // is the first message again, with the ideas
  const [kind, setKind] = useState('short');
  const details = kind === 'details';
  const [editing, setEditing] = useState(null); // contact id, or 'new'
  const [busy, setBusy] = useState(false);
  const [texted, setTexted] = useState(() => new Set()); // contact ids texted one by one this time

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const following = new Set(followers ? [...followers.followers.map((f) => f.email), ...followers.invites.map((i) => i.email)] : []);
  // who can be ticked: for followers an email, and not already following or invited; for guests an
  // email or a mobile number
  const canPick = (c) => (mode === 'guests' ? !!(c.email || c.phone) : !!c.email && !(mode === 'followers' && following.has(c.email)));
  const toggle = (id) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const chosen = contacts.list.filter((c) => picked.has(c.id) && canPick(c));
  const toEmail = chosen.filter((c) => c.email);
  const toText = chosen.filter((c) => c.phone);

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); } catch (e) { toast((e && e.message) || 'Something went wrong'); } finally { setBusy(false); }
  };

  const guestText = trip ? (gathering
    ? (update && kind !== 'invite' ? (details ? updateMessage(trip, link, trip.updateSentAt || 0, gatheringDays(datesRange(trip.dates) || tripSpan(trip))) : shortUpdate(trip, link)) : guestMessage(trip, link))
    : `${trip.title}: see the plan and add your photos and notes from the trip.\n\n${link}`) : '';

  const inviteFollowers = () => run(async () => {
    for (const c of chosen) await followers.invite(c.email);
    const body = `Follow along with our trips! See where we are, our photos, our photo books and trip songs.\n\n1. Open ${portalLink()}\n2. Sign in with this email address\n3. Enter the 6-digit code we email you (no password)`;
    window.location.href = mailtoMany(chosen.map((c) => c.email), 'Follow along with our trips', body);
    toast(`${chosen.length} invited to follow along`);
    setPicked(new Set());
  });
  const sent = () => { if (onSent) onSent(chosen.map((c) => c.id)); };
  const emailGuests = () => {
    sent();
    window.location.href = mailtoMany(toEmail.map((c) => c.email), trip.title, guestText);
  };
  // one text per person, not a group text: carriers refuse group texts to ~20+ people, and this way
  // replies come only to you. Each tap opens a text to the next person not yet texted.
  const nextText = toText.length === 1 ? toText[0] : toText.find((c) => !texted.has(c.id));
  const textNext = () => {
    if (!nextText) return;
    if (!texted.size) sent();
    setTexted((s) => new Set(s).add(nextText.id));
    window.location.href = smsTo(nextText.phone, guestText);
  };
  // or a few smaller group texts (up to 10 each, split evenly), each its own thread
  const groups = textGroups(toText, 10);
  const textGroup = (g) => {
    if (!texted.size) sent();
    setTexted((s) => { const n = new Set(s); g.forEach((c) => n.add(c.id)); return n; });
    window.location.href = smsMany(g.map((c) => c.phone), guestText);
  };
  const firstName = (c) => c.name.split(' ')[0];
  const textLabel = !toText.length ? 'Tick who to text'
    : toText.length === 1 ? `Text ${firstName(toText[0])}`
      : !nextText ? `All ${toText.length} texted ✓`
        : texted.size ? `Next: ${firstName(nextText)} →`
          : `Text ${firstName(nextText)} (1 of ${toText.length})`;
  const copyMessage = async () => {
    try { await navigator.clipboard.writeText(guestText); toast('Message copied. Paste it into a text or group chat'); }
    catch (e) { toast('Could not copy. Try Email or Text instead'); }
  };

  const title = mode === 'followers' ? 'Invite followers' : mode === 'guests' ? (update ? 'Send an update' : gathering ? 'Send the guest link' : 'Send the trip link') : 'Contacts';
  const sub = mode === 'followers' ? 'Tick the people to invite. They get an email with how to sign in.'
    : mode === 'guests' && update ? (picked.size ? 'Everyone you sent the link to, or who has answered, is ticked. Check the message, then text or email them.' : 'Tick who to tell, check the message, then text or email them.')
    : mode === 'guests' ? 'Tick people, then text them one by one or send one email with the link.'
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
                  <span className="contact-sub">{[c.email, c.phone && formatPhone(c.phone)].filter(Boolean).join(' · ')}</span>
                </button>
                {mode === 'followers' && following.has(c.email) && <span className="contact-tag">Following</span>}
                {mode === 'guests' && texted.has(c.id) && <span className="contact-tag">Texted ✓</span>}
                {mode === 'guests' && c.phone && <a className="btn-link inline" href={smsTo(c.phone, guestText)} onClick={() => setTexted((s) => new Set(s).add(c.id))}>Text</a>}
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
        {mode === 'guests' && (<>
          {update && (
            <div className="msg-kind" role="group" aria-label="Message">
              {[['short', 'Short'], ['details', 'With what changed'], ['invite', 'The first invite']].map(([k, label]) => (
                <button key={k} className={'plan-pick' + (kind === k ? ' on' : '')} aria-pressed={kind === k} onClick={() => setKind(k)}>{label}</button>
              ))}
            </div>
          )}
          {guestText && <div className="guest-msg">{guestText}</div>}
          <div className="guest-send">
            <button className="btn-primary press" disabled={!nextText} onClick={textNext}>{textLabel}</button>
            <button className="btn-primary press" disabled={!toEmail.length} onClick={emailGuests}>
              {toEmail.length ? `Email ${toEmail.length === 1 ? toEmail[0].name.split(' ')[0] : 'all ' + toEmail.length}` : 'Tick who to email'}
            </button>
          </div>
          {toText.length > 1 && (
            <div className="sheet-copy" style={{ marginTop: 6 }}>
              {texted.size
                ? <>Texted {Math.min(texted.size, toText.length)} of {toText.length}. {nextText ? 'Hit send in Messages, come back here, and tap Next.' : 'Everyone has it.'}{' '}
                    <button className="btn-link inline" onClick={() => setTexted(new Set())}>Start over</button></>
                : 'Each person gets their own text, so replies come only to you. Tap, hit send in Messages, come back and tap Next.'}
            </div>
          )}
          {groups.length > 1 && (
            <div className="text-groups">
              <div className="sheet-copy">Or group texts instead (each group is its own thread):</div>
              <div className="text-groups-btns">
                {groups.map((g, i) => {
                  const done = g.every((c) => texted.has(c.id));
                  return (
                    <button key={i} className={"btn-muted press" + (done ? " done" : "")} onClick={() => textGroup(g)}
                      title={g.map((c) => c.name).join(", ")}>
                      {done ? "✓ " : ""}Group {i + 1} ({g.length})
                    </button>
                  );
                })}
              </div>
              <div className="sheet-copy text-groups-who">{groups.map((g, i) => `${i + 1}: ${g.map(firstName).join(", ")}`).join(" · ")}</div>
            </div>
          )}
          <button className="btn-link" onClick={copyMessage}>Copy the message</button>
        </>)}
        <button className="btn-link" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

function ContactForm({ c = {}, busy, onSave, onCancel, onRemove }) {
  const [f, setF] = useState({ name: c.name || '', email: c.email || '', phone: c.phone ? formatPhone(c.phone) : '' });
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
