import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Any Supabase client, whichever schema it defaults to. Refund's clients
 * default to `refund` and reach shared tables with `.schema('public')`;
 * supabase-js types those as different clients, which no helper here cares about.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = SupabaseClient<any, any, any>;
