import { ALL_SENDER_DOMAINS } from '@/lib/policies';

/**
 * Gmail API client, copied from Stub's. Refund reads with the same Google
 * client and the same stored tokens (public.email_accounts); only the search
 * differs.
 *
 * SCOPE NOTE: `gmail.readonly` is a RESTRICTED scope. In production it requires
 * Google OAuth verification plus an annual CASA Tier 2 security assessment.
 * Stub deliberately stays in OAuth "Testing" mode, which permits restricted
 * scopes for up to 100 explicitly listed test users with no assessment. That is
 * a hard cap: going past 100 users means going through verification.
 */

export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'openid',
  'email',
  'profile',
].join(' ');

/** Google's own cap on test users while the OAuth consent screen is in Testing. */
export const GOOGLE_TESTING_USER_CAP = 100;

const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

interface GmailHeader { name: string; value: string }
interface GmailPart {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
}
export interface GmailMessage {
  id: string;
  threadId: string;
  internalDate?: string;
  payload?: GmailPart;
}

export async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`Google token refresh failed (${res.status}): ${await res.text()}`);
  return res.json() as Promise<{ access_token: string; expires_in: number }>;
}

async function gapi<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Gmail ${res.status} on ${path}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

/**
 * The search for order and booking emails.
 *
 * Senders carry it: subject words alone match too much marketing. `days` is
 * how far back to look: 60 covers every store window (Best Buy's longest is
 * 60), and a first scan for travel goes back about 11 months, because a
 * flight or a refundable hotel can be booked that far ahead and still be
 * claimable.
 */
export function buildPurchaseQuery(days: number): string {
  const senders = ALL_SENDER_DOMAINS.map((d) => `from:${d}`).join(' OR ');
  return `newer_than:${days}d (${senders}) -category:promotions`;
}

export async function listMessageIds(token: string, query: string, max = 100): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;

  while (ids.length < max) {
    const qs = new URLSearchParams({ q: query, maxResults: String(Math.min(100, max - ids.length)) });
    if (pageToken) qs.set('pageToken', pageToken);
    const data = await gapi<{ messages?: { id: string }[]; nextPageToken?: string }>(
      token,
      `/messages?${qs}`,
    );
    ids.push(...(data.messages ?? []).map((m) => m.id));
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return ids;
}

export async function getMessage(token: string, id: string): Promise<GmailMessage> {
  return gapi<GmailMessage>(token, `/messages/${id}?format=full`);
}

export async function getProfile(token: string): Promise<{ emailAddress: string; historyId: string }> {
  return gapi<{ emailAddress: string; historyId: string }>(token, '/profile');
}

function decodeB64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

/** Walk the MIME tree for the best text/html and text/plain bodies. */
function collectBodies(part: GmailPart | undefined, out: { html: string; text: string }): void {
  if (!part) return;
  const mime = part.mimeType ?? '';

  if (part.body?.data && !part.filename) {
    if (mime === 'text/html' && !out.html) out.html = decodeB64Url(part.body.data);
    else if (mime === 'text/plain' && !out.text) out.text = decodeB64Url(part.body.data);
  }
  for (const child of part.parts ?? []) collectBodies(child, out);
}

export function parseGmailMessage(msg: GmailMessage): {
  from: string;
  subject: string;
  html: string;
  text: string;
  receivedAt: string;
  providerMsgId: string;
} {
  const headers = msg.payload?.headers ?? [];
  const header = (name: string) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';

  const bodies = { html: '', text: '' };
  collectBodies(msg.payload, bodies);

  return {
    from: header('From'),
    subject: header('Subject'),
    html: bodies.html,
    text: bodies.text,
    receivedAt: msg.internalDate
      ? new Date(Number(msg.internalDate)).toISOString()
      : new Date().toISOString(),
    providerMsgId: msg.id,
  };
}
