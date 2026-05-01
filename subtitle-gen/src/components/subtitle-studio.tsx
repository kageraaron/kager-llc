"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { decodeAudioFile } from "@/lib/audio";
import { useI18n } from "@/lib/i18n";
import {
  SubtitleCue,
  TranscriptChunk,
  chunksToCues,
  downloadTextFile,
  formatClock,
  getActiveCue,
  toSrt,
  toVtt,
} from "@/lib/subtitles";
import {
  CaptionStyle,
  renderCaptionedVideo,
} from "@/lib/video-captioning";

type WorkerProgress = {
  status?: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
};

type TranscriptResult = {
  text: string;
  chunks?: TranscriptChunk[];
};

type StudioTab = "audio" | "video" | "caption";

const MODELS = [
  {
    id: "Xenova/whisper-tiny.en",
    nameKey: "model_tiny_en",
    detailKey: "model_detail_fast_en",
    multilingual: false,
  },
  {
    id: "Xenova/whisper-base.en",
    nameKey: "model_base_en",
    detailKey: "model_detail_accurate_en",
    multilingual: false,
  },
  {
    id: "Xenova/whisper-tiny",
    nameKey: "model_tiny_multi",
    detailKey: "model_detail_fast_multi",
    multilingual: true,
  },
  {
    id: "Xenova/whisper-base",
    nameKey: "model_base_multi",
    detailKey: "model_detail_accurate_multi",
    multilingual: true,
  },
];

const LANGUAGES = [
  { id: "auto", nameKey: "lang_auto" },
  { id: "english", nameKey: "lang_english" },
  { id: "arabic", nameKey: "lang_arabic" },
  { id: "chinese", nameKey: "lang_chinese" },
  { id: "dutch", nameKey: "lang_dutch" },
  { id: "spanish", nameKey: "lang_spanish" },
  { id: "french", nameKey: "lang_french" },
  { id: "german", nameKey: "lang_german" },
  { id: "hindi", nameKey: "lang_hindi" },
  { id: "italian", nameKey: "lang_italian" },
  { id: "japanese", nameKey: "lang_japanese" },
  { id: "korean", nameKey: "lang_korean" },
  { id: "portuguese", nameKey: "lang_portuguese" },
  { id: "russian", nameKey: "lang_russian" },
];

export function SubtitleStudio() {
  const { t } = useI18n();
  const workerRef = useRef<Worker | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [activeTab, setActiveTab] = useState<StudioTab>("audio");
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState(0);
  const [sourceSampleRate, setSourceSampleRate] = useState(0);
  const [model, setModel] = useState(MODELS[0].id);
  const [language, setLanguage] = useState("auto");
  const [status, setStatus] = useState("");
  const [modelProgress, setModelProgress] = useState(0);
  const [isWorking, setIsWorking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const [error, setError] = useState("");
  const [videoTime, setVideoTime] = useState(0);
  const [isRenderingVideo, setIsRenderingVideo] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>({
    fontFamily: "Arial",
    fontSize: 12,
    color: "#000000",
    backgroundColor: "rgba(255,255,255,0.78)",
    showBackground: true,
    horizontal: "center",
    vertical: "center",
  });

  const selectedModel = useMemo(
    () => MODELS.find((item) => item.id === model) ?? MODELS[0],
    [model],
  );
  const effectiveModel = useMemo(
    () => getCompatibleModel(model, language),
    [model, language],
  );
  const effectiveModelInfo = useMemo(
    () => MODELS.find((item) => item.id === effectiveModel) ?? MODELS[0],
    [effectiveModel],
  );
  const modelWasAdjusted = effectiveModel !== model;
  const isVideoMode = activeTab !== "audio";
  const isCaptionMode = activeTab === "caption";

  useEffect(() => {
    return () => workerRef.current?.terminate();
  }, []);

  const videoUrl = useMemo(() => {
    if (!file || !file.type.startsWith("video/")) return "";
    return URL.createObjectURL(file);
  }, [file]);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  async function handleTranscribe() {
    if (!file || isWorking) return;

    setIsWorking(true);
    setError("");
    setTranscript("");
    setCues([]);
    setModelProgress(0);

    try {
      setStatus(t("status_decoding"));
      const decoded = await decodeAudioFile(file);
      setDuration(decoded.duration);
      setSourceSampleRate(decoded.sourceSampleRate);

      if (modelWasAdjusted) {
        setStatus(
          t("status_switching_model", {
            model: t(effectiveModelInfo.nameKey),
            language: t(getLanguageNameKey(language)),
          }),
        );
        setModel(effectiveModel);
      }

      const result = await runWorker(decoded.samples, effectiveModel);
      const nextCues = chunksToCues(
        result.chunks ?? [],
        result.text,
        decoded.duration,
      );

      setTranscript(result.text.trim());
      setCues(nextCues);
      setStatus(t("status_done", { count: nextCues.length }));
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Could not transcribe file.";
      setError(message);
      setStatus(t("status_try_another"));
    } finally {
      setIsWorking(false);
    }
  }

  async function handleRenderCaptionedVideo() {
    if (!file || !cues.length || isRenderingVideo) return;

    setError("");
    setIsRenderingVideo(true);
    setRenderProgress(0);
    setStatus(t("status_rendering_video"));

    try {
      await renderCaptionedVideo({
        file,
        cues,
        style: captionStyle,
        filename: baseName,
        onProgress: setRenderProgress,
      });
      setStatus(t("status_video_exported"));
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : t("error_render_failed");
      setError(message);
      setStatus(t("status_try_another"));
    } finally {
      setIsRenderingVideo(false);
    }
  }

  function runWorker(
    audio: Float32Array,
    modelId: string,
  ): Promise<TranscriptResult> {
    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL("../workers/transcribe.worker.ts", import.meta.url),
        { type: "module" },
      );
    }

    return new Promise((resolve, reject) => {
      const worker = workerRef.current;
      if (!worker) {
        reject(new Error("Could not start transcription worker."));
        return;
      }

      worker.onmessage = (event: MessageEvent) => {
        const data = event.data;
        if (data.type === "status") {
          setStatus(data.message);
          return;
        }

        if (data.type === "model-progress") {
          updateProgress(data.progress);
          return;
        }

        if (data.type === "complete") {
          resolve(data.result);
          return;
        }

        if (data.type === "error") {
          reject(new Error(data.error));
        }
      };

      worker.onerror = () => {
        reject(new Error("The transcription worker crashed."));
      };

      worker.postMessage(
        {
          type: "transcribe",
          audio,
          model: modelId,
          language,
          messages: {
            loadingModel: t("status_model_loading"),
            transcribing: t("status_transcribing"),
          },
        },
        [audio.buffer],
      );
    });
  }

  function updateProgress(progress: WorkerProgress) {
    if (typeof progress.progress === "number") {
      setModelProgress(Math.round(progress.progress));
    }

    if (progress.status === "progress" && progress.file) {
      setStatus(t("status_downloading", { file: shortFile(progress.file) }));
    }
  }

  function handleFile(nextFile: File | null) {
    setFile(nextFile);
    setDuration(0);
    setSourceSampleRate(0);
    setTranscript("");
    setCues([]);
    setError("");
    setVideoTime(0);
    setRenderProgress(0);
    setStatus(
      nextFile
        ? t("status_file_ready", { file: nextFile.name })
        : t("status_idle"),
    );
  }

  const srt = useMemo(() => toSrt(cues), [cues]);
  const vtt = useMemo(() => toVtt(cues), [cues]);
  const baseName = file?.name.replace(/\.[^.]+$/, "") || "subtitles";
  const displayStatus = status || t("status_idle");
  const activeCue = isCaptionMode ? getActiveCue(cues, videoTime) : null;
  const fileAccept = isVideoMode ? "video/*" : "audio/*,video/*";

  return (
    <main className="main container">
      <section className="hero">
        <div className="hero__eyebrow">
          <span className="hero__dot" />
          {t("hero_eyebrow")}
        </div>
        <h1 className="hero__title">
          {t("hero_title").split("{highlight}").map((part, index) => (
            <span key={index}>
              {part}
              {index === 0 ? (
                <span className="text-primary">{t("hero_title_highlight")}</span>
              ) : null}
            </span>
          ))}
        </h1>
        <p className="hero__subtitle">{t("hero_subtitle")}</p>
      </section>

      <section className="studio-shell" id="studio">
        <div className="studio-tabs" role="tablist" aria-label="Studio mode">
          {[
            ["audio", "tab_audio"],
            ["video", "tab_video"],
            ["caption", "tab_caption"],
          ].map(([tab, label]) => (
            <button
              aria-selected={activeTab === tab}
              className={activeTab === tab ? "studio-tab is-active" : "studio-tab"}
              key={tab}
              onClick={() => {
                setActiveTab(tab as StudioTab);
                handleFile(null);
              }}
              role="tab"
              type="button"
            >
              {t(label)}
            </button>
          ))}
        </div>

        <div className="studio-grid">
          <section className="panel controls-panel">
            <label
              className="dropzone"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                handleFile(event.dataTransfer.files.item(0));
              }}
            >
              <input
                type="file"
                accept={fileAccept}
                onChange={(event) =>
                  handleFile(event.currentTarget.files?.item(0) ?? null)
                }
              />
              <span className="drop-title">
                {file ? file.name : t("drop_title_empty")}
              </span>
              <span className="drop-detail">{t("drop_detail")}</span>
            </label>

            <p className="mode-note">
              {activeTab === "audio"
                ? t("mode_audio_note")
                : activeTab === "video"
                  ? t("mode_video_note")
                  : t("mode_caption_note")}
            </p>

            <div className="control-group">
              <label htmlFor="model">{t("label_model")}</label>
              <select
                id="model"
                value={model}
                onChange={(event) => setModel(event.target.value)}
                disabled={isWorking}
              >
                {MODELS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {t(item.nameKey)} - {t(item.detailKey)}
                  </option>
                ))}
              </select>
            </div>

            <div className="control-group">
              <label htmlFor="language">{t("label_language")}</label>
              <select
                id="language"
                value={language}
                onChange={(event) => {
                  const nextLanguage = event.target.value;
                  setLanguage(nextLanguage);
                  setModel((currentModel) =>
                    getCompatibleModel(currentModel, nextLanguage),
                  );
                }}
                disabled={isWorking}
              >
                {LANGUAGES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {t(item.nameKey)}
                  </option>
                ))}
              </select>
              {modelWasAdjusted ? (
                <p className="field-note">
                  {t("field_model_switch", {
                    model: t(effectiveModelInfo.nameKey),
                    language: t(getLanguageNameKey(language)),
                  })}
                </p>
              ) : null}
            </div>

            <button
              className="primary-button"
              type="button"
              disabled={!file || isWorking}
              onClick={handleTranscribe}
            >
              {isWorking ? t("button_generating") : t("button_generate")}
            </button>

            {isCaptionMode ? (
              <div className="caption-controls">
                <div className="control-group">
                  <label htmlFor="caption-font">{t("label_font")}</label>
                  <select
                    id="caption-font"
                    value={captionStyle.fontFamily}
                    onChange={(event) =>
                      setCaptionStyle((style) => ({
                        ...style,
                        fontFamily: event.target.value,
                      }))
                    }
                  >
                    {["Arial", "Helvetica", "Inter", "Georgia", "Courier New"].map(
                      (font) => (
                        <option key={font} value={font}>
                          {font}
                        </option>
                      ),
                    )}
                  </select>
                </div>

                <div className="control-grid-2">
                  <div className="control-group">
                    <label htmlFor="caption-size">{t("label_size")}</label>
                    <input
                      id="caption-size"
                      max={48}
                      min={8}
                      onChange={(event) =>
                        setCaptionStyle((style) => ({
                          ...style,
                          fontSize: Number(event.target.value),
                        }))
                      }
                      type="number"
                      value={captionStyle.fontSize}
                    />
                  </div>
                  <div className="control-group">
                    <label htmlFor="caption-color">{t("label_color")}</label>
                    <input
                      id="caption-color"
                      onChange={(event) =>
                        setCaptionStyle((style) => ({
                          ...style,
                          color: event.target.value,
                        }))
                      }
                      type="color"
                      value={captionStyle.color}
                    />
                  </div>
                </div>

                <div className="control-grid-2">
                  <div className="control-group">
                    <label htmlFor="caption-horizontal">{t("label_horizontal")}</label>
                    <select
                      id="caption-horizontal"
                      value={captionStyle.horizontal}
                      onChange={(event) =>
                        setCaptionStyle((style) => ({
                          ...style,
                          horizontal: event.target.value as CaptionStyle["horizontal"],
                        }))
                      }
                    >
                      <option value="left">{t("align_left")}</option>
                      <option value="center">{t("align_center")}</option>
                      <option value="right">{t("align_right")}</option>
                    </select>
                  </div>
                  <div className="control-group">
                    <label htmlFor="caption-vertical">{t("label_vertical")}</label>
                    <select
                      id="caption-vertical"
                      value={captionStyle.vertical}
                      onChange={(event) =>
                        setCaptionStyle((style) => ({
                          ...style,
                          vertical: event.target.value as CaptionStyle["vertical"],
                        }))
                      }
                    >
                      <option value="top">{t("position_top")}</option>
                      <option value="center">{t("position_center")}</option>
                      <option value="bottom">{t("position_bottom")}</option>
                    </select>
                  </div>
                </div>

                <label className="checkbox-row">
                  <input
                    checked={captionStyle.showBackground}
                    onChange={(event) =>
                      setCaptionStyle((style) => ({
                        ...style,
                        showBackground: event.target.checked,
                      }))
                    }
                    type="checkbox"
                  />
                  {t("label_background")}
                </label>

                <button
                  className="primary-button"
                  disabled={!file || !cues.length || isRenderingVideo}
                  onClick={handleRenderCaptionedVideo}
                  type="button"
                >
                  {isRenderingVideo ? t("button_rendering") : t("button_export_captioned")}
                </button>
              </div>
            ) : null}

            <div className="status-block">
              <div className="status-row">
                <span>{displayStatus}</span>
                {modelProgress > 0 && modelProgress < 100 ? (
                  <strong>{modelProgress}%</strong>
                ) : null}
              </div>
              {isWorking ? (
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{ width: `${Math.max(modelProgress, 8)}%` }}
                  />
                </div>
              ) : null}
              {isRenderingVideo ? (
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{ width: `${Math.max(renderProgress, 8)}%` }}
                  />
                </div>
              ) : null}
              {error ? <p className="error-text">{error}</p> : null}
            </div>

            <dl className="meta-grid">
              <div>
                <dt>{t("meta_model")}</dt>
                <dd>{t(modelWasAdjusted ? effectiveModelInfo.nameKey : selectedModel.nameKey)}</dd>
              </div>
              <div>
                <dt>{t("meta_duration")}</dt>
                <dd>{duration ? formatClock(duration) : "--"}</dd>
              </div>
              <div>
                <dt>{t("meta_sample_rate")}</dt>
                <dd>{sourceSampleRate ? `${sourceSampleRate} Hz` : "--"}</dd>
              </div>
              <div>
                <dt>{t("meta_cues")}</dt>
                <dd>{cues.length || "--"}</dd>
              </div>
            </dl>
          </section>

          <section className="panel output-panel">
            <div className="output-header">
              <div>
                <p className="eyebrow">{t("transcript_eyebrow")}</p>
                <h2>{transcript ? t("transcript_ready") : t("transcript_waiting")}</h2>
              </div>
              <div className="button-row">
                <button
                  type="button"
                  disabled={!cues.length}
                  onClick={() =>
                    downloadTextFile(`${baseName}.srt`, srt, "text/plain")
                  }
                >
                  SRT
                </button>
                <button
                  type="button"
                  disabled={!cues.length}
                  onClick={() =>
                    downloadTextFile(`${baseName}.vtt`, vtt, "text/vtt")
                  }
                >
                  VTT
                </button>
              </div>
            </div>

            <textarea
              aria-label="Generated transcript"
              value={transcript}
              onChange={(event) => setTranscript(event.target.value)}
              placeholder={t("transcript_placeholder")}
            />

            {isCaptionMode && videoUrl ? (
              <div className="video-preview">
                <video
                  controls
                  onLoadedMetadata={(event) => {
                    setDuration(event.currentTarget.duration || duration);
                  }}
                  onTimeUpdate={(event) => {
                    setVideoTime(event.currentTarget.currentTime);
                  }}
                  ref={videoRef}
                  src={videoUrl}
                />
                {activeCue ? (
                  <div
                    className={`caption-preview caption-preview-x-${captionStyle.horizontal} caption-preview-y-${captionStyle.vertical}`}
                    style={{
                      color: captionStyle.color,
                      fontFamily: captionStyle.fontFamily,
                      fontSize: `${captionStyle.fontSize}px`,
                    }}
                  >
                    <span
                      style={{
                        background: captionStyle.showBackground
                          ? captionStyle.backgroundColor
                          : "transparent",
                      }}
                    >
                      {activeCue.text}
                    </span>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="cue-list" aria-label="Subtitle cues">
              {cues.length ? (
                cues.map((cue) => (
                  <article className="cue-card" key={cue.id}>
                    <span>{cue.id}</span>
                    <time>
                      {formatClock(cue.start)} - {formatClock(cue.end)}
                    </time>
                    <p>{cue.text}</p>
                  </article>
                ))
              ) : (
                <div className="empty-state">
                  {t("empty_state")}
                </div>
              )}
            </div>
          </section>
        </div>
      </section>

      <section className="privacy-section" id="privacy">
        <div>
          <h2>{t("privacy_title")}</h2>
          <p>{t("privacy_copy")}</p>
        </div>
      </section>
    </main>
  );
}

function shortFile(file: string) {
  const parts = file.split("/");
  return parts[parts.length - 1] || file;
}

function getCompatibleModel(modelId: string, languageId: string) {
  const model = MODELS.find((item) => item.id === modelId) ?? MODELS[0];
  const needsMultilingualModel =
    languageId !== "auto" && languageId !== "english";

  if (needsMultilingualModel && !model.multilingual) {
    return "Xenova/whisper-tiny";
  }

  return model.id;
}

function getLanguageNameKey(languageId: string) {
  return LANGUAGES.find((item) => item.id === languageId)?.nameKey ?? languageId;
}
