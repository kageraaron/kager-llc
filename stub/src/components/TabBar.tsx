'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/upcoming', label: 'Upcoming', icon: 'calendar' },
  { href: '/browse', label: 'Browse', icon: 'search' },
  { href: '/inbox', label: 'Inbox', icon: 'inbox' },
  { href: '/friends', label: 'Friends', icon: 'friends' },
  { href: '/archive', label: 'Archive', icon: 'archive' },
] as const;

function Icon({ name }: { name: string }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    viewBox: '0 0 24 24',
  };
  switch (name) {
    case 'calendar':
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="16" rx="3" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      );
    case 'search':
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      );
    case 'inbox':
      return (
        <svg {...common}>
          <path d="M3 13h5l1.5 3h5L16 13h5" />
          <path d="M4.5 6h15l1.5 7v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Z" />
        </svg>
      );
    case 'friends':
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.2" />
          <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
          <path d="M16.5 5.5a3.2 3.2 0 0 1 0 6M17 14.5a6.5 6.5 0 0 1 4.5 5.5" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="4" rx="1.5" />
          <path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8M10 12h4" />
        </svg>
      );
  }
}

export function TabBar({ inboxCount = 0 }: { inboxCount?: number }) {
  const pathname = usePathname();

  return (
    <nav className="tabbar">
      {TABS.map((tab) => (
        <Link key={tab.href} href={tab.href} data-active={pathname.startsWith(tab.href)}>
          <Icon name={tab.icon} />
          {tab.href === '/inbox' && inboxCount > 0 && (
            <span className="badge">{inboxCount > 9 ? '9+' : inboxCount}</span>
          )}
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
