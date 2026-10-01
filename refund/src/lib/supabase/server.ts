import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { cookieOptions } from './cookies';

/**
 * Request-scoped client that carries the signed-in user's JWT, so RLS applies.
 * Defaults to the `refund` schema; shared tables (households, Gmail accounts)
 * are reached with `.schema('public')`.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: 'refund' },
      cookieOptions,
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component: middleware refreshes the session instead.
          }
        },
      },
    },
  );
}
