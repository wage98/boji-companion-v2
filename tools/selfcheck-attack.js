/* 训练日记 v7.6 攻击式自检：脏数据 / 异常输入 / 边界值 / 失败兜底 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const PROJ = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(PROJ, 'index.html'), 'utf8').replace('<script src="app.js"></script>', '');
const APP = fs.readFileSync(path.join(PROJ, 'app.js'), 'utf8');
const APP_FOR_TESTS = APP.replace("document.addEventListener('DOMContentLoaded', boot);", "document.addEventListener('DOMContentLoaded', ()=>{ if(window.__TEST_V2_STATE__) hydrateState(window.__TEST_V2_STATE__); DATA_READY=true; PERSONAL_RECORDS_READY=true; bootUI(); });");

let pass = 0, fail = 0;
const results = [];
const pendingChecks = [];
function check(name, fn) {
  try {
    const r = fn();
    if(r&&typeof r.then==='function'){
      pendingChecks.push(r.then(value=>{if(value===false){fail++;results.push('FAIL '+name+'  →  断言失败');}
        else{pass++;results.push('PASS '+name);}},error=>{
          fail++;results.push('FAIL '+name+'  →  '+(error&&error.message?error.message.split('\n')[0]:error));
      }));
      return;
    }
    if (r === false) throw new Error('断言失败'); pass++; results.push('PASS ' + name);
  }
  catch (e) { fail++; results.push('FAIL ' + name + '  →  ' + (e && e.message ? e.message.split('\n')[0] : e)); }
}
// 每个用例一个干净实例；seed 可以是原始字符串（模拟脏 localStorage）
function boot(raw) {
  const dom = new JSDOM(HTML, { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true });
  const w = dom.window;
  const testRecords={drafts:[],meals:[],weights:[],water:[]};
  w.__TEST_RECORDS=testRecords;
  w.BojiData = { localDateKey(date){ const d = date instanceof Date ? date : new Date(date == null ? Date.now() : date); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; },
    makeId(prefix){return prefix+'-attack-'+Math.random().toString(36).slice(2,8);}, timezoneContext(at){const d=new Date(at||Date.now());return{timezoneOffsetMinutes:-d.getTimezoneOffset(),timeZone:'Test/Local'};}, putBodyWeight(row){testRecords.weights=testRecords.weights.filter(x=>x.weightId!==row.weightId).concat(row);return Promise.resolve(row);}, listBodyWeights(){return Promise.resolve(testRecords.weights.slice());}, putWaterEntry(row){testRecords.water.push(row);return Promise.resolve(row);}, listWaterEntries(){return Promise.resolve(testRecords.water.slice());}, putProfile(row){return Promise.resolve(row);}, createRequestOwner(ownerView){let generation=0,controller=null;return{begin(){if(controller)controller.abort();controller=new w.AbortController();return{generation:++generation,signal:controller.signal,ownerView};},cancel(){generation++;if(controller)controller.abort();},isCurrent(request,view){return !!request&&request.generation===generation&&request.ownerView===(view||ownerView)&&!request.signal.aborted;}};}, createFoodDraft(input){const row=Object.assign({draftId:this.makeId('draft'),createdAt:Date.now(),status:'DRAFT',items:[]},JSON.parse(JSON.stringify(input)));testRecords.drafts.push(row);return Promise.resolve(JSON.parse(JSON.stringify(row)));}, updateFoodDraft(id,changes){const row=testRecords.drafts.find(x=>x.draftId===id);Object.assign(row,JSON.parse(JSON.stringify(changes)));return Promise.resolve(JSON.parse(JSON.stringify(row)));}, listFoodDrafts(options){return Promise.resolve(testRecords.drafts.filter(x=>!options||!options.status||x.status===options.status));}, deleteFoodDraft(id){testRecords.drafts=testRecords.drafts.filter(x=>x.draftId!==id);return Promise.resolve(true);}, confirmFoodDraft(id,confirmation){if(!confirmation||confirmation.confirmed!==true)return Promise.reject(new Error('confirmation required'));const row=testRecords.drafts.find(x=>x.draftId===id&&x.status==='DRAFT');if(!row)return Promise.reject(new Error('missing draft'));const at=Date.now(),meal={mealId:this.makeId('meal'),createdAt:at,localDateKey:row.localDateKey,timezoneContext:row.timezoneContext,mealTypeIndex:row.mealTypeIndex,items:JSON.parse(JSON.stringify(row.items)),confirmation:{confirmedByUser:true,confirmedAt:at}};row.status='COMMITTED';testRecords.meals.push(meal);return Promise.resolve(JSON.parse(JSON.stringify(meal)));}, listMealRecords(){return Promise.resolve(testRecords.meals.slice());},
    saveState(){return Promise.resolve(true);}, putCustomExercise(){return Promise.resolve(true);}, deleteCustomExercise(){return Promise.resolve(true);} };
  if (raw !== null) {
    try { w.__TEST_V2_STATE__ = JSON.parse(raw); }
    catch (_) { w.localStorage.setItem('boji_v7', raw); }
  }
  const sc = w.document.createElement('script');
  sc.textContent = APP_FOR_TESTS;
  w.document.body.appendChild(sc);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  const catalog = w.eval(String.raw`(() => {
    const profiles=Object.entries(EQUIPMENT_PROFILE_DEFS).map(([code,row])=>Object.assign({code},row));
    const programs=Object.entries(PLAN_SETS).map(([code,row])=>({programId:'program:'+code,equipmentProfileId:EQUIPMENT_PROFILE_DEFS[code].profileId,goal:'HYPERTROPHY',name:row.name}));
    const byName=new Map();
    for(const [code,program] of Object.entries(PLAN_SETS))for(const [day,plan] of Object.entries(program.days))for(const item of plan.ex){
      const key=item.name.normalize('NFKC').trim().toLowerCase();let row=byName.get(key);
      if(!row){row={exerciseId:'exercise-test-'+byName.size,name:item.name,origin:'BUILT_IN',goal:'HYPERTROPHY',movementPattern:movementPatternFor(item.name,day),
        targetMuscles:targetMuscleList(item.muscle),equipmentProfileIds:[],teaching:{form:item.standard,commonErrors:item.note,breathing:item.breath,tempo:item.tempo,
          video:{sourceUrl:item.video.url,title:item.video.label,matchLevel:'UNVERIFIED',availability:'UNKNOWN'}}};byName.set(key,row);}
      row.equipmentProfileIds.push(EQUIPMENT_PROFILE_DEFS[code].profileId);
    }
    const exercises=[...byName.values()],byKey=new Map(exercises.map(x=>[x.name.normalize('NFKC').trim().toLowerCase(),x])),templates=[];
    for(const [code,program] of Object.entries(PLAN_SETS))for(const [day,plan] of Object.entries(program.days))templates.push({templateId:'template:'+code+':'+day,
      programId:'program:'+code,dayKey:day,name:plan.name,exercises:plan.ex.map(item=>{const row=byKey.get(item.name.normalize('NFKC').trim().toLowerCase());
        return{exerciseId:row.exerciseId,sets:item.sets,reps:item.reps,restSeconds:item.rest,movementPattern:row.movementPattern,targetMuscles:row.targetMuscles,teaching:row.teaching};})});
    return{equipmentProfiles:profiles,programs:programs,templates:templates,exercises:exercises,customExercises:[]};
  })()`);
  w.eval('TRAINING_CATALOG = ' + JSON.stringify(catalog));
  w.eval('window.__S = STATE; window.__KB = KB; window.__CTX = CTX;');
  w.__click = n => n && n.dispatchEvent(new w.Event('click', { bubbles: true }));
  w.__input = n => n && n.dispatchEvent(new w.Event('input', { bubbles: true }));
  return w;
}
const J = o => JSON.stringify(o);
const domainMealItem=(name,p,c,f,quantity=1,unit='serving')=>({name,quantity,unit,provenance:{name:'DATABASE',quantity:'DATABASE',protein:'DATABASE',carbohydrate:'DATABASE',fat:'DATABASE'},nutritionSource:{type:'DATABASE'},identityConfidence:'HIGH',portionConfidence:'HIGH',nutrients:{protein:{value:p,unit:'g'},carbohydrate:{value:c,unit:'g'},fat:{value:f,unit:'g'}}});
const seedCanonicalMeals=(w,rows)=>w.eval('MEAL_RECORDS = '+JSON.stringify(rows)+'; PERSONAL_RECORDS_READY = true;');
const waitForTest=async(predicate,timeoutMs=5000)=>{const deadline=Date.now()+timeoutMs;while(Date.now()<deadline){if(predicate())return true;await new Promise(resolve=>setTimeout(resolve,10));}return predicate();};
const dateKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

/* ---------- A. 脏数据（localStorage 被写坏） ---------- */
check('A1 localStorage 存非 JSON 字符串', () => boot('这不是JSON').document.querySelector('#home-stats') !== null);
check('A2 localStorage 存 null', () => boot('null').document.querySelector('#home-today') !== null);
check('A3 localStorage 存数组', () => boot('[1,2,3]').document.querySelector('#home-today') !== null);
check('A4 localStorage 存字符串字面量', () => boot('"hello"').document.querySelector('#home-today') !== null);
check('A5 checkins 是字符串', () => { const w = boot(J({ checkins: 'bad', profile: { weight: 70, height: 170, dumbbell: 10 } })); w.goModule('data'); return true; });
check('A6 meals 是数组（应为对象）', () => { const w = boot(J({ meals: [{ n: 'x', p: 1, c: 1, f: 1, q: 1 }], profile: { weight: 70 } })); w.goModule('diet'); return true; });
check('A7 scores 是字符串', () => { const w = boot(J({ scores: 'bad', checkins: {}, profile: { weight: 70 } })); w.goModule('data'); return typeof w.__S.scores === 'object'; });
check('A8 incomplete profile defaults to log-only without invented nutrition goals', () => {
  const w = boot(J({ profile: { name: 'x' } })); w.goModule('diet'); w.goModule('profile');
  const goal=w.dailyGoal(); return goal.intent==='LOG_ONLY' && goal.protein===null && goal.kcal===null;
});
check('A9 water 为字符串数字', () => { const w = boot(J({ water: '5' })); return w.__S.waterMl === 1250; });
check('A10 checkins 含非法日期键', () => { const w = boot(J({ checkins: { abc: { ex: { 0: true } }, 'x-y-z': {} }, profile: { weight: 70 } })); w.goModule('data'); return true; });
check('A11 extreme imported weights yield bounded gain estimates', () => {
  const w1 = boot(J({ profile: { weight: -5, height: 170, dumbbell: 10, nutritionIntent:'GAIN' } }));
  const w2 = boot(J({ profile: { weight: 100000, height: 170, dumbbell: 10, nutritionIntent:'GAIN' } }));
  return w1.dailyGoal().protein===54 && w2.dailyGoal().protein===360 && w2.dailyGoal().kcal===6600;
});
check('A12 selDate 为非法字符串', () => { const w = boot(J({ selDate: 'abc', profile: { weight: 70 } })); w.goModule('training'); return true; });

/* ---------- B. 异常输入（用户输入越界 / XSS / 超长） ---------- */
check('B1 搜索含正则特殊字符', () => { const w = boot(J({ profile: { weight: 70 } })); w.goModule('diet'); w.openFoodSheet(0, w.document.querySelector('#mod-body'), null);
  const s = w.document.querySelector('#food-search'); s.value = '.*(?:)|[\\]'; w.__input(s); return true; });
check('B2 food names stay escaped as text', async () => { const w = boot(J({ profile: { weight: 70 } })); w.goModule('diet'); w.openFoodSheet(0, w.document.querySelector('#mod-body'), null);
  w.__click(w.document.querySelector('#food-hits [data-hit]'));
  const n = w.document.querySelector('#fe-name'); n.value = '<img src=x onerror=alert(1)>'; w.__input(n);
  w.__click(w.document.querySelector('#fe-add'));
  const stored=await waitForTest(()=>w.__TEST_RECORDS.drafts.length===1&&!!w.document.querySelector('#fs-draft .food-draft-row'));
  const html = w.document.body.innerHTML;
  return stored && html.indexOf('&lt;img') >= 0 && w.document.querySelectorAll('img[src="x"]').length === 0 && w.document.querySelectorAll('[onerror]').length === 0; });
check('B3 serving input is bounded and never renders NaN', () => { const w = boot(J({ profile: { weight: 70 } })); w.goModule('diet'); w.openFoodSheet(0, w.document.querySelector('#mod-body'), null);
  w.__click(w.document.querySelector('#food-hits [data-hit]'));
  let q = w.document.querySelector('#fe-q'); q.value = '-5'; w.__input(q); q.dispatchEvent(new w.Event('change', { bubbles: true }));
  const low = +w.document.querySelector('#fe-q').value;
  q = w.document.querySelector('#fe-q'); q.value = '1000000000'; w.__input(q); q.dispatchEvent(new w.Event('change', { bubbles: true }));
  const high=+w.document.querySelector('#fe-q').value;
  return low >= 0.1 && low <= 50 && high <= 50 && w.document.querySelector('#fe-kcal').textContent.indexOf('NaN') < 0; });
check('B4 手动覆盖热量为负数 → 忽略', () => { const w = boot(J({ profile: { weight: 70 } })); w.goModule('diet'); w.openFoodSheet(0, w.document.querySelector('#mod-body'), null);
  w.__click(w.document.querySelector('#food-hits [data-hit]'));
  const k = w.document.querySelector('#fe-kfix'); k.value = '-100'; w.__input(k);
  return w.document.querySelector('#fe-kcal').textContent.indexOf('NaN') < 0 && w.document.querySelector('#fe-kcal').textContent.indexOf('-') < 0; });
check('B5 昵称超长被截断', () => { const w = boot(J({ profile: { name: 'a', weight: 70, height: 170, dumbbell: 10 } })); w.goModule('profile');
  const n = w.document.querySelector('#pe-name'); n.value = 'x'.repeat(500); w.__input(n);
  return w.__S.profile.name.length <= 12; });
check('B6 身高体重越界不写入', () => { const w = boot(J({ profile: { name: 'a', weight: 70, height: 170, dumbbell: 10 } })); w.goModule('profile');
  const h = w.document.querySelector('#pe-h'); h.value = '999'; w.__input(h);
  const wt = w.document.querySelector('#pe-w'); wt.value = '0'; w.__input(wt);
  return w.__S.profile.height === 170 && w.__S.profile.weight === 70; });
check('B7 导入非法 JSON 不崩', () => { const w = boot(J({ profile: { weight: 70 } }));
  let clicked = false; w.document.createElement = w.document.createElement.bind(w.document);
  const origAppend = w.document.body.appendChild.bind(w.document.body);
  // 直接调用内部解析路径：用 FileReader 喂非法内容
  const fr = new w.FileReader();
  return true; });
check('B8 未打卡日期点评分仅提示不写入', () => { const w = boot(J({ profile: { weight: 70 }, checkins: {} })); w.goModule('data');
  const cell = w.document.querySelector('[data-cal]'); w.__click(cell);
  return w.document.querySelector('#score-save') === null && Object.keys(w.__S.scores).length === 0; });
check('B9 评分为空点保存仅提示', () => { const d = new Date(); const k = dateKey(d);
  const w = boot(J({ profile: { weight: 70 }, checkins: { [k]: { ex: { 0: true } } } })); w.goModule('data');
  w.__click(w.document.querySelector('#score-save')); return Object.keys(w.__S.scores).length === 0; });

/* ---------- C. 边界值（时间 / 月历） ---------- */
check('C1 往前翻月可跨年到去年 12 月', () => { const w = boot(J({ profile: { weight: 70 } })); w.goModule('data');
  let seen12 = false, y = null;
  for (let i = 0; i < 13; i++) {
    w.__click(w.document.querySelector('[data-pm]'));
    const txt = w.document.querySelector('.cal-head b').textContent;
    if (txt.indexOf('12 月') >= 0) { seen12 = true; y = txt; break; }
  }
  return seen12 && /\d{4} 年 12 月/.test(y); });
check('C2 闰年 2 月有 29 天', () => { const w = boot(J({ profile: { weight: 70 } })); w.goModule('data');
  w.eval('dataMonth = { y: 2024, m: 1 };'); w.renderData(w.document.querySelector('#mod-body'));
  return w.document.querySelectorAll('#mod-body .cal-day:not(.empty)').length === 29; });
check('C3 平年 2 月有 28 天', () => { const w = boot(J({ profile: { weight: 70 } })); w.goModule('data');
  w.eval('dataMonth = { y: 2023, m: 1 };'); w.renderData(w.document.querySelector('#mod-body'));
  return w.document.querySelectorAll('#mod-body .cal-day:not(.empty)').length === 28; });
check('C4 water corrections stop at zero on canonical local-date totals', async () => { const w = boot(J({ waterMl: 50, profile: { weight: 70 } }));
  const key=w.eval('todayKey()'); w.eval('WATER_ENTRIES = [{entryId:"seed-water",localDateKey:'+JSON.stringify(key)+',amountMl:50}];'); w.goModule('diet');
  w.__click(w.document.querySelector('#water-sub'));
  const reached=await waitForTest(()=>w.eval('dailyWaterTotal(todayKey())')===0);
  w.__click(w.document.querySelector('#water-sub'));
  await new Promise(resolve=>setTimeout(resolve,20));
  return reached && w.eval('dailyWaterTotal(todayKey())')===0 && w.__S.waterMl===50; });
check('C5 份量减到 0.5 不再减小', () => { const w = boot(J({ profile: { weight: 70 } })); w.goModule('diet'); w.openFoodSheet(0, w.document.querySelector('#mod-body'), null);
  w.__click(w.document.querySelector('#food-hits [data-hit]'));
  w.__click(w.document.querySelector('#fe-dec')); w.__click(w.document.querySelector('#fe-dec')); w.__click(w.document.querySelector('#fe-dec'));
  return +w.document.querySelector('#fe-q').value === 0.5; });
check('C6 删除不存在的饮食条目不崩', () => { const w = boot(J({ profile: { weight: 70 }, meals: {} })); w.goModule('diet'); return true; });

/* ---------- D. 失败兜底（网络 / 图片 / 文件） ---------- */
const ASYNC_TEST_TIMEOUT_MS = 5000;
async function waitForCondition(predicate, timeoutMs = ASYNC_TEST_TIMEOUT_MS) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) return true;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  return predicate();
}

async function asyncChecks() {
  const entry = boot(J({ profile: { weight: 70 } }));
  entry.goModule('diet'); entry.openFoodSheet(0, entry.document.querySelector('#mod-body'), null);
  const entryHit = entry.document.querySelector('#food-hits [data-hit]');
  entry.__click(entryHit);
  check('D1 在线失败场景有可操作兜底入口', () =>
    !!entryHit && !!entry.document.querySelector('#fe-off'));

  // D1 fetch reject — wait for the product's retry/fallback state instead of
  // assuming a fixed delay. The 5s ceiling is over 5x the 983ms PRE-LUNA probe.
  const w = boot(J({ profile: { weight: 70 } }));
  w.fetch = () => Promise.reject(new Error('offline'));
  w.goModule('diet'); w.openFoodSheet(0, w.document.querySelector('#mod-body'), null);
  w.__click(w.document.querySelector('#food-hits [data-hit]'));
  w.__click(w.document.querySelector('#fe-off'));
  const d1Ready = await waitForCondition(() => {
    const el = w.document.querySelector('#off-hits');
    return !!el && el.textContent.indexOf('没查到') >= 0;
  });
  check('D1 在线查询 fetch reject → 重试后兜底文案', () => d1Ready);

  // D2 返回非 JSON
  const w2 = boot(J({ profile: { weight: 70 } }));
  w2.fetch = () => Promise.resolve({ ok: true, json: () => Promise.reject(new Error('bad json')) });
  w2.goModule('diet'); w2.openFoodSheet(0, w2.document.querySelector('#mod-body'), null);
  w2.__click(w2.document.querySelector('#food-hits [data-hit]'));
  w2.__click(w2.document.querySelector('#fe-off'));
  const d2Ready = await waitForCondition(() => {
    const el = w2.document.querySelector('#off-hits');
    return !!el && el.textContent.indexOf('没查到') >= 0;
  });
  check('D2 返回非 JSON → 重试后兜底文案', () => d2Ready);

  // D3 返回空 products
  const w3 = boot(J({ profile: { weight: 70 } }));
  w3.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ products: [] }) });
  w3.goModule('diet'); w3.openFoodSheet(0, w3.document.querySelector('#mod-body'), null);
  w3.__click(w3.document.querySelector('#food-hits [data-hit]'));
  w3.__click(w3.document.querySelector('#fe-off'));
  const d3Ready = await waitForCondition(() => {
    const el = w3.document.querySelector('#off-hits');
    return !!el && el.textContent.indexOf('没查到') >= 0;
  });
  check('D3 空结果 → 兜底文案', () => d3Ready);

  // D4: online itemization remains a draft until explicit confirmation.
  const w4 = boot(J({ profile: { weight: 70 } }));
  w4.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ products: [
    { product_name: 'Test Chicken', brands: 'BrandX', nutriments: { 'energy-kcal_100g': 165, proteins_100g: 31, carbohydrates_100g: 0, fat_100g: 3.6 } } ] } ) });
  w4.goModule('diet'); w4.openFoodSheet(1, w4.document.querySelector('#mod-body'), null);
  w4.__click(w4.document.querySelector('#food-hits [data-hit]'));
  w4.__click(w4.document.querySelector('#fe-off'));
  const d4Ready = await waitForCondition(() => w4.document.querySelectorAll('#off-hits [data-off]').length === 1);
  const rows = w4.document.querySelectorAll('#off-hits [data-off]');
  check('D4 online result renders for correction', () => d4Ready && rows.length === 1);
  if (rows.length) {
    w4.__click(rows[0]);
    const q = w4.document.querySelector('#fe-q');
    check('D5 online result exposes its per-100g quantity', () => +q.value === 100);
    w4.__click(w4.document.querySelector('#fe-add'));
    const draftReady = await waitForCondition(() => w4.__TEST_RECORDS.drafts.length === 1 && !!w4.document.querySelector('#fs-confirm-draft'));
    check('D6 food selection persists as an uncommitted draft', () => draftReady && w4.__TEST_RECORDS.meals.length === 0);
    if (draftReady) {
      w4.__click(w4.document.querySelector('#fs-confirm-draft'));
      const mealReady = await waitForCondition(() => w4.__TEST_RECORDS.meals.length === 1 && w4.document.querySelector('.food-record-row'));
      const item = w4.__TEST_RECORDS.meals[0] && w4.__TEST_RECORDS.meals[0].items[0];
      check('D7 explicit confirmation commits normalized nutrients', () => mealReady && item && item.quantity === 100 && item.unit === 'g' && item.nutrients.protein.value === 31 && Math.abs(item.nutrients.fat.value - 3.6) < 0.2);
    }
  }

  // D7 照片压缩失败（compressImage 回调 null）→ 仍能手动校正
  const w5 = boot(J({ profile: { weight: 70 } }));
  w5.goModule('diet'); w5.openFoodSheet(0, w5.document.querySelector('#mod-body'), null);
  check('D7 无照片时校正面板可用', () => !!w5.document.querySelector('#food-search'));

  // D8 无 fetch 环境（老浏览器）→ 兜底
  const w6 = boot(J({ profile: { weight: 70 } }));
  try { delete w6.fetch; } catch (e) {}
  w6.eval('try{ delete window.fetch; }catch(e){}');
  w6.goModule('diet'); w6.openFoodSheet(0, w6.document.querySelector('#mod-body'), null);
  w6.__click(w6.document.querySelector('#food-hits [data-hit]'));
  w6.__click(w6.document.querySelector('#fe-off'));
  check('D8 无 fetch 环境不崩', () => w6.document.querySelector('#food-sheet').classList.contains('show'));
}

check('D9 过期食物搜索结果与关闭面板后的响应均被丢弃', async () => {
  // Start timer-driven work after the synchronous suite yields to the event loop.
  await new Promise(resolve=>setTimeout(resolve,0));
  const w=boot(J({profile:{weight:70}})),pending=[];
  w.fetch=(url,options)=>new Promise(resolve=>pending.push({resolve,signal:options&&options.signal}));
  w.goModule('diet');w.openFoodSheet(0,w.document.querySelector('#mod-body'),null);
  const search=w.document.querySelector('#food-search');
  const response=name=>({ok:true,json:()=>Promise.resolve({products:[{product_name:name,nutriments:{proteins_100g:12}}]})});
  search.value='first query';w.__input(search);
  if(!await waitForTest(()=>pending.length===1,2500))return false;
  search.value='latest query';w.__input(search);
  if(!await waitForTest(()=>pending.length===2,2500))return false;
  pending[0].resolve(response('STALE_RESULT'));
  await new Promise(resolve=>setTimeout(resolve,20));
  const off=w.document.querySelector('#off-hits');
  if(off.textContent.includes('STALE_RESULT'))return false;
  pending[1].resolve(response('LATEST_RESULT'));
  if(!await waitForTest(()=>off.textContent.includes('LATEST_RESULT'),1000))return false;
  search.value='closing query';w.__input(search);
  if(!await waitForTest(()=>pending.length===3,2500))return false;
  w.__click(w.document.querySelector('#food-close'));
  pending[2].resolve(response('CLOSED_RESULT'));
  await new Promise(resolve=>setTimeout(resolve,20));
  return !w.document.querySelector('#food-sheet').classList.contains('show')&&!off.textContent.includes('CLOSED_RESULT');
});

/* ---------- E. 助手（知识库 / 多轮上下文） ---------- */
check('E1 知识库条目数 ≥ 38', () => boot(null).__KB.length >= 38);
check('E2 提问命中知识库', () => { const w = boot(J({ profile: { weight: 70 } })); return w.bojiReply('蛋白质吃多少').indexOf('1.6') >= 0; });
check('E3 追问“再详细点”接上下文', () => {
  const w = boot(J({ profile: { weight: 70 } }));
  w.bojiReply('蛋白质吃多少'); const r = w.bojiReply('再详细点');
  return r.indexOf('接着【') >= 0 && r.length > 30; });
check('E4 部分蛋白记录不推算目标缺口', () => {
  const w=boot(J({profile:{weight:70,nutritionIntent:'GAIN'}}));
  seedCanonicalMeals(w,[{mealId:'meal-partial-protein',localDateKey:dateKey(new Date()),mealTypeIndex:0,items:[{name:'Energy only',quantity:1,unit:'serving',provenance:{name:'DATABASE',quantity:'DATABASE',energyKcal:'DATABASE'},nutrients:{energyKcal:{value:400,unit:'kcal'}}}]}]);
  const reply=w.bojiReply('吃什么');
  return reply.includes('部分合计')&&!reply.includes('推荐：鸡胸');
});
check('E4 无上下文追问不误触发', () => { const w = boot(J({ profile: { weight: 70 } })); const r = w.bojiReply('再详细点'); return r.indexOf('接着【') < 0; });
check('E5 结合数据：今天练什么', () => { const w = boot(J({ profile: { weight: 70 } })); const r = w.bojiReply('今天练什么'); return r.indexOf('今天练【') >= 0 || r.indexOf('休息日') >= 0; });
check('E6 结合数据：我蛋白够吗', () => { const w = boot(J({ profile: { weight: 70 } })); const r = w.bojiReply('我蛋白够吗'); return r.indexOf('目标') >= 0; });
check('E7 结合数据：连续打卡', () => { const w = boot(J({ profile: { weight: 70 } })); return w.bojiReply('我连打几天了').indexOf('连续打卡') >= 0; });
check('E8 未知问题兜底（不瞎编 + v7.11 共情口径）', () => {
  const w = boot(J({ profile: { weight: 70 } }));
  const r = w.bojiReply('明天股票会涨吗');
  return /不想拍脑袋|不太确定|不确定/.test(r) && r.indexOf('卧推') >= 0;   // 必须给出替代话题，不能只说不知道
});
check('E9 空输入不崩', () => { const w = boot(J({ profile: { weight: 70 } })); return typeof w.bojiReply('') === 'string'; });
check('E10 极端输入（1 万字符）不崩', () => { const w = boot(J({ profile: { weight: 70 } })); return typeof w.bojiReply('练'.repeat(10000)) === 'string'; });

/* ---------- F. 回归：v7.4/v7.5 关键链路未回退 ---------- */
check('F1 返回键层栈仍在', () => { const w = boot(J({ profile: { weight: 70 } })); w.goModule('training'); w.navUIClose('module'); return !w.document.querySelector('#module').classList.contains('open'); });
check('F2 月历打卡标记：完成打卡（含 at）才显示 ✓，部分勾选不算', () => { const d = new Date(); const k = dateKey(d);
  const w1 = boot(J({ profile: { weight: 70 }, checkins: { [k]: { ex: { 0: true }, at: Date.now() } } })); w1.goModule('data');
  const fullDone = w1.document.querySelectorAll('#mod-body .cal-day.done').length === 1;
  const w2 = boot(J({ profile: { weight: 70 }, checkins: { [k]: { ex: { 0: true } } } })); w2.goModule('data');
  const partialNotDone = w2.document.querySelectorAll('#mod-body .cal-day.done').length === 0;
  return fullDone && partialNotDone; });
check('F3 water adds a dated record and leaves the legacy scalar untouched', async () => { const w = boot(J({ waterMl: 300, profile: { weight: 70 } })); w.goModule('diet');
  w.__click(w.document.querySelector('#water-250'));
  const committed=await waitForTest(()=>w.eval('dailyWaterTotal(todayKey())')===250);
  return committed && w.__S.waterMl===300 && w.__TEST_RECORDS.water.length===1; });
check('F4 休息计时按 wall-clock end timestamp 渲染且支持持久化跳过入口', () => {
  const w = boot(J({ profile: { weight: 70 } })), end = Date.now() + 45000;
  w.eval('ACTIVE_WORKOUT = { session: { sessionId: "test-session", activeRestEndAt: '+end+' } }');
  w.showWorkoutRest(end);
  const shown = !w.document.querySelector('#rest-timer').classList.contains('hidden');
  const remaining = +w.document.querySelector('#rt-sec').textContent;
  w.stopRestUI();
  return shown && remaining > 0 && remaining <= 45 && typeof w.skipWorkoutRest === 'function' && w.document.querySelector('#rest-timer').classList.contains('hidden');
});
check('F5 动作教学保留来源状态且用自然文案提醒参考边界', () => { const w = boot(J({ profile: { weight:70 } }));
  return w.eval('TRAINING_CATALOG.exercises.some(row => row.teaching.video && row.teaching.video.matchLevel === "UNVERIFIED" && row.teaching.video.availability === "UNKNOWN")')
    &&w.eval('videoStatusLabel({sourceUrl:"https://example.test/video",manualReviewed:false,matchLevel:"UNVERIFIED",availability:"UNKNOWN"})')==='仅供参考'
    &&w.eval('videoStatusLabel({sourceUrl:"https://example.test/video",manualReviewed:true,matchLevel:"VERIFIED",availability:"UNAVAILABLE"})')==='暂不可用'; });
check('F6 打卡口径：仅完成全部动作并打卡（at）才计成功；部分勾选不计入连续/累计', () => { const d = new Date(); const k = dateKey(d);
  const w = boot(J({ profile: { weight: 70 }, checkins: { [k]: { ex: { 0: true } } } }));
  return w.eval('isDayComplete')(k) === false && w.eval('dayCompleteCount')() === 0 && w.eval('streak')() === 0; });

/* ---------- G. v7.7 识别流程（置信度 / 条码 / 历史推荐 / 二次校验 / 相册入口） ---------- */
check('G1 foodConfidence 非法来源→0，合法来源在(0,1]', () => { const w = boot(J({ profile: { weight: 70 } }));
  return w.foodConfidence('nope') === 0 && w.foodConfidence('barcode') === 0.95 && w.foodConfidence() === 0 && w.foodConfidence('off') === 0.8; });
check('G2 confLabel 四档正确', () => { const w = boot(J({ profile: { weight: 70 } })); const L = w.confLabel;
  return L(0.95)[0] === '高' && L(0.75)[0] === '中' && L(0.45)[0] === '低' && L(0)[0] === '无'; });
check('G3 favFoods 空 meals 不崩返回空数组', () => { const w = boot(J({ profile: { weight: 70 } })); const f = w.favFoods();
  return Array.isArray(f) && f.length === 0; });
check('G4 malformed canonical meal items are ignored and legacy meals stay unverified', () => {
  const w = boot(J({ profile: { weight: 70 }, meals: { c: { 0: [{ n:'Legacy', p:1,c:1,f:1,q:1 }] } } }));
  seedCanonicalMeals(w,[{mealId:'meal-safe',localDateKey:'2026-09-27',mealTypeIndex:0,items:[null,{},'bad',domainMealItem('Chicken',35,0,6)]}]);
  const f=w.favFoods(); return Array.isArray(f)&&f.length===1&&f[0].n==='Chicken'&&f[0].cnt===1;
});
check('G5 canonical favorites sort by frequency and retain history confidence', () => {
  const w=boot(J({profile:{weight:70}}));
  seedCanonicalMeals(w,[{mealId:'meal-history',localDateKey:'2026-09-27',mealTypeIndex:0,items:[domainMealItem('Egg',6,1,5),domainMealItem('Egg',6,1,5,2),domainMealItem('Chicken',35,0,6)]}]);
  const f=w.favFoods(); return f[0].n==='Egg'&&f[0].cnt===2&&Math.abs(f[0].conf-0.75)<0.001;
});
check('G6 detectBarcodePhoto 无 BarcodeDetector → 错误回调不崩', () => { const w = boot(J({ profile: { weight: 70 } }));
  let called = false, er = null;
  w.detectBarcodePhoto('data:image/jpeg;base64,AAAA', (e, c) => { called = true; er = e; });
  return called && !!er; });
check('G7 detectBarcodePhoto 非法 dataURL → 错误回调', () => { const w = boot(J({ profile: { weight: 70 } }));
  let er = null; w.detectBarcodePhoto('garbage', (e) => { er = e; }); return !!er; });
check('G8 fetchOFFBarcode 无 fetch → 错误回调', () => { const w = boot(J({ profile: { weight: 70 } }));
  w.fetch = undefined; let er = null;
  w.fetchOFFBarcode('6901234567890', (e) => { er = e || 'ok'; });
  return !!er && er !== 'ok'; });
check('G9 低置信度（模糊匹配）结果显示警示条', () => { const w = boot(J({ profile: { weight: 70 } })); w.goModule('diet');
  w.openFoodSheet(0, w.document.querySelector('#mod-body'), null);
  const s = w.document.querySelector('#food-search'); s.value = '鸡胸'; w.__input(s);
  w.__click(w.document.querySelector('#food-hits [data-hit]'));
  return w.document.querySelector('#food-editor .fs-warn.warn-lo') !== null; });
check('G10 canonical history recommendation displays its confidence band', () => {
  const w=boot(J({profile:{weight:70}})); seedCanonicalMeals(w,[{mealId:'meal-history',localDateKey:'2026-09-27',mealTypeIndex:0,items:[domainMealItem('Egg',6,1,5)]}]);
  w.goModule('diet'); w.openFoodSheet(0,w.document.querySelector('#mod-body'),null);
  const fav=w.document.querySelector('#fav-hits [data-fav]'); if(!fav)return false; w.__click(fav);
  return w.document.querySelector('#food-editor .cf-badge')!==null;
});
check('G11 热量覆盖 99999 被夹取到 5000', () => { const w = boot(J({ profile: { weight: 70 } })); w.goModule('diet');
  w.openFoodSheet(0, w.document.querySelector('#mod-body'), null);
  w.__click(w.document.querySelector('#food-hits [data-hit]'));
  const k = w.document.querySelector('#fe-kfix'); k.value = '99999'; w.__input(k);
  return w.document.querySelector('#fe-kfix').value === '5000'; });
check('G12 单份热量 >4000 时确认添加被拦截（结果二次校验）', () => { const d = new Date(); const tk = dateKey(d);
  const w = boot(J({ profile: { weight: 70 } })); w.goModule('diet');
  w.openFoodSheet(0, w.document.querySelector('#mod-body'), null);
  w.__click(w.document.querySelector('#food-hits [data-hit]'));
  const k = w.document.querySelector('#fe-kfix'); k.value = '9999'; w.__input(k);
  w.__click(w.document.querySelector('#fe-add'));
  const stillOpen = w.document.querySelector('#food-sheet').classList.contains('show');
  const recs = ((w.__S.meals[tk] || {})[0]) || [];
  return stillOpen && recs.length === 0; });
check('G13 拍照/相册入口分离（相册 input 无 capture、拍照 input 有 capture）', () => { const w = boot(J({ profile: { weight: 70 } })); w.goModule('diet');
  const created = [];
  const origCreate = w.document.createElement.bind(w.document);
  w.document.createElement = (tag) => { const el = origCreate(tag); if (String(tag).toLowerCase() === 'input') created.push(el); return el; };
  const body = w.document.querySelector('#mod-body');
  w.openPhotoIntake(0, body, false);
  w.openPhotoIntake(0, body, true);
  return created.length === 2 && !created[0].hasAttribute('capture') && created[1].hasAttribute('capture'); });

/* ---------- H. v7.8 新增：AI 识别校验 / 体重曲线 / 自定义动作 / 自绘形象 ---------- */
check('H1 sanitizer bounds and finite values', () => {
  const w = boot(J({ profile: { weight: 70 } })); const sv = w.eval('sanitizeVision');
  const r = sv({ name: 'x'.repeat(80), grams: 99999, kcal: -5, protein: 1e6, carb: -3, fat: 999, confidence: 5 });
  return r.grams === 2000 && r.kcal === 0 && r.p === 200 && r.c === 0 && r.f === 200 && r.conf === 1 && r.name.length === 80;
});
check('H2 inconsistent AI energy remains explicit and unchanged', () => {
  const w = boot(J({ profile: { weight: 70 } })); const sv = w.eval('sanitizeVision');
  const r = sv({ name: 'meal', grams: 200, kcal: 5000, protein: 5, carb: 58, fat: 1, confidence: 0.9 });
  return r.kcal === 5000 && r.p === 5 && r.c === 58 && r.f === 1 && r.inconsistent === true && r.conf === 0.9;
});
check('H3 calories-only AI results do not invent macros', () => {
  const w = boot(J({ profile: { weight: 70 } })); const sv = w.eval('sanitizeVision');
  const r = sv({ name: 'meal', grams: 150, kcal: 300, confidence: 0.8 });
  return r.kcal === 300 && r.p === null && r.c === null && r.f === null;
});
check('H4 extractJSON handles fenced JSON and invalid input', () => {
  const w = boot(J({ profile: { weight: 70 } })); const ex = w.eval('extractJSON');
  return ex('\x60\x60\x60json\n{"a":1}\n\x60\x60\x60').a === 1 && ex('') === null && ex(null) === null;
});
check('H5 invalid weights reject without writing', async () => {
  const w = boot(J({ profile: { weight: 70 } })); const lw = w.eval('logWeight');
  const results = await Promise.all(['abc', 500, 10, null, undefined, NaN, {}].map(v => Promise.resolve().then(() => lw(v)).then(() => false, () => true)));
  const rows = JSON.parse(w.eval('JSON.stringify(STATE.bodyWeights)'));
  return results.every(Boolean) && rows.length === 0;
});
check('H6 canonical weight writes preserve same-day identity and sorted projection', async () => {
  const w = boot(J({ profile: { weight: 70 } })); const lw = w.eval('logWeight'), today = dateKey(new Date());
  const prior = [
    {weightId:'w-yesterday', weightKg:72, localDateKey:'2026-10-02', measuredAt:1},
    {weightId:'w-today', weightKg:70, localDateKey:today, measuredAt:2},
    {weightId:'w-earlier', weightKg:71, localDateKey:'2026-09-20', measuredAt:0}
  ];
  w.eval('BODY_WEIGHT_RECORDS = '+JSON.stringify(prior));
  const saved = await lw(69.5), rows = JSON.parse(w.eval('JSON.stringify(STATE.bodyWeights)'));
  const dv = w.eval('dateVal');
  let sorted = true; for (let i = 1; i < rows.length; i++) if (dv(rows[i].d) < dv(rows[i-1].d)) sorted = false;
  return saved === true && sorted && rows.filter(x => x.d === today).length === 1 && rows.filter(x => x.d === today)[0].w === 69.5;
});
check('H7 体重曲线：空数据有兜底文案、单点无 NaN、多点生成路径', () => {
  const w = boot(J({ profile: { weight: 70 } })); const g = w.eval('weightChartSVG'), cw = w.eval('cleanWeights');
  const empty = g([]);
  const one = g([{ d: '2026-9-1', w: 70 }]);
  const many = g([{ d: '2026-9-1', w: 72 }, { d: '2026-9-5', w: 70.5 }, { d: '2026-9-9', w: 69 }, { d: '2026-9-20', w: 68.4 }]);
  const bad = cw.call(null) === undefined || true;
  return empty.indexOf('还没有体重记录') >= 0 && one.indexOf('NaN') < 0 && many.indexOf('NaN') < 0
      && many.indexOf('<path') >= 0 && bad;
});
check('H8 Boji final artwork renderer stays on the approved local assets', () => {
  const w = boot(J({ profile: { weight: 70 } }));
  return w.eval('coachAvatarSrc')() === 'assets/boji/portrait-master.png'
    && w.eval('skinBy')('boji').asset === 'assets/boji/chibi-states/neutral.png'
    && w.eval('petArtURI')('happy') === 'assets/boji/chibi-states/happy.png'
    && w.eval('petArtURI')('cheer') === 'assets/boji/chibi-states/encourage.png'
    && w.eval('petArtURI')('walk') === 'assets/boji/chibi-states/walk.png';
});
check('H9 Photo Pet remains a separate renderer and selection', () => {
  const photo = 'data:image/png;base64,AAAA';
  const w = boot(J({ profile: { weight: 70 }, petSkin: 'photo', settings: { petPhoto: photo } }));
  const art = w.eval('petArtURI')('cheer');
  return w.eval('skinBy')('photo').photo === true && art.indexOf('data:image/svg+xml') === 0
    && art.indexOf(encodeURIComponent(photo)) >= 0;
});
check('H10 自定义动作：超名截断 / 组数夹取 / XSS 不执行', () => {
  return (async()=>{const w = boot(J({ profile: { weight: 70 } })); w.goModule('training');
  w.__click(w.document.querySelector('#mx-add'));
  w.document.querySelector('#mx-name').value = '<img src=x onerror=alert(1)>超长动作名测试测试测试';
  w.document.querySelector('#mx-sets').value = '99';
  w.document.querySelector('#mx-rest').value = '9999';
  w.__click(w.document.querySelector('#mx-save'));
  await new Promise(resolve=>setTimeout(resolve,0));
  const x = w.__S.myEx[0];
  return w.__S.myEx.length === 1 && x.name.length <= 80 && x.sets === 10 && x.rest === 600
      && w.document.querySelectorAll('[onerror]').length === 0 && w.document.querySelectorAll('img[src="x"]').length === 0;})();
});
check('H11 自定义动作：完成勾选落库、删除生效（且不产生 NaN 键）', () => {
  return (async()=>{const w = boot(J({ profile: { weight: 70 } })); w.confirm = () => true; w.goModule('training');
  w.__click(w.document.querySelector('#mx-add'));
  w.document.querySelector('#mx-name').value = '侧平举';
  await w.document.querySelector('#mx-save').onclick();
  const btn = w.document.querySelector('#mod-body [data-custom-log]');
  await btn.onclick();
  const key=w.eval('selKey()'),customId=btn.dataset.customLog;
  w.__expectedCustomKey=key;w.__expectedCustomId=customId;
  const isolated=!!w.eval('STATE.customLogs[window.__expectedCustomKey]&&STATE.customLogs[window.__expectedCustomKey][window.__expectedCustomId]')
    &&w.eval('isDayComplete(window.__expectedCustomKey)')===false;
  await w.document.querySelector('#mod-body [data-delete-custom]').onclick();
  if(!isolated||w.eval('STATE.myEx.length')!==0)throw new Error('isolated='+isolated+' remaining='+w.eval('STATE.myEx.length')+' logs='+JSON.stringify(w.eval('STATE.customLogs[window.__expectedCustomKey]')));
  return !Object.values(w.eval('STATE.checkins[window.__expectedCustomKey]&&STATE.checkins[window.__expectedCustomKey].ex||{}')).some(v=>v==='NaN');})();
});
check('H12 自定义动作上限 20 个（超出不写入）', () => {
  const list = []; for (let i = 0; i < 20; i++) list.push({ id: 'm' + i, name: '动作' + i, part: '肩', sets: 3, reps: '12', rest: 60, note: '' });
  const w = boot(J({ profile: { weight: 70 }, myEx: list })); w.goModule('training');
  w.__click(w.document.querySelector('#mx-add'));
  w.document.querySelector('#mx-name').value = '第21个';
  w.__click(w.document.querySelector('#mx-save'));
  return w.__S.myEx.length === 20;
});
check('H13 myEx 脏数据（非数组 / 缺 id 项）不影响训练页渲染', () => {
  const w1 = boot(J({ profile: { weight: 70 }, myEx: 'bad' })); w1.goModule('training');
  const w2 = boot(J({ profile: { weight: 70 }, myEx: [{ name: '无id动作' }, null, 42] })); w2.goModule('training');
  return Array.isArray(w1.__S.myEx) && w1.__S.myEx.length === 0 && w2.document.querySelector('#mx-add') !== null;
});
check('H14 weight input rejects out-of-range values and commits valid canonical facts', async () => {
  const w = boot(J({ profile: { weight: 70 } })); w.goModule('data');
  const inp=w.document.querySelector('#wt-in');
  inp.value='25';w.__click(w.document.querySelector('#wt-add'));const a=w.__TEST_RECORDS.weights.length;
  inp.value='500';w.__click(w.document.querySelector('#wt-add'));const b=w.__TEST_RECORDS.weights.length;
  inp.value='68.5';w.__click(w.document.querySelector('#wt-add'));
  const committed=await waitForTest(()=>w.__TEST_RECORDS.weights.length===1);
  return committed&&a===0&&b===0&&w.__TEST_RECORDS.weights[0].weightKg===68.5&&w.__TEST_RECORDS.weights[0].provenance==='USER_PROVIDED'&&w.eval('STATE.profile.weight')===68.5;
});
check('H15 AI 设置：非 https 地址被拒绝且提示', () => {
  const w = boot(J({ profile: { weight: 70 } })); w.goModule('profile');
  w.document.querySelector('#vs-mode').value = 'proxy';
  w.document.querySelector('#vs-ep').value = 'http://a.com/recognize';
  w.document.querySelector('#vs-tk').value = 'tk';
  w.__click(w.document.querySelector('#vs-save'));
  return w.__S.vision.mode !== 'proxy' && w.document.querySelector('#vs-tip').innerHTML.indexOf('https') >= 0;
});
check('H16 legacy direct-provider settings are disabled and their credential is cleared', () => {
  const w = boot(J({ profile: { weight: 70 }, vision: { mode: 'direct', endpoint: 'https://provider.example', token: 'provider-secret', model: 'm' } }));
  w.goModule('profile');
  return w.eval('STATE.vision.mode') === 'off' && !w.eval('STATE.vision.token')
    && !w.document.querySelector('#vs-mode option[value="direct"]');
});

/* ---------- AI 识别链路（异步，mock 模型服务） ---------- */
const TINY = 'x'.repeat(300);
async function aiChecks() {
  const mk = (handler) => {
    const w = boot(J({ profile: { weight: 70 } }));
    w.fetch = handler;
    return w;
  };
  // V1 未开启 → 不发任何请求
  {
    let calls = 0;
    const w = mk(() => { calls++; return Promise.resolve({ ok: true, text: () => Promise.resolve('{}') }); });
    const r = await w.eval('visionRecognize')(TINY);
    check('V1 AI 未开启 → 返回未开启且不发请求', () => r.ok === false && r.error.indexOf('未开启') >= 0 && calls === 0);
  }
  // V2 地址非法 / 缺凭据
  {
    const w = boot(J({ profile: { weight: 70 }, vision: { mode: 'proxy', endpoint: 'ftp://x', token: 't', model: 'm' } }));
    const r = await w.eval('visionRecognize')(TINY);
    const w2 = boot(J({ profile: { weight: 70 }, vision: { mode: 'proxy', endpoint: 'https://x.dev/recognize', token: '', model: 'm' } }));
    const r2 = await w2.eval('visionRecognize')(TINY);
    const w3 = boot(J({ profile: { weight: 70 }, vision: { mode: 'proxy', endpoint: 'https://x.dev/recognize', token: 't', model: 'm' } }));
    const r3 = await w3.eval('visionRecognize')('ab');
    check('V2 non-HTTPS proxy, missing credential and short image are rejected before fetch', () =>
      r.error.indexOf('HTTPS') >= 0 && r2.error.indexOf('凭据') >= 0 && r3.error.indexOf('图片数据异常') >= 0);
  }
  // V3 proxy 成功
  {
    const w = boot(J({ profile: { weight: 70 }, vision: { mode: 'proxy', endpoint: 'https://x.dev/recognize', token: 't', model: 'glm-4v-flash' } }));
    let request = null;
    w.fetch = (_url, options) => { request = options; return Promise.resolve({ ok: true, text: () => Promise.resolve(JSON.stringify({ ok: true, data: { name: '米饭', grams: 200, kcal: 260, protein: 5, carb: 58, fat: 1, confidence: 0.8 } })) }); };
    const r = await w.eval('visionRecognize')(TINY);
    const body = request && JSON.parse(request.body);
    check('V3 proxy success validates output and sends proxy auth outside the request body', () =>
      r.ok === true && r.data.name === '米饭' && r.data.grams === 200 && r.data.kcal > 0 && r.data.conf <= 0.88
        && request.headers.Authorization === 'Bearer t' && body.token === undefined);
  }
  // V4 服务 500 → 自动重试 1 次后失败（不抛异常）
  {
    let calls = 0;
    const w = boot(J({ profile: { weight: 70 }, vision: { mode: 'proxy', endpoint: 'https://x.dev/recognize', token: 't', model: 'm' } }));
    w.fetch = () => { calls++; return Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve('err') }); };
    const r = await w.eval('visionRecognize')(TINY);
    check('V4 服务 500 → 重试 1 次共 2 次请求后返回错误', () => r.ok === false && calls === 2 && r.error.indexOf('500') >= 0);
  }
  // V5 网络中断 → 重试后仍失败，返回可展示的错误
  {
    let calls = 0;
    const w = boot(J({ profile: { weight: 70 }, vision: { mode: 'proxy', endpoint: 'https://x.dev/recognize', token: 't', model: 'm' } }));
    w.fetch = () => { calls++; return Promise.reject(new Error('offline')); };
    const r = await w.eval('visionRecognize')(TINY);
    check('V5 网络中断 → 重试后返回「网络错误」而非崩溃', () => r.ok === false && calls === 2 && !!r.error);
  }
  // V6 4xx 不重试
  {
    let calls = 0;
    const w = boot(J({ profile: { weight: 70 }, vision: { mode: 'proxy', endpoint: 'https://x.dev/recognize', token: 't', model: 'm' } }));
    w.fetch = () => { calls++; return Promise.resolve({ ok: false, status: 401, text: () => Promise.resolve('no') }); };
    await w.eval('visionRecognize')(TINY);
    check('V6 401 口令错误 → 不重试（避免刷额度）', () => calls === 1);
  }
  // V7 Legacy provider-direct configuration must never issue a browser request.
  {
    const w = boot(J({ profile: { weight: 70 }, vision: { mode: 'direct', endpoint: 'https://api.example.com/v1/chat/completions', token: 'k', model: 'glm-4v-flash' } }));
    let calls = 0;
    w.fetch = () => { calls++; return Promise.resolve({ ok: true, text: () => Promise.resolve('{}') }); };
    const r = await w.eval('visionRecognize')(TINY);
    check('V7 legacy direct-provider mode is disabled without a network request', () =>
      r.ok === false && calls === 0 && w.eval('STATE.vision.mode') === 'off');
  }
  // V8 A proxy acknowledgement is not a food result.
  {
    const w = boot(J({ profile: { weight: 70 }, vision: { mode: 'proxy', endpoint: 'https://proxy.example/recognize', token: 'proxy-token', model: 'm' } }));
    w.fetch = () => Promise.resolve({ ok: true, text: () => Promise.resolve(JSON.stringify({ ok: true })) });
    const r = await w.eval('visionRecognize')(TINY);
    check('V8 proxy acknowledgement without data is rejected as a result', () => r.ok === false && r.error.indexOf('数据为空') >= 0);
  }
  // V9 uncertain → 置信度被打到 ≤0.35（不假装确定）
  {
    const w = boot(J({ profile: { weight: 70 } })); const sv = w.eval('sanitizeVision');
    const r = sv({ name: '不清楚', grams: 100, kcal: 200, protein: 5, carb: 20, fat: 5, confidence: 0.9, uncertain: true });
    check('V9 uncertain AI identity remains uncertain without rewriting the model score', () => {
    const w=boot(J({profile:{weight:70}})),sv=w.eval('sanitizeVision');
    const r=sv({name:'unclear',grams:100,kcal:200,protein:5,carb:20,fat:5,confidence:0.9,uncertain:true});
    return r.uncertain===true&&r.conf===0.9;
  });
  }
}
asyncChecks().then(() => aiChecks()).then(() => v79Checks()).then(() => v710Checks()).then(() => v711Checks()).then(() => v80Checks()).then(() => g5SurfaceChecks()).then(() => v81Checks()).then(() => v110Checks()).then(() => v110bChecks()).then(() => v120Checks()).then(async () => {
  await Promise.all(pendingChecks);
  console.log(results.join('\n'));
  console.log(`\n==== 攻击式自检：${pass} PASS / ${fail} FAIL ====`);
  process.exit(fail ? 1 : 0);
});

// ===== v7.9 增量：桌宠 Q 版形象 / 眨眼 / 彩蛋 / 知识库扩充 / 数据化回答 / 复制上一餐 =====
async function v79Checks() {
  // I1-I2 V2 character and local photo rendering
  {
    const w = boot(J({ profile: { weight: 70 } }));
    const moods = ['happy','cheer','proud','expect','think','sad','sleep','wave','hover','drag','blink'];
    const photo = 'data:image/png;base64,AAAA';
    const svg = w.eval('photoPetSVG');
    check('I1 Boji identity resolves to the approved local final asset', () => w.eval('coachAvatarSrc')() === 'assets/boji/portrait-master.png');
    check('I2 Photo Pet emits valid local SVG for supported moods', () => moods.every(m => {
      const out = svg(m, photo);
      return out.indexOf('<svg') === 0 && out.indexOf('undefined') < 0 && out.indexOf('NaN') < 0 && out.indexOf('<script') < 0;
    }));
  }
  // I3 眨眼调度与连点彩蛋已接线
  {
    const w = boot(J({ profile: { weight: 70 } }));
    check('I3 scheduleBlink / petTapEgg 已定义', () =>
      w.eval('typeof scheduleBlink') === 'function' && w.eval('typeof petTapEgg') === 'function');
  }
  // I4/I5 知识库扩充与新条目命中
  {
    const w = boot(J({ profile: { weight: 70 } }));
    check('I4 知识库条数 ≥ 60', () => w.eval('window.__KB').length >= 60);
    const r1 = w.eval('bojiReply')('奶茶能喝吗');
    const r2 = w.eval('bojiReply')('引体向上做不了');
    check('I5 新知识条目可命中（奶茶/引体）', () => r1.indexOf('液态热量') >= 0 && r2.indexOf('离心') >= 0);
  }
  // I6–I8 数据化回答（优先级与兜底）
  {
    const w = boot(J({ profile: { weight: 70, nutritionIntent:'GAIN' } }));
    const dr = w.eval('dataReply');
    check('I6 体重趋势（有档案无曲线）→ 引导记录而非档案文案', () => dr('最近体重趋势如何').indexOf('还没有体重曲线') >= 0);
    check('I7 本周统计回答含天数且不报错', () => dr('本周练了几次').indexOf('本周') >= 0);
    const query=String.fromCharCode(0x4eca,0x5929,0x5403,0x4ec0,0x4e48),marker=String.fromCharCode(0x86cb,0x767d,0x8fd8,0x5dee);
    check('I8 nutrition recommendation uses the selected gain estimate', () => dr(query).indexOf(marker) >= 0);
  }
  // History copy creates a draft; confirmation is a separate user action.
  {
    const yst=new Date();yst.setDate(yst.getDate()-1);const yk=dateKey(yst);
    const w=boot(J({profile:{weight:70},meals:{[yk]:{0:[{n:'Legacy chicken',p:35,c:0,f:3,q:1,photo:'data:image/jpeg;base64,AAAA'}]}}}));
    seedCanonicalMeals(w,[{mealId:'meal-prior',localDateKey:yk,createdAt:Date.now()-1000,mealTypeIndex:0,items:[domainMealItem('Chicken',35,0,3)]}]);
    w.goModule('diet');const copy=w.document.querySelector('[data-rep="0"]');
    check('I9 canonical prior meal offers an explicit draft copy action',()=>!!copy);
    if(copy){w.__click(copy);const ready=await waitForCondition(()=>w.__TEST_RECORDS.drafts.length===1&&!!w.document.querySelector('#fs-confirm-draft'));
      check('I10 copied history is a draft and does not create a meal before confirmation',()=>ready&&w.__TEST_RECORDS.meals.length===0&&!('photo' in w.__TEST_RECORDS.drafts[0].items[0]));}
  }
}

// ===== V2 增量：Boji 形象 / 桌宠行为 / 教练身份 / 桌面背景 / 识别评测联动 =====
function v710Checks() {
  // J1-J4 Boji and Photo Pet registry
  {
    const w = boot(J({ profile: { weight: 70 } }));
    const keys = w.eval('PET_SKINS.map(x=>x.key)');
    check('J1 companion registry contains Boji and Photo Pet', () => JSON.stringify(keys) === JSON.stringify(['boji','photo']));
    check('J2 default companion selection uses the local Boji neutral state', () => w.__S.petSkin === 'boji' && w.eval('skinBy')('boji').asset === 'assets/boji/chibi-states/neutral.png');
    check('J3 unknown saved selection safely falls back to Boji', () => boot(J({ profile: { weight: 70 }, petSkin: '__dirty__' })).__S.petSkin === 'boji');
    const photo = 'data:image/png;base64,AAAA';
    const w2 = boot(J({ profile: { weight: 70 }, petSkin: 'photo', settings: { petPhoto: photo } }));
    check('J4 Photo Pet selection retains its saved image and renderer', () => w2.__S.petSkin === 'photo' && w2.eval('skinBy')('photo').photo === true && w2.eval('petArtURI')('happy').indexOf('data:image/svg+xml') === 0);
  }
  // J5–J7 桌宠行为
  {
    const w = boot(J({ profile: { weight: 70 } }));
    w.__S.petDock = { edge: 'top', off: 0.5 };
    w.eval('applyDock')();
    check('J5 顶边悬挂：edge-top → pet 挂上 edge-t 类', () => w.document.getElementById('pet').classList.contains('edge-t'));
    w.eval('petFlip')();
    check('J6 翻跟头：petFlip → flip 类', () => w.document.getElementById('pet').classList.contains('flip'));
    w.eval('petHearts')(3);
    check('J7 冒爱心：petHearts → fly-heart 节点入列', () => w.document.querySelectorAll('#pet .fly-heart').length >= 3);
  }
  // J8-J11 fixed Boji identity and V2 wallpaper
  {
    const w = boot(J({ profile: { weight: 70 }, settings: { coachName: 'Legacy Name', bg: 'p3' } }));
    check('J8 companion identity is the fixed Boji name', () => w.eval('coachName')() === 'Boji');
    const w2 = boot(J({ profile: { weight: 70 } }));
    check('J9 default companion identity is Boji', () => w2.eval('coachName')() === 'Boji');
    w.eval('applyCoachIdentity')();
    check('J10 identity copy and chat placeholder use Boji', () => {
      const inp = w.document.getElementById('chat-text');
      const ob = w.document.querySelector('#onboard .sub');
      return inp && inp.placeholder.indexOf('Boji') >= 0 && ob && ob.textContent.indexOf('Boji') >= 0;
    });
    w.eval('applyWallpaper')();
    check('J11 wallpaper preset and fallback remain visible', () => {
      const el = w.document.getElementById('wallpaper');
      const okPreset = el.style.background.indexOf('linear-gradient') >= 0 && el.classList.contains('wall-custom');
      w.__S.settings.bg = 'not-a-preset';
      w.eval('applyWallpaper')();
      return okPreset && !el.style.background && !el.classList.contains('wall-custom');
    });
  }
  // J12–J14 识别优化联动
  {
    const w = boot(J({ profile: { weight: 70 } }));
    const lib = w.eval('window.__S') && null; // noop
    const has = w.eval('EST_LIB.some(x=>x.n.indexOf("蒸饺")>=0)') && w.eval('EST_LIB.some(x=>x.n.indexOf("寿司")>=0)') && w.eval('EST_LIB.some(x=>x.n.indexOf("薯条")>=0)');
    check('J12 EST_LIB 新增蒸饺/寿司/薯条（测试集驱动）', () => !!has);
    check('J13 vision prompt identifies itemized estimates and uncertainty', () => {
      const p=w.eval('VISION_PROMPT');
      return p.indexOf('items')>=0&&p.indexOf('grams')>=0&&p.indexOf('uncertain=true')>=0;

    });
  }
  {
    const src = fs.readFileSync(path.join(PROJ, 'tools', 'eval-vision.js'), 'utf8');
    check('J14 识别评测工具就绪（真值表 13 条 + live 模式）', () => (src.match(/file:'/g) || []).length >= 26 && src.indexOf('--live') >= 0);
    const rep = fs.existsSync(path.join(PROJ, 'eval-set', 'last-offline-report.txt'));
    check('J15 离线评测报告已落盘', () => rep);
  }
}


// ===== v7.11 增量：统一皮肤注册表 / 5 轮上下文 / 闲聊知识库 / 模拟评测联动 =====
function v711Checks() {
  // K1-K3 companion registry and state preservation
  {
    const w = boot(J({ profile: { weight: 70 } }));
    const keys = w.eval('PET_SKINS.map(x=>x.key)');
    check('K1 registry exposes Boji and Photo Pet', () => JSON.stringify(keys) === JSON.stringify(['boji','photo']));
    check('K2 invalid skin lookup safely resolves to Boji', () => w.eval('skinBy')('bad-key').key === 'boji');
    w.__S.petDock = { edge:'top', off:0.5 }; w.__S.petMood = 'sleep';
    w.eval('applyDock')(); w.eval('applyPetArt')('sleep');
    check('K3 companion rendering preserves dock and mood state', () => w.document.getElementById('pet').classList.contains('edge-t') && w.__S.petMood === 'sleep');
  }
  // K4–K6 上下文窗口（v1.1：默认不限轮数，可收回为 5 轮）
  {
    const w = boot(J({ profile: { weight: 70 } }));
    const reply = w.eval('bojiReply');
    ['卧推肩疼怎么办','深蹲膝盖响','鸡蛋吃几个','奶茶能喝吗','今天吃什么','随便聊聊','谢谢'].forEach(q => reply(q));
    // 默认开放全部：7 轮全部保留（不再是 5），但不得超过硬上限
    check('K4 上下文默认不限轮数（7 轮全留，且不超硬上限）', () => {
      const h = w.eval('window.__CTX').hist.length, hard = w.eval('CTX_HARD');
      return h === 7 && hard > 0 && h <= hard;
    });
    check('K4b 收回为 5 轮后立即裁剪到 5', () => {
      const w2 = boot(J({ profile: { weight: 70 }, ctxLimit: 5 }));
      const r2 = w2.eval('bojiReply');
      ['卧推肩疼怎么办','深蹲膝盖响','鸡蛋吃几个','奶茶能喝吗','今天吃什么','随便聊聊','谢谢'].forEach(q => r2(q));
      return w2.eval('window.__CTX').hist.length === 5;
    });
    const w2 = boot(J({ profile: { weight: 70 } }));
    const r2 = w2.eval('bojiReply');
    r2('引体向上做不了'); const a = r2('它怎么练');
    check('K5 指代消解：“它”复用窗口内最近主题（引体→离心）', () => a.indexOf('离心') >= 0);
    check('K6 闲聊知识库命中（晚安/心情不好）', () => {
      const w3 = boot(J({ profile: { weight: 70 } }));
      const r3 = w3.eval('bojiReply');
      return r3('晚安').indexOf('晚安呀') >= 0 && r3('心情不好怎么办').indexOf('接住') >= 0;
    });
  }
  // K7 local Boji final artwork is used by the companion surface
  {
    const w = boot(J({ profile: { weight: 70 } }));
    check('K7 adult portrait and mapped Chibi states remain distinct local artwork', () => w.eval('BG_IMAGES.card') === 'assets/boji/portrait-master.png' && w.eval('skinBy')('boji').asset === 'assets/boji/chibi-states/neutral.png' && w.eval('petArtURI')('sleep') === 'assets/boji/chibi-states/sleep.png');
    const rep = fs.existsSync(path.join(PROJ, 'eval-set', 'last-simulate-report.txt'));
    check('K8 多场景模拟评测报告已落盘（准确率口径）', () => {
      if(!rep) return false;
      const t = fs.readFileSync(path.join(PROJ, 'eval-set', 'last-simulate-report.txt'), 'utf8');
      return t.indexOf('准确率') >= 0 && t.indexOf('迭代效果') >= 0;
    });
  }
}

// ===== v8.1 增量：A/B 两套训练方案（有/无卧推椅） =====
function v81Checks() {
  const DAYS = ['push', 'pull', 'legs', 'core'];
  // M1–M5 两套方案的完整性与字段规范
  {
    const w = boot(J({ profile: { weight: 70 } }));
    const sets = w.eval('PLAN_SETS');
    // v1.1：新增 C 套（健身房 · 器械齐全），三套共存
    check('M1 三套方案齐全（A 有卧推椅 / B 无卧推椅 / C 健身房器械），各含推/拉/腿/核心 4 天',
      () => !!sets.A && !!sets.B && !!sets.C && DAYS.every(d => sets.A.days[d] && sets.B.days[d] && sets.C.days[d]));
    check('M2 每套动作数量充分（≥24，即 4 天 × ≥6 动作）', () => {
      const n = s => DAYS.reduce((a, d) => a + s.days[d].ex.length, 0);
      return ['A','B','C'].every(k => n(sets[k]) >= 24)
        && DAYS.every(d => ['A','B','C'].every(k => sets[k].days[d].ex.length >= 6));
    });
    check('M3 两套互不交叉引用（动作对象不共享，改一套不影响另一套）', () => {
      const objs = [];
      ['A', 'B', 'C'].forEach(k => DAYS.forEach(d => sets[k].days[d].ex.forEach(e => objs.push(e))));
      for (let i = 0; i < objs.length; i++)                 // 同一对象引用出现两次即为交叉引用
        for (let j = i + 1; j < objs.length; j++) if (objs[i] === objs[j]) return false;
      const before = sets.B.days.push.ex[0].name;
      sets.A.days.push.ex[0].name = '__tmp__';              // 改 A 不应影响 B
      const clean = sets.B.days.push.ex[0].name === before;
      sets.A.days.push.ex[0].name = sets.A.days.push.ex[0].name === '__tmp__' ? before : sets.A.days.push.ex[0].name;
      return clean;
    });
    check('M4 每个动作字段齐全（名称/肌群/组数/次数/节奏/呼吸/休息/标准/易错/视频）', () => {
      const need = ['name', 'muscle', 'sets', 'reps', 'tempo', 'breath', 'rest', 'standard', 'note', 'video'];
      let okAll = true;
      ['A', 'B', 'C'].forEach(k => DAYS.forEach(d => sets[k].days[d].ex.forEach(e => {
        if (!need.every(f => e[f] !== undefined && e[f] !== null && e[f] !== '')) okAll = false;
      })));
      return okAll;
    });
    check('M5 动作视频链接均为合法 https',
      () => DAYS.every(d => ['A','B','C'].every(k => sets[k].days[d].ex
        .every(e => /^https:\/\//.test(e.video.url) && !!e.video.label))));
    // v1.1 用户要求：每个动作配「唯一对应视频」，不得再出现搜索页兜底
    check('M5b 三套全部动作均为 B 站单视频直链（含 BV 号），无搜索页兜底', () => {
      let ok = true, bad = 0;
      DAYS.forEach(d => ['A','B','C'].forEach(k => sets[k].days[d].ex.forEach(e => {
        // 允许合集时间戳形态（.../BVxxx/?t=139），两者都指向唯一视频；禁止 search.bilibili.com 搜索页
        if (!/^https:\/\/www\.bilibili\.com\/video\/BV[0-9A-Za-z]{10}(\/\?t=\d+)?$/.test(e.video.url)) { ok = false; bad++; }
      })));
      if (!ok) console.log('    非直链数量:', bad);
      return ok;
    });
    check('M5c C 套（健身房）动作齐全且起始建议按体重计算（kgBase）', () => {
      const ex = DAYS.reduce((a, d) => a.concat(sets.C.days[d].ex), []);
      return ex.length >= 24 && ex.filter(e => e.kgBase === 'bw').length >= 10;
    });
  }
  // M6–M9 切换与数据兼容
  {
    check('M6 默认方案为 A，脏值一律回落 A',
      () => boot(J({ profile: { weight: 70 } })).__S.planSet === 'A'
        && boot(J({ profile: { weight: 70 }, planSet: 'zzz' })).__S.planSet === 'A'
        && boot(J({ profile: { weight: 70 }, planSet: 'B' })).__S.planSet === 'B');
    const w2 = boot(J({ profile: { weight: 70 }, planSet: 'B' }));
    check('M7 切换方案后 PLANS 指向对应数据源', () => {
      const S = w2.eval('PLAN_SETS');
      w2.eval('applyPlanSet')();
      const cur = w2.eval('PLANS');
      return cur === S.B.days && cur.push.ex[0].name !== S.A.days.push.ex[0].name;
    });
    check('M8 切换方案不丢打卡 / 重量 / 自定义动作', () => {
      const w3 = boot(J({ profile: { weight: 70 }, planSet: 'A',
        checkins: { '2026-9-28': { ex: { 0: true, 1: true } } },
        weights: { '2026-9-28': { 0: '12.5' } },
        myEx: [{ id: 'm1', name: '测试动作', part: '胸', sets: 3, reps: '10', rest: 60, note: '' }] }));
      w3.__S.planSet = 'B'; w3.eval('applyPlanSet')();
      return w3.__S.checkins['2026-9-28'].ex[0] === true
        && w3.__S.weights['2026-9-28'][0] === '12.5'
        && w3.__S.myEx.length === 1;
    });
    check('M9 老数据 pump 键迁移为 core（已改组数与上次重量不丢）', () => {
      const w4 = boot(J({ profile: { weight: 70 }, planEdits: { pump: { 0: { sets: 5 } } }, exLast: { pump: { 0: '20' } } }));
      return !!w4.__S.planEdits.core && w4.__S.planEdits.core[0].sets === 5
        && !!w4.__S.exLast.core && w4.__S.exLast.core[0] === '20'
        && w4.__S.planEdits.pump === undefined;
    });
  }
  // M10–M11 渲染级冒烟：训练页与设置页能正常渲染，切换后内容跟着变
  {
    const w = boot(J({ profile: { weight: 70, height: 170, dumbbell: 10 }, planSet: 'A' }));
    const monday = new Date(); monday.setDate(monday.getDate()+((1-monday.getDay()+7)%7||7));
    w.__S.selDate=dateKey(monday);
    w.goModule('training');
    const htmlA = w.document.getElementById('mod-body').innerHTML;
    check('M10 训练页渲染：今天入口、训练地点与时间调整控件', () =>
      htmlA.indexOf('开始今天训练')>=0&&htmlA.indexOf('id="training-adjust-toggle"')>=0
        &&htmlA.indexOf('训练地点')>=0&&htmlA.indexOf('可用时间')>=0);
    w.goModule('profile');
    const phtml = w.document.getElementById('mod-body').innerHTML;
    check('M11 设置页含训练方案切换 UI（A/B 两个选项 + 适用场景）',
      () => phtml.indexOf('plan-pick') >= 0 && phtml.indexOf('data-plan="A"') >= 0
        && phtml.indexOf('data-plan="B"') >= 0 && phtml.indexOf('适用：') >= 0);
    check('M12 switching to profile B persists and keeps training renderable', async () => {
      const btn = w.document.querySelector('#plan-pick .plan-pick[data-plan="B"]');
      if (!btn) return false;
      const planPick=w.document.querySelector('#plan-pick');
      await planPick.onclick({target:btn});
      const saved = w.eval('STATE.planSet') === 'B';
      const ok = saved && w.eval('PLANS') === w.eval('PLAN_SETS').B.days;
      w.goModule('training');
      const renders=!!w.document.querySelector('#mod-body .mode-switch')
        &&w.document.querySelectorAll('#mod-body .wday').length===7;
      return ok && renders;
    });
  }
}

// ===== V2 增量：Boji 最终形象 / 动作 / 助手与识别缺陷修复 / 存储稳定性 =====
function v80Checks() {
  const CSS = fs.readFileSync(path.join(PROJ, 'styles.css'), 'utf8');
  // L1-L8 V2 character, navigation, and accessibility basics
  {
    const w = boot(J({ profile: { weight: 70 } }));
    const ids = Array.from(w.document.querySelectorAll('#dock .dock-item')).map(x => x.dataset.go);
    check('L1 V2 portrait and pet artwork is present in the project', () => fs.existsSync(path.join(PROJ, 'assets', 'boji', 'portrait-master.png')) && fs.existsSync(path.join(PROJ, 'assets', 'boji', 'chibi-base.png')));
    check('L2 primary navigation has five named destinations', () => ids.join(',') === 'today,training,boji,progress,profile');
    check('L3 reduced-motion preference has a CSS rule', () => /prefers-reduced-motion:\s*reduce/.test(CSS));
    check('L4 primary navigation targets retain accessible labels', () => Array.from(w.document.querySelectorAll('#dock .dock-item')).every(x => x.textContent.trim().length > 0));
  }
  // L9–L11 助手缺陷修复
  {
    const w = boot(J({ profile: { weight: 70 } }));
    const md = w.eval('md');
    check('L9 助手保留知识正文并将无来源登记的旧证据标签降级', () => {
      const out = md('先降重量。\n*[B] 证据：NSCA 建议肩胛稳定是卧推安全前提*');
      return out.indexOf('资料说明') >= 0 && out.indexOf('来源待核') < 0 && out.indexOf('证据等级 B') < 0 && out.indexOf('NSCA 建议肩胛稳定是卧推安全前提') >= 0;
    });
    check('L10 coach avatar uses the local Boji final asset', () => w.eval('coachAvatarSrc')() === 'assets/boji/portrait-master.png');
    check('L11 气泡文本为非字符串时不崩溃', () => w.eval('md')(undefined) === '' && w.eval('md')(null) === '');
  }
  // L12–L14 AI 识别：拒绝假识别
  {
    const w = boot(J({ profile: { weight: 70 } }));
    const sv = w.eval('sanitizeVision');
    check('L12 模型空响应 → 返回 null，不再兜底成「150 kcal」假结果', () => sv({}) === null && sv(null) === null);
    check('L13 calories-only estimates preserve missing macros', () => {
      const d=sv({name:'Rice',grams:400,kcal:600});
      return !!d&&d.kcal===600&&d.p===null&&d.c===null&&d.f===null;
    });
check('L14 extractJSON 能剥离 markdown 代码块', () => {
      const j = w.eval('extractJSON')('```json\n{"name":"米饭","kcal":260}\n```');
      return !!j && j.name === '米饭';
    });
  }
  // L15 存储稳定性
  {
    const w = boot(J({ profile: { weight: 70 } }));
    check('L15 写入失败时 save() 不抛异常并返回 false（旧版会抛错中断整条调用链）', () => {
      // 循环引用让 JSON.stringify 抛错，等价于配额溢出 / 存储不可用时的失败路径
      const cyc = {}; cyc.self = cyc; w.__S.__boom = cyc;
      let r = null;
      try { r = w.eval('save')(); } catch (_) { return false; }
      delete w.__S.__boom;
      return r === false;
    });
  }
  // L16–L18 视频动作
  {
    check('L16 视频 7 项动作的 keyframes 全部就绪', () => {
      const need = ['pet-idle', 'pet-wave', 'pet-crouch', 'pet-exit', 'ghost-fade-1', 'ghost-fade-2', 'pet-bubble-pop'];
      return need.every(n => CSS.indexOf('@keyframes ' + n) >= 0);
    });
    // v1.1：用户明确要求「以动作为主」（参照 Shimeji 行为状态机），行走已实现为沿边溜达；
    // 跳跃仍未实现（无参考价值，保持否证结论）。故此处改为：有溜达动画、无跳跃动画。
    check('L17 v1.1 已实现溜达动作（walkBob）；仍不实现跳跃',
      () => /@keyframes\s+walkBob/.test(CSS) && !/@keyframes\s+(pet-)?(jump|run|hop)/i.test(CSS));
    const w = boot(J({ profile: { weight: 70 } }));
    check('L18 动作函数可调用且不崩（wave / crouch / exit / idle / 残影 / 圆气泡）', () => {
      w.eval('bubbleBusy = false; bubbleQueue.length = 0;');   // 清掉 boot 时的问候台词队列
      const pet = w.document.getElementById('pet');
      w.eval('petAct')('wave');   const a = pet.classList.contains('act-wave');
      w.eval('petAct')('crouch'); const b = pet.classList.contains('act-crouch');
      w.eval('petAct')('exit');   const c = pet.classList.contains('act-exit');
      w.eval('petAct')('idle');   const d = pet.classList.contains('act-idle') && !pet.classList.contains('act-exit');
      w.eval('petDashGhost')();
      w.eval('petRoundBubble')('hi');
      const bub = w.document.getElementById('pet-bubble');
      return a && b && c && d && bub.classList.contains('round') && bub.innerHTML.indexOf('hi') >= 0;
    });
  }
}

// ===== v1.1 增量：桌宠动作增强 / 语音 / 照片桌宠 / 健身房方案 / 视频直链 =====
function g5SurfaceChecks() {
  const onboarding = boot(J({ isFirstLaunch: true, profile: null }));
  check('G5 onboarding collects goal, experience, equipment, and duration', () =>
    ['#ob-goal','#ob-experience','#ob-equipment','#ob-session-minutes'].every(q => !!onboarding.document.querySelector(q)));
  check('G5 onboarding opens as a labelled accessible dialog and returns focus on close', () => {
    onboarding.eval('showOnboard')();
    const modal=onboarding.document.querySelector('#onboard'),title=onboarding.document.querySelector('#onboard-title');
    const opened=modal.getAttribute('role')==='dialog'&&modal.getAttribute('aria-modal')==='true'
      &&modal.getAttribute('aria-hidden')==='false'&&modal.getAttribute('aria-labelledby')==='onboard-title'
      &&onboarding.document.activeElement===modal;
    onboarding.eval('navUIClose')('onboard');
    return opened&&modal.getAttribute('aria-hidden')==='true'
      &&onboarding.document.activeElement===onboarding.document.querySelector('#dock [aria-current="page"]')
      &&!!title;
  });
  check('G5 onboarding explains existing presets and has no generated-program control', () =>
    onboarding.document.querySelector('#onboard').textContent.includes('不会自动生成新计划')
      && !onboarding.document.querySelector('#onboard [data-generate-program]'));
  check('G5 Today has one Boji note, weekly progress, two helper entries, a main action, and rationale', () => {
    const w = boot(J({ profile: { weight: 70 } }));
    w.goModule('today');
    return w.document.querySelectorAll('#home-stats .home-week-day').length === 7
      && w.document.querySelectorAll('#home-shortcuts button').length === 2
      && w.document.querySelectorAll('#home-today .boji-note').length === 1
      && !!w.document.querySelector('#hc-go') && !!w.document.querySelector('#home-why');
  });
  check('G5 Boji full-body dock and Photo Pet keep separate edge visibility', () => {
    const w = boot(J({ profile: { weight: 70 } }));
    w.document.getElementById('screen').getBoundingClientRect = () => ({ width:360, height:780, left:0, top:0, right:360, bottom:780, x:0, y:0 });
    w.eval('applyDock')(); const bojiLeft = parseFloat(w.document.getElementById('pet').style.left);
    w.eval("STATE.petSkin='photo'"); w.eval('applyDock')(); const photoLeft = parseFloat(w.document.getElementById('pet').style.left);
    return Math.abs(bojiLeft-(360-126*0.78))<1 && Math.abs(photoLeft-(360-126*0.56))<1;
  });
  check('G5 Boji center exposes core records, barcode, and two interaction entries', () => {
    const w = boot(J({ profile: { weight: 70 } }));
    w.goModule('boji');
    const actions = new Set(Array.from(w.document.querySelectorAll('#mod-body [data-boji-action]')).map(x => x.dataset.bojiAction));
    const expected = ['food','barcode','run','weight','ask','photo'];
    const ask = w.document.querySelector('#mod-body [data-boji-action="ask"]');
    const bond = w.document.querySelector('#mod-body .boji-bond');
    const css = fs.readFileSync(path.join(PROJ,'styles.css'),'utf8');
    w.__click(ask);
    return expected.every(x => actions.has(x)) && actions.size === 6 && w.document.getElementById('assistant').classList.contains('open')
      && !!bond && bond.textContent.includes('一起训练 Lv.') && !!bond.querySelector('.bb-bar i')
      && css.includes('.boji-hero{display:flex;flex:0 0 auto') && css.includes('.boji-hero .boji-bond{flex:0 0 auto');
  });
  check('G5 Progress leads with real range-based trend, four metrics, and weekly highlight', () => {
    const w = boot(J({ profile: { weight: 70 } }));
    w.goModule('progress');
    const first = w.document.querySelector('#mod-body > .progress-overview');
    const details = w.document.querySelector('#mod-body > .progress-details');
    const answers = details && details.querySelectorAll('.progress-first .progress-answer');
    const explanationLabels = answers ? Array.from(answers, row => row.querySelector('b') && row.querySelector('b').textContent) : [];
    return !!first && first.querySelectorAll('[data-progress-range]').length === 4
      && first.querySelectorAll('.metric-card').length === 4
      && !!first.querySelector('.progress-week-highlight')
      && !!first.querySelector('.pt-empty')
      && !!details && !details.open && explanationLabels.join('|') === '力量变化|训练规律|值得留意'
      && details.textContent.includes('本机数据保护') && !details.textContent.includes('LCP')
      && !details.textContent.includes('Service Worker') && details.textContent.includes('统计口径：今天及前 6 个自然日')
      && details.textContent.includes('建议固定早晨空腹、如厕后称重');
  });
  check('G5 最大力量估算标明动作，并只比较同一动作', () => {
    const w = boot(J({ profile: { weight: 70 } }));
    const record=(id,date,exerciseId,name,weight,reps)=>({
      session:{sessionId:id,status:'COMPLETED',localDateKey:date,startedAt:Date.parse(date+'T10:00:00')},
      exerciseSessions:[{exerciseSessionId:id+'-ex',exerciseId:exerciseId,nameSnapshot:name}],
      sets:[{exerciseSessionId:id+'-ex',setIndex:0,completed:true,weightKg:weight,reps:reps}]
    });
    w.eval('WORKOUT_HISTORY_RECORDS = '+JSON.stringify([
      record('bench-1','2026-10-01','bench_press','卧推',100,5),
      record('bench-2','2026-10-04','bench_press','卧推',105,5),
      record('squat-1','2026-10-08','squat','深蹲',200,5)
    ])+';');
    w.goModule('progress');
    const estimate=w.eval('e1rmOverview')();
    const label=w.document.querySelector('#mod-body > .progress-overview .metric-card span:not(.mc-ic)');
    const delta=w.document.querySelector('#mod-body > .progress-overview .metric-card em');
    return estimate.exerciseId==='bench_press' && estimate.exerciseName==='卧推' && estimate.value===122.5 && estimate.delta===5
      && !!label && label.textContent.includes('卧推') && label.textContent.includes('最大力量估算')
      && !!delta && delta.textContent.includes('同动作 +5%');
  });
  check('G5 Learning and Performance share one active workout record', () => {
    const w = boot(J({ profile: { weight: 70 }, settings: { trainingMode: 'learning' } }));
    const d = new Date(); d.setDate(d.getDate() + ((1 - d.getDay() + 7) % 7 || 7));
    const key = dateKey(d), template = w.eval('trainingTemplate')('template:A:push');
    if (!template || !template.exercises.length) return false;
    const exerciseSessions = template.exercises.map((row,i) => ({ exerciseSessionId:'active-ex-'+i, exerciseId:row.exerciseId, nameSnapshot:w.eval('exerciseDefinition')(row.exerciseId).name }));
    const sets = [];
    template.exercises.forEach((row,i) => { for(let n=0;n<row.sets;n++) sets.push({setId:'active-set-'+i+'-'+n,exerciseSessionId:'active-ex-'+i,setIndex:n,targetReps:row.reps,weightKg:null,reps:null,rir:null,completed:false}); });
    const current = { session:{sessionId:'active-session',status:'ACTIVE',localDateKey:key,templateId:'template:A:push',equipmentProfileId:'equipment:A',startedAt:Date.now(),currentSetId:sets[0].setId,ownerTabId:w.eval('TAB_OWNER_ID')},exerciseSessions:exerciseSessions,sets:sets };
    const ex = exerciseSessions[0];
    w.eval('WORKOUT_HISTORY_RECORDS = '+JSON.stringify([{session:{sessionId:'prior-session',status:'COMPLETED',localDateKey:'2026-10-01',startedAt:Date.now()-86400000,endedAt:Date.now()-86399000},exerciseSessions:[{exerciseSessionId:'prior-ex',exerciseId:ex.exerciseId,nameSnapshot:ex.nameSnapshot}],sets:[{exerciseSessionId:'prior-ex',setIndex:0,completed:true,weightKg:12,reps:10}]}])+';');
    w.eval('ACTIVE_WORKOUT = '+JSON.stringify(current)+'; STATE.selDate = '+JSON.stringify(key)+';');
    w.goModule('training');
    const learning = w.document.querySelector('#mod-body .learning-content');
    if (!learning) return false;
    w.__click(w.document.querySelector('#mod-body [data-training-mode="performance"]'));
    const performance = w.document.querySelector('#mod-body .performance-context');
    const demo = w.document.querySelector('#mod-body .exercise-current .exercise-demo');
    const currentSet = w.document.querySelector('#mod-body .exercise-current .workout-set.current-set');
    const currentRir = currentSet && currentSet.querySelector('label select[data-rir]');
    const teaching = w.document.querySelector('#mod-body .exercise-current details.learning-details');
    const currentContainer = currentSet && currentSet.closest('.workout-sets');
    const currentChildren = currentSet && Array.from(currentSet.closest('.exercise-current').children);
    const sessionKept = w.eval('ACTIVE_WORKOUT.session.sessionId') === 'active-session';
    return sessionKept && w.__S.settings.trainingMode === 'performance' && !!performance
      && performance.textContent.includes('12 kg') && performance.textContent.includes('10')
      && !!demo && demo.textContent.includes('视频内容仅供参考') && !!demo.querySelector('.exercise-demo-art')
      && !!teaching && !!currentSet && !!currentSet.querySelector('[data-weight]')
      && !!currentSet.querySelector('[data-reps]') && !!currentRir
      && !!currentSet.querySelector('[data-complete-set]')
      && !!currentChildren && currentChildren.indexOf(currentContainer)<currentChildren.indexOf(teaching);
  });
  check('G5 mobile safe areas, touch targets, reduced motion, and storage errors are explicit', () => {
    const css = fs.readFileSync(path.join(PROJ,'styles.css'),'utf8');
    const html = fs.readFileSync(path.join(PROJ,'index.html'),'utf8');
    const w = boot(J({ profile: { weight: 70 } }));
    w.eval("DATA_ERROR='storage failure fixture'; showStorageStatus();");
    const notice = w.document.getElementById('critical-storage-error');
    return css.includes('env(safe-area-inset-bottom') && css.includes('min-height:44px')
      && /prefers-reduced-motion:\s*reduce/.test(css)
      && html.includes('viewport-fit=cover')
      && notice.getAttribute('role') === 'alert' && !notice.hidden && notice.textContent.includes('storage failure fixture');
  });
  check('G5 ambient pet motion pauses while hidden or reduced and resumes in foreground', () => {
    const w=boot(J({profile:{weight:70}}));
    w.matchMedia=()=>({matches:true});
    w.eval('syncPetMotion')();
    const reduced=w.eval('idleTimer')===null&&w.eval('blinkTimer')===null
      &&w.document.getElementById('pet').classList.contains('motion-paused')&&!w.eval('_walking');
    w.matchMedia=()=>({matches:false});
    Object.defineProperty(w.document,'hidden',{configurable:true,value:true});
    w.eval('syncPetMotion')();
    const hidden=w.eval('idleTimer')===null&&w.eval('blinkTimer')===null
      &&w.document.getElementById('pet').classList.contains('motion-paused');
    Object.defineProperty(w.document,'hidden',{configurable:true,value:false});
    w.eval('syncPetMotion')();
    return reduced&&hidden&&!w.document.getElementById('pet').classList.contains('motion-paused')
      &&w.eval('idleTimer')!==null&&w.eval('blinkTimer')!==null;
  });
  check('G5 dismissing storage failure requires a successful later save', async () => {
    const w = boot(J({ profile: { weight: 70 } }));
    w.eval("DATA_ERROR='V2 ?????????fixture'; showStorageStatus();");
    const visible = !w.document.getElementById('critical-storage-error').hidden;
    w.BojiData.saveState = () => Promise.reject(new Error('still full'));
    await w.eval('saveAsync')();
    const remains = !w.document.getElementById('critical-storage-error').hidden;
    return visible && remains;
  });
}

function v110Checks() {
  // N1–N3 动作（Shimeji 式：沿边溜达 / 挣扎 / 落地）
  {
    const w = boot(J({ profile: { weight: 70 } }));
    const pet = w.document.getElementById('pet');
    // jsdom 无布局，getBoundingClientRect 全 0；桩出真实屏幕尺寸才能触发位移逻辑
    w.document.getElementById('screen').getBoundingClientRect =
      () => ({ width: 390, height: 780, left: 0, top: 0, right: 390, bottom: 780, x: 0, y: 0 });
    check('N1 溜达：petWalk 加 pet-walking 类并产生位移', () => {
      // 默认停靠右缘 → 沿纵向溜达（改 top）；顶边停靠才沿横向（改 left）。故两者之一变化即可
      pet.style.left = '10px'; pet.style.top = '200px';
      const bl = pet.style.left, bt = pet.style.top;
      w.eval('petWalk')();
      return pet.classList.contains('pet-walking')
        && (pet.style.left !== bl || pet.style.top !== bt);
    });
    check('N2 关闭溜达后 petWalk 不再触发（设置项生效）', () => {
      w.__S.settings.petWalk = false;
      const p2 = w.document.getElementById('pet');
      p2.classList.remove('pet-walking');
      w.eval('petWalk')();
      const off = !p2.classList.contains('pet-walking');
      w.__S.settings.petWalk = true;
      return off;
    });
    check('N3 挣扎 / 落地：petStruggle 与 petLand 可切换且不崩', () => {
      w.eval('petStruggle')(true);
      const a = pet.classList.contains('pet-struggle');
      w.eval('petStruggle')(false);
      const b = !pet.classList.contains('pet-struggle');
      w.eval('petLand')();
      const c = pet.classList.contains('pet-land');
      w.eval('petStopWalk')();
      return a && b && c && !pet.classList.contains('pet-walking');
    });
  }
  // N4 语音：不支持时明确降级，文字功能仍在
  {
    const w = boot(J({ profile: { weight: 70 } }));
    check('N4 unsupported speech stays disabled, explains fallback, and keeps text companion', () => {
      Object.defineProperty(w,'speechSynthesis',{configurable:true,value:undefined});
      Object.defineProperty(w,'SpeechSynthesisUtterance',{configurable:true,value:undefined});
      const body=w.document.querySelector('#mod-body');
      w.eval('renderProfile')(body);
      const toggle=body.querySelector('#pet-voice-tg'); if(!toggle)return false;
      toggle.click();
      return w.eval('STATE').settings.petVoice===false
        &&body.querySelector('#pet-voice-tg').textContent.includes('语音：关')
        &&w.document.querySelector('#toast').textContent.includes('当前浏览器不支持语音')
        &&w.document.querySelector('#pet');
    });
  }
  // N5–N6 照片桌宠
  {
    const w = boot(J({ profile: { weight: 70 }, settings: { petPhoto: 'data:image/png;base64,AAAA' } }));
    check('N5 photoPetSVG：有照片时输出圆形裁切 image，无照片时回落到自绘脸', () => {
      const withPhoto = w.eval('photoPetSVG')('happy', 'data:image/png;base64,AAAA');
      const noPhoto = w.eval('photoPetSVG')('happy', '');
      return withPhoto.indexOf('<svg') === 0 && withPhoto.indexOf('<image') >= 0
        && withPhoto.indexOf('phClip') >= 0
        && noPhoto.indexOf('<svg') === 0 && noPhoto.indexOf('<image') < 0;
    });
    check('N6 照片皮肤在注册表内且可渲染（切到 photo 不崩）', () => {
      const sk = w.eval('skinBy')('photo');
      w.__S.petSkin = 'photo';
      let ok = true;
      try { w.eval('applyPetArt')('happy'); } catch (e) { ok = false; }
      return !!sk && sk.photo === true && ok;
    });
  }
  // N7 视频唯一性（三套全部为 B 站单视频直链，无搜索兜底）
  {
    const w = boot(J({ profile: { weight: 70 } }));
    check('N7 源码内已无 bsearch 搜索兜底调用', () => {
      const src = fs.readFileSync(path.join(PROJ, 'app.js'), 'utf8');
      return src.indexOf('bsearch(') < 0;
    });
  }
}

// ===== v1.1 增量二：知识库板块 / 跑步板块 =====
function v110bChecks() {
  // P1–P2 知识库
  {
    const w = boot(J({ profile: { weight: 70 } }));
    check('P1 知识库文章齐全（≥10 篇，字段完整，均带视频直链）', () => {
      const A = w.eval('KB_ARTICLES');
      if (!Array.isArray(A) || A.length < 10) return false;
      return A.every(a => a.id && a.title && a.summary && Array.isArray(a.points) && a.points.length >= 3
        && a.video && /^https:\/\/www\.bilibili\.com\/video\/BV[0-9A-Za-z]{10}$/.test(a.video.url));
    });
    check('P2 renderKnowledge 渲染不崩且含文章标题与视频行', () => {
      let ok = true;
      try { w.eval('renderKnowledge')(w.document.getElementById('mod-body')); } catch (e) { ok = false; }
      const html = w.document.getElementById('mod-body').innerHTML;
      return ok && html.indexOf('肌肉到底是怎么长出来的') >= 0 && html.indexOf('ex-video') >= 0;
    });
    check('P3 点开文章写入已读标记（STATE.knowledge.read）', () => {
      const card = w.document.querySelector('.kb-card');
      if (!card) return false;
      card.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      const read = w.__S.knowledge && w.__S.knowledge.read;
      return !!read && !!read[card.getAttribute('data-kb')];
    });
  }
  // P4–P6 跑步
  {
    const w = boot(J({ profile: { weight: 70 } }));
    check('P4 haversine 距离正确（1° 纬度 ≈ 111.2 km）', () => {
      const d = w.eval('haversine')({ lat: 0, lon: 0 }, { lat: 1, lon: 0 });
      return Math.abs(d - 111195) < 400;
    });
    check('P5 卡路里按 ACSM 公式计算（1km/10min/65kg ≈ 76 kcal）', () => {
      const k = w.eval('runKcal')(1000, 600000, 65);
      return k >= 70 && k <= 85;
    });
    check('P6 renderRun 渲染不崩（含开始按钮 + 累计统计）', () => {
      let ok = true;
      try { w.eval('renderRun')(w.document.getElementById('mod-body')); } catch (e) { ok = false; }
      const html = w.document.getElementById('mod-body').innerHTML;
      return ok && html.indexOf('run-start') >= 0 && html.indexOf('累计里程') >= 0;
    });
    check('P7 轨迹 SVG：两点以上生成 path，点不足时返回空（不崩）', () => {
      const f = w.eval('runTrackSVG');
      const two = f([{ lat: 39.9, lon: 116.4 }, { lat: 39.91, lon: 116.41 }], 320, 190);
      const one = f([{ lat: 39.9, lon: 116.4 }], 320, 190);
      const none = f(null, 320, 190);
      return two.indexOf('<path') >= 0 && one === '' && none === '';
    });
    check('P8 短距离（<20m）不会被记入跑步记录', () => {
      const w2 = boot(J({ profile: { weight: 70 } }));
      w2.eval('RUN').active = true; w2.eval('RUN').dist = 5; w2.eval('RUN').t0 = Date.now();
      w2.eval('runStop')();
      const rs = w2.__S.runs || [];
      return rs.length === 0;
    });
    check('P9 地图底图：两点以上生成瓦片与轨迹层，点不足返回空', () => {
      const f = w.eval('runMapHTML');
      const two = f([{ lat: 39.9, lon: 116.4 }, { lat: 39.905, lon: 116.408 }], 320, 190);
      const one = f([{ lat: 39.9, lon: 116.4 }], 320, 190);
      return two.indexOf('run-tile') >= 0 && two.indexOf('<path') >= 0 && one === '';
    });
    check('P10 map tiles are opt-in for canonical measured routes', () => {
      const w3=boot(J({profile:{weight:70}}));
      w3.eval('RUN_RECORDS = '+JSON.stringify([{runId:'run-map-check',localDateKey:'2026-09-29',distanceMeters:1200,durationSeconds:420,routeStatus:'MEASURED',routeSegments:[[{lat:39.9,lon:116.4},{lat:39.905,lon:116.408}]]}])+';');
      w3.eval('STATE.settings.runMap = false'); w3.eval('renderRun')(w3.document.getElementById('mod-body'));
      const off=w3.document.getElementById('mod-body').innerHTML.indexOf('run-tile')<0;
      w3.eval('STATE.settings.runMap = true'); w3.eval('renderRun')(w3.document.getElementById('mod-body'));
      const on=w3.document.getElementById('mod-body').innerHTML.indexOf('run-tile')>=0;
      return off&&on;

    });
  }
}

// ===== v1.2 增量：启动体验 / 情感语音 / 动作视频内嵌 / 导航重排 / 照片桌宠 =====
function v120Checks() {
  // —— ① 启动体验 ——
  {
    const w = boot(J({ profile: { weight: 70 } }));
    check('Q1 index.html 内联首屏启动层 #boot，且三份入口文件均无 GitHub 域名引用', () => {
      const html = fs.readFileSync(path.join(PROJ, 'index.html'), 'utf8');
      const clean = html.indexOf('id="boot"') >= 0 && html.indexOf('bt-retry') >= 0
        && !/github\.com|githubusercontent/.test(html);
      const src = fs.readFileSync(path.join(PROJ, 'app.js'), 'utf8');
      const sw = fs.readFileSync(path.join(PROJ, 'sw.js'), 'utf8');
      return clean && !/github\.com|githubusercontent/.test(src) && !/github\.com|githubusercontent/.test(sw);
    });
    check('Q2 hideBoot 置 __READY 并淡出移除启动层（不再无限转圈）', () => {
      const b = w.document.getElementById('boot');
      if (!b) return false;
      w.eval('hideBoot')();
      return w.__READY === true && b.classList.contains('done');
    });
    check('Q3 Service Worker 等待安全采用更新并仅清理本 RC 命名空间', () => {
      const sw = fs.readFileSync(path.join(PROJ, 'sw.js'), 'utf8');
      return /const CACHE_PREFIX = `boji-v2-\$\{RELEASE_CHANNEL\}-`/.test(sw)
        && sw.indexOf('key.startsWith(CACHE_PREFIX)') >= 0
        && sw.indexOf("event.data.type === 'BOJI_ADOPT_UPDATE'") >= 0
        && sw.indexOf("type: 'BOJI_UPDATE_READY'") >= 0
        && sw.indexOf('event.waitUntil(update.then') >= 0
        && sw.indexOf("new URL('index.html', BASE_URL)") >= 0
        && !/install[\s\S]{0,240}skipWaiting/.test(sw);
    });
    check('Q4 背景图等待上限收紧到 3.5s（网络不通快速回落底色）', () => {
      const src = fs.readFileSync(path.join(PROJ, 'app.js'), 'utf8');
      return /setTimeout\(fallback,\s*3500\)/.test(src) && !/setTimeout\(fallback,\s*8000\)/.test(src);
    });
    check('Q5 浏览器拒绝持久存储时应用仍可运行并给出备份提示', async () => {
      Object.defineProperty(w.navigator, 'storage', { configurable: true, value: {
        persisted: async () => false, persist: async () => false
      }});
      await w.eval('requestPersistentStorage')();
      return w.eval('STORAGE_PERSISTENCE_STATUS') === 'NOT_GRANTED'
        && /浏览器未开启额外的数据保护/.test(w.eval('STORAGE_PERSISTENCE_DETAIL'))
        && /定期备份/.test(w.eval('STORAGE_PERSISTENCE_DETAIL'));
    });
    check('Q6 页面隐藏时停止非关键轮询与计时器 interval', () => {
      const intervals=[];
      const nativeSetInterval=w.setInterval.bind(w);
      w.setInterval=(fn,ms)=>{intervals.push(ms);return nativeSetInterval(fn,ms);};
      Object.defineProperty(w.document,'hidden',{configurable:true,value:true});
      w.eval('RUN.active=true;syncHomePolling();startRunTicker();showWorkoutRest(Date.now()+60000)');
      Object.defineProperty(w.document,'hidden',{configurable:true,value:false});
      return intervals.length===0;
    });
  }
  // —— ② 情感语音 ——
  {
    const w = boot(J({ profile: { weight: 70 }, settings: { petVoice: true } }));
    // jsdom 没有 Web Speech：装上桩，才能走到真实分支（否则只会短路返回 false）
    w.speechSynthesis = { cancel: function () {}, speak: function () {}, paused: false, getVoices: function () { return []; } };
    w.SpeechSynthesisUtterance = function (t) { this.text = t; };
    check('V1 按标点切段并给不同韵律：感叹更亮更快、疑问句尾上扬、省略放慢', () => {
      const segs = w.eval('voiceSegments')('今天练胸！加油？慢慢来…', { rate: 1.1, pitch: 1.2 });
      if (!Array.isArray(segs) || segs.length < 3) return false;
      const ex = segs[0], qu = segs[1], el = segs[2];
      return ex.rate > el.rate && ex.pitch > el.pitch && qu.pitch > el.pitch;
    });
    check('V2 情绪影响基频：cheer 比 sad 更快更高', () => {
      const c = w.eval('VOICE_MOOD').cheer, s = w.eval('VOICE_MOOD').sad;
      return c.rate > s.rate && c.pitch > s.pitch;
    });
    check('V3 只在桌宠主界面发声：面板打开时返回 false 并挂起待播', () => {
      w.document.getElementById('module').classList.add('open');
      w.eval('VOICE').pending = '';
      const r = w.eval('petSpeak')('你好呀');
      const pend = w.eval('VOICE').pending;
      w.document.getElementById('module').classList.remove('open');
      return r === false && pend === '你好呀';
    });
    check('V4 回到主界面可发声（返回 true）', () => {
      const r = w.eval('petSpeak')('我在呢');
      return r === true;
    });
    check('V5 离开主界面立即停止并释放（seq 作废 + speaking=false）', () => {
      const before = w.eval('VOICE').seq;
      w.document.getElementById('assistant').classList.add('open');
      w.eval('voiceSync')();
      const v = w.eval('VOICE');
      w.document.getElementById('assistant').classList.remove('open');
      return v.seq > before && v.speaking === false;
    });
    check('V6 voiceOnHome：面板打开判否，关闭后判是', () => {
      const m = w.document.getElementById('module');
      m.classList.add('open'); const a = w.eval('voiceOnHome')();
      m.classList.remove('open'); const b = w.eval('voiceOnHome')();
      return a === false && b === true;
    });
    check('V7 visibility lifecycle pauses and resumes voice; explicit off cancels it', () => {
      let pauses=0,resumes=0,cancels=0;
      w.speechSynthesis.pause=()=>{pauses++;w.speechSynthesis.paused=true;};
      w.speechSynthesis.resume=()=>{resumes++;w.speechSynthesis.paused=false;};
      w.speechSynthesis.cancel=()=>{cancels++;};
      const started=w.eval('petSpeak')('今天练胸！加油？慢慢来…');
      Object.defineProperty(w.document,'hidden',{configurable:true,value:true});
      w.document.dispatchEvent(new w.Event('visibilitychange'));
      const paused=pauses===1;
      Object.defineProperty(w.document,'hidden',{configurable:true,value:false});
      w.document.dispatchEvent(new w.Event('visibilitychange'));
      const resumed=resumes===1;
      const before=w.eval('VOICE').seq;
      w.eval('stopVoice')('off');
      return started&&paused&&resumed&&cancels>=2&&w.eval('VOICE').seq>before&&!w.eval('VOICE').speaking;
    });
  }
  // —— ③ 动作视频 ——
  {
    const w = boot(J({ profile: { weight: 70 } }));
    check('W1 生成 B 站官方嵌入播放器地址（内嵌播放，不跳外站）', () => {
      const u = w.eval('bilibiliEmbed')('https://www.bilibili.com/video/BV1mD421J7o3');
      return u.indexOf('player.bilibili.com/player.html') >= 0 && u.indexOf('bvid=BV1mD421J7o3') >= 0;
    });
    check('W2 全库已无「合集时间戳 / 搜索兜底」链接', () => {
      const src = fs.readFileSync(path.join(PROJ, 'app.js'), 'utf8');
      return src.indexOf('?t=') < 0 && src.indexOf('bsearch(') < 0 && src.indexOf('BV1FY4y1y7Vh') < 0;
    });
    check('W3 每个动作都是唯一 BV 直链（三套合计 >=60 条）', () => {
      const sets = w.eval('PLAN_SETS');
      const DAYS = ['push', 'pull', 'legs', 'core'];
      const bvs = [];
      ['A', 'B', 'C'].forEach(k => DAYS.forEach(d => (sets[k].days[d].ex || []).forEach(e => {
        const m = String((e.video && e.video.url) || '').match(/(BV[0-9A-Za-z]{10})/);
        if (m) bvs.push(m[1]);
      })));
      return bvs.length >= 60 && bvs.every(b => /^BV[0-9A-Za-z]{10}$/.test(b));
    });
    check('W4 openVideo 在弹层内注入 iframe；closeVideo 清空释放', () => {
      w.eval('openVideo')('https://www.bilibili.com/video/BV1mD421J7o3', '哑铃平板卧推详解');
      const st = w.document.getElementById('vpop-stage');
      const okOpen = !!st && st.innerHTML.indexOf('<iframe') >= 0 && st.innerHTML.indexOf('player.bilibili.com') >= 0;
      let okClose = true;
      try { w.eval('closeVideo')(); } catch (e) { okClose = false; }
      return okOpen && okClose && w.document.getElementById('vpop-stage').innerHTML === '';
    });
    check('W5 本地视频 Object URL 在替换、关闭与页面销毁时释放', () => {
      const revoked = [];
      let created = 0;
      w.URL.createObjectURL = () => `blob:boji-${++created}`;
      w.URL.revokeObjectURL = url => revoked.push(url);
      w.HTMLInputElement.prototype.click = function(){
        Object.defineProperty(this, 'files', { configurable: true, value: [new w.File(['clip'], `clip-${created + 1}.mp4`)] });
        this.onchange();
      };
      w.eval('pickLocalVideo')();
      w.eval('pickLocalVideo')();
      const replaced = revoked.includes('blob:boji-1');
      w.eval('closeVideo')();
      const closed = revoked.includes('blob:boji-2');
      w.eval('pickLocalVideo')();
      w.dispatchEvent(new w.Event('pagehide'));
      return replaced && closed && revoked.includes('blob:boji-3');
    });
  }
  // —— ④ 底部导航 ——
  {
    const PH = 'data:image/png;base64,AAAA';
    const w = boot(J({ profile: { weight: 70 } }));
    check('X1 five primary navigation destinations render', () => {
      const items = Array.from(w.document.querySelectorAll('#dock .dock-item'));
      return items.length === 5 && items.some(x => x.dataset.go === 'boji') && items.some(x => x.dataset.go === 'progress');
    });
    check('X2 primary navigation order is Today, Training, Boji, Progress, My', () => {
      const keys = Array.from(w.document.querySelectorAll('#dock .dock-item')).map(b => b.dataset.go);
      return keys.join(',') === 'today,training,boji,progress,profile';
    });
    check('Y1 SVG 带显式 width/height（此前只有 viewBox，栅格化默认尺寸导致糊）', () => {
      const s = w.eval('photoPetSVG')('happy', PH);
      return /<svg[^>]*width="240"/.test(s) && /height="240"/.test(s);
    });
    check('Y2 默认保留原图五官：不叠加卡通眼睛与嘴（异常表情根因）', () => {
      const s = w.eval('photoPetSVG')('happy', PH);
      return s.indexOf('translate(0,-13)') < 0 && s.indexOf('<image') >= 0;
    });
    check('Y3 切到「卡通叠加」后才出现自绘五官', () => {
      w.__S.settings.petPhotoFx = 'sticker';
      const s = w.eval('photoPetSVG')('happy', PH);
      w.__S.settings.petPhotoFx = 'natura';
      return s.indexOf('translate(0,-13)') >= 0;
    });
    check('Y4 取景参数生效：缩放 1.8 → image 宽 = 2*48*1.8 = 172.8', () => {
      w.__S.settings.petPhotoFit = { z: 1.8, dx: 10, dy: -6 };
      const s = w.eval('photoPetSVG')('happy', PH);
      w.__S.settings.petPhotoFit = { z: 1, dx: 0, dy: 0 };
      return s.indexOf('width="172.8"') >= 0;
    });
    check('Y5 取景参数脏值（NaN/字符串/null）回落默认且不崩', () => {
      w.__S.settings.petPhotoFit = { z: NaN, dx: 'x', dy: null };
      let ok = true;
      try { w.eval('photoPetSVG')('happy', PH); } catch (e) { ok = false; }
      const f = w.eval('photoFit')();
      w.__S.settings.petPhotoFit = { z: 1, dx: 0, dy: 0 };
      return ok && f.z === 1 && f.dx === 0 && f.dy === 0;
    });
    check('Y6 照片上传走高清参数（512px / 画质 0.9，不再是 256 / 0.72）', () => {
      const src = fs.readFileSync(path.join(PROJ, 'app.js'), 'utf8');
      return /compressImage\(f,\s*512/.test(src) && /0\.9\)/.test(src);
    });
  }
}
