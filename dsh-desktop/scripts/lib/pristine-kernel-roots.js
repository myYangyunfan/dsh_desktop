'use strict';

// pristine-kernel-roots.js — 「未打任何 dsh-desktop 补丁的内核闭包树」定位收口。
//
// 为什么需要（本轮踩到的坑）：若干 TA 元测试要一份真 pristine 内核字节，用来跑
// transform 的 changed 分支、回滚审计、boot 链一条龙。它们过去把仓库根
// .tmp-rc2-stage/node_modules（一次性 npm 装配产物）硬编码成唯一 pristine 源；
// 该目录被清理后出现两种失效形态，且都比「红」更糟：
//   - ta6-transform-contract / ta6-heal-rollback-audit：直接红（后者还因裸
//     readdirSync 抛 ENOENT，把整份审计报告一起吞掉）；
//   - ta3-boot-chain / ta6-baseline-matrix：整组 { skip } 静默停摆 —— 最有价值
//     的端到端守卫不再运行，看起来仍然「全绿」。
// 所以这里给出「候选根 + 就地探测」的单一数据源，杜绝各测试再各抄一份路径。
//
// 候选根（按优先级，只返回磁盘上真实存在的那些）：
//   1. <repo>/.tmp-rc2-stage/node_modules —— 老路径；仍在就优先用（基线快照是按
//      它录制的，换源会让 ta6-baseline-matrix 的逐项判定漂移）。
//   2. <repo>/.tmp-kernel/.consumer-*/node_modules —— 内核仓库的 consumer 安装树：
//      npm 闭包解包、250 个 @deepseek-ai 包、stage-payload / patch-deps 都不碰它，
//      因此是确定可用的 durable pristine 源。注意其版本 = 内核构建时版本，可能与
//      dsh-desktop/node_modules 已安装版本有上游演进差异（锚点漂移会表现为
//      anchor-missing，这是真实信号，不是这里要掩盖的东西）。
//
// 明确不算 pristine 的：dsh-desktop/node_modules 与 dsh-tauri/package-payload
// （两者都被 postinstall / patch-deps / 运行时 boot 链打过补丁）。

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const KERNEL_ROOT = path.join(REPO_ROOT, '.tmp-kernel');

function existsDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

/** .tmp-kernel/.consumer-<ver>/node_modules，按版本号降序（新的优先）。 */
function consumerRoots() {
  if (!existsDir(KERNEL_ROOT)) return [];
  let names = [];
  try { names = fs.readdirSync(KERNEL_ROOT).filter((n) => /^\.consumer-./.test(n)); } catch { return []; }
  names.sort((a, b) => b.localeCompare(a, 'en', { numeric: true }));
  return names
    .map((n) => path.join(KERNEL_ROOT, n, 'node_modules'))
    .filter(existsDir);
}

/** 全部可用 pristine 根（有序）。空数组 = 本机没有任何 pristine 内核树。 */
function pristineRoots() {
  return [path.join(REPO_ROOT, '.tmp-rc2-stage', 'node_modules'), ...consumerRoots()].filter(existsDir);
}

function firstPristineRoot() {
  const roots = pristineRoots();
  return roots.length ? roots[0] : null;
}

/** 在所有 pristine 根下找一个包内相对路径（<root>/@deepseek-ai/<pkgRel>）。 */
function findPristineFile(pkgRel) {
  if (typeof pkgRel !== 'string' || !pkgRel) return null;
  for (const root of pristineRoots()) {
    const p = path.join(root, '@deepseek-ai', pkgRel);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** profile-boot-*.js 所在目录（dsh 主包 lib）：跨候选根探测，目录缺失不抛。 */
function findProfileBootLib() {
  for (const root of pristineRoots()) {
    const lib = path.join(root, '@deepseek-ai', 'dsh', 'lib');
    let names = [];
    try { names = fs.readdirSync(lib); } catch { continue; }
    const hit = names.filter((f) => /^profile-boot-.*\.js$/.test(f)).sort();
    if (hit.length) return path.join(lib, hit[0]);
  }
  return null;
}

function describePristineRoots() {
  const roots = pristineRoots();
  return roots.length
    ? roots.map((r) => path.relative(REPO_ROOT, r)).join(' , ')
    : '（无：.tmp-rc2-stage 与 .tmp-kernel/.consumer-*/node_modules 均不可用）';
}

// 重定位类补丁（dsh-api-session-controller / dsh-client-ui-slots 等）的目标包可能
// 不在任何 npm 闭包树里 → 回退到 .tmp-kernel 工作区的 pristine 构建产物（built lib）。
const DESKTOP_NM = path.join(REPO_ROOT, 'dsh-desktop', 'node_modules');
let kernelByName = null;
function kernelBuiltFile(pkgRel) {
  if (typeof pkgRel !== 'string' || !pkgRel) return null;
  if (kernelByName === null) {
    try {
      const inv = JSON.parse(fs.readFileSync(path.join(KERNEL_ROOT, '.dsh-inventory.json'), 'utf8'));
      kernelByName = new Map(inv.map((p) => [p.name, p.dir]));
    } catch { kernelByName = new Map(); }
  }
  const parts = String(pkgRel).split(path.sep);
  const rec = kernelByName.get('@deepseek-ai/' + parts[0]);
  if (!rec || typeof rec !== 'string') return null;
  const p = path.join(KERNEL_ROOT, rec, ...parts.slice(1));
  return fs.existsSync(p) ? p : null;
}

/**
 * 在全部 pristine 候选源里定位一个 spec 的靶文件（四级回退，顺序与旧实现一致）：
 * profile-boot 目录 → 闭包树 → 内核构建产物 → 桌面壳独有依赖。
 * @returns {string|null}
 */
function findPristineTarget(spec) {
  if (!spec || spec.kind !== 'file') return null;
  const rels = spec.pkgRels && spec.pkgRels.length ? spec.pkgRels : [spec.pkgRel];
  if (spec.layout === 'profile-boot-dirs') {
    const boot = findProfileBootLib();
    if (boot) return boot;
  }
  for (const rel of rels) {
    const p = findPristineFile(rel);
    if (p) return p;
  }
  for (const rel of rels) {
    const p = kernelBuiltFile(rel);
    if (p) return p;
  }
  // 桌面壳独有依赖（@openai/codex 等非 @deepseek-ai scope 包）在内核 pristine 树
  // 无源；postinstall/patch-deps 不碰它们，dsh-desktop/node_modules 对其是 pristine。
  for (const rel of rels) {
    if (typeof rel !== 'string' || !rel) continue;
    const p = path.join(DESKTOP_NM, rel);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

module.exports = {
  REPO_ROOT,
  pristineRoots,
  firstPristineRoot,
  findPristineFile,
  findProfileBootLib,
  findPristineTarget,
  describePristineRoots,
};
