'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { ensureDirectoryWithinRoot, readFileWithinRoot, resolveWithin, writeFileWithinRoot } = require('./evidence-path');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'boji-evidence-path-'));
const root = path.join(temp, 'repo');
const outside = path.join(temp, 'outside');
const sha = 'a'.repeat(40);
try {
  fs.mkdirSync(path.join(root, 'evidence', 'RC'), { recursive: true });
  fs.mkdirSync(outside, { recursive: true });
  fs.writeFileSync(path.join(outside, 'sentinel.json'), '{"kept":true}\n');
  assert.throws(() => resolveWithin(root, 'evidence/RC', '../outside/report.json'), /outside its allowed directory/);
  const checks = ['repository containment', 'outside-path rejection', 'directory symlink rejection'];

  const safe = resolveWithin(root, 'evidence/RC', `evidence/RC/${sha}`);
  ensureDirectoryWithinRoot(root, safe);
  const safeFile = path.join(safe, 'qualification.json');
  writeFileWithinRoot(root, safeFile, '{"status":"PASS"}\n');
  assert.equal(JSON.parse(readFileWithinRoot(root, safeFile)).status, 'PASS');

  const directoryLink = path.join(root, 'evidence', 'RC', 'outside-link');
  fs.symlinkSync(outside, directoryLink, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => resolveWithin(root, 'evidence/RC', 'evidence/RC/outside-link/report.json'), /symbolic links/);

  const fileLink = path.join(safe, 'external.json');
  let fileLinkCreated = false;
  try {
    fs.symlinkSync(path.join(outside, 'sentinel.json'), fileLink, 'file');
    fileLinkCreated = true;
  } catch (error) {
    if (!['EPERM', 'EACCES'].includes(error.code)) throw error;
    console.log('FILE SYMLINK CASE: unavailable under current Windows account permissions');
  }
  if (fileLinkCreated) {
    assert.throws(() => writeFileWithinRoot(root, fileLink, '{"changed":true}\n'), /symbolic links/);
    checks.push('file symlink rejection');
  }
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(outside, 'sentinel.json'), 'utf8')), { kept: true });
  console.log('EVIDENCE PATH RESULT: ' + checks.join(', ') + ' passed');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
