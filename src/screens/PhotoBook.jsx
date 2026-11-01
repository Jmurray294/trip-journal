import { useEffect, useMemo, useRef, useState } from 'react';
import { Chevron } from '../components/Icons.jsx';
import { supabase } from '../lib/supabase.js';
import { photoSrc, src as assetSrc } from '../lib/derive.js';
import { ensureMedia } from '../lib/media.js';
import { SIZES, MIN_PAGES, buildPages, collectPhotos, bookingLines, draftFromWriter, unusedPhotos, photoByRef } from '../lib/book.js';
import { drawPage, ensureFonts, loadImages, mapData, exportBook } from '../lib/bookRender.js';

// A trip as a printable photo book: Claude writes it (title, intro, a chapter per day or place,
// captions, closing), you edit it, then download a PDF (Lulu, Blurb, home) or page images (Shutterfly).
// The draft is saved on the trip (trip.book), so it syncs and survives closing the app.

const PREVIEW_DPI = 60;

// a small copy of a photo for the writer to look at
async function thumbnail(photo) {
  const url = photo.src ? assetSrc(photo.src) : await ensureMedia(photo.path);
  if (!url) return null;
  const img = new Image();
  await new Promise((res) => { img.onload = res; img.onerror = res; img.src = url; });
  if (!img.naturalWidth) return null;
  const sc = Math.min(1, 768 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * sc); c.height = Math.round(img.naturalHeight * sc);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.72);
}

function PageCanvas({ page, size, ctx, onClick, active }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) drawPage(ref.current, page, size, PREVIEW_DPI, ctx); }, [page, size, ctx]);
  return (
    <button className={'book-page' + (active ? ' on' : '')} onClick={onClick} aria-label={'Page ' + page.n}>
      <canvas ref={ref} />
      <span className="book-page-n">{page.n === 1 ? 'Cover' : page.n}</span>
    </button>
  );
}

function Thumb({ photo, on, onClick, label }) {
  const u = photoSrc(photo);
  return (
    <button className={'book-thumb' + (on ? ' on' : '')} onClick={onClick} aria-label={label}>
      {u ? <img src={u} alt="" /> : <span />}
    </button>
  );
}

function Editor({ trip, draft, page, onChange }) {
  const set = (patch) => onChange({ ...draft, ...patch });
  const setChapter = (ci, patch) => onChange({ ...draft, chapters: draft.chapters.map((c, i) => (i === ci ? { ...c, ...patch } : c)) });
  const setCaption = (ref, text) => onChange({ ...draft, captions: { ...draft.captions, [ref]: text } });
  const all = collectPhotos(trip);

  if (page.type === 'cover') {
    return (
      <>
        <div className="field-label">Title</div>
        <input className="field" value={draft.title} onChange={(e) => set({ title: e.target.value })} />
        <div className="field-label" style={{ marginTop: 12 }}>Subtitle</div>
        <input className="field" value={draft.subtitle} onChange={(e) => set({ subtitle: e.target.value })} />
        {all.length > 0 && (<>
          <div className="field-label" style={{ marginTop: 12 }}>Cover photo</div>
          <div className="book-thumbs">{all.map((p) => <Thumb key={p.ref} photo={p.photo} on={draft.cover === p.ref} onClick={() => set({ cover: p.ref })} label="Use as cover" />)}</div>
        </>)}
      </>
    );
  }
  if (page.type === 'text') {
    return (<><div className="field-label">Introduction</div><textarea className="field book-text" value={draft.intro} onChange={(e) => set({ intro: e.target.value })} /></>);
  }
  if (page.type === 'closing') {
    return (<><div className="field-label">Closing</div><textarea className="field book-text" value={draft.closing} onChange={(e) => set({ closing: e.target.value })} />
      {trip.song && <div className="sheet-copy">Your trip song is printed beside it.</div>}</>);
  }
  if (page.type === 'map') return <div className="sheet-copy">The map shows every place in your itinerary that has a location, in trip order.</div>;
  if (page.type === 'glance') return <div className="sheet-copy">Made from the bookings on this trip — edit them on the trip's Itinerary tab.</div>;

  // chapter opener or one of its photo pages: edit the whole chapter
  const ci = page.ci, c = draft.chapters[ci];
  if (!c) return null;
  const spare = unusedPhotos(trip, draft);
  const photos = [c.hero, ...c.photos].filter(Boolean);
  return (
    <>
      <div className="add-cost-row">
        <div className="grow"><div className="field-label">Chapter title</div><input className="field" value={c.heading} onChange={(e) => setChapter(ci, { heading: e.target.value })} /></div>
      </div>
      <div className="add-cost-row">
        <div className="grow"><div className="field-label" style={{ marginTop: 12 }}>When</div><input className="field" value={c.when} onChange={(e) => setChapter(ci, { when: e.target.value })} /></div>
        <div className="grow"><div className="field-label" style={{ marginTop: 12 }}>Where</div><input className="field" value={c.place} onChange={(e) => setChapter(ci, { place: e.target.value })} /></div>
      </div>
      <div className="field-label" style={{ marginTop: 12 }}>Story</div>
      <textarea className="field book-text" value={c.story} onChange={(e) => setChapter(ci, { story: e.target.value })} />

      <div className="field-label" style={{ marginTop: 14 }}>Photos in this chapter</div>
      <div className="stack-9">
        {photos.map((ref) => {
          const ph = photoByRef(trip, ref);
          if (!ph) return null;
          const isHero = ref === c.hero;
          return (
            <div key={ref} className="book-photo-row">
              <Thumb photo={ph} on={isHero} label={isHero ? 'Opening photo' : 'Photo'} onClick={() => {}} />
              <div className="grow">
                <input className="field" value={draft.captions[ref] || ''} onChange={(e) => setCaption(ref, e.target.value)} placeholder="Caption" />
                <div className="row-8" style={{ marginTop: 4 }}>
                  {isHero ? <span className="member-sub">Opens the chapter</span>
                    : <button className="btn-link inline" onClick={() => setChapter(ci, { hero: ref, photos: [c.hero, ...c.photos.filter((r) => r !== ref)].filter(Boolean) })}>Open the chapter with this</button>}
                  <button className="btn-link inline" onClick={() => setChapter(ci, isHero ? { hero: c.photos[0] || '', photos: c.photos.slice(1) } : { photos: c.photos.filter((r) => r !== ref) })}>Remove</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {spare.length > 0 && (<>
        <div className="field-label" style={{ marginTop: 14 }}>Add a photo</div>
        <div className="book-thumbs">{spare.map((p) => <Thumb key={p.ref} photo={p.photo} onClick={() => setChapter(ci, c.hero ? { photos: [...c.photos, p.ref] } : { hero: p.ref })} label="Add to this chapter" />)}</div>
      </>)}
    </>
  );
}

export default function PhotoBook({ trip, family, onClose, onSave, toast }) {
  const book = trip.book || {};
  const draft = book.draft || null;
  const sizeKey = SIZES[book.size] ? book.size : 'shutterfly';
  const size = SIZES[sizeKey];
  const [writing, setWriting] = useState('');
  const [sel, setSel] = useState(0);
  const [images, setImages] = useState(new Map());
  const [map, setMap] = useState(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [progress, setProgress] = useState(null);

  const pages = useMemo(() => buildPages(trip, draft), [trip, draft]);
  const refsKey = pages.flatMap((p) => [p.photo, ...(p.photos || [])]).filter(Boolean).join(',');

  useEffect(() => { ensureFonts().then(() => setFontsReady(true)); mapData(trip).then(setMap); }, [trip.id]); // eslint-disable-line
  useEffect(() => { let live = true; loadImages(trip, pages).then((m) => { if (live) setImages(m); }); return () => { live = false; }; }, [refsKey]); // eslint-disable-line

  const ctx = useMemo(() => ({ trip, images, map, captions: (draft && draft.captions) || {}, fontsReady }), [trip, images, map, draft, fontsReady]);
  const save = (patch) => onSave({ ...book, ...patch });
  const page = pages[Math.min(sel, pages.length - 1)];
  const photoCount = collectPhotos(trip).length;
  const canWrite = !!(supabase && family.household);

  const write = async () => {
    if (draft && !window.confirm('Write the book again? Your edits will be replaced.')) return;
    setWriting('Gathering your photos…');
    try {
      const all = collectPhotos(trip).slice(0, 60);
      const sent = {}, photos = [];
      for (const p of all) {
        const data = await thumbnail(p.photo);
        if (!data) continue;
        const id = 'p' + photos.length;
        sent[id] = p.ref;
        photos.push({ id, data, entry: p.entryIndex, label: p.label });
      }
      setWriting('Writing your book… this takes a minute or two.');
      const { data, error } = await supabase.functions.invoke('write-book', {
        body: {
          trip: { title: trip.title, place: trip.place, dates: trip.dates, companions: trip.companions || '', days: (trip.days || []).map((d) => ({ date: d.date, title: d.title, place: d.place, note: d.note, kind: d.kind })) },
          photos, bookings: bookingLines(trip),
        },
      });
      if (error || !data) {
        let msg = 'Could not write the book — try again';
        try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (e) { /* no body */ }
        toast(msg); return;
      }
      save({ draft: draftFromWriter(data, sent), size: sizeKey });
      setSel(0);
      toast('Your book is ready to look over');
    } catch (e) {
      toast('Could not write the book — try again');
    } finally { setWriting(''); }
  };

  const download = async () => {
    setProgress([0, pages.length]);
    try { await exportBook({ trip, pages, size, images, map, captions: draft.captions || {}, onProgress: (i, n) => setProgress([i, n]) }); }
    catch (e) { toast('Could not make the file — try again'); }
    finally { setProgress(null); }
  };

  const min = MIN_PAGES[sizeKey];

  return (
    <div className="screen pad-tab book-screen">
      <div className="book-head">
        <button className="back-btn press static" onClick={onClose} aria-label="Back"><Chevron /></button>
        <div className="grow">
          <div className="eyebrow">Photo book</div>
          <div className="serif book-title">{trip.title}</div>
        </div>
      </div>

      {!draft && (
        <div className="book-start">
          <div className="serif" style={{ fontSize: 24, fontWeight: 600 }}>Turn this trip into a book</div>
          <div className="sheet-copy" style={{ fontSize: 14.5 }}>
            Claude reads your memories, notes, bookings and photos and writes the book: a cover, an introduction, a chapter for each
            day or place with your photos and captions, a map, and a closing. Then you look it over, change anything, and download it to print.
          </div>
          <div className="book-facts">
            <span>{(trip.days || []).length} memories</span><span>{photoCount} photos</span>
          </div>
          {photoCount === 0 && <div className="sheet-copy">There are no photos on this trip yet — the book will be words only. Add photos to your memories for a real photo book.</div>}
          {!canWrite && <div className="sheet-copy"><strong>Sign in</strong> (the people icon) to have the book written.</div>}
          <button className="btn-primary press" style={{ marginTop: 18 }} disabled={!canWrite || !!writing || (!photoCount && !(trip.days || []).length)} onClick={write}>
            {writing ? <><span className="spin-sm" style={{ width: 16, height: 16 }} /> {writing}</> : 'Write my book'}
          </button>
        </div>
      )}

      {draft && (
        <>
          <div className="book-bar">
            <select className="field book-size" value={sizeKey} onChange={(e) => save({ size: e.target.value })} aria-label="Book size">
              {Object.entries(SIZES).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
            </select>
            <button className="btn-primary small press" disabled={!!progress} onClick={download}>
              {progress ? `Making page ${progress[0]} of ${progress[1]}…` : size.output === 'images' ? 'Download page images' : 'Download PDF'}
            </button>
            <button className="btn-muted press" disabled={!!writing} onClick={write}>{writing ? 'Writing…' : 'Write again'}</button>
          </div>
          <div className="sheet-copy book-note">
            {pages.length} pages.{min && pages.length < min ? ` ${size.label.split(' ·')[0]} books need at least ${min} pages — add memories and photos, or they'll add blank pages at the end.` : ''}
            {size.output === 'images'
              ? ' In Shutterfly, start an 11 × 8 book, choose a full-page photo layout, and drop one page image on each page.'
              : sizeKey === 'home' ? ' Print landscape on letter paper, borderless if your printer can.' : ` Upload the PDF as your book's interior at ${size.label.split(' ·')[0]}; it includes the 1/8 in bleed they ask for.`}
          </div>

          <div className="book-layout">
            <div className="book-pages">
              {pages.map((p, i) => <PageCanvas key={i} page={p} size={size} ctx={ctx} active={i === sel} onClick={() => setSel(i)} />)}
            </div>
            {page && (
              <div className="book-editor">
                <div className="mono-label" style={{ marginBottom: 10 }}>{page.n === 1 ? 'Cover' : 'Page ' + page.n} · edit</div>
                <Editor trip={trip} draft={draft} page={page} onChange={(d) => save({ draft: d })} />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
