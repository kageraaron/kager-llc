'use client';

import { useCallback, useRef, useState } from 'react';
import { useEditorStore } from '@/lib/store';
import { fileToBitmap } from '@/lib/image/canvas';

export function UploadDropzone({ compact = false }: { compact?: boolean } = {}) {
  const addItems = useEditorStore((s) => s.addItems);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      setError(null);
      setBusy(true);
      try {
        const arr = Array.from(files);
        const valid = arr.filter((f) => f.type.startsWith('image/'));
        if (!valid.length) {
          setError('No image files in selection.');
          return;
        }
        // Decode in parallel — bitmaps are GPU-friendly and small in JS heap.
        const entries = await Promise.all(
          valid.map(async (f) => ({ name: f.name, bitmap: await fileToBitmap(f) })),
        );
        addItems(entries);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load images.');
      } finally {
        setBusy(false);
      }
    },
    [addItems],
  );

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        title="Add more photos"
        className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-lg ring-1 ring-dashed ring-ink-700 hover:bg-ink-800/40 transition disabled:opacity-50"
      >
        <span className="text-xl leading-none">+</span>
        <span className="mt-1 text-[10px] text-ink-400">Add</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files?.length) void handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </button>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files.length) void handleFiles(e.dataTransfer.files);
      }}
      className="absolute inset-0 flex items-center justify-center p-8"
    >
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className={`w-full max-w-xl rounded-2xl border-2 border-dashed p-12 text-center transition ${
          dragOver
            ? 'border-accent bg-accent/5'
            : 'border-ink-700 bg-ink-900/40 hover:border-ink-500 hover:bg-ink-900/70'
        } disabled:opacity-50`}
      >
        <div className="text-4xl mb-3">⬆</div>
        <h2 className="text-lg font-semibold">
          {busy ? 'Loading…' : 'Drop one or more photos to start'}
        </h2>
        <p className="mt-1 text-sm text-ink-400">
          Or click to choose files. PNG, JPG, or WebP. Multi-select supported.
        </p>
        <p className="mt-3 text-xs text-ink-500">
          Your images stay in this browser tab. Nothing is uploaded to our servers.
        </p>
        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files?.length) void handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </button>
    </div>
  );
}
