'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { IDBFactory } = require('fake-indexeddb');
const { JSDOM } = require('jsdom');

let Data;
let passed = 0;
let failed = 0;
const OWNER_A = 'tab-owner-a';
const OWNER_B = 'tab-owner-b';
let workoutOwner = OWNER_A;
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
const trainingCatalogFixture = () => ({
  equipmentProfiles: [{ profileId: 'equipment:A', code: 'A', name: 'Home with bench', equipment: ['dumbbells', 'bench'] }],
  programs: [{ programId: 'program:A', equipmentProfileId: 'equipment:A', goal: 'HYPERTROPHY', name: 'Home strength' }],
  exercises: [{ exerciseId: 'exercise:press', name: 'Dumbbell press', origin: 'BUILT_IN', movementPattern: 'chest_push', targetMuscles: ['chest'], equipmentProfileIds: ['equipment:A'], teaching: { form: 'Controlled press' } }],
  templates: [{ templateId: 'template:A:push', programId: 'program:A', dayKey: 'push', exercises: [{ exerciseId: 'exercise:press', sets: 2, reps: '8-10', restSeconds: 60, movementPattern: 'chest_push', targetMuscles: ['chest'] }] }]
});

async function main() {
  freshStore();
  await check('RC namespace and explicit version dimensions', async () => {
    assert.equal(Data.DB_NAME, 'boji-companion-v2-rc');
    assert.equal(Data.DB_VERSION, 2);
    for (const key of ['PRODUCT_VERSION','SCHEMA_VERSION','APP_CACHE_VERSION','FEATURE_MANIFEST_VERSION','EXERCISE_DATA_VERSION','KNOWLEDGE_VERSION']) assert.ok(Object.hasOwn(Data.VERSION, key));
    assert.equal(Data.localDateKey(new Date(2026, 9, 3, 23, 59)), '2026-10-03');
    assert.equal(typeof Data.timezoneContext(Date.now()).timezoneOffsetMinutes, 'number');
  });
  await check('schema 1 to 2 upgrade preserves imported custom exercises and advances version dimensions', async () => {
    freshStore();
    await new Promise((resolve, reject) => {
      const request = indexedDB.open(Data.DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        Object.entries(Data.STORE_KEYS).forEach(([name, keyPath]) => {
          if (['customExercises', 'equipmentProfiles'].includes(name)) return;
          const store = db.createObjectStore(name, { keyPath });
          if (name === 'sessions' || name === 'mealRecords' || name === 'bodyWeights' || name === 'runs') store.createIndex('byLocalDateKey', 'localDateKey', { unique: false });
          if (name === 'exerciseSessions') store.createIndex('bySessionId', 'sessionId', { unique: false });
          if (name === 'setRecords') store.createIndex('byExerciseSessionId', 'exerciseSessionId', { unique: false });
        });
        request.transaction.objectStore('exercises').put({ exerciseId: 'exercise-custom-old', name: 'Old custom', origin: 'USER_CREATED' });
        request.transaction.objectStore('metadata').put({ key: 'runtime-versions', versions: {
          PRODUCT_VERSION: '2.0.0-pre.1', SCHEMA_VERSION: 1, APP_CACHE_VERSION: 'boji-v2-rc-1',
          FEATURE_MANIFEST_VERSION: 1, EXERCISE_DATA_VERSION: 1, KNOWLEDGE_VERSION: 1
        } });
      };
      request.onsuccess = () => { request.result.close(); resolve(); };
      request.onerror = () => reject(request.error);
    });
    await Data.open();
    assert.equal((await Data.counts()).exercises, 0, 'product catalog store is clear for V2 built-ins');
    assert.equal((await Data.counts()).customExercises, 1, 'existing user-created exercise moved to the user store');
    assert.equal(Data.VERSION.SCHEMA_VERSION, 2);
  });
  freshStore();

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
    assert.equal(runRows[0].routeSegments[0].length,2,'legacy measured coordinate pairs are retained as a route segment');
    assert.equal(runRows[0].routeStatus,'LEGACY_UNKNOWN','legacy route certainty is labeled unknown');
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
    assert.equal((await Data.counts()).customExercises, 1);
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
    for (const name of ['appState','profiles','exercises','customExercises','bodyWeights','runs','quarantine','migrations','legacyArchives','mediaAssets']) assert.equal(counts[name], 0, `${name} rolled back`);
  });

  freshStore();
  await check('training catalog enforces profile/program/template/exercise separation and starts one idempotent session', async () => {
    await Data.seedTrainingCatalog(trainingCatalogFixture());
    const catalog = await Data.loadTrainingCatalog();
    assert.equal(catalog.programs.length, 1);
    assert.equal(catalog.templates.length, 1);
    assert.equal(catalog.exercises.length, 1);
    const start = await Data.startWorkout({ templateId: 'template:A:push', localDateKey: '2026-10-03', idempotencyKey: 'tap-1', ownerId: OWNER_A });
    assert.equal(start.session.status, 'ACTIVE');
    assert.equal(start.exerciseSessions.length, 1);
    assert.equal(start.sets.length, 2);
    const duplicate = await Data.startWorkout({ templateId: 'template:A:push', localDateKey: '2026-10-03', idempotencyKey: 'tap-1', ownerId: OWNER_A });
    assert.equal(duplicate.status, 'EXISTING_INTENT');
    assert.equal(duplicate.sessionId, start.session.sessionId);
    const secondStart = await Data.startWorkout({ templateId: 'template:A:push', localDateKey: '2026-10-03', idempotencyKey: 'tap-2', ownerId: OWNER_A });
    assert.equal(secondStart.status, 'ACTIVE_EXISTS');
    assert.equal((await Data.counts()).sessions, 1);
    assert.equal((await Data.claimWorkoutOwnership(start.session.sessionId, OWNER_B)).status, 'OWNED_ELSEWHERE');
    assert.equal((await Data.completeWorkoutSet(start.session.sessionId, start.sets[0].setId, { weightKg: 20, reps: 8 }, OWNER_B)).status, 'NOT_OWNER');
    const takeover = await Data.claimWorkoutOwnership(start.session.sessionId, OWNER_B, { takeover: true });
    assert.equal(takeover.status, 'CLAIMED', 'takeover requires and accepts an explicit owner action');
    assert.equal((await Data.completeWorkoutSet(start.session.sessionId, start.sets[0].setId, { weightKg: 20, reps: 8 }, OWNER_A)).status, 'NOT_OWNER', 'former owner cannot commit after takeover');
    workoutOwner = OWNER_B;
  });
  await check('custom exercise catalog uses user-store persistence and explicit stable identity', async () => {
    const row = { exerciseId: 'exercise-custom-ui-1', name: 'Band row', origin: 'USER_CREATED', targetMuscles: ['back'],
      targetSets: 3, targetReps: '10-12', restSeconds: 60, note: 'Keep ribs down' };
    await Data.putCustomExercise(row);
    assert.deepEqual((await Data.loadTrainingCatalog()).customExercises.map(item => item.exerciseId), [row.exerciseId]);
    assert.equal((await Data.counts()).customExercises, 1);
    await assert.rejects(Data.putCustomExercise({ ...row, exerciseId: 'exercise-custom-bad', origin: 'BUILT_IN' }), /user-created origin/);
    await Data.deleteCustomExercise(row.exerciseId);
    assert.equal((await Data.counts()).customExercises, 0);
  });
  await check('set completion commits values before return, rejects out-of-order and duplicate completion, and recovers rest clock', async () => {
    const [session] = await Data.listActiveWorkouts();
    const [first, second] = session.sets;
    const outOfOrder = await Data.completeWorkoutSet(session.session.sessionId, second.setId, { weightKg: 20, reps: 8, rir: 2 }, workoutOwner);
    assert.equal(outOfOrder.status, 'OUT_OF_ORDER');
    const saved = await Data.completeWorkoutSet(session.session.sessionId, first.setId, { weightKg: 20, reps: 10, rir: 2 }, workoutOwner);
    assert.equal(saved.status, 'COMPLETED');
    assert.equal(saved.workout.sets[0].completed, true);
    assert.equal(saved.workout.sets[0].weightKg, 20);
    assert.ok(saved.workout.session.activeRestEndAt >= saved.completedAt + 59000);
    const duplicate = await Data.completeWorkoutSet(session.session.sessionId, first.setId, { weightKg: 25, reps: 1, rir: 0 }, workoutOwner);
    assert.equal(duplicate.status, 'ALREADY_COMPLETED');
    assert.equal(duplicate.workout.sets[0].weightKg, 20, 'duplicate tap cannot overwrite the committed set');
    Data.close();
    const recovered = (await Data.listActiveWorkouts())[0];
    assert.equal(recovered.session.currentSetId, second.setId);
    assert.equal(recovered.sets.filter(row => row.completed).length, 1);
    assert.ok(recovered.session.activeRestEndAt, 'wall-clock rest end survives a database reopen');
  });
  await check('workout only completes when all planned sets commit and progression stays explainable', async () => {
    const [active] = await Data.listActiveWorkouts();
    assert.equal((await Data.finishWorkout(active.session.sessionId, {}, workoutOwner)).status, 'INCOMPLETE');
    const second = active.sets.find(row => !row.completed);
    const saved = await Data.completeWorkoutSet(active.session.sessionId, second.setId, { weightKg: 20, reps: 10, rir: 2 }, workoutOwner);
    assert.equal(saved.status, 'COMPLETED');
    const finished = await Data.finishWorkout(active.session.sessionId, {}, workoutOwner);
    assert.equal(finished.status, 'COMPLETED');
    const suggestion = await Data.suggestProgression('exercise:press', '8-10', 2.5);
    assert.equal(suggestion.kind, 'INCREASE_LOAD');
    assert.equal(suggestion.suggestedKg, 22.5);
    assert.equal(suggestion.requiresConfirmation, true);
    assert.match(suggestion.reason, /All 2 committed sets reached 10 reps/);
  });
  await check('partial workout requires explicit abandonment and remains recoverable in history', async () => {
    const adjusted = await Data.startWorkout({ templateId: 'template:A:push', localDateKey: '2026-10-04', idempotencyKey: 'trimmed-template', ownerId: workoutOwner,
      prescriptionOverrides: [{ exerciseId: 'exercise:press', sets: 1, reps: '8-10', restSeconds: 60 }] });
    assert.equal(adjusted.session.planSnapshot[0].sets, 1, 'time adjustment is frozen into the session snapshot');
    assert.equal(adjusted.sets.length, 1, 'reduced prescription creates exactly one planned set');
    await assert.rejects(Data.startWorkout({ templateId: 'template:A:push', localDateKey: '2026-10-04', idempotencyKey: 'invalid-trim', ownerId: workoutOwner,
      prescriptionOverrides: [{ exerciseId: 'exercise:press', sets: 3, reps: '8-10', restSeconds: 60 }] }), /only reduce set count/);
    assert.equal((await Data.finishWorkout(adjusted.session.sessionId, { action: 'ABANDON' }, workoutOwner)).status, 'ABANDONED');
    const started = await Data.startWorkout({ templateId: 'template:A:push', localDateKey: '2026-10-04', idempotencyKey: 'tap-3', ownerId: workoutOwner });
    assert.equal((await Data.finishWorkout(started.session.sessionId, {}, workoutOwner)).status, 'INCOMPLETE');
    const abandoned = await Data.finishWorkout(started.session.sessionId, { action: 'ABANDON' }, workoutOwner);
    assert.equal(abandoned.status, 'ABANDONED');
    assert.equal(abandoned.workout.session.status, 'ABANDONED');
    assert.equal((await Data.listActiveWorkouts()).length, 0);
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
  await check('personal profile, weight, water and run facts keep canonical units and local time context', async () => {
    const at=Date.now(),date=Data.localDateKey(at),timezone=Data.timezoneContext(at);
    const profile=await Data.putProfile({profileId:'profile-g4-test',displayName:'G4',heightMeters:1.7,weightKg:68,availableDumbbellMaxKg:20,
      nutritionIntent:'CUSTOM',customKcal:2200,customProteinG:120,waterGoalMl:1800,updatedAt:at});
    assert.equal(profile.nutritionIntent,'CUSTOM');
    const weight=await Data.putBodyWeight({weightId:'weight-g4-test',weightKg:68,measuredAt:at,localDateKey:date,timezoneContext:timezone,provenance:'USER_PROVIDED'});
    const water=await Data.putWaterEntry({entryId:'water-g4-test',createdAt:at,localDateKey:date,timezoneContext:timezone,amountMl:250,entryType:'INTAKE',provenance:'USER_PROVIDED'});
    const run=await Data.putRun({runId:'run-g4-test',startedAt:at-900000,endedAt:at,localDateKey:date,timezoneContext:timezone,distanceMeters:3000,durationSeconds:900,
      distanceProvenance:'USER_PROVIDED',durationProvenance:'USER_PROVIDED',routeSegments:[],routeStatus:'MANUAL',calorieEstimate:{energyKcal:180,provenance:'DERIVED',method:'ACSM',label:'estimated'}});
    assert.equal(weight.weightKg,68);assert.equal(water.amountMl,250);assert.equal(run.distanceMeters,3000);
    assert.equal((await Data.listBodyWeights()).some(row=>row.weightId===weight.weightId),true);
    assert.equal((await Data.listWaterEntries({localDateKey:date})).some(row=>row.entryId===water.entryId),true);
    assert.equal((await Data.listRuns()).some(row=>row.runId===run.runId&&row.calorieEstimate.provenance==='DERIVED'),true);
    await assert.rejects(Data.putProfile({profileId:'profile-invalid-custom',nutritionIntent:'CUSTOM'}),/requires both custom targets/);
    await assert.rejects(Data.putRun({runId:'run-invalid',distanceMeters:10,durationSeconds:20,routeSegments:[[{lat:91,lon:0}]]}),/routeSegments/);
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
    assert.equal(Data.validateDomainRecord('setRecords', { setId: 'set-1', exerciseSessionId: 'ex-1', setIndex: 0, weightKg: 45, reps: 8, completed: true, completedAt: 1 }).ok, true);
    assert.equal(Data.validateDomainRecord('setRecords', { setId: 'set-2', exerciseSessionId: 'ex-1', setIndex: 0, weightKg: '100 lb', reps: 8, completed: true, completedAt: 1 }).ok, false);
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
    const legacy = JSON.stringify({ profile: { name: 'V1-only', height: 170, weight: 99, dumbbell: 10 },
      myEx: [{ id: 'custom-band-row', name: 'Band row', part: 'back', sets: 3, reps: '10-12', rest: 60 }] });
    w.localStorage.setItem('boji_v7', legacy);
    const dataScript = w.document.createElement('script');
    dataScript.textContent = dataSource;
    w.document.body.appendChild(dataScript);
    const appScript = w.document.createElement('script');
    appScript.textContent = appSource;
    w.document.body.appendChild(appScript);
    w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline && !w.eval('DATA_READY === true && window.__READY === true')) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(w.eval('DATA_READY === true && window.__READY === true'), true, 'database and first UI render both completed before interaction');
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
    const pushDate = new Date();
    pushDate.setDate(pushDate.getDate() + ((1 - pushDate.getDay() + 7) % 7));
    const pushDateKey = w.BojiData.localDateKey(pushDate);
    const waitFor = async (predicate, timeout = 3000) => {
      const until = Date.now() + timeout;
      while (Date.now() < until) {
        if (await predicate()) return true;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      return false;
    };
    w.eval('STATE.selDate = ' + JSON.stringify(pushDateKey));
    w.goModule('training');
    assert.ok(w.document.querySelector('#start-workout'), 'training screen exposes canonical session start');
    assert.equal(w.document.querySelectorAll('#mod-body [data-ex]').length, 0, 'training screen has no exercise completion boolean');
    w.document.querySelector('#adjust-profile').value = 'B';
    w.document.querySelector('#adjust-minutes').value = '25';
    w.document.querySelector('#preview-adjustment').click();
    assert.ok(w.document.querySelector('#adjustment-preview').textContent.includes('训练目标') && w.document.querySelector('#adjustment-preview').textContent.includes('组数从'),
      'deterministic profile proposal explains equipment, goal and a time-driven set reduction');
    assert.equal(w.eval('STATE.planOverrides[' + JSON.stringify(pushDateKey) + ']'), undefined, 'adjustment preview does not apply before confirmation');
    w.document.querySelector('#accept-adjustment').click();
    assert.ok(await waitFor(() => w.eval('STATE.planOverrides[' + JSON.stringify(pushDateKey) + '] && STATE.planOverrides[' + JSON.stringify(pushDateKey) + '].profileCode === "B"')),
      'explicit confirmation persists the equipment profile before UI acknowledgement');
    w.document.querySelector('#start-workout').click();
    assert.ok(await waitFor(() => w.eval('!!ACTIVE_WORKOUT')), 'session appears only after database start completes');
    assert.equal(w.eval('ACTIVE_WORKOUT.session.templateId'), 'template:B:push', 'started session fixes the confirmed template identity');
    assert.equal(w.eval('ACTIVE_WORKOUT.session.equipmentProfileId'), 'equipment:B', 'started session fixes the confirmed equipment profile');
    assert.ok(w.eval('ACTIVE_WORKOUT.session.planSnapshot.reduce((sum,row)=>sum+row.sets,0)') <
      w.eval('TRAINING_CATALOG.templates.find(row=>row.templateId==="template:B:push").exercises.reduce((sum,row)=>sum+row.sets,0)'),
      'accepted time constraint is committed into the session prescription snapshot');
    const sessionId = w.eval('ACTIVE_WORKOUT.session.sessionId');
    const firstSetId = w.eval('ACTIVE_WORKOUT.sets[0].setId');
    const nextSetId = w.eval('ACTIVE_WORKOUT.sets[1].setId');
    const originalCommit = w.BojiData.completeWorkoutSet.bind(w.BojiData);
    w.BojiData = Object.assign({}, w.BojiData, { completeWorkoutSet: (...args) => new Promise((resolve, reject) => {
      setTimeout(() => originalCommit(...args).then(resolve, reject), 70);
    }) });
    const toast = w.document.querySelector('#toast');
    toast.textContent = '';
    w.document.querySelector('[data-complete-set]').click();
    await new Promise(resolve => setTimeout(resolve, 15));
    assert.equal((await w.BojiData.loadWorkoutSession(sessionId)).sets[0].completed, false, 'set is not committed during delayed database operation');
    assert.equal(toast.textContent.includes('本组已写入'), false, 'success acknowledgement waits for transaction completion');
    assert.ok(await waitFor(async () => (await w.BojiData.loadWorkoutSession(sessionId)).sets[0].completed), 'first set eventually commits');
    await waitFor(() => toast.textContent.includes('本组已写入'));
    assert.equal(w.eval('ACTIVE_WORKOUT.session.currentSetId'), nextSetId, 'UI advances only after committed set result returns');
    assert.ok(w.eval('ACTIVE_WORKOUT.session.activeRestEndAt') > Date.now(), 'rest timer stores a future wall-clock end');

    await w.eval('(async()=>await refreshPersonalRecords())()');
    const importedProfile=(await w.BojiData.listProfiles()).find(row=>row.profileId==='profile-primary');
    w.eval('STATE.isFirstLaunch=false;STATE.profile='+JSON.stringify({name:importedProfile.displayName,height:importedProfile.heightMeters*100,weight:importedProfile.weightKg,
      dumbbell:importedProfile.availableDumbbellMaxKg,nutritionIntent:'LOG_ONLY'})+';');
    const productEvents=[];w.addEventListener('boji:product-event',event=>productEvents.push(event.detail));
    w.goModule('diet');
    w.eval('openFoodSheet')(0,w.document.querySelector('#mod-body'),null);
    w.document.querySelector('#fe-manual').click();
    w.document.querySelector('#fe-name').value='汤品（热量字段）';
    w.document.querySelector('#fe-kfix').value='180';
    w.document.querySelector('#fe-add').click();
    assert.ok(await waitFor(async()=> (await w.BojiData.listFoodDrafts({status:'DRAFT'})).length===1),'manual food is durably stored as a FoodDraft');
    w.document.querySelector('#fe-manual').click();
    w.document.querySelector('#fe-name').value='杂粮碗（宏量字段）';
    w.document.querySelector('#fe-p').value='8';w.document.querySelector('#fe-c').value='42';w.document.querySelector('#fe-f').value='4';
    w.document.querySelector('#fe-add').click();
    assert.ok(await waitFor(async()=> (await w.BojiData.listFoodDrafts({status:'DRAFT'}))[0].items.length===2),'mixed meal keeps separate itemized draft components');
    const foodDraft=(await w.BojiData.listFoodDrafts({status:'DRAFT'}))[0];
    assert.deepEqual(Object.keys(foodDraft.items[0].nutrients),['energyKcal'],'calories-only entry has no generated macros');
    assert.equal(foodDraft.items[1].provenance.energyKcal,'DERIVED','macro-derived energy has explicit derived provenance');
    assert.equal((await w.BojiData.listMealRecords()).length,0,'FoodDraft does not count as a confirmed meal');
    const confirmFood=w.BojiData.confirmFoodDraft.bind(w.BojiData);
    w.BojiData=Object.assign({},w.BojiData,{confirmFoodDraft:(...args)=>new Promise((resolve,reject)=>setTimeout(()=>confirmFood(...args).then(resolve,reject),80))});
    w.document.querySelector('#toast').textContent='';w.document.querySelector('#fs-confirm-draft').click();
    await new Promise(resolve=>setTimeout(resolve,15));
    assert.equal((await w.BojiData.listMealRecords()).length,0,'meal is not committed while confirmation transaction is delayed');
    assert.equal(w.document.querySelector('#toast').textContent.includes('已记录'),false,'meal acknowledgement waits for the transaction');
    assert.ok(await waitFor(async()=> (await w.BojiData.listMealRecords()).length===1),'explicit confirmation commits the complete MealRecord');
    assert.equal(productEvents.some(event=>event.type==='meal.confirmed'),true,'meal event emits after commit');

    const profilePage=()=>w.goModule('profile');profilePage();
    const intent=w.document.querySelector('#pe-intent');
    assert.deepEqual(Array.from(intent.options).map(option=>option.value),['LOG_ONLY','MAINTAIN','GAIN','LOSE','CUSTOM'],'profile exposes all five nutrition intents');
    intent.value='CUSTOM';intent.dispatchEvent(new w.Event('change',{bubbles:true}));
    w.document.querySelector('#pe-custom-kcal').value='2200';w.document.querySelector('#pe-custom-kcal').dispatchEvent(new w.Event('change',{bubbles:true}));
    w.document.querySelector('#pe-custom-protein').value='125';w.document.querySelector('#pe-custom-protein').dispatchEvent(new w.Event('change',{bubbles:true}));
    assert.ok(await waitFor(async()=>{const rows=await w.BojiData.listProfiles();return rows.some(row=>row.profileId==='profile-primary'&&row.nutritionIntent==='CUSTOM'&&row.customKcal===2200&&row.customProteinG===125);}),
      'nutrition intent and editable custom estimates persist to the canonical profile');
    assert.equal(w.eval('dailyGoal().kcal'),2200,'custom nutrition estimate is used by the UI after persistence');
    const weightAt=Date.now();await w.eval('(async()=>await logWeight(75,"G4_TEST"))()');
    assert.ok(await waitFor(async()=> (await w.BojiData.listBodyWeights()).some(row=>row.weightKg===75&&row.measuredAt>=weightAt)),
      'body weight is recorded with measured time after the database write');
    assert.ok(productEvents.some(event=>event.type==='weight.recorded'),'body weight event emits after commit');

    w.goModule('diet');await w.eval('(async()=>await addWater(250,document.querySelector("#mod-body")))()');
    assert.ok((await w.BojiData.listWaterEntries({localDateKey:w.BojiData.localDateKey(Date.now())})).some(row=>row.amountMl===250),
      'water intake is a date-keyed canonical fact');
    assert.ok(productEvents.some(event=>event.type==='water.recorded'),'water event emits after commit');

    w.goModule('run');const baselineRuns=(await w.BojiData.listRuns()).length;
    const putRun=w.BojiData.putRun.bind(w.BojiData);
    w.BojiData=Object.assign({},w.BojiData,{putRun:record=>new Promise((resolve,reject)=>setTimeout(()=>putRun(record).then(resolve,reject),80))});
    w.document.querySelector('#run-manual-distance').value='3000';w.document.querySelector('#run-manual-duration').value='900';
    w.document.querySelector('#toast').textContent='';w.document.querySelector('#run-manual-save').click();
    await new Promise(resolve=>setTimeout(resolve,15));
    assert.equal((await w.BojiData.listRuns()).length,baselineRuns,'manual run is not acknowledged before durable save');
    assert.equal(w.document.querySelector('#toast').textContent.includes('已记录'),false,'run success message waits for the transaction');
    assert.ok(await waitFor(async()=> (await w.BojiData.listRuns()).length===baselineRuns+1),'manual run is committed');
    const manualRun=(await w.BojiData.listRuns())[0];
    assert.equal(manualRun.routeStatus,'MANUAL');assert.equal(manualRun.distanceProvenance,'USER_PROVIDED');assert.equal(manualRun.calorieEstimate.provenance,'DERIVED');
    assert.ok(productEvents.some(event=>event.type==='run.recorded'),'run event emits after commit');
    const routePoints=Array.from({length:1200},(_,index)=>({lat:31+index/100000,lon:121+(index%2)/10000,recordedAt:index}));
    const simplified=w.eval('simplifyRunRoute')([routePoints],400);
    assert.ok(simplified.reduce((sum,segment)=>sum+segment.length,0)<=400,'route simplification respects the 400-point bound');
    assert.deepEqual(simplified[0][0],routePoints[0]);assert.deepEqual(simplified[simplified.length-1].slice(-1)[0],routePoints[routePoints.length-1]);
    assert.equal(w.eval('String(startRunTicker).includes("renderModule")'),false,'one-second ticker updates metrics without a full module rerender');

    w.BojiData.close();
    w.close();

    const resumedDom = new JSDOM(html, { url: 'https://boji.example.test/boji-companion-v2/rc/', runScripts: 'dangerously', pretendToBeVisual: true });
    const resumed = resumedDom.window;
    Object.defineProperty(resumed, 'indexedDB', { value: w.indexedDB, configurable: true });
    Object.defineProperty(resumed, 'crypto', { value: require('node:crypto').webcrypto, configurable: true });
    resumed.TextEncoder = TextEncoder;
    resumed.TextDecoder = TextDecoder;
    const resumedData = resumed.document.createElement('script');
    resumedData.textContent = dataSource;
    resumed.document.body.appendChild(resumedData);
    const resumedApp = resumed.document.createElement('script');
    resumedApp.textContent = appSource;
    resumed.document.body.appendChild(resumedApp);
    resumed.document.dispatchEvent(new resumed.Event('DOMContentLoaded'));
    assert.ok(await waitFor(() => resumed.eval('DATA_READY === true && window.__READY === true')), 'app reload completes database startup and first UI render');
    assert.equal(resumed.eval('ACTIVE_WORKOUT.session.sessionId'), sessionId, 'reload recovers the active session identity');
    assert.equal(resumed.eval('ACTIVE_WORKOUT.session.currentSetId'), nextSetId, 'reload recovers the next uncommitted set');
    assert.equal(resumed.eval('ACTIVE_WORKOUT.sets[0].completed'), true, 'reload preserves the previously committed set');
    resumed.goModule('training');
    assert.ok(!resumed.document.querySelector('#rest-timer').classList.contains('hidden'), 'reload restores the wall-clock rest timer');
    assert.equal(resumed.eval('STATE.myEx.some(item => item.name === \"Band row\")'), true, 'custom exercise migration hydrates the canonical user catalog: '+JSON.stringify(resumed.eval('STATE.myEx')));
    resumed.BojiData.close();
    resumed.close();
    w.close();
    clearTimeout(closeWatchdog);
  });

  console.log(`DATA LAYER RESULT: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
