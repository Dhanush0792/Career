/**
 * Executable Real PostgreSQL Integration Verification Suite for JobXApply
 *
 * Usage:
 *   Set TEST_DATABASE_URL (or DATABASE_URL) to an isolated PostgreSQL test database, then run:
 *   node backend/pg-integration-test.js
 *
 * Safety: Never run against production customer data without explicit isolation.
 */

const path = require("path");
try {
  require("dotenv").config({ path: path.join(__dirname, ".env"), quiet: true });
} catch (e) {}

const connStr = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || "";
if (!connStr) {
  console.error("[BLOCKED] TEST_DATABASE_URL or DATABASE_URL is not set. Cannot run real PostgreSQL integration tests.");
  console.error("Founder action: Provide an isolated PostgreSQL connection string in TEST_DATABASE_URL and re-run.");
  process.exit(2);
}

process.env.DATABASE_URL = connStr;
const { Pool } = require("pg");
const db = require("./db");

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

async function run() {
  console.log("======================================================");
  console.log("JOBXAPPLY REAL POSTGRESQL INTEGRATION VERIFICATION");
  console.log("======================================================");

  const pool = new Pool({
    connectionString: connStr,
    ssl: process.env.DB_SSL_REJECT_UNAUTHORIZED === "true" ? { rejectUnauthorized: true } : { rejectUnauthorized: false }
  });

  // Wait for db.js pool initialization
  for (let i = 0; i < 30; i++) {
    if (db.isPgAvailable()) break;
    await new Promise(r => setTimeout(r, 200));
  }
  assert(db.isPgAvailable(), "db.isPgAvailable() is true after schema initialization");

  const testUserId = `pg_test_${Date.now()}`;
  const testEmail = `${testUserId}@example.com`;
  try {
    await db.createUser({ id: testUserId, email: testEmail, name: "PG Tester", passwordHash: "" });

    // 1. Verify all 14 tables & RLS enabled
    const tblRes = await pool.query(`
      SELECT tablename, rowsecurity FROM pg_tables
      WHERE schemaname = 'public'
      AND tablename IN (
        'users','userdata','reports','telemetry','payment_orders','payments',
        'webhook_events','subscription_entitlements','refunds',
        'usage_counters','usage_operations','payment_receipts','admin_audit_logs','analytics_events'
      )
    `);
    assert(tblRes.rows.length === 14, `All 14 expected tables exist (found ${tblRes.rows.length})`);
    assert(tblRes.rows.every(r => r.rowsecurity === true), "RLS is enabled on all 14 tables");

    // 2. Verify usage_counters primary key includes environment
    const pkRes = await pool.query(`
      SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
      WHERE conrelid = 'usage_counters'::regclass AND contype = 'p'
    `);
    assert(pkRes.rows[0]?.def?.includes("environment"), "usage_counters PK includes environment for test/live isolation");

    // 3. Real PG transaction rollback test
    let rolledBack = false;
    try {
      await db.withPaymentTransaction(async (tx) => {
        await tx.insertOrder({
          internalOrderId: `ord_rb_${Date.now()}`,
          userId: testUserId,
          razorpayOrderId: `order_rb_${Date.now()}`,
          planId: "pro",
          expectedAmount: 19900,
          currency: "INR",
          durationDays: 30,
          environment: "test",
          status: "created",
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
        throw new Error("Simulated failure for PG rollback");
      });
    } catch (e) {
      rolledBack = true;
    }
    const pendingAfterRb = await db.getPendingOrdersByUser(testUserId, "test");
    assert(rolledBack && pendingAfterRb.length === 0, "PostgreSQL transaction rollback leaves 0 partial orders");

    // 4. Concurrent quota reservations (limit=2, 5 concurrent attempts -> exactly 2 succeed)
    const periodKey = "2026-11";
    const attempts = await Promise.all(
      Array.from({ length: 5 }, (_, i) => db.reserveUsageOperation({
        operationId: `pg_conc_${testUserId}_${i}`,
        userId: testUserId,
        periodKey,
        metricKey: "autofill",
        environment: "test",
        limit: 2
      }))
    );
    const okCount = attempts.filter(a => a.ok).length;
    assert(okCount === 2, `Concurrent PG quota reservations with limit=2 allowed exactly 2 (got ${okCount})`);

    // 5. Concurrent atomic tracker saves (limit=20)
    const apps20 = Array.from({ length: 20 }, (_, i) => ({ id: `t${i}` }));
    const apps21 = Array.from({ length: 21 }, (_, i) => ({ id: `t${i}` }));
    const [t20, t21] = await Promise.all([
      db.saveApplicationsAtomic({ userId: testUserId, applications: apps20, maxLimit: 20 }),
      db.saveApplicationsAtomic({ userId: testUserId, applications: apps21, maxLimit: 20 })
    ]);
    assert(t20.ok === true && t21.ok === false, "Concurrent PG atomic tracker check allows 20 and rejects 21");
  } finally {
    await pool.query("DELETE FROM users WHERE id = $1", [testUserId]).catch(() => {});
    await pool.end();
  }

  console.log(`\nPG INTEGRATION SUMMARY: Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error("PG integration suite error:", err);
  process.exit(1);
});
