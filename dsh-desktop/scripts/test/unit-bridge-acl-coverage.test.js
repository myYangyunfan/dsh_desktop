'use strict';

// 桥方法面 ⊆ ACL 放行清单（1.0.9 补课：注册了命令但远程页调不到 = 静默死，node --test）。
//
// 背景：Tauri 2 不为 app command 自动生成权限，远程 origin（http://127.0.0.1 的内核
// Web UI）调用桥 command 必须有 capability 引用 + `permissions/bridge.toml` 显式放行。
// 于是「在 commands.rs 注册 + 在 bridge-shim.js 暴露」全都做完、测试全绿，页面上的
// `invoke('x')` 仍会被 ACL 拒绝——错误只在真机点下按钮的那一刻出现。
// `recovery_safe_mode` 就是这样漏过一次（安全模式按钮点不动）。
//
// 判据：页面侧出现的每个 command 名必须 ① 在 CHANNELS 登记 ② 在 bridge.toml 的
// allow 清单里。页面侧来源两条：桥垫片（bridge-shim.js）与注入的
// dsh-web-frontend/dist/index.html（客户端兜底看门狗，它就跑在远程页里）。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { transformKernelBootWatchdog, markers } = require('../lib/patch-adapters');
const { KERNEL_WEB_INDEX_REL } = require('../lib/patch-target-resolver');

const TAURI = path.join(__dirname, '..', '..', '..', 'dsh-tauri', 'src-tauri');
const SHIM = path.join(TAURI, 'crates', 'bridge', 'dist', 'bridge-shim.js');
const COMMANDS_RS = path.join(TAURI, 'crates', 'bridge', 'src', 'commands.rs');
const ACL_TOML = path.join(TAURI, 'src', 'app', 'permissions', 'bridge.toml');
const INDEX_HTML = path.join(__dirname, '..', '..', 'node_modules', '@deepseek-ai', KERNEL_WEB_INDEX_REL);

// 已知缺口（2026-11-11 实测登记，非本次修）：
// 这三条在 CHANNELS 登记、也在 bridge-shim 暴露，但**没有**进 bridge.toml 的 allow
// 清单 —— 远程页调用会被 ACL 拒。全仓 `assets/plugins/**` 无任何页面侧调用方
// （`guard.action` / `listDeadEntries` 只出现在注解与 Node 侧工具链里），所以眼下是
// 潜伏缺口而不是用户可见缺陷。要动它们必须在「页面真的开始调用」时同批加 ACL，
// 不许把它们当成可以永远留着的例外。
const KNOWN_ACL_GAPS = new Set([
  'plugin_list_dead_entries',
  'plugin_remove_dead_entries',
  'guard_action',
]);

function aclAllowed() {
  const toml = fs.readFileSync(ACL_TOML, 'utf8');
  const out = new Set();
  for (const line of toml.split('\n')) {
    const m = line.match(/^\s*"([a-z0-9_]+)"\s*,?\s*$/);
    if (m) out.add(m[1]);
  }
  return out;
}

/** CHANNELS 登记行有三族写法：`m(` / `mp(` / `mp3(`，第二个字符串字面量是 command 名。 */
function registeredCommands() {
  const rs = fs.readFileSync(COMMANDS_RS, 'utf8');
  const out = new Set();
  for (const line of rs.split('\n')) {
    const m = line.match(/^\s*[a-z][a-z0-9_]*\(\s*"[^"]+"\s*,\s*"([a-z0-9_]+)"\s*,\s*(?:true|false)\s*,\s*(?:true|false)\)/);
    if (m) out.add(m[1]);
  }
  return out;
}

function pageCommands(src) {
  const out = new Set();
  const re = /(?:invoke|call|send)\(\s*'([a-z0-9_]+)'/g;
  let m;
  while ((m = re.exec(src)) !== null) out.add(m[1]);
  return out;
}

test('bridge-shim.js 暴露的 command 必须都在 CHANNELS 与 ACL 放行清单里（已知缺口除外）', () => {
  const used = pageCommands(fs.readFileSync(SHIM, 'utf8'));
  assert.ok(used.size > 20, `垫片面 command 提取失败（得 ${used.size} 条）`);
  const reg = registeredCommands();
  const acl = aclAllowed();
  assert.ok(reg.size >= 35, `CHANNELS 登记行提取失败（得 ${reg.size} 条）`);
  assert.ok(acl.size >= 30, `ACL 放行清单提取失败（得 ${acl.size} 条）`);

  const unregistered = [...used].filter((c) => !reg.has(c));
  assert.deepEqual(unregistered, [], `垫片调用了未注册的 command（真机必失败）: ${unregistered}`);

  const denied = [...used].filter((c) => !acl.has(c) && !KNOWN_ACL_GAPS.has(c));
  assert.deepEqual(denied, [],
    `垫片调用了未放行的 command（远程页会被 ACL 拒，按钮/入口静默失效）: ${denied}`);
});

test('已知缺口一旦被 ACL 补上，就必须从例外清单里删掉（防例外腐烂）', () => {
  const acl = aclAllowed();
  const fixed = [...KNOWN_ACL_GAPS].filter((c) => acl.has(c));
  assert.deepEqual(fixed, [], `这些已放行，从 KNOWN_ACL_GAPS 移除: ${fixed}`);
});

test('注入的 index.html 看门狗调用的 command 同样必须放行（安全模式按钮靠这条）', (t) => {
  if (!fs.existsSync(INDEX_HTML)) return t.skip('dev 树缺 dsh-web-frontend dist/index.html');
  const raw = fs.readFileSync(INDEX_HTML, 'utf8');
  const r = transformKernelBootWatchdog(raw, 'index.html');
  assert.ok(r.status === 'changed' || r.status === 'already');
  const served = r.status === 'changed' ? r.src : raw;
  assert.ok(served.includes(markers.KERNEL_BOOT_WATCHDOG_MARKER), '看门狗必须在位');

  const used = pageCommands(served);
  assert.ok(used.has('page_error'), `看门狗必须走 page_error 上报: ${[...used]}`);
  assert.ok(used.has('recovery_safe_mode'), `看门狗必须能触发安全模式: ${[...used]}`);

  const reg = registeredCommands();
  const acl = aclAllowed();
  for (const cmd of used) {
    assert.ok(reg.has(cmd), `看门狗调用了未注册的 command: ${cmd}`);
    assert.ok(acl.has(cmd), `看门狗调用了未放行的 command（远程页会被 ACL 拒）: ${cmd}`);
  }
});

test('安全模式链路三件套必须在位（命令注册 / ACL 放行 / 垫片面）', () => {
  assert.ok(registeredCommands().has('recovery_safe_mode'), 'commands.rs 必须注册 recovery_safe_mode');
  assert.ok(aclAllowed().has('recovery_safe_mode'), 'bridge.toml 必须放行 recovery_safe_mode');
  assert.ok(fs.readFileSync(SHIM, 'utf8').includes("call('recovery_safe_mode')"), '垫片必须暴露 recovery.safeMode');
});
