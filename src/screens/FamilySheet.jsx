import { useEffect, useState } from 'react';

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

export default function FamilySheet({ family, onClose, toast }) {
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [invite, setInvite] = useState('');
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const t = setInterval(() => tick((n) => n + 1), 20000); // keep "synced x min ago" fresh
    return () => { window.removeEventListener('keydown', onKey); clearInterval(t); };
  }, [onClose]);

  const act = async (fn, okMsg) => {
    setBusy(true);
    try { await fn(); if (okMsg) toast(okMsg); }
    catch (e) { toast((e && e.message) || 'Something went wrong'); }
    finally { setBusy(false); }
  };

  const shareInvite = async () => {
    const h = family.household;
    const text = `Join our family trip journal "${h.name}".\n\n1. Open ${window.location.origin + import.meta.env.BASE_URL}\n2. Tap Family sharing and sign in with your email\n3. Choose "Join a family" and enter code: ${h.invite_code}`;
    if (navigator.share) { try { await navigator.share({ title: 'Trip Journal invite', text }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    try { await navigator.clipboard.writeText(text); toast('Invite copied'); } catch (e) { toast('Invite code: ' + h.invite_code); }
  };

  let body;
  if (!family.session) {
    body = step === 'email' ? (
      <>
        <div className="serif" style={{ fontSize: 22, fontWeight: 600 }}>Share with your family</div>
        <div className="sheet-copy">Sign in to back up your journal and share trips with everyone's phones. We'll email you a 6-digit code — no password.</div>
        <Label top={18}>Your email</Label>
        <input className="field" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        <button className="btn-primary press" style={{ marginTop: 20 }} disabled={busy || !email.includes('@')}
          onClick={() => act(async () => { await family.sendCode(email); setStep('code'); }, 'Code sent — check your email')}>
          {busy ? 'Sending…' : 'Email me a code'}
        </button>
      </>
    ) : (
      <>
        <div className="serif" style={{ fontSize: 22, fontWeight: 600 }}>Check your email</div>
        <div className="sheet-copy">Enter the 6-digit code sent to <strong>{email}</strong>.</div>
        <Label top={18}>Code</Label>
        <input className="field code-field" inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" />
        <button className="btn-primary press" style={{ marginTop: 20 }} disabled={busy || code.length < 6}
          onClick={() => act(() => family.verifyCode(email, code), 'Signed in')}>
          {busy ? 'Checking…' : 'Sign in'}
        </button>
        <button className="btn-link" onClick={() => { setStep('email'); setCode(''); }}>Use a different email</button>
      </>
    );
  } else if (!family.household) {
    body = (
      <>
        <div className="serif" style={{ fontSize: 22, fontWeight: 600 }}>Your family journal</div>
        <div className="sheet-copy">Signed in as {family.email}. Start a family journal, or join one with the code someone sent you. Trips already on this device are added to it.</div>
        <Label top={18}>Your name</Label>
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Joe" />

        <div className="family-choice">
          <Label top={0}>Join a family</Label>
          <input className="field code-field" value={invite} onChange={(e) => setInvite(e.target.value.toUpperCase())} placeholder="Invite code" maxLength={12} />
          <button className="btn-secondary press" disabled={busy || invite.trim().length < 4}
            onClick={() => act(() => family.joinFamily(invite, name), 'Joined — syncing your trips')}>Join</button>
        </div>
        <div className="family-choice">
          <Label top={0}>Or start a new one</Label>
          <input className="field" value={familyName} onChange={(e) => setFamilyName(e.target.value)} placeholder="e.g. The Murrays" />
          <button className="btn-primary press" style={{ marginTop: 12 }} disabled={busy}
            onClick={() => act(() => family.createFamily(familyName, name), 'Family journal created')}>Start family journal</button>
        </div>
        <button className="btn-link" onClick={() => act(family.signOut)}>Sign out</button>
      </>
    );
  } else {
    const h = family.household;
    body = (
      <>
        <div className="eyebrow" style={{ fontSize: 11 }}>Family journal</div>
        <div className="serif" style={{ fontSize: 26, fontWeight: 600, marginTop: 4 }}>{h.name}</div>
        <div className={'sync-line ' + family.status.state}><span className="sync-dot" />{statusLabel(family.status) || 'Connecting…'}</div>

        <Label top={20}>Invite code</Label>
        <div className="invite-row">
          <div className="invite-code">{h.invite_code}</div>
          <button className="btn-share press" onClick={shareInvite}>Send invite</button>
        </div>
        <div className="sheet-copy" style={{ marginTop: 8 }}>Family members open the app, sign in, choose <strong>Join a family</strong> and enter this code.</div>

        <Label top={20}>Members</Label>
        <div className="members">
          {family.members.map((m) => (
            <div key={m.user_id} className="member">
              <span className="member-dot">{(m.display_name || '?').charAt(0).toUpperCase()}</span>
              <span>{m.display_name || 'Family member'}{m.user_id === family.uid ? ' (you)' : ''}</span>
            </div>
          ))}
        </div>

        <div className="row-8" style={{ marginTop: 22 }}>
          <button className="btn-muted press" onClick={family.syncNow}>Sync now</button>
          <button className="btn-muted press" onClick={() => { if (window.confirm('Sign out? Your trips stay on this device but stop syncing.')) act(family.signOut, 'Signed out'); }}>Sign out</button>
        </div>
        <div className="sheet-copy" style={{ marginTop: 12, fontSize: 12 }}>Signed in as {family.email}</div>
      </>
    );
  }

  return (
    <div className="sheet-root">
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Family sharing">
        <div className="grab" />
        {body}
      </div>
    </div>
  );
}
