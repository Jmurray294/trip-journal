import { registerSW } from 'virtual:pwa-register';

// The whole app is precached so it opens with no signal. A new version downloads in the
// background; when it is ready the app shows an Update button instead of waiting for a relaunch.

let apply = null;
let ready = false;
const listeners = new Set();

export function startUpdates() {
  apply = registerSW({
    immediate: true,
    onNeedRefresh() { ready = true; listeners.forEach((f) => f(true)); },
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const check = () => { if (navigator.onLine) reg.update().catch(() => {}); };
      setInterval(check, 30 * 60 * 1000);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    },
  });
}

export function onUpdateReady(fn) {
  listeners.add(fn);
  if (ready) fn(true);
  return () => listeners.delete(fn);
}

export const applyUpdate = () => { if (apply) apply(true); else window.location.reload(); };
