'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { IDBFactory } = require('fake-indexeddb');
const { JSDOM } = require('jsdom');

let Data;
let passed = 0;
let failed = 0;
function check(name, fn) {
  return Promise.resolve().then(fn).then(() => { passed += 1; console.log(`PASS ${name}`); }, error => {
    failed += 1; console.error(`FAIL ${name}: ${error && error.stack ? error.stack : error}`);
  });
}
function freshStore() {
  global.indexedDB = new IDBFactory();
  delete require.cache[require.resolve('../data-layer.js')];
  Data = require('../data-layer.js');
  return Data;
}
const legacyFixture = () => ({
  profile: { name: 'Trainer', height: 172, weight: 70, dumbbell: 18 },
  isFirstLaunch: false,
  planSet: 'A',
  checkins: { '2026-10-01': { ex: { 0: true, 2: true }, at: 1790800000000 } },
  meals: { '2026-10-01': { 1: [{ n: 'Chicken', p: 30, c: 0, f: 4, q: 1, photo: null }] } },
  myEx: [{ id: 17, name: 'Band row', part: 'back', sets: 3, reps: '10-12' }],
  bodyWeights: [{ d: '2026-09-20', w: 69.5 }],
  runs: [{ date: '2026-10-01', dist: 1200, ms: 600000, kcal: 92, pts: [[31.2, 121.4], [31.21, 121.41]] }],
  settings: { petPhoto: 'data:image/png;base64,aGVsbG8=' },
  vision: { mode: 'off', token: 'v1-secret-must-not-export' }
});

async function main() {
  freshStore();
  await check('RC namespace and explicit version dimensions', async () => {
    assert.equal(Data.DB_NAME, 'boji-companion-v2-rc');
    for (const key of ['PRODUCT_VERSION','SCHEMA_VERSION','APP_CACHE_VERSION','FEATURE_MANIFEST_VERSION','EXERCISE_DATA_VERSION','KNOWLEDGE_VERSION']) assert.ok(Object.hasOwn(Data.VERSION, key));
    assert.equal(Data.localDateKey(new Date(2026, 9, 3, 23, 59)), '2026-10-03');
    assert.equal(typeof Data.timezoneContext(Date.now()).timezoneOffsetMinutes, 'number');
  });

  await check('legacy reader only calls getItem and never changes V1 storage', async () => {
    const calls = [];
    const storage = { getItem(key) { calls.push(['get', key]); return JSON.stringify({}); }, setItem() { calls.push(['set']); }, removeItem() { calls.push(['remove']); } };
    assert.equal(Data.readLegacySnapshot(storage).ok, true);
    assert.deepEqual(calls, [['get', 'boji_v7']]);
  });
  await check('missing, malformed and non-object V1 payloads are safely rejected', async () => {
    assert.equal(Data.parseLegacyValue(null).code, 'NOT_FOUND');
    assert.equal(Data.parseLegacyValue('{bad').code, 'CORRUPT_JSON');
    assert.equal(Data.parseLegacyValue('[]').code, 'INVALID_ROOT');
    assert.equal(Data.preflightLegacy({ meals: 'bad' }).ok, false);
  });
  await check('migration requires an explicit confirmation', async () => {
    await assert.rejects(Data.migrateLegacy({}, { confirmed: false }), /explicit user confirmation/);
    assert.equal((await Data.counts()).migrations, 0);
  });

  freshStore();
  const source = legacyFixture();
  await check('legacy preflight reports ambiguity and food-provenance quarantine', async () => {
    const result = Data.preflightLegacy(source);
    assert.equal(result.ok, true);
    assert.equal(result.summary.legacyActionIndexes, 1);
    assert.equal(result.summary.mealEntries, 1);
    assert.ok(result.quarantine.some(row => row.type === 'training-checkins'));
    assert.ok(result.quarantine.some(row => row.type === 'meals'));
  });
  await check('transactional migration preserves archive and creates stable canonical records', async () => {
    const result = await Data.migrateLegacy(source, { confirmed: true });
    assert.equal(result.status, 'IMPORTED');
    const db = await Data.open();
    const profile = await new Promise((resolve, reject) => { const r = db.transaction('profiles').objectStore('profiles').get('profile-primary'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    assert.equal(profile.weightKg, 70);
    assert.equal(profile.heightMeters, 1.72);
    const weight = await new Promise((resolve, reject) => { const r = db.transaction('bodyWeights').objectStore('bodyWeights').get('body-weight:2026-09-20'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    assert.equal(weight.weightKg, 69.5);
    assert.equal(weight.measuredAt, null, 'date-only input must not invent an exact time');
    const runRows = await new Promise((resolve, reject) => { const r = db.transaction('runs').objectStore('runs').getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    assert.equal(runRows[0].distanceMeters, 1200);
    assert.equal(runRows[0].durationSeconds, 600);
    assert.equal(runRows[0].startedAt, null, 'date-only input must not invent a start time');
    assert.equal((await Data.counts()).mealRecords, 0, 'unverified legacy food is not committed as a meal fact');
    assert.equal((await Data.counts()).sessions, 0, 'ambiguous numeric check-ins are not guessed into sessions');
    assert.equal((await Data.counts()).quarantine > 0, true);
    assert.equal((await Data.counts()).legacyArchives, 1);
    const archiveCount = await new Promise((resolve, reject) => { const r = db.transaction('legacyArchives').objectStore('legacyArchives').getAll(); r.onsuccess = () => resolve(r.result.length); r.onerror = () => reject(r.error); });
    assert.equal(archiveCount, 1);
    assert.equal(source.vision.token, 'v1-secret-must-not-export', 'migration did not mutate its source object');
    const assetRows = await new Promise((resolve, reject) => { const r = db.transaction('mediaAssets').objectStore('mediaAssets').getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    assert.equal(assetRows.length, 1);
    const state = await Data.loadState();
    assert.equal(state.settings.petPhoto, 'data:image/png;base64,aGVsbG8=');
  });
  await check('duplicate and already-migrated imports are idempotent', async () => {
    const before = await Data.counts();
    const again = await Data.migrateLegacy(source, { confirmed: true });
    assert.equal(again.status, 'ALREADY_IMPORTED');
    assert.deepEqual(await Data.counts(), before);
    assert.ok(await Data.hasCompletedMigration());
  });
  await check('V1 import cannot overwrite existing V2 user data', async () => {
    freshStore();
    await Data.saveState({ profile: { weight: 80 }, checkins: {} });
    const before = await Data.counts();
    const result = await Data.migrateLegacy(legacyFixture(), { confirmed: true });
    assert.equal(result.status, 'BLOCKED_CONFLICT');
    assert.deepEqual(await Data.counts(), before);
    assert.equal((await Data.loadState()).profile.weight, 80);
  });
  await check('product knowledge registry does not block explicit V1 user-data import', async () => {
    freshStore();
    await Data.seedKnowledgeRegistry([{ question: 'legacy claim', text: 'Unverified claim text', scope: 'training' }]);
    const result = await Data.migrateLegacy(legacyFixture(), { confirmed: true });
    assert.equal(result.status, 'IMPORTED');
    assert.equal((await Data.counts()).knowledgeClaims, 1);
    assert.equal((await Data.counts()).profiles, 1);
  });
  await check('legacy knowledge registry keeps unsupported evidence labels visibly unverified', async () => {
    freshStore();
    await Data.seedKnowledgeRegistry([{ question: 'unsupported', text: 'Claim text' }]);
    const db = await Data.open();
    const claims = await new Promise((resolve, reject) => {
      const request = db.transaction('knowledgeClaims').objectStore('knowledgeClaims').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    assert.equal(claims.length, 1);
    assert.equal(claims[0].question, 'unsupported');
    assert.deepEqual(claims[0].sourceIds, []);
    assert.equal(claims[0].reviewStatus, 'NEEDS_REVIEW');
    assert.equal(claims[0].evidenceLabel, 'UNVERIFIED');
    assert.equal(claims[0].evidenceType, 'UNVERIFIED_LEGACY');
  });
  await check('missing optional legacy fields migrate without fabricated records', async () => {
    freshStore();
    const result = await Data.migrateLegacy({}, { confirmed: true });
    assert.equal(result.status, 'IMPORTED');
    const counts = await Data.counts();
    assert.equal(counts.profiles, 0);
    assert.equal(counts.bodyWeights, 0);
    assert.equal(counts.runs, 0);
  });
  await check('legacy calendar keys normalize through localDateKey and collisions are quarantined', async () => {
    freshStore();
    const result = await Data.migrateLegacy({ checkins: { '2026-1-2': { ex: {}, at: 1 } }, weights: { '2026-1-2': { 0: 12 } } }, { confirmed: true });
    assert.equal(result.status, 'IMPORTED');
    const projection = await Data.loadState();
    assert.ok(projection.checkins['2026-01-02']);
    freshStore();
    await Data.migrateLegacy({ checkins: { '2026-1-2': { a: 1 }, '2026-01-02': { a: 2 } } }, { confirmed: true });
    const collisionProjection = await Data.loadState();
    assert.equal(collisionProjection.checkins['2026-01-02'], undefined, 'neither colliding value is silently selected');
    const db = await Data.open();
    const quarantine = await new Promise((resolve, reject) => { const r = db.transaction('quarantine').objectStore('quarantine').getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    assert.ok(quarantine.some(row => row.type === 'date-key-collision'));
  });
  await check('duplicate custom exercise identities are quarantined rather than guessed', async () => {
    freshStore();
    const sourceData = { myEx: [{ name: 'Band Row' }, { name: ' band row ' }] };
    const preview = Data.preflightLegacy(sourceData);
    assert.ok(preview.quarantine.some(row => row.type === 'custom-exercise'));
    await Data.migrateLegacy(sourceData, { confirmed: true });
    assert.equal((await Data.counts()).exercises, 1);
    assert.ok((await Data.counts()).quarantine > 0);
  });
  await check('large legacy history remains bounded and migrates by record', async () => {
    freshStore();
    const history = { bodyWeights: [] };
    for (let i = 0; i < 1200; i += 1) {
      const d = new Date(2000, 0, 1 + i);
      const date = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      history.bodyWeights.push({ d: date, w: 60 + (i % 20) / 10 });
    }
    const result = await Data.migrateLegacy(history, { confirmed: true });
    assert.equal(result.status, 'IMPORTED');
    assert.equal((await Data.counts()).bodyWeights, 1200);
  });
  await check('corrupted fields are quarantined or block before any write', async () => {
    freshStore();
    const result = Data.preflightLegacy({ weights: 'corrupt' });
    assert.equal(result.ok, false);
    await assert.rejects(Data.migrateLegacy({ weights: 'corrupt' }, { confirmed: true }));
    assert.equal((await Data.counts()).migrations, 0);
    const partial = await Data.migrateLegacy({ runs: [{ date: 'x', dist: 'bad', ms: 3 }] }, { confirmed: true });
    assert.equal(partial.status, 'IMPORTED');
    assert.equal((await Data.counts()).runs, 0);
    assert.ok((await Data.counts()).quarantine > 0);
  });
  await check('interrupted migration aborts all domain records and commit markers', async () => {
    freshStore();
    await assert.rejects(Data.migrateLegacy(legacyFixture(), { confirmed: true, faultAt: 'before-commit-marker' }));
    const counts = await Data.counts();
    for (const name of ['appState','profiles','exercises','bodyWeights','runs','quarantine','migrations','legacyArchives','mediaAssets']) assert.equal(counts[name], 0, `${name} rolled back`);
  });

  freshStore();
  await check('FoodDraft keeps field provenance and cannot commit before user confirmation', async () => {
    const draft = await Data.createFoodDraft({ source: 'PHOTO_AI', items: [{
      name: 'Rice', identityConfidence: 'MEDIUM', quantity: 150, unit: 'g', portionEvidence: 'USER_MEASURED',
      provenance: { name: 'AI_ESTIMATED', quantity: 'USER_PROVIDED', protein: 'DATABASE', energyKcal: 'DATABASE' },
      nutrients: { protein: { value: 4, unit: 'g' }, energyKcal: { value: 195, unit: 'kcal' } }
    }] });
    assert.equal((await Data.counts()).mealRecords, 0);
    await assert.rejects(Data.confirmFoodDraft(draft.draftId, { confirmed: false }), /explicit user confirmation/);
    const meal = await Data.confirmFoodDraft(draft.draftId, { confirmed: true });
    assert.equal(meal.items[0].quantity, 150);
    assert.equal(meal.items[0].provenance.quantity, 'USER_PROVIDED');
    assert.equal(meal.items[0].nutrients.protein.value, 4);
    assert.equal(meal.items[0].nutrients.energyKcal.value, 195);
    assert.equal(meal.confirmation.confirmedByUser, true);
    assert.equal((await Data.counts()).mealRecords, 1);
  });
  await check('FoodDraft rejects missing provenance and rejects a second commit', async () => {
    await assert.rejects(Data.createFoodDraft({ items: [{ name: 'Guess', quantity: 10, nutrients: { energyKcal: { value: 40, unit: 'kcal' } }, provenance: { name: 'AI_ESTIMATED' } }] }), /portion needs its own provenance/);
    const draft = await Data.createFoodDraft({ items: [{ name: 'Manual', provenance: { name: 'USER_PROVIDED' } }] });
    await Data.confirmFoodDraft(draft.draftId, { confirmed: true });
    await assert.rejects(Data.confirmFoodDraft(draft.draftId, { confirmed: true }), /missing or already committed/);
  });
  await check('calories-only drafts keep macros absent instead of deriving fake values', async () => {
    const draft = await Data.createFoodDraft({ items: [{ name: 'Estimate', provenance: { name: 'AI_ESTIMATED', energyKcal: 'AI_ESTIMATED' }, nutrients: { energyKcal: { value: 240, unit: 'kcal' } } }] });
    const meal = await Data.confirmFoodDraft(draft.draftId, { confirmed: true });
    assert.equal(meal.items[0].nutrients.protein, undefined);
    assert.equal(meal.items[0].nutrients.carbohydrate, undefined);
    assert.equal(meal.items[0].nutrients.fat, undefined);
  });
  await check('latest-result owner discards stale request and supports cancellation', async () => {
    const owner = Data.createRequestOwner('food-search');
    const older = owner.begin();
    const newest = owner.begin();
    assert.equal(older.signal.aborted, true);
    assert.equal(owner.isCurrent(older, 'food-search'), false);
    assert.equal(owner.isCurrent(newest, 'food-search'), true);
    assert.equal(owner.isCurrent(newest, 'another-view'), false);
    owner.cancel();
    assert.equal(owner.isCurrent(newest, 'food-search'), false);
  });
  await check('knowledge claims cannot use unsupported formal evidence labels', async () => {
    const source = await Data.putKnowledgeSource({ sourceId: 'src-demo', title: 'Demo source', url: 'https://example.com', reviewStatus: 'VERIFIED', verifiedAt: 1 });
    assert.equal(source.reviewStatus, 'UNVERIFIED');
    const claim = await Data.putKnowledgeClaim({ claimId: 'claim-demo', text: 'A claim', sourceIds: ['src-demo'], evidenceLabel: 'A' });
    assert.equal(claim.evidenceLabel, 'UNVERIFIED');
    assert.equal(claim.reviewStatus, 'NEEDS_REVIEW');
  });

  freshStore();
  await check('quota and transaction failures roll back the prior app state', async () => {
    await Data.saveState({ profile: { weight: 72 }, checkins: {} });
    await assert.rejects(Data.saveState({ profile: { weight: 98 }, checkins: {} }, { testFault: 'quota' }), error => error && error.name === 'QuotaExceededError');
    assert.equal((await Data.loadState()).profile.weight, 72);
    await assert.rejects(Data.saveState({ profile: { weight: 99 }, checkins: {} }, { testFault: 'transaction' }), /Injected storage transaction failure/);
    assert.equal((await Data.loadState()).profile.weight, 72);
  });
  await check('backup excludes secrets and persists user media separately from app state', async () => {
    await Data.saveState({ profile: { weight: 70 }, vision: { token: 'private-key', endpoint: 'https://example.invalid' }, settings: { petPhoto: 'data:image/png;base64,aGVsbG8=' } });
    const raw = await Data.exportBackup();
    assert.equal(raw.json.includes('private-key'), false);
    const backup = JSON.parse(raw.json);
    const state = backup.records.appState[0].payload;
    assert.equal(state.vision.token, undefined);
    assert.equal(typeof state.settings.petPhoto.mediaAssetId, 'string');
    assert.equal(state.settings.petPhoto.dataUrl, undefined);
    assert.equal((await Data.counts()).mediaAssets, 1);
  });
  await check('restore preflight rejects malformed records, duplicates and incompatible dimensions', async () => {
    const valid = (await Data.exportBackup()).backup;
    const duplicate = JSON.parse(JSON.stringify(valid));
    duplicate.records.runs = [{ runId: 'same' }, { runId: 'same' }];
    assert.equal(Data.validateBackup(duplicate).ok, false);
    const incompatible = JSON.parse(JSON.stringify(valid));
    incompatible.versions.SCHEMA_VERSION += 1;
    assert.equal(Data.validateBackup(incompatible).code, 'INCOMPATIBLE_SCHEMA');
    const withSecret = JSON.parse(JSON.stringify(valid));
    withSecret.records.appState[0].payload.token = 'no-export';
    assert.equal(Data.validateBackup(withSecret).code, 'SECRET_FIELD');
    assert.equal(Data.validateBackup(JSON.stringify(valid), { maxBytes: 10 }).code, 'TOO_LARGE');
    const orphan = JSON.parse(JSON.stringify(valid));
    orphan.records.exerciseSessions = [{ exerciseSessionId: 'ex-1', sessionId: 'missing' }];
    assert.equal(Data.validateBackup(orphan).ok, false);
    const orphanMedia = JSON.parse(JSON.stringify(valid));
    orphanMedia.records.appState[0].payload.settings.petPhoto.mediaAssetId = 'media-missing';
    assert.equal(Data.validateBackup(orphanMedia).ok, false, 'app state cannot reference a media asset absent from the backup');
  });
  await check('restore snapshots current data and rolls back a mid-transaction failure', async () => {
    const backup = (await Data.exportBackup()).json;
    await Data.saveState({ profile: { weight: 81 }, vision: { token: 'local-only' } });
    const before = await Data.loadState();
    const beforeSnapshots = (await Data.counts()).snapshots;
    await assert.rejects(Data.restoreBackup(backup, { confirmed: true, faultAt: 'mid-restore' }));
    const afterFailure = await Data.loadState();
    assert.equal(afterFailure.profile.weight, before.profile.weight);
    assert.equal((await Data.counts()).snapshots, beforeSnapshots + 1);
    const restored = await Data.restoreBackup(backup, { confirmed: true });
    assert.equal(restored.status, 'RESTORED');
    assert.equal((await Data.loadState()).profile.weight, 70);
  });
  await check('restore validates before snapshot and requires explicit confirmation', async () => {
    const beforeSnapshots = (await Data.counts()).snapshots;
    await assert.rejects(Data.restoreBackup('{broken', { confirmed: true }));
    await assert.rejects(Data.restoreBackup((await Data.exportBackup()).json, { confirmed: false }), /explicit user confirmation/);
    assert.equal((await Data.counts()).snapshots, beforeSnapshots);
  });
  await check('stable IDs and canonical unit validators reject malformed records', async () => {
    assert.equal(Data.validateDomainRecord('setRecords', { setId: 'set-1', weightKg: 45, reps: 8 }).ok, true);
    assert.equal(Data.validateDomainRecord('setRecords', { setId: 'set-2', weightKg: '100 lb', reps: 8 }).ok, false);
    assert.equal(Data.validateDomainRecord('runs', { runId: 'run-1', distance: 5, duration: 600 }).ok, false);
    assert.equal(Data.validateDomainRecord('runs', { runId: 'run-2', distanceMeters: 5000, durationSeconds: 600 }).ok, true);
  });
  await check('real app startup uses V2 IndexedDB and leaves V1 untouched until import is requested', async () => {
    const project = path.join(__dirname, '..');
    const html = fs.readFileSync(path.join(project, 'index.html'), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
    const dataSource = fs.readFileSync(path.join(project, 'data-layer.js'), 'utf8');
    const appSource = fs.readFileSync(path.join(project, 'app.js'), 'utf8');
    const dom = new JSDOM(html, { url: 'https://boji.example.test/boji-companion-v2/rc/', runScripts: 'dangerously', pretendToBeVisual: true });
    const w = dom.window;
    const closeWatchdog = setTimeout(() => w.close(), 5000);
    Object.defineProperty(w, 'indexedDB', { value: new IDBFactory(), configurable: true });
    Object.defineProperty(w, 'crypto', { value: require('node:crypto').webcrypto, configurable: true });
    w.TextEncoder = TextEncoder;
    w.TextDecoder = TextDecoder;
    const legacy = JSON.stringify({ profile: { name: 'V1-only', height: 170, weight: 99, dumbbell: 10 } });
    w.localStorage.setItem('boji_v7', legacy);
    const dataScript = w.document.createElement('script');
    dataScript.textContent = dataSource;
    w.document.body.appendChild(dataScript);
    const appScript = w.document.createElement('script');
    appScript.textContent = appSource;
    w.document.body.appendChild(appScript);
    w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline && !w.eval('DATA_READY === true')) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(w.eval('DATA_READY'), true);
    assert.equal(w.eval('STATE.profile'), null, 'V1 profile did not silently hydrate into V2');
    assert.equal(w.localStorage.getItem('boji_v7'), legacy, 'V1 data stayed byte-for-byte unchanged');
    assert.equal(await w.BojiData.loadState(), null, 'startup did not create default user state or import the V1 profile');
    assert.ok(w.document.querySelector('#home-stats'), 'default home screen rendered after IndexedDB initialization');
    const claims = await new Promise((resolve, reject) => {
      const request = w.indexedDB.open('boji-companion-v2-rc');
      request.onsuccess = () => {
        const db = request.result;
        const get = db.transaction('knowledgeClaims').objectStore('knowledgeClaims').getAll();
        get.onsuccess = () => { const result = get.result; db.close(); resolve(result); };
        get.onerror = () => reject(get.error);
      };
      request.onerror = () => reject(request.error);
    });
    assert.ok(claims.length > 0, 'legacy knowledge content has claim registry entries');
    assert.ok(claims.every(claim => claim.evidenceLabel === 'UNVERIFIED' && claim.sourceIds.length === 0), 'legacy knowledge is not assigned invented evidence sources');
    w.confirm = () => true;
    const realSetTimeout = w.setTimeout.bind(w);
    w.setTimeout = (fn, delay, ...args) => delay === 500 ? 0 : realSetTimeout(fn, delay, ...args);
    assert.equal(await w.eval('importLegacyFromBrowser')(), true, 'V1 import requires and follows an explicit user action');
    w.setTimeout = realSetTimeout;
    assert.equal(w.localStorage.getItem('boji_v7'), legacy, 'user-initiated import also leaves V1 bytes unchanged');
    assert.equal((await w.BojiData.loadState()).profile.weight, 99, 'confirmed V1 profile appears in the V2 projection');
    w.close();
    clearTimeout(closeWatchdog);
  });

  console.log(`DATA LAYER RESULT: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
