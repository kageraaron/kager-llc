'use client';

import { useCallback, useRef, useState } from 'react';
import { useEditorStore } from '@/lib/store';
import { fileToBitmap } from '@/lib/image/canvas';

export function UploadDropzone() {
  const setSource = useEditorStore((s) => s.setSource);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      if (!file.type.startsWith('image/')) {
        setError('Please choose an image file (PNG, JPG, or WebP).');
        return;
      }
      try {
        const bitmap = await fileToBitmap(file);
        setSource(bitmap);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load image.');
      }
    },
    [setSource],
  );

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
        const file = e.dataTransfer.files[0];
        if (file) void handleFile(file);
      }}
      className="absolute inset-0 flex items-center justify-center p-8"
    >
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={`w-full max-w-xl rounded-2xl border-2 border-dashed p-12 text-center transition ${
          dragOver
            ? 'border-accent bg-accent/5'
            : 'border-ink-700 bg-ink-900/40 hover:border-ink-500 hover:bg-ink-900/70'
        }`}
      >
        <div className="text-4xl mb-3">⬆</div>
        <h2 className="text-lg font-semibold">Drop a photo to start</h2>
        <p className="mt-1 text-sm text-ink-400">
          Or click to choose a file. PNG, JPG, or WebP.
        </p>
        <p className="mt-3 text-xs text-ink-500">
          Your image stays in this browser tab. Nothing is uploaded to our servers.
        </p>
        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
      </button>
    </div>
  );
}
