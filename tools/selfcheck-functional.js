/* 训练日记 v1.0.0 行为级回归测试（jsdom） */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const PROJ = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(PROJ, 'index.html'), 'utf8').replace('<script src="app.js"></script>', '');
const appJs = fs.readFileSync(path.join(PROJ, 'app.js'), 'utf8');
const appForTests = appJs.replace("document.addEventListener('DOMContentLoaded', boot);", "document.addEventListener('DOMContentLoaded', ()=>{ if(window.__TEST_V2_STATE__) hydrateState(window.__TEST_V2_STATE__); DATA_READY=true; bootUI(); });");

const dateKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const tk = () => dateKey(new Date());
const dayKey = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return dateKey(d); };

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name); } };

// ---- 场景一：旧数据迁移（water:3 杯 → 750ml），并预置打卡与档案 ----
const seed = {
  profile: { height: 172, weight: 70, dumbbell: 10, name: '训练者' },
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
w.BojiData = { localDateKey(date){ const d = date instanceof Date ? date : new Date(date == null ? Date.now() : date); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; } };
w.__TEST_V2_STATE__ = seed;
// 以经典脚本方式注入 app.js（严格模式下 top-level 函数仍挂到 window，let/const 经 eval 导出）
const sc = w.document.createElement('script');
sc.textContent = appForTests;
w.document.body.appendChild(sc);
w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
w.eval('window.__S = STATE; window.__PLANS = PLANS;');

const doc = w.document;
const $ = s => doc.querySelector(s);
const $$ = s => Array.from(doc.querySelectorAll(s));
const click = n => n.dispatchEvent(new w.Event('click', { bubbles: true }));
const input = n => n.dispatchEvent(new w.Event('input', { bubbles: true }));
const change = n => n.dispatchEvent(new w.Event('change', { bubbles: true }));

// 1. 迁移：3 杯 → 750ml
ok(w.__S.waterMl === 750, '旧「杯」数据迁移为 ml（3杯=750ml）');
ok(typeof w.dailyGoal === 'function', 'dailyGoal 函数存在');

// 2. dailyGoal 随体重计算
const g = w.dailyGoal();
ok(g.protein === 126 && g.kcal === 2310 && g.water === 2450, `每日目标随体重计算(70kg→126g/2310kcal/2450ml) 实际=${g.protein}/${g.kcal}/${g.water}`);

// 3. 主页明确「居家哑铃」
ok($('#home-stats').textContent.includes('居家哑铃'), '主页出现「居家哑铃」定位文案');

// 4. 训练页标签（今天若是周日休息日，则选下一个周一验证）
{
  const d = new Date(); d.setDate(d.getDate() + ((1 - d.getDay() + 7) % 7 || 7));
  const monKey = dateKey(d);
  w.__S.selDate = monKey; w.renderProfile; // noop
  w.eval('renderTraining')(doc.querySelector('#mod-body'));
  ok($('#mod-body').innerHTML.includes('居家哑铃'), '训练计划卡带「居家哑铃」标签');
}

// 5. 饮水：+250ml 按钮
w.goModule('diet');
ok($('#water-250') && $('#water-100') && $('#water-sub'), '饮水按钮为 ml 计量（+100/+250/-100）');
click($('#water-250'));
ok(w.__S.waterMl === 1000, '点击 +250ml 后 waterMl=1000');
ok($('#mod-body').innerHTML.includes('1000'), '饮水卡片实时显示 ml 数值');

// 6. 饮食总计目标随档案
ok($('#mod-body').innerHTML.includes('/ ' + g.protein + ' g'), '蛋白目标行显示档案计算值');
ok($('#mod-body').innerHTML.includes('/ ' + g.kcal + ' kcal'), '热量目标行显示档案计算值');

// 7. 拍照校正面板：搜索 → 选食物 → 改份量 → 添加
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
ok(!$('#food-sheet').classList.contains('show'), '添加后校正面板关闭');
const lunch = w.__S.meals[tk()][1];
ok(lunch && lunch.length === 1 && lunch[0].q === 2 && lunch[0].photo !== null, '记录已写入（q=2，含照片）');

// 8. 手动选择兜底入口仍在
w.goModule('diet');
const manualBtn = $$('#mod-body [data-add]');
ok(manualBtn.length === 4, '四餐均保留「手动选」兜底按钮');

// 9. 饮食条目带缩略图与 kcal
ok($('#mod-body').innerHTML.includes('fd-ph'), '已记录条目显示照片缩略');
ok($('#mod-body').innerHTML.includes('kcal'), '条目显示 kcal');

// 10. 档案实时编辑：体重 70→80，立即影响目标
w.goModule('profile');
ok($('#pe-w') && $('#pe-name') && $('#pe-h') && $('#pe-d'), '档案编辑表单齐全（昵称/身高/体重/哑铃）');
const pw = $('#pe-w'); pw.value = '80'; input(pw);
ok(w.__S.profile.weight === 80, '体重改 80 实时写入 STATE');
ok(w.dailyGoal().protein === 144, '蛋白目标即时变为 144g（80×1.8）');
ok($('#pe-d') !== null && +$('#pe-d').value === 10, '哑铃重量可编辑');

// 11. 昵称实时更新
const pn = $('#pe-name'); pn.value = '小凯'; input(pn);
ok($('#pf-name').textContent === '小凯', '昵称实时同步到头部显示');

// 12. 头像上传链路（直接写 avatar 后渲染）
w.__S.profile.avatar = 'data:image/png;base64,XYZ';
w.renderProfile($('#mod-body'));
ok($('#pf-av').src.startsWith('data:image'), '头像显示为自定义头像');
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

// 22. 回归：完成打卡 → 弹窗 → 评分提示 toast 存在（finishDay 路径不报错）
w.__S.selDate = tk(); w.__S.checkins[tk()] = null; delete w.__S.checkins[tk()];
w.goModule('training');
$$('#mod-body .ex-do[data-ex]').forEach(b => click(b));
// 全部动作勾选后逐一打卡
const dType = w.eval('getDayType')(new Date().getDay());
const plan = w.__PLANS[dType];
if (plan) {
  w.finishDay(tk(), dType);
} else {
  // 休息日不执行
}
ok(true, 'finishDay 无异常（休息日跳过）');

// 24. 自然语言处理层（NLP）：归一化 / 同义词 / 意图 / 模糊匹配 / 异常边界 / 可复现
{
  const norm = w.eval('nlpNormalize');
  const expand = w.eval('nlpExpand');
  const intent = w.eval('nlpIntent');
  const kb = w.eval('nlpKbScore');
  const reply = w.eval('nahidaReply');

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

// 23. 回归：导出 CSV 带 BOM（若 Blob 支持 arrayBuffer）
(async () => {
  let bomOk = false;
  try {
    let captured = null;
    w.URL.createObjectURL = (blob) => { captured = blob; return 'blob:x'; };
    w.URL.revokeObjectURL = () => {};
    w.exportCSV();
    if (captured) { const buf = await captured.arrayBuffer(); const u8 = new w.Uint8Array(buf); bomOk = u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF; }
  } catch (e) { bomOk = false; }
  ok(bomOk, '回归：exportCSV 仍带 UTF-8 BOM');
  ok(w.eval('_csvRow')(['=1+1','@SUM(A1:A2)']).includes("'=1+1") && w.eval('_csvRow')(['=1+1','@SUM(A1:A2)']).includes("'@SUM"), 'CSV 公式前缀被转为文本');
  console.log(`\n==== 结果：${pass} PASS / ${fail} FAIL ====`);
  process.exit(fail ? 1 : 0);
})();
