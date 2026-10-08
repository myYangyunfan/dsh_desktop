'use strict';

// ---------------------------------------------------------------------------
// 浏览器模块表 ↔ 插件「产物」命名空间属性访问 的离线链接判据（纯函数面）。
//
// 为什么需要这一层：unit-plugin-esm-link 只解析 `import { X } from '…'` 语句，而
// 打包器（rolldown / tsdown）在产物的 CJS 闭包形态里把具名导入改写成
//   var _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives")
//   …createElement(_deepseek_ai_dsh_client_ui_primitives.IconCloseFill14, …)
// —— 源里有 import，产物里没有，于是「名字在内核已改名/移除」这一整类跨代断链
// 对既有守卫完全隐形。0.2.0-rc.2 实测：primitives 只剩 94 个 `Icon*Regular` +
// 94 个 `Icon*Medium`，`*14` / `*16` 后缀全部不存在，better-sidebar 四个产物里
// 112 处取用是硬断链（未守卫时症状是 React #130，整个 slot entry 静默消失）。
//
// 两维判据（都来自 node_modules 实文件，不硬编码名单）：
//   A. require("<spec>") 的 spec 必须在宿主模块表 rc.8+ 的 PLATFORM_MODULES 里，
//      或由该插件 package.json 的 dsh.client.external 显式扩表（内核
//      dsh-client-modules 用 stripClientSuffix 把 `<id>/client` 归一到 `<id>`）；
//      表外的运行期表现是 "missed the module table"。
//   B. `<alias>.<member>` 的 member 必须存在于 pin 内核该包的导出面；
//      存在守卫形态（typeof / || / ?? / 相等比较 / pick* 回落工具）的取用不算断链，
//      因为回落链本身就是跨代兼容的正确写法（issue #124、easyrewrite 的 pickIcon）。
//
// 判据边界：非 @deepseek-ai/* 的 spec（react 等）导出面静态不可枚举，只判 A 不判 B；
// 插件目录内的 test/ / fixtures/ / gui/ / bundles/ 是本地或构建输出，不进浏览器，跳过——
// 但被 manifest 入口指向的文件（含 dist/ 形态的产物）一定穿过硬名单，见 walkPluginFiles。
//
// 第三维判据 C（scanBrowserGraph）：A 只对宿主作用域判「表外」，是为了不把 node 侧的
// 内置模块 / 插件自带依赖误报成断链（rc.2 实测表外命中 100% 落在 node 侧）。代价是浏览器
// 侧的裸第三方名一度无人判——而那恰是 "missed the module table" 的主形态。C 换个半边切：
// 从 `./client` 入口沿相对 require 走闭包，闭包内的裸名必须命中表 ∪ dsh.client.external。
// ---------------------------------------------------------------------------

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const DSH_ROOT = path.resolve(__dirname, '..', '..');
const DSH_REPO_ROOT = path.resolve(DSH_ROOT, '..');
const HOST_SCOPE = '@deepseek-ai';

/** 参与链接判定的文件形态；gui/ 与 bundles/ 是插件自己的构建输出，test 系不入库执行。 */
const SCAN_EXT = /\.(?:js|mjs|cjs)$/;
const SKIP_DIR = new Set(['node_modules', '.git', 'gui', 'bundles', 'dist', 'test', 'tests', 'fixtures', '__tests__']);
const SKIP_FILE = /\.min\.js$/;

/** 打包器命名空间别名 → require specifier：`var _x_y = require("pkg")`（含注释前缀形态）。 */
const ALIAS_RE = /(?:var|let|const)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:\/\*[^*]*\*\/\s*)?require\(\s*['"]([^'"]+)['"]\s*\)/g;

/**
 * 运行期真正打到模块表上的形态：`require("spec")`。判据只认它，不认 `from "…"`——
 * 产物是 CJS 闭包，模块表查找发生在 require 位点；`from` 在压缩正文里会以字符串片段
 * 出现（rc.2 实测 better-sidebar 的 `require('${spec}')` 动态 helper 就在模板串里），
 * 纳进来只会制造假阳性。含 `${` 的拼接说明符同样排除（静态不可判，且该 helper 自带 throw）。
 */
const REQUIRE_SPEC_RE = /require\(\s*['"]([^'"]+)['"]\s*\)/g;

/** 只匹配相对说明符，用于沿产物图走可达闭包。 */
const REL_SPEC_RE = /(?:require\(\s*['"]|from\s*['"])(\.[^'"]*)['"]/g;

function readIf(p) {
  try { return fs.statSync(p).isFile() ? fs.readFileSync(p, 'utf8') : null; } catch { return null; }
}

/**
 * 宿主浏览器模块表实值：从 dsh-client-web 产物里抽 PLATFORM_MODULES。
 * 这是「插件能在浏览器里 require 到什么」的唯一权威来源，硬编码名单会随换代漂移。
 */
function platformModules(clientWebFile) {
  const text = readIf(clientWebFile);
  if (text === null) throw new Error(`模块表判据源缺失：${clientWebFile}`);
  const i = text.indexOf('const PLATFORM_MODULES = [');
  if (i < 0) throw new Error(`PLATFORM_MODULES 未在 ${clientWebFile} 中找到（宿主形态已变，判据需随迁）`);
  const close = text.indexOf(']', i);
  const specs = [...text.slice(i, close).matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
  if (!specs.length) throw new Error('PLATFORM_MODULES 抽取为空，判据已失效');
  return new Set(specs);
}

/** `<id>/client` → `<id>`（与内核 dsh-client-modules 的 stripClientSuffix 同源）。 */
function stripClientSuffix(spec) {
  return spec.endsWith('/client') ? spec.slice(0, -'/client'.length) : spec;
}

/** 插件 package.json 的 dsh.client.external 扩表（归一后）；缺声明返回空集。 */
function declaredExternals(manifest) {
  const decl = manifest && manifest.dsh && manifest.dsh.client && manifest.dsh.client.external;
  const out = new Set();
  if (Array.isArray(decl)) for (const v of decl) if (typeof v === 'string') out.add(stripClientSuffix(v));
  return out;
}

/** manifest 的 JS 入口文件集合（exports 支持字符串/对象/条件导出，跳过 .d.ts）。 */
function jsEntries(manifest) {
  const out = [];
  const push = (v) => {
    if (typeof v === 'string') { if (!v.endsWith('.d.ts')) out.push(v); }
    else if (v && typeof v === 'object') Object.values(v).forEach(push);
  };
  const exp = manifest.exports;
  if (typeof exp === 'string') push(exp);
  else if (exp && typeof exp === 'object') {
    for (const [k, v] of Object.entries(exp)) { if (k === './package.json') continue; push(v); }
  }
  if (manifest.main) push(manifest.main);
  return out;
}

/** 相对 require/import 说明符解析到插件内实际文件（posix 相对路径），解析不到返回 null。 */
function resolveRelative(pluginRoot, fromRel, spec) {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), spec));
  for (const c of [base, base + '.js', base + '.mjs', base + '.cjs',
    path.posix.join(base, 'index.js'), path.posix.join(base, 'index.mjs')]) {
    if (readIf(path.join(pluginRoot, ...c.split('/'))) !== null) return c;
  }
  return null;
}

/**
 * 从入口出发沿「相对说明符」走可达闭包，返回 { files, missingEntries, brokenDeps }。
 * 打包器多数把产物做成单文件，但 rollup/esbuild 的 chunk 拆分形态（入口
 * require('./chunk-x.js')）也必须进判据，否则浏览器模块图只覆盖了一半。
 */
function requireClosure(pluginRoot, entries) {
  const seen = new Set();
  const missingEntries = [];
  const brokenDeps = [];
  const queue = [];
  for (const e of entries) {
    if (readIf(path.join(pluginRoot, ...e.split('/'))) === null) missingEntries.push(e);
    else queue.push(e);
  }
  while (queue.length) {
    const rel = queue.shift();
    if (seen.has(rel)) continue;
    seen.add(rel);
    const text = readIf(path.join(pluginRoot, ...rel.split('/')));
    if (text === null) continue;
    for (const m of text.matchAll(REL_SPEC_RE)) {
      const t = resolveRelative(pluginRoot, rel, m[1]);
      if (t === null) brokenDeps.push(`${rel} -> ${m[1]}`);
      else if (!seen.has(t)) queue.push(t);
    }
  }
  return { files: [...seen].sort(), missingEntries, brokenDeps };
}

/** manifest 声明的全部 JS 入口（posix 相对路径，去重）。 */
function entryFiles(manifest) {
  return [...new Set(jsEntries(manifest)
    .filter((v) => /\.(?:js|mjs|cjs)$/.test(v))
    .map((v) => v.replace(/\\/g, '/').replace(/^\.\//, '')))].sort();
}

/** 浏览器侧入口：exports 的 ./client 子路径（含条件导出），加显式 dsh.client.entry。 */
function clientEntryFiles(manifest) {
  const out = new Set();
  const push = (v) => {
    if (typeof v === 'string' && /\.(?:js|mjs|cjs)$/.test(v)) out.add(v.replace(/\\/g, '/').replace(/^\.\//, ''));
    else if (v && typeof v === 'object') Object.values(v).forEach(push);
  };
  const exp = manifest.exports;
  if (exp && typeof exp === 'object' && typeof exp !== 'string') {
    for (const [k, v] of Object.entries(exp)) {
      if (k === './client' || k.startsWith('./client/')) push(v);
    }
  }
  const decl = (manifest.dsh && manifest.dsh.client) || {};
  push(decl.entry);
  if (typeof manifest.browser === 'string') out.add(manifest.browser.replace(/^\.\//, ''));
  return [...out].sort();
}

/** 汇总一个导出文件的导出名，`export * [as N] from` 递归跟进（seen 防环）。 */
function readExports(files, ctx) {
  const set = new Set();
  const collect = (file, seen) => {
    if (seen.has(file)) return;
    seen.add(file);
    const text = readIf(file);
    if (text === null) return;
    for (const m of text.matchAll(/\bexport\s*\{([^}]*)\}/g)) {
      for (const part of m[1].split(',')) {
        const t = part.trim();
        if (!t || t === 'default') continue;
        const as = t.split(/\s+as\s+/);
        set.add((as[1] || as[0]).trim().replace(/^type\s+/, ''));
      }
    }
    for (const m of text.matchAll(/\bexport\s+(?:async\s+)?(?:const|function|class|let|var)\s+([A-Za-z0-9_$]+)/g)) set.add(m[1]);
    if (/export\s+default/.test(text)) set.add('default');
    // CJS 宿主包（renderer 的 client half）用 exports.X = 形态导出
    for (const m of text.matchAll(/\bexports\.([A-Za-z0-9_$]+)\s*=/g)) set.add(m[1]);
    for (const m of text.matchAll(/\bexport\s*\*\s*(?:as\s+[A-Za-z0-9_$]+\s+)?from\s*['"](\.[^'"]*|@deepseek-ai\/[^'"]+)['"]/g)) {
      const spec = m[1];
      let target = null;
      if (spec.startsWith('.')) {
        const base = path.join(file, '..', spec);
        for (const c of [base, base + '.js', base + '.mjs', path.join(base, 'index.js')]) {
          if (readIf(c) !== null) { target = c; break; }
        }
      } else {
        const r = resolveHostPackage(spec, ctx);
        if (r && r.files.length) target = r.files[0];
      }
      if (target) collect(target, seen);
    }
  };
  for (const f of files) collect(f, new Set());
  return set;
}

/** 把一个 `@deepseek-ai/*` specifier 解析到宿主安装树里的导出文件集合。 */
function resolveHostPackage(spec, ctx) {
  if (!spec.startsWith(HOST_SCOPE + '/')) return { files: [], reason: '非 @deepseek-ai 包，导出面静态不可枚举' };
  const [pkg, ...rest] = spec.slice(HOST_SCOPE.length + 1).split('/');
  const dir = path.join(ctx.hostDir, pkg);
  const manifestText = readIf(path.join(dir, 'package.json'));
  if (manifestText === null) return { files: [], reason: `安装树里没有 ${HOST_SCOPE}/${pkg}` };
  const manifest = JSON.parse(manifestText);
  const sub = rest.join('/');
  let files;
  if (!sub) {
    files = jsEntries(manifest).map((e) => path.join(dir, e.replace(/^\.\//, '')));
  } else {
    const key = '/' + sub;
    const cand = [];
    const visit = (v) => { if (typeof v === 'string') cand.push(v); else if (v && typeof v === 'object') Object.values(v).forEach(visit); };
    const exp = manifest.exports;
    if (exp && typeof exp === 'object') {
      for (const [k, v] of Object.entries(exp)) {
        if (k === './' + sub || (k.includes('*') && key.startsWith(k.slice(0, k.indexOf('*'))))) visit(v);
      }
    }
    files = cand.map((c) => path.join(dir, c.replace(/^\.\//, '')));
    if (!files.some((f) => readIf(f) !== null)) {
      const f = path.join(dir, sub);
      files = [f, f + '.js', path.join(f, 'index.js')];
    }
  }
  const ok = files.filter((f) => readIf(f) !== null);
  return ok.length ? { files: ok, reason: '' } : { files: [], reason: `子路径 ${sub || '.'} 在 pin 内核里解析不到文件` };
}

/** 一个 specifier 的导出面（带缓存）；返回 { surface|null, reason }。 */
function surfaceFor(spec, ctx) {
  if (!ctx.cache.has(spec)) {
    const r = resolveHostPackage(spec, ctx);
    ctx.cache.set(spec, r.files.length
      ? { surface: readExports(r.files, ctx), reason: '' }
      : { surface: null, reason: r.reason });
  }
  return ctx.cache.get(spec);
}

/**
 * 「有守卫的取用」不算硬断链：issue #124 的三级回落链与 easyrewrite 的 pickIcon
 * 就是这一形态。五种写法都要认，否则真兼容代码会被判红、守卫失去意义。
 */
function guarded(text, alias, member) {
  const a = alias.replace(/\$/g, '\\$');
  const m = member.replace(/\$/g, '\\$');
  return [
    `typeof\\s+${a}\\.${m}\\b`,
    `${a}\\.${m}\\s*(?:\\|\\||\\?\\?)`,
    `${a}\\.${m}\\s*(?:===|!==|==)`,
    `(?:\\|\\||\\?\\?)\\s*${a}\\.${m}\\b`,
    `[Pp]ick[A-Za-z0-9_]*\\(\\s*(?:[^)]*\\)\\s*,\\s*)*${a}\\.${m}`,
  ].some((p) => new RegExp(p, 's').test(text));
}

/**
 * 遍历参与判定的文件。`keep` 是「manifest 入口及其 chunk 闭包」的绝对路径集合：
 * SKIP_DIR 里的 `dist/` 名义上是构建输出，但在册插件里确有把**运行入口**放在 dist 的
 * （dsh-prompt-optimizer 的 ./client → dist/client.js），整目录跳过会让这类产物对判据
 * 完全隐形。凡被 manifest 指向的文件一律穿过目录白名单纳入扫描。
 */
function walkPluginFiles(dir, out = [], keep = null) {
  let names;
  try { names = fs.readdirSync(dir); } catch { return out; }
  for (const name of names) {
    const p = path.join(dir, name);
    let st;
    try { st = fs.statSync(p); } catch { continue; }
    // 白名单一律按绝对路径比对：调用方常传相对插件根，直接比会整条判据静默失效。
    const abs = keep ? path.resolve(p) : null;
    if (st.isDirectory()) {
      if (SKIP_DIR.has(name) && !(keep && keep.dirs.has(abs))) continue;
      walkPluginFiles(p, out, keep);
    } else if (SCAN_EXT.test(name) && (!SKIP_FILE.test(name) || (keep && keep.files.has(abs)))
      && (st.size < (12 << 20) || (keep && keep.files.has(abs)))) out.push(p);
  }
  return out;
}

/** 把「相对路径集合」展开成 { files, dirs }（绝对路径），供 walkPluginFiles 的白名单用。 */
function keepSet(pluginRoot, relFiles) {
  const rootAbs = path.resolve(pluginRoot);
  const files = new Set();
  const dirs = new Set();
  for (const rel of relFiles) {
    const abs = path.resolve(rootAbs, ...rel.split('/'));
    files.add(abs);
    let d = path.dirname(abs);
    while (d.startsWith(rootAbs + path.sep)) { dirs.add(d); d = path.dirname(d); }
  }
  return { files, dirs };
}

/** 扫一个插件目录：返回 { offTable, missing, unresolved, aliasCount, memberCount }。 */
function scanPlugin(pluginRoot, ctx) {
  const manifestText = readIf(path.join(pluginRoot, 'package.json'));
  const manifest = manifestText === null ? null : JSON.parse(manifestText);
  const externals = manifest ? declaredExternals(manifest) : new Set();
  const keep = manifest
    ? keepSet(pluginRoot, requireClosure(pluginRoot, entryFiles(manifest)).files)
    : null;
  const r = { offTable: new Map(), missing: new Map(), unresolved: new Map(), aliasCount: 0, memberCount: 0 };
  const bump = (map, key, where) => {
    if (!map.has(key)) map.set(key, []);
    const rec = map.get(key);
    if (rec.length < 4 && !rec.includes(where)) rec.push(where);
  };
  for (const file of walkPluginFiles(pluginRoot, [], keep)) {
    const text = readIf(file);
    if (text === null) continue;
    const rel = path.relative(pluginRoot, file).replace(/\\/g, '/');
    const aliases = new Map();
    for (const m of text.matchAll(ALIAS_RE)) { aliases.set(m[1], m[2]); r.aliasCount++; }
    for (const [alias, spec] of aliases) {
      const known = ctx.table.has(spec) || ctx.table.has(stripClientSuffix(spec)) || externals.has(stripClientSuffix(spec));
      if (!known) {
        // 只对宿主作用域判「表外」：第三方 spec（react/…）由表内项或打包器 external 处理，
        // 判它们会把 Cordis bundle 半边的正当 Node 依赖一律误报。
        if (spec.startsWith(HOST_SCOPE + '/')) bump(r.offTable, spec, rel);
        continue;
      }
      const { surface, reason } = surfaceFor(spec, ctx);
      if (!surface) { if (!r.unresolved.has(spec)) r.unresolved.set(spec, reason); continue; }
      const re = new RegExp('(?:\\W|^)' + alias.replace(/\$/g, '\\$') + '\\.([A-Za-z_$][A-Za-z0-9_$]*)', 'g');
      for (const m of text.matchAll(re)) {
        const member = m[1];
        r.memberCount++;
        if (surface.has(member)) continue;
        if (guarded(text, alias, member)) continue;
        const line = text.slice(0, m.index).split('\n').length;
        bump(r.missing, `${spec}#${member}`, `${rel}:${line}`);
      }
    }
  }
  return r;
}

/** 全舰队在册插件的链接扫描（按目录名字典序，输出稳定）。 */
function scanFleet(pluginsDir, ctx) {
  const report = [];
  let scanned = 0;
  let aliasCount = 0;
  let memberCount = 0;
  for (const d of fs.readdirSync(pluginsDir).sort()) {
    const root = path.join(pluginsDir, d);
    let st;
    try { st = fs.statSync(root); } catch { continue; }
    if (!st.isDirectory()) continue;
    const r = scanPlugin(root, ctx);
    scanned++;
    aliasCount += r.aliasCount;
    memberCount += r.memberCount;
    if (r.offTable.size || r.missing.size || r.unresolved.size) report.push({ dir: d, ...r });
  }
  return { scanned, report, aliasCount, memberCount };
}

function makeContext({ root = DSH_ROOT, hostDir, clientWebFile, table } = {}) {
  const dir = hostDir || path.join(root, 'node_modules', HOST_SCOPE);
  return {
    root,
    hostDir: dir,
    table: table || platformModules(clientWebFile || path.join(dir, 'dsh-client-web', 'lib', 'index.js')),
    cache: new Map(),
  };
}

/** 插件 package.json 里 dsh.client 的声明式依赖（inject / external 两类，逐条带 kind）。 */
function clientSpecs(manifest) {
  const decl = (manifest && manifest.dsh && manifest.dsh.client) || {};
  const out = [];
  for (const kind of ['inject', 'external']) {
    for (const spec of Array.isArray(decl[kind]) ? decl[kind] : []) {
      if (typeof spec === 'string') out.push({ kind, spec });
    }
  }
  return out;
}

/** 声明式依赖是否能在宿主安装树里解析到包目录（`<id>/client` 先归一）。 */
function specInstalled(spec, ctx) {
  if (!spec.startsWith(HOST_SCOPE + '/')) return true; // 非宿主作用域不在本判据范围
  const rel = stripClientSuffix(spec).slice(HOST_SCOPE.length + 1);
  return readIf(path.join(ctx.hostDir, ...rel.split('/'), 'package.json')) !== null
    || fs.existsSync(path.join(ctx.hostDir, ...rel.split('/')));
}

/**
 * 在插件正文里找「已移除内核服务」的引用形态。
 * 只认 `ctx.get("<id>")` / `ctx.get('<id>')`：裸 service id 做子串匹配会在 base64
 * 载荷里疯狂误报（rc.2 实测 `e2b` 命中 easyrewrite 的字体数据），那种判据常红等于没有判据。
 */
function findRemovedServiceRefs(text, ids) {
  const hits = [];
  for (const id of ids) {
    for (const q of ['"', "'"]) {
      const needle = `ctx.get(${q}${id}${q})`;
      let i = -1;
      while ((i = text.indexOf(needle, i + 1)) >= 0) hits.push({ id, index: i });
    }
  }
  return hits;
}

/**
 * 浏览器模块图（判据 C）：从 `./client` 入口沿相对 require 走闭包，逐个裸名 require
 * 必须命中「宿主模块表 ∪ 该插件 dsh.client.external」。这是运行期
 * "missed the module table" 的直接前置条件——表外裸名在浏览器里没有解析器。
 * node 侧（非 ./client 闭包）不在本判据范围：那里是 Node 的 require，内置模块、
 * 相对 vendored 文件与插件自带 node_modules 都正当（rc.2 实测表外命中全在这半边）。
 */
function scanBrowserGraph(pluginRoot, ctx) {
  const manifestText = readIf(path.join(pluginRoot, 'package.json'));
  if (manifestText === null) return null;
  const manifest = JSON.parse(manifestText);
  const entries = clientEntryFiles(manifest);
  const out = { entries, files: [], missingEntries: [], brokenDeps: [], bare: new Map(), offTable: new Map() };
  if (!entries.length) return out;
  const closure = requireClosure(pluginRoot, entries);
  out.files = closure.files;
  out.missingEntries = closure.missingEntries;
  out.brokenDeps = closure.brokenDeps;
  const externals = declaredExternals(manifest);
  for (const rel of closure.files) {
    const text = readIf(path.join(pluginRoot, ...rel.split('/')));
    if (text === null) continue;
    for (const m of text.matchAll(REQUIRE_SPEC_RE)) {
      const spec = m[1];
      if (spec.startsWith('.') || spec.includes('${')) continue;
      if (!out.bare.has(spec)) out.bare.set(spec, []);
      const rec = out.bare.get(spec);
      if (rec.length < 4 && !rec.includes(rel)) rec.push(rel);
      const known = ctx.table.has(spec) || ctx.table.has(stripClientSuffix(spec)) || externals.has(stripClientSuffix(spec));
      if (!known) {
        if (!out.offTable.has(spec)) out.offTable.set(spec, []);
        const o = out.offTable.get(spec);
        if (o.length < 4 && !o.includes(rel)) o.push(rel);
      }
    }
  }
  return out;
}

/** 全舰队浏览器图（只统计有 ./client 入口的插件）。 */
function scanFleetBrowser(pluginsDir, ctx) {
  let withClient = 0;
  let files = 0;
  let bareHits = 0;
  const report = [];
  const broken = [];
  for (const d of fs.readdirSync(pluginsDir).sort()) {
    const root = path.join(pluginsDir, d);
    let st;
    try { st = fs.statSync(root); } catch { continue; }
    if (!st.isDirectory()) continue;
    const g = scanBrowserGraph(root, ctx);
    if (!g || !g.entries.length) continue;
    withClient++;
    files += g.files.length;
    for (const rec of g.bare.values()) bareHits += rec.length;
    for (const e of g.missingEntries) broken.push(`${d}: 入口缺失 ${e}`);
    for (const e of g.brokenDeps) broken.push(`${d}: 相对依赖断链 ${e}`);
    if (g.offTable.size) report.push({ dir: d, ...g });
  }
  return { withClient, files, bareHits, broken, report };
}

/**
 * 入口可见性审计：manifest 声明的每个 JS 入口必须①在磁盘存在，②不被仓库的
 * gitignore 规则遮蔽。第二条是「全新环境（clone/解压）」的判据——上游覆盖式同步
 * 会把产物写进 dist/ 这类被通用 `dist/` 规则忽略的目录，本机看着正常、仓库里没有，
 * 伴随插件同步与 profile 装配拿到的就是空目录（同 billion-context-dsh 的 issue #65）。
 */
function auditEntryVisibility(pluginsDir, repoCwd) {
  const cwd = repoCwd || DSH_REPO_ROOT;
  const rows = [];
  const probe = [];
  for (const d of fs.readdirSync(pluginsDir).sort()) {
    const root = path.join(pluginsDir, d);
    let st;
    try { st = fs.statSync(root); } catch { continue; }
    if (!st.isDirectory()) continue;
    const manifestText = readIf(path.join(root, 'package.json'));
    if (manifestText === null) continue;
    for (const rel of entryFiles(JSON.parse(manifestText))) {
      const abs = path.join(root, ...rel.split('/'));
      const fromRoot = path.relative(cwd, abs).replace(/\\/g, '/');
      probe.push(fromRoot);
      rows.push({ dir: d, entry: rel, fromRoot, exists: readIf(abs) !== null });
    }
  }
  // 56 条入口逐条 spawn git 要 2.5s；--stdin 一次过。
  const ignored = gitIgnoredSet(probe, cwd);
  for (const r of rows) r.ignored = ignored.has(r.fromRoot);
  return rows;
}

/**
 * 走 git 自己的 ignore 引擎（不重写规则语义）。默认形态是「相对索引判定」：
 * 已在库的文件不会出现在输出里，正合本判据要问的「全新 clone 拿不拿得到这个文件」。
 */
function gitIgnoredSet(files, repoCwd) {
  if (!files.length) return new Set();
  let out;
  try {
    out = execFileSync('git', ['check-ignore', '--stdin'], {
      cwd: repoCwd || DSH_REPO_ROOT, input: files.join('\n') + '\n', encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'],
    });
  } catch (e) {
    if (e.code === 'ENOENT') throw new Error('git 不可用，入口可见性判据无法执行');
    if (e.status === 1) return new Set(); // 没有任何路径被忽略
    throw e;
  }
  return new Set(out.split(/\r?\n/).filter(Boolean));
}

/** 单条路径的忽略判定（用例反证用；舰队判据走 gitIgnoredSet 一次过）。 */
function gitIgnored(relFromRepoRoot, repoCwd) {
  return gitIgnoredSet([relFromRepoRoot], repoCwd).has(relFromRepoRoot);
}

module.exports = {
  DSH_ROOT,
  DSH_REPO_ROOT,
  HOST_SCOPE,
  SKIP_DIR,
  platformModules,
  stripClientSuffix,
  declaredExternals,
  clientSpecs,
  specInstalled,
  findRemovedServiceRefs,
  jsEntries,
  entryFiles,
  clientEntryFiles,
  resolveRelative,
  requireClosure,
  readExports,
  resolveHostPackage,
  surfaceFor,
  guarded,
  walkPluginFiles,
  keepSet,
  scanPlugin,
  scanFleet,
  scanBrowserGraph,
  scanFleetBrowser,
  auditEntryVisibility,
  gitIgnored,
  gitIgnoredSet,
  makeContext,
};
