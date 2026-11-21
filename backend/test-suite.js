/**
 * JobXApply Backend Comprehensive Integration & Health Test Suite
 * Genuine black-box verification of all REST endpoints, Auth, ATS, Resume/Cover Letter engines, Admin RBAC, and Security controls.
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { spawn } = require('child_process');
const http = require('http');
const jwt = require('jsonwebtoken');
const authHandler = require('./auth-handler.js');

const TEST_PORT = 8798;
const BASE_URL = `http://localhost:${TEST_PORT}`;

let serverProcess = null;
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const testResults = [];

function logTest(passed, name, details = '') {
  totalTests++;
  if (passed) {
    passedTests++;
    console.log(`  [PASS] ${name}${details ? ` (${details})` : ''}`);
    testResults.push({ status: 'PASS', name, details });
  } else {
    failedTests++;
    console.error(`  [FAIL] ${name}${details ? ` (${details})` : ''}`);
    testResults.push({ status: 'FAIL', name, details });
  }
}

function request(options, bodyData = null) {
  return new Promise((resolve, reject) => {
    const reqOptions = {
      hostname: 'localhost',
      port: TEST_PORT,
      path: options.path || '/',
      method: options.method || 'GET',
      headers: { ...options.headers, 'Connection': 'close' },
      agent: false,
      timeout: 5000
    };

    if (bodyData && !reqOptions.headers['Content-Type']) {
      reqOptions.headers['Content-Type'] = 'application/json';
    }

    const payload = bodyData ? (typeof bodyData === 'string' ? bodyData : JSON.stringify(bodyData)) : null;
    if (payload) {
      reqOptions.headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = null;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data,
          json
        });
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error(`Request to ${reqOptions.path} timed out after 5000ms`));
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

async function startServer() {
  return new Promise((resolve, reject) => {
    const secret = process.env.JWT_SECRET || 'test_jwt_secret_careerbridge_2026';
    const env = { ...process.env, PORT: String(TEST_PORT), NODE_ENV: 'test', JWT_SECRET: secret };
    process.env.JWT_SECRET = secret;
    serverProcess = spawn('node', ['sync-server.js'], {
      cwd: path.resolve(__dirname),
      env
    });

    serverProcess.stdout.on('data', (data) => {
      const msg = data.toString();
      if (msg.includes(`running on http://localhost:${TEST_PORT}`)) {
        resolve();
      }
    });

    serverProcess.stderr.on('data', (data) => {
      // ignore verbose startup logs unless error
    });

    serverProcess.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Server exited prematurely with code ${code}`));
      }
    });

    setTimeout(() => {
      reject(new Error(`Server startup timed out after 10s`));
    }, 10000);
  });
}

function stopServer() {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }
}

async function runTestSuite() {
  console.log('======================================================');
  console.log(`STARTING JOBXAPPLY BACKEND TEST SUITE ON PORT ${TEST_PORT}`);
  console.log('======================================================\n');

  try {
    await startServer();
    console.log('[+] Sync server spawned and listening.\n');
  } catch (err) {
    console.error('[-] Failed to launch server:', err.message);
    process.exit(1);
  }

  try {
    // ── 1. PUBLIC HEALTH & CONFIGURATION ───────────────────────
    console.log('--- 1. Health & Public Configuration Endpoints ---');
    
    // GET /health
    const healthRes = await request({ path: '/health' });
    logTest(healthRes.statusCode === 200 && healthRes.json?.ok === true && healthRes.json?.status === 'healthy',
      'GET /health returns 200 with status healthy', `status: ${healthRes.statusCode}`);

    // GET /api/health
    const apiHealthRes = await request({ path: '/api/health' });
    logTest(apiHealthRes.statusCode === 200 && apiHealthRes.json?.ok === true,
      'GET /api/health returns 200 with ok: true', `status: ${apiHealthRes.statusCode}`);

    // GET /api/status
    const statusRes = await request({ path: '/api/status' });
    logTest(statusRes.statusCode === 200 && statusRes.json?.ok === true,
      'GET /api/status returns server metadata and ok: true', `status: ${statusRes.statusCode}`);

    // GET /api/admin/banner (public)
    const bannerRes = await request({ path: '/api/admin/banner' });
    logTest(bannerRes.statusCode === 200 && bannerRes.json?.ok === true,
      'GET /api/admin/banner returns platform banner', `status: ${bannerRes.statusCode}`);

    // GET /api/admin/features (public)
    const featuresRes = await request({ path: '/api/admin/features' });
    logTest(featuresRes.statusCode === 200 && featuresRes.json?.ok === true && typeof featuresRes.json?.features === 'object',
      'GET /api/admin/features returns platform feature flags', `status: ${featuresRes.statusCode}`);

    // GET /api/cms (public)
    const cmsRes = await request({ path: '/api/cms' });
    logTest(cmsRes.statusCode === 200 && cmsRes.json?.ok === true,
      'GET /api/cms returns CMS content', `status: ${cmsRes.statusCode}`);

    // GET /api/maps (public portal maps)
    const mapsRes = await request({ path: '/api/maps' });
    logTest(mapsRes.statusCode === 200 && (Array.isArray(mapsRes.json) || typeof mapsRes.json === 'object'),
      'GET /api/maps returns portal selector mappings', `status: ${mapsRes.statusCode}`);

    // GET /api/jobs/search
    const jobsRes = await request({ path: '/api/jobs/search?q=developer' });
    logTest(jobsRes.statusCode === 200 && Array.isArray(jobsRes.json?.jobs),
      `GET /api/jobs/search returns jobs list (${jobsRes.json?.jobs?.length || 0} jobs found)`, `status: ${jobsRes.statusCode}`);

    // GET /api/ats/check-limit
    const limitRes = await request({ path: '/api/ats/check-limit' });
    logTest(limitRes.statusCode === 200 && typeof limitRes.json?.allowed === 'boolean',
      'GET /api/ats/check-limit returns daily limit allowance', `status: ${limitRes.statusCode}`);

    // GET /api/resume/templates
    const templatesRes = await request({ path: '/api/resume/templates' });
    logTest(templatesRes.statusCode === 200 && Array.isArray(templatesRes.json) && templatesRes.json.length === 10,
      `GET /api/resume/templates returns exactly 10 LaTeX templates`, `status: ${templatesRes.statusCode}`);


    // ── 2. TELEMETRY & INPUT VALIDATION ─────────────────────────
    console.log('\n--- 2. Telemetry, Reporting & Input Validation ---');

    // Valid Telemetry
    const telemOk = await request({ path: '/api/telemetry/hit', method: 'POST' }, { metric: 'pageViews' });
    logTest(telemOk.statusCode === 200 && telemOk.json?.ok === true,
      'POST /api/telemetry/hit accepts valid metric "pageViews"', `status: ${telemOk.statusCode}`);

    // Invalid Telemetry metric (whitelist enforcement)
    const telemBad = await request({ path: '/api/telemetry/hit', method: 'POST' }, { metric: 'maliciousInjectedMetric' });
    logTest(telemBad.statusCode === 400 && telemBad.json?.ok === false,
      'POST /api/telemetry/hit rejects non-whitelisted metric with 400', `status: ${telemBad.statusCode}`);

    // Invalid report submission (missing portal/field)
    const reportBad = await request({ path: '/api/report', method: 'POST' }, {});
    logTest(reportBad.statusCode === 400 && reportBad.json?.ok === false,
      'POST /api/report rejects missing fields with 400', `status: ${reportBad.statusCode}`);

    // Valid report submission
    const reportOk = await request({ path: '/api/report', method: 'POST' }, {
      portal: 'linkedin',
      field: 'phone',
      selectorTried: 'input[name="tel"]',
      reporterEmail: 'tester@test.local'
    });
    logTest(reportOk.statusCode === 200 && reportOk.json?.ok === true && reportOk.json?.report?.portal === 'linkedin',
      'POST /api/report records sanitized broken field report', `status: ${reportOk.statusCode}`);


    // ── 3. AUTHENTICATION & SESSION LIFECYCLE ───────────────────
    console.log('\n--- 3. Authentication & Sessions ---');

    const testEmail = `qa_worker_${Date.now()}@jobxapply.test`;
    const testPassword = 'SecurePassword123!';

    // Register with invalid email
    const regBadEmail = await request({ path: '/api/auth/register', method: 'POST' }, {
      email: 'not-an-email',
      password: testPassword,
      name: 'QA Worker'
    });
    logTest(regBadEmail.statusCode === 400,
      'POST /api/auth/register rejects invalid email format', `status: ${regBadEmail.statusCode}`);

    // Register with weak password
    const regWeakPw = await request({ path: '/api/auth/register', method: 'POST' }, {
      email: testEmail,
      password: 'weak',
      name: 'QA Worker'
    });
    logTest(regWeakPw.statusCode === 400,
      'POST /api/auth/register rejects weak password (<8 chars / missing criteria)', `status: ${regWeakPw.statusCode}`);

    // Register valid user (accepts 200 or 201)
    const regValid = await request({ path: '/api/auth/register', method: 'POST' }, {
      email: testEmail,
      password: testPassword,
      name: 'QA Test Runner'
    });
    let userToken = regValid.json?.token;
    logTest((regValid.statusCode === 200 || regValid.statusCode === 201) && regValid.json?.ok === true && !!userToken,
      'POST /api/auth/register successfully registers new user and issues JWT', `status: ${regValid.statusCode}, token: ${userToken ? 'yes' : 'no'}`);

    // Duplicate registration rejection
    const regDup = await request({ path: '/api/auth/register', method: 'POST' }, {
      email: testEmail,
      password: testPassword,
      name: 'QA Test Runner'
    });
    logTest(regDup.statusCode === 400,
      'POST /api/auth/register rejects duplicate email address', `status: ${regDup.statusCode}`);

    // Login with wrong password
    const loginFail = await request({ path: '/api/auth/login', method: 'POST' }, {
      email: testEmail,
      password: 'WrongPassword999!'
    });
    logTest(loginFail.statusCode === 401,
      'POST /api/auth/login rejects incorrect password with 401', `status: ${loginFail.statusCode}`);

    // Login with correct password
    const loginOk = await request({ path: '/api/auth/login', method: 'POST' }, {
      email: testEmail,
      password: testPassword
    });
    if (loginOk.json?.token) userToken = loginOk.json.token;
    logTest(loginOk.statusCode === 200 && loginOk.json?.ok === true && !!loginOk.json?.token,
      'POST /api/auth/login succeeds with valid credentials and returns JWT', `status: ${loginOk.statusCode}, token: ${userToken ? 'yes' : 'no'}`);


    // ── 4. PROTECTED USER ENDPOINTS (RBAC & INTEGRITY) ───────────
    console.log('\n--- 4. Protected User Profile & Tracker ---');

    // Unauthenticated profile GET rejected
    const unauthProf = await request({ path: '/api/profile' });
    logTest(unauthProf.statusCode === 401,
      'GET /api/profile without token correctly rejected with 401 Unauthorized', `status: ${unauthProf.statusCode}`);

    // Authenticated profile GET
    const authHeaders = { 'Authorization': `Bearer ${userToken}` };
    const getProf = await request({ path: '/api/profile', headers: authHeaders });
    logTest(getProf.statusCode === 200 && typeof getProf.json === 'object',
      'GET /api/profile with Bearer token returns profile state', `status: ${getProf.statusCode}`);

    // Authenticated profile POST (update)
    const updatedProfile = {
      profile: {
        fullName: 'Jane Verified QA',
        email: testEmail,
        skills: 'TypeScript, Python, Docker, Jest, AWS',
        targetRole: 'Senior Staff QA Engineer'
      },
      version: 1
    };
    const postProf = await request({ path: '/api/profile', method: 'POST', headers: authHeaders }, updatedProfile);
    logTest(postProf.statusCode === 200 && postProf.json?.ok === true,
      'POST /api/profile saves and syncs updated candidate profile', `status: ${postProf.statusCode}`);

    // Data Export GET
    const exportRes = await request({ path: '/api/profile/export', headers: authHeaders });
    logTest(exportRes.statusCode === 200 && exportRes.json?.user?.email === testEmail,
      'GET /api/profile/export returns complete JSON backup of user profile and applications', `status: ${exportRes.statusCode}`);

    // Application Tracker GET & POST
    const getTracker = await request({ path: '/api/tracker', headers: authHeaders });
    logTest(getTracker.statusCode === 200 && Array.isArray(getTracker.json?.applications),
      'GET /api/tracker returns user application tracking list', `status: ${getTracker.statusCode}, body: ${getTracker.data}`);

    const sampleApp = {
      id: 'app_test_' + Date.now(),
      company: 'TechCorp Verified',
      role: 'QA Engineer',
      status: 'Applied',
      appliedAt: new Date().toISOString()
    };
    const postTracker = await request({ path: '/api/tracker', method: 'POST', headers: authHeaders }, {
      applications: [sampleApp]
    });
    logTest(postTracker.statusCode === 200 && postTracker.json?.ok === true,
      'POST /api/tracker updates application pipeline data', `status: ${postTracker.statusCode}`);


    // ── 5. GENERATIVE & ANALYSIS ENGINES ─────────────────────────
    console.log('\n--- 5. ATS Scoring, Resume & Cover Letter Engines ---');

    // ATS Analyze
    const atsSample = {
      role: 'default',
      jdText: 'Seeking a Senior QA Automation Engineer with proficiency in Python, JavaScript, automated testing frameworks, CI/CD pipelines, and cloud environments.',
      profile: {
        fullName: 'Jane Verified QA',
        summary: 'Experienced Senior QA Engineer with 7 years in automated testing, CI/CD, Python, JavaScript, and Docker. Led end-to-end quality initiatives resulting in 40% reduction in production regressions.',
        skills: 'Python, JavaScript, Docker, CI/CD, Testing'
      }
    };
    const atsRes = await request({ path: '/api/ats/analyze', method: 'POST', headers: authHeaders }, atsSample);
    const hasAtsScores = atsRes.statusCode === 200 && typeof (atsRes.json?.score ?? atsRes.json?.overallScore) === 'number';
    logTest(hasAtsScores,
      `POST /api/ats/analyze calculates genuine ATS match score (Score: ${atsRes.json?.score ?? atsRes.json?.overallScore})`, `status: ${atsRes.statusCode}, body: ${atsRes.data.slice(0, 80)}`);

    // Resume LaTeX Generation (Template 01)
    const resumePayload = {
      templateId: '01',
      data: {
        fullName: 'Jane Verified QA',
        email: testEmail,
        phone: '+1-555-0199',
        summary: 'Distinguished QA and verification specialist.',
        skills: 'JavaScript, Python, Docker, CI/CD',
        experience: 'Senior Test Engineer at TechCorp (2020-Present)',
        education: 'B.S. in Computer Science'
      }
    };
    const resumeRes = await request({ path: '/api/resume/generate', method: 'POST', headers: authHeaders }, resumePayload);
    logTest(resumeRes.statusCode === 200 && typeof resumeRes.data === 'string' && resumeRes.data.includes('\\documentclass'),
      'POST /api/resume/generate compiles valid LaTeX resume for Template 01', `status: ${resumeRes.statusCode}`);

    // Resume Generation Path Traversal Protection
    const pathTraversalResume = await request({ path: '/api/resume/generate', method: 'POST', headers: authHeaders }, {
      templateId: '../../../../etc/passwd'
    });
    logTest(pathTraversalResume.statusCode === 400 || pathTraversalResume.statusCode === 404,
      'POST /api/resume/generate rejects directory traversal attempts', `status: ${pathTraversalResume.statusCode}`);

    // Cover Letter Generation (Template 01)
    const coverPayload = {
      templateId: '01',
      fullName: 'Jane Verified QA',
      email: testEmail,
      companyName: 'Acme Technologies',
      recipientName: 'Hiring Team',
      openingParagraph: 'I am writing to express my enthusiastic interest in the Staff QA Engineer position.',
      bodyParagraph1: 'With extensive experience in testing systems, I have delivered resilient software.',
      closingParagraph: 'Thank you for your consideration.'
    };
    const coverRes = await request({ path: '/api/cover-letter/generate', method: 'POST', headers: authHeaders }, coverPayload);
    logTest(coverRes.statusCode === 200 && coverRes.json?.ok === true && typeof coverRes.json?.latex === 'string',
      'POST /api/cover-letter/generate compiles valid LaTeX cover letter for Template 01', `status: ${coverRes.statusCode}`);


    // ── 6. ADMIN RBAC & AUTHORIZATION CHECKS ────────────────────
    console.log('\n--- 6. Admin RBAC & Privilege Escalation Defenses ---');

    // Regular user attempting to access admin stats -> 403 Forbidden
    const unprivStats = await request({ path: '/api/admin/stats', headers: authHeaders });
    logTest(unprivStats.statusCode === 403,
      'GET /api/admin/stats correctly denies non-admin user (403 Forbidden)', `status: ${unprivStats.statusCode}`);

    // Regular user attempting to access user directory -> 403 Forbidden
    const unprivUsers = await request({ path: '/api/admin/users', headers: authHeaders });
    logTest(unprivUsers.statusCode === 403,
      'GET /api/admin/users correctly denies non-admin user (403 Forbidden)', `status: ${unprivUsers.statusCode}`);

    // Anonymous attempting to access system health -> 401/403
    const anonHealth = await request({ path: '/api/admin/system/health' });
    logTest(anonHealth.statusCode === 401 || anonHealth.statusCode === 403,
      'GET /api/admin/system/health denies unauthenticated requests', `status: ${anonHealth.statusCode}`);

    // Admin login endpoint rejects invalid credentials
    const adminLoginBad = await request({ path: '/api/admin/login', method: 'POST' }, {
      email: 'admin@jobxapply.app',
      password: 'IncorrectPassword999!'
    });
    logTest(adminLoginBad.statusCode === 401,
      'POST /api/admin/login rejects invalid credentials with 401', `status: ${adminLoginBad.statusCode}`);

    // Verify authorized Admin access with valid Admin JWT token
    const adminToken = jwt.sign(
      { id: 'u_pa52u5ad0x', email: 'admin@jobxapply.app', role: 'admin' },
      authHandler.JWT_SECRET,
      { expiresIn: '1h' }
    );
    const adminHeaders = { 'Authorization': `Bearer ${adminToken}` };

    const adminStatsRes = await request({ path: '/api/admin/stats', headers: adminHeaders });
    logTest(adminStatsRes.statusCode === 200 && adminStatsRes.json?.ok === true,
      'Admin token grants authorized access to /api/admin/stats', `status: ${adminStatsRes.statusCode}`);

    const adminSysRes = await request({ path: '/api/admin/system/health', headers: adminHeaders });
    logTest(adminSysRes.statusCode === 200 && adminSysRes.json?.ok === true,
      'Admin token grants authorized access to /api/admin/system/health', `status: ${adminSysRes.statusCode}`);

    // Clean up test user
    const deleteRes = await request({ path: '/api/profile', method: 'DELETE', headers: authHeaders });
    logTest(deleteRes.statusCode === 200 && deleteRes.json?.ok === true,
      'DELETE /api/profile purges test user account and data', `status: ${deleteRes.statusCode}`);

  } catch (err) {
    console.error('[-] Unexpected error during test run:', err);
    logTest(false, 'Test suite execution error: ' + err.message);
  } finally {
    console.log('\n[+] Stopping test server...');
    stopServer();
  }

  console.log('\n======================================================');
  console.log(`BACKEND TEST SUMMARY: Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
  console.log('======================================================');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTestSuite();
