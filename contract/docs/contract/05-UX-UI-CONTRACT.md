# 05 — UX / UI Contract

## Visual language

**UX-001 MUST** follow `Soft Performance × Companion Fitness`.

Base palette:
- warm ivory / soft warm gray;
- charcoal text;
- deep mint primary/completion;
- warm orange PR/intensity/attention;
- soft lilac only as limited companion/brand accent.

Avoid ubiquitous pink-purple glassmorphism.

## Primary IA

**UX-010 MUST** use exactly:
`今日 | 训练 | Boji | 进步 | 我的`


## Onboarding

**UX-015 MUST** collect enough initial context to recommend an existing safe preset/profile without inventing an unverified AI program:
- goal;
- experience;
- equipment/location;
- typical session duration.

Recommendation of existing presets is allowed; free-form LLM program generation is outside this frozen scope.

## Today

**UX-020 MUST** make today's workout the dominant action.

**UX-021 MUST** expose:
- `调整今天`
- `为什么今天练这个？`

**UX-022 MUST** show at most a small number of meaningful metrics and one evidence-backed Boji note.

## Training

**UX-030 MUST** support two user modes without splitting the data model:

### Learning Mode
For new/learning exercises:
- teaching;
- form;
- breathing;
- tempo;
- common errors;
- safety;
- video where available.

### Performance Mode
For familiar exercises:
- previous/current set context;
- weight/reps;
- optional “还能做几次?” / RIR capture;
- teaching reachable within one main action.

## Progress

**UX-040 MUST** answer first:
1. Am I getting stronger?
2. Am I training consistently?
3. Is there a notable issue?

Detailed e1RM, volume, hard sets, etc. belong behind drill-down, not as the novice first screen.

## Boji center

**UX-050 MUST** expose quick access to:
- record food;
- scan barcode;
- start running;
- record body weight;
- ask Boji;
- Photo Pet / companion personalization.

## Character

**UX-060 MUST** use the frozen character direction:
original anime-style sweet adult female training companion.

Candidate generated concept art is not implementation authority.

**UX-061 MUST** preserve readability and small-size recognizability.

**UX-062 MUST NOT** over-sexualize the default character or drift into childlike/underage visual proportions.

## Accessibility / mobile

**UX-070 MUST** be mobile portrait first.

Target layout widths include:
- 360
- 390
- 430

**UX-071 MUST** account for safe-area insets.

**UX-072 MUST** support reduced motion.

**UX-073 SHOULD** keep major training touch targets around 44px minimum.

**UX-074 MUST** provide persistent, clear error UI for critical storage/migration failures.

## Required states

Design/implementation must cover:
- first use;
- no history;
- active workout;
- rest;
- background/reload resume;
- video unavailable;
- full offline;
- AI unavailable;
- low-confidence AI;
- GPS denied;
- storage full;
- migration running/failure;
- corrupt record;
- PWA update ready;
- restore preview.
