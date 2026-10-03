# 03 — Feature Parity Contract

Feature parity means **semantic capability**, not equal counts alone.

Allowed disposition per legacy capability:
- KEEP
- UPGRADE
- MERGE
- REMOVE

`REMOVE` requires explicit evidence that the capability is duplicate, incorrect, deceptive, unsafe, strictly superseded, or low-value with an approved scope decision. UI simplicity alone is never sufficient.

## Legacy training

**LEG-TRN-001 MUST** preserve built-in A/B/C training presets as built-in Equipment/Profile presets.

**LEG-TRN-002 MUST** preserve the existing push/pull/legs/core plan capability and all legacy plan exercise entries unless a mapped correction is documented.

**LEG-TRN-003 MUST** preserve custom exercises.

**LEG-TRN-004 MUST** preserve switching between built-in plans without silently losing historical check-ins or weights.

## Exercise teaching

**LEG-EXR-001 MUST** preserve teaching access for the legacy plan actions.

**EXR-001 MUST** preserve semantic legacy→canonical mapping, not only aggregate counts.

**EXR-002 MUST** preserve, where present: exercise name, target muscles, sets/reps, tempo, breathing, rest, starting-weight information, standard form, common errors, safety guidance, and teaching media metadata.

**VID-001 MUST** treat media availability and semantic correctness as separate properties.

**VID-002 MUST** store teaching media provenance:
- provider
- externalId
- title
- variant
- matchLevel
- sourceUrl
- verifiedAt
- availability
- manualReviewed

Allowed match levels:
`EXACT_VARIANT | CLOSE_VARIANT | GENERAL_TECHNIQUE | UNVERIFIED`

**VID-003 MUST** keep text teaching usable when video is unavailable.

**VID-004 MUST** preserve fallback paths where feasible:
1. embedded playback;
2. original-site fallback;
3. user-selected local-file playback.
Third-party iframe behavior is time-bound and must be rechecked; never treat it as permanent authority.

## Voice

**LEG-VOICE-001 MUST** preserve the legacy voice companion capability.

**VOI-001 MUST** preserve voice companion capability.

**VOI-002 MUST** preserve emotion-aware delivery rather than flattening all output to one prosody.

**VOI-003 MUST** correctly stop/cancel speech on navigation, visibility/lifecycle changes, and explicit voice-off.

**VOI-004 MUST** explicitly degrade when speech APIs are unavailable; text remains usable.

**VOI-005 SHOULD** keep local speech as the reliable baseline. Cloud TTS may be optional only if secrets stay server-side and local fallback remains.

## Companion / pet

**LEG-BOJI-001 MUST** preserve the companion as a living interactive product feature, not reduce it to a static avatar.

**LEG-BOJI-002 MUST** preserve the verified interaction classes from V1 where present: skins/appearance choice, movement, emotions, animation, dragging, voice, click interaction, and Photo Pet personalization. Implementation may be redesigned, but capability must not silently disappear.

**BOJI-MOT-001 MUST** preserve ambient motion capability such as blink/idle/stretch/sleep/light movement.

**BOJI-MOT-002 MUST** drive event motion from verified product events such as set completion, rest end, workout completion, PR, and milestones.

**BOJI-MOT-003 MUST** pause or safely reduce noncritical animation when hidden/backgrounded or reduced-motion is requested.

**LEG-PHOTO-001 MUST** preserve Photo Pet/local user image personalization.

## Nutrition

**LEG-FOOD-001 MUST** preserve manual food entry.

**LEG-FOOD-002 MUST** preserve barcode/search/local-food pathways.

**LEG-FOOD-003 MUST** preserve photo-AI as an optional input path, governed by `04-DATA-TRUTH.md`.

**LEG-FOOD-004 MUST** preserve useful food-history convenience such as recent/history/high-frequency reuse when verified in the baseline.

## Running

**LEG-RUN-001 MUST** preserve GPS distance/time/pace/route/history.

**LEG-RUN-002 MUST** label calorie burn as estimated.

**LEG-RUN-003 MUST** preserve a usable map/route experience with an honest offline/denied-GPS fallback; absence of live map tiles must not fabricate route data.

## Knowledge

**LEG-KNW-001 MUST** preserve the long-form knowledge capability and science/knowledge media capability.

## Data / backup

**LEG-DAT-001 MUST** preserve useful historical views such as streak/calendar/body-weight/progress visualizations, with V2 redesign allowed.

**LEG-DAT-002 MUST** preserve export/import capability but rebuild it under V2 schema/security rules.

## Parity proof

Counts alone do not pass parity. Proof must include:
- presence;
- semantic identity/mapping;
- interaction;
- fallback behavior;
- regression coverage.
