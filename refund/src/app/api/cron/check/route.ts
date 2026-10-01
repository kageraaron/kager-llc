import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runChecks } from '@/lib/checks';

/** Price checks, drop alerts, reminders and expiry (hourly). */
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  // Fails closed: an unset secret locks the endpoint.
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'not configured' }, { status: 503 });
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const result = await runChecks(createAdminClient());
  return NextResponse.json({ ok: true, ...result });
}
