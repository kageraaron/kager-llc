import 'server-only';

import { createClient } from '@supabase/supabase-js';

/**
 * Service-role client. Bypasses RLS entirely — never import this into anything
 * that runs in the browser. Used by the cron jobs (Gmail scan, price checks).
 * Defaults to the `refund` schema, like the request client.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, serviceKey, {
    db: { schema: 'refund' },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
