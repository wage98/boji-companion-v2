# G4 Personal System

**Status:** PASS  
**Tested implementation commit:** `b043b22913c467cc109e080aa794a8dad8d57e5c`  
**Tested tree:** `2a0a188e001ecaf5d436e49e43111273fe527b78`  
**Next gate:** G5 UX & Companion

## Completed

- Nutrition recognition and manual entry create persisted FoodDraft items with per-field provenance. A confirmed MealRecord is created only after the user's explicit confirmation; the photo itself is not retained in the meal record.
- AI calorie-only results leave macros absent. Reported energy/macro disagreement is preserved. Mixed foods remain itemized, and the editor supports user-supplied quantity and nutrient corrections.
- Food search, barcode, and AI requests carry owner and cancellation state. Debounced search is latest-result-wins, and closing the sheet discards outstanding results.
- Nutrition intent supports log-only, maintain, gain, lose, and custom. Targets are labeled as estimates and remain adjustable. Weight and water use dated canonical facts with event-time timezone context.
- GPS runs keep measured points grouped into independent route segments. Simplification preserves segment endpoints, live ticks update only live fields, and a manual distance/time fallback is explicit. Run events follow successful storage commits.
- Knowledge claims and sources retain their evidence status. Unverified legacy claims are not presented as formal evidence grades.
- CSV export reads canonical confirmed meals and exports per-field provenance. Product, data, and RC cache versions are aligned; service-worker cleanup is limited to managed V2 prefixes.

## Verification

- `pnpm test`: 65 functional PASS, 200 attack PASS, 35 data-layer PASS; 0 failures.
- `pnpm run check:syntax`: PASS.
- `pnpm run eval:simulate`: PASS. The 13-sample deterministic comparison is a prompt/sanitizer regression measure, not a live model claim.
- `pnpm test` regenerated the offline vision report: 13/13 reference samples, 5/5 adversarial cases, and local fallback coverage 13/13.
- `git diff --check` and `git show --check b043b22`: PASS.
- `evidence/G4/test-updates.json` classifies harness expectation changes under the frozen G1 vocabulary.

Detailed command output is in `evidence/G4/logs/`.

## Scope boundary

G4 qualifies the personal-system data paths. G5 is now authorized. The generated original portrait is only a review candidate; final character asset approval remains pending. G6/G7 and physical-device qualification remain unqualified.
