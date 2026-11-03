import { useState } from 'react';
import Chips from '../components/Chips.jsx';
import { countPhotos, photoBg, short } from '../lib/derive.js';
import PhotoViewer from '../components/PhotoViewer.jsx';

const HEIGHTS = [150, 205, 175, 228, 158, 196, 168, 186];

export default function Albums({ trips, filter, onFilter, onMove, onCaption }) {
  const all = [];
  trips.forEach((t) => (t.days || []).forEach((d) => (d.photos || []).forEach((p, pi) => {
    // `label`: the caption someone wrote; `where`: the place, shown small when there's no caption yet
    const label = (p.label || '').trim();
    all.push({ tripId: t.id, trip: t.title, dayId: d.id, pi, label, where: d.place || (d.source === 'photos' ? '' : d.title) || '', caption: label || d.place || d.title, p, h: HEIGHTS[all.length % HEIGHTS.length] });
  })));
  const chips = [{ id: 'all', label: 'All' }, ...trips.filter((t) => countPhotos(t) > 0).map((t) => ({ id: t.id, label: short(t.title, 14) }))];
  const shown = all.filter((a) => filter === 'all' || a.tripId === filter);
  // the photo open full size (index into shown), or null
  const [open, setOpen] = useState(null);

  return (
    <div className="screen pad-tab albums-screen">
      <div className="safe-top-pad">
        <div className="eyebrow">Every photo</div>
        <h1 className="title-lg">Albums</h1>
        <div style={{ marginTop: 15 }}><Chips items={chips} active={filter} onSelect={(f) => { setOpen(null); onFilter(f); }} /></div>
      </div>
      {shown.length === 0 && (
        <div className="empty-block">
          <div className="empty-block-title">No photos yet</div>
          <div className="empty-sub">Add a memory with photos and they'll show up here.</div>
        </div>
      )}
      <div className="masonry">
        {shown.map((a, i) => (
          <button key={i} className="masonry-item press-soft" onClick={() => setOpen(i)} aria-label={`Open photo: ${a.caption || a.trip}`}>
            <div style={{ ...photoBg(a.p), height: a.h, width: '100%' }} />
            <div className="fill" style={{ background: 'linear-gradient(to top, rgba(26,22,18,0.52), transparent 52%)' }} />
            <div className="masonry-text">
              <div className="masonry-trip">{a.trip}{!a.label && a.where ? ' · ' + a.where : ''}</div>
              {a.label && <div className="masonry-cap captioned">{a.label}</div>}
            </div>
          </button>
        ))}
      </div>
      {open != null && shown[open] && <PhotoViewer items={shown} index={open} onIndex={setOpen} onClose={() => setOpen(null)} trips={trips}
        onMove={onMove && ((a, to) => { setOpen(null); onMove(a.tripId, a.dayId, a.pi, to); })}
        onCaption={onCaption && ((a, text) => onCaption(a.tripId, a.dayId, a.pi, text))} />}
    </div>
  );
}
