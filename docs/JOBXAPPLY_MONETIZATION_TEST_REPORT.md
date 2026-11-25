# JobXApply Monetization Automated Test Report

**Execution Date:** 2026-11-25  
**Environment:** Windows, Node.js v22.20.0, in-memory transactional store (`DATABASE_URL=""` for suites).

| Test Suite | Total | Passed | Failed | Scope & Notes |
|---|---:|---:|---:|---|
| `node backend/monetization-test-suite.js` | 28 | 28 | 0 | Plan catalog, 10/mo autofill reserve/complete/release/idempotency, 2/mo resume & cover letter exports, template `01` gate, 20-entry tracker cap + downgrade preservation, ATS basic filtering, funnel events, admin RBAC & audited grants |
| `node backend/payment-test-suite.js` | 39 | 39 | 0 | Order pricing, HMAC verification, mocked Razorpay capture checks, test/live isolation, `TEST_CHECKOUT_EMAILS` + strict `emailVerified === true`, concurrency, rollback, webhooks, refunds |
| `node backend/test-suite.js` | 49 | 49 | 0 | Health, auth, profile, tracker, ATS, resume/cover-letter, admin RBAC, payment security |
| `node extension/test-verifier.js` | 97 | 97 | 0 | JD extraction, ATS scoring, PDF generation, 10 cover letter templates, DataTransfer file injection, portal collision barriers |
| **Combined Total** | **213** | **213** | **0** | All 4 suites exited with code `0` |

## Syntax Verification
- `node --check` passed on `frontend/shared-shell.js`, `frontend/payment-receipt.js`, `frontend/admin/admin-shell.js`, `extension/background.js`, `extension/popup.js`, `extension/sidepanel.js`, `extension/content.js`.

## Explicitly Unverified / Blocked Checks
- **Real PostgreSQL Execution:** Local PostgreSQL 16 service requires a local `postgres` password not stored in `.env`; PG schema creation & `FOR UPDATE` locking on live PG were not executed in this session.
- **Browser Visual E2E & Live Razorpay Checkout:** Not executed against live Render/Netlify or live Razorpay UI.
