import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { scanAll } from '@/lib/scan';

/** Read new order and booking emails (every 30 minutes). */
export const maxDuration = 3000;

export async function GET(request: NextRequest) {
  // Fails closed: an unset secret locks the endpoint.
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'not configured' }, { status: 503 });
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  // `?reread=330`: read that many days again with the current readers. Known
  // purchases only gain what they were missing; decisions are never reset.
  const reread = Number(request.nextUrl.searchParams.get('reread'));
  const result = await scanAll(
    createAdminClient(),
    Number.isInteger(reread) && reread > 0 && reread <= 2000 ? { rereadDays: reread, maxPerAccount: 600 } : {},
  );
  return NextResponse.json({ ok: true, ...result });
}
