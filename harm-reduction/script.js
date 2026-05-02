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
const header = document.getElementById('site-header');
let lastScroll = 0;

window.addEventListener('scroll', () => {
  const currentScroll = window.scrollY;
  header.classList.toggle('scrolled', currentScroll > 40);
  // Only hide after scrolling down 300px, and only when scrolling down
  if (currentScroll > 300) {
    header.classList.toggle('hidden', currentScroll > lastScroll);
  } else {
    header.classList.remove('hidden');
  }
  lastScroll = Math.max(0, currentScroll);
}, { passive: true });

// Active nav link on scroll
const sections = document.querySelectorAll('section[id]');
const navLinks = document.querySelector('.nav-links');
const navLinkItems = document.querySelectorAll('.nav-links a[href^="#"]');
const navToggle = document.querySelector('.nav-toggle');

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

// Mobile nav toggle
navToggle?.addEventListener('click', () => {
  const isOpen = navLinks.classList.toggle('nav-open');
  navToggle.setAttribute('aria-expanded', String(isOpen));
});

// Close mobile nav on outside click
document.addEventListener('click', (e) => {
  if (navLinks?.classList.contains('nav-open') &&
      !navLinks.contains(e.target) &&
      !navToggle.contains(e.target)) {
    navLinks.classList.remove('nav-open');
    navToggle.setAttribute('aria-expanded', 'false');
  }
});
