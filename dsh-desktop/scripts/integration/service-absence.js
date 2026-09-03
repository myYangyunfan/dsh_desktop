'use strict';

// ---------------------------------------------------------------------------
// 服务缺席诊断（service-absence diagnosis）—— 兼容层横向防线的第二层（语义层）。
//
// 背景（GitHub issue #176）：第三方网关类插件（典型 dsh-plugin-mobile-gateway）
// 主模块声明 inject: ['webServer', 'apiProxy', 'typertGateway', 'agentDefaultModel']。
// 内核 0.1.2-alpha.5 起「API Proxy 子系统」整体被移除（见下方 REMOVED_SERVICES
// 的出处），运行态不再有名为 apiProxy 的宿主服务。cordis Loader 对「依赖一个永不
// 出现的服务」的插件的处理是：fiber 停在 PENDING、既不报错也不上线——于是插件永远
// [pending] 且无任何提示，排查成本极高。
//
// 本模块是「根治静默 pending」的最小可靠修复：维护一份 **已移除服务登记表**
// （权威、无误报），扫描已安装插件声明的 inject，命中登记表里的服务时产出一条
// 人可读的诊断（明确点名「依赖已移除服务 X + 作者适配指引」），供：
//   - boot 链（scripts/integration/index.js）落一行 topic='boot' 日志；
//   - 插件管理健康卡体系做 UI 可见提示；
//   - CLI（node service-absence.js --app-dir <root>）离线核查。
//
// 与 composition-integrity.js（第一层·静态层）的分工：
//   - composition-integrity 判「宿主组合的关键服务行是否在位」；
//   - 本模块判「第三方插件 inject 了运行态根本不存在（已被上游移除）的服务」。
// 两者互不依赖。
//
// 为什么用「登记表」而不是「反查运行态服务全集」：
//   服务名（typertGateway / webServer / agentDefaultModel 等）是各模块内部注册的
//   别名，组合 yml 的行 id 与之并不对应；静态推「全集」极易误报——健康卡里
//   「api-gateway 行按旧行 id 查 live 永远缺席 → 永久误报红条」就是前车之鉴
//   （见 dsh-plugin-manager/lib/client.js 的 CRITICAL_RUNTIME 注释）。因此这里
//   只对**确证的、上游有意移除**的服务出诊断，宁可漏报不误报。
// ---------------------------------------------------------------------------

const fs = require('node:fs');
const path = require('node:path');

// ---------------------------------------------------------------------------
// 已移除服务登记表（单一事实源）。key = 插件 inject 里引用的服务名。
// 每条给出：为何移除、自哪个内核版本起、替代能力、作者适配指引。文案直接进
// 日志与 UI，务必准确——只登记**确证**移除的服务，不登记「拿不准」的。
// ---------------------------------------------------------------------------
const REMOVED_SERVICES = {
  apiProxy: {
    service: 'apiProxy',
    label: 'API Proxy 服务',
    // 移除该子系统的包（桌面端曾试图补装配它，但 import dsh-api-remotes 的
    // 6 个符号在 alpha 线根本不存在 → 模块加载即失败，见 issue 根因）。
    formerPackage: '@deepseek-ai/dsh-host-apiproxy',
    removedInKernel: '0.1.2-alpha.5',
    note:
      '内核自 2026-08-10「把一元浏览器操作迁移到各自归属的 Remote 服务」重构起，' +
      'API Proxy 子系统整体退场：其简单一元操作下沉到各自的 Remote 归属服务' +
      '（SessionController / SettingsController / CredentialsController / LlmRuntime / ' +
      'CommandRuntime / Workspace 注册表 / AgentPresetService 等），统一经由 ' +
      'typertGateway（API 网关）的 Remote 通道传输，Connection 拥有传输外壳与精确 ' +
      'Fetch 路由。运行态不再有名为 apiProxy 的宿主服务。',
    // 供诊断文案「请改用 …」使用；这些是当前内核里真实存在、可注入的替代服务。
    replacements: ['typertGateway', 'webServer'],
    authorGuidance:
      '第三方插件请改为注入 typertGateway（RPC / Remote 方法调用通道）与 ' +
      'webServer（本地 HTTP 接入）实现同类能力；移动端接入建议走 typertGateway 的 ' +
      'Remote 方法。参考内核文档 ' +
      '.agents/notes/implemented/architecture/2026-08-10-unary-apiproxy-remote-migration.md。',
  },
};

/** 已移除服务清单（只读快照，供 UI / boot / CLI 复用）。 */
function removedServices() {
  return Object.values(REMOVED_SERVICES).map((s) => ({
    service: s.service,
    label: s.label,
    formerPackage: s.formerPackage,
    removedInKernel: s.removedInKernel,
    replacements: s.replacements.slice(),
  }));
}

// ---------------------------------------------------------------------------
// inject 解析：从插件模块源码文本里抽出注入声明的服务名数组。
// 覆盖常见写法（纯文本扫描，不 import 模块，天然容错——解析不出即返回空）：
//   export const inject = ['a', 'b']
//   const inject = ["a", 'b']
//   exports.inject = ['a']
//   inject: ['a', 'b']            // 对象字面量里
//   { inject: ['a'], apply() {} }
// 支持多行数组；数组元素只取字符串字面量（跳过注释/变量引用）。
// ---------------------------------------------------------------------------

/** 从 `[...]` 片段里抽取字符串字面量数组（引号内内容），保序去重。 */
function extractStrings(bracketText) {
  const out = [];
  const seen = new Set();
  // 匹配 '...' / "..." / `...` 三种引号（非贪婪，不跨引号类型）。
  const re = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
  let m;
  while ((m = re.exec(bracketText)) !== null) {
    const val = m[2].replace(/\\(.)/g, '$1');
    if (val && !seen.has(val)) {
      seen.add(val);
      out.push(val);
    }
  }
  return out;
}

/** 从 fromIdx（指向 '['）找到配对的 ']'，返回其间文本；找不到返回 null。 */
function sliceBalancedBrackets(text, fromIdx) {
  if (text[fromIdx] !== '[') return null;
  let depth = 0;
  for (let i = fromIdx; i < text.length; i++) {
    const ch = text[i];
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) return text.slice(fromIdx + 1, i);
    }
  }
  return null;
}

/**
 * 从一段 JS / TS 模块源码文本解析 inject 数组（可能多处，全部并集）。
 * @param {string} text 源码文本
 * @returns {string[]} 注入的服务名（保序去重）
 */
function parseInjectFromSource(text) {
  if (!text || typeof text !== 'string') return [];
  const names = [];
  const seen = new Set();
  // 找 `inject` 紧跟 : 或 = 再跟 [ 的位置。
  const headRe = /\binject\s*[:=]\s*\[/g;
  let m;
  while ((m = headRe.exec(text)) !== null) {
    const bracketIdx = text.indexOf('[', m.index);
    const inner = sliceBalancedBrackets(text, bracketIdx);
    if (inner === null) continue;
    for (const s of extractStrings(inner)) {
      if (!seen.has(s)) {
        seen.add(s);
        names.push(s);
      }
    }
    // 从该数组结尾继续扫描下一处。
    headRe.lastIndex = bracketIdx + inner.length + 2;
  }
  return names;
}

// ---------------------------------------------------------------------------
// 诊断核心：给定插件（带 inject，或带可解析的 source 文本），产出去除歧义的
// 「依赖已移除服务」诊断条目。纯函数、无 IO，便于单测。
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} PluginLike
 * @property {string} [id]             插件 id（清单行 id）
 * @property {string} [name]           展示名 / 包名
 * @property {string} [moduleName]     组合里的模块 specifier（兜底匹配键）
 * @property {string[]|string} [inject] 已解析的服务名数组；或整段模块源码文本
 * @property {boolean} [enabled]       是否启用（禁用的插件不诊断，避免噪音）
 */

/** 取一个插件的 inject 数组（数组直接用；字符串按源码解析）。 */
function injectOf(plugin) {
  if (Array.isArray(plugin.inject)) return plugin.inject;
  if (typeof plugin.inject === 'string') return parseInjectFromSource(plugin.inject);
  if (typeof plugin.source === 'string') return parseInjectFromSource(plugin.source);
  return [];
}

/** 插件展示名（诊断文案用）。 */
function displayName(plugin) {
  return plugin.name || plugin.moduleName || plugin.id || '(unknown plugin)';
}

/**
 * 单条诊断 → 人可读文案（boot 日志与 UI 共用）。
 * @param {{plugin:PluginLike, service:string, removed:Object}} finding
 * @returns {string}
 */
function formatFindingMessage(finding) {
  const r = finding.removed || REMOVED_SERVICES[finding.service];
  const who = displayName(finding.plugin || {});
  const svc = finding.service;
  const ver = r && r.removedInKernel ? r.removedInKernel + ' 起' : '当前内核起';
  const repl = r && Array.isArray(r.replacements) && r.replacements.length
    ? '请作者改用 ' + r.replacements.join(' / ') + ' 实现同类能力。'
    : '请作者适配当前内核的服务。';
  return (
    '插件「' + who + '」依赖已被内核移除的服务 ' + svc + '（' + ver + ' ' +
    (r && r.label ? r.label : svc) + ' 已不存在）。该插件将一直停留在 [pending] 无法激活。' +
    repl
  );
}

/**
 * 扫描一组插件，返回「依赖已移除服务」的诊断条目。
 * @param {PluginLike[]} plugins
 * @param {Object} [opts]
 * @param {Object} [opts.registry] 覆盖登记表（单测注入用）
 * @returns {Array<{plugin:PluginLike, service:string, kind:'removed', removed:Object, message:string}>}
 */
function diagnoseServiceAbsence(plugins, opts = {}) {
  const registry = opts.registry || REMOVED_SERVICES;
  const findings = [];
  if (!Array.isArray(plugins)) return findings;
  for (const plugin of plugins) {
    if (!plugin || typeof plugin !== 'object') continue;
    if (plugin.enabled === false) continue; // 用户已关闭：不产噪音
    const deps = injectOf(plugin);
    for (const dep of deps) {
      const removed = registry[dep];
      if (!removed) continue;
      const finding = { plugin, service: dep, kind: 'removed', removed };
      finding.message = formatFindingMessage(finding);
      findings.push(finding);
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// 安装态扫描：在若干「包根目录」下枚举第三方插件包，读其主模块源码解析 inject。
// 只读、全容错（读不到/解析不了的包跳过），不修改任何文件。
// ---------------------------------------------------------------------------

/** 默认判定：包名是否像一个可安装的第三方插件（dsh-plugin-* / *plugin* / gateway 类）。 */
function defaultPluginPackageFilter(pkgName) {
  if (!pkgName || typeof pkgName !== 'string') return false;
  const base = pkgName.startsWith('@') ? pkgName.split('/')[1] || '' : pkgName;
  return /^dsh-plugin-/.test(base) || /-plugin-/.test(base) || /^plugin-/.test(base);
}

/** 读一个包目录的 package.json（失败返回 null）。 */
function readPackageJson(dir, fsImpl) {
  try {
    const raw = fsImpl.readFileSync(path.join(dir, 'package.json'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * 从包 package.json 推断候选主模块文件名（main / module / exports['.'] 常见形态）。
 * 找不到确切入口时回退探测 lib/index.js、index.js、lib/index.mjs、index.mjs。
 */
function candidateMainFiles(pkg) {
  const files = new Set();
  // 归一化相对路径：去掉前导 './'。空/非串忽略。
  const push = (v) => {
    if (typeof v !== 'string' || !v) return;
    files.add(v.replace(/^\.\//, ''));
  };
  if (pkg) {
    push(pkg.main);
    push(pkg.module);
    if (pkg.exports) {
      const root = typeof pkg.exports === 'string' ? pkg.exports : (pkg.exports['.'] || pkg.exports.import || pkg.exports.default);
      if (typeof root === 'string') push(root);
      else if (root && typeof root === 'object') {
        for (const v of Object.values(root)) if (typeof v === 'string') push(v);
      }
    }
  }
  const list = [...files];
  const fallbacks = ['lib/index.js', 'index.js', 'lib/index.mjs', 'index.mjs', 'dist/index.js'];
  for (const f of fallbacks) if (!list.includes(f)) list.push(f);
  return list;
}

/** 在一个包目录里找一份能解析出 inject 的模块源码（读候选入口文件）。 */
function readPluginInjectFromDir(dir, fsImpl) {
  const pkg = readPackageJson(dir, fsImpl) || {};
  const names = new Set();
  for (const rel of candidateMainFiles(pkg)) {
    let text;
    try { text = fsImpl.readFileSync(path.join(dir, ...rel.split(/[\\/]/)), 'utf8'); }
    catch { continue; }
    for (const s of parseInjectFromSource(text)) names.add(s);
  }
  return { pkgName: pkg.name || null, inject: [...names] };
}

/** 枚举一个包根目录下的直接子包目录（处理 @scope/ 一级展开）。 */
function listPackageDirs(root, fsImpl) {
  const dirs = [];
  let entries;
  try { entries = fsImpl.readdirSync(root, { withFileTypes: true }); }
  catch { return dirs; }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (ent.name.startsWith('.')) continue;
    if (ent.name.startsWith('@')) {
      // scope 目录：下钻一层取真实包目录
      const scopeDir = path.join(root, ent.name);
      let subs;
      try { subs = fsImpl.readdirSync(scopeDir, { withFileTypes: true }); }
      catch { continue; }
      for (const sub of subs) {
        if (sub.isDirectory()) dirs.push({ dir: path.join(scopeDir, sub.name), pkgName: ent.name + '/' + sub.name });
      }
    } else {
      dirs.push({ dir: path.join(root, ent.name), pkgName: ent.name });
    }
  }
  return dirs;
}

/**
 * 扫描安装态插件，返回诊断条目（含来自磁盘的 inject）。
 * @param {Object} opts
 * @param {string[]} opts.roots               待扫描的包根目录（如 <app>/node_modules、@deepseek-ai 目录）
 * @param {(pkgName:string)=>boolean} [opts.filter]   包名过滤器（默认 dsh-plugin-* 类）
 * @param {Object} [opts.fsImpl]              文件系统实现（单测注入，默认 node:fs）
 * @param {Object} [opts.registry]            覆盖登记表（单测注入）
 * @returns {Array<{plugin:PluginLike, service:string, kind:'removed', removed:Object, message:string}>}
 */
function scanInstalledPlugins(opts = {}) {
  const roots = Array.isArray(opts.roots) ? opts.roots : [];
  const fsImpl = opts.fsImpl || fs;
  const filter = opts.filter || defaultPluginPackageFilter;
  const plugins = [];
  const seenDirs = new Set();
  for (const root of roots) {
    for (const { dir, pkgName } of listPackageDirs(root, fsImpl)) {
      if (!filter(pkgName)) continue;
      if (seenDirs.has(dir)) continue;
      seenDirs.add(dir);
      const { inject } = readPluginInjectFromDir(dir, fsImpl);
      if (!inject.length) continue;
      plugins.push({ id: pkgName, name: pkgName, moduleName: pkgName, inject, enabled: true });
    }
  }
  return { plugins, findings: diagnoseServiceAbsence(plugins, { registry: opts.registry }) };
}

/**
 * boot 链便捷入口：扫描常见安装位置并生成日志行（全容错，绝不抛）。
 * @param {Object} opts
 * @param {string} opts.appDir    payload 根（其下有 node_modules）
 * @param {Object} [opts.fsImpl]
 * @param {(msg:string)=>void} [opts.log]
 * @returns {{findings:Array, logLines:string[]}}
 */
function runServiceAbsenceDiagnosis(opts = {}) {
  const appDir = opts.appDir;
  const fsImpl = opts.fsImpl || fs;
  const roots = [];
  if (appDir) {
    roots.push(path.join(appDir, 'node_modules'));
    roots.push(path.join(appDir, 'node_modules', '@deepseek-ai'));
  }
  if (Array.isArray(opts.extraRoots)) roots.push(...opts.extraRoots);
  let scan;
  try {
    scan = scanInstalledPlugins({ roots, fsImpl, registry: opts.registry });
  } catch (err) {
    return { findings: [], logLines: ['服务缺席诊断异常（容忍继续）: ' + String((err && err.message) || err)] };
  }
  const logLines = scan.findings.map((f) => '[service-absence] ' + f.message);
  if (typeof opts.log === 'function') for (const line of logLines) { try { opts.log(line); } catch { /* 日志失败不影响诊断 */ } }
  return { findings: scan.findings, logLines, plugins: scan.plugins };
}

// ---------------------------------------------------------------------------
// CLI 入口（require 直跑时）。输出 JSON；退出码非 0 当且仅当发现诊断条目。
//   node service-absence.js --app-dir <payloadRoot>
// ---------------------------------------------------------------------------
function cliMain(argv = process.argv.slice(2), deps = {}) {
  const run = deps.runServiceAbsenceDiagnosis || runServiceAbsenceDiagnosis;
  let appDir = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--app-dir' || argv[i] === '--payload-dir') appDir = argv[++i];
  }
  if (!appDir) {
    process.stderr.write('用法: node service-absence.js --app-dir <payloadRoot>\n');
    return 2;
  }
  let result;
  try { result = run({ appDir }); }
  catch (err) {
    process.stdout.write(JSON.stringify({ ok: false, error: String((err && err.message) || err) }, null, 2) + '\n');
    return 1;
  }
  const payload = {
    ok: result.findings.length === 0,
    appDir,
    removedServices: removedServices(),
    findings: result.findings.map((f) => ({
      plugin: displayName(f.plugin),
      service: f.service,
      kind: f.kind,
      message: f.message,
    })),
    logLines: result.logLines,
  };
  process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
  return result.findings.length === 0 ? 0 : 1;
}

if (require.main === module) process.exit(cliMain());

module.exports = {
  REMOVED_SERVICES,
  removedServices,
  parseInjectFromSource,
  extractStrings,
  diagnoseServiceAbsence,
  formatFindingMessage,
  defaultPluginPackageFilter,
  scanInstalledPlugins,
  runServiceAbsenceDiagnosis,
  cliMain,
};
