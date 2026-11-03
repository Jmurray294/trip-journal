import { useEffect, useState } from 'react';
import { photoBg, photoSrc } from '../lib/derive.js';

// One photo at full size: arrows (or ← →) step through the others, Esc or a click outside closes it.
// items: [{ p (the photo), trip?, caption?, tripId? }]; onMove (optional) gets (item, toTripId);
// onCaption (optional) gets (item, text) and shows a box to write the photo's caption;
// onCover (optional) gets (item) to make it the trip's cover, and isCover(item) says if it already is.
export default function PhotoViewer({ items, index, onIndex, onClose, trips, onMove, onCaption, onCover, isCover }) {
  const a = items[index];
  const step = (n) => onIndex((index + n + items.length) % items.length);
  const saved = (a.p && a.p.label) || '';
  const [text, setText] = useState(saved);
  useEffect(() => { setText(saved); }, [index, saved]);
  const save = () => { if (onCaption && text.trim() !== saved.trim()) onCaption(a, text.trim()); };

  useEffect(() => {
    const onKey = (e) => {
      // typing a caption: the arrow keys move the cursor, Esc leaves the box
      if (e.target && e.target.tagName === 'INPUT') { if (e.key === 'Escape') e.target.blur(); return; }
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const url = photoSrc(a.p);
  const go = (n) => (e) => { e.stopPropagation(); save(); step(n); };
  return (
    <div className="viewer" role="dialog" aria-modal="true" onClick={() => { save(); onClose(); }}>
      <button className="viewer-close" onClick={(e) => { e.stopPropagation(); save(); onClose(); }} aria-label="Close">×</button>
      {items.length > 1 && <button className="viewer-nav prev" onClick={go(-1)} aria-label="Previous photo">‹</button>}
      {url ? <img className="viewer-img" src={url} alt={a.caption || ''} onClick={(e) => e.stopPropagation()} />
        : <div className="viewer-img viewer-blank" style={photoBg(a.p)} onClick={(e) => e.stopPropagation()} />}
      {items.length > 1 && <button className="viewer-nav next" onClick={go(1)} aria-label="Next photo">›</button>}
      <div className="viewer-cap" onClick={(e) => e.stopPropagation()}>
        {onCaption ? (
          <div className="viewer-caption-row">
            {a.trip && <span className="masonry-trip">{a.trip}</span>}
            <input className="viewer-caption" value={text} maxLength={140} placeholder="Add a caption…" aria-label="Caption"
              onChange={(e) => setText(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }} />
          </div>
        ) : (<><span className="masonry-trip">{a.trip}</span> {a.caption}</>)}
        {items.length > 1 && <span className="viewer-count"> · {index + 1} of {items.length}</span>}
        {onMove && trips && trips.length > 1 && (
          <select className="viewer-move" value="" onChange={(e) => e.target.value && onMove(a, e.target.value)} aria-label="Move this photo to another trip">
            <option value="">Move to trip…</option>
            {trips.filter((t) => t.id !== a.tripId).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        )}
        {onCover && (isCover && isCover(a)
          ? <span className="viewer-move viewer-cover on">★ Trip cover</span>
          : <button className="viewer-move viewer-cover" onClick={() => onCover(a)}>☆ Use as trip cover</button>)}
      </div>
    </div>
  );
}
