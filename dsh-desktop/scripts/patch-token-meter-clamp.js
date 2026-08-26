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
// 按既有模式加运行时补丁：把 messageTokens 夹到 >= 0。该值是启发式上下文构成
// 估算，只用于「上下文构成」展示/计量，夹 0 不影响真实请求，安全。
// 锚点失配（上游重构 apply）自动退役。
//
// 注意：该包是 bundle，lib/types/breakdown-projection.js 里存在同形源码（但
// 用空格缩进、且运行时加载的是 lib/index.js）；本补丁只读 lib/index.js 且锚点
// 精确到其 tab 缩进的那一行，不会误替换 types 文件。
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

/**
 * 变换：contextBreakdownProjectionDefinition.apply 的 messageTokens 行 →
 * Math.max(0, …) 下限夹取（幂等）。
 * @param {string} src
 * @param {string} file 诊断用
 * @returns {{status:'already'}|{status:'anchor-missing',detail:string}|{status:'changed',src:string}}
 */
function transformTokenMeterClamp(src, file) {
  if (src.includes(PATCH_MARKER)) return { status: 'already' };
  if (!src.includes(MESSAGE_TOKENS_ANCHOR)) {
    return {
      status: 'anchor-missing',
      detail: '未匹配到 contextBreakdownProjectionDefinition.apply 的 messageTokens 行（版本可能已更新），跳过 ' + file,
    };
  }
  const out = src.replace(MESSAGE_TOKENS_ANCHOR, MESSAGE_TOKENS_REPLACEMENT);
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
      log('token-meter 夹取补丁: dry-run: 将把 messageTokens 夹到 >= 0 ' + file);
    } else {
      writeFileAtomic(file, result.src);
      log('token-meter 夹取补丁: 已将 messageTokens 夹到 >= 0 ' + file);
      return 1;
    }
  } catch (err) {
    log('token-meter 夹取补丁: 写入失败 ' + file + ': ' + err.message);
    if (stats) stats.failed += 1;
  }
  return 0;
}

module.exports = { patchTokenMeterClamp, transformTokenMeterClamp, PATCH_MARKER, PKG_REL };

if (require.main === module) {
  const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..', 'node_modules');
  const n = patchTokenMeterClamp(root, (m) => console.log('[patch-token-meter-clamp] ' + m.replace(/^token-meter 夹取补丁: /, '')));
  if (n > 0) console.log('[patch-token-meter-clamp] 已补丁 dsh-token-meter：messageTokens 下限夹取 >= 0');
}
