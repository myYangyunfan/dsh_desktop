'use strict';

/**
 * DSH Desktop（Tauri 版）—— Node sidecar CLI
 * ============================================
 *
 * Rust 壳的单一 sidecar 入口。全部子命令复用 `dsh-desktop/` 的纯 Node 模块
 * （scripts/integration、scripts/plugin-manager-*、scripts/desktop-*、updater、
 * session-watcher……均为 electron-free，Phase 0 已核验），**零逻辑重写**。
 *
 * 协议：stdout 末行输出单个 JSON（对象或数组）；人类可读日志走 stderr。
 * 退出码：0 = 成功；2 = 用法错误；1 = 执行失败（stdout JSON 带 ok:false / error）。
 *
 * 用法（vendor node）：
 *   node cli.js boot [--app-dir <dsh-desktop>] [--home <~/.dsh>]
 *   node cli.js plugin-list | plugin-set-enabled <id> <0|1>
 *   node cli.js plugin-uninstall <id> | plugin-restore <id>
 *   node cli.js plugin-check-updates | plugin-update <id>
 *   node cli.js diag-run | diag-export [--out <file>] | diag-validate
 *   node cli.js backup-export <label> <out-file>
 *   node cli.js backup-restore-preview <in-file>
 *   node cli.js backup-restore-apply <in-file> <token>
 *   node cli.js diag-order | diag-order-apply <json> | diag-remove-bundle <names-json>
 *   node cli.js balance-fetch [--app-dir <dsh-desktop>] [--home <~/.dsh>]
 *                             # 余额单轮取数（stdout 末行 = 事件载荷 JSON；
 *                             # 轮询编排在 Rust 侧 commands/balance.rs）
 *
 * 环境变量：
 *   DSH_TAURI_APP_DIR  dsh-desktop 目录（默认：脚本位置 ../../../../dsh-desktop）
 *   DSH_HOME           dsh home（默认 ~/.dsh，与内核一致）
 *   DSH_TAURI_USERDATA 桌面壳数据目录（默认 %APPDATA%/dsh-desktop）
 *
 * WSL 托管模式（boot 链 WSL 半边，语义对齐 Electron wsl-backend.js + main.js）：
 *   检测序（wsl-mode.js detectWslBackend）——非 Windows 恒 local →
 *   DSH_DESKTOP_BACKEND=local 显式本地 → DSH_WSL_MODE=1 模拟（Rust 设置页
 *   解锁前的临时缝）或 DSH_DESKTOP_BACKEND=wsl → settings.json 的
 *   backend='wsl'（wslDistro/wslInstallDir 同文件）→ 默认 local。
 *   生效后 DSH_HOME 等价于 WSL 安装目录的 UNC 形态
 *   （\\wsl.localhost\<distro><installDir>，见 wsl-paths.js），boot 五步全部
 *   经 UNC 写穿：sync（companion → UNC profile）、presets（→ UNC agent 包，
 *   未就绪跳过）、patches（ctx.wslMode=true → wslLayout 双根）、preflight
 *   （nm-roots 追加 agent 根）。repairProfileFallback / koffi 预检在 WSL 模式
 *   跳过（junction 语义不适用于 Linux 内核自管的 symlink；win32 预编译 koffi
 *   与 Linux 内核无关——原生模块由 WSL 内 npm 安装的 linux 变体提供）。
 *   解析失败回落 local 继续启动（Electron issue #54 同语义）。
 */

const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const wslMode = require('./wsl-mode');

// ---------------------------------------------------------------------------
// 路径与公共上下文
// ---------------------------------------------------------------------------

function resolveAppDir(explicit) {
  if (explicit) return path.resolve(explicit);
  if (process.env.DSH_TAURI_APP_DIR) return path.resolve(process.env.DSH_TAURI_APP_DIR);
  // sidecar/cli.js → dsh-tauri/sidecar → dsh-tauri → 仓库根 → dsh-desktop
  return path.resolve(__dirname, '..', '..', 'dsh-desktop');
}

function resolveHome(explicit) {
  if (explicit) return path.resolve(explicit);
  if (process.env.DSH_HOME) return path.resolve(process.env.DSH_HOME);
  return path.join(os.homedir(), '.dsh');
}

function resolveUserData() {
  if (process.env.DSH_TAURI_USERDATA) return path.resolve(process.env.DSH_TAURI_USERDATA);
  // 与 Rust shell-core paths.rs 的回退链逐字对齐（两侧不一致 = settings 双写）：
  // APPDATA（win32）→ XDG_CONFIG_HOME → HOME 平台数据根
  // （darwin: ~/Library/Application Support；其余 unix: ~/.config）。
  // 此前非 Windows 恒落 ~/AppData/Roaming（虚构路径）。
  if (process.platform === 'win32') {
    const appdata = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appdata, 'dsh-desktop');
  }
  if (process.env.XDG_CONFIG_HOME) return path.join(process.env.XDG_CONFIG_HOME, 'dsh-desktop');
  const home = os.homedir();
  const root = process.platform === 'darwin'
    ? path.join(home, 'Library', 'Application Support')
    : path.join(home, '.config');
  return path.join(root, 'dsh-desktop');
}

function mods_node(appDir) {
  // vendor 目录按平台分发双二进制（node.exe / node）；按平台选主名，缺失时
  // 另一名兜底——此前硬编码 node.exe，非 Windows 上 koffi 预检必 ENOENT。
  const dir = path.join(appDir, 'vendor', 'node');
  const primary = path.join(dir, process.platform === 'win32' ? 'node.exe' : 'node');
  if (fs.existsSync(primary)) return primary;
  const alt = path.join(dir, process.platform === 'win32' ? 'node' : 'node.exe');
  return fs.existsSync(alt) ? alt : primary;
}

const log = (msg) => process.stderr.write('[sidecar] ' + msg + '\n');

function emit(value) {
  process.stdout.write(JSON.stringify(value === undefined ? null : value) + '\n');
}

// ---------------------------------------------------------------------------
// 模块装载（统一入口，便于注入 appDir）
// ---------------------------------------------------------------------------

function loadModules(appDir) {
  // Electron 版 main.js 顶部 require 的相对路径在这里以 appDir 为根解析。
  const req = (rel) => require(path.join(appDir, rel));
  return {
    integration: req('scripts/integration'),
    presetInstaller: req('scripts/install-minimal-win-preset'),
    pluginManagerPatch: req('scripts/plugin-manager-patch'),
    pluginManagerUpdate: req('scripts/plugin-manager-update'),
    companionPlugins: req('scripts/lib/companion-plugins'),
    profileReconcile: req('scripts/lib/profile-reconcile'),
    profilePatchHeal: req('profile-patch-heal'),
    patchIo: req('scripts/lib/patch-io'),
    githubReleaseAssets: req('scripts/lib/github-release-assets'),
    desktopDiagnostics: req('scripts/desktop-diagnostics'),
    desktopBackup: req('scripts/desktop-backup'),
    desktopOrdering: req('scripts/desktop-ordering'),
    desktopValidity: req('scripts/desktop-validity'),
    // #155 根因二：patch 文本 YAML 安全化（裸 @ 包名补引号）唯一实现在
    // scripts/plugin-core/lib/patch-surgery.js（sidecar 与同步器共用）。
    patchSurgery: req('scripts/plugin-core/lib/patch-surgery'),
     sessionWatcher: req('session-watcher'),
    pluginGuard: req('plugin-guard'),
  };
}

/**
 * settings 存取（原 updater.loadSettings/saveSettings 内联——updater.js
 * 随 Electron 壳退役已删（6ff0cc8），但 T2 回归测试抓到 sidecar 仍
 * require 导致 boot 链全断。逻辑逐字保留：原子写+rename+3 次重试。
 */
function loadSettingsInline(ctx) {
  const file = path.join(ctx.userDataDir, 'settings.json');
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return {}; }
}
function saveSettingsInline(ctx, s) {
  const file = path.join(ctx.userDataDir, 'settings.json');
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); } catch {}
  const tmp = file + '.tmp-' + process.pid;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      fs.writeFileSync(tmp, JSON.stringify(s, null, 2) + String.fromCharCode(10));
      fs.renameSync(tmp, file);
      return true;
    } catch (err) {
      try { fs.rmSync(tmp, { force: true }); } catch {}
      if (attempt === 2) process.stderr.write('[sidecar] 保存 settings 失败: ' + err.message);
      return false;
    }
  }
  return false;
}

/** 造 settings 存取。 */
function makeSettingsStore(mods, userDataDir) {
  const ctx = { userDataDir };
  return {
    load: () => loadSettingsInline(ctx),
    save: (s) => saveSettingsInline(ctx, s),
  };
}

/**
 * WSL 模式下定位 dsh 安装锚点包（sync-companion-plugins.js findDshPackageDir
 * 的前三候选同款，home 为 UNC 形态）：agent（wsl-backend 布局）→ profile
 * fallback → home 直挂。定位不到返回 ''（reconcile 按无锚点处理：不预写
 * 核心 bundle，绝不拿 Windows 本地包冒充 WSL 侧锚点）。
 */
function findWslDshPackageDir(home) {
  const isDsh = (dir) => {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      return pkg && pkg.name === '@deepseek-ai/dsh' ? dir : '';
    } catch { return ''; }
  };
  for (const dir of [
    path.join(home, 'agent', 'node_modules', '@deepseek-ai', 'dsh'),
    path.join(home, 'profiles', 'node_modules', '@deepseek-ai', 'dsh'),
    path.join(home, 'node_modules', '@deepseek-ai', 'dsh'),
  ]) {
    if (isDsh(dir)) return dir;
  }
  return '';
}

/**
 * 解析后端模式上下文（boot / koffi-preflight 等启动链子命令共用）。
 * @returns {Promise<{backend:'local'|'wsl', home:string, wsl:Object|null, fallbackReason?:string}>}
 *   wsl 模式 home = UNC 形态安装目录（effectiveDshHome 语义）；WSL 配置
 *   解析失败回落 local（Electron issue #54：配置错误不阻断启动）。
 */
async function resolveBackendCtx({ appDir, home, userDataDir }) {
  let settings = {};
  try { settings = loadSettingsInline({ userDataDir }); } catch { settings = {}; }
  try {
    const wsl = await wslMode.resolveWslBackend({ env: process.env, settings, platform: process.platform });
    if (wsl) return { backend: 'wsl', home: wsl.uncHome, wsl };
    return { backend: 'local', home, wsl: null };
  } catch (err) {
    const reason = String((err && err.message) || err);
    log('WSL 托管模式解析失败，回落本地模式继续启动: ' + reason);
    return { backend: 'local', home, wsl: null, fallbackReason: reason };
  }
}

/** 造 integration 门面（DI 面对齐 main.js ensurePluginIntegration 的注入）。 */
function makeIntegration(mods, { appDir, home, userDataDir, wsl = null }) {
  const settings = makeSettingsStore(mods, userDataDir);
  let yamlTried = false;
  let yamlDialect = null;
  const loadYaml = () => {
    if (yamlTried) return yamlDialect;
    yamlTried = true;
    const parse = mods.profileReconcile.createEntryListYamlParser();
    yamlDialect = parse ? { load: (content) => parse(content) } : null;
    return yamlDialect;
  };
  return mods.integration.createPluginIntegration({
    // WSL 模式：home = UNC 安装目录（effectiveDshHome），插件同步 / 补丁 /
    // 预检全部经 UNC 写穿；patch-target-resolver 按 wslMode 切 wslLayout。
    getHome: () => home,
    appDir,
    getUserDataDir: () => userDataDir,
    wslMode: () => !!wsl,
    log,
    loadYaml,
    loadSettings: settings.load,
    saveSettings: settings.save,
    // WSL 模式锚点 = WSL 内 dsh 包（UNC）；本地模式 = payload 内置包
    // （main.js dshPackageJson 同式）。
    getInstallAnchorDir: wsl
      ? () => findWslDshPackageDir(home)
      : () => path.dirname(path.join(appDir, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')),
    onManifestResetRecovered: (ids) => log('manifest 重置恢复: ' + JSON.stringify(ids)),
    onHealReset: (kind, backup) => log('heal 重置(' + kind + '): ' + backup),
    hostDetectors: { openPath: () => true },
  });
}

// ---------------------------------------------------------------------------
// 插件管理（逻辑等价迁移自 main.js pluginManager* 内联实现，依赖模块共用）
// ---------------------------------------------------------------------------

/** 造 plugin-guard 实例（DI 对齐 main.js ensureGuard；纯 Node，electron-free）。 */

function makeGuard(c) {
  return c.mods.pluginGuard.createGuard({
    getHome: () => c.home,
    getProfile: () => 'web',
    dshBin: () => path.join(c.appDir, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
    log: (topic, msg) => process.stderr.write('[' + topic + '] ' + msg + '\n'),
  });
}
function createPluginManager(mods, { appDir, home }) {
  const { COMPANION_PLUGINS } = mods.companionPlugins;
  const { togglePluginInPatch, setPluginRemoved } = mods.pluginManagerPatch;
  // 无效条目体检 + 一键清理（补丁层唯一实现在 patch-surgery，经 plugin-manager-patch 再导出）。
  const { listDeadEntries: pmListDeadEntries, removeDeadEntriesById: pmRemoveDeadEntriesById } = mods.pluginManagerPatch;
  const { writeFileAtomic } = mods.patchIo;
  const { selectReleaseAsset, npmLatestUrl, githubReleaseApiUrl, githubAssetDownloadUrl, verifyIntegrity, compareVersions, findPackageRoot } = mods.pluginManagerUpdate;
  const https = require('node:https');

  const profileDir = () => path.join(home, 'profiles', 'web');

  let yamlTried = false, yamlDialect = null;
  function loadYaml() {
    if (yamlTried) return yamlDialect;
    yamlTried = true;
    const parse = mods.profileReconcile.createEntryListYamlParser();
    yamlDialect = parse ? { load: (c) => parse(c) } : null;
    return yamlDialect;
  }

  function readPatch() {
    const file = path.join(profileDir(), 'cordis.patch.yml');
    let text = '';
    try { text = fs.readFileSync(file, 'utf8'); } catch {}
    const yaml = loadYaml();
    if (!yaml) return { file, text, entries: [] };
    try {
      const parsed = yaml.load(text);
      return { file, text, entries: Array.isArray(parsed) ? parsed : [] };
    } catch { return { file, text, entries: [] }; }
  }

  // 写串行链（main.js withPatchWrite 语义：sidecar 进程内逐次排队）。
  let writeChain = Promise.resolve();
  function withPatchWrite(fn) {
    const run = writeChain.then(fn, fn);
    writeChain = run.catch(() => {});
    return run;
  }

  function packageDescription(name) {
    if (!name) return '';
    const candidates = [
      path.join(profileDir(), 'node_modules', ...name.split('/')),
      path.join(appDir, 'assets', 'plugins', name.includes('/') ? name.slice(name.indexOf('/') + 1) : name),
    ];
    for (const dir of candidates) {
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
        if (pkg && typeof pkg.description === 'string' && pkg.description) return pkg.description;
      } catch {}
    }
    return '';
  }

  function collect() {
    const { entries } = readPatch();
    const companionById = new Map(COMPANION_PLUGINS.map((p) => [p.id, p.name]));
    const insertById = new Map();
    const userById = new Map();
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue;
      if (Array.isArray(entry.insert)) {
        for (const it of entry.insert) if (it && typeof it.id === 'string') insertById.set(it.id, it.name || '');
      } else if (typeof entry.id === 'string') {
        userById.set(entry.id, {
          name: entry.name || '',
          disabled: entry.disabled === true,
          hasConfig: entry.config !== undefined && entry.config !== null,
          removed: entry.removed === true,
        });
      }
    }
    let bundles = [];
    try {
      const m = JSON.parse(fs.readFileSync(path.join(profileDir(), 'package.json'), 'utf8'));
      bundles = (m && m.dsh && m.dsh.profile && Array.isArray(m.dsh.profile.bundles)) ? m.dsh.profile.bundles : [];
    } catch {}
    const companionNames = new Set(COMPANION_PLUGINS.map((p) => p.name));
    const seen = new Set();
    const rows = [];
    const addRow = (id, name, group) => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      const user = userById.get(id);
      const userDisabled = !!(user && user.disabled);
      const hasConfig = !!(user && user.hasConfig);
      const removed = !!(user && user.removed === true);
      const toggleable = group !== 'core' && !removed && !(hasConfig && !userDisabled);
      rows.push({ id, name: name || id, description: packageDescription(name || id), enabled: !userDisabled, toggleable, group, removed, hasConfig });
    };
    for (const p of COMPANION_PLUGINS) {
      const u = userById.get(p.id);
      addRow(p.id, p.name, u && u.removed === true ? 'removed' : 'companion');
    }
    for (const [id, name] of insertById) if (!companionById.has(id)) addRow(id, name, 'other');
    for (const [id, u] of userById) if (!companionById.has(id)) addRow(id, u.name, u.removed === true ? 'removed' : 'other');
    for (const entry of entries) {
      if (entry && typeof entry === 'object' && typeof entry.id === 'string' && entry.removed === true && !seen.has(entry.id)) addRow(entry.id, entry.name || entry.id, 'removed');
    }
    for (const name of bundles) {
      if (companionNames.has(name)) continue;
      const id = name.includes('/') ? name.slice(name.indexOf('/') + 1) : name;
      if (!seen.has(id)) addRow(id, name, 'core');
    }
    const order = { companion: 0, other: 1, core: 2, removed: 3 };
    return rows.sort((a, b) => order[a.group] - order[b.group] || a.id.localeCompare(b.id));
  }

  function resolveName(id) {
    const c = COMPANION_PLUGINS.find((p) => p.id === id);
    if (c) return c.name;
    const { entries } = readPatch();
    for (const entry of entries) {
      if (entry && Array.isArray(entry.insert)) {
        const it = entry.insert.find((x) => x && x.id === id);
        if (it && it.name) return it.name;
      }
    }
    return '';
  }

  function setEnabled(id, enabled) {
    return withPatchWrite(() => {
      const file = path.join(profileDir(), 'cordis.patch.yml');
      let text = '';
      try { text = fs.readFileSync(file, 'utf8'); } catch {}
      if (!text.trim()) text = '# dsh web profile patch（由 DSH Desktop 维护）\n';
      const name = resolveName(id);
      if (!enabled && !name) return { ok: false, error: '无法解析插件包名: ' + id };
      let patched;
      try { patched = togglePluginInPatch(text, id, !!enabled, name); }
      catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
      if (patched !== text) {
        try { writeFileAtomic(file, patched); } catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
      }
      return { ok: true };
    });
  }

  function packageDir(name) {
    if (!name || typeof name !== 'string') return null;
    if (!/^(@[a-z0-9-]+\/)?[a-z0-9._-]+$/i.test(name)) return null;
    const base = path.join(profileDir(), 'node_modules');
    const dir = path.join(base, ...name.split('/'));
    if (!dir.startsWith(base + path.sep)) return null;
    return dir;
  }

  function installedVersion(name) {
    const pkgDir = packageDir(name);
    if (pkgDir) {
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
        if (pkg && pkg.version) return String(pkg.version);
      } catch {}
    }
    try {
      const rel = name.includes('/') ? name.slice(name.indexOf('/') + 1) : name;
      const pkg = JSON.parse(fs.readFileSync(path.join(appDir, 'assets', 'plugins', rel, 'package.json'), 'utf8'));
      if (pkg && pkg.version) return String(pkg.version);
    } catch {}
    return '';
  }

  function uninstall(id) {
    const row = collect().find((r) => r.id === id);
    if (!row) return Promise.resolve({ ok: false, error: '未知插件: ' + id });
    if (row.group === 'core') return Promise.resolve({ ok: false, error: '核心组件不可卸载: ' + id });
    if (row.hasConfig && !row.removed) return Promise.resolve({ ok: false, error: '该插件带自定义配置，禁止卸载: ' + id });
    return withPatchWrite(() => {
      const { file, text } = readPatch();
      let patched;
      try { patched = setPluginRemoved(text, id, true, row.name); }
      catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
      if (patched !== text) {
        try { writeFileAtomic(file, patched); } catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
      }
      const pkgDir = packageDir(row.name);
      if (pkgDir && fs.existsSync(pkgDir)) {
        try { fs.rmSync(pkgDir, { recursive: true, force: true }); log('已删除插件目录 ' + pkgDir); }
        catch (err) { return { ok: false, error: '标记已写入，但删除安装目录失败: ' + ((err && err.message) || err) }; }
      }
      return { ok: true, restartRequired: true };
    });
  }

  function restore(id) {
    return withPatchWrite(() => {
      const { file, text } = readPatch();
      const name = resolveName(id);
      let patched;
      try { patched = setPluginRemoved(text, id, false, name); }
      catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
      if (patched !== text) {
        try { writeFileAtomic(file, patched); } catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
      }
      return { ok: true, restartRequired: true };
    });
  }

  // ---- 更新链（npm 双源 + GitHub digest 锚点，语义对齐 main.js #80/#90 修复）----
  const UPDATE_SOURCES = {
    'compaction-acp': { kind: 'npm', pkg: 'billion-context-dsh' },
    'better-sidebar': { kind: 'npm', pkg: 'dsh-better-sidebar' },
    'side-session': { kind: 'github', repo: 'hzhz314159/dsh-side-session' },
  };

  function httpGetJson(url, timeoutMs = 15000, headers = {}, redirects = 0) {
    return new Promise((resolve, reject) => {
      if (redirects > 5) return reject(new Error('重定向次数过多'));
      let client;
      try {
        const u = new URL(url);
        client = u.protocol === 'https:' ? https : require('node:http');
      } catch (err) { return reject(err); }
      const req = client.get(url, { headers: { 'User-Agent': 'DSH-Desktop', ...headers }, timeout: timeoutMs }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return resolve(httpGetJson(new URL(res.headers.location, url).toString(), timeoutMs, headers, redirects + 1));
        }
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
          try { resolve(JSON.parse(data)); } catch { reject(new Error('响应不是合法 JSON')); }
        });
      });
      req.on('timeout', () => req.destroy(new Error('请求超时')));
      req.on('error', (err) => reject(err));
    });
  }

  function httpGetBuffer(url, timeoutMs = 60000, redirects = 0) {
    return new Promise((resolve, reject) => {
      if (redirects > 5) return reject(new Error('重定向次数过多'));
      let client;
      try {
        const u = new URL(url);
        client = u.protocol === 'https:' ? https : require('node:http');
      } catch (err) { return reject(err); }
      const req = client.get(url, { headers: { 'User-Agent': 'DSH-Desktop' }, timeout: timeoutMs }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return resolve(httpGetBuffer(new URL(res.headers.location, url).toString(), timeoutMs, redirects + 1));
        }
        if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
        const chunks = []; let total = 0; let limitHit = false;
        res.on('data', (c) => {
          if (limitHit) return;
          total += c.length;
          if (total > 64 * 1024 * 1024) { limitHit = true; req.destroy(new Error('下载超过 64MB 上限')); return; }
          chunks.push(c);
        });
        res.on('end', () => { if (!limitHit) resolve(Buffer.concat(chunks)); });
      });
      req.on('timeout', () => req.destroy(new Error('下载超时')));
      req.on('error', (err) => reject(err));
    });
  }

  async function fetchNpmLatest(pkg) {
    for (const mirror of [false, true]) {
      try {
        const data = await httpGetJson(npmLatestUrl(pkg, mirror));
        if (data && typeof data.version === 'string' && data.dist && data.dist.tarball) {
          return { version: String(data.version), tarball: String(data.dist.tarball), integrity: typeof data.dist.integrity === 'string' ? data.dist.integrity : '', source: mirror ? 'npmmirror' : 'npm' };
        }
      } catch (err) { log('查询 ' + pkg + (mirror ? ' 镜像' : ' 官方') + '失败: ' + err.message); }
    }
    return null;
  }

  async function fetchGithubLatest(repo) {
    try {
      const data = await httpGetJson(githubReleaseApiUrl(repo), 15000, { Accept: 'application/vnd.github+json' });
      if (data && data.tag_name && Array.isArray(data.assets) && data.assets.length > 0) {
        const a = selectReleaseAsset(data.assets);
        if (!a) return null;
        const dm = /^(?:sha256:)?([0-9a-fA-F]{64})$/.exec(String(a.digest || ''));
        return {
          version: String(data.tag_name).replace(/^v/, ''),
          tag: String(data.tag_name),
          assetName: String(a.name),
          tarball: githubAssetDownloadUrl(repo, data.tag_name, a.name),
          digest: dm ? dm[1].toLowerCase() : '',
          source: 'github',
        };
      }
    } catch (err) { log('查询 ' + repo + ' Releases 失败: ' + err.message); }
    return null;
  }

  async function checkUpdates() {
    const rows = collect().filter((r) => UPDATE_SOURCES[r.id] && !r.removed);
    const settled = await Promise.all(rows.map(async (row) => {
      const src = UPDATE_SOURCES[row.id];
      const current = installedVersion(row.name) || '0.0.0';
      const info = src.kind === 'npm' ? await fetchNpmLatest(src.pkg) : await fetchGithubLatest(src.repo);
      const hasUpdate = !!(info && compareVersions(info.version, current) > 0);
      return { id: row.id, name: row.name, current, latest: info ? info.version : '', hasUpdate, source: info ? info.source : '', info: hasUpdate ? info : null };
    }));
    return settled;
  }

  /** 更新单插件：下载 → 完整性校验 → 备份 → 解压替换（npm tar.gz / github zip 简化为
   *  归档解到临时目录后复制包根）。digest/integrity 校验 fail-closed。 */
  async function update(id) {
    const row = collect().find((r) => r.id === id);
    if (!row || row.removed) return { ok: false, error: '未知或已卸载插件: ' + id };
    const src = UPDATE_SOURCES[id];
    if (!src) return { ok: false, error: '该插件不支持独立更新: ' + id };
    const info = src.kind === 'npm' ? await fetchNpmLatest(src.pkg) : await fetchGithubLatest(src.repo);
    if (!info) return { ok: false, error: '查询最新版本失败: ' + id };
    const current = installedVersion(row.name) || '0.0.0';
    if (compareVersions(info.version, current) <= 0) return { ok: false, error: '已是最新版本 ' + current };
    let buf;
    try { buf = await httpGetBuffer(info.tarball); }
    catch (err) { return { ok: false, error: '下载失败: ' + ((err && err.message) || err) }; }
    // 完整性校验（npm sha512 / github sha256 digest）——fail-closed。
    if (info.integrity || info.digest) {
      try { verifyIntegrity(buf, info.integrity || 'sha256:' + info.digest); }
      catch (err) { return { ok: false, error: '完整性校验失败，拒绝安装: ' + ((err && err.message) || err) }; }
    }
    const dest = packageDir(row.name);
    if (!dest) return { ok: false, error: '安装目录解析失败: ' + row.name };
    // 解压到临时目录（npm tgz 的包根是 package/；github zip 用 findPackageRoot 定位）。
    const osMod = require('node:os');
    const tmp = fs.mkdtempSync(path.join(osMod.tmpdir(), 'dsh-plugin-upd-'));
    try {
      const zlib = require('node:zlib');
      if (info.tarball.endsWith('.tgz')) {
        // 最小 tgz 解包：gzip → tar 条目流（只处理文件条目）。
        extractTarGz(buf, tmp);
      } else {
        // zip：Windows 走 PowerShell Expand-Archive；其余平台 unzip（macOS 系统
        // 自带，多数 Linux 发行版预装——缺失时报可读错误，不再静默 ENOENT）。
        const { execFileSync } = require('node:child_process');
        const zipPath = path.join(tmp, 'dl.zip');
        fs.writeFileSync(zipPath, buf);
        const dest = path.join(tmp, 'x');
        if (process.platform === 'win32') {
          execFileSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${dest}' -Force`], { stdio: 'ignore' });
        } else {
          execFileSync('unzip', ['-o', zipPath, '-d', dest], { stdio: 'ignore' });
        }
      }
      const root = findPackageRoot(tmp);
      if (!root) return { ok: false, error: '归档中未找到包根' };
      // 备份 → 替换（目录级：旧目录改 .bak-<ts>，新目录 rename 到位）。
      const backup = dest + '.bak-' + Date.now();
      if (fs.existsSync(dest)) fs.renameSync(dest, backup);
      fs.cpSync(root, dest, { recursive: true });
      try { fs.rmSync(backup, { recursive: true, force: true }); } catch {}
      return { ok: true, version: info.version, restartRequired: true };
    } catch (err) {
      return { ok: false, error: '安装失败: ' + ((err && err.message) || err) };
    } finally {
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
    }
  }

  /** 最小 tar.gz 解包（ustar 条目；只落普通文件，够插件包用）。 */
  function extractTarGz(buf, outDir) {
    const tar = require('node:zlib').gunzipSync(buf);
    let off = 0;
    while (off + 512 <= tar.length) {
      const name = tar.slice(off, off + 100).toString('utf8').replace(/\0.*$/, '');
      const sizeField = tar.slice(off + 124, off + 136).toString('utf8').replace(/\0.*$/, '').trim();
      const size = parseInt(sizeField || '0', 8) || 0;
      const type = tar[off + 156];
      if (name) {
        const target = path.join(outDir, name.replace(/^package\//, 'package/'));
        if (type === 0x30 || type === 0) {
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.writeFileSync(target, tar.slice(off + 512, off + 512 + size));
        } else if (type === 0x35 || name.endsWith('/')) {
          fs.mkdirSync(target, { recursive: true });
        }
      }
      off += 512 + Math.ceil(size / 512) * 512;
      if (!name && size === 0 && off >= tar.length) break;
    }
  }

  // ---- 无效条目体检 + 一键清理（cordis.patch.yml 死条目；补丁层实现在 patch-surgery）----

  /** 体检参数：候选包根（profile node_modules → 安装根 node_modules → assets 插件目录）
   *  + collect() 全量插件 id 集合（陈旧禁用判定的对照面）。 */
  function deadScanOpts() {
    return {
      searchRoots: [
        path.join(profileDir(), 'node_modules'),
        path.join(appDir, 'node_modules'),
        path.join(appDir, 'assets', 'plugins'),
      ],
      knownIds: new Set(collect().map((r) => r.id)),
    };
  }

  /** 死条目/陈旧禁用体检（只读；patch 缺失按无死条目降级）。 */
  function listDeadEntries() {
    return pmListDeadEntries(path.join(profileDir(), 'cordis.patch.yml'), deadScanOpts());
  }

  /** 一键清理：只接受当前体检仍判死的 id（页面快照可能过期；宁漏勿误，绝不自动删除）。
   *  清理在补丁层带备份 + 原子写 + 幂等（removeDeadEntriesById）。 */
  function removeDeadEntries(ids) {
    return withPatchWrite(() => {
      const list = (Array.isArray(ids) ? ids : [ids]).filter((i) => typeof i === 'string' && i);
      const skipped = [];
      if (list.length === 0) return { ok: true, removed: [], backup: null, skipped };
      const fresh = listDeadEntries();
      const deadIds = new Set(fresh.dead.map((d) => d.id));
      const targets = [...new Set(list)].filter((id) => deadIds.has(id));
      for (const id of list) if (!deadIds.has(id)) skipped.push(id);
      if (targets.length === 0) return { ok: true, removed: [], backup: null, skipped };
      const res = pmRemoveDeadEntriesById(path.join(profileDir(), 'cordis.patch.yml'), targets);
      if (res && res.error) return { ok: false, error: res.error, removed: [], backup: null, skipped };
      return { ok: true, removed: res.removed, backup: res.backup, skipped, restartRequired: true };
    });
  }

  return { collect, setEnabled, uninstall, restore, checkUpdates, update, listDeadEntries, removeDeadEntries };
}

// ---------------------------------------------------------------------------
// 子命令实现
// ---------------------------------------------------------------------------

async function cmdBoot(args, ctx) {
  const { mods, appDir, userDataDir } = ctx;
  // 后端模式解析（WSL 半边入口）：wsl 生效时 home 换成 UNC 安装目录；解析
  // 失败回落 local（issue #54 语义，fallbackReason 进结果供 supervisor/日志展示）。
  const backend = await resolveBackendCtx({ appDir, home: ctx.home, userDataDir });
  const home = backend.home;
  const integration = makeIntegration(mods, { appDir, home, userDataDir, wsl: backend.wsl });
  if (backend.wsl) {
    log('WSL 托管模式: distro=' + backend.wsl.distro + ' installDir=' + backend.wsl.installDir
      + ' home(UNC)=' + backend.wsl.uncHome
      + (backend.wsl.simulated ? '（DSH_WSL_MODE 模拟，Rust 设置页解锁前的临时缝）' : ''));
  }
  const t0 = Date.now();
  const steps = [];
  // 步骤成败分级（对齐 Electron main.js 容忍语义 +「客户端必须能打开」原则）：
  //   - 显式 r.ok === false（契约性失败）→ 步骤失败（ok:false）。当前四步门面
  //     （healBeforeServer/syncPlugins/applyPatches/preflightHealth）从不返回
  //     ok:false——子失败均内部 log 容忍（sync/heal 的告警、applyAll 的
  //     degraded/errors/warnings 均不映射 ok）——该通道留给未来确需阻断启动的
  //     致命失败；
  //   - 实现级瞬态异常（Windows 文件锁 EBUSY/EPERM 等）→ 容忍继续
  //     （ok:true + warning 落日志与 steps[].warning）。supervisor 对 boot 整体
  //     失败的响应是直接转恢复页，比 Electron（只 log 继续启动）严苛——四步
  //     均为自愈/同步/补丁/预检类尽力而为操作，瞬态异常不得把用户挡在恢复页；
  //     真致命失败（模块缺失/进程崩）走非 0 退出码，supervisor 兜底不变。
  const step = async (name, fn) => {
    const s = Date.now();
    let ok = true, error = null, warning = null;
    try { const r = await fn(); if (r && r.ok === false) { ok = false; error = r.error || 'unknown'; } }
    catch (err) {
      warning = String((err && err.message) || err);
      log('boot 步骤 ' + name + ' 异常（容忍继续，不阻断启动）: ' + warning);
    }
    steps.push({ name, ok, ms: Date.now() - s, error, warning });
    log('boot 步骤 ' + name + ' → ' + (ok ? 'OK' : 'FAIL ' + error) + ' (' + (Date.now() - s) + 'ms)' + (warning ? ' [警告] ' + warning : ''));
    return ok;
  };
  // 对齐 main.js boot 链（local 模式）：repair → sync → presets → patches → preflight。
  // presets 步（v0.5.1 迁移）：Electron 时代有三条预设同步路径（after-pack 预装 /
  // main.js 内联 syncLocalAgentPresets / WSL UNC 半边），Tauri 此前全缺——旧注释
  // 「plugin-sync 内部已含预设对账」经核实为错误陈述（plugin-sync 不碰 agent-presets）。
  // 现复用 payload 自带的 install-minimal-win-preset.js（幂等，mtime/size 跳过）：
  //   local：目标为当前生效的 @deepseek-ai/dsh 包（Tauri 无 overlay updater，即
  //     payload 副本；将来若迁移 overlay 更新链，需带回 Electron 的「overlay 优先」）；
  //   wsl：目标为 UNC agent 包（Electron syncBuiltinAgentPresets 同式）——agent
  //     未就绪（Rust 侧 ensureInstalled 未跑完 / 首启）时跳过不阻断，下次 boot 补齐。
  // 步骤语义照抄 sidecar 容忍策略：失败告警不阻断启动（Electron 侧同款 try/catch）。
  let ok = true;
  ok = (await step('repair', () => integration.healBeforeServer())) && ok;
  ok = (await step('sync', () => integration.syncPlugins())) && ok;
  ok = (await step('presets', () => {
    if (backend.wsl) {
      const dshDir = findWslDshPackageDir(home);
      if (!dshDir) {
        log('presets: WSL 内 dsh 包未就绪（' + path.join(home, 'agent', 'node_modules', '@deepseek-ai', 'dsh') + '），本次跳过（Rust 侧安装完成后下次 boot 补齐）');
        return { ok: true, count: 0, note: 'wsl-agent-not-ready' };
      }
      const dests = mods.presetInstaller.installBuiltinPresets(dshDir);
      log('presets: ' + dests.length + ' 个内置预设对账完成 → WSL agent 包 ' + dshDir);
      return { ok: true, count: dests.length };
    }
    const dshDir = mods.presetInstaller.installedDshPackageDir();
    const dests = mods.presetInstaller.installBuiltinPresets(dshDir);
    log('presets: ' + dests.length + ' 个内置预设对账完成（minimal-win/router-standard/anchored 系/whoami/warmupbetter 系等）→ ' + dshDir);
    return { ok: true, count: dests.length };
  })) && ok;
  ok = (await step('patches', () => integration.applyPatches())) && ok;
  ok = (await step('compat-pin', () => {
    // 兼容层 M1（v0.6.0）：kernel-pin fail-closed 校验——vendored tarball 与
    // kernel-pin.json 的精确 pin 一致性（版本混装防线；校验器随 payload 分发，
    // 旧 payload 缺校验器时跳过不阻断）。
    const validator = path.join(appDir, 'scripts', 'compat', 'validate-pin.js');
    if (!require('node:fs').existsSync(validator)) {
      log('compat-pin: 校验器不在位（旧 payload），跳过（非阻断）');
      return { ok: true, note: 'validator-missing' };
    }
    const r = require('node:child_process').spawnSync(process.execPath, [validator, appDir], { encoding: 'utf8' });
    if (r.error) throw r.error;
    if (r.status !== 0) {
      const out = (r.stdout || '').trim().split('\n').slice(0, 6).join(' | ');
      return { ok: false, error: 'kernel-pin 与 vendored 内核不一致：' + out };
    }
    const m = (r.stdout || '').match(/校验通过: (\S+)/);
    return { ok: true, tag: m ? m[1] : undefined };
  })) && ok;
  ok = (await step('preflight', () => integration.preflightHealth())) && ok;
  // 后端观测字段（additive，supervisor 只消费 ok/steps）：WSL 生效时携带
  // distro/installDir/UNC home/agent 就绪态；回落时携带原因（设置页可展示）。
  const result = { ok, totalMs: Date.now() - t0, steps, backend: backend.backend };
  if (backend.wsl) {
    result.wsl = {
      distro: backend.wsl.distro,
      installDir: backend.wsl.installDir,
      uncHome: backend.wsl.uncHome,
      simulated: !!backend.wsl.simulated,
      agentReady: fs.existsSync(path.join(home, 'agent', 'node_modules', '@deepseek-ai', 'dsh', 'package.json')),
    };
  } else if (backend.fallbackReason) {
    result.wslFallbackReason = backend.fallbackReason;
  }
  return result;
}

function ctxFromArgs(argv) {
  let appDir = null, home = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--app-dir') appDir = argv[++i];
    else if (argv[i] === '--home') home = argv[++i];
  }
  appDir = resolveAppDir(appDir);
  home = resolveHome(home);
  const userDataDir = resolveUserData();
  const mods = loadModules(appDir);
  return { appDir, home, userDataDir, mods };
}

async function main() {
  const argv = process.argv.slice(2);
  if (!argv.length) { process.stderr.write('用法见文件头注释\n'); process.exit(2); }
  const cmd = argv[0];
  const rest = argv.slice(1);
  const ctx = () => ctxFromArgs(rest);

  try {
    switch (cmd) {
      case 'boot': return emit(await cmdBoot(rest, ctx()));
      case 'plugin-list': {
        const c = ctx();
        return emit(createPluginManager(c.mods, c).collect());
      }
      case 'plugin-set-enabled': {
        const c = ctx();
        const [id, flag] = rest.filter((a) => !a.startsWith('--'));
        if (!id || flag === undefined) { process.stderr.write('用法: plugin-set-enabled <id> <0|1>\n'); process.exit(2); }
        return emit(await createPluginManager(c.mods, c).setEnabled(id, flag === '1' || flag === 'true'));
      }
      case 'plugin-uninstall': {
        const c = ctx();
        const id = rest.find((a) => !a.startsWith('--'));
        return emit(await createPluginManager(c.mods, c).uninstall(String(id)));
      }
      case 'plugin-restore': {
        const c = ctx();
        const id = rest.find((a) => !a.startsWith('--'));
        return emit(await createPluginManager(c.mods, c).restore(String(id)));
      }
      case 'plugin-check-updates': {
        const c = ctx();
        return emit({ ok: true, items: await createPluginManager(c.mods, c).checkUpdates() });
      }
      case 'plugin-update': {
        const c = ctx();
        const id = rest.find((a) => !a.startsWith('--'));
        return emit(await createPluginManager(c.mods, c).update(String(id)));
      }
      case 'plugin-list-dead-entries': {
        // 无效条目体检（死条目 + 疑似陈旧禁用；只读，插件管理页横幅数据源）。
        const c = ctx();
        return emit(createPluginManager(c.mods, c).listDeadEntries());
      }
      case 'plugin-remove-dead-entries': {
        // 一键清理：ids 为 JSON 数组（diag-order-apply 同款传参）；sidecar 侧
        // 只清理当前体检仍判死的 id（复核宁漏勿误），绝不自动删除。
        const c = ctx();
        const json = rest.find((a) => !a.startsWith('--'));
        let ids = [];
        try {
          const parsed = JSON.parse(json || '[]');
          if (Array.isArray(parsed)) ids = parsed;
          else if (parsed) ids = [parsed];
        } catch { if (json) ids = [json]; }
        return emit(await createPluginManager(c.mods, c).removeDeadEntries(ids));
      }
      case 'diag-run':
      case 'diag-export': {
        const c = ctx();
        const home = c.home;
        const profileDir = path.join(home, 'profiles', 'web');
        let yamlTried = false, yamlDialect = null;
        const yamlOf = () => {
          if (yamlTried) return yamlDialect;
          yamlTried = true;
          const parse = c.mods.profileReconcile.createEntryListYamlParser();
          yamlDialect = parse ? { load: (content) => parse(content) } : null;
          return yamlDialect;
        };
        const report = c.mods.desktopDiagnostics.runDiagnostics({
          profileDir,
          patchFile: path.join(profileDir, 'cordis.patch.yml'),
          assetsDir: path.join(c.appDir, 'assets', 'plugins'),
          coreDirDshAt: path.join(c.appDir, 'node_modules', '@deepseek-ai'),
          crashDir: null,
          logs: {
            desktop: path.join(c.userDataDir, 'logs', 'desktop.log'),
            web: path.join(c.userDataDir, 'logs', 'dsh-web.log'),
          },
          selfHealHistoryFile: path.join(c.userDataDir, 'self-heal-history.json'),
          yaml: yamlOf(),
          env: { appVersion: process.env.DSH_TAURI_VERSION || '0.5.0-tauri' },
        });
        if (cmd === 'diag-run') return emit({ ok: true, report });
        // 导出：脱敏（token/key/secret 字段掩码，语义对齐 main.js maskDeep）+ 原子写。
        const maskDeep = (v) => {
          if (Array.isArray(v)) return v.map(maskDeep);
          if (v && typeof v === 'object') {
            const o = {};
            for (const [k, val] of Object.entries(v)) {
              o[k] = /token|key|secret|password/i.test(k) ? '***' : maskDeep(val);
            }
            return o;
          }
          return v;
        };
        const outIdx = rest.indexOf('--out');
        const out = outIdx >= 0 ? rest[outIdx + 1] : null;
        if (!out) { process.stderr.write('用法: diag-export --out <file>\n'); process.exit(2); }
        const json = JSON.stringify(maskDeep(report), null, 2) + '\n';
        const { writeFileAtomic } = c.mods.patchIo;
        writeFileAtomic(out, json);
        return emit({ ok: true, file: out, bytes: Buffer.byteLength(json) });
      }
      case 'diag-validate': {
        const c = ctx();
        const profileDir = path.join(c.home, 'profiles', 'web');
        let parse = null;
        try { parse = c.mods.profileReconcile.createEntryListYamlParser(); } catch {}
        const yaml = parse ? { load: (t) => parse(t) } : null;
        const report = c.mods.desktopValidity.validatePlugins(
          profileDir,
          path.join(c.appDir, 'node_modules', '@deepseek-ai'),
          path.join(c.appDir, 'assets', 'plugins'),
          yaml,
          fs
        );
        return emit({ ok: true, report });
      }
      case 'diag-order': {
        const c = ctx();
        const profileDir = path.join(c.home, 'profiles', 'web');
        const opts = { coreDirDshAt: path.join(c.appDir, 'node_modules', '@deepseek-ai'), assetsDir: path.join(c.appDir, 'assets', 'plugins') };
        const stack = c.mods.desktopOrdering.readBundleStack(profileDir, fs);
        const rules = c.mods.desktopOrdering.readBundleRules(profileDir, fs, opts);
        const edges = c.mods.desktopOrdering.collectDependencyEdges(profileDir, fs, opts);
        const conflicts = c.mods.desktopOrdering.validateOrder(stack.bundles, rules);
        const suggested = c.mods.desktopOrdering.suggestOrder(stack.bundles, rules, edges);
        return emit({ ok: true, report: { stack, rules, edges, conflicts, suggested } });
      }
      case 'diag-order-apply': {
        const c = ctx();
        const orderJson = rest.find((a) => !a.startsWith('--'));
        const order = JSON.parse(orderJson);
        if (!Array.isArray(order) || order.some((n) => typeof n !== 'string')) return emit({ ok: false, error: '顺序清单格式错误' });
        const profileDir = path.join(c.home, 'profiles', 'web');
        return emit(c.mods.desktopOrdering.applyBundleOrder(profileDir, order, fs));
      }
      case 'diag-remove-bundle': {
        const c = ctx();
        const namesJson = rest.find((a) => !a.startsWith('--'));
        const names = JSON.parse(namesJson);
        if (!Array.isArray(names) || names.length === 0 || names.some((n) => typeof n !== 'string' || !n)) return emit({ ok: false, error: '移除名单格式错误' });
        const filtered = names.filter((n) => !n.startsWith('@deepseek-ai/'));
        if (filtered.length === 0) return emit({ ok: false, error: '官方基础组件不可移除' });
        const profileDir = path.join(c.home, 'profiles', 'web');
        const removed = c.mods.profilePatchHeal.removeBundlesFromProfile(profileDir, filtered, fs);
        return emit({ ok: true, removed });
      }
      case 'backup-export': {
        const c = ctx();
        const [label, outFile] = rest.filter((a) => !a.startsWith('--'));
        if (!outFile) { process.stderr.write('用法: backup-export <label> <out-file>\n'); process.exit(2); }
        const home = c.home;
        const backup = c.mods.desktopBackup.createBackup(
          { profileDir: path.join(home, 'profiles', 'web'), homeDir: home, label: String(label || '') },
          fs, path
        );
        const json = JSON.stringify(backup, null, 2) + '\n';
        const { writeFileAtomic } = c.mods.patchIo;
        writeFileAtomic(outFile, json);
        return emit({ ok: true, file: outFile, files: backup.files.length, secretFiles: backup.secretFiles, bytes: Buffer.byteLength(json) });
      }
      case 'backup-restore-preview':
      case 'backup-restore-apply': {
        const c = ctx();
        const positional = rest.filter((a) => !a.startsWith('--'));
        const inFile = positional[0];
        const token = positional[1];
        if (!inFile) { process.stderr.write('用法: backup-restore-preview <in-file> | backup-restore-apply <in-file> <token>\n'); process.exit(2); }
        const crypto = require('node:crypto');
        const raw = fs.readFileSync(inFile);
        const digest = crypto.createHash('sha256').update(raw).digest('hex');
        if (cmd === 'backup-restore-preview') {
          const parsed = JSON.parse(raw.toString('utf8'));
          const backup = c.mods.desktopBackup.validatedBackup(parsed);
          return emit({ ok: true, token: digest, summary: { files: (backup.files || []).length, secretFiles: backup.secretFiles, label: backup.label || '' } });
        }
        if (token !== digest) return emit({ ok: false, error: '文件与预览时不一致（token 失配），拒绝恢复' });
        const parsed = JSON.parse(raw.toString('utf8'));
        const backup = c.mods.desktopBackup.validatedBackup(parsed);
        const home = c.home;
        const result = c.mods.desktopBackup.restoreBackup(backup, { profileDir: path.join(home, 'profiles', 'web'), homeDir: home }, fs, path);
        return emit(result);
      }
      case 'koffi-preflight': {
        const c = ctx();
        // WSL 模式跳过（Electron main.js WSL 分支同语义）：预检目标是壳自带
        // win32 预编译 koffi（picker 等 host 原生能力）；WSL 模式内核跑 Linux，
        // 原生模块来自 WSL 内 npm 安装的 linux 变体，Windows 侧探测无意义，
        // picker overlay 也只作用于本地内核。Rust 契约按 stdout 末行 ===
        // {"ok":true} 判过——跳过必须原样输出 {"ok":true}（不得附加字段）。
        const backend = await resolveBackendCtx({ appDir: c.appDir, home: c.home, userDataDir: c.userDataDir });
        if (backend.wsl) {
          process.stderr.write('[sidecar] koffi 预检：WSL 托管模式跳过（原生模块为 WSL 内 linux 变体，win32 探测不适用）\n');
          return emit({ ok: true });
        }
        // Electron 版 runKoffiPreflight 语义：vendor node 跑 scripts/koffi-preflight.cjs
        // 冒烟（0 = 通过）。缓存策略由 Rust 侧 settings 负责（本子命令纯探测）。
        const { execFileSync } = require('node:child_process');
        const script = path.join(c.appDir, 'scripts', 'koffi-preflight.cjs');
        if (!fs.existsSync(script)) return emit({ ok: true, skipped: 'no-script' });
        try {
          execFileSync(mods_node(c.appDir), [script], { timeout: 20000, windowsHide: true, stdio: 'ignore' });
          return emit({ ok: true });
        } catch { return emit({ ok: false }); }
      }
      case 'picker-overlay': {
        const c = ctx();
        // Electron 版 enablePickerBrowseOverlay 语义：koffi 预检失败时写降级 overlay
        //（禁用 native 目录选择器，换 browse 后端）。内容与 main.js 逐行一致。
        const ud = resolveUserData();
        fs.mkdirSync(ud, { recursive: true });
        const file = path.join(ud, 'picker-browse.overlay.yml');
        const content = [
          '# DSH-DESKTOP-AUTO: picker browse fallback',
          '# koffi 预检未通过：禁用 native 目录选择器，改用浏览器内 browse 选择器。',
          '- id: directory-picker',
          '  disabled: true',
          '- insert:',
          '    - id: directory-picker-browse',
          "      name: '@deepseek-ai/dsh-host-directory-picker-browse'",
          '    - id: directory-picker-browse-client',
          "      name: '@deepseek-ai/dsh-client-ui-directory-picker-browse'",
          '',
        ].join('\n');
        try { fs.writeFileSync(file, content); return emit({ ok: true, path: file }); }
        catch (err) { return emit({ ok: false, error: String(err && err.message || err) }); }
      }
      case 'safe-overlay': {
        const c = ctx();
        // Electron 版安全启动链（ensureSafeBootOverlay + parseFailedLoaderIds）：
        // 解析 dsh-web.log 尾部失败 loader id → 生成/合并禁用 overlay（幂等）。
        // #155 根因二：id 可以是 `@deepseek-ai/...` 包名，裸标量是 YAML
        // indicator 起始（`@`），js-yaml 解析失败 → 内核装配 overlay 即崩。
        // 一律经 quotePatchScalarValues 安全化（新写 id 与既有脏文件都过）。
        const ud = resolveUserData();
        fs.mkdirSync(ud, { recursive: true });
        const logFile = path.join(ud, 'logs', 'dsh-web.log');
        let tail = '';
        try {
          const stat = fs.statSync(logFile);
          const fd = fs.openSync(logFile, 'r');
          const len = Math.min(stat.size, 256 * 1024);
          const buf = Buffer.alloc(len);
          fs.readSync(fd, buf, 0, len, stat.size - len);
          fs.closeSync(fd);
          tail = buf.toString('utf8');
        } catch {}
        let ids = [];
        try { ids = c.mods.profilePatchHeal.parseFailedLoaderIds(tail) || []; } catch {}
        const file = path.join(ud, 'safe-boot.overlay.yml');
        const existing = new Set();
        let existingText = '';
        try { existingText = fs.readFileSync(file, 'utf8'); } catch {}
        // 既有脏文件的幂等修复：旧版可能写入了裸 `@deepseek-ai/...` id。
        // 必须无失败新条目时也修（否则「no-failures 早退」会留下脏文件，
        // 下次内核启动仍解析失败进崩溃环）。
        const healedExisting = c.mods.patchSurgery.quotePatchScalarValues(existingText);
        let writeNeeded = healedExisting.changed;
        const merged = [...new Set([...existing, ...ids])];
        // 现有条目提取：先按引号形态再按裸形态（脏文件两者都可能）。
        const re = /(?:^|\n)\s*-\s*id:\s*['"]?([^'"\n]+)['"]?\s*(?:\n|$)/g;
        let m; while ((m = re.exec(healedExisting.text)) !== null) {
          if (m[1] && m[1].trim()) existing.add(m[1].trim());
        }
        const mergedFinal = [...new Set([...existing, ...ids])];
        if (mergedFinal.length === 0) {
          // V17：no-failures 早退但既有脏文件需修复时也必须原子写（开发原则 6
          // 设置类文件走原子写；防 HMR/内核装配撕裂读半写文件）。
          if (writeNeeded) {
            try { c.mods.patchIo.writeFileAtomic(file, healedExisting.text); } catch {}
          }
          return emit({ ok: true, path: file, ids: [], note: 'no-failures' });
        }
        const NL = String.fromCharCode(10);
        const content = [
          '# DSH Desktop 安全启动 overlay（自动生成）：以下插件启动失败，已被自动禁用。',
          '# 修复插件后可删除本文件恢复。',
          // #155 根因二：@ 开头/特殊字符包名补单引号（裸标量 YAML 解析失败），
          // 安全 id（字母/数字/下划线/点/连字符）保持裸标量（健康文件零改写）。
          ...mergedFinal.map((id) => '- id: ' + c.mods.patchSurgery.yamlQuoteIfNeeded(id) + NL + '  disabled: true'),
          '',
        ].join(NL);
        if (!writeNeeded && content === healedExisting.text) {
          return emit({ ok: true, path: file, ids: mergedFinal });
        }
        // V17：原子写（tmp+rename），防内核装配读半写文件。
        try { c.mods.patchIo.writeFileAtomic(file, content); return emit({ ok: true, path: file, ids: mergedFinal }); }
        catch (err) { return emit({ ok: false, error: String(err && err.message || err) }); }
      }
      case 'guard-snapshot': {
        // 启动前快照（GUARD_FILES: package.json/pnpm-lock.yaml/pnpm-workspace.yaml/cordis.patch.yml）。
        const c = ctx();
        const reason = rest.find((a) => !a.startsWith('--')) || 'boot';
        const g = makeGuard(c);
        const r = g.snapshot(String(reason));
        return emit(r && r.ok !== false ? { ok: true, id: r.id } : { ok: false });
      }
      case 'guard-mark-good': {
        // 直接落定最后良好（Rust 编排器自持快照 id；guard 的 pendingGood 是实例内存态，
        // 跨 CLI 进程不可用——改由编排器在稳定期到达时显式 markGood）。
        const c = ctx();
        const id = rest.find((x) => !x.startsWith('--'));
        if (!id) { process.stderr.write('用法: guard-mark-good <id>'); process.exit(2); }
        makeGuard(c).markGood(String(id));
        return emit({ ok: true });
      }
      case 'guard-health': {
        const c = ctx();
        const r = makeGuard(c).healthCheck();
        return emit({ ok: true, findings: (r && r.findings) || [] });
      }
      case 'guard-repair': {
        // healthCheck + repair 一体（体检发现的可修复项全部应用）。
        const c = ctx();
        const g = makeGuard(c);
        const hc = g.healthCheck();
        const fixable = (hc.findings || []).filter((f) => f.fixable);
        const rr = fixable.length ? g.repair(hc.findings) : { applied: [] };
        return emit({ ok: true, applied: (rr && rr.applied) || [], findings: hc.findings || [] });
      }
      case 'guard-lastgood': {
        const c = ctx();
        const s = makeGuard(c);
        const lg = s.lastGoodSnapshot ? s.lastGoodSnapshot() : null;
        if (!lg) return emit({ ok: false, none: true });
        return emit({ ok: true, id: lg.id, reason: lg.reason || '' });
      }
      case 'guard-restore': {
        // 回滚到快照（restore 内部先留 pre-restore 快照，反悔有路）。
        const c = ctx();
        const id = rest.find((a) => !a.startsWith('--'));
        if (!id) { process.stderr.write('用法: guard-restore <id>\n'); process.exit(2); }
        const r = makeGuard(c).restore(String(id));
        return emit(r);
      }
      case 'guard-incident': {
        // 事故报告（guard/incidents/ 下落盘，恢复页/诊断可引用）。
        const c = ctx();
        const positional = rest.filter((a) => !a.startsWith('--'));
        const kind = positional[0] || 'unknown';
        const text = positional.slice(1).join(' ');
        const g = makeGuard(c);
        if (typeof g.reportIncident === 'function') {
          const file = g.reportIncident(String(kind), String(text));
          return emit({ ok: true, file: file || null });
        }
        return emit({ ok: false, error: 'guard 无 reportIncident' });
      }
      case 'guard-status': {
        // 插件保护中心交互面（guard:action status）：快照列表 + 未解决事故列表 +
        // 最后良好快照。只读，读守护瀑布已落盘的状态（rollbacks/guard/）。
        const c = ctx();
        const g = makeGuard(c);
        const snapshots = (typeof g.listSnapshots === 'function' && g.listSnapshots()) || [];
        const incidents = (typeof g.listIncidents === 'function' && g.listIncidents()) || [];
        const lastGood = (typeof g.lastGoodSnapshot === 'function' && g.lastGoodSnapshot()) || null;
        return emit({ ok: true, snapshots, incidents, lastGood });
      }
      case 'guard-read-incident': {
        // 读单条事故详情（content 截断 30KB；guard:action incident）。
        const c = ctx();
        const id = rest.find((a) => !a.startsWith('--'));
        if (!id) { process.stderr.write('用法: guard-read-incident <id>'); process.exit(2); }
        const g = makeGuard(c);
        return emit(typeof g.readIncident === 'function' ? g.readIncident(String(id)) : { ok: false, error: 'guard 无 readIncident' });
      }
      case 'guard-resolve-incident': {
        // 解决事故：重命名 .resolved.md（软解决，不删盘；guard:action resolve-incident）。
        const c = ctx();
        const id = rest.find((a) => !a.startsWith('--'));
        if (!id) { process.stderr.write('用法: guard-resolve-incident <id>'); process.exit(2); }
        const g = makeGuard(c);
        return emit(typeof g.resolveIncident === 'function' ? g.resolveIncident(String(id)) : { ok: false, error: 'guard 无 resolveIncident' });
      }
      case 'balance-fetch': {
        // 余额单轮取数（Electron main.js ensureBalanceScheduler 的取数半边，
        // 编排半边在 Rust 侧 commands/balance.rs）：复用 payload 的
        // balance.js + balance-scheduler.js（refresh() 直刷 + pollMs:0 不装
        // 轮询定时器），组装出与 Electron 完全同构的事件载荷
        // （ok/balances/prices/priceTable/model/peak/opencodeGo/at，
        // 契约见 docs/balance-architecture.md §2）。stdout 末行 JSON 即结果；
        // 密钥不出本进程（Rust 只透传 JSON，见 balance-scheduler 出站模型）。
        const c = ctx();
        const balance = require(path.join(c.appDir, 'balance'));
        const { createBalanceScheduler } = require(path.join(c.appDir, 'balance-scheduler'));
        const settings = loadSettingsInline({ userDataDir: c.userDataDir });
        let result = null;
        const sched = createBalanceScheduler({
          getHome: () => c.home,
          getSettings: () => settings,
          queryBalance: balance.queryBalance,
          queryOpencodeUsage: balance.queryOpencodeUsage,
          readActiveModel: balance.readActiveModel,
          effectivePrice: balance.effectivePrice,
          priceTable: balance.priceTable,
          isPeakHour: balance.isPeakHour,
          push: (r) => { result = r; },
          log: (topic, msg) => process.stderr.write('[' + topic + '] ' + msg + '\n'),
          pollMs: 0, // 一次性取数：本进程随取完退出（轮询/退避由 Rust 编排层负责）
        });
        try {
          await sched.refresh(); // 直刷（绕过节流——调用方显式触发）
        } finally {
          sched.stop();
        }
        return emit(result || { ok: false, error: 'no-result', balances: [] });
      }
      default:
        process.stderr.write('未知子命令: ' + cmd + '\n');
        process.exit(2);
    }
  } catch (err) {
    emit({ ok: false, error: String((err && err.message) || err) });
    process.exit(1);
  }
}

main().catch((err) => { emit({ ok: false, error: String((err && err.message) || err) }); process.exit(1); });
