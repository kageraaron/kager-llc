"use client";

import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/lib/i18n";
import Link from "next/link";

export function SiteHeader() {
  const { t } = useI18n();

  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Link className="brand" href="/">
          <span className="brand__mark">S</span>
          <span>Subtitle-Gen</span>
        </Link>
        <nav className="nav-links" aria-label="Primary">
          <a href="#studio">{t("nav_studio")}</a>
          <a href="#privacy">{t("nav_privacy")}</a>
        </nav>
        <LanguageSwitcher />
      </div>
    </header>
  );
}

export function SiteFooter() {
  const { t } = useI18n();

  return (
    <footer className="site-footer">
      <div className="container">
        <p>&copy; {new Date().getFullYear()} Subtitle-Gen. {t("footer_processed_locally")}</p>
      </div>
    </footer>
  );
}
