import { useEffect, useState } from 'react';
import { Plus, Trash } from '../components/Icons.jsx';
import { money, dayLabel, costTotals } from '../lib/derive.js';
import { tripDocuments, openFile } from '../lib/docs.js';
import { tripIdeas } from '../lib/someday.js';
import { Idea } from './SomedayBoard.jsx';

// The trip page's Bookings, Budget and Documents tabs (the Itinerary tab is the timeline in TripDetail).

const KIND_ORDER = ['Flight', 'Stay', 'Cruise', 'Train', 'Car', 'Transfer', 'Activity', 'Dining', 'Ticket', 'Insurance', 'Fees', 'Other'];
const KIND_LABEL = {
  Flight: 'Flights', Stay: 'Stays', Cruise: 'Cruise', Train: 'Trains', Car: 'Car rentals', Transfer: 'Transfers',
  Activity: 'Activities', Dining: 'Dining', Ticket: 'Tickets', Insurance: 'Insurance', Fees: 'Fees', Other: 'Other',
};
const kindRank = (k) => { const i = KIND_ORDER.indexOf(k); return i < 0 ? KIND_ORDER.length : i; };
const groupBy = (list, key) => {
  const m = new Map();
  for (const x of list) { const k = key(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  return [...m.entries()].sort((a, b) => kindRank(a[0]) - kindRank(b[0]));
};

function span(b, fallback) {
  const a = dayLabel(b.start), z = dayLabel(b.end);
  if (a && z && z !== a) return `${a} – ${z}`;
  return a || fallback || '';
}

const UploadButton = ({ onUpload, label = 'Upload' }) => (
  onUpload ? <button className="btn-soft-pill press" onClick={onUpload}><Plus size={13} w={1.8} /> {label}</button> : null
);

// ---------- Bookings ----------
export function Bookings({ trip, inbox, toast, onUpload }) {
  const list = (trip.days || []).filter((d) => d.booking || (d.source === 'email' && d.kind));
  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); toast('Copied ' + text); } catch (e) { toast(text); }
  };

  if (!list.length) {
    return (
      <div className="section-empty">
        <div className="empty-title">No bookings yet</div>
        <div className="empty-sub">
          Forward flight, hotel, cruise, car and tour confirmations{inbox ? <> to <strong>{inbox}</strong></> : ''} and they'll appear here, grouped by type.
          {onUpload ? ' Or upload a PDF, photo or screenshot.' : ''}
        </div>
        {onUpload && <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}><UploadButton onUpload={onUpload} label="Upload a booking" /></div>}
      </div>
    );
  }

  return (
    <div className="stack-16">
      {onUpload && <div className="timeline-head" style={{ margin: 0 }}><div className="mono-label">{list.length} booked</div><UploadButton onUpload={onUpload} label="Upload a booking" /></div>}
      {groupBy(list, (d) => d.kind || 'Other').map(([kind, items]) => (
        <section key={kind}>
          <div className="mono-label" style={{ margin: '0 2px 9px' }}>{KIND_LABEL[kind] || kind} · {items.length}</div>
          <div className="stack-9">
            {items.map((d) => {
              const b = d.booking || {};
              const st = b.status === 'cancelled' ? 'Cancelled' : b.status === 'changed' ? 'Changed' : '';
              return (
                <div key={d.id} className={'booking-card' + (b.status === 'cancelled' ? ' cancelled' : '')}>
                  <div className="booking-top">
                    <div className="grow">
                      <div className="booking-when">{span(b, d.date)}{b.time ? ' · ' + b.time : ''}</div>
                      <div className="booking-title">{d.title}</div>
                    </div>
                    {st && <span className={'booking-status ' + b.status}>{st}</span>}
                  </div>
                  <div className="booking-facts">
                    {b.provider && <div><span>With</span>{b.provider}</div>}
                    {b.confirmation && (
                      <div><span>Conf</span><button className="conf-btn" onClick={() => copy(b.confirmation)} aria-label={'Copy confirmation ' + b.confirmation}>{b.confirmation}</button></div>
                    )}
                    {(b.address || d.place) && (
                      <div><span>Where</span>
                        <a href={'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(b.address || d.place)} target="_blank" rel="noopener noreferrer">{b.address || d.place}</a>
                      </div>
                    )}
                    {b.travelers && <div><span>Who</span>{b.travelers}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

// ---------- Budget ----------
const CATEGORIES = KIND_ORDER;

function AddCost({ onSave, onCancel }) {
  const [f, setF] = useState({ title: '', amount: '', currency: 'USD', status: 'paid', date: '', category: 'Other', vendor: '' });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const amount = parseFloat(String(f.amount).replace(/[^0-9.]/g, ''));
  const ok = f.title.trim() && amount > 0;
  return (
    <div className="add-cost">
      <div className="field-label">What for</div>
      <input className="field" value={f.title} onChange={set('title')} placeholder="e.g. Shore excursion, travel insurance" />
      <div className="add-cost-row">
        <div className="grow">
          <div className="field-label" style={{ marginTop: 12 }}>Amount</div>
          <input className="field" inputMode="decimal" value={f.amount} onChange={set('amount')} placeholder="0.00" />
        </div>
        <div style={{ width: 92 }}>
          <div className="field-label" style={{ marginTop: 12 }}>Currency</div>
          <input className="field" value={f.currency} maxLength={3} onChange={(e) => setF((x) => ({ ...x, currency: e.target.value.toUpperCase() }))} />
        </div>
      </div>
      <div className="add-cost-row">
        <div className="grow">
          <div className="field-label" style={{ marginTop: 12 }}>Status</div>
          <select className="field" value={f.status} onChange={set('status')}>
            <option value="paid">Paid</option><option value="due">Still due</option><option value="refund">Refund</option>
          </select>
        </div>
        <div className="grow">
          <div className="field-label" style={{ marginTop: 12 }}>{f.status === 'due' ? 'Due by' : 'Date'}</div>
          <input className="field" type="date" value={f.date} onChange={set('date')} />
        </div>
      </div>
      <div className="add-cost-row">
        <div className="grow">
          <div className="field-label" style={{ marginTop: 12 }}>Category</div>
          <select className="field" value={f.category} onChange={set('category')}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{KIND_LABEL[c]}</option>)}
          </select>
        </div>
        <div className="grow">
          <div className="field-label" style={{ marginTop: 12 }}>Paid to</div>
          <input className="field" value={f.vendor} onChange={set('vendor')} placeholder="optional" />
        </div>
      </div>
      <div className="row-8" style={{ marginTop: 16 }}>
        <button className="btn-muted press" onClick={onCancel}>Cancel</button>
        <button className="btn-primary small press" disabled={!ok}
          onClick={() => onSave({ title: f.title.trim(), amount: Math.round(amount * 100) / 100, currency: (f.currency || 'USD').slice(0, 3), status: f.status, date: f.date, category: f.category, vendor: f.vendor.trim() })}>
          Add cost
        </button>
      </div>
    </div>
  );
}

export function Budget({ trip, onAddCost, onDeleteCost, onMarkPaid }) {
  const [adding, setAdding] = useState(false);
  const costs = trip.costs || [];
  const { totals } = costTotals(costs);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = costs.filter((c) => c.status === 'due').sort((a, b) => (a.date || '9999') < (b.date || '9999') ? -1 : 1);
  const main = totals[0];
  // spend per category in the main currency (paid + still due)
  const byCat = main ? groupBy(costs.filter((c) => (c.currency || 'USD') === main.currency && c.status !== 'refund'), (c) => c.category || 'Other')
    .map(([cat, cs]) => [cat, cs.reduce((n, c) => n + (c.amount || 0), 0)]).sort((a, b) => b[1] - a[1]) : [];
  const top = byCat.length ? byCat[0][1] : 0;

  return (
    <div className="stack-16">
      {totals.length > 0 ? totals.map((t) => (
        <div key={t.currency} className="budget-head">
          <div><div className="stat-num" style={{ color: 'var(--ink)' }}>{money(t.paid + t.due, t.currency)}</div><div className="stat-label">total</div></div>
          <div><div className="stat-num" style={{ color: '#6E8B3D' }}>{money(t.paid, t.currency)}</div><div className="stat-label">paid</div></div>
          <div><div className="stat-num" style={{ color: '#BE5F28' }}>{money(t.due, t.currency)}</div><div className="stat-label">still due</div></div>
          {t.paid + t.due > 0 && <div className="budget-bar"><div style={{ width: Math.max(0, Math.min(100, (t.paid / (t.paid + t.due)) * 100)) + '%' }} /></div>}
        </div>
      )) : (
        <div className="section-empty">
          <div className="empty-title">No costs yet</div>
          <div className="empty-sub">Payment receipts and invoices you forward show up here, or add one yourself.</div>
        </div>
      )}

      {upcoming.length > 0 && (
        <section>
          <div className="mono-label" style={{ margin: '0 2px 9px' }}>Coming up</div>
          <div className="budget-card">
            {upcoming.map((c) => (
              <div key={c.id} className="cost-row">
                <div className="grow">
                  <div className="cost-title">{c.title}</div>
                  <div className={'cost-sub' + (c.date && c.date < today ? ' overdue' : '')}>{c.date ? (c.date < today ? 'was due ' : 'due ') + dayLabel(c.date) : 'no due date given'}{c.vendor ? ' · ' + c.vendor : ''}</div>
                </div>
                <div className="cost-amt due">{money(c.amount, c.currency)}</div>
                {onMarkPaid && <button className="tv-copy press" onClick={() => onMarkPaid(c.id)}>Mark paid</button>}
              </div>
            ))}
          </div>
        </section>
      )}

      {byCat.length > 1 && (
        <section>
          <div className="mono-label" style={{ margin: '0 2px 9px' }}>By category</div>
          <div className="budget-card">
            {byCat.map(([cat, n]) => (
              <div key={cat} className="cat-row">
                <div className="cat-name">{KIND_LABEL[cat] || cat}</div>
                <div className="cat-bar"><div style={{ width: (top ? (n / top) * 100 : 0) + '%' }} /></div>
                <div className="cost-amt">{money(n, main.currency)}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="timeline-head" style={{ marginBottom: 9 }}>
          <div className="mono-label">All costs</div>
          {!adding && <button className="btn-soft-pill press" onClick={() => setAdding(true)}><Plus size={13} w={1.8} /> Add cost</button>}
        </div>
        {adding && <AddCost onCancel={() => setAdding(false)} onSave={(c) => { onAddCost(c); setAdding(false); }} />}
        {costs.length > 0 && (
          <div className="budget-card">
            {costs.map((c) => (
              <div key={c.id} className="cost-row">
                <div className="grow">
                  <div className="cost-title">{c.title}</div>
                  <div className="cost-sub">{[KIND_LABEL[c.category] || c.category, c.vendor, c.status === 'due' ? (c.date ? 'due ' + dayLabel(c.date) : 'due') : c.status === 'refund' ? 'refunded' : c.date ? 'paid ' + dayLabel(c.date) : 'paid', c.card, c.confirmation && 'Conf ' + c.confirmation].filter(Boolean).join(' · ')}</div>
                  {c.note && <div className="cost-sub">{c.note}</div>}
                </div>
                <div className={'cost-amt ' + c.status}>{c.status === 'refund' ? '−' : ''}{money(c.amount, c.currency)}</div>
                <button className="del-btn press" onClick={() => onDeleteCost(c.id)} aria-label="Remove cost"><span><Trash /></span></button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ---------- Documents ----------
const when = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const from = (s) => (String(s || '').match(/^"?([^"<]+?)"?\s*</) || [, s])[1];

// where to send this trip's emails, kept in view however many documents there are
function InboxNote({ inbox, toast }) {
  if (!inbox) return null;
  const copy = async () => {
    try { await navigator.clipboard.writeText(inbox); toast('Address copied'); } catch (e) { toast(inbox); }
  };
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="mono-label" style={{ margin: '0 2px 8px' }}>Send trip emails to</div>
      <div className="invite-row">
        <div className="inbox-address">{inbox}</div>
        <button className="btn-share press" onClick={copy}>Copy</button>
      </div>
    </div>
  );
}

export function Documents({ trip, household, inbox, toast, onUpload }) {
  const [docs, setDocs] = useState(null);
  const [ideas, setIdeas] = useState([]);
  const [open, setOpen] = useState(null);
  const hid = household && household.id;

  useEffect(() => {
    if (!hid) return undefined;
    let live = true;
    setDocs(null);
    tripDocuments(hid, trip.id).then((d) => { if (live) setDocs(d); }).catch(() => { if (live) setDocs([]); });
    tripIdeas(hid, trip.id).then((d) => { if (live) setIdeas(d); }).catch(() => {});
    return () => { live = false; };
  }, [hid, trip.id]);

  // the Someday ideas this trip was planned from
  const saved = ideas.length > 0 && (
    <div style={{ marginBottom: 18 }}>
      <div className="mono-label" style={{ margin: '0 2px 9px' }}>Saved ideas · {ideas.length}</div>
      <div className="someday-place" style={{ paddingBottom: 14 }}>
        <div className="stack-9">{ideas.map((it) => <Idea key={it.id} it={it} />)}</div>
      </div>
    </div>
  );

  if (!hid) {
    return <div className="section-empty"><div className="empty-sub">Sign in (the people icon) to see the emails and files saved with this trip.</div></div>;
  }
  if (!docs) return <div className="section-empty"><div className="empty-sub">Loading documents…</div></div>;
  if (!docs.length) {
    return (
      <div>
        <InboxNote inbox={inbox} toast={toast} />
        {saved}
        <div className="section-empty">
          <div className="empty-title">No documents yet</div>
          <div className="empty-sub">Emails you send to that address and files you upload for this trip are kept here, with their PDFs.</div>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}><UploadButton onUpload={onUpload} /></div>
        </div>
      </div>
    );
  }

  const show = async (f) => {
    try { await openFile(f.path); } catch (e) { toast('Could not open ' + f.name); }
  };

  return (
    <div className="stack-9">
      <InboxNote inbox={inbox} toast={toast} />
      {saved}
      <div className="timeline-head" style={{ margin: '0 0 4px' }}><div className="mono-label">{docs.length} saved</div><UploadButton onUpload={onUpload} /></div>
      {docs.map((d) => (
        <div key={d.id} className="doc-card">
          <div className="doc-subject">{d.subject || '(no subject)'}</div>
          <div className="doc-sub">{from(d.sender)} · {when(d.created_at)}</div>
          {(d.attachments || []).length > 0 && (
            <div className="doc-files">
              {d.attachments.map((f) => (
                <button key={f.path} className="doc-file press" onClick={() => show(f)}>
                  <span className="doc-ext">{f.type === 'application/pdf' ? 'PDF' : 'IMG'}</span>
                  <span className="doc-name">{f.name}</span>
                </button>
              ))}
            </div>
          )}
          {d.body && (
            <button className="btn-link" style={{ textAlign: 'left', width: 'auto', marginTop: 4 }} onClick={() => setOpen(open === d.id ? null : d.id)}>
              {open === d.id ? 'Hide email' : 'Show email'}
            </button>
          )}
          {open === d.id && <div className="doc-body">{d.body}</div>}
        </div>
      ))}
    </div>
  );
}
