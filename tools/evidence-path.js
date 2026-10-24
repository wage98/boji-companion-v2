'use strict';

const fs = require('node:fs');
const path = require('node:path');

function isWithin(parent, target) {
  const relative = path.relative(parent, target);
  return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
}

function assertNoSymlinkTraversal(root, target) {
  const realRoot = fs.realpathSync(root);
  const absolute = path.resolve(target);
  if (!isWithin(realRoot, absolute)) throw new Error('Evidence path escapes the repository root.');
  const relative = path.relative(realRoot, absolute);
  let current = realRoot;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    let stat;
    try { stat = fs.lstatSync(current); }
    catch (error) { if (error.code === 'ENOENT') return absolute; throw error; }
    if (stat.isSymbolicLink()) throw new Error('Evidence paths cannot traverse symbolic links.');
    if (current !== absolute && !stat.isDirectory()) throw new Error('Evidence path parent is not a directory.');
    if (!isWithin(realRoot, fs.realpathSync(current))) throw new Error('Evidence path resolves outside the repository root.');
  }
  return absolute;
}

function resolveWithin(root, allowedRelativeRoot, requestedPath) {
  const realRoot = fs.realpathSync(root);
  const allowedRoot = path.resolve(realRoot, allowedRelativeRoot);
  const target = path.resolve(realRoot, requestedPath);
  if (!isWithin(realRoot, allowedRoot) || !isWithin(allowedRoot, target) || target === allowedRoot) {
    throw new Error('Evidence path is outside its allowed directory.');
  }
  assertNoSymlinkTraversal(realRoot, allowedRoot);
  return assertNoSymlinkTraversal(realRoot, target);
}

function ensureDirectoryWithinRoot(root, target) {
  assertNoSymlinkTraversal(root, target);
  fs.mkdirSync(target, { recursive: true });
  assertNoSymlinkTraversal(root, target);
  if (!fs.lstatSync(target).isDirectory()) throw new Error('Evidence output is not a directory.');
}

function readFileWithinRoot(root, target) {
  assertNoSymlinkTraversal(root, target);
  const stat = fs.lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Evidence input must be a regular file.');
  return fs.readFileSync(target, 'utf8');
}

function writeFileWithinRoot(root, target, content) {
  assertNoSymlinkTraversal(root, target);
  try {
    const stat = fs.lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Evidence output must be a regular file.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  fs.writeFileSync(target, content, 'utf8');
  assertNoSymlinkTraversal(root, target);
}

module.exports = { assertNoSymlinkTraversal, ensureDirectoryWithinRoot, readFileWithinRoot, resolveWithin, writeFileWithinRoot };
