'use strict';

// ---------------------------------------------------------------------------
// profile manifest 装配对账（唯一实现）。
//
// 背景：dsh 官方对 `dsh.profile.bundles` 采用 fail-loud 启动语义——任何一条
// 登记不满足装配契约（包可解析、声明 dsh.bundle.patch、补丁层存在且可解析、
// 入口文件存在），`dsh web` 即以退出码 1 启动失败。历史上有多个写入方
// （壳层同步、dsh-hub 的 reconcileBundles、zat-dsh-engine 插件市场、用户
// `dsh plugin` 命令、手改文件）都可能留下无效登记，且旧版本从未清理它们。
// 过去的唯一防线是启动前对 dsh-app-boot 构建产物做字符串锚点改写（跳过 +
// 诊断），锚点随 dsh 版本变化失配即静默失效，原始崩溃直接暴露——这也是
// 「每次以不同方式复现」的根因。
//
// 本模块把「启动前把 manifest 对账到可装配状态」收口为唯一实现：
//   · 损坏 manifest 备份后重建（.broken-<ts>，原文永不丢弃）；
//   · 逐条校验全部 bundles 登记——无效且非核心的登记从 manifest 移除，
//     移除事实与原因写入隔离记录文件 dsh-desktop.broken-bundles.json
//     （dsh 完全不感知该文件；重装插件后重新登记即可恢复，健康后记录
//     自动清除）；
//   · 核心 bundles（@deepseek-ai/dsh-base / dsh-web-app）绝不因校验失败
//     被移除——核心缺失是 dsh 安装损坏，不是 profile 数据问题，移除只会
//     让插件树更糟，交由启动防护兜底跳过并告警；
//   · 缺失核心补齐、配套 bundle 登记追加、源缺失/卸载标记移除、重置后
//     用户 bundle 恢复（issue #48）等既有语义原样保留；
//   · 全部写入原子化（writeFileAtomic），健康 manifest 零写入（幂等）。
//
// 对账执行时机：壳层每次启动（main.js syncCompanionPlugins）与
// sync-companion-plugins.js（WSL/Linux CLI）共用本实现；dryRun 只计算
// 不落盘。dsh-app-boot 的运行时防护（profile-bundle-heal.js 的锚点改写）
// 保留为纵深防御，覆盖对账未跑 / 对账后仍出现的未知损坏形状。
//
// 本模块不依赖 Electron；js-yaml 经 parsePatch 回调注入（调用方无该依赖时
// 传 null，仅跳过补丁层可解析性检查）。
// ---------------------------------------------------------------------------

const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const {
  BUNDLE_CHECK_CODES,
  inspectBundleDir,
  scanProfileBundles,
  recoverManifestBundles,
  writeFileAtomic,
} = require('../../profile-bundle-heal');
const { ensureCoreBundles, CORE_BUNDLE_NAMES } = require('../../profile-manifest');

/** 无效登记隔离记录文件名（位于 profile 目录内，dsh 不读取）。 */
const BROKEN_BUNDLES_RECORD_FILENAME = 'dsh-desktop.broken-bundles.json';
/** 隔离记录结构版本。 */
const BROKEN_BUNDLES_RECORD_VERSION = 1;

// ---------------------------------------------------------------------------
// 隔离记录（sidecar）读写
// ---------------------------------------------------------------------------

/**
 * 读取无效登记隔离记录；文件缺失 / 损坏时返回 null（调用方按无记录处理，
 * 写入侧会重建）。记录结构：
 *   { v: 1, entries: { [packageName]: { code, reason, removedAt } } }
 * @param {string} file 记录文件路径
 * @returns {Object|null}
 */
function readBrokenBundlesRecord(file) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch { return null; }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.v === BROKEN_BUNDLES_RECORD_VERSION &&
        parsed.entries && typeof parsed.entries === 'object' && !Array.isArray(parsed.entries)) {
      return parsed;
    }
  } catch { /* 结构不符按缺失处理 */ }
  return null;
}

/**
 * 原子写隔离记录（写入失败仅告警，不影响对账结果——记录是诊断辅助）。
 * @param {string} file 记录文件路径
 * @param {Object} record 记录对象
 * @param {(msg: string) => void} [log]
 */
function writeBrokenBundlesRecord(file, record, log) {
  try {
    writeFileAtomic(file, JSON.stringify(record, null, 2) + '\n');
  } catch (err) {
    if (log) log('写入无效登记隔离记录失败: ' + ((err && err.message) || err));
  }
}

// ---------------------------------------------------------------------------
// entry-list YAML 方言解析器（弱依赖 js-yaml）
// ---------------------------------------------------------------------------

/**
 * 构造与 dsh-app-boot 相同的 entry-list 方言解析器（js-yaml JSON_SCHEMA +
 * `!!js` 标量，dsh 用它解析补丁层与 patch 文件）。js-yaml 不可用（CLI 独立
 * 环境等）时返回 null，调用方跳过补丁层可解析性检查（运行时防护兜底）。
 * @returns {(content: string) => unknown}|null
 */
function createEntryListYamlParser() {
  try {
    // 与 main.js loadDshYamlDialect 同一构造；js-yaml 是内置 dsh 的传递依赖。
    // eslint-disable-next-line global-require
    const yaml = require('js-yaml');
    const jsType = new yaml.Type('tag:yaml.org,2002:js', {
      kind: 'scalar',
      resolve: (data) => typeof data === 'string',
      construct: (data) => ({ __jsExpr: data }),
    });
    return (content) => yaml.load(content, { schema: yaml.JSON_SCHEMA.extend(jsType) });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 单条登记校验
// ---------------------------------------------------------------------------

/**
 * 与 dsh-app-boot resolveBundleDir 同构的包目录解析：沿 Node 的
 * createRequire(anchorFile).resolve.paths 搜索路径探测 package.json（含
 * NODE_PATH 与全局 node_modules，与官方 packageDirFromAnchor 逐字同构）。
 * 与 packageDirUpward（只走祖先 node_modules 链）的区别正是「对账判定必须
 * 与 dsh 实际装配一致」的关键：官方能解析到的登记，对账绝不能判 UNRESOLVABLE
 * 而误删。找不到返回 ''。
 * @param {string} anchorFile 锚点文件（dsh 安装 / profile 的 package.json 路径）
 * @param {string} packageName 登记名
 * @returns {string} 包目录绝对路径；找不到返回空串
 */
function resolveBundleDirLike(anchorFile, packageName) {
  let paths;
  try {
    paths = createRequire(anchorFile).resolve.paths(packageName) || [];
  } catch {
    return '';
  }
  for (const searchPath of paths) {
    const candidate = path.join(searchPath, packageName);
    try {
      if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
    } catch { /* 不可读按未找到继续 */ }
  }
  return '';
}

/**
 * 判定核心 bundles 是否全部可解析（决定能否安全预写 / 重建 manifest）。
 * 与 validateBundleEntry 共用同一解析实现（resolveBundleDirLike，含 NODE_PATH
 * / 全局 node_modules）——核心解析判定与登记校验必须一致，否则会出现
 * 「登记校验判可解析、预写判定判不可解析」的判定撕裂。installAnchorDir 为空
 * （CLI 未定位到 dsh 包等）时核心一律视为不可解析，绝不依据进程 cwd 的相对
 * 探测写入。
 * @param {string[]} coreNames 核心 bundle 名
 * @param {string} installAnchorDir dsh 包目录（可空）
 * @returns {string[]} 实测可解析的核心名
 */
function resolvableCoreNames(coreNames, installAnchorDir) {
  if (!installAnchorDir) return [];
  return coreNames.filter((name) => resolveBundleDirLike(path.join(installAnchorDir, 'package.json'), name) !== '');
}

/**
 * 校验一条 profile bundle 登记（与 dsh-app-boot 的装配契约一一对应）：
 *   INVALID_NAME      登记项不是非空字符串；
 *   UNRESOLVABLE      双锚点（dsh 安装 / profile node_modules）都解析不到包；
 *   其余码               委托 inspectBundleDir（package.json / 声明 / 补丁层 /
 *                     入口文件）。
 * 包解析用与官方 resolveBundleDir 同构的 createRequire.resolve.paths 探测
 * （含 NODE_PATH / 全局 node_modules），保证「官方能装配的登记不会被误删」。
 * @param {string} packageName 登记名
 * @param {Object} opts
 * @param {string} opts.installAnchorDir dsh 包目录（resolveBundleDir 的第一锚点）
 * @param {string} opts.profileDir       profiles/<name> 目录（第二锚点）
 * @param {(content: string) => unknown|{load: (content: string) => unknown}} [opts.parsePatch]
 *   entry-list 方言解析器：接受函数或 { load(content) } 对象（main.js
 *   loadDshYamlDialect 返回值形态）；缺省 / 其它值跳过补丁层可解析性检查
 * @returns {{ ok: boolean, code: string, reason: string, packageDir?: string, patchPath?: string }}
 */
function validateBundleEntry(packageName, opts) {
  const { installAnchorDir, profileDir, parsePatch } = opts;
  if (typeof packageName !== 'string' || packageName === '') {
    return { ok: false, code: BUNDLE_CHECK_CODES.INVALID_NAME, reason: '登记项不是非空字符串' };
  }
  // installAnchorDir 为空（CLI 未定位到 dsh 包等）时跳过第一锚点：相对路径的
  // node_modules 探测会意外解析到进程 cwd，绝不能据此判定健康。profileDir
  // 同理：为空时第二锚点同样跳过（绝不基于进程 cwd 的相对探测判定）。
  const dir = (installAnchorDir && resolveBundleDirLike(path.join(installAnchorDir, 'package.json'), packageName))
    || (profileDir && resolveBundleDirLike(path.join(profileDir, 'package.json'), packageName));
  if (!dir) {
    return {
      ok: false,
      code: BUNDLE_CHECK_CODES.UNRESOLVABLE,
      reason: installAnchorDir
        ? '包未安装（dsh 安装与 profile node_modules 均解析不到）'
        : '包未安装（profile node_modules 解析不到）',
    };
  }
  const check = inspectBundleDir(dir, patchParserOf(parsePatch));
  if (!check.ok) return check;
  return { ok: true, code: '', reason: '', packageDir: dir, patchPath: check.patchPath };
}

/**
 * 归一化补丁层解析器入参：接受函数（createEntryListYamlParser 形态）或
 * { load(content) } 对象（main.js loadDshYamlDialect 返回值形态）两种调用
 * 方约定；其余值按 null 处理（跳过可解析性检查）。两种形态都得到校验，
 * 防止调用方形态漂移导致 PATCH_UNPARSEABLE 判定被静默跳过。
 * @param {Function|{load: Function}|null|undefined} parsePatch
 * @returns {Function|null}
 */
function patchParserOf(parsePatch) {
  if (typeof parsePatch === 'function') return parsePatch;
  if (parsePatch && typeof parsePatch.load === 'function') return (content) => parsePatch.load(content);
  return null;
}

// ---------------------------------------------------------------------------
// manifest 对账
// ---------------------------------------------------------------------------

/**
 * 对账 profile manifest 到「每条登记都可装配」状态（唯一写入口）。
 * 语义与历史 main.js syncCompanionPlugins 的 manifest 段逐项一致（日志文案
 * 由 log 回调原样透出），并新增：全量逐条校验——无效且非核心的登记移除并
 * 记入隔离记录；健康后清除隔离记录。健康 manifest 零写入（幂等）。
 * @param {string} profileDir profiles/<name> 目录
 * @param {Object} opts
 * @param {string} opts.installAnchorDir dsh 包目录（解析第一锚点）
 * @param {string[]} [opts.coreNames] 核心 bundle 名（默认 CORE_BUNDLE_NAMES；
 *   校验失败绝不移除）
 * @param {Set<string>} [opts.addNames] 应确保登记的配套包名；追加前用
 *   validateBundleEntry 全量校验（含补丁层可解析性），校验失败的配套 bundle
 *   不登记并记入隔离记录（调用方 verifyBundleDir 不查补丁层 YAML 可解析性，
 *   此处收口到同一判定语义）
 * @param {Set<string>} [opts.missingNames] 源缺失 / 校验失败的配套包名（移除登记）
 * @param {Set<string>} [opts.removedBundles] 插件管理「卸载」标记的配套包名（移除登记）
 * @param {Set<string>} [opts.excludeFromRecover] 重置后恢复扫描的排除名
 *   （核心 + 配套）
 * @param {(content: string) => unknown|{load: (content: string) => unknown}} [opts.parsePatch]
 *   entry-list 方言解析器：函数或 { load(content) } 对象（main.js
 *   loadDshYamlDialect 返回值形态）；缺省 / 其它值跳过补丁层可解析性检查
 * @param {(msg: string) => void} [opts.log]
 * @param {boolean} [opts.dryRun] 只计算不落盘（备份 / 写入 / 记录全部跳过）
 * @param {boolean} [opts.initMissing] manifest 文件不存在时是否允许预写骨架 +
 *   核心 bundles（默认 true，main.js 语义：核心可解析才写）；false（CLI 契约）
 *   时完全不创建 manifest，交由 dsh 首次启动初始化
 * @returns {{
 *   manifest: Object,            // 对账后的 manifest（dryRun 同样返回计算结果）
 *   changed: boolean,            // 是否有任何需要落盘的修改
 *   reset: boolean,              // manifest 是否经历备份重建
 *   backup: string|null,         // 重建备份路径（未重建为 null）
 *   removed: Array<{name: string, code: string, reason: string}>, // 逐条校验移除
 *   added: string[],             // 配套 bundle 追加
 *   removedByPolicy: string[],   // 源缺失 / 卸载标记移除
 *   recovered: string[],         // 重置后恢复的用户 bundle
 *   deduped: string[],           // 重复登记的 bundle（保留首次出现）
 *   quarantined: string[],       // 本次新记入隔离记录的名字（同 code+reason
 *                                //   的既有条目不重写，保留首次 removedAt）
 *   unquarantined: string[],     // 本次从隔离记录清除的名字（恢复健康，同轮生效）
 * }}
 */
function reconcileProfileBundles(profileDir, opts) {
  const {
    installAnchorDir,
    coreNames = CORE_BUNDLE_NAMES,
    addNames = new Set(),
    missingNames = new Set(),
    removedBundles = new Set(),
    excludeFromRecover = new Set(),
    parsePatch = null,
    log = () => {},
    dryRun = false,
    initMissing = true,
  } = opts;

  const manifestFile = path.join(profileDir, 'package.json');
  const recordFile = path.join(profileDir, BROKEN_BUNDLES_RECORD_FILENAME);
  // dryRun 只计算：记录修改一律作用在副本上，绝不触碰磁盘状态。
  const record = readBrokenBundlesRecord(recordFile) || { v: BROKEN_BUNDLES_RECORD_VERSION, entries: {} };
  const recordNext = dryRun ? JSON.parse(JSON.stringify(record)) : record;
  let recordDirty = false;

  const result = {
    manifest: null,
    changed: false,
    reset: false,
    backup: null,
    removed: [],
    added: [],
    removedByPolicy: [],
    recovered: [],
    deduped: [],
    quarantined: [],
    unquarantined: [],
  };

  // --- 读取 + 损坏重建（备份原文，绝不静默丢弃用户数据） ---
  const manifestExists = fs.existsSync(manifestFile);
  let manifest = null;
  let manifestReset = false;
  if (manifestExists) {
    try { manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')); } catch { manifestReset = true; }
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    manifestReset = true;
    manifest = { name: 'dsh-profile-' + path.basename(profileDir), private: true };
  }
  result.reset = manifestReset;

  // initMissing=false（CLI 契约）：manifest 文件不存在时绝不凭空创建（顶替
  // dsh 的 profile 初始化有风险），交由 dsh 首次启动初始化，下次运行再对账。
  if (!manifestExists && !initMissing) {
    if (addNames.size > 0) log('profile manifest 尚无 bundles（可能尚未初始化），bundle 插件留待下次运行注册');
    result.manifest = null;
    return result;
  }

  // 核心 bundles 可解析性（决定能否安全预写 / 重建）。与登记校验同一解析
  // 实现（resolvableCoreNames → resolveBundleDirLike）。installAnchorDir 为空
  // 时核心一律视为不可解析（CLI 未定位到 dsh 包），绝不依据进程 cwd 的相对
  // 探测写入。
  const cores = resolvableCoreNames(coreNames, installAnchorDir);
  const coresResolvable = cores.length === coreNames.length && coreNames.length > 0;

  // 损坏重建：只有「核心可解析、重建后能安全启动」才备份 + 落盘骨架；核心
  // 不可解析时保持磁盘原样（空 bundles 骨架会让插件树无法激活，比保留原文
  // 更糟），下次运行再试。
  if (manifestReset && manifestExists && coresResolvable) {
    if (!dryRun) {
      const backup = manifestFile + '.broken-' + Date.now();
      try {
        fs.copyFileSync(manifestFile, backup);
        result.backup = backup;
        log('profile manifest 损坏，原文件已备份到 ' + backup);
      } catch (err) {
        log('profile manifest 备份失败: ' + ((err && err.message) || err));
      }
    } else {
      log('profile manifest 损坏，将备份原文件并重建（dry-run 不落盘）');
    }
  } else if (manifestReset && manifestExists && !coresResolvable && !initMissing) {
    result.manifest = null;
    return result;
  }

  if (!manifest.dsh || typeof manifest.dsh !== 'object' || Array.isArray(manifest.dsh)) manifest.dsh = {};
  if (!manifest.dsh.profile || typeof manifest.dsh.profile !== 'object' || Array.isArray(manifest.dsh.profile)) manifest.dsh.profile = {};
  result.manifest = manifest;

  let bundles = manifest.dsh.profile.bundles;
  let bundlesUsable = Array.isArray(bundles);
  if (!bundlesUsable) {
    // 全新 / 未初始化 / bundles 非数组：只有核心 bundles 在安装中实测可解析
    // 才预写（与 dsh 初始化模板一致），预写后按「可用」继续走后续对账；
    // 解析不到则完全不写，交由 dsh 自行初始化——避免顶替 dsh 初始化导致
    // 首次启动失败。
    if (coresResolvable) {
      bundles = [...cores];
      manifest.dsh.profile.bundles = bundles;
      bundlesUsable = true;
      result.changed = true;
    } else {
      log('dsh 出厂核心 bundles 未在安装中解析到，跳过 manifest 预写，交由 dsh 初始化');
    }
  }

  if (bundlesUsable) {
    // 1. 存量自愈（issue #16）：缺失的核心 bundles 补齐到最前，其余原样保留。
    const resolvableCores = resolvableCoreNames(coreNames, installAnchorDir);
    const healed = ensureCoreBundles(bundles, resolvableCores);
    if (healed) {
      bundles = healed.next;
      manifest.dsh.profile.bundles = bundles;
      result.changed = true;
      log('profile manifest 自愈: 旧版本写坏的 bundles 缺少核心 ' + healed.added.join(', ') + '，已补齐到最前');
    }

    // 2. 全量逐条校验：无效且非核心的登记移除 + 隔离记录；核心异常保留
    //    （启动防护兜底跳过，缺失核心是安装损坏而非数据问题）。
    //    策略性移除的名字（配套源缺失 / 插件管理卸载标记）不在本步判定：
    //    它们由步骤 4/6 按「用户意图禁用」移除，绝不写入隔离记录（隔离记录
    //    只记录无效登记，不记录用户主动禁用——否则卸载/源缺失会在记录里
    //    留下误导性的 UNRESOLVABLE 条目）。
    const kept = [];
    for (const name of bundles) {
      if (missingNames.has(name) || removedBundles.has(name)) {
        kept.push(name);
        continue;
      }
      const check = validateBundleEntry(name, { installAnchorDir, profileDir, parsePatch });
      if (check.ok) {
        kept.push(name);
        if (Object.prototype.hasOwnProperty.call(recordNext.entries, name)) {
          delete recordNext.entries[name];
          recordDirty = true;
          result.unquarantined.push(name);
        }
        continue;
      }
      if (coreNames.includes(name)) {
        kept.push(name);
        log('核心 bundle 登记异常（保留，启动防护兜底跳过）: ' + name + ' —— ' + check.reason);
        continue;
      }
      result.removed.push({ name, code: check.code, reason: check.reason });
      recordNext.entries[name] = {
        code: check.code,
        reason: check.reason,
        removedAt: new Date().toISOString(),
      };
      recordDirty = true;
      result.quarantined.push(name);
      log('已把无效的 profile bundle 登记移除: ' + name + ' —— ' + check.reason + '（重装该插件后重新登记即可恢复）');
      result.changed = true;
    }
    bundles = kept;
    manifest.dsh.profile.bundles = bundles;

    // 2.5 重复登记去重：同一包名登记两次会让其补丁层条目重复出现在组合
    //     entry list 中，loader 装配期抛 "duplicate loader entry id"（fail-loud
    //     → dsh web 退出码 1），且启动防护覆盖不到（两层都能正常加载）。
    //     保留首次出现、移除重复项；重复登记是冗余而非无效登记，不进隔离
    //     记录（重装/恢复登记等写入方都可能制造该形状，历史上从不清理）。
    {
      const seen = new Set();
      const deduped = [];
      for (const name of bundles) {
        if (seen.has(name)) {
          result.deduped.push(name);
          result.changed = true;
          log('已移除重复登记的 profile bundle: ' + name + '（同一 bundle 只装配一次，重复登记会触发 loader duplicate entry id 崩溃）');
          continue;
        }
        seen.add(name);
        deduped.push(name);
      }
      if (deduped.length !== bundles.length) {
        bundles = deduped;
        manifest.dsh.profile.bundles = bundles;
      }
    }

    // 3. 配套 bundle 登记追加。追加前用与存量登记完全相同的 validateBundleEntry
    //    校验（含补丁层可解析性）：调用方 syncCompanionFiles 的 verifyBundleDir
    //    不检查补丁层 YAML 可解析性，直接登记会让「补丁层损坏的配套 bundle」
    //    暴露一个启动窗口（仅靠运行时防护兜底）；这里收口到同一判定语义，
    //    校验失败的配套 bundle 不登记并记入隔离记录（文件保留，重装即恢复）。
    for (const name of addNames) {
      if (bundles.includes(name)) continue;
      const check = validateBundleEntry(name, { installAnchorDir, profileDir, parsePatch });
      if (!check.ok) {
        result.removed.push({ name, code: check.code, reason: check.reason });
        // 记录去重：同 code + reason 的既有条目不重写（保留首次 removedAt，
        // 避免每次启动对同一持续损坏状态做无意义重写）。
        const existing = recordNext.entries[name];
        if (!existing || existing.code !== check.code || existing.reason !== check.reason) {
          recordNext.entries[name] = {
            code: check.code,
            reason: check.reason,
            removedAt: new Date().toISOString(),
          };
          recordDirty = true;
          result.quarantined.push(name);
        }
        // manifest 未被改动（该名从未被登记）：不置 changed，避免对健康
        // manifest 做内容相同的无意义重写。
        log('配套 bundle 校验失败，不登记进 web profile bundles: ' + name + ' —— ' + check.reason + '（重装该插件后重新登记即可恢复）');
        continue;
      }
      bundles.push(name);
      result.added.push(name);
      result.changed = true;
      // 同名条目曾因失败被记录（历史 run）：本次登记成功 → 同轮清除记录
      //（恢复健康后记录立即消失，不必等下一次启动的步骤 2）。
      if (Object.prototype.hasOwnProperty.call(recordNext.entries, name)) {
        delete recordNext.entries[name];
        recordDirty = true;
        result.unquarantined.push(name);
      }
      log('已把 bundle 插件加入 web profile bundles: ' + name);
    }

    // 4. 源缺失 / 校验失败的配套登记移除（视为用户禁用，幂等）。
    if (missingNames.size > 0) {
      const before = bundles.length;
      manifest.dsh.profile.bundles = bundles.filter((n) => !missingNames.has(n));
      if (manifest.dsh.profile.bundles.length !== before) {
        result.removedByPolicy.push(...missingNames);
        result.changed = true;
        log('配套 bundle 源缺失，已从 web profile bundles 移除（视为禁用）: ' + [...missingNames].join(', '));
      }
      bundles = manifest.dsh.profile.bundles;
    }

    // 5. issue #48 数据恢复：manifest 重置后，用户手动安装的第三方 bundle
    //    仍实际落在 profile node_modules，扫描校验后合并回登记。
    if (manifestReset) {
      const recovered = recoverManifestBundles(manifest, scanProfileBundles(
        path.join(profileDir, 'node_modules'),
        excludeFromRecover,
      ));
      if (recovered.length > 0) {
        // 复检：scanProfileBundles 的 verifyBundleDir 不查补丁层可解析性，
        // 恢复的登记必须过与存量登记相同的 validateBundleEntry 判定，否则
        // 当次启动会暴露「恢复出一个坏登记」的窗口（仅靠运行时防护兜底）。
        const kept = [];
        const dropped = [];
        for (const name of recovered) {
          const check = validateBundleEntry(name, { installAnchorDir, profileDir, parsePatch });
          if (check.ok) { kept.push(name); continue; }
          dropped.push(name);
          result.removed.push({ name, code: check.code, reason: check.reason });
          const existing = recordNext.entries[name];
          if (!existing || existing.code !== check.code || existing.reason !== check.reason) {
            recordNext.entries[name] = {
              code: check.code,
              reason: check.reason,
              removedAt: new Date().toISOString(),
            };
            recordDirty = true;
            result.quarantined.push(name);
          }
          result.changed = true;
          log('恢复的 bundle 复检失败，从 web profile bundles 移除: ' + name + ' —— ' + check.reason + '（重装该插件后重新登记即可恢复）');
        }
        if (dropped.length > 0) {
          const dropSet = new Set(dropped);
          bundles = bundles.filter((n) => !dropSet.has(n));
          manifest.dsh.profile.bundles = bundles;
        }
        if (kept.length > 0) {
          result.recovered = kept;
          result.changed = true;
          // 同名条目曾因失败被记录（历史 run）：本次恢复成功 → 同轮清除记录。
          for (const name of kept) {
            if (Object.prototype.hasOwnProperty.call(recordNext.entries, name)) {
              delete recordNext.entries[name];
              recordDirty = true;
              result.unquarantined.push(name);
            }
          }
          log('profile manifest 重置后已恢复用户安装的 bundle 插件: ' + kept.join(', '));
        }
      } else {
        log('profile manifest 已重置（原文件已备份），未发现需要恢复的用户 bundle');
      }
    }

    // 6. 插件管理「卸载」标记的配套登记移除。
    if (removedBundles.size > 0) {
      const before = bundles.length;
      manifest.dsh.profile.bundles = bundles.filter((n) => !removedBundles.has(n));
      if (manifest.dsh.profile.bundles.length !== before) {
        result.removedByPolicy.push(...removedBundles);
        result.changed = true;
        log('已卸载 bundle 插件，从 web profile bundles 移除: ' + [...removedBundles].join(', '));
      }
      bundles = manifest.dsh.profile.bundles;
    }
  }

  // --- 落盘（原子写；隔离记录只在有修改时写回） ---
  if (result.changed && !dryRun) {
    writeFileAtomic(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  }
  if (recordDirty && !dryRun) {
    // dry-run 的记录修改只反映在返回值，不落盘。
    writeBrokenBundlesRecord(recordFile, recordNext, log);
  }
  return result;
}

module.exports = {
  BROKEN_BUNDLES_RECORD_FILENAME,
  BROKEN_BUNDLES_RECORD_VERSION,
  createEntryListYamlParser,
  readBrokenBundlesRecord,
  writeBrokenBundlesRecord,
  resolveBundleDirLike,
  resolvableCoreNames,
  validateBundleEntry,
  reconcileProfileBundles,
};
