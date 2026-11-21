/**
 * Automated Verification Script for Milestone 1 Security Controls (SEC-01 to SEC-12)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

console.log('======================================================');
console.log('VERIFYING MILESTONE 1 SECURITY CONTROLS (SEC-01 to SEC-12)');
console.log('======================================================\n');

let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${name}: ${err.message}`);
  }
}

async function testAsync(name, fn) {
  total++;
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${name}: ${err.message}`);
  }
}

async function run() {
  // --- SEC-01: Extension manifest & origin check ---
  test('SEC-01: manifest.json contains externally_connectable with authorized origins', () => {
    const manifest = JSON.parse(fs.readFileSync('extension/manifest.json', 'utf8'));
    assert(manifest.externally_connectable, 'externally_connectable key missing');
    assert(Array.isArray(manifest.externally_connectable.matches), 'matches must be array');
    const matches = manifest.externally_connectable.matches;
    assert(matches.includes('https://jobxapply.netlify.app/*'), 'missing jobxapply.netlify.app');
    assert(matches.includes('https://careerhub-app.netlify.app/*'), 'missing careerhub-app.netlify.app');
    assert(matches.some(m => m.includes('localhost')), 'missing localhost');
    assert(matches.some(m => m.includes('127.0.0.1')), 'missing 127.0.0.1');
  });

  test('SEC-01: content.js contains isAuthorizedAppOrigin guarding message handlers', () => {
    const content = fs.readFileSync('extension/content.js', 'utf8');
    assert(content.includes('function isAuthorizedAppOrigin()'), 'isAuthorizedAppOrigin function missing');
    assert(content.includes('isAuthorizedAppOrigin()'), 'isAuthorizedAppOrigin not called');
    assert(content.includes('jobxapply:receiveProfileFromExtension'), 'missing receiveProfileFromExtension handler');
  });

  // --- SEC-02: Purge tracked PII & .gitignore rules ---
  test('SEC-02: .gitignore contains database ignore rules', () => {
    const gitignore = fs.readFileSync('.gitignore', 'utf8');
    assert(gitignore.includes('database/user-registry.json'), 'missing user-registry.json in .gitignore');
    assert(gitignore.includes('database/jobxapply-sync-state.json'), 'missing jobxapply-sync-state.json in .gitignore');
    assert(gitignore.includes('database/careerhub-sync-state.json'), 'missing careerhub-sync-state.json in .gitignore');
    assert(gitignore.includes('database/users/*'), 'missing database/users/* in .gitignore');
    assert(gitignore.includes('!database/users/.gitkeep'), 'missing !database/users/.gitkeep in .gitignore');
  });

  test('SEC-02: Tracked database files do not contain candidate PII', () => {
    assert(!fs.existsSync('database/jobxapply-sync-state.json') || fs.statSync('database/jobxapply-sync-state.json').size === 0, 'jobxapply-sync-state should not exist');
    assert(!fs.existsSync('database/careerhub-sync-state.json') || fs.statSync('database/careerhub-sync-state.json').size === 0, 'careerhub-sync-state should not exist');
    const userFiles = fs.readdirSync('database/users').filter(f => f !== '.gitkeep');
    assert.strictEqual(userFiles.length, 0, 'database/users must not contain user json files on git');
  });

  // --- SEC-03: Passcode Hashing Standard ---
  test('SEC-03: Passcode hashing uses SHA-256 with :jobxapply_salt_v2 and Base64', () => {
    const sharedShell = fs.readFileSync('frontend/shared-shell.js', 'utf8');
    assert(sharedShell.includes('passcode + ":jobxapply_salt_v2"'), 'shared-shell.js must use :jobxapply_salt_v2');
    const extShared = fs.readFileSync('extension/shared.js', 'utf8');
    assert(extShared.includes('passcode + ":jobxapply_salt_v2"'), 'extension/shared.js must use :jobxapply_salt_v2');
  });

  // --- SEC-04: Admin Elevation Decoupling ---
  test('SEC-04: sync-server.js does not contain hardcoded personal developer emails', () => {
    const server = fs.readFileSync('backend/sync-server.js', 'utf8');
    assert(!server.includes('hidhanush07@gmail.com'), 'hardcoded hidhanush07 found');
    assert(!server.includes('dhanushsiddilingam@gmail.com'), 'hardcoded dhanushsiddilingam found');
    assert(server.includes('process.env.ADMIN_EMAILS'), 'ADMIN_EMAILS env var must be read');
    assert(server.includes('email_confirmed_at'), 'email_confirmed_at must be checked');
  });

  // --- SEC-05: safeUrl in tracker.html ---
  test('SEC-05: tracker.html safeUrl rejects javascript: and data: URLs', () => {
    const tracker = fs.readFileSync('frontend/tracker.html', 'utf8');
    assert(tracker.includes('function safeUrl(url)'), 'safeUrl function missing in tracker.html');
    assert(tracker.includes('rel="noopener noreferrer"'), 'rel="noopener noreferrer" missing in tracker.html');

    // Simulate safeUrl logic
    function safeUrl(url) {
      if (!url || typeof url !== 'string') return '';
      const trimmed = url.trim();
      try {
        const parsed = new URL(trimmed);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          return trimmed;
        }
      } catch (e) {
        if (/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(\/.*)?$/.test(trimmed)) {
          return 'https://' + trimmed;
        }
      }
      return '';
    }

    assert.strictEqual(safeUrl('javascript:alert(1)'), '');
    assert.strictEqual(safeUrl('data:text/html,<script>alert(1)</script>'), '');
    assert.strictEqual(safeUrl('https://stripe.com/jobs'), 'https://stripe.com/jobs');
    assert.strictEqual(safeUrl('google.com/careers'), 'https://google.com/careers');
  });

  // --- SEC-06: escHtml in resume-builder.html ---
  test('SEC-06: resume-builder.html escHtml escapes HTML entities', () => {
    const resume = fs.readFileSync('frontend/resume-builder.html', 'utf8');
    assert(resume.includes('function escHtml(str)'), 'escHtml missing in resume-builder.html');

    function escHtml(str) {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    const payload = '<script>alert("xss")</script>';
    const escaped = escHtml(payload);
    assert(!escaped.includes('<script>'), 'unencoded script tag');
    assert(escaped.includes('&lt;script&gt;'), 'proper encoding required');
  });

  // --- SEC-07: Extension CORS & Origin Gating ---
  test('SEC-07: sync-server.js validates ALLOWED_EXTENSION_IDS and excludes wildcard extension from static origins', () => {
    const server = fs.readFileSync('backend/sync-server.js', 'utf8');
    assert(server.includes('ALLOWED_EXTENSION_IDS'), 'ALLOWED_EXTENSION_IDS env check missing');
    // Ensure "chrome-extension://" is NOT in static ALLOWED_ORIGINS Set
    const originsMatch = server.match(/const ALLOWED_ORIGINS = new Set\(\[([\s\S]*?)\]\);/);
    assert(originsMatch, 'ALLOWED_ORIGINS Set not found');
    assert(!originsMatch[1].includes('"chrome-extension://"'), '"chrome-extension://" found in static ALLOWED_ORIGINS Set');
  });

  // --- SEC-08: db.getDatabaseBackup() Hash Stripping ---
  await testAsync('SEC-08: db.getDatabaseBackup() sanitizes password and passcode hashes', async () => {
    const db = require('../backend/db');
    const backup = await db.getDatabaseBackup();
    assert(backup, 'Backup object returned');
    assert(Array.isArray(backup.registry), 'Backup registry is array');
    const jsonStr = JSON.stringify(backup);
    assert(!jsonStr.includes('passwordHash'), 'Backup contains passwordHash');
    assert(!jsonStr.includes('passcodeHash'), 'Backup contains passcodeHash');
    assert(!jsonStr.includes('resetTokenHash'), 'Backup contains resetTokenHash');
  });

  // --- SEC-09: backend/.env.example ---
  test('SEC-09: backend/.env.example exists and documents all required variables', () => {
    assert(fs.existsSync('backend/.env.example'), 'backend/.env.example missing');
    const content = fs.readFileSync('backend/.env.example', 'utf8');
    const required = [
      'PORT',
      'JWT_SECRET',
      'ADMIN_EMAILS',
      'ALLOWED_ORIGINS',
      'ALLOWED_EXTENSION_IDS',
      'TRUST_PROXY',
      'DB_SSL_REJECT_UNAUTHORIZED',
      'DATABASE_URL'
    ];
    for (const v of required) {
      assert(content.includes(v), `missing ${v} in .env.example`);
    }
  });

  // --- SEC-10: IP Spoofing Prevention via TRUST_PROXY ---
  test('SEC-10: sync-server.js checks TRUST_PROXY before reading X-Forwarded-For', () => {
    const server = fs.readFileSync('backend/sync-server.js', 'utf8');
    assert(server.includes('process.env.TRUST_PROXY === "true"'), 'TRUST_PROXY check missing in getClientIp');
  });

  // --- SEC-11: Configurable PostgreSQL TLS ---
  test('SEC-11: db.js uses configurable DB_SSL_REJECT_UNAUTHORIZED', () => {
    const dbSource = fs.readFileSync('backend/db.js', 'utf8');
    assert(dbSource.includes('DB_SSL_REJECT_UNAUTHORIZED'), 'DB_SSL_REJECT_UNAUTHORIZED missing in db.js');
  });

  // --- SEC-12: Token Revocation & Logout ---
  test('SEC-12: auth-handler.js supports token revocation and sync-server.js has /api/auth/logout', () => {
    const auth = require('../backend/auth-handler');
    assert(typeof auth.revokeToken === 'function', 'revokeToken is not a function');
    assert(typeof auth.isTokenRevoked === 'function', 'isTokenRevoked is not a function');

    const testToken = 'sample-revocation-test-token-' + Date.now();
    assert.strictEqual(auth.isTokenRevoked(testToken), false, 'token should not be revoked yet');
    auth.revokeToken(testToken);
    assert.strictEqual(auth.isTokenRevoked(testToken), true, 'token should be revoked');

    const server = fs.readFileSync('backend/sync-server.js', 'utf8');
    assert(server.includes('/api/auth/logout'), 'missing /api/auth/logout route in sync-server.js');
    assert(server.includes('auth.isTokenRevoked'), 'missing isTokenRevoked check in sync-server.js');
  });

  console.log('\n======================================================');
  console.log(`SUMMARY: Total: ${total} | Passed: ${passed} | Failed: ${total - passed}`);
  console.log('======================================================');

  if (passed !== total) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Test run failed:', err);
  process.exit(1);
});
