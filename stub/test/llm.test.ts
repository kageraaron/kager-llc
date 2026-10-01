import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc }) }));

import { llmExtract, llmJudge, llmProvider, redact } from '@/lib/ingest/llm';
import { normalizeEmail } from '@/lib/ingest/normalize';

/** A layout no parser knows. Made-up seller, act and order. */
const email = normalizeEmail({
  from: 'Gatefold <orders@gatefold.example>',
  subject: 'You are in: North Atlas Sound',
  receivedAt: '2026-03-01T17:00:00Z',
  text: `Hello pat@example.com, order 9988776655 is complete.
Paid with card ****4242. Manage it at https://gatefold.example/o/9988776655
North Atlas Sound live at Bayside Arena, Oakland.
The night of the fourteenth of November 2026, music from eight.`,
});

const fetchMock = vi.fn();
/** How each provider wraps the same answer. */
const fromClaude = (input: unknown) =>
  new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'record_ticket', input }] }), { status: 200 });
const fromLocal = (input: unknown) =>
  new Response(JSON.stringify({ message: { content: JSON.stringify(input) } }), { status: 200 });

const held = { held: true, act: 'North Atlas Sound', venue: 'Bayside Arena', city: 'Oakland', starts_at: '2026-11-14T20:00', quantity: 2 };

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: true, error: null });
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of ['ANTHROPIC_API_KEY', 'STUB_LLM_FALLBACK', 'STUB_LOCAL_LLM_URL', 'STUB_LOCAL_LLM_MODEL']) delete process.env[k];
});

describe('which model reads', () => {
  it('none unless one is configured', async () => {
    expect(llmProvider()).toBeNull();
    expect(await llmJudge(email)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('prefers the one on the box, so the mail stays there', () => {
    process.env.ANTHROPIC_API_KEY = 'k';
    expect(llmProvider()).toBe('anthropic');
    process.env.STUB_LOCAL_LLM_URL = 'http://127.0.0.1:11434';
    expect(llmProvider()).toBe('local');
    process.env.STUB_LLM_FALLBACK = 'anthropic';
    expect(llmProvider()).toBe('anthropic');
    process.env.STUB_LLM_FALLBACK = 'off';
    expect(llmProvider()).toBeNull();
  });
});

describe('the local model', () => {
  beforeEach(() => {
    process.env.STUB_LOCAL_LLM_URL = 'http://127.0.0.1:11434';
  });

  it('is asked on the box, with the reply held to a fixed shape', async () => {
    fetchMock.mockResolvedValue(fromLocal(held));
    const v = await llmJudge(email);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:11434/api/chat');
    const sent = JSON.parse(String(init.body));
    expect(sent.model).toBe('phi4-mini');
    expect(sent.format.required).toContain('held');
    expect(v).toMatchObject({ held: true, ticket: { artistName: 'North Atlas Sound', venueName: 'Bayside Arena', startsAt: '2026-11-14T20:00:00', ticketQuantity: 2 } });
  });

  it('reports a ticket that was sold as not held', async () => {
    fetchMock.mockResolvedValue(fromLocal({ ...held, held: false }));
    expect(await llmJudge(email)).toEqual({ held: false, ticket: null });
  });

  it('accepts the date shapes a small model actually returns', async () => {
    fetchMock.mockResolvedValue(fromLocal({ ...held, starts_at: '2026-11-14T20:00:00Z' }));
    expect((await llmJudge(email))?.ticket?.startsAt).toBe('2026-11-14T20:00:00');
  });

  it('splits a venue that comes back with its city attached', async () => {
    const withCity = normalizeEmail({ ...email, text: `${email.text}\nBayside Arena, Oakland, CA` });
    fetchMock.mockResolvedValue(fromLocal({ ...held, venue: 'Bayside Arena, Oakland, CA', city: null }));
    expect((await llmJudge(withCity))?.ticket).toMatchObject({ venueName: 'Bayside Arena', city: 'Oakland' });
  });

  it('has no opinion when the model cannot be reached', async () => {
    fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED'));
    expect(await llmJudge(email)).toBeNull();
  });
});

describe('what leaves the box (Anthropic)', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  it('masks addresses, card digits, long numbers and links', () => {
    const sent = redact(email.text);
    expect(sent).not.toMatch(/pat@example\.com|4242|9988776655|https?:/);
    expect(sent).toContain('North Atlas Sound live at Bayside Arena');
  });

  it('sends nothing once the cap is reached', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    expect(await llmExtract(email)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the masked text, never the raw one', async () => {
    fetchMock.mockResolvedValue(fromClaude({ ...held, held: false }));
    await llmExtract(email);
    expect(String(fetchMock.mock.calls[0][0])).toContain('api.anthropic.com');
    expect(String(fetchMock.mock.calls[0][1].body)).not.toMatch(/pat@example\.com|9988776655/);
  });
});

describe('what is believed', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  it('a ticket the model reports from the text', async () => {
    fetchMock.mockResolvedValue(fromClaude(held));
    expect(await llmExtract(email)).toMatchObject({ artistName: 'North Atlas Sound', venueName: 'Bayside Arena', startsAt: '2026-11-14T20:00:00' });
  });

  it('not an act that is missing from the email', async () => {
    // Answering from what it knows about a tour, not from the text.
    fetchMock.mockResolvedValue(fromClaude({ ...held, act: 'Some Other Band' }));
    expect(await llmJudge(email)).toEqual({ held: true, ticket: null });
  });

  it('the act, but not a venue that is missing from the email', async () => {
    fetchMock.mockResolvedValue(fromClaude({ ...held, venue: 'Madison Square Garden', city: null }));
    const t = await llmExtract(email);
    expect(t?.artistName).toBe('North Atlas Sound');
    expect(t?.venueName).toBeUndefined();
  });

  it('nothing with a malformed date', async () => {
    fetchMock.mockResolvedValue(fromClaude({ ...held, starts_at: 'November 14' }));
    expect(await llmExtract(email)).toBeNull();
  });
});
