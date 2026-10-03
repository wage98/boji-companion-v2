# 00 — READ ME FIRST

## Mandatory execution rules

**RULE-001 — OBSERVE BEFORE MUTATE**  
Read live Git, this contract, manifests, and current project state before changing product files.

**RULE-002 — AUTHORITY MUST NOT BE GUESSED**  
Live Git/runtime evidence > frozen bytes/hashes > machine evidence > tests > docs > reports > comments > model inference.

**RULE-003 — REPORTED != VERIFIED**  
A historical report claim remains a report claim even when later evidence independently verifies some or all of its content. Use the current Evidence Ledger / baseline manifest for the latest authority state; never infer verification from the report alone.

**RULE-004 — UNKNOWN != PASS**  
If the expected check cannot be performed, record UNKNOWN or HOLD. Do not replace a missing physical/browser/Git check with a weaker simulation and call it PASS.

**RULE-005 — HOLD BLOCKS LATER GATES**  
A gate that is FAIL/HOLD, or depends on a required UNKNOWN, blocks all later gates.

**RULE-006 — PRESERVE VERIFIED CAPABILITIES**  
Do not silently delete V1 capabilities for simplicity, performance, architecture, or visual redesign.

**RULE-007 — FIX VERIFIED DEFECTS**  
Confirmed defects are not compatibility requirements. Do not preserve a known defect merely to keep a legacy test green.

**RULE-008 — PREDICTION IS NOT FACT**  
AI estimates, derived metrics, suggestions, and model confidence must not be stored or presented as user facts without the contract-required confirmation/provenance.

**RULE-009 — COMMIT BEFORE SUCCESS**  
For critical records, persistence transaction success must occur before UI success acknowledgement.

**RULE-010 — V1 DATA IS READ-ONLY**  
Legacy `boji_v7` is read-only for the entire V2 runtime. Do not write, delete, clear, or temporarily mutate it.

**RULE-011 — DO NOT REDESIGN FROZEN PRODUCT SCOPE**  
Implementation may optimize internals and polish UX, but must not reopen frozen product definition, IA, truth contracts, or feature-parity obligations.

**RULE-012 — IMPLEMENTATION CANNOT CERTIFY ITSELF**  
The strongest automated execution conclusion is `RC_READY_FOR_REVIEW`. Never output `PRODUCTION_APPROVED`.

## Required vocabularies

### Execution status
Use only:
- NOT_STARTED
- IN_PROGRESS
- PASS
- PARTIAL
- FAIL
- HOLD
- UNKNOWN
- RC_READY_FOR_REVIEW

### Evidence state
Use only:
- VERIFIED
- REPORTED
- PENDING
- SUPERSEDED

### Freeze class
Use only:
- EVIDENCE_FROZEN
- DECISION_FROZEN
- NONE

Do not combine these dimensions into improvised compound states.

## Required read order

1. `00-READ-ME-FIRST.md`
2. `01-AUTHORITY.md`
3. `../../contracts/FROZEN_EVIDENCE_LEDGER.json`
4. `02-PRODUCT-FROZEN-SPEC.md`
5. `03-FEATURE-PARITY.md`
6. `04-DATA-TRUTH.md`
7. `05-UX-UI-CONTRACT.md`
8. `05A-CHARACTER-CONTRACT.md`
9. `06-PLATFORM-DELIVERY.md`
10. `07-EXECUTION-GATES.md`
11. `07A-G1-PORTABLE-TEST-HARNESS.md`
12. `08-ATTACK-MATRIX.md`
13. `09-FINAL-OUTPUT.md`
14. `../../contracts/requirement-index.json`
15. remaining machine contracts under `../../contracts/`

Before mutation, verify all mandatory files can be read, all JSON files parse, requirement-index references resolve, and the recorded contract SHA256 manifest verifies.
