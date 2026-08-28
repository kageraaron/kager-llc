'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEvent as tmGetEvent } from '@/lib/providers/ticketmaster';
import { upsertEvent, recordAttendance } from '@/lib/ingest/catalog';
import { getCurrentUser } from '@/lib/auth';

/**
 * Server actions for everything the user does by hand.
 *
 * Writes go through the request-scoped client so RLS applies. The one exception
 * is catalog writes (artists/venues/events), which are global rows the user has
 * no direct insert rights on - those use the admin client after we have already
 * confirmed the caller is signed in.
 */

async function requireUser() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) throw new Error('Not signed in');
  return { supabase, user };
}


/** Add a Ticketmaster event to the user's calendar, creating the catalog rows if needed. */
export async function addEventByTmId(tmId: string, state: 'going' | 'interested' = 'going') {
  const { user } = await requireUser();

  const tmEvent = await tmGetEvent(tmId);
  if (!tmEvent) return { ok: false as const, error: 'Event not found' };

  const admin = createAdminClient();
  const eventId = await upsertEvent(admin, tmEvent);
  if (!eventId) return { ok: false as const, error: 'Could not save that event' };

  await recordAttendance(admin, { userId: user.id, eventId, source: 'manual' });
  if (state !== 'going') {
    await admin.from('attendances').update({ state }).eq('user_id', user.id).eq('event_id', eventId);
  }

  revalidatePath('/upcoming');
  revalidatePath('/browse');
  return { ok: true as const, eventId };
}

/**
 * Add an event that already exists in our catalog. This is the path used from
 * the event detail page, where the row was loaded from `events` - no reason to
 * spend a Ticketmaster call re-fetching something we already have.
 */
export async function addExistingEvent(
  eventId: string,
  state: 'going' | 'interested' | 'went' = 'going',
) {
  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from('attendances')
    .insert({ user_id: user.id, event_id: eventId, state, source: 'manual' });

  if (error && error.code !== '23505') return { ok: false as const, error: error.message };

  revalidatePath(`/event/${eventId}`);
  revalidatePath('/upcoming');
  revalidatePath('/archive');
  return { ok: true as const };
}

export async function setAttendanceState(
  eventId: string,
  state: 'going' | 'interested' | 'went' | 'missed',
) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from('attendances')
    .update({ state })
    .eq('user_id', user.id)
    .eq('event_id', eventId);

  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/event/${eventId}`);
  revalidatePath('/upcoming');
  revalidatePath('/archive');
  return { ok: true as const };
}

export async function setAttendanceVisibility(eventId: string, visibility: 'friends' | 'private') {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from('attendances')
    .update({ visibility })
    .eq('user_id', user.id)
    .eq('event_id', eventId);

  if (error) return { ok: false as const, error: error.message };
  revalidatePath(`/event/${eventId}`);
  return { ok: true as const };
}

export async function removeAttendance(eventId: string) {
  const { supabase, user } = await requireUser();
  await supabase.from('attendances').delete().eq('user_id', user.id).eq('event_id', eventId);
  revalidatePath('/upcoming');
  revalidatePath('/archive');
  return { ok: true as const };
}

/** Private note. RLS on `notes` is owner-only, with no friend read path. */
export async function saveNote(eventId: string, body: string) {
  const { supabase, user } = await requireUser();

  if (body.trim() === '') {
    await supabase.from('notes').delete().eq('user_id', user.id).eq('event_id', eventId);
  } else {
    const { error } = await supabase
      .from('notes')
      .upsert({ user_id: user.id, event_id: eventId, body }, { onConflict: 'user_id,event_id' });
    if (error) return { ok: false as const, error: error.message };
  }

  revalidatePath(`/event/${eventId}`);
  return { ok: true as const };
}

// ---------------------------------------------------------------- friends

/** Friendships are stored as one canonical row with user_low < user_high. */
function pair(a: string, b: string) {
  return a < b ? { user_low: a, user_high: b } : { user_low: b, user_high: a };
}

export async function sendFriendRequest(handle: string) {
  const { supabase, user } = await requireUser();

  const { data: target } = await supabase
    .from('profiles')
    .select('id, handle')
    .eq('handle', handle.toLowerCase().replace(/^@/, ''))
    .maybeSingle();

  if (!target) return { ok: false as const, error: 'No one with that handle' };
  if (target.id === user.id) return { ok: false as const, error: 'That is you' };

  const { error } = await supabase
    .from('friendships')
    .insert({ ...pair(user.id, target.id), status: 'pending', requested_by: user.id });

  if (error) {
    // Unique violation: a row already exists in some state.
    if (error.code === '23505') return { ok: false as const, error: 'Already requested or connected' };
    return { ok: false as const, error: error.message };
  }

  revalidatePath('/friends');
  return { ok: true as const };
}

export async function respondToFriendRequest(otherUserId: string, accept: boolean) {
  const { supabase, user } = await requireUser();
  const p = pair(user.id, otherUserId);

  if (accept) {
    await supabase.from('friendships').update({ status: 'accepted' }).match(p);
  } else {
    await supabase.from('friendships').delete().match(p);
  }

  revalidatePath('/friends');
  return { ok: true as const };
}

export async function removeFriend(otherUserId: string) {
  const { supabase, user } = await requireUser();
  await supabase.from('friendships').delete().match(pair(user.id, otherUserId));
  revalidatePath('/friends');
  return { ok: true as const };
}

// ---------------------------------------------------------------- profile

export async function updateProfile(input: {
  handle?: string;
  display_name?: string;
  bio?: string;
  home_city?: string;
}) {
  const { supabase, user } = await requireUser();

  const patch: Record<string, string> = {};
  if (input.handle !== undefined) {
    const handle = input.handle.toLowerCase().replace(/^@/, '');
    if (!/^[a-z0-9_]{3,24}$/.test(handle)) {
      return { ok: false as const, error: 'Handles are 3-24 characters: letters, numbers, underscore' };
    }
    patch.handle = handle;
  }
  if (input.display_name !== undefined) patch.display_name = input.display_name.slice(0, 80);
  if (input.bio !== undefined) patch.bio = input.bio.slice(0, 500);
  if (input.home_city !== undefined) patch.home_city = input.home_city.slice(0, 120);

  const { error } = await supabase.from('profiles').update(patch).eq('id', user.id);
  if (error) {
    if (error.code === '23505') return { ok: false as const, error: 'That handle is taken' };
    return { ok: false as const, error: error.message };
  }

  revalidatePath('/friends');
  return { ok: true as const };
}

// ---------------------------------------------------------------- inbox review

/** Confirm a low-confidence ingest candidate, creating the attendance for real. */
export async function confirmCandidate(candidateId: string) {
  const { supabase, user } = await requireUser();

  const { data: candidate } = await supabase
    .from('ingest_candidates')
    .select('id, matched_event_id, parsed')
    .eq('id', candidateId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!candidate) return { ok: false as const, error: 'Candidate not found' };
  if (!candidate.matched_event_id) {
    return { ok: false as const, error: 'No event matched - search for it in Browse instead' };
  }

  const admin = createAdminClient();
  await recordAttendance(admin, {
    userId: user.id,
    eventId: candidate.matched_event_id,
    source: 'gmail',
  });
  await supabase.from('ingest_candidates').update({ state: 'confirmed' }).eq('id', candidateId);

  revalidatePath('/inbox');
  revalidatePath('/upcoming');
  return { ok: true as const };
}

export async function rejectCandidate(candidateId: string) {
  const { supabase, user } = await requireUser();
  await supabase
    .from('ingest_candidates')
    .update({ state: 'rejected' })
    .eq('id', candidateId)
    .eq('user_id', user.id);

  revalidatePath('/inbox');
  return { ok: true as const };
}
