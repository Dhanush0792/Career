// jd-extractor.js - Active page job metadata & description extractor
// Supports Tier 1 dedicated selectors (LinkedIn, Workday, Greenhouse, Lever, Indeed, Naukri)
// and Tier 2 smart keyword-density contiguous block heuristics.

(function () {
  'use strict';

  function cleanText(text) {
    if (!text) return '';
    return text
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n\s*\n+/g, '\n\n')
      .trim();
  }

  function extractTier1(host) {
    const doc = document;
    let title = '';
    let company = '';
    let location = '';
    let description = '';

    // 1. LinkedIn
    if (host.includes('linkedin.com')) {
      title = doc.querySelector(
        '.job-details-jobs-unified-top-card__job-title, .top-card-layout__title, h1.jobs-details-top-card__job-title, h1'
      )?.textContent || '';

      company = doc.querySelector(
        '.job-details-jobs-unified-top-card__company-name, .topcard__org-name-link, .top-card-layout__first-subline a, .jobs-unified-top-card__company-name'
      )?.textContent || '';

      location = doc.querySelector(
        '.job-details-jobs-unified-top-card__workplace-type, .top-card-layout__first-subline .topcard__flavor--bullet, .jobs-unified-top-card__bullet'
      )?.textContent || '';

      const descEl = doc.querySelector(
        '#job-details, .jobs-description__content, .jobs-box__htmlContent, .show-more-less-html__markup'
      );
      if (descEl) description = descEl.innerText || descEl.textContent || '';
    }

    // 2. Greenhouse
    else if (host.includes('greenhouse.io') || host.includes('boards.greenhouse.io')) {
      title = doc.querySelector(
        '.app-title, .job-title, #header h1, h1.app-title, h1'
      )?.textContent || '';

      company = doc.querySelector(
        '.company-name, .logo-wrapper img'
      )?.alt || doc.querySelector('.company-name')?.textContent || '';

      if (!company) {
        const match = window.location.pathname.match(/\/([^/]+)\/jobs/);
        if (match) company = match[1].charAt(0).toUpperCase() + match[1].slice(1);
      }

      location = doc.querySelector(
        '.location, .body--metadata'
      )?.textContent || '';

      const descEl = doc.querySelector(
        '#content, #job-description, .body--medium, #app-body'
      );
      if (descEl) {
        // Exclude application form inside #content if present
        const clone = descEl.cloneNode(true);
        const appForm = clone.querySelector('#application, form, #application_form');
        if (appForm) appForm.remove();
        description = clone.innerText || clone.textContent || '';
      }
    }

    // 3. Lever
    else if (host.includes('lever.co')) {
      title = doc.querySelector(
        '.posting-headline h2, .posting-headline h1, h2'
      )?.textContent || '';

      company = doc.querySelector('.main-header-logo img')?.alt || '';
      if (!company) {
        const match = window.location.pathname.match(/\/([^/]+)\/[a-f0-9-]+/);
        if (match) company = match[1].charAt(0).toUpperCase() + match[1].slice(1);
      }

      location = doc.querySelector(
        '.posting-category.location, .sort-by-location, .workplaceTypes'
      )?.textContent || '';

      const descSections = Array.from(doc.querySelectorAll('.section.page-centered:not(.application-form)'));
      if (descSections.length) {
        description = descSections.map(s => s.innerText || s.textContent || '').join('\n\n');
      } else {
        const descEl = doc.querySelector('.posting-sections, .content');
        if (descEl) description = descEl.innerText || descEl.textContent || '';
      }
    }

    // 4. Workday
    else if (host.includes('myworkdayjobs.com') || host.includes('workday.com')) {
      title = doc.querySelector(
        'h2[data-automation-id="jobPostingHeader"], [data-automation-id="jobPostingHeader"] h2, h1'
      )?.textContent || '';

      const logoImg = doc.querySelector('img[data-automation-id="clientLogo"], header img');
      company = logoImg?.alt || logoImg?.title || host.split('.')[0];

      location = doc.querySelector(
        '[data-automation-id="locations"], [data-automation-id="jobPostingLocations"]'
      )?.textContent || '';

      const descEl = doc.querySelector(
        '[data-automation-id="jobPostingDescription"], [data-automation-id="job-description"]'
      );
      if (descEl) description = descEl.innerText || descEl.textContent || '';
    }

    // 5. Indeed
    else if (host.includes('indeed.com')) {
      title = doc.querySelector(
        '.jobsearch-JobInfoHeader-title, h1.jobsearch-JobInfoHeader-title, h1'
      )?.textContent || '';

      company = doc.querySelector(
        '[data-company-name="true"], .jobsearch-InlineCompanyRating-companyHeader a, .jobsearch-CompanyInfoContainer a'
      )?.textContent || '';

      location = doc.querySelector(
        '#jobLocationText, .jobsearch-JobInfoHeader-companyLocation'
      )?.textContent || '';

      const descEl = doc.querySelector(
        '#jobDescriptionText, .jobsearch-jobDescriptionText'
      );
      if (descEl) description = descEl.innerText || descEl.textContent || '';
    }

    // 6. Naukri
    else if (host.includes('naukri.com')) {
      title = doc.querySelector(
        '.jd-header-title, .styles_jd-header-title__4WOHs, h1.title, h1'
      )?.textContent || '';

      company = doc.querySelector(
        '.jd-header-comp-name, .styles_jd-header-comp-name__M3qlo, .company-name'
      )?.textContent || '';

      location = doc.querySelector(
        '.styles_jhc__location__r_u6v, .location, .styles_jhc__exp-salary-loc__eA7r5 span:last-child'
      )?.textContent || '';

      const descEl = doc.querySelector(
        '.styles_JDC__dang-inner-html__h0K4t, .job-desc, .dang-inner-html, section.job-desc-section'
      );
      if (descEl) description = descEl.innerText || descEl.textContent || '';
    }

    return {
      title: cleanText(title),
      company: cleanText(company),
      location: cleanText(location),
      description: cleanText(description)
    };
  }

  // Tier 2: Smart heuristic identifying the largest contiguous text block with role/requirements keywords
  function extractTier2() {
    const doc = document;
    const body = doc.body;
    if (!body) return { title: '', company: '', location: '', description: '' };

    // Common headings / titles fallback
    let title = doc.querySelector("meta[property='og:title']")?.content ||
      doc.querySelector("meta[name='twitter:title']")?.content ||
      doc.querySelector('h1')?.textContent || '';

    if (!title && doc.title) {
      title = doc.title.split(/[-|–—:]/)[0].trim();
    }

    let company = doc.querySelector("meta[property='og:site_name']")?.content || '';
    if (!company) {
      const host = window.location.hostname.replace(/^www\./, '');
      const parts = host.split('.');
      if (parts.length >= 2) company = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    }

    let location = doc.querySelector("meta[name='geo.placename']")?.content || '';

    // Candidate block search
    const candidates = Array.from(doc.querySelectorAll('article, main, section, [role="main"], .description, .job-description, .posting, div'));
    const KEYWORDS = [
      'responsibilities', 'requirements', 'qualifications', 'what you\'ll do', 'what you will do',
      'about the role', 'about the job', 'experience', 'skills', 'who you are', 'duties',
      'job description', 'preferred qualifications', 'minimum qualifications', 'bonus points',
      'benefits', 'what we look for', 'what we offer', 'summary', 'overview'
    ];

    let bestScore = 0;
    let bestBlock = null;

    for (const el of candidates) {
      // Skip hidden or tiny elements, form wrappers, navigation, header, footer
      if (['SCRIPT', 'STYLE', 'NAV', 'FOOTER', 'HEADER', 'FORM'].includes(el.tagName)) continue;
      const text = el.innerText || el.textContent || '';
      const textLen = text.length;
      if (textLen < 200 || textLen > 25000) continue;

      const lower = text.toLowerCase();
      let matches = 0;
      for (const kw of KEYWORDS) {
        if (lower.includes(kw)) matches++;
      }

      if (matches >= 2) {
        // Density / balance score: reward keyword hits and reasonable length
        // Penalize deeply nested child elements if parent already has roughly same text
        const score = matches * 150 + Math.min(textLen, 5000) / 10;
        if (score > bestScore) {
          bestScore = score;
          bestBlock = el;
        }
      }
    }

    let description = '';
    if (bestBlock) {
      // Clone and strip unwanted tags
      const clone = bestBlock.cloneNode(true);
      const removals = clone.querySelectorAll('script, style, nav, footer, form, svg, noscript, button');
      removals.forEach(n => n.remove());
      description = clone.innerText || clone.textContent || '';
    } else {
      // Fallback: whole body text cleaned
      const clone = body.cloneNode(true);
      const removals = clone.querySelectorAll('script, style, head, iframe, noscript, svg, nav, footer, header, form');
      removals.forEach(n => n.remove());
      description = (clone.innerText || clone.textContent || '').slice(0, 8000);
    }

    return {
      title: cleanText(title),
      company: cleanText(company),
      location: cleanText(location),
      description: cleanText(description)
    };
  }

  function extractJD() {
    const host = window.location.hostname.toLowerCase();
    const url = window.location.href;

    const t1 = extractTier1(host);
    const t2 = (t1.title && t1.company && t1.description && t1.description.length > 100)
      ? { title: '', company: '', location: '', description: '' }
      : extractTier2();

    const title = t1.title || t2.title || 'Job Opening';
    const company = t1.company || t2.company || 'Company';
    const location = t1.location || t2.location || '';
    const description = (t1.description && t1.description.length > 50) ? t1.description : (t2.description || '');

    return {
      title: cleanText(title),
      company: cleanText(company),
      location: cleanText(location),
      description: cleanText(description),
      url
    };
  }

  // Expose on window if in browser environment
  if (typeof window !== 'undefined') {
    window.extractJD = extractJD;
    window.extractJobDescription = extractJD;
  }

  // Node module export for testing / bundling if applicable
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { extractJD, extractTier1, extractTier2, cleanText };
  }
})();
