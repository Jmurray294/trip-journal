import { useEffect } from 'react';
import { photoBg, photoSrc } from '../lib/derive.js';

// One photo at full size: arrows (or ← →) step through the others, Esc or a click outside closes it.
// items: [{ p (the photo), trip?, caption?, tripId? }]; onMove (optional) gets (item, toTripId).
export default function PhotoViewer({ items, index, onIndex, onClose, trips, onMove }) {
  const a = items[index];
  const step = (n) => onIndex((index + n + items.length) % items.length);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const url = photoSrc(a.p);
  return (
    <div className="viewer" role="dialog" aria-modal="true" onClick={onClose}>
      <button className="viewer-close" onClick={onClose} aria-label="Close">×</button>
      {items.length > 1 && <button className="viewer-nav prev" onClick={(e) => { e.stopPropagation(); step(-1); }} aria-label="Previous photo">‹</button>}
      {url ? <img className="viewer-img" src={url} alt={a.caption || ''} onClick={(e) => e.stopPropagation()} />
        : <div className="viewer-img viewer-blank" style={photoBg(a.p)} onClick={(e) => e.stopPropagation()} />}
      {items.length > 1 && <button className="viewer-nav next" onClick={(e) => { e.stopPropagation(); step(1); }} aria-label="Next photo">›</button>}
      <div className="viewer-cap">
        <span className="masonry-trip">{a.trip}</span> {a.caption}
        {items.length > 1 && <span className="viewer-count"> · {index + 1} of {items.length}</span>}
        {onMove && trips && trips.length > 1 && (
          <select className="viewer-move" value="" onClick={(e) => e.stopPropagation()} onChange={(e) => e.target.value && onMove(a, e.target.value)} aria-label="Move this photo to another trip">
            <option value="">Move to trip…</option>
            {trips.filter((t) => t.id !== a.tripId).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        )}
      </div>
    </div>
  );
}
