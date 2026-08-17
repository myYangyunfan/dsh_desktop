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
// 由 postinstall / start / pack / dist 在打包前应用；匹配失败只告警不中断。
const fs = require('node:fs');
const path = require('node:path');
const { writeFileAtomic } = require('./lib/patch-io');

const root = path.resolve(__dirname, '..');
const target = path.join(root, 'node_modules', '@deepseek-ai', 'dsh-llm-pi-ai', 'lib', 'index.js');

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

function main() {
  if (!fs.existsSync(target)) {
    console.log('[patch-pi-ai-credits] dsh-llm-pi-ai 不存在，跳过');
    return;
  }
  let src = fs.readFileSync(target, 'utf8');
  if (src.includes(PATCH_MARKER)) {
    console.log('[patch-pi-ai-credits] 余额判定前置补丁已应用，跳过');
    return;
  }
  if (!OLD_RE.test(src)) {
    console.log('[patch-pi-ai-credits] 未匹配到目标代码（版本可能已更新），跳过');
    return;
  }
  src = src.replace(OLD_RE, NEW_BLOCK);
  writeFileAtomic(target, src);
  console.log('[patch-pi-ai-credits] 已补丁 dsh-llm-pi-ai：余额判定前置到 401-AUTH 之前');
}

main();
