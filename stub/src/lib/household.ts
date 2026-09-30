import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Households: everyone in one sees the same shows, notes and Inbox. See
 * `0025_household.sql` for the model; this is the app's single way of asking
 * which household a person belongs to.
 *
 * Every user has exactly one — a household of their own is created at signup,
 * and joining someone else's merges it away — so a missing row is a broken
 * account, not a normal state, and is reported as an error.
 */

export async function getHouseholdId(db: SupabaseClient, userId: string): Promise<string> {
  const { data, error } = await db
    .from('household_members')
    .select('household_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error(`user ${userId} has no household`);
  return data.household_id as string;
}

export interface HouseholdMember {
  user_id: string;
  role: string;
  joined_at: string;
  profile: { display_name: string; handle: string; avatar_url: string | null } | null;
}

/** Everyone in a household, oldest member first. */
export async function getHouseholdMembers(
  db: SupabaseClient,
  householdId: string,
): Promise<HouseholdMember[]> {
  const { data, error } = await db
    .from('household_members')
    .select('user_id, role, joined_at, profile:profiles ( display_name, handle, avatar_url )')
    .eq('household_id', householdId)
    .order('joined_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as HouseholdMember[];
}

/**
 * The user ids that share a household with `userId`, including them. Used by
 * the service-role jobs (reminders, scan notifications) that act on a shared
 * row but have to deliver to each person's own devices.
 */
export async function getHouseholdUserIds(db: SupabaseClient, householdId: string): Promise<string[]> {
  const { data, error } = await db
    .from('household_members')
    .select('user_id')
    .eq('household_id', householdId);

  if (error) throw error;
  return (data ?? []).map((r) => r.user_id as string);
}
