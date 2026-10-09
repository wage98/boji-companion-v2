'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { JSDOM } = require('jsdom');
const { IDBFactory } = require('fake-indexeddb');

const root = path.join(__dirname, '..');
const identities = JSON.parse(fs.readFileSync(path.join(root, 'release-identities.json'), 'utf8'));
const rc = identities.channels.rc, prod = identities.channels.prod;
assert.notEqual(rc.id, prod.id, 'RC and Production install ids are distinct');
assert.notEqual(rc.start_url, prod.start_url, 'RC and Production launch paths are distinct');
assert.notEqual(rc.scope, prod.scope, 'RC and Production service-worker scopes are distinct');
assert.notEqual(rc.indexedDbName, prod.indexedDbName, 'RC and Production IndexedDB namespaces are distinct');
assert.notEqual(rc.cachePrefix, prod.cachePrefix, 'RC and Production Cache Storage namespaces are distinct');
assert.notEqual(rc.name, prod.name, 'RC and Production install names are distinct');
assert.equal(identities.automatedBuildChannel, 'rc', 'automated release builds are RC only');

const dataSource = fs.readFileSync(path.join(root, 'data-layer.js'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
assert.match(appSource, /let _fsOriginalName\s*=\s*''/, 'food sheet candidate-name state is initialized before the first manual entry');
for (const channel of [rc, prod]) {
  const dom = new JSDOM('', { runScripts: 'outside-only' });
  dom.window.BOJI_RELEASE_CONFIG = {
    channel: channel === prod ? 'prod' : 'rc',
    indexedDbName: channel.indexedDbName,
    cachePrefix: channel.cachePrefix
  };
  dom.window.eval(dataSource);
  assert.equal(dom.window.BojiData.DB_NAME, channel.indexedDbName);
  assert.equal(dom.window.BojiData.RELEASE_CHANNEL, channel === prod ? 'prod' : 'rc');
  dom.window.close();
}

async function checkTwoTabOwnership() {
  const indexedDB = new IDBFactory();
  const tabs = ['tab-a', 'tab-b'].map(() => new JSDOM('', { runScripts: 'outside-only' }));
  for (const dom of tabs) {
    dom.window.indexedDB = indexedDB;
    dom.window.BOJI_RELEASE_CONFIG = { channel: 'rc', indexedDbName: rc.indexedDbName, cachePrefix: rc.cachePrefix };
    dom.window.eval(dataSource);
  }
  const [owner, second] = tabs.map(dom => dom.window.BojiData);
  await owner.open();
  await second.open();
  await owner.seedTrainingCatalog({
    equipmentProfiles: [{ profileId: 'equipment:A', code: 'A', name: 'Bench', equipment: ['dumbbells', 'bench'] }],
    programs: [{ programId: 'program:A', equipmentProfileId: 'equipment:A', goal: 'HYPERTROPHY', name: 'Home strength' }],
    exercises: [{ exerciseId: 'exercise:press', name: 'Dumbbell press', origin: 'BUILT_IN', movementPattern: 'chest_push', targetMuscles: ['chest'], equipmentProfileIds: ['equipment:A'], teaching: { form: 'Controlled press' } }],
    templates: [{ templateId: 'template:A:push', programId: 'program:A', dayKey: 'push', exercises: [{ exerciseId: 'exercise:press', sets: 1, reps: '8-10', restSeconds: 60, movementPattern: 'chest_push', targetMuscles: ['chest'] }] }]
  });
  const workout = await owner.startWorkout({ templateId: 'template:A:push', localDateKey: '2026-10-04', idempotencyKey: 'two-tab', ownerId: 'tab-a' });
  assert.equal((await second.claimWorkoutOwnership(workout.session.sessionId, 'tab-b')).status, 'OWNED_ELSEWHERE');
  assert.equal((await second.completeWorkoutSet(workout.session.sessionId, workout.sets[0].setId, { reps: 8, weightKg: 20 }, 'tab-b')).status, 'NOT_OWNER');
  assert.equal((await second.claimWorkoutOwnership(workout.session.sessionId, 'tab-b', { takeover: true })).status, 'CLAIMED');
  assert.equal((await owner.completeWorkoutSet(workout.session.sessionId, workout.sets[0].setId, { reps: 8, weightKg: 20 }, 'tab-a')).status, 'NOT_OWNER');
  const committed = await second.completeWorkoutSet(workout.session.sessionId, workout.sets[0].setId, { reps: 8, weightKg: 20 }, 'tab-b');
  assert.equal(committed.status, 'COMPLETED');
  tabs.forEach(dom => { dom.window.BojiData.close(); dom.window.close(); });
}

const build = spawnSync(process.execPath, [path.join(__dirname, 'build-rc.js')], { cwd: root, encoding: 'utf8' });
assert.equal(build.status, 0, build.stderr || 'RC build failed');
const out = path.join(root, 'dist', 'rc');
const builtManifest = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8'));
const builtConfig = fs.readFileSync(path.join(out, 'release-config.js'), 'utf8');
const builtHtml = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
assert.equal(builtManifest.id, rc.id);
assert.equal(builtManifest.start_url, rc.start_url);
assert.equal(builtManifest.scope, rc.scope);
assert.equal(builtManifest.name, rc.name);
assert.equal(builtManifest.short_name, rc.short_name);
assert.equal(builtManifest.display, 'standalone');
assert.ok(builtManifest.icons.some(icon => icon.sizes === '192x192'));
assert.ok(builtManifest.icons.some(icon => icon.sizes === '512x512'));
assert.ok(builtHtml.includes(`<base href="${rc.path}">`), 'deep navigation assets resolve against the RC app base');
assert.ok(builtConfig.includes("\"channel\": \"rc\""));
assert.ok(fs.existsSync(path.join(out, 'assets', 'boji', 'icon-192.png')));
assert.ok(fs.existsSync(path.join(out, 'assets', 'boji', 'icon-512.png')));
assert.ok(!fs.existsSync(path.join(root, 'dist', 'prod')), 'automated build does not emit a Production artifact');

const workerSource = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const handlers = {};
const cacheStore = new Map();
const deletedCaches = [];
let skipWaitingCount = 0, claimed = 0, posted = [];
class FakeCache {
  constructor(name) { this.name = name; this.items = new Map(); }
  async addAll(requests) { requests.forEach(request => this.items.set(request.url, new Response(`cached:${request.url}`))); }
  async match(request) { return this.items.get(typeof request === 'string' ? request : request.url) || null; }
  async put(request, response) { this.items.set(typeof request === 'string' ? request : request.url, response); }
}
const caches = {
  async open(name) { if (!cacheStore.has(name)) cacheStore.set(name, new FakeCache(name)); return cacheStore.get(name); },
  async keys() { return Array.from(cacheStore.keys()); },
  async delete(name) { deletedCaches.push(name); return cacheStore.delete(name); }
};
const client = { postMessage(message) { posted.push(message); } };
const self = {
  location: { origin: 'https://example.test' },
  registration: { scope: 'https://example.test/boji-companion-v2/rc/', active: {} },
  clients: { async matchAll() { return [client]; }, async claim() { claimed++; } },
  addEventListener(type, handler) { handlers[type] = handler; },
  async skipWaiting() { skipWaitingCount++; }
};
const context = vm.createContext({ self, caches, URL, Request, Response, Promise,
  fetch: async request => new Response(`network:${request.url}`, { status: 200 }) });
vm.runInContext(workerSource, context, { filename: 'sw.js' });

async function dispatchLifecycle(name, extras) {
  const waits = [];
  const event = Object.assign({ waitUntil(promise) { waits.push(Promise.resolve(promise)); } }, extras || {});
  handlers[name](event);
  await Promise.all(waits);
  return event;
}

(async () => {
  await checkTwoTabOwnership();
  await dispatchLifecycle('install');
  assert.equal(skipWaitingCount, 0, 'worker install does not force activation');
  assert.ok(posted.some(message => message.type === 'BOJI_UPDATE_READY'), 'waiting update notifies clients');
  const ownCache = cacheStore.get('boji-v2-rc-9');
  assert.ok(ownCache && ownCache.items.has('https://example.test/boji-companion-v2/rc/index.html'));
  for (const state of ['neutral', 'encourage', 'think', 'walk', 'sit', 'happy', 'sleep', 'wave']) {
    assert.ok(ownCache.items.has(`https://example.test/boji-companion-v2/rc/assets/boji/chibi-states/${state}.png`), `offline cache contains the ${state} Chibi state`);
  }
  await caches.open('boji-v2-rc-4');
  await caches.open('boji-v2-rc-5');
  await caches.open('boji-v2-prod-9');
  await caches.open('user-offline-cache');
  await dispatchLifecycle('activate');
  assert.deepEqual(deletedCaches, ['boji-v2-rc-4', 'boji-v2-rc-5'], 'activation deletes only obsolete RC-owned caches');
  assert.ok(cacheStore.has('boji-v2-prod-9'));
  assert.ok(cacheStore.has('user-offline-cache'));
  assert.equal(claimed, 1);

  let responsePromise, waited = [];
  const nav = { method: 'GET', url: 'https://example.test/boji-companion-v2/rc/training/today', mode: 'navigate',
    headers: { get: name => name === 'accept' ? 'text/html' : null } };
  handlers.fetch({ request: nav, waitUntil(promise) { waited.push(Promise.resolve(promise)); }, respondWith(promise) { responsePromise = promise; } });
  const response = await responsePromise;
  assert.match(await response.text(), /cached:https:\/\/example\.test\/boji-companion-v2\/rc\/index\.html/, 'deep offline navigation falls back to the app shell');
  await Promise.all(waited);

  let crossOriginIntercepted = false;
  handlers.fetch({ request: { method: 'GET', url: 'https://cdn.example/asset.js', mode: 'no-cors', headers: { get: () => '' } },
    waitUntil() {}, respondWith() { crossOriginIntercepted = true; } });
  assert.equal(crossOriginIntercepted, false, 'worker leaves cross-origin resources unmanaged');
  console.log('PLATFORM RESULT: release namespaces, two-tab ownership, RC base path, update lifecycle, cache ownership and offline fallback passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
