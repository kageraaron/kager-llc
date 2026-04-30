import { describe, it, expect, vi } from 'vitest';
import { convertMedia } from '../videoConverter';

// Mock FFmpeg
vi.mock('@ffmpeg/ffmpeg', () => {
  const FFmpeg = function() {
    return {
      load: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
      exec: vi.fn().mockResolvedValue(0),
      readFile: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
      deleteFile: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
    };
  };
  return { FFmpeg };
});

vi.mock('@ffmpeg/util', () => ({
  fetchFile: vi.fn().mockResolvedValue(new Uint8Array()),
  toBlobURL: vi.fn().mockResolvedValue('blob:url'),
}));

describe('videoConverter', () => {
  it('converts media files (WAV to MP3)', async () => {
    const file = new File(['audio-content'], 'test.wav', { type: 'audio/wav' });
    const result = await convertMedia(file, 'MP3');
    
    expect(result).toBeInstanceOf(Blob);
    expect(result.type).toBe('audio/mpeg');
  });
});
