'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker so the app can be added to the iOS home screen
 * and open in standalone mode.
 *
 * Web push on iOS works only for a PWA the user has actually installed
 * (iOS 16.4+), and permission must be requested from a user gesture - so the
 * prompt lives behind a button in Settings, not here.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Registration failing is not fatal; the app works without offline shell.
    });
  }, []);

  return null;
}
