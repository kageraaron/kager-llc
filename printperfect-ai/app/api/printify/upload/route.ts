import { NextRequest, NextResponse } from 'next/server';
import { uploadImage } from '@/lib/printify/client';

export const runtime = 'nodejs';
// Max 25MB upload — supports prepped print files at typical canvas resolutions.
export const maxDuration = 30;

/**
 * POST /api/printify/upload
 *
 * Accepts a JSON body: { fileName: string, base64: string }
 *
 * The base64 image is forwarded to Printify's upload endpoint and we return
 * the resulting image id. We never persist the bytes server-side; the request
 * lives only as long as the upstream call.
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
    const result = await uploadImage(body.fileName, body.base64);
    return NextResponse.json({ id: result.id, preview: result.preview_url });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed' },
      { status: 500 },
    );
  }
}
