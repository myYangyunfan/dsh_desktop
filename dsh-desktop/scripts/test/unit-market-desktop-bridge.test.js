'use strict';

// dsh-market-desktop-bridge（市场桌面服务桥）单测：
//   A. patch 手术：parsePatchRows / disableInPatch / enableInPatch 对真实形态
//      的 cordis.patch.yml（insert 块 + 顶层禁用块 + preset 禁用行）解析与
//      幂等往返（与壳层 patch-surgery.togglePluginInPatch 同文件格式语义）；
//   B. 包元数据：hub 登记（inspectCompanionMeta 同源规则）——name/version
//      精确 semver/description/private，配套清单 id 与 cordis.patch.yml 一致；
//   C. 与壳层 patch-surgery 的双向兼容：本桥写入的禁用块可被壳层
//      togglePluginInPatch(enable) 消费，反之亦然。
// 用法：node --test scripts/test/unit-market-desktop-bridge.test.js

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');
// 解析沙箱覆盖（与 unit-community-market.test.js 同约定）。
const pluginsRoot = process.env.DSH_MARKET_TEST_PLUGINS
  ? path.resolve(process.env.DSH_MARKET_TEST_PLUGINS)
  : path.join(repoRoot, 'assets', 'plugins');
const bridgeDir = path.join(pluginsRoot, 'dsh-market-desktop-bridge');
const { togglePluginInPatch } = require('../plugin-manager-patch');
const { COMPANION_PLUGINS } = require('../lib/companion-plugins');

// ESM 插件经动态 import 加载（与 loader 同路径形态）。
let internals;
test.before(async () => {
  const mod = await import(`file://${JSON.stringify(path.join(bridgeDir, 'lib', 'index.js')).slice(1, -1)}`);
  assert.equal(mod.name, 'market-desktop-bridge');
  assert.deepEqual(mod.inject, []);
  assert.equal(typeof mod.apply, 'function');
  internals = mod.__internals;
  assert.ok(internals, '__internals 可测面必须存在');
});

const SAMPLE_PATCH = [
  '# dsh web profile patch（由 DSH Desktop 维护）',
  '- id: compaction-basic',
  '  disabled: true',
  '',
  '- id: harness-pet',
  '  disabled: true',
  '- insert:',
  "    - id: file-changes",
  "      name: '@deepseek-ai/dsh-file-changes'",
  '- insert:',
  "    - id: community-market",
  "      name: 'dsh-community-market'",
  '      requires:',
  "        - webServer",
  '- insert:',
  "    - id: dsh-hub",
  "      name: 'dsh-hub'",
  '',
].join('\n');

test('A1 parsePatchRows: insert 内层 / 顶层块 / disabled 标记全解析', () => {
  const rows = internals.parsePatchRows(SAMPLE_PATCH);
  assert.deepStrictEqual(
    rows.map((r) => r.id),
    ['compaction-basic', 'harness-pet', 'file-changes', 'community-market', 'dsh-hub'],
  );
  assert.strictEqual(rows.find((r) => r.id === 'file-changes').name, '@deepseek-ai/dsh-file-changes');
  assert.strictEqual(rows.find((r) => r.id === 'harness-pet').disabled, true);
  assert.strictEqual(rows.find((r) => r.id === 'community-market').disabled, false);
});

test('A2 disable→enable 幂等往返：insert 条目迁出为顶层禁用块再恢复', () => {
  const disabled = internals.disableInPatch(SAMPLE_PATCH, 'dsh-hub', 'dsh-hub');
  assert.ok(disabled.includes('- id: dsh-hub'), '顶层禁用块已写入');
  assert.ok(/disabled:\s*true/.test(disabled), 'disabled: true 已写入');
  // 内层条目 = 缩进的 `- id:` 行（顶层禁用块的 id 行不缩进）
  assert.ok(!/\n[ \t]+-[ \t]*id:[ \t]*dsh-hub\b/.test(disabled), 'insert 内层条目已移出');

  // 幂等：再次 disable 不再变化
  assert.strictEqual(internals.disableInPatch(disabled, 'dsh-hub', 'dsh-hub'), disabled);

  const enabled = internals.enableInPatch(disabled, 'dsh-hub');
  assert.ok(!/- id: dsh-hub[\s\S]*?disabled:\s*true/.test(enabled), '禁用行已移除');
  assert.ok(enabled.includes("- id: dsh-hub"), '带 name 的块保留为激活登记');
  assert.ok(!enabled.includes('关闭 dsh-hub'), '标记注释已清');
  // 幂等
  assert.strictEqual(internals.enableInPatch(enabled, 'dsh-hub'), enabled);
});

test('A3 enable 对无 name/config 的裸块：整块移除（对齐壳层 patch-surgery）', () => {
  const bare = '# header\n- id: lone-plugin\n  disabled: true\n';
  const out = internals.enableInPatch(bare, 'lone-plugin');
  assert.ok(!out.includes('lone-plugin'), '裸块整块移除');
});

test('A4 CRLF 保真', () => {
  const crlf = SAMPLE_PATCH.replace(/\n/g, '\r\n');
  const disabled = internals.disableInPatch(crlf, 'file-changes', '@deepseek-ai/dsh-file-changes');
  assert.ok(disabled.includes('\r\n'), 'CRLF 保持');
  assert.ok(!/(?<!\r)\n/.test(disabled), '不产生混合换行');
});

test('A5 buildPluginArgv 携带必需的 --profile（issue #164）', () => {
  const entry = { file: 'node.exe', args: ['--use-system-ca', 'C:/dsh/lib/bin.js'], cwd: 'C:/dsh/lib', viaShell: false };
  assert.deepStrictEqual(
    internals.buildPluginArgv(entry, ['add', 'x@1.0.0', '--save-exact'], 'web'),
    ['--use-system-ca', 'C:/dsh/lib/bin.js', 'plugin', '--profile', 'web', 'add', 'x@1.0.0', '--save-exact'],
  );
  // 缺 profile 时也不崩（仅不插入 --profile，交由内核 CLI 报必需项缺失）
  assert.deepStrictEqual(
    internals.buildPluginArgv(entry, ['remove', 'x'], undefined),
    ['--use-system-ca', 'C:/dsh/lib/bin.js', 'plugin', 'remove', 'x'],
  );
});

test('A6 createTailBuffer 保留尾部且有界（issue #170：带出包管理器根因）', () => {
  const b = internals.createTailBuffer(8);
  assert.strictEqual(b.take(), '', '空缓冲不抛');
  b.push('aaaaaaaa');
  b.push('bbbbbbbb');
  b.push('cccccccc');
  const tail = b.take();
  assert.strictEqual(tail.length, 8, '上限严格：不随输出无界增长');
  assert.strictEqual(tail, 'cccccccc', '只留最后 N 字符');
});

test('A7 createTailBuffer 多字节块边界不产生乱码', () => {
  const text = 'fetch failed: 注册表 404';
  const full = Buffer.from(text, 'utf8');
  const cut = full.indexOf(Buffer.from('注', 'utf8')) + 1; // 切在三字节序列中间
  assert.ok(cut > 0 && cut < full.length, '切点有效');
  const b = internals.createTailBuffer(4096);
  b.push(full.subarray(0, cut));
  b.push(full.subarray(cut));
  assert.strictEqual(b.take(), text, '拼接后原文无损');
});

test('A8 runDshPlugin 把子进程退码与 stderr 尾部随 outcome 回传（#170）', async (t) => {
  // 闭环验证：把“重入的 dsh CLI”换成已知退码+已知 stderr 的假 bin，确认两者
  // 能穿过 spawn → 尾部缓冲 → done 结算（真机里 stderr 就是 [ERR_PNPM_FETCH_404]
  // 那几行，此前整块被丢弃）。
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-bridge-cli-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const saved = process.argv[1];
  try {
    for (const code of [0, 3]) {
      const fake = path.join(dir, `bin.js`);
      fs.writeFileSync(fake,
        `process.stdout.write('install ok\\n'); process.stderr.write('boom 404 not in registry\\n'); process.exit(${code});\n`,
        'utf8');
      process.argv[1] = fake; // dshArgv() 认 `…/bin.js` 形态 → node 直跑（无 shell）
      const handle = internals.runDshPlugin(['add', 'x@1.0.0', '--save-exact'], dir, undefined, 'web');
      handle.stdout.resume();
      handle.stderr.resume();
      const outcome = await handle.done;
      assert.strictEqual(outcome.exitCode, code, `退出码原样透传（实际 ${JSON.stringify(outcome.exitCode)}）`);
      assert.strictEqual(outcome.signal, null);
      assert.ok(outcome.stderrTail.includes('boom 404'), 'stderr 根因行进入结算体');
      assert.ok(outcome.stdoutTail.includes('install ok'), 'stdout 也留尾部（pnpm 把错误报告写在 stdout）');
      assert.strictEqual(outcome.spawnError, '', 'spawn 正常时不假报');
    }
  } finally {
    process.argv[1] = saved;
  }
});

test('A8b 成功安装不得被误判为失败（#170 真因：Windows 流 close 早于 exit）', async (t) => {
  // Windows + node 24 实测：子进程两路 stdio 的 'close' 先于 'exit' 到达。旧结算
  // 只数流关闭 → done 拿到 exitCode:null → 市场 `outcome.exitCode !== 0` 判败，
  // 把 exit 0 的成功安装报成“did not complete successfully”并回滚。
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-bridge-ok-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const fake = path.join(dir, 'bin.js');
  fs.writeFileSync(fake, "process.stdout.write('Done in 1s\\n'); process.stderr.write('progress\\n');\n", 'utf8');
  const saved = process.argv[1];
  process.argv[1] = fake;
  try {
    const handle = internals.runDshPlugin(['add', 'x@1.0.0'], dir, undefined, 'web');
    const outcome = await handle.done; // 必须结算，不得挂起
    assert.notEqual(outcome.exitCode, null, 'exitCode 不得为 null（null 会被市场误判为失败）');
    assert.strictEqual(outcome.exitCode, 0);
    assert.strictEqual(outcome.exitCode !== 0 || outcome.signal !== null, false, '市场侧失败判定为假');
  } finally {
    process.argv[1] = saved;
  }
});

test('A9 子进程起不来时 spawnError 带出原因（而非静默 exitCode -1）', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-bridge-bad-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const saved = process.argv[1];
  // 指向不存在的目录下的 bin.js：cwd 无效 → spawn error（ENOENT）。
  process.argv[1] = path.join(dir, 'nope', 'bin.js');
  try {
    const outcome = await internals.runDshPlugin(['list'], undefined, undefined, 'web').done;
    assert.equal(outcome.exitCode, -1);
    assert.match(outcome.spawnError, /ENOENT|spawn|invalid argument|current working directory/i,
      'spawn 失败原因不丢');
  } finally {
    process.argv[1] = saved;
  }
});

test('B1 包元数据满足 hub 登记规则（name/精确 semver/description/private）', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(bridgeDir, 'package.json'), 'utf8'));
  assert.strictEqual(pkg.name, 'dsh-market-desktop-bridge');
  assert.match(pkg.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  assert.strictEqual(typeof pkg.description, 'string');
  assert.ok(pkg.description.length > 0);
  assert.strictEqual(pkg.private, true);
  assert.ok(/DSH Desktop/.test(pkg.description), '过期清理三重判定（private+描述）可命中');
  // 配套清单与 cordis.patch.yml 的 loader id 一致（issue #104 防线）
  const entry = COMPANION_PLUGINS.find((p) => p.name === 'dsh-market-desktop-bridge');
  assert.ok(entry, '配套清单已登记');
  const patch = fs.readFileSync(path.join(bridgeDir, 'cordis.patch.yml'), 'utf8');
  assert.ok(patch.includes(`- id: ${entry.id}`), 'patch id 与配套清单一致');
});

test('B2 市场包（dsh-community-market）元数据与清单一致', () => {
  const marketDir = path.join(repoRoot, 'assets', 'plugins', 'dsh-community-market');
  const pkg = JSON.parse(fs.readFileSync(path.join(marketDir, 'package.json'), 'utf8'));
  assert.strictEqual(pkg.name, 'dsh-community-market');
  assert.match(pkg.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  assert.ok(pkg.description && /DSH Desktop/.test(pkg.description));
  const entry = COMPANION_PLUGINS.find((p) => p.name === 'dsh-community-market');
  assert.ok(entry, '市场已登记配套清单');
  const patch = fs.readFileSync(path.join(marketDir, 'cordis.patch.yml'), 'utf8');
  assert.ok(patch.includes(`- id: ${entry.id}`), 'patch id 与配套清单一致');
  // 客户端构建产物存在且带 loader 包装
  const client = fs.readFileSync(path.join(marketDir, 'lib', 'client.js'), 'utf8');
  assert.ok(client.startsWith('window.__ModuleLoader__.load({ id: "dsh-community-market"'));
  assert.ok(client.includes('[desktop-restart-fix]'), '桌面监管重启补丁已打');
});

test('C1 双向兼容：本桥禁用块可被壳层 togglePluginInPatch 启用消费', () => {
  const disabled = internals.disableInPatch(SAMPLE_PATCH, 'file-changes', '@deepseek-ai/dsh-file-changes');
  // 壳层（sidecar plugin-set-enabled）的启用路径吃同一文件
  const shellEnabled = togglePluginInPatch(disabled, 'file-changes', true, '@deepseek-ai/dsh-file-changes');
  assert.ok(!new RegExp('- id: file-changes[\\s\\S]*?disabled:\\s*true').test(shellEnabled));
});

test('C2 双向兼容：壳层禁用块可被本桥启用消费', () => {
  const shellDisabled = togglePluginInPatch(SAMPLE_PATCH, 'file-changes', false, '@deepseek-ai/dsh-file-changes');
  const bridgeEnabled = internals.enableInPatch(shellDisabled, 'file-changes');
  assert.ok(!new RegExp('- id: file-changes[\\s\\S]*?disabled:\\s*true').test(bridgeEnabled));
});
