/**
 * Centralized Entitlement, Capability & Usage Quota Service for JobXApply
 *
 * Single source of truth for:
 *   - Effective tier & capabilities (Free vs Pro)
 *   - Monthly UTC calendar quota tracking (autofills, resume exports, cover letter exports)
 *   - Application Tracker capacity enforcement (20 on Free, unlimited on Pro)
 *   - Cover letter template eligibility ('01' on Free, all 10 on Pro)
 *   - ATS analysis detail level (basic score + summary + top 3 gaps on Free, full on Pro)
 */

const crypto = require("crypto");
const db = require("./db");
const planCatalog = require("./plan-catalog");
const paymentService = require("./payment-service");

const ERROR_CODES = Object.freeze({
  AUTH_REQUIRED: "AUTH_REQUIRED",
  FEATURE_REQUIRES_PRO: "FEATURE_REQUIRES_PRO",
  QUOTA_EXCEEDED: "QUOTA_EXCEEDED",
  TRACKER_CAPACITY_REACHED: "TRACKER_CAPACITY_REACHED",
  SUBSCRIPTION_EXPIRED: "SUBSCRIPTION_EXPIRED",
  ENTITLEMENT_UNAVAILABLE: "ENTITLEMENT_UNAVAILABLE",
  CHECKOUT_DISABLED: "CHECKOUT_DISABLED"
});

function getCurrentPeriodKey(nowMs = Date.now()) {
  const d = new Date(nowMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function getNextResetAtIso(nowMs = Date.now()) {
  const d = new Date(nowMs);
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return next.toISOString();
}

function formatMetricQuota(counter = { used: 0, reserved: 0 }, limit = null) {
  const used = Number(counter.used || 0);
  const reserved = Number(counter.reserved || 0);
  if (limit === null || limit === undefined) {
    return {
      used,
      reserved,
      limit: null,
      remaining: null,
      unlimited: true
    };
  }
  const remaining = Math.max(0, Number(limit) - (used + reserved));
  return {
    used,
    reserved,
    limit: Number(limit),
    remaining,
    unlimited: false
  };
}

async function getUserCapabilities(userId, userRow = null) {
  const ent = await paymentService.getEffectiveEntitlement(userId, userRow);
  const tier = planCatalog.normalizeTierName(ent.tier);
  const limits = planCatalog.getPlanLimits(tier);

  return {
    tier,
    planId: tier,
    planVersion: planCatalog.PLAN_VERSION,
    status: ent.status || (tier === "pro" ? "active" : "free"),
    startedAt: ent.startedAt || null,
    expiresAt: ent.expiresAt || null,
    daysRemaining: ent.daysRemaining || 0,
    environment: ent.environment || "live",
    lastPaymentId: ent.lastPaymentId || null,
    autoRenew: false,
    limits,
    capabilities: {
      unlimitedAutofill: tier === "pro",
      unlimitedTracker: tier === "pro",
      fullAtsBreakdown: tier === "pro",
      unlimitedResumeExports: tier === "pro",
      unlimitedCoverLetterExports: tier === "pro",
      allCoverLetterTemplates: tier === "pro"
    }
  };
}

async function getUsageStatus(userId, userRow = null, nowMs = Date.now()) {
  const cap = await getUserCapabilities(userId, userRow);
  const periodKey = getCurrentPeriodKey(nowMs);
  const resetsAt = getNextResetAtIso(nowMs);
  const counters = await db.getUsageCounters(userId, periodKey, cap.environment);
  const apps = await db.getApplications(userId);
  const trackerCount = Array.isArray(apps) ? apps.length : 0;
  const trackerLimit = cap.limits.trackerMaxApplications;

  return {
    periodKey,
    resetsAt,
    tier: cap.tier,
    autofills: formatMetricQuota(counters.autofill, cap.limits.autofillsPerMonth),
    resumeExports: formatMetricQuota(counters.resume_export, cap.limits.resumeExportsPerMonth),
    coverLetterExports: formatMetricQuota(counters.cover_letter_export, cap.limits.coverLetterExportsPerMonth),
    tracker: {
      used: trackerCount,
      limit: trackerLimit,
      remaining: trackerLimit === null ? null : Math.max(0, trackerLimit - trackerCount),
      unlimited: trackerLimit === null
    }
  };
}

async function canAccessFeature(userId, userRow, featureKey, context = {}) {
  const cap = await getUserCapabilities(userId, userRow);
  if (featureKey === "cover_letter_template") {
    const tpl = String(context.templateId || "01");
    const allowed = cap.limits.coverLetterTemplates.includes(tpl);
    return { allowed, cap, code: allowed ? null : ERROR_CODES.FEATURE_REQUIRES_PRO };
  }
  if (featureKey === "ats_full_breakdown") {
    const allowed = cap.capabilities.fullAtsBreakdown;
    return { allowed, cap, code: allowed ? null : ERROR_CODES.FEATURE_REQUIRES_PRO };
  }
  return { allowed: true, cap, code: null };
}

async function reserveUsage({ user, metricKey, operationId, metadata = {} }) {
  if (!user || !user.id) {
    return {
      ok: false,
      statusCode: 401,
      code: ERROR_CODES.AUTH_REQUIRED,
      error: "Authentication required"
    };
  }
  const cap = await getUserCapabilities(user.id, user);
  const periodKey = getCurrentPeriodKey();
  const resetsAt = getNextResetAtIso();

  let limit = null;
  if (metricKey === "autofill") limit = cap.limits.autofillsPerMonth;
  else if (metricKey === "resume_export") limit = cap.limits.resumeExportsPerMonth;
  else if (metricKey === "cover_letter_export") limit = cap.limits.coverLetterExportsPerMonth;

  const opId = operationId || `op_${metricKey}_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
  const res = await db.reserveUsageOperation({
    operationId: opId,
    userId: user.id,
    periodKey,
    metricKey,
    environment: cap.environment,
    limit,
    metadata
  });

  if (!res.ok) {
    if (res.reason === "CROSS_ACCOUNT_OPERATION") {
      return {
        ok: false,
        statusCode: 403,
        code: "INVALID_OPERATION",
        error: "Operation ID belongs to a different account."
      };
    }
    return {
      ok: false,
      statusCode: 403,
      code: cap.status === "expired" ? ERROR_CODES.SUBSCRIPTION_EXPIRED : ERROR_CODES.QUOTA_EXCEEDED,
      upgradeRequired: true,
      metricKey,
      used: res.used,
      reserved: res.reserved,
      limit: res.limit,
      resetsAt,
      tier: cap.tier,
      error: `Monthly ${metricKey.replace(/_/g, " ")} quota reached (${res.limit}/${res.limit}). Upgrade to Pro for unlimited access.`
    };
  }

  return {
    ok: true,
    operationId: res.operationId,
    idempotent: Boolean(res.idempotent),
    tier: cap.tier,
    limit,
    used: res.used,
    reserved: res.reserved,
    remaining: limit === null ? null : Math.max(0, limit - (res.used + res.reserved)),
    resetsAt
  };
}

async function finalizeUsage({ user, operationId }) {
  if (!user || !user.id) {
    return { ok: false, statusCode: 401, code: ERROR_CODES.AUTH_REQUIRED, error: "Authentication required" };
  }
  if (!operationId) {
    return { ok: false, statusCode: 400, code: "INVALID_OPERATION", error: "operationId is required" };
  }
  const res = await db.finalizeUsageOperation(operationId, user.id);
  if (!res.ok) {
    return { ok: false, statusCode: 400, code: "INVALID_OPERATION", error: res.error || "Unable to finalize usage operation" };
  }
  const usage = await getUsageStatus(user.id, user);
  return { ok: true, status: res.status, idempotent: Boolean(res.idempotent), usage };
}

async function releaseUsage({ user, operationId }) {
  if (!user || !user.id) {
    return { ok: false, statusCode: 401, code: ERROR_CODES.AUTH_REQUIRED, error: "Authentication required" };
  }
  if (!operationId) {
    return { ok: false, statusCode: 400, code: "INVALID_OPERATION", error: "operationId is required" };
  }
  const res = await db.releaseUsageOperation(operationId, user.id);
  if (!res.ok) {
    return { ok: false, statusCode: 400, code: "INVALID_OPERATION", error: res.error || "Unable to release usage operation" };
  }
  const usage = await getUsageStatus(user.id, user);
  return { ok: true, status: res.status, idempotent: Boolean(res.idempotent), usage };
}

async function checkTrackerSaveAllowed(user, incomingApplications = []) {
  if (!user || !user.id) {
    return { ok: false, statusCode: 401, code: ERROR_CODES.AUTH_REQUIRED, error: "Authentication required" };
  }
  const cap = await getUserCapabilities(user.id, user);
  const limit = cap.limits.trackerMaxApplications;
  if (limit === null) return { ok: true, cap };

  const existingApps = await db.getApplications(user.id);
  const existingCount = Array.isArray(existingApps) ? existingApps.length : 0;
  const incomingCount = Array.isArray(incomingApplications) ? incomingApplications.length : 0;

  // Never block edits, status changes, or deletions of existing items;
  // only block increasing total stored count beyond the Free cap (or beyond existingCount if already over cap after downgrade).
  if (incomingCount > limit && incomingCount > existingCount) {
    return {
      ok: false,
      statusCode: 403,
      code: cap.status === "expired" ? ERROR_CODES.SUBSCRIPTION_EXPIRED : ERROR_CODES.TRACKER_CAPACITY_REACHED,
      upgradeRequired: true,
      limit,
      currentCount: existingCount,
      attemptedCount: incomingCount,
      tier: cap.tier,
      error: `Free plan supports up to ${limit} saved applications. Upgrade to Pro for unlimited application tracking.`
    };
  }
  return { ok: true, cap };
}

async function saveTrackerApplicationsAtomic(user, incomingApplications = []) {
  if (!user || !user.id) {
    return { ok: false, statusCode: 401, code: ERROR_CODES.AUTH_REQUIRED, error: "Authentication required" };
  }
  const cap = await getUserCapabilities(user.id, user);
  const limit = cap.limits.trackerMaxApplications;
  const res = await db.saveApplicationsAtomic({
    userId: user.id,
    applications: incomingApplications,
    maxLimit: limit
  });
  if (!res.ok) {
    return {
      ok: false,
      statusCode: 403,
      code: cap.status === "expired" ? ERROR_CODES.SUBSCRIPTION_EXPIRED : ERROR_CODES.TRACKER_CAPACITY_REACHED,
      upgradeRequired: true,
      limit: res.limit,
      currentCount: res.existingCount,
      attemptedCount: res.attemptedCount,
      tier: cap.tier,
      error: `Free plan supports up to ${res.limit} saved applications. Upgrade to Pro for unlimited application tracking.`
    };
  }
  return { ok: true, syncedCount: res.syncedCount, cap };
}

module.exports = {
  ERROR_CODES,
  getCurrentPeriodKey,
  getNextResetAtIso,
  getUserCapabilities,
  getUsageStatus,
  canAccessFeature,
  reserveUsage,
  finalizeUsage,
  releaseUsage,
  checkTrackerSaveAllowed,
  saveTrackerApplicationsAtomic
};
