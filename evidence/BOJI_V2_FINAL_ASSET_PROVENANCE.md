# Boji V2 — Final Asset Provenance (AUTH-004)

**Record type:** in-repo provenance record for the final Boji visual assets.
**Phase:** FINAL ASSET INTEGRATION / PRODUCT LANDING.
**Date:** 2026-10-05.
**Integration branch:** `final-assets-v1`.
**Accepted engineering baseline (branch point):** `9bad96e82d6d875ddf536d432a996369e5e81baf` (`final-rc-truth-residual`).

This record is new. It does **not** rewrite the G1–G7 evidence set. The earlier
`evidence/G5/asset-provenance.md` remains as the historical record of the Codex
ImageGen review-candidate artwork and is deliberately left untouched.

---

## 1. Authority and source approval

- The owner ("visual authority") explicitly approved the five production source images
  carried in `Boji_V2_Final_Visual_Sources_2026-10-05.zip` and instructed that they be
  integrated as the final runtime artwork.
- The package was verified byte-for-byte against the five SHA-256 values the owner
  supplied with the request. **All five matched** (`ASSET_HASH_MISMATCH = NONE`).
- The authoritative composite visual board named in the package
  (`已生成图像 1.png`, SHA-256 `5607d01edd78a0b0a968b321c63a6ba72f14b316f35539ed89579b103096b5b8`)
  is **not** stored in this repository and is **not** used as a runtime asset. It remains
  the upper-level identity authority only.
- No `ImageGen` call, no diffusion/redraw, no colour grading, no in-painting and no
  generative editing of any kind was performed in this phase.

## 2. Owner-approved production sources

| Source file (as supplied) | Role | Dimensions | Bytes | SHA-256 |
|---|---|---:|---:|---|
| `01_adult_master.png` | Adult Boji main portrait / runtime portrait source | 1122 × 1402 | 1,969,259 | `99c360cd4d827f3f8611d7130874dfb3ac97f8fe162b7f105979a1b44d6fe514` |
| `02_adult_turnaround.png` | Adult front/side/back turnaround — body, outfit and proportion authority | 1448 × 1086 | 1,462,834 | `bc15737bbffa9298a7a6dbd1ed2da879144393759a2bda8f451230c9410ab923` |
| `03_adult_expressions.png` | Adult expression state sheet | 1448 × 1086 | 2,932,884 | `f73b6b2972adc9a66dbc25c6c3a74faea6fada0967b1bfc96cbe41e95ccdacab` |
| `04_chibi_states.png` | Chibi desktop-pet state sheet (2 × 4 stickers) | 1448 × 1086 | 2,588,341 | `fa88b42aae79d0f4f3d01448e77ad9ccd152e7379e49f921d749a599fb041d71` |
| `05_app_icon_source.png` | Final anime-character app-icon source (replaces the B-letter logo) | 1254 × 1254 | 1,962,035 | `aa0d00d434f7d263f137f2d94469bd0a50ffdc5d9f9a18e7fb270c7cf63305c6` |

### Verified against the owner-supplied values

```
01_adult_master.png              99c360cd4d827f3f8611d7130874dfb3ac97f8fe162b7f105979a1b44d6fe514  MATCH
02_adult_turnaround.png          bc15737bbffa9298a7a6dbd1ed2da879144393759a2bda8f451230c9410ab923  MATCH
03_adult_expressions.png         f73b6b2972adc9a66dbc25c6c3a74faea6fada0967b1bfc96cbe41e95ccdacab  MATCH
04_chibi_states.png              fa88b42aae79d0f4f3d01448e77ad9ccd152e7379e49f921d749a599fb041d71  MATCH
05_app_icon_source.png           aa0d00d434f7d263f137f2d94469bd0a50ffdc5d9f9a18e7fb270c7cf63305c6  MATCH
```

`ASSET_HASH_MISMATCH = NONE`. Verification was performed on the extracted archive
bytes before any file was written into the repository.

## 3. Runtime assets written into the repository

All final runtime artwork lives under `assets/boji/`.

| Repository path | Dimensions | Bytes | SHA-256 | Derivation |
|---|---:|---:|---|---|
| `assets/boji/portrait-master.png` | 1122 × 1402 | 1,969,259 | `99c360cd4d827f3f8611d7130874dfb3ac97f8fe162b7f105979a1b44d6fe514` | byte-identical copy of `01_adult_master.png` |
| `assets/boji/chibi-base.png` | 362 × 579 | 421,074 | `5df7bbdbb5816a9f55dccd26ba3355ba5250135246c28b319c540ab87219165d` | deterministic fixed-rectangle crop of `04_chibi_states.png`, alpha preserved |
| `assets/boji/icon-source.png` | 1254 × 1254 | 1,962,035 | `aa0d00d434f7d263f137f2d94469bd0a50ffdc5d9f9a18e7fb270c7cf63305c6` | byte-identical copy of `05_app_icon_source.png` |
| `assets/boji/icon-192.png` | 192 × 192 | 79,614 | `aaaa5dd11f9fd8e3dbf34edc0f9099105e56d2567257a75cfada133513477088` | exact integer area-average (box) downscale of the full `05` source |
| `assets/boji/icon-512.png` | 512 × 512 | 521,262 | `9d03ae3aa6cf1ecf1aae5cc56b79a88e2a2ef07feb9099ea8160519e0d752cc5` | exact integer area-average (box) downscale of the full `05` source |

### Preserved sources (non-runtime, retained for traceability)

| Repository path | Dimensions | Bytes | SHA-256 |
|---|---:|---:|---|
| `assets/boji/source/adult-turnaround.png` | 1448 × 1086 | 1,462,834 | `bc15737bbffa9298a7a6dbd1ed2da879144393759a2bda8f451230c9410ab923` |
| `assets/boji/source/adult-expressions.png` | 1448 × 1086 | 2,932,884 | `f73b6b2972adc9a66dbc25c6c3a74faea6fada0967b1bfc96cbe41e95ccdacab` |
| `assets/boji/source/chibi-sheet.png` | 1448 × 1086 | 2,588,341 | `fa88b42aae79d0f4f3d01448e77ad9ccd152e7379e49f921d749a599fb041d71` |

These three are byte-identical copies of `02`, `03` and `04`.

## 4. Derivation methods (exact, reproducible)

**`DERIVED_WITHOUT_GENERATIVE_EDIT = YES`**

### 4.1 `chibi-base.png` — fixed-rectangle crop

- Source: `04_chibi_states.png` (1448 × 1086, 8-bit RGBA).
- Rectangle: `x ∈ [0, 362)`, `y ∈ [0, 579)` — the sheet's natural 4-column grid
  (1448 / 4 = 362) for column 0, crossed with the vertical band that contains the
  complete default chibi.
- The default chibi's own alpha bounding box inside that rectangle is
  `x 25…361`, `y 25…571`.
- The sheet has no label/caption text at all: an alpha-mask connected-component pass
  over the whole sheet returns 8 sticker components plus decorative specks, and no
  glyph-like component. The "exclude label text" requirement is therefore satisfied
  vacuously and was verified, not assumed.
- Row 2 of the sheet begins at `y = 603`; the band `y 572…602` is fully transparent
  for `x < 362`, so the rectangle stops inside a genuine gutter and contains no pixel
  of any neighbouring sticker.
- Alpha channel is copied verbatim; no pixel value is altered. This was proved by
  decoding the written PNG and comparing all 362 × 579 × 4 bytes against the source
  region: **0 mismatching rows**.
- Window is an exact, integer, source-coordinate rectangle: re-running the same
  derivation on the same source yields the same bytes.

### 4.2 `icon-192.png` / `icon-512.png` — area-average downscale

- Source: the **full** `05_app_icon_source.png`, so both icons share identical
  composition (no per-size cropping).
- Kernel: exact integer area-average (box). A destination pixel covering
  `[x·w/tw, (x+1)·w/tw) × [y·h/th, (y+1)·h/th)` is the overlap-weighted mean of the
  source pixels it covers. All weights are computed in integer units of `1/tw` and
  `1/th`; no floating-point arithmetic is involved, so the result is bit-reproducible.
- Rounding: `round(sum / (w·h))` with half-up integer rounding.
- Output colour model is 8-bit RGB (type 2), matching the source, so no alpha channel
  is introduced.
- Both icons were regenerated a second time from adjusted framing and the final pair
  comes from the single shared window described above.

## 5. What was explicitly NOT done

| Declaration | Value |
|---|---|
| `VISUAL_REDESIGN` | `NO` |
| `CHARACTER_REGENERATED` | `NO` |
| `IMAGE_GENERATED` | `NO` |
| `OLD_CANDIDATE_PROMOTED` | `NO` |
| `B_LETTER_ICON_USED` | `NO` |
| `GENERATIVE_EDIT_USED` | `NO` |

- The previous Codex-ImageGen review candidates were **not** promoted. They were
  removed from the repository (see §6).
- The legacy B-letter brand logo was **not** used. It was removed from the repository
  and its manifest/service-worker/offline-builder references were removed with it.
- No product logic, training logic, data model, companion engine, 5-tab information
  architecture or content-truth wording was changed in this phase.

## 6. Superseded assets removed from the repository

Removed so that the release artifact cannot ship stale, non-approved artwork and so
that `CANDIDATE_RUNTIME_REFERENCES = 0` is structurally enforced.

| Removed path | Bytes | SHA-256 (at removal) | Why removed |
|---|---:|---|---|
| `assets/boji-companion-candidate.png` | 1,798,639 | `e74eef409a0544272f02df2e90788c94a07da45cd5dca56d556c5d11708bdd83` | superseded review-candidate portrait |
| `assets/boji-companion-pet-candidate.png` | 1,831,188 | `c0016422458825bad46e6a8171d05da5777f1c4cbe0594bb3d7178789fb437ae` | superseded review-candidate pet form |
| `assets/boji-companion-icon-candidate.png` | 1,805,718 | `93d9ee562330a093fa71334a2410b67c83d1e1cd1b0ed63702282c33fa33d873` | superseded review-candidate icon direction (never runtime-referenced) |
| `assets/boji-icon-192.png` | 78,531 | `719a59f09b473e249f07e0d053da09b58b7927394cf4e0173ac99ae3e319d20a` | previous app icon (pre-final character art) |
| `assets/boji-icon-512.png` | 503,030 | `690e95a320c1154761351cf3f832357b05781022a1b4731738a311a75ec12d41` | previous app icon (pre-final character art) |
| `assets/icon.svg` | 570 | `e3848d34d5c4f8e19817621559f469e79eadb61b11dd3e0cb55931c2f77a2dbb` | B-letter brand logo (SVG); explicitly not to be used as the final app icon |

All six remain recoverable from git history at the branch point
`9bad96e82d6d875ddf536d432a996369e5e81baf`. Nothing was destroyed.

## 7. AUTH-004 accounting

AUTH-004 ("Remaining external qualification gaps") lists four items. This phase closes
one of them and leaves the rest pending.

| AUTH-004 item | Status after this phase |
|---|---|
| final production Boji character asset approval | **CLOSED** — the owner approved the five sources and they are integrated as the final runtime artwork, with the byte-level provenance recorded above. |
| physical mobile/PWA qualification | **PENDING** — unchanged. This phase only rendered headless Chromium viewports, which is not physical-device qualification. |
| post-Luna independent release qualification | **PENDING** — unchanged. |
| Production approval | **PENDING** — unchanged. `FINAL_RC_COMPLETED = NO`; this task stops before Final RC by instruction. |

AUTH-004 as a whole therefore remains `PENDING` in `PROJECT_STATE.json`.

### Licence / originality boundary (stated, not claimed)

- The five sources were supplied by the owner as already-approved production inputs.
  The repository contains no third-party franchise reference, no licence document and
  no model/training-data export for them.
- This record asserts only what is mechanically verifiable: the bytes, their hashes,
  and the deterministic derivation. It does **not** assert legal originality, licence
  clearance, or that the artwork is free of third-party rights. That clearance is the
  owner's declaration and cannot be independently established from the repository.
- `tools/release-audit.js` filename scanning cannot establish copyright or originality;
  it only checks the configured forbidden-name rule set.

## 8. Residual items carried forward

1. The PNGs written by the deterministic builder are re-encoded (zlib level 9, filter 0
   per row); file bytes differ from the sources' original encoder output for the derived
   images. **Pixel values** for `chibi-base.png` are bit-identical to the source region
   (proved in §4.1). `portrait-master.png`, `icon-source.png` and the three preserved
   sources are byte-identical copies, not re-encodes.
2. `sw.js` `CACHE_NAME` (`boji-v2-rc-6`) was deliberately not bumped. The precache list
   changed, but the cache identifier is part of the release-namespace surface and its
   lifecycle is pinned by `tools/platform-check.js`, which is outside the declared scope
   of this phase. Consequence: an already-installed client may retain unreferenced cache
   entries for the removed files until the identifier next changes. No runtime surface
   requests them.
3. `evidence/G7/release-manifest.json`, `evidence/G7/asset-scan.json` and
   `evidence/G7/secret-scan.json` are regenerated by `tools/release-audit.js`. They were
   restored rather than committed, per the established protocol and the instruction not
   to rewrite G1–G7 evidence. They therefore still describe the pre-integration artifact
   inventory; regenerating them belongs to Final RC.
4. `evidence/G5/asset-provenance.md` still describes the superseded ImageGen candidates.
   It was intentionally left untouched as historical evidence; this file supersedes it
   for the final assets.
