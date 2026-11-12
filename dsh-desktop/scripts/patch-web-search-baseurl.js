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
//     · HTTP 失败信息附上本提供方的协议契约指引（该提供方只支持 DeepSeek
//       Anthropic 兼容 Messages API，其它协议的搜索服务需使用对应提供方）。
//       0.1.2-alpha.2 起「实际请求地址」由上游 searchEndpointError 原生附带
//       （pristine 实证），原 ` at ${endpoint}` 改写半边按先例退役。
//  2. 设置页文案（网页搜索设置页的中英文 locale 表）：
//     「接口地址」提示改为明确说明协议契约（POST <基址>/messages），避免用户
//     误以为可以填写任意搜索服务地址。
//     0.2.0-rc.2 重靶：这块文案随设置页拆分搬家了——从
//     dsh-client-ui-settings-plugins 的 `webSearch*` 前缀键，改为独立包
//     dsh-client-ui-settings-web-search 的 `lib/client.js` 内联 locale 表
//     `description` / `baseUrlHint`（值未变）。靶包与键名同步改锚。
//     0.2.1-rc.2 再重靶：页面新增「启用新版 Web 搜索 API」开关与第二个地址字段
//     （`searchApiBaseUrlHint`，追加 /search 或 /fetch），`description` 已不能单指
//     Messages 协议（本补丁不再改它）；`baseUrlHint` 上游重写为带示例的文案，
//     锚点按新字节重录，补丁叠加「仅支持 Anthropic 兼容 Messages API / 其它协议
//     需对应提供方插件」的半句。
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
// 「失败信息附上实际请求地址」半边已退役（0.1.2-alpha.2 原生化，pristine 实证）：
// alpha.2 起所有 !response.ok 抛错统一经 searchEndpointError(endpoint, message)
// 包装，其文案原生携带 `The web search request used endpoint <JSON 化地址>…`，
// message 内再拼 ` at ${endpoint}` 会重复地址。地址语义由上游覆盖，本补丁不再改写。
const PROVIDER_OLD_THROW = 'throw searchEndpointError(endpoint, message);';
const PROVIDER_NEW_THROW_LINES = [
  '// dsh-desktop patch (issue #20): 附上协议契约指引，裸 404 也能自解',
  '//（请求地址由上游 searchEndpointError 原生附带，这里只补本提供方的协议契约）。',
  'message += " 本搜索提供方仅支持 DeepSeek 的 Anthropic 兼容 Messages API（POST <基址>/messages，x-api-key 鉴权）。请将「接口地址」填为该协议的基址（留空 = 官方默认地址）；其它协议的搜索服务（如 Exa）需要对应的提供方插件。";',
  'throw searchEndpointError(endpoint, message);',
];

// ---------------------------------------------------------------------------
// 设置页文案补丁（@deepseek-ai/dsh-client-ui-settings-web-search/lib/client.js）
// ---------------------------------------------------------------------------

// 0.2.2-rc.2 重锚：该页同样变成压缩产物（41KB / 3 行），且上游第三次重写了这两句
// 文案——不再出现 `/messages` 字面量与「含 API 前缀的地址」旧句式，改为
// `Include the API prefix. Leave blank to use the official address. The provider appends {path}.`
// / `填写含 API 前缀的地址；留空时使用官方地址；程序追加 {path}`。上游用 `{path}`
// 抽象了追加路径（不再写死 Messages），但**协议契约仍然没写出来**——用户照旧可以
// 把 Exa 之类的地址贴进来。本补丁的价值点（说清这里是 Anthropic 兼容 Messages API、
// 其它协议要各自的提供方插件）因此保留，只按新字节重录锚点。
const CLIENT_PAIRS = [
  [
    'baseUrlHint:`Include the API prefix. Leave blank to use the official address. The provider appends {path}.`',
    'baseUrlHint:`Include the API prefix of the Anthropic-compatible Messages API. Leave blank to use the official address. The provider appends {path}; search services on other protocols (e.g. Exa) need their own provider plugin.`',
  ],
  [
    'baseUrlHint:`填写含 API 前缀的地址；留空时使用官方地址；程序追加 {path}`',
    'baseUrlHint:`填写 Anthropic 兼容 Messages API 的基址（含 API 前缀）；留空时使用官方地址；程序追加 {path}。其它协议的搜索服务（如 Exa）需要对应的提供方插件。`',
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
 * @param {{anchorMissing?: number, failed?: number}} [stats] 可选可观测性计数回流：
 *   anchorMissing 累计锚点未匹配跳过的文件，failed 累计读/写失败的文件——
 *   让调用方能区分「返回 0 = 已打（正常）」与「返回 0 = 全部读写失败」。
 * @param {{dryRun?: boolean}} [options]
 * @returns {number} 实际发生修改的文件数
 */
function patchWebSearchBaseUrl(nmRoot, log = () => {}, stats, options) {
  const targets = [
    [path.join(nmRoot, '@deepseek-ai', 'dsh-web-search-deepseek', 'lib', 'index.js'), patchProvider],
    [path.join(nmRoot, '@deepseek-ai', 'dsh-client-ui-settings-web-search', 'lib', 'client.js'), patchClient],
  ];
  let changedFiles = 0;
  for (const [file, patch] of targets) {
    if (!fs.existsSync(file)) continue;
    let src;
    try {
      src = fs.readFileSync(file, 'utf8');
    } catch (err) {
      log('web-search baseURL 补丁: 读取失败 ' + file + ': ' + err.message);
      if (stats) stats.failed += 1;
      continue;
    }
    const result = patch(src);
    if (result.skipped) {
      log('web-search baseURL 补丁: 锚点未匹配（dsh 版本可能已变化），跳过 ' + file);
      if (stats) stats.anchorMissing += 1;
      continue;
    }
    if (!result.changed) {
      log('web-search baseURL 补丁: 已应用，跳过 ' + file);
      continue; // 已应用（幂等）
    }
    try {
      if (options && options.dryRun) {
        log('web-search baseURL 补丁: dry-run: 将应用 ' + file);
      } else {
        writeFileAtomic(file, result.src);
        changedFiles += 1;
        log('web-search baseURL 补丁: 已应用 ' + file);
      }
    } catch (err) {
      log('web-search baseURL 补丁: 写入失败 ' + file + ': ' + err.message);
      if (stats) stats.failed += 1;
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
