'use client';
import { useEffect } from 'react';

/** Registers the service worker after hydration so it never delays first paint. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    const timer = setTimeout(() => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // A failed registration must never break the app.
      });
    }, 1_000);
    return () => clearTimeout(timer);
  }, []);
  return null;
}
