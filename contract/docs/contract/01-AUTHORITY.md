# 01 — Authority and Freeze Semantics

## AUTH-001 — Authority hierarchy

1. Live repository bytes, Git identity, real runtime behavior.
2. Frozen exact bytes/hashes and captured reproducible evidence.
3. Machine-readable manifests and gate evidence.
4. Tests and CI results.
5. Project documentation.
6. Reports.
7. Comments.
8. Memory, inference, model interpretation.

Lower authority must never overwrite higher authority.

## AUTH-002 — Freeze categories

### EVIDENCE-FROZEN
A source-backed historical fact or source-observed defect. Preserve the exact claim and authority class.

### DECISION-FROZEN
A reviewed product/architecture decision. Reopen only if new P0/P1 evidence proves the frozen decision unsafe or impossible.

### REPORTED-UNVERIFIED
A claim present in a report that has not been independently rechecked.

### PENDING
Not completed. Must never be described as PASS.

### SUPERSEDED
An older decision/preview replaced by a newer authority. Preserve history but do not implement the superseded version.

## AUTH-003 — Historical report vs current verified baseline

The V1.2 report historically states:
- repository: `wage98/boji-diary`
- branch: `main`
- commit: `cbccea4`
- application version: `1.2.0`
- SW cache: `boji-1-2-0`
- tests: 55 functional + 196 attack = 251 ALL PASSED
- Pages URL: `https://wage98.github.io/boji-diary/`

PRE-LUNA qualification later independently verified:
- live V1 HEAD: `c0a8d55283765a0f7d7e4d773df0609ba1e4049d`
- live tree: `ca4eb14a38f735f8302c238634f7c75352f66f50`
- historical v1.2 anchor: `cbccea4c47995711d1ae0af2d7c76449febe2603`
- the two intervening commits are docs-only;
- qualified `app.js`, `sw.js`, and relevant `tools/` bytes are identical across the two baseline points;
- historical 251 PASS is reproducible under its qualified preconditions;
- the legacy repository-native harness itself is non-portable/non-deterministic and requires the frozen G1 repairs in `07A-G1-PORTABLE-TEST-HARNESS.md`;
- V2 repository `wage98/boji-companion-v2` exists, is empty, and is not a template repository.

The historical report remains a report artifact; current verification comes from the later PRE-LUNA evidence, not from retroactively upgrading the report itself.

## AUTH-004 — Remaining external qualification gaps

The following remain PENDING and MUST NOT be called PASS before their phase:
- final production Boji character asset approval;
- physical mobile/PWA qualification;
- post-Luna independent release qualification;
- Production approval.

These are not PRE-LUNA blockers for starting implementation.

## AUTH-005 — Supersession

Examples already superseded:
- early neutral-creature mascot direction → superseded by original sweet adult anime woman companion.
- earlier dog/corgi product preview → non-authoritative visual concept only.
- older navigation concepts → superseded by `今日 | 训练 | Boji | 进步 | 我的`.
