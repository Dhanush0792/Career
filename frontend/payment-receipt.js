/**
 * JobXApply Animated Thermal Payment Receipt Component
 * - Account-scoped replay prevention (localStorage + /api/receipts/seen)
 * - Prefers-reduced-motion & Skip support
 * - Print / Download HTML receipt support
 * - Test Mode watermark when environment === 'test'
 */
(function () {
  const SYNC_API = (typeof window !== "undefined" && window.JOBXAPPLY_API_BASE) ||
    ((typeof location !== "undefined" && location.hostname === "localhost")
      ? "http://localhost:8787/api"
      : "https://jobxapply-backend.onrender.com/api");

  function ensureStylesLoaded() {
    if (document.getElementById("jxa-receipt-css")) return;
    const link = document.createElement("link");
    link.id = "jxa-receipt-css";
    link.rel = "stylesheet";
    link.href = "payment-receipt.css";
    document.head.appendChild(link);
  }

  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fmtDate(ms) {
    if (!ms) return "—";
    try {
      return new Date(Number(ms)).toLocaleDateString("en-IN", {
        day: "2-digit", month: "short", year: "numeric"
      });
    } catch (e) {
      return "—";
    }
  }

  function fmtAmount(paise, currency) {
    const val = (Number(paise || 19900) / 100).toFixed(2);
    return `${currency === "INR" ? "₹" : (currency || "₹")}${val} ${currency || "INR"}`;
  }

  function seenKey(userId, receiptId) {
    return `jxa_receipt_seen_${userId || "anon"}_${receiptId || "default"}`;
  }

  function hasSeenAnimation(receipt) {
    if (!receipt || !receipt.receiptId) return false;
    if (receipt.animationSeenAt) return true;
    try {
      return localStorage.getItem(seenKey(receipt.userId, receipt.receiptId)) === "1";
    } catch (e) {
      return false;
    }
  }

  async function markSeen(receipt) {
    if (!receipt || !receipt.receiptId) return;
    try {
      localStorage.setItem(seenKey(receipt.userId, receipt.receiptId), "1");
    } catch (e) {}
    try {
      const token = localStorage.getItem("jxa_token") || localStorage.getItem("sb_access_token");
      if (token) {
        await fetch(`${SYNC_API}/receipts/seen`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({ receiptId: receipt.receiptId })
        });
      }
    } catch (e) {}
  }

  function printReceipt(receipt) {
    const isTest = receipt.environment === "test";
    const w = window.open("", "_blank", "width=480,height=680");
    if (!w) { window.print(); return; }
    w.document.write(`<!DOCTYPE html><html><head><title>JobXApply Receipt ${esc(receipt.receiptId)}</title>
      <style>
        body{font-family:ui-monospace,Menlo,monospace;padding:24px;color:#111;background:#fff}
        .box{max-width:380px;margin:0 auto;border:1px dashed #aaa;padding:20px;position:relative}
        h2{margin:0 0 4px;font-family:system-ui,sans-serif;text-align:center}
        .sub{text-align:center;font-size:12px;color:#555;margin-bottom:14px;padding-bottom:10px;border-bottom:1px dashed #ccc}
        .row{display:flex;justify-content:space-between;font-size:12px;margin:6px 0}
        .tot{border-top:1px dashed #ccc;margin-top:10px;padding-top:10px;font-weight:800;display:flex;justify-content:space-between}
        .badge{margin-top:14px;display:inline-block;border:2px solid #16a34a;color:#15803d;padding:4px 8px;font-size:11px;font-weight:700}
        .test{color:#b45309;font-weight:800;text-align:center;margin-bottom:8px;font-size:12px}
      </style></head><body><div class="box">
      ${isTest ? '<div class="test">[TEST MODE — NO REAL CHARGE]</div>' : ""}
      <h2>JOBXAPPLY</h2>
      <div class="sub">OFFICIAL PAYMENT RECEIPT</div>
      <div class="row"><span>Receipt ID</span><span>${esc(receipt.receiptId)}</span></div>
      <div class="row"><span>Plan</span><span>${esc(receipt.planName || "Pro (30 Days)")}</span></div>
      <div class="row"><span>Billing</span><span>One-time prepaid · No auto-renew</span></div>
      <div class="row"><span>Payment ID</span><span>${esc(receipt.razorpayPaymentId)}</span></div>
      <div class="row"><span>Order ID</span><span>${esc(receipt.razorpayOrderId)}</span></div>
      <div class="row"><span>Issued</span><span>${esc(fmtDate(receipt.createdAt))}</span></div>
      <div class="row"><span>Valid Through</span><span>${esc(fmtDate(receipt.validityEnd))}</span></div>
      <div class="tot"><span>TOTAL PAID</span><span>${esc(fmtAmount(receipt.amount, receipt.currency))}</span></div>
      <div class="badge">VERIFIED &amp; ACTIVATED</div>
      </div><script>window.onload=function(){window.print();}</script></body></html>`);
    w.document.close();
  }

  function show(receipt, options = {}) {
    if (!receipt) return;
    ensureStylesLoaded();

    const reducedMotion = typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const forceStatic = options.instant === true || reducedMotion ||
      (!options.replay && hasSeenAnimation(receipt));

    const prevFocus = document.activeElement;
    const backdrop = document.createElement("div");
    backdrop.className = "jxa-rcpt-backdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-labelledby", "jxa-rcpt-title");

    const isTest = receipt.environment === "test";
    backdrop.innerHTML = `
      <div class="jxa-rcpt-stage">
        <div class="jxa-rcpt-slot" aria-hidden="true"></div>
        <div class="jxa-rcpt-paper-wrap">
          <div class="jxa-rcpt-paper" id="jxa-rcpt-paper">
            ${isTest ? '<div class="jxa-rcpt-watermark">TEST MODE</div>' : ""}
            <div class="jxa-rcpt-head">
              <div class="jxa-rcpt-brand" id="jxa-rcpt-title">JOBXAPPLY</div>
              <div class="jxa-rcpt-sub">PAYMENT RECEIPT &bull; ${esc(receipt.receiptId || "PRO-PASS")}</div>
            </div>
            <div class="jxa-rcpt-rows">
              <div class="jxa-rcpt-row"><span class="jxa-rcpt-k">Plan</span><span class="jxa-rcpt-v">${esc(receipt.planName || "Pro (30-Day Pass)")}</span></div>
              <div class="jxa-rcpt-row"><span class="jxa-rcpt-k">Billing</span><span class="jxa-rcpt-v">Prepaid &bull; No Auto-Renew</span></div>
              <div class="jxa-rcpt-row"><span class="jxa-rcpt-k">Payment ID</span><span class="jxa-rcpt-v">${esc(receipt.razorpayPaymentId || "—")}</span></div>
              <div class="jxa-rcpt-row"><span class="jxa-rcpt-k">Order ID</span><span class="jxa-rcpt-v">${esc(receipt.razorpayOrderId || "—")}</span></div>
              <div class="jxa-rcpt-row"><span class="jxa-rcpt-k">Account</span><span class="jxa-rcpt-v">${esc(receipt.customerEmail || "Verified Member")}</span></div>
              <div class="jxa-rcpt-row"><span class="jxa-rcpt-k">Issued</span><span class="jxa-rcpt-v">${esc(fmtDate(receipt.createdAt))}</span></div>
              <div class="jxa-rcpt-row"><span class="jxa-rcpt-k">Valid Until</span><span class="jxa-rcpt-v">${receipt.validityEnd ? esc(fmtDate(receipt.validityEnd)) : (receipt.isHistoricalFallback ? "See Plan Status" : "—")}</span></div>
            </div>
            <div class="jxa-rcpt-total">
              <span>TOTAL PAID</span>
              <span>${esc(fmtAmount(receipt.amount, receipt.currency))}</span>
            </div>
            <div class="jxa-rcpt-stamp-row">
              <div class="jxa-rcpt-stamp">&#10003; PAID &amp; VERIFIED</div>
              <div class="jxa-rcpt-note">${receipt.isHistoricalFallback ? "Historical payment record" : "Non-recurring 30-day pass"}</div>
            </div>
          </div>
        </div>
        <button type="button" class="jxa-rcpt-btn jxa-rcpt-btn--skip" id="jxa-rcpt-skip">Skip Animation</button>
        <div class="jxa-rcpt-actions" id="jxa-rcpt-actions">
          <button type="button" class="jxa-rcpt-btn" id="jxa-rcpt-download">Download / Print</button>
          <button type="button" class="jxa-rcpt-btn jxa-rcpt-btn--primary" id="jxa-rcpt-close">Continue</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    const paper = backdrop.querySelector("#jxa-rcpt-paper");
    const actions = backdrop.querySelector("#jxa-rcpt-actions");
    const skipBtn = backdrop.querySelector("#jxa-rcpt-skip");
    const closeBtn = backdrop.querySelector("#jxa-rcpt-close");
    const dlBtn = backdrop.querySelector("#jxa-rcpt-download");

    const timers = [];
    function revealFinal() {
      timers.forEach(clearTimeout);
      paper.classList.add("is-printed", "is-rows-visible", "is-stamped");
      actions.classList.add("is-visible");
      if (skipBtn) skipBtn.style.display = "none";
      markSeen(receipt);
    }

    function close() {
      timers.forEach(clearTimeout);
      document.removeEventListener("keydown", onKey);
      backdrop.remove();
      if (prevFocus && typeof prevFocus.focus === "function") prevFocus.focus();
      if (typeof options.onClose === "function") options.onClose();
    }

    function onKey(e) {
      if (e.key === "Escape") {
        close();
        return;
      }
      if (e.key === "Tab") {
        const focusables = Array.from(backdrop.querySelectorAll("button")).filter(b => b.offsetParent !== null && !b.disabled);
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);

    skipBtn.addEventListener("click", revealFinal);
    closeBtn.addEventListener("click", close);
    dlBtn.addEventListener("click", () => {
      printReceipt(receipt);
      if (typeof window.JobXApplyTrackFunnel === "function") {
        window.JobXApplyTrackFunnel("receipt_downloaded", { receiptId: receipt.receiptId });
      }
    });

    requestAnimationFrame(() => {
      backdrop.classList.add("is-open");
      if (forceStatic) {
        revealFinal();
        if (closeBtn) closeBtn.focus();
      } else {
        if (skipBtn) skipBtn.focus();
        timers.push(setTimeout(() => paper.classList.add("is-printed"), 350));
        timers.push(setTimeout(() => paper.classList.add("is-rows-visible"), 1150));
        timers.push(setTimeout(() => paper.classList.add("is-stamped"), 1950));
        timers.push(setTimeout(() => {
          actions.classList.add("is-visible");
          if (skipBtn) skipBtn.style.display = "none";
          markSeen(receipt);
        }, 2550));
      }
    });

    if (typeof window.JobXApplyTrackFunnel === "function") {
      window.JobXApplyTrackFunnel("receipt_viewed", { receiptId: receipt.receiptId });
    }
  }

  window.JobXApplyReceipt = { show, printReceipt, hasSeenAnimation };
})();
