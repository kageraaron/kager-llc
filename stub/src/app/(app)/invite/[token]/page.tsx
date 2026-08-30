import Link from 'next/link';
import { redeemFriendInvite } from '@/app/actions';

export const dynamic = 'force-dynamic';

/**
 * Landing page for a friend invite link.
 *
 * Under the `(app)` layout, so middleware sends a signed-out visitor to log in
 * first and back here afterwards — which is the whole flow: open link, sign in,
 * already friends.
 *
 * The redemption runs during render rather than behind a confirm button. The
 * click on the link IS the intent, and a second "yes I meant it" step on a
 * reversible, single-friend action is friction for its own sake.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await redeemFriendInvite(token);

  if (!result.ok) {
    return (
      <main className="page">
        <div className="empty">
          <h2>That link did not work</h2>
          <p>{result.error}</p>
          <div className="stack" style={{ marginTop: 20, maxWidth: 260, marginInline: 'auto' }}>
            <Link className="btn btn-primary btn-block" href="/friends">Add a friend by handle</Link>
            <Link className="btn btn-block" href="/upcoming">Go to Upcoming</Link>
          </div>
        </div>
      </main>
    );
  }

  const name = result.profile?.display_name || result.profile?.handle || 'your friend';

  return (
    <main className="page">
      <div className="empty">
        <h2>{result.alreadyFriends ? `You and ${name} are already friends` : `You and ${name} are now friends`}</h2>
        <p>
          You will see the shows {name} is going to, and they will see yours — for
          anything you have left visible to friends.
        </p>
        <div className="stack" style={{ marginTop: 20, maxWidth: 260, marginInline: 'auto' }}>
          <Link className="btn btn-primary btn-block" href="/friends">See what they are going to</Link>
          <Link className="btn btn-block" href="/upcoming">Go to Upcoming</Link>
        </div>
      </div>
    </main>
  );
}
