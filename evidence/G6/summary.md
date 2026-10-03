# G6 Platform Reliability

**Status:** PASS
**Qualified implementation commit:** `2268602f82e6482e6ee896428174c81acc74d2c5`
**Qualified tree:** `8d21b0114da4c1a6a3dd0ec1487be7726bbe075a`
**Next gate:** G7 Release Qualification

## Completed

- Added separate RC and Production install identities, IndexedDB names, Cache Storage prefixes, and PWA scopes. Automated builds emit only `dist/rc`.
- Bound service-worker registration, requests, navigation fallback, and assets to the generated RC project subpath. Worker updates wait for explicit adoption; cache cleanup is limited to the active channel's namespace.
- Added persistent-storage best-effort handling, a visible backup reminder on denial, and optional Wake Lock handling that does not affect workout correctness.
- Added transactional workout ownership, read-only behavior in other tabs, explicit takeover, and write guards after ownership changes.
- Paused noncritical loops while hidden, retained rest end timestamps, closed foreground GPS on backgrounding, and exposed a route gap instead of connecting across the interruption.
- Added async request ownership/cancellation and local-only performance diagnostics.
- Fixed the first-use manual food sheet initialization found during browser qualification.

## Verification

- `pnpm test`: 65 functional PASS, 208 attack PASS, 35 data-layer PASS, and platform checks PASS.
- `pnpm test:platform`: PASS for RC/Production identity separation, two-tab ownership, RC base path, worker update lifecycle, cache ownership, and offline navigation fallback.
- `pnpm run check:syntax`: PASS.
- `git diff --check`, staged diff check, and `git show --check 2268602`: PASS.
- Local browser review covered RC deep-path asset resolution, service-worker scope, storage denial fallback, manual local food search, and active-session reload/read-only/takeover. See `browser-review.md`.
- Single-session performance observations are in `performance-fixtures.json`. Official INP and background timer drift were not measured.

## Limits

Physical mobile/PWA behavior, hardware safe-area behavior, locked-screen/background GPS, official INP, and background timer drift remain UNKNOWN pending the required later qualification. Final character/asset-owner approval and full generation/license provenance remain pending under AUTH-004. The localhost browser qualification used synthetic data; temporary servers were stopped, but their local browser storage may retain synthetic records.
