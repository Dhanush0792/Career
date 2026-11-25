/**
 * Authoritative Plan Catalog & Environment Validation for JobXApply
 *
 * Commercial Model:
 *   - Free: ₹0 forever (capped monthly quotas + 20-entry tracker + basic ATS + standard cover letter)
 *   - Pro:  ₹199 for 30 days (one-time prepaid pass, NO auto-renewal, unlimited core tools)
 *
 * Server-owned pricing & limits — never trust client-submitted plan amounts or tier flags.
 */

const PLAN_VERSION = "2026-11-v1";

const COVER_LETTER_TEMPLATES_ALL = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"];
const RESUME_TEMPLATES_ALL = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"];

const PLAN_CATALOG = Object.freeze({
  free: Object.freeze({
    id: "free",
    name: "Free",
    displayName: "Free",
    amount: 0,
    amountPaise: 0,
    amountInr: 0,
    currency: "INR",
    durationDays: null,
    billingType: "forever",
    autoRenew: false,
    tagline: "Core tools to start tracking and applying.",
    limits: Object.freeze({
      autofillsPerMonth: 10,
      resumeExportsPerMonth: 2,
      coverLetterExportsPerMonth: 2,
      trackerMaxApplications: 20,
      atsDetailLevel: "basic",
      atsMaxMissingKeywords: 3,
      resumeTemplates: RESUME_TEMPLATES_ALL,
      coverLetterTemplates: Object.freeze(["01"]),
      cloudSync: true
    }),
    features: Object.freeze([
      "10 Smart Autofills per month",
      "Up to 20 saved jobs in Application Tracker",
      "Basic ATS compatibility score & top 3 keyword gaps",
      "2 Resume exports & 2 Cover Letter exports per month",
      "Standard Cover Letter template + Resume templates",
      "Cloud profile sync across devices"
    ])
  }),
  pro: Object.freeze({
    id: "pro",
    name: "Pro",
    displayName: "Pro",
    amount: 19900,
    amountPaise: 19900,
    amountInr: 199,
    currency: "INR",
    durationDays: 30,
    billingType: "one_time_prepaid",
    autoRenew: false,
    tagline: "Unlimited applications & full ATS insights for 30 days.",
    limits: Object.freeze({
      autofillsPerMonth: null,
      resumeExportsPerMonth: null,
      coverLetterExportsPerMonth: null,
      trackerMaxApplications: null,
      atsDetailLevel: "full",
      atsMaxMissingKeywords: null,
      resumeTemplates: RESUME_TEMPLATES_ALL,
      coverLetterTemplates: COVER_LETTER_TEMPLATES_ALL,
      cloudSync: true
    }),
    features: Object.freeze([
      "Unlimited Smart Autofills",
      "Unlimited Application Tracker entries",
      "Full ATS keyword breakdown & actionable suggestions",
      "Unlimited Resume & Cover Letter exports",
      "All 10 Cover Letter & all 10 Resume templates",
      "30-day prepaid pass — no auto-renewal"
    ])
  })
});

const LEGACY_PAID_TIERS = new Set(["paid", "pro", "premium", "enterprise"]);

function normalizeTierName(rawTier) {
  const t = String(rawTier || "free").trim().toLowerCase();
  if (LEGACY_PAID_TIERS.has(t)) return "pro";
  return "free";
}

function getPlanConfig(planId = "pro") {
  const key = String(planId || "pro").trim().toLowerCase();
  if (key === "free") return PLAN_CATALOG.free;
  if (key === "pro" || key === "paid") return PLAN_CATALOG.pro;
  return null;
}

function getPlanLimits(tier = "free") {
  const normalized = normalizeTierName(tier);
  return PLAN_CATALOG[normalized].limits;
}

function getPublicPlansPayload() {
  return {
    ok: true,
    planVersion: PLAN_VERSION,
    currency: "INR",
    billingModel: "one_time_prepaid",
    autoRenew: false,
    plans: [
      {
        id: PLAN_CATALOG.free.id,
        name: PLAN_CATALOG.free.name,
        displayName: PLAN_CATALOG.free.displayName,
        amountPaise: PLAN_CATALOG.free.amountPaise,
        amountInr: PLAN_CATALOG.free.amountInr,
        currency: PLAN_CATALOG.free.currency,
        durationDays: PLAN_CATALOG.free.durationDays,
        billingType: PLAN_CATALOG.free.billingType,
        autoRenew: PLAN_CATALOG.free.autoRenew,
        tagline: PLAN_CATALOG.free.tagline,
        limits: PLAN_CATALOG.free.limits,
        features: PLAN_CATALOG.free.features
      },
      {
        id: PLAN_CATALOG.pro.id,
        name: PLAN_CATALOG.pro.name,
        displayName: PLAN_CATALOG.pro.displayName,
        amountPaise: PLAN_CATALOG.pro.amountPaise,
        amountInr: PLAN_CATALOG.pro.amountInr,
        currency: PLAN_CATALOG.pro.currency,
        durationDays: PLAN_CATALOG.pro.durationDays,
        billingType: PLAN_CATALOG.pro.billingType,
        autoRenew: PLAN_CATALOG.pro.autoRenew,
        tagline: PLAN_CATALOG.pro.tagline,
        limits: PLAN_CATALOG.pro.limits,
        features: PLAN_CATALOG.pro.features
      }
    ]
  };
}

function getPaymentEnvironment(keyId = process.env.RAZORPAY_KEY_ID) {
  const key = String(keyId || "").trim();
  if (key.startsWith("rzp_live_")) return "live";
  if (key.startsWith("rzp_test_")) return "test";
  return "unconfigured";
}

function validatePaymentEnv(env = process.env) {
  const keyId = String(env.RAZORPAY_KEY_ID || "").trim();
  const keySecret = String(env.RAZORPAY_KEY_SECRET || "").trim();
  const webhookSecret = String(env.RAZORPAY_WEBHOOK_SECRET || "").trim();
  const environment = getPaymentEnvironment(keyId);
  const publicCheckoutEnabled = String(env.ENABLE_PUBLIC_CHECKOUT || "false").trim().toLowerCase() === "true";

  const errors = [];
  const warnings = [];

  if (!keyId) errors.push("RAZORPAY_KEY_ID is missing");
  if (!keySecret) errors.push("RAZORPAY_KEY_SECRET is missing");
  if (keyId && environment === "unconfigured") {
    errors.push("RAZORPAY_KEY_ID must start with rzp_test_ or rzp_live_");
  }
  if (!webhookSecret) {
    warnings.push("RAZORPAY_WEBHOOK_SECRET is not set; webhook verification will fail");
  }
  if (String(env.NODE_ENV || "").toLowerCase() === "production" && !env.DATABASE_URL) {
    errors.push("DATABASE_URL is required in production for persistent payment storage");
  }

  return {
    configured: Boolean(keyId && keySecret && environment !== "unconfigured"),
    webhookConfigured: Boolean(webhookSecret),
    environment,
    publicCheckoutEnabled,
    errors,
    warnings
  };
}

module.exports = {
  PLAN_VERSION,
  PLAN_CATALOG,
  LEGACY_PAID_TIERS,
  COVER_LETTER_TEMPLATES_ALL,
  RESUME_TEMPLATES_ALL,
  normalizeTierName,
  getPlanConfig,
  getPlanLimits,
  getPublicPlansPayload,
  getPaymentEnvironment,
  validatePaymentEnv
};
