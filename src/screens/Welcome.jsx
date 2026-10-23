import { useState } from 'react';

// The cover page: shown until someone signs in. Sign in, create an account, or get a reset link.

const photo = (p) => ({ backgroundImage: `url("${import.meta.env.BASE_URL}photos/${p}.jpg")` });

function PasswordField({ value, onChange, placeholder, autoComplete, onEnter }) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw-wrap">
      <input id="wl-pw" className="field" type={show ? 'text' : 'password'} autoComplete={autoComplete} value={value}
        onChange={(e) => onChange(e.target.value)} placeholder={placeholder} onKeyDown={(e) => { if (e.key === 'Enter') onEnter(); }} />
      <button type="button" className="pw-show" onClick={() => setShow((s) => !s)}>{show ? 'Hide' : 'Show'}</button>
    </div>
  );
}

export default function Welcome({ family }) {
  const [view, setView] = useState('signin'); // signin | signup | forgot | sent
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { bad, text }

  const run = async (fn) => {
    setBusy(true); setMsg(null);
    try { await fn(); } catch (e) { setMsg({ bad: true, text: (e && e.message) || 'Something went wrong — try again' }); } finally { setBusy(false); }
  };
  const okEmail = email.includes('@');
  const okPw = password.length >= 6;

  const signIn = () => okEmail && password && run(() => family.signIn(email, password));
  const signUp = () => okEmail && okPw && run(async () => {
    const needsConfirm = await family.signUp(email, password, name);
    if (needsConfirm) { setView('sent'); setMsg({ text: `We sent a link to ${email.trim()}. Open it to confirm your account, then sign in here.` }); }
  });
  const reset = () => okEmail && run(async () => {
    await family.sendReset(email);
    setView('sent'); setMsg({ text: `If ${email.trim()} has an account, a link to choose a new password is on its way.` });
  });
  const go = (v) => { setView(v); setMsg(null); };

  return (
    <div className="wl">
      <div className="wl-cover">
        <div className="wl-brand">
          <img src={import.meta.env.BASE_URL + 'icons/icon-192.png'} alt="" width="40" height="40" />
          <span>Trip Journal</span>
        </div>
        <h1 className="wl-title">Every trip, from someday to memories.</h1>
        <p className="wl-sub">Bookings, plans, places we'd love to go and the stories of where we've been — together in one place.</p>
        <div className="wl-cards" aria-hidden="true">
          <div className="wl-card c1"><div className="wl-photo" style={photo('tus-cypress')} /><span>Tuscany</span></div>
          <div className="wl-card c2"><div className="wl-photo" style={photo('tof-sunset')} /><span>Tofino</span></div>
          <div className="wl-card c3"><div className="wl-photo" style={photo('sed-sunsetrock')} /><span>Sedona</span></div>
        </div>
      </div>

      <div className="wl-side">
        <div className="wl-form">
          {view === 'sent' ? (
            <>
              <h2 className="wl-h">Check your email</h2>
              <p className="wl-p">{msg && msg.text}</p>
              <button className="btn-primary press" onClick={() => go('signin')}>Back to sign in</button>
            </>
          ) : view === 'forgot' ? (
            <>
              <h2 className="wl-h">Reset your password</h2>
              <p className="wl-p">Enter your email and we'll send a link to choose a new one.</p>
              <label className="field-label" htmlFor="wl-email">Email</label>
              <input id="wl-email" className="field" type="email" inputMode="email" autoComplete="email" value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" onKeyDown={(e) => { if (e.key === 'Enter') reset(); }} />
              {msg && <div className={'wl-msg' + (msg.bad ? ' bad' : '')}>{msg.text}</div>}
              <button className="btn-primary press" style={{ marginTop: 18 }} disabled={busy || !okEmail} onClick={reset}>{busy ? 'One moment…' : 'Email me a link'}</button>
              <button className="btn-link" onClick={() => go('signin')}>Back to sign in</button>
            </>
          ) : (
            <>
              <h2 className="wl-h">{view === 'signup' ? 'Create your account' : 'Sign in'}</h2>
              <p className="wl-p">{view === 'signup' ? 'Use the email your trips were shared with to see them right away.' : 'Welcome back.'}</p>
              {view === 'signup' && (
                <>
                  <label className="field-label" htmlFor="wl-name">Your name</label>
                  <input id="wl-name" className="field" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Joe" />
                </>
              )}
              <label className="field-label" htmlFor="wl-email">Email</label>
              <input id="wl-email" className="field" type="email" inputMode="email" autoComplete="email" value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              <div className="wl-pw-row">
                <label className="field-label" htmlFor="wl-pw">Password</label>
                {view === 'signin' && <button className="wl-forgot" onClick={() => go('forgot')}>Forgot password?</button>}
              </div>
              <PasswordField value={password} onChange={setPassword} onEnter={view === 'signup' ? signUp : signIn}
                placeholder={view === 'signup' ? 'At least 6 characters' : 'Password'} autoComplete={view === 'signup' ? 'new-password' : 'current-password'} />
              {msg && <div className={'wl-msg' + (msg.bad ? ' bad' : '')}>{msg.text}</div>}
              <button className="btn-primary press" style={{ marginTop: 18 }}
                disabled={busy || !okEmail || (view === 'signup' ? !okPw : !password)} onClick={view === 'signup' ? signUp : signIn}>
                {busy ? 'One moment…' : view === 'signup' ? 'Create account' : 'Sign in'}
              </button>
              <div className="wl-switch">
                {view === 'signup'
                  ? <>Already have an account? <button onClick={() => go('signin')}>Sign in</button></>
                  : <>New here? <button onClick={() => go('signup')}>Create an account</button></>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
