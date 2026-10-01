import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { TabBar } from '@/components/TabBar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) redirect('/login');

  const { count } = await supabase.from('purchases').select('id', { count: 'exact', head: true }).eq('status', 'review');

  return (
    <div className="app-shell">
      {children}
      <TabBar reviewCount={count ?? 0} />
    </div>
  );
}
