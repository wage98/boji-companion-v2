# G5 UX & Companion

**Status:** PASS
**Qualified implementation commit:** `774c3237cf53f12c743e7597ab7808e5a2743bb2`
**Qualified tree:** `8d748c86679e1b4d3251dd00fe65936ecee1bf5f`
**Next gate:** G6 Platform Reliability

## Completed

- Implemented the frozen five-tab IA, Today workout priority and evidence-backed Boji note, Training Learning/Performance modes, Progress first answers, My profile/setup, and six Boji center shortcuts.
- Integrated original portrait, icon, and compact full-body Boji artwork as review candidates. The Photo Pet renderer, saved image, position, movement controls, and voice preference remain distinct.
- Made onboarding a labelled accessible dialog with focus handoff and return, viewport-bounded internal scrolling, and contract-required first-use context.
- Paused ambient pet timing, scripted walking, blink, idle prompts, and bubble typing while hidden or reduced-motion is requested. Visibility, page-show, and motion-preference changes resynchronize the ambient schedule.
- Preserved text teaching and its video metadata/fallbacks, emotion-aware local speech, and training-event reactions after committed workout changes.
- Fixed responsive overflow in the speech bubble, profile form, Progress weight row, and app frame; promoted the Today workout action to the primary 44px target.

## Verification

- `pnpm test`: 65 functional PASS, 206 attack PASS, 35 data-layer PASS; zero failures.
- `pnpm run check:syntax`: PASS.
- `pnpm run eval:simulate`: PASS, 13 deterministic synthetic samples. The comparison changed from 3/13 to 8/13 with kcal MAPE from 15.5% to 8.6%; this measures prompt/sanitizer regression behavior, not live-model accuracy.
- `git diff --check` and `git show --check 774c323`: PASS.
- Browser layout review covered the five tabs and both training modes at portrait widths 360, 390, and 430. The compact pet candidate and speech bubble were separately rechecked at those widths. First-use onboarding and its accessible dialog semantics were checked at 360 × 795 CSS pixels.
- `evidence/G5/test-updates.json` classifies the revised test expectations and new contract checks.

Detailed output is in `evidence/G5/logs/`; responsive observations are in `evidence/G5/responsive-review.md`.

## Scope boundary

The integrated character art remains a candidate. Final visual/asset-owner approval and complete model/license provenance remain pending under AUTH-004. No legal originality or license-clearance claim is made. Physical mobile/PWA behavior, hardware safe-area behavior, and background GPS continuity remain UNKNOWN for the required post-Luna qualification. G6 and G7 have not yet been qualified.
