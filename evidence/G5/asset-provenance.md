# G5 Boji Candidate Asset Provenance

**Status:** Review candidate only; final production approval remains pending under AUTH-004.

## Origin and review boundary

- The portrait and icon-direction images were generated with Codex ImageGen during this implementation on 2026-10-03.
- The compact pet-form candidate was generated with Codex ImageGen on 2026-10-03 from an internally generated full-body intermediate, which in turn used the local portrait candidate as its identity reference.
- No third-party image reference was supplied to the generation task. The package does not include an ImageGen model/version or training-data/license export.
- The candidate was visually reviewed for the frozen adult anime training-companion direction, mint/cream/orange palette, and small-screen presentation. This review does not establish legal originality, license clearance, or final character approval.
- The 192px and 512px PNGs are app-icon size outputs for the candidate direction. The production default remains a review candidate until the AUTH-004 owner review.

## Files and SHA-256

| File | Dimensions | Size | SHA-256 |
|---|---:|---:|---|
| `assets/boji-companion-candidate.png` | 1254 × 1254 | 1,798,639 bytes | `E74EEF409A0544272F02DF2E90788C94A07DA45CD5DCA56D556C5D11708BDD83` |
| `assets/boji-companion-icon-candidate.png` | 1254 × 1254 | 1,805,718 bytes | `93D9EE562330A093FA71334A2410B67C83D1E1CD1B0ED63702282C33FA33D873` |
| `assets/boji-companion-pet-candidate.png` | 1024 × 1536 | 1,831,188 bytes | `C0016422458825BAD46E6A8171D05DA5777F1C4CBE0594BB3D7178789FB437AE` |
| `assets/boji-icon-192.png` | 192 × 192 | 78,531 bytes | `719A59F09B473E249F07E0D053DA09B58B7927394CF4E0173AC99AE3E319D20A` |
| `assets/boji-icon-512.png` | 512 × 512 | 503,030 bytes | `690E95A320C1154761351CF3F832357B05781022A1B4731738A311A75EC12D41` |

## Use in V2

- `boji-companion-candidate.png` supplies the local Boji portrait and Today wallpaper candidate.
- `boji-companion-icon-candidate.png` records the separate icon-direction candidate.
- `boji-companion-pet-candidate.png` supplies the compact full-body desktop-pet candidate; the renderer applies lightweight states and edge motion.
- `boji-icon-192.png` and `boji-icon-512.png` supply the current local app-icon sizes.
- Photo Pet remains a separate, optional user-local renderer and is not replaced by the Boji candidate.
