import { useEffect, useState } from 'react';
import { money } from '../lib/derive.js';

// Forwarded emails the reader was not sure about. Pick the trip and everything in the email is
// filed there (itinerary items and costs); or start a new trip from it; or dismiss it.

function lines(item) {
  const out = [];
  for (const r of item.entries || []) out.push({ k: r.id, left: [r.doc.kind, r.doc.date].filter(Boolean).join(' · '), main: r.doc.title });
  for (const r of item.costs || []) {
    const d = r.doc;
    out.push({ k: r.id, left: d.status === 'due' ? 'Due' : d.status === 'refund' ? 'Refund' : 'Paid', main: `${d.title} · ${money(d.amount, d.currency)}` });
  }
  return out;
}

function Item({ item, trips, onFile, onDismiss }) {
  const [busy, setBusy] = useState(false);
  const s = item.suggestion || {};
  // the trip the reader leaned towards first, then the rest
  const ordered = [...trips].sort((a, b) => (b.id === s.trip_id) - (a.id === s.trip_id));
  const run = async (fn) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };

  return (
    <div className="sort-item">
      <div className="sort-summary">{item.summary || item.subject || '(no subject)'}</div>
      {item.subject && item.summary && <div className="sort-subject">{item.subject}</div>}
      <div className="sort-lines">
        {lines(item).map((l) => (
          <div key={l.k} className="sort-line"><span className="sort-left">{l.left}</span><span className="sort-main">{l.main}</span></div>
        ))}
      </div>
      {s.reason && <div className="sort-reason">{s.reason}</div>}
      <div className="field-label" style={{ marginTop: 14 }}>File in</div>
      <div className="chips wrap">
        {ordered.map((t) => (
          <button key={t.id} className={'chip' + (t.id === s.trip_id ? ' active' : '')} disabled={busy}
            onClick={() => run(() => onFile(item, t.id))}>{t.title}</button>
        ))}
        {(item.entries || []).length > 0 && (
          <button className="chip" disabled={busy} onClick={() => run(() => onFile(item, 'new'))}>+ New trip{s.title ? ': ' + s.title : ''}</button>
        )}
      </div>
      <button className="btn-link" style={{ textAlign: 'left', width: 'auto' }} disabled={busy} onClick={() => run(() => onDismiss(item))}>Dismiss</button>
    </div>
  );
}

export default function SortSheet({ items, trips, onFile, onDismiss, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  useEffect(() => { if (!items.length) onClose(); }, [items.length, onClose]);

  return (
    <div className="sheet-root">
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label="To sort">
        <div className="grab" />
        <div className="serif" style={{ fontSize: 24, fontWeight: 600 }}>To sort</div>
        <div className="sheet-copy">We weren't sure which trip these emails belong to. Pick one and everything in the email is added to it.</div>
        <div className="stack-16" style={{ marginTop: 16 }}>
          {items.map((it) => <Item key={it.id} item={it} trips={trips} onFile={onFile} onDismiss={onDismiss} />)}
        </div>
      </div>
    </div>
  );
}
