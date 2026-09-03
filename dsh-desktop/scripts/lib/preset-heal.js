'use strict';

// ---------------------------------------------------------------------------
// 内置 Agent 预设落点自愈（boot repair 步，尽力而为不阻断）。
//
// 问题（issue #174「内置的预设没有出现在客户端」）：
//   v0.5.6 起内核（@deepseek-ai/dsh-agent-presets alpha.1+）的用户预设根为
//   <DSH_HOME>/.agent-presets（内核 lib/index.js:1307 dshHomePath(USER_PRESET_DIR)，
//   roots 只有「出厂集 + config.roots + 用户根」三类，见 dsh-web-app/cordis.patch.yml
//   的 agent-presets 行：只配 default，不配 roots）。而 desktop 侧 6e38c3b5 把
//   installBuiltinPresets 的参数语义从「dsh 包目录」改成「DSH home」时，
//   dsh-tauri/sidecar/cli.js 的 presets 步调用点没跟着改——仍传
//   installedDshPackageDir()，8 个内置预设被写进
//   <payload>/node_modules/@deepseek-ai/dsh/.agent-presets，没有任何 roots 扫那里，
//   客户端模式列表只剩出厂四件套（standard / ptc / minimal / cordis）。
//
// 本模块是「兜底补写网」：boot 的 presets 步负责把内置预设对账到随包源，
// 一旦那一步被跳过（WSL agent 未就绪）或抛错（payload 在只读目录、瞬态文件锁），
// 本步在 repair 阶段把 <DSH_HOME>/.agent-presets 里**缺失的部分**补上。
//
// 语义（对齐 pi-ai-settings-heal 的「全容忍 / 备份 / 原子写」，且比它更保守）：
//   - 递归枚举槽内全部文件（子目录一并重建），与安装器共用 scripts/lib/
//     preset-files.js 的单一枚举——预设可以携带嵌套资源（内核出厂 cordis
//     预设就有 presets/cordis/skills/<name>/SKILL.md，composition 里用
//     new URL('skills/', baseUrl) 引用），只拷顶层会静默丢资源；
//   - 只补不动：目标文件已存在且非零字节 → 一律不改写（用户自定义数据优先，
//     内置预设的定制正道是内核 authoring 的「复制成新 id」，见出厂 cordis 预设的
//     preset.yml 提示）；
//   - 缺失文件 → 原子写补上（先写 .tmp 再 rename，崩溃不留半文件）；
//   - 零字节残留（上次写入被强杀）→ 先备份再补写；
//   - 时间戳对齐源：补写后把 mtime 设为源 mtime，使 presets 步的
//     size+mtime 一致性判定直接命中，不再重复写盘；
//   - 源根 / 目标根 / 单个文件任何一处失败 → 记下 note 继续，绝不抛（repair 步
//     任何子失败都不得阻断启动）。
// ---------------------------------------------------------------------------

const fs = require('node:fs');
const path = require('node:path');
// 原子写与备份与全仓同一实现：writeFileAtomic 经 patch-io 再导出，
// backupFile 只由 plugin-core/lib/fs-atomic 提供（轮转保留最近 N 份）。
const { writeFileAtomic } = require('./patch-io');
const { backupFile } = require('../plugin-core/lib/fs-atomic');
// 预设槽枚举与安装器（install-minimal-win-preset）共用单一实现：递归 + 相对路径。
const { SHARED_PRESET_DIR, listPresetSlots, listPresetSlotFiles, slotFileAt } = require('./preset-files');

/** 随包预设源根（appDir 为 dsh-desktop 根 / payload 根）。 */
function presetSourceRoot(appDir) {
  return path.join(appDir, 'assets', 'agent-presets');
}

/** 内核可发现的用户预设根（<DSH_HOME>/.agent-presets）。 */
function presetDestRoot(home) {
  return path.join(home, '.agent-presets');
}

/**
 * 补写一个预设槽里缺失的文件（已存在的非零字节文件绝不动）。
 *
 * 枚举走 preset-files.js 的递归实现（与安装器同一份）：槽内子目录（预设自带的
 * skills/ 、prompts/ 类资源目录，内核出厂 cordis 预设即如此）会按需重建，
 * 缺失的嵌套文件同样补写，已存在的一律不碰。计数里每一项都是**相对槽根**的
 * 路径（正斜杠分隔），跨平台可读。
 * @param {string} srcDir 源槽目录
 * @param {string} destDir 目标槽目录
 * @param {(msg: string) => void} log
 * @returns {{added: string[], replacedEmpty: string[], failed: string[], createdDir: boolean}}
 */
function healPresetSlot(srcDir, destDir, log) {
  const out = { added: [], replacedEmpty: [], failed: [], createdDir: false };
  const rels = listPresetSlotFiles(srcDir);
  if (rels.length === 0) return out; // 空槽（或读不到源）→ 不建空目录
  // 目标槽根被非目录占位、或状态查不清 → 整槽跳过（报一次，不逐文件重复失败）。
  try {
    if (!fs.statSync(destDir).isDirectory()) {
      out.failed.push(path.basename(destDir));
      log('preset-heal: 目标槽被非目录占位，跳过 ' + destDir);
      return out;
    }
  } catch (err) {
    if (err && err.code !== 'ENOENT') {
      out.failed.push(path.basename(destDir));
      log('preset-heal: 目标槽状态未知，跳过 ' + destDir + ': ' + (err.message || err));
      return out;
    }
    // ENOENT：留到首个文件写入前按父目录建档（嵌套目录同走一条路径）。
  }
  for (const rel of rels) {
    const sf = slotFileAt(srcDir, rel);
    const df = slotFileAt(destDir, rel);
    let dst = null;
    try {
      dst = fs.statSync(df);
    } catch { /* 缺失：待补写 */ }
    if (dst && dst.isFile() && dst.size > 0) continue; // 存在且非空 → 不动（用户数据优先）
    if (dst && dst.isFile() && dst.size === 0) {
      // 零字节残留：备份后重写（备份失败也继续补——原文件本就无内容可保）。
      const bak = backupFile(df, { log });
      log('preset-heal: 零字节残留补写 ' + df + (bak ? '（原文件备份为 ' + path.basename(bak) + '）' : ''));
      out.replacedEmpty.push(rel);
    }
    let content;
    let st;
    try {
      content = fs.readFileSync(sf);
      st = fs.statSync(sf);
    } catch (err) {
      out.failed.push(rel);
      log('preset-heal: 源文件读取失败，跳过 ' + sf + ': ' + (err.message || err));
      continue;
    }
    // writeFileAtomic 不隐式建目录（全仓契约），嵌套资源逐文件按父目录建。
    const parent = path.dirname(df);
    if (!fs.existsSync(parent)) {
      try {
        fs.mkdirSync(parent, { recursive: true });
        out.createdDir = true;
      } catch (err) {
        out.failed.push(rel);
        log('preset-heal: 目标建档失败，跳过 ' + parent + ': ' + (err.message || err));
        continue;
      }
    }
    try {
      writeFileAtomic(df, content);
    } catch (err) {
      out.failed.push(rel);
      log('preset-heal: 补写失败，跳过 ' + df + ': ' + (err.message || err));
      continue;
    }
    // 时间戳对齐源：presets 步的 fileMatches（size + mtime）据此命中跳过。
    try {
      fs.utimesSync(df, st.atime, st.mtime);
    } catch { /* 时间戳写不进不影响内容正确性 */ }
    if (!dst) out.added.push(rel);
  }
  return out;
}

/**
 * 兜底自愈：把随包内置预设补写进内核可发现的用户预设根。
 * @param {Object} opts
 * @param {string} opts.appDir  dsh-desktop 根（含 assets/agent-presets）
 * @param {string} opts.home    DSH home（WSL 模式下为 UNC home）
 * @param {(msg: string) => void} [opts.log]
 * @param {{sourceRoot?: string, destRoot?: string, slots?: string[]}} [opts.inject]
 *   测试注桩：覆盖源根 / 目标根 / 预设槽清单。
 * @returns {{changed: boolean, slots: number, added: number, replacedEmpty: number,
 *            failed: number, note?: string, legacy?: string}}
 *   纯计数结果（note 为「本次为何没做事」的原因码，仅供日志与测试断言）。
 */
function healBuiltinPresets({ appDir, home, log = () => {}, inject } = {}) {
  const result = { changed: false, slots: 0, added: 0, replacedEmpty: 0, failed: 0 };
  const sourceRoot = (inject && inject.sourceRoot) || presetSourceRoot(appDir || '');
  const destRoot = (inject && inject.destRoot) || presetDestRoot(home || '');

  const slots = (inject && inject.slots) || listPresetSlots(sourceRoot);
  if (slots.length === 0) {
    result.note = 'source-missing';
    log('preset-heal: 随包预设源不可用（' + sourceRoot + '），本次跳过');
    return result;
  }

  try {
    fs.mkdirSync(destRoot, { recursive: true });
  } catch (err) {
    result.note = 'dest-unwritable: ' + (err.message || err);
    log('preset-heal: 用户预设根不可写，跳过 ' + destRoot + ': ' + (err.message || err));
    return result;
  }

  for (const id of slots) {
    // `_preset` 不属预设槽（名字不符合内核 PRESET_ID，发现层会跳过），但承载
    // zero/whoami 系的 `../_preset/*.mjs` 共享模块，缺失即整槽损坏，所以一并补写、
    // 但不计入槽数。
    const r = healPresetSlot(path.join(sourceRoot, id), path.join(destRoot, id), log);
    if (id !== SHARED_PRESET_DIR) result.slots += 1;
    result.added += r.added.length;
    result.replacedEmpty += r.replacedEmpty.length;
    result.failed += r.failed.length;
  }
  result.changed = result.added > 0 || result.replacedEmpty > 0;
  if (result.changed) {
    log('preset-heal: 补写内置 Agent 预设 ' + result.added + ' 个文件（零字节重写 '
      + result.replacedEmpty + '，失败 ' + result.failed + '）→ ' + destRoot);
  } else if (result.failed > 0) {
    result.note = 'partial: ' + result.failed + ' 项失败';
  }
  return result;
}

/**
 * 旧落点残留探测（仅诊断，不删除不移动——payload 可能位于只读/受保护目录）。
 * 自 6e38c3b5（v0.5.6）起至修复前的版本（0.6.2 安装副本实测仍在）都把预设写进
 * dsh 包目录，升级后那是个无人读取的死角（实测 56 个文件躺着，而用户根空）。
 * @param {string} appDir
 * @returns {string} 残留目录路径，不存在返回 ''
 */
function detectLegacyPresetCopy(appDir) {
  const legacy = path.join(appDir || '', 'node_modules', '@deepseek-ai', 'dsh', '.agent-presets');
  try {
    return fs.statSync(legacy).isDirectory() ? legacy : '';
  } catch {
    return '';
  }
}

module.exports = {
  healBuiltinPresets,
  healPresetSlot,
  listPresetSlots,
  listPresetSlotFiles,
  presetSourceRoot,
  presetDestRoot,
  detectLegacyPresetCopy,
  SHARED_PRESET_DIR,
};
