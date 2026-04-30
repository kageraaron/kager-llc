import { describe, it, expect, vi } from 'vitest';
import { convertImage } from '../imageConverter';

describe('imageConverter', () => {
  const createMockFile = (name: string, type: string) => {
    return new File(['mock content'], name, { type });
  };

  it('converts a standard image (PNG to JPG)', async () => {
    // Mocking the behavior of Image and FileReader is complex in JSDOM, 
    // but we can at least check if the function handles the flow.
    const file = createMockFile('test.png', 'image/png');
    
    // We expect the promise to resolve eventually
    const result = await convertImage(file, 'JPG');
    expect(result).toBeInstanceOf(Blob);
    expect(result.type).toBe('image/jpeg');
  });

  it('handles SVG conversion', async () => {
    const file = createMockFile('test.svg', 'image/svg+xml');
    const result = await convertImage(file, 'PNG');
    expect(result).toBeInstanceOf(Blob);
    expect(result.type).toBe('image/png');
  });
});
