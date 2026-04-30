import { describe, it, expect, vi } from 'vitest';
import { convertImagesToPdf } from '../pdfConverter';

// Mock pdf-lib
vi.mock('pdf-lib', () => ({
  PDFDocument: {
    create: vi.fn().mockResolvedValue({
      addPage: vi.fn().mockReturnValue({
        drawImage: vi.fn(),
      }),
      embedPng: vi.fn().mockResolvedValue({ width: 100, height: 100 }),
      save: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    }),
  },
}));

// Mock pdfjs-dist
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: vi.fn(),
  version: 'mock-version',
}));

describe('pdfConverter', () => {
  it('converts images to PDF', async () => {
    const file = new File(['image-content'], 'test.png', { type: 'image/png' });
    const result = await convertImagesToPdf([file]);
    
    expect(result).toBeInstanceOf(Blob);
    expect(result.type).toBe('application/pdf');
  });
});
