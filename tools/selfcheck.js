/* 训练日记 · 自检总入口：依次跑「功能回归」与「攻击式自检」 */
const { spawnSync } = require('child_process');
const path = require('path');
const NODE = process.execPath;
const files = ['selfcheck-functional.js', 'selfcheck-attack.js', 'data-layer-check.js'];
const projectRoot = path.join(__dirname, '..');

// Generated eval artifacts are ignored by Git. Build them as an explicit,
// deterministic precondition so a fresh clone never depends on local state.
for (const f of ['eval-vision.js', 'eval-simulate.js']) {
  const r = spawnSync(NODE, [path.join(__dirname, f)], {
    cwd: projectRoot,
    encoding: 'utf8'
  });
  if (r.error || r.status !== 0) {
    process.stderr.write((r.stdout || '') + (r.stderr || ''));
    console.error('Failed to generate required eval artifact with ' + f);
    process.exit(1);
  }
}

let bad = 0;
for (const f of files) {
  console.log('----- ' + f + ' -----');
  const r = spawnSync(NODE, [path.join(__dirname, f)], {
    stdio: 'inherit',
    cwd: projectRoot,
    env: process.env
  });
  if (r.error || r.status !== 0) bad++;
}
console.log(bad ? 'RESULT: FAILED' : 'RESULT: ALL PASSED');
process.exit(bad ? 1 : 0);
