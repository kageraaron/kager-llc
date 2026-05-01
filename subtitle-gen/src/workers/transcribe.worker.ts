import { env, pipeline } from "@huggingface/transformers";

env.allowLocalModels = false;
env.useBrowserCache = true;

type WorkerRequest = {
  type: "transcribe";
  audio: Float32Array;
  model: string;
  language: string;
  messages: {
    loadingModel: string;
    transcribing: string;
  };
};

type ProgressPayload = {
  status?: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
};

type Transcriber = (audio: Float32Array, options: Record<string, unknown>) => Promise<unknown>;

let transcriber: Transcriber | null = null;
let loadedModel = "";
const createPipeline = pipeline as unknown as (
  task: string,
  model: string,
  options: Record<string, unknown>,
) => Promise<Transcriber>;

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  if (event.data.type !== "transcribe") return;

  try {
    const result = await transcribe(event.data);
    self.postMessage({ type: "complete", result });
  } catch (error) {
    self.postMessage({
      type: "error",
      error: error instanceof Error ? error.message : "Transcription failed.",
    });
  }
};

async function transcribe({ audio, model, language, messages }: WorkerRequest) {
  if (!transcriber || loadedModel !== model) {
    self.postMessage({ type: "status", message: messages.loadingModel });
    transcriber = await createPipeline("automatic-speech-recognition", model, {
      device: "wasm",
      dtype: "fp32",
      progress_callback: (progress: ProgressPayload) => {
        self.postMessage({
          type: "model-progress",
          progress,
        });
      },
    });
    loadedModel = model;
  }

  self.postMessage({ type: "status", message: messages.transcribing });

  return transcriber(audio, {
    return_timestamps: "word",
    chunk_length_s: 30,
    stride_length_s: 5,
    ...getGenerationOptions(model, language),
  } as Record<string, unknown>);
}

function getGenerationOptions(model: string, language: string) {
  if (isEnglishOnlyModel(model)) {
    return {};
  }

  return {
    task: "transcribe",
    is_multilingual: true,
    ...(language === "auto" ? {} : { language }),
  };
}

function isEnglishOnlyModel(model: string) {
  return model.endsWith(".en");
}

export {};
