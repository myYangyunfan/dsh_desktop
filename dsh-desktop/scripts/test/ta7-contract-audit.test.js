'use strict';

// TA7 契约哨兵：contracts/*.md ↔ 代码实装 双向机器核对（全量化）。
//
// 核对面（七项）：
//  1. bridge-api.md §2.3 act 枚举 ↔ menu.rs match 分支（含 toggle 合并行展开）
//     + 每分支返回字段（md「返回」列 ↔ json! 键）双向；
//  2. error-codes.md 全部 E_* ↔ Rust 常量（error.rs / wsl-backend / image.rs）
//     + JS 侧码字符串（bridge-shim.js），双向 + 「已退役」注记核对；
//  3. ipc-commands.md §2 命令清单 ↔ lib.rs generate_handler 注册列表，双向；
//  4. 根 README.md 与 dsh-tauri/README.md 双库更新链描述一致性（sha256/双源
//     关键词在位；minisign / check-agent-update 旧词不得回潮）+ 最新版本号一致；
//  5. wsl-backend.md 契约键（settings 三键 / §2.1 载荷 / §2.2 返回 / env 覆盖）
//     ↔ commands/wsl.rs + sidecar/wsl-mode.js，双向；
//  6. docs/commit-plan-20260822.md §3 CHANGELOG 草案功能关键词 ↔ 测试文件存在（软断言）；
//  7. bridge-api.md 53 方法表 ↔ bridge-shim.js dshDesktop 对象实际挂载方法名，双向。
//
// 已知漂移以 KNOWN_* 白名单锁定（新漂移进 diff 即失败，消账后从白名单移除）。
// 本文件只读仓库源码/文档，不做任何写操作。

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const CONTRACTS = 'dsh-tauri/contracts';
const bridgeApi = read(path.join(CONTRACTS, 'bridge-api.md'));
const errorCodes = read(path.join(CONTRACTS, 'error-codes.md'));
const ipcCommands = read(path.join(CONTRACTS, 'ipc-commands.md'));
const wslContract = read(path.join(CONTRACTS, 'wsl-backend.md'));

const menuRs = read('dsh-tauri/src-tauri/src/app/src/commands/menu.rs');
const errorRs = read('dsh-tauri/src-tauri/crates/bridge/src/error.rs');
const libRs = read('dsh-tauri/src-tauri/src/app/src/lib.rs');
const wslRs = read('dsh-tauri/src-tauri/src/app/src/commands/wsl.rs');
const wslBackendRs = read('dsh-tauri/src-tauri/crates/wsl-backend/src/lib.rs');
const imageRs = read('dsh-tauri/src-tauri/src/app/src/commands/image.rs');
const shimJs = read('dsh-tauri/src-tauri/crates/bridge/dist/bridge-shim.js');
const wslModeJs = read('dsh-tauri/sidecar/wsl-mode.js');
const cliJs = read('dsh-tauri/sidecar/cli.js');
const rootReadme = read('README.md');
const tauriReadme = read('dsh-tauri/README.md');
const commitPlan = read('docs/commit-plan-20260822.md');

// ----------------------------------------------------------------------------
// 通用小工具
// ----------------------------------------------------------------------------

function diff(a, b) {
  const setB = new Set(b);
  return [...new Set(a)].filter((x) => !setB.has(x));
}

function section(md, from, to) {
  const i = md.indexOf(from);
  assert.ok(i >= 0, `找不到锚点 ${from}`);
  const rest = md.slice(i);
  const j = to ? rest.indexOf(to) : -1;
  return j >= 0 ? rest.slice(0, j) : rest;
}

// ----------------------------------------------------------------------------
// 1. bridge-api.md §2.3 act 表 ↔ menu.rs
// ----------------------------------------------------------------------------

function parseMdActs() {
  const seg = section(bridgeApi, 'menu_action` 已实装 act 枚举', '### 2.4');
  const acts = new Set();
  for (const line of seg.split('\n')) {
    if (!line.startsWith('|') || line.includes('|----')) continue;
    const cells = line.split('|');
    if (cells.length < 3) continue;
    const actCell = cells[1];
    // toggle 合并行：`toggle-notify` / `toggle-close-to-tray` / ... 展开。
    for (const m of actCell.matchAll(/`([a-z][a-z0-9-]*)`/g)) acts.add(m[1]);
  }
  return acts;
}

function parseRustActs() {
  const seg = section(menuRs, 'match action.as_str()', 'other =>');
  const acts = new Set();
  // match 臂模式：`"act" =>` / `"a" | "b" | "c" =>`（合并臂全量展开；注释里的
  // 名字不跟 =>，天然排除）。
  for (const arm of seg.matchAll(/((?:"[a-z][a-z0-9-]*"\s*(?:\|\s*)?)+)=>/g)) {
    for (const a of arm[1].matchAll(/"([a-z][a-z0-9-]*)"/g)) acts.add(a[1]);
  }
  return acts;
}

test('TA7-1a bridge-api.md §2.3 act 表 → menu.rs：单向差集为空（含 toggle 展开共 15 项）', () => {
  const md = parseMdActs();
  assert.strictEqual(md.size, 15, `契约 act 计数（toggle 展开）: ${[...md]}`);
  const missing = diff(md, parseRustActs());
  assert.deepStrictEqual(missing, [], '契约有而实装缺的 act');
});

test('TA7-1b menu.rs → bridge-api.md §2.3：反向差集为空（无未入契约的私货 act）', () => {
  const extra = diff(parseRustActs(), parseMdActs());
  assert.deepStrictEqual(extra, [], '实装有而契约缺的 act');
});

// 已知返回字段漂移（消账后移除）：open-logs / open-browser 契约「返回 {ok}」，
// 实装委托 common.rs 的 open_in_explorer / open_http_url（返回 Value::Null）。
// 垫片/插件侧不消费这两个分支的返回字段 → 建议改契约（文档侧）。
// open-logs/open-browser 返回列已改为 null（消账，与实装一致）。
const KNOWN_ACT_FIELD_DRIFT = {};

test('TA7-1c act 返回 payload 字段：md「返回」列字面量 ↔ menu.rs 分支 json! 键', () => {
  const seg = section(bridgeApi, 'menu_action` 已实装 act 枚举', '### 2.4');
  const rust = section(menuRs, 'match action.as_str()', 'other =>');
  const branch = (act) => {
    const direct = rust.indexOf(`"${act}" =>`);
    const merged = rust.indexOf(`"${act}" |`);
    const start = direct >= 0 ? direct : merged;
    assert.ok(start >= 0, `找不到分支 ${act}`);
    // 分支段 = 本臂起点到下一个独立臂（行首缩进 + "xxx" =>）。
    const after = rust.slice(start);
    const next = after.slice(1).search(/\n\s{8}"[a-z][a-z0-9-]*" (=>|\|)/);
    return next >= 0 ? after.slice(0, next + 1) : after;
  };
  const driftSeen = [];
  for (const line of seg.split('\n')) {
    if (!line.startsWith('|') || line.includes('|----')) continue;
    const cells = line.split('|');
    if (cells.length < 4) continue;
    const actNames = [...cells[1].matchAll(/`([a-z][a-z0-9-]*)`/g)].map((m) => m[1]);
    if (!actNames.length) continue;
    // 「返回」列里的字面量字段：{a, b, c} / {a, manual:true} —— 剔 <占位符>。
    const ret = cells[3];
    const tokens = new Set();
    for (const g of ret.matchAll(/\{([^}]*)\}/g)) {
      const noPlaceholders = g[1].replace(/<[^>]*>/g, ' '); // 剔 <占位符>
      for (const t of noPlaceholders.matchAll(/[A-Za-z][A-Za-z0-9]*/g)) {
        if (t[0] !== 'true' && t[0] !== 'false') tokens.add(t[0]);
      }
    }
    // toggle 合并行：返回列是 {<settings键>: <新值>}，无字面量 —— 语义键
    // （notifyOnTurnEnd 等）映射在 toggle_key()，单独核对（见 TA7-1d）。
    for (const act of actNames) {
      const b = branch(act);
      for (const tok of tokens) {
        const known = (KNOWN_ACT_FIELD_DRIFT[act] || []).includes(tok);
        if (known) { driftSeen.push(`${act}.${tok}`); continue; }
        assert.ok(
          b.includes(`"${tok}"`),
          `act ${act} 分支缺契约返回字段 "${tok}"（分支段：${b.slice(0, 120)}…）`
        );
      }
    }
  }
  // 漂移锁定：白名单内的已知漂移必须仍真实存在（消账后删白名单条目）。
  const expectedDrift = Object.entries(KNOWN_ACT_FIELD_DRIFT).flatMap(([a, ts]) => ts.map((t) => `${a}.${t}`));
  assert.deepStrictEqual(driftSeen.sort(), expectedDrift.sort(), '已知返回字段漂移集变化（消账或新增漂移）');
});

test('TA7-1d toggle 合并行语义键：四个 settings 键在 menu.rs 有映射与返回', () => {
  for (const key of ['notifyOnTurnEnd', 'closeToTray', 'showBalanceDock', 'autoInstallUpdates']) {
    assert.ok(menuRs.includes(`"${key}"`), `settings 键 ${key} 缺失（toggle_key 映射或返回）`);
  }
});

// ----------------------------------------------------------------------------
// 2. error-codes.md ↔ 代码常量（Rust + JS 双向）
// ----------------------------------------------------------------------------

function parseMdErrorCodes() {
  const codes = new Set();
  for (const m of errorCodes.matchAll(/^\|\s*`(E_[A-Z_]+)`/gm)) codes.add(m[1]);
  return codes;
}

function parseRustErrorCodes() {
  const codes = new Set();
  for (const src of [errorRs, wslBackendRs]) {
    for (const m of src.matchAll(/pub const [A-Z_]+: &str = "(E_[A-Z_]+)"/g)) codes.add(m[1]);
  }
  for (const m of imageRs.matchAll(/const [A-Z_]+: &str = "(E_[A-Z_]+)"/g)) codes.add(m[1]);
  return codes;
}

function parseJsErrorCodes() {
  return new Set([...shimJs.matchAll(/\b(E_[A-Z_]+)\b/g)].map((m) => m[1]));
}

// 已知漂移白名单（消账后移除）：
//  - E_AGENT_UPDATE_NETWORK：md 标注「已退役（v0.5.3）」——码值保留不复用，
//    实装无活跃常量（menu.rs 仅有退役注释），属文档侧历史登记，非缺陷；
//  - E_NO_HOST：bridge-shim.js 浏览器模式降级码——已补登记 error-codes.md（含「垫片本地码」口径），不再是漂移
//    （文档侧待补，见漂移清单）。
// E_NO_HOST：垫片本地降级码（契约注明无 Rust 载体），已登记 md。
const KNOWN_MD_ONLY_CODES = ['E_AGENT_UPDATE_NETWORK', 'E_NO_HOST'];
const KNOWN_JS_ONLY_CODES = []; // E_NO_HOST 已登记，消账

test('TA7-2a error-codes.md → Rust 常量：除已退役码外差集为空', () => {
  const md = parseMdErrorCodes();
  assert.ok(md.size >= 25, `契约码数量异常: ${md.size}`);
  // E_OK 契约注明「不作为错误出现」，实装无载体是正确的。
  const expect = new Set([...md].filter((c) => c !== 'E_OK' && !KNOWN_MD_ONLY_CODES.includes(c)));
  const missing = diff(expect, parseRustErrorCodes());
  assert.deepStrictEqual(missing, [], '契约有而 Rust 实装缺的错误码');
});

test('TA7-2b Rust 常量 → error-codes.md：反向差集为空', () => {
  const extra = diff(parseRustErrorCodes(), parseMdErrorCodes());
  assert.deepStrictEqual(extra, [], 'Rust 有而契约缺的错误码（新码必须先入表）');
});

test('TA7-2c JS 侧码字符串 ↔ 契约：双向差集锁定为已知漂移集', () => {
  const md = parseMdErrorCodes();
  const js = parseJsErrorCodes();
  const jsOnly = diff(js, md);
  assert.deepStrictEqual(jsOnly, KNOWN_JS_ONLY_CODES, 'JS 侧未登记码（新漂移或消账）');
  // 垫片侧无「契约要求但垫片未识别」面（垫片只透传 [CODE] 前缀）——
  // 已退役码不得在垫片复活。
  assert.ok(!js.has('E_AGENT_UPDATE_NETWORK'), '退役码 E_AGENT_UPDATE_NETWORK 不得出现在垫片');
});

test('TA7-2d 「已退役」注记：E_AGENT_UPDATE_NETWORK 的退役注释在代码侧存在', () => {
  const mdRow = [...errorCodes.matchAll(/^\|\s*`(E_AGENT_UPDATE_NETWORK)`[^\n]*/gm)][0][0];
  assert.ok(mdRow.includes('已退役'), '契约侧该码必须带「已退役」标记');
  // menu.rs 模块 doc 记录退役 + 码值不复用。
  const docSeg = menuRs.split('#[tauri::command]')[0];
  assert.ok(
    docSeg.includes('E_AGENT_UPDATE_NETWORK') && docSeg.includes('退役'),
    'menu.rs 模块 doc 缺 E_AGENT_UPDATE_NETWORK 退役注记'
  );
  // 实装段（非注释）不得再引用退役码。
  const implSeg = menuRs.split('#[tauri::command]')[1]?.split('#[cfg(test)]')[0] ?? '';
  assert.ok(!implSeg.includes('E_AGENT_UPDATE_NETWORK'), '退役码不得在实装段活跃');
});

// ----------------------------------------------------------------------------
// 3. ipc-commands.md ↔ lib.rs generate_handler
// ----------------------------------------------------------------------------

function parseMdCommands() {
  const seg = section(ipcCommands, '## 2. 全量映射表', '## 3.');
  const cmds = new Set();
  for (const line of seg.split('\n')) {
    if (!line.startsWith('|') || line.includes('|---')) continue;
    const cells = line.split('|');
    if (cells.length < 3) continue;
    for (const m of cells[2].matchAll(/`([a-z][a-z_]+[a-z])`/g)) cmds.add(m[1]);
  }
  return cmds;
}

function parseRegisteredCommands() {
  const seg = section(libRs, 'generate_handler![', ']');
  const cmds = new Set();
  for (const m of seg.matchAll(/commands::([a-z_]+)/g)) cmds.add(m[1]);
  return cmds;
}

test('TA7-3a ipc-commands.md §2 → generate_handler：契约命令全注册', () => {
  const md = parseMdCommands();
  assert.strictEqual(md.size, 43, `契约命令计数: ${md.size}`);
  const reg = parseRegisteredCommands();
  const missing = [...md].filter((c) => !reg.has(c));
  assert.deepStrictEqual(missing, [], '契约有而未注册的 command');
});

test('TA7-3b generate_handler → ipc-commands.md：注册表无契约外私货（poc_echo_json 白名单）', () => {
  const md = parseMdCommands();
  const extra = [...parseRegisteredCommands()].filter(
    (c) => !md.has(c) && c !== 'poc_echo_json'
  );
  assert.deepStrictEqual(extra, [], '注册了契约外的 command（须先入契约）');
  // poc_echo_json 在注册表内有「非契约成员」注释标记。
  assert.ok(
    /\/\/\s*PoC 工具（非契约成员）/.test(libRs),
    'poc_echo_json 必须保持「非契约成员」显式标注'
  );
});

// ----------------------------------------------------------------------------
// 4. README 双库一致性（今日 sha256/双源修正的回归锁）
// ----------------------------------------------------------------------------

test('TA7-4 根 README 与 dsh-tauri/README：版本号一致 + 双源/sha256 在位 + 旧更新链词不回潮', () => {
  for (const [name, md] of [['README.md', rootReadme], ['dsh-tauri/README.md', tauriReadme]]) {
    assert.ok(/sha256/i.test(md), `${name} 更新链描述缺 sha256 关键词`);
    assert.ok(md.includes('双源'), `${name} 更新链描述缺「双源」关键词`);
    assert.ok(!/minisign/i.test(md), `${name} 不得再出现 minisign（已让位 sha256 边车+digest）`);
    assert.ok(!md.includes('check-agent-update'), `${name} 不得再出现 check-agent-update（npm 内核链已退役）`);
    assert.ok(!/agent 更新链|检查 dsh 更新/.test(md), `${name} 不得残留 agent 更新链旧词`);
  }
  // 最新版本号两库一致（取各自最高 v0.5.x）。
  const latest = (md) => {
    const vs = [...md.matchAll(/v?0\.5\.(\d+)/g)].map((m) => Number(m[1]));
    assert.ok(vs.length, '无 0.5.x 版本号');
    return `v0.5.${Math.max(...vs)}`;
  };
  assert.strictEqual(latest(rootReadme), latest(tauriReadme), '双 README 最新版本号不一致');
});

// ----------------------------------------------------------------------------
// 5. wsl-backend.md ↔ commands/wsl.rs + sidecar/wsl-mode.js
// ----------------------------------------------------------------------------

test('TA7-5a wsl-backend.md §1 settings/env 键 ↔ wsl.rs 与 wsl-mode.js 双向', () => {
  // §1.1 持久化三键。
  for (const key of ['"backend"', '"wslDistro"', '"wslInstallDir"']) {
    assert.ok(wslRs.includes(key), `wsl.rs 缺 settings 键 ${key}`);
  }
  for (const key of ['wslDistro', 'wslInstallDir', 'backend']) {
    assert.ok(wslModeJs.includes(key), `wsl-mode.js 缺 settings 键 ${key}`);
  }
  // §1.2 env 覆盖三变量（契约列出 → 实装在位）。
  for (const v of ['DSH_DESKTOP_BACKEND', 'DSH_DESKTOP_WSL_DISTRO', 'DSH_DESKTOP_WSL_DIR']) {
    assert.ok(wslModeJs.includes(v), `wsl-mode.js 缺 env 覆盖 ${v}`);
  }
  // 反向：wsl.rs 里出现的 DSH_DESKTOP_* env 必须在契约 §1.2 有登记。
  const mdEnv = new Set([...wslContract.matchAll(/`(DSH_[A-Z_]+)`/g)].map((m) => m[1]));
  for (const m of wslRs.matchAll(/\b(DSH_DESKTOP_[A-Z_]+)\b/g)) {
    assert.ok(mdEnv.has(m[1]), `wsl.rs 的 env ${m[1]} 未登记 wsl-backend.md §1.2`);
  }
});

test('TA7-5b wsl-backend.md §2.1 载荷键 ↔ wsl.rs / wsl-backend crate 双向', () => {
  const jsonc = section(wslContract, '### 2.1 `wsl_config_get`', '### 2.2');
  const keys = [...jsonc.matchAll(/^\s*"([A-Za-z]+)":/gm)].map((m) => m[1]);
  assert.strictEqual(keys.length, 12, `契约载荷键数量异常: ${keys.length}`);
  for (const key of keys) {
    assert.ok(wslRs.includes(`"${key}"`) || wslBackendRs.includes(`"${key}"`), `实装缺契约载荷键 ${key}`);
  }
  // 反向：wsl.rs 载荷组装函数的键必须全部在契约里（jsonc 块 + §2.2 返回键）。
  const contractKeys = new Set([
    ...keys,
    ...[...section(wslContract, '### 2.2 `wsl_config_save`', '### 2.3').matchAll(/`?"?(ok|code|error|restartRequired)"?/g)].map((m) => m[1]),
  ]);
  const payloadFn = section(wslRs, 'fn wsl_config_payload', 'fn empty_status');
  for (const m of payloadFn.matchAll(/"([A-Za-z]+)":/g)) {
    assert.ok(contractKeys.has(m[1]), `wsl.rs 载荷键 ${m[1]} 未登记 wsl-backend.md`);
  }
});

test('TA7-5c wsl-backend.md §2.2 保存返回键 ↔ wsl.rs（ok/error/code/restartRequired）', () => {
  for (const key of ['"ok"', '"error"', '"code"', '"restartRequired"']) {
    assert.ok(wslRs.includes(key), `wsl.rs 缺保存返回键 ${key}`);
  }
});

test('TA7-5d wsl-backend.md §3 错误码 ↔ wsl-backend crate 常量双向', () => {
  const seg = section(wslContract, '## 3. 错误码', '## 4.');
  const md = new Set([...seg.matchAll(/`(E_WSL_[A-Z_]+)`/g)].map((m) => m[1]));
  assert.strictEqual(md.size, 5, `契约 WSL 码数量: ${md.size}`);
  const rs = new Set([...wslBackendRs.matchAll(/"(E_WSL_[A-Z_]+)"/g)].map((m) => m[1]));
  assert.deepStrictEqual(diff(md, rs), [], '契约有而 crate 缺的 WSL 码');
  assert.deepStrictEqual(diff(rs, md), [], 'crate 有而契约缺的 WSL 码');
});

test('TA7-5e wsl-backend.md §4.2 wslMode 布局旗标 ↔ sidecar 实装', () => {
  assert.ok(wslContract.includes('wslMode:true'), '契约 §4.2 应描述 wslMode 旗标');
  assert.ok(cliJs.includes('wslMode'), 'sidecar cli.js 缺 wslMode 旗标消费');
});

// ----------------------------------------------------------------------------
// 6. commit-plan §3 CHANGELOG 草案 ↔ 测试文件存在（软断言）
// ----------------------------------------------------------------------------

test('TA7-6 commit-plan §3 草案功能关键词 ↔ 测试文件存在（软断言，缺失记警告）', () => {
  const draft = section(commitPlan, '## 三、CHANGELOG 草案', '## 四、');
  const features = [
    { kw: ['会话完成通知', 'session-watch'], files: ['dsh-desktop/scripts/test/session-watcher.test.js', 'dsh-desktop/scripts/test/unit-session-watcher-cli.test.js'] },
    { kw: ['余额', 'balance'], files: ['dsh-desktop/scripts/test/unit-balance.test.js', 'dsh-desktop/scripts/test/unit-balance-scheduler.test.js'] },
    { kw: ['客户端更新链', 'sha256'], files: ['dsh-desktop/scripts/test/unit-github-release-assets.test.js', 'dsh-tauri/scripts/verify-update-sources.mjs'] },
    { kw: ['WSL 托管后端'], files: ['dsh-desktop/scripts/test/unit-wsl-backend.test.js', 'dsh-tauri/sidecar/wsl-mode.test.js'] },
    { kw: ['dsh-subagent-lens'], files: ['dsh-desktop/scripts/test/unit-dsh-subagent-lens.test.js'] },
    { kw: ['better-sidebar'], files: ['dsh-desktop/scripts/test/unit-better-sidebar-chunk-retry.test.js'] },
    { kw: ['file-drop'], files: ['dsh-desktop/scripts/test/unit-dsh-file-drop-attach.test.js'] },
    { kw: ['浮窗'], files: ['dsh-desktop/scripts/test/unit-float-window-client.test.js'] },
    { kw: ['设备授权'], files: ['dsh-desktop/scripts/test/unit-device-auth-guidance.test.js'] },
  ];
  let hit = 0;
  const misses = [];
  for (const f of features) {
    assert.ok(f.kw.some((k) => draft.includes(k)), `草案缺关键词 ${f.kw}（草案内容漂移？）`);
    const present = f.files.filter((file) => fs.existsSync(path.join(ROOT, file)));
    if (present.length) hit += 1;
    else misses.push(`${f.kw[0]} → 无任何对应文件`);
    // 文件级缺口（软）：有兄弟测试兜底也记一笔，供漂移清单。
    for (const file of f.files) {
      if (!fs.existsSync(path.join(ROOT, file))) console.warn(`[TA7-6] 草案提及的文件缺失（软）: ${file}`);
    }
  }
  // 软断言：≥80% 命中即绿；缺失项打印供漂移清单。
  if (misses.length) console.warn('[TA7-6] 草案功能无对应测试文件（软断言）:\n  - ' + misses.join('\n  - '));
  assert.ok(hit / features.length >= 0.8, `草案→测试覆盖率 ${(hit / features.length) * 100}% < 80%`);
});

// ----------------------------------------------------------------------------
// 7. bridge-api.md 53 方法表 ↔ bridge-shim.js dshDesktop 挂载（双向）
// ----------------------------------------------------------------------------

function parseMdMethodSurfaces() {
  const methodTables = bridgeApi.slice(0, bridgeApi.indexOf('## 3.')); // 只解析 §2 方法表
  const surfaces = new Set();
  const nsOf = (heading) => {
    const m = heading.match(/### 2\.\d+ `([A-Za-z]+)`/);
    return m ? m[1] : null; // null = 顶层 §2.1
  };
  let ns = null;
  for (const line of methodTables.split('\n')) {
    if (line.startsWith('## ')) { ns = null; continue; } // 章节（## 3. 事件表等）重置
    if (line.startsWith('### ')) { ns = nsOf(line); continue; }
    if (!line.startsWith('|') || line.includes('|---')) continue;
    const cells = line.split('|');
    if (cells.length < 3) continue;
    const sig = cells[2].trim();
    const m = sig.match(/^`([A-Za-z][A-Za-z0-9]*)\s*[(:]/);
    if (!m) continue;
    surfaces.add(ns ? `${ns}.${m[1]}` : m[1]);
  }
  return surfaces;
}

function parseShimSurfaces() {
  const start = shimJs.indexOf('var dshDesktop = {');
  assert.ok(start >= 0, '垫片缺 dshDesktop 对象');
  let depth = 0;
  let i = start + 'var dshDesktop = {'.length - 1; // 指向 '{'
  const surfaces = new Set();
  const hasChildren = new Set();
  let lastTop = null;
  let expectKey = true;
  const ident = /[A-Za-z_$][A-Za-z0-9_$]*/y;
  for (; i < shimJs.length; i++) {
    const c = shimJs[i];
    if (c === '/' && shimJs[i + 1] === '/') { // 行注释：跳到行尾（防注释里的 {}/, 干扰深度）
      const nl = shimJs.indexOf('\n', i);
      if (nl < 0) break;
      i = nl;
      continue;
    }
    if (c === '{') { depth += 1; expectKey = true; continue; }
    if (c === '}') { depth -= 1; if (depth === 0) break; continue; }
    if (c === ',') { expectKey = true; continue; }
    if (expectKey && /[A-Za-z_$]/.test(c)) {
      ident.lastIndex = i;
      const m = ident.exec(shimJs);
      const after = shimJs.slice(ident.lastIndex).match(/^\s*[:,]/);
      if (m && after) {
        if (depth === 1) { lastTop = m[0]; surfaces.add(m[0]); }
        else if (depth === 2 && lastTop) { hasChildren.add(lastTop); surfaces.add(`${lastTop}.${m[0]}`); }
        expectKey = false;
      }
    } else if (!/\s/.test(c)) {
      expectKey = false;
    }
  }
  // 顶层键 = 命名空间以外的字段/方法；命名空间只以 ns.method 形态入面。
  for (const ns of hasChildren) surfaces.delete(ns);
  return surfaces;
}

test('TA7-7a bridge-api.md 方法表（53）→ 垫片挂载：差集为空', () => {
  const md = parseMdMethodSurfaces();
  assert.strictEqual(md.size, 53, `契约方法计数: ${md.size}`);
  const missing = diff(md, parseShimSurfaces());
  assert.deepStrictEqual(missing, [], '契约有而垫片缺的方法/字段');
});

test('TA7-7b 垫片挂载 → bridge-api.md 方法表：反向差集为空（垫片私货方法须先入契约）', () => {
  const extra = diff(parseShimSurfaces(), parseMdMethodSurfaces());
  assert.deepStrictEqual(extra, [], '垫片挂载了契约外的方法/字段');
});
