'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ManualEventForm } from '@/components/ManualEventForm';

/**
 * Adding a show, as a sheet rather than a tab.
 *
 * Manual entry is still the memory-app primitive the tab bar comment argued it
 * was — but it is an ACTION, not a place. Giving it a tab meant leaving the list
 * you were reading to reach a form, then being deposited somewhere else after.
 * As a sheet it sits on top of Upcoming or Archive, and closing it puts you back
 * exactly where you were with the new show already in the list.
 *
 * A native `<dialog>` carries the accessibility this needs without a library:
 * Escape to dismiss, a focus trap, the background marked inert for screen
 * readers, and a real `::backdrop` to style. The only thing it does not give us
 * is backdrop-click-to-close, which is the click handler below.
 *
 * The provider lives in the app layout so any page can raise the same single
 * sheet — the header button and the empty states all call `useAddShow()`,
 * rather than each rendering a dialog of its own.
 */
const AddShowContext = createContext<(() => void) | null>(null);

export function useAddShow() {
  const open = useContext(AddShowContext);
  if (!open) throw new Error('useAddShow must be used inside <AddShowProvider>');
  return open;
}

export function AddShowProvider({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();

  /*
   * Bumped on every open and used as the form's `key`, which remounts it fresh.
   * Without it a half-typed show that the user dismissed is still sitting in the
   * fields the next time the sheet opens — it reads as a bug, not a draft.
   */
  const [instance, setInstance] = useState(0);

  const open = useCallback(() => {
    setInstance((n) => n + 1);
    ref.current?.showModal();
  }, []);

  const close = useCallback(() => ref.current?.close(), []);

  function done() {
    close();
    // The list behind the sheet is a server component, so it needs re-fetching
    // for the show just added to appear in it.
    router.refresh();
  }

  return (
    <AddShowContext.Provider value={open}>
      {children}

      <dialog
        ref={ref}
        className="sheet"
        aria-labelledby="add-show-title"
        // A click that lands on the dialog element itself is a click on the
        // backdrop: the panel inside stops anything within it from reaching here.
        onClick={(e) => {
          if (e.target === ref.current) close();
        }}
      >
        <div className="sheet-panel">
          <div className="sheet-grabber" aria-hidden="true" />

          <div className="spread" style={{ alignItems: 'flex-start' }}>
            <div>
              <h2 id="add-show-title" className="sheet-title">Add a show</h2>
              <p className="muted" style={{ margin: '2px 0 0' }}>
                Something you are going to, or something you already saw
              </p>
            </div>
            <button type="button" className="btn btn-sm" onClick={close} aria-label="Close">
              Cancel
            </button>
          </div>

          <ManualEventForm key={instance} afterAdd="stay" onDone={done} />

          <p className="muted" style={{ marginTop: 16, lineHeight: 1.55 }}>
            Most shows arrive on their own — Stub reads ticket confirmations from
            your inbox. This is for the ones it cannot find.
          </p>

          {/*
            * Browse is reachable from here and nowhere else now that `/add` is
            * gone from the tab bar. It is a deliberate side door rather than a
            * tab — searching listings is a thing other apps do better — but a
            * side door still has to exist.
            */}
          <div className="stack" style={{ marginTop: 12 }}>
            <Link className="btn btn-block" href="/browse" onClick={close}>
              Search listings instead
            </Link>
          </div>
        </div>
      </dialog>
    </AddShowContext.Provider>
  );
}

/** Opens the shared sheet. Safe to render anywhere under the provider. */
export function AddShowButton({
  className = 'btn btn-sm btn-primary',
  label = 'Add',
}: {
  className?: string;
  label?: string;
}) {
  const open = useAddShow();
  return (
    <button type="button" className={className} onClick={open}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        aria-hidden="true"
        style={{ width: 15, height: 15 }}
      >
        <path d="M12 6v12M6 12h12" />
      </svg>
      {label}
    </button>
  );
}
