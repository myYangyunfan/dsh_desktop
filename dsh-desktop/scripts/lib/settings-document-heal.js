'use strict';

// ---------------------------------------------------------------------------
// settings.yaml 整文档损坏自愈（boot repair 步，尽力而为不阻断）。
//
// 问题（用户反馈「加载提供方目录失败: settings service is absent」实锤）：
// dsh-settings-file 的 parse() 在**初始加载**（reconcileFromDisk → load）时对
// 文档非法是**致命抛错**——document.errors.length>0 抛 Error、根非 map 抛
// TypeError。抛错发生在插件激活期 → cordis loader-isolation 把 settings 提供方
// 整个降级掉 → `settings` 服务缺席 → 设置页读「提供方目录」经 settings-controller
// 的 provider() 命中 `ctx.get("settings") === void 0` → 弹窗「settings service is
// absent」。热重载 refresh() 却是容错的（keep last good document）——这条**初始
// 致命 / 热更容错的不对称**正是家目录被写坏（PowerShell Set-Content 带 BOM、
// 手工编辑遗留语法错、根被写成数组/标量）时整页坏掉的根因。
//
// 修复：在内核拉起前，用与 dsh-settings-file **同款 yaml 库、同款 parse() 判定**
// 校验 <home>/settings.yaml 是否可解析为 map；不可解析时按「最大保数据」分级自愈：
//   1. 无损剥 BOM：仅前导 BOM（U+FEFF）导致非法时，剥去 BOM 原样写回（内容零丢失）；
//   2. 恢复最近合法备份：settings.yaml 同目录里按 mtime 降序找第一个可解析为 map 的
//      兄弟备份（.bak-* / .heal-piai-* 等），复制回来；
//   3. 重置最小空文档：无可恢复时写「recovered 头 + 空」——dsh-settings-file 对空
//      文档 toJS() ?? {} 视为合法 map，提供方得以挂载（目录为空而非缺席），弹窗消失。
// 三条路径写入前都先把损坏原件整文件备份为 .broken-<suffix>；备份失败即放弃覆盖。
// 宁漏勿误（对齐 pi-ai-settings-heal「绝不带着坏配置覆盖用户文件」）：健康文件零改写、
// 依赖不在位（半安装）不修、任何实现级异常由调用方容忍（repair 步语义：告警不阻断启动）。
// ---------------------------------------------------------------------------

const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
// 原子写与 pi-ai-settings-heal / profile-patch-heal / sidecar 共用同一实现。
const { writeFileAtomic } = require('./patch-io');

/** 备份后缀：与 plugin-sync / pi-ai backupSuffix 同式（时间戳 + 随机串防并发碰撞）。 */
const backupSuffix = () => Date.now() + '-' + Math.random().toString(36).slice(2, 8);

/** settings.yaml 路径（<home>/settings.yaml，与内核 settings 存储同源）。 */
function settingsFileOf(home) {
  return path.join(home || '', 'settings.yaml');
}

/** 剥去前导 UTF-8 BOM（Node 以 utf8 读入后 BOM 表现为前导 U+FEFF）。 */
function stripLeadingBom(text) {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

/**
 * 用与 dsh-settings-file parse() 同款的判定校验一段文本能否作为合法 settings 文档：
 * yaml 解析零错误，且根（空文档经 `?? {}` 兜底后）为 plain object（非 null / 非数组）。
 * @param {{parseDocument: (t: string, o?: object) => {errors: unknown[], toJS: () => unknown}}} yaml
 * @param {string} text
 * @returns {boolean}
 */
function isHealthySettingsDocument(yaml, text) {
  try {
    const doc = yaml.parseDocument(text, { prettyErrors: true });
    if (doc.errors && doc.errors.length > 0) return false;
    const root = doc.toJS() ?? {};
    return typeof root === 'object' && root !== null && !Array.isArray(root);
  } catch {
    return false;
  }
}

/**
 * 在同目录里找「最近一个可解析为 map 的 settings.yaml 兄弟备份」（mtime 降序）。
 * 排除本次刚生成的损坏件（exclude）；每个候选都用同款健康判定复核，坏的不入选。
 * @param {string} dir settings.yaml 所在目录
 * @param {string} baseName settings.yaml 文件名（候选须以 baseName + '.' 前缀）
 * @param {(yaml: unknown, text: string) => boolean} healthy 健康判定闭包
 * @param {string} exclude 需排除的绝对路径（本次损坏备份）
 * @returns {string|null} 命中的备份绝对路径，无则 null
 */
function findMostRecentHealthyBackup(fsImpl, dir, baseName, yaml, exclude) {
  let names;
  try {
    names = fsImpl.readdirSync(dir);
  } catch {
    return null;
  }
  const prefix = baseName + '.';
  const candidates = [];
  for (const name of names) {
    if (!name.startsWith(prefix)) continue; // 只看 settings.yaml.* 兄弟备份
    const abs = path.join(dir, name);
    if (abs === exclude) continue;
    let st;
    try {
      if (!fsImpl.statSync(abs).isFile()) continue;
      st = fsImpl.statSync(abs);
    } catch {
      continue;
    }
    candidates.push({ abs, mtimeMs: st.mtimeMs });
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  for (const c of candidates) {
    let text;
    try {
      text = fsImpl.readFileSync(c.abs, 'utf8');
    } catch {
      continue;
    }
    if (isHealthySettingsDocument(yaml, stripLeadingBom(text))) return c.abs;
  }
  return null;
}

/**
 * 自愈整文档不可解析的 settings.yaml（幂等、最大保数据、全容忍）。
 * @param {Object} opts
 * @param {string} opts.appDir dsh-desktop 根（解析安装内核同款 yaml 库）
 * @param {string} [opts.home] DSH home（settings.yaml 所在；测试可被 inject.settingsPath 覆盖）
 * @param {(msg: string) => void} [opts.log]
 * @param {{settingsPath?: string, yaml?: unknown, fs?: Object}} [opts.inject]
 *   测试注桩：settingsPath 覆盖目标文件；yaml 覆盖解析器；fs 覆盖文件系统。
 * @returns {{changed: boolean, action: string, backup: string|null, restoredFrom?: string, note?: string}}
 *   action ∈ none | strip-bom | restore-backup | reset-empty
 */
function healSettingsDocument({ appDir, home, log = () => {}, inject } = {}) {
  const fsImpl = (inject && inject.fs) || fs;
  const settingsPath = (inject && inject.settingsPath) || settingsFileOf(home);
  const result = { changed: false, action: 'none', backup: null };

  let text;
  try {
    text = fsImpl.readFileSync(settingsPath, 'utf8');
  } catch (err) {
    result.note = 'settings-missing'; // ENOENT：全新用户无 settings.yaml → 无事可修
    return result;
  }

  // 同款 yaml 库（与 dsh-settings-file 一致）；不在位（半安装）→ 不修，下次 boot 再试。
  let yaml;
  try {
    yaml = (inject && inject.yaml) || createRequire(path.join(appDir, 'package.json'))('yaml');
  } catch (err) {
    result.note = 'deps-unavailable: ' + String((err && err.message) || err);
    log('settings.yaml 文档自愈跳过（yaml 依赖不在位，不修）: ' + result.note);
    return result;
  }

  // 健康：零改写（含剥 BOM 后本就合法但无 BOM 的情形——isHealthy 直接通过）。
  if (isHealthySettingsDocument(yaml, text)) return result;

  // 路径 1：仅前导 BOM 导致非法 → 无损剥 BOM 原样写回（内容零丢失）。
  const stripped = stripLeadingBom(text);
  if (stripped !== text && isHealthySettingsDocument(yaml, stripped)) {
    const backup = settingsPath + '.heal-bom-' + backupSuffix();
    try {
      fsImpl.copyFileSync(settingsPath, backup);
    } catch (err) {
      result.note = 'backup-failed: ' + String((err && err.message) || err);
      log('settings.yaml 文档自愈放弃（BOM 剥离前备份失败，保留原文件）: ' + result.note);
      return result;
    }
    let out = stripped;
    if (/\r\n/.test(text)) out = out.replace(/\r?\n/g, '\r\n'); // EOL 保真，避免全文漂移
    try {
      writeFileAtomic(settingsPath, out);
    } catch (err) {
      result.note = 'write-failed: ' + String((err && err.message) || err);
      log('settings.yaml 文档自愈放弃（BOM 剥离写入失败）: ' + result.note);
      return result;
    }
    result.changed = true;
    result.action = 'strip-bom';
    result.backup = backup;
    log('settings.yaml 文档自愈: 检测到前导 BOM 导致解析失败，已剥离 BOM 原样写回（内容零丢失），原件备份到 ' + backup);
    return result;
  }

  // 无法无损修复：先把损坏原件整文件备份为 .broken-<suffix>（rename 优先，跨设备回落 copy）。
  const broken = settingsPath + '.broken-' + backupSuffix();
  try {
    try {
      fsImpl.renameSync(settingsPath, broken);
    } catch {
      fsImpl.copyFileSync(settingsPath, broken);
    }
  } catch (err) {
    result.note = 'backup-failed: ' + String((err && err.message) || err);
    log('settings.yaml 文档自愈放弃（损坏原件备份失败，保留原文件不动）: ' + result.note);
    return result;
  }
  result.backup = broken;

  // 路径 2：从同目录最近一个合法兄弟备份恢复。
  const restoredFrom = findMostRecentHealthyBackup(fsImpl, path.dirname(settingsPath), path.basename(settingsPath), yaml, broken);
  if (restoredFrom) {
    try {
      fsImpl.copyFileSync(restoredFrom, settingsPath);
    } catch (err) {
      result.note = 'restore-failed: ' + String((err && err.message) || err);
      log('settings.yaml 文档自愈: 损坏原件已备份到 ' + broken + '，但从备份恢复失败（' + result.note + '），转重置最小文档');
      // 落入路径 3（继续执行下面的重置）。
    }
    if (!result.note) {
      result.changed = true;
      result.action = 'restore-backup';
      result.restoredFrom = restoredFrom;
      log('settings.yaml 文档自愈: 原文件不可解析，已从最近合法备份恢复（' + restoredFrom + '），损坏原件备份到 ' + broken);
      return result;
    }
  }

  // 路径 3：无可恢复备份 → 重置为最小空文档（recovered 头 + 空，dsh-settings-file 视为合法 map）。
  const header = '# recovered by DSH Desktop: settings.yaml 原内容无法解析，已备份到\n# '
    + broken + '\n# 已重置为最小空文档；如需找回原配置请查看上述备份文件。\n';
  try {
    writeFileAtomic(settingsPath, header);
  } catch (err) {
    result.note = 'write-failed: ' + String((err && err.message) || err);
    log('settings.yaml 文档自愈放弃（重置写入失败，损坏原件仍保全在 ' + broken + '）: ' + result.note);
    return result;
  }
  result.changed = true;
  result.action = 'reset-empty';
  log('settings.yaml 文档自愈: 原文件不可解析且无合法备份，已重置为最小空文档（settings 提供方得以挂载，目录为空而非缺席），损坏原件备份到 ' + broken);
  return result;
}

module.exports = {
  healSettingsDocument,
  isHealthySettingsDocument,
  stripLeadingBom,
  findMostRecentHealthyBackup,
  settingsFileOf,
  backupSuffix,
};
