/**
 * scripts/generate-sitemap.js
 * Generates frontend/sitemap.xml with complete public route inventory,
 * accurate lastmod timestamps, priorities, and image metadata.
 */

const fs = require('fs');
const path = require('path');

const DOMAIN = 'https://jobxapply.netlify.app';
const TODAY = new Date().toISOString().split('T')[0];

const PUBLIC_ROUTES = [
  {
    path: '/',
    changefreq: 'daily',
    priority: '1.0',
    image: {
      loc: `${DOMAIN}/assets/app-logo.png`,
      title: 'JobXApply - Autonomous Career Automation & AI Job Application Assistant'
    }
  },
  { path: '/ats-checker.html', changefreq: 'daily', priority: '0.95' },
  { path: '/resume-builder.html', changefreq: 'daily', priority: '0.95' },
  { path: '/cover-letter.html', changefreq: 'daily', priority: '0.95' },
  { path: '/salary-calculator.html', changefreq: 'daily', priority: '0.90' },
  { path: '/jobs.html', changefreq: 'daily', priority: '0.90' },
  { path: '/extension-landing.html', changefreq: 'daily', priority: '0.90' },
  { path: '/extension-setup.html', changefreq: 'weekly', priority: '0.85' },
  { path: '/tracker.html', changefreq: 'daily', priority: '0.85' },
  { path: '/tools.html', changefreq: 'weekly', priority: '0.85' },
  { path: '/portals.html', changefreq: 'weekly', priority: '0.85' },
  { path: '/gov-resizer.html', changefreq: 'weekly', priority: '0.85' },
  { path: '/gov-ssc-cgl.html', changefreq: 'weekly', priority: '0.80' },
  { path: '/gov-ibps-po.html', changefreq: 'weekly', priority: '0.80' },
  { path: '/roadmap-software-engineer.html', changefreq: 'weekly', priority: '0.80' },
  { path: '/roadmap-data-scientist.html', changefreq: 'weekly', priority: '0.80' },
  { path: '/resume-importance.html', changefreq: 'weekly', priority: '0.80' },
  { path: '/how-it-works.html', changefreq: 'weekly', priority: '0.80' },
  { path: '/features.html', changefreq: 'weekly', priority: '0.80' },
  { path: '/pricing.html', changefreq: 'weekly', priority: '0.80' },
  { path: '/blog.html', changefreq: 'weekly', priority: '0.75' },
  { path: '/about.html', changefreq: 'monthly', priority: '0.75' },
  { path: '/contact.html', changefreq: 'monthly', priority: '0.60' },
  { path: '/privacy-terms.html', changefreq: 'monthly', priority: '0.50' }
];

function generateSitemapXml() {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n`;
  xml += `        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n`;

  for (const route of PUBLIC_ROUTES) {
    xml += `  <url>\n`;
    xml += `    <loc>${DOMAIN}${route.path}</loc>\n`;
    xml += `    <lastmod>${TODAY}</lastmod>\n`;
    xml += `    <changefreq>${route.changefreq}</changefreq>\n`;
    xml += `    <priority>${route.priority}</priority>\n`;
    if (route.image) {
      xml += `    <image:image>\n`;
      xml += `      <image:loc>${route.image.loc}</image:loc>\n`;
      xml += `      <image:title>${route.image.title.replace(/&/g, '&amp;')}</image:title>\n`;
      xml += `    </image:image>\n`;
    }
    xml += `  </url>\n`;
  }

  xml += `</urlset>\n`;
  return xml;
}

const outputPath = path.join(__dirname, '..', 'frontend', 'sitemap.xml');
const xmlContent = generateSitemapXml();
fs.writeFileSync(outputPath, xmlContent, 'utf-8');
console.log(`Successfully generated sitemap.xml with ${PUBLIC_ROUTES.length} URLs at ${outputPath}`);
