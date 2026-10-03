# 08 — Attack Matrix

This matrix produces failure hypotheses. Real evidence decides status.

## Authority attacks

- Reported `cbccea4` differs from live HEAD.
- V2 repo already contains unexpected files.
- PROJECT_STATE disagrees with Git.
- Contract file missing/truncated/unparseable.

Expected: HOLD, no mutation.

## Migration/data attacks

- legacy custom exercises;
- corrupted legacy field;
- duplicate migration;
- interrupted migration;
- already migrated data;
- ambiguous legacy index;
- storage quota/full;
- transaction rejection;
- restore failure halfway.

Expected: no silent data corruption; V1 remains untouched.

## Training attacks

- complete-set rapid double click;
- custom exercise completion mixed with planned actions;
- navigate away during commit;
- background during rest;
- reload mid-workout;
- simultaneous second tab;
- change template after historical sessions exist;
- deterministic substitution requested with unavailable equipment;
- LLM attempts to choose an exercise substitute outside deterministic rules.

Expected: historical truth remains stable.

## Voice attacks

- rapid navigation;
- speech toggled off mid-utterance;
- page hidden/backgrounded;
- unsupported speech API;
- repeated queue requests;
- return to allowed view.

Expected: no orphan speech, no fake capability claim.

## Exercise/video attacks

- dead URL;
- semantically wrong but reachable video;
- close/reopen repeatedly;
- iframe unavailable;
- offline;
- local file selected/replaced.

Expected: text teaching survives; resources are cleaned; semantic mismatch is not PASS.

## Food attacks

- unclear image;
- mixed meal;
- user-provided measured weight;
- AI identity wrong;
- stale async response arrives late;
- old view/request completes after user starts a newer query;
- user supplies an exact measured portion but AI proposes a different value;
- OpenFoodFacts request slow/fails;
- manual correction.

Expected: draft/confirmation/provenance remains correct.

## Running attacks

- GPS denied;
- weak/temporary signal;
- app backgrounded;
- route >400 points;
- local midnight;
- network offline;
- long ticker session.

Expected: no invented route; endpoint preserved; local date correct; UI does not full-rerender each second.

## Companion motion attacks

- rapid real events;
- reduced-motion;
- hidden page;
- long session;
- animation error.

Expected: animation never blocks truth/persistence.

## PWA/platform attacks

- RC and Prod both installed;
- V1 and V2 both used under same origin;
- SW update during active workout;
- cold offline relaunch;
- managed/unmanaged caches coexist;
- project subpath deployment;
- persistent-storage request denied;
- two tabs attempt to mutate one active workout;
- optional Wake Lock unavailable/revoked.

Expected: isolation and safe update behavior.

## Security attacks

- secret in source;
- secret in logs/evidence;
- secret in backup;
- forbidden third-party character asset remains in unused folder;
- CSV formula injection.

Expected: release HOLD on violation.

## Contract-laundering attacks

- parity proven only by equal counts;
- test expectation rewritten only because implementation changed;
- fallback PASS used to claim untested capability PASS;
- simulated mobile used as physical-device PASS;
- model gives itself product score;
- incomplete scope called “future enhancement” to reach RC.

Expected: HOLD/UNKNOWN, not PASS.

## Test-harness attacks

- run F1/F2 on local calendar day 2 and another ordinary day;
- run from a fresh clone with no WorkBuddy NODE_PATH;
- delete `eval-set/` before setup;
- run J15/K8 without pre-existing local artifacts;
- run D1 repeatedly under full-suite load;
- verify repeated runs do not alternate PASS/FAIL due only to timing luck.

Expected: deterministic harness behavior without production-code changes.
