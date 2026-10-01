'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Stub's tab bar (bottom on phones, a left rail on desktop), with Refund's four tabs. */
const TABS = [
  { href: '/', label: 'Watching', icon: 'eye' },
  { href: '/review', label: 'Review', icon: 'inbox' },
  { href: '/add', label: 'Add', icon: 'plus' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
] as const;

function Icon({ name }: { name: string }) {
  const c = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24', 'aria-hidden': true };
  switch (name) {
    case 'eye':
      return <svg {...c}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>;
    case 'inbox':
      return <svg {...c}><path d="M3 13h5l1.5 3h5L16 13h5" /><path d="M4.5 6h15l1.5 7v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Z" /></svg>;
    case 'plus':
      return <svg {...c}><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></svg>;
    default:
      return <svg {...c}><circle cx="12" cy="12" r="3.2" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></svg>;
  }
}

export function TabBar({ reviewCount = 0 }: { reviewCount?: number }) {
  const pathname = usePathname();
  return (
    <nav className="tabbar" aria-label="Main">
      <div className="rail-brand" aria-hidden="true">Refund</div>
      {TABS.map((tab) => {
        const active = tab.href === '/' ? pathname === '/' || pathname.startsWith('/purchases') : pathname.startsWith(tab.href);
        return (
          <Link key={tab.href} href={tab.href} data-active={active} aria-current={active ? 'page' : undefined}>
            <Icon name={tab.icon} />
            {tab.href === '/review' && reviewCount > 0 && (
              <span className="badge">
                <span aria-hidden="true">{reviewCount > 9 ? '9+' : reviewCount}</span>
                <span className="sr-only">{reviewCount} to review</span>
              </span>
            )}
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
