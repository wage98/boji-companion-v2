# 07 — Execution Gates

The execution model is a state machine, not a todo list.

Any required FAIL/HOLD blocks later gates.

## Gate template

Each gate records:
- Objective
- Authorized Changes
- Forbidden Changes
- Invariants
- Attack Cases
- Pass Criteria
- Evidence
- STOP Conditions

Cross-cutting change is allowed only when:
1. required for current gate correctness;
2. no smaller local alternative exists;
3. it does not change an unauthorized product domain;
4. the reason is recorded in gate evidence.

---

## G0 — PRESTATE & AUTHORITY

Objective: prove the correct repositories, branches, baseline artifacts, and contract bytes are being used.

Read-only.

Must verify:
- V1 repo identity;
- V1 live branch/HEAD/tree;
- relation to reported `cbccea4`;
- V2 repo identity/state;
- contract file completeness;
- contract hashes;
- clean/expected worktree state.

Mismatch → HOLD. Never reset reality merely to match a report.

---

## G1 — BOOTSTRAP & TEST FOUNDATION

Objective: create a reproducible V2 bootstrap and clean test environment before high-risk product changes.

Authorized:
- V2 bootstrap from verified V1 allowed files;
- tooling/package/lockfile/test harness;
- baseline/feature manifests;
- exclusion manifest.

Must capture legacy tests before modifying business behavior.

G1 MUST also satisfy `07A-G1-PORTABLE-TEST-HARNESS.md`.

Legacy test classification:
- VALID_REQUIREMENT
- LEGACY_BUG_EXPECTATION
- OBSOLETE_WITH_REASON

Do not change product behavior merely to force old tests green.

---

## G2 — DATA FOUNDATION & MIGRATION

Objective: establish stable IDs, schema, migration, backup/restore, truth/provenance, units/time.

Must satisfy `04-DATA-TRUTH.md`.

V1 namespace remains read-only through the entire runtime and test run.

Ambiguity → quarantine/report, never guess.

---

## G3 — TRAINING TRUTH

Objective: rebuild training around real sessions/sets while preserving verified capabilities.

Must implement:
- Program / Template / Session / ExerciseSession / SetRecord separation;
- Equipment Profiles and deterministic `调整今天`;
- set-level completion;
- commit acknowledgement;
- wall-clock rest timing;
- crash/reload active-session recovery;
- progression foundation including explainable double progression;
- teaching linkage;
- idempotent double-click/duplicate protection.

Failure here blocks all later product gates.

---

## G4 — PERSONAL SYSTEM

Objective: integrate nutrition, running, weight, knowledge data, and event emission under truthful provenance.

Must enforce:
- FoodDraft/MealRecord separation;
- async ownership/cancellation for food/search/AI;
- AI confirmation;
- running estimates vs measurements;
- running route correctness;
- knowledge/source truth registry and no fabricated evidence labels;
- user facts vs derived events.

---

## G5 — UX & COMPANION

Objective: implement frozen IA/visual system and companion experience without altering lower-layer truth.

Includes:
- Today;
- Training;
- Boji;
- Progress;
- My;
- Learning/Performance modes;
- exercise teaching;
- voice;
- companion motion;
- Photo Pet;
- accessibility;
- official character candidate integration.

Must not redesign frozen product scope.

---

## G6 — PLATFORM RELIABILITY

Objective: qualify browser/PWA/storage/concurrency/performance behavior.

Includes:
- Service Worker;
- offline;
- updates;
- base path;
- async cancellation/generation ownership;
- media lifecycle;
- multi-tab active-session ownership/takeover;
- background/foreground recovery;
- RC/Prod namespace isolation;
- performance fixtures.

Physical-device-only claims remain UNKNOWN until post-Luna qualification.

---

## G7 — RELEASE QUALIFICATION

Objective: produce a reviewable RC, not Production.

Must:
- run full regression/attack suite;
- secret scan;
- forbidden asset scan;
- build RC;
- produce evidence bundle;
- deploy/prepare RC if permitted;
- produce RC QR if applicable;
- list verified/unknown/failed requirements.

Maximum successful automated conclusion:
`RC_READY_FOR_REVIEW`

Never:
`PRODUCTION_APPROVED`
