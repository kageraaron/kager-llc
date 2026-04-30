/** Shared types for AI feature modules. */

export type ProgressCallback = (progress: number, message?: string) => void;

export interface AIFeature {
  /** Load weights and warm up the runtime. Idempotent. */
  init(onProgress?: ProgressCallback): Promise<void>;
  /** Run the model on an input image and return the result. */
  run(input: ImageData, onProgress?: ProgressCallback): Promise<ImageData>;
  /** Free GPU memory. */
  dispose(): void;
}

export type ModelManifest = {
  id: string;
  url: string;
  /** Approximate size in megabytes — shown to the user before download. */
  sizeMb: number;
  sha256?: string;
};
