import { useEffect, useState } from 'react';
import { mailtoMany, smsTo, smsMany, formatPhone, textGroups, textedThisRound } from '../lib/contacts.js';
import { portalLink } from '../lib/followers.js';
import { guestMessage, updateMessage, shortUpdate, gatheringDays, respondedNames, contactsNamed } from '../lib/gathering.js';
import { datesRange, tripSpan } from '../lib/stages.js';

// The family's contacts, to pick from instead of typing addresses again (lib/contacts.js).
// mode 'followers': tick people and invite them to follow along (email);
// mode 'guests': send a trip's or gathering's guest link (email to everyone ticked, or a text each);
//   with `update`, it's "Send an update": the people already sent the link are ticked, and the message
//   says what's new or changed since the last one. onSent(contact ids) remembers who was sent it, and when.
// mode 'manage': just the list. In every mode you can add, change or remove a contact.
export default function ContactsSheet({ mode, contacts, followers, trip, link, gathering, update: asked = false, onSent, onTexted, onTextRound, onClose, toast }) {
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
  // texted this round: saved on the trip (onTexted), so it's still there after going to Messages and back
  const [localTexted, setLocalTexted] = useState(() => ({}));
  const isTexted = (c) => !!localTexted[c.id] || textedThisRound(trip, c.id);
  const [more, setMore] = useState(false);
  // the guest list keeps the order it opened with: the people getting it first, then everyone else
  const [order] = useState(() => {
    const on = new Set(update && trip ? [...(trip.guestIds || []), ...answered] : []);
    return [...contacts.list.filter((c) => on.has(c.id)), ...contacts.list.filter((c) => !on.has(c.id))].map((c) => c.id);
  });

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
  // replies come only to you. The big button texts the next person on the list not texted yet.
  const markTexted = (list) => {
    const now = Date.now();
    setLocalTexted((m) => { const n = { ...m }; list.forEach((c) => { n[c.id] = now; }); return n; });
    if (onTexted) onTexted(list.map((c) => c.id));
    if (onSent) onSent(list.map((c) => c.id));
  };
  const textOne = (c) => { markTexted([c]); window.location.href = smsTo(c.phone, guestText); };
  const doneCount = toText.filter(isTexted).length;
  const nextText = toText.find((c) => !isTexted(c));
  const startOver = () => {
    if (!window.confirm('Start over? Everyone will show as not texted yet.')) return;
    setLocalTexted({});
    if (onTextRound) onTextRound();
  };
  // or a few smaller group texts (up to 10 each, split evenly), each its own thread
  const groups = textGroups(toText, 10);
  const textGroup = (g) => { markTexted(g); window.location.href = smsMany(g.map((c) => c.phone), guestText); };
  const firstName = (c) => c.name.split(' ')[0];
  const clock = (c) => {
    const t = localTexted[c.id] || (trip && trip.textedAt && trip.textedAt[c.id]);
    return t ? new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
  };
  const copyMessage = async () => {
    try { await navigator.clipboard.writeText(guestText); toast('Message copied. Paste it into a text or group chat'); }
    catch (e) { toast('Could not copy. Try Email or Text instead'); }
  };

  const title = mode === 'followers' ? 'Invite followers' : mode === 'guests' ? (update ? 'Send an update' : gathering ? 'Send the guest link' : 'Send the trip link') : 'Contacts';
  const sub = mode === 'followers' ? 'Tick the people to invite. They get an email with how to sign in.'
    : mode === 'guests' && update ? (picked.size ? 'Everyone you sent it to, or who has answered, is ticked. Check the message, then use the button at the bottom to text them one at a time.' : 'Tick who to tell, check the message, then use the button at the bottom to text them one at a time.')
    : mode === 'guests' ? 'Tick people, then use the button at the bottom to text them one at a time.'
      : 'People you invite again and again. Only your family sees this list.';

  return (
    <div className="sheet-root" style={{ zIndex: 90 }}>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="grab" />
        <div className="serif" style={{ fontSize: 22, fontWeight: 600 }}>{title}</div>
        <div className="sheet-copy" style={{ marginTop: 4 }}>{sub}</div>
        {!contacts.ready && <div className="sheet-copy" style={{ color: '#9E1B1B' }}>Contacts need a one-time setup: run supabase/contacts.sql in Supabase.</div>}

        {mode === 'guests' && (<>
          {update && (
            <div className="msg-kind" role="group" aria-label="Message">
              {[['short', 'Short'], ['details', 'With what changed'], ['invite', 'The first invite']].map(([k, label]) => (
                <button key={k} className={'plan-pick' + (kind === k ? ' on' : '')} aria-pressed={kind === k} onClick={() => setKind(k)}>{label}</button>
              ))}
            </div>
          )}
          {guestText && <div className="guest-msg">{guestText}</div>}
        </>)}

        {mode === 'guests' ? (
          <div className="contacts">
            <div className="guest-head">Getting this message ({chosen.length})</div>
            {chosen.length === 0 && <div className="sheet-copy">Tick people below to add them.</div>}
            {order.map((id) => contacts.list.find((c) => c.id === id)).filter((c) => c && picked.has(c.id) && canPick(c)).map((c) => (
              editing === c.id ? <ContactForm key={c.id} c={c} busy={busy} onCancel={() => setEditing(null)}
                onSave={(f) => run(async () => { await contacts.save(f, c.id); setEditing(null); })}
                onRemove={() => { if (window.confirm(`Remove ${c.name} from your contacts?`)) run(async () => { await contacts.remove(c.id); setEditing(null); }); }} />
              : <GuestRow key={c.id} c={c} on texted={isTexted(c)} time={clock(c)} onToggle={() => toggle(c.id)} onText={() => textOne(c)} onEdit={() => setEditing(c.id)} />
            ))}
            {(() => {
              const rest = [...order.map((id) => contacts.list.find((c) => c.id === id)).filter(Boolean), ...contacts.list.filter((c) => !order.includes(c.id))]
                .filter((c) => !(picked.has(c.id) && canPick(c)));
              return rest.length > 0 && (<>
                <div className="guest-head muted">Not getting it ({rest.length}) · tick to add</div>
                {rest.map((c) => (editing === c.id ? <ContactForm key={c.id} c={c} busy={busy} onCancel={() => setEditing(null)}
                    onSave={(f) => run(async () => { await contacts.save(f, c.id); setEditing(null); })}
                    onRemove={() => { if (window.confirm(`Remove ${c.name} from your contacts?`)) run(async () => { await contacts.remove(c.id); setEditing(null); }); }} />
                  : <GuestRow key={c.id} c={c} on={false} disabled={!canPick(c)} onToggle={() => toggle(c.id)} onEdit={() => setEditing(c.id)} />))}
              </>);
            })()}
            {editing === 'new'
              ? <ContactForm busy={busy} onCancel={() => setEditing(null)} onSave={(f) => run(async () => {
                  const c = await contacts.save(f);
                  setEditing(null);
                  if (canPick(c)) setPicked((x) => new Set(x).add(c.id));
                })} />
              : <button className="btn-link inline contact-add" onClick={() => setEditing('new')}>+ Add a contact</button>}
          </div>
        ) : (
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
        )}

        {mode === 'followers' && (
          <button className="btn-primary press" style={{ marginTop: 18 }} disabled={busy || !chosen.length} onClick={inviteFollowers}>
            {chosen.length ? `Invite ${chosen.length} to follow along` : 'Tick who to invite'}
          </button>
        )}
        {mode === 'guests' && (
          <div className="guest-bar">
            {toText.length > 0 ? (<>
              <div className="guest-progress">
                <span>{doneCount === toText.length ? `✓ All ${toText.length} texted` : `Texted ${doneCount} of ${toText.length}`}</span>
                {doneCount > 0 && <button className="btn-link inline" onClick={startOver}>Start over</button>}
              </div>
              <div className="plan-progress-bar"><div style={{ width: `${(100 * doneCount) / toText.length}%` }} /></div>
              {nextText
                ? <button className="btn-primary press" onClick={() => textOne(nextText)}>Text {nextText.name} →</button>
                : <button className="btn-primary press" disabled>Everyone's been texted ✓</button>}
              {nextText && <div className="sheet-copy guest-how">Tap, hit send in Messages, then come back here for the next person.</div>}
            </>) : <div className="sheet-copy">Tick people with a mobile number to text them.</div>}
          </div>
        )}
        {mode === 'guests' && (
          <div className="guest-more">
            <button className="btn-link inline" onClick={() => setMore(!more)}>{more ? 'Fewer options ▴' : 'Other ways to send ▾'}</button>
            {more && (<>
              <button className="btn-muted press" disabled={!toEmail.length} onClick={emailGuests}>
                {toEmail.length ? `Email all ${toEmail.length} with an email address (one email)` : 'No one ticked has an email'}
              </button>
              {groups.length > 1 && (<>
                <div className="sheet-copy">Group texts (each group is its own thread, and everyone in it sees the replies):</div>
                <div className="text-groups-btns">
                  {groups.map((g, i) => (
                    <button key={i} className={'btn-muted press' + (g.every(isTexted) ? ' done' : '')} onClick={() => textGroup(g)}>
                      {g.every(isTexted) ? '✓ ' : ''}Group {i + 1}: {g.map(firstName).join(', ')}
                    </button>
                  ))}
                </div>
              </>)}
              <button className="btn-link inline" onClick={copyMessage}>Copy the message</button>
            </>)}
          </div>
        )}
        <button className="btn-link" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

function GuestRow({ c, on, disabled, texted, time, onToggle, onText, onEdit }) {
  return (
    <div className={'contact' + (on ? ' on' : '') + (texted ? ' texted' : '')}>
      <input type="checkbox" className="contact-check" checked={on} disabled={disabled} onChange={onToggle} aria-label={(on ? 'Take off ' : 'Add ') + c.name} />
      <button className="contact-main" disabled={disabled} onClick={onToggle}>
        <span className="contact-name">{c.name}</span>
        <span className="contact-sub">{[c.phone && formatPhone(c.phone), c.email].filter(Boolean).join(' · ') || 'No phone or email'}</span>
      </button>
      {on && texted && <span className="contact-tag">✓ Texted {time}</span>}
      {on && !texted && c.phone && <button className="btn-link inline" onClick={onText}>Text</button>}
      <button className="btn-link inline" onClick={onEdit}>Edit</button>
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
