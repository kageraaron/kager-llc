import { vi, beforeAll } from 'vitest';

// Mock URL.createObjectURL and revokeObjectURL
beforeAll(() => {
  global.URL.createObjectURL = vi.fn(() => 'mock-url');
  global.URL.revokeObjectURL = vi.fn();
});

// Mock Worker
global.Worker = vi.fn().mockImplementation(() => ({
  postMessage: vi.fn(),
  terminate: vi.fn(),
  onmessage: vi.fn(),
  onerror: vi.fn(),
}));

// Mock heic2any
vi.mock('heic2any', () => ({
  default: vi.fn().mockResolvedValue(new Blob(['mock-heic'], { type: 'image/png' })),
}));

// Mock drawImage to return early and avoid JSDOM errors
if (typeof CanvasRenderingContext2D !== 'undefined') {
  CanvasRenderingContext2D.prototype.drawImage = vi.fn().mockImplementation(function() {
    return;
  });
}

// Better Mock FileReader
class MockFileReader {
  onload: any = null;
  onerror: any = null;
  readAsDataURL(file: File) {
    setTimeout(() => {
      if (this.onload) {
        this.onload({ target: { result: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' } });
      }
    }, 0);
  }
}
global.FileReader = MockFileReader as any;

// Better Mock Image
class MockImage {
  onload: any = null;
  onerror: any = null;
  _src: string = '';
  width: number = 100;
  height: number = 100;

  constructor() {
    setTimeout(() => {
      if (this.onload) this.onload();
    }, 0);
  }

  set src(val: string) { this._src = val; }
  get src() { return this._src; }
}
global.Image = MockImage as any;

// Mock Canvas toBlob
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) {
    const blob = new Blob(['mock-blob'], { type: type || 'image/png' });
    setTimeout(() => callback(blob), 0);
  };
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    drawImage: vi.fn(),
    fillRect: vi.fn(),
  });
}
