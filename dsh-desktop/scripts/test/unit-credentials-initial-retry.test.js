'use strict';

// K1 根因单测：credentials-local activate 首读的瞬时文件错误重试。
//
// 根因链的 A 路径：Windows AV/索引器恰好在 boot 读 `.credentials.yaml` 时持有
// 句柄（EBUSY/EPERM/EACCES 瞬时错）→ Service.init 抛错 → loader 隔离静默降级
// → credentials 服务整场缺席 → 保存 API key 才报 absent。
// 补丁：activate 首读的 stat/readFile 对瞬时错就地重试 3 次（递增退避），
// ENOENT（合法空仓）与确定性错误不受影响。
//
// 覆盖：transform 对真实 vendored 产物的命中/幂等（输入统一由逆运算剥回 pristine，
// 不看磁盘运气）+ 半补丁态（marker 残留、注入体缺失）必须重打 + 注入体
// （CREDENTIALS_HELPERS_CODE）vm 行为验证（与落盘字节同源）。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const {
  CREDENTIALS_HELPERS_CODE,
  PRISTINE_INJECTIONS,
  transformCredentialsInitialRetry,
  toPristineSource,
  markers,
} = require('../lib/patch-adapters');
const { PATCH_SPECS } = require('../lib/patch-registry');

const repoRoot = path.resolve(__dirname, '..', '..');
// 靶字节来源（2026-09-05 收口）：这里曾硬编码仓库根 .tmp-rc2-stage 当「pristine 暂存树」，
// 而那株一次性 npm 装配产物早已被清理，existsSync 恒 false —— 注释承诺的「优先读应用碰
// 不到的树」从未生效，实际一直在读 dev 副本；而 dev / payload 都会被 boot 链与打包链就地
// 打补丁。现在统一取在野副本，再用 toPristineSource 剥回 pristine（同 unit-manual-sort /
// unit-drift-sentinel-capture 的手法），changed 分支才被真正执行 —— 否则补丁态上报
// already，真锚点漂移时同样上报 already，这条哨兵等于闭嘴。
const CRED_REL = (PATCH_SPECS.find((s) => s.id === 'credentials-initial-retry') || {}).pkgRel;
assert.ok(typeof CRED_REL === 'string' && CRED_REL, '注册表里找不到 credentials-initial-retry 的 pkgRel');
const CRED_TARGETS = [
  path.join(repoRoot, 'node_modules', '@deepseek-ai', CRED_REL),
  path.join(repoRoot, '..', 'dsh-tauri', 'package-payload', 'dsh-desktop',
    'node_modules', '@deepseek-ai', CRED_REL),
];
const credFile = CRED_TARGETS.find((f) => fs.existsSync(f)) || null;

// marker 常量只经 patch-adapters 的 `markers` 子对象导出。本文件此前从顶层解构
// CREDENTIALS_INITIAL_RETRY_MARKER，拿到的是 undefined，于是 src.includes(undefined)
// 被强制成查找字面词 "undefined"（任何 JS 文件都命中）—— 「双态完整判定」与
// assert.ok(...includes(MARKER)) 都永远不会失败。下面两条断言钉住这个出口。
const MARKER = markers.CREDENTIALS_INITIAL_RETRY_MARKER;
assert.equal(typeof MARKER, 'string',
  'markers.CREDENTIALS_INITIAL_RETRY_MARKER 必须存在（解构到 undefined 会让下方断言永真）');
assert.ok(MARKER.length > 10, 'marker 不得是空串：includes("") 恒真');

test('credentials-initial-retry: 真实 vendored 产物锚点命中且幂等', () => {
  assert.ok(credFile, `找不到 vendored credentials-local 产物（候选：${CRED_TARGETS.join(' , ')}）`);
  const src = toPristineSource('credentials-initial-retry', fs.readFileSync(credFile, 'utf8'));
  assert.ok(!src.includes(MARKER), 'pristine 基准仍含 marker —— 逆运算没剥干净，changed 会退化成 already 假绿');
  assert.ok(!src.includes('readInitialDocumentWithRetry'), 'pristine 基准仍含注入体 —— 逆运算没剥干净');
  const r = transformCredentialsInitialRetry(src, credFile);
  assert.equal(r.status, 'changed', '锚点应命中真实产物');
  assert.equal(transformCredentialsInitialRetry(r.src, credFile).status, 'already', '注入后幂等');
  assert.ok(r.src.includes(MARKER));
  assert.ok(r.src.includes('readInitialDocumentWithRetry'));
  assert.ok(r.src.includes('statInitialWithRetry'));
  assert.ok(r.src.includes('text = await readInitialDocumentWithRetry(this.spec.filename);'));
  assert.ok(r.src.includes('mode = (await statInitialWithRetry(filename)).mode;'));
  // 往返闭合：产物再剥一次必须逐字节回到 pristine（钩住「登记表里的替换对」与
  // 「transform 实际写的字节」没有各走各的）。
  assert.equal(toPristineSource('credentials-initial-retry', r.src), src,
    '逆运算与正向注入必须互为逆');
});

test('credentials-initial-retry: 任一处注入单独丢失都必须被重打回全量态', () => {
  // 写入中途被杀 / 工具误删一个代码块，都会留下「只丢一处注入」的孤儿态。
  // 旧实现下：丢调用点或丢注入体会被误判 already（永不重打），丢首读块则
  // 因「要求三锚点同时在场」直接 anchor-missing（也永不重打）—— 三种都是静默留坏。
  // 夹具直接从 PRISTINE_INJECTIONS 登记表反推（只剥其中一对），不手抄代码片段。
  assert.ok(credFile, '缺少 vendored credentials-local 产物');
  const src = toPristineSource('credentials-initial-retry', fs.readFileSync(credFile, 'utf8'));
  const full = transformCredentialsInitialRetry(src, credFile);
  assert.equal(full.status, 'changed', '前置：全量注入基准本身要能产出');
  const pairs = PRISTINE_INJECTIONS['credentials-initial-retry'];
  assert.ok(pairs.length >= 3, `登记表至少应有三对注入（首读块/权限 stat/注入体），实际 ${pairs.length}`);

  pairs.forEach(([from, to], i) => {
    assert.ok(full.src.includes(to), `前置：第 ${i + 1} 对的补丁态没出现在产物里，登记表与 transform 已不一致`);
    const orphan = full.src.replace(to, from);
    assert.notEqual(orphan, full.src, `第 ${i + 1} 对未能造成差异`);
    const healed = transformCredentialsInitialRetry(orphan, credFile);
    assert.equal(healed.status, 'changed', `第 ${i + 1} 对注入丢失后必须重打（不得误入 already / anchor-missing）`);
    assert.equal(healed.src, full.src, `第 ${i + 1} 对重打后应与正常产物逐字节一致`);
  });
});

test('credentials-initial-retry: 行为级——瞬时错重试、ENOENT 立即抛、确定性错不无限重试', async () => {
  const delays = [];
  const makeFs = (failWith, succeedAfter) => {
    let calls = 0;
    return async () => {
      calls += 1;
      if (calls <= succeedAfter) {
        const e = new Error('transient');
        e.code = failWith;
        throw e;
      }
      return { ok: true, calls };
    };
  };
  const run = async (expr, failWith, succeedAfter) => {
    delays.length = 0;
    const sandbox = {
      stat: makeFs(failWith, succeedAfter),
      readFile: makeFs(failWith, succeedAfter),
      setTimeout: (fn, ms) => { delays.push(ms); fn(); }, // 记录退避并立即回调（不真等）
    };
    vm.createContext(sandbox);
    vm.runInContext(CREDENTIALS_HELPERS_CODE + `\nglobalThis.__fns = { statInitialWithRetry, readInitialDocumentWithRetry, isTransientInitialReadError };`, sandbox);
    return sandbox.__fns[expr];
  };

  // EBUSY×2 → 第 3 次成功：读到内容，且退避了 120+240ms。
  const readOk = await run('readInitialDocumentWithRetry', 'EBUSY', 2);
  const ok = await readOk('f');
  assert.equal(ok.ok, true);
  assert.deepEqual(delays, [120, 240], '重试退避 120ms/240ms');

  // ENOENT：合法空仓语义，立即抛（不得重试）。
  const readEnoent = await run('readInitialDocumentWithRetry', 'ENOENT', 1);
  await assert.rejects(readEnoent('f'), (e) => e.code === 'ENOENT');
  assert.deepEqual(delays, [], 'ENOENT 不得退避重试');

  // 持续 EPERM：重试 3 次后抛出（不得无限循环）。
  const readStuck = await run('readInitialDocumentWithRetry', 'EPERM', 99);
  await assert.rejects(readStuck('f'), (e) => e.code === 'EPERM');
  assert.equal(delays.length, 2, '两次退避后放弃（attempt>=2）');

  // stat 路径同样走重试（assertOwnerOnly 首查）。
  const statOk = await run('statInitialWithRetry', 'EACCES', 1);
  const st = await statOk('f');
  assert.equal(st.ok, true);
  assert.deepEqual(delays, [120]);
});
