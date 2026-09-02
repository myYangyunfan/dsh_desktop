'use strict';

// dsh-llm-pi-ai 裸 400/413 no body 友好文案补丁（幂等）。
//
// 问题：第三方自定义 OpenAI 兼容端点（openai-completions 协议）在输入超过
// 上下文窗口时，常见形态是「HTTP 400 且响应体为空」。OpenAI SDK 把这种
// 响应格式化成 "400 status code (no body)"，pi-ai 的 catch 块经
// formatProviderError 原样透出该文案，dsh-llm-pi-ai 的 mapStopReason 虽已
// 用 isContextOverflow 把它正确分类为 CONTEXT_WINDOW_EXCEEDED（code 正确），
// 但 failure.message 仍是原样 errorMessage；客户端 displayFailureMessage
// 只对 AUTH 码做了文案改写，对其余 code 原样显示 message。于是用户在聊天里
// 看到的是「本轮运行失败 400 status code (no body)」这种死谜语——既不知道是
// 超限，也不知道该怎么办。
//
// 修复：在 mapStopReason 的 overflow 分支里，把「裸 400/413 无响应体」这条
// opaque 文案映射成两成因并列的可操作提示（① 上下文超限→精简/开新会话；
// ② 供应商网关拒绝/故障→重试/换模型——0.6.0 实测 tokenrhythm 故障窗口内
// 连 530B 标题请求都 400 空体，说死成超限会误导用户删会话）。其余可读超限
// 文案（如 Anthropic "prompt is too long: X tokens > Y"）保持原样不丢信息。
// 锚点失配（上游重构 mapStopReason）自动退役。
//
// 用法：
//   node scripts/patch-pi-ai-overflow-message.js [<node_modules 根目录>]
// 同时导出 patchPiAiOverflowMessage(nmRoot, log, stats, options) 供
// patch-registry（桌面壳启动 / CLI 同步）与 patch-deps（postinstall dev
// node_modules）复用。

const fs = require('node:fs');
const path = require('node:path');
const { writeFileAtomic } = require('./lib/patch-io');

/** 目标文件（相对 node_modules 根）。 */
const PKG_REL = path.join('@deepseek-ai', 'dsh-llm-pi-ai', 'lib', 'index.js');

const PATCH_MARKER = 'dsh-desktop-patch: overflow-no-body-friendly';

// mapStopReason overflow 分支里组装 failure.message 的那一行（3 个 tab 缩进）。
const MESSAGE_ANCHOR =
  '\t\t\tmessage: message.errorMessage ?? `pi-ai detected context overflow for model "${message.model}"`,';
// helper 注入点：mapStopReason 函数签名（文件内唯一）。
const FN_ANCHOR = 'function mapStopReason(message, contextWindow) {';

// 注入的 helper 函数（声明于 mapStopReason 之前，function 声明提升保证可用）。
// 与 pi-ai OVERFLOW_PATTERNS 的 Cerebras 条目同形：^4(00|13) ... (no body)。
const HELPER_BLOCK = [
  '\t/** ' + PATCH_MARKER + ' — OpenAI 兼容端点裸 400/413 无响应体是模糊信号：',
  '\t *  既可能是上下文超限（Cerebras 风格），也可能是供应商网关拒绝/故障',
  '\t *  （实测 tokenrhythm 故障窗口内连 530B 标题请求都 400 空体）。映射成',
  '\t *  两成因并列的可操作提示，避免看到 "400 status code (no body)" 死谜语，',
  '\t *  也避免把供应商故障误报成超限误导用户删会话。 */',
  '\tfunction friendlyPiAiOverflowMessage(errorMessage, model) {',
  '\t\tif (typeof errorMessage === "string" && /^4(?:00|13)\\s*(?:status code)?\\s*\\(no body\\)/i.test(errorMessage)) {',
  '\t\t\treturn "模型端点返回 HTTP 400/413 无响应体（模糊错误，两种常见成因）：① 上下文超限——精简对话、压缩附件或开启新会话；② 供应商网关拒绝或故障——稍后重试或换模型/供应商。4xx 明细见数据目录 llm-4xx-dump.log。";',
  '\t\t}',
  '\t\treturn errorMessage ?? `pi-ai detected context overflow for model "${model}"`;',
  '\t}',
  '',
].join('\n');

/**
 * 变换：mapStopReason overflow 分支的 opaque "no body" 文案 → 友好提示（幂等）。
 * @param {string} src
 * @param {string} file 诊断用
 * @returns {{status:'already'}|{status:'anchor-missing',detail:string}|{status:'changed',src:string}}
 */
function transformPiAiOverflowMessage(src, file) {
  if (src.includes(PATCH_MARKER)) return { status: 'already' };
  if (!src.includes(MESSAGE_ANCHOR) || !src.includes(FN_ANCHOR)) {
    return {
      status: 'anchor-missing',
      detail: '未匹配到 mapStopReason 的 overflow 分支或函数签名（版本可能已更新），跳过 ' + file,
    };
  }
  let out = src.replace(
    MESSAGE_ANCHOR,
    '\t\t\tmessage: friendlyPiAiOverflowMessage(message.errorMessage, message.model),',
  );
  out = out.replace(FN_ANCHOR, HELPER_BLOCK + FN_ANCHOR);
  return { status: 'changed', src: out };
}

/**
 * 对某个 node_modules 根目录应用 dsh-llm-pi-ai 上下文超限友好文案补丁（幂等）。
 * @param {string} nmRoot node_modules 根目录
 * @param {(msg: string) => void} [log]
 * @param {{anchorMissing?: number, failed?: number}} [stats] 可选计数器
 * @param {{dryRun?: boolean}} [options]
 * @returns {number} 实际发生修改的文件数
 */
function patchPiAiOverflowMessage(nmRoot, log = () => {}, stats, options) {
  const file = path.join(nmRoot, PKG_REL);
  if (!fs.existsSync(file)) return 0; // 该根未装 dsh-llm-pi-ai（如 profile 副本），静默跳过
  let src;
  try {
    src = fs.readFileSync(file, 'utf8');
  } catch (err) {
    log('pi-ai 超限文案补丁: 读取失败 ' + file + ': ' + err.message);
    if (stats) stats.failed += 1;
    return 0;
  }
  const result = transformPiAiOverflowMessage(src, file);
  if (result.status === 'already') {
    log('pi-ai 超限文案补丁: 已应用，跳过 ' + file);
    return 0;
  }
  if (result.status === 'anchor-missing') {
    log('pi-ai 超限文案补丁: ' + result.detail);
    if (stats) stats.anchorMissing += 1;
    return 0;
  }
  try {
    if (options && options.dryRun) {
      log('pi-ai 超限文案补丁: dry-run: 将映射 400/413 no body 为友好提示 ' + file);
    } else {
      writeFileAtomic(file, result.src);
      log('pi-ai 超限文案补丁: 已将 400/413 no body 映射为友好提示 ' + file);
      return 1;
    }
  } catch (err) {
    log('pi-ai 超限文案补丁: 写入失败 ' + file + ': ' + err.message);
    if (stats) stats.failed += 1;
  }
  return 0;
}

module.exports = { patchPiAiOverflowMessage, transformPiAiOverflowMessage, PATCH_MARKER, PKG_REL };

if (require.main === module) {
  const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..', 'node_modules');
  const n = patchPiAiOverflowMessage(root, (m) => console.log('[patch-pi-ai-overflow-message] ' + m.replace(/^pi-ai 超限文案补丁: /, '')));
  if (n > 0) console.log('[patch-pi-ai-overflow-message] 已补丁 dsh-llm-pi-ai：400/413 no body → 上下文超限友好提示');
}
