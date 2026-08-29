'use strict';

// dsh-llm-deepseek 工具 schema+函数名净化补丁（deepseek-official 路由）。
//
// 与 patch-pi-ai-tool-schema-sanitize 同根因的姊妹补丁：官方 DeepSeek API
// （provider deepseek-official，走 @deepseek-ai/dsh-llm-deepseek 适配器，
// 不经过 pi-ai）同样严格校验工具定义——函数名必须匹配 ^[a-zA-Z0-9_-]+$、
// schema 属性级布尔 required 非法。实测 400 INVALID_REQUEST
// "Invalid 'tools[N].function.name': string does not match pattern"。
// 该适配器自带独立工具序列化（requestWithMessages 内联 map），必须单独净化。
//
// 三件套与 pi-ai 补丁同构：出口名字规范化 + schema 净化 + 回call解析回映射。
//
// 用法：node scripts/patch-ds-tool-schema-sanitize.js [<node_modules 根>]

const fs = require('node:fs');
const path = require('node:path');
const { writeFileAtomic } = require('./lib/patch-io');

const TARGET_REL = path.join('@deepseek-ai', 'dsh-llm-deepseek', 'lib', 'index.js');
const MARKER = 'dsh-desktop patch (ds tool schema sanitize)';

const FN_ANCHOR = 'function requestWithMessages(options, messages, defaults) {';
const NAME_ANCHOR = '\t\t\tname: tool.name,';
const PARAMS_ANCHOR = '\t\t\tparameters: tool.parameters';
const PARSE_ANCHOR = 'if (call.function?.name !== void 0) block.name = call.function.name;';

const HELPER = [
  '// ' + MARKER + ': 官方 DeepSeek API 同样校验函数名 ^[a-zA-Z0-9_-]+$ 与',
  '// schema 属性级布尔 required（实测 400 INVALID_REQUEST pattern）。出口规范化',
  '// + 净化，回call解析回映射还原原名。与 pi-ai 侧补丁同构。',
  'const __dshDsToolWireMap = new Map();',
  'function __dshDsWireName(name) {',
  '    if (typeof name !== "string") return name;',
  '    const wire = name.replace(/[^a-zA-Z0-9_-]/g, "_");',
  '    if (wire !== name) __dshDsToolWireMap.set(wire, name);',
  '    return wire;',
  '}',
  'function __dshDsRestoreToolName(name) {',
  '    if (typeof name !== "string" || __dshDsToolWireMap.size === 0) return name;',
  '    return __dshDsToolWireMap.get(name) ?? name;',
  '}',
  'function __dshDsSanitizeToolSchema(value) {',
  '    const walk = (node) => {',
  '        if (Array.isArray(node)) return node.map(walk);',
  '        if (node && typeof node === "object") {',
  '            const out = {};',
  '            for (const key of Object.keys(node)) out[key] = walk(node[key]);',
  '            if (out.required === true) out.required = out.properties && typeof out.properties === "object" ? Object.keys(out.properties) : undefined;',
  '            if (out.required === false || out.required === undefined) delete out.required;',
  '            if (Array.isArray(out.required) && out.required.length === 0) delete out.required;',
  '            if (out.properties && typeof out.properties === "object") {',
  '                for (const pk of Object.keys(out.properties)) {',
  '                    const p = out.properties[pk];',
  '                    if (p && typeof p === "object" && typeof p.required === "boolean") {',
  '                        const np = {};',
  '                        for (const k of Object.keys(p)) if (k !== "required") np[k] = p[k];',
  '                        out.properties[pk] = np;',
  '                    }',
  '                }',
  '            }',
  '            return out;',
  '        }',
  '        return node;',
  '    };',
  '    try { return walk(value); } catch { return value; }',
  '}',
  ''].join('\n');

function transformDsToolSchemaSanitize(src, file) {
  if (src.includes(MARKER)) return { status: 'already' };
  if (!src.includes(FN_ANCHOR) || !src.includes(NAME_ANCHOR) || !src.includes(PARAMS_ANCHOR) || !src.includes(PARSE_ANCHOR)) {
    return {
      status: 'anchor-missing',
      detail: '未找全 requestWithMessages/name/parameters/parse 锚点（版本可能已变化），跳过 ' + (file || '<unknown>'),
    };
  }
  const out = src
    .replace(FN_ANCHOR, HELPER + FN_ANCHOR)
    .replace(NAME_ANCHOR, '\t\t\t\tname: __dshDsWireName(tool.name),')
    .replace(PARAMS_ANCHOR, '\t\t\t\tparameters: __dshDsSanitizeToolSchema(tool.parameters)')
    .replace(PARSE_ANCHOR, 'if (call.function?.name !== void 0) block.name = __dshDsRestoreToolName(call.function.name);');
  return { status: 'changed', src: out };
}

function patchDsToolSchemaSanitize(nmRoot, log = () => {}, stats) {
  const file = path.join(nmRoot, TARGET_REL);
  if (!fs.existsSync(file)) return 0;
  let src;
  try {
    src = fs.readFileSync(file, 'utf8');
  } catch (err) {
    log('ds 工具净化补丁: 读取失败 ' + file + ': ' + err.message);
    if (stats) stats.failed += 1;
    return 0;
  }
  const result = transformDsToolSchemaSanitize(src, file);
  if (result.status === 'already') {
    log('ds 工具净化补丁: 已应用，跳过 ' + file);
    return 0;
  }
  if (result.status === 'anchor-missing') {
    log('ds 工具净化补丁: ' + result.detail);
    if (stats) stats.anchorMissing += 1;
    return 0;
  }
  try {
    writeFileAtomic(file, result.src);
    log('ds 工具净化补丁: 已注入 schema 净化 + 名字规范化/回映射 ' + file);
    return 1;
  } catch (err) {
    log('ds 工具净化补丁: 写入失败 ' + file + ': ' + err.message);
    if (stats) stats.failed += 1;
  }
  return 0;
}

module.exports = { patchDsToolSchemaSanitize, transformDsToolSchemaSanitize, MARKER, TARGET_REL };

if (require.main === module) {
  const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..', 'node_modules');
  const n = patchDsToolSchemaSanitize(root, (m) => console.log(m));
  console.log(n > 0 ? 'patched ' + n + ' file(s)' : 'nothing to patch');
}