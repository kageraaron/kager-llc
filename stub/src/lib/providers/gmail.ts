import { TICKET_SENDER_DOMAINS } from '@/lib/ingest/extractors';

/**
 * Gmail API client.
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
 * The search that finds ticket confirmations. Mirrors how Shop scans for
 * "tracking number" / "track your package": known senders OR strong subject
 * phrases, bounded to the last 30 days on first sync.
 */
export function buildTicketQuery(days = 30): string {
  const senders = TICKET_SENDER_DOMAINS.map((d) => `from:${d}`).join(' OR ');
  // Subject matching carries the whole load for FORWARDED confirmations, which
  // arrive from a personal address and so never match a sender filter.
  const subjects = [
    'subject:"your tickets"',
    'subject:"your ticket"',
    'subject:"you got tickets"',
    'subject:"order confirmation"',
    'subject:"ticket confirmation"',
    'subject:"you\'re going"',
    'subject:"booking confirmed"',
    'subject:"your order"',
    'subject:"tickets to"',
    'subject:"order confirmed"',
  ].join(' OR ');
  return `newer_than:${days}d ((${senders}) OR (${subjects})) -category:promotions`;
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

/**
 * Incremental sync. Returns message ids added since `startHistoryId`, plus the
 * new cursor. Gmail expires history older than about a week, so a 404 here
 * means we must fall back to a full query re-scan.
 */
export async function listHistorySince(
  token: string,
  startHistoryId: string,
): Promise<{ ids: string[]; historyId: string | null; expired: boolean }> {
  try {
    const data = await gapi<{
      history?: { messagesAdded?: { message: { id: string } }[] }[];
      historyId?: string;
    }>(token, `/history?startHistoryId=${startHistoryId}&historyTypes=messageAdded`);

    const ids = (data.history ?? []).flatMap((h) =>
      (h.messagesAdded ?? []).map((m) => m.message.id),
    );
    return { ids: [...new Set(ids)], historyId: data.historyId ?? null, expired: false };
  } catch (err) {
    if (err instanceof Error && /\b404\b/.test(err.message)) {
      return { ids: [], historyId: null, expired: true };
    }
    throw err;
  }
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
