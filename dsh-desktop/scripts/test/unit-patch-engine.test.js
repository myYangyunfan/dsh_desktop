'use strict';

// 统一补丁引擎与配套插件共享模块的单元测试（node --test）：
//   A. patch-io：原子写、进程级读缓存（命中/失效/缺失）；
//   B. patch-engine：已应用/锚点失配/读取失败/写入失败/dry-run 全分支；
//   C. runtime-patches：闪跳与白名单变换的字节级断言（含真实 vendored 文件）；
//   D. companion-plugins：唯一数据源清单与目录名约定；
//   E. companion-profile：禁用条目/旧市场清理/注册循环纯函数 + 真实 assets
//      全量同步（幂等零写入、dry-run 零落盘、bundle 校验）。
// 用法：node --test scripts/test/unit-patch-engine.test.js

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const { writeFileAtomic, readFileCached } = require('../lib/patch-io');
const { applyPatchToFiles } = require('../lib/patch-engine');
const {
  FLASH_OLD, FLASH_NEW,
  FLASH_PKG_REL, patchTargets,
  localCopyFiles, guardCopyFiles, localNodeModulesRoots,
  slotCompatCopyFiles, slotCompatPatchTargets,
  transformFlashFix,
  SHELL_DESC_MARKER, SHELL_DESC_SCHEMA_OLD, SHELL_DESC_SCHEMA_NEW,
  SHELL_DESC_SCHEMA_OPTIONAL, PW_REL, BASH_REL, transformShellDescriptionOptional,
  RUNCODE_DESC_MARKER, RUNCODE_SCHEMA_OLD, RUNCODE_SCHEMA_OPTIONAL,
  ATTACH_MIME_MARKER, ATTACH_MIME_OLD, ATTACH_MIME_NEW, ATTACH_LOCAL_REL, transformAttachmentMimeTrust,
  SLOT_KEY_COMPAT_PKG_REL, SLOT_UNKEYED_COMPAT_PKG_REL,
  SLOT_KEY_COMPAT_MARKER, SLOT_KEY_COMPAT_OLD, SLOT_KEY_COMPAT_NEW, transformLegacySlotKey,
  SLOT_UNKEYED_COMPAT_MARKER, SLOT_UNKEYED_COMPAT_OLD, SLOT_UNKEYED_COMPAT_NEW, transformSlotUnkeyedCompat,
} = require('../lib/runtime-patches');
const { COMPANION_PLUGINS, companionDirName } = require('../lib/companion-plugins');
const { DSHTOOLS_REL } = require('../lib/patch-target-resolver');
// 变换类单测的起点一律取真 pristine 闭包树（详见 pristineShell 注释）。
const { findPristineFile } = require('../lib/pristine-kernel-roots');
const {
  PATCH_HEADER, ACP_DISABLE_BLOCK,
  ACP_SELF_DISABLE_BLOCK, removeAcpBasicDisableBlock,
  ensureDisabledPatchEntry, removeLegacyMarketplacePatchLines,
  registerCompanionPatchEntries, syncCompanionFiles, removedPluginIdsFromPatch,
} = require('../lib/companion-profile');
const { bundlePatchRel, verifyBundleDir } = require('../../profile-bundle-heal');

const repoRoot = path.resolve(__dirname, '..', '..');

function tmpdir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-engine-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

// ---------------------------------------------------------------------------
// A. patch-io
// ---------------------------------------------------------------------------

test('patch-io: 原子写内容完整、无 .tmp 残留、可覆盖已有文件', (t) => {
  const dir = tmpdir(t);
  const file = path.join(dir, 'x.txt');
  writeFileAtomic(file, 'first');
  assert.strictEqual(fs.readFileSync(file, 'utf8'), 'first');
  assert.ok(!fs.existsSync(file + '.tmp'), '写入后不应残留临时文件');
  writeFileAtomic(file, 'second');
  assert.strictEqual(fs.readFileSync(file, 'utf8'), 'second', '覆盖写入');
});

test('patch-io: 读缓存命中、外部写入后失效、缺失返回 null', (t) => {
  const dir = tmpdir(t);
  const file = path.join(dir, 'c.txt');
  fs.writeFileSync(file, 'v1');
  assert.strictEqual(readFileCached(file), 'v1');
  assert.strictEqual(readFileCached(file), 'v1', '缓存命中');
  fs.writeFileSync(file, 'v1-longer-content');
  assert.strictEqual(readFileCached(file), 'v1-longer-content', '内容变化后缓存失效');
  assert.strictEqual(readFileCached(path.join(dir, 'missing.txt')), null, '缺失返回 null');
});

// ---------------------------------------------------------------------------
// B. patch-engine
// ---------------------------------------------------------------------------

test('patch-engine: changed/already/anchor-missing/dry-run 全分支与日志文案', (t) => {
  const dir = tmpdir(t);
  const file = path.join(dir, 'target.js');
  fs.writeFileSync(file, 'OLD');
  const logs = [];
  const spec = () => ({
    prefix: '测试补丁',
    files: [file],
    log: (m) => logs.push(m),
    transform: (src) => {
      if (src.includes('DONE')) return { status: 'already' };
      if (!src.includes('OLD')) return { status: 'anchor-missing', detail: '锚点未匹配，跳过 ' + file };
      return { status: 'changed', src: src.replace('OLD', 'DONE'), note: ['x'] };
    },
    alreadyLog: (f) => '已应用，跳过 ' + f,
    doneLog: (f, note) => '已修复 ' + f + ' (' + note.join(',') + ')',
  });
  // changed
  let n = applyPatchToFiles(spec());
  assert.strictEqual(n, 1, '应写入 1 份文件');
  assert.strictEqual(fs.readFileSync(file, 'utf8'), 'DONE');
  assert.deepStrictEqual(logs, ['测试补丁: 已修复 ' + file + ' (x)']);
  // already
  logs.length = 0;
  n = applyPatchToFiles(spec());
  assert.strictEqual(n, 0);
  assert.deepStrictEqual(logs, ['测试补丁: 已应用，跳过 ' + file]);
  // anchor-missing（文件内容换成不含锚点）
  fs.writeFileSync(file, 'OTHER');
  logs.length = 0;
  n = applyPatchToFiles(spec());
  assert.strictEqual(n, 0);
  assert.deepStrictEqual(logs, ['测试补丁: 锚点未匹配，跳过 ' + file]);
  assert.strictEqual(fs.readFileSync(file, 'utf8'), 'OTHER', '锚点失配绝不改写文件');
  // dry-run：不落盘，输出计划
  fs.writeFileSync(file, 'OLD');
  logs.length = 0;
  n = applyPatchToFiles({ ...spec(), dryRun: true, dryRunChangedLog: (f) => 'dry-run: 将修复 ' + f });
  assert.strictEqual(n, 0, 'dry-run 零写入');
  assert.strictEqual(fs.readFileSync(file, 'utf8'), 'OLD', 'dry-run 不落盘');
  assert.deepStrictEqual(logs, ['dry-run: 将修复 ' + file]);
});

test('patch-engine: 空路径/文件不存在静默跳过；读取失败与写入失败走对应日志', (t) => {
  const dir = tmpdir(t);
  const file = path.join(dir, 't.js');
  fs.writeFileSync(file, 'OLD');
  const logs = [];
  const base = {
    prefix: '测试补丁',
    log: (m) => logs.push(m),
    transform: (src) => ({ status: 'changed', src: src.replace('OLD', 'DONE') }),
    doneLog: (f) => '已应用 ' + f,
  };
  // 不存在与空路径：静默
  const n = applyPatchToFiles({ ...base, files: [null, '', path.join(dir, 'nope.js')] });
  assert.strictEqual(n, 0);
  assert.deepStrictEqual(logs, []);
  // 读取失败：目录路径 stat 成功但 readFile 抛 EISDIR → 读取失败日志
  const sub = path.join(dir, 'as-dir.js');
  fs.mkdirSync(sub);
  const n2 = applyPatchToFiles({ ...base, files: [sub] });
  assert.strictEqual(n2, 0);
  assert.deepStrictEqual(logs, ['测试补丁: 读取失败，跳过 ' + sub]);
  // 写入失败：目标设为只读 → 原子写 rename 失败 → failLog（默认文案），原文件不损坏
  logs.length = 0;
  const ro = path.join(dir, 'ro.js');
  fs.writeFileSync(ro, 'OLD');
  fs.chmodSync(ro, 0o444);
  const n3 = applyPatchToFiles({ ...base, files: [ro] });
  assert.strictEqual(n3, 0);
  assert.strictEqual(logs.length, 1, '应输出失败日志');
  assert.ok(logs[0].startsWith('测试补丁失败(' + ro + '):'), '默认失败文案含前缀与文件: ' + logs[0]);
  fs.chmodSync(ro, 0o666);
  fs.rmSync(ro + '.tmp', { force: true });
  assert.strictEqual(fs.readFileSync(ro, 'utf8'), 'OLD', '写入失败不得损坏原文件');
});

// ---------------------------------------------------------------------------
// C. runtime-patches
// ---------------------------------------------------------------------------

test('runtime-patches: 闪跳变换 already/失配/changed 字节级正确', () => {
  const file = 'C:\\x\\client.js';
  const fake = `const keep = "${FLASH_OLD}";\nrest();`;
  assert.deepStrictEqual(transformFlashFix(fake.replace(FLASH_OLD, FLASH_NEW), file), { status: 'already' });
  assert.deepStrictEqual(transformFlashFix('nothing to patch', file), {
    status: 'anchor-missing',
    detail: '未匹配到目标代码（版本可能已变更），跳过 ' + file,
  });
  const out = transformFlashFix(fake, file);
  assert.strictEqual(out.status, 'changed');
  assert.strictEqual(out.src, fake.replace(FLASH_OLD, FLASH_NEW), '替换结果与旧实现逐字节一致');
  assert.ok(!out.src.includes(FLASH_OLD) && out.src.includes(FLASH_NEW));
});

test('runtime-patches: WSL/CLI 目标路径约定', () => {
  const home = 'C:\\home';
  const rel = path.join('dsh-client-runtime', 'lib', 'client.js');
  assert.deepStrictEqual(patchTargets(home, rel), [
    path.join(home, 'profiles', 'node_modules', '@deepseek-ai', rel),
    path.join(home, 'agent', 'node_modules', '@deepseek-ai', rel),
  ]);
  // 0.1.2-alpha.1：dsh-client-runtime 分解为 dsh-api-session-controller，
  // 闪跳修复（mergeOrderedBaseline 保留本地新会话）落点迁至 session-controller。
  assert.strictEqual(FLASH_PKG_REL, path.join('dsh-api-session-controller', 'lib', 'client.js'));
});

test('runtime-patches: 候选路径构造器（本地三副本/防护四副本/WSL agent 直连根）', () => {
  const home = 'C:\\home';
  const appDir = 'C:\\app';
  const userData = 'C:\\ud';
  const rel = path.join('dsh-host-apiproxy', 'lib', 'index.js');
  // 本地模式三副本：profile fallback → 内置副本 → 更新 overlay
  assert.deepStrictEqual(localCopyFiles(home, appDir, userData, rel), [
    path.join(home, 'profiles', 'node_modules', '@deepseek-ai', rel),
    path.join(appDir, 'node_modules', '@deepseek-ai', rel),
    path.join(userData, 'agent', 'node_modules', '@deepseek-ai', rel),
  ]);
  // 防护类四副本：内置副本优先 + overlay + overlay 嵌套 dsh 依赖副本 + profile fallback
  assert.deepStrictEqual(guardCopyFiles(home, appDir, userData, rel), [
    path.join(appDir, 'node_modules', '@deepseek-ai', rel),
    path.join(userData, 'agent', 'node_modules', '@deepseek-ai', rel),
    path.join(userData, 'agent', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', rel),
    path.join(home, 'profiles', 'node_modules', '@deepseek-ai', rel),
  ]);
  // 包级补丁根目录：本地三件套；WSL 模式追加 WSL agent 直连根
  assert.deepStrictEqual(localNodeModulesRoots(home, appDir, userData), [
    path.join(home, 'profiles', 'node_modules'),
    path.join(appDir, 'node_modules'),
    path.join(userData, 'agent', 'node_modules'),
  ]);
  assert.deepStrictEqual(localNodeModulesRoots(home, appDir, userData, [path.join(home, 'agent', 'node_modules')]), [
    path.join(home, 'profiles', 'node_modules'),
    path.join(appDir, 'node_modules'),
    path.join(userData, 'agent', 'node_modules'),
    path.join(home, 'agent', 'node_modules'),
  ]);
});

// 起点必须是真 pristine 字节（.tmp-kernel/.consumer-<pin> 闭包树），不是 dev
// node_modules 的「反打还原」——还原函数只认识它自己那两处替换，内核里任何其它
// 变化都会让还原产物与官方形态有差，测试于是验的是一个不存在的输入。
function pristineShell(rel) {
  const file = findPristineFile(rel);
  assert.ok(file, `缺 pristine 源：@deepseek-ai/${rel}（先跑 node scripts/install-pristine-kernel.mjs）`);
  return { file, src: fs.readFileSync(file, 'utf8') };
}

test('tool-compat: shell description 兜底变换（真 pristine 文件 + 幂等）', () => {
  for (const rel of [PW_REL, BASH_REL]) {
    const { file, src } = pristineShell(rel);
    const out = transformShellDescriptionOptional(src, file);
    assert.strictEqual(out.status, 'changed', rel + ' 应可补丁');
    // 两半都必须上：schema 去 required + validate 缺省补值。只上一半就是
    // 「changed 但静默失效」——引擎参数校验仍会先拒省略 description 的调用。
    assert.match(out.note, /description 改为可选/, rel + ' 应命中 schema 半边');
    assert.match(out.note, /validate 兜底/, rel + ' 应命中 validate 半边');
    assert.ok(out.src.includes(SHELL_DESC_MARKER), rel + ' 应写入幂等标记（validate 兜底）');
    assert.ok(out.src.includes(SHELL_DESC_SCHEMA_OPTIONAL), rel + ' description 应改为可选（删除 required: true 行）');
    assert.ok(!out.src.includes(SHELL_DESC_SCHEMA_OLD), rel + ' 不得残留 description 的 required: true 块');
    assert.ok(!out.src.includes('required: false'), rel + ' 不得写入 required: false（引擎定义期即拒）');
    assert.ok(out.src.includes('required: true'), rel + ' command 等其它参数仍须保持 required: true');
    assert.ok(out.src.includes('args.description = args.command.trim().split'), rel + ' 缺省 description 应从 command 生成');
    assert.ok(!/split\(\/\r?\n\/\)/.test(out.src), rel + ' 生成的正则不得含真换行（转义回归）');
    assert.deepStrictEqual(transformShellDescriptionOptional(out.src, file), { status: 'already' }, rel + ' 二次应用应幂等');
  }
});

test('tool-compat: run_code（dsh-tools）同构变换两半齐上且幂等', () => {
  const { file, src } = pristineShell(DSHTOOLS_REL);
  const out = transformShellDescriptionOptional(src, file);
  assert.strictEqual(out.status, 'changed', 'dsh-tools run_code 应可补丁');
  assert.match(out.note, /run_code: description 改为可选/, 'run_code schema 半边必须命中');
  assert.match(out.note, /run_code: validate 兜底/, 'run_code validate 半边必须命中');
  // 反证（作用域）：run_code 的三 tab validate 行以 shell 的一 tab 锚点为子串，
  // 若 shell 半边在 dsh-tools 里也开火，会用 args.command 误改 run_code 行 ——
  // 步骤顺序（run_code 先跑）就是这条的守卫。
  assert.doesNotMatch(out.note, /shell:/, 'dsh-tools 不得被 shell 半边改写');
  assert.ok(out.src.includes(RUNCODE_DESC_MARKER), '应写入 run_code 幂等标记');
  assert.strictEqual(out.src.split(RUNCODE_SCHEMA_OLD).length - 1, 0, '两处 required:true 块都应消除');
  assert.strictEqual(out.src.split(RUNCODE_SCHEMA_OPTIONAL).length - 1, 2, '两处 description 都应改为可选');
  assert.ok(out.src.includes('args.description = args.code.trim().split'), '缺省 description 应从 code 首行生成');
  assert.ok(out.src.includes('code: {' + '\n' + '\t\t\t\ttype: "string",' + '\n' + '\t\t\t\trequired: true'), 'code 仍须保持 required: true');
  assert.deepStrictEqual(transformShellDescriptionOptional(out.src, file), { status: 'already' }, '二次应用应幂等');
});

test('tool-compat: shell description 历史误写（required: false）收敛为删除该行', () => {
  const { file, src } = pristineShell(PW_REL);
  // 历史形态由常量拼出（与变换识别锚点同源），不再手抄字面量 —— 上一版手抄的
  // 三 tab 字面量随 rc.2 缩进下沉一级后静默替换不上，assert 变成恒真的假绿。
  const legacy = src.replace(SHELL_DESC_SCHEMA_OLD, SHELL_DESC_SCHEMA_NEW);
  assert.notStrictEqual(legacy, src, '应成功构造历史 required:false 形态');
  assert.ok(legacy.includes(SHELL_DESC_SCHEMA_NEW), '构造出的历史形态应可被变换识别');
  const out = transformShellDescriptionOptional(legacy, file);
  assert.strictEqual(out.status, 'changed', '含历史 false 误写时应收敛为可选');
  assert.match(out.note, /清理历史 required:false/, '应走历史误写收敛分支');
  assert.ok(!out.src.includes('required: false'), '收敛后不得残留 required: false');
  assert.ok(out.src.includes(SHELL_DESC_SCHEMA_OPTIONAL), '收敛后 description 应为可选形态');
  assert.ok(!out.src.includes(SHELL_DESC_SCHEMA_OLD), '收敛后不得残留 required: true 块');
});

test('tool-compat: shell description 锚点缺失时跳过且不改写', () => {
  const file = path.join('C:', 'x', 'tool.js');
  const out = transformShellDescriptionOptional('export const x = 1;', file);
  assert.deepStrictEqual(out, {
    status: 'anchor-missing',
    detail: '未找到 shell/run_code description 锚点（版本可能已变更），跳过 ' + file,
  });
});

test('tool-compat: attachment 图片字节信任变换（真实 vendored 文件 + 幂等）', () => {
  const file = path.join(repoRoot, 'node_modules', '@deepseek-ai', ATTACH_LOCAL_REL);
  const src0 = fs.readFileSync(file, 'utf8');
  const src = src0.includes(ATTACH_MIME_MARKER) ? src0.replace(ATTACH_MIME_NEW, ATTACH_MIME_OLD) : src0;
  const out = transformAttachmentMimeTrust(src, file);
  assert.strictEqual(out.status, 'changed');
  assert.ok(out.src.includes(ATTACH_MIME_MARKER), '应写入幂等标记');
  assert.ok(!out.src.includes('throw new AttachmentError("Declared image type does not match its bytes."'), '应移除严格比对拒绝');
  assert.ok(out.src.includes('declaredMediaType = detected.mediaType;'), '应以解码字节为准');
  assert.deepStrictEqual(transformAttachmentMimeTrust(out.src, file), { status: 'already' }, '二次应用应幂等');
});

test('tool-compat: attachment 锚点缺失时跳过且不改写', () => {
  const file = path.join('C:', 'x', 'index.js');
  const out = transformAttachmentMimeTrust('export const x = 1;', file);
  assert.deepStrictEqual(out, {
    status: 'anchor-missing',
    detail: '未找到 attachment-local MIME 校验锚点（版本可能已变更），跳过 ' + file,
  });
});

test('runtime-patches: keyed slot 旧 id 兼容变换（合成锚点/幂等/失配不改写）', () => {
  const file = 'C:\\x\\slots.js';
  const fake = 'before\n' + SLOT_KEY_COMPAT_OLD + '\nafter';
  const out = transformLegacySlotKey(fake, file);
  assert.strictEqual(out.status, 'changed');
  assert.ok(out.src.includes(SLOT_KEY_COMPAT_MARKER), '应写入幂等标记');
  assert.ok(out.src.includes('options = { ...options, key: options.id };'), '旧 id 应提升为 key');
  assert.deepStrictEqual(transformLegacySlotKey(out.src, file), { status: 'already' }, '二次应用应幂等');
  assert.deepStrictEqual(transformLegacySlotKey('export const x = 1;', file), {
    status: 'anchor-missing',
    detail: '未找到 keyed slot 兼容锚点（版本可能已变更），跳过 ' + file,
  });
});

test('runtime-patches: keyed slot 无 key 注册兜底变换（合成锚点/幂等/失配不改写）', () => {
  const file = 'C:\\x\\client.js';
  const fake = 'before\n' + SLOT_UNKEYED_COMPAT_OLD + '\nafter';
  const out = transformSlotUnkeyedCompat(fake, file);
  assert.strictEqual(out.status, 'changed');
  assert.ok(out.src.includes(SLOT_UNKEYED_COMPAT_MARKER), '应写入幂等标记');
  assert.ok(out.src.includes('options.id !== void 0 ? options.id'), '显式/旧 id 优先，兼容 id→key');
  assert.ok(out.src.includes('env.pkg.pluginId || env.pkg.packageId'), '既无 key 又无 id 时应派生包级兜底 key');
  assert.ok(out.src.includes('options.key === void 0'), '仅在缺 key 时兜底');
  assert.deepStrictEqual(transformSlotUnkeyedCompat(out.src, file), { status: 'already' }, '二次应用应幂等');
  assert.deepStrictEqual(transformSlotUnkeyedCompat('export const x = 1;', file), {
    status: 'anchor-missing',
    detail: '未找到 keyed slot 无 key 注册兼容锚点（版本可能已变更），跳过 ' + file,
  });
});

test('runtime-patches: keyed slot 兼容补丁产物可被 node --check 解析', (t) => {
  const cases = [
    { rel: SLOT_KEY_COMPAT_PKG_REL, oldText: SLOT_KEY_COMPAT_OLD, newText: SLOT_KEY_COMPAT_NEW, transform: transformLegacySlotKey },
    { rel: SLOT_UNKEYED_COMPAT_PKG_REL, oldText: SLOT_UNKEYED_COMPAT_OLD, newText: SLOT_UNKEYED_COMPAT_NEW, transform: transformSlotUnkeyedCompat },
  ];
  for (const c of cases) {
    const file = path.join(repoRoot, 'node_modules', '@deepseek-ai', c.rel);
    // rc.8 起 dsh-client-ui-slots 并入前端 dist 产物（node_modules 不再落盘），
    // 该文件缺失属正常布局：本用例依赖真实文件做语法回归，缺失时跳过该条
    // （rc.8 布局下此补丁无目标，注册链路由 runner 侧 unkeyed 补丁覆盖）。
    if (!fs.existsSync(file)) { t.skip(c.rel + ' 不存在（dsh rc.8+ 布局）'); continue; }
    const src0 = fs.readFileSync(file, 'utf8');
    const src = src0.includes(c.newText) ? src0.replace(c.newText, c.oldText) : src0;
    const out = c.transform(src, file);
    assert.strictEqual(out.status, 'changed', c.rel + ' 应可补丁');
    const checkFile = path.join(tmpdir(t), path.basename(file));
    fs.writeFileSync(checkFile, out.src);
    const res = spawnSync(process.execPath, ['--check', checkFile], { encoding: 'utf8' });
    assert.strictEqual(res.status, 0, c.rel + ' 补丁产物必须语法合法: ' + (res.stderr || ''));
  }
});

test('runtime-patches: keyed slot 兼容覆盖顶层与 dsh 嵌套依赖副本', () => {
  const home = 'C:\\home';
  const appDir = 'C:\\app';
  const userData = 'C:\\ud';
  const local = slotCompatCopyFiles(home, appDir, userData);
  const wsl = slotCompatPatchTargets(home);
  for (const rel of [SLOT_KEY_COMPAT_PKG_REL, SLOT_UNKEYED_COMPAT_PKG_REL]) {
    assert.ok(local.includes(path.join(userData, 'agent', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', rel)), '本地模式应覆盖 overlay 嵌套副本: ' + rel);
    assert.ok(local.includes(path.join(appDir, 'node_modules', '@deepseek-ai', rel)), '本地模式应覆盖内置副本: ' + rel);
    assert.ok(wsl.includes(path.join(home, 'profiles', 'node_modules', '@deepseek-ai', rel)), 'WSL 模式应覆盖 profile 副本: ' + rel);
    assert.ok(wsl.includes(path.join(home, 'agent', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', rel)), 'WSL 模式应覆盖 agent 嵌套副本: ' + rel);
  }
  assert.strictEqual(new Set(local).size, local.length, '本地候选路径不得重复');
  assert.strictEqual(new Set(wsl).size, wsl.length, 'WSL 候选路径不得重复');
});

// D. companion-plugins 唯一数据源
// ---------------------------------------------------------------------------

test('companion-plugins: 既有前缀顺序与 workspace-anchor 位置唯一（漂移防线）', () => {
  const ids = COMPANION_PLUGINS.map((p) => p.id);
  // 2026-10 内置伴随插件批量退役后，client-file-changes / terminal / harness-pet /
  // dsh-vision / graph-memory / community-market 六条从前 18 位里退出，其余条目整体
  // 前移（workspace-anchor 11→8）；本锁的原意不变——既有相对顺序不得漂移。
  assert.deepStrictEqual(
    ids.slice(0, 18),
    [
      'balance', 'file-changes', 'better-sidebar', 'dsh-session-manager',
      'conversation-tweaks', 'quest-ui', 'dsh-super-injector', 'prompt-custom',
      'workspace-anchor', 'wsl-settings', 'side-session', 'compaction-acp',
      'dsh-pocket', 'openclaw-bridge', 'input-history', 'dsh-easyrewrite',
      'change-review', 'auto-compact',
    ],
    '既有前缀顺序不得漂移（新增/改名须同步更新本测试；dsh-navbar 已随内核换代退役；plugin-manager 于 v1.0.0 退役——包名与官方内核包同名会遮蔽 profiles/web 里的官方 pluginManager）'
  );
  assert.strictEqual(ids.indexOf('workspace-anchor'), 8, 'workspace-anchor 应固定在 prompt-custom 之后');
  assert.strictEqual(ids.filter((id) => id === 'workspace-anchor').length, 1, 'workspace-anchor 不得重复');
  assert.strictEqual(companionDirName({ name: '@deepseek-ai/dsh-balance' }), 'dsh-balance');
  assert.strictEqual(companionDirName({ name: 'dsh-session-manager' }), 'dsh-session-manager');
});

// ---------------------------------------------------------------------------
// E. companion-profile 纯函数
// ---------------------------------------------------------------------------

test('ensureDisabledPatchEntry: 已存在/[] 形态/空文件/追加 四种形态', () => {
  const idRe = (id) => new RegExp('(?:^|\\n)\\s*-?\\s*id\\s*:\\s*' + id + '\\b');
  // 已存在（用户手写 disabled 块）：不动
  const user = '# 用户配置\n- id: compaction-basic\n  disabled: true\n';
  assert.deepStrictEqual(ensureDisabledPatchEntry(user, idRe('compaction-basic'), ACP_DISABLE_BLOCK), { patch: user, changed: false });
  // [] 形态：'[]' 被替换为 trim 后的块，原字符串其余部分（'\n'）保留
  const emptyList = ensureDisabledPatchEntry('[]\n', idRe('compaction-basic'), ACP_DISABLE_BLOCK);
  assert.strictEqual(emptyList.changed, true);
  assert.strictEqual(emptyList.patch,
    '# billion-context-dsh：禁用 preset realm 的 compaction-basic（ACP 模型驱动后端接管压缩决策）\n- id: compaction-basic\n  disabled: true\n');
  // 空文件形态（用 compaction-acp 的默认禁用块——harness-pet 的 PET_DISABLE_BLOCK
  // 已随 2026-10 内置伴随插件批量退役删除，本段验证的是通用追加语义而非某个插件）
  const empty = ensureDisabledPatchEntry('', idRe('compaction-acp'), ACP_SELF_DISABLE_BLOCK);
  assert.strictEqual(empty.changed, true);
  assert.strictEqual(empty.patch, PATCH_HEADER + ACP_SELF_DISABLE_BLOCK.trim());
  // 追加形态
  const base = '# dsh web profile patch（由 DSH Desktop 维护）\n- insert:\n    - id: balance\n';
  const appended = ensureDisabledPatchEntry(base, idRe('compaction-basic'), ACP_DISABLE_BLOCK);
  assert.strictEqual(appended.changed, true);
  assert.strictEqual(appended.patch, base.replace(/\s*$/, '\n') + ACP_DISABLE_BLOCK);
});


test('removeAcpBasicDisableBlock: 精确撤销自动块、尊重用户手写、幂等', () => {
  const idRe = (id) => new RegExp('(?:^|\\n)\\s*-?\\s*id\\s*:\\s*' + id + '\\b');
  const base = '# dsh web profile patch（由 DSH Desktop 维护）\n- id: balance\n  disabled: true\n';
  // 旧路径追加一段自动 compaction-basic 禁用块，再用 heal 撤销 → 保留无关条目。
  const auto = ensureDisabledPatchEntry(base, idRe('compaction-basic'), ACP_DISABLE_BLOCK);
  assert.strictEqual(auto.changed, true);
  assert.ok(auto.patch.includes('- id: compaction-basic\n  disabled: true'));
  const healed = removeAcpBasicDisableBlock(auto.patch);
  assert.strictEqual(healed.changed, true);
  assert.ok(!healed.patch.includes('- id: compaction-basic'), 'compaction-basic 禁用块应被撤销');
  assert.ok(healed.patch.includes('- id: balance\n  disabled: true'), '无关条目不得被误删');
  // 幂等：块已不在位 → 零改写。
  const again = removeAcpBasicDisableBlock(healed.patch);
  assert.strictEqual(again.changed, false);
  assert.strictEqual(again.patch, healed.patch);
  // 用户手写的 compaction-basic 条目（非本模块注释格式）不得被删除。
  const user = '# 用户配置\n- id: compaction-basic\n  disabled: true\n';
  const untouched = removeAcpBasicDisableBlock(user);
  assert.strictEqual(untouched.changed, false);
  assert.strictEqual(untouched.patch, user);
});
test('removeLegacyMarketplacePatchLines: 移除旧市场 insert 条目且幂等', () => {
  const patch = '# dsh web profile patch（由 DSH Desktop 维护）\n- insert:\n    - id: plugin-marketplace\n      name: \'@deepseek-ai/dsh-plugin-marketplace\'\n- insert:\n    - id: balance\n      name: \'@deepseek-ai/dsh-balance\'\n';
  const r1 = removeLegacyMarketplacePatchLines(patch);
  assert.strictEqual(r1.changed, true);
  assert.ok(!r1.patch.includes('dsh-plugin-marketplace'), '旧市场条目应被移除');
  assert.ok(r1.patch.includes('dsh-balance'), '其它条目原样保留');
  assert.deepStrictEqual(removeLegacyMarketplacePatchLines(r1.patch), { patch: r1.patch, changed: false }, '幂等');
});

test('registerCompanionPatchEntries: 空文件注册/幂等/改名/尊重用户禁用/迁移去重', () => {
  const nonBundleNames = new Set(['@deepseek-ai/dsh-balance', '@deepseek-ai/dsh-quest-ui']);
  const plugins = [
    { id: 'balance', name: '@deepseek-ai/dsh-balance' },
    { id: 'quest-ui', name: '@deepseek-ai/dsh-quest-ui' },
    { id: 'sidebar', name: 'dsh-better-sidebar' },
  ];
  const bundleNames = new Set(); // 先全部按非 bundle 注册
  const missingNames = new Set();
  // 空文件 → header + insert
  const r1 = registerCompanionPatchEntries('', { plugins, bundleNames, missingNames });
  assert.strictEqual(r1.changed, true);
  assert.deepStrictEqual(r1.added, ['balance', 'quest-ui', 'sidebar']);
  assert.strictEqual(r1.patch, PATCH_HEADER
    + '- insert:\n    - id: balance\n      name: \'@deepseek-ai/dsh-balance\'\n'
    + '- insert:\n    - id: quest-ui\n      name: \'@deepseek-ai/dsh-quest-ui\'\n'
    + '- insert:\n    - id: sidebar\n      name: \'dsh-better-sidebar\'\n');
  // 幂等：二次零变化
  const r2 = registerCompanionPatchEntries(r1.patch, { plugins, bundleNames, missingNames });
  assert.strictEqual(r2.changed, false);
  assert.strictEqual(r2.patch, r1.patch);
  // 改名：quest-ui 的 name 改成旧包名 → 就地改回
  const renamed = r1.patch.replace('@deepseek-ai/dsh-quest-ui', '@deepseek-ai/dsh-quest');
  const r3 = registerCompanionPatchEntries(renamed, { plugins, bundleNames, missingNames });
  assert.strictEqual(r3.changed, true);
  assert.deepStrictEqual(r3.updated, ['quest-ui']);
  assert.ok(r3.patch.includes('@deepseek-ai/dsh-quest-ui'));
  // 尊重用户禁用：balance 有 disabled 条目 → 不再 insert（已在第一次注册后存在 insert……
  // 这里用全新文本验证「id 已出现则跳过」）
  const userDisabled = '# 用户配置\n- id: balance\n  disabled: true\n';
  const r4 = registerCompanionPatchEntries(userDisabled, { plugins, bundleNames, missingNames });
  assert.ok(r4.patch.includes('disabled: true'), '用户禁用条目原样保留');
  assert.strictEqual((r4.patch.match(/id: balance/g) || []).length, 1, '已存在 id 不得重复 insert');
  // bundle 迁移：sidebar 升级为 bundle → 其 insert 块被移除，用户覆盖保留
  const r5 = registerCompanionPatchEntries(r1.patch, {
    plugins, bundleNames: new Set(['dsh-better-sidebar']), missingNames,
  });
  assert.strictEqual(r5.changed, true);
  assert.deepStrictEqual(r5.dropped, ['sidebar']);
  assert.ok(!r5.patch.includes('dsh-better-sidebar'), 'bundle 化插件的 insert 应被移除');
  // 源缺失：不注册 + 残留移除
  const r6 = registerCompanionPatchEntries(r1.patch, {
    plugins, bundleNames: new Set(), missingNames: new Set(['@deepseek-ai/dsh-balance']),
  });
  assert.deepStrictEqual(r6.dropped, ['balance']);
  assert.ok(!r6.patch.includes('@deepseek-ai/dsh-balance'), '源缺失插件的注册应被移除');
});

test('registerCompanionPatchEntries: 清单 id 与 patch/bundle 层 loader id 一致（issue #104）', () => {
  // 回归：dsh-super-injector 的清单 id 曾声明为 super-injector，而 patch 残留
  // insert 块与 bundle 层（@dsh-external/dsh-super-injector/cordis.patch.yml）
  // 的 loader id 均为 dsh-super-injector。bundle 迁移自愈按清单 id 调
  // dropBlocksByIds，id 错位导致残留块永不命中 → 同名包 bundle+patch 双登记
  // → cordis loader "duplicate loader entry id" 启动崩溃循环（0.3.10）。
  const injector = COMPANION_PLUGINS.find((p) => p.name === '@dsh-external/dsh-super-injector');
  assert.strictEqual(injector.id, 'dsh-super-injector',
    '清单 id 必须与 patch/bundle 层实际 loader id 一致，否则自愈永不命中');
  // 现场残留形态（profiles/web/cordis.patch.yml 旧版 insert 块，见 issue #104 证据）
  const legacyPatch = '# dsh web profile patch（由 DSH Desktop 维护）\n'
    + "- insert:\n    - id: dsh-super-injector\n      name: '@dsh-external/dsh-super-injector'\n      config: {}\n";
  const r = registerCompanionPatchEntries(legacyPatch, {
    plugins: [injector],
    bundleNames: new Set(['@dsh-external/dsh-super-injector']),
    missingNames: new Set(),
  });
  assert.deepStrictEqual(r.dropped, ['dsh-super-injector'],
    'bundle 迁移自愈应命中残留 insert 块（修复前因 id 错位永远 dropped 为空）');
  assert.ok(!r.patch.includes('@dsh-external/dsh-super-injector'),
    '残留注册应被移除，避免双登记');
  assert.ok(r.changed, '应产生变更');
});

test('removedPluginIdsFromPatch: 卸载标记提取（正常/损坏 YAML/insert 块不误伤）', () => {
  // 插件管理写入的标记形态：顶层条目带 removed: true
  const patch = '# header\n- insert:\n    - id: balance\n      name: \'@deepseek-ai/dsh-balance\'\n- id: quest-ui\n  name: \'@deepseek-ai/dsh-quest-ui\'\n  disabled: true\n  removed: true\n- id: side-session\n  config:\n    keep: 1\n  removed: true\n';
  assert.deepStrictEqual([...removedPluginIdsFromPatch(patch)].sort(), ['quest-ui', 'side-session']);
  // insert 块内层条目（缩进 >= 4）即使带 removed 字样也不参与
  const inner = '- insert:\n    - id: x\n      removed: true\n';
  assert.deepStrictEqual([...removedPluginIdsFromPatch(inner)], []);
  // 无标记 / 空文本
  assert.deepStrictEqual([...removedPluginIdsFromPatch('- id: a\n  disabled: true\n')], []);
  assert.deepStrictEqual([...removedPluginIdsFromPatch('')], []);
  // YAML 损坏：按标记形状仍能识别（比旧实现经 js-yaml 解析失败丢全部标记更稳健）
  const corrupt = '- id: broken: [unclosed\n  removed: true\n';
  assert.deepStrictEqual([...removedPluginIdsFromPatch(corrupt)], ['broken']);
});

test('registerCompanionPatchEntries: 卸载标记显式跳过注册', () => {
  const plugins = [
    { id: 'balance', name: '@deepseek-ai/dsh-balance' },
    { id: 'side-session', name: '@dsh-external/dsh-side-session' },
  ];
  const bundleNames = new Set();
  const missingNames = new Set();
  // 不传 removedIds：两者都注册（既有行为）
  const r1 = registerCompanionPatchEntries('', { plugins, bundleNames, missingNames });
  assert.deepStrictEqual(r1.added, ['balance', 'side-session']);
  // removedIds 含 balance：只注册 side-session，且不产生 balance 的任何行
  const r2 = registerCompanionPatchEntries('', { plugins, bundleNames, missingNames, removedIds: new Set(['balance']) });
  assert.deepStrictEqual(r2.added, ['side-session']);
  assert.ok(!r2.patch.includes('balance'), '已卸载插件不得写入任何注册');
  // 已存在的 removed 标记条目：不重复 insert、不改写（与未传 removedIds 的旧侥幸路径一致）
  const withMarker = '# user\n- id: balance\n  disabled: true\n  removed: true\n';
  const r3 = registerCompanionPatchEntries(withMarker, { plugins, bundleNames, missingNames, removedIds: new Set(['balance']) });
  assert.strictEqual((r3.patch.match(/id: balance/g) || []).length, 1, '标记条目保留且不重复');
  assert.ok(r3.patch.includes('removed: true'));
});

test('companion-profile: 真实 assets 全量同步到隔离 profile（幂等零写入 + dry-run 零落盘）', (t) => {
  const dir = tmpdir(t);
  const profileDir = path.join(dir, 'profiles', 'web');
  const assetsRoot = path.join(repoRoot, 'assets', 'plugins');
  const vendorRoot = path.join(repoRoot, 'node_modules');
  const opts = { assetsRoot, profileDir, vendorRoot };
  // 第一次：真实同步
  const r1 = syncCompanionFiles(opts);
  const nm = path.join(profileDir, 'node_modules');
  for (const p of COMPANION_PLUGINS) {
    assert.ok(fs.existsSync(path.join(nm, p.name, 'package.json')), '包应落盘: ' + p.name);
  }
  // bundle 判定与 assets 源的可装配性一致（verify 相关文件会原样复制，因此对
  // 源目录直接校验等价于对落盘副本校验）：任何「声明了 bundle 但源校验失败」的包
  // 都必须按「源缺失」处理、不注册。
  //
  // 这里曾把包名写死成 billion-context-dsh（「上游缺 dist 构建产物」），后果是判据与
  // 被测对象脱钩：真正失败的包换成 dsh-prompt-optimizer（package.json 声明
  // ./dist/client.js 而实际只带 lib/index.js）时，`has('billion-context-dsh')` 照旧为
  // false，测试全绿却什么都没守住。2026-10-05 实测记录。
  const declaredBundles = COMPANION_PLUGINS.filter((p) => {
    const pkg = JSON.parse(fs.readFileSync(path.join(assetsRoot, companionDirName(p), 'package.json'), 'utf8'));
    return bundlePatchRel(pkg) !== '';
  }).map((p) => p.name);
  const expectedBundles = declaredBundles.filter((name) => {
    const rel = companionDirName(COMPANION_PLUGINS.find((p) => p.name === name));
    return verifyBundleDir(path.join(assetsRoot, rel)).ok;
  });
  const expectedMissing = declaredBundles.filter((name) => !expectedBundles.includes(name));
  assert.deepStrictEqual([...r1.bundleNames].sort(), expectedBundles.sort(), 'bundleNames 应与源可装配性一致');
  assert.deepStrictEqual([...r1.missingNames].sort(), expectedMissing.sort(), '校验失败的 bundle 应计入缺失源');
  for (const name of expectedMissing) {
    assert.ok(!r1.bundleNames.has(name), `源校验失败却仍被注册：${name}`);
  }
  // 记录全树 (path, size, mtimeMs)
  const snapshot = () => {
    const map = new Map();
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) walk(full);
        else {
          const st = fs.statSync(full);
          map.set(full, st.size + ':' + st.mtimeMs);
        }
      }
    };
    walk(nm);
    return map;
  };
  const before = snapshot();
  // 第二次：零写入（size+mtime 全部不变）
  const r2 = syncCompanionFiles(opts);
  assert.deepStrictEqual([...r2.bundleNames].sort(), expectedBundles.sort());
  assert.deepStrictEqual([...r2.missingNames].sort(), expectedMissing.sort());
  assert.deepStrictEqual(snapshot(), before, '二次同步必须零写入（size+mtime 逐文件一致）');
  // dry-run：目标目录完全不落盘
  const dryDir = path.join(dir, 'dry');
  const dryProfile = path.join(dryDir, 'profiles', 'web');
  syncCompanionFiles({ ...opts, profileDir: dryProfile, dryRun: true, plan: () => {} });
  assert.ok(!fs.existsSync(dryDir), 'dry-run 不得创建任何目录');
  // 内容抽查：bundle 插件的补丁层已就位
  const sidebar = path.join(nm, 'dsh-better-sidebar', 'cordis.patch.yml');
  assert.ok(fs.existsSync(sidebar), 'bundle 补丁层应落盘');
  assert.ok(sha256(path.join(nm, 'dsh-better-sidebar', 'package.json')) === sha256(path.join(assetsRoot, 'dsh-better-sidebar', 'package.json')), '同步内容与源一致');
});
