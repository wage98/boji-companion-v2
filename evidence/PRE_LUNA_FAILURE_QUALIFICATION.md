# PRE_LUNA_FAILURE_QUALIFICATION

V1 = wage98/boji-diary · 全部实验在 disposable temp 沙箱内完成

---

## LIVE_BASELINE

```
HEAD                = c0a8d55283765a0f7d7e4d773df0609ba1e4049d
historical_anchor   = cbccea4c47995711d1ae0af2d7c76449febe2603
product_bytes_relation = IDENTICAL
  证据1  git diff --stat cbccea4..HEAD -- app.js sw.js tools/  →  空（零差异）
  证据2  md5 逐字节比对
         app.js                      de6c85693fb1b90a11ab948d0d2565a8  (两树相同)
         tools/selfcheck-functional.js  c2295592134e83910e9b2f7f8420cc2b  (两树相同)
         tools/selfcheck-attack.js      c8fecc1ea1121d0cb206ae5545ab6200  (两树相同)
  证据3  其间两个提交为 docs-only（997d2b5 / c0a8d55）
```

---

## FUNCTIONAL_F1

```
test file      = tools/selfcheck-functional.js
test line      = 161
test name      = 月历点其它日期可补录评分
exact assertion= ok(w.__S.scores[yKey] && w.__S.scores[yKey].feel === 2, '月历点其它日期可补录评分')
                 其中 yOff = (new Date().getDate() >= 2) ? -1 : 1 ;  yKey = dayKey(yOff)
expected       = scores[yKey].feel === 2（昨天被补录为「感受 2 星」）
observed       = scores[yKey] === undefined（日号==2 时）；日号!=2 时 PASS
fixtures/state = seed.checkins，其偏移阈值与测试不一致：
                   seed  : (getDate() >= 3) ? [0,-1,-2] : [0,+1,+2]
                   test  : (getDate() >= 2) ? -1 : +1
product path   = app.js:3273-3280 月历点击处理器
                 app.js:3274  if(!STATE.checkins[k]){ toast('这一天还没有打卡记录哦'); return; }
date/time/TZ   = YES —— 由「本地日历日号」决定，与时刻/时区本身无关
external files = 无
order matters  = YES —— 依赖 #17 先写入今日评分、#19 的 score-del
```

**classification = C. FIXTURE / DATE_ENVIRONMENT_DEPENDENCY**

**root_cause**
夹具 seed 的偏移方向阈值是 `>=3`，而用例 18 的偏移方向阈值是 `>=2`。
当每月**日号 == 2** 时：seed 取 `[0,+1,+2]`（今天/明天/后天），测试取 `-1`（昨天），
于是 `yKey`（昨天）不在 `STATE.checkins` 中。app.js:3274 的门禁使点击直接 toast 返回，
`dataScoreDay` 保持为今天；随后「点 2 星 + 保存」把**今天**的评分覆盖成 feel=2，
F1 断言的 `scores[yKey]` 始终不存在 → FAIL。每月恰好 1 天触发。

**evidence**
```
app.js:3274   if(!STATE.checkins[k]){ toast('这一天还没有打卡记录哦'); return; }

同一机器 / 同一 commit / 仅本地日历日不同：
  TZ=UTC     → 本地日期 2026-10-02（日号=02）→ 结果：53 PASS / 2 FAIL   ← F1、F2 均 FAIL
  TZ 默认(+8)→ 本地日期 2026-10-03（日号=03）→ 结果：55 PASS / 0 FAIL   ← F1、F2 均 PASS
```
> 未改动任何生产行为；产品按设计拒绝为「无打卡记录」的日期补录评分。

---

## FUNCTIONAL_F2

```
test file      = tools/selfcheck-functional.js
test line      = 168
test name      = 今日评分数据在档（月历可渲染 ★）
exact assertion= ok($$('#mod-body .cal-day').length > 0 && w.__S.scores[tk()] !== undefined, ...)
expected       = 月历有格子 且 今日评分仍在档
observed       = scores[tk()] === undefined（日号==2 时）
```

**classification = C. FIXTURE / DATE_ENVIRONMENT_DEPENDENCY（F1 的连锁后果）**

**root_cause**
用例 19 点击 `#score-del`。由于 F1 中 `dataScoreDay` 从未切换到 yKey、仍指向**今天**，
`score-del` 删除的是**今天**的评分而非 yKey 的评分。
于是用例 19 空洞通过（`!scores[yKey]` 天然为真），用例 20 断言的 `scores[tk()]` 已被误删 → FAIL。

**evidence** 同上 TZ 对照实验；F1/F2 始终同进同退，从未单独出现。

---

## ATTACK_J15

```
test file      = tools/selfcheck-attack.js
test line      = 621
test name      = J15 离线评测报告已落盘
exact assertion= check('J15 离线评测报告已落盘', () => rep)
                 rep = fs.existsSync(path.join(PROJ,'eval-set','last-offline-report.txt'))
required_artifact = eval-set/last-offline-report.txt
  tracked?     = NO  —— eval-set/ 被 .gitignore:21 排除，git ls-files eval-set/ → 0 条
  generated?   = YES
  ignored?     = YES （.gitignore:21  eval-set/）
generator      = tools/eval-vision.js  （line 169  fs.writeFileSync(.../eval-set/last-offline-report.txt)）
expected before selfcheck? = 是，需先跑生成器
should selfcheck generate? = 当前不生成、也不跳过 → 前置条件缺陷
```

**classification = C. MISSING_GENERATED_FIXTURE**（次级：B. HARNESS_PRECONDITION_BUG）

**root_cause**
`eval-set/` 是 gitignore 的本地目录，全新 clone 中不存在；J15 直接断言该生成物存在，
既未由 selfcheck 生成、也未在无生成物时 skip，所以在干净环境下必然失败。

**附加发现（生成器自身缺陷）**
`tools/eval-vision.js` 与 `tools/eval-simulate.js` 均未创建 `eval-set/` 目录，
在该目录不存在时自身即以 ENOENT 崩溃：
```
errno -4058, code 'ENOENT', path 'C:\tmp\boji_v1_head\eval-set\last-offline-report.txt'
```
即「文档化的生成器」在干净 clone 中无法直接运行，需先手工建目录。

**rerun_result = PASS**
```
mkdir -p eval-set && node tools/eval-vision.js   → EXIT=0
重跑 selfcheck → line 174: PASS J15 离线评测报告已落盘
```

---

## ATTACK_K8

```
test file      = tools/selfcheck-attack.js
test line      = 679
test name      = K8 多场景模拟评测报告已落盘（准确率口径）
exact assertion= rep = fs.existsSync('eval-set/last-simulate-report.txt')
                 且内容同时含 '准确率' 与 '迭代效果'
required_artifact = eval-set/last-simulate-report.txt
  tracked?  NO ／ generated? YES ／ ignored? YES（同 eval-set/）
generator      = tools/eval-simulate.js
                 line 108  '准确率 ...'  line 114  '==== 迭代效果 ...'  line 120  writeFileSync
```

**classification = C. MISSING_GENERATED_FIXTURE**（次级：B. HARNESS_PRECONDITION_BUG）

**root_cause** 同 J15：gitignore 的生成物未产出即被断言。

**rerun_result = PASS**
```
mkdir -p eval-set && node tools/eval-simulate.js  → EXIT=0
  （报告内容含「准确率 23.1% → 61.5%」「==== 迭代效果 ====」）
重跑 selfcheck → line 184: PASS K8 多场景模拟评测报告已落盘（准确率口径）
```

---

## PORTABLE_HARNESS

```
jsdom_version  = 28.1.0   （现由 C:/Users/WaGe/.workbuddy/.../node_modules 解析到）
qrcode_version = 1.5.4

temporary_manifest = /c/tmp/boji_v1_portable/package.json （全新 clone，仅实验用）
  { "devDependencies": { "jsdom": "28.1.0", "qrcode": "1.5.4" } }
  npm install --no-audit --no-fund → added 75 packages in 11s（含 package-lock.json）

temporary_changes  = 仅 tools/selfcheck.js 两行（语义零改动）
  - const NODE_PATH = 'C:/Users/WaGe/.workbuddy/binaries/node/workspace/node_modules';
  - env: Object.assign({}, process.env, { NODE_PATH })
  （改为依赖标准 Node 解析，从项目 ./node_modules 取 jsdom/qrcode）

syntax_check   = node --check app.js OK ／ node --check sw.js OK

portable_run_result
  未生成 eval-set ：55 PASS / 0 FAIL  ＋ 193 PASS / 3 FAIL（D1 抖动 + J15 + K8）
  生成 eval-set 后 ：55 PASS / 0 FAIL  ＋ 195 PASS / 1 FAIL（仅 D1 抖动）
  再跑 2 轮        ：55 PASS / 0 FAIL  ＋ 196 PASS / 0 FAIL  → RESULT: ALL PASSED

fresh_disposable_run_result = 与上述一致（本实验本身即「全新 clone + 声明式依赖」）

portable_reproduction_status = PASS
  结论：去掉机器专有 NODE_PATH 后结果与 WorkBuddy 路径运行完全等价，可移植 harness 可行。
```

---

## HISTORICAL_ANCHOR

```
cbccea4_run_result
  = 55 PASS / 0 FAIL ＋ 196 PASS / 0 FAIL = 251 PASS / 0 FAIL
    RESULT: ALL PASSED（exit 0）
  条件：eval-set 前置已生成 且 本地日号 != 2

same_failures = NO
  在相同前置条件下，F1 / F2 / J15 / K8 在 cbccea4 全部 PASS，
  与 HEAD 的表现一致——差异从不来自这两个 docs-only 提交。

docs-only 提交零影响（A/B 逐轮同步证明）
  iter1  HEAD    196 PASS / 0 FAIL  RESULT: ALL PASSED
  iter1  cbccea4 196 PASS / 0 FAIL  RESULT: ALL PASSED
  iter2  HEAD    195 PASS / 1 FAIL  FAIL D1
  iter2  cbccea4 195 PASS / 1 FAIL  FAIL D1
  iter3  HEAD    195 PASS / 1 FAIL  FAIL D1
  iter3  cbccea4 195 PASS / 1 FAIL  FAIL D1
  → 两树逐轮结果逐项一致，剩余差异只有 D1 的时序抖动。

historical_251_all_passed_reproduced = YES
  但为**条件性成立**，非无条件成立：
    ① 必须先在 eval-set/ 生成两个报告（且该目录需预先存在）
    ② 本地日历日号不能为 2
    ③ D1 断言存在时序抖动，需重试或放宽预算
  未通过编辑任何测试来「制造」该结果。
```

---

## RECOMMENDED_BASELINE

```
repo_head      = c0a8d55283765a0f7d7e4d773df0609ba1e4049d （live 权威 HEAD）
product_anchor = cbccea4c47995711d1ae0af2d7c76449febe2603
reason
  · 两者在 app.js / sw.js / tools/ 上字节完全相同（md5 + git diff 双证）
  · cbccea4 的价值是「历史 v1.2 产品锚点」，不是可运行基线
  · V2/Luna 的 PRESTATE 应取 live HEAD c0a8d55（含最新交接文档），
    产品行为以 cbccea4 与 HEAD 的共同字节为准——二者在行为上不可区分
```

---

## VERDICT

**PASS**

四项失败全部定性完成，且**无一为产品缺陷**：2 项日期夹具依赖、2 项缺失生成物前置。
在 disposable 干净环境下，V1 自检**可**被复现为 251 ALL PASSED，且可移植 harness 已实证可行。

---

## BLOCKERS（进入 Luna 实现前需修复的遗留风险）

1. **D1 时序抖动（唯一残留、会导致 RESULT: FAILED 的不稳定项）**
   `fetch` 已完整 mock，非网络问题。产品侧 `tries=2`、`setTimeout(run,900)`（app.js:2816/2828）；
   隔离探针实测兜底文案在 **983ms** 出现，而用例预算仅 **1350ms**，
   全量套件负载下会超时。产品逻辑经隔离验证正确，属 harness 余量不足。
2. **仓库无任何依赖清单**（无 package.json / package-lock / shrinkwrap / yarn.lock / pnpm-lock），
   selfcheck.js 硬编码 `C:/Users/WaGe/.workbuddy/...` 机器专有 NODE_PATH。
3. **eval-set/ 被 gitignore 且生成器无 mkdir**——文档化流程在干净 clone 中第一步即 ENOENT 崩溃。
4. **J15/K8 断言 gitignore 的生成物**——selfcheck 既不生成也不 skip，干净 clone 必挂。
5. **F1/F2 夹具阈值不一致**（seed `>=3` vs 用例 `>=2`）——每月 1 天必挂，属隐藏的定时炸弹。

---

## NEXT_SAFE_ACTION

在 V2（boji-companion-v2）初始化时一次性落地 G1 最小修复集：

1. 新增 `package.json`：`devDependencies: { jsdom: "28.1.0", qrcode: "1.5.4" }`，提交 lockfile。
2. `selfcheck.js` 删除硬编码 `NODE_PATH` 两行，改用标准 Node 解析。
3. `eval-vision.js` / `eval-simulate.js` 写文件前加 `fs.mkdirSync(dir,{recursive:true})`。
4. selfcheck 对 J15/K8 改为「缺生成物时自动调用生成器」或「显式 skip 并标注 SKIPPED」，
   消除对本地专有产物的隐式依赖。
5. 统一 F1 夹具阈值（seed 与用例同用 `>=3`），或让 `yKey` 直接从 `seed.checkins` 的键中选取。
6. D1 预算 1350ms → 放宽至 ≥3000ms，或改为轮询/事件驱动而非固定 setTimeout。

以上均为测试装置（harness）修复，**不需要也不应该改动任何生产行为**。

---

## COMPLIANCE

- 未修改 live V1（wage98/boji-diary）仓库任何文件；本机无 live 工作副本，全部操作在 temp clone 内。
- 未修改 live V2（wage98/boji-companion-v2）仓库；仅执行只读 `git ls-remote`。
- 未 commit / 未 push / 未 reset / 未 checkout 制造匹配 / 未创建 README 或 LICENSE。
- 所有实验性改动仅在 disposable 目录：`C:\tmp\boji_v1_head`、`boji_v1_cbccea4`、`boji_v1_portable`。
- 终结核验：V1 remote HEAD 仍为 `c0a8d5528...`；V2 `ls-remote` 仍返回空（0 refs）。
- 「251 ALL PASSED」标记为**条件性复现**，未通过编辑测试制造。
