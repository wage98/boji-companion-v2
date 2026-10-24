# Boji V2 development

## Local workflow

1. Check out codex-v2-independent-upgrade while the RC candidate is under review. After its reviewed pull request is merged, use main as the maintenance branch.
2. Install the locked development tools with pnpm install --frozen-lockfile.
3. Run pnpm test for functional, attack, canonical data, platform, and service-worker checks. Run pnpm run check:syntax for JavaScript syntax validation.
4. Build the isolated preview with node tools/build-rc.js.
5. For a real local browser preview, use Python 3.9+ standard library: start python tools/preview-rc.py and open http://127.0.0.1:8785/boji-companion-v2/rc/. The helper binds to 127.0.0.1, serves only dist/rc, and refuses build paths that cross symbolic links.
6. Run node tools/release-audit.js evidence/RC/local for a local source, asset, secret, and RC artifact scan.

The build recreates only the ignored dist/rc directory. Do not place user backups or private data inside the source tree.

## RC release

The only automated publishing flow is .github/workflows/rc-pages.yml. It is manually dispatched against codex-v2-independent-upgrade. It pins checkout to the dispatch SHA and checks that SHA against the event, then runs the full syntax and regression checks, builds only the RC, and audits the current candidate. Old G7 files are retained as historical records and do not qualify a new candidate.

The RC Pages address is https://wage98.github.io/boji-companion-v2/rc/. A successful workflow run and exact commit match are required before reporting deployment as verified. The workflow has no Production build or deployment path.

## Evidence and data boundaries

- Keep G0–G7, contract material, and asset provenance records unchanged as historical evidence.
- Store current RC scan output under evidence/RC/<commit>/; Actions also uploads the per-run qualification and deployment records.
- Save real browser screenshots and their viewport/result notes under outputs/upgrade-evidence/, listed in its README.
- Use synthetic records for tests. The canonical data-layer.js owns persisted training, food, and profile records; UI changes must not alter its schema or transaction behavior.
- V1 and V2.1 are separate protected repositories and are not part of this release flow.
