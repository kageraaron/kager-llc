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

export type Job = {
  id: string;
  tool: ToolId;
  status: 'queued' | 'running' | 'done' | 'error';
  progress: number;
  message?: string;
  startedAt: number;
};

/**
 * Imperative API the BrushCanvas registers with the store so any other
 * component (e.g. FeaturePanel) can query/clear the current mask without
 * prop-drilling refs.
 */
export type BrushApi = {
  /**
   * Returns an ImageData the same size as the source image, where painted
   * pixels have alpha=0 and unpainted pixels are the original RGBA. Suitable
   * to feed straight into the inpainter.
   */
  composeMaskedImage: () => ImageData | null;
  hasMask: () => boolean;
  clear: () => void;
};

type EditorState = {
  sourceImage: ImageBitmap | null;
  currentImage: ImageBitmap | null;
  history: ImageBitmap[];
  historyIndex: number;
  activeTool: ToolId | null;
  jobs: Job[];

  /** Brush state (used by mask tools). */
  brushSize: number;
  brushMode: 'paint' | 'erase';
  brushApi: BrushApi | null;

  setSource: (img: ImageBitmap) => void;
  setCurrent: (img: ImageBitmap) => void;
  pushHistory: (img: ImageBitmap) => void;
  undo: () => void;
  redo: () => void;
  setActiveTool: (tool: ToolId | null) => void;
  setBrushSize: (n: number) => void;
  setBrushMode: (mode: 'paint' | 'erase') => void;
  setBrushApi: (api: BrushApi | null) => void;
  upsertJob: (job: Job) => void;
  reset: () => void;
};

export const useEditorStore = create<EditorState>((set, get) => ({
  sourceImage: null,
  currentImage: null,
  history: [],
  historyIndex: -1,
  activeTool: null,
  jobs: [],

  brushSize: 32,
  brushMode: 'paint',
  brushApi: null,

  setSource: (img) =>
    set({ sourceImage: img, currentImage: img, history: [img], historyIndex: 0 }),

  setCurrent: (img) => set({ currentImage: img }),

  pushHistory: (img) => {
    const { history, historyIndex } = get();
    const trimmed = history.slice(0, historyIndex + 1);
    const next = [...trimmed, img];
    set({ history: next, historyIndex: next.length - 1, currentImage: img });
  },

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    set({ historyIndex: newIndex, currentImage: history[newIndex] });
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 1) return;
    const newIndex = historyIndex + 1;
    set({ historyIndex: newIndex, currentImage: history[newIndex] });
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
      sourceImage: null,
      currentImage: null,
      history: [],
      historyIndex: -1,
      activeTool: null,
      jobs: [],
      brushApi: null,
    }),
}));
