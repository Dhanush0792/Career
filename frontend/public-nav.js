/**
 * CareerHub // public-nav.js
 * Injects the unified 4-group dropdown navigation into all public pages.
 * Usage: <script src="public-nav.js"></script>
 *        Call injectPublicNav() after DOM ready, or it auto-runs on load.
 * Contact: missionhousehq@gmail.com
 */

(function () {
  const NAV_CSS = `
/* ─── Public Dropdown Nav ────────────────────────────────────────────────── */
.ch-nav {
  position: fixed; top: 0; left: 0; right: 0; height: 62px;
  background: rgba(11,16,32,0.94);
  border-bottom: 1px solid rgba(255,255,255,0.12);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  z-index: 9000;
  display: flex; align-items: center;
}
.ch-nav__inner {
  max-width: 1240px; margin: 0 auto; padding: 0 28px;
  width: 100%; display: flex; align-items: center; gap: 4px;
}
.ch-nav__logo {
  font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 700;
  color: #fff; text-decoration: none;
  display: flex; align-items: center; gap: 0;
  margin-right: 20px; flex-shrink: 0; letter-spacing: .02em;
}
.ch-nav__logo-bracket { color: #5B4FE8; }

/* Nav Groups container */
.ch-nav__groups { display: flex; gap: 2px; align-items: center; margin-left: auto; margin-right: 16px; }

/* Each dropdown group */
.ch-nav__group { position: relative; }

.ch-nav__group-btn {
  display: inline-flex; align-items: center; gap: 5px;
  font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 600;
  color: rgba(244,247,255,0.72); text-transform: uppercase; letter-spacing: .07em;
  padding: 8px 16px; background: transparent; border: none; cursor: pointer;
  border-radius: 8px; transition: color .18s, background .18s;
  white-space: nowrap;
}
.ch-nav__group-btn:hover,
.ch-nav__group:hover .ch-nav__group-btn {
  color: #fff; background: rgba(255,255,255,0.07);
}
.ch-nav__group-btn .caret {
  width: 10px; height: 10px; flex-shrink: 0; opacity: .6;
  transition: transform .2s cubic-bezier(.16,1,.3,1);
}
.ch-nav__group:hover .ch-nav__group-btn .caret { transform: rotate(180deg); opacity: 1; }

/* Dropdown panel */
.ch-nav__dropdown {
  position: absolute; top: calc(100% + 10px); left: 0;
  min-width: 230px;
  background: rgba(8,12,28,0.98);
  border: 1px solid rgba(255,255,255,0.14);
  border-radius: 14px; padding: 8px 6px;
  backdrop-filter: blur(28px); -webkit-backdrop-filter: blur(28px);
  box-shadow: 0 24px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(91,79,232,0.08);
  opacity: 0; pointer-events: none;
  transform: translateY(-8px) scale(.98);
  transform-origin: top left;
  transition: opacity .18s cubic-bezier(.16,1,.3,1),
              transform .18s cubic-bezier(.16,1,.3,1);
  z-index: 9001;
}
.ch-nav__group:hover .ch-nav__dropdown,
.ch-nav__group:focus-within .ch-nav__dropdown {
  opacity: 1; pointer-events: all; transform: translateY(0) scale(1);
}

/* Dropdown items */
.ch-nav__dd-label {
  font-family: 'JetBrains Mono', monospace; font-size: 9px;
  letter-spacing: .12em; text-transform: uppercase;
  color: rgba(244,247,255,0.3); padding: 8px 10px 4px;
}
.ch-nav__dd-link {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 10px; border-radius: 9px;
  font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 500;
  color: rgba(244,247,255,0.78); text-decoration: none;
  transition: background .14s, color .14s;
  white-space: nowrap;
}
.ch-nav__dd-link:hover {
  background: rgba(91,79,232,0.13); color: #fff;
}
.ch-nav__dd-icon {
  width: 22px; height: 22px; border-radius: 6px; flex-shrink: 0;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08);
  display: flex; align-items: center; justify-content: center;
  font-size: 12px;
}
.ch-nav__dd-divider {
  height: 1px; background: rgba(255,255,255,0.08); margin: 6px 8px;
}

/* Get Started CTA (right side) */
.ch-nav__cta { position: relative; flex-shrink: 0; }
.ch-nav__cta-btn {
  display: inline-flex; align-items: center; gap: 6px;
  height: 38px; padding: 0 20px;
  background: #5B4FE8; color: #fff; border: none;
  font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 700;
  letter-spacing: .09em; text-transform: uppercase;
  border-radius: 10px; cursor: pointer;
  box-shadow: 0 4px 16px rgba(91,79,232,0.35);
  transition: background .2s, box-shadow .2s;
}
.ch-nav__cta-btn:hover { background: rgba(91,79,232,0.88); box-shadow: 0 6px 22px rgba(91,79,232,0.45); }
.ch-nav__cta-btn .caret { width: 10px; height: 10px; transition: transform .2s; }
.ch-nav__cta:hover .ch-nav__cta-btn .caret { transform: rotate(180deg); }
.ch-nav__cta:hover .ch-nav__dropdown,
.ch-nav__cta:focus-within .ch-nav__dropdown {
  opacity: 1; pointer-events: all; transform: translateY(0) scale(1);
}
.ch-nav__cta .ch-nav__dropdown { right: 0; left: auto; transform-origin: top right; }
.ch-nav__dd-link--accent { color: #5B4FE8; }
.ch-nav__dd-link--accent:hover { background: rgba(91,79,232,0.13); color: #7b72f0; }

/* Mobile hamburger */
.ch-nav__hamburger {
  display: none; background: none; border: none;
  color: rgba(244,247,255,0.75); cursor: pointer; padding: 8px;
  margin-left: auto; flex-direction: column; gap: 5px; align-items: center;
}
.ch-nav__hamburger span {
  display: block; width: 22px; height: 2px;
  background: currentColor; border-radius: 2px;
  transition: all .2s;
}

/* Mobile drawer */
.ch-nav__drawer {
  display: none; position: fixed; top: 62px; left: 0; right: 0; bottom: 0;
  background: rgba(8,12,28,0.98); backdrop-filter: blur(28px);
  overflow-y: auto; z-index: 8999; padding: 20px 24px 40px;
  flex-direction: column; gap: 4px;
}
.ch-nav__drawer.open { display: flex; }
.ch-nav__drawer-section { margin-bottom: 8px; }
.ch-nav__drawer-title {
  font-family: 'JetBrains Mono', monospace; font-size: 9px; letter-spacing: .14em;
  text-transform: uppercase; color: rgba(244,247,255,0.35); padding: 12px 4px 6px;
  border-bottom: 1px solid rgba(255,255,255,0.07); margin-bottom: 4px;
}
.ch-nav__drawer-link {
  display: flex; align-items: center; gap: 10px;
  padding: 11px 8px; border-radius: 10px;
  font-family: 'JetBrains Mono', monospace; font-size: 12px;
  color: rgba(244,247,255,0.8); text-decoration: none;
  transition: background .15s;
}
.ch-nav__drawer-link:hover { background: rgba(91,79,232,0.12); color: #fff; }
.ch-nav__drawer-cta {
  display: flex; align-items: center; justify-content: center;
  height: 48px; margin-top: 16px;
  background: #5B4FE8; color: #fff; border-radius: 12px;
  font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 700;
  text-transform: uppercase; text-decoration: none;
}

@media (max-width: 780px) {
  .ch-nav__groups { display: none; }
  .ch-nav__cta { display: none; }
  .ch-nav__hamburger { display: flex; }
}
`;

  const CARET_SVG = `<svg class="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>`;

  const NAV_HTML = `
<nav class="ch-nav" id="ch-pub-nav" role="navigation" aria-label="Main">
  <div class="ch-nav__inner">

    <a href="index.html" class="ch-nav__logo" aria-label="JobXApply Home" style="display:flex;align-items:center;gap:10px;text-decoration:none;">
      <img src="assets/logo.svg" alt="JobXApply Logo" style="width:26px;height:26px;object-fit:contain;filter:drop-shadow(0 2px 8px rgba(91,79,232,0.4));">
      <span style="font-family:var(--ch-display,'Barlow Condensed',sans-serif);font-size:22px;font-weight:900;letter-spacing:0.04em;color:#fff;text-transform:uppercase;">JOB<span style="background:linear-gradient(135deg,#5B4FE8,#2FDDC4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">X</span>APPLY</span>
    </a>

    <div class="ch-nav__groups">

      <!-- ① DISCOVER -->
      <div class="ch-nav__group" role="menuitem">
        <button class="ch-nav__group-btn" aria-haspopup="true" aria-expanded="false">
          Discover ${CARET_SVG}
        </button>
        <div class="ch-nav__dropdown" role="menu">
          <div class="ch-nav__dd-label">Explore</div>
          <a href="features.html"    class="ch-nav__dd-link"><span class="ch-nav__dd-icon">⊕</span>Features</a>
          <a href="portals.html"     class="ch-nav__dd-link"><span class="ch-nav__dd-icon">◈</span>Job Portals <small style="opacity:.5;font-size:9px;margin-left:4px;">50+</small></a>
          <a href="how-it-works.html" class="ch-nav__dd-link"><span class="ch-nav__dd-icon">◎</span>How it Works</a>
          <div class="ch-nav__dd-divider"></div>
          <div class="ch-nav__dd-label">Read</div>
          <a href="blog.html"        class="ch-nav__dd-link"><span class="ch-nav__dd-icon">✦</span>Blog &amp; Career Intel</a>
          <a href="pricing.html"     class="ch-nav__dd-link"><span class="ch-nav__dd-icon">◧</span>Pricing</a>
        </div>
      </div>

      <!-- ② TOOLS -->
      <div class="ch-nav__group" role="menuitem">
        <button class="ch-nav__group-btn" aria-haspopup="true" aria-expanded="false">
          Tools ${CARET_SVG}
        </button>
        <div class="ch-nav__dropdown" role="menu">
          <div class="ch-nav__dd-label">Career Tools</div>
          <a href="resume-builder.html"  class="ch-nav__dd-link"><span class="ch-nav__dd-icon">📄</span>Resume Builder</a>
          <a href="ats-checker.html"     class="ch-nav__dd-link"><span class="ch-nav__dd-icon">◉</span>ATS Checker</a>
          <a href="cover-letter.html"    class="ch-nav__dd-link"><span class="ch-nav__dd-icon">✉</span>Cover Letter</a>
          <div class="ch-nav__dd-divider"></div>
          <div class="ch-nav__dd-label">Autofill</div>
          <a href="autofill-lab.html"    class="ch-nav__dd-link"><span class="ch-nav__dd-icon">⊛</span>Autofill Lab</a>
          <a href="extension-landing.html" class="ch-nav__dd-link"><span class="ch-nav__dd-icon">⬡</span>Browser Extension</a>
          <a href="extension-setup.html" class="ch-nav__dd-link"><span class="ch-nav__dd-icon">↓</span>Install Guide</a>
        </div>
      </div>

      <!-- ③ COMPANY -->
      <div class="ch-nav__group" role="menuitem">
        <button class="ch-nav__group-btn" aria-haspopup="true" aria-expanded="false">
          Company ${CARET_SVG}
        </button>
        <div class="ch-nav__dropdown" role="menu">
          <a href="about.html"         class="ch-nav__dd-link"><span class="ch-nav__dd-icon">◇</span>About Us</a>
          <a href="contact.html"       class="ch-nav__dd-link"><span class="ch-nav__dd-icon">✉</span>Contact Us</a>
          <a href="mailto:missionhousehq@gmail.com" class="ch-nav__dd-link"><span class="ch-nav__dd-icon">@</span>missionhousehq@gmail.com</a>
          <div class="ch-nav__dd-divider"></div>
          <a href="privacy-terms.html" class="ch-nav__dd-link"><span class="ch-nav__dd-icon">⚿</span>Privacy &amp; Terms</a>
        </div>
      </div>

    </div><!-- end groups -->

    <!-- ④ GET STARTED (CTA dropdown) -->
    <div class="ch-nav__cta" role="menuitem">
      <button class="ch-nav__cta-btn" aria-haspopup="true" aria-expanded="false" id="ch-cta-btn">
        Get Started ${CARET_SVG}
      </button>
      <div class="ch-nav__dropdown" role="menu">
        <div class="ch-nav__dd-label">Account</div>
        <a href="auth.html"             class="ch-nav__dd-link ch-nav__dd-link--accent"><span class="ch-nav__dd-icon">→</span>Login</a>
        <a href="auth.html#signup"      class="ch-nav__dd-link"><span class="ch-nav__dd-icon">＋</span>Sign Up</a>
      </div>
    </div>

    <!-- Mobile hamburger -->
    <button class="ch-nav__hamburger" id="ch-hamburger" aria-label="Open menu">
      <span></span><span></span><span></span>
    </button>

  </div>
</nav>

<!-- Mobile drawer -->
<div class="ch-nav__drawer" id="ch-drawer" role="dialog" aria-modal="true">
  <div class="ch-nav__drawer-section">
    <div class="ch-nav__drawer-title">Discover</div>
    <a href="features.html"     class="ch-nav__drawer-link">⊕ Features</a>
    <a href="portals.html"      class="ch-nav__drawer-link">◈ Job Portals (50+)</a>
    <a href="how-it-works.html" class="ch-nav__drawer-link">◎ How it Works</a>
    <a href="blog.html"         class="ch-nav__drawer-link">✦ Blog &amp; Career Intel</a>
    <a href="pricing.html"      class="ch-nav__drawer-link">◧ Pricing</a>
  </div>
  <div class="ch-nav__drawer-section">
    <div class="ch-nav__drawer-title">Tools</div>
    <a href="resume-builder.html"  class="ch-nav__drawer-link">📄 Resume Builder</a>
    <a href="ats-checker.html"     class="ch-nav__drawer-link">◉ ATS Checker</a>
    <a href="cover-letter.html"    class="ch-nav__drawer-link">✉ Cover Letter</a>
    <a href="autofill-lab.html"    class="ch-nav__drawer-link">⊛ Autofill Lab</a>
    <a href="extension-landing.html" class="ch-nav__drawer-link">⬡ Browser Extension</a>
  </div>
  <div class="ch-nav__drawer-section">
    <div class="ch-nav__drawer-title">Company</div>
    <a href="about.html"          class="ch-nav__drawer-link">◇ About Us</a>
    <a href="contact.html"        class="ch-nav__drawer-link">✉ Contact Us</a>
    <a href="mailto:missionhousehq@gmail.com" class="ch-nav__drawer-link">@ missionhousehq@gmail.com</a>
    <a href="privacy-terms.html"  class="ch-nav__drawer-link">⚿ Privacy &amp; Terms</a>
  </div>
  <div class="ch-nav__drawer-section">
    <div class="ch-nav__drawer-title">Account</div>
    <a href="auth.html"            class="ch-nav__drawer-link">→ Login</a>
    <a href="auth.html#signup"     class="ch-nav__drawer-link">＋ Sign Up</a>
  </div>
  <a href="auth.html" class="ch-nav__drawer-cta">GET STARTED →</a>
</div>
`;

  function injectPublicNav() {
    // 1) Inject CSS
    if (!document.getElementById('ch-nav-style')) {
      const style = document.createElement('style');
      style.id = 'ch-nav-style';
      style.textContent = NAV_CSS;
      document.head.appendChild(style);
    }

    // 2) Remove any existing inline nav (the old flat nav)
    const oldNav = document.querySelector('nav:not(#ch-pub-nav)');
    if (oldNav && !oldNav.id) oldNav.remove();

    // 3) Inject nav HTML at top of body
    if (!document.getElementById('ch-pub-nav')) {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = NAV_HTML;
      // Insert nav and drawer before first child
      const body = document.body;
      const firstChild = body.firstChild;
      while (wrapper.firstChild) {
        body.insertBefore(wrapper.firstChild, firstChild);
      }
    }

    // 4) Wire up hamburger toggle
    const hamburger = document.getElementById('ch-hamburger');
    const drawer    = document.getElementById('ch-drawer');
    if (hamburger && drawer) {
      hamburger.addEventListener('click', () => {
        const isOpen = drawer.classList.toggle('open');
        hamburger.setAttribute('aria-expanded', isOpen);
        hamburger.querySelectorAll('span')[0].style.transform = isOpen ? 'rotate(45deg) translate(5px,5px)' : '';
        hamburger.querySelectorAll('span')[1].style.opacity  = isOpen ? '0' : '1';
        hamburger.querySelectorAll('span')[2].style.transform = isOpen ? 'rotate(-45deg) translate(5px,-5px)' : '';
      });
      // Close drawer on link click
      drawer.querySelectorAll('a').forEach(a => {
        a.addEventListener('click', () => {
          drawer.classList.remove('open');
          hamburger.setAttribute('aria-expanded', false);
        });
      });
    }

    // 5) Ensure body padding accounts for nav height
    document.body.style.paddingTop = '62px';
  }

  // Auto-run
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectPublicNav);
  } else {
    injectPublicNav();
  }

  // Expose globally for manual calls
  window.injectPublicNav = injectPublicNav;
})();
