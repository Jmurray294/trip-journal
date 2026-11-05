import { useState } from 'react';
import { PLAN_SECTIONS } from '../lib/gathering.js';

// A gathering's plan in three lists: the schedule, who's bringing what, who's coming. Anyone who
// can see it here can add to it, change an item (tap it) or take one off. Used in the family's app
// and on the guests' link page. lists: planLists(trip); onAdd({ planType, text, time, who }) → true
// when added; onEdit(id, { text, time, who }); onRemove(id).
export default function GatheringPlan({ lists, onAdd, onEdit, onRemove, busy = false }) {
  return (
    <div className="plan">
      {PLAN_SECTIONS.map(([type, title, hint, extra]) => (
        <PlanSection key={type} type={type} title={title} hint={hint} extra={extra} items={lists[type] || []}
          onAdd={onAdd} onEdit={onEdit} onRemove={onRemove} busy={busy} />
      ))}
    </div>
  );
}

const extraOf = (type, d) => (type === 'time' ? d.time : type === 'bring' ? d.who : '') || '';
const withExtra = (type, text, x) => ({ text, ...(type === 'time' ? { time: x } : type === 'bring' ? { who: x } : {}) });

function PlanSection({ type, title, hint, extra, items, onAdd, onEdit, onRemove, busy }) {
  const [text, setText] = useState('');
  const [x, setX] = useState('');
  const [editing, setEditing] = useState(null); // id
  const add = async () => {
    if (!text.trim() || busy) return;
    const ok = await onAdd({ planType: type, ...withExtra(type, text, x) });
    if (ok !== false) { setText(''); setX(''); }
  };
  const key = (e) => { if (e.key === 'Enter') add(); };
  return (
    <div className="plan-sec">
      <div className="plan-title">{title} {items.length > 0 && <span className="plan-count">{items.length}</span>}</div>
      {items.length === 0 && <div className="plan-empty">Nothing yet.</div>}
      {items.map((d) => (editing === d.id
        ? <PlanEdit key={d.id} type={type} d={d} extra={extra} busy={busy}
            onSave={async (c) => { await onEdit(d.id, c); setEditing(null); }}
            onRemove={async () => { await onRemove(d.id); setEditing(null); }}
            onCancel={() => setEditing(null)} />
        : (
          <button key={d.id} className="plan-row" onClick={() => setEditing(d.id)} title="Tap to change">
            {type === 'time' && <span className="plan-time">{d.time || '—'}</span>}
            <span className="plan-text">{d.title}</span>
            {type === 'bring' && d.who && <span className="plan-who">{d.who}</span>}
            {d.by && <span className="plan-by">added by {d.by}</span>}
          </button>
        )))}
      <div className={'plan-add' + (type === 'coming' ? ' one' : '')}>
        {type === 'time' && <input className="field plan-x" value={x} onChange={(e) => setX(e.target.value)} onKeyDown={key} placeholder={extra} aria-label="Time" />}
        <input className="field" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={key} placeholder={hint} aria-label={'Add to ' + title} />
        {type === 'bring' && <input className="field plan-x" value={x} onChange={(e) => setX(e.target.value)} onKeyDown={key} placeholder={extra} aria-label="Who" />}
        <button className="btn-primary small press plan-btn" disabled={!text.trim() || busy} onClick={add}>Add</button>
      </div>
    </div>
  );
}

function PlanEdit({ type, d, extra, busy, onSave, onRemove, onCancel }) {
  const [text, setText] = useState(d.title || '');
  const [x, setX] = useState(extraOf(type, d));
  const save = () => { if (text.trim()) onSave(withExtra(type, text, x)); };
  const key = (e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onCancel(); };
  return (
    <div className="plan-edit">
      <div className={'plan-add' + (type === 'coming' ? ' one' : '')} style={{ marginTop: 0 }}>
        {type === 'time' && <input className="field plan-x" value={x} onChange={(e) => setX(e.target.value)} onKeyDown={key} placeholder={extra} aria-label="Time" />}
        <input className="field" value={text} autoFocus onChange={(e) => setText(e.target.value)} onKeyDown={key} aria-label="Item" />
        {type === 'bring' && <input className="field plan-x" value={x} onChange={(e) => setX(e.target.value)} onKeyDown={key} placeholder={extra} aria-label="Who" />}
      </div>
      <div className="plan-edit-btns">
        <button className="btn-primary small press" disabled={!text.trim() || busy} onClick={save}>Save</button>
        <button className="btn-muted press" onClick={onCancel}>Cancel</button>
        <button className="btn-link inline plan-remove" disabled={busy} onClick={onRemove}>Remove</button>
      </div>
    </div>
  );
}
