import { createClient } from '@supabase/supabase-js';

/**
 * Service-role client. Bypasses RLS entirely — never import this into anything
 * that runs in the browser. Used by the cron poller, the ingest webhook, and
 * catalog writes (artists/venues/events).
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
