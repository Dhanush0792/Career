# JobXApply Commercial Launch Runbook

## 1. Pre-Deployment Database Backup (Supabase / PostgreSQL)
```bash
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-privileges -f jobxapply_pre_monetization_$(date +%Y%m%d_%H%M%S).dump
```

## 2. Controlled Test-Mode Deployment & Migration Verification
1. Deploy backend to Render with `ENABLE_PUBLIC_CHECKOUT=false`, `RAZORPAY_KEY_ID=rzp_test_...`, `TEST_CHECKOUT_EMAILS=<verified_test_email>`.
2. Run migration verification SQL against PostgreSQL:
```sql
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'users','userdata','reports','telemetry','payment_orders','payments',
    'webhook_events','subscription_entitlements','refunds',
    'usage_counters','usage_operations','payment_receipts','admin_audit_logs','analytics_events'
  );

SELECT pg_get_constraintdef(oid) AS usage_counters_pk
FROM pg_constraint WHERE conrelid = 'usage_counters'::regclass AND contype = 'p';

SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee IN ('anon', 'authenticated')
  AND table_name IN ('payment_orders','payments','webhook_events','subscription_entitlements','refunds','usage_counters','usage_operations','payment_receipts','admin_audit_logs','analytics_events');
```
3. Run `TEST_DATABASE_URL="$DATABASE_URL" node backend/pg-integration-test.js` against an isolated test DB.

## 3. Controlled Live Checkout Gate (`LIVE_CHECKOUT_EMAILS`)
Before enabling `ENABLE_PUBLIC_CHECKOUT=true`:
1. Keep `ENABLE_PUBLIC_CHECKOUT=false`.
2. Switch Render payment keys to Live Mode (`RAZORPAY_KEY_ID=rzp_live_...`, `RAZORPAY_KEY_SECRET=...`, `RAZORPAY_WEBHOOK_SECRET=...`).
3. Set `LIVE_CHECKOUT_EMAILS=<verified_founder_email>` (completely separate from `TEST_CHECKOUT_EMAILS`).
4. Complete a single ₹199 founder Live Mode verification payment; verify `controlled_live_checkout_authorized` appears in `admin_audit_logs`, `payment_receipts` is persisted, and `/api/admin/payments` shows ₹199 under Live revenue.
5. Clear `LIVE_CHECKOUT_EMAILS` immediately after verification (or proceed to enable `ENABLE_PUBLIC_CHECKOUT=true` once approved).

## 4. Safe Rollback Procedure
- Revert Render/Netlify deployment to previous stable commit (`3e5c3f8`).
- **Do NOT drop or delete** `payments`, `payment_receipts`, `subscription_entitlements`, `refunds`, or `admin_audit_logs` during rollback.
