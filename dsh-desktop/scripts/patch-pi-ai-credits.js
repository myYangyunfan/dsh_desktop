'use strict';

// dsh-llm-pi-ai 错误分类补丁（幂等）。
//
// 问题：opencode 等第三方 provider 在账户余额不足时返回 HTTP 401 + CreditsError
// ("Insufficient balance")。dsh-llm-pi-ai 的 classifyPiAiError 把所有 401/403 一律
// 判为 "AUTH"，客户端再投影成 "API key is invalid"，严重误导用户（key 其实有效，
// 只是欠费）。isQuotaExceededError 本已能识别 "insufficient balance/credits"，但
// 它的判定行排在 401 之后，永远到不了。
//
// 修复：把 isQuotaExceededError 的判定与 401-AUTH 判定调换顺序（余额判定在前）。
// 这样余额不足 → "QUOTA" → 客户端显示真实原因（含充值链接），而非 "API key is
// invalid"；真正的 key 无效（消息含 401 但不含余额关键词）仍判 AUTH，原行为不变。
//
// F2（2026-08-23）补登记进 boot 期 patch-registry：本补丁此前只经 patch-deps
// （postinstall）应用，node_modules 刷新后即静默丢失——v0.5.3 payload 实测缺此
// 补丁（dev 树同样缺失），第三方供应商余额不足被误显示 "API key is invalid"，
// 观感即「第三方模型接入有问题」。现与其它内核包补丁一致：桌面壳 boot 链与
// CLI 同步期每次幂等重应用（kind='root'，failPolicy warn，锚点失配自动退役）。
//
// 用法：
//   node scripts/patch-pi-ai-credits.js [<node_modules 根目录>]
// 同时导出 patchPiAiCredits(nmRoot, log, stats, options) 供
// patch-registry（桌面壳启动 / CLI 同步）与 patch-deps（postinstall dev
// node_modules）复用。

const fs = require('node:fs');
const path = require('node:path');
const { writeFileAtomic } = require('./lib/patch-io');

/** 目标文件（相对 node_modules 根）。 */
const PKG_REL = path.join('@deepseek-ai', 'dsh-llm-pi-ai', 'lib', 'index.js');

const PATCH_MARKER = 'dsh-desktop-patch: credits-before-auth';
// 匹配 classifyPiAiError 里原始的「401/403→AUTH」+「isQuotaExceededError→QUOTA」两行
// （tab 缩进，401 在前、余额在后）。换行用 \r?\n：目标文件若为 CRLF（历史
// 发布形态）也必须命中，不能静默跳过补丁。
const OLD_RE = /\tif \(\/\\b\(\?:401\|403\)\\b\/\.test\(message\)\) return "AUTH";\r?\n\tif \(isQuotaExceededError\(message\)\) return QUOTA_EXCEEDED_CODE;/;
const NEW_BLOCK = [
  '\t/* ' + PATCH_MARKER + ' — 第三方 provider 余额不足(CreditsError)会返回 401，须先于 AUTH 判定，否则误显示 API key is invalid */',
  '\tif (isQuotaExceededError(message)) return QUOTA_EXCEEDED_CODE;',
  '\tif (/\\b(?:401|403)\\b/.test(message)) return "AUTH";',
].join('\n');

// 0.2.2-rc.2 换代：classifyPiAiError 先把「行首 HTTP 状态码」抽成 statusSource
// （`const statusSource = LEADING_HTTP_STATUS.exec(message)?.[0] ?? message;`），两条判定
// 改读 statusSource——判定顺序仍是有 bug 的那个（401-AUTH 在余额之前），所以补丁照旧，
// 只把锚点与注入体换成 statusSource 形态。别改回 message：那会把消息正文里的 401 也算成
// AUTH（上游引入 statusSource 正是为了只认行首状态码）。
const OLD_RE_STATUS =
  /\tif \(\/\\b\(\?:401\|403\)\\b\/\.test\(statusSource\)\) return "AUTH";\r?\n\tif \(isQuotaExceededError\(message\)\) return QUOTA_EXCEEDED_CODE;/;
const NEW_BLOCK_STATUS = [
  '\t/* ' + PATCH_MARKER + ' — 第三方 provider 余额不足(CreditsError)会返回 401，须先于 AUTH 判定，否则误显示 API key is invalid */',
  '\tif (isQuotaExceededError(message)) return QUOTA_EXCEEDED_CODE;',
  '\tif (/\\b(?:401|403)\\b/.test(statusSource)) return "AUTH";',
].join('\n');

/**
 * 变换：classifyPiAiError 余额判定前置（幂等、锚点失配不改写）。
 * @param {string} src
 * @param {string} file 诊断用
 * @returns {{status:'already'}|{status:'anchor-missing',detail:string}|{status:'changed',src:string}}
 */
function transformPiAiCredits(src, file) {
  if (src.includes(PATCH_MARKER)) return { status: 'already' };
  if (OLD_RE.test(src)) return { status: 'changed', src: src.replace(OLD_RE, NEW_BLOCK) };
  if (OLD_RE_STATUS.test(src)) return { status: 'changed', src: src.replace(OLD_RE_STATUS, NEW_BLOCK_STATUS) };
  return {
    status: 'anchor-missing',
    detail: '未匹配到 classifyPiAiError 401/余额判定两行（版本可能已更新），跳过 ' + file,
  };
}

/**
 * 对某个 node_modules 根目录应用 dsh-llm-pi-ai 余额判定补丁（幂等）。
 * @param {string} nmRoot node_modules 根目录
 * @param {(msg: string) => void} [log]
 * @param {{anchorMissing?: number, failed?: number}} [stats] 可选计数器（与
 *   patch-runner 的 patchReport 口径对齐：锚点失配 / 读写失败各计一次）。
 * @param {{dryRun?: boolean}} [options]
 * @returns {number} 实际发生修改的文件数
 */
function patchPiAiCredits(nmRoot, log = () => {}, stats, options) {
  const file = path.join(nmRoot, PKG_REL);
  if (!fs.existsSync(file)) return 0; // 该根未装 dsh-llm-pi-ai（如 profile 副本），静默跳过
  let src;
  try {
    src = fs.readFileSync(file, 'utf8');
  } catch (err) {
    log('pi-ai 余额判定补丁: 读取失败 ' + file + ': ' + err.message);
    if (stats) stats.failed += 1;
    return 0;
  }
  const result = transformPiAiCredits(src, file);
  if (result.status === 'already') {
    log('pi-ai 余额判定补丁: 已应用，跳过 ' + file);
    return 0;
  }
  if (result.status === 'anchor-missing') {
    log('pi-ai 余额判定补丁: ' + result.detail);
    if (stats) stats.anchorMissing += 1;
    return 0;
  }
  try {
    if (options && options.dryRun) {
      log('pi-ai 余额判定补丁: dry-run: 将前置余额判定 ' + file);
    } else {
      writeFileAtomic(file, result.src);
      log('pi-ai 余额判定补丁: 已前置余额判定到 401-AUTH 之前 ' + file);
      return 1;
    }
  } catch (err) {
    log('pi-ai 余额判定补丁: 写入失败 ' + file + ': ' + err.message);
    if (stats) stats.failed += 1;
  }
  return 0;
}

module.exports = { patchPiAiCredits, transformPiAiCredits, PATCH_MARKER, PKG_REL };

if (require.main === module) {
  const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..', 'node_modules');
  const n = patchPiAiCredits(root, (m) => console.log('[patch-pi-ai-credits] ' + m.replace(/^pi-ai 余额判定补丁: /, '')));
  if (n > 0) console.log('[patch-pi-ai-credits] 已补丁 dsh-llm-pi-ai：余额判定前置到 401-AUTH 之前');
}
