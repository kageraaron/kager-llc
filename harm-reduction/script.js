// ── Vercel Web Analytics ──────────────────────────────────────────────────
import { inject } from '@vercel/analytics';
inject();

(function() {
  const navLinks = document.querySelector('.nav-links');
  const navToggle = document.querySelector('.nav-toggle');
  const header = document.getElementById('site-header');

  // ── Active page highlighting ──────────────────────────────────────────────
  // Detect current page and mark matching nav link as active.
  // All pages share identical nav HTML, so JS does the active-state work.
  const currentFile = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links > li > a').forEach(link => {
    const linkFile = (link.getAttribute('href') || '').split('#')[0];
    if (linkFile === currentFile) link.classList.add('active');
  });
  // Also mark the dropdown parent active when on mdma.html
  const mdmaDropdown = document.querySelector('.nav-dropdown');
  if (mdmaDropdown && currentFile === 'mdma.html') {
    mdmaDropdown.querySelector(':scope > a')?.classList.add('active');
  }

  // ── Dropdown toggle (click, for mobile + keyboard users) ─────────────────
  if (mdmaDropdown) {
    const dropdownToggle = mdmaDropdown.querySelector(':scope > a');

    // On mobile the tap should toggle open instead of navigating.
    // On desktop CSS :hover handles it; clicks still navigate to mdma.html.
    dropdownToggle?.addEventListener('click', (e) => {
      const isMobileMenuOpen = navLinks?.classList.contains('nav-open');
      if (isMobileMenuOpen) {
        e.preventDefault();
        mdmaDropdown.classList.toggle('open');
      }
    });

    // Close dropdown when clicking outside (desktop)
    document.addEventListener('click', (e) => {
      if (!mdmaDropdown.contains(e.target)) {
        mdmaDropdown.classList.remove('open');
      }
    });

    // Escape key closes dropdown
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') mdmaDropdown.classList.remove('open');
    });
  }

  // ── Smooth scroll for anchor links ───────────────────────────────────────
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const href = this.getAttribute('href');
      if (href === '#') return;
      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        navLinks?.classList.remove('nav-open');
        navToggle?.setAttribute('aria-expanded', 'false');
        mdmaDropdown?.classList.remove('open');
      }
    });
  });

  // ── Sticky header hide-on-scroll ─────────────────────────────────────────
  let lastScroll = 0;
  window.addEventListener('scroll', () => {
    if (!header) return;
    const currentScroll = window.scrollY;
    header.classList.toggle('scrolled', currentScroll > 40);
    if (currentScroll > 300) {
      header.classList.toggle('hidden', currentScroll > lastScroll);
    } else {
      header.classList.remove('hidden');
    }
    lastScroll = Math.max(0, currentScroll);
  }, { passive: true });

  // ── Active section highlight on scroll (anchor pages only) ───────────────
  const sections = document.querySelectorAll('section[id]');
  const anchorNavLinks = document.querySelectorAll('.nav-links a[href^="#"]');

  if (sections.length > 0 && anchorNavLinks.length > 0 && 'IntersectionObserver' in window) {
    const sectionObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const id = entry.target.getAttribute('id');
          anchorNavLinks.forEach(link => {
            link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
          });
        }
      });
    }, { rootMargin: '-20% 0px -70% 0px' });
    sections.forEach(section => sectionObserver.observe(section));
  }

  // ── Mobile nav toggle ─────────────────────────────────────────────────────
  navToggle?.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = navLinks?.classList.toggle('nav-open');
    navToggle.setAttribute('aria-expanded', String(isOpen));
    // Reset dropdown state when closing the whole mobile menu
    if (!isOpen) mdmaDropdown?.classList.remove('open');
  });

  // Close mobile nav on outside click
  document.addEventListener('click', (e) => {
    if (navLinks?.classList.contains('nav-open') &&
        !navLinks.contains(e.target) &&
        !navToggle?.contains(e.target)) {
      navLinks.classList.remove('nav-open');
      navToggle?.setAttribute('aria-expanded', 'false');
      mdmaDropdown?.classList.remove('open');
    }
  });

  // ── FAQ Accordion ─────────────────────────────────────────────────────────
  document.querySelectorAll('.faq-item').forEach(item => {
    const question = item.querySelector('.faq-question');
    if (!question) return;
    question.onclick = function(e) {
      e.preventDefault();
      const isActive = item.classList.contains('active');
      document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('active'));
      if (!isActive) item.classList.add('active');
    };
  });
})();
