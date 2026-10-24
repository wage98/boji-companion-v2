'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { readFileWithinRoot, resolveWithin, writeFileWithinRoot } = require('./evidence-path');

const root = fs.realpathSync(path.resolve(__dirname, '..'));
const sha = process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
if (!/^[a-f0-9]{40}$/i.test(sha)) throw new Error('A full RC candidate SHA is required.');
const output = resolveWithin(root, 'evidence/RC', path.join('evidence', 'RC', sha));

const qualificationPath = path.join(output, 'qualification.json');
const qualification = JSON.parse(readFileWithinRoot(root, qualificationPath));
if (qualification.status !== 'PASS' || qualification.candidate.commit !== sha) throw new Error('The deployed candidate has no matching passing qualification.');
const pagesBaseUrl = process.env.BOJI_PAGES_URL;
if (!pagesBaseUrl) throw new Error('GitHub Pages did not return a deployment URL.');

const identities = JSON.parse(fs.readFileSync(path.join(root, 'release-identities.json'), 'utf8'));
const config = identities.channels && identities.channels.rc;
if (!config || identities.automatedBuildChannel !== 'rc') throw new Error('Release identity does not permit RC publication.');
const pagesBase = new URL(pagesBaseUrl);
if (pagesBase.protocol !== 'https:' || pagesBase.hostname !== 'wage98.github.io') throw new Error('Pages deployment URL does not match the V2 GitHub Pages host.');
const rcUrl = new URL(config.path, pagesBase.origin).href;
const runUrl = process.env.GITHUB_RUN_ID && process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY
  ? process.env.GITHUB_SERVER_URL + '/' + process.env.GITHUB_REPOSITORY + '/actions/runs/' + process.env.GITHUB_RUN_ID : null;
const record = {
  schemaVersion: 1,
  status: 'DEPLOYED',
  candidateCommit: sha,
  branch: qualification.candidate.branch,
  pagesBaseUrl: pagesBase.href,
  rcUrl,
  runId: process.env.GITHUB_RUN_ID || null,
  runUrl,
  deployedAt: new Date().toISOString()
};
writeFileWithinRoot(root, path.join(output, 'deployment.json'), JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify(record, null, 2));
