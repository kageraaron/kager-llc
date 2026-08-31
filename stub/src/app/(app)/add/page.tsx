import { redirect } from 'next/navigation';

/**
 * Adding a show moved into a sheet raised from the Upcoming and Archive
 * headers, so this route no longer has a page of its own.
 *
 * It still resolves rather than 404ing: `/add` was a tab for long enough to be
 * bookmarked and linked, and landing on Upcoming — where the Add button is —
 * is a better answer for those than a dead end. Keeping the old form here too
 * would mean two copies of the same flow, which drift.
 */
export default function AddPage() {
  redirect('/upcoming');
}
