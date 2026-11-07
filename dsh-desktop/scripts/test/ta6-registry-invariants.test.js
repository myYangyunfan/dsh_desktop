'use strict';

// ---------------------------------------------------------------------------
// TA6 元测试 1：registry ↔ adapters 双向完整性自描述不变量。
//
// 守卫目标（防未来加补丁漏配 / 漂移）：
//   A. 每个 file spec 的 transform 是函数且来自 patch-adapters / loader-isolation
//      导出清单（防止内联孤儿 transform）；
//   B. 每个 root spec 的 apply ∈ rootAppliers 值集（防止绕过收口）；
//   C. 每个非空 marker 既在 patch-adapters.markers 值集中（单一数据源），
//      又出现在某个 transform 实现源码文本中（marker ↔ 实现不漂移）；
//   D. 每个 file spec 的 pkgRel/pkgRels 被 patch-target-resolver 导出的
//      某个路径常量覆盖（白名单化记录既有内联漂移，新漂移即红）；
//   E. order 全局唯一、组内升序、组间依赖序（requires / 已知补丁间依赖的
//      目标 order 更小）；
//   F. cli:true 数量恰为 25（哨兵随换代更新，理由逐条记在用例注释里）；
//      failPolicy ∈ {warn,degrade}
//      （注意：治理任务书写的是 {warn,error}，registry 实际词表是
//      {warn,degrade,fatal(仅注释)}，此处按实际词表断言并作为缺陷记录）；
//   G. group 一致性：group ∈ {runtime,guard,package}，guard 组内
//      failPolicy 全为 warn、cli 全为 false。
// ---------------------------------------------------------------------------

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const registry = require('../lib/patch-registry');
const adapters = require('../lib/patch-adapters');
const loaderIsolation = require('../lib/loader-isolation');
const onboardingResilience = require('../lib/onboarding-resilience');
const resolver = require('../lib/patch-target-resolver');

const { PATCH_SPECS } = registry;

const LIB_DIR = path.join(__dirname, '..', 'lib');
// transform 实现源码文本（marker 字面量必须出现在其中之一）。
const IMPL_SOURCES = [
  path.join(LIB_DIR, 'runtime-patches.js'),
  path.join(LIB_DIR, 'patch-adapters.js'),
  path.join(LIB_DIR, 'loader-isolation.js'),
  path.join(LIB_DIR, 'onboarding-resilience.js'),
  path.join(LIB_DIR, 'journal-history-patches.js'),
  path.join(LIB_DIR, 'chat-scroll-patches.js'),
  path.join(LIB_DIR, 'assembly-resilience-patches.js'),
  path.join(__dirname, '..', '..', 'profile-bundle-heal.js'),
  path.join(__dirname, '..', 'patch-pi-ai-4xx-dump.js'),
  path.join(__dirname, '..', 'patch-pi-ai-tool-schema-sanitize.js'),
  path.join(__dirname, '..', 'patch-pi-ai-responses-tool-name-sanitize.js'),
  path.join(__dirname, '..', 'patch-pi-ai-quota-not-retryable.js'),
].map((f) => fs.readFileSync(f, 'utf8'));

/** 既有「内联 pkgRel」白名单：registry 里未走 patch-target-resolver 常量的
 * 历史漂移（缺陷记录：路径常量未收口，加新条目到此白名单 = 掩盖漂移）。 */
const INLINE_PKG_REL_SPEC_IDS = new Set([
  // settings-section-guard 已随 0.2.0-rc.2 退役（`this.register(ns, schema, {` 调用点
  // 全内核 0 命中，插入点不存在），其内联 pkgRel 条目随之从白名单消失。
  // workspace-search-rail-fix 已收口到 WORKSPACE_PKG_REL（K25），移出白名单。
  'credentials-initial-retry',
  // credentials-absent-guidance 的内联 pkgRel 与 EXPOSE_PKG_REL 同值，视为已覆盖。
  // device-auth-guidance 已收口到 DS_LLM_DEEPSEEK_PKG_REL（cardian 双前缀修复后
  // 与 ds-tool-schema-sanitize 共用同一 resolver 常量），移出白名单。
  'plugin-inventory-tab-merge',
]);

/** 已知补丁间依赖（目标 order 必须更小）。
 * 0.1.2-alpha.1：vision 系（image-send / vision-toggle / vision-key）均已退役，
 * session-manage 恢复后无补丁间依赖（其 requires 是宿主能力 deleteSession，
 * 非补丁间依赖），补丁间依赖表仍为空。 */
const PATCH_DEPENDS = {};

const norm = (p) => String(p).split(path.sep).join('/');

function resolverRelConstants() {
  const out = new Set();
  for (const [key, value] of Object.entries(resolver)) {
    if (!/(_PKG_REL|_RELS|_REL)$/.test(key)) continue;
    if (typeof value === 'string') out.add(norm(value));
    else if (Array.isArray(value)) for (const v of value) out.add(norm(v));
  }
  // 布局目录（profile-boot-dirs）不属于包相对路径常量，单独处理。
  return out;
}

test('A. file spec transform 均为函数且来自收口导出（无内联孤儿）', () => {
  const adapterExports = new Set(Object.values(adapters).filter((v) => typeof v === 'function'));
  const loaderExports = new Set(Object.values(loaderIsolation).filter((v) => typeof v === 'function'));
  const onboardingExports = new Set(Object.values(onboardingResilience).filter((v) => typeof v === 'function'));
  const fileSpecs = PATCH_SPECS.filter((s) => s.kind === 'file');
  // 48 = 47 ＋ appboot-bootstrap-singleton（2026-10-11，macOS 路径大小写导致
  // dsh-app-boot 被 ESM 加载两次、模块级 WeakMap 分裂 → profile reload 必抛 →
  // 设置写入全线失败的功能性修复，须进 payload 故入 cli:true 计数）。
  // 47 = 45 ＋ onboarding-step-progress-timeout ＋ onboarding-guard-report
  // （2026-10-14「点击开始设置没反应」两条：步骤推进不再依赖出帧 + guard 静默拒绝报成因）。
  // 45 = 43 ＋ loader-import-failure-report ＋ prompt-admission-reason-report
  // （2026-10-10 两条「静默失败原文上身」诊断补丁，见 E 的 60 基线说明）。
  // 43 = 44（rc.2 重靶后的 file 型规格数）− image-send-fix（2026-10 随识图插件
  // 整体退役；64 项总盘中 root 15 + file 43 = 58，另见 E）。
  assert.equal(fileSpecs.length, 48, `file spec 应有 48 个，得 ${fileSpecs.length}`);
  for (const spec of fileSpecs) {
    assert.equal(typeof spec.transform, 'function', `${spec.id} 缺 transform`);
    assert.ok(
      adapterExports.has(spec.transform) || loaderExports.has(spec.transform) || onboardingExports.has(spec.transform),
      `${spec.id} 的 transform 不在 patch-adapters / loader-isolation / onboarding-resilience 导出清单中（内联孤儿）`,
    );
  }
});

test('B. root spec apply ∈ rootAppliers 值集（绕过收口即红）', () => {
  const appliers = new Set(Object.values(adapters.rootAppliers));
  const rootSpecs = PATCH_SPECS.filter((s) => s.kind === 'root');
  // 12 = 14（上一基线）− 2（0.2.2-rc.1 换代退役，逐条理由见 E 的 60 基线说明）：
  //   agent-loop-scheduler-guard（TOOL_RUNTIME_SCHEDULER 符号面整体删除，364 个包里 0 命中）
  //   与 menu-viewport（上游 useAnchoredPosition + --dsh-anchored-max-height 自行实现）。
  // 两条的应用器接线同批摘除——死接线会被下面的双向断言当场点名。
  // 此前 atomic-write-orphan-lock / model-image-input / pi-ai-opencode-go-models 三条应用器
  // 已随各自补丁退役，rootAppliers 接线同批摘除。
  assert.equal(rootSpecs.length, 12, `root spec 应有 12 个，得 ${rootSpecs.length}`);
  for (const spec of rootSpecs) {
    assert.equal(typeof spec.apply, 'function', `${spec.id} 缺 apply`);
    assert.ok(appliers.has(spec.apply), `${spec.id} 的 apply 不是 rootAppliers 成员`);
  }
  // 双向：rootAppliers 里每个应用器都被某条 spec 引用（无死代码应用器）。
  // 例外（0.2.2-rc.1 换代退役两条，应用器本体仍留在 patch-adapters 导出面，属待清理
  // 的生产侧残件——补丁模块不在本批改动范围，故在此登记为「已知死接线」而不是放宽判据）：
  //   patchMenuViewport ← menu-viewport（上游 useAnchoredPosition 自实现）
  //   patchSchedulerGuard ← agent-loop-scheduler-guard（TOOL_RUNTIME_SCHEDULER 符号面删除）
  // 列表中以外的新死接线仍然当场判红。
  const RETIRED_APPLIERS = new Set(['patchMenuViewport', 'patchSchedulerGuard']);
  const dead = Object.entries(adapters.rootAppliers)
    .filter(([, fn]) => !rootSpecs.some((s) => s.apply === fn))
    .map(([name]) => name);
  assert.deepEqual(
    dead.filter((name) => !RETIRED_APPLIERS.has(name)),
    [],
    'rootAppliers 出现未被任何 spec 引用的应用器（死代码或漏登记）',
  );
  assert.deepEqual(
    dead.sort(),
    [...RETIRED_APPLIERS].sort(),
    '已知死接线清单漂移：要么有应用器复活（应从本清单摘除），要么又多出死代码',
  );
});

test('C. marker 单一数据源 + marker 出现在 transform 实现源码文本中', () => {
  const knownMarkers = new Set(Object.values(adapters.markers).filter((v) => typeof v === 'string'));
  for (const spec of PATCH_SPECS) {
    if (spec.marker === null || spec.marker === undefined) continue;
    assert.ok(knownMarkers.has(spec.marker), `${spec.id} marker 未引用 patch-adapters.markers 共享常量`);
    // 允许「派生 marker」（如 V2 = 基础 marker + ' (v2)' 拼接）：字面量或其
    // 去掉尾部派生后缀的基础形态出现在实现源码中即可。
    const base = spec.marker.replace(/ \([^()]*\)$/, '');
    assert.ok(
      IMPL_SOURCES.some((text) => text.includes(spec.marker) || text.includes(base)),
      `${spec.id} marker 未出现在任何 transform 实现源码中（marker 与实现漂移）`,
    );
  }
  // 双向：每个 marker 常量至少被一条 spec 引用（或属于已知多形态常量）。
  for (const [name, value] of Object.entries(adapters.markers)) {
    if (typeof value !== 'string') continue;
    const used = PATCH_SPECS.some((s) => s.marker === value);
    // 已知多形态常量：v1/v2 世代 marker 不再做任何 spec 的幂等判定，只供
    // 「在野旧副本」的识别/升级通道与逆运算登记使用
    // （v2 = 基础 marker + ' (v2)'，v3 = 基础 marker + ' (v3)'）。
    // LOADER_TREE_ISOLATION_MARKER 同属此类：loader-tree-isolation 规格已随
    // 0.2.0-rc.2 退役（cordis-plugin-loader 1.0.5 自己逐条目隔离，插入点消失），
    // 但 transformLoaderTreeIsolation 与它的 marker 仍作为休眠层保留在
    // loader-isolation 导出面（unit-loader-isolation-deep 逐字节核着它），
    // adapters.markers 靠 spread 同源带出，故无 spec 引用是预期形态。
    const knownUnused = new Set([
      'SLOT_ERROR_ISOLATE_MARKER',
      'SESSION_LOAD_GRACEFUL_MARKER',
      'SESSION_LOAD_GRACEFUL_MARKER_V2',
      'LOADER_TREE_ISOLATION_MARKER',
    ]);
    if (!used) assert.ok(knownUnused.has(name), `marker ${name} 无任何 spec 引用`);
  }
});

test('D. pkgRel/pkgRels 被 patch-target-resolver 常量覆盖（白名单外新漂移即红）', () => {
  const rels = resolverRelConstants();
  assert.ok(rels.size >= 10, `resolver 路径常量应有 10+，得 ${rels.size}`);
  const uncovered = [];
  for (const spec of PATCH_SPECS) {
    if (spec.kind !== 'file' || spec.layout === 'profile-boot-dirs') continue;
    const list = spec.pkgRels && spec.pkgRels.length ? spec.pkgRels : [spec.pkgRel];
    for (const rel of list) {
      if (!rels.has(norm(rel))) uncovered.push(`${spec.id}:${norm(rel)}`);
    }
  }
  // 未覆盖的必须恰为白名单（历史内联漂移，逐条登记），出现新条目即失败。
  const bySpec = {};
  for (const entry of uncovered) bySpec[entry.split(':')[0]] = true;
  const extra = Object.keys(bySpec).filter((id) => !INLINE_PKG_REL_SPEC_IDS.has(id));
  assert.deepEqual(extra, [], '发现新的未收口 pkgRel（应加入 patch-target-resolver 常量）');
  const stale = [...INLINE_PKG_REL_SPEC_IDS].filter((id) => !bySpec[id]);
  assert.deepEqual(stale, [], '白名单中的内联 pkgRel 已收口，应从白名单移除（防漂移被掩盖）');
});

test('E. order 全局唯一、组内升序、补丁间依赖序成立', () => {
  // —— 基线沿革（只记变化量，逐条理由见 patch-registry 头部与各 spec 上方注释）——
  // 53 … 64（0.6.0→0.6.4 逐条新增：content-has-image-guard / image-send-fix 重新
  //   登记 / workspace-chip-label-hold / history-page-size / journal-prepend-continuity
  //   / chat-scroll-autoload-older / conversation-assembly-resilience / model-image-input
  //   / released-v0-history-recovery / pi-ai-responses-tool-name-sanitize /
  //   pi-ai-tool-name-wire / pi-ai-quota-not-retryable；其间 60 = 62 − 2 退役
  //   preset-seat-fix、token-meter-clamp，均为 0.1.5-rc.1 上游原生修复）。
  // 59 = 64（上一基线）− 6 项退役 + 1 项取代新增（0.2.0-rc.2 重靶，逐项点名）：
  //   ① loader-tree-isolation：cordis-plugin-loader 1.0.5 自己做到逐条目隔离
  //      （EntryGroup.update 每 id 各自 .catch(logger.error)、EntryTree.await 只
  //      allSettled），全文件 throw 25→3 处，插入点消失；
  //   ② fallback-heal-isolation：rc.2 的 heal 回环已改逐名 try/catch，同款守卫原生；
  //   ③ settings-section-guard：`this.register(ns, schema, {` 调用点与 installSection
  //      全内核 0 命中，锚点所在函数不复存在；
  //   ④ atomic-write-orphan-lock：上游 withFileLock 竞争分支原生 takeOverExitedLock
  //      （按锁记录 PID 探活 + `<lock>.takeover-<digest>` 独占 claim），比我们那份更严；
  //   ⑤ model-image-input：上游原生 inputModalities（控件 + adopt 白名单 + 门槛语义
  //      三处前提同时失效）；
  //   ⑥ profile-bundle-guard-profileboot：dsh 主包的 profile-boot-*.js 装配面消失，
  //      补丁层读取收口进 dsh-app-boot 的 readProfilePatches；
  //   ＋ profile-patch-layer-guard（取代 ⑥，order 130，同靶 APP_BOOT_PKG_REL 的
  //      readProfilePatches 用户补丁层防护）。
  // 另：workspace-pin（侧栏工作区置顶，order 215）与 open-project-dir / session-manage
  // 三处 UI 靶均在 rc.2 重锚后仍在册。
  // 58 = 59（上一基线）− image-send-fix（2026-10 内置伴随插件批量拆除）：该 spec 的
  //   注入体读的是 dsh-vision 的设置命名空间，识图插件退役后没有任何可达路径，属
  //   「只为已退役插件存在」一类；transform 与锚点常量同批从 patch-adapters 删除，
  //   靶常量 SESSION_CTRL_INDEX_PKG_REL 仍由 history-page-size 使用故保留。
  //   cli:true 计数不受影响（它是 cli:false）。
  // 60 = 62 − 2（0.2.2-rc.1 换代退役两条，均为「上游自己做到了」）：
  //   ① agent-loop-scheduler-guard：TOOL_RUNTIME_SCHEDULER 符号面整体删除（364 个包 0 命中），
  //      agent-loop 旧 import 改成 ToolActivationError / ToolBatchExecutionError，工具批
  //      改走 this.loopCtx.tools.execute({...}) —— 调度器镜像无处可挂；
  //   ② menu-viewport：上游用 useAnchoredPosition + --dsh-anchored-max-height +
  //      `.Menu.module.css .scrollable` 自己实现了菜单视口约束。
  // 上一基线 62 = 61 ＋ appboot-bootstrap-singleton（order 403）：dsh-app-boot 的
  // bootstrapIncludes 提升为 globalThis 单例（2026-10-11 macOS 实机取证）——
  // 壳 spawn 用 Contents/resources、loader 用 Contents/Resources，同一模块被
  // ESM 判成两个实例各持一张 WeakMap，profile reload 取根 Include 落空即抛，
  // 设置写入全线失败。功能主线补丁故 cli:true，cli 计数随之 25→26。
  // 61 = 62 − pi-ai-opencode-go-models（0.2.1-rc.1 退役）：该 root 型规格向 pi-ai 的
  // opencode-go.json 克隆同族基型补 deepseek-v4-flash-vision-exp，而 0.2.1 带来的
  // pi-ai 0.87.1→1.3.0 两端都不再有该型号（端点 /zen/go/v1/models 实测 37 条无
  // vision-exp、deepseek 族只剩 v4.1-flash/v4-pro；catalog 分组改 `chat:<id>` 键形，
  // 基型条目不存在）。前提消失即连脚本带用例删除，cli:true 计数随之 26→25。
  // 62 = 60 ＋ onboarding-step-progress-timeout（order 162）＋ onboarding-guard-report
  // （order 164）：首启引导「点击开始设置没反应」两条（2026-10-14 实测：设置写成功了，
  // 但步骤推进挂在 element.animate().finished 上，隐藏/未合成页面的渲染时间线整段停摆
  // ⇒ busy 恒真 ⇒ 整页按钮 disabled 且零报错）。均 cli:false，cli:true 计数不变。
  // 60 = 58 ＋ loader-import-failure-report（order 148）＋ prompt-admission-reason-report
  // （order 150）：两条「静默失败原文上身」诊断补丁（2026-10-10，mac 端 9 插件
  // failed to load 与发送文件恒报 prompt rejected 两轮发布查不下去的直接原因——
  // rc.2 导入失败只进 cordis 内存环形缓冲、非核心条目不再抛 StartupError，真因
  // 三重静默）。均 cli:false，故 cli:true 计数不变。
  assert.equal(PATCH_SPECS.length, 60, 'spec 总数应为 60');
  const orders = PATCH_SPECS.map((s) => s.order);
  assert.equal(new Set(orders).size, orders.length, 'order 必须全局唯一');
  const byId = Object.fromEntries(PATCH_SPECS.map((s) => [s.id, s]));
  for (const [id, deps] of Object.entries(PATCH_DEPENDS)) {
    for (const dep of deps) {
      assert.ok(byId[id], `${id} 必须登记`);
      assert.ok(byId[dep], `${id} 的依赖 ${dep} 必须登记`);
      assert.ok(
        byId[dep].order < byId[id].order,
        `${id}(${byId[id].order}) 依赖 ${dep}(${byId[dep].order})，目标 order 必须更小`,
      );
    }
  }
});

test('E2. K1 三层相互独立（无补丁间依赖、目标文件互不重叠）', () => {
  // rc.2 重靶后 K1 的口径：原先三层是 fallback-heal-isolation(151) +
  // credentials-initial-retry(152) + credentials-absent-guidance(153)，其中
  // fallback-heal-isolation 已退役（rc.2 的 heal 回环原生逐名 try/catch），
  // 现存的最长连续三层守卫带随之是 152/153/154（凭证首读重试 → 凭证缺失指引 →
  // 设备授权指引），三者靶文件互不相同、互不依赖。
  const k1 = ['credentials-initial-retry', 'credentials-absent-guidance', 'device-auth-guidance'];
  const byId = Object.fromEntries(PATCH_SPECS.map((s) => [s.id, s]));
  for (const id of k1) {
    assert.ok(byId[id], `${id} 必须登记`);
    for (const dep of (PATCH_DEPENDS[id] || [])) {
      assert.ok(!k1.includes(dep), `K1 补丁不应互相依赖（${id} → ${dep}）`);
    }
  }
  // 三层目标文件两两不重叠。
  const targets = k1.map((id) => norm(byId[id].pkgRel || (byId[id].pkgRels || []).join('|')));
  assert.equal(new Set(targets).size, 3, 'K1 三层目标文件必须互不相同');
  // K1 order 恰为 152/153/154（连续三层，不夹其他补丁）。
  assert.deepEqual(
    k1.map((id) => byId[id].order).sort((a, b) => a - b),
    [152, 153, 154],
    'K1 三层 order 应恰为 152/153/154',
  );
});

test('E3. device-auth 154 与 credentials-absent 153 相邻无干扰', () => {
  const byId = Object.fromEntries(PATCH_SPECS.map((s) => [s.id, s]));
  assert.equal(byId['credentials-absent-guidance'].order, 153);
  assert.equal(byId['device-auth-guidance'].order, 154);
  assert.notEqual(
    norm(byId['credentials-absent-guidance'].pkgRel),
    norm(byId['device-auth-guidance'].pkgRel),
    '相邻 order 的两个补丁不得共享目标文件',
  );
});

test('F. cli:true 恰为 25 项；failPolicy ∈ {warn,degrade}', () => {
  const cliSpecs = registry.getSpecsByCli();
  // 25 = 26 − agent-loop-scheduler-guard（0.2.2-rc.1 退役：TOOL_RUNTIME_SCHEDULER
  // 符号面整体删除，工具批改走 this.loopCtx.tools.execute，见 E 的 60 基线说明）。
  // 同批退役的 menu-viewport 是 cli:false，不影响本计数。
  // 26 = 25 ＋ appboot-bootstrap-singleton（2026-10-11）：设置写入全线失败的功能性
  // 修复，必须进 payload 的 CLI 同步期，否则装机态无此补丁。
  // 25 = 26（更早基线）− pi-ai-opencode-go-models（0.2.1-rc.1 退役，见 E）；
  // 26 = 28（再上一基线）− atomic-write-orphan-lock − model-image-input（两条 rc.2 退役，
  // 见 E 的①–⑥）；token-meter-clamp / preset-seat-fix 早在 0.1.5-rc.1 同批退役。
  assert.equal(cliSpecs.length, 25, 'cli:true 数量（含 skill-dirs-compat + pi-ai-4xx-dump + workspace-chip-label-hold + pi-ai Responses 工具名净化 + pi-ai 工具名 wire 中央收口 + pi-ai 配额耗尽不重试 + appboot-bootstrap-singleton；atomic-write-orphan-lock / model-image-input / token-meter-clamp / pi-ai-opencode-go-models / agent-loop-scheduler-guard 已退役）');
  for (const s of cliSpecs) assert.equal(s.cli, true);
  for (const spec of PATCH_SPECS) {
    assert.ok(
      spec.failPolicy === 'warn' || spec.failPolicy === 'degrade',
      `${spec.id} failPolicy 越界（实际词表 {warn,degrade}；治理任务书的 {warn,error} 是笔误）`,
    );
  }
  const byId = Object.fromEntries(PATCH_SPECS.map((s) => [s.id, s]));
  assert.equal(byId['slot-error-isolation'].failPolicy, 'degrade', '唯一 degrade 档应仍是 slot-error-isolation');
});

test('F2. 内核韧性补丁字段契约（root + nm-roots + cli + warn）', () => {
  const byId = Object.fromEntries(PATCH_SPECS.map((s) => [s.id, s]));
  // 0.2.2-rc.1：原先并排的 agent-loop-scheduler-guard 已退役（TOOL_RUNTIME_SCHEDULER
  // 符号面整体删除），只剩 bundle-arrival-retry 一条内核韧性 root 应用器。
  for (const id of ['bundle-arrival-retry']) {
    assert.ok(byId[id], `${id} 必须登记`);
    assert.equal(byId[id].kind, 'root', `${id} 应为 root 应用器形态`);
    assert.equal(byId[id].layout, 'nm-roots');
    assert.equal(byId[id].wslLayout, 'nm-roots');
    assert.equal(byId[id].cli, true, `${id} 应 cli:true（内核包目标，CLI 同步同样需要）`);
    assert.equal(byId[id].failPolicy, 'warn');
    assert.equal(byId[id].marker, null, `${id} 无幂等 marker（root 应用器内嵌 marker 判定）`);
  }
  // order 唯一性已由 E 守卫；此处锚定 245（pi-ai-reasoning-defaults 244 之后）。
  assert.equal(byId['bundle-arrival-retry'].order, 245);
  // 反证：退役的那条不得复活（否则「上游自己做了」的判定被悄悄回退）。
  assert.equal(byId['agent-loop-scheduler-guard'], undefined, 'agent-loop-scheduler-guard 已退役，不得重新登记');
});


test('G. group 一致性：词表 + guard 组约束', () => {
  const groups = new Set(PATCH_SPECS.map((s) => s.group));
  assert.deepEqual([...groups].sort(), ['guard', 'package', 'runtime'], 'group 词表漂移');
  for (const spec of PATCH_SPECS.filter((s) => s.group === 'guard')) {
    assert.equal(spec.failPolicy, 'warn', `guard 组 ${spec.id} failPolicy 应为 warn`);
    assert.equal(spec.cli, false, `guard 组 ${spec.id} cli 应为 false`);
  }
  // runtime-local 布局的 wslLayout 应为 wsl（或 slot-compat 系例外）。
  for (const spec of PATCH_SPECS.filter((s) => s.layout === 'runtime-local')) {
    assert.equal(spec.wslLayout, 'wsl', `${spec.id} runtime-local 的 wslLayout 应为 wsl`);
  }
});
