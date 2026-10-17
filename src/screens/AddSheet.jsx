import { useEffect, useRef, useState } from 'react';
import Chips from '../components/Chips.jsx';
import { Mic, AddPhoto } from '../components/Icons.jsx';
import { GRADIENTS, short } from '../lib/derive.js';
import { parseConfirmation } from '../lib/parser.js';

const KIND_STYLE = {
  Flight: { background: 'rgba(111,126,132,0.18)', color: '#4E6068' },
  Stay: { background: 'rgba(164,80,47,0.14)', color: '#A4502F' },
  Booking: { background: 'rgba(42,37,32,0.08)', color: '#A4502F' }
};

const Label = ({ children, top = 16 }) => <div className="field-label" style={{ marginTop: top }}>{children}</div>;

export default function AddSheet({ initial, trips, onClose, registerStopDictation, resizePhoto, onSaveMemory, onSaveTrip, onImport, toast }) {
  const [mode, setMode] = useState(initial.mode);
  const [tripId, setTripId] = useState(initial.tripId);
  const [title, setTitle] = useState('');
  const [place, setPlace] = useState('');
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState([]);
  const [newTrip, setNewTrip] = useState({ title: '', place: '', dates: '', grad: GRADIENTS[0] });
  const [paste, setPaste] = useState('');
  const [parsed, setParsed] = useState([]);
  const [listening, setListening] = useState(false);
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

  const toggleDictation = () => {
    if (listening) { stopDictation(); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast('Use the mic key on your keyboard'); return; }
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
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') toast('Allow mic access in Settings');
      else if (e.error !== 'aborted' && e.error !== 'no-speech') toast('Voice input stopped');
    };
    r.onend = () => { rec.current = null; setListening(false); };
    rec.current = r;
    try { r.start(); setListening(true); } catch (e) { toast('Voice input unavailable'); }
  };

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
        <div className="segs">{seg('memory', 'Memory')}{seg('trip', 'New trip')}{seg('import', 'Import')}</div>

        {mode === 'memory' && (
          <>
            <Label top={0}>Which trip</Label>
            <Chips items={chips} active={tripId} onSelect={setTripId} />

            <Label top={18}>What happened</Label>
            <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Sunrise hike to the ridge" />

            <Label>Where</Label>
            <input className="field" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Add a place" />

            <div className="label-row">
              <div className="field-label" style={{ margin: 0 }}>Notes</div>
              <button className={'mic' + (listening ? ' on' : '')} onClick={toggleDictation}>
                {listening ? <span className="mic-dot" /> : <Mic />}
                {listening ? 'Listening… tap to stop' : 'Dictate'}
              </button>
            </div>
            <textarea className="field" style={{ minHeight: 80 }} value={note} onChange={(e) => { setNote(e.target.value); baseNote.current = e.target.value; }} placeholder="Write what happened…" />

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
                  style={{ background: g, border: newTrip.grad === g ? '3px solid #A4502F' : '3px solid transparent' }} />
              ))}
            </div>
            <button className="btn-primary press" style={{ marginTop: 24 }} onClick={() => onSaveTrip(newTrip)}>Create trip</button>
          </>
        )}

        {mode === 'import' && (
          <>
            <div className="serif" style={{ fontSize: 22, fontWeight: 600 }}>Import a confirmation</div>
            <div style={{ fontSize: 13.5, color: '#7A7060', marginTop: 4, lineHeight: 1.45 }}>Open the confirmation email, select all and copy, then paste it below. Flights and hotel stays become itinerary entries.</div>
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
                        <span className="mono" style={{ fontSize: 11, color: '#A4502F', letterSpacing: 0.5 }}>{r.date}</span>
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
