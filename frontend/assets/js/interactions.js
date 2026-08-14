/* ============================================================
   INTERACTIONS.JS — Mouse Parallax, 3D Tilt, Custom Cursor
   CareerBridge · Vermillion Edge
   ============================================================ */

'use strict';

// ── Custom Cursor ─────────────────────────────────────────────
(function initCursor() {
  const dot  = document.getElementById('cursor-dot');
  const ring = document.getElementById('cursor-ring');
  if (!dot || !ring) return;

  // Only on non-touch devices
  if (window.matchMedia('(hover: none)').matches) {
    dot.style.display = 'none';
    ring.style.display = 'none';
    return;
  }

  let mx = -100, my = -100;
  let rx = -100, ry = -100;
  let rafId = null;

  document.addEventListener('mousemove', e => {
    mx = e.clientX;
    my = e.clientY;
    if (!rafId) rafId = requestAnimationFrame(moveCursor);
  });

  function moveCursor() {
    rafId = null;
    dot.style.left  = mx + 'px';
    dot.style.top   = my + 'px';
    // Ring lags behind slightly
    rx += (mx - rx) * 0.18;
    ry += (my - ry) * 0.18;
    ring.style.left = rx + 'px';
    ring.style.top  = ry + 'px';
    rafId = requestAnimationFrame(moveCursor);
  }

  // Hover state on interactive elements
  const hoverEls = document.querySelectorAll(
    'a, button, .glass-card, .faq-trigger, .pricing-card, .marquee-item, [role="button"]'
  );

  hoverEls.forEach(el => {
    el.addEventListener('mouseenter', () => ring.classList.add('is-hovering'));
    el.addEventListener('mouseleave', () => ring.classList.remove('is-hovering'));
  });

  // Hide when cursor leaves window
  document.addEventListener('mouseleave', () => {
    dot.style.opacity = '0';
    ring.style.opacity = '0';
  });
  document.addEventListener('mouseenter', () => {
    dot.style.opacity = '1';
    ring.style.opacity = '1';
  });
})();


// ── Hero Dashboard Panel — Mouse Parallax ────────────────────
(function initHeroParallax() {
  const panel = document.querySelector('.dashboard-panel');
  const hero  = document.querySelector('.hero');
  if (!panel || !hero) return;

  if (window.matchMedia('(hover: none)').matches) return;

  let baseX = -12, baseY = 4;
  let targetX = baseX, targetY = baseY;
  let currentX = baseX, currentY = baseY;
  let animating = false;

  hero.addEventListener('mousemove', e => {
    const rect = hero.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) / (rect.width / 2);
    const dy = (e.clientY - cy) / (rect.height / 2);

    // Subtle: max ±6 degrees from base
    targetX = baseX + dx * 6;
    targetY = baseY - dy * 4;

    if (!animating) {
      animating = true;
      requestAnimationFrame(animatePanel);
    }
  });

  hero.addEventListener('mouseleave', () => {
    targetX = baseX;
    targetY = baseY;
  });

  function animatePanel() {
    const lerpFactor = 0.06;
    currentX += (targetX - currentX) * lerpFactor;
    currentY += (targetY - currentY) * lerpFactor;

    panel.style.transform =
      `perspective(1000px) rotateY(${currentX}deg) rotateX(${currentY}deg)`;

    const diff = Math.abs(currentX - targetX) + Math.abs(currentY - targetY);
    if (diff > 0.01) {
      requestAnimationFrame(animatePanel);
    } else {
      animating = false;
      // Resume float animation
      panel.style.transform = '';
    }
  }
})();


// ── Card 3D Tilt on Hover ─────────────────────────────────────
(function initCardTilt() {
  const cards = document.querySelectorAll('.glass-card[data-tilt]');
  if (!cards.length) return;

  if (window.matchMedia('(hover: none)').matches) return;

  const MAX_TILT = 8; // degrees

  cards.forEach(card => {
    let isInside = false;
    let animId = null;
    let targetRX = 0, targetRY = 0;
    let currentRX = 0, currentRY = 0;

    card.addEventListener('mouseenter', () => {
      isInside = true;
      card.style.transition = 'box-shadow 0.3s ease, border-color 0.3s ease, background 0.3s ease';
      if (!animId) animId = requestAnimationFrame(animateTilt);
    });

    card.addEventListener('mousemove', e => {
      const rect = card.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) / (rect.width / 2);
      const dy = (e.clientY - cy) / (rect.height / 2);

      targetRX = -dy * MAX_TILT;
      targetRY =  dx * MAX_TILT;
    });

    card.addEventListener('mouseleave', () => {
      isInside = false;
      targetRX = 0;
      targetRY = 0;
      card.style.transition = 'all 0.6s cubic-bezier(0.16, 1, 0.3, 1)';
    });

    function animateTilt() {
      const lerpFactor = isInside ? 0.12 : 0.08;
      currentRX += (targetRX - currentRX) * lerpFactor;
      currentRY += (targetRY - currentRY) * lerpFactor;

      const tZ = isInside ? -6 : 0;
      card.style.transform =
        `perspective(800px) rotateX(${currentRX}deg) rotateY(${currentRY}deg) translateY(${tZ}px)`;

      const diff = Math.abs(currentRX) + Math.abs(currentRY);
      if (diff > 0.05 || isInside) {
        animId = requestAnimationFrame(animateTilt);
      } else {
        card.style.transform = '';
        card.style.transition = '';
        animId = null;
      }
    }
  });
})();


// ── Marquee Pause on Hover ────────────────────────────────────
// (Handled via CSS: .marquee-track:hover .marquee-inner { animation-play-state: paused; })
// JS fallback for touch devices if needed
(function initMarquee() {
  const tracks = document.querySelectorAll('.marquee-track');
  if (!tracks.length) return;

  tracks.forEach(track => {
    const inner = track.querySelector('.marquee-inner');
    if (!inner) return;

    track.addEventListener('touchstart', () => {
      inner.style.animationPlayState = 'paused';
    }, { passive: true });

    track.addEventListener('touchend', () => {
      inner.style.animationPlayState = 'running';
    }, { passive: true });
  });
})();


// ── Smooth anchor scroll ─────────────────────────────────────
(function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', e => {
      const id = anchor.getAttribute('href').slice(1);
      const target = document.getElementById(id);
      if (!target) return;
      e.preventDefault();

      const navHeight = document.querySelector('.nav')?.offsetHeight || 80;
      const top = target.getBoundingClientRect().top + window.scrollY - navHeight - 24;
      window.scrollTo({ top, behavior: 'smooth' });
    });
  });
})();


// ── ATS Ring Animation on scroll into view ────────────────────
(function initATSRing() {
  const ring = document.querySelector('.ats-ring-fill');
  if (!ring) return;

  let fired = false;
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !fired) {
        fired = true;
        ring.style.animation = 'ring-fill 1.4s cubic-bezier(0.16, 1, 0.3, 1) forwards';
        observer.disconnect();
      }
    });
  }, { threshold: 0.5 });

  observer.observe(ring);
})();
