import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { vi } from 'vitest';

/**
 * Replay recorded provider responses through the real client code.
 *
 * The offline suite used to cover normalizers and nothing else, and three
 * provider bugs walked straight through it — a wrong response envelope, a
 * removed batch endpoint, and a field that quietly stopped being returned. None
 * of those live in a pure function. They live in the few lines between `fetch`
 * and the normalizer, which nothing exercised.
 *
 * So: record once with `npm run fixtures:record`, replay forever.
 *
 * The strict default matters. An unmatched request **throws** rather than
 * falling through to the network, so a test can never silently start depending
 * on a live API — which is the failure mode that makes recorded suites rot.
 */

export interface Recorded {
  recordedAt: string;
  url: string;
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

const DIR = join(process.cwd(), 'test/fixtures/api');

export function loadRecorded(name: string): Recorded {
  return JSON.parse(readFileSync(join(DIR, `${name}.json`), 'utf8')) as Recorded;
}

/** The body alone, for tests that just want to feed a normalizer. */
export function recordedBody<T>(name: string): T {
  return loadRecorded(name).body as T;
}

/**
 * A route: requests whose URL contains `match` are answered from `fixture`.
 *
 * Matching on a substring rather than the full URL keeps tests readable and
 * lets them ignore query-string ordering, which no client guarantees.
 */
export interface Route {
  match: string;
  fixture: string;
  /** Override the recorded status, e.g. to rehearse a 500 the API never sent. */
  status?: number;
}

/**
 * Install a `fetch` that answers only from recordings.
 *
 * Returns the call log so a test can assert on WHICH endpoint was hit — which
 * is how you pin "this must use the singular artist endpoint, never the batch
 * one that 403s".
 *
 * Call inside `beforeEach`; pair with `vi.unstubAllGlobals()` in `afterEach`.
 */
export function useRecordedFetch(routes: Route[]): { calls: string[] } {
  const calls: string[] = [];

  /*
   * Keyed by URL alone: every recorded endpoint is idempotent and distinguished
   * by its path. If a provider ever needs method- or body-based matching, add it
   * to `Route` rather than reaching for the network.
   */
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);

    const route = routes.find((r) => url.includes(r.match));
    if (!route) {
      // Loud, with the list of what WAS available: a silent fallthrough to the
      // network is exactly what these fixtures exist to prevent.
      throw new Error(
        `No recorded response for ${url}\nAvailable routes: ${routes.map((r) => r.match).join(', ') || '(none)'}`,
      );
    }

    const recorded = loadRecorded(route.fixture);
    const status = route.status ?? recorded.status;
    const payload =
      typeof recorded.body === 'string' ? recorded.body : JSON.stringify(recorded.body);

    return new Response(payload, {
      status,
      headers: {
        'content-type': 'application/json',
        ...recorded.headers,
      },
    });
  });

  return { calls };
}
