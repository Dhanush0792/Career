/**
 * Authoritative Server-Side Plan Catalog & Payment Environment Validator
 * Single source of truth for subscription pricing, durations, and Razorpay mode.
 */

const PLAN_CATALOG = Object.freeze({
  pro: Object.freeze({
    id: "pro",
    name: "JobXApply Pro",
    amount: 19900, // 199.00 INR in paise
    currency: "INR",
    durationDays: 30,
    paymentType: "one_time_prepaid",
    description: "30-day prepaid access with no automatic renewal"
  })
});

const LEGACY_PAID_TIERS = new Set(["pro", "paid", "premium", "operative", "command"]);

function getPlanConfig(planId) {
  if (!planId || typeof planId !== "string") return null;
  const normalized = planId.trim().toLowerCase();
  return PLAN_CATALOG[normalized] || null;
}

function normalizeTierName(rawTier) {
  const t = String(rawTier || "free").trim().toLowerCase();
  return LEGACY_PAID_TIERS.has(t) ? "pro" : "free";
}

function getPaymentEnvironment(keyId = process.env.RAZORPAY_KEY_ID) {
  if (!keyId || typeof keyId !== "string") return "unconfigured";
  if (keyId.startsWith("rzp_live_")) return "live";
  if (keyId.startsWith("rzp_test_")) return "test";
  return "invalid";
}

function validatePaymentEnv() {
  const keyId = process.env.RAZORPAY_KEY_ID || "";
  const keySecret = process.env.RAZORPAY_KEY_SECRET || "";
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || "";
  const env = getPaymentEnvironment(keyId);
  const warnings = [];

  if (!keyId || !keySecret) {
    warnings.push("RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is not set.");
  } else if (env === "invalid") {
    warnings.push("RAZORPAY_KEY_ID does not start with rzp_test_ or rzp_live_.");
  }

  if (!webhookSecret) {
    warnings.push("RAZORPAY_WEBHOOK_SECRET is not set; webhook requests will be rejected.");
  }

  if (process.env.NODE_ENV === "production" && env === "test") {
    warnings.push("Running in production NODE_ENV with Razorpay TEST keys.");
  }

  return {
    configured: Boolean(keyId && keySecret && env !== "invalid"),
    webhookConfigured: Boolean(webhookSecret),
    environment: env,
    warnings
  };
}

module.exports = {
  PLAN_CATALOG,
  LEGACY_PAID_TIERS,
  getPlanConfig,
  normalizeTierName,
  getPaymentEnvironment,
  validatePaymentEnv
};
