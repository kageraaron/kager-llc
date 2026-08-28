import PostalMime from 'postal-mime';

/**
 * Cloudflare Email Worker for Stub.
 *
 * Mail sent to <local-part>@<your inbound domain> lands here. We parse the MIME
 * and POST the useful fields to the app, signed with a shared HMAC secret.
 *
 * Requires the domain's DNS to be on Cloudflare (Email Routing manages the MX
 * records). Free tier: 100k worker requests/day.
 */

export interface Env {
  STUB_INGEST_URL: string;      // https://<app>/api/ingest/forward
  INGEST_WEBHOOK_SECRET: string;
}

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    const parsed = await PostalMime.parse(message.raw);

    const body = JSON.stringify({
      to: message.to,
      from: parsed.from?.address ?? message.from,
      subject: parsed.subject ?? '',
      html: parsed.html ?? '',
      text: parsed.text ?? '',
      receivedAt: parsed.date ?? new Date().toISOString(),
      messageId: parsed.messageId ?? undefined,
    });

    const res = await fetch(env.STUB_INGEST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-stub-signature': await hmacHex(env.INGEST_WEBHOOK_SECRET, body),
      },
      body,
    });

    // Reject on failure so the sender gets a bounce rather than silent loss.
    if (!res.ok) {
      message.setReject(`Stub could not accept this message (${res.status})`);
    }
  },
};
