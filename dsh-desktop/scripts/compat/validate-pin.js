'use strict';

// validate-pin.js — 兼容层 M1 骨架：kernel-pin 清单与实际内核状态的一致性校验。
//
// 职责（v0.6.0 M1，fail-closed）：
//   1. kernel-pin.json 结构与语义校验（kernel.tag 精确 pin、services 清单唯一且
//      非空、removed 项不得出现在 required）；
//   2. 离线内核分发物（vendor/dsh-kernel/*.tgz）以 SHA256SUMS 的逐文件摘要为
//      完整性锚：缺失清单或摘要不符即 fail-closed（substring matching is not an
//      integrity anchor）。版本策略只要求 @deepseek-ai/dsh* 族携带 pin 的
//      packageVersion，framework 包按名接受；
//   3. （可扩展）boot 接线点：presets/preflight 步骤调用本模块，pin 不符即
//      fail-closed 进恢复页。
//
// 用法：node scripts/compat/validate-pin.js [repo-root=..]
// 供 boot 链与测试复用：module.exports = { validatePin, loadPin }。

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PIN_REL = path.join('scripts', 'compat', 'kernel-pin.json');
const SHA256SUMS_NAME = 'SHA256SUMS';

function loadPin(repoRoot) {
  const p = path.join(repoRoot, PIN_REL);
  const raw = fs.readFileSync(p, 'utf8');
  const pin = JSON.parse(raw);
  return { pin, pinPath: p };
}

/** 结构与语义校验（纯函数，供单测）。返回错误串数组，空 = 通过。 */
function validatePin(pin) {
  const errors = [];
  const push = (m) => errors.push(m);

  if (!pin || typeof pin !== 'object') { push('kernel-pin.json 不是对象'); return errors; }
  const k = pin.kernel || {};
  if (typeof k.tag !== 'string' || !/^dsh-v\d+\.\d+\.\d+/.test(k.tag)) {
    push(`kernel.tag 缺失或非官方 tag 形态（期望 dsh-v*）: ${JSON.stringify(k.tag)}`);
  }
  if (typeof k.packageVersion !== 'string' || !/^\d+\.\d+\.\d+/.test(k.packageVersion)) {
    push(`kernel.packageVersion 缺失或非法: ${JSON.stringify(k.packageVersion)}`);
  }
  if (k.acquisition !== 'offline-tarball' && k.acquisition !== 'official-source' && k.acquisition !== 'official-asset') {
    push(`kernel.acquisition 非法: ${JSON.stringify(k.acquisition)}`);
  }
  if (!k.pinPolicy || !/精确|exact/i.test(k.pinPolicy)) {
    push('kernel.pinPolicy 必须显式声明精确 pin（官方 developer preview 禁止浮动）');
  }
  const svc = (pin.services && Array.isArray(pin.services.required)) ? pin.services.required : null;
  if (!svc || svc.length === 0) { push('services.required 缺失或为空'); }
  else {
    const ids = new Set();
    for (const s of svc) {
      if (!s || typeof s.id !== 'string' || !s.id) push(`services.required 条目缺 id: ${JSON.stringify(s)}`);
      else if (ids.has(s.id)) push(`services.required id 重复: ${s.id}`);
      else ids.add(s.id);
      if (!s || typeof s.module !== 'string' || !s.module.startsWith('@deepseek-ai/')) {
        push(`services.required 条目 module 非 @deepseek-ai 包: ${JSON.stringify(s && s.module)}`);
      }
    }
  }
  const removed = (pin.services && Array.isArray(pin.services.removed)) ? pin.services.removed : [];
  const requiredIds = new Set(svc ? svc.map((s) => s.id) : []);
  for (const r of removed) {
    if (r && requiredIds.has(r.id)) push(`removed 条目 ${r.id} 同时出现在 required——自相矛盾`);
  }
  if (!pin.protocols || typeof pin.protocols !== 'object') push('protocols 缺失（TUI 等生态协议桥未声明）');
  return errors;
}

/** 离线 tarball 目录与 pin 的一致性校验。返回错误串数组。 */
function validateVendorDir(repoRoot, pin) {
  const errors = [];
  const dir = path.resolve(repoRoot, pin.kernel.vendorDir || path.join('vendor', 'dsh-kernel'));
  if (!fs.existsSync(dir)) { errors.push(`离线内核目录缺失: ${dir}`); return errors; }
  const want = pin.kernel.packageVersion;
  const tarballs = fs.readdirSync(dir).filter((f) => f.endsWith('.tgz'));
  if (tarballs.length === 0) { errors.push(`离线内核目录无 tarball: ${dir}`); return errors; }

  // H-16: the sha256 manifest is the integrity anchor. A missing/empty/malformed
  // manifest is fail-closed — never fall back to name/substring trust.
  const manifestPath = path.join(dir, SHA256SUMS_NAME);
  let sums = null;
  try {
    sums = parseSha256Sums(fs.readFileSync(manifestPath, 'utf8'), manifestPath);
  } catch (err) {
    errors.push(`SHA256SUMS 不可用（fail-closed）: ${err.message}`);
  }

  if (sums) {
    const unlisted = [];
    const mismatched = [];
    for (const f of tarballs) {
      const expected = sums.get(f);
      if (!expected) { unlisted.push(f); continue; }
      const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, f))).digest('hex');
      if (actual !== expected) mismatched.push(f);
    }
    if (unlisted.length > 0) {
      errors.push(`tarball 未收录于 SHA256SUMS（fail-closed）: ${previewList(unlisted)}`);
    }
    if (mismatched.length > 0) {
      errors.push(`tarball sha256 与 SHA256SUMS 不符（fail-closed）: ${previewList(mismatched)}`);
    }
  }

  // Version policy: substring matching was never an integrity anchor. Only the
  // @deepseek-ai/dsh* kernel family must carry the pinned version; framework
  // packages (cordis/cosmokit/schemastery/node-addon-system*) are accepted by
  // name with their own version lines. The digests above are the real anchor.
  const bad = tarballs.filter((f) => isKernelFamilyFile(f) && !f.endsWith(`-${want}.tgz`));
  if (bad.length > 0) {
    errors.push(`pin=packageVersion ${want} 与离线 tarball 不符（版本混装防线）：${previewList(bad)}`);
  }
  return errors;
}

/** Parse a sha256sum-format manifest (`<64 hex>  <filename>` per line). Throws on malformed input. */
function parseSha256Sums(text, manifestPath) {
  const entries = new Map();
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.startsWith('#')) continue;
    const m = /^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$/.exec(line);
    if (!m) throw new Error(`${manifestPath} 第 ${i + 1} 行格式非法`);
    if (entries.has(m[2])) throw new Error(`${manifestPath} 中 ${m[2]} 重复`);
    entries.set(m[2], m[1].toLowerCase());
  }
  if (entries.size === 0) throw new Error(`${manifestPath} 为空`);
  return entries;
}

/** The @deepseek-ai/dsh* family is pinned; framework packages are not. */
function isKernelFamilyFile(file) {
  return file.startsWith('deepseek-ai-dsh-') || file === 'deepseek-ai-dsh.tgz';
}

function previewList(names, limit = 5) {
  return `${names.slice(0, limit).join(', ')}${names.length > limit ? ` 等 ${names.length} 个` : ''}`;
}

function run(repoRoot) {
  const { pin, pinPath } = loadPin(repoRoot);
  const errors = [
    ...validatePin(pin),
    ...validateVendorDir(repoRoot, pin),
  ];
  return { ok: errors.length === 0, errors, pinPath, pin };
}

module.exports = { loadPin, validatePin, validateVendorDir, run, PIN_REL, SHA256SUMS_NAME, parseSha256Sums };

if (require.main === module) {
  const root = path.resolve(__dirname, '..', '..');
  const r = run(root);
  if (r.ok) {
    console.log(`✓ kernel-pin 校验通过: ${r.pin.kernel.tag}（${r.pin.kernel.packageVersion}，${r.pin.kernel.acquisition}）`);
    process.exit(0);
  }
  console.error('✗ kernel-pin 校验失败:');
  for (const e of r.errors) console.error('  -', e);
  process.exit(1);
}
