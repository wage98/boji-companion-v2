# Final Written-Contract Red-Team Report — Candidate v2

## Scope

Audit target: the actual canonical contract files, not prior chat descriptions.

## Defects found and repaired

### RT-001 — Mandatory read-order omission — FIXED
`05A-CHARACTER-CONTRACT.md` existed but was not present in the mandatory read order.

### RT-002 — Status-vocabulary collision — FIXED
Execution state, evidence state and freeze class were mixed. They are now separate dimensions.

### RT-003 — Frozen-detail under-specification — FIXED
The first candidate summarized several previously frozen requirements too aggressively. Candidate v2 explicitly restores:
- Equipment Profiles;
- deterministic `调整今天` substitution and no LLM exercise-equivalence authority;
- explainable double progression;
- active-session recovery state;
- Food photo pipeline, user-measured-portion priority, cancellation/generation ownership, bounded caching;
- Knowledge claim/source registry and no fabricated evidence grades;
- version truth dimensions;
- RC/Production manifest identity;
- multi-tab active-workout ownership;
- optional persistent storage and Wake Lock;
- GPS gap/no-route-fabrication rule;
- license non-invention;
- CI/release-lineage and deployment-derived QR.

### RT-004 — Requirement discoverability — FIXED
Added `contracts/requirement-index.json` generated from normative definitions.

### RT-005 — Gate evidence shape — FIXED
Added `contracts/gate-evidence.schema.json`.

## Remaining non-contract blockers

These are intentionally not “fixed” by wording:
- live V1 Git HEAD/tree: UNVERIFIED;
- relation of live V1 to reported `cbccea4`: UNVERIFIED;
- reported 251 tests in clean environment: NOT_REPRODUCED;
- V2 live repository state: UNVERIFIED;
- final production Boji character asset: PENDING;
- physical mobile qualification: PENDING.

## Result

Candidate v2 is eligible for a final mechanical consistency audit.

Do not call it FINAL_FROZEN until:
1. SHA256 manifest verifies;
2. all JSON parses;
3. all mandatory read-order paths resolve;
4. requirement definitions are unique;
5. feature-manifest IDs resolve to normative requirements;
6. no improvised authority-state values remain;
7. no known P0/P1 contract loophole remains from this red-team.

## Final v1.0.0 decision

After repair, the final mechanical consistency audit reported zero issues.
No remaining known P0/P1 contract loophole was identified in this red-team pass.

`FINAL_WRITTEN_CONTRACT_RED_TEAM = PASS`

This verdict is limited to the contract itself and does not certify implementation or pending external evidence.
