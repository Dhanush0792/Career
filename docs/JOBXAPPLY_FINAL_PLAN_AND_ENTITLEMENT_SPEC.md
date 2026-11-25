# JobXApply Final Plan & Entitlement Specification

**Plan Version:** `2026-11-25` (`PLAN_VERSION = "2026-11-v1"` in `backend/plan-catalog.js`)  
**Public Endpoint:** `GET /api/plans`

| Attribute | Free | Pro |
|---|---|---|
| Price | ₹0 | ₹199 (19900 paise) |
| Currency | INR | INR |
| Billing Model | Forever free | One-time 30-day prepaid pass |
| Auto-Renewal | No (`autoRenew: false`) | No (`autoRenew: false`) |
| Smart Autofills | 10 / calendar month (UTC) | Unlimited |
| Application Tracker | Up to 20 saved jobs (view/edit/delete/export always allowed) | Unlimited |
| ATS Resume Checker | Basic score + summary + top 3 missing keywords | Full keyword & section breakdown |
| Resume Builder Exports | 2 / calendar month (UTC) | Unlimited |
| Cover Letter Templates | Standard template (`01`) | All 10 templates (`01`–`10`) |
| Cover Letter Exports | 2 / calendar month (UTC) | Unlimited |
| Cloud Profile Sync | Included | Included |

## Machine-Readable Error Codes (`backend/entitlement-service.js`)
- `AUTH_REQUIRED` (401)
- `FEATURE_REQUIRES_PRO` (403)
- `QUOTA_EXCEEDED` (403)
- `TRACKER_CAPACITY_REACHED` (403)
- `SUBSCRIPTION_EXPIRED` (403)
- `ENTITLEMENT_UNAVAILABLE` (503)
- `CHECKOUT_DISABLED` (503)
