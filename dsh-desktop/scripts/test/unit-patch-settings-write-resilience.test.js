'use strict';

// patch-settings-write-resilience 补丁单元测试（node --test）。
//
// v0.5.2「模型设置页添加供应商没反应/按钮灰」两层根治的行为学验证。
//
// 0.2.0-rc.2 起只剩设置页半边：孤儿锁自愈（dsh-atomic-write）已退役——上游
// withFileLock 自己长出了 takeOverExitedLock（lib/index.js 里 process.kill(pid, 0)
// 判活 + 接管退出持有者），我们的 transform 对 rc.2 pristine 字节返回 anchor-missing；
// 注册表规格与 rootAppliers 接线已摘，transform 实现留在原文件休眠。故本文件
// 不再引用 AW_FILE 与孤儿锁相关导出（2026-10-05 收口）。
//   · 设置页韧性（dsh-client-ui-settings-models）：transform 锚点/幂等/语法
//     + 注入片段行为（provider 目录与镜像视图偏差时强制重读并重建 namespaces、
//     无偏差时不重读；settings-conflict 时重读 revision 静默重试一次、重试
//     成功走 committed、非冲突错误原样透传）。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  NAMESPACE_HEAL_MARKER,
  CONFLICT_RETRY_MARKER,
  transformSettingsModelsResilience,
  patchSettingsModelsResilience,
  AW_CONSTANTS,
} = require('../lib/patch-settings-write-resilience');
const { kernel } = require('../compat/kernel-pin.json');

// pristine 源取 vendored tarball 解包字节（随 kernel-pin 换版自动跟随）。
// 0.1.2-alpha.2 重靶期把它从 payload 换成 tarball（payload 树停留在 alpha.1，锚点
// 已换代）—— 当时指向 payload 等于把 dsh-tauri/package-payload 变成单测的硬前置：
// payload 不暂存即 ENOENT 全红，而 payload 又是打包链就地打补丁的目录（不是真
// pristine）。2026-10-05 收口。
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const SM_FILE = extractPristineFile('dsh-client-ui-settings-models', 'lib/client.js');

/** 把某个内核包的 vendored tarball 解到一次性目录，返回包内文件的绝对路径。 */
function extractPristineFile(pkg, rel) {
  const { after } = require('node:test');
  const tarball = path.join(
    REPO_ROOT, 'dsh-desktop', 'vendor', 'dsh-kernel',
    `deepseek-ai-${pkg}-${kernel.packageVersion}.tgz`,
  );
  assert.ok(fs.existsSync(tarball), `缺 vendored ${kernel.packageVersion} tarball: ${tarball}`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-swr-pristine-'));
  after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // win32 显式用系统自带 bsdtar（Git Bash 的 GNU tar 会把 "C:\" 当远程主机）。
  const tarBin = process.platform === 'win32'
    ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')
    : 'tar';
  const res = spawnSync(tarBin, ['-xzf', tarball, '-C', dir], { encoding: 'utf8' });
  assert.equal(res.status, 0, 'tar 解包失败: ' + (res.stderr || ''));
  return path.join(dir, 'package', ...rel.split('/'));
}

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
// 设置页韧性：transform 层
// ---------------------------------------------------------------------------

test('settings-models: transform 命中三锚点产出 changed 且语法合法', () => {
  const src = readOrSkip(SM_FILE);
  assert.ok(src !== null, '缺 dsh-client-ui-settings-models/lib/client.js（vendor tarball）');
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

test('settings-models: 半补丁（仅 namespace-heal）会在重跑时补全 conflict-retry', () => {
  const src = readOrSkip(SM_FILE);
  assert.ok(src !== null);
  // 反剥 namespace-heal 回原锚点 → 再只注入 namespace-heal，构造「半补丁」现场
  //（历史现场：早期锚点失配只命中其一，|| 幂等判定会让缺另一半的文件被误判 already）。
  const pristine = src.includes(NAMESPACE_HEAL_MARKER)
    ? src.split(AW_CONSTANTS.SM_NS_NEW).join(AW_CONSTANTS.SM_NS_ANCHOR)
    : src;
  const half = pristine.replace(AW_CONSTANTS.SM_NS_ANCHOR, AW_CONSTANTS.SM_NS_NEW);
  assert.equal(half.includes(NAMESPACE_HEAL_MARKER), true);
  assert.equal(half.includes(CONFLICT_RETRY_MARKER), false);
  const r = transformSettingsModelsResilience(half, 'sm');
  assert.equal(r.status, 'changed', '半补丁应被判定为 changed 而非 already');
  assert.equal(r.src.includes(NAMESPACE_HEAL_MARKER), true);
  assert.equal(r.src.includes(CONFLICT_RETRY_MARKER), true, '缺失的 conflict-retry 注入体应被补全');
  assert.equal(transformSettingsModelsResilience(r.src, 'sm').status, 'already', '补全后二遍应幂等 already');
});

test('settings-models: root 应用器在临时 nm 根实跑（changed → already）', () => {
  const src = readOrSkip(SM_FILE);
  assert.ok(src !== null);
  // pristine tarball 源正常应未打补丁；防御性反剥（与 transform 同源注入常量）。
  const pristine = src.includes(NAMESPACE_HEAL_MARKER) || src.includes(CONFLICT_RETRY_MARKER)
    ? src.split(AW_CONSTANTS.SM_NS_NEW).join(AW_CONSTANTS.SM_NS_ANCHOR)
        .split(AW_CONSTANTS.SM_CONFLICT_NEW).join(AW_CONSTANTS.SM_CONFLICT_ANCHOR)
        .split(AW_CONSTANTS.SM_OPS_NEW).join(AW_CONSTANTS.SM_OPS_ANCHOR)
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
  // 注入体是注入方自己的多行形态，而 rc.2 的产物本体是压缩态：
  // 起始句取自注入体，结束边界必须按产物真字节认（`}const rows=providers.map(entry=>{`），
  // 不能写死上一代的可读空格形态——否则 indexOf 恒 -1，片段抽不出来。
  const start = patched.indexOf('let namespaces = new Map(views.map((view) => [view.ns, view]));');
  const tail = start === -1 ? null : /const rows\s*=\s*providers\.map\(/.exec(patched.slice(start));
  const end = tail ? start + tail.index : -1;
  assert.ok(start !== -1 && end !== -1, '产物中应能定位命名空间自愈片段');
  return patched.slice(start, end);
}

test('namespace-heal: 目录与视图偏差时强制重读并重建', async () => {
  const snippet = extractNamespaceHealSnippet();
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const make = new AsyncFunction('providers', 'views', 'describeFace', snippet + '\nreturn namespaces;');
  let ensures = 0;
  let loads = 0;
  // rc.2 的 describe 面重读入口是 ensure()（0.2.1 及以前叫 load()）；两个都给，
  // 并分别计数——既证明重读发生了，也锁死用的是 rc.2 那个方法名。
  const describeFace = {
    async ensure() { ensures += 1; },
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
  assert.equal(ensures, 1, '偏差时应经 ensure() 重读一次');
  assert.equal(loads, 0, '不得再调上一代的 load()');
  assert.equal(ns.has('llm-pi-ai'), true, '重建后应含 llm-pi-ai');
});

test('namespace-heal: 无偏差时不重读', async () => {
  const snippet = extractNamespaceHealSnippet();
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const make = new AsyncFunction('providers', 'views', 'describeFace', snippet + '\nreturn namespaces;');
  let ensures = 0;
  let loads = 0;
  const describeFace = {
    async ensure() { ensures += 1; },
    async load() { loads += 1; },
    getSnapshot() { return { view: { namespaces: [{ ns: 'llm-deepseek' }] } }; },
  };
  const providers = [{ provider: 'deepseek-official', settingsNs: 'llm-deepseek' }];
  const views = [{ ns: 'llm-deepseek' }];
  await make.call({ describeFace }, providers, views, describeFace);
  assert.equal(ensures, 0, '无偏差时不得重读（ensure 也不得调用）');
  assert.equal(loads, 0, '无偏差时不得重读');
});

/** 从 patched 源抽出冲突重试片段（if (written.kind !== "written") { 起）。 */
function extractConflictRetrySnippet() {
  const src = readOrSkip(SM_FILE);
  assert.ok(src !== null);
  // pristine 源正常应未打补丁；防御性反剥（半补丁现场重跑 transform 同手法）。
  const pristine = src.includes(NAMESPACE_HEAL_MARKER) || src.includes(CONFLICT_RETRY_MARKER)
    ? src.split(AW_CONSTANTS.SM_NS_NEW).join(AW_CONSTANTS.SM_NS_ANCHOR)
        .split(AW_CONSTANTS.SM_CONFLICT_NEW).join(AW_CONSTANTS.SM_CONFLICT_ANCHOR)
        .split(AW_CONSTANTS.SM_OPS_NEW).join(AW_CONSTANTS.SM_OPS_ANCHOR)
    : src;
  const patched = transformSettingsModelsResilience(pristine, 'sm').src;
  // 起点锚定：marker 注释在 if 块体内，向前找紧邻的 if 行（文件前部还有
  // 别处的 if (written.kind !== "written") 形态，不能全局取首个）。
  const markerAt = patched.indexOf(CONFLICT_RETRY_MARKER);
  assert.ok(markerAt !== -1, '产物中应有冲突重试 marker');
  const start = patched.lastIndexOf('if (written.kind !== "written") {', markerAt);
  // 结束边界 = 注入块之后上游原句 setCommitted(true)。rc.2 产物是压缩态，
  // 这一句退化成 `<注入块闭括号>setCommitted(true)}if(storesKey){`——没有换行也没有 5 tab 缩进，
  // 所以按「紧贴在 setCommitted(true) 前的那个闭括号」认边界，不写死上一代的缩进形状。
  // 注入块内部自带的 setCommitted(true); 后面跟的是 `;` 与换行，不会误匹配到这里。
  const tail = start === -1 ? null : /\}setCommitted\(true\)/.exec(patched.slice(start));
  const end = tail ? start + tail.index + 1 : -1;
  assert.ok(start !== -1 && end !== -1, '产物中应能定位冲突重试片段');
  return patched.slice(start, end);
}

async function runConflictSnippet(writeResults, describeValue, firstWritten) {
  const snippet = extractConflictRetrySnippet();
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const make = new AsyncFunction(
    'operations', 'written', 'openedAt', 'route', 'profile', 'setCommitted', 'NS$1', 't',
    snippet + '\nreturn "fell-through";'
  );
  let writes = 0;
  let describes = 0;
  const operations = {
    writeSettings: async (ns, ops, expectedRevision) => {
      const r = writeResults[Math.min(writes, writeResults.length - 1)];
      writes += 1;
      return r;
    },
    describeSettings: async () => {
      describes += 1;
      return describeValue;
    },
  };
  let committed = false;
  const initial = firstWritten !== undefined ? firstWritten : writeResults[0];
  const outcome = await make(
    operations,
    initial,
    1,
    'acme-gateway',
    { api: 'openai-completions' },
    () => { committed = true; },
    'llm-pi-ai',
    (key) => 'conflict:' + key
  );
  return { outcome, committed, writes, describes };
}

test('conflict-retry: settings-conflict 时重读 revision 静默重试成功', async () => {
  const conflict = { kind: 'conflict', message: 'stale' };
  const okWrite = { kind: 'written', view: { ns: 'llm-pi-ai', revision: 7 } };
  const describeOk = { namespaces: [{ ns: 'llm-pi-ai', revision: 7 }] };
  // 首个 written 由调用方直接传入（真实代码是上游 writeSettings 的返回），
  // operations.writeSettings 只会被重试路径调用——mock 首个应答即重试结果。
  const { outcome, committed, writes, describes } = await runConflictSnippet([okWrite], describeOk, conflict);
  assert.equal(writes, 1, '应发起恰好一次重试写');
  assert.equal(describes, 1, '应重读一次 describe');
  assert.equal(committed, true, '重试成功应走 committed');
  assert.equal(outcome, undefined, '成功路径不返回报错');
});

test('conflict-retry: 重试仍失败时返回重试报错', async () => {
  const conflict = { kind: 'conflict', message: 'stale' };
  const stillBad = { kind: 'refused', message: 'retry-failed' };
  const describeOk = { namespaces: [{ ns: 'llm-pi-ai', revision: 7 }] };
  const { outcome, committed, writes } = await runConflictSnippet([stillBad], describeOk, conflict);
  assert.equal(writes, 1);
  assert.equal(committed, false);
  assert.equal(outcome, 'retry-failed');
});

test('conflict-retry: 非冲突错误原样透传（不重试、不重读）', async () => {
  const refused = { kind: 'refused', message: 'no-writer-lock' };
  const { outcome, writes, describes } = await runConflictSnippet([refused], { namespaces: [] }, refused);
  assert.equal(writes, 0, '非冲突不得重试');
  assert.equal(describes, 0, '非冲突不得重读');
  assert.equal(outcome, 'no-writer-lock');
});
