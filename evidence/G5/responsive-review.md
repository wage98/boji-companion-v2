# G5 Responsive UI Review

**Surface:** local preview at `http://127.0.0.1:4173/` in the Codex In-app Browser, plus a clean first-use origin at `http://127.0.0.1:4174/`.
**Method:** browser viewport override and DOM/layout inspection. This is desktop browser simulation, not physical-device qualification.

## Viewport results

The five-tab sweep was performed at portrait CSS widths 360, 390, and 430 after the G5 layout fixes. The compact full-body pet candidate was integrated afterward; its Today dock position and speech bubble were rechecked separately at all three widths. The pet renderer change did not alter the other route layouts.

| CSS width | Main tabs checked | Training modes | Boji shortcuts | Today CTA | Bottom-nav min height | Horizontal overflow |
|---:|---|---|---|---:|---:|---|
| 360px | Today, Training, Boji, Progress, My | Learning and Performance | 6 distinct actions | 92 × 44px | 47px | None in reviewed content panels |
| 390px | Today, Training, Boji, Progress, My | Learning and Performance | 6 distinct actions | 92 × 44px | 47px | None in reviewed content panels |
| 430px | Today, Training, Boji, Progress, My | Learning and Performance | 6 distinct actions | 92 × 44px | 47px | None in reviewed content panels |

The checked Boji actions were food, barcode, run, weight, Ask Boji, and Photo Pet. Learning and Performance both displayed their mode-specific controls while retaining the same active workout model. Progress presented strength, consistency, and notable issues before drill-down. The My profile/preferences forms and Progress weight-entry row stayed within their content widths.

The pet-candidate Today check measured the speech bubble within the visible screen at each width, including a two-line layout at 360px. The fixed app screen remained at scroll position zero while switching routes. The Today action and bottom navigation met the measured target sizes above.

## First-use and accessibility

- At a 360 × 795 CSS mobile screen, first-use onboarding stayed within the viewport (top 12px, bottom 783px) and scrolled internally (dialog client height 770px, content height 957px); no horizontal overflow was observed.
- After the accessibility patch, onboarding exposed `role=dialog`, `aria-modal=true`, and its heading label while open; focus moved to the dialog and returned to the active navigation target when it closed.
- Safe-area inset variables remain applied to the mobile home, modal, dock, panel, and chat input. Reduced-motion rules and persistent storage-error alert semantics are covered by the G5 regression checks.
- Ambient pet scheduling, scripted walking, blink timing, idle prompts, and noncritical bubble typing pause while hidden or when reduced motion is requested; foreground/preference changes restart the ambient schedule.

## G5 fixes

- The edge-docked speech bubble used shrink-to-fit width bounded by the companion element, wrapping one character at a time. Intrinsic content width with the existing maximum fixed it.
- The fixed screen frame allowed programmatic scroll restoration to move the wallpaper and home layer. `overflow: clip` keeps the frame fixed while module content remains independently scrollable.
- The weight-entry button inherited full row width inside a flex row. It now sizes to its label so the input remains visible.
- Profile form controls retained intrinsic widths in a two-column grid. The columns and controls now shrink to the available width.
- The Today workout action was visually secondary and below the 44px target. It now uses the primary mint treatment and a 44px minimum height.
- Onboarding became visible to assistive technology only after clearing `aria-hidden`; it is now a labelled modal dialog with focus handoff and return.

Physical mobile/PWA behavior, hardware safe-area handling, and background/foreground lifecycle remain UNKNOWN pending the required qualification phase.
