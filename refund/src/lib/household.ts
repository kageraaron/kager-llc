import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Households are Stub's (0025_household.sql, in the shared `public` schema):
 * everyone in a household shares one, and Refund's purchases belong to it the same way
 * Stub's shows do.
 */
export async function getHouseholdId(db: SupabaseClient, userId: string): Promise<string> {
  const { data, error } = await db
    .schema('public')
    .from('household_members')
    .select('household_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`user ${userId} has no household`);
  return data.household_id as string;
}

export async function getHouseholdUserIds(db: SupabaseClient, householdId: string): Promise<string[]> {
  const { data, error } = await db
    .schema('public')
    .from('household_members')
    .select('user_id')
    .eq('household_id', householdId);
  if (error) throw error;
  return (data ?? []).map((r) => r.user_id as string);
}
