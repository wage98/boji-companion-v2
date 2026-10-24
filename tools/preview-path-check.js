'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'boji-preview-path-'));
const repo = path.join(temp, 'repo');
const script = path.join(repo, 'tools', 'preview-rc.py');
const python = process.platform === 'win32' ? 'python' : 'python3';
try {
  fs.mkdirSync(path.dirname(script), { recursive: true });
  fs.mkdirSync(path.join(repo, 'dist', 'inside'), { recursive: true });
  fs.mkdirSync(path.join(temp, 'outside'), { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'preview-rc.py'), script);

  for (const [name, target, expected] of [
    ['internal-junction', path.join(repo, 'dist', 'inside'), /symbolic links or junctions/],
    ['external-junction', path.join(temp, 'outside'), /symbolic links or junctions/]
  ]) {
    const link = path.join(repo, 'dist', 'rc');
    fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
    const result = spawnSync(python, [script, '--port', '0'], { cwd: repo, encoding: 'utf8', timeout: 5000 });
    assert.equal(result.error, undefined, `${name}: Python preview process should start`);
    assert.notEqual(result.status, 0, `${name}: preview must refuse linked build root`);
    assert.match((result.stdout || '') + (result.stderr || ''), expected, `${name}: expected refusal reason`);
    fs.rmSync(link, { recursive: true, force: true });
  }

  console.log('PREVIEW PATH RESULT: internal and external directory links rejected before serving');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
