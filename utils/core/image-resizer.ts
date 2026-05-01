export interface ResizeOptions {
  width?: number;
  height?: number;
  maintainAspectRatio?: boolean;
  mode?: 'fit' | 'fill' | 'crop';
}

export interface ResizeResult {
  blob: Blob;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
}

export function calculateDimensions(
  originalWidth: number,
  originalHeight: number,
  options: ResizeOptions
): { width: number; height: number } {
  const aspectRatio = originalWidth / originalHeight;
  let targetWidth = options.width ?? 0;
  let targetHeight = options.height ?? 0;

  if (options.maintainAspectRatio) {
    if (targetWidth && !targetHeight) {
      targetHeight = Math.round(targetWidth / aspectRatio);
    } else if (!targetWidth && targetHeight) {
      targetWidth = Math.round(targetHeight * aspectRatio);
    } else if (targetWidth && targetHeight) {
      if (options.mode === 'fit') {
        const widthRatio = targetWidth / originalWidth;
        const heightRatio = targetHeight / originalHeight;
        const ratio = Math.min(widthRatio, heightRatio);
        targetWidth = Math.round(originalWidth * ratio);
        targetHeight = Math.round(originalHeight * ratio);
      }
    }
  }

  if (!targetWidth) targetWidth = Math.round(originalHeight * aspectRatio);
  if (!targetHeight) targetHeight = Math.round(targetWidth / aspectRatio);

  return { width: targetWidth, height: targetHeight };
}

export async function resizeImage(
  file: File,
  options: ResizeOptions
): Promise<ResizeResult> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const { width, height } = calculateDimensions(img.width, img.height, options);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      if (options.mode === 'fill') {
        ctx.drawImage(img, 0, 0, width, height);
      } else if (options.mode === 'crop' && options.maintainAspectRatio) {
        const sourceAspect = img.width / img.height;
        const targetAspect = width / height;
        let sx = 0, sy = 0, sw = img.width, sh = img.height;
        if (sourceAspect > targetAspect) {
          sw = img.height * targetAspect;
          sx = (img.width - sw) / 2;
        } else {
          sh = img.width / targetAspect;
          sy = (img.height - sh) / 2;
        }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
      } else {
        ctx.drawImage(img, 0, 0, width, height);
      }

      canvas.toBlob((blob) => {
        if (blob) {
          resolve({
            blob,
            width,
            height,
            originalWidth: img.width,
            originalHeight: img.height,
          });
        } else {
          reject(new Error('Failed to create blob'));
        }
      }, file.type || 'image/png');
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

export function getCommonSizes(): { label: string; width: number; height: number }[] {
  return [
    { label: 'Thumbnail (150x150)', width: 150, height: 150 },
    { label: 'Social Media Post (1080x1080)', width: 1080, height: 1080 },
    { label: 'Facebook Cover (820x312)', width: 820, height: 312 },
    { label: 'Twitter Header (1500x500)', width: 1500, height: 500 },
    { label: 'Instagram Story (1080x1920)', width: 1080, height: 1920 },
    { label: 'YouTube Thumbnail (1280x720)', width: 1280, height: 720 },
    { label: 'LinkedIn Banner (1584x396)', width: 1584, height: 396 },
    { label: 'Favicon (32x32)', width: 32, height: 32 },
    { label: 'HD (1920x1080)', width: 1920, height: 1080 },
    { label: '4K (3840x2160)', width: 3840, height: 2160 },
  ];
}
