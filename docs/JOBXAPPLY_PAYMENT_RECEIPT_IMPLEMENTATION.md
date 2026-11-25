# JobXApply Animated Thermal Payment Receipt Implementation

## Files
- `frontend/payment-receipt.css`
- `frontend/payment-receipt.js`
- `backend/db.js` (`payment_receipts` table & `upsertPaymentReceipt` / `markReceiptAnimationSeen`)
- `backend/payment-service.js` (immutable receipt snapshot created inside `fulfillCapturedPaymentTx`)
- `backend/sync-server.js` (`POST /api/receipts/seen`, `GET /api/subscription` returning `receipts`)
- `frontend/shared-shell.js` (`JobXApplyCheckout` auto-opens receipt on verified checkout/recovery)
- `frontend/settings.html` (Payment History list with **View Receipt** button)

## Storyboard & Accessibility
1. Backdrop fade-in + printer slot glow
2. Thermal paper roll-out (`transform: translateY(-100%) -> 0`)
3. Staggered receipt line items (Plan, Billing model, Payment ID, Order ID, Account, Issued, Valid Until, Total Paid)
4. Perforated footer + `PAID & VERIFIED` stamp + `TEST MODE` diagonal watermark when `environment === "test"`
5. Action buttons (`Download / Print`, `Continue`) + immediate `Skip Animation` button
6. `prefers-reduced-motion: reduce` renders the completed receipt immediately without motion; `Escape` closes and restores focus.

## Account-Scoped Replay Prevention
- Stored locally under `jxa_receipt_seen_<userId>_<receiptId>` AND persisted server-side via `POST /api/receipts/seen` (`animation_seen_at`).
- Automatic post-checkout display plays once; re-opening from Settings (`View Receipt`) opens cleanly in instant static mode.
