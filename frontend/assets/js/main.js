/* ============================================================
   MAIN.JS — Scroll Reveals, Progress Bar, Nav State, FAQ
   CareerBridge · Vermillion Edge
   ============================================================ */

'use strict';

// ── Scroll Progress Bar ──────────────────────────────────────
(function initScrollProgress() {
  const bar = document.getElementById('scroll-progress');
  if (!bar) return;

  function updateProgress() {
    const scrolled = window.scrollY;
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const pct = maxScroll > 0 ? (scrolled / maxScroll) * 100 : 0;
    bar.style.width = pct + '%';
  }

  window.addEventListener('scroll', updateProgress, { passive: true });
  updateProgress();
})();


// ── Nav Scroll State ─────────────────────────────────────────
(function initNav() {
  const nav = document.querySelector('.nav');
  if (!nav) return;

  function onScroll() {
    if (window.scrollY > 40) {
      nav.classList.add('is-scrolled');
    } else {
      nav.classList.remove('is-scrolled');
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();


// ── Mobile Nav Toggle ────────────────────────────────────────
(function initMobileNav() {
  const toggle = document.querySelector('.nav__mobile-toggle');
  const nav = document.querySelector('.nav');
  if (!toggle || !nav) return;

  toggle.addEventListener('click', () => {
    nav.classList.toggle('is-menu-open');
    const isOpen = nav.classList.contains('is-menu-open');
    toggle.setAttribute('aria-expanded', isOpen);
    document.body.style.overflow = isOpen ? 'hidden' : '';
  });

  // Close on link click
  document.querySelectorAll('.nav__links .nav-link').forEach(link => {
    link.addEventListener('click', () => {
      nav.classList.remove('is-menu-open');
      document.body.style.overflow = '';
    });
  });
})();


// ── Intersection Observer Scroll Reveals ─────────────────────
(function initScrollReveals() {
  const targets = document.querySelectorAll('[data-reveal]');
  if (!targets.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '0px 0px -60px 0px'
  });

  targets.forEach(el => observer.observe(el));
})();


// ── Step Highlight on Scroll ─────────────────────────────────
(function initSteps() {
  const steps = document.querySelectorAll('.step');
  if (!steps.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        steps.forEach(s => s.classList.remove('is-active'));
        entry.target.classList.add('is-active');
      }
    });
  }, {
    threshold: 0.6,
    rootMargin: '0px 0px -20% 0px'
  });

  steps.forEach(step => observer.observe(step));

  // Activate first step initially
  if (steps[0]) steps[0].classList.add('is-active');
})();


// ── FAQ Accordion ────────────────────────────────────────────
(function initFAQ() {
  const items = document.querySelectorAll('.faq-item');
  if (!items.length) return;

  items.forEach(item => {
    const trigger = item.querySelector('.faq-trigger');
    const body = item.querySelector('.faq-body');
    if (!trigger || !body) return;

    trigger.addEventListener('click', () => {
      const isOpen = item.classList.contains('is-open');

      // Close all
      items.forEach(i => {
        i.classList.remove('is-open');
        const b = i.querySelector('.faq-body');
        if (b) b.style.maxHeight = null;
        const t = i.querySelector('.faq-trigger');
        if (t) t.setAttribute('aria-expanded', 'false');
      });

      // Open clicked if it was closed
      if (!isOpen) {
        item.classList.add('is-open');
        body.style.maxHeight = body.scrollHeight + 'px';
        trigger.setAttribute('aria-expanded', 'true');
      }
    });

    trigger.setAttribute('aria-expanded', 'false');
  });
})();


// ── Number Count Up Animation ────────────────────────────────
(function initCounters() {
  const counters = document.querySelectorAll('[data-count]');
  if (!counters.length) return;

  function countUp(el, target, suffix, duration) {
    const start = performance.now();
    const isFloat = target % 1 !== 0;

    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = eased * target;
      el.textContent = (isFloat ? current.toFixed(1) : Math.floor(current)) + suffix;
      if (progress < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const target = parseFloat(el.dataset.count);
        const suffix = el.dataset.suffix || '';
        const duration = parseInt(el.dataset.duration || '1400');
        countUp(el, target, suffix, duration);
        observer.unobserve(el);
      }
    });
  }, { threshold: 0.5 });

  counters.forEach(el => observer.observe(el));
})();


// ── Backend Status Fetch ──────────────────────────────────────
(function initBackendStatus() {
  const dots = document.querySelectorAll('.status-badge__dot');
  const labels = document.querySelectorAll('[data-backend-status]');
  if (!dots.length) return;

  async function checkStatus() {
    try {
      const res = await fetch('http://localhost:8787/api/status', {
        signal: AbortSignal.timeout(3000)
      });
      if (res.ok) {
        dots.forEach(d => {
          d.style.background = '#4ade80';
        });
        labels.forEach(l => {
          l.textContent = 'System online';
        });
      } else {
        throw new Error('not ok');
      }
    } catch {
      dots.forEach(d => {
        d.style.background = '#f59e0b';
      });
      labels.forEach(l => {
        l.textContent = 'Offline mode';
      });
    }
  }

  checkStatus();
  setInterval(checkStatus, 30000);
})();


// ── Word Reveal — wrap hero headline words ────────────────────
(function initWordReveal() {
  const targets = document.querySelectorAll('[data-word-reveal]');
  targets.forEach(el => {
    const words = el.textContent.trim().split(/\s+/);
    el.innerHTML = words.map(w => `<span class="word">${w}</span>`).join(' ');
    el.classList.add('word-reveal');
  });
})();
