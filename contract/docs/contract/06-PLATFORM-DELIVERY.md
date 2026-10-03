# 06 — Platform / Delivery Contract

## Deployment model

**PWA-001 MUST** use GitHub Pages as the primary V2 static PWA delivery path for this scope unless PRE-LUNA evidence requires a documented alternative.

Expected repository:
`wage98/boji-companion-v2`

V1 remains separate:
`wage98/boji-diary`

## Same-origin isolation

GitHub project Pages share the `https://wage98.github.io` origin.

**PWA-010 MUST** isolate V2 RC and V2 Production namespaces for:
- IndexedDB;
- localStorage/settings;
- Cache Storage;
- BroadcastChannel/locks;
- PWA manifest identity.

**PWA-011 MUST NOT** delete caches outside the app's managed namespace.

**PWA-012 MUST** keep V1 data namespaces read-only.

**PWA-013 MUST** define distinct PWA identity for RC and Production, including manifest `id`, `start_url`, `scope`, `name/short_name`, standalone display and required 192/512 icons.

**PWA-014 SHOULD** request persistent browser storage (`navigator.storage.persist()` or equivalent) when supported. Denial MUST NOT break the app; Data Health should make the storage/backup state understandable.

**PWA-015 MAY** use Screen Wake Lock during an active workout as a best-effort convenience. Wake Lock MUST NOT be a correctness dependency.

**PWA-016 MUST** coordinate multiple tabs/windows so only one owner can mutate the active workout. A second tab is read-only unless the user explicitly takes over ownership.

## RC vs Production

**REL-001 MUST** treat RC and Production as separate install identities/scopes.

**REL-002 MUST** allow automated execution to produce only RC artifacts.

**REL-003 MUST NOT** generate or claim final Production approval before independent qualification.

## Base path

**PWA-020 MUST** support project-page subpaths and verify:
- JS/CSS/assets;
- manifest;
- service worker scope;
- offline fallback;
- deep/open behavior.

Do not assume root `/`.

## Service Worker / updates

**PWA-030 MUST** bind background cache refresh to service-worker lifetime where needed.

**PWA-031 MUST** avoid forcing disruptive update/reload during active workout, migration, or critical commit.

**PWA-032 MUST** scope cache cleanup to managed prefixes and use service-worker lifetime control (`event.waitUntil` or equivalent) for background update work that must complete reliably.

**PWA-033 MUST** pause noncritical animation/polling when hidden and recompute wall-clock-derived state on resume rather than replaying missed timer ticks.

Show an update-ready state and allow safe adoption.

## Offline

**PWA-040 MUST** preserve core local functionality offline:
- training;
- text teaching;
- history/progress already local;
- manual/local food entry;
- core companion behavior;
- knowledge stored locally where designed.

Third-party online video and cloud AI are enhancements, not core truth dependencies.

## Running/mobile reality

**RUN-010 MUST** treat foreground GPS as the baseline claim.

**RUN-011 MUST NOT** claim reliable background/locked-screen GPS without physical-device evidence.

**RUN-012 MUST** preserve route first/last points during simplification.

**RUN-013 MUST** avoid full-page rerender on every running tick; update only live fields/path.

**RUN-014 MUST** show a gap/manual fallback when GPS continuity is unavailable; it MUST NOT invent/interpolate a route and present it as measured.


## Async / concurrency ownership

**PWA-050 MUST** give long-running async UI work explicit ownership and staleness control (cancellation and/or generation/request id). A response from an obsolete view/query MUST NOT overwrite newer state.

## Performance targets

Targets to measure, not self-certify:
- LCP ≤ 2.5s
- INP ≤ 200ms
- CLS ≤ 0.1
- complete-set UI acknowledgement target < 100ms after local commit
- teaching drawer local open target < 100ms
- timer logical drift ≤ 1s after background/return
- active-session resume target < 500ms
- local food search target < 100ms
- local page transition target < 150ms

## Security / cloud AI

**SEC-001 MUST NOT** expose provider API keys in the static frontend.

Cloud AI/TTS must use a server-side proxy/worker if used.

**SEC-002 MUST** scan source, build, backup, evidence bundle, and release artifact for secrets.

**SEC-003 SHOULD** harden proxy policy with:
- origin allowlist;
- server-side model whitelist;
- request size limits;
- timeout;
- rate limit;
- no-store;
- sanitized errors;
- no raw image-body logging.

## Asset governance

**SEC-010 MUST NOT** ship known third-party official character assets as the official Boji brand.

Known risky/superseded assets must be removed from V2 source/release, not merely unreferenced.

**SEC-011 MUST NOT** invent a code/content license. Code license, original character/assets, third-party video/data terms, and any redistribution restrictions must be documented separately according to the owner's actual choice.

## CI / release lineage

**REL-004 MUST** prevent failed required tests/gates from deploying an RC or Production artifact.

**REL-005 SHOULD** keep incomplete implementation work off the trusted release lineage/main branch; gate-qualified checkpoints may be committed, while HOLD work remains clearly unapproved.

**REL-006 MUST** reserve Production tags/releases for post-Luna independent qualification. Automated execution may create only RC-qualified lineage/tags when allowed by the repository workflow.

## QR

**REL-010 RC** QR may be generated for qualification.

**REL-011 Production** QR may be generated only after independent production qualification.

**REL-012 MUST** generate QR from the actual verified deployment URL rather than a separately hard-coded URL string.

QR qualification must verify:
- QR decodes;
- decoded URL equals intended deployment URL;
- URL responds;
- manifest reachable;
- SW registers;
- home-screen install/launch is tested at the required phase.
