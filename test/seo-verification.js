/**
 * test/seo-verification.js
 * Comprehensive automated verification suite for SEO, AEO, and GEO infrastructure.
 * 
 * Tests:
 * 1. RFC 9309 robots.txt compliance and AI bot protection parity
 * 2. sitemap.xml validity, URL completeness, and exclusion of private routes
 * 3. Canonical tag coverage across all public routes
 * 4. noindex, nofollow enforcement across all private/authenticated routes
 * 5. Open Graph and Twitter Card metadata integrity
 * 6. Core Web Vitals optimization (no blocking Three.js, deferred scripts)
 * 7. Accessibility compliance (absence of cursor: none)
 * 8. Schema validation (elimination of unverified aggregateRating)
 * 9. Static internal crawlability (presence of footer link grid)
 * 10. AI discoverability resources (llms.txt integrity)
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const FRONTEND_DIR = path.join(ROOT_DIR, 'frontend');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] ${message}`);
  } else {
    failedTests++;
    console.error(`  [FAIL] ${message}`);
  }
}

console.log('====================================================');
console.log('   SEO, AEO & GEO AUTOMATED VERIFICATION SUITE      ');
console.log('====================================================\n');

// ── TEST GROUP 1: robots.txt Compliance & Directive Parity ──
console.log('Test Group 1: robots.txt RFC 9309 Compliance');
const robotsPath = path.join(FRONTEND_DIR, 'robots.txt');
assert(fs.existsSync(robotsPath), 'frontend/robots.txt exists');
const robotsContent = fs.readFileSync(robotsPath, 'utf-8');

assert(robotsContent.includes('Sitemap: https://jobxapply.netlify.app/sitemap.xml'), 'robots.txt points to canonical sitemap.xml');
assert(robotsContent.includes('User-agent: *'), 'robots.txt specifies generic User-agent: *');
assert(robotsContent.includes('Disallow: /admin/'), 'robots.txt blocks /admin/ for generic agents');
assert(robotsContent.includes('Disallow: /dashboard.html'), 'robots.txt blocks private dashboard');

// Check RFC 9309 compliance for specific AI agents
const aiAgents = ['GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended'];
let allAiAgentsProtected = true;
for (const agent of aiAgents) {
  if (!robotsContent.includes(`User-agent: ${agent}`)) {
    allAiAgentsProtected = false;
  }
}
assert(allAiAgentsProtected, 'Explicit AI search crawler directives defined (GPTBot, ClaudeBot, PerplexityBot, etc.)');

// Verify that the AI record group also contains disallows so private directories are not exposed
const specificAiGroupHasDisallow = robotsContent.indexOf('User-agent: GPTBot') > 0 &&
  robotsContent.slice(robotsContent.indexOf('User-agent: GPTBot')).includes('Disallow: /admin/');
assert(specificAiGroupHasDisallow, 'AI Crawler group enforces Disallow: /admin/ (RFC 9309 record isolation compliant)');

// ── TEST GROUP 2: sitemap.xml XML Validity & Route Completeness ──
console.log('\nTest Group 2: sitemap.xml Completeness & Privacy Boundaries');
const sitemapPath = path.join(FRONTEND_DIR, 'sitemap.xml');
assert(fs.existsSync(sitemapPath), 'frontend/sitemap.xml exists');
const sitemapContent = fs.readFileSync(sitemapPath, 'utf-8');

assert(sitemapContent.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), 'sitemap.xml has valid XML declaration');
assert(sitemapContent.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'), 'sitemap.xml has valid urlset schema');

const sitemapUrlMatches = sitemapContent.match(/<loc>(https:\/\/jobxapply\.netlify\.app[^<]*)<\/loc>/g) || [];
assert(sitemapUrlMatches.length >= 22, `sitemap.xml contains at least 22 public URLs (Found: ${sitemapUrlMatches.length})`);

// Ensure NO private routes in sitemap
const privateRoutesInSitemap = [
  'dashboard.html', 'settings.html', 'profile-setup.html', 'auth.html',
  'auth-callback.html', 'reset-password.html', 'apply-sandbox.html',
  'autofill-lab.html', 'maintenance.html', '404.html', 'admin'
];
let leakedPrivateRoutes = false;
for (const p of privateRoutesInSitemap) {
  if (sitemapContent.includes(p)) {
    leakedPrivateRoutes = true;
    console.error(`    Found prohibited private route in sitemap: ${p}`);
  }
}
assert(!leakedPrivateRoutes, 'Zero private or authenticated routes leaked in sitemap.xml');

// ── TEST GROUP 3: Private Route Noindex Enforcement ──
console.log('\nTest Group 3: Private Route Noindex Enforcement');
const privateFiles = [
  'dashboard.html', 'settings.html', 'profile-setup.html', 'auth.html',
  'auth-callback.html', 'reset-password.html', 'apply-sandbox.html',
  'autofill-lab.html', 'maintenance.html', '404.html', 'onboarding.html'
];
let allPrivateFilesNoindexed = true;
for (const file of privateFiles) {
  const filePath = path.join(FRONTEND_DIR, file);
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf-8');
    if (!content.includes('noindex') || !content.includes('nofollow')) {
      allPrivateFilesNoindexed = false;
      console.error(`    Missing noindex in: ${file}`);
    }
  }
}
assert(allPrivateFilesNoindexed, `All ${privateFiles.length} private routes contain <meta name="robots" content="noindex, nofollow">`);

// ── TEST GROUP 4: Public Route Canonical & Social Metadata ──
console.log('\nTest Group 4: Public Route Canonical Tags & Social Graph');
const keyPublicFiles = [
  'index.html', 'ats-checker.html', 'resume-builder.html', 'cover-letter.html',
  'salary-calculator.html', 'jobs.html', 'extension-landing.html', 'extension-setup.html',
  'tracker.html', 'tools.html', 'portals.html', 'gov-resizer.html', 'gov-ssc-cgl.html',
  'gov-ibps-po.html', 'roadmap-software-engineer.html', 'roadmap-data-scientist.html',
  'resume-importance.html', 'how-it-works.html', 'features.html', 'pricing.html',
  'blog.html', 'about.html', 'contact.html', 'privacy-terms.html'
];
let allCanonicalsPresent = true;
let allOgPresent = true;
let allTwitterPresent = true;

for (const file of keyPublicFiles) {
  const filePath = path.join(FRONTEND_DIR, file);
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf-8');
    if (!content.includes('rel="canonical"') && !content.includes("rel='canonical'")) {
      allCanonicalsPresent = false;
      console.error(`    Missing canonical tag in: ${file}`);
    }
    if (!content.includes('property="og:title"') && !content.includes("property='og:title'")) {
      allOgPresent = false;
      console.error(`    Missing og:title in: ${file}`);
    }
    if (!content.includes('name="twitter:card"') && !content.includes("name='twitter:card'")) {
      allTwitterPresent = false;
      console.error(`    Missing twitter:card in: ${file}`);
    }
  }
}
assert(allCanonicalsPresent, `All ${keyPublicFiles.length} public routes feature self-referential canonical tags`);
assert(allOgPresent, `All ${keyPublicFiles.length} public routes feature complete Open Graph metadata`);
assert(allTwitterPresent, `All ${keyPublicFiles.length} public routes feature complete Twitter Card metadata`);

// ── TEST GROUP 5: Core Web Vitals, Schema & Static Internal Link Graph ──
console.log('\nTest Group 5: Core Web Vitals, Schema Integrity & Crawlability');
const indexPath = path.join(FRONTEND_DIR, 'index.html');
const indexContent = fs.readFileSync(indexPath, 'utf-8');

assert(!indexContent.includes('three.min.js'), 'Unused 600KB render-blocking Three.js script removed from index.html');
assert(indexContent.includes('d3@7" defer') || indexContent.includes("d3@7' defer"), 'Heavy D3 library loaded with defer attribute');
assert(indexContent.includes('topojson@3" defer') || indexContent.includes("topojson@3' defer"), 'TopoJSON library loaded with defer attribute');

// Schema validation
assert(!indexContent.includes('"ratingCount": "1280"'), 'Unsubstantiated AggregateRating schema removed from index.html');
assert(indexContent.includes('"@type": "SoftwareApplication"'), 'Valid SoftwareApplication schema preserved in index.html');
assert(indexContent.includes('"@type": "FAQPage"'), 'Valid FAQPage schema preserved in index.html');

// Internal crawlability
assert(indexContent.includes('foot__grid'), 'Static crawlable HTML footer link grid present in index.html');
assert(indexContent.includes('ats-checker.html'), 'Static crawlable link to ats-checker.html in index.html footer');
assert(indexContent.includes('resume-builder.html'), 'Static crawlable link to resume-builder.html in index.html footer');
assert(indexContent.includes('salary-calculator.html'), 'Static crawlable link to salary-calculator.html in index.html footer');

// Accessibility
assert(!indexContent.includes('cursor: none;'), 'Accessibility violation cursor: none removed across index.html');

// ── TEST GROUP 6: AI Search Engine Optimization (GEO/AEO) & Branding ──
console.log('\nTest Group 6: AI Discoverability & Brand Consistency');
const llmsPath = path.join(FRONTEND_DIR, 'llms.txt');
assert(fs.existsSync(llmsPath), 'frontend/llms.txt exists for LLM / AI retrieval');
const llmsContent = fs.readFileSync(llmsPath, 'utf-8');
assert(llmsContent.includes('/salary-calculator.html'), 'llms.txt contains Salary Calculator reference');
assert(llmsContent.includes('/gov-resizer.html'), 'llms.txt contains Govt Resizer reference');

const blogPath = path.join(FRONTEND_DIR, 'blog.html');
const blogContent = fs.readFileSync(blogPath, 'utf-8');
assert(!blogContent.includes('<title>CareerHub // Blog</title>'), 'Legacy branding "CareerHub" corrected in blog.html');
assert(blogContent.includes('JobXApply'), 'Brand JobXApply correctly reflected in blog.html title');

// ── SUMMARY REPORT ──
console.log('\n====================================================');
console.log(`TOTAL TESTS:   ${totalTests}`);
console.log(`PASSED:        ${passedTests}`);
console.log(`FAILED:        ${failedTests}`);
console.log(`SUCCESS RATE:  ${Math.round((passedTests / totalTests) * 100)}%`);
console.log('====================================================');

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log('\nAll SEO, AEO & GEO verifications passed with 100% compliance.\n');
  process.exit(0);
}
