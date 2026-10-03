# 02 — Product Frozen Spec

## PROD-001 — Product definition

Boji is a **local-first personal training companion**, strength-training first, helping the user:
1. know what to train today;
2. learn how to perform the exercise;
3. record what was actually performed;
4. understand progress;
5. receive explainable next-step suggestions;
6. receive truthful companion feedback.

Boji is not:
- a generic chat agent;
- an AI girlfriend;
- a social fitness network;
- a Hevy clone;
- a pure diary.

## PROD-002 — Core loop

Today / plan  
→ learn exercise  
→ perform real sets  
→ rest  
→ commit real performance  
→ progress/decision  
→ explainable suggestion  
→ Boji feedback  
→ next session.

## PROD-003 — Frozen primary IA

Exactly five primary tabs:

`今日 | 训练 | Boji | 进步 | 我的`

Implementation must not add/remove primary tabs without a future explicit scope revision.

## PROD-004 — Domain scope

Preserve and improve:
- strength training;
- exercise teaching/media;
- progression;
- food/nutrition;
- running/activity;
- knowledge;
- body weight;
- progress views;
- Boji companion;
- voice;
- companion motion;
- Photo Pet;
- backup/restore;
- PWA/offline/mobile install.

## PROD-005 — Technical direction

Default V2 architecture:

- Vanilla JavaScript
- ES Modules
- IndexedDB
- CSS design tokens
- PWA / Service Worker

Do not perform a React/Next/framework rewrite without new evidence proving it necessary.

Recommended module boundaries:

`app, data, training, exercises, progression, nutrition, activity, knowledge, companion, ui`


## PROD-007 — Equipment profiles and explainable day adjustment

Built-in A/B/C remain built-in equipment/location profiles rather than being deleted.

V2 MAY allow additional user profiles such as home/dorm/gym.

`调整今天` is a deterministic, explainable constraint-adjustment feature. It MUST NOT rely on an LLM to decide exercise equivalence.

Substitution logic uses explicit product data such as:
- movement pattern;
- target muscles;
- available equipment;
- user goal;
- immediate constraint (time/equipment availability).

The user accepts the proposed change before it becomes the active plan.

## PROD-006 — Official character direction

Official Boji is an **original anime-style sweet adult female training companion**:
- clearly adult;
- warm, energetic, gentle;
- light athletic aesthetic;
- modern Japanese-inspired anime rendering;
- not childlike;
- not over-sexualized;
- original, not a recolor/redesign of an existing IP;
- usable as portrait, app icon, chibi pet, and motion system.

Current generated concept art is a candidate only, not frozen production art.
