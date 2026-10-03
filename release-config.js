// Build-time release identity. tools/build-rc.js is the only automated
// artifact builder and writes RC configuration into its isolated output path.
window.BOJI_RELEASE_CONFIG = Object.freeze({
  channel: 'rc',
  appName: 'Boji Companion V2 RC',
  shortName: 'Boji RC',
  indexedDbName: 'boji-companion-v2-rc',
  cachePrefix: 'boji-v2-rc-',
  installPath: './'
});
