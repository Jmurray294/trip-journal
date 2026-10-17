# Trip Journal

Family travel journal as an installable web app (PWA). Built from the design handoff in
`~/trip-journal-handoff` — see its `README.md` for the full spec.

Everything is stored on the device (IndexedDB): trips, memories, photos, song audio. There are no
accounts and no server. The app shell, fonts, sample photos and world map are precached, so it opens
and works with no signal after the first visit.

## Commands

```
npm install
npm run dev       # dev server, reachable from phones on the same Wi-Fi
npm test          # parser, migration, map-stop and lyric logic
npm run build     # production build in dist/
npm run preview   # serve dist/ (also on the LAN)
```

Regenerate the app icons with `powershell -File scripts/make-icons.ps1`.

## Live site

**https://jmurray294.github.io/trip-journal/** — repo: github.com/Jmurray294/trip-journal (public).

Publish an update with `npm run deploy` (runs the tests, builds, and pushes `dist/` to the
`gh-pages` branch; GitHub Pages serves it about a minute later). Installed copies pick up the new
version the next time they're opened.

The build assumes the `/trip-journal/` sub-path. For another host set `BASE_PATH=/` when building.

## Installing

- **iPhone:** open the link in Safari → Share → **Add to Home Screen**.
- **Android:** open in Chrome → menu → **Install app**.
- **Windows / Mac:** open in Edge or Chrome → install icon in the address bar.

Each device keeps its own journal (no sync yet).

## Differences from the prototype

- **Song lyrics** are written on-device from the trip's entries (the prototype's fallback generator).
  AI lyrics with Claude and the automatic Suno round-trip need a server holding the API keys.
- **Share** opens the phone's share sheet with a text summary of the trip (no share links yet).
- **Delete memory** asks for confirmation.
- Fixed a parser bug where a hotel name ending in a city word picked up the next line's "City, ST".
- Phone back button / back swipe steps back through the app (story → trip → list).
- Layout uses the device's real safe-area insets instead of the prototype's iPhone frame.
- **Desktop layout** at 900px and wider: sidebar navigation with a trip list, trip cards in a grid,
  trip detail in two columns (timeline | stats, story, song), map beside a vertical stop list,
  a centred reading column for the story, and the add sheet as a centred dialog (Esc closes it).
  Phones and narrow windows keep the original design.

## Layout

```
src/App.jsx            state, navigation, all actions
src/screens/           TripsHome, TripDetail, Story (+ print layout), MapView, Albums, AddSheet
src/components/        TripMap (d3-geo), TabBar, Chips, Icons
src/lib/               db (IndexedDB), seed + migration, parser, geo (geocoding, map stops), song, derive
```
