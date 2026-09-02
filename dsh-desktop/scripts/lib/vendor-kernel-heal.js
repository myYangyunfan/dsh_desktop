'use strict';

// ---------------------------------------------------------------------------
// vendor/dsh-kernel 陈旧内核 tarball 自愈（boot repair 步，尽力而为不阻断）。
//
// 问题（0.6.1 alpha.5 覆盖安装实测）：NSIS 覆盖安装只做「增/覆盖」不做「删」——
// 旧安装 vendor/dsh-kernel 里 242 个 alpha.4 tgz 不会被清除，与新的 242 个
// alpha.5 叠成 484（版本混装）。`scripts/compat/validate-pin.js` 的「版本混装
// 防线」按 `f.includes(pin.kernel.packageVersion)` 判定，任何非 pin 版本 tgz 视
// 为不一致 → boot 链 compat-pin 步 fail-closed 拒启 → 崩溃环 → 恢复页。
// 用户看不到清晰指引（只知道「版本仍 0.6.0、boot 起不来」），实际是安装器没
// 有 purge 陈旧内核 tarball 的语义。
//
// 修复：boot 链 repair 步（healBeforeServer）在 compat-pin 校验之前，把 vendor
// 里非 pin 版本的 tgz **移出 vendor 目录树**到 `vendor/_dsh-stale-kernel-quarantine/`
// （validate-pin 非递归 glob，天然忽略子目录；隔离到 sibling 更保险）。此后
// compat-pin 只看当前 pin 版本 tarball → 校验通过 → boot 继续。
//
// 宁漏勿误原则：
//   - kernel-pin.json 不在位 / 无 packageVersion / 无 vendorDir → 不修（下次
//     boot 再试；半安装 / 未来 pin schema 演进时不炸）；
//   - vendor 目录缺失 / 无 tgz → 不修（不是本模块的职责，交给 compat-pin 的
//     「离线内核目录缺失 / 无 tarball」错误暴露真问题）；
//   - 匹配 pin 的 tgz 数量为 0 → **绝不 prune**（否则会把 vendor 清成空目录，
//     反而把「版本不一致」变成「无 tarball」，问题更严重：可能 install-kernel
//     未跑 / 内核包还没铺到 vendor）；只日志告警不阻断，让 compat-pin 报出
//     「pin=packageVersion X 与离线 tarball 不符」这条精确指引；
//   - 单文件 rename 失败（跨设备 / 权限 / AV 抢占）→ 逐文件继续，不整体放弃；
//   - 任何实现级异常由调用方（healBeforeServer try/catch）兜住——repair 步
//     语义：告警不阻断启动。
//
// 隔离目录 `_dsh-stale-kernel-quarantine/` 每次进入本模块先整目录清掉再放入
// 本轮陈旧件（幂等，避免多轮 boot 累积）。文件名保留原样，用户可回填。
// ---------------------------------------------------------------------------

const fs = require('node:fs');
const path = require('node:path');
const { loadPin } = require('../compat/validate-pin');

const QUARANTINE_DIR_NAME = '_dsh-stale-kernel-quarantine';

/**
 * 清理 `path` 指向的目录（存在才动，不存在即 no-op），供幂等 quarantine 复位。
 * 用 rmSync recursive 一次到位；失败（EBUSY/EPERM）不抛，让 rename 自己决定。
 */
function resetDir(p) {
  try { fs.rmSync(p, { recursive: true, force: true }); } catch { /* 容忍 */ }
  try { fs.mkdirSync(p, { recursive: true }); } catch { /* 容忍；后续 rename 会各自失败 */ }
}

/**
 * 把 `from` 移到 `to`（跨设备回落到 copy+unlink）。返回 { ok, err? }。
 */
function moveFile(from, to) {
  try { fs.renameSync(from, to); return { ok: true }; }
  catch (err) {
    try {
      fs.copyFileSync(from, to);
      try { fs.unlinkSync(from); } catch { /* 复制成功但删不掉源：也算落地，源残留下次 boot 再清 */ }
      return { ok: true, note: 'rename-failed-fallback-copy' };
    } catch (err2) {
      return { ok: false, err: String((err2 && err2.message) || err2) };
    }
  }
}

/**
 * 自愈 vendor/dsh-kernel：把非 pin 版本的 tgz 移出到 sibling 隔离目录。
 * @param {Object} opts
 * @param {string} opts.appDir dsh-desktop 根（含 scripts/compat/kernel-pin.json
 *   与 vendor/dsh-kernel/）。
 * @param {(msg: string) => void} [opts.log]
 * @returns {{changed: boolean, pruned: string[], quarantinedTo: string|null, note?: string}}
 */
function healVendorStaleKernels({ appDir, log = () => {} } = {}) {
  const result = { changed: false, pruned: [], quarantinedTo: null };
  if (!appDir) { result.note = 'no-appDir'; return result; }

  let pin;
  try {
    pin = loadPin(appDir).pin;
  } catch (err) {
    result.note = 'pin-missing: ' + String((err && err.message) || err);
    log('vendor-kernel 自愈跳过（kernel-pin.json 不可读，不修）: ' + result.note);
    return result;
  }
  const want = pin && pin.kernel && pin.kernel.packageVersion;
  if (typeof want !== 'string' || !want.length) {
    result.note = 'no-packageVersion';
    log('vendor-kernel 自愈跳过（pin 缺 packageVersion，不修）');
    return result;
  }
  const vendorDirRel = (pin.kernel && pin.kernel.vendorDir) || path.join('vendor', 'dsh-kernel');
  const vendorDir = path.resolve(appDir, vendorDirRel);
  if (!fs.existsSync(vendorDir)) {
    result.note = 'vendor-missing';
    return result; // 交给 compat-pin 的「离线内核目录缺失」暴露真问题
  }

  let entries;
  try { entries = fs.readdirSync(vendorDir); }
  catch (err) { result.note = 'readdir-failed: ' + String((err && err.message) || err); return result; }
  const tarballs = entries.filter((f) => f.endsWith('.tgz'));
  if (tarballs.length === 0) { result.note = 'no-tarballs'; return result; }

  const matching = tarballs.filter((f) => f.includes(want));
  const stale = tarballs.filter((f) => !f.includes(want));

  if (stale.length === 0) {
    // 完全干净——顺手把上轮可能残留的隔离目录清掉（幂等）。
    const qdir = path.join(path.dirname(vendorDir), QUARANTINE_DIR_NAME);
    if (fs.existsSync(qdir)) {
      try { fs.rmSync(qdir, { recursive: true, force: true }); log('vendor-kernel 自愈: 清理上轮隔离目录（本轮无陈旧件）'); } catch { /* 容忍 */ }
    }
    return result;
  }
  if (matching.length === 0) {
    // 关键守护：pin 版本 tarball 一个都没有——绝不 prune（会把 vendor 掏空）。
    // 只日志告警；compat-pin 会报「pin=packageVersion 与离线 tarball 不符」，
    // 指引用户重装而不是让本模块悄悄把 vendor 干掉。
    result.note = 'refusing-to-prune-no-matching';
    log('vendor-kernel 自愈放弃（pin=' + want + ' 版本 tarball 为 0，剪掉 stale 会掏空 vendor；请通过重装修复）: stale=' + stale.length + ' 个');
    return result;
  }

  const qdir = path.join(path.dirname(vendorDir), QUARANTINE_DIR_NAME);
  resetDir(qdir);

  for (const f of stale) {
    const from = path.join(vendorDir, f);
    const to = path.join(qdir, f);
    const mv = moveFile(from, to);
    if (mv.ok) result.pruned.push(f);
    else log('vendor-kernel 自愈: 单文件移动失败（继续处理其他）: ' + f + ' — ' + mv.err);
  }

  result.changed = result.pruned.length > 0;
  result.quarantinedTo = result.changed ? qdir : null;
  if (result.changed) {
    log('vendor-kernel 自愈完成: 移出 ' + result.pruned.length + ' 个非 pin(' + want + ') 内核 tarball 到 ' + qdir
      + '（compat-pin 版本混装防线已解除；如需回退可从该目录手动移回）');
  }
  return result;
}

module.exports = { healVendorStaleKernels, QUARANTINE_DIR_NAME };
