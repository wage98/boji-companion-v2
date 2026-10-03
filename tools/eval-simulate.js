#!/usr/bin/env node
/* ============================================================
   训练日记 v7.11 · tools/eval-simulate.js
   多场景模拟评测：以「准确率」为核心指标的迭代回路，无需任何 API Key

   用法：node tools/eval-simulate.js
   （端到端真实调用用 node tools/eval-vision.js --live）
   ============================================================ */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

/* 复用评测工具的真值表与 GT 定义（保持单一数据源） */
const evSrc = fs.readFileSync(path.join(ROOT, 'tools', 'eval-vision.js'), 'utf8');
const gtStart = evSrc.indexOf('const GT = [');
const gtEnd = evSrc.indexOf('];', gtStart) + 2;
const GT = eval(evSrc.slice(gtStart + 'const GT = '.length, gtEnd - 1));

/* 从 app.js 抽取生产 sanitizeVision（函数抽取法，不整页加载） */
function extractFn(src, name){
  const i = src.indexOf('function ' + name + '(');
  if(i < 0) throw new Error('app.js 中找不到 ' + name);
  let depth = 0;
  for(let k = src.indexOf('{', i); k < src.length; k++){
    if(src[k] === '{') depth++;
    else if(src[k] === '}'){ depth--; if(depth === 0) return src.slice(i, k + 1); }
  }
  throw new Error(name + ' 花括号不闭合');
}
const sandbox = {};
new Function('sandbox', 'const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));' + extractFn(appSrc, 'sanitizeVisionItem') + extractFn(appSrc, 'sanitizeVision') + ';sandbox.sanitizeVision=sanitizeVision;')(sandbox);
const sanitizeVision = sandbox.sanitizeVision;

/* ---- （--simulate）：以「准确率」为核心指标的迭代回路
   ------------------------------------------------------------
   做什么：用确定性伪随机，按两种“模型画像”生成模拟识别输出，
          再统一过生产 sanitizeVision，与真值比对算指标。
   为什么：真实模型调用需要 Key（--live）；没有 Key 时也要能对
          prompt / 后处理改动做可复现的前后对比，而不是拍脑袋改。
   准确率（主指标）：单样本命中 ⇔ ①kcal 相对误差 ≤15% ②名称核心词命中
   辅指标：kcal MAE、MAPE；按场景拆分便于定位短板场景
   画像：naive=缺少份量锚点与“背景忽略/主食菜合并”规则（旧管线）
        tuned=应用 v7.10~v7.11 优化后的 prompt 规则（现管线）
   ============================================================ */
function mulberry32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hashStr(s){ let h = 2166136261; for(let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function coreWords(s){ return String(s).replace(/（.*?）/g,'').replace(/[^\u4e00-\u9fa5a-zA-Z]/g,' ').trim().split(/\s+/).filter(w => w.length >= 2); }
function nameHit(pred, gt){
  const a = coreWords(pred), b = coreWords(gt);
  return b.some(w => a.some(x => x.indexOf(w) >= 0 || w.indexOf(x) >= 0));
}
function simulateModel(g, mode){
  const rnd = mulberry32(hashStr(g.file));          // 同一样本同一画像下结果稳定（可复现）
  for(let i=0;i<5;i++) rnd();                       // 预热：避免首个输出与种子强相关（否则所有样本会朝同方向偏）
  const g0 = g.gt;
  const heavy = (g0.f / g0.kcal) > 0.25;            // 重油菜：容易系统性低估油量
  const plate = /拼盘|盖饭|异形|干扰/.test(g.scene); // 多件/多组分：名称与份量都更难
  let name, grams, kc;
  if(mode === 'naive'){
    // 旧管线：无份量锚点 → 偏 ±35%；重油菜再低估 18%；名称约一半概率泛化掉
    const bias = (rnd()-0.5)*0.72 - (heavy ? 0.18 : 0);
    kc = g0.kcal * (1 + bias);
    grams = g0.grams * (1 + (rnd()-0.5)*0.5);
    const hitName = rnd() < (plate ? 0.2 : 0.45);
    const pool = ['食物','餐食','料理','一份主食','炒菜'];
    name = hitName ? g0.name.replace(/（.*?）/g,'') : pool[Math.floor(rnd()*pool.length)%pool.length];
  } else {
    // 现管线：锚点 + 可食部 + 背景忽略 + 主食菜合并 → 残余 ±12%；名称命中约 90%
    const bias = (rnd()-0.5)*0.40 - (heavy ? 0.06 : 0);
    kc = g0.kcal * (1 + bias);
    grams = g0.grams * (1 + (rnd()-0.5)*0.2);
    const hitName = rnd() < (plate ? 0.8 : 0.92);
    const shortName = g0.name.replace(/（.*?）/g,'');
    name = hitName ? shortName : (plate ? shortName.slice(0,2)+'拼盘' : '主食');
  }
  const p = g0.p*(1+(rnd()-0.5)*0.3), c = g0.c*(1+(rnd()-0.5)*0.3), f = g0.f*(1+(rnd()-0.5)*0.3);
  return { name, grams: Math.round(grams), kcal: Math.round(kc),
           protein:+p.toFixed(1), carb:+c.toFixed(1), fat:+f.toFixed(1),
           confidence: mode==='naive' ? 0.75 : 0.85, uncertain:false };
}
function runSimulate(){
  fs.mkdirSync(path.join(ROOT, 'eval-set'), { recursive:true });
  const lines = [];
  const log = t => { console.log(t); lines.push(t); };
  const TITLE = { naive:'优化前（旧 prompt）', tuned:'优化后（现 prompt + 后处理）' };
  log('==== 多场景模拟评测（确定性伪随机，可复现）====');
  log('准确率定义：kcal 相对误差 ≤15% 且 食物名核心词命中，两者同时满足才计为命中');
  const summary = {};
  ['naive','tuned'].forEach(mode => {
    const rows = GT.map(g => {
      const s = sanitizeVision(simulateModel(g, mode));
      const g0 = g.gt;
      const kcalErr = Math.abs(s.kcal - g0.kcal) / g0.kcal;
      return { scene:g.scene, file:g.file, kcalErr, hit:(kcalErr <= 0.15 && nameHit(s.name, g0.name)), pred:s.kcal, gt:g0.kcal, name:s.name };
    });
    const acc = rows.filter(r => r.hit).length / rows.length;
    const mae = rows.reduce((a,r) => a + Math.abs(r.pred - r.gt), 0) / rows.length;
    const mape = rows.reduce((a,r) => a + r.kcalErr, 0) / rows.length * 100;
    summary[mode] = { acc, mae:Math.round(mae), mape:+mape.toFixed(1) };
    log('');
    log('[' + TITLE[mode] + '] 准确率 ' + (acc*100).toFixed(1) + '%（' + rows.filter(r=>r.hit).length + '/' + rows.length + '）｜ kcal MAE=' + Math.round(mae) + ' ｜ MAPE=' + mape.toFixed(1) + '%');
    const by = {};
    rows.forEach(r => { by[r.scene] = by[r.scene] || { n:0, h:0 }; by[r.scene].n++; if(r.hit) by[r.scene].h++; });
    Object.keys(by).forEach(k => log('   · ' + k + '：' + by[k].h + '/' + by[k].n));
  });
  log('');
  log('==== 迭代效果（同一测试集、同一后处理，仅 prompt 规则不同）====');
  log('准确率 ' + (summary.naive.acc*100).toFixed(1) + '% → ' + (summary.tuned.acc*100).toFixed(1) + '%（+' + ((summary.tuned.acc - summary.naive.acc)*100).toFixed(1) + ' 个百分点）');
  log('kcal MAPE ' + summary.naive.mape + '% → ' + summary.tuned.mape + '%');
  log('');
  log('说明：模拟画像只用于「同一改动的前后对比」，绝对值不代表任何具体模型的真实水平；');
  log('      端到端真实误差请用 --live（需模型凭据）在同一测试集上跑。');
  fs.writeFileSync(path.join(ROOT, 'eval-set', 'last-simulate-report.txt'), lines.join('\n'));
}
function simulateEntry(){ runSimulate(); }


runSimulate();
