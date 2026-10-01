import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { getHouseholdId } from '@/lib/household';
import { getSettings } from '@/lib/schedule';
import { SettingsForm } from '@/components/Controls';
import { PushToggle } from '@/components/PushToggle';
import { SignOutButton } from '@/components/SignOutButton';
import { serpUsage } from '@/lib/budget';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  const householdId = await getHouseholdId(supabase, user!.id);
  const settings = await getSettings(supabase, householdId);
  const serp = await serpUsage(supabase);

  // The suite's Gmail connections, shared with Stub (RLS: the household's).
  const { data: accounts } = await supabase.schema('public').from('email_accounts').select('email, status').eq('provider', 'gmail');

  const sources = [
    ['Flights and hotels (SerpApi)', !!process.env.SERPAPI_KEY],
    ['Best Buy prices', !!process.env.BESTBUY_API_KEY],
  ] as const;

  return (
    <main className="page">
      <header className="page-header">
        <h1>Settings</h1>
        <div className="sub">{user?.email}</div>
      </header>

      <section>
        <div className="section-label">Alerts</div>
        <SettingsForm
          bestbuyTier={settings.bestbuy_tier}
          storeMin={settings.store_min_cents}
          flightMin={settings.flight_min_cents}
          minPct={settings.min_pct}
        />
        <PushToggle vapidPublicKey={process.env.VAPID_PUBLIC_KEY ?? null} />
      </section>

      <section>
        <div className="section-label">Email</div>
        <div className="panel">
          {(accounts ?? []).length === 0 ? (
            <p className="muted">No Gmail connected.</p>
          ) : (
            accounts!.map((a) => (
              <div key={a.email} className="spread">
                <span>{a.email}</span>
                <span className={`pill ${a.status === 'active' ? 'pill-going' : 'pill-review'}`}>
                  {a.status === 'active' ? 'Connected' : 'Needs reconnect'}
                </span>
              </div>
            ))
          )}
          <p className="fine">
            Refund reads the same Gmail connection as Stub. Connect or reconnect it in{' '}
            {process.env.NEXT_PUBLIC_STUB_URL ? (
              <a href={`${process.env.NEXT_PUBLIC_STUB_URL}/settings/connections`}>Stub → Connections</a>
            ) : (
              'Stub → Connections'
            )}
            .
          </p>
        </div>
      </section>

      <section>
        <div className="section-label">Price sources</div>
        <div className="panel">
          {sources.map(([name, on]) => (
            <div key={name} className="spread">
              <span>{name}</span>
              <span className={`pill ${on ? 'pill-going' : ''}`}>{on ? 'On' : 'No key yet'}</span>
            </div>
          ))}
          {process.env.SERPAPI_KEY && (
            <p className="fine">
              SerpApi this month: {serp.used} of {serp.cap} searches. Checks space themselves out so the budget lasts
              the month, soonest trips first.
            </p>
          )}
          <p className="fine">Target and Costco have no sanctioned way to read prices, so Refund reminds you to check instead.</p>
        </div>
      </section>

      <section>
        <div className="section-label">Account</div>
        <SignOutButton />
      </section>
    </main>
  );
}
