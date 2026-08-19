'use strict';

// 把 DSH Desktop 的配套插件同步进任意 dsh 的 web profile（独立于 Electron 壳，
// 逻辑与 main.js 的 syncCompanionPlugins 完全一致）。典型用途：把自己 WSL / Linux
// 里另装的 dsh（checkout 开发版或 npm 版）也配上壳自带的插件（余额、文件改动视图、
// 终端、浮窗、插件市场、自定义提示词、第三方思考、识图等）。
//
// 用法（WSL / Linux / Windows 均可执行）：
//   node scripts/sync-companion-plugins.js [DSH_HOME] [--with-patches] [--dry-run]
//     DSH_HOME       目标 dsh 数据目录，默认 ~/.dsh
//     --with-patches 额外应用两个运行时补丁（会话列表闪跳修复、
//                    dsh-prompt / 第三方思考设置暴露白名单）
//     --dry-run      只打印将要做的事，不落盘
//
// 生效方式：同步只落盘；dsh web 在启动时读取 profile 补丁层，因此需要重启
// WSL 里的 dsh web 后插件才会挂载（checkout 开发模式 `pnpm dsh web`，
// npm 安装版 `dsh web`）。注意：重启 dsh web 会中断当前正在跑的会话
// （会话数据在磁盘上，重启后可继续）。
//
// 卸载：从 <DSH_HOME>/profiles/web/cordis.patch.yml 删掉对应 insert 条目，
// 并删掉 <DSH_HOME>/profiles/web/node_modules/@deepseek-ai/dsh-* 目录即可。

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// 与 main.js COMPANION_PLUGINS 保持一致（保持同步时请两处一起改）。
const COMPANION_PLUGINS = [
  { id: 'balance', name: '@deepseek-ai/dsh-balance' },
  { id: 'file-changes', name: '@deepseek-ai/dsh-file-changes' },
  { id: 'client-file-changes', name: '@deepseek-ai/dsh-client-file-changes' },
  { id: 'terminal', name: '@deepseek-ai/dsh-terminal-tab' },
  { id: 'plugin-market', name: 'zat-dsh-engine' },
  { id: 'skill-manager', name: 'dsh-skill-manager' },
  { id: 'float-window', name: '@deepseek-ai/dsh-float-window' },
  { id: 'conversation-tweaks', name: '@deepseek-ai/dsh-conversation-tweaks' },
  { id: 'super-injector', name: '@dsh-external/dsh-super-injector' },
  { id: 'prompt-custom', name: '@deepseek-ai/dsh-prompt-custom' },
  { id: 'third-party-thinking', name: '@deepseek-ai/dsh-third-party-thinking' },
  { id: 'wsl-settings', name: '@deepseek-ai/dsh-wsl-settings' },
  { id: 'dsh-vision', name: '@dsh-external/dsh-vision' },
];

const PLUGIN_FILES = [
  'package.json', 'cordis.patch.yml', 'LICENSE', 'README.md', 'README.zh.md',
  'lib/index.js', 'lib/client.js', 'lib/vlm.js', 'lib/typert.host.js', 'lib/typert.host.d.ts',
  'dsh.plugin.json',
];

function companionDirName(p) {
  const slash = p.name.indexOf('/');
  return slash >= 0 ? p.name.slice(slash + 1) : p.name;
}

function log(msg) {
  console.log('[sync] ' + msg);
}

function warn(msg) {
  console.warn('[sync] ⚠ ' + msg);
}

// ---------------------------------------------------------------------------
// 插件同步（与 main.js syncCompanionPlugins 同逻辑，dry-run 时只读不改）
// ---------------------------------------------------------------------------

function syncPlugins(home, dryRun) {
  const profileDir = path.join(home, 'profiles', 'web');
  const profileModules = path.join(profileDir, 'node_modules', '@deepseek-ai');
  if (dryRun) {
    log(`dry-run: 目标 profile ${profileDir}`);
  } else {
    fs.mkdirSync(profileModules, { recursive: true });
  }

  // 清理本工具历史版本遗留的旧包名（私有 + 描述含 "DSH Desktop" 的才动）。
  const expectedDirs = new Set(COMPANION_PLUGINS.map(companionDirName));
  let entries;
  try { entries = fs.readdirSync(profileModules, { withFileTypes: true }); } catch { entries = []; }
  for (const entry of entries) {
    if (!entry.isDirectory() || expectedDirs.has(entry.name)) continue;
    const pkgPath = path.join(profileModules, entry.name, 'package.json');
    let pkg;
    try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')); } catch { continue; }
    if (pkg && pkg.private === true && typeof pkg.description === 'string' && /DSH Desktop/.test(pkg.description)) {
      if (dryRun) log(`dry-run: 将清理过期配套插件 ${entry.name}`);
      else {
        fs.rmSync(path.join(profileModules, entry.name), { recursive: true, force: true });
        log(`已清理过期配套插件: ${entry.name}`);
      }
    }
  }

  // v0.3.5 起插件市场整体切换为 zat-dsh-engine（MIT）：
  // 清理旧版 @deepseek-ai/dsh-plugin-marketplace 的同步副本与 patch 行。
  const oldPkg = path.join(profileDir, 'node_modules', '@deepseek-ai', 'dsh-plugin-marketplace');
  if (fs.existsSync(oldPkg)) {
    if (dryRun) log('dry-run: 将移除旧插件市场包 @deepseek-ai/dsh-plugin-marketplace');
    else {
      fs.rmSync(oldPkg, { recursive: true, force: true });
      log('已移除旧插件市场包: @deepseek-ai/dsh-plugin-marketplace');
    }
  }

  // 拷贝插件文件；bundle 插件（package.json 声明 dsh.bundle.patch）不写 patch 行。
  const bundleNames = new Set();
  for (const p of COMPANION_PLUGINS) {
    const rel = companionDirName(p);
    const src = path.join(__dirname, '..', 'assets', 'plugins', rel);
    if (!fs.existsSync(path.join(src, 'package.json'))) {
      warn(`跳过（找不到源）: ${p.name}（${src}）`);
      continue;
    }
    let pkg = {};
    try { pkg = JSON.parse(fs.readFileSync(path.join(src, 'package.json'), 'utf8')); } catch {}
    const isBundle = !!(pkg && pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch);
    if (isBundle) bundleNames.add(p.name);
    const dest = path.join(profileModules, '..', p.name);
    if (dryRun) {
      log(`dry-run: 将安装 ${p.name} → ${dest}${isBundle ? '（bundle 插件）' : ''}`);
      continue;
    }
    fs.mkdirSync(path.join(dest, 'lib'), { recursive: true });
    for (const f of PLUGIN_FILES) {
      const sf = path.join(src, f);
      if (fs.existsSync(sf)) fs.copyFileSync(sf, path.join(dest, f));
    }
    for (const sub of ['lib', 'assets', 'src', 'dist']) {
      const sdir = path.join(src, sub);
      if (fs.existsSync(sdir)) {
        fs.cpSync(sdir, path.join(dest, sub), { recursive: true, force: true });
      }
    }
    log(`已安装 ${p.name}${isBundle ? '（bundle 插件）' : ''}`);
  }

  // Bundle 插件注册进 profile manifest 的 dsh.profile.bundles（dsh 启动时读取
  // 包内 cordis.patch.yml）。本脚本不凭空创建 manifest（会顶替 dsh 的 profile
  // 初始化导致全新 DSH_HOME 首次启动失败）：只有 manifest 已存在且已有 bundles
  // 数组时才追加；否则交给 dsh 首次启动初始化，下次运行本脚本再注册。
  const manifestFile = path.join(profileDir, 'package.json');
  let manifest = {};
  try { manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')); } catch { manifest = null; }
  if (manifest && typeof manifest === 'object' && !Array.isArray(manifest) &&
      manifest.dsh && manifest.dsh.profile && Array.isArray(manifest.dsh.profile.bundles)) {
    for (const name of bundleNames) {
      if (manifest.dsh.profile.bundles.includes(name)) continue;
      if (dryRun) {
        log(`dry-run: 将把 bundle 插件加入 profile bundles: ${name}`);
        continue;
      }
      manifest.dsh.profile.bundles.push(name);
      fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
      log(`已把 bundle 插件加入 web profile bundles: ${name}`);
    }
  } else if (bundleNames.size > 0) {
    log('profile manifest 尚无 bundles（可能尚未初始化），bundle 插件留待下次运行注册');
  }

  // 非 bundle 插件注册到 profile 补丁层（幂等，保留用户自己加的条目）。
  const patchFile = path.join(profileDir, 'cordis.patch.yml');
  let patch = '';
  try { patch = fs.readFileSync(patchFile, 'utf8'); } catch { patch = ''; }
  let changed = false;
  for (const p of COMPANION_PLUGINS) {
    if (bundleNames.has(p.name)) continue;
    const idNameRe = new RegExp('(id:\\s*' + p.id + '\\b[^\\n]*\\n\\s*name:\\s*\\x27)([^\\x27]*)(\\x27)');
    const m = patch.match(idNameRe);
    if (m) {
      if (m[2] !== p.name) {
        patch = patch.replace(idNameRe, '$1' + p.name + '$3');
        changed = true;
        log(`已更新补丁条目 ${p.id}: ${m[2]} → ${p.name}`);
      }
      continue;
    }
    const block = `- insert:\n    - id: ${p.id}\n      name: '${p.name}'\n`;
    if (/^\s*\[\]\s*$/m.test(patch)) patch = patch.replace(/\[\]/m, block);
    else if (patch.trim() === '') patch = '# dsh web profile patch（由 DSH Desktop 维护）\n' + block;
    else patch = patch.replace(/\s*$/, '\n') + block;
    changed = true;
    log(`已添加补丁条目 ${p.id} → ${p.name}`);
  }
  // 旧插件市场条目清理（幂等）。
  const patchBefore = patch;
  patch = patch.replace(/^\s*-\s*insert:\s*$\n^\s*-\s*id:\s*plugin-marketplace\s*$\n^\s*name:\s*['"]@deepseek-ai\/dsh-plugin-marketplace['"]\s*$\n?/gm, '');
  if (patch !== patchBefore) {
    changed = true;
    log('已从 cordis.patch.yml 移除旧插件市场条目');
  }
  if (changed) {
    if (dryRun) log(`dry-run: 将写入 ${patchFile}`);
    else {
      fs.writeFileSync(patchFile, patch);
      log(`已写入 ${patchFile}`);
    }
  } else {
    log('补丁层无变化（全部条目已存在）');
  }
}

// ---------------------------------------------------------------------------
// 运行时补丁（与 main.js applyRuntimeFlashFix / applyPromptExposeFix 同逻辑）：
// 覆盖 profile fallback 与壳托管安装目录 agent 两份副本；bundle 初始化后的
// dsh 安装（npm 版）两份副本通常互为同一文件（fallback 符号链接写穿），幂等。
// ---------------------------------------------------------------------------

function patchTargets(home, pkgPath) {
  const mk = (root) => path.join(root, 'node_modules', '@deepseek-ai', pkgPath);
  return [
    mk(path.join(home, 'profiles')),
    mk(path.join(home, 'agent')),
  ];
}

function applyRuntimePatches(home, dryRun) {
  // 会话列表刷新闪跳修复（mergeOrderedBaseline 保留本地新会话）。
  const OLD_FLASH = '(value) => baselineByKey.get(keyOf(value))).filter((value) => value !== void 0);';
  const NEW_FLASH = '(value) => baselineByKey.get(keyOf(value)) ?? value).filter((value) => value !== void 0);';
  for (const file of patchTargets(home, path.join('dsh-client-runtime', 'lib', 'client.js'))) {
    if (!fs.existsSync(file)) continue;
    try {
      const src = fs.readFileSync(file, 'utf8');
      if (src.includes(NEW_FLASH)) { log('runtime 补丁: 已应用，跳过 ' + file); continue; }
      if (!src.includes(OLD_FLASH)) { warn('runtime 补丁: 未匹配到目标代码（版本可能已变更），跳过 ' + file); continue; }
      if (dryRun) { log('dry-run: 将应用会话列表闪跳修复 ' + file); continue; }
      fs.writeFileSync(file, src.replace(OLD_FLASH, NEW_FLASH), 'utf8');
      log('已应用会话列表闪跳修复 ' + file);
    } catch (err) {
      warn('runtime 补丁失败(' + file + '): ' + err.message);
    }
  }

  // 设置暴露白名单补丁（dsh-prompt / 第三方思考 / 识图 / 会话调整）。
  const NAMESPACES = ['dsh-prompt', 'dsh-third-party-thinking', 'dsh-vision', 'dsh-conversation-tweaks'];
  for (const file of patchTargets(home, path.join('dsh-host-apiproxy', 'lib', 'index.js'))) {
    if (!fs.existsSync(file)) continue;
    try {
      const src = fs.readFileSync(file, 'utf8');
      const declIdx = src.indexOf('const WEB_SETTINGS_NAMESPACES = [');
      if (declIdx === -1) {
        warn('提示词暴露补丁: 未找到 WEB_SETTINGS_NAMESPACES（版本可能已变更），跳过 ' + file);
        continue;
      }
      // 只认声明之后最近的 `];`，避免插进文件里其它数组。
      const closeIdx = src.indexOf('];', declIdx);
      if (closeIdx === -1) {
        warn('提示词暴露补丁: 未匹配到命名空间数组收尾，跳过 ' + file);
        continue;
      }
      const arrText = src.slice(declIdx, closeIdx);
      const missing = NAMESPACES.filter((ns) => !arrText.includes('"' + ns + '"'));
      if (missing.length === 0) {
        log('提示词暴露补丁: 已应用，跳过 ' + file);
        continue;
      }
      const block = ',\n' + missing.map((ns) => '\t"' + ns + '"').join(',\n') + '\n';
      if (dryRun) { log('dry-run: 将把 ' + missing.join(', ') + ' 加入设置白名单 ' + file); continue; }
      fs.writeFileSync(file, src.slice(0, closeIdx) + block + src.slice(closeIdx), 'utf8');
      log('已把 ' + missing.join(', ') + ' 加入设置白名单 ' + file);
    } catch (err) {
      warn('提示词暴露补丁失败(' + file + '): ' + err.message);
    }
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const homeArg = args.find((a) => !a.startsWith('--'));
  const home = path.resolve(homeArg || process.env.DSH_HOME || path.join(os.homedir(), '.dsh'));
  const withPatches = args.includes('--with-patches');
  const dryRun = args.includes('--dry-run');

  console.log(`[sync] 目标 DSH_HOME: ${home}${dryRun ? '（dry-run，不落盘）' : ''}`);
  if (!fs.existsSync(home)) {
    if (dryRun) {
      warn(`目标目录不存在: ${home}（dry-run 仍继续输出计划）`);
    } else {
      // 与 Windows 壳一致：同步先于 dsh 首次启动也没问题，目录链会自动创建。
      warn(`目标目录不存在，将自动创建: ${home}`);
      fs.mkdirSync(home, { recursive: true });
    }
  }
  syncPlugins(home, dryRun);
  if (withPatches) applyRuntimePatches(home, dryRun);
  console.log('[sync] 完成。');
  console.log('[sync] 提示：插件在 dsh web 启动时才会挂载 —— 请重启 WSL 里的 dsh web：');
  console.log('[sync]   checkout 开发模式:  cd <harness 目录> && pnpm dsh web');
  console.log('[sync]   npm 安装版:        dsh web');
  console.log('[sync]   重启会中断当前正在跑的会话；会话数据在磁盘上，重启后可继续。');
}

main();
