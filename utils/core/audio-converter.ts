export interface AudioConverterOptions {
  sampleRate?: number;
  channels?: 1 | 2;
  bitDepth?: 8 | 16 | 24 | 32;
  format: 'wav' | 'mp3' | 'ogg' | 'webm';
}

export interface AudioConverterResult {
  blob: Blob;
  duration: number;
  sampleRate: number;
  channels: number;
}

export async function convertAudio(
  file: File,
  options: AudioConverterOptions
): Promise<AudioConverterResult> {
  const audioContext = new AudioContext({ sampleRate: options.sampleRate ?? 44100 });

  try {
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const offlineContext = new OfflineAudioContext(
      options.channels ?? audioBuffer.numberOfChannels,
      audioBuffer.length,
      options.sampleRate ?? audioBuffer.sampleRate
    );

    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineContext.destination);
    source.start(0);

    const renderedBuffer = await offlineContext.startRendering();

    const blob = encodeWav(renderedBuffer);

    return {
      blob,
      duration: renderedBuffer.duration,
      sampleRate: renderedBuffer.sampleRate,
      channels: renderedBuffer.numberOfChannels,
    };
  } finally {
    await audioContext.close();
  }
}

function encodeWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataLength = buffer.length * blockAlign;
  const headerLength = 44;
  const totalLength = headerLength + dataLength;

  const arrayBuffer = new ArrayBuffer(totalLength);
  const view = new DataView(arrayBuffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalLength - 8, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  const channels: Float32Array[] = [];
  for (let i = 0; i < numChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      const value = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, value, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

export function getSupportedAudioMimeTypes(): string[] {
  const audio = new Audio();
  const types: string[] = [];
  const candidates = [
    'audio/wav',
    'audio/mpeg',
    'audio/ogg',
    'audio/webm',
    'audio/mp4',
    'audio/aac',
    'audio/flac',
  ];
  for (const type of candidates) {
    if (audio.canPlayType(type)) {
      types.push(type);
    }
  }
  return types;
}
