'use strict';

// patch-settings-write-resilience 补丁单元测试（node --test）。
//
// v0.5.2「模型设置页添加供应商没反应/按钮灰」两层根治的行为学验证：
//   · 孤儿锁自愈（dsh-atomic-write）：transform 锚点/幂等/语法 + 真产物行为
//     （vm 实跑 patched withFileLock——死 PID 锁被清并放行、活 PID 锁保持
//     上游超时语义、非数字锁体按存活处理、操作完成后锁照常释放）；
//   · 设置页韧性（dsh-client-ui-settings-models）：transform 锚点/幂等/语法
//     + 注入片段行为（provider 目录与镜像视图偏差时强制重读并重建 namespaces、
//     无偏差时不重读；settings-conflict 时重读 revision 静默重试一次、重试
//     成功走 committed、非冲突错误原样透传）。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const {
  ORPHAN_LOCK_MARKER,
  NAMESPACE_HEAL_MARKER,
  CONFLICT_RETRY_MARKER,
  transformOrphanLock,
  transformSettingsModelsResilience,
  patchAtomicWriteOrphanLock,
  patchSettingsModelsResilience,
  AW_CONSTANTS,
} = require('../lib/patch-settings-write-resilience');

// payload pristine 源（stage-payload 镜像；boot 链跑过后可能已带补丁——幂等
// 场景反而覆盖 already 分支，行为测试统一在临时目录自建 pristine 夹具）。
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const PAYLOAD_NM = path.join(
  REPO_ROOT, 'dsh-tauri', 'package-payload', 'dsh-desktop', 'node_modules', '@deepseek-ai'
);
const AW_FILE = path.join(PAYLOAD_NM, 'dsh-atomic-write', 'lib', 'index.js');
const SM_FILE = path.join(PAYLOAD_NM, 'dsh-client-ui-settings-models', 'lib', 'client.js');

function readOrSkip(file) {
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, 'utf8');
}

/** 临时 node_modules 根构造器。 */
function makeNmRoot(pkgRel, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-swr-fx-'));
  const file = path.join(dir, '@deepseek-ai', pkgRel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return dir;
}

/** node --check 语法校验（ESM 用 .mjs 后缀）。 */
function assertSyntaxOk(source, label) {
  const tmp = path.join(os.tmpdir(), `dsh-swr-syntax-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  fs.writeFileSync(tmp, source);
  try {
    const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${label} 产物应语法合法: ${r.stderr}`);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

// ---------------------------------------------------------------------------
// 孤儿锁自愈：transform 层
// ---------------------------------------------------------------------------

test('orphan-lock: transform 命中锚点产出 changed 且语法合法', () => {
  const src = readOrSkip(AW_FILE);
  assert.ok(src !== null, 'payload 缺 dsh-atomic-write/lib/index.js');
  const r = transformOrphanLock(src, 'aw');
  assert.ok(r.status === 'changed' || r.status === 'already', `期望 changed/already，实际 ${r.status}`);
  if (r.status === 'changed') {
    assert.ok(r.src.includes(ORPHAN_LOCK_MARKER));
    assert.ok(r.src.includes('isDshOrphanLock'));
    assertSyntaxOk(r.src, 'atomic-write');
  }
});

test('orphan-lock: 幂等（二遍 already）', () => {
  const src = readOrSkip(AW_FILE);
  assert.ok(src !== null);
  const r1 = transformOrphanLock(src, 'aw');
  if (r1.status !== 'changed') return; // payload 已带补丁，already 分支即幂等证据
  const r2 = transformOrphanLock(r1.src, 'aw');
  assert.equal(r2.status, 'already');
});

test('orphan-lock: 无锚点时 anchor-missing 不改写', () => {
  const r = transformOrphanLock('export {};', 'aw');
  assert.equal(r.status, 'anchor-missing');
});

test('orphan-lock: root 应用器在临时 nm 根实跑（changed → already）', () => {
  const src = readOrSkip(AW_FILE);
  assert.ok(src !== null);
  const pristine = src.includes(ORPHAN_LOCK_MARKER)
    ? transformStripOrphan(src)
    : src;
  const root = makeNmRoot(path.join('dsh-atomic-write', 'lib', 'index.js'), pristine);
  try {
    const n1 = patchAtomicWriteOrphanLock(root, () => {});
    const n2 = patchAtomicWriteOrphanLock(root, () => {});
    assert.equal(n1, 1);
    assert.equal(n2, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

/** 从已打补丁的源剥掉注入（构造 pristine 夹具用）：与 transform 同源的注入常量反向替换。 */
function transformStripOrphan(src) {
  let s = src;
  s = s.split(AW_CONSTANTS.HELPER_INJECTION).join(AW_CONSTANTS.HELPER_ANCHOR);
  s = s.split(AW_CONSTANTS.CONTENTION_NEW).join(AW_CONSTANTS.CONTENTION_ANCHOR);
  s = s.split(AW_CONSTANTS.IMPORT_NEW).join(AW_CONSTANTS.IMPORT_ANCHOR);
  return s;
}

// ---------------------------------------------------------------------------
// 孤儿锁自愈：行为层（vm 实跑 patched withFileLock）
// ---------------------------------------------------------------------------

/** 载入 patched 产物并返回 { withFileLock }（node:fs/promises 直连真实 fs）。 */
async function loadPatchedAtomicWrite() {
  const src = readOrSkip(AW_FILE);
  assert.ok(src !== null);
  const patched = src.includes(ORPHAN_LOCK_MARKER) ? src : transformOrphanLock(src, 'aw').src;
  const tmp = path.join(os.tmpdir(), `dsh-swr-aw-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  fs.writeFileSync(tmp, patched);
  try {
    return { mod: await import(`file:///${tmp.replace(/\\/g, '/')}`), tmp };
  } catch (error) {
    fs.rmSync(tmp, { force: true });
    throw error;
  }
}

test('orphan-lock: 死 PID 孤儿锁被清除并放行写入', async () => {
  const { mod, tmp } = await loadPatchedAtomicWrite();
  try {
    const target = path.join(os.tmpdir(), `dsh-swr-t-${Date.now()}.yaml`);
    const lock = target + '.lock';
    fs.writeFileSync(lock, '999999\n'); // 不存在的 PID
    let ran = false;
    await mod.withFileLock(target, async () => { ran = true; }, { waitMs: 500 });
    assert.equal(ran, true, '孤儿锁应被自愈，操作应执行');
    assert.equal(fs.existsSync(lock), false, '操作完成后锁应被本持有者释放');
    fs.rmSync(target, { force: true });
  } finally {
    fs.rmSync(tmp, { force: true });
  }
});

test('orphan-lock: 活 PID 锁保持上游超时语义（不自愈）', async () => {
  const { mod, tmp } = await loadPatchedAtomicWrite();
  try {
    const target = path.join(os.tmpdir(), `dsh-swr-t2-${Date.now()}.yaml`);
    const lock = target + '.lock';
    fs.writeFileSync(lock, `${process.pid}\n`); // 自己 = 活持有者
    await assert.rejects(
      () => mod.withFileLock(target, async () => {}, { waitMs: 150 }),
      /timed out waiting for the writer lock/,
    );
    assert.equal(fs.existsSync(lock), true, '活锁不得被删除');
    fs.rmSync(lock, { force: true });
  } finally {
    fs.rmSync(tmp, { force: true });
  }
});

test('orphan-lock: 非数字锁体按存活处理（保守回退）', async () => {
  const { mod, tmp } = await loadPatchedAtomicWrite();
  try {
    const target = path.join(os.tmpdir(), `dsh-swr-t3-${Date.now()}.yaml`);
    const lock = target + '.lock';
    fs.writeFileSync(lock, 'not-a-pid\n');
    await assert.rejects(
      () => mod.withFileLock(target, async () => {}, { waitMs: 150 }),
      /timed out waiting for the writer lock/,
    );
    fs.rmSync(lock, { force: true });
  } finally {
    fs.rmSync(tmp, { force: true });
  }
});

// ---------------------------------------------------------------------------
// 设置页韧性：transform 层
// ---------------------------------------------------------------------------

test('settings-models: transform 命中双锚点产出 changed 且语法合法', () => {
  const src = readOrSkip(SM_FILE);
  assert.ok(src !== null, 'payload 缺 dsh-client-ui-settings-models/lib/client.js');
  const r = transformSettingsModelsResilience(src, 'sm');
  assert.ok(r.status === 'changed' || r.status === 'already', `期望 changed/already，实际 ${r.status}`);
  if (r.status === 'changed') {
    assert.ok(r.src.includes(NAMESPACE_HEAL_MARKER));
    assert.ok(r.src.includes(CONFLICT_RETRY_MARKER));
    assertSyntaxOk(r.src, 'settings-models');
  }
});

test('settings-models: 幂等（二遍 already）', () => {
  const src = readOrSkip(SM_FILE);
  assert.ok(src !== null);
  const r1 = transformSettingsModelsResilience(src, 'sm');
  if (r1.status !== 'changed') return;
  assert.equal(transformSettingsModelsResilience(r1.src, 'sm').status, 'already');
});

test('settings-models: 无锚点时 anchor-missing 不改写', () => {
  const r = transformSettingsModelsResilience('function x() {}', 'sm');
  assert.equal(r.status, 'anchor-missing');
});

test('settings-models: root 应用器在临时 nm 根实跑（changed → already）', () => {
  const src = readOrSkip(SM_FILE);
  assert.ok(src !== null);
  // payload 可能已被 boot 链/沙箱验证打过补丁：反剥成 pristine 夹具再测首遍 changed。
  const pristine = src.includes(NAMESPACE_HEAL_MARKER) || src.includes(CONFLICT_RETRY_MARKER)
    ? src.split(AW_CONSTANTS.SM_NS_NEW).join(AW_CONSTANTS.SM_NS_ANCHOR)
        .split(AW_CONSTANTS.SM_CONFLICT_NEW).join(AW_CONSTANTS.SM_CONFLICT_ANCHOR)
    : src;
  const root = makeNmRoot(path.join('dsh-client-ui-settings-models', 'lib', 'client.js'), pristine);
  try {
    const n1 = patchSettingsModelsResilience(root, () => {});
    const n2 = patchSettingsModelsResilience(root, () => {});
    assert.equal(n1, 1);
    assert.equal(n2, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 设置页韧性：注入片段行为层
// ---------------------------------------------------------------------------

/** 从 patched 源抽出命名空间自愈片段（marker 前 3 行起始到 marker 块尾）。 */
function extractNamespaceHealSnippet() {
  const src = readOrSkip(SM_FILE);
  assert.ok(src !== null);
  const patched = src.includes(NAMESPACE_HEAL_MARKER) ? src : transformSettingsModelsResilience(src, 'sm').src;
  const start = patched.indexOf('let namespaces = new Map(views.map((view) => [view.ns, view]));');
  const end = patched.indexOf('const rows = providers.map((entry) => {', start);
  assert.ok(start !== -1 && end !== -1, '产物中应能定位命名空间自愈片段');
  return patched.slice(start, end);
}

test('namespace-heal: 目录与视图偏差时强制重读并重建', async () => {
  const snippet = extractNamespaceHealSnippet();
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const make = new AsyncFunction('providers', 'views', 'describeFace', snippet + '\nreturn namespaces;');
  let loads = 0;
  const describeFace = {
    async load() { loads += 1; },
    getSnapshot() {
      return {
        view: {
          namespaces: [
            { ns: 'llm-deepseek' },
            { ns: 'llm-pi-ai' }, // 重读后补齐
          ],
        },
      };
    },
  };
  const providers = [{ provider: 'deepseek-official', settingsNs: 'llm-deepseek' }, { provider: 'anthropic', settingsNs: 'llm-pi-ai' }];
  const views = [{ ns: 'llm-deepseek' }]; // 镜像陈旧：缺 llm-pi-ai
  const ns = await make.call({ describeFace }, providers, views, describeFace);
  assert.equal(loads, 1, '偏差时应重读一次');
  assert.equal(ns.has('llm-pi-ai'), true, '重建后应含 llm-pi-ai');
});

test('namespace-heal: 无偏差时不重读', async () => {
  const snippet = extractNamespaceHealSnippet();
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const make = new AsyncFunction('providers', 'views', 'describeFace', snippet + '\nreturn namespaces;');
  let loads = 0;
  const describeFace = {
    async load() { loads += 1; },
    getSnapshot() { return { view: { namespaces: [{ ns: 'llm-deepseek' }] } }; },
  };
  const providers = [{ provider: 'deepseek-official', settingsNs: 'llm-deepseek' }];
  const views = [{ ns: 'llm-deepseek' }];
  await make.call({ describeFace }, providers, views, describeFace);
  assert.equal(loads, 0, '无偏差时不得重读');
});

/** 从 patched 源抽出冲突重试片段（if (!response.ok) { 起）。 */
function extractConflictRetrySnippet() {
  const src = readOrSkip(SM_FILE);
  assert.ok(src !== null);
  // payload 可能已被 boot 链只打上 namespace-heal（半补丁）——先反剥成 pristine
  // 夹具再重跑 transform，让 conflict-retry 注入体必然存在（与 root 应用器同手法）。
  const pristine = src.includes(NAMESPACE_HEAL_MARKER) || src.includes(CONFLICT_RETRY_MARKER)
    ? src.split(AW_CONSTANTS.SM_NS_NEW).join(AW_CONSTANTS.SM_NS_ANCHOR)
        .split(AW_CONSTANTS.SM_CONFLICT_NEW).join(AW_CONSTANTS.SM_CONFLICT_ANCHOR)
    : src;
  const patched = transformSettingsModelsResilience(pristine, 'sm').src;
  // 起点锚定：marker 注释在 if 块体内，向前找紧邻的 if 行（文件前部还有
  // 别处的 if (!response.ok) { 形态，不能全局取首个）。
  const markerAt = patched.indexOf(CONFLICT_RETRY_MARKER);
  assert.ok(markerAt !== -1, '产物中应有冲突重试 marker');
  const start = patched.lastIndexOf('if (!response.ok) {', markerAt);
  // 结束边界 = 注入块之后上游原句 setCommitted(true);（5 缩进）所在行首：
  // 注入块自带的更深缩进 setCommitted 不以「\n+5tab」开头，不会误匹配。
  const end = patched.indexOf('\n\t\t\t\t\tsetCommitted(true);', start);
  assert.ok(start !== -1 && end !== -1, '产物中应能定位冲突重试片段');
  return patched.slice(start, end);
}

async function runConflictSnippet(mutateResults, describeResult, firstResponse) {
  const snippet = extractConflictRetrySnippet();
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const make = new AsyncFunction(
    'api', 'response', 'openedAt', 'route', 'profile', 'setCommitted', 'NS$1',
    snippet + '\nreturn "fell-through";'
  );
  let mutates = 0;
  const api = {
    settings: {
      mutate: async (ns, ops, expectedRevision) => {
        const r = mutateResults[Math.min(mutates, mutateResults.length - 1)];
        mutates += 1;
        return r;
      },
      describe: async () => describeResult,
    },
  };
  let committed = false;
  const initial = firstResponse !== undefined ? firstResponse : mutateResults[0];
  const outcome = await make(
    api,
    initial,
    1,
    'acme-gateway',
    { api: 'openai-completions' },
    () => { committed = true; },
    'llm-pi-ai'
  );
  return { outcome, committed, mutates };
}

test('conflict-retry: settings-conflict 时重读 revision 静默重试成功', async () => {
  const conflict = { ok: false, error: { code: 'settings-conflict', message: 'stale' } };
  const okMutate = { ok: true, value: { ns: 'llm-pi-ai', revision: 7 } };
  const describeOk = { ok: true, value: { namespaces: [{ ns: 'llm-pi-ai', revision: 7 }] } };
  // 首个 response 由调用方直接传入（真实代码是上游 mutate 的返回），api.settings.mutate
  // 只会被重试路径调用——mock 首个应答即重试结果。
  const { outcome, committed, mutates } = await runConflictSnippet([okMutate], describeOk, conflict);
  assert.equal(mutates, 1, '应发起恰好一次重试');
  assert.equal(committed, true, '重试成功应走 committed');
  assert.equal(outcome, undefined, '成功路径不返回报错');
});

test('conflict-retry: 重试仍失败时返回重试报错', async () => {
  const conflict = { ok: false, error: { code: 'settings-conflict', message: 'stale' } };
  const stillBad = { ok: false, error: { code: 'settings-rejected', message: 'retry-failed' } };
  const describeOk = { ok: true, value: { namespaces: [{ ns: 'llm-pi-ai', revision: 7 }] } };
  const { outcome, committed, mutates } = await runConflictSnippet([stillBad], describeOk, conflict);
  assert.equal(mutates, 1);
  assert.equal(committed, false);
  assert.equal(outcome, 'retry-failed');
});

test('conflict-retry: 非冲突错误原样透传（不重试）', async () => {
  const rejected = { ok: false, error: { code: 'settings-rejected', message: 'no-writer-lock' } };
  const { outcome, mutates } = await runConflictSnippet([rejected], { ok: false });
  assert.equal(mutates, 0, '非冲突不得重试');
  assert.equal(outcome, 'no-writer-lock');
});
