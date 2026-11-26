/**
 * Comprehensive Automated Test Suite for JobXApply Payment, Webhook, Idempotency, Entitlement & Refund System
 * Uses mocked Razorpay API responses (zero real financial transactions).
 */

const crypto = require("crypto");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

// Ensure test-mode environment variables for deterministic test execution
process.env.RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "rzp_test_mock_key_id";
process.env.RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "mock_key_secret_for_tests_12345";
process.env.RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || "mock_webhook_secret_for_tests_67890";

const db = require("./db");
const { getPlanConfig, getPaymentEnvironment } = require("./plan-catalog");
const paymentService = require("./payment-service");

let total = 0;
let passed = 0;
let failed = 0;

function assert(cond, label, detail = "") {
  total++;
  if (cond) {
    passed++;
    console.log(`  [PASS] ${label}${detail ? ` (${detail})` : ""}`);
  } else {
    failed++;
    console.error(`  [FAIL] ${label}${detail ? ` (${detail})` : ""}`);
  }
}

function signCheckout(orderId, paymentId, secret = process.env.RAZORPAY_KEY_SECRET) {
  return crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
}

function signWebhook(rawBuf, secret = process.env.RAZORPAY_WEBHOOK_SECRET) {
  return crypto.createHmac("sha256", secret).update(rawBuf).digest("hex");
}

function createMockRzp({ paymentsMap = {}, ordersMap = {} } = {}) {
  let seq = 1;
  return {
    orders: {
      async create(opts) {
        const id = `order_mock_${Date.now()}_${seq++}`;
        const ord = { id, ...opts, status: "created" };
        ordersMap[id] = ord;
        return ord;
      },
      async fetch(id) {
        return ordersMap[id] || null;
      },
      async fetchPayments(orderId) {
        const items = Object.values(paymentsMap).filter(p => p.order_id === orderId);
        return { items };
      }
    },
    payments: {
      async fetch(id) {
        return paymentsMap[id] || null;
      }
    }
  };
}

async function runTests() {
  console.log("======================================================");
  console.log("JOBXAPPLY PAYMENT & ENTITLEMENT VERIFICATION SUITE");
  console.log("======================================================\n");

  await db.resetInMemoryPaymentStoreForTests();

  const userA = await db.createUser({ email: `pay_a_${Date.now()}@test.local`, name: "User A", passwordHash: "x" });
  const userB = await db.createUser({ email: `pay_b_${Date.now()}@test.local`, name: "User B", passwordHash: "x" });

  const paymentsMap = {};
  const ordersMap = {};
  const mockRzp = createMockRzp({ paymentsMap, ordersMap });

  try {
    // ── 1. Order Creation Tests ───────────────────────────────
    console.log("--- 1. Order Creation & Server-Side Pricing ---");

    let errUnauth = null;
    try {
      await paymentService.createOrderForUser({ user: null, planId: "pro", rzpClient: mockRzp });
    } catch (e) { errUnauth = e; }
    assert(errUnauth && errUnauth.statusCode === 401, "Unauthenticated order creation rejected (401)");

    let errInvalidPlan = null;
    try {
      await paymentService.createOrderForUser({ user: userA, planId: "vip_unlimited", rzpClient: mockRzp });
    } catch (e) { errInvalidPlan = e; }
    assert(errInvalidPlan && errInvalidPlan.statusCode === 400, "Invalid plan rejected (400)");

    let errTamperAmount = null;
    try {
      await paymentService.createOrderForUser({ user: userA, planId: "pro", clientAmount: 100, rzpClient: mockRzp });
    } catch (e) { errTamperAmount = e; }
    assert(errTamperAmount && errTamperAmount.statusCode === 400, "Client price tampering (amount=100) rejected (400)");

    let errTamperCurr = null;
    try {
      await paymentService.createOrderForUser({ user: userA, planId: "pro", clientCurrency: "USD", rzpClient: mockRzp });
    } catch (e) { errTamperCurr = e; }
    assert(errTamperCurr && errTamperCurr.statusCode === 400, "Currency manipulation (USD) rejected (400)");

    const order1 = await paymentService.createOrderForUser({ user: userA, planId: "pro", rzpClient: mockRzp });
    assert(order1.ok && order1.amount === 19900 && order1.currency === "INR" && order1.order_id,
      "Valid Pro order created with server-enforced 19900 paise INR", `order=${order1.order_id}`);

    // ── 2. Payment Verification Tests ─────────────────────────
    console.log("\n--- 2. Payment Verification & Gateway Checks ---");

    let errVerifyUnauth = null;
    try {
      await paymentService.verifyCheckoutAndFulfill({
        user: null, razorpayOrderId: order1.order_id, razorpayPaymentId: "pay_x", razorpaySignature: "sig", rzpClient: mockRzp
      });
    } catch (e) { errVerifyUnauth = e; }
    assert(errVerifyUnauth && errVerifyUnauth.statusCode === 401, "Verify without auth rejected (401)");

    let errVerifyMissing = null;
    try {
      await paymentService.verifyCheckoutAndFulfill({ user: userA, razorpayOrderId: order1.order_id, rzpClient: mockRzp });
    } catch (e) { errVerifyMissing = e; }
    assert(errVerifyMissing && errVerifyMissing.statusCode === 400, "Missing verification fields rejected (400)");

    let errUnknownOrder = null;
    try {
      await paymentService.verifyCheckoutAndFulfill({
        user: userA, razorpayOrderId: "order_unknown_999", razorpayPaymentId: "pay_x", razorpaySignature: signCheckout("order_unknown_999", "pay_x"), rzpClient: mockRzp
      });
    } catch (e) { errUnknownOrder = e; }
    assert(errUnknownOrder && errUnknownOrder.statusCode === 404, "Unknown order rejected (404)");

    let errCrossAccount = null;
    try {
      await paymentService.verifyCheckoutAndFulfill({
        user: userB, razorpayOrderId: order1.order_id, razorpayPaymentId: "pay_x", razorpaySignature: signCheckout(order1.order_id, "pay_x"), rzpClient: mockRzp
      });
    } catch (e) { errCrossAccount = e; }
    assert(errCrossAccount && errCrossAccount.statusCode === 403, "Cross-account order verification rejected (403)");

    let errBadSig = null;
    try {
      await paymentService.verifyCheckoutAndFulfill({
        user: userA, razorpayOrderId: order1.order_id, razorpayPaymentId: "pay_x", razorpaySignature: "bad_sig_hex", rzpClient: mockRzp
      });
    } catch (e) { errBadSig = e; }
    assert(errBadSig && errBadSig.statusCode === 400, "Invalid HMAC signature rejected (400)");

    // Authorized-but-uncaptured payment must NOT grant Pro
    paymentsMap["pay_auth_only"] = {
      id: "pay_auth_only", order_id: order1.order_id, amount: 19900, currency: "INR", status: "authorized", method: "card"
    };
    let errUncaptured = null;
    try {
      await paymentService.verifyCheckoutAndFulfill({
        user: userA, razorpayOrderId: order1.order_id, razorpayPaymentId: "pay_auth_only",
        razorpaySignature: signCheckout(order1.order_id, "pay_auth_only"), rzpClient: mockRzp
      });
    } catch (e) { errUncaptured = e; }
    assert(errUncaptured && errUncaptured.statusCode === 402, "Authorized-but-uncaptured payment rejected (402)");
    const entAfterAuth = await paymentService.getEffectiveEntitlement(userA.id, userA);
    assert(entAfterAuth.tier === "free", "Uncaptured payment did NOT grant Pro");

    // Incorrect amount on gateway payment
    paymentsMap["pay_wrong_amt"] = {
      id: "pay_wrong_amt", order_id: order1.order_id, amount: 500, currency: "INR", status: "captured", method: "upi"
    };
    let errWrongAmt = null;
    try {
      await paymentService.verifyCheckoutAndFulfill({
        user: userA, razorpayOrderId: order1.order_id, razorpayPaymentId: "pay_wrong_amt",
        razorpaySignature: signCheckout(order1.order_id, "pay_wrong_amt"), rzpClient: mockRzp
      });
    } catch (e) { errWrongAmt = e; }
    assert(errWrongAmt && errWrongAmt.statusCode === 400, "Incorrect gateway payment amount rejected (400)");

    // Wrong payment-to-order association
    paymentsMap["pay_wrong_ord"] = {
      id: "pay_wrong_ord", order_id: "order_other_123", amount: 19900, currency: "INR", status: "captured", method: "upi"
    };
    let errWrongOrd = null;
    try {
      await paymentService.verifyCheckoutAndFulfill({
        user: userA, razorpayOrderId: order1.order_id, razorpayPaymentId: "pay_wrong_ord",
        razorpaySignature: signCheckout(order1.order_id, "pay_wrong_ord"), rzpClient: mockRzp
      });
    } catch (e) { errWrongOrd = e; }
    assert(errWrongOrd && errWrongOrd.statusCode === 400, "Wrong payment-to-order association rejected (400)");

    // Valid captured payment grants Pro
    paymentsMap["pay_valid_1"] = {
      id: "pay_valid_1", order_id: order1.order_id, amount: 19900, currency: "INR", status: "captured", method: "upi"
    };
    const okVerify = await paymentService.verifyCheckoutAndFulfill({
      user: userA, razorpayOrderId: order1.order_id, razorpayPaymentId: "pay_valid_1",
      razorpaySignature: signCheckout(order1.order_id, "pay_valid_1"), rzpClient: mockRzp
    });
    assert(okVerify.ok && okVerify.tier === "pro" && okVerify.subscription.daysRemaining === 30,
      "Captured valid payment grants 30-day Pro entitlement");

    // Test payment cannot activate live entitlement
    const prevKeyId = process.env.RAZORPAY_KEY_ID;
    process.env.RAZORPAY_KEY_ID = "rzp_live_mock_key_id";
    let errTestOnLive = null;
    try {
      await paymentService.verifyCheckoutAndFulfill({
        user: userA, razorpayOrderId: order1.order_id, razorpayPaymentId: "pay_valid_1",
        razorpaySignature: signCheckout(order1.order_id, "pay_valid_1"), rzpClient: mockRzp
      });
    } catch (e) { errTestOnLive = e; }
    const liveEntForTestUser = await paymentService.getEffectiveEntitlement(userA.id, userA);
    process.env.RAZORPAY_KEY_ID = prevKeyId;
    assert(errTestOnLive && errTestOnLive.statusCode === 404,
      "Test-mode order/payment isolated from live environment (rejected 404)");
    assert(liveEntForTestUser.tier === "free" && liveEntForTestUser.status === "inactive_test_only",
      "Test-mode entitlement does NOT carry over when gateway switches to Live Mode");

    // Authorized test-only checkout gate (NODE_ENV=production, ENABLE_PUBLIC_CHECKOUT=false)
    const prevNodeEnv = process.env.NODE_ENV;
    const prevEnablePub = process.env.ENABLE_PUBLIC_CHECKOUT;
    const prevTestEmails = process.env.TEST_CHECKOUT_EMAILS;
    const prevReqPg = process.env.REQUIRE_PG_FOR_PAYMENTS;

    process.env.NODE_ENV = "production";
    process.env.ENABLE_PUBLIC_CHECKOUT = "false";

    // Missing/empty allowlist denies access
    process.env.TEST_CHECKOUT_EMAILS = "";
    let errEmptyAllow = null;
    try {
      await paymentService.createOrderForUser({ user: userA, planId: "pro", rzpClient: mockRzp });
    } catch (e) { errEmptyAllow = e; }
    assert(errEmptyAllow && errEmptyAllow.statusCode === 503 && errEmptyAllow.message.includes("Public paid checkout is disabled"),
      "Missing/empty TEST_CHECKOUT_EMAILS denies checkout (503)");

    // Whitespace & uppercase normalization on TEST_CHECKOUT_EMAILS
    process.env.TEST_CHECKOUT_EMAILS = `  ${userA.email.toUpperCase()}  , other@example.com `;

    // Allowlisted user with verified email passes the public checkout gate (hits DB fail-closed check since !usePg locally)
    let errAllowlistedPassGate = null;
    try {
      await paymentService.createOrderForUser({ user: { ...userA, emailVerified: true }, planId: "pro", rzpClient: mockRzp });
    } catch (e) { errAllowlistedPassGate = e; }
    assert(errAllowlistedPassGate && errAllowlistedPassGate.message.includes("PostgreSQL database is unavailable"),
      "Allowlisted test account passes checkout gate (email normalized) while public checkout stays disabled");

    // Unverified email rejected even if email matches allowlist
    let errUnverifiedEmail = null;
    try {
      await paymentService.createOrderForUser({ user: { ...userA, emailVerified: false }, planId: "pro", rzpClient: mockRzp });
    } catch (e) { errUnverifiedEmail = e; }
    assert(errUnverifiedEmail && errUnverifiedEmail.statusCode === 503 && errUnverifiedEmail.message.includes("Public paid checkout is disabled"),
      "Unverified email rejected by checkout allowlist gate (503)");

    // Non-allowlisted user rejected (even if payload attempts to pass allowlisted email, only user.email is trusted)
    let errNonAllowlisted = null;
    try {
      await paymentService.createOrderForUser({ user: userB, planId: "pro", rzpClient: mockRzp });
    } catch (e) { errNonAllowlisted = e; }
    assert(errNonAllowlisted && errNonAllowlisted.statusCode === 503 && errNonAllowlisted.message.includes("Public paid checkout is disabled"),
      "Non-allowlisted account rejected by public checkout gate (503)");

    // In live mode, even allowlisted TEST_CHECKOUT_EMAILS is blocked when public checkout is disabled
    process.env.RAZORPAY_KEY_ID = "rzp_live_mock_key_id";
    let errAllowlistedInLive = null;
    try {
      await paymentService.createOrderForUser({ user: userA, planId: "pro", rzpClient: mockRzp });
    } catch (e) { errAllowlistedInLive = e; }
    assert(errAllowlistedInLive && errAllowlistedInLive.statusCode === 503 && errAllowlistedInLive.message.includes("Public paid checkout is disabled"),
      "TEST_CHECKOUT_EMAILS cannot bypass public checkout gate in Live Mode (503)");

    // Controlled Live Checkout Gate (LIVE_CHECKOUT_EMAILS) separate from TEST_CHECKOUT_EMAILS
    process.env.LIVE_CHECKOUT_EMAILS = "founder_live@jobxapply.app";
    let errLiveGateOk = null;
    try {
      await paymentService.createOrderForUser({ user: { id: userA.id, email: "founder_live@jobxapply.app", emailVerified: true }, planId: "pro", rzpClient: mockRzp });
    } catch (e) { errLiveGateOk = e; }
    assert(errLiveGateOk && errLiveGateOk.message.includes("PostgreSQL database is unavailable"),
      "Verified LIVE_CHECKOUT_EMAILS account passes controlled Live checkout gate while public checkout stays disabled");

    let errLiveUnverified = null;
    try {
      await paymentService.createOrderForUser({ user: { id: userA.id, email: "founder_live@jobxapply.app", emailVerified: false }, planId: "pro", rzpClient: mockRzp });
    } catch (e) { errLiveUnverified = e; }
    assert(errLiveUnverified && errLiveUnverified.statusCode === 503,
      "Unverified LIVE_CHECKOUT_EMAILS account rejected (503)");
    delete process.env.LIVE_CHECKOUT_EMAILS;

    process.env.RAZORPAY_KEY_ID = prevKeyId;
    process.env.NODE_ENV = prevNodeEnv;
    process.env.ENABLE_PUBLIC_CHECKOUT = prevEnablePub;
    process.env.TEST_CHECKOUT_EMAILS = prevTestEmails;
    if (prevReqPg !== undefined) process.env.REQUIRE_PG_FOR_PAYMENTS = prevReqPg;

    // ── 3. Idempotency & Concurrency Tests ────────────────────
    console.log("\n--- 3. Idempotency, Concurrency & Rollback ---");

    const expBeforeReplay = okVerify.subscription.expiresAt;
    const replayRes = await paymentService.verifyCheckoutAndFulfill({
      user: userA, razorpayOrderId: order1.order_id, razorpayPaymentId: "pay_valid_1",
      razorpaySignature: signCheckout(order1.order_id, "pay_valid_1"), rzpClient: mockRzp
    });
    assert(replayRes.alreadyProcessed === true && replayRes.subscription.expiresAt === expBeforeReplay,
      "Repeated verification does NOT extend expiry (replay protected)");

    // Second distinct purchase extends by another 30 days (~60 days total)
    const order2 = await paymentService.createOrderForUser({ user: userA, planId: "pro", rzpClient: mockRzp });
    paymentsMap["pay_valid_2"] = {
      id: "pay_valid_2", order_id: order2.order_id, amount: 19900, currency: "INR", status: "captured", method: "card"
    };
    // Simultaneous callback + webhook for order2
    const whBodyObj = {
      event: "payment.captured",
      created_at: Math.floor(Date.now() / 1000),
      payload: { payment: { entity: paymentsMap["pay_valid_2"] } }
    };
    const whBuf = Buffer.from(JSON.stringify(whBodyObj), "utf8");
    const [cbRes, whRes] = await Promise.all([
      paymentService.verifyCheckoutAndFulfill({
        user: userA, razorpayOrderId: order2.order_id, razorpayPaymentId: "pay_valid_2",
        razorpaySignature: signCheckout(order2.order_id, "pay_valid_2"), rzpClient: mockRzp
      }),
      paymentService.handleWebhook({
        rawBodyBuffer: whBuf, signatureHeader: signWebhook(whBuf), eventIdHeader: "evt_concurrent_2", rzpClient: mockRzp
      })
    ]);
    const entAfterTwo = await paymentService.getEffectiveEntitlement(userA.id, userA);
    assert(cbRes.ok && whRes.ok && entAfterTwo.daysRemaining >= 59 && entAfterTwo.daysRemaining <= 60,
      "Simultaneous callback + webhook grants second 30-day extension exactly once", `daysRemaining=${entAfterTwo.daysRemaining}`);

    // Transaction rollback test
    let rolledBack = false;
    try {
      await db.withPaymentTransaction(async (tx) => {
        await tx.updateUserTier(userB.id, "pro");
        throw new Error("Simulated DB crash mid-tx");
      });
    } catch (e) { rolledBack = true; }
    const entB = await paymentService.getEffectiveEntitlement(userB.id, userB);
    assert(rolledBack && entB.tier === "free", "Transaction rollback preserves entitlement consistency");

    // ── 4. Webhook Security & Event Tests ─────────────────────
    console.log("\n--- 4. Webhook Verification & Events ---");

    let errWhNoSig = null;
    try {
      await paymentService.handleWebhook({ rawBodyBuffer: whBuf, signatureHeader: "", eventIdHeader: "evt_nosig" });
    } catch (e) { errWhNoSig = e; }
    assert(errWhNoSig && errWhNoSig.statusCode === 400, "Missing webhook signature rejected (400)");

    let errWhBadSig = null;
    try {
      await paymentService.handleWebhook({ rawBodyBuffer: whBuf, signatureHeader: "bad_wh_sig", eventIdHeader: "evt_badsig" });
    } catch (e) { errWhBadSig = e; }
    assert(errWhBadSig && errWhBadSig.statusCode === 400, "Invalid webhook signature rejected (400)");

    const modifiedBuf = Buffer.from(JSON.stringify({ ...whBodyObj, tampered: true }), "utf8");
    let errWhTampered = null;
    try {
      await paymentService.handleWebhook({ rawBodyBuffer: modifiedBuf, signatureHeader: signWebhook(whBuf), eventIdHeader: "evt_mod" });
    } catch (e) { errWhTampered = e; }
    assert(errWhTampered && errWhTampered.statusCode === 400, "Modified webhook payload rejected (400)");

    const dupWh = await paymentService.handleWebhook({
      rawBodyBuffer: whBuf, signatureHeader: signWebhook(whBuf), eventIdHeader: "evt_concurrent_2", rzpClient: mockRzp
    });
    assert(dupWh.ok && dupWh.duplicate === true, "Duplicate webhook event deduplicated safely");

    const unsupBuf = Buffer.from(JSON.stringify({ event: "invoice.paid", created_at: 12345 }), "utf8");
    const unsupRes = await paymentService.handleWebhook({
      rawBodyBuffer: unsupBuf, signatureHeader: signWebhook(unsupBuf), eventIdHeader: "evt_unsup_1"
    });
    assert(unsupRes.ok && unsupRes.ignored === true, "Unsupported webhook event handled safely");

    // Failed payment webhook for User B must NOT activate Pro
    const orderB = await paymentService.createOrderForUser({ user: userB, planId: "pro", rzpClient: mockRzp });
    const failWhBuf = Buffer.from(JSON.stringify({
      event: "payment.failed",
      payload: { payment: { entity: { id: "pay_fail_b", order_id: orderB.order_id, amount: 19900, currency: "INR", status: "failed" } } }
    }), "utf8");
    const failWhRes = await paymentService.handleWebhook({
      rawBodyBuffer: failWhBuf, signatureHeader: signWebhook(failWhBuf), eventIdHeader: "evt_fail_b"
    });
    const entBAfterFail = await paymentService.getEffectiveEntitlement(userB.id, userB);
    assert(failWhRes.ok && entBAfterFail.tier === "free", "Failed payment webhook does NOT activate Pro");

    // ── 5. Entitlement Expiry & Reconciliation Tests ──────────
    console.log("\n--- 5. Entitlement Expiry & Payment Reconciliation ---");

    // Reconciliation recovers captured payment when user closed tab
    paymentsMap["pay_reconcile_b"] = {
      id: "pay_reconcile_b", order_id: orderB.order_id, amount: 19900, currency: "INR", status: "captured", method: "netbanking"
    };
    const recRes = await paymentService.reconcileUserOrders({ user: userB, orderId: orderB.order_id, rzpClient: mockRzp });
    assert(recRes.ok && recRes.reconciled === true && recRes.tier === "pro",
      "Payment reconciliation recovers captured payment for pending order");

    // Expired Pro account automatically downgraded to free
    await db.withPaymentTransaction(async (tx) => {
      const ent = await tx.getEntitlementForUpdate(userB.id, "test");
      await tx.upsertEntitlement({ ...ent, expiresAt: Date.now() - 10000 });
    });
    const expiredEntB = await paymentService.getEffectiveEntitlement(userB.id, userB);
    assert(expiredEntB.tier === "free" && expiredEntB.status === "expired",
      "Expired Pro entitlement automatically enforces free tier");

    // ── 6. Refund Tests ───────────────────────────────────────
    console.log("\n--- 6. Full, Partial & Duplicate Refund Handling ---");

    // Partial refund on userA's pay_valid_1 retains Pro
    const partRefBuf = Buffer.from(JSON.stringify({
      event: "refund.processed",
      payload: { refund: { entity: { id: "rfnd_part_1", payment_id: "pay_valid_1", amount: 5000, currency: "INR", status: "processed" } } }
    }), "utf8");
    await paymentService.handleWebhook({
      rawBodyBuffer: partRefBuf, signatureHeader: signWebhook(partRefBuf), eventIdHeader: "evt_rfnd_part_1"
    });
    const entAfterPartRef = await paymentService.getEffectiveEntitlement(userA.id, userA);
    assert(entAfterPartRef.tier === "pro", "Partial refund retains Pro entitlement");

    // Full refund on pay_valid_1 (remaining 14900) does NOT wipe unrelated purchase pay_valid_2
    const fullRefBuf = Buffer.from(JSON.stringify({
      event: "refund.processed",
      payload: { refund: { entity: { id: "rfnd_full_1", payment_id: "pay_valid_1", amount: 14900, currency: "INR", status: "processed" } } }
    }), "utf8");
    await paymentService.handleWebhook({
      rawBodyBuffer: fullRefBuf, signatureHeader: signWebhook(fullRefBuf), eventIdHeader: "evt_rfnd_full_1"
    });
    const entAfterHistRef = await paymentService.getEffectiveEntitlement(userA.id, userA);
    assert(entAfterHistRef.tier === "pro", "Full refund of historical payment preserves unrelated active purchase (pay_valid_2)");

    // Full refund of pay_valid_2 (only remaining active purchase) revokes Pro
    const fullRef2Buf = Buffer.from(JSON.stringify({
      event: "refund.processed",
      payload: { refund: { entity: { id: "rfnd_full_2", payment_id: "pay_valid_2", amount: 19900, currency: "INR", status: "processed" } } }
    }), "utf8");
    await paymentService.handleWebhook({
      rawBodyBuffer: fullRef2Buf, signatureHeader: signWebhook(fullRef2Buf), eventIdHeader: "evt_rfnd_full_2"
    });
    const entAfterAllRef = await paymentService.getEffectiveEntitlement(userA.id, userA);
    assert(entAfterAllRef.tier === "free" && entAfterAllRef.status === "refunded",
      "Full refund of sole active purchase revokes Pro entitlement");

    // Duplicate refund event handled idempotently
    const dupRefRes = await paymentService.handleWebhook({
      rawBodyBuffer: fullRef2Buf, signatureHeader: signWebhook(fullRef2Buf), eventIdHeader: "evt_rfnd_full_2"
    });
    assert(dupRefRes.ok && dupRefRes.duplicate === true, "Duplicate refund event deduplicated safely");

    // ── 7. Live vs Test Coexistence & Cross-Env Isolation ─────
    console.log("\n--- 7. Live vs Test Coexistence & Cross-Environment Isolation ---");

    const liveOrigExpires = Date.now() + 20 * 86400000;
    await db.withPaymentTransaction(async (tx) => {
      await tx.upsertEntitlement({
        userId: userA.id,
        planId: "pro",
        status: "active",
        startedAt: Date.now() - 10 * 86400000,
        expiresAt: liveOrigExpires,
        sourcePaymentId: "pay_live_orig_999",
        environment: "live",
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    });

    const orderTestCoexist = await paymentService.createOrderForUser({ user: userA, planId: "pro", rzpClient: mockRzp });
    paymentsMap["pay_test_coexist"] = {
      id: "pay_test_coexist", order_id: orderTestCoexist.order_id, amount: 19900, currency: "INR", status: "captured", method: "upi"
    };
    await paymentService.verifyCheckoutAndFulfill({
      user: userA, razorpayOrderId: orderTestCoexist.order_id, razorpayPaymentId: "pay_test_coexist",
      razorpaySignature: signCheckout(orderTestCoexist.order_id, "pay_test_coexist"), rzpClient: mockRzp
    });

    process.env.RAZORPAY_KEY_ID = "rzp_live_mock_key_id";
    const liveEntAfterTestPurchase = await paymentService.getEffectiveEntitlement(userA.id, userA);
    process.env.RAZORPAY_KEY_ID = prevKeyId;
    assert(liveEntAfterTestPurchase.tier === "pro" && liveEntAfterTestPurchase.expiresAt === liveOrigExpires && liveEntAfterTestPurchase.lastPaymentId === "pay_live_orig_999",
      "Test purchase did NOT overwrite or extend legitimate Live entitlement");

    const testRefundBuf = Buffer.from(JSON.stringify({
      event: "refund.processed",
      payload: { refund: { entity: { id: "rfnd_test_coexist", payment_id: "pay_test_coexist", amount: 19900, currency: "INR", status: "processed" } } }
    }), "utf8");
    await paymentService.handleWebhook({
      rawBodyBuffer: testRefundBuf, signatureHeader: signWebhook(testRefundBuf), eventIdHeader: "evt_rfnd_test_coexist"
    });
    process.env.RAZORPAY_KEY_ID = "rzp_live_mock_key_id";
    const liveEntAfterTestRefund = await paymentService.getEffectiveEntitlement(userA.id, userA);
    process.env.RAZORPAY_KEY_ID = prevKeyId;
    assert(liveEntAfterTestRefund.tier === "pro" && liveEntAfterTestRefund.expiresAt === liveOrigExpires && liveEntAfterTestRefund.lastPaymentId === "pay_live_orig_999",
      "Test refund did NOT modify or revoke legitimate Live entitlement");

  } finally {
    await db.deleteUser(userA.id);
    await db.deleteUser(userB.id);
    await db.resetInMemoryPaymentStoreForTests();
  }

  console.log("\n======================================================");
  console.log(`PAYMENT SUITE SUMMARY: Total: ${total} | Passed: ${passed} | Failed: ${failed}`);
  console.log("======================================================");
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
