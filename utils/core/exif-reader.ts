export interface ExifData {
  [key: string]: string | number | boolean | undefined;
  Make?: string;
  Model?: string;
  DateTime?: string;
  DateTimeOriginal?: string;
  Orientation?: number;
  ExposureTime?: string;
  FNumber?: string;
  ISO?: number;
  FocalLength?: string;
  Flash?: boolean;
  WhiteBalance?: string;
  ExposureProgram?: string;
  MeteringMode?: string;
  GPSLatitude?: string;
  GPSLongitude?: string;
  GPSAltitude?: string;
  ImageWidth?: number;
  ImageHeight?: number;
  Software?: string;
  Copyright?: string;
  Artist?: string;
}

const EXIF_TAGS: Record<number, keyof ExifData> = {
  0x010f: 'Make',
  0x0110: 'Model',
  0x0112: 'Orientation',
  0x0131: 'Software',
  0x013b: 'Artist',
  0x8298: 'Copyright',
  0x9003: 'DateTimeOriginal',
  0x9004: 'DateTime',
  0x829a: 'ExposureTime',
  0x829d: 'FNumber',
  0x8827: 'ISO',
  0x920a: 'FocalLength',
  0xa40c: 'Flash',
  0xa403: 'WhiteBalance',
  0x8822: 'ExposureProgram',
  0x9207: 'MeteringMode',
  0xa002: 'ImageWidth',
  0xa003: 'ImageHeight',
};

function readString(view: DataView, offset: number, length: number): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    const char = view.getUint8(offset + i);
    if (char === 0) break;
    result += String.fromCharCode(char);
  }
  return result.trim();
}

function readExifValue(
  view: DataView,
  offset: number,
  tagType: number,
  count: number,
  littleEndian: boolean
): string | number | undefined {
  const readFn = littleEndian ? view.getUint16.bind(view) : view.getUint16.bind(view);
  const readUint32 = littleEndian ? view.getUint32.bind(view) : view.getUint32.bind(view);

  switch (tagType) {
    case 2:
    case 7:
      if (count > 4) {
        const strOffset = readUint32(offset + 8, littleEndian);
        return readString(view, strOffset, count);
      }
      return readString(view, offset + 8, count);
    case 3:
      return readFn(offset + 8, littleEndian);
    case 4:
      return readUint32(offset + 8, littleEndian);
    case 5: {
      const numOffset = readUint32(offset + 8, littleEndian);
      const numerator = view.getUint32(numOffset, littleEndian);
      const denominator = view.getUint32(numOffset + 4, littleEndian);
      return denominator ? `${numerator}/${denominator}` : `${numerator}`;
    }
    case 10: {
      const numOffset2 = readUint32(offset + 8, littleEndian);
      const num = view.getInt32(numOffset2, littleEndian);
      const den = view.getInt32(numOffset2 + 4, littleEndian);
      return den ? num / den : num;
    }
    default:
      return undefined;
  }
}

export function parseExif(file: File): Promise<ExifData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const view = new DataView(reader.result as ArrayBuffer);
        if (view.getUint16(0) !== 0xffd8) {
          resolve({});
          return;
        }

        let offset = 2;
        while (offset < view.byteLength) {
          if (view.getUint8(offset) !== 0xff) {
            offset++;
            continue;
          }
          const marker = view.getUint8(offset + 1);
          if (marker === 0xe1) {
            const length = view.getUint16(offset + 2);
            if (readString(view, offset + 4, 4) !== 'Exif') {
              resolve({});
              return;
            }

            const tiffStart = offset + 10;
            const littleEndian = view.getUint16(tiffStart) === 0x4949;

            const ifd0Offset = view.getUint32(tiffStart + 4, littleEndian);
            const exifData: ExifData = {};

            function parseIFD(ifdOffset: number) {
              const numEntries = view.getUint16(tiffStart + ifdOffset, littleEndian);
              for (let i = 0; i < numEntries; i++) {
                const entryOffset = tiffStart + ifdOffset + 2 + i * 12;
                const tag = view.getUint16(entryOffset, littleEndian);
                const tagType = view.getUint16(entryOffset + 2, littleEndian);
                const count = view.getUint32(entryOffset + 4, littleEndian);

                const key = EXIF_TAGS[tag];
                if (key) {
                  const value = readExifValue(view, entryOffset, tagType, count, littleEndian);
                  if (value !== undefined) {
                    exifData[key] = value;
                  }
                }
              }
            }

            parseIFD(ifd0Offset);
            resolve(exifData);
            return;
          }

          const segmentLength = view.getUint16(offset + 2);
          offset += 2 + segmentLength;
        }
        resolve({});
      } catch {
        resolve({});
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

export function removeExif(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to create blob'));
        },
        'image/jpeg',
        0.92
      );
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}
