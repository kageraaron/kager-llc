import type { NormalizedEmail, ParsedTicket } from '@/lib/types';
import { createAdminClient } from '@/lib/supabase/admin';
import { htmlToText } from '@/lib/ingest/html';

/**
 * Last resort: a model reads a ticket email nothing else could, and judges the
 * one thing rules are bad at, whether the reader HOLDS the ticket or sold it.
 *
 * Two places it can run:
 *
 *  - LOCAL (`STUB_LOCAL_LLM_URL`): a small open model served by Ollama on the
 *    same machine. Nothing leaves the box. Slow (tens of seconds an email on a
 *    CPU) and less sure of itself, which is why it is only a backup.
 *  - ANTHROPIC (`ANTHROPIC_API_KEY`): better, and the one place email text
 *    would leave the box, so the text is masked first and calls are capped.
 *
 * Only ever reached for mail that already looks like a seller's confirmation
 * and that the layout parsers gave up on. Three things keep it honest:
 *
 *  - GROUNDING. The act it names must appear, verbatim, in the email. A model
 *    answering from what it knows about a tour is discarded.
 *  - THE CATALOG. Its answer goes through the same matcher as every reader.
 *  - REVIEW. Nothing it reads is added to a list without a person confirming.
 */

type Provider = 'local' | 'anthropic';

export function llmProvider(): Provider | null {
  const want = process.env.STUB_LLM_FALLBACK;
  if (want === 'off') return null;
  const local = !!process.env.STUB_LOCAL_LLM_URL;
  const remote = !!process.env.ANTHROPIC_API_KEY;
  if (want === 'local') return local ? 'local' : null;
  if (want === 'anthropic') return remote ? 'anthropic' : null;
  // Prefer the one that keeps the mail on the box.
  return local ? 'local' : remote ? 'anthropic' : null;
}

export const llmConfigured = () => llmProvider() !== null;

const cap = (name: string, fallback: number) => {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : fallback;
};

/** What is sent is the receipt's wording, not the reader's identity. */
export function redact(text: string, max = 6000): string {
  return text
    .replace(/<?https?:\/\/\S+>?/gi, '')
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]')
    .replace(/(?:\*{2,}|x{4,}|•{2,})\s*\d{2,4}/gi, '[card]')
    .replace(/\b\d{6,}\b/g, '[number]')
    .replace(/\n{3,}/g, '\n\n')
    .slice(0, max);
}

const SYSTEM = `You read ONE email from a ticket seller and fill in a form about it.
Rules:
- held is true only if the email shows the reader HAS or BOUGHT tickets to a live music event (concert, DJ night, music festival).
- held is false if the reader SOLD, LISTED or TRANSFERRED AWAY the tickets, if it is advertising, a presale code, an account notice, or a sports game.
- Copy the act and venue exactly as written in the email. Never invent or complete a name.
- starts_at is when the EVENT happens, as YYYY-MM-DDTHH:MM in 24-hour time. Not the order date, not the delivery date, not the presale date. Use T00:00 if no time is given.
- If something is not in the email, use null.`;

const PROPERTIES = {
  held: { type: 'boolean' },
  act: { type: ['string', 'null'] },
  venue: { type: ['string', 'null'] },
  city: { type: ['string', 'null'] },
  starts_at: { type: ['string', 'null'] },
  quantity: { type: ['integer', 'null'] },
} as const;
const REQUIRED = ['held', 'act', 'venue', 'city', 'starts_at', 'quantity'];

interface Answer {
  held?: boolean;
  act?: string | null;
  venue?: string | null;
  city?: string | null;
  starts_at?: string | null;
  quantity?: number | null;
}

export interface Verdict {
  /** Does the reader hold a ticket to a show, as far as the model can tell? */
  held: boolean;
  /** What it read, when it is held, grounded in the text, and has a date. */
  ticket: ParsedTicket | null;
}

async function claim(provider: Provider): Promise<boolean> {
  // The local model costs nothing but time; its cap only bounds a runaway re-read.
  const [month, day] = provider === 'local' ? [3000, 200] : [150, 40];
  const { data, error } = await createAdminClient().rpc('claim_provider_call', {
    p_provider: provider === 'local' ? 'local-llm' : 'anthropic',
    p_endpoint: 'extract',
    p_month_cap: cap('STUB_LLM_MONTHLY_CALLS', month),
    p_day_cap: cap('STUB_LLM_DAILY_CALLS', day),
  });
  if (error) console.error('llm: ledger unavailable, not calling', error.message);
  return !error && data === true;
}

async function askLocal(prompt: string): Promise<Answer | undefined> {
  const res = await fetch(`${process.env.STUB_LOCAL_LLM_URL!.replace(/\/$/, '')}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(240_000),
    body: JSON.stringify({
      model: process.env.STUB_LOCAL_LLM_MODEL || 'phi4-mini',
      stream: false,
      // The reply is constrained to this shape, so it always parses.
      format: { type: 'object', properties: PROPERTIES, required: REQUIRED },
      options: { temperature: 0, num_ctx: 4096, num_predict: 160 },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`local model ${res.status}`);
  const json = (await res.json()) as { message?: { content?: string } };
  return json.message?.content ? (JSON.parse(json.message.content) as Answer) : undefined;
}

async function askAnthropic(prompt: string): Promise<Answer | undefined> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      model: process.env.STUB_LLM_MODEL || 'claude-opus-5-5',
      max_tokens: 400,
      system: SYSTEM,
      tools: [{ name: 'record_ticket', description: 'Fill in the form for this email.', input_schema: { type: 'object', properties: PROPERTIES, required: REQUIRED } }],
      tool_choice: { type: 'tool', name: 'record_ticket' },
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}`);
  const json = (await res.json()) as { content?: { type: string; input?: Answer }[] };
  return json.content?.find((b) => b.type === 'tool_use')?.input;
}

/** Null means "no opinion": not configured, over the cap, or the call failed. */
export async function llmJudge(email: NormalizedEmail): Promise<Verdict | null> {
  const provider = llmProvider();
  if (!provider) return null;

  // A CPU model reads slowly; the event block is near the top of every receipt.
  const body = redact((email.html ? htmlToText(email.html) : '') || email.text, provider === 'local' ? 3000 : 6000);
  if (body.trim().length < 40) return null;
  if (!(await claim(provider))) return null;

  const prompt = `Email received: ${email.receivedAt.slice(0, 10)}\nSubject: ${redact(email.subject)}\n\n${body}`;
  let answer: Answer | undefined;
  try {
    answer = provider === 'local' ? await askLocal(prompt) : await askAnthropic(prompt);
  } catch (err) {
    console.error('llm: request failed', err instanceof Error ? err.message : err);
    return null;
  }
  if (!answer || typeof answer.held !== 'boolean') return null;
  if (!answer.held) return { held: false, ticket: null };

  const when = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?Z?$/.exec(answer.starts_at ?? '');
  // Grounding: every name it reports must be in the email it was shown.
  const haystack = `${email.subject}\n${body}`.toLowerCase();
  const said = (s?: string | null) => !!s && s.trim().length >= 2 && haystack.includes(s.trim().toLowerCase());
  if (!when || !said(answer.act)) return { held: true, ticket: null };

  const qty = answer.quantity;
  // "Lantern Theater, Oakland, CA" comes back as one string from a small model.
  const [venue, ...rest] = (said(answer.venue) ? answer.venue!.trim() : '').split(/\s*,\s*/);
  return {
    held: true,
    ticket: {
      artistName: answer.act!.trim(),
      venueName: venue || undefined,
      city: (said(answer.city) ? answer.city!.trim() : rest[0]) || undefined,
      startsAt: `${when[1]}T${when[2]}:00`,
      ticketQuantity: typeof qty === 'number' && Number.isInteger(qty) && qty > 0 && qty < 50 ? qty : undefined,
    },
  };
}

export async function llmExtract(email: NormalizedEmail): Promise<ParsedTicket | null> {
  return (await llmJudge(email))?.ticket ?? null;
}
