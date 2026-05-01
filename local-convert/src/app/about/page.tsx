'use client';

import { useI18n } from '@/lib/i18n';

export default function AboutPage() {
  const { t } = useI18n();

  return (
    <main className="main container" style={{ maxWidth: '800px' }}>
      <section className="hero">
        <h1 className="hero__title">
          {t('about_hero_title').split('{highlight}').map((part, i) => (
            <span key={i}>
              {part}
              {i === 0 && <span style={{ color: 'var(--primary)' }}>{t('about_hero_title_highlight')}</span>}
            </span>
          ))}
        </h1>
        <p className="hero__subtitle">
          {t('about_hero_subtitle')}
        </p>
      </section>

      <article style={{ marginTop: '3rem', lineHeight: '1.7', fontSize: '1.1rem', color: 'var(--text)' }}>
        <h2 style={{ marginBottom: '1rem' }}>{t('about_philosophy_title')}</h2>
        <p style={{ marginBottom: '1.5rem' }}>
          {t('about_philosophy_p1')}
        </p>
        <p style={{ marginBottom: '1.5rem' }} dangerouslySetInnerHTML={{ __html: t('about_philosophy_p2') }} />

        <h2 style={{ marginTop: '3rem', marginBottom: '1rem' }}>{t('about_how_title')}</h2>
        <p style={{ marginBottom: '1rem' }}>
          {t('about_how_p1')}
        </p>
        <ul style={{ marginBottom: '2rem', paddingLeft: '1.5rem' }}>
          <li style={{ marginBottom: '0.5rem' }} dangerouslySetInnerHTML={{ __html: t('about_how_li1') }} />
          <li style={{ marginBottom: '0.5rem' }} dangerouslySetInnerHTML={{ __html: t('about_how_li2') }} />
          <li style={{ marginBottom: '0.5rem' }} dangerouslySetInnerHTML={{ __html: t('about_how_li3') }} />
        </ul>

        <h2 style={{ marginTop: '3rem', marginBottom: '1rem' }}>{t('about_why_title')}</h2>
        <p style={{ marginBottom: '1.5rem' }}>
          {t('about_why_p1')}
        </p>
        
        <div style={{ 
          marginTop: '4rem', 
          padding: '2rem', 
          background: 'var(--surface-2)', 
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)',
          textAlign: 'center'
        }}>
          <h3 style={{ marginBottom: '0.5rem' }}>{t('about_footer_title')}</h3>
          <p style={{ color: 'var(--text-muted)' }}>{t('about_footer_subtitle')}</p>
        </div>
      </article>
    </main>
  );
}
