# G6 local browser review

## Environment and route

- Channel: generated RC build at `http://localhost:4177/boji-companion-v2/rc/`.
- Deep route: `/training/today?gate=g6` loaded with assets resolved under the RC base path.
- Registered service worker scope: `http://localhost:4177/boji-companion-v2/rc/`.
- The browser reported persistent storage denied. The app remained usable and Data Health showed a local backup reminder.

## Observed flows

- Opened the manual food entry sheet and searched the local food list with a one-character query.
- Reloaded an active workout containing a synthetic 20 kg × 8 set and a persisted rest end timestamp; the session resumed.
- Opened a second tab at the same local origin. It rendered the active workout read-only and offered explicit takeover. After takeover, that tab could write and the former owner could not.
- The service worker used the RC scope and cache namespace. Offline navigation fallback and managed-cache cleanup are also covered by `tools/platform-check.js` with a worker/cache harness.

## Scope and retained test data

These are localhost browser observations with synthetic test data, not physical-device qualification. Browser tabs became unresponsive during cleanup, so the temporary preview servers were stopped but browser storage for localhost ports 4175–4177 may retain synthetic qualification records. No user or V1 records were used. The implementation has not been qualified for locked-screen GPS continuity, hardware safe areas, official INP, or background timer drift.

Performance measurements and their limits are recorded in `performance-fixtures.json`.
