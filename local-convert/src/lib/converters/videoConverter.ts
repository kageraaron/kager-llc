import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;

export async function getFFmpeg() {
  if (ffmpeg) return ffmpeg;

  ffmpeg = new FFmpeg();
  
  // Load ffmpeg.wasm from CDN for better performance and smaller bundle size
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  return ffmpeg;
}

export async function convertMedia(
  file: File,
  targetFormat: string,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  const ffmpeg = await getFFmpeg();
  
  const inputName = 'input' + file.name.substring(file.name.lastIndexOf('.'));
  const outputName = `output.${targetFormat.toLowerCase()}`;

  await ffmpeg.writeFile(inputName, await fetchFile(file));

  if (onProgress) {
    ffmpeg.on('progress', ({ progress }) => {
      onProgress(progress * 100);
    });
  }

  // Execute conversion with optimized flags
  let args: string[] = [];
  
  if (targetFormat === 'MP3') {
    args = ['-i', inputName, '-vn', '-acodec', 'libmp3lame', '-q:a', '2', outputName];
  } else if (targetFormat === 'GIF') {
    // High-quality GIF conversion using a color palette
    const paletteName = 'palette.png';
    await ffmpeg.exec(['-i', inputName, '-vf', 'fps=15,scale=480:-1:flags=lanczos,palettegen', paletteName]);
    args = ['-i', inputName, '-i', paletteName, '-filter_complex', 'fps=15,scale=480:-1:flags=lanczos[x];[x][1:v]paletteuse', outputName];
  } else if (targetFormat === 'MP4') {
    if (file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif')) {
      // GIF to MP4 requires specific pixel format for compatibility
      args = ['-i', inputName, '-movflags', 'faststart', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', outputName];
    } else {
      args = ['-i', inputName, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', '-movflags', 'faststart', outputName];
    }
  } else {
    args = ['-i', inputName, outputName];
  }

  await ffmpeg.exec(args);

  const data = await ffmpeg.readFile(outputName);
  const mimeType = targetFormat === 'MP3' ? 'audio/mpeg' : (targetFormat === 'GIF' ? 'image/gif' : 'video/mp4');
  const blob = new Blob([data as any], { type: mimeType });

  // Cleanup
  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile(outputName);
  try { await ffmpeg.deleteFile('palette.png'); } catch(e) {}

  return blob;
}
