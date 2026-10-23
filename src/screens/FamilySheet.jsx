import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { forwardingAddress } from '../lib/inbox.js';

// Account & sharing: sign in with email + password, share the journal with people by email,
// the forwarding address for bookings, and the recent emails it has read.

function timeAgo(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return m + ' min ago';
  const h = Math.round(m / 60);
  return h < 24 ? h + ' hr ago' : Math.round(h / 24) + ' days ago';
}

export function statusLabel(st) {
  if (st.state === 'syncing') return 'Syncing…';
  if (st.state === 'offline') return 'Offline — will sync when back online';
  if (st.state === 'error') return 'Sync paused — will retry';
  if (st.state === 'idle') return 'Synced ' + timeAgo(st.at);
  return '';
}

const Label = ({ children, top = 16 }) => <div className="field-label" style={{ marginTop: top }}>{children}</div>;
const SITE = () => window.location.origin + import.meta.env.BASE_URL;

function PasswordField({ value, onChange, placeholder = 'Password', autoComplete = 'current-password' }) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw-wrap">
      <input className="field" type={show ? 'text' : 'password'} autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      <button type="button" className="pw-show" onClick={() => setShow((s) => !s)}>{show ? 'Hide' : 'Show'}</button>
    </div>
  );
}

export default function FamilySheet({ family, onClose, toast }) {
  const [view, setView] = useState('signin'); // signin | signup | forgot
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [newPw, setNewPw] = useState('');
  const [changingPw, setChangingPw] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const t = setInterval(() => tick((n) => n + 1), 20000); // keep "synced x min ago" fresh
    return () => { window.removeEventListener('keydown', onKey); clearInterval(t); };
  }, [onClose]);

  const h = family.household;
  const inbox = forwardingAddress(h);
  const [emails, setEmails] = useState([]);
  useEffect(() => {
    if (!inbox || !supabase) return;
    supabase.from('inbound_emails').select('id, subject, items, status, trip_title, created_at')
      .eq('household_id', h.id).order('created_at', { ascending: false }).limit(20)
      .then(({ data }) => {
        // one line per email, however many times it was read
        const seen = new Set();
        setEmails((data || []).filter((m) => { const k = m.subject || m.id; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 5));
      });
  }, [inbox, h]);
  const copyInbox = async () => {
    try { await navigator.clipboard.writeText(inbox); toast('Address copied'); } catch (e) { toast(inbox); }
  };

  const act = async (fn, okMsg) => {
    setBusy(true);
    try { const r = await fn(); if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg); return r; }
    catch (e) { toast((e && e.message) || 'Something went wrong'); return undefined; }
    finally { setBusy(false); }
  };

  // tell the person: the site, and to create an account with the email it was shared with
  const tellThem = async (to) => {
    const text = `I've shared our trip journal with you.\n\n1. Open ${SITE()}\n2. Choose "Create an account"\n3. Use this email: ${to}\n\nYou'll see our trips as soon as you're in.`;
    if (navigator.share) { try { await navigator.share({ title: 'Trip Journal', text }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(text); toast('Invite message copied — paste it in a text or email'); } catch (e) { toast('Send them: ' + SITE()); }
  };

  const share = async () => {
    const to = shareEmail.trim().toLowerCase();
    const ok = await act(() => family.invite(to).then(() => true), `Shared with ${to}`);
    if (ok) { setShareEmail(''); tellThem(to); }
  };

  const pwOk = password.length >= 6;
  let body;

  if (family.recovering) {
    // arrived from a reset-password email
    body = (
      <>
        <div className="serif" style={{ fontSize: 22, fontWeight: 600 }}>Choose a new password</div>
        <Label top={18}>New password</Label>
        <PasswordField value={newPw} onChange={setNewPw} placeholder="At least 6 characters" autoComplete="new-password" />
        <button className="btn-primary press" style={{ marginTop: 20 }} disabled={busy || newPw.length < 6}
          onClick={() => act(() => family.setPassword(newPw), 'Password saved')}>Save password</button>
      </>
    );
  } else if (!family.session) {
    if (view === 'forgot') {
      body = (
        <>
          <div className="serif" style={{ fontSize: 22, fontWeight: 600 }}>Reset your password</div>
          <div className="sheet-copy">We'll email you a link to choose a new one.</div>
          <Label top={18}>Email</Label>
          <input className="field" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          <button className="btn-primary press" style={{ marginTop: 20 }} disabled={busy || !email.includes('@')}
            onClick={() => act(() => family.sendReset(email), 'Check your email for the link')}>Email me a link</button>
          <button className="btn-link" onClick={() => setView('signin')}>Back to sign in</button>
        </>
      );
    } else {
      const signup = view === 'signup';
      body = (
        <>
          <div className="segs">
            <button className={'seg' + (!signup ? ' active' : '')} onClick={() => setView('signin')}>Sign in</button>
            <button className={'seg' + (signup ? ' active' : '')} onClick={() => setView('signup')}>Create account</button>
          </div>
          <div className="sheet-copy" style={{ marginTop: 0 }}>
            {signup ? 'Create an account to keep your trips backed up and see trips shared with you.' : 'Sign in to see your trips on any device.'}
          </div>
          {signup && (<><Label top={16}>Your name</Label><input className="field" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Joe" /></>)}
          <Label top={16}>Email</Label>
          <input className="field" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          <Label top={16}>Password</Label>
          <PasswordField value={password} onChange={setPassword} placeholder={signup ? 'At least 6 characters' : 'Password'} autoComplete={signup ? 'new-password' : 'current-password'} />
          <button className="btn-primary press" style={{ marginTop: 20 }} disabled={busy || !email.includes('@') || !pwOk}
            onClick={() => (signup
              ? act(() => family.signUp(email, password, name), (needsConfirm) => (needsConfirm ? 'Check your email to confirm your account' : 'Account created'))
              : act(() => family.signIn(email, password), 'Signed in'))}>
            {busy ? 'One moment…' : signup ? 'Create account' : 'Sign in'}
          </button>
          {!signup && <button className="btn-link" onClick={() => setView('forgot')}>Forgot password?</button>}
        </>
      );
    }
  } else if (!h) {
    body = (
      <>
        <div className="serif" style={{ fontSize: 22, fontWeight: 600 }}>Welcome</div>
        <div className="sheet-copy">Signed in as {family.email}. If someone shared their trips with this email you'll see them here as soon as they do — or start your own journal now. Trips already on this device are added to it.</div>
        <button className="btn-primary press" style={{ marginTop: 20 }} disabled={busy}
          onClick={() => act(() => family.createFamily('Our trips', name || (family.session.user.user_metadata || {}).name || ''), 'Your journal is ready')}>Start my trip journal</button>
        <button className="btn-secondary press" disabled={busy} onClick={() => act(family.reload)}>Check for shared trips</button>
        <button className="btn-link" onClick={() => act(family.signOut)}>Sign out</button>
      </>
    );
  } else {
    body = (
      <>
        <div className="eyebrow" style={{ fontSize: 11 }}>Account &amp; sharing</div>
        <div className="serif" style={{ fontSize: 22, fontWeight: 600, marginTop: 4, overflowWrap: 'anywhere' }}>{family.email}</div>
        <div className={'sync-line ' + family.status.state}><span className="sync-dot" />{statusLabel(family.status) || 'Connecting…'}</div>

        <Label top={22}>Shared with</Label>
        <div className="members">
          {family.members.map((m) => (
            <div key={m.user_id} className="member">
              <span className="member-dot">{(m.display_name || '?').charAt(0).toUpperCase()}</span>
              <span className="grow">{m.display_name || 'Someone'}{m.user_id === family.uid ? ' (you)' : ''}</span>
              {family.isOwner && m.user_id !== family.uid && (
                <button className="btn-link inline" disabled={busy} onClick={() => { if (window.confirm(`Stop sharing with ${m.display_name || 'this person'}?`)) act(() => family.removeMember(m.user_id), 'Removed'); }}>Remove</button>
              )}
            </div>
          ))}
          {family.invites.map((i) => (
            <div key={i.email} className="member">
              <span className="member-dot wait">{i.email.charAt(0).toUpperCase()}</span>
              <span className="grow">{i.email}<span className="member-sub"> · hasn't signed in yet</span></span>
              <button className="btn-link inline" onClick={() => tellThem(i.email)}>Resend</button>
              <button className="btn-link inline" disabled={busy} onClick={() => act(() => family.cancelInvite(i.email), 'Invite cancelled')}>Cancel</button>
            </div>
          ))}
        </div>

        <Label top={16}>Share with someone</Label>
        <div className="invite-row">
          <input className="field" type="email" inputMode="email" value={shareEmail} onChange={(e) => setShareEmail(e.target.value)} placeholder="their@email.com" />
          <button className="btn-share press" disabled={busy || !shareEmail.includes('@')} onClick={share}>Share</button>
        </div>
        <div className="sheet-copy" style={{ marginTop: 8 }}>They create an account with that email and see all your trips. You can remove them any time.</div>

        {inbox && (
          <>
            <Label top={22}>Forward bookings to</Label>
            <div className="invite-row">
              <div className="inbox-address">{inbox}</div>
              <button className="btn-share press" onClick={copyInbox}>Copy</button>
            </div>
            <div className="sheet-copy" style={{ marginTop: 8 }}>Forward confirmations, receipts, invoices and trip ideas here from any email account. They're added to the right trip; if we're not sure which, they wait under <strong>To sort</strong>.</div>
            {emails.length > 0 && (
              <>
                <Label top={16}>Recent emails</Label>
                <div className="imports">
                  {emails.map((m) => (
                    <div key={m.id} className="import-row">
                      <span className={'import-dot' + (m.status === 'to sort' ? ' wait' : m.items ? ' ok' : '')} />
                      <span className="import-text">
                        <span>{m.status === 'to sort' ? 'Waiting to be sorted' : m.items ? `Added to ${m.trip_title || 'a trip'}` : 'Nothing to add'}</span>
                        <span className="import-sub">{m.subject || '(no subject)'} · {timeAgo(new Date(m.created_at).getTime())}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        <Label top={22}>Password</Label>
        {changingPw ? (
          <>
            <PasswordField value={newPw} onChange={setNewPw} placeholder="New password (6+ characters)" autoComplete="new-password" />
            <div className="row-8" style={{ marginTop: 10 }}>
              <button className="btn-muted press" onClick={() => { setChangingPw(false); setNewPw(''); }}>Cancel</button>
              <button className="btn-primary small press" disabled={busy || newPw.length < 6}
                onClick={async () => { if (await act(() => family.setPassword(newPw).then(() => true), 'Password saved')) { setChangingPw(false); setNewPw(''); } }}>Save</button>
            </div>
          </>
        ) : (
          <button className="btn-secondary press" style={{ marginTop: 0 }} onClick={() => setChangingPw(true)}>Set or change password</button>
        )}

        <div className="row-8" style={{ marginTop: 22 }}>
          <button className="btn-muted press" onClick={family.syncNow}>Sync now</button>
          <button className="btn-muted press" onClick={() => { if (window.confirm('Sign out? Your trips stay on this device but stop syncing.')) act(family.signOut, 'Signed out'); }}>Sign out</button>
        </div>
      </>
    );
  }

  return (
    <div className="sheet-root">
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Account and sharing">
        <div className="grab" />
        {body}
      </div>
    </div>
  );
}
