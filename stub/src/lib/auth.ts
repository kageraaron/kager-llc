import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Single place that answers "who is signed in", so pages and server actions
 * agree on the shape and none of them reach into `auth.getUser()` directly.
 */

export interface CurrentUser {
  id: string;
  email: string;
}

export async function getCurrentUser(db: SupabaseClient): Promise<CurrentUser | null> {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;
  return { id: user.id, email: user.email ?? '' };
}
