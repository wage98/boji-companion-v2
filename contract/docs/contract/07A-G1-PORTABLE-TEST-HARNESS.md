# 07A — G1 Portable Test Harness Qualification

Status: **FINAL_FROZEN — Contract v1.0.1**

This addendum is evidence-driven and MUST NOT change production behavior.

## Verified baseline

- Live V1 HEAD: `c0a8d55283765a0f7d7e4d773df0609ba1e4049d`
- Historical v1.2 anchor: `cbccea4c47995711d1ae0af2d7c76449febe2603`
- Qualified `app.js`, `sw.js`, and relevant `tools/` bytes are identical across those baseline points.
- Historical `251 PASS / 0 FAIL` is conditionally reproducible.
- PRE-LUNA failures are harness/fixture defects, not production defects.

**TST-001 MUST** add a repository-native Node dependency manifest and committed lockfile for the V2 test harness. Qualified baseline versions are `jsdom 28.1.0` and `qrcode 1.5.4`; other versions require equivalence evidence.

**TST-002 MUST** remove hardcoded WorkBuddy/local-machine `NODE_PATH` dependency and use standard project-local Node resolution.

**TST-003 MUST** make eval artifact generation deterministic in a clean clone. Generators MUST create required output directories idempotently. J15/K8 prerequisites MUST be generated explicitly or governed as explicit SKIPPED; a skipped prerequisite MUST NOT be counted as a full regression PASS.

**TST-004 MUST** remove the local-day-2 F1/F2 fixture bomb without changing production behavior. Prefer choosing the test target from an actually seeded check-in key or using one shared deterministic offset helper.

**TST-005 MUST** replace D1's fragile fixed-time assumption with deterministic polling/event-driven waiting where practical. If a timeout remains, it MUST have evidence-based headroom. Product timing MUST NOT be changed merely to satisfy the test.

**TST-006 MUST** demonstrate the repaired harness from a fresh disposable clone/workspace with no WorkBuddy-specific path. Acceptance requires dependency install from committed manifest/lockfile, syntax checks, deterministic prerequisite setup, full legacy regression, and repeated runs showing F1/F2/J15/K8/D1 no longer depend on date, prior artifacts, or timing luck.

## G1 pass rule

G1 MUST NOT pass while any of the following remains:
- machine-specific NODE_PATH required;
- F1/F2 depend on local calendar day;
- J15/K8 depend on undocumented pre-existing ignored artifacts;
- D1 remains a known nondeterministic flake;
- dependency versions are undeclared/unlocked.

These are harness repairs only. They MUST NOT alter production application behavior.
