'use client';

import Link from 'next/link';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useI18n } from '@/lib/i18n';

const Navbar = () => {
  const { t } = useI18n();

  return (
    <nav style={{ padding: '1.5rem 2rem', borderBottom: '1px solid var(--border)' }}>
      <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <Link href="/" style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--primary)' }}>
            Local-Convert
          </Link>
          <LanguageSwitcher />
        </div>
        <div style={{ display: 'flex', gap: '2rem', fontSize: '0.9rem' }}>
          <Link href="/">{t('nav_home')}</Link>
          <Link href="/tools">{t('nav_tools')}</Link>
          <Link href="/about">{t('nav_about')}</Link>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
