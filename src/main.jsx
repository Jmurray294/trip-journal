import React from 'react';
import { createRoot } from 'react-dom/client';
import { startUpdates } from './lib/update.js';
import '@fontsource/spectral/500.css';
import '@fontsource/spectral/600.css';
import '@fontsource/spectral/500-italic.css';
import '@fontsource/hanken-grotesk/400.css';
import '@fontsource/hanken-grotesk/500.css';
import '@fontsource/hanken-grotesk/600.css';
import '@fontsource/hanken-grotesk/700.css';
import '@fontsource/spline-sans-mono/400.css';
import '@fontsource/spline-sans-mono/500.css';
import './styles.css';
import App from './App.jsx';
import GuestTrip from './screens/GuestTrip.jsx';

// Precache the whole app so it opens with no signal; new versions show an Update button.
startUpdates();

// a trip's shared link (?t=<token>) opens just that trip for a fellow traveler, no sign-in
const shareToken = new URLSearchParams(window.location.search).get('t');

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {shareToken ? <GuestTrip token={shareToken} /> : <App />}
  </React.StrictMode>
);
