import { NextResponse, type NextRequest } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { ingestEmail } from '@/lib/ingest/pipeline';

/**
 * Webhook for the Cloudflare Email Worker.
 *
 * The worker receives mail at <local-part>@<INBOUND_EMAIL_DOMAIN>, parses the
 * MIME with postal-mime, and POSTs the extracted fields here. That path needs
 * no OAuth and no Google review, so it works with any mail provider - it is
 * both the fallback for non-Gmail users and the manual "forward me this one"
 * escape hatch.
 *
 * Gated on FEATURE_FORWARD_INBOX until a domain is on Cloudflare.
 */

export const maxDuration = 30;

interface ForwardPayload {
  to: string;
  from: string;
  subject: string;
  html?: string;
  text?: string;
  receivedAt?: string;
  messageId?: string;
}

/** Constant-time HMAC-SHA256 comparison over the raw body. */
function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.INGEST_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  if (process.env.FEATURE_FORWARD_INBOX !== 'true') {
    return NextResponse.json({ error: 'forward inbox disabled' }, { status: 503 });
  }

  const rawBody = await request.text();
  if (!verifySignature(rawBody, request.headers.get('x-stub-signature'))) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  }

  let payload: ForwardPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  // Route to the owning user by the local part of the destination address.
  const localPart = payload.to?.split('@')[0]?.toLowerCase().trim();
  if (!localPart) return NextResponse.json({ error: 'missing recipient' }, { status: 400 });

  const admin = createAdminClient();
  const { data: address } = await admin
    .from('inbound_addresses')
    .select('user_id')
    .eq('local_part', localPart)
    .maybeSingle();

  // Unknown address: accept and drop. Returning 404 would let a sender probe
  // which addresses exist.
  if (!address) return NextResponse.json({ ok: true, status: 'unknown_recipient' });

  const outcome = await ingestEmail(
    admin,
    address.user_id,
    {
      from: payload.from,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      receivedAt: payload.receivedAt,
      providerMsgId: payload.messageId,
    },
    { source: 'forward' },
  );

  return NextResponse.json({ ok: true, outcome: outcome.status });
}
