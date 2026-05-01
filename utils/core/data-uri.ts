export interface DataUriResult {
  dataUri: string;
  mimeType: string;
  size: number;
  base64Length: number;
  originalSize: number;
  overheadPercent: number;
}

export async function fileToDataUri(file: File): Promise<DataUriResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = btoa(
        new Uint8Array(reader.result as ArrayBuffer).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          ''
        )
      );
      const mimeType = file.type || 'application/octet-stream';
      const dataUri = `data:${mimeType};base64,${base64}`;
      const originalSize = file.size;
      const dataUriSize = dataUri.length;
      const overhead = originalSize > 0 ? Math.round(((dataUriSize - originalSize) / originalSize) * 100) : 0;

      resolve({
        dataUri,
        mimeType,
        size: dataUriSize,
        base64Length: base64.length,
        originalSize,
        overheadPercent: overhead,
      });
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

export async function imageToDataUri(file: File, maxWidth?: number, quality?: number): Promise<DataUriResult> {
  if (!file.type.startsWith('image/')) {
    return fileToDataUri(file);
  }

  if (!maxWidth && quality === undefined) {
    return fileToDataUri(file);
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (maxWidth && width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);

      const mimeType = quality !== undefined ? 'image/jpeg' : file.type;
      const dataUri = canvas.toDataURL(mimeType, quality ?? 0.92);
      const originalSize = file.size;
      const dataUriSize = dataUri.length;
      const overhead = originalSize > 0 ? Math.round(((dataUriSize - originalSize) / originalSize) * 100) : 0;
      const base64 = dataUri.split(',')[1];

      resolve({
        dataUri,
        mimeType,
        size: dataUriSize,
        base64Length: base64.length,
        originalSize,
        overheadPercent: overhead,
      });
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

export function dataUriToFile(dataUri: string, filename?: string): File {
  const matches = dataUri.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) {
    throw new Error('Invalid data URI format');
  }

  const mimeType = matches[1];
  const base64 = matches[2];
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const ext = mimeType.split('/').pop() || 'bin';
  const name = filename || `file.${ext}`;

  return new File([bytes], name, { type: mimeType });
}

export function parseDataUri(dataUri: string): { mimeType: string; base64: string } | null {
  const matches = dataUri.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) return null;
  return { mimeType: matches[1], base64: matches[2] };
}

export function getDataUriSize(dataUri: string): number {
  return dataUri.length;
}

export function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1048576) return `${(size / 1024).toFixed(2)} KB`;
  if (size < 1073741824) return `${(size / 1048576).toFixed(2)} MB`;
  return `${(size / 1073741824).toFixed(2)} GB`;
}
