(function() {
  // Elements
  const navLinks = document.querySelector('.nav-links');
  const navToggle = document.querySelector('.nav-toggle');
  const header = document.getElementById('site-header');

  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const href = this.getAttribute('href');
      if (href === '#') return;
      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Close mobile nav if open
        navLinks?.classList.remove('nav-open');
        navToggle?.setAttribute('aria-expanded', 'false');
      }
    });
  });

  // Sticky header hide-on-scroll behavior
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

  // Active nav link on scroll
  const sections = document.querySelectorAll('section[id]');
  const navLinkItems = document.querySelectorAll('.nav-links a[href^="#"]');

  if (sections.length > 0 && 'IntersectionObserver' in window) {
    const sectionObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const id = entry.target.getAttribute('id');
          navLinkItems.forEach(link => {
            link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
          });
        }
      });
    }, {
      rootMargin: '-20% 0px -70% 0px'
    });
    sections.forEach(section => sectionObserver.observe(section));
  }

  // Mobile nav toggle
  navToggle?.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = navLinks?.classList.toggle('nav-open');
    navToggle.setAttribute('aria-expanded', String(isOpen));
  });

  // FAQ Accordion
  function initFAQ() {
    const faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach(item => {
      const question = item.querySelector('.faq-question');
      if (!question) return;

      question.onclick = function(e) {
        e.preventDefault();
        const isActive = item.classList.contains('active');
        
        // Close all other items
        faqItems.forEach(otherItem => {
          otherItem.classList.remove('active');
        });
        
        // Toggle current item
        if (!isActive) {
          item.classList.add('active');
        }
      };
    });
  }

  // Run FAQ init immediately
  initFAQ();

  // Close mobile nav on outside click
  document.addEventListener('click', (e) => {
    if (navLinks?.classList.contains('nav-open') &&
        !navLinks.contains(e.target) &&
        !navToggle?.contains(e.target)) {
      navLinks.classList.remove('nav-open');
      navToggle?.setAttribute('aria-expanded', 'false');
    }
  });
})();
