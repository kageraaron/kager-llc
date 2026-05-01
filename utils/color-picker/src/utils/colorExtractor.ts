export const rgbToHex = (r: number, g: number, b: number): string => {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
};

export const getMedianColors = (imageElement: HTMLImageElement): { hex: string, rgb: string }[] => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  // Downscale for performance
  canvas.width = 100;
  canvas.height = 100;
  ctx.drawImage(imageElement, 0, 0, canvas.width, canvas.height);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const colorMap: Record<string, number> = {};

  for (let i = 0; i < imageData.length; i += 4) {
    const r = Math.round(imageData[i] / 40) * 40;
    const g = Math.round(imageData[i + 1] / 40) * 40;
    const b = Math.round(imageData[i + 2] / 40) * 40;
    const key = `${r},${g},${b}`;
    colorMap[key] = (colorMap[key] || 0) + 1;
  }

  return Object.entries(colorMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([key]) => {
      const [r, g, b] = key.split(',').map(Number);
      return { hex: rgbToHex(r, g, b), rgb: `rgb(${r}, ${g}, ${b})` };
    });
};

export const sampleColorAt = (imageElement: HTMLImageElement, x: number, y: number): { hex: string, rgb: string } => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return { hex: '#000000', rgb: 'rgb(0, 0, 0)' };

  canvas.width = imageElement.width;
  canvas.height = imageElement.height;
  ctx.drawImage(imageElement, 0, 0);

  // Calculate the scale factor if the displayed image size differs from natural size
  const scaleX = imageElement.naturalWidth / imageElement.clientWidth;
  const scaleY = imageElement.naturalHeight / imageElement.clientHeight;

  const pixelData = ctx.getImageData(x * scaleX, y * scaleY, 1, 1).data;
  const [r, g, b] = pixelData;

  return { hex: rgbToHex(r, g, b), rgb: `rgb(${r}, ${g}, ${b})` };
};

export const extractColors = (imageElement: HTMLImageElement): { hex: string, rgb: string }[] => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  canvas.width = imageElement.width;
  canvas.height = imageElement.height;
  ctx.drawImage(imageElement, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  
  // Simple extraction: Take a sample point in the middle or process top pixels
  // For now, let's take a single representative color
  const r = imageData[0];
  const g = imageData[1];
  const b = imageData[2];

  return [{ hex: rgbToHex(r, g, b), rgb: `rgb(${r}, ${g}, ${b})` }];
};
