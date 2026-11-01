import { useEffect, useRef, useState } from 'react';
import Chips from '../components/Chips.jsx';
import { Mic, AddPhoto } from '../components/Icons.jsx';
import { GRADIENTS, short } from '../lib/derive.js';
import { parseConfirmation } from '../lib/parser.js';

const KIND_STYLE = {
  Flight: { background: 'rgba(111,126,132,0.18)', color: '#4E6068' },
  Stay: { background: 'rgba(27,63,168,0.1)', color: '#1B3FA8' },
  Booking: { background: 'rgba(31,35,41,0.06)', color: '#1B3FA8' }
};

const Label = ({ children, top = 16 }) => <div className="field-label" style={{ marginTop: top }}>{children}</div>;

const MAX_FILES = 6;
const readAsDataUrl = (file) => new Promise((res, rej) => {
  const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error); fr.readAsDataURL(file);
});
// Photos and screenshots are scaled to 2200px (sharp enough to read, small enough to send); PDFs go as they are.
async function toUpload(file) {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (isPdf) {
    if (file.size > 15 * 1024 * 1024) throw new Error(file.name + ' is over 15MB');
    const d = await readAsDataUrl(file);
    return { Name: file.name, ContentType: 'application/pdf', Content: String(d).split(',')[1] };
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const sc = Math.min(1, 2200 / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const d = c.toDataURL('image/jpeg', 0.88);
    return { Name: file.name.replace(/\.[^.]+$/, '') + '.jpg', ContentType: 'image/jpeg', Content: d.split(',')[1] };
  } finally { URL.revokeObjectURL(url); }
}

export default function AddSheet({ initial, trips, onClose, registerStopDictation, resizePhoto, onSaveMemory, onSaveTrip, onImport, onReadUpload, canRead, toast }) {
  const [mode, setMode] = useState(initial.mode);
  const [tripId, setTripId] = useState(initial.tripId);
  const [title, setTitle] = useState('');
  const [place, setPlace] = useState('');
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState([]);
  const [newTrip, setNewTrip] = useState({ title: '', place: '', dates: '', grad: GRADIENTS[0] });
  const [paste, setPaste] = useState('');
  const [parsed, setParsed] = useState([]);
  const [files, setFiles] = useState([]);
  const [reading, setReading] = useState(false);
  // where an upload goes: the trip it was opened from, else let the reader choose ('')
  const [uploadTrip, setUploadTrip] = useState(initial.fromTrip ? initial.tripId : '');
  const [listening, setListening] = useState(false);
  // opened for a known trip (from inside it, or the phone's Dictate): show it, don't make you pick
  const [choosing, setChoosing] = useState(!initial.fromTrip);
  const noteBox = useRef(null);
  const rec = useRef(null);
  const baseNote = useRef('');
  const noteRef = useRef(note); noteRef.current = note;

  const chips = trips.map((t) => ({ id: t.id, label: short(t.title, 14) }));

  // ---- dictation (Web Speech API) ----
  const stopDictation = () => {
    if (rec.current) { try { rec.current.stop(); } catch (e) { /* ignore */ } rec.current = null; }
    setListening(false);
  };
  useEffect(() => { registerStopDictation(stopDictation); return () => { stopDictation(); registerStopDictation(() => {}); }; }, []);

  // quiet: started by the sheet itself (Dictate), so a browser that wants a tap first just shows the mic button
  const toggleDictation = (quiet = false) => {
    if (listening) { stopDictation(); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { if (!quiet) toast('Use the mic key on your keyboard'); return; }
    let r;
    try { r = new SR(); } catch (e) { toast('Voice not available here'); return; }
    r.continuous = true; r.interimResults = true; r.lang = 'en-US';
    baseNote.current = noteRef.current ? noteRef.current.replace(/\s+$/, '') + ' ' : '';
    r.onresult = (e) => {
      let finalTxt = '', interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalTxt += res[0].transcript; else interim += res[0].transcript;
      }
      if (finalTxt) baseNote.current = (baseNote.current + finalTxt).replace(/\s+/g, ' ') + ' ';
      setNote((baseNote.current + interim).replace(/^\s+/, ''));
    };
    r.onerror = (e) => {
      setListening(false);
      if (quiet === true) return;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') toast('Allow mic access in Settings');
      else if (e.error !== 'aborted' && e.error !== 'no-speech') toast('Voice input stopped');
    };
    r.onend = () => { rec.current = null; setListening(false); };
    rec.current = r;
    try { r.start(); setListening(true); } catch (e) { if (!quiet) toast('Voice input unavailable'); }
  };
  // Dictate from the phone's bottom bar: start listening (and focus the notes, for the keyboard's mic)
  useEffect(() => {
    if (!initial.dictate) return;
    if (noteBox.current) noteBox.current.focus();
    toggleDictation(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pickPhotos = async (e) => {
    const files = [...(e.target.files || [])]; e.target.value = '';
    const outs = [];
    for (const f of files) { const d = await resizePhoto(f); if (d) outs.push(d); }
    if (outs.length) setPhotos((p) => [...p, ...outs].slice(0, 8));
  };

  const close = () => { stopDictation(); onClose(); };

  // Esc closes the sheet (desktop keyboards)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const pickFiles = (e) => {
    const picked = [...(e.target.files || [])]; e.target.value = '';
    setFiles((f) => [...f, ...picked].slice(0, MAX_FILES));
  };

  const readUpload = async () => {
    if (!files.length && !paste.trim()) { toast(mode === 'idea' ? 'Add a link, a note or a screenshot first' : 'Add a file or paste some text first'); return; }
    setReading(true);
    try {
      const attachments = [];
      for (const f of files) attachments.push(await toUpload(f));
      const done = await onReadUpload({ tripId: uploadTrip, text: paste.trim(), files: attachments, name: files[0] ? files[0].name : '', idea: mode === 'idea' });
      if (done) close();
    } catch (e) {
      toast((e && e.message) || 'Could not read that');
    } finally { setReading(false); }
  };

  const runParse = () => {
    const found = parseConfirmation(paste);
    if (!found.length) { toast('Nothing recognised — check the text'); return; }
    setParsed(found);
  };

  const seg = (m, label) => <button className={'seg' + (mode === m ? ' active' : '')} onClick={() => setMode(m)}>{label}</button>;

  return (
    <div className="sheet-root">
      <div className="sheet-backdrop" onClick={close} />
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="grab" />
        {!initial.dictate && <div className="segs">{seg('memory', 'Memory')}{seg('trip', 'New trip')}{seg('import', 'Import')}{canRead && seg('idea', 'Idea')}</div>}

        {mode === 'idea' && canRead && (
          <>
            <div className="serif" style={{ fontSize: 22, fontWeight: 600 }}>Save an idea for someday</div>
            <div style={{ fontSize: 13.5, color: '#7A7060', marginTop: 4, lineHeight: 1.45 }}>A place, a hotel, a restaurant, something to do — paste a link, write a note or add a screenshot. It goes on the Someday board under its country or state.</div>

            <Label top={18}>Link or note</Label>
            <textarea className="field" style={{ minHeight: 96, fontSize: 14, lineHeight: 1.45 }} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="e.g. https://… or 'Bill says the Dolomites in September are unreal'" />

            <Label top={18}>Screenshot or photo</Label>
            <div className="upload-list">
              {files.map((f, i) => (
                <div key={i} className="upload-file">
                  <span className="doc-ext">{/\.pdf$/i.test(f.name) || f.type === 'application/pdf' ? 'PDF' : 'IMG'}</span>
                  <span className="doc-name grow">{f.name}</span>
                  <button className="thumb-x static" onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} aria-label={'Remove ' + f.name}><span>×</span></button>
                </div>
              ))}
              {files.length < MAX_FILES && (
                <label className="upload-add press">
                  <input type="file" accept="image/*,application/pdf" multiple onChange={pickFiles} hidden />
                  <AddPhoto /> {files.length ? 'Add another' : 'Choose a screenshot or photo'}
                </label>
              )}
            </div>

            <button className="btn-primary press" style={{ marginTop: 22 }} disabled={reading} onClick={readUpload}>
              {reading ? <><span className="spin-sm" style={{ width: 16, height: 16 }} /> Saving…</> : 'Save to Someday'}
            </button>
            {reading && <div className="sheet-copy" style={{ textAlign: 'center' }}>This can take up to half a minute.</div>}
          </>
        )}

        {mode === 'memory' && (
          <>
            {choosing ? (
              <>
                <Label top={0}>Which trip</Label>
                <Chips items={chips} active={tripId} onSelect={setTripId} />
              </>
            ) : (
              <div className="for-trip">
                <span>For <strong>{(trips.find((t) => t.id === tripId) || {}).title}</strong></span>
                <button className="link-btn" onClick={() => setChoosing(true)}>Change</button>
              </div>
            )}

            {!initial.dictate && (
              <>
                <Label top={18}>What happened</Label>
                <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Sunrise hike to the ridge" />

                <Label>Where</Label>
                <input className="field" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Add a place" />
              </>
            )}

            <div className="label-row">
              <div className="field-label" style={{ margin: 0 }}>Notes</div>
              <button className={'mic' + (listening ? ' on' : '')} onClick={() => toggleDictation()}>
                {listening ? <span className="mic-dot" /> : <Mic />}
                {listening ? 'Listening… tap to stop' : 'Dictate'}
              </button>
            </div>
            <textarea ref={noteBox} className="field" style={{ minHeight: initial.dictate ? 140 : 80 }} value={note} onChange={(e) => { setNote(e.target.value); baseNote.current = e.target.value; }} placeholder={initial.dictate ? 'Speak, or type what happened…' : 'Write what happened…'} />

            <Label>Photos</Label>
            <div className="thumbs">
              {photos.map((s, i) => (
                <div key={i} className="thumb">
                  <div className="fill" style={{ backgroundImage: `url("${s}")`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                  <button className="thumb-x" onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))} aria-label="Remove photo"><span>×</span></button>
                </div>
              ))}
              {photos.length < 8 && (
                <label className="thumb-add">
                  <input type="file" accept="image/*" multiple onChange={pickPhotos} hidden />
                  <AddPhoto />
                </label>
              )}
            </div>

            <button className="btn-primary press" style={{ marginTop: 24 }} onClick={() => { stopDictation(); onSaveMemory({ tripId, title, place, note, photos }); }}>Save memory</button>
          </>
        )}

        {mode === 'trip' && (
          <>
            <Label top={0}>Trip name</Label>
            <input className="field" value={newTrip.title} onChange={(e) => setNewTrip({ ...newTrip, title: e.target.value })} placeholder="e.g. Lake District 2026" />
            <Label>Place</Label>
            <input className="field" value={newTrip.place} onChange={(e) => setNewTrip({ ...newTrip, place: e.target.value })} placeholder="Where to?" />
            <Label>Dates</Label>
            <input className="field" value={newTrip.dates} onChange={(e) => setNewTrip({ ...newTrip, dates: e.target.value })} placeholder="e.g. Aug 2026" />
            <Label>Cover</Label>
            <div className="swatches">
              {GRADIENTS.map((g) => (
                <button key={g} className="swatch" aria-label="Cover colour" onClick={() => setNewTrip({ ...newTrip, grad: g })}
                  style={{ background: g, border: newTrip.grad === g ? '3px solid #1B3FA8' : '3px solid transparent' }} />
              ))}
            </div>
            <button className="btn-primary press" style={{ marginTop: 24 }} onClick={() => onSaveTrip(newTrip)}>Create trip</button>
          </>
        )}

        {mode === 'import' && canRead && (
          <>
            <div className="serif" style={{ fontSize: 22, fontWeight: 600 }}>Add a booking or receipt</div>
            <div style={{ fontSize: 13.5, color: '#7A7060', marginTop: 4, lineHeight: 1.45 }}>Upload a PDF, a photo or a screenshot — or paste the text. We'll read it and add the bookings and costs, just like a forwarded email.</div>

            <Label top={18}>Files</Label>
            <div className="upload-list">
              {files.map((f, i) => (
                <div key={i} className="upload-file">
                  <span className="doc-ext">{/\.pdf$/i.test(f.name) || f.type === 'application/pdf' ? 'PDF' : 'IMG'}</span>
                  <span className="doc-name grow">{f.name}</span>
                  <button className="thumb-x static" onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} aria-label={'Remove ' + f.name}><span>×</span></button>
                </div>
              ))}
              {files.length < MAX_FILES && (
                <label className="upload-add press">
                  <input type="file" accept="application/pdf,image/*" multiple onChange={pickFiles} hidden />
                  <AddPhoto /> {files.length ? 'Add another' : 'Choose a PDF, photo or screenshot'}
                </label>
              )}
            </div>

            <Label top={18}>Or paste the text</Label>
            <textarea className="field" style={{ minHeight: 96, fontSize: 14, lineHeight: 1.45 }} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste a confirmation, invoice or receipt…" />

            <Label top={18}>Add to</Label>
            <Chips items={[{ id: '', label: 'Choose for me' }, ...chips]} active={uploadTrip} onSelect={setUploadTrip} />

            <button className="btn-primary press" style={{ marginTop: 22 }} disabled={reading} onClick={readUpload}>
              {reading ? <><span className="spin-sm" style={{ width: 16, height: 16 }} /> Reading…</> : 'Read and add'}
            </button>
            {reading && <div className="sheet-copy" style={{ textAlign: 'center' }}>This can take up to half a minute.</div>}
          </>
        )}

        {mode === 'import' && !canRead && (
          <>
            <div className="serif" style={{ fontSize: 22, fontWeight: 600 }}>Import a confirmation</div>
            <div style={{ fontSize: 13.5, color: '#7A7060', marginTop: 4, lineHeight: 1.45 }}>Open the confirmation email, select all and copy, then paste it below. Flights and hotel stays become itinerary entries. Sign in (the people icon) to also read PDFs, photos and receipts.</div>
            <Label top={18}>Which trip</Label>
            <Chips items={chips} active={tripId} onSelect={setTripId} />
            <Label top={18}>Paste email text</Label>
            <textarea className="field" style={{ minHeight: 120, fontSize: 14, lineHeight: 1.45 }} value={paste} onChange={(e) => { setPaste(e.target.value); setParsed([]); }} placeholder="Paste your flight or hotel confirmation here…" />
            <button className="btn-secondary press" onClick={runParse}>Scan for flights &amp; stays</button>

            {parsed.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div className="field-label" style={{ marginTop: 0, marginBottom: 10 }}>Found</div>
                <div className="stack-9">
                  {parsed.map((r, i) => (
                    <div key={i} className="parsed-card">
                      <div className="row-8">
                        <span className="kind-badge" style={KIND_STYLE[r.kind]}>{r.kind}</span>
                        <span className="mono" style={{ fontSize: 11, color: '#1B3FA8', letterSpacing: 0.5 }}>{r.date}</span>
                      </div>
                      <div className="serif" style={{ fontSize: 17, fontWeight: 600, marginTop: 7, lineHeight: 1.2 }}>{r.title}</div>
                      <div style={{ fontSize: 12.5, color: '#7A7060', marginTop: 4 }}>{r.note}</div>
                    </div>
                  ))}
                </div>
                <button className="btn-primary flat press" style={{ marginTop: 18 }} onClick={() => onImport(tripId, parsed)}>
                  {parsed.length === 1 ? 'Add 1 item to trip' : 'Add ' + parsed.length + ' items to trip'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
