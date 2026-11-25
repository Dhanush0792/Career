# JobXApply Usage & Quota Architecture

## Monthly UTC Calendar Reset
- Period key format: `YYYY-MM` in UTC (`getCurrentPeriodKey()`).
- Reset timestamp: `YYYY-(MM+1)-01T00:00:00.000Z` (`getNextResetAtIso()`).

## Atomic Reservation / Finalization / Release
To ensure failed operations never consume customer quota and concurrent requests cannot bypass limits:
1. **Reserve** (`reserveUsageOperation` in `backend/db.js`):
   - Expires stale `reserved` operations older than `ttlMs` (default 120s) and decrements `reserved_count`.
   - Checks `operationId` idempotency.
   - Locks `usage_counters` row (`FOR UPDATE` in PG; serialized queue in memory) and verifies `(used_count + reserved_count) < limit`.
   - Inserts `usage_operations` row with status `reserved` and increments `reserved_count`.
2. **Finalize** (`finalizeUsageOperation`):
   - Atomically moves `reserved` -> `finalized`, increments `used_count`, and decrements `reserved_count`.
3. **Release** (`releaseUsageOperation`):
   - Atomically moves `reserved` -> `released` and decrements `reserved_count` without incrementing `used_count`.

## Enforced Surfaces
- **Smart Autofill** (`POST /api/usage/autofill/authorize`, `/complete`, `/release`) — called by extension `background.js` before/after `popup.js`, `sidepanel.js`, and `content.js` floating pill.
- **Resume Export** (`POST /api/resume/generate`) — reserves before LaTeX compilation, finalizes on 200, releases on error.
- **Cover Letter Export** (`POST /api/cover-letter/generate`) — enforces template `01` on Free, then reserves/finalizes/releases `cover_letter_export`.
- **Application Tracker** (`POST /api/tracker`) — `checkTrackerSaveAllowed` blocks increasing count above 20 on Free while allowing edits/deletions of existing entries (including >=20 after Pro expiry).
