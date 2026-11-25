const crypto = require("crypto");
const Razorpay = require("razorpay");
const db = require("./db");
const {
  getPlanConfig,
  normalizeTierName,
  getPaymentEnvironment
} = require("./plan-catalog");

const SUPPORTED_WEBHOOK_EVENTS = new Set([
  "payment.captured",
  "order.paid",
  "payment.failed",
  "refund.created",
  "refund.processed",
  "refund.failed"
]);

function makeHttpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function getDefaultRazorpayClient() {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) return null;
  return new Razorpay({ key_id, key_secret });
}

function constantTimeHexEquals(expectedHex, actualHex) {
  if (typeof expectedHex !== "string" || typeof actualHex !== "string") return false;
  if (!expectedHex || expectedHex.length !== actualHex.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expectedHex, "utf8"), Buffer.from(actualHex, "utf8"));
}

function resolvePaymentEnvironmentForGateway() {
  const env = getPaymentEnvironment(process.env.RAZORPAY_KEY_ID);
  if (env === "unconfigured" || env === "invalid") {
    throw makeHttpError(500, "Payment gateway is not properly configured.");
  }
  return env;
}

/**
 * Authoritative Server-Side Order Creation
 */
async function createOrderForUser({ user, planId = "pro", clientAmount, clientCurrency, receipt, rzpClient = null }) {
  if (!user || !user.id) {
    throw makeHttpError(401, "Authentication required");
  }

  if (process.env.NODE_ENV === "production" && process.env.ENABLE_PUBLIC_CHECKOUT !== "true") {
    throw makeHttpError(503, "Public paid checkout is disabled pending final verification.");
  }

  db.assertPaymentPersistenceAvailable();

  const plan = getPlanConfig(planId);
  if (!plan) {
    throw makeHttpError(400, "Invalid or unsupported subscription plan.");
  }

  // Reject inconsistent client-supplied pricing or currency
  if (clientAmount !== undefined && Number(clientAmount) !== plan.amount) {
    throw makeHttpError(400, "Client-supplied amount does not match authoritative plan price.");
  }
  if (clientCurrency !== undefined && String(clientCurrency).trim().toUpperCase() !== plan.currency) {
    throw makeHttpError(400, "Client-supplied currency does not match authoritative plan currency.");
  }

  const environment = resolvePaymentEnvironmentForGateway();
  const rzp = rzpClient || getDefaultRazorpayClient();
  if (!rzp) {
    throw makeHttpError(500, "Payment gateway credentials not configured.");
  }

  const now = Date.now();
  const internalOrderId = `ord_int_${crypto.randomBytes(8).toString("hex")}`;
  const cleanReceipt = (typeof receipt === "string" && receipt.trim())
    ? receipt.trim().slice(0, 40)
    : `rcpt_${String(user.id).slice(0, 10)}_${now}`;

  let rzpOrder;
  try {
    rzpOrder = await rzp.orders.create({
      amount: plan.amount,
      currency: plan.currency,
      receipt: cleanReceipt,
      payment_capture: 1,
      notes: {
        userId: String(user.id),
        internalOrderId,
        planId: plan.id,
        environment
      }
    });
  } catch (err) {
    const code = err && err.statusCode === 401 ? 401 : 502;
    const msg = (err && err.error && err.error.description) || err.message || "Failed to create Razorpay order.";
    throw makeHttpError(code, msg);
  }

  const orderRecord = {
    internalOrderId,
    userId: String(user.id),
    razorpayOrderId: rzpOrder.id,
    planId: plan.id,
    expectedAmount: plan.amount,
    currency: plan.currency,
    durationDays: plan.durationDays,
    environment,
    status: rzpOrder.status || "created",
    createdAt: now,
    updatedAt: now
  };

  await db.withPaymentTransaction(async (tx) => {
    await tx.insertOrder(orderRecord);
  });

  return {
    ok: true,
    order_id: rzpOrder.id,
    internal_order_id: internalOrderId,
    amount: plan.amount,
    currency: plan.currency,
    duration_days: plan.durationDays,
    plan_id: plan.id,
    environment,
    key_id: process.env.RAZORPAY_KEY_ID
  };
}

/**
 * Atomic, Idempotent Payment Fulfillment Core
 * Used by /api/verify-payment, /api/payment/webhook, and /api/payment/reconcile.
 */
async function fulfillCapturedPaymentTx(tx, { environment, order, rzpPayment, source = "checkout" }) {
  const now = Date.now();
  const rzpPaymentId = rzpPayment.id;

  // Idempotency lock: check if this payment has already been fulfilled
  const existingPayment = await tx.getPaymentByRazorpayIdForUpdate(environment, rzpPaymentId);
  if (existingPayment && existingPayment.entitlementStatus === "fulfilled") {
    const currentEnt = await tx.getEntitlementForUpdate(existingPayment.userId);
    const daysRemaining = currentEnt && currentEnt.expiresAt
      ? Math.max(0, Math.ceil((currentEnt.expiresAt - now) / 86400000))
      : 0;
    return {
      ok: true,
      alreadyProcessed: true,
      tier: currentEnt && currentEnt.status === "active" && (!currentEnt.expiresAt || currentEnt.expiresAt > now) ? "pro" : "free",
      subscription: currentEnt ? {
        tier: currentEnt.status === "active" ? "pro" : "free",
        planId: currentEnt.planId,
        status: currentEnt.status,
        startedAt: currentEnt.startedAt,
        expiresAt: currentEnt.expiresAt,
        daysRemaining,
        lastPaymentId: existingPayment.razorpayPaymentId
      } : null
    };
  }

  // Validate payment attributes against authoritative order
  if (rzpPayment.order_id !== order.razorpayOrderId) {
    throw makeHttpError(400, "Payment does not belong to the specified order.");
  }
  if (Number(rzpPayment.amount) !== Number(order.expectedAmount)) {
    throw makeHttpError(400, "Payment amount mismatch.");
  }
  if (String(rzpPayment.currency || "").toUpperCase() !== String(order.currency).toUpperCase()) {
    throw makeHttpError(400, "Payment currency mismatch.");
  }
  if (rzpPayment.status !== "captured") {
    if (rzpPayment.status === "authorized") {
      throw makeHttpError(402, "Payment is authorized but not yet captured. Entitlement cannot be granted.");
    }
    throw makeHttpError(400, `Payment is not captured (status: ${rzpPayment.status}).`);
  }

  // Record/update payment row as captured & fulfilled
  const paymentRecord = {
    internalPaymentId: existingPayment ? existingPayment.internalPaymentId : `pay_int_${crypto.randomBytes(8).toString("hex")}`,
    internalOrderId: order.internalOrderId,
    userId: order.userId,
    razorpayOrderId: order.razorpayOrderId,
    razorpayPaymentId: rzpPaymentId,
    amount: Number(rzpPayment.amount),
    currency: String(rzpPayment.currency).toUpperCase(),
    paymentStatus: rzpPayment.status,
    captureStatus: "captured",
    method: rzpPayment.method || null,
    environment,
    verifiedAt: now,
    entitlementStatus: "fulfilled",
    createdAt: existingPayment ? existingPayment.createdAt : now,
    updatedAt: now
  };
  await tx.upsertPayment(paymentRecord);
  await tx.updateOrderStatus(order.internalOrderId, "paid");

  // Grant or extend entitlement atomically
  const existingEnt = await tx.getEntitlementForUpdate(order.userId);
  const currentExpires = existingEnt && existingEnt.status === "active" && existingEnt.expiresAt ? Number(existingEnt.expiresAt) : 0;
  const durationMs = Number(order.durationDays || 30) * 86400000;
  const newExpiresAt = Math.max(now, currentExpires) + durationMs;
  const startedAt = (existingEnt && existingEnt.startedAt) ? Number(existingEnt.startedAt) : now;

  const newEntitlement = {
    userId: order.userId,
    planId: order.planId || "pro",
    status: "active",
    startedAt,
    expiresAt: newExpiresAt,
    sourcePaymentId: rzpPaymentId,
    environment,
    createdAt: existingEnt ? existingEnt.createdAt : now,
    updatedAt: now
  };
  await tx.upsertEntitlement(newEntitlement);
  await tx.updateUserTier(order.userId, "pro");

  return {
    ok: true,
    alreadyProcessed: false,
    source,
    tier: "pro",
    subscription: {
      tier: "pro",
      planId: newEntitlement.planId,
      status: "active",
      startedAt,
      expiresAt: newExpiresAt,
      daysRemaining: Math.max(1, Math.ceil((newExpiresAt - now) / 86400000)),
      lastPaymentId: rzpPaymentId
    }
  };
}

/**
 * Checkout Callback Verification (/api/verify-payment)
 */
async function verifyCheckoutAndFulfill({ user, razorpayOrderId, razorpayPaymentId, razorpaySignature, rzpClient = null }) {
  if (!user || !user.id) {
    throw makeHttpError(401, "Authentication required");
  }
  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature ||
      typeof razorpayOrderId !== "string" || typeof razorpayPaymentId !== "string" || typeof razorpaySignature !== "string") {
    throw makeHttpError(400, "Missing or invalid required fields: razorpay_order_id, razorpay_payment_id, razorpay_signature");
  }

  db.assertPaymentPersistenceAvailable();

  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) {
    throw makeHttpError(500, "Payment gateway secret not configured.");
  }

  const environment = resolvePaymentEnvironmentForGateway();

  // Look up expected order before signature verification so we use server-stored order ID
  const orderPrecheck = await db.withPaymentTransaction(async (tx) => {
    const o = await tx.getOrderByRazorpayIdForUpdate(environment, razorpayOrderId);
    return o;
  });

  if (!orderPrecheck) {
    throw makeHttpError(404, "Order not found for current payment environment.");
  }
  if (orderPrecheck.userId !== user.id) {
    throw makeHttpError(403, "Order does not belong to the authenticated user.");
  }

  // Constant-time HMAC-SHA256 verification using server-stored order ID
  const expectedSig = crypto
    .createHmac("sha256", keySecret)
    .update(`${orderPrecheck.razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");

  if (!constantTimeHexEquals(expectedSig, razorpaySignature)) {
    throw makeHttpError(400, "Invalid payment signature.");
  }

  // Fetch authoritative payment & order from Razorpay API
  const rzp = rzpClient || getDefaultRazorpayClient();
  if (!rzp) {
    throw makeHttpError(500, "Payment gateway client unavailable.");
  }

  let rzpPayment;
  let rzpOrder;
  try {
    rzpPayment = await rzp.payments.fetch(razorpayPaymentId);
    if (rzp.orders && typeof rzp.orders.fetch === "function") {
      rzpOrder = await rzp.orders.fetch(orderPrecheck.razorpayOrderId);
    }
  } catch (err) {
    throw makeHttpError(502, `Failed to verify payment with Razorpay: ${err.message || "Gateway error"}`);
  }

  if (!rzpPayment) {
    throw makeHttpError(400, "Payment could not be retrieved from Razorpay.");
  }
  if (rzpOrder && Number(rzpOrder.amount) !== orderPrecheck.expectedAmount) {
    throw makeHttpError(400, "Razorpay order amount does not match internal order.");
  }
  // Guard against test-mode payload activating live environment
  if (environment === "live" && rzpPayment.notes && rzpPayment.notes.environment === "test") {
    throw makeHttpError(400, "Test-mode payment cannot activate live entitlement.");
  }

  const result = await db.withPaymentTransaction(async (tx) => {
    const lockedOrder = await tx.getOrderByRazorpayIdForUpdate(environment, orderPrecheck.razorpayOrderId);
    if (!lockedOrder) throw makeHttpError(404, "Order disappeared during transaction.");
    return await fulfillCapturedPaymentTx(tx, {
      environment,
      order: lockedOrder,
      rzpPayment,
      source: "checkout_callback"
    });
  });

  return {
    ok: true,
    verified: true,
    alreadyProcessed: Boolean(result.alreadyProcessed),
    tier: result.tier,
    order_id: orderPrecheck.razorpayOrderId,
    payment_id: razorpayPaymentId,
    subscription: result.subscription,
    message: result.alreadyProcessed
      ? "Payment was already verified and Pro access is active."
      : "Payment verified and Pro tier activated."
  };
}

/**
 * Centralized Entitlement Resolver (Server-Authoritative UTC)
 */
async function getEffectiveEntitlement(userId, userRow = null) {
  const now = Date.now();
  const ent = await db.getEntitlement(userId);

  if (ent) {
    if (ent.status === "active" && ent.expiresAt && now > Number(ent.expiresAt)) {
      // Automatically enforce expiry downgrade
      try {
        await db.withPaymentTransaction(async (tx) => {
          const locked = await tx.getEntitlementForUpdate(userId);
          if (locked && locked.status === "active" && locked.expiresAt && now > Number(locked.expiresAt)) {
            await tx.upsertEntitlement({ ...locked, status: "expired", updatedAt: now });
            await tx.updateUserTier(userId, "free");
          }
        });
      } catch (e) {
        // Even if write fails in read path, still enforce free privileges in response
      }
      return {
        tier: "free",
        planId: "free",
        status: "expired",
        startedAt: ent.startedAt,
        expiresAt: ent.expiresAt,
        daysRemaining: 0,
        environment: ent.environment,
        lastPaymentId: ent.sourcePaymentId
      };
    }

    if (ent.status === "active") {
      const daysRemaining = ent.expiresAt
        ? Math.max(0, Math.ceil((Number(ent.expiresAt) - now) / 86400000))
        : 30;
      return {
        tier: "pro",
        planId: ent.planId || "pro",
        status: "active",
        startedAt: ent.startedAt,
        expiresAt: ent.expiresAt,
        daysRemaining,
        environment: ent.environment,
        lastPaymentId: ent.sourcePaymentId
      };
    }

    return {
      tier: "free",
      planId: "free",
      status: ent.status || "inactive",
      startedAt: ent.startedAt,
      expiresAt: ent.expiresAt,
      daysRemaining: 0,
      environment: ent.environment,
      lastPaymentId: ent.sourcePaymentId
    };
  }

  // Fallback for legacy/admin-elevated users without a subscription_entitlements row
  const normalized = normalizeTierName(userRow ? userRow.tier : "free");
  return {
    tier: normalized,
    planId: normalized,
    status: normalized === "pro" ? "active_legacy" : "inactive",
    startedAt: null,
    expiresAt: null,
    daysRemaining: normalized === "pro" ? 30 : 0,
    environment: getPaymentEnvironment(process.env.RAZORPAY_KEY_ID),
    lastPaymentId: null
  };
}

/**
 * Refund Processing (Idempotent, Full vs Partial Policy)
 */
async function processRefundEventTx(tx, { environment, refundEntity }) {
  const now = Date.now();
  const rzpRefundId = refundEntity.id;
  const rzpPaymentId = refundEntity.payment_id;
  const refundStatus = refundEntity.status || "created";
  const refundAmount = Number(refundEntity.amount || 0);
  const currency = String(refundEntity.currency || "INR").toUpperCase();

  const existingRefund = await tx.getRefundByRazorpayIdForUpdate(environment, rzpRefundId);
  const payment = await tx.getPaymentByRazorpayIdForUpdate(environment, rzpPaymentId);

  if (!payment) {
    // Refund arrived before payment record; cannot adjust unknown payment safely yet
    throw makeHttpError(404, `Payment ${rzpPaymentId} not found for refund ${rzpRefundId}`);
  }

  if (existingRefund && existingRefund.refundStatus === "processed" && refundStatus === "processed") {
    return { ok: true, duplicate: true, refundId: rzpRefundId };
  }

  await tx.upsertRefund({
    internalRefundId: existingRefund ? existingRefund.internalRefundId : `ref_int_${crypto.randomBytes(8).toString("hex")}`,
    razorpayRefundId: rzpRefundId,
    razorpayPaymentId: rzpPaymentId,
    userId: payment.userId,
    amount: refundAmount,
    currency,
    refundStatus,
    environment,
    processedAt: refundStatus === "processed" ? now : null,
    createdAt: existingRefund ? existingRefund.createdAt : now
  });

  // Only revoke entitlement on a processed full refund (partial refunds retain prepaid access)
  if (refundStatus === "processed") {
    const totalRefunded = await tx.getTotalRefundedForPayment(environment, rzpPaymentId);
    if (totalRefunded >= payment.amount && payment.entitlementStatus !== "refunded") {
      await tx.upsertPayment({
        ...payment,
        paymentStatus: "refunded",
        entitlementStatus: "refunded",
        updatedAt: now
      });

      // Check if user has other unrefunded fulfilled payments still active
      const allFulfilled = await tx.getActiveFulfilledPaymentsForUser(environment, payment.userId);
      const otherValid = allFulfilled.filter(p => p.razorpayPaymentId !== rzpPaymentId);

      const ent = await tx.getEntitlementForUpdate(payment.userId);
      if (otherValid.length === 0) {
        if (ent) {
          await tx.upsertEntitlement({
            ...ent,
            status: "refunded",
            expiresAt: now,
            updatedAt: now
          });
        }
        await tx.updateUserTier(payment.userId, "free");
      } else if (ent && ent.sourcePaymentId === rzpPaymentId) {
        // Re-anchor entitlement to the latest remaining valid purchase without wiping unrelated purchases
        const latestValid = otherValid[0];
        const remainingExpires = Math.max(now, Number(latestValid.verifiedAt || latestValid.createdAt) + 30 * 86400000);
        await tx.upsertEntitlement({
          ...ent,
          sourcePaymentId: latestValid.razorpayPaymentId,
          expiresAt: remainingExpires,
          status: remainingExpires > now ? "active" : "expired",
          updatedAt: now
        });
        await tx.updateUserTier(payment.userId, remainingExpires > now ? "pro" : "free");
      }
    }
  }

  return { ok: true, refundId: rzpRefundId, status: refundStatus };
}

/**
 * Razorpay Webhook Processor (Raw-Body Signature Verification & Deduplication)
 */
async function handleWebhook({ rawBodyBuffer, signatureHeader, eventIdHeader, rzpClient = null }) {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw makeHttpError(500, "RAZORPAY_WEBHOOK_SECRET is not configured.");
  }
  if (!signatureHeader || typeof signatureHeader !== "string") {
    throw makeHttpError(400, "Missing X-Razorpay-Signature header.");
  }
  if (!rawBodyBuffer || rawBodyBuffer.length === 0) {
    throw makeHttpError(400, "Empty webhook payload.");
  }

  db.assertPaymentPersistenceAvailable();

  const expectedSig = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBodyBuffer)
    .digest("hex");

  if (!constantTimeHexEquals(expectedSig, signatureHeader.trim())) {
    throw makeHttpError(400, "Invalid webhook signature.");
  }

  let payload;
  try {
    payload = JSON.parse(rawBodyBuffer.toString("utf8"));
  } catch (e) {
    throw makeHttpError(400, "Invalid JSON in webhook body.");
  }

  const eventType = payload.event || "";
  const environment = resolvePaymentEnvironmentForGateway();
  const eventId = (typeof eventIdHeader === "string" && eventIdHeader.trim())
    ? eventIdHeader.trim()
    : `${eventType}_${payload.created_at || Date.now()}_${crypto.createHash("sha256").update(rawBodyBuffer).digest("hex").slice(0, 12)}`;

  if (!SUPPORTED_WEBHOOK_EVENTS.has(eventType)) {
    await db.withPaymentTransaction(async (tx) => {
      const existing = await tx.getWebhookEventForUpdate(environment, eventId);
      if (!existing) {
        await tx.upsertWebhookEvent({
          id: `wh_${crypto.randomBytes(8).toString("hex")}`,
          eventId,
          eventType,
          environment,
          processingStatus: "ignored_unsupported",
          attempts: 1,
          receivedAt: Date.now(),
          processedAt: Date.now(),
          errorMessage: null
        });
      }
    });
    return { ok: true, ignored: true, eventType, eventId };
  }

  const outcome = await db.withPaymentTransaction(async (tx) => {
    const existingEvt = await tx.getWebhookEventForUpdate(environment, eventId);
    if (existingEvt && existingEvt.processingStatus === "processed") {
      return { ok: true, duplicate: true, eventId, eventType };
    }

    const now = Date.now();
    const webhookRow = {
      id: existingEvt ? existingEvt.id : `wh_${crypto.randomBytes(8).toString("hex")}`,
      eventId,
      eventType,
      environment,
      processingStatus: "processing",
      attempts: existingEvt ? existingEvt.attempts : 1,
      receivedAt: existingEvt ? existingEvt.receivedAt : now,
      processedAt: null,
      errorMessage: null
    };

    try {
      if (eventType === "payment.captured" || eventType === "order.paid") {
        const payEntity = payload.payload?.payment?.entity;
        const ordEntity = payload.payload?.order?.entity;
        const orderId = (payEntity && payEntity.order_id) || (ordEntity && ordEntity.id);
        if (!orderId || !payEntity) {
          throw makeHttpError(400, "Webhook payload missing payment or order entity.");
        }
        const order = await tx.getOrderByRazorpayIdForUpdate(environment, orderId);
        if (!order) {
          throw makeHttpError(404, `Order ${orderId} not found in environment ${environment}.`);
        }
        await fulfillCapturedPaymentTx(tx, {
          environment,
          order,
          rzpPayment: payEntity,
          source: `webhook:${eventType}`
        });
      } else if (eventType === "payment.failed") {
        const payEntity = payload.payload?.payment?.entity;
        if (payEntity && payEntity.order_id) {
          const order = await tx.getOrderByRazorpayIdForUpdate(environment, payEntity.order_id);
          if (order) {
            const existingPay = await tx.getPaymentByRazorpayIdForUpdate(environment, payEntity.id);
            if (!existingPay || existingPay.entitlementStatus !== "fulfilled") {
              await tx.upsertPayment({
                internalPaymentId: existingPay ? existingPay.internalPaymentId : `pay_int_${crypto.randomBytes(8).toString("hex")}`,
                internalOrderId: order.internalOrderId,
                userId: order.userId,
                razorpayOrderId: order.razorpayOrderId,
                razorpayPaymentId: payEntity.id,
                amount: Number(payEntity.amount || order.expectedAmount),
                currency: String(payEntity.currency || order.currency).toUpperCase(),
                paymentStatus: "failed",
                captureStatus: "failed",
                method: payEntity.method || null,
                environment,
                verifiedAt: null,
                entitlementStatus: "failed",
                createdAt: existingPay ? existingPay.createdAt : now,
                updatedAt: now
              });
              if (order.status !== "paid") {
                await tx.updateOrderStatus(order.internalOrderId, "failed");
              }
            }
          }
        }
      } else if (eventType === "refund.created" || eventType === "refund.processed" || eventType === "refund.failed") {
        const refundEntity = payload.payload?.refund?.entity;
        if (!refundEntity) {
          throw makeHttpError(400, "Webhook payload missing refund entity.");
        }
        await processRefundEventTx(tx, { environment, refundEntity });
      }

      await tx.upsertWebhookEvent({
        ...webhookRow,
        processingStatus: "processed",
        processedAt: Date.now(),
        errorMessage: null
      });

      return { ok: true, processed: true, eventId, eventType };
    } catch (err) {
      // Record failure state if it's a non-transient domain error, or propagate for retry
      throw err;
    }
  });

  return outcome;
}

/**
 * Authenticated Payment Recovery / Reconciliation
 */
async function reconcileUserOrders({ user, orderId = null, rzpClient = null }) {
  if (!user || !user.id) {
    throw makeHttpError(401, "Authentication required");
  }
  db.assertPaymentPersistenceAvailable();

  const environment = resolvePaymentEnvironmentForGateway();
  const rzp = rzpClient || getDefaultRazorpayClient();
  if (!rzp) {
    throw makeHttpError(500, "Payment gateway unavailable.");
  }

  let ordersToCheck = await db.getPendingOrdersByUser(user.id, environment);
  if (orderId) {
    ordersToCheck = ordersToCheck.filter(o => o.razorpayOrderId === orderId);
    if (ordersToCheck.length === 0) {
      // Check if order exists & is already paid
      const existingOrder = await db.withPaymentTransaction(async (tx) => tx.getOrderByRazorpayIdForUpdate(environment, orderId));
      if (!existingOrder || existingOrder.userId !== user.id) {
        throw makeHttpError(404, "Order not found for this account.");
      }
      if (existingOrder.status === "paid") {
        const ent = await getEffectiveEntitlement(user.id, user);
        return { ok: true, reconciled: false, alreadyPaid: true, subscription: ent };
      }
      ordersToCheck = [existingOrder];
    }
  }

  let reconciledCount = 0;
  for (const ord of ordersToCheck) {
    try {
      const paymentsResp = await rzp.orders.fetchPayments(ord.razorpayOrderId);
      const items = (paymentsResp && Array.isArray(paymentsResp.items)) ? paymentsResp.items : [];
      const captured = items.find(p => p.status === "captured");
      if (captured) {
        await db.withPaymentTransaction(async (tx) => {
          const lockedOrder = await tx.getOrderByRazorpayIdForUpdate(environment, ord.razorpayOrderId);
          if (lockedOrder && lockedOrder.userId === user.id) {
            await fulfillCapturedPaymentTx(tx, {
              environment,
              order: lockedOrder,
              rzpPayment: captured,
              source: "reconciliation"
            });
          }
        });
        reconciledCount++;
      }
    } catch (e) {
      // Continue checking other orders
    }
  }

  const ent = await getEffectiveEntitlement(user.id, user);
  return {
    ok: true,
    reconciled: reconciledCount > 0,
    reconciledCount,
    tier: ent.tier,
    subscription: ent
  };
}

module.exports = {
  SUPPORTED_WEBHOOK_EVENTS,
  createOrderForUser,
  verifyCheckoutAndFulfill,
  fulfillCapturedPaymentTx,
  getEffectiveEntitlement,
  processRefundEventTx,
  handleWebhook,
  reconcileUserOrders
};
