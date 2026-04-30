"use client";

import Link from 'next/link';
import { useI18n } from '@/src/lib/i18n';

export function Hero() {
  const { t } = useI18n();

  return (
    <section className="max-w-6xl mx-auto px-6 pt-16 pb-20 text-center">
      <p className="inline-flex items-center gap-2 rounded-full bg-ink-900 px-3 py-1 text-xs font-medium text-ink-300 ring-1 ring-ink-800 mb-6">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        100% in-browser AI · Your photos never leave your device
      </p>
      <h1 className="text-4xl sm:text-6xl font-semibold tracking-tight max-w-4xl mx-auto leading-[1.05]">
        AI photo upscaling, colorization & restoration —{' '}
        <span className="text-accent">free, private, instant.</span>
      </h1>
      <p className="mt-6 text-lg text-ink-300 max-w-2xl mx-auto">
        Sharpen blurry photos, colorize black-and-white memories, remove unwanted objects, and
        restore old portraits. Then turn the result into a museum-quality print, shipped worldwide.
      </p>
      <div className="mt-10 flex items-center justify-center gap-3">
        <Link href="/editor" className="rounded-md bg-accent px-5 py-3 text-sm font-medium text-white hover:bg-accent-hover transition">
          {t('open_editor')}
        </Link>
        <Link href="#features" className="rounded-md px-5 py-3 text-sm font-medium text-ink-200 ring-1 ring-ink-700 hover:bg-ink-900 transition">
          {t('see_features')}
        </Link>
      </div>
      <p className="mt-4 text-xs text-ink-500">{t('no_signup')}</p>
    </section>
  );
}
