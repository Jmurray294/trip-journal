import { useState } from 'react';
import {
  PLAN_SECTIONS, votesOf, hasVoted, scheduleByDay, timeMinutes, fmtTime, pickerTime,
  COURSES, courseOf, bringByCourse, stillNeeded, daySlots, linkLabel, bringByEvent, bringCounts, defaultEvent, eventLabel,
} from '../lib/gathering.js';

// A gathering's plan: ideas to choose from, the schedule (day by day), who's bringing what (course by
// course), who's coming. Anyone who can see it here can add to it, change an item (tap it) or take one
// off. Used in the family's app and on the guests' link page.
//   lists: planLists(trip); days: gatheringDays(span) — the gathering's days, for the schedule
//   onAdd({ planType, text, time, until, group, day, course, who, detail, event }) → true when added
//   (a thing to bring is for an `event`: a schedule item's id; none = the whole gathering)
//   onEdit(id, changes); onRemove(id); onShift(id, minutes) moves that item and the rest of its day
// Ideas: onVote(id) says "I'm in" (or takes it back) as `me` — the guests' page passes both; the family
// app passes onSchedule(id, time, day) to put a chosen idea on the schedule.
// Bring: onClaim(id) says "I'll bring it" as `me` (the guests' page).
// Schedule: onGo(id) says "I'm in" (going) or takes it back, as `me` (both pages, when there's a name).
export default function GatheringPlan({ lists, days = [], onAdd, onEdit, onRemove, onShift, onVote, onSchedule, onClaim, onGo, me = '', busy = false }) {
  const common = { onAdd, onEdit, onRemove, busy, days };
  return (
    <div className="plan">
      {PLAN_SECTIONS.map(([type, title, hint, extra]) => {
        const items = lists[type] || [];
        if (type === 'time') return <ScheduleSection key={type} title={title} items={items} bring={lists.bring || []} onShift={onShift} onGo={me ? onGo : null} me={me} {...common} />;
        if (type === 'bring') return <BringSection key={type} title={title} items={items} schedule={lists.time || []} me={me} onClaim={onClaim} {...common} />;
        return (
          <PlanSection key={type} type={type} title={title} hint={hint} extra={extra} items={items}
            onVote={onVote} onSchedule={onSchedule} me={me} {...common} />
        );
      })}
    </div>
  );
}

// the time picker gives "16:30"; the plan keeps "4:30pm"
const fromPicker = (v) => (v ? fmtTime(timeMinutes(v)) : '');
const whenOf = (d) => (d.time ? (d.until ? `${d.time}–${d.until}` : d.time) : 'Anytime');

// details, with any web address made into a small button named for the site ("Map", "AllTrails")
const URL_RE = /(https?:\/\/[^\s]*[^\s.,;:!?)])/g;
function Detail({ text }) {
  const parts = String(text || '').split(URL_RE);
  return (
    <span className="plan-detail">
      {parts.map((s, i) => (i % 2
        ? <a key={i} className="plan-link" href={s} target="_blank" rel="noopener noreferrer" title={s} onClick={(e) => e.stopPropagation()}>{linkLabel(s)} ↗</a>
        : s.trim() ? <span key={i}>{s.trim()} </span> : null))}
    </span>
  );
}

function EditButtons({ busy, ok, onSave, onCancel, onRemove }) {
  return (
    <div className="plan-edit-btns">
      <button className="btn-primary small press" disabled={!ok || busy} onClick={onSave}>Save</button>
      <button className="btn-muted press" onClick={onCancel}>Cancel</button>
      <button className="btn-link inline plan-remove" disabled={busy} onClick={onRemove}>Remove</button>
    </div>
  );
}

function DaySelect({ days, value, onChange, label = 'Day' }) {
  if (days.length < 2 && (!value || (days[0] && days[0].label === value))) return null;
  const known = days.some((d) => d.label === value);
  return (
    <select className="field plan-day" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      {!known && value && <option value={value}>{value}</option>}
      {days.map((d) => <option key={d.label} value={d.label}>{d.name}</option>)}
    </select>
  );
}

// ---------- the schedule ----------
function ScheduleSection({ title, items, bring, days, onAdd, onEdit, onRemove, onShift, onGo, me, busy }) {
  const groups = scheduleByDay(items, days);
  const [open, setOpen] = useState(null); // id
  const [day, setDay] = useState(days[0] ? days[0].label : '');
  const [time, setTime] = useState('');
  const [text, setText] = useState('');
  const [over, setOver] = useState(''); // the day being dragged over
  const add = async () => {
    if (!text.trim() || busy) return;
    const ok = await onAdd({ planType: 'time', text, time: fromPicker(time), day });
    if (ok !== false) { setText(''); setTime(''); }
  };
  const drop = (label) => (e) => {
    e.preventDefault(); setOver('');
    const id = e.dataTransfer.getData('text/plan-id');
    const d = items.find((x) => x.id === id);
    if (d && d.date !== label) onEdit(id, { day: label });
  };
  const many = groups.length > 1;
  return (
    <div className="plan-sec plan-sec-time">
      <div className="plan-title">{title} {items.length > 0 && <span className="plan-count">{items.length}</span>}</div>
      <div className="plan-note">Tap anything to move it to another time or day{many ? ', or drag it onto a day' : ''}.</div>
      {groups.length === 0 && <div className="plan-empty">Nothing yet.</div>}
      {groups.map((g) => (
        <div key={g.label || 'any'} className={'plan-day-group' + (over === g.label ? ' over' : '')}
          onDragOver={(e) => { if (e.dataTransfer.types.includes('text/plan-id')) { e.preventDefault(); setOver(g.label); } }}
          onDragLeave={() => setOver((o) => (o === g.label ? '' : o))} onDrop={drop(g.label)}>
          {many && <div className="plan-day-head">{g.name}</div>}
          {g.items.length === 0 && <div className="plan-empty">Nothing planned{many ? ' this day' : ''} yet.</div>}
          {daySlots(g.items).map((slot) => {
            const row = (d) => (open === d.id
              ? <ScheduleEdit key={d.id} d={d} days={days} busy={busy} onEdit={onEdit} onShift={onShift}
                  onRemove={async () => { await onRemove(d.id); setOpen(null); }} onClose={() => setOpen(null)} />
              : <ScheduleRow key={d.id} d={d} me={me} busy={busy} onGo={onGo} bring={bringCounts(bring, d.id)} onOpen={() => setOpen(d.id)} />);
            if (slot.length === 1) return row(slot[0]);
            // things at the same time: side by side, pick one
            return (
              <div key={slot[0].id} className={'plan-choice' + (slot.some((d) => d.id === open) ? ' editing' : '')}>
                <div className="plan-choice-head">Same time · pick one</div>
                <div className="plan-choice-items">{slot.map(row)}</div>
              </div>
            );
          })}
        </div>
      ))}
      <div className={'plan-add t-time' + (days.length > 1 ? ' with-day' : '')}>
        <DaySelect days={days} value={day} onChange={setDay} />
        <input className="field plan-x" type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Time (leave empty for anytime)" />
        <input className="field" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} placeholder="e.g. Dinner" aria-label="Add to the schedule" />
        <button className="btn-primary small press plan-btn" disabled={!text.trim() || busy} onClick={add}>Add</button>
      </div>
    </div>
  );
}

function ScheduleRow({ d, me, busy, onGo, bring, onOpen }) {
  const going = votesOf(d);
  const mine = hasVoted(d, me);
  return (
    <div className="plan-row plan-idea plan-sched">
      <button className="plan-idea-main" onClick={onOpen} title="Tap to change or move"
        draggable onDragStart={(e) => { e.dataTransfer.setData('text/plan-id', d.id); e.dataTransfer.effectAllowed = 'move'; }}>
        <span className={'plan-time' + (d.time ? '' : ' none')}>{whenOf(d)}</span>
        <span className="plan-text">{d.title}</span>
        {d.group && <span className="plan-group">{d.group}</span>}
        {d.detail && <Detail text={d.detail} />}
        {going.length > 0 && <span className="plan-votes"><b>Going ({going.length})</b> · {going.join(', ')}</span>}
        {bring && bring.total > 0 && <span className="plan-votes plan-bring-count">{bring.total} to bring{bring.needed ? <> · <b className="plan-needed-count">{bring.needed} still needed</b></> : ' · all covered'}</span>}
        {d.by && <span className="plan-by">added by {d.by}</span>}
      </button>
      {onGo && (
        <button className={'plan-vote press' + (mine ? ' on' : '')} disabled={busy} onClick={() => onGo(d.id)} aria-pressed={mine}>
          {mine ? '✓ I’m in' : 'I’m in'}
        </button>
      )}
    </div>
  );
}

function ScheduleEdit({ d, days, busy, onEdit, onShift, onRemove, onClose }) {
  const timed = timeMinutes(d.time) != null;
  const i = days.findIndex((x) => x.label === d.date);
  const move = (mins) => onEdit(d.id, { time: fmtTime(timeMinutes(d.time) + mins), ...(timeMinutes(d.until) != null ? { until: fmtTime(timeMinutes(d.until) + mins) } : {}) });
  const early = timed && timeMinutes(d.time) >= 30;
  const late = timed && timeMinutes(d.time) <= 23 * 60;
  return (
    <div className="plan-edit">
      <div className="plan-move">
        <span className="plan-move-what"><b>{whenOf(d)}</b> {d.title}</span>
        <span className="plan-move-label" style={{ flexBasis: "auto" }}>Move it:</span>
        <div className="plan-move-btns">
          {timed && <button className="plan-chip press" disabled={busy || !early} onClick={() => move(-30)}>− 30 min</button>}
          {timed && <button className="plan-chip press" disabled={busy || !late} onClick={() => move(30)}>+ 30 min</button>}
          {i > 0 && <button className="plan-chip press" disabled={busy} onClick={() => onEdit(d.id, { day: days[i - 1].label })}>‹ {days[i - 1].name.split(' ')[0]}</button>}
          {i >= 0 && i < days.length - 1 && <button className="plan-chip press" disabled={busy} onClick={() => onEdit(d.id, { day: days[i + 1].label })}>{days[i + 1].name.split(' ')[0]} ›</button>}
        </div>
        {timed && onShift && (
          <div className="plan-move-btns">
            <span className="plan-move-label">Running late? Push this and the rest of the day back</span>
            <button className="plan-chip press" disabled={busy || !late} onClick={() => onShift(d.id, 30)}>30 min</button>
            <button className="plan-chip press" disabled={busy || !late} onClick={() => onShift(d.id, 60)}>1 hour</button>
          </div>
        )}
      </div>
      <div className="plan-edit-head">Change the details</div>
      {/* the full edit; keyed so it shows the new day and time after a quick move */}
      <ScheduleForm key={`${d.date}|${d.time}|${d.until}`} d={d} days={days} busy={busy} onRemove={onRemove} onClose={onClose}
        onSave={async (c) => { await onEdit(d.id, c); onClose(); }} />
    </div>
  );
}

function ScheduleForm({ d, days, busy, onSave, onRemove, onClose }) {
  const [text, setText] = useState(d.title || '');
  const [day, setDay] = useState(d.date || (days[0] && days[0].label) || '');
  const [time, setTime] = useState(pickerTime(d.time));
  const [until, setUntil] = useState(pickerTime(d.until));
  const [group, setGroup] = useState(d.group || '');
  const [detail, setDetail] = useState(d.detail || '');
  const [going, setGoing] = useState(votesOf(d).join(', '));
  // a time written by hand that the picker can't show ("after dinner") stays unless it's changed
  const odd = !!d.time && timeMinutes(d.time) == null;
  const [timeTouched, setTimeTouched] = useState(false);
  const save = () => {
    if (!text.trim()) return;
    const c = { text, day, group, detail, going };
    if (!odd || timeTouched) { c.time = fromPicker(time); c.until = time ? fromPicker(until) : ''; }
    onSave(c);
  };
  const key = (e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onClose(); };
  return (
    <>
      <div className="plan-form">
        <label className="plan-f wide"><span>What</span><input className="field" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={key} aria-label="What" /></label>
        {days.length > 1 && <label className="plan-f"><span>Day</span><DaySelect days={days} value={day} onChange={setDay} /></label>}
        <label className="plan-f"><span>Starts{odd && !timeTouched ? ` (now “${d.time}”)` : ''}</span>
          <input className="field" type="time" value={time} onChange={(e) => { setTime(e.target.value); setTimeTouched(true); }} aria-label="Starts" /></label>
        <label className="plan-f"><span>Until (optional)</span>
          <input className="field" type="time" value={until} disabled={!time} onChange={(e) => { setUntil(e.target.value); setTimeTouched(true); }} aria-label="Until" /></label>
        <label className="plan-f"><span>For (optional)</span><input className="field" value={group} onChange={(e) => setGroup(e.target.value)} onKeyDown={key} placeholder="e.g. Kids, Everyone" aria-label="For" /></label>
        <label className="plan-f wide"><span>Who’s going (optional)</span><input className="field" value={going} onChange={(e) => setGoing(e.target.value)} onKeyDown={key} placeholder="e.g. Joe, Roger" aria-label="Who's going" /></label>
        <label className="plan-f wide"><span>Notes or link (optional)</span><input className="field" value={detail} onChange={(e) => setDetail(e.target.value)} onKeyDown={key} aria-label="Notes or link" /></label>
      </div>
      {time && <button className="btn-link inline plan-anytime" onClick={() => { setTime(''); setUntil(''); setTimeTouched(true); }}>No set time (anytime)</button>}
      <EditButtons busy={busy} ok={!!text.trim()} onSave={save} onCancel={onClose} onRemove={onRemove} />
    </>
  );
}

// ---------- who's bringing what ----------
function EventSelect({ events, days, value, onChange }) {
  return (
    <select className="field plan-event" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Which event it's for">
      {events.map((e) => <option key={e.id} value={e.id}>For {eventLabel(e, days)}</option>)}
      <option value="">For the whole gathering</option>
    </select>
  );
}

function BringSection({ title, items, schedule, days, me, onAdd, onEdit, onRemove, onClaim, busy }) {
  const [open, setOpen] = useState(null);
  const [text, setText] = useState('');
  const [course, setCourse] = useState('Sides');
  const [who, setWho] = useState('');
  // which event new things are for: the last one picked, else the likeliest
  const [picked, setPicked] = useState(null);
  const [moveTo, setMoveTo] = useState(null);
  const events = scheduleByDay(schedule, days).flatMap((g) => g.items);
  const guess = defaultEvent(items, schedule);
  const event = picked !== null && (picked === '' || events.some((e) => e.id === picked)) ? picked : guess;
  const needed = items.filter(stillNeeded).length;
  const groups = bringByEvent(items, schedule, days);
  const loose = groups.find((g) => !g.event);
  const target = moveTo !== null ? moveTo : (guess || (events[0] && events[0].id) || '');
  const add = async () => {
    if (!text.trim() || busy) return;
    const ok = await onAdd({ planType: 'bring', text, course, who, event });
    if (ok !== false) { setText(''); setWho(''); }
  };
  const moveLoose = async () => { for (const d of loose.items) await onEdit(d.id, { event: target }); };
  const key = (e) => { if (e.key === 'Enter') add(); };
  const titled = groups.some((g) => g.event);
  return (
    <div className="plan-sec plan-sec-bring">
      <div className="plan-title">{title} {items.length > 0 && <span className="plan-count">{items.length}</span>}</div>
      <div className="plan-note">
        {needed > 0 && <b className="plan-needed-count">{needed} still needed. </b>}
        {onClaim ? 'Tap “I’ll bring it” on anything still needed, or add what you’re bringing.' : 'List what’s needed and leave Who empty; guests tap “I’ll bring it” on their link.'}
      </div>
      {/* things from before the list knew about events: put them with one */}
      {!onClaim && loose && events.length > 0 && (
        <div className="plan-link-event">
          <span>{titled ? `${loose.items.length} not tied to an event.` : 'Which event are these for?'}</span>
          <EventSelect events={events} days={days} value={target} onChange={setMoveTo} />
          <button className="btn-primary small press" disabled={busy || !target} onClick={moveLoose}>Move {loose.items.length === 1 ? 'it' : `all ${loose.items.length}`}</button>
        </div>
      )}
      {items.length === 0 && <div className="plan-empty">Nothing yet.</div>}
      {groups.map((g) => (
        <div key={g.event ? g.event.id : 'loose'} className="plan-bring-event">
          {(titled || g.event) && (
            <div className="plan-event-head">
              {g.event ? <>For <b>{g.event.title}</b>{[dayShortOf(g.event, days), g.event.time].filter(Boolean).length > 0 && <span> · {[dayShortOf(g.event, days), g.event.time].filter(Boolean).join(' ')}</span>}</> : <b>For the whole gathering</b>}
            </div>
          )}
          {bringByCourse(g.items).map((c) => (
            <div key={c.course} className="plan-course">
              <div className="plan-day-head">{c.course}</div>
              {c.items.map((d) => (open === d.id
                ? <BringEdit key={d.id} d={d} events={events} days={days} busy={busy} onClose={() => setOpen(null)}
                    onSave={async (ch) => { await onEdit(d.id, ch); setOpen(null); }}
                    onRemove={async () => { await onRemove(d.id); setOpen(null); }} />
                : <BringRow key={d.id} d={d} me={me} busy={busy} onClaim={onClaim} onOpen={() => setOpen(d.id)} />))}
            </div>
          ))}
        </div>
      ))}
      <div className="plan-add t-bring">
        <input className="field" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={key} placeholder="e.g. Green bean casserole" aria-label="Add something to bring" />
        {events.length > 0 && <EventSelect events={events} days={days} value={event} onChange={setPicked} />}
        <select className="field plan-x" value={course} onChange={(e) => setCourse(e.target.value)} aria-label="Course">
          {COURSES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <input className="field plan-x" value={who} onChange={(e) => setWho(e.target.value)} onKeyDown={key} placeholder={onClaim ? 'Who (or leave empty)' : 'Who (empty = needed)'} aria-label="Who's bringing it" />
        <button className="btn-primary small press plan-btn" disabled={!text.trim() || busy} onClick={add}>Add</button>
      </div>
    </div>
  );
}
const dayShortOf = (e, days) => { const d = days.find((x) => x.label === e.date); return d ? d.name.split(' ')[0] : ''; };

function BringRow({ d, me, busy, onClaim, onOpen }) {
  const need = stillNeeded(d);
  const mine = !need && !!me && String(d.who).trim().toLowerCase() === String(me).trim().toLowerCase();
  return (
    <div className={'plan-row plan-idea' + (need ? ' needed' : '')}>
      <button className="plan-idea-main" onClick={onOpen} title="Tap to change">
        <span className="plan-text">{d.title}</span>
        {need ? <span className="plan-need">Still needed</span> : <span className="plan-who">{d.who}</span>}
        {d.detail && <Detail text={d.detail} />}
      </button>
      {onClaim && (need || mine) && (
        <button className={'plan-vote press' + (mine ? ' on' : '')} disabled={busy} onClick={() => onClaim(d.id)} aria-pressed={mine}>
          {mine ? '✓ I’m bringing it' : 'I’ll bring it'}
        </button>
      )}
    </div>
  );
}

function BringEdit({ d, events, days, busy, onSave, onRemove, onClose }) {
  const [text, setText] = useState(d.title || '');
  const [course, setCourse] = useState(courseOf(d));
  const [who, setWho] = useState(d.who || '');
  const [detail, setDetail] = useState(d.detail || '');
  const [event, setEvent] = useState(events.some((e) => e.id === d.event) ? d.event : '');
  const save = () => { if (text.trim()) onSave({ text, course, who, detail, event }); };
  const key = (e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onClose(); };
  return (
    <div className="plan-edit">
      <div className="plan-form">
        <label className="plan-f wide"><span>What</span><input className="field" value={text} autoFocus onChange={(e) => setText(e.target.value)} onKeyDown={key} aria-label="What" /></label>
        {events.length > 0 && <label className="plan-f wide"><span>For</span><EventSelect events={events} days={days} value={event} onChange={setEvent} /></label>}
        <label className="plan-f"><span>Course</span>
          <select className="field" value={course} onChange={(e) => setCourse(e.target.value)} aria-label="Course">{COURSES.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="plan-f"><span>Who’s bringing it</span><input className="field" value={who} onChange={(e) => setWho(e.target.value)} onKeyDown={key} placeholder="Empty = still needed" aria-label="Who" /></label>
        <label className="plan-f wide"><span>Note (optional)</span><input className="field" value={detail} onChange={(e) => setDetail(e.target.value)} onKeyDown={key} placeholder="e.g. gluten-free, serves 12" aria-label="Note" /></label>
      </div>
      <EditButtons busy={busy} ok={!!text.trim()} onSave={save} onCancel={onClose} onRemove={onRemove} />
    </div>
  );
}

// ---------- ideas, and who's coming ----------
const extraOf = (type, d) => (type === 'idea' ? d.detail : '') || '';
const withExtra = (type, text, x) => ({ text, ...(type === 'idea' ? { detail: x } : {}) });

function PlanSection({ type, title, hint, extra, items, days, onAdd, onEdit, onRemove, onVote, onSchedule, me, busy }) {
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
        ? <PlanEdit key={d.id} type={type} d={d} extra={extra} days={days} busy={busy} onSchedule={onSchedule ? (t, day) => onSchedule(d.id, t, day) : null}
            onSave={async (c) => { await onEdit(d.id, c); setEditing(null); }}
            onRemove={async () => { await onRemove(d.id); setEditing(null); }}
            onCancel={() => setEditing(null)} />
        : type === 'idea'
          ? <IdeaRow key={d.id} d={d} me={me} busy={busy} onVote={onVote} onOpen={() => setEditing(d.id)} />
          : (
            <button key={d.id} className="plan-row" onClick={() => setEditing(d.id)} title="Tap to change">
              <span className="plan-text">{d.title}</span>
              {d.by && <span className="plan-by">added by {d.by}</span>}
            </button>
          )))}
      <div className={'plan-add t-' + type}>
        <input className="field" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={key} placeholder={hint} aria-label={'Add to ' + title} />
        {type === 'idea' && <input className="field plan-x" value={x} onChange={(e) => setX(e.target.value)} onKeyDown={key} placeholder={extra} aria-label={extra} />}
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

function PlanEdit({ type, d, extra, days, busy, onSave, onRemove, onCancel, onSchedule }) {
  const [text, setText] = useState(d.title || '');
  const [x, setX] = useState(extraOf(type, d));
  const [when, setWhen] = useState('');
  const [day, setDay] = useState(days[0] ? days[0].label : '');
  const save = () => { if (text.trim()) onSave(withExtra(type, text, x)); };
  const key = (e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onCancel(); };
  return (
    <div className="plan-edit">
      <div className={'plan-add t-' + type} style={{ marginTop: 0 }}>
        <input className="field" value={text} autoFocus onChange={(e) => setText(e.target.value)} onKeyDown={key} aria-label="Item" />
        {type === 'idea' && <input className="field plan-x" value={x} onChange={(e) => setX(e.target.value)} onKeyDown={key} placeholder={extra} aria-label={extra} />}
      </div>
      <EditButtons busy={busy} ok={!!text.trim()} onSave={save} onCancel={onCancel} onRemove={onRemove} />
      {type === 'idea' && onSchedule && (
        <div className="plan-schedule">
          <span>We’re doing it:</span>
          <DaySelect days={days} value={day} onChange={setDay} />
          <input className="field plan-x" type="time" value={when} onChange={(e) => setWhen(e.target.value)} aria-label="When (leave empty for anytime)" />
          <button className="btn-primary small press" disabled={busy} onClick={() => onSchedule(fromPicker(when), day)}>Put on the schedule</button>
        </div>
      )}
    </div>
  );
}
