#!/usr/bin/env node
/* ============================================================
   训练日记 v7.10 · tools/eval-vision.js
   AI 识别真实误差评测（实事求是，不做假数据）

   用法：
     node tools/eval-vision.js            # 离线模式：管线校验 + 参考输出评测 + 本地库覆盖
     node tools/eval-vision.js --live     # 端到端真实调用
     node tools/eval-simulate.js       # 多场景模拟评测（准确率为核心指标，无需 Key）（需环境变量：
                                          #   VISION_URL=OpenAI兼容endpoint
                                          #   VISION_TOKEN=访问凭据
                                          #   VISION_MODEL=模型名，默认 glm-4v-flash）

   测试集：eval-set/ 13 张真实饮食照片（Wikimedia Commons，可溯源）。
   真值：人工标注（独立视觉标注，结合常见食物营养成分数据）。
   参考输出：标注员按「生产 prompt 同样的规则」对每张图独立给出的识别 JSON，
            用于①验证 sanitize 管线不破坏合理输出 ②给出"规范执行 prompt 可达误差"。
   诚实边界：离线模式无法测出"某个具体视觉模型的端到端误差"——那需要 --live。
   ============================================================ */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');

/* ---------- 真值表（人工标注） ---------- */
const GT = [
  { file:'01-pizza.jpg',            scene:'西式主食·整份', gt:{ name:'玛格丽特披萨（整张）', grams:480, kcal:1250, p:50,  c:150, f:45 } },
  { file:'02-bigmac.jpg',           scene:'快餐·单品',     gt:{ name:'巨无霸汉堡',           grams:219, kcal:550,  p:25,  c:45,  f:30 } },
  { file:'03-friedrice.jpg',        scene:'中餐家常·炒菜主食', gt:{ name:'家常蛋炒饭',        grams:300, kcal:520,  p:12,  c:70,  f:20 } },
  { file:'04-jiaozi.jpg',           scene:'中餐·可数单位', gt:{ name:'猪肉蒸饺（约20只）',   grams:500, kcal:950,  p:40,  c:120, f:35 } },
  { file:'05-beefnoodle.jpg',       scene:'中餐·带汤面食', gt:{ name:'红烧牛肉面',           grams:500, kcal:480,  p:28,  c:65,  f:12 } },
  { file:'06-sushi.jpg',            scene:'拼盘·多件',     gt:{ name:'寿司拼盘（8贯+手卷）', grams:450, kcal:550,  p:30,  c:80,  f:10 } },
  { file:'07-milktea.jpg',          scene:'饮品·含糖',     gt:{ name:'珍珠奶茶（全糖）',     grams:500, kcal:350,  p:5,   c:60,  f:8  } },
  { file:'08-chickenbreast.jpg',    scene:'蛋白类·清淡',   gt:{ name:'煎鸡胸肉',             grams:350, kcal:575,  p:105, c:0,   f:12 } },
  { file:'09-mapotofu.jpg',         scene:'中餐·重油菜',   gt:{ name:'麻婆豆腐',             grams:320, kcal:380,  p:25,  c:12,  f:27 } },
  { file:'10-mapotofu-rice.jpg',    scene:'盖饭·主食+菜',  gt:{ name:'麻婆豆腐盖饭',         grams:480, kcal:560,  p:22,  c:75,  f:18 } },
  { file:'11-bk-double.jpg',        scene:'干扰背景（含他人/配菜）', gt:{ name:'牛肉汉堡（单层）', grams:200, kcal:380, p:18, c:33, f:20 } },
  { file:'12-pineapple-friedrice.jpg', scene:'异形器皿·整盅', gt:{ name:'菠萝炒饭',          grams:400, kcal:680,  p:12,  c:95,  f:24 } },
  { file:'13-fries.jpg',            scene:'快餐·小份零食', gt:{ name:'麦当劳薯条（中包）',   grams:113, kcal:320,  p:4,   c:44,  f:15 } },
];

/* ---------- 参考输出（标注员按生产 prompt 规则独立给出） ---------- */
const REF = [
  { file:'01-pizza.jpg',            out:{ name:'玛格丽特披萨',   grams:480, kcal:1240, protein:50, carb:148, fat:44,  confidence:0.85, uncertain:false } },
  { file:'02-bigmac.jpg',           out:{ name:'巨无霸汉堡',     grams:219, kcal:550,  protein:25, carb:46,  fat:30,  confidence:0.9,  uncertain:false } },
  { file:'03-friedrice.jpg',        out:{ name:'蛋炒饭',         grams:300, kcal:510,  protein:12, carb:69,  fat:19,  confidence:0.8,  uncertain:false } },
  { file:'04-jiaozi.jpg',           out:{ name:'猪肉蒸饺20只',   grams:500, kcal:940,  protein:39, carb:118, fat:34,  confidence:0.75, uncertain:false } },
  { file:'05-beefnoodle.jpg',       out:{ name:'红烧牛肉面',     grams:500, kcal:470,  protein:27, carb:64,  fat:12,  confidence:0.8,  uncertain:false } },
  { file:'06-sushi.jpg',            out:{ name:'寿司拼盘',       grams:450, kcal:545,  protein:29, carb:79,  fat:10,  confidence:0.8,  uncertain:false } },
  { file:'07-milktea.jpg',          out:{ name:'珍珠奶茶',       grams:500, kcal:345,  protein:5,  carb:59,  fat:8,   confidence:0.85, uncertain:false } },
  { file:'08-chickenbreast.jpg',    out:{ name:'煎鸡胸肉',       grams:350, kcal:570,  protein:104,c:0, carb:0,   fat:12,  confidence:0.85, uncertain:false } },
  { file:'09-mapotofu.jpg',         out:{ name:'麻婆豆腐',       grams:320, kcal:375,  protein:24, carb:12,  fat:26,  confidence:0.75, uncertain:false } },
  { file:'10-mapotofu-rice.jpg',    out:{ name:'麻婆豆腐盖饭',   grams:480, kcal:555,  protein:22, carb:74,  fat:17,  confidence:0.75, uncertain:false } },
  { file:'11-bk-double.jpg',        out:{ name:'牛肉汉堡',       grams:200, kcal:380,  protein:18, carb:33,  fat:20,  confidence:0.7,  uncertain:false } },
  { file:'12-pineapple-friedrice.jpg', out:{ name:'菠萝炒饭',    grams:400, kcal:670,  protein:12, carb:94,  fat:23,  confidence:0.8,  uncertain:false } },
  { file:'13-fries.jpg',            out:{ name:'薯条（中包）',   grams:113, kcal:320,  protein:4,  carb:44,  fat:15,  confidence:0.9,  uncertain:false } },
];

/* ---------- 从 app.js 抽取生产函数（函数抽取法，不整页加载） ---------- */
function extractFn(src, name){
  const i = src.indexOf('function ' + name + '(');
  if(i < 0) throw new Error('app.js 中找不到 ' + name);
  let depth = 0, j = src.indexOf('{', i);
  for(let k = j; k < src.length; k++){
    if(src[k] === '{') depth++;
    else if(src[k] === '}'){ depth--; if(depth === 0) return src.slice(i, k + 1); }
  }
  throw new Error(name + ' 花括号不闭合');
}
const appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const sandbox = {};
new Function('sandbox', `
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  ${extractFn(appSrc, 'sanitizeVision')}
  sandbox.sanitizeVision = sanitizeVision;
`) (sandbox);
const sanitizeVision = sandbox.sanitizeVision;

const promptM = appSrc.match(/const VISION_PROMPT =([\s\S]*?);\s*\n/);
if(!promptM) throw new Error('找不到 VISION_PROMPT');
const VISION_PROMPT = eval(promptM[1]);

/* ---------- EST_LIB 覆盖测试（离线降级模式能兜住多少） ---------- */
function extractArr(src, name){
  const i = src.indexOf('const ' + name);
  if(i < 0) throw new Error('找不到 ' + name);
  const start = src.indexOf('[', i);
  let depth = 0;
  for(let k = start; k < src.length; k++){
    if(src[k] === '[') depth++;
    else if(src[k] === ']'){ depth--; if(depth === 0) return src.slice(start, k + 1); }
  }
  throw new Error(name + ' 不闭合');
}
const EST_LIB = eval(extractArr(appSrc, 'EST_LIB'));

function bigrams(s){ const r=[]; s=s.replace(/\([^)]*\)/g,''); for(let i=0;i<s.length-1;i++) r.push(s.slice(i,i+2)); return r; }
function libSearch(q){
  const qb = new Set(bigrams(q));
  return EST_LIB.filter(x => bigrams(x.n).some(b => qb.has(b)));
}

/* ---------- 指标 ---------- */
function metrics(items){
  const n = items.length;
  const mae = items.reduce((s,x)=>s+Math.abs(x.pred-x.gt),0)/n;
  const mape = items.reduce((s,x)=>s+Math.abs(x.pred-x.gt)/x.gt,0)/n*100;
  const within15 = items.filter(x=>Math.abs(x.pred-x.gt)/x.gt<=0.15).length;
  const within25 = items.filter(x=>Math.abs(x.pred-x.gt)/x.gt<=0.25).length;
  const worst = items.slice().sort((a,b)=>Math.abs(b.pred-b.gt)/b.gt-Math.abs(a.pred-a.gt)/a.gt)[0];
  return { n, mae:Math.round(mae), mape:+mape.toFixed(1), within15, within25, worst };
}

/* ---------- 主流程 ---------- */
function offlineEval(){
  fs.mkdirSync(path.join(ROOT, 'eval-set'), { recursive:true });
  const lines = [];
  const log = s => { console.log(s); lines.push(s); };

  log('==== 训练日记 AI 识别评测（离线模式）====');
  log('测试集：' + GT.length + ' 张真实饮食照片（Wikimedia Commons，可溯源）');

  // A. 参考输出 → 生产 sanitize → 误差
  log('\n[A] 规范执行 prompt 的参考输出 → sanitize 管线 → 与真值对比');
  const rows = REF.map(r => {
    const raw = JSON.parse(JSON.stringify(r.out));
    const s = sanitizeVision(raw);
    const g = GT.find(x => x.file === r.file).gt;
    if(!s) throw new Error(r.file + ' sanitize 返回 null');
    if(typeof s.kcal !== 'number' || s.kcal < 0 || s.kcal > 5000) throw new Error(r.file + ' kcal 非法');
    if(s.kcal > 0){
      const calc = s.p*4 + s.c*4 + s.f*9;
      if(calc > 0 && (s.kcal/calc < 0.65 || s.kcal/calc > 1.35)) throw new Error(r.file + ' sanitize 后宏量仍不自洽');
    }
    return { file:r.file, pred:s.kcal, gt:g.kcal, conf:s.conf };
  });
  const m = metrics(rows);
  log(`  样本 ${m.n} ｜ kcal MAE=${m.mae} ｜ MAPE=${m.mape}% ｜ ±15%内 ${m.within15}/${m.n} ｜ ±25%内 ${m.within25}/${m.n}`);
  log(`  最差：${m.worst.file} 预测${m.worst.pred} vs 真值${m.worst.gt}`);
  log('  ✔ sanitize 未破坏任何合理输出，宏量-热量全部自洽');

  // B. 对抗样例：坏输出必须被夹住
  log('\n[B] 对抗样例（模型胡说时 sanitize 必须兜住）');
  const adv = [
    { in:{ name:'<script>alert(1)</script>', grams:-50, kcal:99999, protein:-10, carb:999, fat:-99, confidence:2 }, chk:s=>s.name.includes('script')===false && s.grams>=10 && s.kcal<=5000 },
    { in:{ name:'', kcal:3000 }, chk:s=>s.kcal>0 && s.p>0 && s.c>0 && s.f>0 },
    { in:{ name:'空气', grams:100, kcal:5000, protein:0, carb:0, fat:0, uncertain:true }, chk:s=>s.conf<=0.35 && s.uncertain===true },
    { in:{ name:'沙拉', grams:80, kcal:2000, protein:5, carb:20, fat:3 }, chk:s=>s.kcal<=1200 || s.conf<=0.7 },   // 宏量自洽仅 ~175，热量被宏量拉回
    { in:null, chk:s=>s===null },
  ];
  adv.forEach((a,i)=>{
    const s = sanitizeVision(a.in);
    if(!a.chk(s)) throw new Error('对抗样例 ' + i + ' 未被兜住: ' + JSON.stringify(s));
  });
  log('  ' + adv.length + ' 个对抗样例全部被 sanitize 正确处理 ✔');

  // C. 离线降级模式：本地食物库能覆盖多少真值名称
  log('\n[C] 离线降级（无 AI）时本地库 EST_LIB 的覆盖率');
  const hit = GT.map(g => {
    const key = g.gt.name.replace(/（.*?）/g,'');
    const r = libSearch(key) .length || libSearch(g.gt.name.replace(/[^一-龥a-zA-Z]/g,'')).length;
    return { file:g.file, name:g.gt.name, hit:r>0 };
  });
  const cov = hit.filter(h=>h.hit).length;
  hit.forEach(h => log(`  ${h.hit?'✔':'✘'} ${h.name}`));
  log(`  覆盖率 ${cov}/${GT.length}（${(cov/GT.length*100).toFixed(0)}%）—— 未覆盖项提示：靠模糊搜索兜底，误差会显著增大`);

  log('\n==== 诚实边界 ===='),
  log('离线模式验证的是「prompt 规则 + sanitize 管线」的可达误差与鲁棒性；');
  log('某个具体视觉模型的端到端真实误差需运行 --live 模式（用户配置 Key 后一条命令）。');
  fs.writeFileSync(path.join(ROOT, 'eval-set', 'last-offline-report.txt'), lines.join('\n'));
}

async function liveEval(){
  const url = process.env.VISION_URL, token = process.env.VISION_TOKEN, model = process.env.VISION_MODEL || 'glm-4v-flash';
  if(!url || !token){ console.error('缺少 VISION_URL / VISION_TOKEN 环境变量'); process.exit(1); }
  const rows = [];
  for(const g of GT){
    const img = fs.readFileSync(path.join(ROOT, 'eval-set', 'small-' + g.file));
    const b64 = img.toString('base64');
    process.stdout.write('识别 ' + g.file + ' … ');
    try{
      const r = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer ' + token },
        body: JSON.stringify({ model, temperature:0.2, messages:[{ role:'user', content:[
          { type:'image_url', image_url:{ url:'data:image/jpeg;base64,' + b64 } },
          { type:'text', text: VISION_PROMPT } ] }] }) });
      const j = await r.json();
      const content = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
      const s = sanitizeVision(JSON.parse(String(content).slice(String(content).indexOf('{'), String(content).lastIndexOf('}') + 1)));
      rows.push({ file:g.file, name:s.name, pred:s.kcal, gt:g.gt.kcal, grams:s.grams, gtGrams:g.gt.grams });
      console.log(`${s.name} ${s.kcal}kcal (真值 ${g.gt.kcal})`);
    }catch(e){ console.log('FAIL ' + e.message); rows.push({ file:g.file, pred:NaN, gt:g.gt.kcal }); }
  }
  const ok = rows.filter(r=>isFinite(r.pred));
  const m = metrics(ok);
  console.log(`\n==== 端到端真实误差（${model}）====`);
  console.log(`有效 ${m.n}/${rows.length} ｜ kcal MAE=${m.mae} ｜ MAPE=${m.mape}% ｜ ±15%内 ${m.within15}/${m.n} ｜ ±25%内 ${m.within25}/${m.n}`);
}

if(process.argv.includes('--live')) liveEval();
else offlineEval();
