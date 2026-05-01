'use client';

import clsx from 'clsx';
import { useEditorStore, type ToolId } from '@/lib/store';

type ToolDef = { id: ToolId; label: string; icon: string };

const tools: ToolDef[] = [
  { id: 'upscale', label: 'Upscale', icon: '⤢' },
  { id: 'colorize', label: 'Colorize', icon: '🎨' },
  { id: 'restore', label: 'Restore', icon: '✦' },
  // { id: 'inpaint', label: 'Inpaint', icon: '⊘' },
  // { id: 'watermark-remove', label: 'Watermark', icon: '⌧' },
  { id: 'remove-bg', label: 'Remove BG', icon: '⊡' },
];

export function Toolbar() {
  const activeTool = useEditorStore((s) => s.activeTool);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);
  const itemCount = useEditorStore((s) => s.items.length);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);

  const disabled = itemCount === 0;

  return (
    <nav className="flex flex-col items-center gap-1 border-r border-ink-800 bg-ink-900/60 py-3">
      {tools.map((t) => (
        <button
          key={t.id}
          type="button"
          disabled={disabled}
          onClick={() => setActiveTool(activeTool === t.id ? null : t.id)}
          title={t.label}
          aria-label={t.label}
          className={clsx(
            'group flex h-12 w-12 flex-col items-center justify-center rounded-md text-xs transition',
            disabled && 'opacity-30 cursor-not-allowed',
            activeTool === t.id
              ? 'bg-accent/20 text-accent ring-1 ring-accent/40'
              : 'text-ink-300 hover:bg-ink-800 hover:text-ink-50',
          )}
        >
          <span className="text-lg leading-none">{t.icon}</span>
          <span className="mt-1 text-[10px]">{t.label}</span>
        </button>
      ))}

      <div className="mt-auto flex flex-col gap-1">
        <button
          type="button"
          disabled={disabled}
          onClick={undo}
          title="Undo"
          className="h-10 w-12 rounded-md text-ink-300 hover:bg-ink-800 hover:text-ink-50 disabled:opacity-30 disabled:hover:bg-transparent transition"
        >
          ↶
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={redo}
          title="Redo"
          className="h-10 w-12 rounded-md text-ink-300 hover:bg-ink-800 hover:text-ink-50 disabled:opacity-30 disabled:hover:bg-transparent transition"
        >
          ↷
        </button>
      </div>
    </nav>
  );
}
