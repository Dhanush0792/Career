# JobXApply Database Migration & Rollback Plan

## Additive Tables (`backend/db.js` `initDb()`)
All schema additions use `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` so existing `users`, `userdata`, `reports`, `telemetry`, `payment_orders`, `payments`, `webhook_events`, `subscription_entitlements`, and `refunds` rows remain untouched:

1. `usage_counters` (`PRIMARY KEY (user_id, period_key, metric_key)`)
2. `usage_operations` (`operation_id PK`, index on `(user_id, period_key, status)`)
3. `payment_receipts` (`receipt_id PK`, `UNIQUE (environment, razorpay_payment_id)`, index on `(user_id, created_at DESC)`)
4. `admin_audit_logs` (`id PK`, index on `created_at DESC`)
5. `analytics_events` (`id PK`, index on `(event_name, created_at DESC)`)

RLS is enabled and `REVOKE ALL ... FROM anon, authenticated` is applied to all 10 payment/usage/admin/analytics tables.

## Rollback Procedure
- Because all 5 new tables are strictly additive and no existing columns or customer records are altered or deleted:
  1. Revert application deployment to previous commit (`4a97b74`) on Render and Netlify if needed.
  2. Existing `users`, `payment_orders`, `payments`, `subscription_entitlements`, and `refunds` continue functioning unchanged.
  3. Optional cleanup (only if permanently abandoning): `DROP TABLE IF EXISTS analytics_events, admin_audit_logs, payment_receipts, usage_operations, usage_counters;` (not required for safe code rollback).
