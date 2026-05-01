import { NextRequest, NextResponse } from 'next/server';
import { uploadFile } from '@/lib/printful/client';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * POST /api/printful/upload
 *
 * Accepts JSON body: { fileName: string, base64: string }
 * Streams the image through to Printful's /files endpoint and returns the
 * resulting file id (which references the image in subsequent order calls).
 * The bytes are not persisted server-side.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { fileName?: string; base64?: string };
    if (!body.fileName || !body.base64) {
      return NextResponse.json(
        { error: 'fileName and base64 are required' },
        { status: 400 },
      );
    }
    const result = await uploadFile(body.fileName, body.base64);
    return NextResponse.json({ id: result.id, preview: result.preview_url });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed' },
      { status: 500 },
    );
  }
}
