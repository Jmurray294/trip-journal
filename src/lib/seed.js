// Sample trips shipped with the app. Ids not starting with `u` are demo data;
// user-created trips use `'u' + Date.now()` and survive reseeding.

export const FAMILY = [['M', '#A4502F'], ['T', '#7B7A4E'], ['L', '#BE6A47'], ['N', '#6F7E84']];
export const DEMO_IDS = ['bigsur', 'tofino', 'sedona', 'tuscany'];

export function seed() {
  const fam = FAMILY;
  return [
    {
      id: 'bigsur', title: 'Big Sur', place: 'California Coast', dates: 'Aug 8–15, 2026', grad: 'linear-gradient(150deg,#8DA1A8,#46585F)', coverSrc: 'photos/bs-mcway.jpg', planning: true, countdown: 'in 6 weeks', statusLabel: 'Planning', timelineLabel: 'Itinerary', members: fam, song: null,
      days: [
        { num: 1, date: 'Aug 8', title: 'McWay Falls overlook', place: 'McWay Falls', lon: -121.672, lat: 36.158, note: 'Plan: arrive by lunch, picnic at the overlook, keep the first day easy.', photos: [{ src: 'photos/bs-mcway.jpg', label: 'the overlook' }] },
        { num: 2, date: 'Aug 9', title: 'Pfeiffer Beach', place: 'Pfeiffer Beach', lon: -121.821, lat: 36.237, note: 'Plan: purple sand at golden hour. Bring the kite for Noah.', photos: [{ src: 'photos/bs-pfeiffer.jpg', label: 'purple sand' }] }
      ]
    },
    {
      id: 'tofino', title: 'Tofino Coast', place: 'Vancouver Island', dates: 'Jul 12–18, 2025', grad: 'linear-gradient(150deg,#5E7E78,#324F4A)', coverSrc: 'photos/tof-sunset.jpg', planning: false, statusLabel: 'Past trip', timelineLabel: 'Timeline', members: fam,
      song: { title: 'Cedar & Salt', mood: 'Acoustic folk', duration: 174, lines: ['We came in slow through the cedar grove,', 'taller than anything the kids had known —', 'fish tacos warm from the cooler lid,', 'the last gold light where the sun went hid.', 'Cedar and salt, the long way home,', 'just the four of us and the ocean foam.', 'Tide pools holding a small purple star,', 'Lily named him Gary, and there you are.', 'Noah stood up on the second wave,', 'the whole beach cheering, the picture saved.', 'Rain on the cove and the springs ran warm —', 'the best kind of warm in the heart of the storm.'] },
      days: [
        { num: 1, date: 'Jul 12', title: 'Arrival & Chesterman Beach', place: 'Chesterman Beach', lon: -125.899, lat: 49.129, note: "Drove in through Cathedral Grove — the kids couldn't get over how big the cedars were. Caught the last light on the beach and ate fish tacos straight out of the cooler.", photos: [{ src: 'photos/tof-tideline.jpg', label: 'tide line' }, { src: 'photos/tof-sunset.jpg', label: 'first sunset' }, { src: 'photos/tof-shack.jpg', label: 'beach shack' }] },
        { num: 2, date: 'Jul 13', title: 'Long Beach & tide pools', place: 'Pacific Rim NP', lon: -125.76, lat: 49.03, note: 'Spent the whole morning hunting starfish in the tide pools. Lily found a purple one and named it Gary. Noah finally stood up on the surfboard.', photos: [{ src: 'photos/tof-tidepool.jpg', label: 'tide pools' }, { src: 'photos/tof-longbeach.jpg', label: 'long beach' }, { src: 'photos/tof-rainforest.jpg', label: 'rainforest' }, { src: 'photos/tof-surf.jpg', label: 'surf lesson' }] },
        { num: 3, date: 'Jul 14', title: 'Hot Springs Cove', place: 'Maquinna Marine PP', lon: -126.268, lat: 49.36, note: 'Boat out past the lighthouse, whales on the way. Soaked in the springs while it rained — the best kind of warm.', photos: [{ src: 'photos/tof-boat.jpg', label: 'the boat' }, { src: 'photos/tof-springs.jpg', label: 'the springs' }] }
      ]
    },
    {
      id: 'sedona', title: 'Sedona Red Rocks', place: 'Arizona', dates: 'Mar 19–23, 2025', grad: 'linear-gradient(150deg,#C56B43,#8C3A22)', coverSrc: 'photos/sed-sunsetrock.jpg', planning: false, statusLabel: 'Past trip', timelineLabel: 'Timeline', members: fam,
      song: { title: 'Slickrock Gold', mood: 'Desert country', duration: 138, lines: ['Cathedral Rock went orange at six,', 'a picnic dinner on the highest bricks.', 'Pink jeep bouncing the slickrock loud,', 'four wild voices doing us proud.', 'Slickrock gold and Arizona red,', 'a desert sky going pink overhead.', '"Can we go again?" — we always will,', 'the whole family parked on a sunset hill.'] },
      days: [
        { num: 1, date: 'Mar 20', title: 'Cathedral Rock at sunset', place: 'Cathedral Rock', lon: -111.793, lat: 34.82, note: 'Short but steep scramble. Worth every step when the rock lit up orange. Picnic dinner at the top.', photos: [{ src: 'photos/sed-climb.jpg', label: 'the climb' }, { src: 'photos/sed-sunsetrock.jpg', label: 'sunset rock' }] },
        { num: 2, date: 'Mar 21', title: 'Pink jeep & Broken Arrow', place: 'Broken Arrow Trail', lon: -111.75, lat: 34.833, note: 'Bounced around the slickrock in a bright pink jeep. The kids screamed the whole way and immediately asked to go again.', photos: [{ src: 'photos/sed-jeep.jpg', label: 'pink jeep' }, { src: 'photos/sed-slickrock.jpg', label: 'slickrock' }, { src: 'photos/sed-overlook.jpg', label: 'the overlook' }] }
      ]
    },
    {
      id: 'tuscany', title: 'Tuscany Roadtrip', place: 'Italy', dates: 'Sep 1–9, 2024', grad: 'linear-gradient(150deg,#C9A85C,#866A34)', coverSrc: 'photos/tus-cypress.jpg', planning: false, statusLabel: 'Past trip', timelineLabel: 'Timeline', members: fam,
      song: { title: 'Cypress Roads', mood: 'Warm acoustic', duration: 156, lines: ['Cypress roads and we stopped at them all,', 'gelato in a town too small to call.', 'Nonna Lucia and a floury mess,', "pasta from scratch that we couldn't guess.", 'Cypress roads in the Tuscan light,', 'the ragù warm and the hills gone white.', 'Siena dusk from a rooftop view —', 'a whole September of just us two-by-two.'] },
      days: [
        { num: 1, date: 'Sep 2', title: "Into the Val d'Orcia", place: "Val d'Orcia", lon: 11.61, lat: 43.07, note: 'Wound through cypress-lined roads for hours and stopped at every viewpoint. Gelato in a tiny hill town none of us can pronounce.', photos: [{ src: 'photos/tus-cypress.jpg', label: 'cypress road' }, { src: 'photos/tus-hilltown.jpg', label: 'hill town' }] },
        { num: 2, date: 'Sep 3', title: 'Cooking class in Siena', place: 'Siena', lon: 11.331, lat: 43.319, note: "Made pasta from scratch with Nonna Lucia. Flour everywhere. Best ragù we've ever had, no contest.", photos: [{ src: 'photos/tus-pasta.jpg', label: 'fresh pasta' }, { src: 'photos/tus-table.jpg', label: 'the table' }, { src: 'photos/tus-siena.jpg', label: 'siena dusk' }] }
      ]
    }
  ];
}

export const newTripId = () => 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const newEntryId = () => (crypto.randomUUID ? crypto.randomUUID() : 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

// Every memory needs a stable id and sort position for sync. Sample memories get deterministic
// ids so the same sample trip on two phones is the same rows, not duplicates.
export function normalize(trips) {
  let changed = false;
  const out = trips.map((t) => {
    const demo = DEMO_IDS.includes(t.id);
    const days = (t.days || []).map((d, i) => {
      if (d.id && typeof d.pos === 'number') return d;
      changed = true;
      return { ...d, id: d.id || (demo ? `${t.id}-${d.num || i + 1}` : newEntryId()), pos: typeof d.pos === 'number' ? d.pos : i };
    });
    return days === t.days ? t : { ...t, days };
  });
  return { changed, trips: changed ? out : trips };
}

// Load-time migration: reseed demo trips when the schema advances, keep user trips (ids starting `u`).
// Sample trips are only added to a brand-new journal; one the user has emptied stays empty.
export function migrate(data, version) {
  if (!data || !Array.isArray(data.trips)) {
    return { changed: true, data: { v: version, trips: seed(), home: '', homeLon: null, homeLat: null } };
  }
  const stale = (data.v || 0) < version || data.trips.some((t) => DEMO_IDS.includes(t.id) &&
    (!t.coverSrc || (t.days || []).some((d) => d.place && typeof d.lon !== 'number')));
  if (!stale) return { changed: false, data };
  const mine = data.trips.filter((t) => String(t.id).startsWith('u'));
  const keptDemo = data.trips.filter((t) => DEMO_IDS.includes(t.id));
  const fresh = seed().filter((s) => keptDemo.some((k) => k.id === s.id));
  return { changed: true, data: { v: version, trips: [...fresh, ...mine], home: data.home || '', homeLon: data.homeLon ?? null, homeLat: data.homeLat ?? null } };
}
