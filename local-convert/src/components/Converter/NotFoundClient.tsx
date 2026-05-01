'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n';

const NotFoundClient = () => {
  const { t } = useI18n();

  return (
    <div style={{ padding: '4rem 0', textAlign: 'center' }}>
      <h1>{t('convert_not_found')}</h1>
      <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
        {t('convert_not_found_desc')}
      </p>
      <Link href="/" className="btn btn--primary btn--lg" style={{ marginTop: '2rem' }}>
        {t('btn_browse_all')}
      </Link>
    </div>
  );
};

export default NotFoundClient;
