import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { getPendingCount } from '@/lib/queries';
import { TabBar } from '@/components/TabBar';
import { AddShowProvider } from '@/components/AddShow';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) redirect('/login');

  const pending = await getPendingCount(supabase, user.id);

  return (
    <div className="app-shell">
      {/*
        * The sheet lives here rather than on each page so there is exactly one
        * of it: the header buttons and the empty states all raise the same
        * dialog. `children` stays server-rendered — it is passed through the
        * client provider as a prop, not imported by it.
        */}
      <AddShowProvider>
        {children}
        <TabBar inboxCount={pending} />
      </AddShowProvider>
    </div>
  );
}
