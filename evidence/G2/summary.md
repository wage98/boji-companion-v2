# G2 — Data Foundation and Migration

**Status:** PASS  
**Tested implementation commit:** `c34978731c7ed3fe837a10e1ce080fd4b28ab4b3`  
**Tested tree:** `305a58a078d87f98f8f601923e677a62e21b24a5`  
**Next gate:** G3 — Training Truth

## Completed

- Added a dedicated RC IndexedDB namespace, explicit schema/product version dimensions, stable canonical store keys, and canonical local-date helpers.
- Kept V1 `boji_v7` read-only. V1 import occurs only after the user opens import, reviews a preflight summary, and confirms. The import archives the source, quarantines ambiguous mappings, writes transactionally, refuses to overwrite V2 user data, and is idempotent.
- Added itemized FoodDraft/MealRecord primitives with field-level provenance and explicit confirmation. These primitives are not yet wired into the personal-system UI; that integration is owned by G4.
- Added secret redaction/rejection, strict size/schema/version/type and relationship checks, media-reference validation, immutable pre-restore snapshots, explicit restore confirmation, and transactional rollback.
- Externalized durable inline image/video data from app state into MediaAsset records. Temporary local-video Object URLs are released on replacement, close, and pagehide.
- Added stable claim records for legacy assistant knowledge. Legacy `[A]/[B]/[C]` tags display as “来源待核”; no source was fabricated.
- Prevented default startup UI state from being written before a user action, preserving the V1 import path.

## Verification

- `pnpm run check:syntax` — PASS.
- `git diff --check` — PASS; Git emitted only configured LF-to-CRLF conversion notices.
- `node tools/selfcheck.js` — 56 functional PASS, 197 attack PASS, 28 data-layer PASS; 0 failures.
- The data-layer suite includes explicit user-import flow, read-only V1 byte checks, large and malformed migration fixtures, date collision quarantine, interrupted migration/restore rollback, backup secret/media checks, and unverified knowledge-label checks.

Detailed logs: `evidence/G2/logs/`.

## Scope boundaries

G2 qualifies the data foundation. Training UI integration and set/session behavior remain for G3. Nutrition/running and user-facing FoodDraft integration remain for G4. Physical-device behavior, final character approval, and independent release review remain pending at their contract gates.
