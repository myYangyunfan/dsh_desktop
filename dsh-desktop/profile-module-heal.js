'use strict';

// Profile node_modules shadowing heal.
//
// dsh resolves a profile's plugins through the profile's own node_modules
// (pnpm-managed for out-of-tree plugins) first, then the installation
// fallback <home>/profiles/node_modules (one junction per package of the
// bundled app's dependency closure, maintained by dsh-app-boot). When pnpm
// hoists real copies of closure packages (@deepseek-ai/dsh-scope, cordis,
// ...) into a profile's node_modules — e.g. as peer/ transitive deps of a
// `dsh plugin add`-installed plugin — those copies shadow the junctions and
// load as second module instances. Symbol identity then breaks across the
// tree (scoped registration, prompt-section registries, ...), which surfaced
// as `prompt section "deployment:persona" is already registered`, the
// settings page's 「设置命名空间不可用」 rows, and broken model-list /
// mode switching.
//
// healProfileModuleShadowing removes real-directory AND pnpm-link copies in
// the profile's node_modules that shadow a fallback link, so resolution
// falls back to the junctions — one instance, shared with the host app.
// Local packages with no fallback counterpart (out-of-tree plugins
// themselves) and deliberately linked dev installs (link: targets OUTSIDE
// the profile's own .pnpm store) are left untouched. Returns the removed
// package names.

const fs = require('node:fs');
const path = require('node:path');

function healProfileModuleShadowing(home, profile = 'web', log = () => {}) {
  const fallbackDir = path.join(home, 'profiles', 'node_modules');
  const profileModulesDir = path.join(home, 'profiles', profile, 'node_modules');

  // Collect every package name the fallback exposes (scoped + unscoped).
  const names = [];
  let entries;
  try { entries = fs.readdirSync(fallbackDir, { withFileTypes: true }); } catch { return []; }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      names.push({ full: entry.name, rel: entry.name });
    } else if (entry.isDirectory()) {
      let children;
      try { children = fs.readdirSync(path.join(fallbackDir, entry.name), { withFileTypes: true }); } catch { continue; }
      for (const child of children) {
        names.push({ full: entry.name + '/' + child.name, rel: path.join(entry.name, child.name) });
      }
    }
  }

  const removed = [];
  for (const { full, rel } of names) {
    // Issue #7 guard: only delete the profile's real copy when the fallback
    // link it should fall back to is actually healthy (target dir has a
    // package.json). A damaged app node_modules (empty skeletons after a
    // botched upgrade) or a dangling junction means the shadow is the LAST
    // healthy copy — removing it would brick module resolution for good.
    const fallbackEntry = path.join(fallbackDir, rel);
    let fallbackHealthy = false;
    try {
      const st = fs.lstatSync(fallbackEntry);
      const target = st.isSymbolicLink() ? fs.realpathSync(fallbackEntry) : fallbackEntry;
      fallbackHealthy = fs.existsSync(path.join(target, 'package.json'));
    } catch { fallbackHealthy = false; }
    if (!fallbackHealthy) {
      log('fallback entry unhealthy, keeping shadow copy: ' + full);
      continue;
    }
    const shadow = path.join(profileModulesDir, rel);
    let stat;
    try { stat = fs.lstatSync(shadow); } catch { continue; }
    if (stat.isDirectory() && !stat.isSymbolicLink()) {
      // Real directory copy (pnpm nodeLinker: hoisted) shadows the fallback.
      fs.rmSync(shadow, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 });
      removed.push(full);
      log('removed shadowing copy: ' + full);
      continue;
    }
    if (stat.isSymbolicLink()) {
      // pnpm-managed link whose store lives INSIDE this profile's own .pnpm
      // also shadows the fallback with a second instance. Deliberate link:
      // dev installs point elsewhere — those stay (report only).
      // Windows junctions need unlink (rmSync force-only throws EISDIR).
      const target = safeReadlink(shadow);
      if (!target) continue;
      const norm = (p) => String(p).replace(/\//g, '\\').toLowerCase();
      // 补目录分隔符：防止 .pnpm-evil 等兄弟目录被误判为「在 store 内」。
      const storeRoot = norm(path.join(profileModulesDir, '.pnpm')) + '\\';
      if (norm(path.resolve(path.dirname(shadow), target)).startsWith(storeRoot)) {
        try { fs.unlinkSync(shadow); } catch { fs.rmSync(shadow, { force: true, recursive: true, maxRetries: 3, retryDelay: 150 }); }
        removed.push(full);
        log('removed shadowing pnpm link: ' + full);
        continue;
      }
      // 别名链接（pnpm `npm:` alias / 悬空）：路径名与目标包名不一致，等于把
      // scoped 规格符指到别的包上——同一规格符出现第二实例之外更糟：解析到语义
      // 不同的包（mac 端 createVolatile 缺失即此）。link: 开发安装名字相同，不动。
      const resolved = safeRealpath(shadow);
      if (!resolved) {
        try { fs.unlinkSync(shadow); } catch { fs.rmSync(shadow, { force: true, recursive: true, maxRetries: 3, retryDelay: 150 }); }
        removed.push(full);
        log('removed dangling profile link: ' + full);
        continue;
      }
      const targetName = pkgName(resolved);
      if (targetName && targetName !== full) {
        try { fs.unlinkSync(shadow); } catch { fs.rmSync(shadow, { force: true, recursive: true, maxRetries: 3, retryDelay: 150 }); }
        removed.push(full);
        log('removed alias link (target is ' + targetName + '): ' + full);
      }
    }
  }
  return removed;
}

function safeReadlink(p) {
  try { return fs.readlinkSync(p); } catch { return null; }
}

function safeRealpath(p) {
  try { return fs.realpathSync(p); } catch { return null; }
}

/** 读 <dir>/package.json 的 name；读不到返回 null（不可分类，宁可不删）。 */
function pkgName(dir) {
  try {
    const n = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).name;
    return typeof n === 'string' && n ? n : null;
  } catch { return null; }
}

// Alias-link heal (boot-safe subset of the shadowing rules).
//
// A pnpm **alias** dependency (`"@deepseek-ai/cosmokit": "npm:cosmokit@1.8.1"`,
// written by `dsh plugin add` / a third-party installer) leaves a link whose
// *path name* and *target package* disagree:
//   profiles/web/node_modules/@deepseek-ai/cosmokit -> ../cosmokit
// Node then resolves the scoped specifier to an unrelated package — and when
// that package lacks the export the host's modules import (`createVolatile` in
// cosmokit 1.8.1 vs 1.8.5 in the app closure), every importer dies at **ESM link
// time**: no fiber, `[loader-isolation] failed to load`, and with
// @deepseek-ai/dsh-settings among them the 「未能保存设置」 toast plus dependents
// stuck `pending (waiting for settings)`. macOS report 2026-10-11 (v1.0.1
// installed, 9 companion plugins) is that exact case.
//
// Discriminator: the link's resolved target package.json `name` differs from the
// specifier it sits at → it is a shadow, not a `link:` dev install (those keep
// the same name). Dangling links are removed too — resolution would fail anyway
// and the fallback link is healthy. Real-directory copies are deliberately NOT
// touched here: companion-profile's sync re-materializes VENDOR_DEPS copies
// every boot, so removing them from the repair step would make repair and sync
// fight and rewrite megabytes each launch. That rule stays in
// healProfileModuleShadowing (guard path).
function healProfileAliasLinks(home, profile = 'web', log = () => {}) {
  const fallbackDir = path.join(home, 'profiles', 'node_modules');
  const profileModulesDir = path.join(home, 'profiles', profile, 'node_modules');
  const removed = [];
  let scan;
  try { scan = fs.readdirSync(profileModulesDir, { withFileTypes: true }); } catch { return removed; }

  const candidates = [];
  for (const entry of scan) {
    if (entry.isDirectory()) {
      if (!entry.name.startsWith('@')) continue;
      let children;
      try { children = fs.readdirSync(path.join(profileModulesDir, entry.name), { withFileTypes: true }); } catch { continue; }
      for (const child of children) {
        if (child.isSymbolicLink()) candidates.push({ full: entry.name + '/' + child.name, rel: path.join(entry.name, child.name) });
      }
      continue;
    }
    if (entry.isSymbolicLink()) candidates.push({ full: entry.name, rel: entry.name });
  }

  for (const { full, rel } of candidates) {
    const shadow = path.join(profileModulesDir, rel);
    // 同 issue #7 守卫：只有该规格符在 fallback 里有健康对应物时才动手——
    // 否则摘掉 profile 链接就把解析彻底饿死。
    const fallbackEntry = path.join(fallbackDir, rel);
    let fallbackHealthy = false;
    try {
      const st = fs.lstatSync(fallbackEntry);
      const target = st.isSymbolicLink() ? fs.realpathSync(fallbackEntry) : fallbackEntry;
      fallbackHealthy = fs.existsSync(path.join(target, 'package.json'));
    } catch { fallbackHealthy = false; }
    if (!fallbackHealthy) continue;

    if (!safeReadlink(shadow)) continue;
    const resolved = safeRealpath(shadow);
    if (!resolved) {
      if (unlinkShadow(shadow)) { removed.push(full); log('removed dangling profile link: ' + full); }
      continue;
    }
    const targetName = pkgName(resolved);
    if (targetName && targetName !== full) {
      if (unlinkShadow(shadow)) { removed.push(full); log('removed alias link (target is ' + targetName + '): ' + full); }
    }
  }
  return removed;
}

/** 摘除单个链接（Windows junction 需 unlink，rmSync force-only 会 EISDIR）。 */
function unlinkShadow(shadow) {
  try { fs.unlinkSync(shadow); return true; } catch { /* fallthrough */ }
  try {
    fs.rmSync(shadow, { force: true, recursive: true, maxRetries: 3, retryDelay: 150 });
    return true;
  } catch { return false; }
}

module.exports = { healProfileModuleShadowing, healProfileAliasLinks };
