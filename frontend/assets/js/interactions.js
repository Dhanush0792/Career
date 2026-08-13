// Custom cursor tracking
const customCursorSetup = () => {
  const cursor = {
    el: document.createElement('div'),
    x: 0,
    y: 0,
    vx: 0,
    vy: 0
  };

  cursor.el.className = 'custom-cursor';
  cursor.el.innerHTML = `
    <div class="cursor-dot"></div>
    <div class="cursor-ring"></div>
  `;
  document.body.appendChild(cursor.el);

  const dot = cursor.el.querySelector('.cursor-dot');
  const ring = cursor.el.querySelector('.cursor-ring');

  document.addEventListener('mousemove', (e) => {
    cursor.x = e.clientX;
    cursor.y = e.clientY;
  });

  const animate = () => {
    dot.style.transform = `translate(${cursor.x - 3.5}px, ${cursor.y - 3.5}px)`;
    cursor.vx += (cursor.x - cursor.vx) * 0.2;
    cursor.vy += (cursor.y - cursor.vy) * 0.2;
    ring.style.transform = `translate(${cursor.vx - 18}px, ${cursor.vy - 18}px)`;
    requestAnimationFrame(animate);
  };

  animate();

  // Add hover effect to interactive elements
  const interactiveElements = document.querySelectorAll('a, button, .btn, input, textarea, [role="button"]');
  
  interactiveElements.forEach(element => {
    element.addEventListener('mouseenter', () => {
      ring.classList.add('hover');
    });
    
    element.addEventListener('mouseleave', () => {
      ring.classList.remove('hover');
    });
  });

  // Hide custom cursor on touch devices
  document.addEventListener('touchstart', () => {
    cursor.el.style.display = 'none';
  });

  document.addEventListener('mousemove', () => {
    cursor.el.style.display = 'block';
  });
};

// Floating animation for elements
const setupFloatingAnimation = () => {
  const floatingElements = document.querySelectorAll('[data-floating]');
  
  floatingElements.forEach((element, index) => {
    const delay = index * 0.1;
    element.style.animation = `floating ${3 + index}s ease-in-out ${delay}s infinite`;
  });
};

// Glow effect on mouse move
const setupGlowEffect = () => {
  const glowElements = document.querySelectorAll('[data-glow]');
  
  document.addEventListener('mousemove', (e) => {
    glowElements.forEach(element => {
      const rect = element.getBoundingClientRect();
      const distance = Math.sqrt(
        Math.pow(e.clientX - rect.left, 2) + Math.pow(e.clientY - rect.top, 2)
      );
      const maxDistance = 200;
      
      if (distance < maxDistance) {
        const intensity = 1 - distance / maxDistance;
        element.style.boxShadow = `0 0 ${20 * intensity}px rgba(46, 233, 200, ${0.3 * intensity})`;
      } else {
        element.style.boxShadow = 'none';
      }
    });
  });
};

// Card tilt effect
const setupCardTilt = () => {
  const tiltCards = document.querySelectorAll('[data-tilt]');
  
  tiltCards.forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      const rotateX = (y - centerY) / 20;
      const rotateY = -(x - centerX) / 20;
      
      card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.02)`;
    });
    
    card.addEventListener('mouseleave', () => {
      card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale(1)';
    });
  });
};

// Ripple effect on click
const setupRippleEffect = () => {
  const rippleElements = document.querySelectorAll('[data-ripple]');
  
  rippleElements.forEach(element => {
    element.addEventListener('click', (e) => {
      const ripple = document.createElement('span');
      const rect = element.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;
      
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = x + 'px';
      ripple.style.top = y + 'px';
      ripple.className = 'ripple';
      
      element.appendChild(ripple);
      
      setTimeout(() => ripple.remove(), 600);
    });
  });
};

// Text highlight on scroll
const setupTextHighlight = () => {
  const highlightElements = document.querySelectorAll('[data-highlight]');
  
  const highlightObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('highlighted');
      }
    });
  }, { threshold: 0.5 });
  
  highlightElements.forEach(el => highlightObserver.observe(el));
};

// Particle background interaction
const setupParticleInteraction = () => {
  const particleCanvas = document.getElementById('particles');
  if (!particleCanvas) return;

  const ctx = particleCanvas.getContext('2d');
  particleCanvas.width = window.innerWidth;
  particleCanvas.height = window.innerHeight;

  const particles = [];
  const particleCount = Math.floor((window.innerWidth * window.innerHeight) / 8000);

  class Particle {
    constructor() {
      this.x = Math.random() * particleCanvas.width;
      this.y = Math.random() * particleCanvas.height;
      this.vx = (Math.random() - 0.5) * 0.5;
      this.vy = (Math.random() - 0.5) * 0.5;
      this.radius = Math.random() * 1.5 + 0.5;
      this.opacity = Math.random() * 0.5 + 0.2;
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;

      if (this.x < 0 || this.x > particleCanvas.width) this.vx *= -1;
      if (this.y < 0 || this.y > particleCanvas.height) this.vy *= -1;
    }

    draw() {
      ctx.fillStyle = `rgba(91, 79, 232, ${this.opacity})`;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  for (let i = 0; i < particleCount; i++) {
    particles.push(new Particle());
  }

  const animate = () => {
    ctx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);

    particles.forEach(particle => {
      particle.update();
      particle.draw();
    });

    requestAnimationFrame(animate);
  };

  animate();

  window.addEventListener('resize', () => {
    particleCanvas.width = window.innerWidth;
    particleCanvas.height = window.innerHeight;
  });
};

// Scroll-triggered counter
const setupScrollCounters = () => {
  const counters = document.querySelectorAll('[data-counter]');
  
  counters.forEach(counter => {
    const target = parseInt(counter.dataset.counter);
    const duration = parseInt(counter.dataset.duration) || 2000;
    
    const counterObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        let current = 0;
        const increment = target / (duration / 16);
        
        const timer = setInterval(() => {
          current += increment;
          if (current >= target) {
            counter.textContent = target;
            clearInterval(timer);
          } else {
            counter.textContent = Math.floor(current);
          }
        }, 16);
        
        counterObserver.unobserve(counter);
      }
    }, { threshold: 0.5 });
    
    counterObserver.observe(counter);
  });
};

// Add custom CSS for interactions
const style = document.createElement('style');
style.textContent = `
  .custom-cursor {
    position: fixed;
    top: 0;
    left: 0;
    pointer-events: none;
    z-index: 999;
    display: none;
  }

  @media (hover: hover) {
    .custom-cursor {
      display: block;
    }

    * {
      cursor: none;
    }
  }

  .cursor-dot {
    position: fixed;
    width: 8px;
    height: 8px;
    background: #2ee9c8;
    border-radius: 50%;
    box-shadow: 0 0 12px rgba(46, 233, 200, 0.8);
    pointer-events: none;
    z-index: 999;
  }

  .cursor-ring {
    position: fixed;
    width: 40px;
    height: 40px;
    border: 1.5px solid rgba(46, 233, 200, 0.3);
    border-radius: 50%;
    pointer-events: none;
    z-index: 999;
    transition: border-color 0.3s ease;
  }

  .cursor-ring.hover {
    border-color: #2ee9c8;
    box-shadow: 0 0 15px rgba(46, 233, 200, 0.5);
  }

  .ripple {
    position: absolute;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.7);
    transform: scale(0);
    animation: ripple-animation 0.6s ease-out;
    pointer-events: none;
  }

  @keyframes ripple-animation {
    to {
      transform: scale(4);
      opacity: 0;
    }
  }

  [data-tilt] {
    transition: transform 0.3s cubic-bezier(0.23, 1, 0.320, 1);
  }

  .highlighted {
    background: linear-gradient(120deg, transparent, rgba(46, 233, 200, 0.3), transparent);
    animation: highlight-shimmer 2s ease-in-out;
  }

  @keyframes highlight-shimmer {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }
`;
document.head.appendChild(style);

// Initialize all interactions
document.addEventListener('DOMContentLoaded', () => {
  if (window.matchMedia('(hover: hover)').matches) {
    customCursorSetup();
  }
  setupFloatingAnimation();
  setupGlowEffect();
  setupCardTilt();
  setupRippleEffect();
  setupTextHighlight();
  setupParticleInteraction();
  setupScrollCounters();

  console.log('Interactive effects initialized.');
});
