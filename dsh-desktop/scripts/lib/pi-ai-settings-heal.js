'use strict';

// ---------------------------------------------------------------------------
// llm-pi-ai settings.yaml 非法供应商条目自愈（boot repair 步，尽力而为不阻断）。
//
// 问题（0.5.7 / 内核 alpha.4 实测）：dsh-llm-pi-ai 的 apply() 对 providers
// dict 做一次性 resolve——pi-ai 模型目录不认识的 provider 路由若缺 api 或
// baseURL（历史版本宽松时代 / 手工编辑遗留的形态），**单条**即抛错 → 插件
// 启动失败 → 设置页所有第三方供应商整组消失（数据仍在 settings.yaml，仅
// UI 不可见）。「一家不合法，全体陪葬」。
//
// 修复：用安装内核的真码判定（mock ctx 跑 apply()，绝不自造目录内外规则
// ——目录收录与否只有内核知道），把抛错 provider 逐个移出，循环直到 apply
// 通过。宁漏勿误（对齐 removeDeadEntries「绝不自动删除、宁漏勿误」原则）：
//   - 内核 llm-pi-ai / yaml 模块不在位（半安装）→ 不修，下次 boot 再试；
//   - settings.yaml 缺失 / 解析失败 / 无 llm-pi-ai section / providers 非
//     dict → 一律不动；
//   - 抛错解析不出 provider 名、重复抛同名、或删到 providers 耗尽仍炸 →
//     放弃本次写入并告警（绝不把用户配置清光）；
//   - 写入前先整文件备份（.heal-piai-<suffix>），备份失败则放弃写入；
//   - 任何实现级异常由调用方容忍（repair 步语义：告警不阻断启动）。
//
// 已移出条目完整保留在备份文件，可人工回填：为该 provider 补
// `api: openai-completions` + `baseURL: <端点>` 两行（或改用目录内已收录
// 的路由名）即可恢复。
// ---------------------------------------------------------------------------

const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
// 原子写与 profile-patch-heal / sidecar 共用同一实现（全仓唯一原子写）。
const { writeFileAtomic } = require('./patch-io');

/** 备份后缀：与 plugin-sync backupSuffix 同式（时间戳 + 随机串防并发碰撞）。 */
const backupSuffix = () => Date.now() + '-' + Math.random().toString(36).slice(2, 8);

/** settings.yaml 路径（<home>/settings.yaml，与内核 settings 存储同源）。 */
function settingsFileOf(home) {
  return path.join(home || '', 'settings.yaml');
}

/**
 * 用安装内核真码判定一轮：mock ctx 喂 section 给 dsh-llm-pi-ai 的 apply()。
 * mock ctx 与内核插件的最小依赖面对齐（logger/inject/llm/authorization），
 * llm 走 Proxy 兜住任意方法（directory.replace 等），不触真实文件系统。
 * @param {(ctx: unknown, section: unknown) => void} piAiApply 内核 apply
 * @param {unknown} section llm-pi-ai section（plain object）
 * @returns {{ok: true} | {ok: false, provider?: string, message: string}}
 *   ok=false 时 provider 为从错误消息解析出的供应商键名（解析不出则缺省）。
 */
function probeWithKernel(piAiApply, section) {
  const noop = () => {};
  const ctx = {
    logger: { info: noop, warn: noop, error: noop, debug: noop },
    inject: noop,
    llm: new Proxy({}, { get: () => () => ({ replace: noop }) }),
    authorization: { registerFlow: noop },
  };
  try {
    piAiApply(ctx, section);
    return { ok: true };
  } catch (err) {
    const message = String((err && err.message) || err);
    const m = message.match(/provider "([^"]+)"/);
    return { ok: false, provider: m ? m[1] : undefined, message };
  }
}

/**
 * 自愈 settings.yaml 的 llm-pi-ai 非法 provider 条目（幂等、宁漏勿误）。
 * async：内核包是纯 ESM（exports 白名单且 type:module），须动态 import() 加载
 * （绝对路径文件 URL 不受 exports 约束，也不赌宿主 node 的 require(esm) 支持）。
 * @param {Object} opts
 * @param {string} opts.appDir           dsh-desktop 根（解析内核 llm-pi-ai 与 yaml）
 * @param {string} [opts.home]           DSH home（settings.yaml 所在；测试可被
 *   inject.settingsPath 覆盖）
 * @param {(msg: string) => void} [opts.log]
 * @param {{settingsPath?: string, probeApply?: Function, maxRounds?: number}} [opts.inject]
 *   测试注桩：settingsPath 覆盖目标文件；probeApply 覆盖内核判定；
 *   maxRounds 覆盖删除轮上限（默认 providers 键数 + 1）。
 * @returns {Promise<{changed: boolean, removed: string[], backup: string|null, note?: string}>}
 */
async function healPiAiSettings({ appDir, home, log = () => {}, inject } = {}) {
  const result = { changed: false, removed: [], backup: null };
  const settingsPath = (inject && inject.settingsPath) || settingsFileOf(home);
  let text;
  try {
    text = fs.readFileSync(settingsPath, 'utf8');
  } catch {
    result.note = 'settings-missing';
    return result; // 无 settings.yaml（全新用户）→ 无事可修
  }

  // 依赖解析（yaml 保真编辑 + 内核真码判定）；任一不在位则不修（下次 boot 再试）。
  let yaml, piAiApply;
  try {
    yaml = createRequire(path.join(appDir, 'package.json'))('yaml');
    piAiApply = (inject && inject.probeApply)
      || (await import(pathToFileURL(path.join(appDir, 'node_modules', '@deepseek-ai', 'dsh-llm-pi-ai', 'lib', 'index.js')))).apply;
  } catch (err) {
    result.note = 'deps-unavailable: ' + String((err && err.message) || err);
    log('llm-pi-ai 自愈跳过（依赖不在位，不修）: ' + result.note);
    return result;
  }
  if (inject && inject.probeApply) piAiApply = inject.probeApply;

  const doc = yaml.parseDocument(text, { uniqueKeys: true });
  if (doc.errors && doc.errors.length > 0) {
    result.note = 'yaml-parse-error';
    log('llm-pi-ai 自愈跳过（settings.yaml 解析失败，不动它）');
    return result;
  }

  const section = doc.toJS() && doc.toJS()['llm-pi-ai'];
  if (section === null || typeof section !== 'object' || Array.isArray(section)) {
    result.note = 'no-llm-pi-ai-section';
    return result;
  }
  const providers = section.providers;
  if (providers === null || typeof providers !== 'object' || Array.isArray(providers)
    || Object.keys(providers).length === 0) {
    result.note = 'no-providers';
    return result;
  }

  const maxRounds = (inject && inject.maxRounds) || Object.keys(providers).length + 1;
  const attempted = new Set();
  for (let round = 0; round < maxRounds; round++) {
    const current = doc.toJS()['llm-pi-ai'];
    const probe = probeWithKernel(piAiApply, current);
    if (probe.ok) break; // 健康或已收敛
    const name = probe.provider;
    if (!name) {
      result.note = 'unrecognized-failure: ' + probe.message;
      log('llm-pi-ai 自愈放弃（抛错不含 provider 名，宁漏勿误不动它）: ' + probe.message);
      return result;
    }
    if (attempted.has(name)) {
      result.note = 'repeat-failure: ' + name;
      log('llm-pi-ai 自愈放弃（移出 ' + name + ' 后仍抛同名错误，防环终止）');
      return result;
    }
    attempted.add(name);
    if (!doc.deleteIn(['llm-pi-ai', 'providers', name])) {
      result.note = 'provider-not-found: ' + name;
      log('llm-pi-ai 自愈放弃（错误指向的供应商键不在 settings 中）: ' + name);
      return result;
    }
    result.removed.push(name);
    log('llm-pi-ai 自愈: 内核判定供应商条目不合法（目录外路由缺 api/baseURL），移出 ' + name);
  }

  if (result.removed.length === 0) return result; // 本就健康，零写

  // 终态复核：删完后仍不健康则放弃写入（绝不带着坏配置覆盖用户文件）。
  const finalProbe = probeWithKernel(piAiApply, doc.toJS()['llm-pi-ai']);
  if (!finalProbe.ok) {
    result.note = 'still-unhealthy: ' + finalProbe.message;
    result.removed = [];
    log('llm-pi-ai 自愈放弃（移出全部疑似条目后仍不健康，保留原文件）: ' + finalProbe.message);
    return result;
  }

  // 备份原文（失败则放弃写入——备份都保不住时绝不覆盖用户配置）。
  const backup = settingsPath + '.heal-piai-' + backupSuffix();
  try {
    fs.copyFileSync(settingsPath, backup);
  } catch (err) {
    result.note = 'backup-failed: ' + String((err && err.message) || err);
    result.removed = [];
    log('llm-pi-ai 自愈放弃（备份失败，保留原文件）: ' + result.note);
    return result;
  }

  // EOL 保持：yaml toString 统一输出 LF，原文为 CRLF 时转回，避免全文漂移。
  let out = doc.toString();
  if (/\r\n/.test(text)) out = out.replace(/(^|[^\r])\n/g, '$1\r\n');
  try {
    writeFileAtomic(settingsPath, out);
  } catch (err) {
    result.note = 'write-failed: ' + String((err && err.message) || err);
    result.removed = [];
    log('llm-pi-ai 自愈放弃（写入失败）: ' + result.note);
    return result;
  }

  result.changed = true;
  result.backup = backup;
  log('llm-pi-ai 自愈完成: 移出 ' + result.removed.join(', ') + '，原文件已备份到 ' + backup
    + '（回填方法：为该供应商补 api: openai-completions 与 baseURL 两行）');
  return result;
}

module.exports = { healPiAiSettings, probeWithKernel, settingsFileOf, backupSuffix };
