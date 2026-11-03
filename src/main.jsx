import React from 'react';
import { createRoot } from 'react-dom/client';
import { startUpdates } from './lib/update.js';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import '@fontsource/ibm-plex-sans/400-italic.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
// the printed photo book keeps its serif look (src/lib/bookRender.js)
import '@fontsource/spectral/500.css';
import '@fontsource/spectral/600.css';
import '@fontsource/spectral/500-italic.css';
import '@fontsource/hanken-grotesk/500.css';
import '@fontsource/hanken-grotesk/600.css';
import '@fontsource/spline-sans-mono/500.css';
import '@fontsource/caveat/500.css';
import '@fontsource/caveat/700.css';
import './styles.css';
import './navy.css';
import App from './App.jsx';
import GuestTrip from './screens/GuestTrip.jsx';
import Portal from './screens/Portal.jsx';

// Precache the whole app so it opens with no signal; new versions show an Update button.
startUpdates();

// a trip's shared link (?t=<token>) opens just that trip for a fellow traveler, no sign-in;
// ?follow opens the family portal for followers, and a follower's device keeps opening it after that
const params = new URLSearchParams(window.location.search);
const shareToken = params.get('t');
let follower = params.has('follow');
try { follower = follower || localStorage.getItem('portal') === '1'; } catch (e) { /* private window */ }

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {shareToken ? <GuestTrip token={shareToken} /> : follower ? <Portal /> : <App />}
  </React.StrictMode>
);
