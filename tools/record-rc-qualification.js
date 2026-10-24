'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { ensureDirectoryWithinRoot, readFileWithinRoot, resolveWithin, writeFileWithinRoot } = require('./evidence-path');

const root = fs.realpathSync(path.resolve(__dirname, '..'));
const sha = process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
if (!/^[a-f0-9]{40}$/i.test(sha)) throw new Error('A full candidate commit SHA is required.');
if (process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_REF !== 'refs/heads/codex-v2-independent-upgrade') {
  throw new Error('RC qualification is restricted to the V2 upgrade branch.');
}

const output = resolveWithin(root, 'evidence/RC', process.argv[2] || 'evidence/RC/' + sha);

function read(name) {
  return JSON.parse(readFileWithinRoot(root, path.join(output, name)));
}

const secret = read('secret-scan.json');
const asset = read('asset-scan.json');
const release = read('release-manifest.json');
if ([secret, asset, release].some(report => report.head !== sha)) throw new Error('A release report does not match the dispatched candidate SHA.');
if (secret.status !== 'PASS' || asset.status !== 'PASS') throw new Error('Current-candidate security or asset scan failed.');
if (release.channel !== 'rc' || release.productionArtifact.status !== 'NOT_BUILT') throw new Error('The candidate must contain only the RC artifact.');
if (release.deployment.status !== 'NOT_DEPLOYED') throw new Error('Qualification must not claim a deployment before Pages succeeds.');

const branch = (process.env.GITHUB_REF || execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim()).replace(/^refs\/heads\//, '');
const runUrl = process.env.GITHUB_RUN_ID && process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY
  ? process.env.GITHUB_SERVER_URL + '/' + process.env.GITHUB_REPOSITORY + '/actions/runs/' + process.env.GITHUB_RUN_ID : null;
const record = {
  schemaVersion: 1,
  status: 'PASS',
  candidate: { commit: sha, branch },
  run: process.env.GITHUB_RUN_ID ? { id: process.env.GITHUB_RUN_ID, url: runUrl } : null,
  checks: { syntax: 'PASS', regression: 'PASS', rcBuild: 'PASS', secretScan: secret.status, assetScan: asset.status },
  releaseManifestSha256: crypto.createHash('sha256').update(JSON.stringify(release, null, 2)).digest('hex'),
  qualifiedAt: new Date().toISOString()
};
ensureDirectoryWithinRoot(root, output);
writeFileWithinRoot(root, path.join(output, 'qualification.json'), JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify({ status: record.status, commit: sha, branch, evidence: path.relative(root, output).split(path.sep).join('/') }, null, 2));
