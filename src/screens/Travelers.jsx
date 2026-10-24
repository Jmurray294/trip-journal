import { useEffect, useState } from 'react';
import { Plus } from '../components/Icons.jsx';
import { openFile } from '../lib/docs.js';
import { mediaUrl } from '../lib/media.js';
import { expiryNote, monthYear } from '../lib/travelers.js';

// Travelers: each person's documents, loyalty programs, preferences and emergency details, with
// copy buttons for booking. Numbers stay hidden until "Show numbers".

const Label = ({ children, top = 14 }) => <div className="field-label" style={{ marginTop: top }}>{children}</div>;
const mask = (s) => { const v = String(s || ''); return v.length <= 4 ? '••••' : '•••• ' + v.slice(-4); };
const day = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''; };

function Row({ label, value, copy, secret, shown, note, toast }) {
  if (!value) return null;
  const doCopy = async () => {
    try { await navigator.clipboard.writeText(copy || value); toast('Copied ' + label.toLowerCase()); } catch (e) { toast(copy || value); }
  };
  return (
    <div className="tv-row">
      <div className="tv-label">{label}</div>
      <div className="tv-value">
        <span className={secret ? 'mono' : ''}>{secret && !shown ? mask(value) : value}</span>
        {note && <span className={'tv-note ' + note.level}>{note.text}</span>}
      </div>
      {(copy !== false) && <button className="tv-copy press" onClick={doCopy}>Copy</button>}
    </div>
  );
}

function Section({ title, has, children, empty }) {
  return (
    <div className="tv-section">
      <div className="mono-label" style={{ margin: '0 0 6px' }}>{title}</div>
      {has ? children : <div className="tv-empty">{empty}</div>}
    </div>
  );
}

function Scans({ t, onAddScan, onRemoveScan, toast }) {
  const scans = ((t.doc || {}).passport || {}).scans || [];
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const files = [...(e.target.files || [])]; e.target.value = '';
    setBusy(true);
    try { for (const f of files) await onAddScan(t, f); toast('Passport scan saved'); } catch (err) { toast('Could not save the scan — try again'); }
    finally { setBusy(false); }
  };
  const open = async (s) => { try { await openFile(s.path); } catch (e) { toast('Could not open the scan'); } };
  return (
    <div className="tv-scans">
      {scans.map((s) => {
        const img = s.type && s.type.startsWith('image/') ? mediaUrl(s.path) : null;
        return (
          <div key={s.path} className="tv-scan">
            <button className="tv-scan-open press" onClick={() => open(s)} style={img ? { backgroundImage: `url("${img}")` } : undefined}>
              {!img && <span className="doc-ext">{s.type === 'application/pdf' ? 'PDF' : 'IMG'}</span>}
            </button>
            <button className="thumb-x" onClick={() => { if (window.confirm('Delete this passport scan?')) onRemoveScan(t, s.path).catch(() => toast('Could not delete — try again')); }} aria-label="Delete scan"><span>×</span></button>
          </div>
        );
      })}
      <label className={'tv-scan-add press' + (busy ? ' busy' : '')}>
        <input type="file" accept="image/*,application/pdf" multiple onChange={pick} hidden disabled={busy} />
        {busy ? 'Saving…' : <><Plus size={13} w={1.8} /> Passport scan</>}
      </label>
    </div>
  );
}

function PersonCard({ t, onEdit, onAddScan, onRemoveScan, toast }) {
  const [shown, setShown] = useState(false);
  const d = t.doc || {};
  const pp = d.passport || {}, ktn = d.ktn || {}, lic = d.license || {}, pr = d.prefs || {}, em = d.emergency || {};
  const loyalty = (d.loyalty || []).filter((l) => l.program || l.number);
  const cards = (d.cards || []).filter((c) => c.last);
  const r = { toast, shown };
  const any = (o) => Object.values(o).some((v) => v && (!Array.isArray(v) || v.length));
  const hasDocs = any({ ...pp, scans: null }) || !!d.dob || !!ktn.number || !!d.redress || any(lic);
  return (
    <div className="tv-card">
      <div className="tv-head">
        <div className="tv-name">{t.name || 'Traveler'}</div>
        <button className="btn-muted press" onClick={() => setShown(!shown)}>{shown ? 'Hide numbers' : 'Show numbers'}</button>
        <button className="btn-soft-pill press" onClick={onEdit}>Edit</button>
      </div>

      <Section title="Travel documents" has={hasDocs} empty="None yet — tap Edit to add a passport and Global Entry.">
        <Row label="Name on passport" value={pp.name} {...r} />
        <Row label="Passport no." value={pp.number} secret {...r} />
        <Row label="Passport country" value={pp.country} copy={false} {...r} />
        <Row label="Passport expires" value={day(pp.expires)} copy={false} note={expiryNote(pp.expires, 9)} {...r} />
        <Row label="Date of birth" value={d.dob ? day(d.dob) : ''} copy={d.dob} secret {...r} />
        <Row label={ktn.program || 'Known traveler no.'} value={ktn.number} secret {...r} />
        <Row label={(ktn.program || 'Global Entry') + ' expires'} value={ktn.number ? day(ktn.expires) : ''} copy={false} note={expiryNote(ktn.expires, 6)} {...r} />
        <Row label="Redress no." value={d.redress} secret {...r} />
        <Row label="Driver's license" value={[lic.state, lic.expires ? 'expires ' + monthYear(lic.expires) : ''].filter(Boolean).join(' · ')} copy={false} note={expiryNote(lic.expires, 3)} {...r} />
      </Section>
      <Scans t={t} onAddScan={onAddScan} onRemoveScan={onRemoveScan} toast={toast} />

      <Section title="Loyalty programs" has={loyalty.length > 0} empty="None yet — tap Edit.">
        {loyalty.map((l, i) => (
          <Row key={i} label={l.program || 'Program'} value={l.number}
            note={l.status || l.balance ? { level: 'info', text: [l.status, l.balance && l.balance + ' pts', l.asOf && 'as of ' + monthYear(l.asOf)].filter(Boolean).join(' · ') } : null} {...r} />
        ))}
      </Section>

      <Section title="Trip cards" has={cards.length > 0} empty="None yet — tap Edit. Only these cards' charges reach trip budgets.">
        {cards.map((c, i) => <Row key={i} label={c.name || 'Card'} value={'…' + c.last} copy={false} {...r} />)}
      </Section>

      <Section title="Preferences" has={any(pr)} empty="None yet — tap Edit.">
        <Row label="Home airport" value={pr.airport} copy={false} {...r} />
        <Row label="Seat · cabin" value={[pr.seat, pr.cabin].filter(Boolean).join(' · ')} copy={false} {...r} />
        <Row label="Meals & diet" value={pr.meal} copy={false} {...r} />
        <Row label="Room" value={pr.room} copy={false} {...r} />
        <Row label="Airlines · hotels" value={[pr.airlines, pr.hotels].filter(Boolean).join(' · ')} copy={false} {...r} />
        <Row label="Notes" value={pr.notes} copy={false} {...r} />
      </Section>

      <Section title="Health & emergency" has={any(em)} empty="None yet — tap Edit.">
        <Row label="Travel insurance" value={em.insurance} {...r} />
        <Row label="Emergency contacts" value={em.contacts} {...r} />
        <Row label="Medical & allergies" value={em.medical} copy={false} {...r} />
      </Section>
    </div>
  );
}

const SEATS = ['', 'Aisle', 'Window', 'Either'];
const CABINS = ['', 'Economy', 'Premium economy', 'Business', 'First'];

function EditSheet({ t, onSave, onRemove, onClose, toast }) {
  const [name, setName] = useState(t.name || '');
  const [d, setD] = useState(() => JSON.parse(JSON.stringify(t.doc || {})));
  const [busy, setBusy] = useState(false);
  const set = (group, key, value) => setD((x) => (group ? { ...x, [group]: { ...(x[group] || {}), [key]: value } } : { ...x, [key]: value }));
  const field = (group, key, label, opts = {}) => (
    <>
      <Label>{label}</Label>
      {opts.choices ? (
        <select className="field" value={(group ? (d[group] || {})[key] : d[key]) || ''} onChange={(e) => set(group, key, e.target.value)}>
          {opts.choices.map((c) => <option key={c} value={c}>{c || '—'}</option>)}
        </select>
      ) : opts.long ? (
        <textarea className="field" style={{ minHeight: 64 }} value={(group ? (d[group] || {})[key] : d[key]) || ''} onChange={(e) => set(group, key, e.target.value)} placeholder={opts.ph || ''} />
      ) : (
        <input className="field" type={opts.date ? 'date' : 'text'} autoComplete="off" value={(group ? (d[group] || {})[key] : d[key]) || ''} onChange={(e) => set(group, key, e.target.value)} placeholder={opts.ph || ''} />
      )}
    </>
  );
  const loyalty = d.loyalty || [];
  const setLoyalty = (i, key, value) => setD((x) => ({ ...x, loyalty: (x.loyalty || []).map((l, j) => (j === i ? { ...l, [key]: value } : l)) }));
  const setCard = (i, key, value) => setD((x) => ({ ...x, cards: (x.cards || []).map((c, j) => (j === i ? { ...c, [key]: value } : c)) }));

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = async () => {
    setBusy(true);
    try {
      const doc = { ...d, loyalty: loyalty.filter((l) => l.program || l.number), cards: (d.cards || []).filter((c) => c.last) };
      await onSave(t.id, { name: name.trim() || t.name, doc });
      toast('Saved');
      onClose();
    } catch (e) { toast('Could not save — try again'); } finally { setBusy(false); }
  };

  return (
    <div className="sheet-root">
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="grab" />
        <div className="serif" style={{ fontSize: 22, fontWeight: 600 }}>Edit {t.name || 'traveler'}</div>
        <Label>Name</Label>
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} />

        <div className="mono-label tv-edit-head">Passport</div>
        {field('passport', 'name', 'Name exactly as on passport', { ph: 'e.g. JOSEPH MICHAEL MURRAY' })}
        {field('passport', 'number', 'Passport number')}
        {field('passport', 'country', 'Issuing country', { ph: 'United States' })}
        {field('passport', 'issued', 'Issued', { date: true })}
        {field('passport', 'expires', 'Expires', { date: true })}
        {field(null, 'dob', 'Date of birth', { date: true })}

        <div className="mono-label tv-edit-head">Trusted traveler</div>
        {field('ktn', 'program', 'Program', { choices: ['', 'Global Entry', 'TSA PreCheck', 'NEXUS', 'SENTRI', 'CLEAR'] })}
        {field('ktn', 'number', 'Known traveler number (KTN)')}
        {field('ktn', 'expires', 'Expires', { date: true })}
        {field(null, 'redress', 'Redress number (if any)')}

        <div className="mono-label tv-edit-head">Driver's license</div>
        {field('license', 'state', 'State', { ph: 'TX' })}
        {field('license', 'expires', 'Expires', { date: true })}

        <div className="mono-label tv-edit-head">Loyalty programs</div>
        {loyalty.map((l, i) => (
          <div key={i} className="tv-loyalty-edit">
            <input className="field" value={l.program || ''} onChange={(e) => setLoyalty(i, 'program', e.target.value)} placeholder="Program, e.g. AAdvantage" />
            <input className="field" value={l.number || ''} onChange={(e) => setLoyalty(i, 'number', e.target.value)} placeholder="Member number" autoComplete="off" />
            <div className="row-8">
              <input className="field" value={l.status || ''} onChange={(e) => setLoyalty(i, 'status', e.target.value)} placeholder="Status, e.g. Gold" />
              <input className="field" value={l.balance || ''} onChange={(e) => setLoyalty(i, 'balance', e.target.value)} placeholder="Points" inputMode="numeric" />
              <button className="thumb-x static" onClick={() => setD((x) => ({ ...x, loyalty: (x.loyalty || []).filter((_, j) => j !== i) }))} aria-label="Remove program"><span>×</span></button>
            </div>
          </div>
        ))}
        <button className="btn-soft-pill press" style={{ marginTop: 10 }} onClick={() => setD((x) => ({ ...x, loyalty: [...(x.loyalty || []), {}] }))}><Plus size={13} w={1.8} /> Add a program</button>

        <div className="mono-label tv-edit-head">Trip cards</div>
        <div className="sheet-copy" style={{ marginTop: 6 }}>The cards you use for trips. Purchase alerts from other cards — business cards, say — are ignored.</div>
        {(d.cards || []).map((c, i) => (
          <div key={i} className="row-8" style={{ marginTop: 8 }}>
            <input className="field" style={{ flex: 2, minWidth: 0 }} value={c.name || ''} onChange={(e) => setCard(i, 'name', e.target.value)} placeholder="e.g. Delta SkyMiles Gold" />
            <input className="field" style={{ flex: 1, minWidth: 0 }} value={c.last || ''} onChange={(e) => setCard(i, 'last', e.target.value.replace(/\D/g, '').slice(-6))} placeholder="Last digits" inputMode="numeric" autoComplete="off" />
            <button className="thumb-x static" onClick={() => setD((x) => ({ ...x, cards: (x.cards || []).filter((_, j) => j !== i) }))} aria-label="Remove card"><span>×</span></button>
          </div>
        ))}
        <button className="btn-soft-pill press" style={{ marginTop: 10 }} onClick={() => setD((x) => ({ ...x, cards: [...(x.cards || []), {}] }))}><Plus size={13} w={1.8} /> Add a card</button>

        <div className="mono-label tv-edit-head">Preferences</div>
        {field('prefs', 'airport', 'Home airport', { ph: 'DFW' })}
        {field('prefs', 'seat', 'Seat', { choices: SEATS })}
        {field('prefs', 'cabin', 'Cabin', { choices: CABINS })}
        {field('prefs', 'meal', 'Meals & diet', { ph: 'e.g. no shellfish, vegetarian meal' })}
        {field('prefs', 'room', 'Room', { ph: 'e.g. king bed, high floor, away from elevator' })}
        {field('prefs', 'airlines', 'Favorite airlines', { ph: 'e.g. American, Delta' })}
        {field('prefs', 'hotels', 'Favorite hotels', { ph: 'e.g. Marriott, Four Seasons' })}
        {field('prefs', 'notes', 'Other notes', { long: true })}

        <div className="mono-label tv-edit-head">Health & emergency</div>
        {field('emergency', 'insurance', 'Travel insurance (company, policy no., phone)', { long: true })}
        {field('emergency', 'contacts', 'Emergency contacts', { long: true })}
        {field('emergency', 'medical', 'Medical notes & allergies', { long: true })}

        <button className="btn-primary press" style={{ marginTop: 24 }} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
        <button className="btn-link" onClick={() => { if (window.confirm(`Delete ${t.name || 'this traveler'} and their passport scans?`)) { onRemove(t).then(onClose).catch(() => toast('Could not delete — try again')); } }}>Delete traveler</button>
      </div>
    </div>
  );
}

// Everything a booking form asks for, for everyone, on one screen with copy buttons.
function BookingSheet({ list, onClose, toast }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const r = { toast, shown: true };
  return (
    <div className="sheet-root">
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="grab" />
        <div className="serif" style={{ fontSize: 22, fontWeight: 600 }}>Booking sheet</div>
        <div className="sheet-copy" style={{ marginTop: 4 }}>What booking forms ask for. Tap Copy to paste it in.</div>
        <div className="tv-sheet">
          {list.map((t) => {
            const d = t.doc || {};
            const pp = d.passport || {}, ktn = d.ktn || {}, pr = d.prefs || {};
            return (
              <div key={t.id} className="tv-sheet-person">
                <div className="tv-name" style={{ fontSize: 20 }}>{t.name}</div>
                <Row label="Name on passport" value={pp.name} {...r} />
                <Row label="Date of birth" value={d.dob ? day(d.dob) : ''} copy={d.dob} {...r} />
                <Row label="Passport no." value={pp.number} secret {...r} />
                <Row label="Passport expires" value={day(pp.expires)} copy={pp.expires} {...r} />
                <Row label="Passport country" value={pp.country} {...r} />
                <Row label={ktn.program || 'Known traveler no.'} value={ktn.number} secret {...r} />
                <Row label="Redress no." value={d.redress} secret {...r} />
                {(d.loyalty || []).filter((l) => l.number).map((l, i) => <Row key={i} label={l.program || 'Program'} value={l.number} {...r} />)}
                <Row label="Seat · cabin" value={[pr.seat, pr.cabin].filter(Boolean).join(' · ')} copy={false} {...r} />
                <Row label="Meals & diet" value={pr.meal} copy={false} {...r} />
              </div>
            );
          })}
        </div>
        <button className="btn-primary press" style={{ marginTop: 20 }} onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

export default function Travelers({ list, signedIn, onSave, onAdd, onRemove, onAddScan, onRemoveScan, toast }) {
  const [editing, setEditing] = useState(null);
  const [sheet, setSheet] = useState(false);
  const person = list.find((t) => t.id === editing);
  const add = async () => {
    const name = window.prompt('Name');
    if (!name || !name.trim()) return;
    try { await onAdd(name.trim()); } catch (e) { toast('Could not add — try again'); }
  };
  return (
    <div className="screen pad-tab">
      <header className="page-head wash">
        <div className="eyebrow">Passports, programs & preferences</div>
        <h1 className="title-xl">Travelers</h1>
      </header>
      {!signedIn ? (
        <section className="sec"><div className="someday-empty">Sign in (the people icon on the Trips page) to keep your travel documents and programs here.</div></section>
      ) : (
        <section className="sec" style={{ paddingTop: 8 }}>
          {list.length > 0 && (
            <div className="tv-actions">
              <button className="btn-soft-pill press" onClick={() => setSheet(true)}>Booking sheet</button>
              <span className="tv-tip">Forward program statements to the trips address and balances update here.</span>
            </div>
          )}
          <div className="tv-grid">
            {list.map((t) => (
              <PersonCard key={t.id} t={t} onEdit={() => setEditing(t.id)} onAddScan={onAddScan} onRemoveScan={onRemoveScan} toast={toast} />
            ))}
          </div>
          <button className="new-trip press" style={{ marginTop: 16 }} onClick={add}><Plus /> Add a traveler</button>
        </section>
      )}
      {sheet && <BookingSheet list={list} onClose={() => setSheet(false)} toast={toast} />}
      {person && <EditSheet t={person} onSave={onSave} onRemove={onRemove} onClose={() => setEditing(null)} toast={toast} />}
    </div>
  );
}
