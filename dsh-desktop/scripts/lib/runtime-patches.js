'use strict';

// ---------------------------------------------------------------------------
// 运行时补丁定义（唯一实现）。
//
// 「会话列表刷新闪跳修复」（dsh-client-runtime）与「设置暴露白名单补丁」
// （dsh-host-apiproxy）曾同时存在于 main.js（applyRuntimeFlashFix /
// applyPromptExposeFix）与 scripts/sync-companion-plugins.js
// （applyRuntimePatches，--with-patches）两处，是同一份补丁的第三次复制。
// 这里把锚点常量、变换与 WSL / CLI 共用的目标路径收口为唯一数据源，两个
// 入口只保留各自的候选路径选择与日志文案，杜绝漂移。
//
// 变换均为纯函数，字节级输出与旧实现一致；锚点失配时绝不改写文件内容。
// ---------------------------------------------------------------------------

const path = require('node:path');

/** dsh-client-runtime 会话列表刷新闪跳修复（mergeOrderedBaseline 保留本地新会话）。 */
const FLASH_OLD = '(value) => baselineByKey.get(keyOf(value))).filter((value) => value !== void 0);';
const FLASH_NEW = '(value) => baselineByKey.get(keyOf(value)) ?? value).filter((value) => value !== void 0);';

/** 设置暴露白名单（dsh-prompt / 第三方思考 / 识图 / 会话调整）。 */
const SETTINGS_NAMESPACES = ['dsh-prompt', 'dsh-third-party-thinking', 'dsh-vision', 'dsh-conversation-tweaks'];
// dsh rc.7 replaced the static allow-list with plugin-owned dynamic settings
// descriptors. Such a source already exposes every registered namespace, so
// the legacy list injection is unnecessary and must be treated as idempotent.
const DYNAMIC_SETTINGS_ANCHOR = 'namespaces: settings.describe({ redactSecrets: true }).map(namespaceView)';

/** 各补丁目标包内的相对路径（@deepseek-ai/<rel>）。 */
const FLASH_PKG_REL = path.join('dsh-client-runtime', 'lib', 'client.js');
const EXPOSE_PKG_REL = path.join('dsh-host-apiproxy', 'lib', 'index.js');
const PERSISTENCE_PKG_REL = path.join('dsh-session-persistence-jsonl', 'lib', 'index.js');
const SLOT_KEY_COMPAT_PKG_REL = path.join('dsh-client-ui-slots', 'lib', 'index.js');
const SLOT_UNKEYED_COMPAT_PKG_REL = path.join('dsh-cordis-client-runner', 'lib', 'client.js');
const SLOT_COMPAT_PKG_RELS = [SLOT_KEY_COMPAT_PKG_REL, SLOT_UNKEYED_COMPAT_PKG_REL];
// rc.6 keyed slots accepted the registration identity through `id`. rc.7 split
// list identity (`id`) from keyed dispatch identity (`key`), which makes
// otherwise compatible third-party browser plugins fail the whole loader. Some
// even older plugins register keyed slots with neither field; the client runner
// derives a package-scoped fallback key for those instead of letting one plugin
// take the whole loader down.
const SLOT_KEY_COMPAT_MARKER = 'dsh-desktop compat: accept legacy keyed-slot id as key';
const SLOT_KEY_COMPAT_OLD = '\t\tconst spec = rec.spec;\n\t\tconst priority = options.priority ?? 0;';
const SLOT_KEY_COMPAT_NEW = [
  '\t\tconst spec = rec.spec;',
  '\t\tif (spec.kind === "keyed" && options.key === void 0 && options.id !== void 0) {',
  '\t\t\t// ' + SLOT_KEY_COMPAT_MARKER + '.',
  '\t\t\toptions = { ...options, key: options.id };',
  '\t\t}',
  '\t\tconst priority = options.priority ?? 0;',
].join('\n');
const SLOT_UNKEYED_COMPAT_MARKER = 'dsh-desktop compat: derive keyed slot key for unkeyed registrations';
const SLOT_UNKEYED_COMPAT_OLD = '\t\t\t\t\tconst spec = slots.spec(slot);\n\t\t\t\t\tlet priority = options.priority;';
const SLOT_UNKEYED_COMPAT_NEW = [
  '\t\t\t\t\tconst spec = slots.spec(slot);',
  '\t\t\t\t\tif (spec !== void 0 && spec.kind === "keyed" && options.key === void 0) {',
  '\t\t\t\t\t\t// ' + SLOT_UNKEYED_COMPAT_MARKER + ': explicit key wins; legacy id promotes; otherwise bind the package identity so one unkeyed plugin cannot fail the whole loader.',
  '\t\t\t\t\t\toptions.key = options.id !== void 0 ? options.id : (typeof options.registrant === "string" && options.registrant.length > 0 ? options.registrant : env.pkg.pluginId || env.pkg.packageId);',
  '\t\t\t\t\t}',
  '\t\t\t\t\tlet priority = options.priority;',
].join('\n');

// A complete zstd frame can still end with a JSONL fragment when the writer is
// interrupted after zstd has emitted the frame trailer.  The stock reader
// rejects that state even though the scanner already has a safe committed
// prefix.  The patch below lets only the final complete frame go through the
// existing torn-tail repair path.
const PERSISTENCE_TORN_MARKER = 'dsh-desktop compat: recover complete zstd frame torn JSONL tail';
const PERSISTENCE_FRAME_LOOP_OLD = 'let remainingFrames = frames.length - 1;\n\t\t\tfor (const plaintext of decodedFrames) {';
const PERSISTENCE_FRAME_LOOP_NEW = [
  'let remainingFrames = frames.length - 1;',
  '\t\t\tlet frameIndex = 1;',
  '\t\t\tlet tornCompleteFrameStart;',
  '\t\t\tlet tornCompleteEventCount;',
  '\t\t\tfor (const plaintext of decodedFrames) {',
].join('\n');
const PERSISTENCE_WRITE_OLD = '\t\t\t\tscanner.write(plaintext);\n\t\t\t\tremainingFrames -= 1;';
const PERSISTENCE_WRITE_NEW = [
  '\t\t\t\tconst frameCheckpoint = scanner.checkpoint();',
  '\t\t\t\tscanner.write(plaintext);',
  '\t\t\t\tconst frameAfter = scanner.checkpoint();',
  '\t\t\t\tif (frameAfter.committedBytes !== frameAfter.inputBytes) {',
  '\t\t\t\t\tconst hasTornRecord = scanner.fragmentBytes > 0;',
  '\t\t\t\t\tif (!hasTornRecord || frameIndex !== frames.length - 1 || tornStart !== void 0 || scanner.issue !== void 0) throw new Error("corrupt Zstandard session log: complete frame contains a torn JSONL record");',
  '\t\t\t\t\ttornCompleteFrameStart = frames[frameIndex].start;',
  '\t\t\t\t\ttornCompleteEventCount = frameCheckpoint.eventCount;',
  '\t\t\t\t}',
  '\t\t\t\tremainingFrames -= 1;',
  '\t\t\t\tframeIndex += 1;',
].join('\n');
const PERSISTENCE_COMPLETE_CHECK = '\t\t\tif (complete.committedBytes !== complete.inputBytes) throw new Error("corrupt Zstandard session log: complete frame contains a torn JSONL record");';
const PERSISTENCE_COMPLETE_CHECK_NEW = [
  '\t\t\tif (tornCompleteFrameStart !== void 0) {',
  '\t\t\t\tconst prefix = scanner.finish();',
  '\t\t\t\treturn {',
  '\t\t\t\t\tmeta: prefix.meta,',
  '\t\t\t\t\tevents: prefix.events,',
  '\t\t\t\t\ttornMarker: {',
  '\t\t\t\t\t\ttruncateTo: tornCompleteFrameStart,',
  '\t\t\t\t\t\trecoveredEvents: prefix.events.slice(tornCompleteEventCount)',
  '\t\t\t\t\t}',
  '\t\t\t\t};',
  '\t\t\t}',
  PERSISTENCE_COMPLETE_CHECK,
].join('\n');

/**
 * WSL 托管模式 / sync CLI 共用目标：profile fallback + agent 两份副本。
 * bundle 初始化后的 dsh 安装（npm 版）两份副本通常互为同一文件（fallback
 * 符号链接写穿），逐文件幂等判定保证重复目标安全。
 * @param {string} home 目标 dsh 数据目录（WSL 模式为 UNC 等价路径）
 * @param {string} pkgRel @deepseek-ai/<pkgRel>
 * @returns {string[]}
 */
function patchTargets(home, pkgRel) {
  const mk = (root) => path.join(root, 'node_modules', '@deepseek-ai', pkgRel);
  return [
    mk(path.join(home, 'profiles')),
    mk(path.join(home, 'agent')),
  ];
}

// ---------------------------------------------------------------------------
// 运行时补丁候选路径构造（纯函数：路径根由调用方传入，便于单测；main.js 绑定
// 模块级变量）。三种布局与旧实现逐项一致，并补齐同系列补丁的历史覆盖缺口：
//   - localCopyFiles         本地模式三副本（profile fallback → 内置副本 → 更新 overlay）；
//   - guardCopyFiles         防护类补丁四副本（内置副本优先 + overlay 嵌套 dsh
//                            依赖副本 + profile fallback）；
//   - localNodeModulesRoots  包级补丁的 node_modules 根目录列表（extraRoots 用于
//                            WSL 模式追加 WSL agent 直连根，与 patchTargets 的
//                            agent 兜底语义一致）。
// ---------------------------------------------------------------------------

function localCopyFiles(home, appDir, userDataDir, pkgRel) {
  return [
    path.join(home, 'profiles', 'node_modules', '@deepseek-ai', pkgRel),
    path.join(appDir, 'node_modules', '@deepseek-ai', pkgRel),
    path.join(userDataDir, 'agent', 'node_modules', '@deepseek-ai', pkgRel),
  ];
}

function guardCopyFiles(home, appDir, userDataDir, pkgRel) {
  return [
    path.join(appDir, 'node_modules', '@deepseek-ai', pkgRel),
    path.join(userDataDir, 'agent', 'node_modules', '@deepseek-ai', pkgRel),
    path.join(userDataDir, 'agent', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', pkgRel),
    path.join(home, 'profiles', 'node_modules', '@deepseek-ai', pkgRel),
  ];
}

function localNodeModulesRoots(home, appDir, userDataDir, extraRoots = []) {
  return [
    path.join(home, 'profiles', 'node_modules'),
    path.join(appDir, 'node_modules'),
    path.join(userDataDir, 'agent', 'node_modules'),
    ...extraRoots,
  ];
}

/**
 * Slot compatibility targets include the nested dependency copies shipped by a
 * clean dsh overlay. Some npm layouts do not hoist client-ui-slots or
 * cordis-client-runner to the agent/profile root, so patching only the top-level
 * copies is insufficient.
 */
function slotCompatCopyFiles(home, appDir, userDataDir) {
  const nested = (root, pkgRel) => path.join(root, 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', pkgRel);
  const files = [];
  for (const pkgRel of SLOT_COMPAT_PKG_RELS) {
    files.push(...localCopyFiles(home, appDir, userDataDir, pkgRel));
    files.push(...guardCopyFiles(home, appDir, userDataDir, pkgRel));
    files.push(nested(path.join(home, 'profiles'), pkgRel));
    files.push(nested(appDir, pkgRel));
  }
  return [...new Set(files)];
}
function slotCompatPatchTargets(home) {
  const nested = (root, pkgRel) => path.join(root, 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', pkgRel);
  const files = [];
  for (const pkgRel of SLOT_COMPAT_PKG_RELS) {
    files.push(...patchTargets(home, pkgRel));
    files.push(nested(path.join(home, 'profiles'), pkgRel));
    files.push(nested(path.join(home, 'agent'), pkgRel));
  }
  return [...new Set(files)];
}

/**
 * 闪跳修复变换（纯函数）。锚点失配的 detail 含文件路径，与两个调用方
 * （main.js / 同步脚本）的旧日志文案逐字一致。
 * @returns {{status:'already'} | {status:'anchor-missing', detail: string} | {status:'changed', src: string}}
 */
function transformFlashFix(src, file) {
  if (src.includes(FLASH_NEW)) return { status: 'already' };
  if (!src.includes(FLASH_OLD)) {
    return { status: 'anchor-missing', detail: '未匹配到目标代码（版本可能已变更），跳过 ' + file };
  }
  return { status: 'changed', src: src.replace(FLASH_OLD, FLASH_NEW) };
}

/**
 * 设置暴露白名单变换（纯函数）。只认声明之后最近的 `];`，避免插进文件里
 * 其它数组；缺失的命名空间以与旧实现逐字节一致的格式追加。原数组以尾逗号
 * 收尾（`"x",\n];`）时不重复前导逗号——历史实现无条件前置 `,\n`，遇到带
 * 尾逗号的文件会生成 `,\n,` 双逗号语法错误。
 * @returns {{status:'already'} | {status:'anchor-missing', detail: string} | {status:'changed', src: string, note: string[]}}
 */
function transformExposeFix(src, file) {
  const declIdx = src.indexOf('const WEB_SETTINGS_NAMESPACES = [');
  if (declIdx === -1) {
    if (src.includes(DYNAMIC_SETTINGS_ANCHOR)) return { status: 'already' };
    return { status: 'anchor-missing', detail: '未找到 WEB_SETTINGS_NAMESPACES（版本可能已变更），跳过 ' + file };
  }
  const closeIdx = src.indexOf('];', declIdx);
  if (closeIdx === -1) {
    return { status: 'anchor-missing', detail: '未匹配到命名空间数组收尾，跳过 ' + file };
  }
  const arrText = src.slice(declIdx, closeIdx);
  const missing = SETTINGS_NAMESPACES.filter((ns) => !arrText.includes('"' + ns + '"'));
  if (missing.length === 0) return { status: 'already' };
  const hasTrailingComma = /,\s*$/.test(arrText);
  const block = (hasTrailingComma ? '\n' : ',\n') + missing.map((ns) => '\t"' + ns + '"').join(',\n') + '\n';
  return { status: 'changed', src: src.slice(0, closeIdx) + block + src.slice(closeIdx), note: missing };
}

/**
 * Treat a final structurally complete zstd frame with an unterminated JSONL
 * record as a recoverable crash tail.  A torn record in any earlier frame, or
 * alongside a physically torn frame, remains a hard corruption error.
 */
function transformPersistenceTornTail(src, file) {
  if (src.includes(PERSISTENCE_TORN_MARKER)) return { status: 'already' };
  if (!src.includes(PERSISTENCE_FRAME_LOOP_OLD)
    || !src.includes(PERSISTENCE_WRITE_OLD)
    || !src.includes(PERSISTENCE_COMPLETE_CHECK)) {
    return {
      status: 'anchor-missing',
      detail: '未找到 zstd 会话尾部恢复锚点（版本可能已变更），跳过 ' + file,
    };
  }
  let patched = src.replace(PERSISTENCE_FRAME_LOOP_OLD, PERSISTENCE_FRAME_LOOP_NEW);
  patched = patched.replace(PERSISTENCE_WRITE_OLD, PERSISTENCE_WRITE_NEW);
  patched = patched.replace(PERSISTENCE_COMPLETE_CHECK, PERSISTENCE_COMPLETE_CHECK_NEW);
  patched = '// ' + PERSISTENCE_TORN_MARKER + '\n' + patched;
  return { status: 'changed', src: patched };
}

// ---------------------------------------------------------------------------
// 单个损坏的会话日志不得击穿整个启动扫描：listArtifacts 读首行遇到损坏 zstd
// 时跳过该会话并告警，而不是让整个 plugin tree 初始化崩溃（2026-08 事故：
// 卷影恢复带回零填充头部的会话日志，导致应用整体无法启动）。
const PERSISTENCE_CORRUPT_MARKER = 'dsh-desktop-corrupt-guard-v1';
const PERSISTENCE_CORRUPT_OLD =
  'const first = this.compression === "zstd" ? await this.readFirstZstdLine(path, signal) : await this.readFirstLine(path, signal);';
const PERSISTENCE_CORRUPT_NEW = [
  'let first;',
  '\t\t\t\ttry {',
  '\t\t\t\t\t// ' + PERSISTENCE_CORRUPT_MARKER + ': 损坏会话日志告警跳过，不得击穿启动扫描。',
  '\t\t\t\t\tfirst = this.compression === "zstd" ? await this.readFirstZstdLine(path, signal) : await this.readFirstLine(path, signal);',
  '\t\t\t\t} catch (corruptError) {',
  '\t\t\t\t\tsignal?.throwIfAborted();',
  '\t\t\t\t\tconsole.warn(`[dsh-session-persistence] skipping corrupt session log: ${path} (${corruptError?.message ?? corruptError})`);',
  '\t\t\t\t\tcontinue;',
  '\t\t\t\t}',
].join('\n');

function transformPersistenceCorruptGuard(src, file) {
  if (src.includes(PERSISTENCE_CORRUPT_MARKER)) return { status: 'already' };
  if (!src.includes(PERSISTENCE_CORRUPT_OLD)) {
    return {
      status: 'anchor-missing',
      detail: '未找到损坏会话容错锚点（版本可能已变更），跳过 ' + file,
    };
  }
  return { status: 'changed', src: src.replace(PERSISTENCE_CORRUPT_OLD, PERSISTENCE_CORRUPT_NEW) };
}

/** 会话持久化全部容错变换：尾部擕裂恢复 + 损坏会话跳过，依次应用。 */
function transformPersistenceAll(src, file) {
  const torn = transformPersistenceTornTail(src, file);
  const afterTorn = torn.status === 'changed' ? torn.src : src;
  const guard = transformPersistenceCorruptGuard(afterTorn, file);
  if (guard.status === 'changed') return { status: 'changed', src: guard.src };
  if (torn.status === 'changed') return { status: 'changed', src: afterTorn };
  if (torn.status === 'already' && guard.status === 'already') return { status: 'already' };
  return guard.status === 'anchor-missing' ? guard : torn;
}

// ---------------------------------------------------------------------------
/**
 * Preserve the rc.6 keyed-slot registration contract for third-party client
 * plugins: an explicit key wins, and a legacy `id` is promoted to `key`.
 */
function transformLegacySlotKey(src, file) {
  if (src.includes(SLOT_KEY_COMPAT_MARKER)) return { status: 'already' };
  if (src.includes(SLOT_KEY_COMPAT_OLD)) {
    return { status: 'changed', src: src.replace(SLOT_KEY_COMPAT_OLD, SLOT_KEY_COMPAT_NEW) };
  }
  // 正则回退锚点：精确字符串未匹配（dsh 版本差异导致缩进/空行变化）时，
  // 用正则搜索 `const spec = rec.spec;` 后紧跟 `options.priority` 的模式。
  // 仅匹配 ui-slots register 函数内的特征代码（rec.spec + priority），
  // 注入逻辑与精确补丁完全一致。
  const regexFallback = /([ \t]*)const spec = rec\.spec;\s*\n([ \t]*)const priority = options\.priority/;
  const m = regexFallback.exec(src);
  if (!m) {
    return {
      status: 'anchor-missing',
      detail: '未找到 keyed slot 兼容锚点（版本可能已变更），跳过 ' + file,
    };
  }
  const indent = m[1]; // 保留实际缩进
  const injected = [
    indent + 'const spec = rec.spec;',
    indent + 'if (spec.kind === "keyed" && options.key === void 0 && options.id !== void 0) {',
    indent + '\t// ' + SLOT_KEY_COMPAT_MARKER + ' (regex fallback).',
    indent + '\toptions = { ...options, key: options.id };',
    indent + '}',
    m[2] + 'const priority = options.priority',
  ].join('\n');
  return { status: 'changed', src: src.replace(m[0], injected), note: 'regex fallback' };
}
/**
 * dsh-advisor / dsh-llm-fallbacks register `settings.plugin.item` without both
 * `key` and `id`, which makes the rc.7 slot core throw and the whole loader fail.
 * The runner knows the owning package, so it derives a stable fallback key before
 * the real register call. Deterministic and narrow: explicit key wins, legacy id
 * promotes, and only keyed slots with neither field receive the package identity.
 */
function transformSlotUnkeyedCompat(src, file) {
  if (src.includes(SLOT_UNKEYED_COMPAT_MARKER)) return { status: 'already' };
  if (src.includes(SLOT_UNKEYED_COMPAT_OLD)) {
    return { status: 'changed', src: src.replace(SLOT_UNKEYED_COMPAT_OLD, SLOT_UNKEYED_COMPAT_NEW) };
  }
  // 正则回退锚点：精确字符串未匹配时，用正则搜索 `const spec = slots.spec(slot)`
  // 后紧跟 `let priority = options.priority` 的模式。注入逻辑与精确补丁完全一致。
  const regexFallback = /([ \t]*)const spec = slots\.spec\(slot\);\s*\n([ \t]*)(let priority = options\.priority)/;
  const m = regexFallback.exec(src);
  if (!m) {
    return {
      status: 'anchor-missing',
      detail: '未找到 keyed slot 无 key 注册兼容锚点（版本可能已变更），跳过 ' + file,
    };
  }
  const indent = m[1]; // 保留实际缩进
  const injected = [
    indent + 'const spec = slots.spec(slot);',
    indent + 'if (spec !== void 0 && spec.kind === "keyed" && options.key === void 0) {',
    indent + '\t// ' + SLOT_UNKEYED_COMPAT_MARKER + ' (regex fallback): explicit key wins; legacy id promotes; otherwise bind the package identity so one unkeyed plugin cannot fail the whole loader.',
    indent + '\toptions.key = options.id !== void 0 ? options.id : (typeof options.registrant === "string" && options.registrant.length > 0 ? options.registrant : env.pkg.pluginId || env.pkg.packageId);',
    indent + '}',
    m[2] + m[3],
  ].join('\n');
  return { status: 'changed', src: src.replace(m[0], injected), note: 'regex fallback' };
}

// ---------------------------------------------------------------------------
// keyed slot 注册错误隔离：当上述两个补丁都未命中（极端版本差异）时，在
// dsh-client-ui-slots 的 register 函数内注入 guard，让缺少 key 的注册
// 不再 throw 而是 warn + skip，防止单个第三方插件拖垮整个 loader
// （dsh web 60s 超时 → 桌面版 + 网页版均不可用）。
// 目标：register 函数中 throw 语句之前注入 early return。
// ---------------------------------------------------------------------------
const SLOT_ERROR_ISOLATE_MARKER = 'dsh-desktop compat: isolate keyed-slot registration errors';
// 搜索 "requires options.key" 或 "requires.*key" 的 throw 语句及其上下文。
const SLOT_ERROR_ISOLATE_REGEX = /([ \t]*)(throw new Error\([^)]*keyed slot[^)]*options\.key[^)]*\))/;
function transformSlotErrorIsolation(src, file) {
  if (src.includes(SLOT_ERROR_ISOLATE_MARKER)) return { status: 'already' };
  const m = SLOT_ERROR_ISOLATE_REGEX.exec(src);
  if (!m) {
    // 精确搜索已知的 throw 模式（多种变体）
    const altThrow = /([ \t]*)(throw new Error\([^)]*requires options\.key[^)]*\))/;
    const m2 = altThrow.exec(src);
    if (!m2) {
      return {
        status: 'anchor-missing',
        detail: '未找到 keyed slot throw 锚点（版本可能已变更），跳过 ' + file,
      };
    }
    const indent = m2[1];
    const injected = [
      indent + '// ' + SLOT_ERROR_ISOLATE_MARKER + ': convert fatal throw into warn+skip so one',
      indent + '// unkeyed plugin cannot take down the whole dsh web loader.',
      indent + 'console.warn("[dsh-desktop compat] keyed slot registration missing key, auto-deriving from registrant; plugin:", options.registrant || options.id || "unknown");',
      indent + 'options.key = options.id !== void 0 ? String(options.id) : String(options.registrant || "auto-" + Math.random().toString(36).slice(2, 8));',
      m2[0],
    ].join('\n');
    return { status: 'changed', src: src.replace(m2[0], injected), note: 'alt throw' };
  }
  const indent = m[1];
  const injected = [
    indent + '// ' + SLOT_ERROR_ISOLATE_MARKER + ': convert fatal throw into warn+skip so one',
    indent + '// unkeyed plugin cannot take down the whole dsh web loader.',
    indent + 'console.warn("[dsh-desktop compat] keyed slot registration missing key, auto-deriving from registrant; plugin:", options.registrant || options.id || "unknown");',
    indent + 'options.key = options.id !== void 0 ? String(options.id) : String(options.registrant || "auto-" + Math.random().toString(36).slice(2, 8));',
    m[0],
  ].join('\n');
  return { status: 'changed', src: src.replace(m[0], injected) };
}

// 模型工具兼容补丁（问题背景：code 模式的 run_code 程序经常省略 shell 工具
// 的 `description`，而该字段只用于 UI/日志展示，不应让整个工具调用失败）。
// 变换：validateBashArgs / validatePwshArgs 在缺省时用 command 首行自动补值。
// 曾同时改 schema 的 description.required: true → false，但引擎 schema 校验器
// 拒绝（"unsupported JSON schema: parameters.description.required must be true
// when present"）→ 该部分已废弃，transform 会自动回滚已写入的 false。
// 幂等标记 = dsh-desktop compat: optional shell description。
// ---------------------------------------------------------------------------

const SHELL_DESC_MARKER = "dsh-desktop compat: optional shell description";
const SHELL_DESC_VALIDATE_OLD = "\tif (args.description.trim().length === 0) throw new Error(\"invalid description: expected a non-empty string\");";
const SHELL_DESC_VALIDATE_NEW = "\tif (typeof args.description !== \"string\" || args.description.trim().length === 0) {\n\t\t// " + SHELL_DESC_MARKER + ": description is only for UI/log; derive one when the model omits it.\n\t\targs.description = args.command.trim().split(/\\r?\\n/)[0].slice(0, 80) || \"Run shell command\";\n\t}";
const SHELL_DESC_SCHEMA_OLD = "\t\t\tdescription: {\n\t\t\t\ttype: \"string\",\n\t\t\t\trequired: true,\n\t\t\t\tdescription: \"Clear, concise description of what this command does in active voice, 5-10 words (shown in the UI). Examples:";
// 已废弃：仅作旧补丁回滚识别锚点（引擎 schema 校验器拒绝 required: false）。
const SHELL_DESC_SCHEMA_NEW = "\t\t\tdescription: {\n\t\t\t\ttype: \"string\",\n\t\t\t\trequired: false, // " + SHELL_DESC_MARKER + "\n\t\t\t\tdescription: \"Clear, concise description of what this command does in active voice, 5-10 words (shown in the UI). Examples:";

const PW_REL = path.join("dsh-tool-pwsh", "lib", "index.js");
const BASH_REL = path.join("dsh-tool-bash", "lib", "index.js");

/** shell 工具 description 兜底变换（pwsh/bash 共用，锚点逐字节一致）。
 *  只改 validate 校验（缺省时用 command 首行补值）；schema 的
 *  required: false 已被引擎拒绝（必须 true），旧补丁若已写入会自动回滚。 */
function transformShellDescriptionOptional(src, file) {
  let reverted = false;
  if (src.includes(SHELL_DESC_SCHEMA_NEW)) {
    src = src.replace(SHELL_DESC_SCHEMA_NEW, SHELL_DESC_SCHEMA_OLD);
    reverted = true;
  }
  if (src.includes(SHELL_DESC_MARKER)) {
    return reverted ? { status: "changed", src, note: "已回滚 schema required: false" } : { status: "already" };
  }
  if (!src.includes(SHELL_DESC_VALIDATE_OLD)) {
    return { status: "anchor-missing", detail: "未找到 shell description 锚点（版本可能已变更），跳过 " + file };
  }
  return { status: "changed", src: src.replace(SHELL_DESC_VALIDATE_OLD, SHELL_DESC_VALIDATE_NEW), note: reverted ? "已回滚 schema required: false" : undefined };
}

const CODE_MODE_MARKER = 'dsh-desktop compat: direct tools alongside run_code';
const CODE_MODE_OLD = `- id: tool-presentation
  name: '@deepseek-ai/dsh-agent-tool-presentation'
  config:
    mode: code`;
const CODE_MODE_NEW = `- id: tool-presentation
  name: '@deepseek-ai/dsh-agent-tool-presentation'
  config:
    # ${CODE_MODE_MARKER}
    mode: both`;

const CODE_PRESET_REL = path.join('dsh', 'config', 'agent-presets', 'code', 'agent.cordis.yml');

/** code preset `mode: code` → `mode: both` 变换（幂等，锚点失配跳过）。 */
// ---------------------------------------------------------------------------
// 图片字节信任补丁（问题背景：浏览器声明的 MIME 跟随文件扩展名，不可信——
// webp/jpeg 改名 .png 后 file.type 仍是 image/png，而字节解码为 webp，官方
// 严格比对 declared !== detected 直接拒发整条消息，用户看到「仅支持 PNG、JPG、
// WebP、GIF」却发不出去）。decoded 字节才是权威：声明为 image/* 时以字节
// 实际格式为准记录，不再拒绝发送。
// 幂等标记 = dsh-desktop compat: trust decoded image bytes。
// ---------------------------------------------------------------------------

const ATTACH_MIME_MARKER = "dsh-desktop compat: trust decoded image bytes";
const ATTACH_MIME_OLD = '\tif (detected.mediaType !== declaredMediaType) throw new AttachmentError("Declared image type does not match its bytes.", "IMAGE_TYPE_MISMATCH");';
const ATTACH_MIME_NEW = '\t// ' + ATTACH_MIME_MARKER + '. The browser-declared MIME follows the file extension and is\n\t// untrusted (a webp/jpeg renamed to .png arrives as image/png while the bytes decode as\n\t// webp); the decoded bytes are authoritative, so record the detected type instead of\n\t// rejecting the whole send.\n\tif (detected.mediaType !== declaredMediaType && typeof declaredMediaType === "string" && declaredMediaType.startsWith("image/")) declaredMediaType = detected.mediaType;';

const ATTACH_LOCAL_REL = path.join("dsh-attachment-local", "lib", "index.js");

/** attachment-local 图片字节信任变换（幂等，锚点失配跳过）。 */
function transformAttachmentMimeTrust(src, file) {
  if (src.includes(ATTACH_MIME_MARKER)) return { status: "already" };
  if (!src.includes(ATTACH_MIME_OLD)) {
    return { status: "anchor-missing", detail: "未找到 attachment-local MIME 校验锚点（版本可能已变更），跳过 " + file };
  }
  return { status: "changed", src: src.replace(ATTACH_MIME_OLD, ATTACH_MIME_NEW) };
}
function transformCodeModeCompat(src, file) {
  if (src.includes(CODE_MODE_MARKER)) return { status: 'already' };
  if (!src.includes(CODE_MODE_OLD)) {
    return { status: 'anchor-missing', detail: '未找到 code preset 的 tool-presentation 锚点（版本可能已变更），跳过 ' + file };
  }
  return { status: 'changed', src: src.replace(CODE_MODE_OLD, CODE_MODE_NEW) };
}

module.exports = {
  FLASH_OLD,
  FLASH_NEW,
  SETTINGS_NAMESPACES,
  FLASH_PKG_REL,
  EXPOSE_PKG_REL,
  patchTargets,
  localCopyFiles,
  guardCopyFiles,
  localNodeModulesRoots,
  transformFlashFix,
  transformExposeFix,
  PERSISTENCE_PKG_REL,
  PERSISTENCE_TORN_MARKER,
  transformPersistenceTornTail,
  PERSISTENCE_CORRUPT_MARKER,
  transformPersistenceCorruptGuard,
  transformPersistenceAll,
  SLOT_KEY_COMPAT_PKG_REL,
  SLOT_UNKEYED_COMPAT_PKG_REL,
  SLOT_COMPAT_PKG_RELS,
  SLOT_KEY_COMPAT_MARKER,
  SLOT_KEY_COMPAT_OLD,
  SLOT_KEY_COMPAT_NEW,
  SLOT_UNKEYED_COMPAT_MARKER,
  SLOT_UNKEYED_COMPAT_OLD,
  SLOT_UNKEYED_COMPAT_NEW,
  transformLegacySlotKey,
  transformSlotUnkeyedCompat,
  SLOT_ERROR_ISOLATE_MARKER,
  transformSlotErrorIsolation,
  slotCompatCopyFiles,
  slotCompatPatchTargets,
  SHELL_DESC_MARKER,
  SHELL_DESC_VALIDATE_OLD,
  SHELL_DESC_VALIDATE_NEW,
  SHELL_DESC_SCHEMA_OLD,
  SHELL_DESC_SCHEMA_NEW,
  PW_REL,
  BASH_REL,
  transformShellDescriptionOptional,
  CODE_MODE_MARKER,
  CODE_MODE_OLD,
  CODE_MODE_NEW,
  CODE_PRESET_REL,
  transformCodeModeCompat,
  ATTACH_MIME_MARKER,
  ATTACH_MIME_OLD,
  ATTACH_MIME_NEW,
  ATTACH_LOCAL_REL,
  transformAttachmentMimeTrust,
};
