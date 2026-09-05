'use strict';

// unit-drift-sentinel-capture.test.js — 漂移哨兵的捕获力守卫（哨兵的哨兵）。
//
// 背景（本轮踩到的坑）：三个补丁的漂移哨兵单测原先直接抓 .tmp-rc2-stage /
// package-payload 副本当 pristine 基准，而那些目录都会被打包链就地打补丁。
// 基准一脏，"必须 changed" 就退化成 already 假红；更糟的是**真锚点漂移发生时
// 它同样只报 already** —— 哨兵看起来在跑，实际上已经不报警了。
//
// 本文件不看补丁对不对，只看哨兵**还灵不灵**：
//   1) 登记表完整：PRISTINE_INJECTIONS 的每个键都要有对应靶点，反之亦然；
//   2) 还原有效：真实靶字节经 toPristineSource 剥离后，transform 必须 changed
//      （证明 changed 分支真的被执行过，而不是被 already 短路）；
//   3) 漂移必红：把锚点改写一下再喂 transform，必须 anchor-missing ——
//      这才叫"版本变了会报警"。
//
// 运行：node --test scripts/test/unit-drift-sentinel-capture.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  PRISTINE_INJECTIONS, PRISTINE_FAMILIES, toPristineSource,
  SESSION_LOAD_GRACEFUL_CATCH_LEGACY,
  transformCredentialsInitialRetry,
  transformDeviceAuthGuidance, transformKernelBootWatchdog, transformManualSortFix,
  transformPromptContextLiteral, transformPersistenceAll,
  transformSessionHeaderScanGuard, transformSessionLoadGraceful, markers,
} = require('../lib/patch-adapters');
const { PATCH_SPECS } = require('../lib/patch-registry');
const {
  transformPersistenceTornTail, transformPersistenceCorruptGuard,
  PERSISTENCE_PKG_REL, PERSISTENCE_TORN_HEAD, PERSISTENCE_TORN_MARKER, PERSISTENCE_CORRUPT_MARKER,
} = require('../lib/runtime-patches');
const {
  DS_LLM_DEEPSEEK_PKG_REL, KERNEL_WEB_INDEX_REL, WORKSPACE_PKG_REL,
  PROMPT_CONTEXT_LITERAL_PKG_RELS,
} = require('../lib/patch-target-resolver');

/** key → 靶点与 transform 的对应表（新增登记必须同时在这里补一条，由下方完整性用例兜住）。 */
// 靶包相对路径一律从注册表取（该补丁的 spec.pkgRel），测试里再抄一份路径就是一条新的复制漂移源。
const CREDENTIALS_LOCAL_REL = (PATCH_SPECS.find((s) => s.id === 'credentials-initial-retry') || {}).pkgRel;
const SENTINELS = [
  {
    key: 'device-auth-guidance',
    transform: transformDeviceAuthGuidance,
    file: 'index.js',
    candidates: [
      path.join(__dirname, '..', '..', 'node_modules', '@deepseek-ai', DS_LLM_DEEPSEEK_PKG_REL),
      path.join(__dirname, '..', '..', '..', 'dsh-tauri', 'package-payload', 'dsh-desktop',
        'node_modules', '@deepseek-ai', DS_LLM_DEEPSEEK_PKG_REL),
    ],
  },
  {
    key: 'kernel-web-boot-watchdog',
    transform: transformKernelBootWatchdog,
    file: 'index.html',
    candidates: [
      path.join(__dirname, '..', '..', 'node_modules', '@deepseek-ai', KERNEL_WEB_INDEX_REL),
      path.join(__dirname, '..', '..', '..', 'dsh-tauri', 'package-payload', 'dsh-desktop',
        'node_modules', '@deepseek-ai', KERNEL_WEB_INDEX_REL),
    ],
  },
  {
    key: 'manual-sort-drag-fix',
    transform: transformManualSortFix,
    file: 'client.js',
    candidates: [
      path.join(__dirname, '..', '..', 'node_modules', '@deepseek-ai', WORKSPACE_PKG_REL),
      path.join(__dirname, '..', '..', '..', 'dsh-tauri', 'package-payload', 'dsh-desktop',
        'node_modules', '@deepseek-ai', WORKSPACE_PKG_REL),
    ],
  },
  {
    key: 'prompt-context-literal',
    transform: transformPromptContextLiteral,
    file: 'index.js',
    candidates: [
      path.join(__dirname, '..', '..', 'node_modules', '@deepseek-ai', PROMPT_CONTEXT_LITERAL_PKG_RELS[0]),
      path.join(__dirname, '..', '..', '..', 'dsh-tauri', 'package-payload', 'dsh-desktop',
        'node_modules', '@deepseek-ai', PROMPT_CONTEXT_LITERAL_PKG_RELS[0]),
    ],
  },
  {
    key: 'credentials-initial-retry',
    transform: transformCredentialsInitialRetry,
    file: 'index.js',
    candidates: [
      path.join(__dirname, '..', '..', 'node_modules', '@deepseek-ai', CREDENTIALS_LOCAL_REL),
      path.join(__dirname, '..', '..', '..', 'dsh-tauri', 'package-payload', 'dsh-desktop',
        'node_modules', '@deepseek-ai', CREDENTIALS_LOCAL_REL),
    ],
  },
  // --- 会话持久化族：同一靶文件上叠加四个补丁，后打的会嵌进先打的注入体里 ---
  // 所以下面三条的 `base` 都要先在族 pristine 上重放起在它之前的补丁；而
  // `toPristineSource(单键, 在野副本)` 对它们不成立（族键才成立），因此
  // 这三条用 `family` + `chain` 字段描述基准该怎么凑。
  {
    key: 'persistence-torn-tail',
    transform: transformPersistenceTornTail,
    file: 'index.js',
    family: 'session-persistence-family',
    chain: [],
    candidates: persistenceTargets(),
  },
  {
    key: 'persistence-corrupt-guard',
    transform: transformPersistenceCorruptGuard,
    file: 'index.js',
    family: 'session-persistence-family',
    chain: [transformPersistenceTornTail],
    candidates: persistenceTargets(),
  },
  {
    key: 'session-header-scan-guard',
    transform: transformSessionHeaderScanGuard,
    file: 'index.js',
    family: 'session-persistence-family',
    chain: [transformPersistenceAll],
    candidates: persistenceTargets(),
  },
  {
    key: 'session-load-graceful',
    transform: transformSessionLoadGraceful,
    file: 'index.js',
    family: 'session-persistence-family',
    chain: [transformPersistenceAll, transformSessionHeaderScanGuard],
    candidates: persistenceTargets(),
  },
];

/** 会话持久化靶文件的候选位置（dev 副本 / payload 副本）。 */
function persistenceTargets() {
  return [
    path.join(__dirname, '..', '..', 'node_modules', '@deepseek-ai', PERSISTENCE_PKG_REL),
    path.join(__dirname, '..', '..', '..', 'dsh-tauri', 'package-payload', 'dsh-desktop',
      'node_modules', '@deepseek-ai', PERSISTENCE_PKG_REL),
  ];
}

const pickTarget = (s) => s.candidates.find((f) => fs.existsSync(f)) || null;

const GUARD_TEXT = 'loadFrameIndex >= frames.length - 1';
const PERSISTENCE_MARKERS = [
  PERSISTENCE_TORN_MARKER, PERSISTENCE_CORRUPT_MARKER,
  markers.SESSION_HEADER_SCAN_MARKER, markers.SESSION_LOAD_GRACEFUL_MARKER_V2,
];
const persistenceCopies = () => persistenceTargets().filter((f) => fs.existsSync(f)).map((f) => fs.readFileSync(f, 'utf8'));

test('登记表完整性：PRISTINE_INJECTIONS 与哨兵表一一对应', () => {
  assert.deepEqual(
    Object.keys(PRISTINE_INJECTIONS).sort(),
    SENTINELS.map((s) => s.key).sort(),
    '登记了 pristine 逆运算却没哨兵用例（或反之）= 漂移检测悄悄少一个补丁',
  );
});

/**
 * 造该哨兵的基准。族成员不能只做单键剥离（后打的补丁会把文本嵌进先打的注入体
 * 里），必须先在族 pristine 上重放「起在它之前」的补丁，才得到该补丁真正的输入
 * 形态；pristine 单独返回，供往返对账。
 */
function sentinelBase(s, raw) {
  if (!s.family) {
    const pristine = toPristineSource(s.key, raw);
    return { pristine, base: pristine };
  }
  const pristine = toPristineSource(s.family, raw);
  let base = pristine;
  for (const earlier of s.chain || []) {
    const r = earlier(base, s.file);
    assert.equal(r.status, 'changed',
      `族基准重放 ${earlier.name} 必须 changed（得 ${r.status} 说上游已漂移或逆运算没剥净）：` + (r.detail || ''));
    base = r.src;
  }
  return { pristine, base };
}

for (const s of SENTINELS) {
  test(`${s.key}: changed 分支确实被执行（真实字节剥离注入体）`, () => {
    const target = pickTarget(s);
    assert.ok(target, `找不到靶文件（候选均缺失）：${s.candidates[0]}`);
    const { pristine, base } = sentinelBase(s, fs.readFileSync(target, 'utf8'));
    const r = s.transform(base, s.file);
    assert.equal(r.status, 'changed',
      `剥离后必须是 changed；得 ${r.status} 说明逆运算没剥掉注入体（${r.detail || ''}）`);
    assert.ok(typeof r.src === 'string' && r.src.length > base.length, 'changed 应产出注入后的更长文本');
    // 二遍必须 already（幂等）
    assert.equal(s.transform(r.src, s.file).status, 'already', '同一文本再打一遍必须幂等');
    // 往返闭合：产物再走一次同一（族）逆运算，必须回到同一个族 pristine。这条断言
    // 同时钉住「登记表里的替换对」与「transform 实际写的字节」没有各走各的。
    assert.equal(toPristineSource(s.family || s.key, r.src), pristine,
      '逆运算与正向注入必须互为逆；不等说明 PRISTINE_INJECTIONS 与 transform 已经不一致');
  });

  test(`${s.key}: 锚点漂移必须报 anchor-missing（哨兵真的会叫）`, () => {
    const target = pickTarget(s);
    assert.ok(target, `找不到靶文件（候选均缺失）：${s.candidates[0]}`);
    const { base } = sentinelBase(s, fs.readFileSync(target, 'utf8'));
    // 把每条锚点都改写（device-auth 有 V2/V1 双形态，只破坏一条会命中另一条）。
    let drift = base;
    let broke = 0;
    for (const [anchor] of PRISTINE_INJECTIONS[s.key]) {
      if (drift.includes(anchor)) { drift = drift.replace(anchor, () => anchor.slice(0, 8) + '§drift§' + anchor.slice(8)); broke += 1; }
    }
    assert.ok(broke > 0, '一条锚点都没命中，本用例无法验证漂移检测');
    const r = s.transform(drift, s.file);
    assert.equal(r.status, 'anchor-missing',
      `锚点已改写却得到 ${r.status} —— 哨兵失去漂移报警能力`);
  });
}

// ---------------------------------------------------------------------------
// 持久化族专属：基准真干净 / 族链往返 / LEGACY 是真实字节。
// ---------------------------------------------------------------------------

test('持久化族 pristine：四个 marker 与首部注入行都必须剥净（基准不能是补丁态）', () => {
  const copies = persistenceCopies();
  assert.ok(copies.length > 0, '找不到会话持久化靶文件');
  const pristine = toPristineSource('session-persistence-family', copies[0]);
  assert.ok(!pristine.startsWith(PERSISTENCE_TORN_HEAD),
    '首部 torn-tail marker 行没被剥掉 —— 基准仍是补丁态，changed 断言会退化成 already 假红');
  for (const marker of PERSISTENCE_MARKERS) {
    assert.ok(!pristine.includes(marker), 'pristine 仍含 ' + marker + '（族逆运算漏剥）');
  }
  // 对已 pristine 的文本再跑一次必须原样返回（幂等），否则“基准”会越还原越偏。
  assert.equal(toPristineSource('session-persistence-family', pristine), pristine,
    '逆运算对 pristine 自身必须幂等');
});

test('持久化族：全链重放后整族还原，逐字节回到族 pristine', () => {
  const copies = persistenceCopies();
  assert.ok(copies.length > 0, '找不到会话持久化靶文件');
  const pristine = toPristineSource('session-persistence-family', copies[0]);
  let src = pristine;
  for (const step of [transformPersistenceAll, transformSessionHeaderScanGuard, transformSessionLoadGraceful]) {
    const r = step(src, 'index.js');
    assert.equal(r.status, 'changed', step.name + ' 在族 pristine 上必须 changed：' + (r.detail || ''));
    src = r.src;
  }
  for (const marker of PERSISTENCE_MARKERS) {
    assert.ok(src.includes(marker), '全链产物应含 ' + marker);
  }
  assert.equal(toPristineSource('session-persistence-family', src), pristine,
    '族链往返必须逐字节闭合（不闭合则哨兵基准会随每次重跑漂移）');
});

test('K6 的 LEGACY 注入体：必须是「缺末帧守卫」那一版，且有在野副本佐证', (t) => {
  // 逆运算登记的历史字节必须是真实存在过的字节，不是为了让测试变绿而编的。
  const pairs = PRISTINE_INJECTIONS['session-load-graceful'].map(([, to]) => to);
  assert.ok(pairs.includes(SESSION_LOAD_GRACEFUL_CATCH_LEGACY), '登记表必须含 LEGACY 变体');
  assert.ok(!SESSION_LOAD_GRACEFUL_CATCH_LEGACY.includes(GUARD_TEXT),
    'LEGACY 不得含末帧守卫 —— 缺守卫才是它要还原的那个缺陷本体');
  assert.ok(pairs.some((to) => to !== SESSION_LOAD_GRACEFUL_CATCH_LEGACY && to.includes(GUARD_TEXT)),
    '必须同时登记含末帧守卫的 v2 变体，否则升级后的副本无法还原');

  const copies = persistenceCopies();
  const v1 = copies.filter((c) => c.includes(markers.SESSION_LOAD_GRACEFUL_MARKER)
    && !c.includes(markers.SESSION_LOAD_GRACEFUL_MARKER_V2));
  if (v1.length === 0) {
    t.diagnostic('当前磁盘上已无 v1 形态副本（都已升级），LEGACY 真实性改由升级通道用例的逐字节对账兜住');
    return;
  }
  assert.ok(v1.every((c) => c.includes(SESSION_LOAD_GRACEFUL_CATCH_LEGACY)),
    'LEGACY 常量与在野 v1 副本字节不符 —— 它是抄错了的历史');
});
