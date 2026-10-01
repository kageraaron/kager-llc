import { createClient } from '@/lib/supabase/server';
import { daysUntil, formatMoney, shortDate } from '@/lib/format';
import { AddCreditForm, CreditActions } from '@/components/Controls';

export const dynamic = 'force-dynamic';

/**
 * Travel credits and vouchers, soonest expiry first. A claimed fare drop
 * usually comes back as one of these, and an unused credit is the refund
 * lost a second time.
 */
export default async function CreditsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('credits')
    .select('id, label, amount_cents, code, expires_at, rule, status, notes')
    .order('expires_at', { ascending: true, nullsFirst: false });
  const credits = data ?? [];
  const active = credits.filter((c) => c.status === 'active');
  const done = credits.filter((c) => c.status !== 'active');
  const total = active.reduce((s, c) => s + (c.amount_cents ?? 0), 0);

  return (
    <main className="page">
      <header className="page-header">
        <h1>Credits</h1>
        <div className="sub">
          {active.length === 0 ? 'No credits to use' : `${formatMoney(total)} across ${active.length} credit${active.length === 1 ? '' : 's'}`}
        </div>
      </header>

      {active.length > 0 && (
        <section>
          <div className="section-label">To use</div>
          {active.map((c) => {
            const left = daysUntil(c.expires_at);
            return (
              <div key={c.id} className="panel">
                <div className="spread">
                  <strong>{c.label}</strong>
                  <strong>{formatMoney(c.amount_cents)}</strong>
                </div>
                <p className="fine">
                  {c.expires_at
                    ? `${c.rule === 'travel_by' ? 'Fly by' : 'Book by'} ${shortDate(c.expires_at)} · ${left} day${left === 1 ? '' : 's'} left`
                    : 'No expiry set: check the airline’s email and add the date'}
                  {c.code && ` · ${c.code}`}
                </p>
                <CreditActions id={c.id} status={c.status} expiresAt={c.expires_at} />
              </div>
            );
          })}
        </section>
      )}

      <section>
        <div className="section-label">Add a credit</div>
        <AddCreditForm />
      </section>

      {done.length > 0 && (
        <section>
          <div className="section-label">Used or expired</div>
          {done.map((c) => (
            <div key={c.id} className="panel">
              <div className="spread">
                <span>{c.label}</span>
                <span className="muted">{formatMoney(c.amount_cents)} · {c.status}</span>
              </div>
              {c.status === 'used' && <CreditActions id={c.id} status={c.status} expiresAt={c.expires_at} />}
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
