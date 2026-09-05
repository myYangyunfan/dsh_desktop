'use strict';

// ---------------------------------------------------------------------------
// TA16 —— 用户可见面 golden 快照测试
//
// 目的：任何 UI/文案改动（loading/recovery 壳页可见文本、垫片 ⋯ 菜单全状态
// 文案、错误文案常量、托盘 tooltip+菜单项序、桌面通知模板）都必须经过显式
// diff——本测试从源码实时提取渲染产物，与 ta16-snapshots/*.json 金样逐项比对，
// 不一致即红；开发者 review 后用环境开关重写快照：
//
//   UPDATE_SNAPSHOTS=1 npm test              （Git Bash / Linux / macOS）
//   set UPDATE_SNAPSHOTS=1 && npm test       （cmd）
//   $env:UPDATE_SNAPSHOTS=1; npm test        （PowerShell）
//
// 快照 JSON 头部 _meta.updateFlow 同步记录该流程。金样只重写不手编：
// 永远用上面的开关从源码再生成，保证「源码 = 快照」。
// ---------------------------------------------------------------------------

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SNAP_DIR = path.join(__dirname, 'ta16-snapshots');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const UPDATE = !!process.env.UPDATE_SNAPSHOTS;

// ---- 源文件路径（快照 _meta.sources 同款）--------------------------------
const SRC = {
  pages: 'dsh-tauri/src-tauri/src/app/src/pages.rs',
  shim: 'dsh-tauri/src-tauri/crates/bridge/dist/bridge-shim.js',
  menu: 'dsh-tauri/src-tauri/src/app/src/commands/menu.rs',
  updater: 'dsh-tauri/src-tauri/src/app/src/commands/updater_client.rs',
  wsl: 'dsh-tauri/src-tauri/src/app/src/commands/wsl.rs',
  notify: 'dsh-tauri/src-tauri/src/app/src/session_notify.rs',
  lib: 'dsh-tauri/src-tauri/src/app/src/lib.rs',
  windows: 'dsh-tauri/src-tauri/src/app/src/windows.rs',
  watcher: 'dsh-desktop/session-watcher.js',
  patchAdapters: 'dsh-desktop/scripts/lib/patch-adapters.js',
};

function readSrc(key) {
  const p = path.join(REPO_ROOT, SRC[key]);
  return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
}

// ---- 提取工具 --------------------------------------------------------------

/// Rust 文件实现段（首个 #[cfg(test)] mod 测试模块之前——测试断言串不进金样；
/// 仅带 mod 的形态才算测试模块，lib.rs 顶部 cfg(test) static 等不算）。
function implSeg(rs) {
  return rs.split(/#\[cfg\(test\)\]\s*\n\s*(?:pub\(crate\) )?mod /)[0];
}

/// 双引号字符串字面量（含 Han），带行号。
function rsHanLiterals(rs) {
  const out = [];
  const lines = rs.split('\n');
  lines.forEach((line, i) => {
    const stripped = line.replace(/^\s*\/\/.*$/, ''); // 去整行注释
    const re = /"([^"\\]*(?:\\.[^"\\]*)*)"/g;
    let m;
    while ((m = re.exec(stripped))) {
      if (/[\u4e00-\u9fff]/.test(m[1])) out.push({ line: i + 1, text: m[1] });
    }
  });
  return out;
}

/// 单引号字符串字面量（含 Han），带行号（JS 用）。
function jsHanLiterals(js, seg) {
  const out = [];
  const text = seg != null ? seg : js;
  const offset = seg != null ? js.slice(0, js.indexOf(seg)).split('\n').length - 1 : 0;
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    const stripped = line.replace(/^\s*\/\/.*$/, '');
    const re = /'([^'\\]*(?:\\.[^'\\]*)*)'/g;
    let m;
    while ((m = re.exec(stripped))) {
      if (/[\u4e00-\u9fff]/.test(m[1])) out.push({ line: offset + i + 1, text: m[1] });
    }
  });
  return out;
}

// ---- 1. LOADING_HTML / RECOVERY_HTML 可见文本 ------------------------------

function extractRustRawString(rs, name) {
  const re = new RegExp(`pub const ${name}: &str = r#"([\\s\\S]*?)"#;`);
  const m = rs.match(re);
  if (!m) throw new Error(`${name} 未找到`);
  return m[1];
}

/// 剥标签后的可见文本行集合（去 style/svg/script，剥标签，逐行 trim）。
function visibleTextLines(html) {
  let s = html
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<svg[\s\S]*?<\/svg>/g, '')
    .replace(/<script[\s\S]*?<\/script>/g, '');
  // title/aria-label 属性值是用户可见的（悬停提示/读屏）——先摘出来再剥标签。
  const attrs = [];
  const attrRe = /(?:title|aria-label)="([^"]+)"/g;
  let m;
  while ((m = attrRe.exec(s))) attrs.push(m[1]);
  s = s.replace(/<[^>]+>/g, '\n');
  const lines = s.split('\n').map((l) => l.trim()).filter(Boolean);
  return { staticLines: lines, attrTexts: attrs };
}

/// <script> 段内的中文串（JS 动态渲染文案：标题轮次/失败终态/步骤名映射…）。
function scriptHanStrings(html) {
  const out = [];
  const re = /<script>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    for (const lit of jsHanLiterals(m[1])) out.push(lit.text);
  }
  return [...new Set(out)];
}

function buildPagesSnapshot() {
  const rs = readSrc('pages');
  const snap = {};
  for (const name of ['LOADING_HTML', 'RECOVERY_HTML']) {
    const html = extractRustRawString(rs, name);
    const vis = visibleTextLines(html);
    snap[name] = {
      titleTag: (html.match(/<title>([^<]+)<\/title>/) || [])[1] || null,
      staticVisibleLines: vis.staticLines,
      attrVisibleTexts: vis.attrTexts,
      scriptStrings: scriptHanStrings(html),
    };
  }
  return snap;
}

// ---- 2. 垫片 ⋯ 菜单全状态文案 ----------------------------------------------

function fnSeg(js, startMarker, endMarker) {
  const seg = js.split(startMarker)[1];
  if (seg == null) throw new Error(`未找到段 ${startMarker}`);
  return endMarker ? seg.split(endMarker)[0] : seg;
}

function buildShimMenuSnapshot() {
  const js = readSrc('shim');
  // 菜单项序（renderMenu 的 menuItemHtml(act, 'label', …) 依序提取）。
  const renderSeg = fnSeg(js, 'function renderMenu()', 'function closeMenu()');
  const items = [];
  const re = /menuItemHtml\('([^']+)',\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(renderSeg))) items.push({ act: m[1], label: m[2] });
  // 更新行全状态文案（updRowHtml 状态机内的中文字面量，依序）。
  const updSeg = fnSeg(js, 'function updRowHtml()', 'function startClientUpdateInstall');
  const updLabels = jsHanLiterals(js, updSeg).map((x) => x.text);
  // 就地反馈/复制按钮等其他菜单区文案。
  const miscSeg = fnSeg(js, 'var menuPanel = null', 'function closeMenu()');
  const misc = [...new Set(jsHanLiterals(js, miscSeg).map((x) => x.text))];
  return { menuItems: items, updateRowLabels: updLabels, otherMenuTexts: misc };
}

// ---- 3. 错误文案常量清单 ----------------------------------------------------

function buildErrorMessagesSnapshot() {
  const snap = {};
  // menu.rs（updater 错误归一 + 菜单动作错误 + devtools 降级）。
  snap.menuRs = rsHanLiterals(implSeg(readSrc('menu')));
  // updater_client.rs（Display/ToBridge 文案）。
  snap.updaterClientRs = rsHanLiterals(implSeg(readSrc('updater')));
  // wsl.rs 校验文案。
  snap.wslRs = rsHanLiterals(implSeg(readSrc('wsl')));
  // session_notify.rs（watcher 生命周期日志文案 + 错误）。
  snap.sessionNotifyRs = rsHanLiterals(implSeg(readSrc('notify')));
  // lib.rs（boot 路由/日志指引 fallback 页文案）。
  snap.libRs = rsHanLiterals(implSeg(readSrc('lib')));
  // 浮窗看门狗（windows.rs FLOAT_WATCHDOG_SCRIPT 内文案）。
  const win = readSrc('windows');
  const wdSeg = fnSeg(win, 'const FLOAT_WATCHDOG_SCRIPT: &str = r#"', '"#;');
  snap.floatWatchdog = [...new Set(jsHanLiterals(win, wdSeg).map((x) => x.text))];
  // watcher（session-watcher.js 通知组装 + 日志文案）。
  snap.watcherJs = jsHanLiterals(readSrc('watcher'));
  return snap;
}

// ---- 4. 托盘 tooltip + 菜单项序 ---------------------------------------------

function buildTraySnapshot() {
  const lib = readSrc('lib');
  const seg = fnSeg(lib, 'fn setup_tray', 'std::mem::forget');
  const items = [];
  const re = /\.text\("([^"]+)",\s*"([^"]+)"\)/g;
  let m;
  while ((m = re.exec(seg))) items.push({ id: m[1], label: m[2] });
  const tooltip = (seg.match(/\.tooltip\("([^"]+)"\)/) || [])[1] || null;
  return { tooltip, menuItems: items };
}

// ---- 5. 桌面通知标题/正文模板（含 fallback）----------------------------------

function buildNotificationsSnapshot() {
  const snap = {};
  // session_notify.rs notification_text 兜底（Electron `info.title || '…'` 对译）。
  const notify = implSeg(readSrc('notify'));
  const fn = fnSeg(notify, 'pub fn notification_text', 'pub fn valid_jump_session_id');
  snap.turnEndFallbacks = (fn.match(/unwrap_or\("([^"]+)"\)/g) || [])
    .map((s) => s.slice('unwrap_or("'.length, -2));
  // 垫片 shellNotify 模板（发现新版本/已下载/已更新）。
  const js = readSrc('shim');
  const templates = [];
  const re = /shellNotify\(([^;]+?)\);/g;
  let m;
  while ((m = re.exec(js))) {
    const lits = [];
    const lre = /'([^']*)'/g;
    let lm;
    while ((lm = lre.exec(m[1]))) lits.push(lm[1]);
    templates.push(lits);
  }
  snap.shimShellNotifyTemplates = templates;
  // 单实例对话框（lib.rs）。
  const lib = implSeg(readSrc('lib'));
  snap.singleInstanceDialog = (lib.match(/"([^"]*已在运行[^"]*)"/) || [])[1] || null;
  return snap;
}

// ---- 快照读写 + 比对 ---------------------------------------------------------

function meta(sources, note) {
  return {
    _meta: {
      updateFlow:
        '快照由 ta16-golden.test.js 从源码提取生成，禁止手编；' +
        '文案有意变更时执行 UPDATE_SNAPSHOTS=1 npm test（在 dsh-desktop 目录）重写后随代码一起 review 提交。',
      note: note || '',
      sources,
    },
  };
}

const SNAPSHOTS = {
  'pages-visible-text.json': [buildPagesSnapshot, [SRC.pages], 'loading/recovery 壳页可见文本全集（剥标签行集 + title/aria 属性 + script 动态文案）'],
  'shim-menu-text.json': [buildShimMenuSnapshot, [SRC.shim], '垫片 ⋯ 菜单：菜单项序 + 客户端更新行全状态文案 + 其他菜单区文案'],
  'error-messages.json': [buildErrorMessagesSnapshot, [SRC.menu, SRC.updater, SRC.wsl, SRC.notify, SRC.lib, SRC.windows, SRC.watcher], '错误文案常量清单（含 file:line）'],
  'tray.json': [buildTraySnapshot, [SRC.lib], '托盘 tooltip + 菜单项序'],
  'notifications.json': [buildNotificationsSnapshot, [SRC.notify, SRC.shim, SRC.lib], '桌面通知标题/正文模板（含 fallback）'],
};

/// 收集所有快照的用户可见文本（RV10 minisign 基线断言用）。
function allVisibleTexts() {
  const texts = [];
  for (const [file, [build]] of Object.entries(SNAPSHOTS)) {
    const data = JSON.parse(fs.readFileSync(path.join(SNAP_DIR, file), 'utf8'));
    (function walk(v) {
      if (typeof v === 'string') texts.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    })(data);
  }
  return texts;
}

/**
 * 递归剥掉 `line` 字段（仅供比对）。
 *
 * 为什么不比行号：本套快照的定义是「用户可见面」，而行号不是用户可见的。
 * 把 file:line 纳入 deepEqual 后，lib.rs 里任何一处无关插入都会让 40 条
 * 记录集体位移、金样集体红——真信号（新文案）被埋在一堆噪声 diff 里。
 * 实测：2026-09-05 新增「一键重启」托盘项 + 1 行 Linux 日志，前者被后者
 * 的行号漂移盖住，分诊成本远高于变更本身。
 * 行号仍写进快照文件（人定位用），只是不参与相等判定；文案本身一字不改地比对。
 */
function withoutLineFields(v) {
  if (Array.isArray(v)) return v.map(withoutLineFields);
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      if (k === 'line') continue;
      out[k] = withoutLineFields(val);
    }
    return out;
  }
  return v;
}

for (const [file, [build, sources, note]] of Object.entries(SNAPSHOTS)) {
  test(`TA16 golden: ${file}`, () => {
    const current = build();
    const target = path.join(SNAP_DIR, file);
    if (UPDATE) {
      fs.mkdirSync(SNAP_DIR, { recursive: true });
      const out = { ...meta(sources, note), ...current };
      fs.writeFileSync(target, JSON.stringify(out, null, 2) + '\n', 'utf8');
      return;
    }
    assert.ok(fs.existsSync(target), `金样缺失：${file}（用 UPDATE_SNAPSHOTS=1 npm test 生成）`);
    const golden = JSON.parse(fs.readFileSync(target, 'utf8'));
    const { _meta, ...goldenPayload } = golden; // _meta 是头注释，不参与比对
    assert.deepEqual(withoutLineFields(current), withoutLineFields(goldenPayload),
      `用户可见面与金样不一致：${file}（有意变更请 review 后执行 UPDATE_SNAPSHOTS=1 npm test 重写）`);
  });
}

// ---- RV10 文案修正基线校验 ---------------------------------------------------

test('TA16 RV10 基线：设备风控指引文案含「设置 → 模型」', () => {
  const src = readSrc('patchAdapters');
  const blk = src.split('function deviceAuthGuidanceBlock')[1];
  assert.ok(blk, 'patch-adapters.js deviceAuthGuidanceBlock 存在');
  assert.ok(blk.includes('设置 → 模型'), '指引必须指向「设置 → 模型」页');
  assert.ok(blk.includes('chat.deepseek.com'), '指引必须含重新登录入口 chat.deepseek.com');
  assert.ok(blk.includes('重装客户端或反复点「重试」无效'), '指引必须声明重装/重试无效');
});

test('TA16 RV10 基线：用户可见文案不含 minisign', () => {
  const texts = allVisibleTexts();
  const hit = texts.filter((t) => t.includes('minisign'));
  assert.deepEqual(hit, [], 'minisign 是签名实现细节，不得出现在用户可见文案');
});
