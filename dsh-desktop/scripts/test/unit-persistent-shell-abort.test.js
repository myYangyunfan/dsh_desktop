'use strict';

// 持久 shell 停止修复补丁单元测试（node --test）。
// 覆盖 persistent-shell-abort-race / terminal-interrupt-escalation 两个补丁：
//   - transform 三态（匹配 / 已应用 / 失配）与注入产物关键行（race / 即时
//     reset / 中断升级 close）；
//   - upstream 形参护栏（防上游重命名后注入 ReferenceError）与方言推导；
//   - 产物 node --check 语法门（ESM，写 .mjs 后 spawn 校验）；
//   - 经 patch 引擎（applyAll）的 changed / already 双态与 dryRun 不落盘；
//   - 仓内 node_modules 存在 rc.1 包源时，对真实源断言锚点命中（缺失则跳过）。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  transformPersistentShellAbortRace,
  transformTerminalInterruptEscalation,
} = require('../lib/patch-adapters');
const { applyAll } = require('../integration/patch-runner');
const { PATCH_SPECS } = require('../lib/patch-registry');
const { PERSISTENT_SHELL_PKG_RELS, TERMINAL_BASH_REL } = require('../lib/patch-target-resolver');

// ---------------------------------------------------------------------------
// rc.1 字节级锚点片段（与 node_modules 内 0.1.1-rc.1 包源一致，tab 缩进）。
// ---------------------------------------------------------------------------

/** 构造 persistent 工具 executeCommand 的发送等待段（pwsh / bash 方言，rc.1 缩进深度）。 */
function persistentSendFixture(shell) {
  return [
    'async function executeCommand(ctx, shells, owner, command, config, upstream) {',
    '\tconst env_1 = { stack: [], error: void 0, hasError: false };',
    '\ttry {',
    '\t\tconst commandDeadline = __addDisposableResource(env_1, deadline(upstream, config.timeoutMs, TIMEOUT_CODE), false);',
    '\t\tconst id = await shells.get(owner, commandDeadline.signal);',
    '\t\twhile (true) {',
    '\t\t\tlet operation;',
    '\t\t\tlet result;',
    '\t\t\ttry {',
    '\t\t\t\toperation = ctx.terminals.startSend(owner, id, {',
    '\t\t\t\t\ttext: first ? wrapped : "",',
    '\t\t\t\t\tsubmit: first,',
    '\t\t\t\t\tsignal: commandDeadline.signal',
    '\t\t\t\t});',
    '\t\t\t\tfirst = false;',
    '\t\t\t\tresult = await operation.done;',
    '\t\t\t} catch (error) {',
    `\t\t\t\tawait shells.reset(owner, "persistent ${shell} send failed");`,
    '\t\t\t\tthrow error;',
    '\t\t\t}',
    '\t\t\tconst incremental = operation.readOutput();',
    '\t\t\tif (commandDeadline.signal.aborted) {',
    `\t\t\t\tawait shells.reset(owner, "persistent ${shell} command aborted");`,
    '\t\t\t\tcommandDeadline.signal.throwIfAborted();',
    '\t\t\t}',
    '\t\t}',
    '\t} catch (e_1) {}',
    '}',
  ].join('\n');
}

/** 构造 dsh-terminal-bash interruptOnce 尾段（含 closeOnce 开头锚定唯一性）。 */
// 0.1.2-alpha.1：`this.clearActive()` 重命名为 `this.releaseSettledActive()`（语义
// 不变），锚点与注入体同步改用新方法名。
const TERMINAL_INTERRUPT_FIXTURE = [
  'class LocalPtySession {',
  '\tinterrupt(operation) {',
  '\t\tif (this.active !== operation) return;',
  '\t\tthis.interrupting = operation;',
  '\t\tthis.stopReadinessPolling();',
  '\t\tthis.interruptOnce(operation);',
  '\t}',
  '\tasync interruptOnce(operation) {',
  '\t\ttry {',
  '\t\t\tconst activeWrite = this.activeWrite;',
  '\t\t\tif (activeWrite !== void 0 && !await activeWrite) return;',
  '\t\t\tawait this.terminal.signalForeground("SIGINT");',
  '\t\t} catch (error) {',
  '\t\t\tif (this.active === operation && !this.closing) this.onTransportFailure(error);',
  '\t\t\treturn;',
  '\t\t} finally {',
  '\t\t\tif (this.interrupting === operation) this.interrupting = void 0;',
  '\t\t}',
  '\t\tif (this.active === operation && operation.settled) this.releaseSettledActive();',
  '\t\telse if (this.active === operation && !this.closing) {',
  '\t\t\tthis.pollingReady = operation;',
  '\t\t\tthis.schedulePoll(operation, 0);',
  '\t\t}',
  '\t}',
  '\tasync closeOnce(reason) {',
  '\t\tthis.stopPolling();',
  '\t}',
  '}',
].join('\n');

// ---------------------------------------------------------------------------
// transform 三态与产物关键行。
// ---------------------------------------------------------------------------

test('transformPersistentShellAbortRace：pwsh 匹配注入 race + 即时复位；幂等 already；失配 anchor-missing', () => {
  const changed = transformPersistentShellAbortRace(persistentSendFixture('pwsh'), 't.js');
  assert.equal(changed.status, 'changed');
  // 关键行：race 注入 + abort 先醒即复位（让 terminal.kill() 杀附着进程）。
  assert.ok(changed.src.includes('result = await Promise.race([operation.done, abortLatch])'), '应注入 Promise.race');
  assert.ok(changed.src.includes('await shells.reset(owner, "persistent pwsh command aborted")'), 'abort 分支应即时复位（pwsh 方言）');
  // 正常完成路径逐字保留：原 await 行被替换为 race，原超时/中止后置分支不动。
  assert.ok(!changed.src.includes('\t\t\tresult = await operation.done;'), '原裸 await 应被替换');
  assert.ok(changed.src.includes('if (commandDeadline.signal.aborted) {'), '原后置中止分支应保留');
  // 幂等：marker 命中 → already。
  assert.equal(transformPersistentShellAbortRace(changed.src, 't.js').status, 'already');
  // 失配：无锚点 → anchor-missing，绝不改写。
  const miss = transformPersistentShellAbortRace('export const x = 1;', 't.js');
  assert.equal(miss.status, 'anchor-missing');
  assert.ok(miss.detail.includes('版本可能已变化'));
});

test('transformPersistentShellAbortRace：bash 方言推导（reset reason 跟随包内字面量）', () => {
  const changed = transformPersistentShellAbortRace(persistentSendFixture('bash'), 't.js');
  assert.equal(changed.status, 'changed');
  assert.ok(changed.src.includes('await shells.reset(owner, "persistent bash command aborted")'), 'abort 分支应即时复位（bash 方言）');
  assert.equal(transformPersistentShellAbortRace(changed.src, 't.js').status, 'already');
});

test('transformPersistentShellAbortRace：upstream 形参护栏——形参重命名后按失配跳过（防注入 ReferenceError）', () => {
  // 锚点串命中，但 deadline(upstream, ...) 已重命名（上游重构场景）：
  // 注入代码引用 upstream，必须拒绝注入而不是产出运行时 ReferenceError。
  const renamed = persistentSendFixture('pwsh').replace('deadline(upstream, config.timeoutMs, TIMEOUT_CODE)', 'deadline(execSignal, config.timeoutMs, TIMEOUT_CODE)');
  const miss = transformPersistentShellAbortRace(renamed, 't.js');
  assert.equal(miss.status, 'anchor-missing');
});

test('transformPersistentShellAbortRace：方言字面量缺失（pwsh/bash reason 均不在）→ 失配', () => {
  const src = persistentSendFixture('pwsh')
    .replace('await shells.reset(owner, "persistent pwsh command aborted");', 'await shells.reset(owner, "reset");');
  const miss = transformPersistentShellAbortRace(src, 't.js');
  assert.equal(miss.status, 'anchor-missing');
  assert.ok(miss.detail.includes('方言'), '失配原因应说明方言未识别');
});

test('transformTerminalInterruptEscalation：匹配注入 2s 升级 close；幂等 already；失配 anchor-missing', () => {
  const changed = transformTerminalInterruptEscalation(TERMINAL_INTERRUPT_FIXTURE, 't.js');
  assert.equal(changed.status, 'changed');
  assert.ok(changed.src.includes('this.close("interrupt escalation").catch(() => {})'), '应注入中断升级 close');
  assert.ok(changed.src.includes('}, 2e3);'), '升级定时器应为 2s');
  // 升级守卫：仍 active / 未 settle / 未 closing 才升级。
  assert.ok(changed.src.includes('if (this.active !== operation || operation.settled || this.closing) return;'));
  assert.equal(transformTerminalInterruptEscalation(changed.src, 't.js').status, 'already');
  const miss = transformTerminalInterruptEscalation('export const x = 1;', 't.js');
  assert.equal(miss.status, 'anchor-missing');
  assert.ok(miss.detail.includes('版本可能已变化'));
});

// ---------------------------------------------------------------------------
// 产物语法门：注入后必须是可解析的 ESM（node --check）。
// ---------------------------------------------------------------------------

test('产物 node --check 语法门（pwsh / bash / terminal 三份注入产物）', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-abort-patch-check-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const outputs = [
    ['pwsh.mjs', transformPersistentShellAbortRace(persistentSendFixture('pwsh'), 't.js').src],
    ['bash.mjs', transformPersistentShellAbortRace(persistentSendFixture('bash'), 't.js').src],
    ['terminal.mjs', transformTerminalInterruptEscalation(TERMINAL_INTERRUPT_FIXTURE, 't.js').src],
  ];
  for (const [name, src] of outputs) {
    const file = path.join(dir, name);
    fs.writeFileSync(file, src);
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, `${name} 应通过 node --check：${result.stderr}`);
  }
});

// ---------------------------------------------------------------------------
// 引擎双态：applyAll 驱动真实 spec —— 首跑 changed 落盘，复跑 already 静默；
// dryRun 只判定不落盘。
// ---------------------------------------------------------------------------

function makeCtx(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-abort-home-'));
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-abort-app-'));
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-abort-ud-'));
  t.after(() => {
    for (const d of [home, appDir, userDataDir]) fs.rmSync(d, { recursive: true, force: true });
  });
  return { home, appDir, userDataDir, wslMode: false, logs: [], log: (m) => undefined };
}

function specsUnderTest() {
  return PATCH_SPECS.filter((s) => s.id === 'persistent-shell-abort-race' || s.id === 'terminal-interrupt-escalation');
}

/** 在 ctx.home 的 runtime-local 第一落点写入全部三个目标文件，返回路径列表。 */
function writeTargets(ctx) {
  const files = [];
  const rels = [...PERSISTENT_SHELL_PKG_RELS, TERMINAL_BASH_REL];
  for (let i = 0; i < rels.length; i += 1) {
    const rel = rels[i];
    const f = path.join(ctx.home, 'profiles', 'node_modules', '@deepseek-ai', rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, i < 2 ? persistentSendFixture(i === 0 ? 'pwsh' : 'bash') : TERMINAL_INTERRUPT_FIXTURE);
    files.push(f);
  }
  return files;
}

test('applyAll 双态：dryRun 不落盘 → 首跑 changed×3 → 复跑 already 零写入', (t) => {
  const ctx = makeCtx(t);
  const files = writeTargets(ctx);
  const specs = specsUnderTest();
  assert.equal(specs.length, 2, '两个新补丁应已注册');

  // dryRun：三个目标均判 changed 但不写。
  const dry = applyAll(ctx, specs, { dryRun: true });
  assert.equal(dry.changed, 0, 'dryRun 不落盘（changed 计数为写入数）');
  for (const f of files) {
    assert.ok(fs.readFileSync(f, 'utf8').includes('result = await operation.done') || fs.readFileSync(f, 'utf8').includes('this.schedulePoll(operation, 0)'), `${f} dryRun 后应保持原样`);
  }

  // 首跑：三处全部写入。
  const first = applyAll(ctx, specs);
  assert.equal(first.changed, 3, `应写入 3 处，实际 ${first.changed}`);
  assert.equal(first.anchorMissing, 0);
  assert.equal(first.failed, 0);
  assert.deepEqual(first.errors, []);
  const patchedPwsh = fs.readFileSync(files[0], 'utf8');
  assert.ok(patchedPwsh.includes('Promise.race([operation.done, abortLatch])'), '落盘产物应含 race');
  assert.ok(patchedPwsh.includes('await shells.reset(owner, "persistent pwsh command aborted")'), '落盘产物应含即时复位');
  assert.ok(fs.readFileSync(files[2], 'utf8').includes('this.close("interrupt escalation")'), 'terminal 落盘产物应含升级 close');

  // 复跑：marker 命中 → already，零写入零失配（上游同款修复落地后的退役形态）。
  const second = applyAll(ctx, specs);
  assert.equal(second.changed, 0, '复跑应零写入');
  assert.equal(second.anchorMissing, 0, 'already 不计入失配');
  assert.equal(second.failed, 0);
});

test('注册表契约：两补丁登记为 runtime 组 warn 档、cli:false、marker 与 adapters 共享常量同源', () => {
  const { markers, transformPersistentShellAbortRace: t1, transformTerminalInterruptEscalation: t2 } = require('../lib/patch-adapters');
  const byId = Object.fromEntries(PATCH_SPECS.map((s) => [s.id, s]));
  const race = byId['persistent-shell-abort-race'];
  const escalation = byId['terminal-interrupt-escalation'];
  assert.ok(race && escalation, '两个补丁均应登记');
  assert.equal(race.group, 'runtime');
  assert.equal(escalation.group, 'runtime');
  assert.equal(race.failPolicy, 'warn');
  assert.equal(escalation.failPolicy, 'warn');
  assert.equal(race.cli, false, '桌面壳运行时补丁，不进 CLI 同步清单');
  assert.equal(escalation.cli, false, '桌面壳运行时补丁，不进 CLI 同步清单');
  assert.equal(race.transform, t1, 'transform 应与 patch-adapters 导出同源');
  assert.equal(escalation.transform, t2, 'transform 应与 patch-adapters 导出同源');
  assert.equal(race.marker, markers.PERSISTENT_ABORT_RACE_MARKER, 'race marker 同源');
  assert.equal(escalation.marker, markers.INTERRUPT_ESCALATION_MARKER, 'escalation marker 同源');
  assert.deepEqual(race.pkgRels, PERSISTENT_SHELL_PKG_RELS, 'race 补丁覆盖 pwsh/bash 两个 persistent 包');
  assert.equal(escalation.pkgRel, TERMINAL_BASH_REL, 'escalation 补丁目标为 dsh-terminal-bash');
});

// ---------------------------------------------------------------------------
// 真实 rc.1 源锚点校验（仓内 node_modules 存在时才跑；缺失环境自动跳过）。
// ---------------------------------------------------------------------------

test('真实 rc.1 包源锚点命中：三份 node_modules 源首跑 changed、复跑 already', (t) => {
  const root = path.resolve(__dirname, '..', '..');
  const rels = [
    ['node_modules', '@deepseek-ai', 'dsh-tool-pwsh-persistent', 'lib', 'index.js', transformPersistentShellAbortRace],
    ['node_modules', '@deepseek-ai', 'dsh-tool-bash-persistent', 'lib', 'index.js', transformPersistentShellAbortRace],
    ['node_modules', '@deepseek-ai', 'dsh-terminal-bash', 'lib', 'index.js', transformTerminalInterruptEscalation],
  ];
  const existing = rels.filter((r) => fs.existsSync(path.join(root, ...r.slice(0, -1))));
  if (existing.length === 0) t.skip('node_modules 内无 rc.1 包源，跳过真实锚点校验');
  for (const parts of existing) {
    const transform = parts[parts.length - 1];
    const file = path.join(root, ...parts.slice(0, -1));
    const src = fs.readFileSync(file, 'utf8');
    const first = transform(src, file);
    // dev 仓的 node_modules 会被真实 boot 的补丁机制就地打上本补丁（幂等
    // marker 在位 → already）；刚 install 的纯净树则是 changed。两种初态
    // 都合法——关键断言是「锚点/幂等判定有效」而非「必须未打过」。
    assert.ok(first.status === 'changed' || first.status === 'already',
      `${file} 应命中锚点或识别已应用（rc.1 字节稳定），实际 ${first.status}: ${first.reason || ''}`);
    // already 初态无 src 字段（不回写），复跑用原 src；changed 初态用产物 src。
    assert.equal(transform(first.src ?? src, file).status, 'already', `${file} 复跑应 already`);
  }
});
