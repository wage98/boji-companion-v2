# Boji Companion V2

Boji V2 is maintained in this independent repository under the V2 product contract. The current release candidate is developed on branch codex-v2-independent-upgrade. The branch is intended to merge into main through a reviewed pull request after the RC release is verified; until that merge completes, use the upgrade branch as the current implementation.

V2 is separate from the V1 diary repository and the V2.1 QR-linked Pages site. The RC address is https://wage98.github.io/boji-companion-v2/rc/. It shows the last successfully deployed RC; the current candidate is live only after its manual qualification and Pages workflow succeed. The RC is not the Production release.

## Run locally

Requirements: Node.js 22 and pnpm 11.16.0.

1. Install locked packages: pnpm install --frozen-lockfile
2. Run tests: pnpm test
3. Check syntax: pnpm run check:syntax
4. Build the RC: node tools/build-rc.js
5. Start the local server: python tools/preview-rc.py

Open http://127.0.0.1:8785/boji-companion-v2/rc/. The preview server binds to localhost and serves only the generated dist/rc tree. The RC build writes to dist/rc; it does not modify application source or stored browser records.

## Release flow

The manual GitHub Actions workflow at .github/workflows/rc-pages.yml accepts only codex-v2-independent-upgrade, checks out the exact dispatched commit, runs syntax and full regression checks, builds the RC, scans the current source/build/evidence, and publishes the RC Pages tree. It writes per-run qualification and deployment evidence under evidence/RC/<commit>/ as workflow artifacts. The workflow does not build or publish a Production channel.

For a local release scan, run node tools/release-audit.js evidence/RC/local. This keeps the historical G0–G7 qualification records intact.

## Repository map

- Root: application entry points, data layer, release identity, package scripts.
- assets/: application artwork and preserved source/provenance material.
- server/: optional AI proxy.
- tools/: build, preview, regression, and release checks.
- docs/: developer and release instructions.
- evidence/: historical gates and current RC qualification evidence.
- outputs/upgrade-evidence/: visual checkpoints and their index.
- .github/workflows/: manual RC publication flow.

Start with docs/DEVELOPMENT.md for developer and release details.
