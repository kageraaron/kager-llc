'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildAcceptAttribute,
  detectFormat,
  getFormat,
  getValidTargets,
  isConversionSupported,
} from '@/lib/formats';

/* -----------------------------------------------------------
 * Types
 * --------------------------------------------------------- */

type QueueStatus = 'queued' | 'converting' | 'done' | 'error';

interface QueueItem {
  id: string;
  file: File;
  fromCode: string;
  toCode: string;
  status: QueueStatus;
  progress: number;
  results: { url: string; name: string }[];
  error?: string;
}

interface ConverterProps {
  /** Optional default source format (e.g. on /convert/heic-to-jpg pages) */
  from?: string;
  /** Optional default target format */
  to?: string;
  /** Auto-start conversion as soon as a file is added */
  autoStart?: boolean;
  /** Compact dropzone variant for embedded contexts */
  compact?: boolean;
}

/* -----------------------------------------------------------
 * Small inline icons (kept here to avoid extra files)
 * --------------------------------------------------------- */

const IconUpload = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="28" height="28" {...props}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const IconArrow = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

const IconCheck = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconAlert = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" {...props}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const IconDownload = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" {...props}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const IconClose = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" {...props}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconPlus = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" {...props}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

/* -----------------------------------------------------------
 * Helpers
 * --------------------------------------------------------- */

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const newId = () => `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Pick a sensible default output for a given source format.
 * Used when the user hasn't pinned a target via props.
 */
const pickDefaultTarget = (fromCode: string, preferred?: string): string => {
  const valid = getValidTargets(fromCode);
  if (preferred && valid.includes(preferred)) return preferred;
  if (valid.length === 0) return '';
  // Sensible defaults per source kind
  const defaults: Record<string, string> = {
    HEIC: 'JPG', WEBP: 'PNG', SVG: 'PNG', TIFF: 'PNG',
    PNG: 'JPG', JPG: 'PNG',
    MP4: 'MP3', MOV: 'MP4', WEBM: 'MP4', WAV: 'MP3',
    PDF: 'PNG',
  };
  if (defaults[fromCode] && valid.includes(defaults[fromCode])) return defaults[fromCode];
  return valid[0];
};

/* -----------------------------------------------------------
 * Conversion router — calls the existing converter library
 * --------------------------------------------------------- */

async function runConversion(
  file: File,
  fromCode: string,
  toCode: string,
  onProgress: (p: number) => void
): Promise<{ blob: Blob; name: string }[]> {
  const from = getFormat(fromCode);
  const to = getFormat(toCode);
  if (!from || !to) throw new Error(`Unsupported conversion: ${fromCode} → ${toCode}`);

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'converted';
  const targetExt = to.extensions[0];

  // Image -> Image
  if (from.kind === 'image' && to.kind === 'image') {
    const { convertImage } = await import('@/lib/converters/imageConverter');
    const blob = await convertImage(file, toCode as any);
    return [{ blob, name: `${baseName}.${targetExt}` }];
  }

  // Image -> PDF
  if (from.kind === 'image' && to.code === 'PDF') {
    const { convertImagesToPdf } = await import('@/lib/converters/pdfConverter');
    const blob = await convertImagesToPdf([file]);
    return [{ blob, name: `${baseName}.pdf` }];
  }

  // PDF -> raster image (multi-page: returns one blob per page)
  if (from.code === 'PDF' && to.kind === 'image' && (to.code === 'JPG' || to.code === 'PNG')) {
    const { convertPdfToImages } = await import('@/lib/converters/pdfConverter');
    const blobs = await convertPdfToImages(file, to.code as any);
    return blobs.map((blob, i) => ({
      blob,
      name: blobs.length > 1 ? `${baseName}-page-${i + 1}.${targetExt}` : `${baseName}.${targetExt}`,
    }));
  }

  // Media -> Media (re-encode / extract audio / build gif)
  if (to.kind === 'media') {
    const { convertMedia } = await import('@/lib/converters/videoConverter');
    const blob = await convertMedia(file, to.code, onProgress);
    return [{ blob, name: `${baseName}.${targetExt}` }];
  }

  throw new Error(`Conversion from ${fromCode} to ${toCode} is not yet supported.`);
}

/* -----------------------------------------------------------
 * Component
 * --------------------------------------------------------- */

export default function Converter({ from, to, autoStart = false, compact = false }: ConverterProps) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  // Pin source format if `from` is provided (keeps slug pages constrained), otherwise allow auto-detect.
  const lockedFrom = from?.toUpperCase();
  const lockedTo = to?.toUpperCase();

  const acceptAttr = useMemo(() => {
    if (lockedFrom) {
      const f = getFormat(lockedFrom);
      if (f) return [...f.extensions.map((e) => `.${e}`), ...f.mimes].join(',');
    }
    return buildAcceptAttribute();
  }, [lockedFrom]);

  /* ----- file ingestion ------------------------------------ */

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const incoming = Array.from(fileList);
    if (incoming.length === 0) return;

    const newItems: QueueItem[] = incoming.map((file) => {
      const detected = detectFormat(file);
      const fromCode = lockedFrom ?? detected?.code ?? '';
      const targetCode = pickDefaultTarget(fromCode, lockedTo);
      const supported = fromCode && targetCode && isConversionSupported(fromCode, targetCode);

      return {
        id: newId(),
        file,
        fromCode,
        toCode: targetCode,
        status: supported ? 'queued' : 'error',
        progress: 0,
        results: [],
        error: supported
          ? undefined
          : !fromCode
          ? `Unsupported file type${detected ? '' : ' — couldn\'t detect format'}.`
          : !targetCode
          ? `No conversion available for ${fromCode}.`
          : `Can't convert ${fromCode} → ${targetCode} yet.`,
      };
    });

    setItems((prev) => [...prev, ...newItems]);

    if (autoStart) {
      // start each runnable item
      newItems.forEach((item) => {
        if (item.status === 'queued') void convertItem(item.id, item);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedFrom, lockedTo, autoStart]);

  /* ----- conversion ---------------------------------------- */

  // TODO(monetization): Phase 3 — interstitial video ad rolls during conversion.
  // When a conversion starts (status flips to 'converting'), open a modal that
  // plays a ~15s rewarded/interstitial video ad. Disable the per-item Download
  // button until BOTH (a) the conversion has finished AND (b) the user has
  // watched at least 15 seconds of the ad. Premium / token-tier users should
  // bypass this gate. Likely implementation:
  //   - <ConversionAdGate> overlay component triggered from this callback
  //   - track `adWatchedMs` per item in QueueItem, gate `downloadAll` + the
  //     individual download buttons in the queue row on `adWatchedMs >= 15000`
  //   - hook into AdSense / Ezoic rewarded video, fall back to silent skip
  //     if the ad network can't deliver an ad (no fill).
  const convertItem = useCallback(async (id: string, seed?: QueueItem) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, status: 'converting', progress: 0, error: undefined, results: [] } : it))
    );

    // Allow a freshly-created item passed in directly, otherwise read from state.
    const target =
      seed ??
      (await new Promise<QueueItem | undefined>((resolve) => {
        setItems((prev) => {
          resolve(prev.find((i) => i.id === id));
          return prev;
        });
      }));

    if (!target) return;

    try {
      const outputs = await runConversion(target.file, target.fromCode, target.toCode, (p) => {
        setItems((prev) => prev.map((it) => (it.id === id ? { ...it, progress: Math.max(0, Math.min(100, p)) } : it)));
      });

      const results = outputs.map((o) => ({
        url: URL.createObjectURL(o.blob),
        name: o.name,
      }));

      setItems((prev) =>
        prev.map((it) => (it.id === id ? { ...it, status: 'done', progress: 100, results } : it))
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Conversion failed.';
      setItems((prev) =>
        prev.map((it) => (it.id === id ? { ...it, status: 'error', error: message } : it))
      );
    }
  }, []);

  const convertAll = useCallback(() => {
    items.filter((i) => i.status === 'queued').forEach((i) => void convertItem(i.id));
  }, [items, convertItem]);

  const downloadAll = useCallback(() => {
    items.forEach((item) => {
      item.results.forEach((res) => {
        const a = document.createElement('a');
        a.href = res.url;
        a.download = res.name;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
      });
    });
  }, [items]);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const target = prev.find((i) => i.id === id);
      target?.results.forEach((r) => URL.revokeObjectURL(r.url));
      return prev.filter((i) => i.id !== id);
    });
  }, []);

  const clearAll = useCallback(() => {
    setItems((prev) => {
      prev.forEach((i) => i.results.forEach((r) => URL.revokeObjectURL(r.url)));
      return [];
    });
  }, []);

  const setItemTarget = useCallback((id: string, toCode: string) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        const supported = isConversionSupported(it.fromCode, toCode);
        return {
          ...it,
          toCode,
          status: supported ? 'queued' : 'error',
          error: supported ? undefined : `Can't convert ${it.fromCode} → ${toCode} yet.`,
          results: [],
          progress: 0,
        };
      })
    );
  }, []);

  /* ----- drag & drop --------------------------------------- */

  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (e.dataTransfer?.types.includes('Files')) {
      dragCounter.current += 1;
      setIsDragging(true);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
  };

  /* ----- cleanup blob URLs on unmount ---------------------- */
  useEffect(() => {
    return () => {
      items.forEach((i) => i.results.forEach((r) => URL.revokeObjectURL(r.url)));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ----- summary state ------------------------------------- */

  const queuedCount = items.filter((i) => i.status === 'queued').length;
  const doneCount = items.filter((i) => i.status === 'done').length;
  const isAnyConverting = items.some((i) => i.status === 'converting');

  /* ----- render -------------------------------------------- */

  const heading = lockedFrom && lockedTo
    ? `Drop ${lockedFrom} files here`
    : lockedFrom
    ? `Drop ${lockedFrom} files here`
    : 'Drop files here';

  const subheading = lockedFrom && lockedTo
    ? `Convert ${lockedFrom} → ${lockedTo} locally — your files never leave the browser.`
    : 'Or click to choose. Files are converted locally — nothing is uploaded.';

  return (
    <div className="converter">
      {/* Dropzone — also accepts drops while files are queued */}
      <div
        role="button"
        tabIndex={0}
        className={`dropzone ${isDragging ? 'dropzone--active' : ''} ${compact || items.length > 0 ? 'dropzone--compact' : ''}`}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        aria-label={heading}
      >
        <div className="dropzone__icon" aria-hidden>
          <IconUpload />
        </div>
        <div>
          <div className="dropzone__title">
            {items.length > 0 ? 'Add more files' : heading}
          </div>
          <div className="dropzone__hint">{subheading}</div>
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={acceptAttr}
          onChange={(e) => e.target.files && addFiles(e.target.files)}
          className="sr-only"
          aria-hidden
        />
      </div>

      {/* Queue */}
      {items.length > 0 && (
        <div className="queue slide-up">
          {items.map((item) => (
            <QueueRow
              key={item.id}
              item={item}
              lockedTo={lockedTo}
              onTargetChange={(t) => setItemTarget(item.id, t)}
              onConvert={() => convertItem(item.id)}
              onRemove={() => removeItem(item.id)}
            />
          ))}
        </div>
      )}

      {/* Batch actions */}
      {items.length > 0 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.75rem',
            flexWrap: 'wrap',
            marginTop: '0.25rem',
          }}
        >
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {items.length} file{items.length === 1 ? '' : 's'}
            {doneCount > 0 && <> • <span style={{ color: 'var(--success)' }}>{doneCount} done</span></>}
            {queuedCount > 0 && <> • {queuedCount} ready</>}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button className="btn btn--ghost" onClick={clearAll} disabled={isAnyConverting}>
              Clear all
            </button>
            {doneCount > 0 && (
              <button className="btn btn--outline" onClick={downloadAll}>
                <IconDownload /> Download all
              </button>
            )}
            <button
              className="btn btn--primary"
              onClick={convertAll}
              disabled={queuedCount === 0 || isAnyConverting}
            >
              {isAnyConverting ? (
                <>
                  <span className="spinner spin" aria-hidden /> Converting…
                </>
              ) : (
                <>Convert {queuedCount > 1 ? `${queuedCount} files` : 'file'}</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* -----------------------------------------------------------
 * Queue row sub-component
 * --------------------------------------------------------- */

interface QueueRowProps {
  item: QueueItem;
  lockedTo?: string;
  onTargetChange: (toCode: string) => void;
  onConvert: () => void;
  onRemove: () => void;
}

function QueueRow({ item, lockedTo, onTargetChange, onConvert, onRemove }: QueueRowProps) {
  const validTargets = item.fromCode ? getValidTargets(item.fromCode) : [];

  const statusChip = (() => {
    switch (item.status) {
      case 'queued':
        return <span className="chip chip--neutral"><span className="chip__dot" /> Ready</span>;
      case 'converting':
        return <span className="chip"><span className="spinner spin" aria-hidden style={{ width: 12, height: 12, borderWidth: 2 }} /> {Math.round(item.progress)}%</span>;
      case 'done':
        return <span className="chip chip--success"><IconCheck /> Done</span>;
      case 'error':
        return <span className="chip chip--danger"><IconAlert /> Error</span>;
    }
  })();

  return (
    <div className="queue-row fade-in">
      <div className="queue-row__icon" aria-hidden>
        {item.fromCode || '?'}
      </div>

      <div className="queue-row__main">
        <div className="queue-row__name" title={item.file.name}>
          {item.file.name}
        </div>

        <div className="queue-row__meta">
          <span>{formatBytes(item.file.size)}</span>

          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>{item.fromCode || '—'}</span>
            <IconArrow style={{ color: 'var(--text-subtle)' }} />
            {/* Format picker */}
            {lockedTo ? (
              <span className="format-picker" aria-label="Output format">
                <strong style={{ color: 'var(--primary)' }}>{lockedTo}</strong>
              </span>
            ) : (
              <span className="format-picker">
                <select
                  value={item.toCode}
                  onChange={(e) => onTargetChange(e.target.value)}
                  disabled={item.status === 'converting'}
                  aria-label="Output format"
                >
                  {validTargets.length === 0 && <option value="">—</option>}
                  {validTargets.map((code) => (
                    <option key={code} value={code}>{code}</option>
                  ))}
                </select>
                <IconArrow style={{ color: 'var(--text-subtle)', transform: 'rotate(90deg)' }} />
              </span>
            )}
          </span>

          {statusChip}

          {item.status === 'error' && item.error && (
            <span style={{ color: 'var(--danger)' }}>{item.error}</span>
          )}
        </div>

        {item.status === 'converting' && (
          <div className="progress" style={{ marginTop: '0.4rem' }}>
            <div
              className={`progress__bar ${item.progress === 0 ? 'progress__bar--indeterminate' : ''}`}
              style={{ width: `${item.progress}%` }}
            />
          </div>
        )}
      </div>

      <div className="queue-row__actions">
        {item.status === 'done' && item.results.length > 0 && (
          item.results.length === 1 ? (
            <a
              href={item.results[0].url}
              download={item.results[0].name}
              className="btn btn--primary"
            >
              <IconDownload /> Download
            </a>
          ) : (
            <details style={{ position: 'relative' }}>
              <summary className="btn btn--primary" style={{ listStyle: 'none' }}>
                <IconDownload /> {item.results.length} files
              </summary>
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  marginTop: '0.5rem',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  boxShadow: 'var(--shadow)',
                  padding: '0.4rem',
                  minWidth: '220px',
                  zIndex: 10,
                }}
              >
                {item.results.map((r) => (
                  <a
                    key={r.url}
                    href={r.url}
                    download={r.name}
                    className="btn btn--ghost"
                    style={{ width: '100%', justifyContent: 'flex-start' }}
                  >
                    <IconDownload /> {r.name}
                  </a>
                ))}
              </div>
            </details>
          )
        )}

        {item.status === 'queued' && (
          <button className="btn btn--outline" onClick={onConvert}>
            <IconArrow /> Convert
          </button>
        )}

        {item.status === 'error' && (
          <button className="btn btn--outline" onClick={onConvert}>
            Retry
          </button>
        )}

        <button
          className="btn btn--icon btn--ghost"
          onClick={onRemove}
          aria-label="Remove file"
          disabled={item.status === 'converting'}
        >
          <IconClose />
        </button>
      </div>
    </div>
  );
}

/* Re-export the icon for use elsewhere if needed */
export { IconPlus };
