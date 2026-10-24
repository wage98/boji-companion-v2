'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

function isWithin(parent, target) {
  const relative = path.relative(parent, target);
  return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
}

async function assertSafeBuildDirectory(root, target, label) {
  if (!isWithin(root, target)) throw new Error(`${label} escapes the repository.`);
  let metadata;
  try { metadata = await fs.lstat(target); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error(`${label} cannot be a symbolic link or non-directory.`);
  }
  const resolved = await fs.realpath(target);
  if (!isWithin(root, resolved) || path.relative(target, resolved) !== '') {
    throw new Error(`${label} resolves outside its safe repository path.`);
  }
}

async function buildRc() {
  const root = await fs.realpath(path.resolve(__dirname, '..'));
  const identities = JSON.parse(await fs.readFile(path.join(root, 'release-identities.json'), 'utf8'));
  const config = identities.channels && identities.channels.rc;
  if (!config || identities.automatedBuildChannel !== 'rc') throw new Error('Release identity contract does not permit an RC build.');
  if (!config.path.startsWith(identities.repositoryPath) || !config.path.endsWith('/')) throw new Error('RC install path is outside the repository Pages path.');

  const distRoot = path.resolve(root, 'dist');
  const output = path.resolve(distRoot, 'rc');
  if (!isWithin(distRoot, output) || output === distRoot) throw new Error('Refusing to write outside the RC build directory.');
  await assertSafeBuildDirectory(root, distRoot, 'Build directory');
  await assertSafeBuildDirectory(root, output, 'RC output directory');
  await fs.rm(output, { recursive: true, force: true });
  await fs.mkdir(output, { recursive: true });
  await assertSafeBuildDirectory(root, distRoot, 'Build directory');
  await assertSafeBuildDirectory(root, output, 'RC output directory');

  for (const name of ['index.html', 'app.js', 'data-layer.js', 'styles.css', 'manifest.json', 'sw.js', 'assets']) {
    const sourcePath = path.join(root, name);
    const outputPath = path.join(output, name);
    if (name === 'index.html' || name === 'app.js') {
      const canonicalText = (await fs.readFile(sourcePath, 'utf8')).replace(/\r\n?/g, '\n');
      await fs.writeFile(outputPath, canonicalText, 'utf8');
    } else {
      await fs.cp(sourcePath, outputPath, { recursive: true });
    }
  }

  const indexPath = path.join(output, 'index.html');
  const index = (await fs.readFile(indexPath, 'utf8')).replace('<base href="./">', `<base href="${config.path}">`);
  if (!index.includes(`<base href="${config.path}">`)) throw new Error('Could not bind the RC base path into index.html.');
  await fs.writeFile(indexPath, index, 'utf8');

  const manifestPath = path.join(output, 'manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  Object.assign(manifest, {
    id: config.id, start_url: config.start_url, scope: config.scope,
    name: config.name, short_name: config.short_name, display: 'standalone'
  });
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  await fs.writeFile(path.join(output, 'release-config.js'),
    `window.BOJI_RELEASE_CONFIG = Object.freeze(${JSON.stringify({
      channel: 'rc', appName: config.name, shortName: config.short_name,
      indexedDbName: config.indexedDbName, cachePrefix: config.cachePrefix, installPath: config.path
    }, null, 2)});\n`, 'utf8');
  const swPath = path.join(output, 'sw.js');
  const sw = await fs.readFile(swPath, 'utf8');
  if (!sw.includes("const RELEASE_CHANNEL = 'rc';")) throw new Error('The automated worker build must remain RC only.');

  console.log(JSON.stringify({ channel: 'rc', path: config.path, output, manifest: path.join(output, 'manifest.json') }, null, 2));
}

buildRc().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
