"use client";

import Link from 'next/link';
import { useI18n } from '@/src/lib/i18n';

export function PrintCTA() {
  const { t } = useI18n();

  return (
    <section id="prints" className="max-w-6xl mx-auto px-6 py-20">
      <div className="rounded-2xl bg-gradient-to-br from-accent/20 to-ink-900 ring-1 ring-ink-800 p-10 sm:p-14 text-center">
        <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">{t('skip_print_shop')}</h2>
        <p className="mt-4 text-ink-300 max-w-2xl mx-auto">
          {t('order_print')}. {t('no_signup')}
        </p>
        <div className="mt-8">
          <Link href="/editor" className="rounded-md bg-accent px-5 py-3 text-sm font-medium text-white hover:bg-accent-hover transition">
            {t('start_editing')}
          </Link>
        </div>
      </div>
    </section>
  );
}
