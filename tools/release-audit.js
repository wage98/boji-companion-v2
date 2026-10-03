'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const rcDir = path.join(dist, 'rc');
const evidenceDir = path.join(root, 'evidence', 'G7');
const excludedRootDirectories = new Set(['.git', 'node_modules', 'dist']);
const secretPatterns = [
  ['private_key', /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/g],
  ['github_token', /\b(?:ghp|github_pat|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g],
  ['openai_token', /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}\b/g],
  ['aws_access_key', /\bAKIA[0-9A-Z]{16}\b/g],
  ['slack_token', /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g],
  ['google_api_key', /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ['bearer_token', /\bBearer\s+[A-Za-z0-9._~+/-]{24,}={0,2}\b/gi],
  ['long_secret_assignment', /(?:api[_-]?key|access[_-]?token|secret|password)\s*[:=]\s*['"`]([A-Za-z0-9/+_=-]{24,})['"`]/gi]
];
const forbiddenAssetNames = [
  { id: 'known_nahida_card', pattern: /^nahida-card\.webp$/i },
  { id: 'known_nahida_icon', pattern: /^nahida-icon\.webp$/i },
  { id: 'derivative_spider_branding_name', pattern: /spider[-_ ]?(?:hero|man)/i }
];

function rel(file) { return path.relative(root, file).split(path.sep).join('/'); }

function walk(dir, files, symlinks, options = {}) {
  if (!fs.existsSync(dir)) return;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      if (options.skipNames && options.skipNames.has(item.name)) continue;
      walk(full, files, symlinks, options);
    } else if (item.isSymbolicLink()) {
      symlinks.push(rel(full));
    } else if (item.isFile()) {
      files.push(full);
    }
  }
}

function sha256(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }

function scanSecrets(files) {
  const findings = [];
  for (const file of files) {
    let buffer;
    try { buffer = fs.readFileSync(file); } catch (_) { continue; }
    if (buffer.includes(0)) continue;
    const source = buffer.toString('utf8');
    for (const [kind, expression] of secretPatterns) {
      expression.lastIndex = 0;
      let match;
      while ((match = expression.exec(source))) {
        const line = source.slice(0, match.index).split('\n').length;
        findings.push({ file: rel(file), line, kind, value: '[REDACTED]' });
        if (match[0].length === 0) expression.lastIndex++;
      }
    }
  }
  return findings;
}

function pngDimensions(file) {
  const bytes = fs.readFileSync(file);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(signature)) return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function writeJson(file, data) {
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function main() {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const sourceFiles = [], sourceSymlinks = [];
  walk(root, sourceFiles, sourceSymlinks, { skipNames: excludedRootDirectories });
  const distFiles = [], distSymlinks = [];
  walk(dist, distFiles, distSymlinks);
  const allScannedFiles = [...sourceFiles, ...distFiles];
  const secretFindings = scanSecrets(allScannedFiles);

  const forbiddenFindings = allScannedFiles.flatMap(file => forbiddenAssetNames
    .filter(rule => rule.pattern.test(path.basename(file)))
    .map(rule => ({ file: rel(file), rule: rule.id })));
  const identities = JSON.parse(fs.readFileSync(path.join(root, 'release-identities.json'), 'utf8'));
  const rc = identities.channels && identities.channels.rc;
  const releaseWorkflowPath = path.join(root, '.github', 'workflows', 'rc-pages.yml');
  const releaseWorkflow = fs.existsSync(releaseWorkflowPath) ? fs.readFileSync(releaseWorkflowPath, 'utf8') : '';
  const workflowChecks = [
    ['manual-dispatch-only', /workflow_dispatch:/.test(releaseWorkflow) && !/^\s{2}(?:push|pull_request):/m.test(releaseWorkflow)],
    ['requires-reviewed-g7', /RC_READY_FOR_REVIEW/.test(releaseWorkflow) && /gate\.json/.test(releaseWorkflow)],
    ['locked-runtime-and-package-manager', /actions\/setup-node@v7/.test(releaseWorkflow) && /node-version: 22\.13\.0/.test(releaseWorkflow) && /pnpm\/action-setup@v6/.test(releaseWorkflow) && /version: 11\.16\.0/.test(releaseWorkflow) && /pnpm install --frozen-lockfile/.test(releaseWorkflow)],
    ['syntax-before-deploy', /pnpm run check:syntax/.test(releaseWorkflow)],
    ['regression-before-deploy', /pnpm test/.test(releaseWorkflow)],
    ['scan-before-deploy', /pnpm run audit:release/.test(releaseWorkflow)],
    ['scan-results-gate', /Require clean release scans/.test(releaseWorkflow) && /secret-scan\.json/.test(releaseWorkflow) && /asset-scan\.json/.test(releaseWorkflow)],
    ['rc-only-build', /node tools\/build-rc\.js/.test(releaseWorkflow) && /path: dist\s/.test(releaseWorkflow)],
    ['deploy-waits-for-qualification', /deploy:\s*\n\s+needs: qualify/.test(releaseWorkflow) && /actions\/deploy-pages@v4/.test(releaseWorkflow)]
  ];
  const workflowFailures = workflowChecks.filter(([, passed]) => !passed).map(([name]) => name);
  const builtManifestPath = path.join(rcDir, 'manifest.json');
  const artifactErrors = [];
  let manifest = null;
  if (!rc || identities.automatedBuildChannel !== 'rc') artifactErrors.push('release identity config is not RC-only');
  if (!fs.existsSync(path.join(rcDir, 'index.html'))) artifactErrors.push('dist/rc/index.html is missing');
  if (!fs.existsSync(builtManifestPath)) artifactErrors.push('dist/rc/manifest.json is missing');
  if (fs.existsSync(path.join(dist, 'prod'))) artifactErrors.push('automated build produced a dist/prod directory');
  if (workflowFailures.length) artifactErrors.push(`RC Pages workflow failed structural checks: ${workflowFailures.join(', ')}`);
  const staticApp = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  if (/mode\s*===?\s*['"]direct['"]|api\.openai\.com|OpenAI 兼容直连/.test(staticApp)) {
    artifactErrors.push('static app contains a provider-direct AI path');
  }
  if (rc && fs.existsSync(builtManifestPath)) {
    manifest = JSON.parse(fs.readFileSync(builtManifestPath, 'utf8'));
    for (const key of ['id', 'start_url', 'scope', 'name', 'short_name']) {
      if (manifest[key] !== rc[key]) artifactErrors.push(`RC manifest ${key} does not match release-identities.json`);
    }
    if (manifest.display !== 'standalone') artifactErrors.push('RC manifest display is not standalone');
    const html = fs.readFileSync(path.join(rcDir, 'index.html'), 'utf8');
    if (!html.includes(`<base href="${rc.path}">`)) artifactErrors.push('RC HTML base path is not set to the RC install path');
    const worker = fs.readFileSync(path.join(rcDir, 'sw.js'), 'utf8');
    if (!worker.includes("const RELEASE_CHANNEL = 'rc';")) artifactErrors.push('RC worker is not explicitly bound to RC');
    for (const icon of manifest.icons || []) {
      const iconPath = path.resolve(rcDir, 'assets', icon.src.replace(/^assets\//, ''));
      if (!iconPath.startsWith(path.resolve(rcDir, 'assets') + path.sep) || !fs.existsSync(iconPath)) {
        artifactErrors.push(`manifest icon is missing or escapes the RC assets directory: ${icon.src}`);
        continue;
      }
      if (icon.sizes === '192x192' || icon.sizes === '512x512') {
        const dimensions = pngDimensions(iconPath);
        const expected = Number(icon.sizes.slice(0, 3));
        if (!dimensions || dimensions.width !== expected || dimensions.height !== expected) {
          artifactErrors.push(`RC icon ${icon.src} does not have the declared ${icon.sizes} PNG signature/dimensions`);
        }
      }
    }
  }

  const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  const head = revision.status === 0 ? revision.stdout.trim() : null;
  const securityReport = {
    schemaVersion: 1,
    head,
    status: secretFindings.length === 0 ? 'PASS' : 'FAIL',
    scanScope: 'Current V2 source, contract, assets, backups if present, all evidence, and all dist files including dist/rc.',
    excluded: ['.git internals', 'node_modules installed dependencies'],
    filesScanned: allScannedFiles.length,
    sourceFilesScanned: sourceFiles.length,
    distFilesScanned: distFiles.length,
    backupFilesFound: allScannedFiles.filter(file => /(?:^|\/)(?:backup|backups)(?:\/|$)|\.(?:bak|backup)$/i.test(rel(file))).length,
    symlinksNotFollowed: [...sourceSymlinks, ...distSymlinks],
    findings: secretFindings
  };
  const assetReport = {
    schemaVersion: 1,
    head,
    status: forbiddenFindings.length === 0 && artifactErrors.length === 0 && sourceSymlinks.length === 0 && distSymlinks.length === 0 ? 'PASS' : 'FAIL',
    scanScope: 'All current V2 files including unreferenced assets, plus every file in dist.',
    sourceFilesScanned: sourceFiles.length,
    releaseFilesScanned: distFiles.length,
    forbiddenNameFindings: forbiddenFindings,
    artifactErrors,
    releaseWorkflowChecks: Object.fromEntries(workflowChecks.map(([name, passed]) => [name, passed ? 'PASS' : 'FAIL'])),
    symlinksNotFollowed: [...sourceSymlinks, ...distSymlinks],
    reviewBoundary: 'Filename checks do not establish copyright or originality. Review the G5 asset provenance record and retain AUTH-004 owner approval as pending.'
  };
  const artifactFiles = [];
  walk(rcDir, artifactFiles, [], {});
  const releaseManifest = {
    schemaVersion: 1,
    head,
    channel: 'rc',
    artifactPath: 'dist/rc',
    artifactFileCount: artifactFiles.length,
    files: artifactFiles.map(file => {
      const bytes = fs.readFileSync(file);
      return { path: rel(file), sizeBytes: bytes.length, sha256: sha256(bytes) };
    }).sort((a, b) => a.path.localeCompare(b.path)),
    manifest: manifest && { id: manifest.id, start_url: manifest.start_url, scope: manifest.scope, name: manifest.name, short_name: manifest.short_name, display: manifest.display },
    deployment: { status: 'NOT_DEPLOYED', url: null, reason: 'The gated workflow is manual and was not executed; no deployment URL was verified in this qualification run.' },
    qr: { status: 'NOT_GENERATED', reason: 'REL-012 requires an actual verified deployment URL.' },
    productionArtifact: { status: fs.existsSync(path.join(dist, 'prod')) ? 'UNEXPECTED' : 'NOT_BUILT' }
  };

  writeJson(path.join(evidenceDir, 'secret-scan.json'), securityReport);
  writeJson(path.join(evidenceDir, 'asset-scan.json'), assetReport);
  writeJson(path.join(evidenceDir, 'release-manifest.json'), releaseManifest);
  console.log(JSON.stringify({
    head,
    secretScan: { status: securityReport.status, files: securityReport.filesScanned, findings: secretFindings.length },
    assetScan: { status: assetReport.status, sourceFiles: sourceFiles.length, releaseFiles: distFiles.length, forbiddenNames: forbiddenFindings.length, artifactErrors: artifactErrors.length },
    releaseArtifact: { path: releaseManifest.artifactPath, files: releaseManifest.artifactFileCount, deployment: releaseManifest.deployment.status, qr: releaseManifest.qr.status }
  }, null, 2));
  if (securityReport.status !== 'PASS' || assetReport.status !== 'PASS') process.exitCode = 1;
}

try { main(); }
catch (error) { console.error(error.stack || error); process.exitCode = 1; }
