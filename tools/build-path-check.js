'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const project = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'boji-build-path-'));
const linkType = process.platform === 'win32' ? 'junction' : 'dir';
try {
  for (const targetName of ['dist-link', 'rc-link']) {
    const repo = path.join(temp, targetName, 'repo');
    const outside = path.join(temp, targetName, 'outside');
    const tools = path.join(repo, 'tools');
    fs.mkdirSync(tools, { recursive: true });
    fs.mkdirSync(outside, { recursive: true });
    fs.copyFileSync(path.join(project, 'tools', 'build-rc.js'), path.join(tools, 'build-rc.js'));
    fs.copyFileSync(path.join(project, 'release-identities.json'), path.join(repo, 'release-identities.json'));
    fs.writeFileSync(path.join(outside, 'sentinel.txt'), 'keep this data\n');

    const dist = path.join(repo, 'dist');
    const rc = path.join(dist, 'rc');
    if (targetName === 'dist-link') fs.symlinkSync(outside, dist, linkType);
    else {
      fs.mkdirSync(dist, { recursive: true });
      fs.symlinkSync(outside, rc, linkType);
    }

    const result = spawnSync(process.execPath, [path.join(tools, 'build-rc.js')], { cwd: repo, encoding: 'utf8', timeout: 5000 });
    assert.equal(result.error, undefined, `${targetName}: build process should start`);
    assert.notEqual(result.status, 0, `${targetName}: build must reject linked output paths`);
    assert.match((result.stdout || '') + (result.stderr || ''), /symbolic link or non-directory|resolves outside/, `${targetName}: expected refusal reason`);
    assert.equal(fs.readFileSync(path.join(outside, 'sentinel.txt'), 'utf8'), 'keep this data\n', `${targetName}: external data must remain unchanged`);
  }
  console.log('BUILD PATH RESULT: linked dist and dist/rc are rejected; external sentinel data is unchanged');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
