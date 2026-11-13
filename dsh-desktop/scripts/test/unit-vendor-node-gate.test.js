#!/usr/bin/env node
// unit-vendor-node-gate.test.js —— 交付面门禁④「payload 必须带内置 node 运行时」的回归锁。
//
// 事故（2026-11-13 取证，v1.0.0 ~ v1.0.10 长期缺口）：
//   五处 staging 都用 `cp -r dsh-desktop/vendor/node "$DEST/vendor/node"`；`cp -r` 对
//   **空源目录**会成功复制出一个空目录，于是「Download vendor node」只要没真落盘，
//   payload 就没有内置 node，而全链无一处报错：
//     · stage-plugin-gate 只管插件；nsis-gate 只管路径长度；
//     · 便携版的 N1 门禁当时是 `::warning::`（不是 exit 1），每次发版只留一行黄字。
//   产物侧铁证：v1.0.10 两个便携 zip 体积逐字节相同（598,615,580B），中央目录 118,556
//   条里 `vendor/node/` 存在但 `node.exe` 0 条命中 —— lite 的「不带内置 node」是空转。
//   用户侧后果：supervisor 的解析三级链（内置 → 系统 ≥22 → 清晰报错）掉到第三级，
//   没装 Node.js 的用户直接撞「未找到可用的 Node.js」。
//
// 本套件锁三件事：
//   ① 判定函数本身（缺件 / 截断 / 缺 +x 各判红，正件判绿）；
//   ② 五处 staging 的接线（3 处 node.exe + 2 处 node，一处都不能少）；
//   ③ 便携版两道「结果面」判据（full 缺 node 即拒绝打包；lite 必须真的比 full 小）。
// 反证用例走「拆掉一处必须变红」，防判据空转。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..', '..');
const GATE = path.join(REPO, 'dsh-tauri', 'scripts', 'stage-vendor-node-gate.mjs');
const RELEASE = path.join(REPO, '.github', 'workflows', 'tauri-release.yml');

const MB = 1024 * 1024;

/** 造一个假 stat：size + 可执行位可控。 */
function fakeStat(sizeBytes, { executable = true } = {}) {
  return () => ({
    isFile: () => true,
    size: sizeBytes,
    mode: executable ? 0o100755 : 0o100644,
  });
}

async function loadGate() {
  return import(require('node:url').pathToFileURL(GATE).href);
}

test('判定函数：win 二进制在位且体积正常 → 通过', async () => {
  const { inspectVendorNode, MIN_VENDOR_NODE_BYTES } = await loadGate();
  const r = inspectVendorNode('pp', { bin: 'node.exe', stat: fakeStat(91694408) });
  assert.equal(r.ok, true, r.problems.join(';'));
  assert.equal(r.size, 91694408);
  assert.ok(r.file.endsWith(path.join('pp', 'vendor', 'node', 'node.exe')));
  assert.ok(MIN_VENDOR_NODE_BYTES >= 10 * MB, '下限不能低于 10MB，否则挡不住占位文件');
});

test('判定函数：缺件 → 判红并点名路径（空目录 cp 的坏形）', async () => {
  const { inspectVendorNode } = await loadGate();
  const r = inspectVendorNode('pp', { bin: 'node.exe', stat: () => null });
  assert.equal(r.ok, false);
  assert.match(r.problems.join(';'), /缺件/);
  assert.match(r.problems.join(';'), /vendor[/\\]node[/\\]node\.exe/);
});

test('判定函数：体积低于下限 → 判红（截断下载 / 占位文件）', async () => {
  const { inspectVendorNode } = await loadGate();
  const r = inspectVendorNode('pp', { bin: 'node.exe', stat: fakeStat(1024) });
  assert.equal(r.ok, false);
  assert.match(r.problems.join(';'), /体积异常/);
});

test('判定函数：unix 二进制缺可执行位 → 判红（文件在但跑不起来）', async () => {
  const { inspectVendorNode } = await loadGate();
  const r = inspectVendorNode('pp', { bin: 'node', stat: fakeStat(115 * MB, { executable: false }) });
  assert.equal(r.ok, false);
  assert.match(r.problems.join(';'), /缺可执行位/);
});

test('判定函数：unix 二进制带 +x → 通过；win 不查 +x', async () => {
  const { inspectVendorNode } = await loadGate();
  assert.equal(inspectVendorNode('pp', { bin: 'node', stat: fakeStat(115 * MB) }).ok, true);
  assert.equal(
    inspectVendorNode('pp', { bin: 'node.exe', stat: fakeStat(92 * MB, { executable: false }) }).ok,
    true,
    'Windows 二进制不该被 unix 可执行位判红',
  );
});

test('判定函数：不是普通文件（目录/链接落点）→ 判红', async () => {
  const { inspectVendorNode } = await loadGate();
  const r = inspectVendorNode('pp', {
    bin: 'node.exe',
    stat: () => ({ isFile: () => false, size: 0, mode: 0o040755 }),
  });
  assert.equal(r.ok, false);
  assert.match(r.problems.join(';'), /不是普通文件/);
});

// ---------------------------------------------------------------------------
// 接线：五处 staging 必须各调一次门禁，win 三处 node.exe、unix 两处 node。
// 判据只看「调用行 + 二进制名」，因为这是唯一能静态咬住的契约（跑一次 staging
// 要 ~8 分钟且写 pp 镜像，不适合进单测）。
// ---------------------------------------------------------------------------

const GATE_CALL = /node dsh-tauri\/scripts\/stage-vendor-node-gate\.mjs "\$DEST" (node\.exe|node)/g;
const YAML = fs.readFileSync(RELEASE, 'utf8');

/** 抽出全部门禁调用行（用于接线与反证）。 */
function gateCalls(src) {
  return [...src.matchAll(GATE_CALL)].map((m) => m[1]);
}

test('接线：五处 staging 都调用了内置 node 门禁（3 win + 2 unix）', () => {
  const calls = gateCalls(YAML);
  assert.equal(calls.filter((b) => b === 'node.exe').length, 3, 'Windows 三处（x64 / arm64 / portable）应各一处');
  assert.equal(calls.filter((b) => b === 'node').length, 2, 'Linux / macOS 两处应各一处');
});

test('接线：内置 node 一律「按文件」显式拷贝，不再 cp -r 整目录', () => {
  const fileCopies = [...YAML.matchAll(/cp -f "dsh-desktop\/vendor\/node\/(node\.exe|node)" "\$DEST\/vendor\/node\/\1"/g)]
    .map((m) => m[1]);
  assert.equal(fileCopies.filter((b) => b === 'node.exe').length, 3, 'win 三处应显式拷 node.exe');
  assert.equal(fileCopies.filter((b) => b === 'node').length, 2, 'unix 两处应显式拷 node');
  assert.ok(
    !/cp -r dsh-desktop\/vendor\/node /.test(YAML) && !/cp -r dsh-desktop\/vendor\/node\n/.test(YAML),
    '目录级 cp -r 的空源目录会静默产出空目录，这条形态不许复活',
  );
});

test('接线：便携版组装后显式补位 node.exe（不依赖 robocopy 是否带走）', () => {
  assert.match(
    YAML,
    /cp -f "dsh-tauri\/pp\/vendor\/node\/node\.exe" "\$ROOT\/resources\/dsh-desktop\/vendor\/node\/node\.exe"/,
    '缺组装期显式补位',
  );
  assert.doesNotMatch(
    YAML,
    /cp -f "dsh-tauri\/pp\/vendor\/node\/node\.exe"[\s\S]{0,80}\|\| true/,
    '补位不许用 `|| true` 吞掉失败（那样又回到静默）',
  );
});

test('反证：拆掉任意一处接线，判据必须变红', () => {
  const one = YAML.replace(/^\s*node dsh-tauri\/scripts\/stage-vendor-node-gate\.mjs "\$DEST" node\.exe\r?\n/m, '');
  assert.notEqual(one, YAML, '反证夹具无效：未拆掉任何调用');
  assert.equal(gateCalls(one).length, gateCalls(YAML).length - 1, '拆一处后调用数必须减一');
  assert.ok(gateCalls(one).length < 5, '拆一处后不得仍判「五处齐备」');
});

/** N1 的缺件分支是否真的拒绝打包（判据：分支内有 exit 1，而不是只换了文案）。 */
function n1IsFailClosed(src) {
  const i = src.indexOf('::error::便携版缺内置 node.exe');
  if (i < 0) return false;
  const rest = src.slice(i);
  const fi = /\n\s*fi\b/.exec(rest);
  const branch = fi ? rest.slice(0, fi.index) : rest.slice(0, 600);
  return /\bexit 1\b/.test(branch);
}

test('便携版 N1 门禁已 fail-closed（不再是 ::warning::）', () => {
  assert.match(YAML, /内置 node\.exe 在位/, 'N1 正向判据不见了');
  assert.match(YAML, /::error::便携版缺内置 node\.exe/, '缺件分支必须是 ::error::');
  assert.doesNotMatch(YAML, /::warning::便携版缺内置 node\.exe/, '告警口径已被事故证明无效（吞了一整年），不许回退');
  assert.equal(n1IsFailClosed(YAML), true, '缺件分支必须真的 exit 1（只改文案不改控制流就是假 fail-closed）');
});

test('便携 lite：摘不到 node.exe 即拒绝打包（防 full/lite 退化成同一份）', () => {
  assert.match(YAML, /lite 变体找不到 vendor\/node\/node\.exe/, '缺 fail-closed 判据');
  assert.match(YAML, /lite 变体已摘除内置 node\.exe/, '摘除成功应有可见回执');
  assert.doesNotMatch(
    YAML,
    /if \(Test-Path \$nodeExe\) \{ Remove-Item \$nodeExe -Force \}/,
    '旧的「有就删、没有也算过」形态必须消失',
  );
});

test('便携 full/lite 结果面：必须真有体积差（<10MB 即判红）', () => {
  assert.match(YAML, /便携版 full\/lite 必须真有差别/, '缺结果面门禁步骤');
  assert.match(YAML, /full 与 lite 便携包体积逐字节相同/, '必须拦「逐字节相同」');
  assert.match(YAML, /10485760/, '必须有 10MB 级差异阈值');
});

test('反证：把 N1 改回 ::warning:: 并摘掉 exit 1，判据变红', () => {
  const anchor = YAML.indexOf('::error::便携版缺内置 node.exe');
  assert.ok(anchor > 0, '反证夹具无效：找不到 N1 缺件分支');
  const head = YAML.slice(0, anchor);
  const rest = YAML.slice(anchor)
    .replace('::error::便携版缺内置 node.exe', '::warning::便携版缺内置 node.exe')
    .replace(/\n(\s*)exit 1\r?\n/, '\n');
  const mutated = head + rest;
  assert.notEqual(mutated, YAML, '反证夹具无效：变异未改变源码');
  assert.doesNotMatch(mutated, /::error::便携版缺内置 node\.exe/, '变异应把 ::error:: 降级为 ::warning::');
  assert.equal(n1IsFailClosed(mutated), false, '降级为告警后判据必须判红');
});

// ---------------------------------------------------------------------------
// unix 分支读体积的可移植性（2026-11-13 v1.1.0 发版实错）
// `stat -c%s` 是 GNU 专有；macOS runner 的 BSD stat 没有 -c，直接
// `stat: illegal option -- c` + exit 1，macOS dmg 整条 job 在「Download vendor node」
// 就挂了——而这个判据本意只是「量一下下载到没到盘」。Linux/macOS 共用同一段脚本，
// 所以两处都必须用 `wc -c`（BSD 与 GNU 都认）。
// ---------------------------------------------------------------------------
const PORTABLE_SIZE_READ = /nf=\$\(wc -c < dsh-desktop\/vendor\/node\/node \| tr -d ' '\)/g;
const GNU_ONLY_SIZE_READ = /nf=\$\(stat -c%s dsh-desktop\/vendor\/node\/node\)/;

function portableSizeReads(src) {
  return (src.match(PORTABLE_SIZE_READ) ?? []).length;
}

test('unix 分支读 vendor node 体积必须全平台可移植（两处都用 wc -c，禁用 GNU 专有 stat -c）', () => {
  assert.equal(portableSizeReads(YAML), 2, 'Linux 与 macOS 两处都必须用 wc -c 读体积');
  assert.doesNotMatch(YAML, GNU_ONLY_SIZE_READ, 'stat -c%s 是 GNU 专有——macOS runner 会直接 exit 1');
  assert.match(YAML, /BSD stat（macOS）无 -c/, '必须留一句「为什么不用 stat -c」的注释，否则下次又会写回去');
});

test('反证：把任一处改回 stat -c%s，可移植判据必须变红', () => {
  const mutated = YAML.replace(
    /nf=\$\(wc -c < dsh-desktop\/vendor\/node\/node \| tr -d ' '\)/,
    'nf=$(stat -c%s dsh-desktop/vendor/node/node)',
  );
  assert.notEqual(mutated, YAML, '反证夹具无效：变异未改变源码');
  assert.equal(portableSizeReads(mutated), 1, '变异后应只剩 1 处可移植读法 → 判据红');
  assert.match(mutated, GNU_ONLY_SIZE_READ, '变异应引入 GNU 专有读法');
});
