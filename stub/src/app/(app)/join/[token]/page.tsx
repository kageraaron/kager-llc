import { JoinHousehold } from '@/components/JoinHousehold';

export const dynamic = 'force-dynamic';

/**
 * Landing page for a household invite link.
 *
 * Under the `(app)` layout, so middleware sends a signed-out visitor to log in
 * first and back here afterwards.
 *
 * Unlike the old friend links, this does NOT redeem during render: joining
 * folds everything in your own household into theirs, which is not something
 * a link preview or a prefetch should be able to do on your behalf.
 */
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="page">
      <JoinHousehold token={token} />
    </main>
  );
}
