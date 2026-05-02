'use client';

import { useI18n } from '@/lib/i18n';

export default function HeaderNav() {
  const { t } = useI18n();

  return (
    <nav className="hidden md:flex items-center gap-8">
      <a href="#calibrate" className="text-sm font-bold text-gray-500 hover:text-blue-600 transition-colors uppercase tracking-tighter">
        {t('nav_calibration')}
      </a>
      <a href="#resources" className="text-sm font-bold text-gray-500 hover:text-blue-600 transition-colors uppercase tracking-tighter">
        {t('nav_library')}
      </a>
      <a href="#tools" className="text-sm font-bold text-gray-500 hover:text-blue-600 transition-colors uppercase tracking-tighter">
        {t('nav_tools')}
      </a>
    </nav>
  );
}
