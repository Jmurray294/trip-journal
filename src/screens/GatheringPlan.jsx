import { useState } from 'react';
import { PLAN_SECTIONS, votesOf, hasVoted } from '../lib/gathering.js';

// A gathering's plan: ideas to choose from, the schedule, who's bringing what, who's coming. Anyone
// who can see it here can add to it, change an item (tap it) or take one off. Used in the family's app
// and on the guests' link page. lists: planLists(trip); onAdd({ planType, text, time, who, detail }) →
// true when added; onEdit(id, { text, time, who, detail }); onRemove(id).
// Ideas: onVote(id) says "I'm in" (or takes it back) as `me` — the guests' page passes both; the family
// app passes onSchedule(id, time) to put a chosen idea on the schedule.
export default function GatheringPlan({ lists, onAdd, onEdit, onRemove, onVote, onSchedule, me = '', busy = false }) {
  return (
    <div className="plan">
      {PLAN_SECTIONS.map(([type, title, hint, extra]) => (
        <PlanSection key={type} type={type} title={title} hint={hint} extra={extra} items={lists[type] || []}
          onAdd={onAdd} onEdit={onEdit} onRemove={onRemove} onVote={onVote} onSchedule={onSchedule} me={me} busy={busy} />
      ))}
    </div>
  );
}

const extraOf = (type, d) => (type === 'time' ? d.time : type === 'bring' ? d.who : type === 'idea' ? d.detail : '') || '';
const withExtra = (type, text, x) => ({ text, ...(type === 'time' ? { time: x } : type === 'bring' ? { who: x } : type === 'idea' ? { detail: x } : {}) });

// details with any web address made into a link
const URL_RE = /(https?:\/\/[^\s]+)/g;
function Detail({ text }) {
  const parts = String(text || '').split(URL_RE);
  return (
    <span className="plan-detail">
      {parts.map((s, i) => (i % 2
        ? <a key={i} href={s} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>{s.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40)}</a>
        : s))}
    </span>
  );
}

function PlanSection({ type, title, hint, extra, items, onAdd, onEdit, onRemove, onVote, onSchedule, me, busy }) {
  const [text, setText] = useState('');
  const [x, setX] = useState('');
  const [editing, setEditing] = useState(null); // id
  const add = async () => {
    if (!text.trim() || busy) return;
    const ok = await onAdd({ planType: type, ...withExtra(type, text, x) });
    if (ok !== false) { setText(''); setX(''); }
  };
  const key = (e) => { if (e.key === 'Enter') add(); };
  const note = type === 'idea' && (onVote
    ? 'Things we could do. Tap “I’m in” on the ones you’d like, and add your own.'
    : 'Things you could do together. Guests tap “I’m in” on their link; tap one you pick to put it on the schedule.');
  return (
    <div className={'plan-sec plan-sec-' + type}>
      <div className="plan-title">{title} {items.length > 0 && <span className="plan-count">{items.length}</span>}</div>
      {note && <div className="plan-note">{note}</div>}
      {items.length === 0 && <div className="plan-empty">Nothing yet.</div>}
      {items.map((d) => (editing === d.id
        ? <PlanEdit key={d.id} type={type} d={d} extra={extra} busy={busy} onSchedule={onSchedule ? (t) => onSchedule(d.id, t) : null}
            onSave={async (c) => { await onEdit(d.id, c); setEditing(null); }}
            onRemove={async () => { await onRemove(d.id); setEditing(null); }}
            onCancel={() => setEditing(null)} />
        : type === 'idea'
          ? <IdeaRow key={d.id} d={d} me={me} busy={busy} onVote={onVote} onOpen={() => setEditing(d.id)} />
          : (
            <button key={d.id} className="plan-row" onClick={() => setEditing(d.id)} title="Tap to change">
              {type === 'time' && <span className="plan-time">{d.time || '—'}</span>}
              <span className="plan-text">{d.title}</span>
              {type === 'bring' && d.who && <span className="plan-who">{d.who}</span>}
              {type === 'time' && d.detail && <Detail text={d.detail} />}
              {d.by && <span className="plan-by">added by {d.by}</span>}
            </button>
          )))}
      <div className={'plan-add t-' + type}>
        {type === 'time' && <input className="field plan-x" value={x} onChange={(e) => setX(e.target.value)} onKeyDown={key} placeholder={extra} aria-label="Time" />}
        <input className="field" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={key} placeholder={hint} aria-label={'Add to ' + title} />
        {(type === 'bring' || type === 'idea') && <input className="field plan-x" value={x} onChange={(e) => setX(e.target.value)} onKeyDown={key} placeholder={extra} aria-label={extra} />}
        <button className="btn-primary small press plan-btn" disabled={!text.trim() || busy} onClick={add}>Add</button>
      </div>
    </div>
  );
}

function IdeaRow({ d, me, busy, onVote, onOpen }) {
  const votes = votesOf(d);
  const mine = hasVoted(d, me);
  return (
    <div className="plan-row plan-idea">
      <button className="plan-idea-main" onClick={onOpen} title="Tap to change">
        <span className="plan-text">{d.title}</span>
        {d.detail && <Detail text={d.detail} />}
        <span className="plan-votes">
          {votes.length ? <><b>{votes.length} in</b> · {votes.join(', ')}</> : 'No one yet'}
        </span>
        {d.by && <span className="plan-by">added by {d.by}</span>}
      </button>
      {onVote && (
        <button className={'plan-vote press' + (mine ? ' on' : '')} disabled={busy} onClick={() => onVote(d.id)} aria-pressed={mine}>
          {mine ? '✓ I’m in' : 'I’m in'}
        </button>
      )}
    </div>
  );
}

function PlanEdit({ type, d, extra, busy, onSave, onRemove, onCancel, onSchedule }) {
  const [text, setText] = useState(d.title || '');
  const [x, setX] = useState(extraOf(type, d));
  const [when, setWhen] = useState('');
  const save = () => { if (text.trim()) onSave(withExtra(type, text, x)); };
  const key = (e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onCancel(); };
  return (
    <div className="plan-edit">
      <div className={'plan-add t-' + type} style={{ marginTop: 0 }}>
        {type === 'time' && <input className="field plan-x" value={x} onChange={(e) => setX(e.target.value)} onKeyDown={key} placeholder={extra} aria-label="Time" />}
        <input className="field" value={text} autoFocus onChange={(e) => setText(e.target.value)} onKeyDown={key} aria-label="Item" />
        {(type === 'bring' || type === 'idea') && <input className="field plan-x" value={x} onChange={(e) => setX(e.target.value)} onKeyDown={key} placeholder={extra} aria-label={extra} />}
      </div>
      <div className="plan-edit-btns">
        <button className="btn-primary small press" disabled={!text.trim() || busy} onClick={save}>Save</button>
        <button className="btn-muted press" onClick={onCancel}>Cancel</button>
        <button className="btn-link inline plan-remove" disabled={busy} onClick={onRemove}>Remove</button>
      </div>
      {type === 'idea' && onSchedule && (
        <div className="plan-schedule">
          <span>We’re doing it:</span>
          <input className="field plan-x" value={when} onChange={(e) => setWhen(e.target.value)} placeholder="When, e.g. Fri 6pm" aria-label="When" />
          <button className="btn-primary small press" disabled={busy} onClick={() => onSchedule(when)}>Put on the schedule</button>
        </div>
      )}
    </div>
  );
}
