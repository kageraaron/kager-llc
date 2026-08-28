'use client';

import { useEffect, useState } from 'react';

/**
 * Enables day-before show reminders.
 *
 * On iOS this only works once Stub has been added to the home screen
 * (iOS 16.4+), and Notification.requestPermission must be called from a user
 * gesture — hence a button rather than an automatic prompt.
 */
export function PushToggle({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const [state, setState] = useState<'loading' | 'unsupported' | 'off' | 'on' | 'denied'>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setState('denied');
      return;
    }

    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(sub ? 'on' : 'off'))
      .catch(() => setState('off'));
  }, []);

  /**
   * VAPID keys travel as base64url but PushManager wants a BufferSource.
   * Backed by an explicit ArrayBuffer so the type is `Uint8Array<ArrayBuffer>`
   * rather than `Uint8Array<ArrayBufferLike>`, which BufferSource rejects.
   */
  function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
    const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const raw = atob(padded);
    const bytes = new Uint8Array(new ArrayBuffer(raw.length));
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes;
  }

  async function enable() {
    if (!vapidPublicKey) return;
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'off');
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub),
      });
      if (!res.ok) throw new Error('Could not save subscription');

      setState('on');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not enable notifications');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState('off');
    } finally {
      setBusy(false);
    }
  }

  if (state === 'loading') return null;

  const message = {
    unsupported: 'This browser does not support push notifications.',
    denied: 'Notifications are blocked. Enable them in your browser or iOS settings.',
    on: 'You will get a reminder the day before each show.',
    off: 'Get a reminder the day before each show you are going to.',
  }[state];

  return (
    <div className="card" style={{ flexDirection: 'column', gap: 8 }}>
      <div className="spread">
        <strong>Show reminders</strong>
        <span className={`pill ${state === 'on' ? 'pill-going' : ''}`}>
          {state === 'on' ? 'On' : 'Off'}
        </span>
      </div>
      <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>{message}</p>

      {!vapidPublicKey && state === 'off' && (
        <p className="muted" style={{ margin: 0, fontSize: 11 }}>
          Server is missing VAPID keys — see the README.
        </p>
      )}

      {state === 'off' && (
        <button className="btn btn-primary btn-block" disabled={busy || !vapidPublicKey} onClick={enable}>
          {busy ? 'Enabling...' : 'Turn on reminders'}
        </button>
      )}
      {state === 'on' && (
        <button className="btn btn-block" disabled={busy} onClick={disable}>
          Turn off
        </button>
      )}

      {error && <p className="error" style={{ margin: 0 }}>{error}</p>}
    </div>
  );
}
