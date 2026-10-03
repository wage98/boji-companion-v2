# G3 — Training Truth

**Status:** PASS  
**Tested implementation commit:** `ac1d1020fc0aca8f4dac5fe747079b26126fbe9f`  
**Tested tree:** `cf42ad471f23e027b305c96fde1cdf9e86af2f06`  
**Next gate:** G4 — Personal System

## Completed

- Training now uses canonical Program, WorkoutTemplate, WorkoutSession, ExerciseSession, and SetRecord records with semantic IDs.
- Built-in equipment profiles A/B/C feed deterministic `调整今天` proposals. Proposals explain equipment, goal, substitutions, and time-driven set reductions, and persist only after confirmation.
- Users record each working set's weight, reps, and optional RIR. A set advances only after the IndexedDB transaction commits; duplicate and out-of-order commits are rejected.
- Active sessions retain their prescription snapshot, current exercise/set, last committed set, timestamps, and wall-clock rest end time. Reload recovery was exercised through the application startup path.
- Progression uses committed sets for conservative, explainable double-progression suggestions and requires user confirmation. RIR remains behind an optional advanced detail surface.
- Teaching metadata is linked to canonical exercises. User-created exercise logs remain separate from planned workout completion.

## Verification

- `pnpm run check:syntax` — PASS.
- `pnpm test` — 58 functional PASS, 197 attack PASS, 34 data-layer PASS; 0 failures.
- The application-level IndexedDB flow verified a confirmed 25-minute adjustment, a delayed set transaction with no early success message, reload recovery of the next set and rest timer, and custom-exercise catalog hydration.
- `git show --check ac1d102` — PASS.

Detailed logs: `evidence/G3/logs/`.

## Scope boundary

G3 qualifies training truth. The FoodDraft/MealRecord UI, food/search/AI ownership, nutrition intent, running records, and personal-system events remain for G4. G5–G7 remain unqualified; physical-device behavior is UNKNOWN pending post-Luna qualification.
