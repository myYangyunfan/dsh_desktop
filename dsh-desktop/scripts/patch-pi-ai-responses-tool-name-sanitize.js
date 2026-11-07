'use strict';

// pi-ai **Responses 路径**工具名净化 + 回映射补丁（OpenAI 兼容网关 pattern 校验适配）。
//
// 与 patch-pi-ai-tool-schema-sanitize.js（靶 openai-completions.js）互为姊妹补丁：
// 那条只清洗 Chat Completions 序列化的工具名，而 Responses 三条路由
// （openai-responses.js / azure-openai-responses.js / openai-codex-responses.js）
// 共用本靶文件 openai-responses-shared.js 的 convertResponsesTools() 与
// processResponsesStream() 槽位构造，**全程零清洗** → 在野 400：
//   OpenAI API error (400): {"code":"invalid_value","message":"Invalid
//   'tools[1].name': string does not match pattern. Expected a string that
//   matches the pattern '^[a-zA-Z0-9_-]+$'.","param":"tools[1].name"}
// 触发源：dsh-cardian 注册的工具名带点号（cardian.backlinks / .doctor / .export /
// .feedback / .import / .recall / .reindex / .related …）违反该 pattern，整轮失败。
//
// 修复（三件套，与 completions 补丁同名同语义，但两者属不同模块作用域、映射表各自独立）：
//   B. 出站清洗 __dshWireName(name)：非法字符→下划线，只在名字真的变化时登记
//      wire→原名映射；覆盖 6 个落点：
//        ①② convertResponsesTools 的 grammar 分支与 function 分支 name；
//        ③④ convertResponsesMessages 历史回放的 custom_tool_call / function_call
//           两处 name（回放给 API 的必须是 wire 名，否则多轮里旧消息同样触发 400）；
//   C. 入站还原 __dshRestoreToolName(name)：模型回调用 wire 名，还原成内核注册的
//      原名再分发。落点 ⑤⑥ = processResponsesStream 内 createSlot 的
//      function_call / custom_tool_call 槽位构造 name（非流式的 response.output_item.*
//      finalize 只改 arguments/namespace、复用同一槽位，故无额外落点）。
//   内部按原名取值的表达式（grammarToolInputProperties.get(...) /
//   getGrammarToolInput(toolCall.name, ...) 等）一律不动——键仍是原名。
//
// 本补丁不改 schema（属性级 required 净化仍属 completions 补丁职责），只改名。
//
// 契约：幂等（marker / 产物特征短路）；任一锚点未命中或命中数 != 1 即整份不改
// 并报 ANCHOR MISMATCH（拒绝半投）；写失败静默（绝不影响请求流）。
// 上游原生净化后经 anchor-missing 自然退役。
//
// 用法：node scripts/patch-pi-ai-responses-tool-name-sanitize.js [<node_modules 根>]

const fs = require('node:fs');
const path = require('node:path');
const { writeFileAtomic } = require('./lib/patch-io');

const TARGET_REL = path.join('@earendil-works', 'pi-ai', 'dist', 'api', 'openai-responses-shared.js');
const MARKER = 'dsh-desktop patch (pi-ai responses tool name sanitize)';

/** helper 注入锚点：Responses 工具序列化入口（文件内唯一）。 */
const HELPER_ANCHOR = 'export function convertResponsesTools(tools, options) {';

const HELPER = [
  '// ' + MARKER + ': Responses 路径工具名规范化 + 回映射（OpenAI 兼容网关',
  '// 拒 tools[i].name 不匹配 ^[a-zA-Z0-9_-]+$ 的名字，dsh-cardian 的 cardian.*',
  '// 带点号工具名在 in-the-wild 触发整轮 400；completions 姊妹补丁只打了',
  '// openai-completions.js，本文件的 convertResponsesTools/回放/槽位构造此前零清洗）。',
  '// 规则与语义同 completions 补丁，但两文件各属独立模块作用域、映射表互不相通。',
  'const __dshToolWireMap = new Map();',
  'function __dshWireName(name) {',
  '    if (typeof name !== "string") return name;',
  '    const wire = name.replace(/[^a-zA-Z0-9_-]/g, "_");',
  '    if (wire !== name) __dshToolWireMap.set(wire, name);',
  '    return wire;',
  '}',
  'function __dshRestoreToolName(name) {',
  '    if (typeof name !== "string" || __dshToolWireMap.size === 0) return name;',
  '    return __dshToolWireMap.get(name) ?? name;',
  '}',
  '',
].join('\n');

/**
 * 6 个落点（key 用于 ANCHOR MISMATCH 点名；from/to 一律按 LF 书写，
 * 应用时按靶文件实际行尾风格适配）。
 */
const SITES = [
  {
    key: '出站① convertResponsesTools grammar 分支 name',
    from: 'type: "custom",\n                name: tool.name,',
    to: 'type: "custom",\n                name: __dshWireName(tool.name),',
  },
  {
    key: '出站② convertResponsesTools function 分支 name',
    from: 'type: "function",\n            name: tool.name,',
    to: 'type: "function",\n            name: __dshWireName(tool.name),',
  },
  {
    key: '回放③ convertResponsesMessages custom_tool_call name',
    from: 'call_id: callId,\n                            name: toolCall.name,\n                            input: sanitizeSurrogates(',
    to: 'call_id: callId,\n                            name: __dshWireName(toolCall.name),\n                            input: sanitizeSurrogates(',
  },
  {
    key: '回放④ convertResponsesMessages function_call name',
    from: 'call_id: callId,\n                            name: toolCall.name,\n                            arguments: JSON.stringify(toolCall.arguments),',
    to: 'call_id: callId,\n                            name: __dshWireName(toolCall.name),\n                            arguments: JSON.stringify(toolCall.arguments),',
  },
  {
    key: '入站⑤ processResponsesStream function_call 槽位 name',
    // 0.2.2-rc.1 重靶：上游把该槽位改成流式参数累积
    // （`arguments: item.arguments ? args.append(item.arguments) : {}`），
    // 并在 block 上新增 namespace 透传；`arguments: {},` 两行锚点已不存在。
    from: 'name: item.name,\n                arguments: item.arguments ? args.append(item.arguments) : {},',
    to: 'name: __dshRestoreToolName(item.name),\n                arguments: item.arguments ? args.append(item.arguments) : {},',
  },
  {
    key: '入站⑥ processResponsesStream custom_tool_call 槽位 name',
    from: 'name: item.name,\n                arguments: { [inputProperty]: input },',
    to: 'name: __dshRestoreToolName(item.name),\n                arguments: { [inputProperty]: input },',
  },
];

const occurrences = (haystack, needle) => (needle ? haystack.split(needle).length - 1 : 0);

/**
 * transform：全新应用 / 幂等 / 锚点失配（拒绝半投）。
 * @param {string} src 靶文件当前文本
 * @param {string} [file] 靶文件路径（仅用于 detail 点名）
 */
function transformResponsesToolNameSanitize(src, file) {
  if (src.includes(MARKER) || src.includes('__dshWireName')) return { status: 'already' };
  const style = src.includes('\r\n') ? '\r\n' : '\n';
  const adapt = (text) => (style === '\n' ? text : text.split('\n').join('\r\n'));
  const targets = [{ key: 'helper 注入锚点 convertResponsesTools 定义行', text: HELPER_ANCHOR }]
    .concat(SITES.map((s) => ({ key: s.key, text: s.from })));
  const bad = targets
    .map((t) => ({ key: t.key, n: occurrences(src, adapt(t.text)) }))
    .filter((t) => t.n !== 1);
  if (bad.length > 0) {
    return {
      status: 'anchor-missing',
      detail: 'ANCHOR MISMATCH（pi-ai responses tool name sanitize，整份不改）: 锚点命中数非 1 → '
        + bad.map((b) => `${b.key}(命中 ${b.n} 次)`).join('; ')
        + '（pi-ai 版本可能已变化），跳过 ' + (file || '<unknown>'),
    };
  }
  let out = src.replace(adapt(HELPER_ANCHOR), () => adapt(HELPER) + adapt(HELPER_ANCHOR));
  for (const site of SITES) {
    out = out.replace(adapt(site.from), () => adapt(site.to));
  }
  return { status: 'changed', src: out };
}

/** 应用补丁（幂等；靶文件缺席返回 0 不报错）。 */
function patchPiAiResponsesToolNameSanitize(nmRoot, log = () => {}, stats) {
  const file = path.join(nmRoot, TARGET_REL);
  if (!fs.existsSync(file)) return 0;
  let src;
  try {
    src = fs.readFileSync(file, 'utf8');
  } catch (err) {
    log('pi-ai Responses 工具名净化补丁: 读取失败 ' + file + ': ' + err.message);
    if (stats) stats.failed += 1;
    return 0;
  }
  const result = transformResponsesToolNameSanitize(src, file);
  if (result.status === 'already') {
    log('pi-ai Responses 工具名净化补丁: 已应用，跳过 ' + file);
    return 0;
  }
  if (result.status === 'anchor-missing') {
    log('pi-ai Responses 工具名净化补丁: ' + result.detail);
    if (stats) stats.anchorMissing += 1;
    return 0;
  }
  try {
    writeFileAtomic(file, result.src);
    log('pi-ai Responses 工具名净化补丁: 已注入 6 落点名字规范化/回映射 ' + file);
    return 1;
  } catch (err) {
    log('pi-ai Responses 工具名净化补丁: 写入失败 ' + file + ': ' + err.message);
    if (stats) stats.failed += 1;
  }
  return 0;
}

module.exports = {
  patchPiAiResponsesToolNameSanitize,
  transformResponsesToolNameSanitize,
  MARKER,
  TARGET_REL,
  HELPER_ANCHOR,
  SITES,
};

if (require.main === module) {
  const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..', 'node_modules');
  const n = patchPiAiResponsesToolNameSanitize(root, (m) => console.log(m));
  console.log(n > 0 ? 'patched ' + n + ' file(s)' : 'nothing to patch');
}
