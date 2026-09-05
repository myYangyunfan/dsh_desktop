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

// 路径构造与包内相对路径常量已迁出到 patch-target-resolver.js（唯一实现），
// 这里 re-export 一个版本周期，避免 main.js / sync-companion-plugins.js /
// 既有单测断链。变换（transform）与锚点常量仍保留在本模块。
const {
  FLASH_PKG_REL,
  EXPOSE_PKG_REL,
  PERSISTENCE_PKG_REL,
  SLOT_KEY_COMPAT_PKG_REL,
  SLOT_UNKEYED_COMPAT_PKG_REL,
  SLOT_COMPAT_PKG_RELS,
  PW_REL,
  BASH_REL,
  CODE_PRESET_REL,
  ATTACH_LOCAL_REL,
  patchTargets,
  localCopyFiles,
  guardCopyFiles,
  localNodeModulesRoots,
  slotCompatCopyFiles,
  slotCompatPatchTargets,
} = require('./patch-target-resolver');

/** dsh-client-runtime 会话列表刷新闪跳修复（mergeOrderedBaseline 保留本地新会话）。 */
const FLASH_OLD = '(value) => baselineByKey.get(keyOf(value))).filter((value) => value !== void 0);';
const FLASH_NEW = '(value) => baselineByKey.get(keyOf(value)) ?? value).filter((value) => value !== void 0);';

/** 设置暴露白名单（dsh-prompt / 第三方思考 / 识图 / 会话调整）。 */
const SETTINGS_NAMESPACES = ['dsh-prompt', 'dsh-third-party-thinking', 'dsh-vision', 'dsh-conversation-tweaks'];
// dsh rc.7 replaced the static allow-list with plugin-owned dynamic settings
// descriptors. Such a source already exposes every registered namespace, so
// the legacy list injection is unnecessary and must be treated as idempotent.
const DYNAMIC_SETTINGS_ANCHOR = 'namespaces: settings.describe({ redactSecrets: true }).map(namespaceView)';

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
// 首部 marker 行（torn-tail 以「整行前置」方式打标）。逆运算还原 pristine 时需要
// 剥掉它，故收口成单一常量而不是在两处各写一遍拼接。
const PERSISTENCE_TORN_HEAD = '// ' + PERSISTENCE_TORN_MARKER + '\n';
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

// 路径构造函数（patchTargets / localCopyFiles / guardCopyFiles /
// localNodeModulesRoots / slotCompatCopyFiles / slotCompatPatchTargets）已迁出
// 到 patch-target-resolver.js，本模块顶部 re-export 保持兼容。

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
  // 空数组（`const WEB_SETTINGS_NAMESPACES = []` 或 `= [\n]`）没有既有元素，
  // 若沿用非尾逗号分支无条件前置 `,\n` 会生成 `[,\n"x"]` 的非法 JS（前导逗号
  // = 空槽）。空数组特殊处理：换行起始注入条目，去掉前导逗号。
  const inner = arrText.slice(arrText.lastIndexOf('[') + 1).trim();
  const isEmptyArray = inner === '';
  const prefix = isEmptyArray ? '\n' : (hasTrailingComma ? '\n' : ',\n');
  const block = prefix + missing.map((ns) => '\t"' + ns + '"').join(',\n') + '\n';
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
  patched = PERSISTENCE_TORN_HEAD + patched;
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
// v2 修复标记：v1 曾把 throw 与派生 key 一并注入且保留了原 throw（且 `if` 守卫
// 被注释吞掉，导致 throw 无条件执行），v2 改为「if 守卫内 warn + 派生 key，不
// throw」，真正实现「缺 key 时派生而非拖垮 loader」。
const SLOT_ERROR_ISOLATE_MARKER_V2 = SLOT_ERROR_ISOLATE_MARKER + ' (v2)';
// 原始单行 throw：`if (options.key === void 0) throw ...`（错误消息任意）。
const SLOT_ERROR_ISOLATE_ORIGINAL = /([ \t]*)if \(options\.key === void 0\)[ \t]*throw[^\n]*/;
// v1 buggy 输出：`if (options.key === void 0) // marker...` + 3 行（注释/warn/派生）+ 独立 throw 行。
const SLOT_ERROR_ISOLATE_V1 = /([ \t]*)if \(options\.key === void 0\)[^\n]*\n(?:[^\n]*\n){3}[ \t]*throw[^\n]*/;
// v1 buggy 输出（standalone throw 源）：旧 SLOT_ERROR_ISOLATE_REGEX 匹配独立
// `throw new Error(...)`（无 if 前缀），其注入产物以 `// marker...` 开头，后跟 3 行
// （注释/warn/派生）+ throw。若只用 SLOT_ERROR_ISOLATE_V1（要求 if 前缀）会漏修、
// 无条件 throw 保留，故此处补一条无 if 前缀的回退匹配。
const SLOT_ERROR_ISOLATE_V1_STANDALONE = /([ \t]*)\/\/[^\n]*isolate keyed-slot registration errors[^\n]*\n(?:[^\n]*\n){3}[ \t]*throw[^\n]*/;

/** 构造 v2 隔离块：warn + 派生 key，不 throw。 */
function buildSlotIsolateBlock(indent) {
  return [
    indent + 'if (options.key === void 0) {',
    indent + '\t// ' + SLOT_ERROR_ISOLATE_MARKER_V2 + ': derive a key instead of throwing so one',
    indent + '\t// unkeyed plugin cannot take down the whole dsh web loader.',
    indent + '\tconsole.warn("[dsh-desktop compat] keyed slot registration missing key, auto-deriving from registrant; plugin:", options.registrant || options.id || "unknown");',
    indent + '\toptions.key = options.id !== void 0 ? String(options.id) : String(options.registrant || "auto-" + Math.random().toString(36).slice(2, 8));',
    indent + '}',
  ].join('\n');
}

function transformSlotErrorIsolation(src, file) {
  if (src.includes(SLOT_ERROR_ISOLATE_MARKER_V2)) return { status: 'already' };
  // 1) 原始单行 throw → 注入 v2（warn + 派生 key，不 throw）。
  const m = SLOT_ERROR_ISOLATE_ORIGINAL.exec(src);
  if (m) {
    return { status: 'changed', src: src.replace(m[0], buildSlotIsolateBlock(m[1])), note: 'v2' };
  }
  // 2) v1 buggy 输出（含旧 marker + 无条件 throw）→ 修复为 v2。
  if (src.includes(SLOT_ERROR_ISOLATE_MARKER)) {
    // 2a) 常规 v1：`if (options.key === void 0) // marker...` + 3 行 + throw。
    const v1 = SLOT_ERROR_ISOLATE_V1.exec(src);
    if (v1) {
      return { status: 'changed', src: src.replace(v1[0], buildSlotIsolateBlock(v1[1])), note: 'v1-repair' };
    }
    // 2b) standalone v1：旧 SLOT_ERROR_ISOLATE_REGEX 分支的独立 throw 源（无 if 前缀）。
    const v1s = SLOT_ERROR_ISOLATE_V1_STANDALONE.exec(src);
    if (v1s) {
      return { status: 'changed', src: src.replace(v1s[0], buildSlotIsolateBlock(v1s[1])), note: 'v1-repair' };
    }
  }
  return {
    status: 'anchor-missing',
    detail: '未找到 keyed slot throw 锚点（版本可能已变更），跳过 ' + file,
  };
}

// 模型工具兼容补丁（问题背景：模型调用 shell 工具（pwsh/bash，含经 jobs 派发）时
// 经常省略 `description`，而该字段只用于 UI/日志展示，不应让整个工具调用失败）。
// 报错形态：`invalid arguments: missing required property "description"`。
// 根因：引擎通用 schema 校验器（dsh-tools validateArgs）在工具自定义 validate 之前
// 先跑 required 检查；description 在 schema 里是 required:true，模型一省略就被通用
// 校验器拒绝，自定义 validate 里的兜底补值根本没机会执行（旧补丁只补 validate 故无效）。
// 修法（两处缺一不可）：
//   (1) schema：删除 description 的 `required: true` 行——引擎规则（runSchemaCompiler）
//       是「required 若出现必须为 true」，故不能设 false（会被拒），只能整行删除；
//       省略 key 后 description 不进 required 数组，通用校验器放行省略。
//   (2) validate：description 缺省/空串时用 command 首行补值（兜底 UI/日志展示）。
// 历史误写的 `required: false`（引擎定义期即拒）会被收敛为「删除该行」。
// 幂等标记 = dsh-desktop compat: optional shell description。
// ---------------------------------------------------------------------------

const SHELL_DESC_MARKER = "dsh-desktop compat: optional shell description";
const SHELL_DESC_VALIDATE_OLD = "\tif (args.description.trim().length === 0) throw new Error(\"invalid description: expected a non-empty string\");";
const SHELL_DESC_VALIDATE_NEW = "\tif (typeof args.description !== \"string\" || args.description.trim().length === 0) {\n\t\t// " + SHELL_DESC_MARKER + ": description is only for UI/log; derive one when the model omits it.\n\t\targs.description = args.command.trim().split(/\\r?\\n/)[0].slice(0, 80) || \"Run shell command\";\n\t}";
const SHELL_DESC_SCHEMA_OLD = "\t\t\tdescription: {\n\t\t\t\ttype: \"string\",\n\t\t\t\trequired: true,\n\t\t\t\tdescription: \"Clear, concise description of what this command does in active voice, 5-10 words (shown in the UI). Examples:";
// 目标形态：删除 description 的 `required: true` 行（省略 key = 可选）。
const SHELL_DESC_SCHEMA_OPTIONAL = "\t\t\tdescription: {\n\t\t\t\ttype: \"string\",\n\t\t\t\tdescription: \"Clear, concise description of what this command does in active voice, 5-10 words (shown in the UI). Examples:";
// 历史误写形态（required: false，引擎定义期即拒）；仅作收敛识别锚点。
const SHELL_DESC_SCHEMA_NEW = "\t\t\tdescription: {\n\t\t\t\ttype: \"string\",\n\t\t\t\trequired: false, // " + SHELL_DESC_MARKER + "\n\t\t\t\tdescription: \"Clear, concise description of what this command does in active voice, 5-10 words (shown in the UI). Examples:";

// run_code（code 模式）description 兜底——与 shell 同构，落点在引擎包 dsh-tools：
// schema description.required:true + execute 内 args.description.trim() 校验（3-tab）。
// 模型省略 description 时通用校验器先拒 → run_code 调用失败。修法同 shell：删
// required:true（可选）+ validate 缺省时用 args.code 首行补值。
const RUNCODE_DESC_MARKER = "dsh-desktop compat: optional run_code description";
const RUNCODE_SCHEMA_OLD = "\t\t\tdescription: {\n\t\t\t\ttype: \"string\",\n\t\t\t\trequired: true,\n\t\t\t\tdescription: RUN_CODE_DESCRIPTION_PARAM_DESCRIPTION";
const RUNCODE_SCHEMA_OPTIONAL = "\t\t\tdescription: {\n\t\t\t\ttype: \"string\",\n\t\t\t\tdescription: RUN_CODE_DESCRIPTION_PARAM_DESCRIPTION";
const RUNCODE_VALIDATE_OLD = "\t\t\tif (args.description.trim().length === 0) throw new Error(\"invalid description: expected a non-empty string\");";
const RUNCODE_VALIDATE_NEW = "\t\t\tif (typeof args.description !== \"string\" || args.description.trim().length === 0) {\n\t\t\t\t// " + RUNCODE_DESC_MARKER + ": description is only for UI/log; derive one from the program when the model omits it.\n\t\t\t\targs.description = args.code.trim().split(/\\r?\\n/)[0].slice(0, 80) || \"Run program\";\n\t\t\t}";

/** shell / run_code description 兜底变换（幂等，锚点逐字节一致）。
 *  两家族各：schema 删 description 的 required:true + validate 缺省补值。
 *  run_code 步必须先于 shell：run_code 的 3-tab validate 行以 shell 的 1-tab 锚点为
 *  子串，若 shell 先跑会用 args.command 逻辑误改 run_code 行（无 command → 崩）。 */
function transformShellDescriptionOptional(src, file) {
  let out = src;
  const notes = [];
  // === run_code 家族（dsh-tools；必须先跑，见上）===
  if (out.includes(RUNCODE_SCHEMA_OLD)) { out = out.replaceAll(RUNCODE_SCHEMA_OLD, RUNCODE_SCHEMA_OPTIONAL); notes.push("run_code: description 改为可选（两处 schema 块）"); }
  if (out.includes(RUNCODE_VALIDATE_OLD)) { out = out.replace(RUNCODE_VALIDATE_OLD, RUNCODE_VALIDATE_NEW); notes.push("run_code: validate 兜底"); }
  // === shell (pwsh/bash) 家族 ===
  if (out.includes(SHELL_DESC_SCHEMA_NEW)) { out = out.replace(SHELL_DESC_SCHEMA_NEW, SHELL_DESC_SCHEMA_OPTIONAL); notes.push("shell: 清理历史 required:false"); }
  if (out.includes(SHELL_DESC_SCHEMA_OLD)) { out = out.replace(SHELL_DESC_SCHEMA_OLD, SHELL_DESC_SCHEMA_OPTIONAL); notes.push("shell: description 改为可选"); }
  if (out.includes(SHELL_DESC_VALIDATE_OLD)) { out = out.replace(SHELL_DESC_VALIDATE_OLD, SHELL_DESC_VALIDATE_NEW); notes.push("shell: validate 兜底"); }
  if (notes.length > 0) return { status: "changed", src: out, note: notes.join("; ") };
  const done = out.includes(SHELL_DESC_MARKER) || out.includes(SHELL_DESC_SCHEMA_OPTIONAL)
    || out.includes(RUNCODE_DESC_MARKER) || out.includes(RUNCODE_SCHEMA_OPTIONAL);
  if (done) return { status: "already" };
  return { status: "anchor-missing", detail: "未找到 shell/run_code description 锚点（版本可能已变更），跳过 " + file };
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

// ---------------------------------------------------------------------------
// 历史对话分页容量放大（h1）：客户端首屏 open 与向上翻页 loadOlder 的每页条数
// 从 50 放大到 200，服务端 DEFAULT_MAX_MESSAGES 同步放大。直接缓解「历史仅能加
// 载约三分之一 / 上滑到顶仍加载不全」——首屏与每次翻页承载更多历史。服务端对
// maxMessages 仅校验「正整数」、无上限夹取（history.ts :250 / paginate :338），
// 故请求 200 即得 200 条。纯数字字面量替换，正则容忍缩进/换行差异，不锚定前导
// 空白；loadThrough 已是 200（maxMessages: 200），\b50\b 不误伤。两靶文件（
// session-controller lib/client.js 的两处调用点 + lib/index.js 的 DEFAULT）共用
// 同一 marker，命中任一即前置注释标记，二次运行短路 already。
// ---------------------------------------------------------------------------
const HISTORY_PAGE_MARKER = 'dsh-desktop compat: larger history page';
const HISTORY_PAGE_SIZE_NEW = '200';

/**
 * 历史分页容量放大变换（纯函数，幂等）。
 * @returns {{status:'already'} | {status:'anchor-missing', detail: string} | {status:'changed', src: string}}
 */
function transformHistoryPageSize(src, file) {
  if (src.includes(HISTORY_PAGE_MARKER)) return { status: 'already' };
  const patched = src
    .replace(/(\bmaxMessages:\s*)50\b/g, '$1' + HISTORY_PAGE_SIZE_NEW)
    .replace(/\b(DEFAULT_MAX_MESSAGES\s*=\s*)50\b/, '$1' + HISTORY_PAGE_SIZE_NEW);
  if (patched === src) {
    return { status: 'anchor-missing', detail: '未找到历史分页容量锚点（版本可能已变更），跳过 ' + file };
  }
  return { status: 'changed', src: '// ' + HISTORY_PAGE_MARKER + '\n' + patched };
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
  // torn-tail / corrupt-guard 的正向替换对（[OLD, NEW]）与首部 marker 行：
  // pristine 逆运算按引用登记（patch-adapters.PRISTINE_INJECTIONS），杜绝
  // 「哨兵测试里再抄一份字面串」的复制漂移 —— 抄的那份会变成第二处漂移源。
  PERSISTENCE_TORN_HEAD,
  PERSISTENCE_FRAME_LOOP_OLD,
  PERSISTENCE_FRAME_LOOP_NEW,
  PERSISTENCE_WRITE_OLD,
  PERSISTENCE_WRITE_NEW,
  PERSISTENCE_COMPLETE_CHECK,
  PERSISTENCE_COMPLETE_CHECK_NEW,
  transformPersistenceTornTail,
  PERSISTENCE_CORRUPT_MARKER,
  PERSISTENCE_CORRUPT_OLD,
  PERSISTENCE_CORRUPT_NEW,
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
  SLOT_ERROR_ISOLATE_MARKER_V2,
  transformSlotErrorIsolation,
  slotCompatCopyFiles,
  slotCompatPatchTargets,
  SHELL_DESC_MARKER,
  SHELL_DESC_VALIDATE_OLD,
  SHELL_DESC_VALIDATE_NEW,
  SHELL_DESC_SCHEMA_OLD,
  SHELL_DESC_SCHEMA_OPTIONAL,
  SHELL_DESC_SCHEMA_NEW,
  RUNCODE_DESC_MARKER,
  RUNCODE_SCHEMA_OLD,
  RUNCODE_SCHEMA_OPTIONAL,
  RUNCODE_VALIDATE_OLD,
  RUNCODE_VALIDATE_NEW,
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
  HISTORY_PAGE_MARKER,
  HISTORY_PAGE_SIZE_NEW,
  transformHistoryPageSize,
};
