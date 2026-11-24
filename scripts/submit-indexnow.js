/**
 * scripts/submit-indexnow.js
 * Submits all public URLs to the IndexNow protocol (Bing, Yandex, Seznam, Naver).
 */

const https = require('https');

const HOST = 'jobxapply.netlify.app';
const KEY = 'fe9404f5dfb88d761a52cc46c2a68db5';
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;

const PUBLIC_URLS = [
  `https://${HOST}/`,
  `https://${HOST}/ats-checker.html`,
  `https://${HOST}/resume-builder.html`,
  `https://${HOST}/cover-letter.html`,
  `https://${HOST}/salary-calculator.html`,
  `https://${HOST}/jobs.html`,
  `https://${HOST}/extension-landing.html`,
  `https://${HOST}/extension-setup.html`,
  `https://${HOST}/tracker.html`,
  `https://${HOST}/tools.html`,
  `https://${HOST}/portals.html`,
  `https://${HOST}/gov-resizer.html`,
  `https://${HOST}/gov-ssc-cgl.html`,
  `https://${HOST}/gov-ibps-po.html`,
  `https://${HOST}/roadmap-software-engineer.html`,
  `https://${HOST}/roadmap-data-scientist.html`,
  `https://${HOST}/resume-importance.html`,
  `https://${HOST}/how-it-works.html`,
  `https://${HOST}/features.html`,
  `https://${HOST}/pricing.html`,
  `https://${HOST}/blog.html`,
  `https://${HOST}/about.html`,
  `https://${HOST}/contact.html`,
  `https://${HOST}/privacy-terms.html`
];

const payload = JSON.stringify({
  host: HOST,
  key: KEY,
  keyLocation: KEY_LOCATION,
  urlList: PUBLIC_URLS
});

const options = {
  hostname: 'api.indexnow.org',
  port: 443,
  path: '/indexnow',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload)
  }
};

console.log(`Submitting ${PUBLIC_URLS.length} URLs to IndexNow (api.indexnow.org)...`);

const req = https.request(options, (res) => {
  console.log(`IndexNow Response Status: ${res.statusCode} ${res.statusMessage}`);
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    if (res.statusCode === 200 || res.statusCode === 202) {
      console.log('✓ Successfully submitted all URLs to IndexNow! Search engines are notified.');
    } else {
      console.log(`Response body: ${data || '(empty)'}`);
    }
  });
});

req.on('error', (e) => {
  console.error(`IndexNow submission error: ${e.message}`);
});

req.write(payload);
req.end();
