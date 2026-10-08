'use strict';

// ---------------------------------------------------------------------------
// unit-balance-legacy-retire.test.js — Electron 余额遗留线退役的反向守卫。
//
// 背景：页面余额的现役唯一链路是内置插件 `dsh-balance`——宿主半边在内核 webServer
// 注册 `GET /api/dsh-balance/state` + `POST /api/dsh-balance/refresh` 两条只认回环
// 的 exact 路由，页面 60s 轮询（见 docs/balance-architecture.md §1）。自制壳时代的
// 那条链（`dsh-desktop/balance.js` + `balance-scheduler.js` → sidecar `balance-fetch`
// → Rust `start_balance_loop` → `app.emit("balance-changed")` → 垫片 `window` 事件
// `dsh-balance-changed`）零消费方却每 180s 真发一次 `/user/balance`，已于 2026-10
// 整体拆除（契约裁撤行：dsh-tauri/contracts/ipc-commands.md §2.4）。
//
// 本文件守的是「别再长回来」：遗留源文件 / sidecar 子命令 / Rust 模块 / 桥命令 /
// 垫片面 / 权限项 / 契约表 七层逐条断言不存在，并核对现役插件链路的两条路由仍在
// （防止反向守卫把唯一活链路也一起删掉却测不出来）。
//
// 纯静态扫描：零网络、零子进程、不碰真实 `~/.dsh` 与 `%APPDATA%`。
// 运行：node --test scripts/test/unit-balance-legacy-retire.test.js
// ---------------------------------------------------------------------------

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..'); // dsh-desktop/
const TAURI = path.join(ROOT, '..', 'dsh-tauri');
const RUST_APP = path.join(TAURI, 'src-tauri', 'src', 'app');
const BRIDGE_CRATE = path.join(TAURI, 'src-tauri', 'crates', 'bridge');
const PLUGIN = path.join(ROOT, 'assets', 'plugins', 'dsh-balance');

/** 读源并归一 CRLF（仓库文件普遍 CRLF，锚点按 \n 写）。 */
function read(...segs) {
  return fs.readFileSync(path.join(...segs), 'utf8').replace(/\r\n/g, '\n');
}

/**
 * 逐段断言（空行分段，兼容 markdown 与 Rust doc 注释的换行折行）：
 * 出现遗留令牌的段落必须是「裁撤说明」，不得是在用条目。
 */
function assertOnlyRetirementMentions(label, src, tokens, markers) {
  const offenders = [];
  src.split(/\n[ \t]*\n/).forEach((block) => {
    if (!tokens.some((t) => block.includes(t))) return;
    if (!markers.some((m) => block.includes(m))) {
      offenders.push(`${label}: ${block.trim().slice(0, 120).replace(/\n/g, ' ⏎ ')}`);
    }
  });
  assert.deepEqual(offenders, [], '令牌只应出现在裁撤说明段');
}

// ---- 1. 遗留 Node 数据层与编排器已删，且不进出语法门清单 ----
test('遗留 Node 模块不存在，check-syntax 入口清单不含它们', () => {
  for (const f of ['balance.js', 'balance-scheduler.js']) {
    assert.ok(!fs.existsSync(path.join(ROOT, f)), `dsh-desktop/${f} 应已删除`);
  }
  const gate = read(ROOT, 'scripts', 'check-syntax.js');
  const list = gate.split('const entryFiles = [')[1].split('];')[0];
  assert.ok(!list.includes("'balance.js'"), '语法门清单不得残留 balance.js');
  assert.ok(!list.includes("'balance-scheduler.js'"), '语法门清单不得残留 balance-scheduler.js');
});

// ---- 2. sidecar 子命令已撤（未知子命令 exit 2 由 cli.test.js 反证）----
test('sidecar 不再有 balance-fetch 子命令', () => {
  const cli = read(TAURI, 'sidecar', 'cli.js');
  assert.ok(!cli.includes('balance-fetch'), 'cli.js 不得含 balance-fetch 分支');
  assert.ok(!cli.includes('balance-scheduler'), 'cli.js 不得再 require 遗留编排器');
});

// ---- 3. 壳侧 Rust：模块 / 轮询环 / 命令注册 / 菜单挂点 / 通知链挂点 ----
test('Rust 侧余额轮询环与命令面已全部摘除', () => {
  assert.ok(
    !fs.existsSync(path.join(RUST_APP, 'src', 'commands', 'balance.rs')),
    'commands/balance.rs 应已删除',
  );
  const mod = read(RUST_APP, 'src', 'commands', 'mod.rs');
  assert.ok(!/^\s*(pub(\(crate\))? )?mod balance;/m.test(mod), 'mod.rs 不得再声明 balance 模块');
  assert.ok(!mod.includes('pub use balance::*'), 'mod.rs 不得再重导出 balance');

  const lib = read(RUST_APP, 'src', 'lib.rs');
  for (const t of ['balance_refresh', 'start_balance_loop', 'BalanceState']) {
    assert.ok(!lib.includes(t), `lib.rs 不得残留 ${t}`);
  }
  // AppState 的余额共享状态随模块一并消失（字段与初始化都不该在）。
  assert.ok(!lib.includes('commands::balance'), 'lib.rs 不得再引用 commands::balance');

  const menu = read(RUST_APP, 'src', 'commands', 'menu.rs');
  assert.ok(!menu.includes('balance::trigger_fetch'), '菜单 toggle-balance 不得再触发壳侧取数');
  // 设置项本身仍在（插件 dock 的显隐开关），只是不再连到余额链。
  assert.ok(menu.includes('showBalanceDock'), 'showBalanceDock 设置项应保留（非裁撤范围）');

  const notify = read(RUST_APP, 'src', 'session_notify.rs');
  assert.ok(!notify.includes('trigger_fetch'), 'turn-end 不得再挂余额触发（C2 退役）');
});

// ---- 4. 桥命令表 / 权限真源 / 垫片面 ----
test('桥通道表、权限清单与垫片面均无余额命令', () => {
  // 按「登记形态」判：注册条目行（`m("…")`）不得含余额通道；裁撤说明是散文，
  // 允许出现令牌（其口径由第 5 节的段落级契约核对兜住）。
  const cmds = read(BRIDGE_CRATE, 'src', 'commands.rs');
  const liveRows = cmds.split('\n').filter((l) => /^\s*m\(/.test(l) && /balance/i.test(l));
  assert.deepEqual(liveRows, [], 'CHANNELS 不得有余额通道条目');
  assert.ok(!cmds.includes('balance_refresh'), 'CHANNELS 不得含 balance_refresh 命令名');

  // 权限真源（注意落点：src/app/permissions/，不在 src 下）。按「授权条目」形态判：
  // 数组里的一条授权写作 `  "balance_refresh",`；散文注释里的退役说明不算。
  const perm = read(RUST_APP, 'permissions', 'bridge.toml');
  const permRows = perm.split('\n').filter((l) => /^\s*"balance_refresh",?\s*$/.test(l));
  assert.deepEqual(permRows, [], '权限真源不得授权 balance_refresh');

  const shim = read(BRIDGE_CRATE, 'dist', 'bridge-shim.js');
  assert.ok(!shim.includes('balance-changed'), '垫片不得转发 balance-changed');
  assert.ok(!shim.includes('dsh-balance-changed'), '垫片不得派发 dsh-balance-changed');
  assert.ok(!shim.includes('refreshBalance'), '垫片不得暴露 refreshBalance 面');
  const shimRows = shim.split('\n').filter((l) => /^\s*\w+:\s*function\s*\(/.test(l) && /balance/i.test(l));
  assert.deepEqual(shimRows, [], '垫片方法表不得有余额方法');

  // shim.rs 的退役说明与反向断言都是散文（反向断言行本身含 "refreshBalance"
  // 字面量），故把判据收敛到 REQUIRED_SURFACES 数组字面量本体。
  const shimRs = read(BRIDGE_CRATE, 'src', 'shim.rs');
  const surfaces = shimRs.split('const REQUIRED_SURFACES: &[&str] = &[')[1];
  assert.ok(surfaces, 'shim.rs 必须声明 REQUIRED_SURFACES');
  const surfaceList = surfaces.split('];')[0];
  assert.ok(!surfaceList.includes('refreshBalance'), 'REQUIRED_SURFACES 不得含 refreshBalance');
  assert.ok(!/balance/i.test(surfaceList), `在用面清单不得残留余额面: ${surfaceList}`);
});

// ---- 5. 契约文档：遗留令牌只允许出现在裁撤说明行 ----
test('五份契约里余额令牌均为裁撤说明，且 §2.4 台账在册', () => {
  const tokens = ['balance_refresh', 'balance-refresh', 'refreshBalance', 'balance-changed', 'start_balance_loop'];
  const markers = ['退役', '裁撤', '移出', '已无', '已随', '零消费方'];
  for (const f of ['bridge-api.md', 'ipc-commands.md', 'data-flow.md', 'plugin-contract.md', 'error-codes.md']) {
    assertOnlyRetirementMentions(f, read(TAURI, 'contracts', f), tokens, markers);
  }
  // 事件表白名单同步：data-flow.md 不得再把余额事件列为在用事件面。
  const dataFlow = read(TAURI, 'contracts', 'data-flow.md');
  assert.ok(!/^\|\s*`?balance-changed`?\s*\|/m.test(dataFlow), 'data-flow.md 事件表不得残留 balance-changed 行');
  // 裁撤台账必须在册（防止「删了实现也删了记录」）。
  const ipc = read(TAURI, 'contracts', 'ipc-commands.md');
  assert.ok(
    ipc.includes('§2.4') && ipc.includes('零消费方'),
    'ipc-commands.md 需保留 §2.4 裁撤说明（通道号 3173 不复用）',
  );
});

// ---- 6. 反向守卫的反向：现役唯一链路必须还活着 ----
test('现役插件余额链路未被误删', () => {
  for (const f of ['lib/balance-core.js', 'lib/balance-scheduler.js', 'lib/index.js', 'lib/client.js']) {
    assert.ok(fs.existsSync(path.join(PLUGIN, f)), `插件产物 ${f} 必须仍在（现役唯一链路）`);
  }
  const host = read(PLUGIN, 'lib', 'index.js');
  assert.ok(host.includes('"/api/dsh-balance/state"'), '宿主半边必须有 state 路由');
  assert.ok(host.includes('"/api/dsh-balance/refresh"'), '宿主半边必须有 refresh 路由');
  const client = read(PLUGIN, 'lib', 'client.js');
  assert.ok(client.includes('/api/dsh-balance/state') && client.includes('/api/dsh-balance/refresh'),
    '客户端必须经两条回环路由取数');
  // 插件不得回流到已退役的垫片面（零消费方正是裁撤依据）。
  for (const f of ['lib/index.js', 'lib/client.js', 'lib/balance-core.js', 'lib/balance-scheduler.js']) {
    const src = read(PLUGIN, ...f.split('/'));
    assert.ok(!src.includes('refreshBalance') && !src.includes('dsh-balance-changed'),
      `插件不得依赖已退役垫片面：${f}`);
  }
});
