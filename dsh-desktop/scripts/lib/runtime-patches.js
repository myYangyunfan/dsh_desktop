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

/** 设置暴露白名单（dsh-prompt / 第三方思考 / 会话调整）。
 *  'dsh-vision' 已随识图插件（2026-10 内置伴随插件批量退役）摘除：白名单里留着
 *  一个没有插件写入的命名空间，设置页只会多出一个空白分组。 */
const SETTINGS_NAMESPACES = ['dsh-prompt', 'dsh-third-party-thinking', 'dsh-conversation-tweaks'];
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
// v2（本文件当前形态）：torn-tail 返回体对齐 0.1.5-rc.1 的扁平契约。rc.1 消费端
// 只读 `state.tornTruncateTo`（驱动 truncateTornTail 截盘）与 `state.recoveredTail`
// （驱动 persistBatch 回灌），rc.1 pristine 全文 `tornMarker` 出现 0 次 —— v1 注入体
// 因此在 rc.1 上完全不生效（降级只落在内存里，损坏尾既不截盘也不回灌）。
// 本补丁以「首行前置 marker + includes 短路」幂等，若不升代，已带 v1 marker 的副本
// （含本机 dev 树与各 profile/overlay 常驻副本）会永久锁死在死代码形态。
const PERSISTENCE_TORN_MARKER_V2 = PERSISTENCE_TORN_MARKER + ' (v2: rc.1 flat tornTruncateTo)';
// 首部 marker 行（torn-tail 以「整行前置」方式打标）。逆运算还原 pristine 时需要
// 剥掉它，故收口成单一常量而不是在两处各写一遍拼接。
const PERSISTENCE_TORN_HEAD = '// ' + PERSISTENCE_TORN_MARKER + '\n';
const PERSISTENCE_TORN_HEAD_V2 = '// ' + PERSISTENCE_TORN_MARKER_V2 + '\n';
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
// torn-tail 返回块两代形态：v1 = alpha.5 嵌套契约（在野副本），v2 = rc.1 扁平契约。
const PERSISTENCE_TORN_RETURN_V1 = [
  '\t\t\t\treturn {',
  '\t\t\t\t\tmeta: prefix.meta,',
  '\t\t\t\t\tevents: prefix.events,',
  '\t\t\t\t\ttornMarker: {',
  '\t\t\t\t\t\ttruncateTo: tornCompleteFrameStart,',
  '\t\t\t\t\t\trecoveredEvents: prefix.events.slice(tornCompleteEventCount)',
  '\t\t\t\t\t}',
  '\t\t\t\t};',
].join('\n');
const PERSISTENCE_TORN_RETURN_V2 = [
  '\t\t\t\treturn {',
  '\t\t\t\t\tmeta: prefix.meta,',
  '\t\t\t\t\tinheritedEventCount: prefix.inheritedEventCount,',
  '\t\t\t\t\tevents: prefix.events,',
  '\t\t\t\t\ttornTruncateTo: tornCompleteFrameStart,',
  '\t\t\t\t\trecoveredTail: prefix.events.slice(tornCompleteEventCount)',
  '\t\t\t\t};',
].join('\n');
// v1 完整注入体（历史形态）：仅作就地升级的替换源，不再用于新装。
const PERSISTENCE_COMPLETE_CHECK_V1 = [
  '\t\t\tif (tornCompleteFrameStart !== void 0) {',
  '\t\t\t\tconst prefix = scanner.finish();',
  PERSISTENCE_TORN_RETURN_V1,
  '\t\t\t}',
  PERSISTENCE_COMPLETE_CHECK,
].join('\n');
const PERSISTENCE_COMPLETE_CHECK_NEW = [
  '\t\t\tif (tornCompleteFrameStart !== void 0) {',
  '\t\t\t\tconst prefix = scanner.finish();',
  PERSISTENCE_TORN_RETURN_V2,
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
  if (src.includes(PERSISTENCE_TORN_MARKER_V2)) return { status: 'already' };
  // 就地升级通道：已带 v1 首部 marker 的副本进不了下方 fresh-apply（锚点已被
  // v1 注入体吃掉），而 v1 返回体在 rc.1 上是死代码。这里就地把 v1 补成 v2：
  // 只换首行 marker 与 torn-tail 返回块两处，其余不动 —— 使升级产物与
  // 「pristine 全新应用」逐字节相同（否则逆运算要面对第三种形态）。
  if (src.includes(PERSISTENCE_TORN_HEAD) && src.includes(PERSISTENCE_COMPLETE_CHECK_V1)) {
    const upgraded = src
      .split(PERSISTENCE_TORN_HEAD).join(PERSISTENCE_TORN_HEAD_V2)
      .split(PERSISTENCE_COMPLETE_CHECK_V1).join(PERSISTENCE_COMPLETE_CHECK_NEW);
    return { status: 'changed', src: upgraded, note: 'v1-repair' };
  }
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
  patched = PERSISTENCE_TORN_HEAD_V2 + patched;
  return { status: 'changed', src: patched };
}

// ---------------------------------------------------------------------------
// 单个损坏的会话日志不得击穿整个启动扫描：listArtifacts 读首行遇到损坏 zstd
// 时跳过该会话并告警，而不是让整个 plugin tree 初始化崩溃（2026-08 事故：
// 卷影恢复带回零填充头部的会话日志，导致应用整体无法启动）。
const PERSISTENCE_CORRUPT_MARKER = 'dsh-desktop-corrupt-guard-v1';
// 0.2.0-rc.2 重锚：上游在这一层原生白名单了两类可读错误——零填充头部走
// readFirstZstdLine:3319 抛 SessionPersistenceCorruptionError，listArtifacts:3043
// 直接 continue，故 2026-08 那起事故本身已被上游修掉。本补丁的**增量**是剩余的
// 「不在白名单里的那一类」：readGenerationHeader 还会抛 plain Error
// （assertNoRetiredHeaderFields、生成文件名与 header 版本不符 :3081、
// assertStoredIdentity），单个坏文件仍会以 throw 掀掉整棵 plugin tree 初始化。
// 语义照旧：读首行失败一律告警跳过该会话，不击穿启动扫描。
const PERSISTENCE_CORRUPT_OLD =
  '\t\t\t} catch (error) {\n\t\t\t\tif (error instanceof SessionFormatUnsupportedError || error instanceof SessionPersistenceCorruptionError) continue;\n\t\t\t\tthrow error;\n\t\t\t}';
const PERSISTENCE_CORRUPT_NEW = [
  '\t\t\t} catch (error) {',
  '\t\t\t\tif (error instanceof SessionFormatUnsupportedError || error instanceof SessionPersistenceCorruptionError) continue;',
  '\t\t\t\t// ' + PERSISTENCE_CORRUPT_MARKER + ': 损坏会话日志告警跳过，不得击穿启动扫描。',
  '\t\t\t\tconsole.warn(`[dsh-session-persistence] skipping corrupt session log: ${selected.sourcePath} (${error?.message ?? error})`);',
  '\t\t\t\tcontinue;',
  '\t\t\t}',
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

// ---------------------------------------------------------------------------
// 0.6.4 在野缺陷（现场诊断见 README「DSH 历史加载失败修复」）：v0→v1 迁移的
// frozen released-v0 编解码器**冻结了第一方 v0 构建当时的载荷成员清单**，清单外
// 成员一律 SessionFormatError 整条拒载（不丢弃、不降级），于是跨代留存的会话永久
// 读不回 —— 界面表现为「历史加载失败：... has unexpected member "tier"」。
// 实测三类（一台机器 54 会话中 19 个失败）：
//   1) compaction/summary 多 tier/kernelBlockId/parentBlockIds/directMessageIds/
//      effectiveMessageIds —— 由第三方压缩插件 billion-context-dsh(acp-kernel)
//      自带的块账本写入；这些字段**必须原样活到 v3**，剥掉就等于丢插件语义，
//      所以只能扩准入清单，不能剥离（本补丁早期版本犯过这个错）。
//   2) permission/preset 多 origin:"default" —— 早期写入方的溯源信息。
//   3) subagent/descriptor version:2 —— 字段集与 v3 完全相同；上游只在 v0 分支拒它
//      （v1 分支直接 return 容忍），而下游 v2→v3 又硬要求 3，属单纯过度收紧。
// 三处一律「只放宽准入、不放宽校验」：必填/类型/语义校验全部保留，
// 第 3 类盖章后**继续落到原有严格形状校验**，非 2 的未知版本仍照拒。
const RELEASED_V0_HISTORY_MARKER = 'dsh-desktop compat: released v0 history recovery';
const RELEASED_V0_SUMMARY_OLD = [
  '\t"compaction/summary": disposition([',
  '\t\t"compactionId",',
  '\t\t"summary",',
  '\t\t"shadowedRange",',
  '\t\t"shadowedSeqs",',
  '\t\t"shadowedTokenCount",',
  '\t\t"provider",',
  '\t\t"model"',
  '\t], [',
  '\t\t"sourceCommandId",',
  '\t\t"maxTokens",',
  '\t\t"usage",',
  '\t\t"rawOutput",',
  '\t\t"llmStreamCall"',
  '\t]),',
].join('\n');
const RELEASED_V0_SUMMARY_NEW = [
  '\t"compaction/summary": disposition([',
  '\t\t"compactionId",',
  '\t\t"summary",',
  '\t\t"shadowedRange",',
  '\t\t"shadowedSeqs",',
  '\t\t"shadowedTokenCount",',
  '\t\t"provider",',
  '\t\t"model"',
  '\t], [',
  '\t\t"sourceCommandId",',
  '\t\t"maxTokens",',
  '\t\t"usage",',
  '\t\t"rawOutput",',
  '\t\t"llmStreamCall",',
  '\t\t/* ' + RELEASED_V0_HISTORY_MARKER + ' (1/3): 第三方压缩插件',
  '\t\t   billion-context-dsh(acp-kernel) 的块账本字段。原样保留到 v3，',
  '\t\t   不剥离、不重写 —— 剥掉会丢插件的 tier/块身份语义。 */',
  '\t\t"tier",',
  '\t\t"kernelBlockId",',
  '\t\t"parentBlockIds",',
  '\t\t"directMessageIds",',
  '\t\t"effectiveMessageIds"',
  '\t]),',
].join('\n');
const RELEASED_V0_PRESET_OLD = '\t"permission/preset": disposition(["preset"]),';
const RELEASED_V0_PRESET_NEW = '\t/* ' + RELEASED_V0_HISTORY_MARKER + ' (2/3): 早期写入方的 origin 属展示/溯源信息，准入不影响语义。 */\n'
  + '\t"permission/preset": disposition(["preset"], [\n\t\t"origin"\n\t]),';
const RELEASED_V0_DESCRIPTOR_OLD = [
  '\tif (event.type === "subagent/descriptor" && data["version"] !== 3) {',
  '\t\tconst descriptorVersion = sessionFormatCount(data["version"], `${event.type} ${event.seq} version`);',
  '\t\tif (version === 0) throw new SessionFormatUnsupportedMigrationError(`${event.type} ${event.seq} uses unsupported descriptor version ${descriptorVersion}`);',
  '\t\treturn;',
  '\t}',
].join('\n');
const RELEASED_V0_DESCRIPTOR_NEW = [
  '\tif (event.type === "subagent/descriptor" && data["version"] !== 3) {',
  '\t\tconst descriptorVersion = sessionFormatCount(data["version"], `${event.type} ${event.seq} version`);',
  '\t\t/* ' + RELEASED_V0_HISTORY_MARKER + ' (3/3): v0 构建写过的 version:2 字段集是 v3 的',
  '\t\t   子集，仅盖章为 3 后**继续走原有的严格形状校验**（不 return、不跳过校验）；',
  '\t\t   其它未知版本仍照拒。v1 分支行为逐字不变。 */',
  '\t\tif (version === 0 && descriptorVersion === 2) data["version"] = 3;',
  '\t\telse if (version === 0) throw new SessionFormatUnsupportedMigrationError(`${event.type} ${event.seq} uses unsupported descriptor version ${descriptorVersion}`);',
  '\t\telse return;',
  '\t}',
].join('\n');

/** released-v0 历史恢复变换（目标 dsh-session-format-v0-to-v1/lib/index.js，三处一起成/一起不成）。 */
function transformReleasedV0KeysTolerance(src, file) {
  if (typeof src !== 'string') return { status: 'anchor-missing', detail: '非字符串源，跳过 ' + file };
  if (src.includes(RELEASED_V0_HISTORY_MARKER)) return { status: 'already' };
  const missing = [];
  if (!src.includes(RELEASED_V0_SUMMARY_OLD)) missing.push('compaction/summary 准入清单');
  if (!src.includes(RELEASED_V0_PRESET_OLD)) missing.push('permission/preset 准入清单');
  if (!src.includes(RELEASED_V0_DESCRIPTOR_OLD)) missing.push('subagent/descriptor 版本分支');
  if (missing.length > 0) {
    return {
      status: 'anchor-missing',
      detail: '未找到 released-v0 历史恢复锚点（版本可能已变更），跳过 ' + file + '：' + missing.join(' / '),
    };
  }
  let out = src.replace(RELEASED_V0_SUMMARY_OLD, RELEASED_V0_SUMMARY_NEW);
  out = out.replace(RELEASED_V0_PRESET_OLD, RELEASED_V0_PRESET_NEW);
  out = out.replace(RELEASED_V0_DESCRIPTOR_OLD, RELEASED_V0_DESCRIPTOR_NEW);
  return { status: 'changed', src: out };
}
/** 会话持久化全部容错变换：尾部擕裂恢复 + 损坏会话跳过，依次应用。 */
function transformPersistenceAll(src, file) {
  const torn = transformPersistenceTornTail(src, file);
  const afterTorn = torn.status === 'changed' ? torn.src : src;
  const guard = transformPersistenceCorruptGuard(afterTorn, file);
  if (guard.status === 'changed') return { status: 'changed', src: guard.src, note: guard.note };
  if (torn.status === 'changed') return { status: 'changed', src: afterTorn, note: torn.note };
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
// 0.2.0-rc.2 起 shell 工具的 parameters 块整体下沉一级（defineTool 被包进工厂函数），
// 于是 pwsh/bash 的 schema 从 3/4/4/4 tab 变成 4/5/5/4；validate 那行仍是 1 tab。
// 若不同步重锚，本补丁会「changed 但只上了一半」——validate 兜底生效、schema 仍
// required:true，模型省略 description 时被引擎参数校验先拒（正是本补丁要修的故障），
// 而注册表与矩阵都只看得到 changed。回归位：unit-patch-engine 的 tool-compat 两例
// 必须断言 note 同时含 schema 与 validate 两半。
const SHELL_DESC_SCHEMA_OLD = "\t\t\t\tdescription: {\n\t\t\t\t\ttype: \"string\",\n\t\t\t\t\trequired: true,\n\t\t\t\t\tdescription: \"Clear, concise description of what this command does in active voice, 5-10 words (shown in the UI). Examples:";
// 目标形态：删除 description 的 `required: true` 行（省略 key = 可选）。
const SHELL_DESC_SCHEMA_OPTIONAL = "\t\t\t\tdescription: {\n\t\t\t\t\ttype: \"string\",\n\t\t\t\t\tdescription: \"Clear, concise description of what this command does in active voice, 5-10 words (shown in the UI). Examples:";
// 历史误写形态（required: false，引擎定义期即拒）；仅作收敛识别锚点。
const SHELL_DESC_SCHEMA_NEW = "\t\t\t\tdescription: {\n\t\t\t\t\ttype: \"string\",\n\t\t\t\t\trequired: false, // " + SHELL_DESC_MARKER + "\n\t\t\t\t\tdescription: \"Clear, concise description of what this command does in active voice, 5-10 words (shown in the UI). Examples:";

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
  // v2 世代（rc.1 扁平契约）：同样按引用登记，供逆运算表与哨兵单测取用。
  PERSISTENCE_TORN_MARKER_V2,
  PERSISTENCE_TORN_HEAD_V2,
  PERSISTENCE_TORN_RETURN_V1,
  PERSISTENCE_TORN_RETURN_V2,
  PERSISTENCE_COMPLETE_CHECK_V1,
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
  transformReleasedV0KeysTolerance,
  RELEASED_V0_HISTORY_MARKER,
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
