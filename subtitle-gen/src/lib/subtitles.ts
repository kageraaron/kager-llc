export type Timestamp = [number, number | null];

export type TranscriptChunk = {
  text: string;
  timestamp: Timestamp;
};

export type SubtitleCue = {
  id: number;
  start: number;
  end: number;
  text: string;
};

const MAX_CUE_SECONDS = 6;
const MAX_CUE_CHARS = 84;
const MIN_CUE_SECONDS = 1.2;

export function chunksToCues(
  chunks: TranscriptChunk[],
  fallbackText: string,
  duration: number,
): SubtitleCue[] {
  if (!chunks.length) {
    const text = fallbackText.trim();
    return text
      ? [{ id: 1, start: 0, end: Math.max(duration, MIN_CUE_SECONDS), text }]
      : [];
  }

  const cues: SubtitleCue[] = [];
  let current: Omit<SubtitleCue, "id"> | null = null;

  for (const chunk of chunks) {
    const text = normalizeWhitespace(chunk.text);
    if (!text) continue;

    const [rawStart, rawEnd] = chunk.timestamp;
    const start = clampTime(rawStart ?? current?.end ?? 0, duration);
    const end = clampTime(rawEnd ?? start + estimateDuration(text), duration);

    if (!current) {
      current = { start, end: Math.max(end, start + 0.4), text };
      continue;
    }

    const combined = `${current.text} ${text}`.trim();
    const wouldBeTooLong =
      combined.length > MAX_CUE_CHARS ||
      Math.max(end, current.end) - current.start > MAX_CUE_SECONDS ||
      /[.!?]$/.test(current.text);

    if (wouldBeTooLong && current.end - current.start >= MIN_CUE_SECONDS) {
      cues.push({ id: cues.length + 1, ...current });
      current = { start, end: Math.max(end, start + 0.4), text };
    } else {
      current = {
        ...current,
        end: Math.max(current.end, end),
        text: combined,
      };
    }
  }

  if (current) cues.push({ id: cues.length + 1, ...current });

  return cues.map((cue, index) => ({
    ...cue,
    id: index + 1,
    start: roundTime(cue.start),
    end: roundTime(Math.max(cue.end, cue.start + 0.4)),
  }));
}

export function toSrt(cues: SubtitleCue[]): string {
  return cues
    .map(
      (cue) =>
        `${cue.id}\n${formatTimestamp(cue.start, ",")} --> ${formatTimestamp(
          cue.end,
          ",",
        )}\n${cue.text}`,
    )
    .join("\n\n");
}

export function toVtt(cues: SubtitleCue[]): string {
  const body = cues
    .map(
      (cue) =>
        `${formatTimestamp(cue.start, ".")} --> ${formatTimestamp(
          cue.end,
          ".",
        )}\n${cue.text}`,
    )
    .join("\n\n");

  return `WEBVTT\n\n${body}`;
}

export function downloadTextFile(
  filename: string,
  text: string,
  mimeType: string,
) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function formatClock(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function getActiveCue(cues: SubtitleCue[], seconds: number) {
  return cues.find((cue) => seconds >= cue.start && seconds <= cue.end) ?? null;
}

function formatTimestamp(seconds: number, separator: "," | "."): string {
  const safeSeconds = Math.max(0, seconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const wholeSeconds = Math.floor(safeSeconds % 60);
  const milliseconds = Math.round((safeSeconds % 1) * 1000);

  return [
    hours.toString().padStart(2, "0"),
    minutes.toString().padStart(2, "0"),
    wholeSeconds.toString().padStart(2, "0"),
  ].join(":") + `${separator}${milliseconds.toString().padStart(3, "0")}`;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function estimateDuration(text: string): number {
  return Math.max(MIN_CUE_SECONDS, text.length / 15);
}

function clampTime(time: number, duration: number): number {
  if (!Number.isFinite(time)) return 0;
  return Math.min(Math.max(time, 0), Math.max(duration, 0));
}

function roundTime(time: number): number {
  return Math.round(time * 1000) / 1000;
}
