// Undoes text garbled by reading UTF-8 as the old DOS code page (CP437): "·" saved as "┬╖", "—" as "ΓÇö".
// The email function's code picked this up when pasted into the Supabase editor through a Windows
// console, so trips saved by it carry the damage. A run of CP437 characters is only replaced when its
// bytes are valid UTF-8, so ordinary accented text ("café", "Zürich") is left alone.

const CP437 = 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';
const BYTE = new Map([...CP437].map((c, i) => [c, 0x80 + i]));
const RUN = new RegExp('[' + CP437.replace(/[\\\]^-]/g, '\\$&') + ']{2,}', 'g');
const utf8 = new TextDecoder('utf-8', { fatal: true });

export function fixMojibake(s) {
  if (typeof s !== 'string' || s.startsWith('data:')) return s;
  return s.replace(RUN, (run) => {
    try { return utf8.decode(Uint8Array.from([...run].map((c) => BYTE.get(c)))); } catch (e) { return run; }
  });
}

// Every string in a trip, repaired; unchanged parts keep their identity so nothing re-renders or re-syncs.
function repair(v) {
  if (typeof v === 'string') return fixMojibake(v);
  if (Array.isArray(v)) {
    const out = v.map(repair);
    return out.some((x, i) => x !== v[i]) ? out : v;
  }
  if (v && typeof v === 'object') {
    let out = null;
    for (const k of Object.keys(v)) {
      const x = repair(v[k]);
      if (x !== v[k]) (out || (out = { ...v }))[k] = x;
    }
    return out || v;
  }
  return v;
}

export const repairTrips = (trips) => repair(trips);
