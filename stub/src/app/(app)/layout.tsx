import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { getPendingCount } from '@/lib/queries';
import { TabBar } from '@/components/TabBar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) redirect('/login');

  const pending = await getPendingCount(supabase, user.id);

  return (
    <div className="app-shell">
      {children}
      <TabBar inboxCount={pending} />
    </div>
  );
}
