// Inline SVG icons from the design (1.2–2.4px strokes, no icon font).

export const Plus = ({ size = 18, color = '#A4502F', w = 2 }) => {
  const a = size * (3 / 18), b = size - a;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <line x1={size / 2} y1={a} x2={size / 2} y2={b} stroke={color} strokeWidth={w} strokeLinecap="round" />
      <line x1={a} y1={size / 2} x2={b} y2={size / 2} stroke={color} strokeWidth={w} strokeLinecap="round" />
    </svg>
  );
};

export const Chevron = () => (
  <svg width="11" height="18" viewBox="0 0 11 18" fill="none" aria-hidden="true"><path d="M9 2L2 9l7 7" stroke="#2A2520" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

export const Share = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M7 9V2M7 2L4.3 4.7M7 2l2.7 2.7" stroke="#FBF6EC" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M3 8v3a1 1 0 001 1h6a1 1 0 001-1V8" stroke="#FBF6EC" strokeWidth="1.5" strokeLinecap="round" /></svg>
);

export const Book = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M2.5 3.5h5.5a1 1 0 011 1v10a1 1 0 00-1-1H2.5v-10zM15.5 3.5H10a1 1 0 00-1 1v10a1 1 0 011-1h5.5v-10z" stroke="#A4502F" strokeWidth="1.3" strokeLinejoin="round" /></svg>
);

export const Trash = ({ color = '#9A8E7E' }) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2.5 3.5h9M5.5 3.5V2.5h3v1M3.5 3.5l.6 8a1 1 0 001 .9h3.8a1 1 0 001-.9l.6-8" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

export const Play = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5l9 5.5-9 5.5z" fill="#FBF6EC" /></svg>
);

export const Pause = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="2.5" width="3.5" height="11" rx="1" fill="#FBF6EC" /><rect x="9" y="2.5" width="3.5" height="11" rx="1" fill="#FBF6EC" /></svg>
);

export const ToSuno = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M2.5 7.5h8M10.5 7.5L7.8 4.8M10.5 7.5l-2.7 2.7" stroke="#FBF6EC" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M12.5 3v9" stroke="#FBF6EC" strokeWidth="1.5" strokeLinecap="round" /></svg>
);

export const Upload = ({ color = '#EFB85E' }) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M7 9.5V2.5M7 2.5L4.4 5.1M7 2.5l2.6 2.6" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /><path d="M3 8.5v2a1 1 0 001 1h6a1 1 0 001-1v-2" stroke={color} strokeWidth="1.4" strokeLinecap="round" /></svg>
);

export const Note = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M8 11V3l3.5-.8V9" stroke="#7FC6CE" strokeWidth="1.3" strokeLinejoin="round" /><circle cx="6" cy="11" r="1.7" fill="#7FC6CE" /></svg>
);

export const Rewrite = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true"><path d="M11 6.5a4.5 4.5 0 11-1.6-3.45M11 1.5V4H8.5" stroke="#EFB85E" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

export const Music = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M5.5 11.5V3.8l6-1.3v7.2" stroke="#FBF6EC" strokeWidth="1.4" strokeLinejoin="round" /><circle cx="4" cy="11.6" r="1.9" fill="#FBF6EC" /><circle cx="10" cy="10.2" r="1.9" fill="#FBF6EC" /></svg>
);

export const Printer = () => (
  <svg width="17" height="17" viewBox="0 0 17 17" fill="none" aria-hidden="true"><path d="M5 6.5V2.5h7v4M5 12.5h7v3H5v-3z" stroke="#FBF6EC" strokeWidth="1.4" strokeLinejoin="round" /><path d="M3 6.5h11v6h-2" stroke="#FBF6EC" strokeWidth="1.4" strokeLinecap="round" /></svg>
);

export const House = ({ size = 11 }) => (
  <svg width={size} height={size} viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M2.5 7L7.5 2.5 12.5 7v5.5a.8.8 0 01-.8.8H3.3a.8.8 0 01-.8-.8V7z" stroke="#FBF6EC" strokeWidth="1.6" strokeLinejoin="round" /></svg>
);

export const Pencil = () => (
  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M8 2.2l1.8 1.8-5.4 5.4-2.2.4.4-2.2z" stroke="#A4502F" strokeWidth="1.2" strokeLinejoin="round" /></svg>
);

export const Mic = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><rect x="4" y="1" width="4" height="6.5" rx="2" fill="#A4502F" /><path d="M2.5 6.2a3.5 3.5 0 007 0M6 9.7V11" stroke="#A4502F" strokeWidth="1.2" strokeLinecap="round" /></svg>
);

export const AddPhoto = () => (
  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true"><path d="M3 16l4.5-5 3 3.2L14 9l5 7" stroke="#A4502F" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /><circle cx="8" cy="7" r="1.6" fill="#A4502F" /></svg>
);

export const People = ({ color = 'currentColor' }) => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="7.5" cy="7" r="2.8" /><path d="M2.5 16.5c.6-2.8 2.6-4.3 5-4.3s4.4 1.5 5 4.3" /><circle cx="14" cy="7.8" r="2.2" /><path d="M13.6 12.3c1.9.1 3.3 1.4 3.9 3.6" /></svg>
);

export const TabTrips = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2.5" /><line x1="4" y1="9.4" x2="20" y2="9.4" /></svg>
);

export const TabMap = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 21s7-6.4 7-11a7 7 0 10-14 0c0 4.6 7 11 7 11z" strokeLinejoin="round" /><circle cx="12" cy="10" r="2.4" /></svg>
);

export const TabAlbums = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.6" /><rect x="13" y="4" width="7" height="7" rx="1.6" /><rect x="4" y="13" width="7" height="7" rx="1.6" /><rect x="13" y="13" width="7" height="7" rx="1.6" /></svg>
);
