# JobXApply Commercial Launch Runbook

## Pre-Launch Safety Checklist (Before Enabling Public Checkout)
1. **Verify PostgreSQL Migration**: Deploy backend in Test Mode with `DATABASE_URL` connected; confirm `initDb()` creates `usage_counters`, `usage_operations`, `payment_receipts`, `admin_audit_logs`, `analytics_events` cleanly.
2. **Verify Test-Mode E2E**:
   - Keep `ENABLE_PUBLIC_CHECKOUT=false` and `TEST_CHECKOUT_EMAILS=<allowlisted_verified_email>`.
   - Complete a simulated ₹199 Razorpay Test Mode payment.
   - Verify animated thermal receipt displays with `TEST MODE` watermark, refreshes cleanly without replaying animation, and appears in Settings -> Payment History.
   - Verify `/api/admin/payments` shows the payment under `test` volume only (`liveRevenuePaise = 0`).
3. **Verify Free Quotas & Extension Sync**:
   - Confirm Free account caps at 10 autofills/mo, 2 resume exports/mo, 2 cover letter exports/mo, template `01` only, 20 tracker apps, and basic ATS breakdown.
4. **Live Cutover (Only When Explicitly Authorized)**:
   - Set `RAZORPAY_KEY_ID=rzp_live_...`, `RAZORPAY_KEY_SECRET=...`, `RAZORPAY_WEBHOOK_SECRET=...` for Live Mode.
   - Confirm test entitlements remain isolated (`environment = 'test'`) and do not grant Live Pro access.
   - Set `ENABLE_PUBLIC_CHECKOUT=true` and monitor `/api/status`, `/api/admin/payments`, and webhook logs.
