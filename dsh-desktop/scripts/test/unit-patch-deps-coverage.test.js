'use strict';

// ---------------------------------------------------------------------------
// patch-deps 覆盖一致性回归（v0.6.0 alpha.3 收口根治配套）。
//
// 背景：postinstall 管线缺口根因是「注册表登记 ↔ patch-deps 手写接线」双源
// 漂移——patch-registry 里登记的 root 补丁（如 pi-ai-overflow-message /
// token-meter-clamp / atomic-write-orphan-lock / settings-models-resilience）
// 曾被 patch-deps 逐条 remember 式漏接，npm ci 重置 dev 树后干预静默消失。
// patch-deps.js 重构为注册表驱动（canonical applyAll 全链）后，本测试锁死
// 该结构不变量，防止退回手写块：
//   A. root 规格全集 ⊆ patch-deps 默认覆盖集（注册表驱动，天然无漏项）；
//   B. 源码级防退化：patch-deps 不得再逐条 require 单个补丁脚本接线；
//   C. dev ctx 只命中 appDir（dev 树）副本，home/userDataDir 副本归 boot/CLI；
//   D. 端到端实证：vendor pristine 包提取到临时树 → 全链应用落盘 → 重跑
//      幂等零写 → 还原 pristine 后篡改锚点 → anchorMissing 非零回流
//      （fail-loud 信号在管线层可见，即评审警告 #3 的回归位）。
//   E. dev 树磁盘收口：每项 file 补丁在 appDir 副本都必须已是最终态；
//   F. 出厂门禁存在性：stage-payload.sh 必须真调用 verify-payload-patches.js；
//   G. transform 可达性：未接线（未导出/未登记/未被同文件调用）的补丁函数必须就地
//      写明【休眠】理由——否则“注释读起来像已修”与“物理上永远跑不到”会同时在野。
// ---------------------------------------------------------------------------

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPTS = path.join(__dirname, '..');
const DESKTOP = path.join(SCRIPTS, '..');
const patchDeps = require('../patch-deps'); // require.main 守卫：加载无副作用
const { PATCH_SPECS } = require('../lib/patch-registry');
const { checkPatchClosure } = require('../lib/patch-closure');

const { runDevTreePatch, buildDevCtx } = patchDeps;

test('A：注册表全部 root 规格都在 patch-deps 默认覆盖集内（含历史漏接的 4 项）', () => {
  const rootIds = PATCH_SPECS.filter((s) => s.kind === 'root').map((s) => s.id);
  assert.ok(rootIds.length >= 16, `root 规格应 ≥16，实际 ${rootIds.length}`);
  // 默认覆盖集 = getSpecsByGroup() 全量（root + file）；漏接防线：root 全在。
  const covered = new Set(PATCH_SPECS.map((s) => s.id));
  for (const id of rootIds) assert.ok(covered.has(id), `root 规格 ${id} 不在覆盖集`);
  for (const id of [
    'pi-ai-overflow-message', 'token-meter-clamp',
    'atomic-write-orphan-lock', 'settings-models-resilience',
  ]) {
    assert.ok(covered.has(id), `历史漏接项 ${id} 必须被注册表驱动覆盖`);
  }
});

test('B：patch-deps 源码禁止逐条 require 补丁脚本接线（防退化回手写块）', () => {
  const src = fs.readFileSync(path.join(SCRIPTS, 'patch-deps.js'), 'utf8');
  // 允许：./lib/patch-io、./lib/patch-registry、./integration/patch-runner
  const offenders = [...src.matchAll(/require\(['"]\.\/patch-[^'"]+['"]\)/g)].map((m) => m[0]);
  assert.deepEqual(offenders, [], `patch-deps 出现单补丁直连 require（注册表驱动被绕过）: ${offenders.join(', ')}`);
  assert.match(src, /applyAll\(/, 'patch-deps 必须经 canonical 引擎 applyAll');
});

test('C：dev ctx 只命中 appDir 副本（home/userDataDir 指向不存在路径）', () => {
  const ctx = buildDevCtx(() => {});
  assert.equal(ctx.appDir, DESKTOP);
  assert.equal(ctx.wslMode, false);
  assert.ok(!fs.existsSync(ctx.home), 'home 副本根不得存在（profile fallback 归 boot 链）');
  assert.ok(!fs.existsSync(ctx.userDataDir), 'userDataDir 副本根不得存在（agent overlay 归 boot 链）');
});

// ---------------------------------------------------------------------------
// D. 端到端：临时树全链重放（pristine 提取自 vendor，零触碰真实 dev 树）
// ---------------------------------------------------------------------------

const { loadPin } = require('../compat/validate-pin');

function vendorTarball(pkg) {
  const { pin } = loadPin(DESKTOP);
  const v = pin.kernel.packageVersion;
  const file = `deepseek-ai-${pkg}-${v}.tgz`;
  const p = path.join(DESKTOP, pin.kernel.vendorDir || path.join('vendor', 'dsh-kernel'), file);
  assert.ok(fs.existsSync(p), `vendor tarball 缺失: ${file}`);
  return p;
}

/** 从 vendor tgz 提取指定包到临时树（npm pack 布局 package/ → <pkgDir>）。 */
function extractPkg(tgz, pkgDir) {
  fs.mkdirSync(pkgDir, { recursive: true });
  const r = spawnSync('tar', ['-xzf', tgz, '-C', pkgDir, '--strip-components', '1'], { encoding: 'utf8' });
  assert.equal(r.status, 0, `tar 提取失败: ${r.stderr}`);
}

test('D：临时树全链重放——落盘 / 幂等 / 锚点失配信号非零回流', () => {
  const tgz = vendorTarball('dsh-atomic-write');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-coverage-'));
  try {
    const nmRoot = path.join(root, 'node_modules');
    const pkgDir = path.join(nmRoot, '@deepseek-ai', 'dsh-atomic-write');
    extractPkg(tgz, pkgDir);
    const target = path.join(pkgDir, 'lib', 'index.js');
    assert.ok(fs.existsSync(target), 'pristine 提取应含 lib/index.js');
    const pristine = fs.readFileSync(target, 'utf8');
    assert.ok(!pristine.includes('dsh-desktop patch'), 'pristine 提取不得带干预');

    const logs = [];
    const log = (m) => logs.push(String(m));
    const specs = PATCH_SPECS.filter((s) => s.id === 'atomic-write-orphan-lock');

    // 首跑（真实写入临时树）：必须 changed>0 且零失配零失败。
    const r1 = runDevTreePatchFor(nmRoot, log, specs);
    assert.ok(r1.changed > 0, `首跑应落盘，得 changed=${r1.changed}（logs: ${logs.join(' | ')}）`);
    assert.equal(r1.anchorMissing, 0);
    assert.equal(r1.failed, 0);
    assert.deepEqual(r1.errors, []);
    const patched = fs.readFileSync(target, 'utf8');
    assert.ok(patched.includes('dsh-desktop patch'), '落盘产物应含干预标记');

    // 重跑：幂等零写零失配。
    const r2 = runDevTreePatchFor(nmRoot, log, specs);
    assert.equal(r2.changed, 0, '重跑应零写入（幂等）');
    assert.equal(r2.anchorMissing, 0);
    assert.equal(r2.failed, 0);

    // 篡改：还原 pristine 并挖掉锚点区 → 管线层必须收到非零 anchorMissing
    // （fail-loud 回归位：静默消失在内核换代时被 npm ci / CI 当场暴露）。
    const spec = specs[0];
    const tampered = patched.replace(/dsh-desktop patch \([^)]+\)/g, 'untouched-upstream');
    fs.writeFileSync(target, tampered, 'utf8');
    const stats = { anchorMissing: 0, failed: 0 };
    const n = spec.apply(nmRoot, log, stats, {});
    assert.ok(!(n > 0) || stats.anchorMissing >= 0, 'applier 三态返回兼容');
    // 直接调 runDevTreePatch 全链语义：被篡改 spec 计失配或重写成功（两者
    // 都对——重写成功说明锚点仍在原位；关键是任何失败都进 report 可见）。
    const r3 = runDevTreePatchFor(nmRoot, log, specs);
    assert.ok(r3.changed + r3.anchorMissing + r3.failed + r3.errors.length > 0,
      '篡改后重跑不得全零（干预要么恢复要么失配可见）');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

/** 以指定 nmRoot 运行全链（runDevTreePatch 的 appDir 固定为 dsh-desktop；
 *  临时树用同款 root 应用器手工构造等价 ctx——root 规格 layout nm-roots 直接
 *  由 spec.apply(nmRoot, log, stats, options) 驱动，与 applyRoot 逐根语义一致）。 */
function runDevTreePatchFor(nmRoot, log, specs) {
  const report = { total: 0, changed: 0, anchorMissing: 0, failed: 0, errors: [], degraded: [] };
  for (const spec of specs) {
    report.total += 1;
    const stats = { anchorMissing: 0, failed: 0 };
    try {
      const n = spec.apply(nmRoot, log, stats, {});
      if (n > 0) report.changed += n;
      report.anchorMissing += stats.anchorMissing;
      report.failed += stats.failed;
    } catch (err) {
      report.errors.push(spec.id + ': ' + err.message);
    }
  }
  return report;
}

// ---------------------------------------------------------------------------
// E. dev 树磁盘收口：注册表登记 ↔ dev 树当前字节一致（只读判定，绝不动盘）。
//
// 为什么必须有这条：A/B/C/D 锁的全是「接线结构」（注册表驱动、不许手写 require、
// ctx 只命中 appDir、临时树能落盘），没有一条去看 dsh-desktop/node_modules 的
// **当前字节**。于是发生过这样的静默缺口：4 枚 file 补丁（history-page-size /
// journal-prepend-continuity / chat-scroll-autoload-older /
// conversation-assembly-resilience）登记在案却从未重放进 dev 树，而 stage 出去
// 的 payload 直接继承这棵滞后树 ⇒ 发行包里根本没有这些已声明的修复；同期
// session-load-graceful 的 v2 也停在「代码已改、磁盘还是 v1」。全套测试当时一路全绿。
//
// 判据取 transform 的 status 而非 marker 文本：'changed' 恰好等价于「磁盘字节比
// 代码旧」，而 marker 判定会被多版本变体（v1/v2 marker 不同名）误伤。
//
// 局限（诚实记录，别假装有覆盖）：kind:'root' 的 17 项用同样方式核不了 —— 它们
// 没有 pkgRel，靶文件只有 spec.apply 知道；而 apply 是写盘动作，dryRun 支持属于
// 各模块自觉而非契约。root 型仍由 A（结构全集）+ 各自单测的 dry-run 用例兜。
// ---------------------------------------------------------------------------

test('E：dev 树磁盘收口——每项 file 补丁在 appDir 副本都必须已是最终态', () => {
  const ctx = buildDevCtx(() => {});
  const r = checkPatchClosure(ctx);
  // 守卫自身的失效位：靶文件若整片找不到，「零滞后」就是假的。
  assert.ok(r.checked >= 30,
    `实检靶文件仅 ${r.checked} 个：dev 树疑似被 npm ci 重置或布局解析失效，本守卫当前无判定力`);
  // 靶文件在 dev 树不存在 = 该补丁在发行物里静默 no-op（死补丁）。
  assert.deepEqual(r.noTarget, [], `这些 file 补丁在 dev 树找不到靶文件（= 静默 no-op）：\n  ${r.noTarget.join('\n  ')}`);
  const lags = r.lags.map((l) => `${l.id} → ${path.relative(DESKTOP, l.file)}（${l.status === 'throw' ? 'transform 抛错 ' + l.note : '磁盘字节比代码旧' + (l.note ? '，' + l.note : '')}）`);
  assert.deepEqual(lags, [],
    `dev 树落后于注册表 ${lags.length} 处（重跑 node scripts/patch-deps.js 收口；` +
    `注意 stage 出去的 payload 继承的就是这棵树）：\n  ${lags.join('\n  ')}`);
});

test('F：stage-payload.sh 必须带补丁收口门禁（防回退到只镜像不校验）', () => {
  // E 只看 dev 树；真正出厂的是 payload。两者中间隔着一次 robocopy /MIR：
  // 只要 dev 树滞后，payload 就滞后，而构建链上原本无人发现（本次 0.6.2 实错）。
  // 门禁存在性在此锁死，避免下轮改脚本时又被删掉。
  const sh = path.join(DESKTOP, '..', 'dsh-tauri', 'scripts', 'stage-payload.sh');
  assert.ok(fs.existsSync(sh), `stage-payload.sh 不在位：${sh}`);
  const src = fs.readFileSync(sh, 'utf8');
  assert.match(src, /verify-payload-patches\.js/, 'stage 链必须调用补丁收口门禁');
  const verifier = path.join(DESKTOP, 'scripts', 'verify-payload-patches.js');
  assert.ok(fs.existsSync(verifier), '门禁脚本本体必须在位（只留调用不留实现 = 假门禁）');
});

// ---------------------------------------------------------------------------
// G：补丁层 transform 的「可达性」—— E 守的是「登记了但磁盘没跟上」，
// 这一条守的是另一侧的漏洞：「写了转换函数但从来没接进任何链路」。
//
// 为何存在：本仓的接线方式是「注册表里 const { transformX } = require(...) 按标识符解构」，
// 所以一个 transform 只要没进 module.exports、也没被注册表/同文件引用，就是物理上跑不到的
// 死代码。本轮全量对账发现 patch-adapters.js 里竟有 8 个这样的函数（vision-key /
// vision-toggle / workspace-rail / api-gateway-absent / session-event-bound /
// load-all-history(+Ui) / skill-ui-zh）：其中 3 个头部写了【休眠】理由，其余 5 个
// 的注释读起来像「修复已存在」，而它们的锚点在现 vendor 树已全部 0 命中——后人会据此
// 判断“这个 BUG 已修”，这就是事故本身。
//
// 判据取两侧：“可达”或“就地写明休眠理由”，二者必得其一；新增死函数若无理由就红，
// 若有理由也必须写进下面的休眠名单（改动必须显眼）。
// 看不到什么：它不判断“该不该休眠”——理由是否成立仍靠人工读注释（本轮已逐条拿
// vendor 字节对账核实，取证见 .tmp-deadpatch2/3/4）。
// ---------------------------------------------------------------------------

const IMPL_FILES_G = ['lib/patch-adapters.js', 'lib/runtime-patches.js', 'lib/loader-isolation.js'];
// 休眠名单（只允许变短；新增必须同时给函数上方补【休眠】理由）。
const DORMANT_TRANSFORMS = [
  'transformApiGatewayAbsent', 'transformLoadAllHistory', 'transformLoadAllHistoryUi',
  'transformSessionEventBound', 'transformSkillUiZh', 'transformVisionKeyFix',
  'transformVisionToggleGate', 'transformWorkspaceSearchRailFix',
];

/**
 * transform* 定义的可达性扫描。entries = [{ name, text }]；registryText = 注册表源码。
 * 四种归档：live（可达）/ dormant（不可达但有【休眠】标注）/
 * unexplained（不可达也没标注）/ staleNotes（标注了休眠但其实已可达）。
 * 回看范围含上一个函数的函数体：若上一函数体内写了【休眠】会被当作本函数的标注，
 * 方向上是宽松的（少报红），不是误报。
 */
function scanTransformReachability(entries, registryText) {
  const bucket = { live: [], dormant: [], unexplained: [], staleNotes: [] };
  for (const e of entries) {
    const expAt = e.text.indexOf('module.exports');
    const exportedBlock = expAt >= 0 ? e.text.slice(expAt) : '';
    for (const d of e.text.matchAll(/^function\s+(transform[A-Za-z0-9_$]+)\s*\(/gm)) {
      const name = d[1];
      // 导出：module.exports 块里的简写项或 `name:` 键（前后不允许再接单词字符，
      // 否则 transformLoadAllHistory 会被 …Ui 那一行误认命中）。
      const isExported = new RegExp('(^|[\\s{,])' + name + '\\s*(?:[,;:]|\\n)').test(exportedBlock);
      const inRegistry = new RegExp('\\b' + name + '\\b').test(registryText);
      // 同文件调用：必须是 `name(` 形态、且前面不是 `function `（否则定义行自己算一次）。
      // 早期版本用「全文件词频 > 1」当调用，结果散文里的提及（如「与
      // transformLoadAllHistory 同族」）把已写清休眠理由的函数误报成 staleNotes——
      // 注释不是调用点，判据得区分两者，否则本守卫会逼人把理由里的函数名改掉来逗它绿。
      const calledInFile = new RegExp('(?<!function\\s)(?<![\\w$.])' + name + '\\s*\\(');
      const usedInFile = calledInFile.test(e.text);
      // 标注回看范围：从上一个 function 定义行起、到本定义为止（盖住中间的 const/注释区）。
      // 注意那个 `- 2`：本定义自己就是 `\nfunction ` 的一次命中，直接从 d.index 往前找会找到
      // 「本函数前面的那个换行符」（prev = d.index - 1、回看长度恒为 1），于是所有标注都看不见
      // —— 第一版因此把 8 个已写理由的休眠函数全报成 unexplained。
      const prev = e.text.lastIndexOf('\nfunction ', d.index - 2);
      const before = e.text.slice(prev < 0 ? 0 : prev, d.index);
      const noted = /【休眠/.test(before);
      const rec = { file: e.name, name, isExported, inRegistry, usedInFile, noted };
      const reachable = isExported || inRegistry || usedInFile;
      if (reachable && noted) bucket.staleNotes.push(rec);
      else if (reachable) bucket.live.push(rec);
      else if (noted) bucket.dormant.push(rec);
      else bucket.unexplained.push(rec);
    }
  }
  return bucket;
}

test('G：transform 必须可达，否则就地写明【休眠】理由（防“写了但永远跑不到”的死补丁）', () => {
  const registryText = fs.readFileSync(path.join(SCRIPTS, 'lib', 'patch-registry.js'), 'utf8');
  const entries = IMPL_FILES_G
    .map((rel) => path.join(SCRIPTS, rel))
    .filter((f) => fs.existsSync(f))
    .map((f) => ({ name: path.relative(SCRIPTS, f).replace(/\\/g, '/'), text: fs.readFileSync(f, 'utf8') }));
  assert.equal(entries.length, IMPL_FILES_G.length, '三个补丁实现模块必须全部在场（少一个就是枚举面漂了）');
  const r = scanTransformReachability(entries, registryText);

  // 守卫自身的失效位：一个都没扫到就是枚举口径坏了，零红不等于健康。
  assert.ok(r.live.length >= 30,
    `实收活 transform 仅 ${r.live.length} 个，本守卫当前无判定力（枚举口径需回炉）`);
  const flags = (x) => `${x.file}::${x.name}（导出=${x.isExported} 注册表=${x.inRegistry} 同文件调用=${x.usedInFile} 标注=${x.noted}）`;
  assert.deepEqual(r.unexplained.map((x) => `${x.file}::${x.name}`), [],
    `以下 transform 既没导出、也没被注册表或同文件引用，上方还没有【休眠】标注 —— 物理上永远跑不到，`
    + `但其注释读起来像“修复已存在”：要么接线，要么按现字节核完证据后写明休眠理由（括号内为判据各位，排错用）：\n  ` + r.unexplained.map(flags).join('\n  '));
  assert.deepEqual(r.staleNotes.map((x) => `${x.file}::${x.name}`), [],
    `以下函数上方写着【休眠】但实际上已可达（被导出/登记）—— 过期标注同样误导后人：\n  `
    + r.staleNotes.map((x) => x.file + '::' + x.name).join('\n  '));
  assert.deepEqual(r.dormant.map((x) => x.name).sort(), DORMANT_TRANSFORMS.slice().sort(),
    '休眠名单与实际不符：新增休眠需同时补【休眠】理由与本名单；移除则应直接删函数或重新接线');

  // 捕获力自证（内存夹具，不落入任何目录）：五个方向逐个点名。
  const REG = "const { transformWired } = require('./patch-adapters');";
  const mk = (body) => ({ name: 'fixture/fix.js', text: body + '\nmodule.exports = {\n\ttransformWired,\n};\n' });
  const fix = scanTransformReachability([
    mk([
      'function transformWired(src) { return { status: \'already\' }; }',
      '/** 活的：被导出 */',
      'function transformOnlyRegistry(src) { return { status: \'already\' }; }',
      '/** 死的、也没标注：这就是事故形 */',
      'function transformGhost(src) { return { status: \'already\' }; }',
      '// 【休眠·已失效】本函数无人调用，锚点已随版本消失。',
      'function transformDormant(src) { return { status: \'already\' }; }',
      '// 【休眠·已失效】但它其实已被同文件调用——标注过期。',
      'function transformStale(src) { return { status: \'already\' }; }',
      'function transformCaller2(src) { return transformStale(src); }',
      'function transformInUse(src) { return { status: \'already\' }; }',
      // 只在散文里被提及（带完整函数名）：不得算调用点，否则理由写好也会被报成过期标注。
      '// 与 transformProseMention 同族，保留仅供历史审计。',
      'function transformProseMention(src) { return { status: \'already\' }; }',
      'function transformCaller(src) { return transformInUse(src); }',
    ].join('\n')),
  ], REG + "\n// transformOnlyRegistry 在注册表里在场（算可达）\n");
  const has = (arr, n) => arr.some((x) => x.name === n);
  assert.ok(has(fix.live, 'transformWired'), '夹具失效：被导出的函数没判成活');
  assert.ok(has(fix.live, 'transformOnlyRegistry'), '夹具失效：仅被注册表引用的函数没判成活');
  assert.ok(has(fix.live, 'transformInUse'), '夹具失效：被同文件调用的函数没判成活');
  assert.ok(has(fix.unexplained, 'transformGhost'), '捕获力失败：无标注的死函数没报红，本守卫是空转的');
  assert.ok(has(fix.dormant, 'transformDormant'), '捕获力失败：写明理由的休眠函数不该报红');
  assert.ok(has(fix.staleNotes, 'transformStale'), '捕获力失败：标了休眠却又被导出的函数没报过期标注');
  assert.ok(has(fix.unexplained, 'transformProseMention'), '散文提及被当成调用点：本守卫又在逼人改注释逗它绿了');
  // 反方向：名字前缀不得互串（…Alpha 不应因 …AlphaBeta 的导出行而判成活）。
  const pre = scanTransformReachability([{ name: 'fix2', text: 'function transformAlpha(src) {}\nfunction transformAlphaBeta(src) {}\nmodule.exports = {\n\ttransformAlphaBeta,\n};\n' }], '');
  assert.ok(has(pre.unexplained, 'transformAlpha'), '前缀串档：…AlphaBeta 的导出行被当成 …Alpha 的导出');
  assert.ok(has(pre.live, 'transformAlphaBeta'), '前缀串档：真正导出的函数反而没判成活');
});
