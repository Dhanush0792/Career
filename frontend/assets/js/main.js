// Initialize AOS (Animate on Scroll)
AOS.init({
  duration: 600,
  offset: 50,
  easing: 'ease-out-cubic',
  once: false,
  mirror: false,
  disable: false
});

// Smooth scroll to sections
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', (e) => {
    const href = link.getAttribute('href');
    if (href !== '#' && document.querySelector(href)) {
      e.preventDefault();
      const element = document.querySelector(href);
      const headerOffset = 80;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
      
      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  });
});

// Scroll progress bar
const progress = document.getElementById('progress');
window.addEventListener('scroll', () => {
  const windowHeight = document.documentElement.scrollHeight - window.innerHeight;
  const scrolled = (window.scrollY / windowHeight) * 100;
  if (progress) {
    progress.style.width = scrolled + '%';
  }
}, { passive: true });

// FAQ Accordion
const faqItems = document.querySelectorAll('.faq-item');
faqItems.forEach(item => {
  const button = item.querySelector('.faq-button');
  if (button) {
    button.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');
      
      // Close all items
      faqItems.forEach(i => i.classList.remove('open'));
      
      // Open clicked item if it wasn't open
      if (!isOpen) {
        item.classList.add('open');
      }
    });
  }
});

// Form interaction
const formInputs = document.querySelectorAll('input, textarea');
formInputs.forEach(input => {
  input.addEventListener('focus', () => {
    input.parentElement?.classList.add('focused');
  });
  
  input.addEventListener('blur', () => {
    if (!input.value) {
      input.parentElement?.classList.remove('focused');
    }
  });
});

// Button hover effects
const buttons = document.querySelectorAll('.btn, .btn-primary, .btn-secondary');
buttons.forEach(button => {
  button.addEventListener('mouseenter', () => {
    button.style.transform = 'translateY(-4px)';
  });
  
  button.addEventListener('mouseleave', () => {
    button.style.transform = 'translateY(0)';
  });
});

// Parallax effect for images
const parallaxElements = document.querySelectorAll('[data-parallax]');
if (parallaxElements.length > 0) {
  window.addEventListener('scroll', () => {
    parallaxElements.forEach(el => {
      const speed = el.dataset.parallax || 0.5;
      const offset = window.scrollY * speed;
      el.style.transform = `translateY(${offset}px)`;
    });
  }, { passive: true });
}

// Counter animation
function animateCounter(element, target, duration = 2000) {
  let start = 0;
  const increment = target / (duration / 16);
  
  const timer = setInterval(() => {
    start += increment;
    if (start >= target) {
      element.textContent = Math.round(target);
      clearInterval(timer);
    } else {
      element.textContent = Math.round(start);
    }
  }, 16);
}

// Intersection Observer for animations
const observerOptions = {
  threshold: 0.1,
  rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('in-view');
      observer.unobserve(entry.target);
    }
  });
}, observerOptions);

document.querySelectorAll('[data-animate]').forEach(el => {
  observer.observe(el);
});

// Tooltip functionality
const tooltips = document.querySelectorAll('[data-tooltip]');
tooltips.forEach(element => {
  element.addEventListener('mouseenter', () => {
    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    tooltip.textContent = element.dataset.tooltip;
    document.body.appendChild(tooltip);
    
    const rect = element.getBoundingClientRect();
    tooltip.style.position = 'fixed';
    tooltip.style.top = (rect.top - tooltip.offsetHeight - 8) + 'px';
    tooltip.style.left = (rect.left + rect.width / 2 - tooltip.offsetWidth / 2) + 'px';
    
    element.addEventListener('mouseleave', () => {
      tooltip.remove();
    });
  });
});

// Dark mode toggle (optional)
if (localStorage.getItem('theme') === 'light') {
  document.documentElement.setAttribute('data-theme', 'light');
}

document.addEventListener('keydown', (e) => {
  // Keyboard shortcuts
  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'k') {
      e.preventDefault();
      // Open search or command palette
    }
  }
});

// Log analytics (example)
function trackEvent(eventName, data = {}) {
  if (window.gtag) {
    gtag('event', eventName, data);
  }
  console.log(`Event: ${eventName}`, data);
}

// Track button clicks
buttons.forEach(button => {
  button.addEventListener('click', () => {
    trackEvent('button_click', { button_text: button.textContent });
  });
});

// Performance monitoring
if (window.performance && window.performance.timing) {
  window.addEventListener('load', () => {
    const timing = window.performance.timing;
    const loadTime = timing.loadEventEnd - timing.navigationStart;
    console.log(`Page load time: ${loadTime}ms`);
    trackEvent('page_load', { load_time: loadTime });
  });
}

console.log('CareerHub premium landing page initialized.');
