/* 训练日记 v1.0.0 行为级回归测试（jsdom） */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const PROJ = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(PROJ, 'index.html'), 'utf8').replace('<script src="app.js"></script>', '');
const appJs = fs.readFileSync(path.join(PROJ, 'app.js'), 'utf8');
const appForTests = appJs.replace("document.addEventListener('DOMContentLoaded', boot);", "document.addEventListener('DOMContentLoaded', ()=>{ if(window.__TEST_V2_STATE__) hydrateState(window.__TEST_V2_STATE__); DATA_READY=true; PERSONAL_RECORDS_READY=true; bootUI(); });");

const dateKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const tk = () => dateKey(new Date());
const dayKey = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return dateKey(d); };

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name); } };

// ---- 场景一：旧数据迁移（water:3 杯 → 750ml），并预置打卡与档案 ----
const seed = {
  profile: { height: 172, weight: 70, dumbbell: 10, name: '训练者', nutritionIntent:'GAIN' },
  isFirstLaunch: false,
  water: 3,
  // 「月历本月 ✓ 天数」断言要求 3 天都落在同一个日历月内：
  // 月初跑测试时 0/-1/-2 会跨到上个月，故按当前日号选择偏移方向（夹具也要防跨月）
  checkins: (function () {
    const offs = (new Date().getDate() >= 3) ? [0, -1, -2] : [0, 1, 2];
    const c = {};
    c[dayKey(offs[0])] = { ex: { 0: true, 1: true }, at: Date.now() };
    c[dayKey(offs[1])] = { ex: { 0: true }, at: Date.now() };
    c[dayKey(offs[2])] = { ex: { 0: true, 1: true, 2: true }, at: Date.now() };
    return c;
  })(),
};
const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true });
const w = dom.window;
const fakeRecords={drafts:[],meals:[],weights:[],water:[],runs:[],profiles:[],workouts:[],activeWorkout:null,workoutStartCount:0};
const clone=value=>JSON.parse(JSON.stringify(value));
function fakeWorkout(input){
  const template=w.eval('trainingTemplate')(input.templateId),sessionId='workout-ui-test';
  const exerciseSessions=(template.exercises||[]).map((row,index)=>({exerciseSessionId:'workout-ui-ex-'+index,exerciseId:row.exerciseId,
    exerciseOrder:index,nameSnapshot:w.eval('exerciseDefinition')(row.exerciseId).name}));
  const sets=[];
  (template.exercises||[]).forEach((row,index)=>{for(let setIndex=0;setIndex<row.sets;setIndex++)sets.push({
    setId:'workout-ui-set-'+index+'-'+setIndex,exerciseSessionId:exerciseSessions[index].exerciseSessionId,exerciseOrder:index,
    setIndex,targetReps:row.reps,weightKg:null,reps:null,rir:null,completed:false
  });});
  return{session:{sessionId,status:'ACTIVE',localDateKey:input.localDateKey,templateId:input.templateId,equipmentProfileId:input.equipmentProfileId,
    ownerTabId:input.ownerId,startedAt:Date.now(),currentSetId:sets[0].setId,activeRestEndAt:null},exerciseSessions,sets};
}
w.BojiData = { localDateKey(date){ const d = date instanceof Date ? date : new Date(date == null ? Date.now() : date); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; },
  timezoneContext(at){return{timezoneOffsetMinutes:-new Date(at||Date.now()).getTimezoneOffset(),timeZone:'Test/Local'};},
  async startWorkout(input){fakeRecords.workoutStartCount++;await new Promise(resolve=>setTimeout(resolve,20));
    if(fakeRecords.activeWorkout)return{status:'ACTIVE_EXISTS',workout:clone(fakeRecords.activeWorkout)};
    fakeRecords.activeWorkout=fakeWorkout(input);fakeRecords.workouts.push(fakeRecords.activeWorkout);
    return{status:'CREATED',workout:clone(fakeRecords.activeWorkout)};},
  async listWorkoutHistory(){return clone(fakeRecords.workouts);},
  async claimWorkoutOwnership(sessionId,ownerId){fakeRecords.activeWorkout.session.ownerTabId=ownerId;return{status:'CLAIMED',workout:clone(fakeRecords.activeWorkout)};},
  async completeWorkoutSet(sessionId,setId,values){const workout=fakeRecords.activeWorkout,set=workout.sets.find(row=>row.setId===setId);
    Object.assign(set,clone(values),{completed:true,completedAt:Date.now()});workout.session.currentSetId=(workout.sets.find(row=>!row.completed)||{}).setId||null;
    workout.session.lastCommittedAt=Date.now();workout.session.activeRestStartedAt=Date.now();
    workout.session.activeRestEndAt=workout.session.currentSetId?Date.now()+75000:null;
    return{status:'COMPLETED',workout:clone(workout),commitCompletedAtPerformance:0};},
  async clearWorkoutRest(){fakeRecords.activeWorkout.session.activeRestEndAt=null;fakeRecords.activeWorkout.session.activeRestStartedAt=null;return clone(fakeRecords.activeWorkout);},
  async finishWorkout(sessionId){const workout=fakeRecords.activeWorkout;
    if(workout.sets.some(row=>!row.completed))return{status:'INCOMPLETE'};
    workout.session.status='COMPLETED';workout.session.finishedAt=Date.now();workout.session.endedAt=Date.now();
    fakeRecords.activeWorkout=null;return{status:'COMPLETED',workout:clone(workout)};},
  async saveState(){return true;}, async putCustomExercise(){return true;}, async deleteCustomExercise(){return true;},
  async createFoodDraft(input){const draft=Object.assign({draftId:this.makeId('draft'),createdAt:Date.now(),status:'DRAFT',items:[]},clone(input));fakeRecords.drafts.push(draft);return clone(draft);},
  async updateFoodDraft(id,changes){const row=fakeRecords.drafts.find(item=>item.draftId===id);Object.assign(row,clone(changes),{updatedAt:Date.now()});return clone(row);},
  async deleteFoodDraft(id){fakeRecords.drafts=fakeRecords.drafts.filter(item=>item.draftId!==id);return true;},
  async listFoodDrafts(options){return clone(fakeRecords.drafts.filter(row=>(!options||!options.status||row.status===options.status)&&(!options||!options.localDateKey||row.localDateKey===options.localDateKey)));},
  async listMealRecords(){return clone(fakeRecords.meals);},
  async confirmFoodDraft(id,confirmation){if(!confirmation||confirmation.confirmed!==true)throw new Error('explicit user confirmation required');const draft=fakeRecords.drafts.find(row=>row.draftId===id&&row.status==='DRAFT');if(!draft)throw new Error('missing draft');const at=Date.now(),meal={mealId:this.makeId('meal'),createdAt:at,localDateKey:draft.localDateKey,timezoneContext:draft.timezoneContext,mealTypeIndex:draft.mealTypeIndex,items:clone(draft.items),confirmation:{confirmedByUser:true,confirmedAt:at}};draft.status='COMMITTED';fakeRecords.meals.push(meal);return clone(meal);},
  async putProfile(profile){const row=clone(profile),index=fakeRecords.profiles.findIndex(item=>item.profileId===row.profileId);if(index>=0)fakeRecords.profiles[index]=row;else fakeRecords.profiles.push(row);return clone(row);},
  async listProfiles(){return clone(fakeRecords.profiles);},
  async putBodyWeight(row){const value=clone(row),index=fakeRecords.weights.findIndex(item=>item.weightId===value.weightId);if(index>=0)fakeRecords.weights[index]=value;else fakeRecords.weights.push(value);return clone(value);},
  async listBodyWeights(){return clone(fakeRecords.weights);},
  async putWaterEntry(row){const value=clone(row);fakeRecords.water.push(value);return clone(value);},
  async listWaterEntries(options){return clone(fakeRecords.water.filter(row=>!options||!options.localDateKey||row.localDateKey===options.localDateKey));},
  async listRuns(){return clone(fakeRecords.runs);},async putRun(row){const value=clone(row);fakeRecords.runs.push(value);return clone(value);},
  createRequestOwner(ownerView){let generation=0,controller=null;return{begin(){if(controller)controller.abort();controller=new w.AbortController();return{generation:++generation,signal:controller.signal,ownerView};},cancel(){generation++;if(controller)controller.abort();},isCurrent(request,view){return !!request&&request.generation===generation&&request.ownerView===(view||ownerView)&&!request.signal.aborted;}};},
  makeId(prefix){return prefix+'-test-'+Math.random().toString(36).slice(2,8);} };
w.__TEST_V2_STATE__ = seed;
// 以经典脚本方式注入 app.js（严格模式下 top-level 函数仍挂到 window，let/const 经 eval 导出）
const sc = w.document.createElement('script');
sc.textContent = appForTests;
w.document.body.appendChild(sc);
w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
w.eval('window.__S = STATE; window.__PLANS = PLANS;');
w.eval("TRAINING_CATALOG = {equipmentProfiles:['A','B','C'].map(code=>({code,profileId:'equipment:'+code,name:'Profile '+code,equipment:['dumbbells']})),programs:['A','B','C'].map(code=>({programId:'program:'+code,equipmentProfileId:'equipment:'+code,goal:'HYPERTROPHY',name:'Program '+code})),templates:['A','B','C'].map(code=>({templateId:'template:'+code+':push',programId:'program:'+code,dayKey:'push',name:'Push',exercises:[]})),exercises:[],customExercises:[]};");

const doc = w.document;
const $ = s => doc.querySelector(s);
const $$ = s => Array.from(doc.querySelectorAll(s));
const click = n => n.dispatchEvent(new w.Event('click', { bubbles: true }));
const input = n => n.dispatchEvent(new w.Event('input', { bubbles: true }));
const change = n => n.dispatchEvent(new w.Event('change', { bubbles: true }));
const waitFor = async (predicate,timeout=2500)=>{const deadline=Date.now()+timeout;while(Date.now()<deadline){if(await predicate())return true;await new Promise(resolve=>setTimeout(resolve,10));}return false;};

(async()=>{
// 1. 迁移：3 杯 → 750ml
ok(w.__S.waterMl === 750, '旧「杯」数据迁移为 ml（3杯=750ml）');
ok(typeof w.dailyGoal === 'function', 'dailyGoal 函数存在');

// 2. dailyGoal 随体重计算
const g = w.dailyGoal();
ok(g.protein === 126 && g.kcal === 2310 && g.water === 2450, `每日目标随体重计算(70kg→126g/2310kcal/2450ml) 实际=${g.protein}/${g.kcal}/${g.water}`);

// 3. 主页明确「居家哑铃」
ok($('#home-stats').querySelectorAll('.home-week-day').length === 7
  && $('#home-shortcuts').querySelectorAll('button').length === 2 && $('#hc-go') !== null,
  'Today shows real weekly progress, two helper entries, and its main action');

// 4. 训练页标签（今天若是周日休息日，则选下一个周一验证）
{
  const d = new Date(); d.setDate(d.getDate() + ((1 - d.getDay() + 7) % 7 || 7));
  const monKey = dateKey(d);
  w.eval('STATE.selDate = '+JSON.stringify(monKey));
  w.eval('renderTraining')(doc.querySelector('#mod-body'));
  ok($('#start-workout') !== null && $('#preview-adjustment') !== null, '训练页显示规范训练入口与「调整今天」');
}

// 5. 饮水：+250ml 按钮
w.goModule('diet');
ok($('#water-250') && $('#water-100') && $('#water-sub'), '饮水按钮为 ml 计量（+100/+250/-100）');
click($('#water-250'));
ok(await waitFor(()=>fakeRecords.water.length===1), '点击 +250ml 后水量记录事务完成');
ok(await waitFor(()=>w.eval('dailyWaterTotal(todayKey())')===250), '新增饮水进入日期化记录，不写入旧版水量字段');
ok(await waitFor(()=>$('#mod-body').innerHTML.includes('250 ml')), '饮水卡片显示当天规范记录的 ml 数值');

// 6. 饮食总计目标随档案
ok($('#mod-body').innerHTML.includes(g.protein + ' g'), '蛋白目标行显示档案计算值');
ok($('#mod-body').innerHTML.includes(g.kcal + ' kcal'), '热量目标行显示档案计算值');

// G4 product interactions are asynchronous so checks observe committed data, not optimistic UI state.
// 7. 拍照校正面板：搜索 → 选食物 → 改份量 → 加入草稿 → 明确确认
w.openFoodSheet(1, $('#mod-body'), 'data:image/jpeg;base64,AAAA');
ok($('#food-sheet').classList.contains('show'), '拍照校正面板打开');
ok(doc.querySelector('.fs-hero img') !== null, '照片缩略图显示在识别结果页');
const search = $('#food-search');
search.value = '鸡胸'; input(search);
const hits = $$('#food-hits [data-hit]');
ok(hits.length >= 1, '搜索「鸡胸」有结果');
click(hits[0]);
ok($('#fe-name') !== null, '选中后出现校正编辑器');
ok($('#fe-name').value.includes('鸡胸'), '食物名可校正（初始为库内名称）');
const q = $('#fe-q'); q.value = '2'; input(q);
ok($('#fe-kcal').textContent.includes('388'), '份量×2 后热量实时重算（鸡胸肉150g: 194×2=388 kcal）');
click($('#fe-add'));
ok(await waitFor(()=>fakeRecords.drafts.length===1&&$('#fs-confirm-draft')!==null), '选中的食物先持久化为 FoodDraft');
ok($('#fs-draft').textContent.includes('食物名、份量和营养信息都可以修改')&&$('#fs-confirm-draft').textContent==='确认并记录', '饮食草稿用清楚的中文提示可修改项与确认时机');
ok(fakeRecords.meals.length===0, '明确确认前没有 MealRecord');
  click($('#fs-confirm-draft'));
  ok(await waitFor(async()=>fakeRecords.meals.length===1), '明确确认后提交 MealRecord');
  ok(await waitFor(()=>w.eval('MEAL_RECORDS.length')===1), '提交后的 canonical MealRecord 已进入导出视图');
const lunch = fakeRecords.meals[0].items;
  ok(lunch.length===1&&lunch[0].quantity===2&&lunch[0].photo===undefined, '记录保留数量且不保存照片数据');
  ok(lunch[0].provenance.energyKcal==='DERIVED', '宏量换算热量标记为 DERIVED');
  let csvText='';
  try{let captured=null;w.URL.createObjectURL=blob=>{captured=blob;return 'blob:canonical-csv';};w.URL.revokeObjectURL=()=>{};w.exportCSV();
    if(captured)csvText=Buffer.from(await captured.arrayBuffer()).toString('utf8');}catch(_){}
  ok(csvText.includes(lunch[0].name)&&csvText.includes('DERIVED')&&csvText.includes('USER_PROVIDED'), 'CSV 导出已提交 MealRecord 及逐字段来源');

// 8. 手动选择兜底入口仍在
w.goModule('diet');
const manualBtn = $$('#mod-body [data-add]');
ok(manualBtn.length === 4, '四餐均保留「手动选」兜底按钮');

// 9. 饮食条目显示规范记录和 kcal，不复制照片
ok(await waitFor(()=>$('#mod-body').innerHTML.includes('food-record-row')), '已记录条目显示规范 MealRecord');
ok($('#mod-body').innerHTML.includes('kcal'), '条目显示 kcal');
const mealUi=$('#mod-body').textContent;
ok(mealUi.includes('食物名：食物库')&&mealUi.includes('份量：你填写')&&!/USER_PROVIDED|AI_ESTIMATED|DATABASE|UNASSESSED|来源待核|信心档/.test(mealUi), '饮食历史保留来源含义且不显示内部枚举');

// 10. 档案实时编辑：体重 70→80，立即影响目标
w.goModule('profile');
ok($('#pe-w') && $('#pe-name') && $('#pe-h') && $('#pe-d'), '档案编辑表单齐全（昵称/身高/体重/哑铃）');
const pw = $('#pe-w'); pw.value = '80'; change(pw);
ok(await waitFor(()=>w.eval('STATE.profile.weight')===80), '体重在本地数据库提交后更新档案');
ok(w.eval('STATE.profile.weight') === 80, '体重改 80 实时写入 STATE');
ok(w.dailyGoal().protein === 144, '蛋白目标即时变为 144g（80×1.8）');
ok($('#pe-d') !== null && +$('#pe-d').value === 10, '哑铃重量可编辑');

// 11. 昵称实时更新
const pn = $('#pe-name'); pn.value = '小凯'; input(pn);
ok($('#pf-name').textContent === '小凯', '昵称实时同步到头部显示');

// 12. 头像上传链路（直接写 avatar 后渲染）
w.eval("STATE.profile.avatar = 'data:image/png;base64,XYZ'");
w.eval('renderProfile')($('#mod-body'));
ok($('#pf-av').src.startsWith('data:image'), '??????????');
ok($('#pf-av-btn') !== null, '「更换头像」按钮存在');

// 13. 数据页：统计格
w.goModule('data');
ok($('#mod-body').innerHTML.includes('连续打卡天数') && $('#mod-body').innerHTML.includes('累计打卡天数'), '番茄ToDo 式统计格（连续/累计）');
ok($('#mod-body').innerHTML.includes('本月已完成'), '统计格含「本月已完成」');

// 14. 月历：本月有 3 天打卡
const doneCells = $$('#mod-body .cal-day.done');
ok(doneCells.length === 3, `月历本月 ✓ 天数=3 实际=${doneCells.length}`);

// 15. 月历翻页
const headB = doc.querySelector('.cal-head b').textContent;
click(doc.querySelector('[data-nm]'));
ok(doc.querySelector('.cal-head b').textContent !== headB, '月历可切换到下个月');
click(doc.querySelector('[data-pm]'));
ok(doc.querySelector('.cal-head b').textContent === headB, '月历可切回本月');

// 16. 默认选中今天（已打卡）→ 评分卡出现
ok($('#score-save') !== null, '今日已打卡 → 默认出现评分卡');

// 17. 打分：感受 4 / 体力 3 / 满意 5
const stars = $$('#mod-body .stars');
click(stars[0].querySelector('[data-star="4"]'));
click(stars[1].querySelector('[data-star="3"]'));
click(stars[2].querySelector('[data-star="5"]'));
click($('#score-save'));
const scSaved = w.__S.scores[tk()];
ok(scSaved && scSaved.feel === 4 && scSaved.energy === 3 && scSaved.sat === 5, '评分保存成功（4/3/5）');

// 18. 月历补录评分：从夹具实际播种、且月历可见的日期中选择非今天的一天。
const yKey = Object.keys(w.__S.checkins || {}).find(k => k !== tk() && $(`[data-cal="${k}"]`));
if (!yKey) throw new Error('评分补录夹具缺少可见的非今天打卡日期');
const yCell = $(`[data-cal="${yKey}"]`);
click(yCell);
click($$('#mod-body .stars')[0].querySelector('[data-star="2"]'));
click($('#score-save'));
ok(w.__S.scores[yKey] && w.__S.scores[yKey].feel === 2, '月历点其它日期可补录评分');

// 19. 清除评分
click($('#score-del'));
ok(!w.__S.scores[yKey], '评分可清除');

// 20. 评分标记 ★ 出现在月历
ok($$('#mod-body .cal-day').length > 0 && w.__S.scores[tk()] !== undefined, '今日评分数据在档（月历可渲染 ★）');

// 21. 回归：navUIClose 关层 + history 同步
w.goModule('training');
const before = w.history.length;
w.navUIClose('module');
ok(!$('#module').classList.contains('open'), '回归：navUIClose 正常关闭面板');

// 22. G3：组级训练入口与显式器械调整预览。
{
  const d = new Date(); d.setDate(d.getDate() + ((1 - d.getDay() + 7) % 7 || 7));
  const selected = dateKey(d); w.eval('STATE.selDate = '+JSON.stringify(selected)); w.goModule('training');
  ok($('#start-workout') !== null && $$('#mod-body [data-ex]').length === 0, '计划训练使用会话入口，不提供动作布尔打卡');
  $('#adjust-profile').value = 'B'; click($('#preview-adjustment'));
  ok($('#adjustment-preview').textContent.includes('调整预览') && $('#accept-adjustment') !== null, '调整预览提供依据并等待用户确认');
  ok(w.__S.planOverrides[selected] === undefined, '预览不会自动应用训练调整');
}

// 23. 旧版 planEdits 只迁移一次，并进入规范模板供之后的训练读取。
{
  w.eval("TRAINING_CATALOG.exercises=[{exerciseId:'exercise:legacy',name:'旧计划动作',goal:'HYPERTROPHY',equipmentProfileIds:['equipment:A','equipment:B','equipment:C'],targetMuscles:['chest'],movementPattern:'chest_push'}]; TRAINING_CATALOG.templates.forEach(row=>row.exercises=[{exerciseId:'exercise:legacy',sets:3,reps:'10-12',restSeconds:60}]);");
  w.BojiData.saveWorkoutTemplate=async(id,edits)=>{
    const row=w.eval('TRAINING_CATALOG.templates.find(item=>item.templateId==='+JSON.stringify(id)+')');
    row.exercises=row.exercises.map((entry,index)=>Object.assign({},entry,edits[index]));row.userEdited=true;return row;
  };
  w.eval("STATE.planEdits={push:{0:{sets:4,reps:'8-12'}}}");
  await w.eval('(async()=>await migrateLegacyPlanEdits())()');
  const migrated=w.eval("TRAINING_CATALOG.templates.find(row=>row.templateId==='template:A:push').exercises[0]");
  ok(migrated.sets===4&&migrated.reps==='8-12'&&!w.__S.planEdits.push,'legacy plan edits migrate into the canonical template and clear only after save');
}

// 24. 自然语言处理层（NLP）：归一化 / 同义词 / 意图 / 模糊匹配 / 异常边界 / 可复现
{
  const norm = w.eval('nlpNormalize');
  const expand = w.eval('nlpExpand');
  const intent = w.eval('nlpIntent');
  const kb = w.eval('nlpKbScore');
  const reply = w.eval('bojiReply');

  // 24.1 归一化：全角→半角、去标点语气词、折叠空白、空值不抛
  ok(norm('Ｈｅｌｌｏ？') === 'hello', 'NLP 归一化：全角字母+标点 → hello');
  ok(norm('我 想 问  胸 肌 怎么练？！') === '我想问胸肌怎么练', 'NLP 归一化：去标点/语气词/折叠空白');
  ok(norm(null) === '' && norm('') === '', 'NLP 归一化：null/空 返回空串不抛');

  // 24.2 同义词扩展：用户说法映射到规范关键词（对齐 Rasa SynonymMapper / workout-tracker alias）
  ok(expand('我想长肌肉').indexOf('增肌') >= 0, 'NLP 同义：长肌肉→增肌');
  ok(expand('减肥吃什么').indexOf('减脂') >= 0, 'NLP 同义：减肥→减脂');

  // 24.3 意图识别：带 score 的意图分类（对齐 Rasa IntentClassifier）
  const i1 = intent('今天练什么'); ok(i1 && i1.intent === 'today_plan', 'NLP 意图：今天练什么→today_plan');
  const i2 = intent('我蛋白够吗'); ok(i2 && i2.intent === 'protein', 'NLP 意图：蛋白够吗→protein');
  ok(intent('') === null, 'NLP 意图：空输入→null 不抛');

  // 24.4 知识库匹配：同义 + 单字错别字模糊容错
  const m1 = kb('怎么练胸');
  ok(m1.item && m1.item.q.indexOf('卧推') >= 0, 'NLP 匹配：怎么练胸→卧推相关（同义 胸→卧推）');
  const m2 = kb('减肥吃什么好');
  ok(m2.item && m2.item.q.indexOf('减脂') >= 0, 'NLP 匹配：减肥吃什么→减脂条目（同义）');
  const m3 = kb('深撑');   // 深撑 = 深蹲 单字错别字
  ok(m3.item && m3.item.q.indexOf('深蹲') >= 0, 'NLP 匹配：深撑→深蹲条目（错别字容错）');

  // 24.5 异常边界：恶意/异常输入均返回 string、不抛（错误降级策略）
  let threw = false, rStr = '';
  try {
    rStr = typeof reply(null) + '|' + typeof reply('') + '|' + typeof reply('<script>alert(1)</script>')
         + '|' + typeof reply('x'.repeat(5000)) + '|' + typeof reply('🏋️💪😊');
  } catch (e) { threw = true; }
  ok(!threw && /string/.test(rStr), 'NLP 边界：null/空/HTML注入/超长/emoji 均返回 string 不抛');

  // 24.6 可复现性：相同输入两次结果一致
  ok(reply('今天练什么') === reply('今天练什么'), 'NLP 可复现：相同输入结果一致');
  ok(kb('怎么练胸').item === kb('怎么练胸').item, 'NLP 可复现：匹配结果确定性');
}

// 24. 回归：导出 CSV 带 BOM（若 Blob 支持 arrayBuffer）
await (async () => {
  const csvWorkout={session:{sessionId:'session:csv',status:'COMPLETED',localDateKey:'2026-10-03',startedAt:1000,finishedAt:2000},
    exerciseSessions:[{exerciseSessionId:'exercise-session:csv',exerciseId:'exercise:press',nameSnapshot:'哑铃卧推'}],
    sets:[{setId:'set:csv',sessionId:'session:csv',exerciseSessionId:'exercise-session:csv',exerciseId:'exercise:press',exerciseOrder:0,setIndex:0,targetReps:'8-10',weightKg:20,reps:9,rir:2,completed:true,completedAt:1500}]};
  w.eval('indexWorkoutHistory('+JSON.stringify([csvWorkout])+')');
  let bomOk = false;
  let csvText='';
  try {
    let captured = null;
    w.URL.createObjectURL = (blob) => { captured = blob; return 'blob:x'; };
    w.URL.revokeObjectURL = () => {};
    w.exportCSV();
    if (captured) { const buf = await captured.arrayBuffer(); const u8 = new w.Uint8Array(buf); bomOk = u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF; csvText=Buffer.from(buf).toString('utf8'); }
  } catch (e) { bomOk = false; }
  ok(bomOk, '回归：exportCSV 仍带 UTF-8 BOM');
  const trainingBlock=csvText.replace(/^\uFEFF/,'').split('\r\n\r\n')[0],lines=trainingBlock.split('\r\n');
  const parseRow=line=>{const cells=[];let value='',quoted=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(quoted&&line[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}else if(ch===','&&!quoted){cells.push(value);value='';}else value+=ch;}cells.push(value);return cells;};
  const readBack=lines.length>1?parseRow(lines[1]):[];
  ok(readBack[0]==='2026-10-03'&&readBack[4]==='哑铃卧推'&&readBack[5]==='1'&&readBack[7]==='20'&&readBack[8]==='9'&&readBack[9]==='2',
    '训练 CSV 回读还原规范化组记录、负重、次数与余力次数');
  ok(w.eval('_csvRow')(['=1+1','@SUM(A1:A2)']).includes("'=1+1") && w.eval('_csvRow')(['=1+1','@SUM(A1:A2)']).includes("'@SUM"), 'CSV 公式前缀被转为文本');
  w.eval('STATE.isFirstLaunch=true;STATE.profile=null');
  w.eval('showOnboard()');
  ok(!$('#ob-h').required&&!$('#ob-w').required&&!$('#ob-d').required&&!$('#ob-goal').required&&!$('#ob-experience').required,
    '首启只要求训练地点与时长，身体与训练背景可跳过');
  const weightsBeforeOnboard=fakeRecords.weights.length;
  $('#ob-equipment').value='B';click($('#ob-save'));
  const onboardingSaved=await waitFor(()=>!$('#onboard').classList.contains('show'));
  ok(onboardingSaved&&w.eval('STATE.profile.weight')==null&&w.eval('STATE.profile.trainingGoal')==null&&fakeRecords.weights.length===weightsBeforeOnboard,
    '跳过个人数据也能开始，且不会补造体重记录');
  w.goModule('profile');
  const optionalProfileFields=$('#pe-h').value===''&&$('#pe-w').value===''&&$('#pe-d').value===''
    &&!$('#mod-body').textContent.includes('null')&&$('#mod-body').textContent.includes('资料可随时补充');
  $('#pe-goal').value='STRENGTH';change($('#pe-goal'));
  const optionalProfileSaved=await waitFor(()=>w.eval('STATE.profile.trainingGoal==="STRENGTH"'));
  ok(optionalProfileFields&&optionalProfileSaved&&w.eval('STATE.profile.weight')==null&&fakeRecords.weights.length===weightsBeforeOnboard,
    '空身体资料保持自然留空，其他档案设置仍可单独保存');
  const productEvents=[];w.addEventListener('boji:product-event',event=>productEvents.push(event.detail));
  w.eval("emitProductEvent('workout.started',{sessionId:'session:start',startedAt:100,localDateKey:'2026-10-03'}); emitProductEvent('workout.set_completed',{setId:'set:1',sessionId:'session:start',exerciseId:'exercise:press',setIndex:0,completedAt:200,reps:8}); emitProductEvent('workout.completed',{sessionId:'session:start',finishedAt:300}); emitProductEvent('rest.finished',{sessionId:'session:start',updatedAt:400},{restDurationSeconds:60}); emitProductEvent('meal.confirmed',{mealId:'meal:1',createdAt:500,confirmation:{confirmedAt:501},localDateKey:'2026-10-03'});");
  ok(productEvents.length===5&&productEvents[0].recordId==='session:start'&&productEvents[0].occurredAt===100&&
    productEvents[1].recordId==='set:1'&&productEvents[1].sessionId==='session:start'&&productEvents[1].occurredAt===200&&
    productEvents[3].restDurationSeconds===60&&productEvents[4].recordId==='meal:1'&&productEvents[4].occurredAt===501,
    '桌宠事件带有真实记录标识、提交时间和必要上下文');
  // 跑步页面以自然中文展示定位与手动记录，不泄露内部估算标签
  w.goModule('run');
  const runUi=$('#mod-body').textContent;
  ok(runUi.includes('开始户外跑步')&&runUi.includes('不会生成路线')&&!/GPS|ACSM|DERIVED|USER_PROVIDED|UNKNOWN|UNVERIFIED|HOLD/.test(runUi), '跑步说明自然中文表达，测量和估算状态不显示内部标签');
  w.eval("RUN_RECORDS=[{runId:'legacy-run',localDateKey:'legacy-date',distanceMeters:3000,durationSeconds:1800,routeStatus:'LEGACY_UNKNOWN'},{runId:'manual-run',localDateKey:'manual-date',distanceMeters:2500,durationSeconds:1500,distanceProvenance:'USER_PROVIDED',routeStatus:'MANUAL'},{runId:'measured-run',localDateKey:'measured-date',distanceMeters:3200,durationSeconds:1700,distanceProvenance:'MEASURED',routeStatus:'MEASURED'}];renderModule('run')");
  const runRows=Array.from($('#mod-body').querySelectorAll('.run-row')).map(row=>row.textContent);
  ok(runRows.length===3&&runRows[0].includes('legacy-date')&&runRows[0].includes('来源未注明')&&!runRows[0].includes('定位记录')&&
    runRows[1].includes('manual-date')&&runRows[1].includes('手动记录')&&runRows[2].includes('measured-date')&&runRows[2].includes('定位记录'),
    '跑步历史只按已知来源标注，旧记录不冒充定位记录');
  // 首页训练主按钮：开始时只创建一次，活跃后显示并执行继续。
  const testTrainingDay=w.eval('getDayType(new Date().getDay())');
  w.eval("TRAINING_CATALOG.exercises=[{exerciseId:'exercise:ui-press',name:'测试卧推',goal:'HYPERTROPHY',equipmentProfileIds:['equipment:A','equipment:B','equipment:C'],targetMuscles:['chest'],movementPattern:'chest_push'}]; TRAINING_CATALOG.templates.forEach(row=>row.exercises=[{exerciseId:'exercise:ui-press',sets:3,reps:'10',restSeconds:60}]); ['A','B','C'].forEach(code=>{const id='template:'+code+':"+testTrainingDay+"';if(!TRAINING_CATALOG.templates.some(row=>row.templateId===id))TRAINING_CATALOG.templates.push({templateId:id,programId:'program:'+code,dayKey:'"+testTrainingDay+"',name:'Test workout',exercises:[{exerciseId:'exercise:ui-press',sets:3,reps:'10',restSeconds:60}]});}); ACTIVE_WORKOUT=null; START_INTENT_KEY=null; STATE.selDate=todayKey(); renderHome();");
  const homeStart=$('#hc-go');
  const startLabel=homeStart&&homeStart.textContent.includes('开始训练');
  click(homeStart);click(homeStart);
  const started=await waitFor(()=>fakeRecords.workoutStartCount===1&&w.eval('ACTIVE_WORKOUT&&ACTIVE_WORKOUT.session.status==="ACTIVE"'));
  const activeLabel=$('#hc-go')&&$('#hc-go').textContent.includes('继续训练');
  ok(startLabel&&started&&activeLabel&&fakeRecords.workoutStartCount===1,
    '首页「开始训练」创建一个会话，成功后改为「继续训练」且连点不重复创建');
  click($('#hc-go'));
  await waitFor(()=>$('#module').classList.contains('open')&&$('#mod-body [data-set-row]'));
  const initialUpcoming=$('#mod-body .workout-set-upcoming');
  const currentCount=$$('#mod-body .workout-set.current-set').length;
  const futureHidden=initialUpcoming&&!initialUpcoming.open&&initialUpcoming.querySelectorAll('.workout-set').length===2;
  ok(currentCount===1&&futureHidden,'训练页默认只展开当前组，后续组收纳在折叠区');
  const current=$('#mod-body .workout-set.current-set');
  current.querySelector('[data-weight]').value='20';current.querySelector('[data-reps]').value='10';
  click(current.querySelector('[data-complete-set]'));
  const saved=await waitFor(()=>w.eval('ACTIVE_WORKOUT&&ACTIVE_WORKOUT.sets[0].completed'));
  const completedGroup=$('#mod-body .workout-set-completed'),nextCurrent=$('#mod-body .workout-set.current-set');
  const timerInPanel=$('#rest-timer').parentElement===$('#module');
  ok(saved&&completedGroup&&!completedGroup.open&&completedGroup.querySelectorAll('.workout-set').length===1
    &&nextCurrent&&nextCurrent.dataset.setRow==='workout-ui-set-0-1'&&timerInPanel,
    '保存后已完成组折叠、下一组成为当前组，休息计时器位于训练面板内');
  ok(w.eval('STATE.petMood')==='cheer','完成一组后 Boji 进入鼓励表情');
  let safety=0;
  while(w.eval('ACTIVE_WORKOUT&&ACTIVE_WORKOUT.sets.some(row=>!row.completed)')&&safety++<4){
    if(w.eval('ACTIVE_WORKOUT.session.activeRestEndAt')){click($('#rt-skip'));await waitFor(()=>!w.eval('ACTIVE_WORKOUT.session.activeRestEndAt'));}
    const next=$('#mod-body .workout-set.current-set');
    if(!next)break;
    next.querySelector('[data-weight]').value='20';next.querySelector('[data-reps]').value='10';
    click(next.querySelector('[data-complete-set]'));
    await waitFor(()=>w.eval('ACTIVE_WORKOUT&&ACTIVE_WORKOUT.sets.filter(row=>row.completed).length')===safety+1);
  }
  const finishButton=$('#finish-workout');
  if(finishButton)click(finishButton);
  const completed=await waitFor(()=>!w.eval('ACTIVE_WORKOUT')&&$('#done-modal').classList.contains('show'));
  const workflowEvents=productEvents.slice(5).map(event=>event.type);
  ok(completed&&workflowEvents[0]==='workout.started'&&workflowEvents.filter(type=>type==='workout.set_completed').length===3
    &&workflowEvents.includes('workout.completed')&&$('#hc-go').textContent.includes('开始训练'),
    '训练完成后记录开始、三组保存与完成事件，首页恢复开始入口');
  w.goModule('training');$('#mod-body').scrollTop=200;w.goModule('boji');
  ok($('#mod-body').scrollTop===0,'切换到其他模块时回到页面顶部，避免沿用上一页滚动位置');
  w.eval("bubbleBusy=false;petRoundBubble('拜拜',1)");
  ok($('#pet-bubble').textContent==='拜拜', '桌宠问候和告别气泡显示中文短句');
  dom.window.close();
  console.log(`\n==== 结果：${pass} PASS / ${fail} FAIL ====`);
  process.exitCode = fail ? 1 : 0;
})();
})().catch(error=>{console.error(error);process.exitCode=1;});
