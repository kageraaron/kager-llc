import heic2any from 'heic2any';
export type ImageFormat = 'PNG' | 'JPG' | 'WEBP' | 'HEIC' | 'SVG' | 'TIFF';

export async function convertImage(
  file: File,
  targetFormat: ImageFormat,
  quality: number = 0.9
): Promise<Blob> {
  const fileName = file.name.toLowerCase();
  const fileType = file.type;

  // Handle HEIC
  if (fileName.endsWith('.heic') || fileType === 'image/heic') {
    const blob = await heic2any({
      blob: file,
      toType: `image/${targetFormat.toLowerCase() === 'jpg' ? 'jpeg' : targetFormat.toLowerCase()}`,
      quality: quality
    });
    return Array.isArray(blob) ? blob[0] : blob;
  }

  // Handle SVG to Raster
  if (fileName.endsWith('.svg') || fileType === 'image/svg+xml') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width || 800;
          canvas.height = img.height || 600;
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject(new Error('Canvas context failed'));
          ctx.drawImage(img, 0, 0);
          canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('SVG conversion failed'));
          }, `image/${targetFormat === 'JPG' ? 'jpeg' : targetFormat.toLowerCase()}`, quality);
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  }

  // Handle standard formats (TIFF, PNG, JPG, WebP) via Canvas
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
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
        
        let mimeType = `image/${targetFormat.toLowerCase()}`;
        if (targetFormat === 'JPG') mimeType = 'image/jpeg';
        
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Canvas toBlob failed'));
          },
          mimeType,
          quality
        );
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = event.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}
