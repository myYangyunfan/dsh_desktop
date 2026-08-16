'use strict';

// 修复 issue #20：dsh-web-search-deepseek 的「接口地址」契约与拼接缺陷。
//
// 现象：用户在 Web 搜索设置「接口地址」填写第三方服务（如 https://api.exa.ai/search）
// 后，provider 仍无条件把 /messages 拼到基址后，并按 DeepSeek 的 Anthropic 兼容
// Messages 协议（x-api-key / anthropic-version / web_search_20250305）发请求 →
// 404；错误信息只有服务端原文，用户无从判断原因。
//
// 修复内容（幂等、anchor 不匹配时跳过且绝不损坏文件）：
//  1. provider（lib/index.js）：
//     · 基址归一化后再拼 /messages：尾斜杠不产生双斜杠；基址已以 /messages
//       结尾时不再重复拼接（允许用户直接填完整端点）；
//     · HTTP 失败信息附上实际请求地址与本提供方的协议契约，把裸 404 变成
//       可自解的指引（该提供方只支持 DeepSeek Anthropic 兼容 Messages API，
//       其它协议的搜索服务需使用对应提供方）。
//  2. 设置页文案（dsh-client-ui-settings-plugins/lib/client.js，中英文）：
//     「接口地址」提示改为明确说明协议契约（POST <基址>/messages），避免用户
//     误以为可以填写任意搜索服务地址。
//
// 用法：
//   node scripts/patch-web-search-baseurl.js [<node_modules 根目录>]
// 同时导出 patchWebSearchBaseUrl(nmRoot, log) 供 main.js 运行时补丁与
// after-pack.js 打包补丁复用（覆盖内置副本 / profile fallback / agent overlay）。

const fs = require('node:fs');
const path = require('node:path');
// 原子写与 main.js / 其它补丁脚本共用同一实现（scripts/lib/patch-io.js）。
const { writeFileAtomic } = require('./lib/patch-io');

const MARKER = 'dsh-desktop patch (issue #20)';

// ---------------------------------------------------------------------------
// provider 补丁（@deepseek-ai/dsh-web-search-deepseek/lib/index.js）
// ---------------------------------------------------------------------------

const PROVIDER_OLD_ENDPOINT = 'const endpoint = `${options.baseURL}/messages`;';
const PROVIDER_NEW_ENDPOINT_LINES = [
  '// dsh-desktop patch (issue #20): 归一化基址后再拼 /messages ——',
  '// 尾斜杠不产生双斜杠；基址已含 /messages 时不再重复拼接。',
  'const normalizedBase = options.baseURL.replace(/\\/+$/, "");',
  'const endpoint = /\\/messages\\/?$/.test(normalizedBase) ? normalizedBase : `${normalizedBase}/messages`;',
];
const PROVIDER_OLD_MESSAGE = 'let message = `DeepSeek API error (HTTP ${response.status})`;';
const PROVIDER_NEW_MESSAGE = 'let message = `DeepSeek API error (HTTP ${response.status}) at ${endpoint}`;';
const PROVIDER_OLD_THROW = 'throw new WebError(message, "WEB_PROVIDER_ERROR");';
const PROVIDER_NEW_THROW_LINES = [
  '// dsh-desktop patch (issue #20): 附上请求地址与协议契约，裸 404 也能自解。',
  'const guidance = " 本搜索提供方仅支持 DeepSeek 的 Anthropic 兼容 Messages API（POST <基址>/messages，x-api-key 鉴权）。请将「接口地址」填为该协议的基址（留空 = 官方默认地址）；其它协议的搜索服务（如 Exa）需要对应的提供方插件。";',
  'throw new WebError(message + guidance, "WEB_PROVIDER_ERROR");',
];

// ---------------------------------------------------------------------------
// 设置页文案补丁（@deepseek-ai/dsh-client-ui-settings-plugins/lib/client.js）
// ---------------------------------------------------------------------------

const CLIENT_PAIRS = [
  [
    'webSearchDescription: "The DeepSeek search provider.",',
    'webSearchDescription: "DeepSeek search provider (Anthropic-compatible Messages API).",',
  ],
  [
    'webSearchBaseUrlHint: "Leave blank to use the provider default.",',
    'webSearchBaseUrlHint: "This provider calls the Anthropic-compatible Messages API (POST <base>/messages). Enter that API\'s base URL; leave blank for the DeepSeek official default.",',
  ],
  [
    'webSearchDescription: "DeepSeek 搜索提供方。",',
    'webSearchDescription: "DeepSeek 搜索提供方（Anthropic 兼容 Messages API）。",',
  ],
  [
    'webSearchBaseUrlHint: "留空则使用提供方默认地址。",',
    'webSearchBaseUrlHint: "该提供方通过 Anthropic 兼容 Messages API 请求（POST <基址>/messages）。请填该协议的基址；留空则使用 DeepSeek 官方默认地址。",',
  ],
];

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

/** 用「原行缩进」把多行替换体拼好，保持文件风格一致。 */
function indentedBlock(src, anchor, lines) {
  const idx = src.indexOf(anchor);
  if (idx === -1) return null;
  const lineStart = src.lastIndexOf('\n', idx) + 1;
  const indent = /^[ \t]*/.exec(src.slice(lineStart))[0];
  return lines.join('\n' + indent);
}

function patchProvider(src) {
  if (src.includes(MARKER)) return { changed: false, skipped: false, src };
  const replacements = [
    [PROVIDER_OLD_ENDPOINT, indentedBlock(src, PROVIDER_OLD_ENDPOINT, PROVIDER_NEW_ENDPOINT_LINES)],
    [PROVIDER_OLD_MESSAGE, indentedBlock(src, PROVIDER_OLD_MESSAGE, [PROVIDER_NEW_MESSAGE])],
    [PROVIDER_OLD_THROW, indentedBlock(src, PROVIDER_OLD_THROW, PROVIDER_NEW_THROW_LINES)],
  ];
  let out = src;
  for (const [oldText, newBlock] of replacements) {
    if (newBlock === null) {
      // 任一 anchor 不匹配：跳过整份文件，绝不写出半成品（dsh 版本可能已变化）。
      return { changed: false, skipped: true, src };
    }
    out = out.replace(oldText, newBlock);
  }
  return { changed: true, skipped: false, src: out };
}

function patchClient(src) {
  if (src.includes(MARKER)) return { changed: false, skipped: false, src };
  let out = src;
  let changed = 0;
  for (const [oldText, newText] of CLIENT_PAIRS) {
    if (out.includes(newText)) continue; // 该项已应用
    if (!out.includes(oldText)) return { changed: false, skipped: true, src }; // anchor 缺失，整份跳过
    out = out.replace(oldText, newText);
    changed += 1;
  }
  // 写入 MARKER 注释标记已打补丁（幂等判断用）。
  out = '// ' + MARKER + ': web-search baseURL 契约文案已修正\n' + out;
  return { changed: changed > 0, skipped: false, src: out };
}

/**
 * 对某个 node_modules 根目录应用 issue #20 补丁（幂等）。
 * @param {string} nmRoot node_modules 根目录
 * @param {(msg: string) => void} [log]
 * @returns {number} 实际发生修改的文件数
 */
function patchWebSearchBaseUrl(nmRoot, log = () => {}) {
  const targets = [
    path.join(nmRoot, '@deepseek-ai', 'dsh-web-search-deepseek', 'lib', 'index.js'),
    path.join(nmRoot, '@deepseek-ai', 'dsh-client-ui-settings-plugins', 'lib', 'client.js'),
  ];
  let changedFiles = 0;
  for (const file of targets) {
    if (!fs.existsSync(file)) continue;
    let src;
    try {
      src = fs.readFileSync(file, 'utf8');
    } catch (err) {
      log('web-search baseURL 补丁: 读取失败 ' + file + ': ' + err.message);
      continue;
    }
    const patch = file.includes('dsh-web-search-deepseek') ? patchProvider : patchClient;
    const result = patch(src);
    if (result.skipped) {
      log('web-search baseURL 补丁: 锚点未匹配（dsh 版本可能已变化），跳过 ' + file);
      continue;
    }
    if (!result.changed) {
      log('web-search baseURL 补丁: 已应用，跳过 ' + file);
      continue; // 已应用（幂等）
    }
    try {
      writeFileAtomic(file, result.src);
      changedFiles += 1;
      log('web-search baseURL 补丁: 已应用 ' + file);
    } catch (err) {
      log('web-search baseURL 补丁: 写入失败 ' + file + ': ' + err.message);
    }
  }
  return changedFiles;
}

module.exports = { patchWebSearchBaseUrl, MARKER };

if (require.main === module) {
  const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..', 'node_modules');
  const n = patchWebSearchBaseUrl(root, (m) => console.log(m));
  console.log(n > 0 ? `patched ${n} file(s) — restart DSH Desktop to pick it up` : 'nothing to patch (already up to date)');
}
