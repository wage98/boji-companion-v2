# 04 — Data and Truth Contract

## Canonical domain identities

**DAT-001 MUST** use stable semantic IDs. Legacy array index is migration input only.

Required identities:
- `exerciseId`
- `programId`
- `templateId`
- `sessionId`
- `exerciseSessionId`
- `setId`

## Training truth

**TRN-001 MUST** separate:
- Program
- WorkoutTemplate
- WorkoutSession
- ExerciseSession
- SetRecord

**TRN-002 MUST NOT** represent “complete this set” as only an exercise-level boolean.

**TRN-003 MUST** store real set-level values sufficient for progression, including where relevant:
- weightKg
- reps
- nullable RIR
- set type
- completed/completedAt

**TRN-004 MUST** prevent custom-exercise completion from satisfying planned-exercise completion.

**TRN-005 MUST** make critical set/workout persistence commit before success acknowledgement.

## Progression

**PRG-001 MUST NOT** invent a recovery score from unavailable signals.

**PRG-002 MUST** keep progression suggestions explainable and user-confirmed.

**PRG-003 MUST** support progressive expertise:
- novice-facing plain-language controls;
- advanced detail such as RIR/RPE/e1RM/volume behind explicit expert surfaces.

**PRG-004 MUST** use a conservative double-progression style as the default progression suggestion:
- derive from committed SetRecords and optional RIR/performance evidence;
- respect available equipment increments;
- remain a suggestion;
- require user confirmation;
- expose the reason/evidence.

**TRN-006 MUST** implement Equipment Profiles while preserving A/B/C as built-in presets.

**TRN-007 MUST** implement `调整今天` with deterministic substitution constraints based on movement pattern, muscles, equipment and goal. An LLM MUST NOT decide exercise equivalence.

**TRN-008 MUST** persist enough active-session recovery state to offer recovery after reload/process interruption, including at minimum session identity/status, current exercise/set, timestamps, last committed state and active rest end time.

## Food truth

**FOOD-001 MUST** use field provenance:
- MEASURED
- USER_PROVIDED
- DATABASE
- AI_ESTIMATED
- DERIVED

**FOOD-002 MUST** route AI/photo output into `FoodDraft` before any committed `MealRecord`.

**FOOD-003 MUST** require explicit user confirmation before AI-derived food identity/portion/nutrition becomes a committed meal fact.

**FOOD-004 MUST NOT** fabricate macronutrients from calories or rescale macros merely to force calorie consistency.

**FOOD-005 MUST** itemize mixed meals when multiple components are detected/entered.

**FOOD-006 MUST** distinguish identity confidence, portion estimate, and nutrition source; one model confidence value must not masquerade as calibrated probability.

**FOOD-007 MUST** use this logical photo pipeline:
image/input quality → food candidates/items → user identity confirmation → portion evidence/estimate → database/source match → nutrition computation → user confirmation → persist MealRecord.

**FOOD-008 MUST** preserve explicit user measurements (for example “chicken 150g”) as `USER_PROVIDED`; AI MUST NOT silently re-guess them.

**FOOD-009 MUST** make asynchronous food/search/AI operations latest-result-wins using cancellation and request ownership (for example AbortController + generation/request id + owner view). Stale results MUST be discarded.

**FOOD-010 SHOULD** debounce remote food search in the ~300–400ms range, cancel superseded requests, and keep local search responsive.

**FOOD-011 MUST** avoid using full image base64 as an unbounded cache key/store. If AI result caching is used, use a fingerprint/hash with an explicit LRU/byte budget.


## Knowledge / evidence truth

**KNW-001 MUST** maintain a claim/source registry for evidence-bearing knowledge content. A claim record SHOULD identify claimId, text/scope, sourceIds, evidence/confidence type, review date and safety class where applicable.

**KNW-002 MUST NOT** present legacy `[A]/[B]` style labels as formal evidence grades unless a real source registry supports those grades. Unverifiable claims must be downgraded or clearly marked, not backfilled with invented citations.

**KNW-003 MUST** label nutrition defaults/targets as estimates rather than precise prescriptions. Any inherited heuristics such as kcal/kg, protein/kg or ml/kg MUST show their assumption status and remain user-adjustable.

**KNW-004 MUST** support an onboarding nutrition intent that can be at least: log-only, maintain, gain, lose, or custom. The system target is an initial estimate, not a medical or immutable prescription.

## Time / units

**DAT-010 MUST** store absolute timestamps using epoch/UTC representation.

**DAT-011 MUST** use a unified `localDateKey()` for user calendar grouping.

**DAT-012 SHOULD** preserve timezone offset/context at event time when needed to prevent travel reinterpretation.

Canonical units:
- `weightKg`
- `distanceMeters`
- `durationSeconds`
- `energyKcal`

Display conversion belongs in UI, not persistent identity.

## Timer truth

**DAT-020 MUST** derive rest/timers from wall-clock timestamps (`startedAt`, `endsAt`), not decrementing counters.

## Migration

**DAT-030 MUST** treat legacy `boji_v7` as read-only for the entire V2 runtime.

**DAT-031 MUST** make V1→V2 import user-initiated after a preflight summary.

**DAT-032 MUST** use:
read-only legacy snapshot → validate → migrate transactionally → verify → commit.

**DAT-033 MUST** quarantine ambiguous mappings; never guess.

**DAT-034 MUST** make migration idempotent and test fixtures for:
- clean legacy data;
- missing optional fields;
- custom exercises;
- large history;
- corrupted field;
- duplicate import;
- already migrated;
- interrupted migration.

No long-term dual-write.

## Backup / restore

**DAT-040 MUST NOT** include credentials/secrets in ordinary backup/export.

**DAT-041 MUST** perform strict restore preflight:
parse → schema/type/size checks → preview counts/conflicts → immutable pre-restore snapshot → transactional restore → invariant check → commit.

Failure must leave the original dataset intact.

**DAT-042 MUST** protect CSV/spreadsheet exports from formula injection where applicable.

## Media

**DAT-050 MUST** keep media blobs separate from high-frequency structured state.

**DAT-051 MUST** revoke temporary Object URLs on close/replace/destroy.

**DAT-052 SHOULD** avoid retaining unlimited original food photos; retain only what the product explicitly needs.

**DAT-053 MUST** store durable user media as separate MediaAsset/blob records referenced by structured domain records rather than duplicating base64 through the entire app state.

## Version truth

**DAT-060 MUST** maintain explicit product/data version truth at least for:
- PRODUCT_VERSION
- SCHEMA_VERSION
- APP_CACHE_VERSION
- FEATURE_MANIFEST_VERSION
- EXERCISE_DATA_VERSION
- KNOWLEDGE_VERSION

**DAT-061 MUST** detect and safely block/handle invalid version combinations instead of silently running incompatible schema/cache/content mixes.
