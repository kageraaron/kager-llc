export const TARGET_SAMPLE_RATE = 16_000;

export type DecodedAudio = {
  samples: Float32Array;
  duration: number;
  sourceSampleRate: number;
};

export async function decodeAudioFile(file: File): Promise<DecodedAudio> {
  const buffer = await file.arrayBuffer();
  const audioContext = new AudioContext();

  try {
    const decoded = await audioContext.decodeAudioData(buffer.slice(0));
    const mono = mixToMono(decoded);
    const samples =
      decoded.sampleRate === TARGET_SAMPLE_RATE
        ? mono
        : resampleLinear(mono, decoded.sampleRate, TARGET_SAMPLE_RATE);

    return {
      samples,
      duration: decoded.duration,
      sourceSampleRate: decoded.sampleRate,
    };
  } finally {
    await audioContext.close();
  }
}

function mixToMono(buffer: AudioBuffer): Float32Array {
  const channelCount = buffer.numberOfChannels;
  const output = new Float32Array(buffer.length);

  for (let channel = 0; channel < channelCount; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i += 1) {
      output[i] += data[i] / channelCount;
    }
  }

  return output;
}

function resampleLinear(
  input: Float32Array,
  sourceRate: number,
  targetRate: number,
): Float32Array {
  const ratio = sourceRate / targetRate;
  const length = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(length);

  for (let i = 0; i < length; i += 1) {
    const sourceIndex = i * ratio;
    const leftIndex = Math.floor(sourceIndex);
    const rightIndex = Math.min(leftIndex + 1, input.length - 1);
    const weight = sourceIndex - leftIndex;
    output[i] = input[leftIndex] * (1 - weight) + input[rightIndex] * weight;
  }

  return output;
}
