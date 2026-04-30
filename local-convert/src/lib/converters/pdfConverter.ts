import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { convertImage } from './imageConverter';

// Initialize PDF.js worker
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
}

export async function convertPdfToImages(file: File, format: 'JPG' | 'PNG'): Promise<Blob[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const imageBlobs: Blob[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) continue;

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({ canvasContext: context, viewport }).promise;

    const blob = await new Promise<Blob | null>((resolve) => 
      canvas.toBlob(resolve, `image/${format === 'JPG' ? 'jpeg' : 'png'}`, 0.9)
    );
    
    if (blob) imageBlobs.push(blob);
  }

  return imageBlobs;
}

async function normalizeImageToPng(file: File): Promise<ArrayBuffer> {
  // Use the robust convertImage utility to get a standard PNG
  // This handles HEIC, SVG, TIFF, and cleans up strict JPEG issues
  const blob = await convertImage(file, 'PNG');
  return await blob.arrayBuffer();
}

export async function convertImagesToPdf(files: File[]): Promise<Blob> {
  const pdfDoc = await PDFDocument.create();

  for (const file of files) {
    // Standardize all images to PNG to ensure compatibility with pdf-lib
    const pngBytes = await normalizeImageToPng(file);
    const image = await pdfDoc.embedPng(pngBytes);

    const page = pdfDoc.addPage([image.width, image.height]);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: image.width,
      height: image.height,
    });
  }

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes as any], { type: 'application/pdf' });
}
