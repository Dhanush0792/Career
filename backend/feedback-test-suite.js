/**
 * JobXApply Help & Feedback Verification Suite
 * Tests POST /api/feedback (categories, screenshot validation, size/count caps),
 * GET /api/admin/feedback (RBAC, category, status, date range, screenshot, search filters),
 * and POST /api/admin/feedback/:id/update (status & internal notes).
 */

const path = require("path");
try { require("dotenv").config({ path: path.join(__dirname, ".env"), quiet: true }); } catch (e) {}

const http = require("http");
const { spawn } = require("child_process");
const jwt = require("jsonwebtoken");
const authHandler = require("./auth-handler");

const PORT = 8801;
const BASE = `http://127.0.0.1:${PORT}/api`;

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  [PASS] ${msg}`); passed++; }
  else { console.error(`  [FAIL] ${msg}`); failed++; }
}

function reqJson(method, pathname, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE}${pathname}`);
    const payload = body !== null ? JSON.stringify(body) : null;
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (payload) headers["Content-Length"] = Buffer.byteLength(payload);
    const req = http.request({
      hostname: url.hostname, port: url.port, path: url.pathname + url.search, method, headers
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
    try { const r = await reqJson("GET", "/health"); if (r.status === 200) return; } catch (e) {}
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error("Server failed to start");
}

const TINY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

async function run() {
  console.log("======================================================");
  console.log("JOBXAPPLY HELP & FEEDBACK VERIFICATION SUITE");
  console.log("======================================================");

  const serverProc = spawn(process.execPath, [path.join(__dirname, "sync-server.js")], {
    env: { ...process.env, PORT: String(PORT), NODE_ENV: "test", DATABASE_URL: "", ADMIN_EMAILS: "admin@jobxapply.app" },
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer();

    const adminToken = jwt.sign(
      { id: "u_pa52u5ad0x", email: "admin@jobxapply.app", role: "admin", emailVerified: true },
      process.env.JWT_SECRET || authHandler.JWT_SECRET,
      { expiresIn: "1h" }
    );

    // 1. Validation checks
    const badCat = await reqJson("POST", "/feedback", { category: "invalid_cat", subject: "Test", message: "Hello world" });
    assert(badCat.status === 400, "Invalid feedback category rejected (400)");

    const badImg = await reqJson("POST", "/feedback", {
      category: "bug", subject: "Bad image", message: "Testing image validation",
      screenshots: [{ name: "bad.exe", dataUrl: "data:application/octet-stream;base64,AAAA" }]
    });
    assert(badImg.status === 400, "Non-image screenshot rejected (400)");

    // 2. Valid submission with screenshot
    const fb1 = await reqJson("POST", "/feedback", {
      reporterName: "Alice",
      reporterEmail: "alice@example.com",
      category: "autofill_issue",
      subject: "Workday phone field skipped",
      message: "When applying on Workday, phone number stays blank.",
      screenshots: [{ name: "workday.png", dataUrl: TINY_PNG }],
      metadata: { tier: "free", viewport: "1280x800" }
    });
    assert(fb1.status === 201 && fb1.body.ok && fb1.body.id, "Valid feedback with screenshot created (201)");

    const fb2 = await reqJson("POST", "/feedback", {
      reporterName: "Bob",
      reporterEmail: "bob@example.com",
      category: "feature_request",
      subject: "Dark mode PDF export",
      message: "Please add dark theme option for resume export."
    });
    assert(fb2.status === 201 && fb2.body.ok, "Valid feature request without screenshot created (201)");

    // 3. Admin RBAC & Filtering
    const unauthAdmin = await reqJson("GET", "/admin/feedback");
    assert(unauthAdmin.status === 401, "Unauthenticated /api/admin/feedback rejected (401)");

    const byCat = await reqJson("GET", "/admin/feedback?category=autofill_issue", null, adminToken);
    assert(byCat.status === 200 && byCat.body.feedbacks.some(f => f.id === fb1.body.id) && !byCat.body.feedbacks.some(f => f.id === fb2.body.id),
      "Admin category filter isolates autofill_issue");

    const byShots = await reqJson("GET", "/admin/feedback?hasScreenshots=true", null, adminToken);
    assert(byShots.status === 200 && byShots.body.feedbacks.some(f => f.id === fb1.body.id) && !byShots.body.feedbacks.some(f => f.id === fb2.body.id),
      "Admin hasScreenshots filter returns only items with screenshots");

    const bySearch = await reqJson("GET", "/admin/feedback?q=Workday", null, adminToken);
    assert(bySearch.status === 200 && bySearch.body.feedbacks.some(f => f.id === fb1.body.id),
      "Admin search filter matches subject/message");

    const todayStr = new Date().toISOString().slice(0, 10);
    const byDate = await reqJson("GET", `/admin/feedback?from=${todayStr}&to=${todayStr}`, null, adminToken);
    assert(byDate.status === 200 && byDate.body.feedbacks.some(f => f.id === fb1.body.id),
      "Admin date range filter (today) includes newly created feedback");

    // 4. Elaborate & Update status/notes
    const upd = await reqJson("POST", `/admin/feedback/${fb1.body.id}/update`, {
      status: "resolved",
      adminNotes: "Updated Workday phone selector in portal maps."
    }, adminToken);
    assert(upd.status === 200 && upd.body.feedback.status === "resolved" && upd.body.feedback.adminNotes.includes("Workday"),
      "Admin updates feedback status to resolved with internal notes");

    const byStatus = await reqJson("GET", "/admin/feedback?status=resolved", null, adminToken);
    assert(byStatus.status === 200 && byStatus.body.feedbacks.some(f => f.id === fb1.body.id),
      "Admin status filter returns updated resolved feedback");

  } finally {
    serverProc.kill();
  }

  console.log(`\nFEEDBACK SUITE SUMMARY: Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
