// Trip song lyrics, written on-device from the trip's entries.
// (AI lyrics via Claude and the automatic Suno round-trip need a server; see README.)

export function writeSong(t) {
  const days = t.days || [];
  const places = [...new Set(days.map((d) => (d.place || '').trim()).filter(Boolean))];
  const hook = places[0] || t.place || t.title;
  const lines = [];
  days.slice(0, 3).forEach((d, i) => {
    if (d.title) lines.push((i % 2 ? 'And then ' : '') + d.title.charAt(0).toLowerCase() + d.title.slice(1) + ',');
    if (d.place) lines.push('out at ' + d.place + ' where the day ran long.');
  });
  lines.push('Back to ' + hook + ', the long way home,');
  lines.push('carrying ' + (t.title || 'this trip') + ' wherever we go.');
  return {
    title: (places[0] || t.title || 'Our Trip') + ' Song',
    mood: 'Upbeat jingle',
    duration: Math.max(20, Math.min(60, Math.min(lines.length, 8) * 4)),
    lines: lines.slice(0, 8)
  };
}

export function sunoText(song) {
  const style = (song.mood || 'Upbeat jingle') + ', short catchy jingle, under 30 seconds, bouncy, playful, big hook';
  return song.title + '\n\n[Style: ' + style + ']\n\n' + song.lines.join('\n');
}

export function fmtTime(s) {
  s = Math.floor(s || 0);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

// Lines are distributed evenly across the track.
export function activeLine(progress, duration, count) {
  if (!count) return 0;
  return Math.min(count - 1, Math.floor((progress / duration) * count));
}
