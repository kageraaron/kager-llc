'use client';

import { create } from 'zustand';

export type ToolId = 'upscale' | 'colorize' | 'inpaint' | 'restore' | 'remove-bg';

export type Job = {
  id: string;
  tool: ToolId;
  status: 'queued' | 'running' | 'done' | 'error';
  progress: number; // 0..1
  message?: string;
  startedAt: number;
};

type EditorState = {
  /** The currently loaded source image (original, untouched). */
  sourceImage: ImageBitmap | null;
  /** The current working image (after edits). */
  currentImage: ImageBitmap | null;
  /** Edit history for undo/redo. */
  history: ImageBitmap[];
  historyIndex: number;
  /** Active tool panel. */
  activeTool: ToolId | null;
  /** Background jobs (model downloads, inference runs). */
  jobs: Job[];

  setSource: (img: ImageBitmap) => void;
  setCurrent: (img: ImageBitmap) => void;
  pushHistory: (img: ImageBitmap) => void;
  undo: () => void;
  redo: () => void;
  setActiveTool: (tool: ToolId | null) => void;
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
    }),
}));
