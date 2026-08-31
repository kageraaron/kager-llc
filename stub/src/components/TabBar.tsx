'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/*
 * Browse is deliberately NOT in here.
 *
 * Stub is a memory app: the job is recording the shows you went to, and search
 * and purchase are things other apps already do well. The `/browse` route still
 * exists and still works — links and bookmarks to it are not broken, and it is
 * reachable from the Add sheet — it is just not one of the five things the app
 * puts in front of you.
 *
 * Add is not here either, and that is a change: manual entry is still the
 * memory-app primitive, but it is an ACTION, not a destination. It now opens as
 * a sheet from the Upcoming and Archive headers, which keeps you in the list
 * you were reading. The freed slot goes to Settings, which was previously
 * reachable only through a button at the bottom of Friends — the app's own
 * settings should not be the hardest screen in it to find.
 */
const TABS = [
  { href: '/upcoming', label: 'Upcoming', icon: 'calendar' },
  { href: '/inbox', label: 'Inbox', icon: 'inbox' },
  { href: '/friends', label: 'Friends', icon: 'friends' },
  { href: '/archive', label: 'Archive', icon: 'archive' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
] as const;

function Icon({ name }: { name: string }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    viewBox: '0 0 24 24',
    'aria-hidden': true,
  };
  switch (name) {
    case 'calendar':
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="16" rx="3" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      );
    // Kept: `/browse` still exists and still renders this icon on its own page.
    case 'search':
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3.2" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.7 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.7a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.1 4.7a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.3 9c.2.62.77 1.03 1.42 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z" />
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
    <nav className="tabbar" aria-label="Main">
      {TABS.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            // `data-active` drives the styling; `aria-current` is what actually
            // tells a screen reader which of the five you are on.
            data-active={active}
            aria-current={active ? 'page' : undefined}
          >
            <Icon name={tab.icon} />
            {tab.href === '/inbox' && inboxCount > 0 && (
              <span className="badge">
                <span aria-hidden="true">{inboxCount > 9 ? '9+' : inboxCount}</span>
                {/* Without this the badge reads as a bare number glued to the
                    label — "3 Inbox" — with no clue what the 3 counts. */}
                <span className="sr-only">{inboxCount} to review</span>
              </span>
            )}
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
