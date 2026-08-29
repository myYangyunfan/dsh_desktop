'use strict';

// pi-ai 工具 schema + 函数名净化补丁（DeepSeek/LiteLLM strict 校验适配）。
//
// 两个实测根因（2026-08-29，tokenrhythm.studio / LiteLLM 系网关，对照实验各×2 一致）：
//   ① schema 属性级 `"required": true`（JSON Schema 非法位置，schemastery/Zod 风格
//     产物，26/88 个 cardian 工具携带）→ 400 MODEL_TOOL_NOT_SUPPORTED。
//   ② 函数名含 `.` 等非法字符（OpenAI 规范仅 [a-zA-Z0-9_-]；`a.b`→400 / `ab`→200）
//     → 400 MODEL_TOOL_NOT_SUPPORTED。glm/qwen/kimi 路由不校验故全过，DeepSeek
//     路由严格校验，流式下 SDK 报 "no body"（此前被误译「上下文超限」）。
//
// 修复（纯壳层，三件套）：
//   A. convertTools 出口：schema 递归剥属性级 required:true（对象级数组保留，语义不变）。
//   B. convertTools 出口：函数名规范化（非法字符→下划线），wire 上只出现合法名。
//   C. 解析侧两处 name 提取点回映射：模型回调用 wire 名，还原成内核注册的原名分发。
//      映射 = sanitize 的纯函数逆查（模块级 Map，每次 convertTools 重建；并发请求
//      同名工具产生相同条目，无竞态）。custom grammar 分支不动（非本路由）。
//
// 幂等 marker + 锚点失配不改写 + 写失败静默（绝不影响请求流）。
// 上游原生净化后经 anchor-missing 自然退役。
//
// 用法：node scripts/patch-pi-ai-tool-schema-sanitize.js [<node_modules 根>]

const fs = require('node:fs');
const path = require('node:path');
const { writeFileAtomic } = require('./lib/patch-io');

const TARGET_REL = path.join('@earendil-works', 'pi-ai', 'dist', 'api', 'openai-completions.js');
const MARKER = 'dsh-desktop patch (pi-ai tool schema sanitize)';

// ---- 锚点（convertTools 函数分支 + 解析侧两处 name 提取 + 函数定义行）----
const FN_ANCHOR = 'function convertTools(tools, compat) {';
const NAME_ANCHOR = 'function: {\n                name: tool.name,';
const PARAMS_ANCHOR = 'parameters: getJsonSchemaToolParameters(tool, strict),';
const EXTRACT1 = 'const name = toolCall.function?.name ?? toolCall.custom?.name ?? "";';
const EXTRACT2 = 'const name = toolCall.function?.name ?? toolCall.custom?.name;';

const HELPER = [
  '// ' + MARKER + ': 工具 schema 属性级 required:true 剥离 + 函数名规范化（DeepSeek/LiteLLM',
  '// strict 校验拒绝非法 schema 位置与非法名字符，glm/qwen/kimi 不校验；实测 400',
  '// MODEL_TOOL_NOT_SUPPORTED，流式下 SDK 报 no body）。回映射还原原名供内核分发。',
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
  'function __dshSanitizeToolSchema(value) {',
  '    const walk = (node) => {',
  '        if (Array.isArray(node)) { node.forEach(walk); return node; }',
  '        if (node && typeof node === "object") {',
  '            if (node.properties && typeof node.properties === "object") {',
  '                for (const key of Object.keys(node.properties)) {',
  '                    const prop = node.properties[key];',
  '                    if (prop && typeof prop === "object" && typeof prop.required === "boolean") {',
  '                        delete prop.required;',
  '                    }',
  '                }',
  '            }',
  '            for (const key of Object.keys(node)) {',
  '                if (node[key] && typeof node[key] === "object") walk(node[key]);',
  '            }',
  '        }',
  '        return node;',
  '    };',
  '    try { return walk(value); } catch { return value; }',
  '}',
  ''].join('\n');

/** v1 注入（仅 schema 净化，无名字处理）——升级路径剥离用。 */
const V1_HELPER_MARK = '// ' + MARKER + ': 剥离 properties.<p>.required===true';
const V1_PARAMS_REPLACED = 'parameters: __dshSanitizeToolSchema(getJsonSchemaToolParameters(tool, strict)),';
const V1_PARAMS_ORIG = PARAMS_ANCHOR;

/** transform：v1 就地升级 / 全新应用 / 幂等。 */
function transformToolSchemaSanitize(src, file) {
  if (src.includes('__dshWireName')) return { status: 'already' };
  let base = src;
  // v1 升级：剥 v1 helper 块 + 参数行还原
  if (src.includes(V1_HELPER_MARK)) {
    const lines = src.split('\n');
    let start = lines.findIndex((l) => l.includes(V1_HELPER_MARK));
    // v1 helper 到 convertTools 定义行之前
    let end = start;
    while (end < lines.length && !lines[end].includes('function convertTools(')) end += 1;
    lines.splice(start, end - start - 0);
    // 移除插入块尾（helper 与 fn 定义间的拼接），保留 fn 定义行本身
    base = lines.join('\n').replace(V1_PARAMS_REPLACED, V1_PARAMS_ORIG);
    base = base.replace(HELPER.split('\n')[0] + '\n', '');
  }
  if (!base.includes(FN_ANCHOR) || !base.includes(NAME_ANCHOR) || !base.includes(PARAMS_ANCHOR)
    || !base.includes(EXTRACT1) || !base.includes(EXTRACT2)) {
    return {
      status: 'anchor-missing',
      detail: '未找全 convertTools/参数/name 提取锚点（pi-ai 版本可能已变化），跳过 ' + (file || '<unknown>'),
    };
  }
  const out = base
    .replace(FN_ANCHOR, HELPER + FN_ANCHOR)
    .replace(NAME_ANCHOR, 'function: {\n                name: __dshWireName(tool.name),')
    .replace(PARAMS_ANCHOR, 'parameters: __dshSanitizeToolSchema(getJsonSchemaToolParameters(tool, strict)),')
    .replace(EXTRACT1, 'const name = __dshRestoreToolName(toolCall.function?.name ?? toolCall.custom?.name ?? "");')
    .replace(EXTRACT2, 'const name = __dshRestoreToolName(toolCall.function?.name ?? toolCall.custom?.name);');
  return { status: 'changed', src: out };
}

/** 应用补丁（幂等）。 */
function patchPiAiToolSchemaSanitize(nmRoot, log = () => {}, stats) {
  const file = path.join(nmRoot, TARGET_REL);
  if (!fs.existsSync(file)) return 0;
  let src;
  try {
    src = fs.readFileSync(file, 'utf8');
  } catch (err) {
    log('pi-ai 工具净化补丁: 读取失败 ' + file + ': ' + err.message);
    if (stats) stats.failed += 1;
    return 0;
  }
  const result = transformToolSchemaSanitize(src, file);
  if (result.status === 'already') {
    log('pi-ai 工具净化补丁: 已应用，跳过 ' + file);
    return 0;
  }
  if (result.status === 'anchor-missing') {
    log('pi-ai 工具净化补丁: ' + result.detail);
    if (stats) stats.anchorMissing += 1;
    return 0;
  }
  try {
    writeFileAtomic(file, result.src);
    log('pi-ai 工具净化补丁: 已注入 schema 净化 + 名字规范化/回映射 ' + file);
    return 1;
  } catch (err) {
    log('pi-ai 工具净化补丁: 写入失败 ' + file + ': ' + err.message);
    if (stats) stats.failed += 1;
  }
  return 0;
}

module.exports = { patchPiAiToolSchemaSanitize, transformToolSchemaSanitize, MARKER, TARGET_REL };

if (require.main === module) {
  const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..', 'node_modules');
  const n = patchPiAiToolSchemaSanitize(root, (m) => console.log(m));
  console.log(n > 0 ? 'patched ' + n + ' file(s)' : 'nothing to patch');
}