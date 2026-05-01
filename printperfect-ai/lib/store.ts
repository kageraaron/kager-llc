'use client';

import { create } from 'zustand';

export type ToolId =
  | 'upscale'
  | 'colorize'
  | 'inpaint'
  | 'restore'
  | 'remove-bg'
  | 'watermark-remove';

/** Tools that need a paintable mask overlay on the canvas. */
export const MASK_TOOLS: ToolId[] = ['inpaint', 'watermark-remove'];

/**
 * One image in the user's working album. Each item carries its own edit
 * history so they can switch between photos without losing in-progress edits.
 */
export type AlbumItem = {
  id: string;
  name: string;
  sourceImage: ImageBitmap;
  currentImage: ImageBitmap;
  history: ImageBitmap[];
  historyIndex: number;
  /** True if the user has applied at least one edit. */
  edited: boolean;
};

export type Job = {
  id: string;
  tool: ToolId;
  status: 'queued' | 'running' | 'done' | 'error';
  progress: number;
  message?: string;
  startedAt: number;
};

export type BrushApi = {
  composeMaskedImage: () => ImageData | null;
  hasMask: () => boolean;
  clear: () => void;
};

type EditorState = {
  /** Album items in upload order. Index 0 is the first uploaded photo. */
  items: AlbumItem[];
  /** Currently-selected item id, or null when the album is empty. */
  activeItemId: string | null;

  activeTool: ToolId | null;
  jobs: Job[];
  brushSize: number;
  brushMode: 'paint' | 'erase';
  brushApi: BrushApi | null;

  // Album operations
  addItems: (entries: { name: string; bitmap: ImageBitmap }[]) => void;
  selectItem: (id: string) => void;
  removeItem: (id: string) => void;
  clearAlbum: () => void;

  // Edits operate on the active item
  pushHistory: (img: ImageBitmap) => void;
  undo: () => void;
  redo: () => void;
  resetActiveToOriginal: () => void;

  // Tool / brush state
  setActiveTool: (tool: ToolId | null) => void;
  setBrushSize: (n: number) => void;
  setBrushMode: (mode: 'paint' | 'erase') => void;
  setBrushApi: (api: BrushApi | null) => void;

  upsertJob: (job: Job) => void;
  reset: () => void;
};

function newId(): string {
  return `item_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  items: [],
  activeItemId: null,
  activeTool: null,
  jobs: [],

  brushSize: 32,
  brushMode: 'paint',
  brushApi: null,

  addItems: (entries) => {
    const newItems: AlbumItem[] = entries.map((e) => ({
      id: newId(),
      name: e.name,
      sourceImage: e.bitmap,
      currentImage: e.bitmap,
      history: [e.bitmap],
      historyIndex: 0,
      edited: false,
    }));
    const { items, activeItemId } = get();
    set({
      items: [...items, ...newItems],
      activeItemId: activeItemId ?? newItems[0]?.id ?? null,
    });
  },

  selectItem: (id) => {
    const { items } = get();
    if (items.some((i) => i.id === id)) set({ activeItemId: id });
  },

  removeItem: (id) => {
    const { items, activeItemId } = get();
    const next = items.filter((i) => i.id !== id);
    let nextActive = activeItemId;
    if (activeItemId === id) {
      const idx = items.findIndex((i) => i.id === id);
      nextActive = next[idx] ? next[idx].id : next[idx - 1]?.id ?? next[0]?.id ?? null;
    }
    set({ items: next, activeItemId: nextActive });
  },

  clearAlbum: () => set({ items: [], activeItemId: null }),

  pushHistory: (img) => {
    const { items, activeItemId } = get();
    if (!activeItemId) return;
    set({
      items: items.map((it) => {
        if (it.id !== activeItemId) return it;
        const trimmed = it.history.slice(0, it.historyIndex + 1);
        const nextHistory = [...trimmed, img];
        return {
          ...it,
          currentImage: img,
          history: nextHistory,
          historyIndex: nextHistory.length - 1,
          edited: true,
        };
      }),
    });
  },

  undo: () => {
    const { items, activeItemId } = get();
    if (!activeItemId) return;
    set({
      items: items.map((it) => {
        if (it.id !== activeItemId || it.historyIndex <= 0) return it;
        const newIndex = it.historyIndex - 1;
        return { ...it, historyIndex: newIndex, currentImage: it.history[newIndex] };
      }),
    });
  },

  redo: () => {
    const { items, activeItemId } = get();
    if (!activeItemId) return;
    set({
      items: items.map((it) => {
        if (it.id !== activeItemId || it.historyIndex >= it.history.length - 1) return it;
        const newIndex = it.historyIndex + 1;
        return { ...it, historyIndex: newIndex, currentImage: it.history[newIndex] };
      }),
    });
  },

  resetActiveToOriginal: () => {
    const { items, activeItemId } = get();
    if (!activeItemId) return;
    set({
      items: items.map((it) =>
        it.id !== activeItemId
          ? it
          : {
              ...it,
              currentImage: it.sourceImage,
              history: [it.sourceImage],
              historyIndex: 0,
              edited: false,
            },
      ),
    });
  },

  setActiveTool: (tool) => set({ activeTool: tool }),
  setBrushSize: (n) => set({ brushSize: n }),
  setBrushMode: (mode) => set({ brushMode: mode }),
  setBrushApi: (api) => set({ brushApi: api }),

  upsertJob: (job) => {
    const { jobs } = get();
    const existing = jobs.findIndex((j) => j.id === job.id);
    if (existing >= 0) {
      const next = [...jobs];
      next[existing] = job;
      set({ jobs: next });
    } else {
      set({ jobs: [...jobs, job] });
    }
  },

  reset: () =>
    set({
      items: [],
      activeItemId: null,
      activeTool: null,
      jobs: [],
      brushApi: null,
    }),
}));

/** Convenience selector — the currently-active album item, or null. */
export function useActiveItem(): AlbumItem | null {
  return useEditorStore((s) => s.items.find((i) => i.id === s.activeItemId) ?? null);
}
