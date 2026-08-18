'use strict';
// ---------------------------------------------------------------------------
// DSH Desktop 诊断（设置页「插件」页内嵌「诊断与备份」区块）：
// 纯函数部分集中于本模块（patch 健康 / bundles 完整性 / 日志尾部错误 /
// 崩溃转储 / 环境信息），便于 node --test 单测；main.js 负责取路径
// （effectiveDshHome / logsDir / crashDumpsDir）与 IPC 编排。
//
// 诊断原则：只读、不写盘、不联网；任何单项失败降级为该项 error 记录，
// 绝不因单项异常中断整个报告。报告结构：
// {
//   ok,                 // errors.length === 0
//   errors:   [],       // 硬问题（启动失败风险 / 配置损坏）
//   warnings: [],       // 潜在问题（可运行但需注意）
//   infos:    [],       // 环境与状态说明
//   sections: {
//     patch:   {...},   // cordis.patch.yml 健康
//     bundles: {...},   // manifest dsh.profile.bundles 解析
//     plugins: {...},   // 组件/核心条目是否存在（loadDshYamlDialect 之外的结构检查）
//     logs:    {...},   // desktop.log / dsh-web.log 尾部错误扫描
//     crashes: {...},   // crash-dumps 目录
//     env:     {...},   // 版本与路径
//   },
// }
// ---------------------------------------------------------------------------

/** 只读文件尾部（字节上限），读不到返回 ''。 */
function readTailText(file, maxBytes, fs) {
  try {
    const stat = fs.statSync(file);
    if (stat.size <= 0) return '';
    const len = Math.min(stat.size, maxBytes);
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(len);
    try {
      fs.readSync(fd, buf, 0, len, stat.size - len);
    } finally {
      fs.closeSync(fd);
    }
    return buf.toString('utf8');
  } catch {
    return '';
  }
}

/** 行级去重计数（保序）：[{line, count}]，供日志错误扫描聚合。 */
function tallyLines(lines) {
  const out = [];
  const seen = new Map();
  for (const line of lines) {
    const key = line.trim();
    if (!key) continue;
    const hit = seen.get(key);
    if (hit) { hit.count += 1; continue; }
    const row = { line: key, count: 1 };
    seen.set(key, row);
    out.push(row);
  }
  return out;
}

/**
 * 扫描日志尾部，返回聚合错误行。
 * @param {string} file 日志文件路径（不存在返回 null）
 * @param {object} opts { maxBytes, errorRe, sampleCount }（可覆盖）
 * @param {object} fs
 */
function scanLogTail(file, opts = {}, fs = require('node:fs')) {
  const maxBytes = opts.maxBytes || 256 * 1024;
  const errorRe = opts.errorRe || /error|fatal|fail|exception|crash|unhandled|ENOENT|EACCES|ECONNREFUSED|EADDRINUSE/i;
  const ignoreRe = opts.ignoreRe || /code=0|exit code[: ]0|退出 code=0|process exited with code 0|failures=0|清零故障计数|无错误|没有错误|错误处理完成|error_count=0|零故障/i;
  const sampleCount = opts.sampleCount === undefined ? 2000 : opts.sampleCount;
  if (!fs.existsSync(file)) return null;
  const text = readTailText(file, maxBytes, fs);
  const lines = text.split(/\r?\n/).filter(Boolean);
  const errors = tallyLines(
    lines.filter((l) => errorRe.test(l) && !ignoreRe.test(l) && !/^\s*(at |throw |return |if |const |let |var |function |[A-Za-z_$][\w$]*\.)/.test(l)),
  ).slice(0, sampleCount);
  return { file, totalLines: lines.length, errors };
}

/**
 * cordis.patch.yml 健康检查。
 * @param {string} patchFile patch 文件绝对路径
 * @param {object} yaml js-yaml 方言加载器 { load(text) }；null 表示不可用
 * @param {object} fs
 * @returns {object} { exists, parseOk, parseError, entryCount, duplicateIds, orphanIds, entries }
 */
function analyzePatch(patchFile, yaml, fs = require('node:fs')) {
  const out = {
    exists: false, parseOk: false, parseError: null,
    entryCount: 0, duplicateIds: [], orphanIds: [], entries: [],
  };
  if (!fs.existsSync(patchFile)) return out;
  out.exists = true;
  let text;
  try { text = fs.readFileSync(patchFile, 'utf8'); } catch (err) { out.parseError = `无法读取: ${err.message}`; return out; }
  if (!yaml) { out.parseError = 'js-yaml 不可用，无法解析（仅做结构检查）'; }
  let rows = null;
  if (yaml) {
    try { rows = yaml.load(text); } catch (err) { out.parseError = String((err && err.message) || err); return out; }
    if (!Array.isArray(rows)) { out.parseError = '顶层不是数组'; return out; }
    out.parseOk = true;
  } else {
    // 无 js-yaml：仅当文本恰好是合法 JSON 数组（patch 的最简形态）时可解析；
    // 否则不冒险执行任意文本（Function 构造在诊断路径是风险），报告待解析。
    try { rows = JSON.parse(text); } catch { out.parseError = 'js-yaml 不可用且文件不是 JSON 数组，无法解析'; return out; }
    if (!Array.isArray(rows)) { out.parseError = '顶层不是数组'; return out; }
    out.parseOk = true;
  }
  out.entries = rows;
  out.entryCount = rows.length;
  // 顶层条目 id 与 insert id 收集：顶层 id 是 loader 条目 id（重复 = duplicate loader entry id
  // 启动失败），必须无条件收集；insert 内的 id 同样构成条目池，一并收集。
  const ids = [];
  for (const entry of rows) {
    if (!entry || typeof entry !== 'object') continue;
    if (typeof entry.id === 'string') ids.push(entry.id);
    if (Array.isArray(entry.insert)) {
      for (const it of entry.insert) {
        if (it && typeof it.id === 'string') ids.push(it.id);
      }
    }
  }
  const counts = new Map();
  for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1);
  out.duplicateIds = [...counts.entries()]
    .filter(([, n]) => n > 1)
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => a.id.localeCompare(b.id));
  // 孤儿：顶层条目（非 insert 数组）缺 id
  out.orphanIds = rows
    .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry.insert) && typeof entry.id !== 'string')
    .map((entry) => `(anonymous #${rows.indexOf(entry)})`);
  return out;
}

/**
 * manifest dsh.profile.bundles 完整性：每个 bundle 按 boot 语义解析：
 * profile node_modules → 官方核心目录（app node_modules/@deepseek-ai）
 * → 内置配套 assets/plugins。
 * @param {string} profileDir profile 目录
 * @param {string|null} assetsDir 内置配套插件目录（不存在传 null，跳过兜底）
 * @param {string|null} coreDirDshAt 官方核心目录（app node_modules；不存在传 null）
 * @param {object} fs
 */
function analyzeBundles(profileDir, assetsDir, coreDirDshAt, fs = require('node:fs')) {
  const path = require('node:path');
  const out = { bundles: [], missing: [] };
  let manifest = null;
  try { manifest = JSON.parse(fs.readFileSync(path.join(profileDir, 'package.json'), 'utf8')); } catch { out.error = 'profile package.json 缺失或不可读'; return out; }
  const names = (manifest && manifest.dsh && manifest.dsh.profile && Array.isArray(manifest.dsh.profile.bundles))
    ? manifest.dsh.profile.bundles.filter((n) => typeof n === 'string')
    : [];
  for (const name of names) {
    const entry = { name, resolved: null, source: null };
    const profilePath = path.join(profileDir, 'node_modules', ...name.split('/'));
    if (fs.existsSync(path.join(profilePath, 'package.json'))) {
      entry.resolved = profilePath;
      entry.source = 'profile';
    } else if (name.startsWith('@deepseek-ai/') && coreDirDshAt) {
      const corePath = path.join(coreDirDshAt, name.slice('@deepseek-ai/'.length));
      if (fs.existsSync(path.join(corePath, 'package.json'))) {
        entry.resolved = corePath;
        entry.source = 'core';
      }
    }
    if (!entry.resolved && assetsDir) {
      // 与 desktop-ordering/desktop-validity 的解析保持一致：assets 下用完整包路径
      // （含 scope 段 @scope/name → assets/@scope/name），避免 scoped 配套包误报缺失
      const assetPath = path.join(assetsDir, ...name.split('/'));
      if (fs.existsSync(path.join(assetPath, 'package.json'))) {
        entry.resolved = assetPath;
        entry.source = 'assets';
      }
    }
    if (!entry.resolved) out.missing.push(name);
    out.bundles.push(entry);
  }
  return out;
}

/**
 * 插件结构一致性：patch insert 条目 vs node_modules 目录。
 * @param {Array} entries analyzePatch 返回的 entries
 * @param {string} profileDir
 * @param {object} fs
 */
function analyzePlugins(entries, profileDir, fs = require('node:fs')) {
  const path = require('node:path');
  const insertIds = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    if (Array.isArray(entry.insert)) {
      for (const it of entry.insert) {
        if (it && typeof it.id === 'string') insertIds.push({ id: it.id, name: it.name || '' });
      }
    }
  }
  const missingDirs = [];
  for (const { id, name } of insertIds) {
    if (!name) continue; // 无 name 的条目不做目录校验
    const dir = path.join(profileDir, 'node_modules', ...name.split('/'));
    if (!fs.existsSync(path.join(dir, 'package.json'))) missingDirs.push({ id, name });
  }
  return { insertCount: insertIds.length, missingDirs };
}

/**
 * 崩溃转储检查。
 * @param {string|null} crashDir crash-dumps 目录（不存在传 null）
 */
function analyzeCrashDumps(crashDir, fs = require('node:fs')) {
  const out = { dirExists: !!crashDir && fs.existsSync(crashDir), dumpCount: 0, newestDump: null, oldestDump: null };
  if (!out.dirExists) return out;
  let names = [];
  try { names = fs.readdirSync(crashDir).filter((n) => n.endsWith('.dmp')); } catch { return out; }
  out.dumpCount = names.length;
  let newest = 0, oldest = Infinity;
  for (const n of names) {
    try {
      const mtime = fs.statSync(require('node:path').join(crashDir, n)).mtimeMs;
      if (mtime > newest) { newest = mtime; out.newestDump = n; }
      if (mtime < oldest) { oldest = mtime; out.oldestDump = n; }
    } catch { /* stat 失败跳过 */ }
  }
  return out;
}

/**
 * 汇总诊断报告。
 * @param {object} opts
 *   { profileDir, patchFile, logs: {desktop, web}, crashDir, assetsDir,
 *     coreDirDshAt, yaml, env: {version, electron, node, platform, arch, home, profileName} }
 * @param {object} fs
 * @returns {object} 报告（见模块头注释）
 */
// 读取启动自愈历史（main.js 每次自愈时写入 userData/self-heal-history.json）。
// 容错：文件缺失 / 损坏 / 形状不符一律返回 []，绝不因为历史文件问题让诊断失败。
function readSelfHealHistory(file, fs = require('node:fs')) {
  if (!file) return [];
  try {
    if (!fs.existsSync(file)) return [];
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(data)) return [];
    return data
      .filter((it) => it && typeof it === 'object' && typeof it.ts === 'number' && Array.isArray(it.names))
      .map((it) => ({
        kind: it.kind === 'overlay' ? 'overlay' : 'bundle',
        names: it.names.filter((n) => typeof n === 'string'),
        ts: it.ts,
      }))
      .filter((it) => it.names.length > 0)
      .slice(0, 5);
  } catch {
    return [];
  }
}

/** A-3：判断一行后端日志是否为 LLM 调用错误。
 *  关键词直达（NO_ADAPTER/INVALID_REPLAY_STATE/MISSING_CREDENTIAL 等），
 *  或「4xx/5xx 状态码 + LLM 上下文词」同时命中（避免裸 4xx/5xx 误报端口/行号）。 */
const LLM_ERR_KEY_RE = /NO_ADAPTER|INVALID_REPLAY_STATE|MISSING_CREDENTIAL|INVALID_(?:API_)?KEY|AUTHENTICATION_FAILED|UNAUTHORIZED|RATE_LIMIT/i;
const LLM_STATUS_RE = /\b[45]\d\d\b/;
const LLM_CONTEXT_RE = /llm|model|api|credential|secret|token|key|auth/i;
function isLlmErrorLine(line) {
  if (!line) return false;
  if (LLM_ERR_KEY_RE.test(line)) return true;
  return LLM_STATUS_RE.test(line) && LLM_CONTEXT_RE.test(line);
}

/** 读 llm-errors.jsonl（环形 1MB，A-3 落盘），返回 {exists, count, recent:[{at,line}]}。 */
function analyzeLlmErrors(file, fs = require('node:fs')) {
  try {
    if (!file || !fs.existsSync(file)) return { exists: false, count: 0, recent: [] };
    const rows = [];
    for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (!raw.trim()) continue;
      try {
        const r = JSON.parse(raw);
        if (r && typeof r.at === 'string') rows.push(r);
      } catch {}
    }
    return {
      exists: true,
      count: rows.length,
      recent: rows.slice(-5).map((r) => ({ at: r.at, line: typeof r.line === 'string' ? r.line.slice(0, 300) : '' })),
    };
  } catch {
    return { exists: false, count: 0, recent: [] };
  }
}

/** A-3 默认模型解析：settings.yaml 的 agent-default-model.{provider,model} +
 *  llm-pi-ai.providers.<provider>.apiKeyEnv 关联 .credentials.yaml 的凭证键存在性。 */
function resolveDefaultModel(settingsFile, credentialsFile, yaml, fs = require('node:fs')) {
  try {
    let settings = null;
    try {
      if (settingsFile && yaml) settings = yaml.load(fs.readFileSync(settingsFile, 'utf8'));
    } catch {}
    if (!settings || typeof settings !== 'object') {
      return { ok: false, reason: 'settings.yaml 不可读' };
    }
    const adm = settings['agent-default-model'];
    if (!adm || typeof adm !== 'object' || !adm.provider || !adm.model) {
      return { ok: false, reason: 'settings.yaml 缺少 agent-default-model（provider/model）' };
    }
    let apiKeyEnv = null;
    try {
      const providers = settings['llm-pi-ai'] && settings['llm-pi-ai'].providers;
      const p = providers && providers[adm.provider];
      if (p && typeof p.apiKeyEnv === 'string') apiKeyEnv = p.apiKeyEnv;
    } catch {}
    let credentialPresent = null;
    if (apiKeyEnv) {
      try {
        const esc = apiKeyEnv.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        credentialPresent = new RegExp('(^|\\n)\\s*' + esc + '\\s*:').test(fs.readFileSync(credentialsFile, 'utf8'));
      } catch {
        credentialPresent = null;
      }
    }
    return { ok: true, provider: adm.provider, model: adm.model, apiKeyEnv, credentialPresent };
  } catch {
    return { ok: false, reason: '解析失败' };
  }
}

function runDiagnostics(opts, fs = require('node:fs')) {
  const path = require('node:path');
  const e = (msg) => ({ code: 'message', message: msg });
  const errors = [], warnings = [], infos = [];

  const patch = analyzePatch(opts.patchFile, opts.yaml, fs);
  const sections = { patch };

  // --- patch 健康 ---
  if (!patch.exists) errors.push(e('cordis.patch.yml 不存在，DSH 将无法加载任何插件'));
  else if (!patch.parseOk && !patch.parseError) { /* 结构兜底成功 */ }
  else if (!patch.parseOk && patch.parseError) errors.push(e(`cordis.patch.yml 解析失败: ${patch.parseError}`));
  else if (patch.parseOk) {
    for (const dup of patch.duplicateIds) {
      errors.push(e(`重复的 loader 条目 id「${dup.id}」（${dup.count} 次）——可能导致启动失败（duplicate loader entry id）`));
    }
    for (const orphan of patch.orphanIds) warnings.push(e(`patch 顶层存在缺 id 的匿名条目（${orphan}）`));
    infos.push(e(`cordis.patch.yml 解析正常，共 ${patch.entryCount} 个条目`));
  }

  // --- bundles 完整性 ---
  const bundles = analyzeBundles(opts.profileDir, opts.assetsDir, opts.coreDirDshAt, fs);
  sections.bundles = bundles;
  if (bundles.error) errors.push(e(bundles.error));
  else {
    infos.push(e(`profile 声明 ${bundles.bundles.length} 个 bundle`));
    for (const name of bundles.missing) {
      warnings.push(e(`bundle「${name}」未在 profile node_modules 与内置 assets 中找到，可能无法加载`));
    }
  }

  // --- 插件结构 ---
  const plugins = analyzePlugins(patch.entries, opts.profileDir, fs);
  sections.plugins = plugins;
  for (const miss of plugins.missingDirs) {
    warnings.push(e(`插件「${miss.id}」（${miss.name}）的包目录缺失，运行时会报错`));
  }

  // --- 日志尾部 ---
  const logs = {};
  if (opts.logs && opts.logs.desktop) logs.desktop = scanLogTail(opts.logs.desktop, {}, fs);
  if (opts.logs && opts.logs.web) logs.web = scanLogTail(opts.logs.web, {}, fs);
  sections.logs = logs;
  const logNames = { desktop: 'desktop.log', web: 'dsh-web.log' };
  for (const key of ['desktop', 'web']) {
    const scan = logs[key];
    if (!scan) continue;
    const recent = scan.errors.filter((r) => r.count > 0).slice(0, 6);
    if (recent.length === 0) infos.push(e(`${logNames[key]} 尾部未发现错误行`));
    else {
      const top = recent[0];
      const total = scan.errors.reduce((a, r) => a + r.count, 0);
      infos.push(e(`${logNames[key]} 最近日志发现 ${total} 条疑似错误记录（可能含历史；样例: ${top.line.slice(0, 120)}）——若当前操作正常可忽略`));
    }
  }

  // --- 崩溃转储 ---
  const crashes = analyzeCrashDumps(opts.crashDir, fs);
  sections.crashes = crashes;
  if (crashes.dumpCount > 0) {
    warnings.push(e(`存在 ${crashes.dumpCount} 个崩溃转储文件（最近: ${crashes.newestDump}）——若近期频繁崩溃请反馈给开发者`));
  } else {
    infos.push(e('最近无崩溃转储'));
  }

  // --- 启动自愈历史 ---
  const selfHeal = readSelfHealHistory(opts.selfHealHistoryFile, fs);
  sections.selfHeal = selfHeal;
  for (const it of selfHeal) {
    const action = it.kind === 'overlay' ? '已自动禁用' : '已自动移除';
    infos.push(e(`最近启动自愈（${new Date(it.ts).toLocaleString()}）：${action} ${it.names.join('、')}`));
  }

  // --- LLM 错误与默认模型（A-3）---
  const llm = {
    errors: analyzeLlmErrors(opts.llmErrorsFile, fs),
    defaultModel: resolveDefaultModel(opts.settingsFile, opts.credentialsFile, opts.yaml, fs),
  };
  sections.llm = llm;
  if (llm.errors.count > 0) {
    const last = llm.errors.recent[llm.errors.recent.length - 1];
    infos.push(e(`已记录 ${llm.errors.count} 条模型调用错误（最近: ${last ? last.line.slice(0, 120) : '无'}）——检查凭证与模型配置`));
  }
  const dm = llm.defaultModel;
  if (dm.ok) {
    if (dm.apiKeyEnv) {
      if (dm.credentialPresent === false) {
        warnings.push(e(`默认模型 ${dm.provider}/${dm.model} 的凭证键 ${dm.apiKeyEnv} 未在 .credentials.yaml 中配置——模型调用会失败`));
      } else if (dm.credentialPresent === true) {
        infos.push(e(`默认模型: ${dm.provider}/${dm.model}（凭证键 ${dm.apiKeyEnv} 已配置）`));
      }
    } else {
      infos.push(e(`默认模型: ${dm.provider}/${dm.model}`));
    }
  } else if (dm.reason) {
    warnings.push(e(`默认模型解析: ${dm.reason}`));
  }

  // --- 环境 ---
  const env = opts.env || {};
  sections.env = env;

  return {
    ok: errors.length === 0,
    errors, warnings, infos,
    generatedAt: new Date().toISOString(),
    sections,
  };
}

module.exports = {
  readTailText,
  tallyLines,
  scanLogTail,
  analyzePatch,
  analyzeBundles,
  analyzePlugins,
  analyzeCrashDumps,
  readSelfHealHistory,
  isLlmErrorLine,
  analyzeLlmErrors,
  resolveDefaultModel,
  runDiagnostics,
};