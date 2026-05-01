'use client';

import { useI18n } from '@/lib/i18n';

const Footer = () => {
  const { t } = useI18n();

  return (
    <footer style={{ padding: '4rem 2rem', borderTop: '1px solid var(--border)', marginTop: '4rem' }}>
      <div className="container" style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
        <p>&copy; {new Date().getFullYear()} Local-Convert. {t('footer_processed_locally')}</p>
      </div>
    </footer>
  );
};

export default Footer;
