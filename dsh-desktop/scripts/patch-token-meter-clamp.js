'use strict';

// dsh-token-meter messageTokens 下限夹取补丁（幂等）。
//
// 问题：@deepseek-ai/dsh-token-meter/lib/index.js 的
// contextBreakdownProjectionDefinition.apply 组装上下文构成估算时：
//   messageTokens: state.messageTokens + fold.deltaTokens,
// 其中 foldSurfaceProjection 在消息被压缩/替换（surfaceOp === "replace"）时
// 返回 deltaTokens = tokens - claim.tokens（可为负）。当负 delta 的绝对值大于
// 已累计的 state.messageTokens 时，messageTokens 变成负数 → 触发 stateSchema
// 的 tokenCount = z.number().int().nonnegative() 校验（"Too small: expected
// number to be >= 0"）→ 本轮运行失败。
//
// 这是内核 dsh-token-meter 的 accounting 边界 bug（「内核问题不改内核源码」），
// 按既有模式加运行时补丁，分两层（与仓库 tool-call「读端容错 + 写端防护」同构）：
//
//   [写端] 把 apply 组装的 messageTokens 夹到 >= 0：杜绝新负值再被产生/落盘。
//   [读端] 把 contextBreakdown 的 stateVersion 2→3：作废 0.5.6 时代已落盘的脏行。
//
// 为何两层都要——仅夹取不足以救已中招的用户：投影 checkpoint 是落盘的
// （<root>/session_projcache/sessions/<id>.json，val 只过 z.json()，负值可入），
// 而冷加载 restore() 见 row.ver === def.stateVersion 就 stateSchema.parse(row.val)。
// 0.5.6 的 apply 未夹取、checkpoint() 又不校验 state，已把 messageTokens<0 的行
// 以 ver=2 存进磁盘。升级到 main 后即便 apply 已夹取，那批 ver=2 脏行仍会被
// restore 直接 parse → 抛 "messageTokens Too small" → 历史加载失败（正是 #172）。
// bump stateVersion 使 ver 失配：restoreFloor 把该 key 的 floor 拉到 0 → 从 seq 0 用
// 已夹取的 apply 重折出合法非负态并回写 ver=3，一次性自愈（框架内建机制）。
//
// 该值是启发式上下文构成估算，只用于「上下文构成」展示/计量，夹 0 不影响真实
// 请求，安全。锚点失配（上游重构 apply 或已自行 bump/下线该投影）自动退役。
//
// 注意：该包是 bundle，lib/types/breakdown-projection.js 里存在同形源码（但
// 用空格缩进、且运行时加载的是 lib/index.js）；本补丁只读 lib/index.js 且锚点
// 精确到其 tab 缩进的那几行，不会误替换 types 文件。tokenUsage 也是 stateVersion:2，
// 故版本锚点带 key 前缀以唯一定位 contextBreakdown，绝不误伤 tokenUsage。
//
// 用法：
//   node scripts/patch-token-meter-clamp.js [<node_modules 根目录>]
// 同时导出 patchTokenMeterClamp(nmRoot, log, stats, options) 供
// patch-registry（桌面壳启动 / CLI 同步）与 patch-deps（postinstall dev
// node_modules）复用。

const fs = require('node:fs');
const path = require('node:path');
const { writeFileAtomic } = require('./lib/patch-io');

/** 目标文件（相对 node_modules 根）。 */
const PKG_REL = path.join('@deepseek-ai', 'dsh-token-meter', 'lib', 'index.js');

const PATCH_MARKER = 'dsh-desktop fix: clamp token-meter messageTokens';

// 第二层子补丁的幂等判定标记（与夹取标记独立）。
const PATCH_MARKER_VERSION = 'dsh-desktop fix: bump contextBreakdown stateVersion';

// contextBreakdownProjectionDefinition.apply 返回对象里组装 messageTokens 的
// 那一行（3 个 tab 缩进，bundle lib/index.js 内唯一；types 文件用空格缩进，
// 与锚点字节级不同，且本补丁不读 types 文件）。
const MESSAGE_TOKENS_ANCHOR =
  '\t\t\tmessageTokens: state.messageTokens + fold.deltaTokens,';

// 注入体：先落 marker 注释（幂等判定依据），再把该行夹到 >= 0。
const MESSAGE_TOKENS_REPLACEMENT = [
  '\t\t\t/* ' + PATCH_MARKER + ' —— 内核 foldSurfaceProjection 在',
  '\t\t\t *  surfaceOp === "replace" 时 deltaTokens = tokens - claim.tokens 可为负，',
  '\t\t\t *  累计后 messageTokens 可能溢出为负，触发 stateSchema 的 tokenCount',
  '\t\t\t *  nonnegative 校验（"Too small: expected number to be >= 0"）。该值仅用于',
  '\t\t\t *  「上下文构成」估算展示/计量，夹 0 不影响真实请求。 */',
  '\t\t\tmessageTokens: Math.max(0, state.messageTokens + fold.deltaTokens),',
].join('\n');

// contextBreakdownProjectionDefinition 定义头的 key + stateVersion 两行（bundle
// lib/index.js 内 tab 缩进）。tokenUsage 同为 stateVersion: 2，故锚点必须带
// key: "contextBreakdown" 前缀行才能唯一定位，不会误伤 tokenUsage。
const STATE_VERSION_ANCHOR =
  '\tkey: "contextBreakdown",\n\tstateVersion: 2,';

// 注入体：保留 key 行不变，在 stateVersion 行前落 marker 注释，并把 2→3。
const STATE_VERSION_REPLACEMENT = [
  '\tkey: "contextBreakdown",',
  '\t/* ' + PATCH_MARKER_VERSION + ' 2→3 ——',
  '\t *  0.5.6 时代 apply 未夹取负 delta，checkpoint() 又不校验 state，已把 messageTokens<0',
  '\t *  的行以 ver=2 落盘（session_projcache）。冷加载 restore() 见 row.ver === stateVersion',
  '\t *  (仍为 2) 即 stateSchema.parse(负值) 抛错 → 历史加载失败。bump 后 ver 失配：',
  '\t *  restoreFloor 把该 key 的 floor 拉到 0 → 从 seq 0 用（已夹取的）apply 重折出合法非负态',
  '\t *  并回写 ver=3，脏行一次性自愈。仅影响 contextBreakdown，不动同值 2 的 tokenUsage。 */',
  '\tstateVersion: 3,',
].join('\n');

/**
 * 变换（两层子补丁，各自幂等、互不依赖，合并三态返回）：
 *   1) contextBreakdownProjectionDefinition.apply 的 messageTokens 行 →
 *      Math.max(0, …) 下限夹取（写端：杜绝新负值）；
 *   2) contextBreakdown 的 stateVersion 2→3（读端：作废已落盘的 ver=2 负值行，
 *      令 restore 走 ver 失配 → 从 seq 0 重折自愈）。
 * 两锚点皆失且无任一 marker → anchor-missing（上游重构，整补丁退役）。
 * @param {string} src
 * @param {string} file 诊断用
 * @returns {{status:'already'}|{status:'anchor-missing',detail:string}|{status:'changed',src:string}}
 */
function transformTokenMeterClamp(src, file) {
  let out = src;
  let changed = false;
  let clampResolved = false;
  let versionResolved = false;

  // 子补丁 1：messageTokens 下限夹取。
  if (out.includes(PATCH_MARKER)) {
    clampResolved = true;
  } else if (out.includes(MESSAGE_TOKENS_ANCHOR)) {
    out = out.replace(MESSAGE_TOKENS_ANCHOR, MESSAGE_TOKENS_REPLACEMENT);
    changed = true;
    clampResolved = true;
  }

  // 子补丁 2：contextBreakdown stateVersion 2→3。
  if (out.includes(PATCH_MARKER_VERSION)) {
    versionResolved = true;
  } else if (out.includes(STATE_VERSION_ANCHOR)) {
    out = out.replace(STATE_VERSION_ANCHOR, STATE_VERSION_REPLACEMENT);
    changed = true;
    versionResolved = true;
  }

  if (!clampResolved && !versionResolved) {
    return {
      status: 'anchor-missing',
      detail: '未匹配到 contextBreakdownProjectionDefinition 的 messageTokens 行与 stateVersion 行（版本可能已更新），跳过 ' + file,
    };
  }
  if (!changed) return { status: 'already' };
  return { status: 'changed', src: out };
}

/**
 * 对某个 node_modules 根目录应用 dsh-token-meter messageTokens 下限夹取补丁（幂等）。
 * @param {string} nmRoot node_modules 根目录
 * @param {(msg: string) => void} [log]
 * @param {{anchorMissing?: number, failed?: number}} [stats] 可选计数器
 * @param {{dryRun?: boolean}} [options]
 * @returns {number} 实际发生修改的文件数
 */
function patchTokenMeterClamp(nmRoot, log = () => {}, stats, options) {
  const file = path.join(nmRoot, PKG_REL);
  if (!fs.existsSync(file)) return 0; // 该根未装 dsh-token-meter（如 profile 副本），静默跳过
  let src;
  try {
    src = fs.readFileSync(file, 'utf8');
  } catch (err) {
    log('token-meter 夹取补丁: 读取失败 ' + file + ': ' + err.message);
    if (stats) stats.failed += 1;
    return 0;
  }
  const result = transformTokenMeterClamp(src, file);
  if (result.status === 'already') {
    log('token-meter 夹取补丁: 已应用，跳过 ' + file);
    return 0;
  }
  if (result.status === 'anchor-missing') {
    log('token-meter 夹取补丁: ' + result.detail);
    if (stats) stats.anchorMissing += 1;
    return 0;
  }
  try {
    if (options && options.dryRun) {
      log('token-meter 夹取补丁: dry-run: 将夹取 messageTokens>=0 并 bump contextBreakdown stateVersion 2→3 ' + file);
    } else {
      writeFileAtomic(file, result.src);
      log('token-meter 夹取补丁: 已夹取 messageTokens>=0 并 bump contextBreakdown stateVersion 2→3 ' + file);
      return 1;
    }
  } catch (err) {
    log('token-meter 夹取补丁: 写入失败 ' + file + ': ' + err.message);
    if (stats) stats.failed += 1;
  }
  return 0;
}

module.exports = { patchTokenMeterClamp, transformTokenMeterClamp, PATCH_MARKER, PATCH_MARKER_VERSION, PKG_REL };

if (require.main === module) {
  const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..', 'node_modules');
  const n = patchTokenMeterClamp(root, (m) => console.log('[patch-token-meter-clamp] ' + m.replace(/^token-meter 夹取补丁: /, '')));
  if (n > 0) console.log('[patch-token-meter-clamp] 已补丁 dsh-token-meter：messageTokens 下限夹取 >= 0 + contextBreakdown stateVersion 2→3（作废已落盘负值行）');
}
