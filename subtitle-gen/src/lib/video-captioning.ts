import { SubtitleCue, getActiveCue } from "@/lib/subtitles";

export type CaptionStyle = {
  fontFamily: string;
  fontSize: number;
  color: string;
  backgroundColor: string;
  showBackground: boolean;
  horizontal: "left" | "center" | "right";
  vertical: "top" | "center" | "bottom";
};

type RenderOptions = {
  file: File;
  cues: SubtitleCue[];
  style: CaptionStyle;
  filename: string;
  onProgress: (progress: number) => void;
};

type CaptureVideo = HTMLVideoElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

export async function renderCaptionedVideo({
  file,
  cues,
  style,
  filename,
  onProgress,
}: RenderOptions) {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video") as CaptureVideo;
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  try {
    await waitForVideoMetadata(video);
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not start canvas renderer.");

    const canvasStream = canvas.captureStream(30);
    const mediaStream = getVideoStream(video);
    mediaStream?.getAudioTracks().forEach((track) => canvasStream.addTrack(track));

    const mimeType = pickRecordingMimeType();
    const recorder = new MediaRecorder(
      canvasStream,
      mimeType ? { mimeType } : undefined,
    );
    const chunks: BlobPart[] = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };

    const completion = new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        resolve(new Blob(chunks, { type: recorder.mimeType || "video/webm" }));
      };
    });

    video.currentTime = 0;
    await video.play();
    recorder.start(250);

    await drawUntilEnded(video, context, canvas, cues, style, onProgress);
    if (recorder.state !== "inactive") recorder.stop();

    const blob = await completion;
    const extension = recorder.mimeType.includes("mp4") ? "mp4" : "webm";
    downloadBlob(`${filename}-captioned.${extension}`, blob);
  } finally {
    video.pause();
    URL.revokeObjectURL(url);
  }
}

export function drawCaptionPreview(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  cues: SubtitleCue[],
  style: CaptionStyle,
) {
  const context = canvas.getContext("2d");
  if (!context || !video.videoWidth || !video.videoHeight) return;

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  drawCaption(context, canvas, getActiveCue(cues, video.currentTime)?.text ?? "", style);
}

async function drawUntilEnded(
  video: HTMLVideoElement,
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  cues: SubtitleCue[],
  style: CaptionStyle,
  onProgress: (progress: number) => void,
) {
  return new Promise<void>((resolve) => {
    const drawFrame = () => {
      if (video.ended || video.paused) {
        onProgress(100);
        resolve();
        return;
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      drawCaption(
        context,
        canvas,
        getActiveCue(cues, video.currentTime)?.text ?? "",
        style,
      );
      onProgress(Math.min(99, (video.currentTime / video.duration) * 100));
      requestAnimationFrame(drawFrame);
    };

    drawFrame();
  });
}

function drawCaption(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  text: string,
  style: CaptionStyle,
) {
  if (!text.trim()) return;

  const scale = Math.max(1, canvas.width / 720);
  const fontSize = Math.max(8, style.fontSize * scale);
  const padding = Math.round(10 * scale);
  const maxWidth = canvas.width * 0.86;
  const lineHeight = fontSize * 1.28;
  const lines = wrapText(context, text, maxWidth, `${fontSize}px ${style.fontFamily}`);
  const textWidth = Math.max(...lines.map((line) => context.measureText(line).width));
  const blockWidth =
    style.horizontal === "center" ? maxWidth : Math.min(maxWidth, textWidth);
  const blockHeight = lines.length * lineHeight;
  const x = getX(canvas.width, blockWidth, style.horizontal);
  const y = getY(canvas.height, blockHeight, style.vertical);

  context.font = `700 ${fontSize}px ${style.fontFamily}`;
  context.textBaseline = "top";
  context.textAlign = "left";

  if (style.showBackground) {
    context.fillStyle = style.backgroundColor;
    roundRect(
      context,
      x - padding,
      y - padding,
      blockWidth + padding * 2,
      blockHeight + padding * 2,
      Math.round(8 * scale),
    );
    context.fill();
  }

  context.fillStyle = style.color;
  context.strokeStyle = style.showBackground ? "transparent" : "rgba(0, 0, 0, 0.55)";
  context.lineWidth = Math.max(2, fontSize / 10);

  lines.forEach((line, index) => {
    const lineWidth = context.measureText(line).width;
    const lineX =
      style.horizontal === "center"
        ? x + (blockWidth - lineWidth) / 2
        : style.horizontal === "right"
          ? x + blockWidth - lineWidth
          : x;
    const lineY = y + index * lineHeight;
    if (!style.showBackground) context.strokeText(line, lineX, lineY);
    context.fillText(line, lineX, lineY);
  });
}

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  font: string,
) {
  context.font = `700 ${font}`;
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (context.measureText(next).width <= maxWidth || !line) {
      line = next;
    } else {
      lines.push(line);
      line = word;
    }
  }

  if (line) lines.push(line);
  return lines.slice(0, 3);
}

function getX(width: number, blockWidth: number, horizontal: CaptionStyle["horizontal"]) {
  if (horizontal === "left") return width * 0.07;
  if (horizontal === "right") return width - width * 0.07 - blockWidth;
  return width * 0.07;
}

function getY(height: number, blockHeight: number, vertical: CaptionStyle["vertical"]) {
  if (vertical === "top") return height * 0.1;
  if (vertical === "center") return (height - blockHeight) / 2;
  return height - height * 0.14 - blockHeight;
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function waitForVideoMetadata(video: HTMLVideoElement) {
  return new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Could not load video file."));
  });
}

function getVideoStream(video: CaptureVideo) {
  return video.captureStream?.() ?? video.mozCaptureStream?.() ?? null;
}

function pickRecordingMimeType() {
  const types = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];

  return types.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
