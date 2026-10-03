# 09 — Final Output Contract

The implementation agent must not provide marketing-style completion claims.

## HOLD output

When blocked:

- `FINAL_STATUS: HOLD`
- `LAST_COMPLETED_GATE`
- `BLOCKED_GATE`
- `REASON`
- `BRANCH`
- `HEAD`
- `WORKTREE_STATE`
- `VERIFIED_REQUIREMENTS`
- `UNKNOWN_REQUIREMENTS`
- `FAILED_REQUIREMENTS`
- `EVIDENCE_PATHS`
- `CHANGED_FILES`
- `SAFE_COMPLETED_WORK`
- `NEXT_SAFE_ACTION`
- `FORBIDDEN_NEXT_ACTIONS`

Do not claim later-gate work is approved.

## Successful automated output

Maximum successful result:

`FINAL_STATUS: RC_READY_FOR_REVIEW`

Include:
- last completed gate = G7;
- current branch/HEAD;
- clean/known worktree state;
- verified requirement IDs;
- UNKNOWN requirement IDs;
- known limitations;
- evidence bundle paths;
- RC deployment/QR facts if actually verified;
- explicit statement that Production approval remains pending independent review.

## Forbidden final output

Do not:
- assign an overall product score;
- output `PRODUCTION_APPROVED`;
- call an UNKNOWN physical-device check PASS;
- hide known limitations;
- claim live Git facts that were not actually observed.
