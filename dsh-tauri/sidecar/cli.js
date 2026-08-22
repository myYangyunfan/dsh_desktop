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
 */

const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

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
  // 懒加载（性能审计 2026-08）：全部子命令共用 ctxFromArgs→loadModules 入口，
  // 而多数子命令只碰一两个模块——此前 15 个模块全量 require（patch-registry
  // 729 行等），每 3 分钟的 balance-fetch 也整套装载（纯启动开销；缺失的
  // 未消费模块还会直接炸掉整个命令）。getter 对 mods.* 消费方透明，接口
  // 零变更；require 缓存保证重复访问零成本。
  // Electron 版 main.js 顶部 require 的相对路径在这里以 appDir 为根解析。
  const defs = {
    integration: 'scripts/integration',
    presetInstaller: 'scripts/install-minimal-win-preset',
    pluginManagerPatch: 'scripts/plugin-manager-patch',
    pluginManagerUpdate: 'scripts/plugin-manager-update',
    companionPlugins: 'scripts/lib/companion-plugins',
    profileReconcile: 'scripts/lib/profile-reconcile',
    profilePatchHeal: 'profile-patch-heal',
    patchIo: 'scripts/lib/patch-io',
    githubReleaseAssets: 'scripts/lib/github-release-assets',
    desktopDiagnostics: 'scripts/desktop-diagnostics',
    desktopBackup: 'scripts/desktop-backup',
    desktopOrdering: 'scripts/desktop-ordering',
    desktopValidity: 'scripts/desktop-validity',
    sessionWatcher: 'session-watcher',
    pluginGuard: 'plugin-guard',
  };
  const mods = {};
  for (const name of Object.keys(defs)) {
    const rel = defs[name];
    Object.defineProperty(mods, name, {
      enumerable: true,
      get() { return require(path.join(appDir, rel)); },
    });
  }
  return mods;
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

/** 造 integration 门面（DI 面对齐 main.js ensurePluginIntegration 的注入）。 */
function makeIntegration(mods, { appDir, home, userDataDir }) {
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
    getHome: () => home,
    appDir,
    getUserDataDir: () => userDataDir,
    wslMode: () => false, // Tauri 版 Phase 3 评估 WSL 托管
    log,
    loadYaml,
    loadSettings: settings.load,
    saveSettings: settings.save,
    getInstallAnchorDir: () => path.dirname(path.join(appDir, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')),
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

  // httpGetJson 迁至 ./http-json（性能审计 2026-08：补齐响应体字节上限——
  // 本通道服务 npm latest / GitHub Releases 元数据，先于 integrity 校验、
  // 无完整性保护，原实现无限累积成字符串）。重定向/超时/UA 语义不变。
  const { httpGetJson } = require('./http-json');

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
        // 有界执行（性能审计 2026-08）：execFileSync 无超时时，AV/SmartScreen
        // 把解压子进程拦到半死 → 更新链永挂 + Rust 侧串行锁被占死。
        const { execFileBounded } = require('./exec-bounded');
        const zipPath = path.join(tmp, 'dl.zip');
        fs.writeFileSync(zipPath, buf);
        const dest = path.join(tmp, 'x');
        if (process.platform === 'win32') {
          await execFileBounded('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${dest}' -Force`], { timeoutMs: 120_000 });
        } else {
          await execFileBounded('unzip', ['-o', zipPath, '-d', dest], { timeoutMs: 120_000 });
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

  return { collect, setEnabled, uninstall, restore, checkUpdates, update };
}

// ---------------------------------------------------------------------------
// 子命令实现
// ---------------------------------------------------------------------------

async function cmdBoot(args, ctx) {
  const { mods, home, appDir } = ctx;
  const integration = makeIntegration(mods, { appDir, home, userDataDir: resolveUserData() });
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
  // 现复用 payload 自带的 install-minimal-win-preset.js（幂等，mtime/size 跳过），
  // 目标为当前生效的 @deepseek-ai/dsh 包（Tauri 无 overlay updater，即 payload 副本；
  // 将来若迁移 overlay 更新链，需带回 Electron 的「overlay 优先」选择逻辑）。
  // 步骤语义照抄 sidecar 容忍策略：失败告警不阻断启动（Electron 侧同款 try/catch）。
  let ok = true;
  ok = (await step('repair', () => integration.healBeforeServer())) && ok;
  ok = (await step('sync', () => integration.syncPlugins())) && ok;
  ok = (await step('presets', () => {
    const dshDir = mods.presetInstaller.installedDshPackageDir();
    const dests = mods.presetInstaller.installBuiltinPresets(dshDir);
    log('presets: ' + dests.length + ' 个内置预设对账完成（minimal-win/router-standard/anchored 系/whoami/warmupbetter 系等）→ ' + dshDir);
    return { ok: true, count: dests.length };
  })) && ok;
  ok = (await step('patches', () => integration.applyPatches())) && ok;
  ok = (await step('preflight', () => integration.preflightHealth())) && ok;
  return { ok, totalMs: Date.now() - t0, steps };
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
        const ud = resolveUserData();
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
        try {
          const text = fs.readFileSync(file, 'utf8');
          const re = /(?:^|\n)\s*-\s*id:\s*([A-Za-z0-9_-]+)/g;
          let m; while ((m = re.exec(text)) !== null) existing.add(m[1]);
        } catch {}
        const merged = [...new Set([...existing, ...ids])];
        if (merged.length === 0) return emit({ ok: true, path: file, ids: [], note: 'no-failures' });
        const NL = String.fromCharCode(10);
        const content = [
          '# DSH Desktop 安全启动 overlay（自动生成）：以下插件启动失败，已被自动禁用。',
          '# 修复插件后可删除本文件恢复。',
          ...merged.map((id) => '- id: ' + id + NL + '  disabled: true'),
          '',
        ].join(NL);
        try { fs.writeFileSync(file, content); return emit({ ok: true, path: file, ids: merged }); }
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
