/**
 * JobXApply Commercial Readiness, Entitlement & Quota Verification Suite
 * Tests Plan Catalog, Monthly Quotas (Autofill/Resume/Cover Letter), Tracker Cap,
 * ATS Tier Filtering, Payment Receipts, Funnel Analytics & Admin Grants/Payments.
 */

const path = require("path");
try {
  require("dotenv").config({ path: path.join(__dirname, ".env"), quiet: true });
} catch (e) {}

const http = require("http");
const { spawn } = require("child_process");
const jwt = require("jsonwebtoken");
const db = require("./db");
const authHandler = require("./auth-handler");

const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}/api`;

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    console.log(`  [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${msg}`);
    failed++;
  }
}

function reqJson(method, pathname, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE}${pathname}`);
    const payload = body !== null ? JSON.stringify(body) : null;
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (payload) headers["Content-Length"] = Buffer.byteLength(payload);

    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers
    }, (res) => {
      let data = "";
      res.on("data", c => (data += c));
      res.on("end", () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) { json = data; }
        resolve({ status: res.statusCode, body: json });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await reqJson("GET", "/health");
      if (r.status === 200) return true;
    } catch (e) {}
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error("Server did not start in time");
}

async function run() {
  console.log("======================================================");
  console.log("JOBXAPPLY MONETIZATION, QUOTA & RECEIPT TEST SUITE");
  console.log("======================================================");

  const serverProc = spawn(process.execPath, [path.join(__dirname, "sync-server.js")], {
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: "test",
      DATABASE_URL: "",
      RAZORPAY_KEY_ID: "rzp_test_1234567890",
      RAZORPAY_KEY_SECRET: "test_secret_1234567890",
      ADMIN_EMAILS: "admin@jobxapply.app"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer();

    const freeEmail = `free_${Date.now()}@example.com`;
    const adminEmail = "admin@jobxapply.app";

    const regFree = await reqJson("POST", "/auth/register", {
      email: freeEmail,
      password: "Password123!",
      name: "Free Tester"
    });
    assert(regFree.status === 201 && regFree.body.token, "Registered Free test user");
    const freeToken = regFree.body.token;
    const freeUserId = regFree.body.user.id;

    // 1. Public Plan Catalog
    const plansRes = await reqJson("GET", "/plans");
    assert(plansRes.status === 200 && plansRes.body.ok === true, "GET /api/plans returns 200");
    assert(Array.isArray(plansRes.body.plans) && plansRes.body.plans.length === 2, "Catalog exposes exactly 2 plans (Free & Pro)");
    assert(plansRes.body.autoRenew === false && plansRes.body.billingModel === "one_time_prepaid", "Catalog specifies one-time prepaid, no auto-renew");

    // 2. Autofill Monthly Quota (10/month Free + Release + Idempotency)
    for (let i = 1; i <= 10; i++) {
      const a = await reqJson("POST", "/usage/autofill/authorize", { operationId: `op_af_${i}`, portal: "linkedin" }, freeToken);
      if (i === 1) {
        assert(a.status === 200 && a.body.ok, "1st autofill reservation succeeds");
        const dup = await reqJson("POST", "/usage/autofill/authorize", { operationId: `op_af_${i}`, portal: "linkedin" }, freeToken);
        assert(dup.status === 200 && dup.body.idempotent === true, "Duplicate operationId reservation is idempotent");
      }
      const c = await reqJson("POST", "/usage/autofill/complete", { operationId: `op_af_${i}` }, freeToken);
      if (i === 10) assert(c.status === 200 && c.body.usage.autofills.remaining === 0, "10th autofill finalized, remaining=0");
    }
    const af11 = await reqJson("POST", "/usage/autofill/authorize", { operationId: "op_af_11", portal: "linkedin" }, freeToken);
    assert(af11.status === 403 && af11.body.code === "QUOTA_EXCEEDED" && af11.body.upgradeRequired === true, "11th autofill blocked with 403 QUOTA_EXCEEDED");

    // Test release on separate user
    const free2Res = await reqJson("POST", "/auth/register", { email: `free2_${Date.now()}@example.com`, password: "Password123!", name: "Free Two" });
    const free2Token = free2Res.body.token;
    const rsv = await reqJson("POST", "/usage/autofill/authorize", { operationId: "op_rel_1" }, free2Token);
    assert(rsv.status === 200 && rsv.body.remaining === 9, "Reservation decrements remaining to 9");
    const rel = await reqJson("POST", "/usage/autofill/release", { operationId: "op_rel_1" }, free2Token);
    assert(rel.status === 200 && rel.body.usage.autofills.remaining === 10, "Releasing failed autofill restores remaining to 10");

    // 3. Resume Export Quota (2/month Free)
    const res1 = await reqJson("POST", "/resume/generate", { templateId: "01", data: { fullName: "Tester" } }, freeToken);
    const res2 = await reqJson("POST", "/resume/generate", { templateId: "02", data: { fullName: "Tester" } }, freeToken);
    const res3 = await reqJson("POST", "/resume/generate", { templateId: "01", data: { fullName: "Tester" } }, freeToken);
    assert(res1.status === 200 && res2.status === 200, "Free user completes 2 monthly resume exports");
    assert(res3.status === 403 && res3.body.code === "QUOTA_EXCEEDED", "3rd monthly resume export blocked with 403 QUOTA_EXCEEDED");

    // 4. Cover Letter Template Gate & 2/month Quota
    const clProTpl = await reqJson("POST", "/cover-letter/generate", { templateId: "02", data: { fullName: "Tester" } }, freeToken);
    assert(clProTpl.status === 403 && clProTpl.body.code === "FEATURE_REQUIRES_PRO", "Free user blocked from Pro cover letter template 02");
    const cl1 = await reqJson("POST", "/cover-letter/generate", { templateId: "01", data: { fullName: "Tester" } }, freeToken);
    const cl2 = await reqJson("POST", "/cover-letter/generate", { templateId: "01", data: { fullName: "Tester" } }, freeToken);
    const cl3 = await reqJson("POST", "/cover-letter/generate", { templateId: "01", data: { fullName: "Tester" } }, freeToken);
    assert(cl1.status === 200 && cl2.status === 200, "Free user completes 2 monthly cover letter exports on template 01");
    assert(cl3.status === 403 && cl3.body.code === "QUOTA_EXCEEDED", "3rd monthly cover letter export blocked with 403 QUOTA_EXCEEDED");

    // 5. Tracker Capacity (20 max Free)
    const apps20 = Array.from({ length: 20 }, (_, i) => ({ id: `a${i}`, company: `Corp ${i}`, role: "SWE", status: "Applied" }));
    const trOk = await reqJson("POST", "/tracker", { applications: apps20 }, freeToken);
    assert(trOk.status === 200 && trOk.body.syncedCount === 20, "Free user saves 20 tracker entries");
    const apps21 = [...apps20, { id: "a20", company: "Corp 20", role: "SWE", status: "Applied" }];
    const trFail = await reqJson("POST", "/tracker", { applications: apps21 }, freeToken);
    assert(trFail.status === 403 && trFail.body.code === "TRACKER_CAPACITY_REACHED", "21st tracker entry blocked with 403 TRACKER_CAPACITY_REACHED");

    // 6. ATS Basic vs Pro Breakdown
    const atsFree = await reqJson("POST", "/ats/analyze", { role: "default", jdText: "React TypeScript Node.js Docker Kubernetes AWS SQL Python", profile: { fullName: "Tester", skills: "HTML" } }, freeToken);
    assert(atsFree.status === 200 && atsFree.body.detailLevel === "basic" && atsFree.body.missingKeywords.length <= 3 && atsFree.body.upgradeRequired === true,
      "Free ATS analysis returns basic summary + max 3 missing keywords");

    // 7. Funnel Analytics Event + Deduplication
    const evtRes = await reqJson("POST", "/analytics/event", { eventName: "paywall_shown", metadata: { featureKey: "tracker" } }, freeToken);
    const evtDup = await reqJson("POST", "/analytics/event", { eventName: "paywall_shown", metadata: { featureKey: "tracker" } }, freeToken);
    assert(evtRes.status === 200 && evtRes.body.ok === true, "Funnel analytics event accepted");
    assert(evtDup.status === 200 && evtDup.body.deduplicated === true, "Duplicate funnel event within 60s is deduplicated");

    // 7b. Cross-account operationId & malicious release on finalized op
    const crossOp = await reqJson("POST", "/usage/autofill/authorize", { operationId: "op_af_1" }, free2Token);
    assert(crossOp.status === 403, "Cross-account operationId rejected (403)");
    const malRel = await reqJson("POST", "/usage/autofill/release", { operationId: "op_af_1" }, freeToken);
    assert(malRel.status === 400, "Release on already-finalized operation rejected (400)");

    // 7c. Concurrent tracker capacity atomicity (20 allowed, 21 rejected)
    const [conc20, conc21] = await Promise.all([
      reqJson("POST", "/tracker", { applications: apps20 }, free2Token),
      reqJson("POST", "/tracker", { applications: apps21 }, free2Token)
    ]);
    assert(conc20.status === 200 && conc21.status === 403 && conc21.body.code === "TRACKER_CAPACITY_REACHED",
      "Concurrent tracker requests enforce 20-entry Free cap atomically");

    // 8. Admin RBAC & Audited Grant -> Pro Unlocks Everything
    const nonAdminDenied = await reqJson("GET", "/admin/payments", null, freeToken);
    assert(nonAdminDenied.status === 403, "Non-admin user denied /api/admin/payments (403)");

    const adminToken = jwt.sign(
      { id: "u_pa52u5ad0x", email: adminEmail, role: "admin", emailVerified: true },
      process.env.JWT_SECRET || authHandler.JWT_SECRET,
      { expiresIn: "1h" }
    );
    const grantMissingReason = await reqJson("POST", "/admin/grants", { userId: freeUserId, action: "grant" }, adminToken);
    assert(grantMissingReason.status === 400, "Admin grant without reason rejected (400)");

    const grantOk = await reqJson("POST", "/admin/grants", { userId: freeUserId, action: "grant", days: 30, environment: "test", reason: "QA Commercial Verification" }, adminToken);
    assert(grantOk.status === 200 && grantOk.body.ok && grantOk.body.audit.action === "admin_grant_pro", "Admin audited Pro grant succeeded");

    // Verify Pro capabilities unlocked
    const clProUnlocked = await reqJson("POST", "/cover-letter/generate", { templateId: "05", data: { fullName: "Tester" } }, freeToken);
    assert(clProUnlocked.status === 200, "Granted Pro user unlocks cover letter template 05 & unlimited exports");
    const trProUnlocked = await reqJson("POST", "/tracker", { applications: apps21 }, freeToken);
    assert(trProUnlocked.status === 200 && trProUnlocked.body.syncedCount === 21, "Granted Pro user saves 21st tracker entry");

    const adminPay = await reqJson("GET", "/admin/payments", null, adminToken);
    assert(adminPay.status === 200 && adminPay.body.ok && Array.isArray(adminPay.body.auditLogs) && adminPay.body.auditLogs.length >= 1,
      "Admin payments & audit logs endpoint returns structured data");

    // Revoke Pro -> preserves 21 saved tracker items (never deletes!) while blocking 22nd
    const revokeOk = await reqJson("POST", "/admin/grants", { userId: freeUserId, action: "revoke", environment: "test", reason: "End of QA test" }, adminToken);
    assert(revokeOk.status === 200 && revokeOk.body.audit.action === "admin_revoke_pro", "Admin audited Pro revoke succeeded");
    const apps21Edit = apps21.map((a, idx) => idx === 0 ? { ...a, status: "Interview" } : a);
    const trEditAfterDowngrade = await reqJson("POST", "/tracker", { applications: apps21Edit }, freeToken);
    assert(trEditAfterDowngrade.status === 200, "Downgraded user can still edit existing 21 tracker items (no data loss)");
    const tr22AfterDowngrade = await reqJson("POST", "/tracker", { applications: [...apps21Edit, { id: "a21", company: "New", role: "SWE", status: "Applied" }] }, freeToken);
    assert(tr22AfterDowngrade.status === 403 && tr22AfterDowngrade.body.code === "TRACKER_CAPACITY_REACHED", "Downgraded user cannot add 22nd item above 20 cap");

  } finally {
    serverProc.kill();
  }

  console.log("\n======================================================");
  console.log(`MONETIZATION SUITE SUMMARY: Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log("======================================================");
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error("Test suite fatal error:", err);
  process.exit(1);
});
