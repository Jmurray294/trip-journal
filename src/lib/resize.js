// A picked photo as a JPEG data URL, big enough for a full page of a printed photo book
// (11in at ~240dpi). Used by the app's Add photos and the shared trip page.
export function resizePhoto(file) {
  return new Promise((res) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const sc = Math.min(1, 2600 / Math.max(img.width, img.height));
      const cw = Math.round(img.width * sc), ch = Math.round(img.height * sc);
      const c = document.createElement('canvas'); c.width = cw; c.height = ch;
      c.getContext('2d').drawImage(img, 0, 0, cw, ch);
      URL.revokeObjectURL(url);
      try { res(c.toDataURL('image/jpeg', 0.85)); } catch (e) { res(null); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); res(null); };
    img.src = url;
  });
}
