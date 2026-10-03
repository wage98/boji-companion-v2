/* Boji Companion V2 local data boundary. V1 storage is read only and is only
 * inspected by the explicit import flow. */
(function (root) {
  'use strict';

  const RELEASE_CONFIG = root.BOJI_RELEASE_CONFIG || {
    channel: 'rc', indexedDbName: 'boji-companion-v2-rc', cachePrefix: 'boji-v2-rc-'
  };
  const RELEASE_CHANNEL = RELEASE_CONFIG.channel === 'prod' ? 'prod' : 'rc';
  const RELEASE_CACHE_PREFIX = `boji-v2-${RELEASE_CHANNEL}-`;
  const DB_NAME = RELEASE_CONFIG.indexedDbName === `boji-companion-v2-${RELEASE_CHANNEL}`
    ? RELEASE_CONFIG.indexedDbName
    : `boji-companion-v2-${RELEASE_CHANNEL}`;
  const DB_VERSION = 2;
  const LEGACY_KEY = 'boji_v7';
  const MAX_BACKUP_BYTES = 32 * 1024 * 1024;
  const STORE_KEYS = Object.freeze({
    appState: 'stateId', profiles: 'profileId', exercises: 'exerciseId', programs: 'programId',
    templates: 'templateId', equipmentProfiles: 'profileId', sessions: 'sessionId',
    exerciseSessions: 'exerciseSessionId', setRecords: 'setId',
    customExercises: 'exerciseId',
    foodDrafts: 'draftId', mealRecords: 'mealId', bodyWeights: 'weightId',
    waterEntries: 'entryId', runs: 'runId', knowledgeClaims: 'claimId',
    knowledgeSources: 'sourceId', mediaAssets: 'assetId', quarantine: 'quarantineId',
    migrations: 'migrationId', legacyArchives: 'snapshotId', snapshots: 'snapshotId', metadata: 'key'
  });
  const PRODUCT_STORES = Object.freeze(['exercises', 'programs', 'templates', 'equipmentProfiles', 'knowledgeClaims', 'knowledgeSources']);
  const USER_STORES = Object.keys(STORE_KEYS).filter(name => !['snapshots', 'metadata'].includes(name) && !PRODUCT_STORES.includes(name));
  const VERSION = Object.freeze({
    PRODUCT_VERSION: '2.0.0-pre.4',
    SCHEMA_VERSION: 2,
    APP_CACHE_VERSION: `${RELEASE_CACHE_PREFIX}3`,
    FEATURE_MANIFEST_VERSION: 2,
    EXERCISE_DATA_VERSION: 2,
    KNOWLEDGE_VERSION: 1
  });
  const PROVENANCE = Object.freeze(['MEASURED', 'USER_PROVIDED', 'DATABASE', 'AI_ESTIMATED', 'DERIVED']);
  let dbPromise;

  const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const now = () => Date.now();
  const localDateKey = (date) => {
    const d = date instanceof Date ? date : new Date(date == null ? Date.now() : date);
    if (!Number.isFinite(d.getTime())) throw new TypeError('Invalid date');
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  };
  const timezoneContext = (date) => {
    const d = date instanceof Date ? date : new Date(date == null ? Date.now() : date);
    return { timezoneOffsetMinutes: -d.getTimezoneOffset(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || null };
  };
  const makeId = (prefix) => {
    const c = root.crypto;
    const value = c && typeof c.randomUUID === 'function'
      ? c.randomUUID()
      : `${now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    return `${prefix || 'id'}-${value}`;
  };
  function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (!isObject(value)) return JSON.stringify(value);
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  async function sha256(value) {
    const bytes = new TextEncoder().encode(typeof value === 'string' ? value : canonical(value));
    if (root.crypto && root.crypto.subtle) {
      const digest = await root.crypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    }
    if (typeof require === 'function') return require('node:crypto').createHash('sha256').update(bytes).digest('hex');
    throw new Error('Secure SHA-256 is unavailable in this context');
  }
  const byteLength = value => new TextEncoder().encode(value).length;
  function open() {
    if (dbPromise) return dbPromise;
    if (!root.indexedDB) return Promise.reject(new Error('IndexedDB is unavailable; V2 data has not been loaded.'));
    dbPromise = new Promise((resolve, reject) => {
      const request = root.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = event => {
        const db = request.result;
        Object.entries(STORE_KEYS).forEach(([name, keyPath]) => {
          if (!db.objectStoreNames.contains(name)) {
            const store = db.createObjectStore(name, { keyPath });
            if (name === 'sessions') store.createIndex('byLocalDateKey', 'localDateKey', { unique: false });
            if (name === 'mealRecords') store.createIndex('byLocalDateKey', 'localDateKey', { unique: false });
            if (name === 'bodyWeights') store.createIndex('byLocalDateKey', 'localDateKey', { unique: false });
            if (name === 'runs') store.createIndex('byLocalDateKey', 'localDateKey', { unique: false });
            if (name === 'exerciseSessions') store.createIndex('bySessionId', 'sessionId', { unique: false });
            if (name === 'setRecords') store.createIndex('byExerciseSessionId', 'exerciseSessionId', { unique: false });
          }
        });
        const tx = request.transaction;
        const sessions = tx.objectStore('sessions');
        if (!sessions.indexNames.contains('byIdempotencyKey')) sessions.createIndex('byIdempotencyKey', 'idempotencyKey', { unique: true });
        if (event.oldVersion === 1) {
          const metadata = tx.objectStore('metadata');
          const priorRequest = metadata.get('runtime-versions');
          priorRequest.onsuccess = () => {
            const prior = priorRequest.result;
            const expected = { PRODUCT_VERSION: '2.0.0-pre.1', SCHEMA_VERSION: 1, APP_CACHE_VERSION: 'boji-v2-rc-1', FEATURE_MANIFEST_VERSION: 1, EXERCISE_DATA_VERSION: 1, KNOWLEDGE_VERSION: 1 };
            if (!prior || !isObject(prior.versions) || Object.keys(expected).some(key => prior.versions[key] !== expected[key])) {
              try { tx.abort(); } catch (_) {}
              return;
            }
            metadata.put({ key: 'runtime-versions', versions: VERSION, updatedAt: now() });
          };
          const oldExercises = tx.objectStore('exercises');
          const customExercises = tx.objectStore('customExercises');
          const legacyRows = oldExercises.getAll();
          legacyRows.onsuccess = () => {
            legacyRows.result.forEach(row => customExercises.put(row));
            oldExercises.clear();
          };
        }
      };
      request.onerror = () => reject(request.error || new Error('Could not open V2 data store'));
      request.onblocked = () => reject(new Error('V2 data upgrade is blocked by another open tab. Close older V2 tabs and retry.'));
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
    }).then(async db => {
      await ensureVersionRecord(db);
      return db;
    }).catch(error => { dbPromise = null; throw error; });
    return dbPromise;
  }
  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
    });
  }
  function transactionDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
      tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
    });
  }
  async function ensureVersionRecord(db) {
    const tx = db.transaction('metadata', 'readwrite');
    const store = tx.objectStore('metadata');
      const current = await requestResult(store.get('runtime-versions'));
      if (current) {
      const compatibilityKeys = ['SCHEMA_VERSION', 'APP_CACHE_VERSION', 'FEATURE_MANIFEST_VERSION', 'EXERCISE_DATA_VERSION', 'KNOWLEDGE_VERSION'];
      if (!isObject(current.versions) || compatibilityKeys.some(key => current.versions[key] !== VERSION[key])) {
        tx.abort();
        throw new Error('Stored V2 version combination is incompatible; data is preserved and the app is in read-only mode.');
      }
      const missing = Object.keys(VERSION).filter(key => current.versions[key] == null);
      if (missing.length) {
        tx.abort();
        throw new Error(`Stored V2 version dimensions are incomplete: ${missing.join(', ')}`);
      }
      if (current.versions.PRODUCT_VERSION !== VERSION.PRODUCT_VERSION) store.put({ key: 'runtime-versions', versions: VERSION, updatedAt: now() });
    } else {
      store.put({ key: 'runtime-versions', versions: VERSION, updatedAt: now() });
    }
    await transactionDone(tx);
  }
  function transaction(stores, mode, work) {
    return open().then(db => new Promise((resolve, reject) => {
      let tx;
      try { tx = db.transaction(stores, mode); }
      catch (error) { reject(error); return; }
      const trackedCommit = mode === 'readwrite' && typeof root.__BOJI_COMMIT_HOOK === 'function';
      if (trackedCommit) { try { root.__BOJI_COMMIT_HOOK('start'); } catch (_) {} }
      let commitClosed = false;
      const closeCommit = () => {
        if (!trackedCommit || commitClosed) return;
        commitClosed = true;
        try { root.__BOJI_COMMIT_HOOK('end'); } catch (_) {}
      };
      let value;
      let workError = null;
      try { value = work(tx); }
      catch (error) { workError = error; try { tx.abort(); } catch (_) {} }
      tx.oncomplete = () => { closeCommit(); workError ? reject(workError) : resolve(value); };
      tx.onabort = () => { closeCommit(); reject(workError || tx.error || new Error('IndexedDB transaction aborted')); };
      tx.onerror = () => { if (!workError) workError = tx.error || new Error('IndexedDB transaction failed'); };
    }));
  }
  function readAll(db, storeName) { return requestResult(db.transaction(storeName, 'readonly').objectStore(storeName).getAll()); }
  function readStateRecord(db) { return requestResult(db.transaction('appState', 'readonly').objectStore('appState').get('main')); }
  async function hydrateMedia(value, db) {
    if (Array.isArray(value)) return Promise.all(value.map(item => hydrateMedia(item, db)));
    if (!isObject(value)) return value;
    if (value.mediaAssetId) {
      const record = await requestResult(db.transaction('mediaAssets', 'readonly').objectStore('mediaAssets').get(value.mediaAssetId));
      return record && record.dataUrl ? record.dataUrl : '';
    }
    const result = {};
    await Promise.all(Object.keys(value).map(async key => { result[key] = await hydrateMedia(value[key], db); }));
    return result;
  }
  async function externalizeMedia(value, records) {
    if (Array.isArray(value)) return Promise.all(value.map(item => externalizeMedia(item, records)));
    if (!isObject(value)) return value;
    const result = {};
    await Promise.all(Object.keys(value).map(async key => {
      const child = value[key];
      if (typeof child === 'string' && /^data:image\//i.test(child)) {
        const assetId = `media-${await sha256(child)}`;
        records.set(assetId, { assetId, dataUrl: child, mediaType: child.slice(5, child.indexOf(';')) || 'image/unknown', createdAt: now(), storageClass: 'user-media' });
        result[key] = { mediaAssetId: assetId, mediaType: child.slice(5, child.indexOf(';')) || 'image/unknown' };
      } else if (typeof child === 'string' && /^data:video\//i.test(child)) {
        const assetId = `media-${await sha256(child)}`;
        records.set(assetId, { assetId, dataUrl: child, mediaType: child.slice(5, child.indexOf(';')) || 'video/unknown', createdAt: now(), storageClass: 'user-media' });
        result[key] = { mediaAssetId: assetId, mediaType: child.slice(5, child.indexOf(';')) || 'video/unknown' };
      } else result[key] = await externalizeMedia(child, records);
    }));
    return result;
  }
  async function saveState(state, options) {
    const opts = options || {};
    if (!isObject(state)) throw new TypeError('App state must be an object');
    const media = new Map();
    const payload = await externalizeMedia(state, media);
    payload.schemaVersion = VERSION.SCHEMA_VERSION;
    payload.versionDimensions = VERSION;
    payload.updatedAt = now();
    const mediaKeys = Array.from(media.keys());
    return transaction(['appState', 'mediaAssets'], 'readwrite', tx => {
      const app = tx.objectStore('appState');
      const assets = tx.objectStore('mediaAssets');
      app.put({ stateId: 'main', payload, updatedAt: payload.updatedAt, mediaAssetIds: mediaKeys });
      media.forEach(record => assets.put(record));
      if (opts.testFault === 'quota') throw new DOMException('Injected storage quota failure', 'QuotaExceededError');
      if (opts.testFault === 'transaction') throw new Error('Injected storage transaction failure');
    }).then(() => true);
  }
  async function loadState() {
    const db = await open();
    const record = await readStateRecord(db);
    return record ? hydrateMedia(record.payload, db) : null;
  }
  function parseLegacyValue(raw) {
    if (raw == null) return { ok: false, code: 'NOT_FOUND', message: 'No V1 boji_v7 data was found in this origin.' };
    if (byteLength(raw) > MAX_BACKUP_BYTES) return { ok: false, code: 'TOO_LARGE', message: 'The V1 data exceeds the 32 MiB migration limit.' };
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch (_) { return { ok: false, code: 'CORRUPT_JSON', message: 'V1 data is not valid JSON. It has not been changed.' }; }
    if (!isObject(parsed)) return { ok: false, code: 'INVALID_ROOT', message: 'V1 data must be a JSON object. It has not been changed.' };
    return { ok: true, snapshot: parsed };
  }
  function readLegacySnapshot(storage) {
    try {
      const source = storage || root.localStorage;
      return parseLegacyValue(source.getItem(LEGACY_KEY));
    } catch (error) {
      return { ok: false, code: 'READ_FAILED', message: `V1 data could not be read: ${error && error.message ? error.message : 'storage unavailable'}` };
    }
  }
  const stableLabel = value => String(value || '').normalize('NFKC').trim().toLocaleLowerCase();
  function preflightLegacy(snapshot) {
    if (!isObject(snapshot)) return { ok: false, code: 'INVALID_ROOT', message: 'Legacy snapshot must be an object.' };
    const issues = [];
    const quarantine = [];
    const isRecord = key => isObject(snapshot[key]);
    if (snapshot.profile != null && !isObject(snapshot.profile)) issues.push('profile has an invalid shape');
    if (isObject(snapshot.profile) && snapshot.profile.weight != null && !validNumber(snapshot.profile.weight, 20, 400)) quarantine.push({ type: 'profile-weight', reason: 'weight is outside the supported kg range; original value remains in the legacy snapshot' });
    if (snapshot.checkins != null && !isRecord('checkins')) issues.push('checkins has an invalid shape');
    if (snapshot.meals != null && !isRecord('meals')) issues.push('meals has an invalid shape');
    const checkins = isRecord('checkins') ? snapshot.checkins : {};
    const meals = isRecord('meals') ? snapshot.meals : {};
    const weights = isRecord('weights') ? snapshot.weights : {};
    const runs = Array.isArray(snapshot.runs) ? snapshot.runs : [];
    const customExercises = Array.isArray(snapshot.myEx) ? snapshot.myEx : [];
    const checkinCount = Object.keys(checkins).length;
    const mealCount = Object.values(meals).reduce((sum, day) => sum + (isObject(day) ? Object.values(day).reduce((n, list) => n + (Array.isArray(list) ? list.length : 0), 0) : 0), 0);
    const weightCount = Object.keys(weights).length + (Array.isArray(snapshot.bodyWeights) ? snapshot.bodyWeights.length : 0);
    const ambiguousCheckins = [];
    Object.entries(checkins).forEach(([date, entry]) => {
      if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(date) || !isObject(entry)) {
        quarantine.push({ type: 'checkin', legacyKey: date, reason: 'invalid date or record shape' });
        return;
      }
      const ex = isObject(entry.ex) ? Object.keys(entry.ex).filter(k => entry.ex[k]) : [];
      if (ex.some(key => /^\d+$/.test(key))) ambiguousCheckins.push(date);
    });
    if (ambiguousCheckins.length) quarantine.push({ type: 'training-checkins', legacyKeys: ambiguousCheckins, reason: 'legacy numeric exercise indexes lack a historical plan snapshot; semantic exercise mapping is ambiguous' });
    if (Array.isArray(snapshot.meals)) issues.push('meals is an array; expected date keyed records');
    if (snapshot.meals != null && isRecord('meals')) {
      Object.entries(meals).forEach(([date, day]) => {
        if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(date) || !isObject(day)) quarantine.push({ type: 'meal-day', legacyKey: date, reason: 'invalid date or record shape' });
      });
      if (mealCount) quarantine.push({ type: 'meals', reason: 'legacy meal field provenance and AI confirmation state are not recorded; retained in the immutable legacy snapshot for review' });
    }
    if (snapshot.runs != null && !Array.isArray(snapshot.runs)) issues.push('runs has an invalid shape');
    if (snapshot.myEx != null && !Array.isArray(snapshot.myEx)) issues.push('myEx has an invalid shape');
    if (snapshot.weights != null && !isObject(snapshot.weights)) issues.push('weights has an invalid shape');
    if (Array.isArray(snapshot.myEx)) {
      const seen = new Set();
      customExercises.forEach((item, index) => {
        if (!isObject(item) || typeof item.name !== 'string' || !item.name.trim()) {
          quarantine.push({ type: 'custom-exercise', legacyIndex: index, reason: 'missing stable name/identity' });
          return;
        }
        const label = stableLabel(item.name);
        if (seen.has(label)) quarantine.push({ type: 'custom-exercise', legacyIndex: index, reason: 'duplicate names cannot be assigned a unique semantic identity without user input' });
        seen.add(label);
      });
    }
    Object.entries(weights).forEach(([date, values]) => {
      if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(date) || !isObject(values)) quarantine.push({ type: 'weights', legacyKey: date, reason: 'invalid date or record shape' });
    });
    if (snapshot.bodyWeights != null && !Array.isArray(snapshot.bodyWeights)) quarantine.push({ type: 'bodyWeights', reason: 'invalid array shape' });
    const duplicate = snapshot.migrationStatus === 'completed' || snapshot.v2MigrationComplete === true;
    return {
      ok: issues.length === 0,
      code: issues.length ? 'VALIDATION_ISSUES' : 'READY',
      message: issues.length ? issues.join('; ') : null,
      summary: {
        profile: isObject(snapshot.profile) ? 1 : 0,
        checkinDays: checkinCount,
        legacyActionIndexes: ambiguousCheckins.length,
        mealEntries: mealCount,
        weightEntries: weightCount,
        runEntries: runs.length,
        customExercises: customExercises.length,
        quarantineItems: quarantine.length,
        duplicateMarker: duplicate
      },
      quarantine
    };
  }
  function validNumber(value, min, max) { return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max; }
  function dateEpoch(date) {
    const parts = String(date).split('-').map(Number);
    if (parts.length !== 3) return null;
    const local = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
    if (local.getFullYear() !== parts[0] || local.getMonth() !== parts[1] - 1 || local.getDate() !== parts[2]) return null;
    return local.getTime();
  }
  function canonicalLegacyDate(date) {
    const match = String(date).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!match || !dateEpoch(date)) return null;
    return `${match[1]}-${String(Number(match[2])).padStart(2, '0')}-${String(Number(match[3])).padStart(2, '0')}`;
  }
  function normalizeProjectionDates(state) {
    const conflicts = [];
    const convertMap = name => {
      if (!isObject(state[name])) return;
      const next = {};
      const seen = new Set();
      Object.entries(state[name]).forEach(([key, value]) => {
        const normalized = canonicalLegacyDate(key) || key;
        if (seen.has(normalized)) {
          delete next[normalized];
          conflicts.push({ type: 'date-key-collision', field: name, legacyKey: key, canonicalKey: normalized, reason: 'multiple legacy keys map to the same local date; neither value was selected' });
          return;
        }
        seen.add(normalized);
        next[normalized] = value;
      });
      state[name] = next;
    };
    ['checkins', 'weights', 'meals', 'scores'].forEach(convertMap);
    if (Array.isArray(state.bodyWeights)) state.bodyWeights.forEach(item => { if (isObject(item) && typeof item.d === 'string') item.d = canonicalLegacyDate(item.d) || item.d; });
    if (Array.isArray(state.runs)) state.runs.forEach(item => { if (isObject(item) && typeof item.date === 'string') item.date = canonicalLegacyDate(item.date) || item.date; });
    if (typeof state.selDate === 'string') state.selDate = canonicalLegacyDate(state.selDate) || state.selDate;
    return conflicts;
  }
  async function customExerciseRecords(snapshot, quarantine) {
    const records = [];
    const seen = new Set();
    for (const [index, item] of (Array.isArray(snapshot.myEx) ? snapshot.myEx : []).entries()) {
      if (!isObject(item) || typeof item.name !== 'string' || !item.name.trim()) continue;
      const label = stableLabel(item.name);
      if (seen.has(label)) continue;
      seen.add(label);
      const semanticHash = (await sha256(label)).slice(0, 24);
      records.push({
        exerciseId: `exercise-custom-${semanticHash}`,
        name: item.name.trim(),
        origin: 'USER_CREATED',
        targetMuscles: Array.isArray(item.muscles) ? item.muscles.slice(0, 16) : item.part ? [String(item.part)] : [],
        targetSets: validNumber(item.sets, 1, 10) ? Math.round(item.sets) : 3,
        targetReps: item.reps == null ? '12' : String(item.reps).slice(0, 16),
        restSeconds: validNumber(item.rest, 10, 600) ? Math.round(item.rest) : 60,
        note: typeof item.note === 'string' ? item.note.slice(0, 240) : '',
        legacySource: { store: LEGACY_KEY, id: item.id == null ? null : String(item.id), indexForAuditOnly: index },
        teaching: { status: 'UNVERIFIED_LEGACY', text: typeof item.note === 'string' ? item.note : '' }
      });
    }
    return records;
  }
  function bodyWeightRecords(snapshot, quarantine) {
    const byDate = new Map();
    (Array.isArray(snapshot.bodyWeights) ? snapshot.bodyWeights : []).forEach((item, index) => {
      if (!isObject(item) || typeof item.d !== 'string' || !validNumber(item.w, 20, 400) || !dateEpoch(item.d)) {
        quarantine.push({ type: 'body-weight', legacyIndex: index, reason: 'invalid date or weight; preserved in legacy snapshot' });
        return;
      }
      if(byDate.has(item.d) && byDate.get(item.d).value !== item.w){
        quarantine.push({ type: 'body-weight', legacyIndex: index, reason: 'conflicting values on the same local date; original values remain in the legacy snapshot' });
        return;
      }
      byDate.set(item.d, { date: item.d, value: item.w, legacy: 'bodyWeights' });
    });
    if (isObject(snapshot.weights)) Object.entries(snapshot.weights).forEach(([date, value]) => {
      if (!dateEpoch(date)) return;
      const w = isObject(value) ? Number(value.weightKg == null ? value.w : value.weightKg) : Number(value);
      if (validNumber(w, 20, 400) && !byDate.has(date)) byDate.set(date, { date, value: w, legacy: 'weights' });
    });
    return Array.from(byDate.values()).map(item => ({
      weightId: `body-weight:${item.date}`,
      measuredAt: null,
      localDateKey: item.date,
      timezoneContext: null,
      weightKg: item.value,
      provenance: 'USER_PROVIDED',
      measurementContext: 'Legacy date-keyed user log; exact event time was not recorded.',
      legacySource: item.legacy
    }));
  }
  async function runRecords(snapshot, quarantine) {
    const records = [];
    const seen = new Set();
    for (const [index, item] of (Array.isArray(snapshot.runs) ? snapshot.runs : []).entries()) {
      if (!isObject(item) || typeof item.date !== 'string' || !dateEpoch(item.date) || !validNumber(item.dist, 0, 1000000) || !validNumber(item.ms, 0, 7 * 24 * 60 * 60 * 1000)) {
        quarantine.push({ type: 'run', legacyIndex: index, reason: 'invalid date, distance or duration; preserved in legacy snapshot' });
        continue;
      }
      const stableFingerprint = await sha256([item.date, item.dist, item.ms, canonical(item.pts || [])].join('|'));
      if(seen.has(stableFingerprint)){
        quarantine.push({ type: 'run', legacyIndex: index, reason: 'duplicate records have identical content and cannot be assigned distinct semantic identities' });
        continue;
      }
      seen.add(stableFingerprint);
      const at = null;
      const route = Array.isArray(item.pts) ? item.pts.map(point => {
        if (Array.isArray(point) && point.length >= 2 && point.slice(0, 2).every(Number.isFinite)) return { lat: point[0], lon: point[1] };
        if (isObject(point) && validNumber(point.lat, -90, 90) && validNumber(point.lon, -180, 180)) return { lat: point.lat, lon: point.lon, recordedAt: validNumber(point.t, 0, Number.MAX_SAFE_INTEGER) ? point.t : null };
        return null;
      }).filter(Boolean) : [];
      records.push({
        runId: `run-legacy-${stableFingerprint.slice(0, 32)}`,
        startedAt: at,
        endedAt: null,
        localDateKey: item.date,
        timezoneContext: null,
        distanceMeters: item.dist,
        durationSeconds: item.ms / 1000,
        route, routeSegments: route.length ? [route] : [], routeStatus: route.length > 1 ? 'LEGACY_UNKNOWN' : 'UNAVAILABLE',
        calorieEstimate: validNumber(item.kcal, 0, 100000) ? { energyKcal: item.kcal, provenance: 'DERIVED', label: 'legacy estimate; formula unavailable' } : null,
        legacySource: { store: LEGACY_KEY, indexForAuditOnly: index }
      });
    }
    return records;
  }
  async function migrateLegacy(snapshot, options) {
    const opts = options || {};
    if (opts.confirmed !== true) throw new Error('Legacy import requires explicit user confirmation after preflight.');
    const preflight = preflightLegacy(snapshot);
    if (!preflight.ok) throw new Error(preflight.message || 'Legacy preflight failed');
    const sourceHash = await sha256(snapshot);
    const migrationId = `v1-boji_v7-${sourceHash}`;
    const quarantine = clone(preflight.quarantine);
    const exercises = await customExerciseRecords(snapshot, quarantine);
    const weights = bodyWeightRecords(snapshot, quarantine);
    const runs = await runRecords(snapshot, quarantine);
    const meals = Object.values(isObject(snapshot.meals) ? snapshot.meals : {}).reduce((n, day) => n + (isObject(day) ? Object.values(day).reduce((m, list) => m + (Array.isArray(list) ? list.length : 0), 0) : 0), 0);
    if (meals) quarantine.push({ quarantineId: `food-provenance-${sourceHash.slice(0, 16)}`, type: 'legacy-meals', reason: 'food field provenance and confirmation state are missing; review is required before becoming MealRecord facts', count: meals, createdAt: now() });
    const state = clone(snapshot);
    quarantine.push(...normalizeProjectionDates(state));
    const media = new Map();
    const payload = await externalizeMedia(state, media);
    const archivePayload = await externalizeMedia(snapshot, media);
    const legacyArchive = { snapshotId: `legacy-${sourceHash}`, sourceKey: LEGACY_KEY, importedAt: now(), sourceHash, immutable: true, payload: archivePayload };
    const quarantineRows = quarantine.map((item, index) => Object.assign({ quarantineId: item.quarantineId || `q-${sourceHash.slice(0, 12)}-${index}`, sourceHash, createdAt: now() }, item));
    payload.schemaVersion = VERSION.SCHEMA_VERSION;
    payload.versionDimensions = VERSION;
    payload.legacyProjection = true;
    payload.updatedAt = now();
    const migration = { migrationId, sourceKey: LEGACY_KEY, sourceHash, status: 'COMPLETED', importedAt: now(), summary: preflight.summary, quarantinedCount: quarantineRows.length };
    const profile = isObject(snapshot.profile) ? [{
      profileId: 'profile-primary',
      displayName: typeof snapshot.profile.name === 'string' ? snapshot.profile.name.slice(0, 80) : '',
      heightMeters: validNumber(snapshot.profile.height, 50, 250) ? snapshot.profile.height / 100 : null,
      weightKg: validNumber(snapshot.profile.weight, 20, 400) ? snapshot.profile.weight : null,
      availableDumbbellMaxKg: validNumber(snapshot.profile.dumbbell, 0, 2000) ? snapshot.profile.dumbbell : null,
      updatedAt: null,
      legacyTimeUnknown: true
    }] : [];
    const storeRows = { appState: [{ stateId: 'main', payload, updatedAt: payload.updatedAt, mediaAssetIds: Array.from(media.keys()) }], profiles: profile, customExercises: exercises, bodyWeights: weights, runs, quarantine: quarantineRows, migrations: [migration], legacyArchives: [legacyArchive] };
    const stores = USER_STORES;
    let result = null;
    await transaction(stores, 'readwrite', tx => {
      const migrationStore = tx.objectStore('migrations');
      const existing = migrationStore.get(migrationId);
      const counts = {};
      let pendingReads = USER_STORES.length + 1;
      const proceed = () => {
        pendingReads -= 1;
        if(pendingReads) return;
        if (existing.result) { result = { status: 'ALREADY_IMPORTED', migrationId, sourceHash, summary: preflight.summary }; return; }
        if (Object.entries(counts).some(([name, count]) => name !== 'migrations' && count > 0) || counts.migrations > 0) { result = { status: 'BLOCKED_CONFLICT', migrationId, sourceHash, message: 'V2 already contains user data. Export a backup or review it before importing V1.' }; return; }
        if (opts.faultAt === 'before-domain-records') { try { tx.abort(); } catch (_) {} return; }
        Object.entries(storeRows).forEach(([name, rows]) => rows.forEach(row => tx.objectStore(name).put(row)));
        media.forEach(record => tx.objectStore('mediaAssets').put(record));
        if (opts.faultAt === 'before-commit-marker') { try { tx.abort(); } catch (_) {} return; }
        result = { status: 'IMPORTED', migrationId, sourceHash, summary: Object.assign({}, preflight.summary, { canonicalBodyWeights: weights.length, canonicalRuns: runs.length, customExerciseRecords: exercises.length, quarantined: quarantineRows.length }) };
      };
      existing.onsuccess = proceed;
      existing.onerror = () => { try { tx.abort(); } catch (_) {} };
      USER_STORES.forEach(name => {
        const request = tx.objectStore(name).count();
        request.onsuccess = () => { counts[name] = request.result; proceed(); };
        request.onerror = () => { try { tx.abort(); } catch (_) {} };
      });
    });
    if (!result) throw new Error('Migration transaction completed without a completion marker.');
    return result;
  }
  async function hasCompletedMigration() {
    const db = await open();
    const rows = await readAll(db, 'migrations');
    return rows.find(row => row.sourceKey === LEGACY_KEY && row.status === 'COMPLETED') || null;
  }
  function secretKey(key) { return /token|secret|password|credential|authorization|api[-_]?key/i.test(key); }
  function hasSecretField(value) {
    if (Array.isArray(value)) return value.some(hasSecretField);
    if (!isObject(value)) return false;
    return Object.entries(value).some(([key, child]) => secretKey(key) || hasSecretField(child));
  }
  function redact(value) {
    if (Array.isArray(value)) return value.map(redact);
    if (!isObject(value)) return value;
    const result = {};
    Object.entries(value).forEach(([key, child]) => { if (!secretKey(key)) result[key] = redact(child); });
    return result;
  }
  function collectMediaRefs(value, result) {
    const refs = result || new Set();
    if (Array.isArray(value)) value.forEach(item => collectMediaRefs(item, refs));
    else if (isObject(value)) {
      if (typeof value.mediaAssetId === 'string' && value.mediaAssetId) refs.add(value.mediaAssetId);
      Object.values(value).forEach(child => collectMediaRefs(child, refs));
    }
    return refs;
  }
  function bytesToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return root.btoa(binary);
  }
  function base64ToBytes(text) {
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(text, 'base64'));
    const binary = root.atob(text);
    return Uint8Array.from(binary, ch => ch.charCodeAt(0));
  }
  async function encodeRecord(value) {
    if (typeof Blob !== 'undefined' && value instanceof Blob) return { __bojiBlob: true, type: value.type, base64: bytesToBase64(await value.arrayBuffer()) };
    if (Array.isArray(value)) return Promise.all(value.map(encodeRecord));
    if (!isObject(value)) return value;
    const result = {};
    await Promise.all(Object.keys(value).map(async key => { result[key] = await encodeRecord(value[key]); }));
    return result;
  }
  function decodeRecord(value) {
    if (Array.isArray(value)) return value.map(decodeRecord);
    if (!isObject(value)) return value;
    if (value.__bojiBlob === true && typeof value.base64 === 'string') return new Blob([base64ToBytes(value.base64)], { type: String(value.type || 'application/octet-stream') });
    const result = {};
    Object.keys(value).forEach(key => { result[key] = decodeRecord(value[key]); });
    return result;
  }
  async function exportBackup(options) {
    const opts = options || {};
    const db = await open();
    const records = {};
    for (const name of USER_STORES) {
      const rows = await readAll(db, name);
      records[name] = await Promise.all(rows.map(encodeRecord));
    }
    const backup = {
      format: 'boji-companion-v2-backup', formatVersion: 1,
      versions: VERSION, exportedAt: now(), timezoneContext: timezoneContext(),
      records: redact(records)
    };
    const json = JSON.stringify(backup, null, 2);
    if (byteLength(json) > (opts.maxBytes || MAX_BACKUP_BYTES)) throw new Error('Backup exceeds the configured 32 MiB size limit.');
    return { backup, json, byteLength: byteLength(json) };
  }
  function validateBackup(input, options) {
    const opts = options || {};
    const maxBytes = opts.maxBytes || MAX_BACKUP_BYTES;
    let backup = input;
    if (typeof input === 'string') {
      if (byteLength(input) > maxBytes) return { ok: false, code: 'TOO_LARGE', message: 'Backup exceeds the 32 MiB size limit.' };
      try { backup = JSON.parse(input); } catch (_) { return { ok: false, code: 'INVALID_JSON', message: 'Backup is not valid JSON.' }; }
    }
    if (!isObject(backup) || backup.format !== 'boji-companion-v2-backup' || backup.formatVersion !== 1 || !isObject(backup.records)) return { ok: false, code: 'INVALID_FORMAT', message: 'Backup format or version is unsupported.' };
    if (!isObject(backup.versions) || backup.versions.SCHEMA_VERSION !== VERSION.SCHEMA_VERSION) return { ok: false, code: 'INCOMPATIBLE_SCHEMA', message: 'Backup schema is incompatible with this app version.' };
    const incompatibleVersions = Object.keys(VERSION).filter(key => backup.versions[key] !== VERSION[key]);
    if (incompatibleVersions.length) return { ok: false, code: 'INCOMPATIBLE_VERSION', message: `Backup version dimensions are incompatible: ${incompatibleVersions.join(', ')}` };
    const records = {};
    const errors = [];
    if (hasSecretField(backup)) return { ok: false, code: 'SECRET_FIELD', message: 'Backup contains a credential-like field and was rejected.' };
    Object.keys(STORE_KEYS).filter(name => USER_STORES.includes(name)).forEach(name => {
      const rows = backup.records[name] == null ? [] : backup.records[name];
      if (!Array.isArray(rows)) { errors.push(`${name} must be an array`); return; }
      const keyPath = STORE_KEYS[name];
      const ids = new Set();
      records[name] = rows.map(row => {
        if (!isObject(row) || row[keyPath] == null || String(row[keyPath]) === '') { errors.push(`${name} contains a record without ${keyPath}`); return null; }
        const id = String(row[keyPath]);
        if (ids.has(id)) errors.push(`${name} contains duplicate ${keyPath}: ${id}`);
        ids.add(id);
        const decoded = decodeRecord(row);
        const domainCheck = validateDomainRecord(name, decoded);
        if (!domainCheck.ok) errors.push(`${name} record ${id}: ${domainCheck.reason}`);
        return decoded;
      }).filter(Boolean);
    });
    Object.keys(backup.records).forEach(name => { if (!USER_STORES.includes(name)) errors.push(`unknown or protected store: ${name}`); });
    const stateRows = records.appState || [];
    if (stateRows.length > 1 || (stateRows.length === 1 && stateRows[0].stateId !== 'main')) errors.push('appState must contain at most the main state record');
    const mediaIds = new Set((records.mediaAssets || []).map(row => row.assetId));
    Object.entries(records).forEach(([storeName, rows]) => {
      if (storeName === 'mediaAssets') return;
      rows.forEach(row => collectMediaRefs(row).forEach(id => {
        if (!mediaIds.has(id)) errors.push(`${storeName} record references missing media asset ${id}`);
      }));
    });
    const sessions = new Set((records.sessions || []).map(row => row.sessionId));
    const exerciseSessions = new Set((records.exerciseSessions || []).map(row => row.exerciseSessionId));
    (records.exerciseSessions || []).forEach(row => { if (!sessions.has(row.sessionId)) errors.push(`exercise session references missing session ${row.sessionId}`); });
    (records.setRecords || []).forEach(row => { if (!exerciseSessions.has(row.exerciseSessionId)) errors.push(`set references missing exercise session ${row.exerciseSessionId}`); });
    if (records.mealRecords && records.mealRecords.some(row => row.provenance && Object.values(row.provenance).some(value => !PROVENANCE.includes(value)))) errors.push('MealRecord has an invalid provenance value');
    const estimatedSize = byteLength(JSON.stringify(backup));
    if (estimatedSize > maxBytes) errors.push('Backup exceeds the 32 MiB size limit');
    return errors.length ? { ok: false, code: 'VALIDATION_FAILED', message: errors.join('; '), errors } : {
      ok: true, code: 'READY', records, preview: { incomingCounts: Object.fromEntries(Object.entries(records).map(([name, rows]) => [name, rows.length])), conflicts: 'Restore replaces current V2 user records atomically.', byteLength: estimatedSize }
    };
  }
  async function databaseSnapshot(db) {
    const records = {};
    for (const name of USER_STORES) records[name] = await readAll(db, name);
    return records;
  }
  async function restoreBackup(input, options) {
    const opts = options || {};
    if (opts.confirmed !== true) throw new Error('Restore requires explicit user confirmation after preflight.');
    const preflight = validateBackup(input, opts);
    if (!preflight.ok) throw new Error(preflight.message || 'Restore preflight failed');
    const db = await open();
    const current = await databaseSnapshot(db);
    const snapshot = { snapshotId: `pre-restore-${makeId('snapshot')}`, kind: 'PRE_RESTORE', createdAt: now(), immutable: true, records: current };
    await transaction('snapshots', 'readwrite', tx => { tx.objectStore('snapshots').add(snapshot); });
    if (opts.faultAt === 'after-snapshot') throw new Error('Injected restore interruption after pre-restore snapshot');
    const stores = USER_STORES;
    await transaction(stores, 'readwrite', tx => {
      stores.forEach(name => tx.objectStore(name).clear());
      Object.entries(preflight.records).forEach(([name, rows]) => rows.forEach(row => tx.objectStore(name).put(row)));
      if (opts.faultAt === 'mid-restore') { try { tx.abort(); } catch (_) {} }
    });
    return { status: 'RESTORED', snapshotId: snapshot.snapshotId, preview: preflight.preview };
  }
  async function counts() {
    const db = await open();
    const result = {};
    for (const name of Object.keys(STORE_KEYS)) result[name] = (await readAll(db, name)).length;
    return result;
  }
  async function clearV2Data() {
    await transaction(USER_STORES.concat(['snapshots']), 'readwrite', tx => {
      USER_STORES.concat(['snapshots']).forEach(name => tx.objectStore(name).clear());
    });
    return true;
  }
  function validateDomainRecord(storeName, record) {
    if (!STORE_KEYS[storeName] || !isObject(record)) return { ok: false, reason: 'unknown store or non-object record' };
    if (record[STORE_KEYS[storeName]] == null || String(record[STORE_KEYS[storeName]]) === '') return { ok: false, reason: `missing stable ${STORE_KEYS[storeName]}` };
    const validDateKey=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&dateEpoch(value)!==null;
    const validTimezoneContext=value=>value==null||(isObject(value)&&Number.isInteger(value.timezoneOffsetMinutes)&&Math.abs(value.timezoneOffsetMinutes)<=840&&(value.timeZone==null||typeof value.timeZone==='string'));
    if (storeName === 'setRecords') {
      if (record.weightKg != null && !validNumber(record.weightKg, 0, 2000)) return { ok: false, reason: 'weightKg must be a finite canonical kilogram value' };
      if (record.reps != null && (!Number.isInteger(record.reps) || record.reps < 0 || record.reps > 1000)) return { ok: false, reason: 'reps must be a non-negative integer' };
      if (record.completed != null && typeof record.completed !== 'boolean') return { ok: false, reason: 'completed must be boolean' };
    }
    if (storeName === 'runs') {
      if (!validNumber(record.distanceMeters, 0, 1000000) || !validNumber(record.durationSeconds, 0, 604800)) return { ok: false, reason: 'run must use distanceMeters and durationSeconds' };
      if (record.startedAt != null && !validNumber(record.startedAt, 0, Number.MAX_SAFE_INTEGER)) return { ok: false, reason: 'run startedAt must be epoch milliseconds' };
      if (record.endedAt != null && !validNumber(record.endedAt, 0, Number.MAX_SAFE_INTEGER)) return { ok: false, reason: 'run endedAt must be epoch milliseconds' };
      if(record.localDateKey!=null&&!validDateKey(record.localDateKey))return {ok:false,reason:'run localDateKey is invalid'};
      if(!validTimezoneContext(record.timezoneContext))return {ok:false,reason:'run timezone context is invalid'};
      if (record.route != null && (!Array.isArray(record.route) || record.route.some(point => !isObject(point) || !validNumber(point.lat, -90, 90) || !validNumber(point.lon, -180, 180)))) return { ok: false, reason: 'run route must contain valid measured points' };
      if(record.routeSegments!=null&&(!Array.isArray(record.routeSegments)||record.routeSegments.some(segment=>!Array.isArray(segment)||segment.some(point=>!isObject(point)||!validNumber(point.lat,-90,90)||!validNumber(point.lon,-180,180)))))return {ok:false,reason:'run routeSegments must contain measured point segments'};
      if (record.routeStatus != null && !['MEASURED', 'PARTIAL', 'MANUAL', 'UNAVAILABLE', 'LEGACY_UNKNOWN'].includes(record.routeStatus)) return { ok: false, reason: 'run route status is invalid' };
      if (record.distanceProvenance != null && !['MEASURED', 'USER_PROVIDED'].includes(record.distanceProvenance)) return { ok: false, reason: 'run distance provenance is invalid' };
      if (record.durationProvenance != null && !['MEASURED', 'USER_PROVIDED'].includes(record.durationProvenance)) return { ok: false, reason: 'run duration provenance is invalid' };
      if (record.calorieEstimate != null && (!isObject(record.calorieEstimate) || !validNumber(record.calorieEstimate.energyKcal, 0, 100000) || record.calorieEstimate.provenance !== 'DERIVED')) return { ok: false, reason: 'run calorie estimate must be labeled DERIVED' };
    }
    if (storeName === 'bodyWeights') {
      if (!validNumber(record.weightKg, 20, 400)) return { ok: false, reason: 'weightKg is invalid' };
      if (record.measuredAt != null && !validNumber(record.measuredAt, 0, Number.MAX_SAFE_INTEGER)) return { ok: false, reason: 'body weight measuredAt must be epoch milliseconds' };
      if(record.localDateKey!=null&&!validDateKey(record.localDateKey))return {ok:false,reason:'body weight localDateKey is invalid'};
      if(record.timezoneContext!=null&&!validTimezoneContext(record.timezoneContext))return {ok:false,reason:'body weight timezone context is invalid'};
      if(record.provenance!=null&&!PROVENANCE.includes(record.provenance))return {ok:false,reason:'body weight provenance is invalid'};
    }
    if (storeName === 'waterEntries') {
      if (!Number.isInteger(record.amountMl) || record.amountMl === 0 || Math.abs(record.amountMl) > 10000) return { ok: false, reason: 'water entry amountMl is invalid' };
      if (!validNumber(record.createdAt, 0, Number.MAX_SAFE_INTEGER) || !validDateKey(record.localDateKey)) return { ok: false, reason: 'water entry needs an epoch time and local date key' };
      if(!validTimezoneContext(record.timezoneContext))return {ok:false,reason:'water timezone context is invalid'};
      if(record.provenance!=null&&!PROVENANCE.includes(record.provenance))return {ok:false,reason:'water provenance is invalid'};
    }
    if (storeName === 'profiles') {
      if (record.weightKg != null && !validNumber(record.weightKg, 20, 400)) return { ok: false, reason: 'profile weightKg is invalid' };
      if (record.heightMeters != null && !validNumber(record.heightMeters, 0.5, 2.5)) return { ok: false, reason: 'heightMeters is invalid' };
      if (record.nutritionIntent != null && !['LOG_ONLY', 'MAINTAIN', 'GAIN', 'LOSE', 'CUSTOM'].includes(record.nutritionIntent)) return { ok: false, reason: 'profile nutrition intent is invalid' };
      if(record.customKcal!=null&&!validNumber(record.customKcal,500,10000))return {ok:false,reason:'customKcal must be between 500 and 10000'};
      if(record.customProteinG!=null&&!validNumber(record.customProteinG,1,500))return {ok:false,reason:'customProteinG must be between 1 and 500'};
      if(record.waterGoalMl!=null&&!validNumber(record.waterGoalMl,250,10000))return {ok:false,reason:'waterGoalMl must be between 250 and 10000'};
      if(record.nutritionIntent==='CUSTOM'&&(record.customKcal==null||record.customProteinG==null))return {ok:false,reason:'custom nutrition intent requires both custom targets'};
      if(record.trainingGoal!=null&&!['HYPERTROPHY','GENERAL_FITNESS','STRENGTH'].includes(record.trainingGoal))return {ok:false,reason:'profile trainingGoal is invalid'};
      if(record.experienceLevel!=null&&!['BEGINNER','INTERMEDIATE','ADVANCED'].includes(record.experienceLevel))return {ok:false,reason:'profile experienceLevel is invalid'};
      if(record.equipmentProfileCode!=null&&!['A','B','C'].includes(record.equipmentProfileCode))return {ok:false,reason:'profile equipmentProfileCode is invalid'};
      if(record.typicalSessionMinutes!=null&&!validNumber(record.typicalSessionMinutes,10,180))return {ok:false,reason:'profile typicalSessionMinutes must be between 10 and 180'};
    }
    if (storeName === 'sessions') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(record.localDateKey || '')) return { ok: false, reason: 'session needs a localDateKey' };
      if (record.startedAt != null && !validNumber(record.startedAt, 0, Number.MAX_SAFE_INTEGER)) return { ok: false, reason: 'startedAt must be epoch milliseconds' };
      if (!['ACTIVE', 'COMPLETED', 'ABANDONED'].includes(record.status)) return { ok: false, reason: 'session status is invalid' };
      if (typeof record.programId !== 'string' || typeof record.templateId !== 'string' || typeof record.equipmentProfileId !== 'string') return { ok: false, reason: 'session needs program, template and equipment profile IDs' };
      if (record.activeRestEndAt != null && !validNumber(record.activeRestEndAt, 0, Number.MAX_SAFE_INTEGER)) return { ok: false, reason: 'active rest end must be epoch milliseconds' };
      if (record.planSnapshot != null && (!Array.isArray(record.planSnapshot) || record.planSnapshot.length === 0 || record.planSnapshot.some(row => !isObject(row) || typeof row.exerciseId !== 'string' || !Number.isInteger(row.sets) || row.sets < 1 || typeof row.reps !== 'string'))) return { ok: false, reason: 'session plan snapshot is invalid' };
    }
    if (storeName === 'exerciseSessions' && (typeof record.sessionId !== 'string' || typeof record.exerciseId !== 'string' || !Number.isInteger(record.order))) return { ok: false, reason: 'exercise session needs semantic parent, exercise IDs and order' };
    if (storeName === 'customExercises') {
      if (typeof record.name !== 'string' || !record.name.trim() || record.origin !== 'USER_CREATED') return { ok: false, reason: 'custom exercise needs a name and user-created origin' };
    }
    if (storeName === 'setRecords') {
      if (typeof record.exerciseSessionId !== 'string' || !Number.isInteger(record.setIndex) || record.setIndex < 0) return { ok: false, reason: 'set needs a parent exercise session and set index' };
      if (record.rir != null && (!Number.isInteger(record.rir) || record.rir < 0 || record.rir > 10)) return { ok: false, reason: 'RIR must be null or an integer from 0 to 10' };
      if (record.completed === true && (!Number.isInteger(record.reps) || record.reps < 1 || !validNumber(record.completedAt, 0, Number.MAX_SAFE_INTEGER))) return { ok: false, reason: 'completed set needs reps and completion timestamp' };
    }
    if (storeName === 'mealRecords') {
      if (!Array.isArray(record.items) || !record.confirmation || record.confirmation.confirmedByUser !== true || !validNumber(record.confirmation.confirmedAt, 0, Number.MAX_SAFE_INTEGER)) return { ok: false, reason: 'MealRecord must contain itemized food and explicit user confirmation' };
      for (const item of record.items) {
        if (!isObject(item) || typeof item.name !== 'string' || !item.provenance || !PROVENANCE.includes(item.provenance.name)) return { ok: false, reason: 'MealRecord item identity needs valid field provenance' };
        if (item.quantity != null && !PROVENANCE.includes(item.provenance.quantity)) return { ok: false, reason: 'MealRecord portion needs valid field provenance' };
        if (isObject(item.nutrients)) for (const field of Object.keys(item.nutrients)) if (!PROVENANCE.includes(item.provenance[field])) return { ok: false, reason: `MealRecord nutrient ${field} needs valid field provenance` };
      }
    }
    return { ok: true };
  }
  function seedTrainingCatalog(catalog) {
    const data = isObject(catalog) ? catalog : {};
    const rows = {
      equipmentProfiles: Array.isArray(data.equipmentProfiles) ? data.equipmentProfiles : [],
      programs: Array.isArray(data.programs) ? data.programs : [],
      templates: Array.isArray(data.templates) ? data.templates : [],
      exercises: Array.isArray(data.exercises) ? data.exercises : []
    };
    for (const [storeName, list] of Object.entries(rows)) {
      if (!list.length) throw new TypeError(`Training catalog ${storeName} is empty.`);
      const ids = new Set();
      for (const row of list) {
        const checked = validateDomainRecord(storeName, row);
        if (!checked.ok) throw new TypeError(`${storeName}: ${checked.reason}`);
        if (ids.has(row[STORE_KEYS[storeName]])) throw new TypeError(`${storeName} contains duplicate IDs.`);
        ids.add(row[STORE_KEYS[storeName]]);
      }
    }
    const profiles = new Set(rows.equipmentProfiles.map(row => row.profileId));
    const programs = new Set(rows.programs.map(row => row.programId));
    const exercises = new Set(rows.exercises.map(row => row.exerciseId));
    rows.programs.forEach(row => { if (!profiles.has(row.equipmentProfileId)) throw new TypeError(`Program ${row.programId} references a missing equipment profile.`); });
    rows.templates.forEach(row => {
      if (!programs.has(row.programId) || !Array.isArray(row.exercises) || !row.exercises.length) throw new TypeError(`Template ${row.templateId} has invalid program or exercise entries.`);
      row.exercises.forEach(entry => {
        if (!exercises.has(entry.exerciseId) || !Number.isInteger(entry.sets) || entry.sets < 1 || typeof entry.reps !== 'string') throw new TypeError(`Template ${row.templateId} contains an invalid exercise prescription.`);
      });
    });
    return transaction(Object.keys(rows), 'readwrite', tx => {
      Object.entries(rows).forEach(([name, list]) => list.forEach(row => tx.objectStore(name).put(clone(row))));
      return Object.values(rows).reduce((sum, list) => sum + list.length, 0);
    });
  }
  async function loadTrainingCatalog() {
    const db = await open();
    const names = ['equipmentProfiles', 'programs', 'templates', 'exercises', 'customExercises'];
    const values = await Promise.all(names.map(name => readAll(db, name)));
    return Object.fromEntries(names.map((name, index) => [name, values[index]]));
  }
  async function putCustomExercise(record) {
    const value = clone(record || {});
    const checked = validateDomainRecord('customExercises', value);
    if (!checked.ok) throw new TypeError(checked.reason);
    await transaction('customExercises', 'readwrite', tx => tx.objectStore('customExercises').put(value));
    return value;
  }
  async function deleteCustomExercise(exerciseId) {
    if (typeof exerciseId !== 'string' || !exerciseId) throw new TypeError('Custom exercise needs a stable exerciseId.');
    await transaction('customExercises', 'readwrite', tx => tx.objectStore('customExercises').delete(exerciseId));
    return true;
  }
  async function loadWorkoutSession(sessionId) {
    const db = await open();
    const session = await requestResult(db.transaction('sessions').objectStore('sessions').get(sessionId));
    if (!session) return null;
    const exerciseSessions = await requestResult(db.transaction('exerciseSessions').objectStore('exerciseSessions').index('bySessionId').getAll(sessionId));
    const exerciseIds = new Set(exerciseSessions.map(row => row.exerciseSessionId));
    const allSets = await readAll(db, 'setRecords');
    return { session, exerciseSessions: exerciseSessions.sort((a,b)=>a.order-b.order), sets: allSets.filter(row => exerciseIds.has(row.exerciseSessionId)).sort((a,b)=>a.exerciseOrder-b.exerciseOrder || a.setIndex-b.setIndex) };
  }
  async function listActiveWorkouts() {
    const db = await open();
    const sessions = await readAll(db, 'sessions');
    const active = sessions.filter(row => row.status === 'ACTIVE').sort((a,b)=>b.startedAt-a.startedAt);
    return Promise.all(active.map(row => loadWorkoutSession(row.sessionId)));
  }
  async function listWorkoutHistory() {
    const db = await open();
    const sessions = await readAll(db, 'sessions');
    return Promise.all(sessions.sort((a,b)=>(b.startedAt||0)-(a.startedAt||0)).map(row => loadWorkoutSession(row.sessionId)));
  }
  async function claimWorkoutOwnership(sessionId, ownerId, options) {
    if (typeof sessionId !== 'string' || !sessionId || typeof ownerId !== 'string' || !ownerId) {
      throw new TypeError('Workout ownership needs a session and a tab owner id.');
    }
    const takeover = !!(options && options.takeover);
    const result = { status: 'PENDING', sessionId, ownerId };
    await transaction('sessions', 'readwrite', tx => {
      const store = tx.objectStore('sessions'), request = store.get(sessionId);
      request.onsuccess = () => {
        const session = request.result;
        if (!session) { result.status = 'NOT_FOUND'; return; }
        if (session.status !== 'ACTIVE') { result.status = 'SESSION_NOT_ACTIVE'; return; }
        if (session.ownerTabId && session.ownerTabId !== ownerId && !takeover) {
          result.status = 'OWNED_ELSEWHERE'; result.currentOwnerId = session.ownerTabId; return;
        }
        const claimedAt = now();
        store.put(Object.assign({}, session, { ownerTabId: ownerId, ownerClaimedAt: claimedAt, updatedAt: claimedAt }));
        result.status = 'CLAIMED'; result.currentOwnerId = ownerId;
      };
      request.onerror = () => { try { tx.abort(); } catch (_) {} };
    });
    if (result.status === 'CLAIMED' || result.status === 'OWNED_ELSEWHERE') result.workout = await loadWorkoutSession(sessionId);
    return result;
  }
  async function startWorkout(input) {
    const spec = clone(input || {});
    if (!isObject(spec) || typeof spec.templateId !== 'string' || typeof spec.idempotencyKey !== 'string' || !spec.idempotencyKey || typeof spec.ownerId !== 'string' || !spec.ownerId) throw new TypeError('Workout start needs a templateId, idempotency key and tab owner id.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(spec.localDateKey || '')) throw new TypeError('Workout start needs a canonical localDateKey.');
    const catalog = await loadTrainingCatalog();
    const template = catalog.templates.find(row => row.templateId === spec.templateId);
    if (!template) throw new Error('Workout template is missing or incompatible.');
    const program = catalog.programs.find(row => row.programId === template.programId);
    const equipmentProfile = catalog.equipmentProfiles.find(row => row.profileId === (spec.equipmentProfileId || (program && program.equipmentProfileId)));
    if (!program || !equipmentProfile || !Array.isArray(template.exercises) || !template.exercises.length) throw new Error('Workout catalog references are incomplete.');
    const exerciseMap = new Map(catalog.exercises.map(row => [row.exerciseId, row]));
    for (const entry of template.exercises) if (!exerciseMap.has(entry.exerciseId)) throw new Error(`Workout template references missing exercise ${entry.exerciseId}.`);
    const requested = Array.isArray(spec.prescriptionOverrides) ? spec.prescriptionOverrides : null;
    if (requested && requested.length !== template.exercises.length) throw new TypeError('Adjusted workout must retain every template exercise.');
    const prescriptions = template.exercises.map((entry, index) => {
      const override = requested && requested[index];
      if (!requested) return clone(entry);
      if (!isObject(override)) throw new TypeError('Adjusted workout contains an invalid prescription entry.');
      if (override.exerciseId !== entry.exerciseId || !Number.isInteger(override.sets) || override.sets < 1 || override.sets > entry.sets ||
          (override.reps != null && override.reps !== entry.reps) || (override.restSeconds != null && override.restSeconds !== entry.restSeconds)) {
        throw new TypeError('Adjusted workout may only reduce set count while preserving each template exercise and prescription.');
      }
      return Object.assign({}, clone(entry), { sets: override.sets });
    });
    const db = await open();
    const sessionId = makeId('session');
    const createdAt = now();
    const exerciseSessions = prescriptions.map((entry, order) => ({
      exerciseSessionId: `${sessionId}:exercise:${order}`, sessionId, exerciseId: entry.exerciseId,
      nameSnapshot: exerciseMap.get(entry.exerciseId).name, order, targetSets: entry.sets,
      targetReps: entry.reps, movementPattern: entry.movementPattern, status: 'PLANNED'
    }));
    const sets = exerciseSessions.flatMap((exerciseSession, exerciseOrder) => {
      const entry = prescriptions[exerciseOrder];
      return Array.from({ length: entry.sets }, (_, setIndex) => ({
        setId: `${sessionId}:set:${exerciseOrder}:${setIndex}`, sessionId, exerciseSessionId: exerciseSession.exerciseSessionId,
        exerciseId: exerciseSession.exerciseId, exerciseOrder, setIndex, targetReps: entry.reps,
        weightKg: null, reps: null, rir: null, setType: 'WORKING', completed: false, completedAt: null,
        restSeconds: entry.restSeconds, createdAt
      }));
    });
    const session = {
      sessionId, idempotencyKey: spec.idempotencyKey, programId: program.programId,
      templateId: template.templateId, equipmentProfileId: equipmentProfile.profileId,
      goal: spec.goal || program.goal || 'HYPERTROPHY', localDateKey: spec.localDateKey,
      planSnapshot: prescriptions.map(row => ({ exerciseId: row.exerciseId, sets: row.sets, reps: row.reps, restSeconds: row.restSeconds })),
      timezoneContext: timezoneContext(createdAt), status: 'ACTIVE', startedAt: createdAt,
      ownerTabId: spec.ownerId, ownerClaimedAt: createdAt,
      updatedAt: createdAt, currentExerciseSessionId: exerciseSessions[0].exerciseSessionId,
      currentSetId: sets[0].setId, activeRestStartedAt: null, activeRestEndAt: null,
      lastCommittedAt: null, lastCommittedSetId: null
    };
    const outcome = { status: 'CREATED', sessionId };
    await transaction(['sessions', 'exerciseSessions', 'setRecords'], 'readwrite', tx => {
      const sessionStore = tx.objectStore('sessions');
      const setsStore = tx.objectStore('setRecords');
      const keyed = sessionStore.index('byIdempotencyKey').get(spec.idempotencyKey);
      const activeRows = sessionStore.getAll();
      let pending = 2;
      const proceed = () => {
        pending -= 1;
        if (pending) return;
        if (keyed.result) { outcome.status = 'EXISTING_INTENT'; outcome.sessionId = keyed.result.sessionId; return; }
        const active = activeRows.result.find(row => row.status === 'ACTIVE');
        if (active) { outcome.status = 'ACTIVE_EXISTS'; outcome.sessionId = active.sessionId; return; }
        sessionStore.add(session);
        exerciseSessions.forEach(row => tx.objectStore('exerciseSessions').add(row));
        sets.forEach(row => setsStore.add(row));
      };
      keyed.onsuccess = proceed;
      activeRows.onsuccess = proceed;
      keyed.onerror = () => { try { tx.abort(); } catch (_) {} };
      activeRows.onerror = () => { try { tx.abort(); } catch (_) {} };
    });
    if (outcome.status === 'CREATED') return loadWorkoutSession(sessionId);
    return Object.assign(outcome, { workout: await loadWorkoutSession(outcome.sessionId) });
  }
  async function completeWorkoutSet(sessionId, setId, input, ownerId) {
    const values = isObject(input) ? input : {};
    const reps = Number(values.reps);
    const weightKg = values.weightKg == null || values.weightKg === '' ? null : Number(values.weightKg);
    const rir = values.rir == null || values.rir === '' ? null : Number(values.rir);
    if (!Number.isInteger(reps) || reps < 1 || reps > 1000) throw new TypeError('Completed set reps must be an integer from 1 to 1000.');
    if (weightKg != null && !validNumber(weightKg, 0, 2000)) throw new TypeError('Completed set weight must be canonical kilograms.');
    if (rir != null && (!Number.isInteger(rir) || rir < 0 || rir > 10)) throw new TypeError('RIR must be empty or an integer from 0 to 10.');
    const completedAt = now();
    const db = await open();
    const result = { status: 'COMPLETED', setId, completedAt };
    await transaction(['sessions', 'setRecords'], 'readwrite', tx => {
      const sessions = tx.objectStore('sessions'), sets = tx.objectStore('setRecords');
      const sessionReq = sessions.get(sessionId), setReq = sets.get(setId), allReq = sets.getAll();
      let pending = 3;
      const proceed = () => {
        pending -= 1;
        if (pending) return;
        const session = sessionReq.result, set = setReq.result;
        if (!session || !set || set.sessionId !== sessionId) { result.status = 'NOT_FOUND'; return; }
        if (session.status !== 'ACTIVE') { result.status = 'SESSION_NOT_ACTIVE'; return; }
        if (typeof ownerId !== 'string' || !ownerId || session.ownerTabId !== ownerId) { result.status = 'NOT_OWNER'; return; }
        if (set.completed) { result.status = 'ALREADY_COMPLETED'; result.completedAt = set.completedAt; return; }
        if (session.currentSetId && session.currentSetId !== setId) { result.status = 'OUT_OF_ORDER'; return; }
        set.weightKg = weightKg; set.reps = reps; set.rir = rir;
        set.completed = true; set.completedAt = completedAt;
        session.lastCommittedAt = completedAt; session.lastCommittedSetId = setId;
        const ordered = allReq.result.filter(row => row.sessionId === sessionId).sort((a,b)=>a.exerciseOrder-b.exerciseOrder || a.setIndex-b.setIndex);
        const next = ordered.find(row => row.setId !== setId && !row.completed) || null;
        session.currentSetId = next ? next.setId : null;
        session.currentExerciseSessionId = next ? next.exerciseSessionId : null;
        const rest = next ? (Number.isInteger(values.restSeconds) ? Math.max(0, Math.min(1800, values.restSeconds)) : Math.max(0, Number(set.restSeconds) || 0)) : 0;
        session.activeRestStartedAt = rest ? completedAt : null;
        session.activeRestEndAt = rest ? completedAt + rest * 1000 : null;
        session.updatedAt = completedAt;
        sets.put(set); sessions.put(session);
      };
      [sessionReq, setReq, allReq].forEach(request => { request.onsuccess = proceed; request.onerror = () => { try { tx.abort(); } catch (_) {} }; });
    });
    result.commitCompletedAtPerformance = root.performance && typeof root.performance.now === 'function' ? root.performance.now() : null;
    return Object.assign(result, { workout: await loadWorkoutSession(sessionId) });
  }
  async function finishWorkout(sessionId, options, ownerId) {
    const opts = options || {};
    const result = { status: 'PENDING' };
    await transaction(['sessions', 'setRecords'], 'readwrite', tx => {
      const sessions = tx.objectStore('sessions');
      const sessionReq = sessions.get(sessionId), allReq = tx.objectStore('setRecords').getAll();
      let pending = 2;
      const proceed = () => {
        pending -= 1;
        if (pending) return;
        const session = sessionReq.result;
        if (!session) { result.status = 'NOT_FOUND'; return; }
        if (session.status !== 'ACTIVE') { result.status = 'ALREADY_FINISHED'; return; }
        if (typeof ownerId !== 'string' || !ownerId || session.ownerTabId !== ownerId) { result.status = 'NOT_OWNER'; return; }
        const ownSets = allReq.result.filter(row => row.sessionId === sessionId);
        const complete = ownSets.length > 0 && ownSets.every(row => row.completed === true);
        if (!complete && opts.action !== 'ABANDON') { result.status = 'INCOMPLETE'; result.incompleteSetCount = ownSets.filter(row => !row.completed).length; return; }
        result.status = complete ? 'COMPLETED' : 'ABANDONED';
        const finishedAt = now();
        sessions.put(Object.assign({}, session, { status: result.status, finishedAt, updatedAt: finishedAt, activeRestStartedAt: null, activeRestEndAt: null }));
      };
      sessionReq.onsuccess = proceed; allReq.onsuccess = proceed;
      sessionReq.onerror = () => { try { tx.abort(); } catch (_) {} };
      allReq.onerror = () => { try { tx.abort(); } catch (_) {} };
    });
    if (['COMPLETED', 'ABANDONED', 'ALREADY_FINISHED'].includes(result.status)) result.workout = await loadWorkoutSession(sessionId);
    return result;
  }
  async function clearWorkoutRest(sessionId, ownerId) {
    const updatedAt=now();
    let cleared = false;
    await transaction('sessions','readwrite',tx=>{
      const store=tx.objectStore('sessions'),request=store.get(sessionId);
      request.onsuccess=()=>{ const row=request.result; if(row&&row.status==='ACTIVE'&&typeof ownerId==='string'&&row.ownerTabId===ownerId){store.put(Object.assign({},row,{activeRestStartedAt:null,activeRestEndAt:null,updatedAt}));cleared=true;} };
      request.onerror=()=>{ try{ tx.abort(); }catch(_){} };
    });
    return cleared ? loadWorkoutSession(sessionId) : null;
  }
  async function suggestProgression(exerciseId, targetReps, equipmentIncrementKg) {
    const allSets = await readAll(await open(), 'setRecords');
    const completed = allSets.filter(row => row.exerciseId === exerciseId && row.completed === true && Number.isFinite(row.weightKg)).sort((a,b)=>b.completedAt-a.completedAt);
    if (!completed.length) return { ready: false, reason: 'No committed set history exists for this exercise.' };
    const latestSession = completed[0].sessionId;
    const latest = completed.filter(row => row.sessionId === latestSession).sort((a,b)=>a.setIndex-b.setIndex);
    const match = String(targetReps || '').match(/(\d+)\s*[-–]\s*(\d+)/);
    const targetMax = match ? Number(match[2]) : Number(String(targetReps || '').match(/\d+/)?.[0] || 0);
    const increment = validNumber(equipmentIncrementKg, 0.1, 100) ? equipmentIncrementKg : 2.5;
    const qualifies = targetMax > 0 && latest.length > 0 && latest.every(row => row.reps >= targetMax && (row.rir == null || row.rir >= 2));
    const currentKg = Math.max(...latest.map(row => Number(row.weightKg) || 0));
    return qualifies
      ? { ready: true, kind: 'INCREASE_LOAD', currentKg, suggestedKg: Math.round((currentKg + increment) / increment) * increment, reason: `All ${latest.length} committed sets reached ${targetMax} reps; recorded RIR is empty or at least 2.`, evidenceSetIds: latest.map(row => row.setId), requiresConfirmation: true }
      : { ready: true, kind: 'ADD_REPS', currentKg, suggestedKg: currentKg, reason: `Keep the load and add reps until every working set reaches ${targetMax || 'the target'}; the latest committed session did not meet the increase rule.`, evidenceSetIds: latest.map(row => row.setId), requiresConfirmation: true };
  }
  function validateFoodDraft(draft) {
    if (!isObject(draft) || typeof draft.draftId !== 'string' || !draft.draftId || !Array.isArray(draft.items) || draft.items.length === 0) return { ok: false, reason: 'FoodDraft needs a stable draftId and at least one item.' };
    if (draft.status !== 'DRAFT' || draft.confirmedAt != null) return { ok: false, reason: 'FoodDraft cannot start in a committed or confirmed state.' };
    if (draft.mealTypeIndex != null && (!Number.isInteger(draft.mealTypeIndex) || draft.mealTypeIndex < 0 || draft.mealTypeIndex > 3)) return { ok: false, reason: 'FoodDraft meal type is invalid.' };
    if (draft.localDateKey != null && !/^\d{4}-\d{2}-\d{2}$/.test(draft.localDateKey)) return { ok: false, reason: 'FoodDraft local date is invalid.' };
    for (const item of draft.items) {
      if (!isObject(item) || typeof item.name !== 'string' || !item.name.trim()) return { ok: false, reason: 'Each food item needs an identity name.' };
      if (item.provenance && Object.values(item.provenance).some(value => !PROVENANCE.includes(value))) return { ok: false, reason: 'Food fields must use the frozen provenance vocabulary.' };
      if (!item.provenance || !PROVENANCE.includes(item.provenance.name)) return { ok: false, reason: 'Food identity needs its own provenance.' };
      if (item.quantity != null && !validNumber(item.quantity, 0, 100000)) return { ok: false, reason: 'Food quantity is invalid.' };
      if (item.quantity != null && !PROVENANCE.includes(item.provenance.quantity)) return { ok: false, reason: 'Food portion needs its own provenance.' };
      if (item.identityConfidence != null && !['LOW', 'MEDIUM', 'HIGH', 'UNASSESSED'].includes(item.identityConfidence)) return { ok: false, reason: 'Identity confidence must remain a descriptive category.' };
      if (item.nutrients && !isObject(item.nutrients)) return { ok: false, reason: 'Nutrient fields must be an object.' };
      if (isObject(item.nutrients)) for (const [field, value] of Object.entries(item.nutrients)) {
        if (!isObject(value) || !validNumber(value.value, 0, 1000000) || !PROVENANCE.includes(item.provenance[field])) return { ok: false, reason: `Nutrient ${field} needs a non-negative value and field-level provenance.` };
      }
    }
    return { ok: true };
  }
  async function createFoodDraft(input) {
    const draft = Object.assign({ draftId: makeId('food-draft'), createdAt: now(), status: 'DRAFT', confirmedAt: null, items: [] }, clone(input || {}));
    const check = validateFoodDraft(draft);
    if (!check.ok) throw new TypeError(check.reason);
    await transaction('foodDrafts', 'readwrite', tx => tx.objectStore('foodDrafts').add(draft));
    return draft;
  }
  async function listFoodDrafts(options) {
    const opts = options || {}, db = await open(), rows = await readAll(db, 'foodDrafts');
    return rows.filter(row => (!opts.status || row.status === opts.status) && (!opts.localDateKey || row.localDateKey === opts.localDateKey))
      .sort((a,b)=>(b.updatedAt||b.createdAt||0)-(a.updatedAt||a.createdAt||0));
  }
  async function listMealRecords(options) {
    const opts = options || {}, db = await open(), rows = await readAll(db, 'mealRecords');
    return rows.filter(row => !opts.localDateKey || row.localDateKey === opts.localDateKey).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
  }
  async function updateFoodDraft(draftId, changes) {
    const db = await open();
    let updated = null;
    await new Promise((resolve, reject) => {
      const tx = db.transaction('foodDrafts', 'readwrite'), store = tx.objectStore('foodDrafts'), request = store.get(draftId);
      request.onsuccess = () => {
        const draft = request.result;
        if (!draft || draft.status !== 'DRAFT') { try { tx.abort(); } catch (_) {} reject(new Error('FoodDraft is missing or already committed.')); return; }
        const next = Object.assign({}, draft, clone(changes || {}), { draftId, status: 'DRAFT', confirmedAt: null, updatedAt: now() });
        const check = validateFoodDraft(next);
        if (!check.ok) { try { tx.abort(); } catch (_) {} reject(new TypeError(check.reason)); return; }
        store.put(next); updated = next;
      };
      request.onerror = () => { try { tx.abort(); } catch (_) {} reject(request.error || new Error('FoodDraft read failed')); };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error || new Error('FoodDraft update aborted'));
      tx.onerror = () => {};
    });
    return updated;
  }
  async function deleteFoodDraft(draftId) {
    let deleted = false;
    await transaction('foodDrafts', 'readwrite', tx => {
      const store = tx.objectStore('foodDrafts'), request = store.get(draftId);
      request.onsuccess = () => { if (request.result && request.result.status === 'DRAFT') { store.delete(draftId); deleted = true; } };
    });
    return deleted;
  }
  async function confirmFoodDraft(draftId, confirmation) {
    if (!confirmation || confirmation.confirmed !== true) throw new Error('MealRecord requires explicit user confirmation.');
    const db = await open();
    let committed;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['foodDrafts', 'mealRecords'], 'readwrite');
      const draftStore = tx.objectStore('foodDrafts');
      const request = draftStore.get(draftId);
      request.onsuccess = () => {
        const draft = request.result;
        if (!draft || draft.status !== 'DRAFT') { try { tx.abort(); } catch (_) {} reject(new Error('FoodDraft is missing or already committed.')); return; }
        const validation = validateFoodDraft(draft);
        if (!validation.ok) { try { tx.abort(); } catch (_) {} reject(new Error(validation.reason)); return; }
        const confirmedAt = now();
        const items = draft.items.map(item => Object.assign({}, clone(item), { userConfirmedIdentity: true, userConfirmedAt: confirmedAt }));
        const meal = {
          mealId: makeId('meal'), createdAt: confirmedAt, localDateKey: draft.localDateKey || localDateKey(confirmedAt),
          timezoneContext: draft.timezoneContext || timezoneContext(confirmedAt), source: draft.source || 'MANUAL',
          mealTypeIndex: draft.mealTypeIndex == null ? null : draft.mealTypeIndex,
          items, confirmation: { confirmedByUser: true, confirmedAt }, draftId: draft.draftId
        };
        tx.objectStore('mealRecords').add(meal);
        draft.status = 'COMMITTED'; draft.confirmedAt = confirmedAt; draft.committedMealId = meal.mealId;
        draftStore.put(draft);
        committed = meal;
      };
      request.onerror = () => { try { tx.abort(); } catch (_) {} reject(request.error || new Error('FoodDraft read failed')); };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error || new Error('MealRecord transaction aborted'));
      tx.onerror = () => {};
    });
    return committed;
  }
  async function putProfile(record) {
    const value = clone(record || {}), checked = validateDomainRecord('profiles', value);
    if (!checked.ok) throw new TypeError(checked.reason);
    await transaction('profiles', 'readwrite', tx => tx.objectStore('profiles').put(value));
    return value;
  }
  async function listProfiles() {
    const db=await open();return readAll(db,'profiles');
  }
  async function updateMealRecord(mealId, changes) {
    const db = await open();let updated=null;
    await new Promise((resolve,reject)=>{
      const tx=db.transaction('mealRecords','readwrite'),store=tx.objectStore('mealRecords'),request=store.get(mealId);
      request.onsuccess=()=>{
        const prior=request.result;if(!prior||!prior.confirmation||prior.confirmation.confirmedByUser!==true){try{tx.abort();}catch(_){}reject(new Error('Confirmed MealRecord is missing.'));return;}
        const next=Object.assign({},prior,clone(changes||{}),{mealId,updatedAt:now()});
        const checked=validateDomainRecord('mealRecords',next);if(!checked.ok){try{tx.abort();}catch(_){}reject(new TypeError(checked.reason));return;}
        store.put(next);updated=next;
      };
      request.onerror=()=>{try{tx.abort();}catch(_){}reject(request.error||new Error('MealRecord read failed'));};
      tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error||new Error('MealRecord update aborted'));tx.onerror=()=>{};
    });
    return updated;
  }
  async function deleteMealRecord(mealId, confirmation) {
    if(!confirmation||confirmation.confirmed!==true)throw new Error('MealRecord deletion requires explicit user confirmation.');
    let deleted=false;
    await transaction('mealRecords','readwrite',tx=>{const store=tx.objectStore('mealRecords'),request=store.get(mealId);request.onsuccess=()=>{if(request.result){store.delete(mealId);deleted=true;}};});
    return deleted;
  }
  async function listBodyWeights() {
    const db = await open();
    return (await readAll(db, 'bodyWeights')).sort((a,b)=>(a.measuredAt||0)-(b.measuredAt||0));
  }
  async function putBodyWeight(record) {
    const value = clone(record || {}), checked = validateDomainRecord('bodyWeights', value);
    if (!checked.ok) throw new TypeError(checked.reason);
    await transaction('bodyWeights', 'readwrite', tx => tx.objectStore('bodyWeights').put(value));
    return value;
  }
  async function listWaterEntries(options) {
    const opts = options || {}, db = await open(), rows = await readAll(db, 'waterEntries');
    return rows.filter(row => !opts.localDateKey || row.localDateKey === opts.localDateKey).sort((a,b)=>a.createdAt-b.createdAt);
  }
  async function putWaterEntry(record) {
    const value = clone(record || {}), checked = validateDomainRecord('waterEntries', value);
    if (!checked.ok) throw new TypeError(checked.reason);
    await transaction('waterEntries', 'readwrite', tx => tx.objectStore('waterEntries').put(value));
    return value;
  }
  async function listRuns() {
    const db = await open();
    return (await readAll(db, 'runs')).sort((a,b)=>(b.startedAt||0)-(a.startedAt||0));
  }
  async function putRun(record) {
    const value = clone(record || {}), checked = validateDomainRecord('runs', value);
    if (!checked.ok) throw new TypeError(checked.reason);
    await transaction('runs', 'readwrite', tx => tx.objectStore('runs').put(value));
    return value;
  }
  function createRequestOwner(ownerView) {
    let generation = 0;
    let controller = null;
    return Object.freeze({
      begin() { if (controller) controller.abort(); controller = typeof AbortController === 'function' ? new AbortController() : null; generation += 1; return { generation, signal: controller && controller.signal, ownerView }; },
      cancel() { generation += 1; if (controller) controller.abort(); controller = null; },
      isCurrent(request, activeView) { return !!request && request.generation === generation && request.ownerView === (activeView == null ? ownerView : activeView) && !(request.signal && request.signal.aborted); },
      async run(work, activeView) { const request = this.begin(); try { const result = await work(request.signal, request); return this.isCurrent(request, activeView) ? { current: true, value: result } : { current: false, discarded: true }; } catch (error) { if (!this.isCurrent(request, activeView) || (error && error.name === 'AbortError')) return { current: false, discarded: true }; throw error; } }
    });
  }
  async function putKnowledgeSource(source) {
    if (!isObject(source) || typeof source.sourceId !== 'string' || !source.sourceId || typeof source.title !== 'string' || typeof source.url !== 'string') throw new TypeError('Knowledge source requires sourceId, title and URL.');
    let parsedUrl;
    try { parsedUrl = new URL(source.url); } catch (_) { throw new TypeError('Knowledge source URL must be absolute.'); }
    if (!['https:', 'http:'].includes(parsedUrl.protocol)) throw new TypeError('Knowledge source URL scheme is unsupported.');
    const row = Object.assign({}, clone(source), { verifiedAt: null, reviewStatus: 'UNVERIFIED' });
    await transaction('knowledgeSources', 'readwrite', tx => tx.objectStore('knowledgeSources').put(row));
    return row;
  }
  async function putKnowledgeClaim(claim) {
    if (!isObject(claim) || typeof claim.claimId !== 'string' || !claim.claimId || typeof claim.text !== 'string' || !Array.isArray(claim.sourceIds)) throw new TypeError('Knowledge claim requires claimId, text and sourceIds.');
    const db = await open();
    const sources = await readAll(db, 'knowledgeSources');
    const known = new Set(sources.filter(source => source.reviewStatus === 'VERIFIED').map(source => source.sourceId));
    const backed = claim.sourceIds.length > 0 && claim.sourceIds.every(id => known.has(id));
    const row = Object.assign({}, clone(claim), { evidenceLabel: backed ? (claim.evidenceLabel || 'SOURCE_LINKED') : 'UNVERIFIED', reviewStatus: backed ? 'SOURCE_LINKED' : 'NEEDS_REVIEW' });
    await transaction('knowledgeClaims', 'readwrite', tx => tx.objectStore('knowledgeClaims').put(row));
    return row;
  }
  async function seedKnowledgeRegistry(entries) {
    const claims = [];
    for (const entry of (Array.isArray(entries) ? entries : [])) {
      if (!isObject(entry) || typeof entry.question !== 'string' || typeof entry.text !== 'string') continue;
      const claimHash = (await sha256(entry.question)).slice(0, 24);
      claims.push({
        claimId: `kb-${claimHash}`, question: entry.question, text: entry.text, scope: entry.scope || entry.question || 'general training and nutrition',
        sourceIds: [], evidenceType: 'UNVERIFIED_LEGACY', confidenceType: 'NOT_ASSESSED',
        reviewDate: null, safetyClass: entry.safetyClass || 'GENERAL_WELLNESS',
        reviewStatus: 'NEEDS_REVIEW', evidenceLabel: 'UNVERIFIED'
      });
    }
    if (!claims.length) return 0;
    await transaction('knowledgeClaims', 'readwrite', tx => {
      const store = tx.objectStore('knowledgeClaims');
      claims.forEach(claim => {
        const request = store.get(claim.claimId);
        request.onsuccess = () => { if (!request.result) store.add(claim); };
      });
    });
    return claims.length;
  }
  const api = Object.freeze({
    DB_NAME, DB_VERSION, VERSION, RELEASE_CHANNEL, PROVENANCE, STORE_KEYS, PRODUCT_STORES, USER_STORES, MAX_BACKUP_BYTES,
    localDateKey, timezoneContext, makeId, canonical, sha256, open, saveState, loadState,
    readLegacySnapshot, parseLegacyValue, preflightLegacy, migrateLegacy, hasCompletedMigration,
    exportBackup, validateBackup, restoreBackup, counts, clearV2Data, validateDomainRecord,
    seedTrainingCatalog, loadTrainingCatalog, putCustomExercise, deleteCustomExercise, loadWorkoutSession, listActiveWorkouts,
    listWorkoutHistory, claimWorkoutOwnership, startWorkout, completeWorkoutSet, finishWorkout, clearWorkoutRest, suggestProgression,
    createFoodDraft, listFoodDrafts, listMealRecords, updateFoodDraft, deleteFoodDraft, confirmFoodDraft, validateFoodDraft,
    putProfile, listProfiles, updateMealRecord, deleteMealRecord, listBodyWeights, putBodyWeight, listWaterEntries, putWaterEntry, listRuns, putRun,
    createRequestOwner, putKnowledgeSource, putKnowledgeClaim, seedKnowledgeRegistry,
    close() { if (dbPromise) dbPromise.then(db => db.close()).catch(() => {}); dbPromise = null; }
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BojiData = api;
})(typeof window !== 'undefined' ? window : globalThis);
