'use strict';

// pi-ai 4xx 请求落盘补丁：把失败请求的端点 + 完整 params 落到日志，
// 用于诊断「400 status code (no body)」这类无响应体错误的真实成因。
//
// 背景：tokenrhythm 网关对人工重放的内核同款请求全部 200（消息逐字重放、
// pi-ai 真实代码路径、SDK 完整请求头、850KB 体积），但内核实际运行时每次
// 都收到 400 空体——差异只能出在内核上层的模型物化/插件包装（onPayload 改写
// params 等）。本补丁在 pi-ai 的错误出口把「当时的 model + params + 响应状态」
// 原样落盘，一次复现即可定位。
//
// 落盘位置：DSH_LLM_DUMP_DIR 环境变量指定的目录（桌面壳侧设置），缺省
// <DSH_HOME>/llm-4xx-dump.log。append 模式、单条截断（messages 每条截 2000 字），
// 绝不影响正常流；写失败静默吞掉。
//
// 用法：node scripts/patch-pi-ai-4xx-dump.js [<node_modules 根目录>]
// 同时导出供 patch-registry 复用。

const fs = require('node:fs');
const path = require('node:path');
const { writeFileAtomic } = require('./lib/patch-io');

/** 目标文件（相对 node_modules 根）。 */
const TARGET_REL = path.join('@earendil-works', 'pi-ai', 'dist', 'api', 'openai-completions.js');

/** 幂等 marker。 */
const MARKER = 'dsh-desktop patch (pi-ai 4xx request dump)';

/** 锚点：stream() 的 catch 块开头（上游 12 空格缩进，文件内唯一含 errorMessage 的 catch）。 */
const ANCHOR = 'catch (error) {\n            for (const block of output.content) {';
/** 顶部 import 锚点：在首个 import 前注入 fs/path 的 ESM import（该文件是 ESM，catch 内不能用 require）。 */
const IMPORT_ANCHOR = 'import OpenAI from "openai";';
/** params 捕获锚点：buildParams 赋值行（params 是 try 块作用域，catch 里不可见，需经 globalThis 传递）。 */
const PARAMS_ANCHOR = 'let params = buildParams(model, context, options, compat, cacheRetention, grammarToolInputProperties);';
const PARAMS_INJECT = PARAMS_ANCHOR + '\n            try { globalThis.__dsh4xxLastParams = params; globalThis.__dsh4xxLastModel = model; } catch {}';

/**
 * 注入体：在 openai-completions stream() 的 catch 开头插一段 4xx 落盘。
 * 只读 error?.status / model / params（同作用域变量），不改变任何控制流。
 */
const INJECT = [
  'catch (error) {',
  '            // ' + MARKER + ': 4xx 无响应体错误落盘（诊断用，绝不影响控制流）。',
  '            try {',
  '                const _st = error && error.status;',
  '                if (typeof _st === "number" && _st >= 400 && _st < 500) {',
  '                    const _dumpDir = process.env.DSH_LLM_DUMP_DIR || process.env.DSH_HOME || __dsh4xxPath.join(__dsh4xxHome(), ".dsh");',
  '                    if (_dumpDir) {',
  '                        const _params = globalThis.__dsh4xxLastParams;',
  '                        const _model = globalThis.__dsh4xxLastModel || model;',
  '                        const _msg = Array.isArray(_params && _params.messages) ? _params.messages.map((m) => ({ role: m.role, content: typeof m.content === "string" ? m.content.slice(0, 2000) : "[parts] " + JSON.stringify(m.content).slice(0, 2000) })) : undefined;',
  '                        const _entry = { time: new Date().toISOString(), status: _st, provider: _model && _model.provider && _model.provider.name, model: _model && _model.id, baseUrl: _model && _model.baseUrl, params: _params === undefined ? undefined : { ..._params, messages: _msg }, error: String(error && error.message || error).slice(0, 500) };',
  '                        __dsh4xxFs.appendFileSync(__dsh4xxPath.join(_dumpDir, "llm-4xx-dump.log"), JSON.stringify(_entry) + "\\n");',
  '                    }',
  '                }',
  '            } catch {}',
  '            for (const block of output.content) {',
].join('\n');

/** 顶部注入的 ESM import。 */
const IMPORT_INJECT = [
  '// ' + MARKER + ': 4xx 诊断落盘用的 fs/path/os import。',
  'import * as __dsh4xxFs from "node:fs";',
  'import * as __dsh4xxPath from "node:path";',
  'import { homedir as __dsh4xxHome } from "node:os";',
  IMPORT_ANCHOR,
].join('\n');

/** v1 注入块（无 os import）——升级就地替换。 */
const IMPORT_V1 = [
  '// ' + MARKER + ': 4xx 诊断落盘用的 fs/path import.',
  'import * as __dsh4xxFs from "node:fs";',
  'import * as __dsh4xxPath from "node:path";',
  IMPORT_ANCHOR,
].join('\n');
/** v1 dumpDir 行（env 缺失即静默跳过——生产内核进程无 DSH_HOME，实测 supervisor 的 set_var 全在 #[test] 里）。 */
const DUMPDIR_V1 = 'const _dumpDir = process.env.DSH_LLM_DUMP_DIR || process.env.DSH_HOME || "";';
/** v2：兜底 homedir()/.dsh。 */
const DUMPDIR_V2 = 'const _dumpDir = process.env.DSH_LLM_DUMP_DIR || process.env.DSH_HOME || __dsh4xxPath.join(__dsh4xxHome(), ".dsh");';

/**
 * transform：幂等、锚点失配不改写。
 * @param {string} src
 * @param {string} [file]
 * @returns {{status:'already'}|{status:'anchor-missing',detail:string}|{status:'changed',src:string}}
 */
function transform4xxDump(src, file) {
  if (src.includes(MARKER)) {
    // v2 已在位则幂等；v1（env 缺失即静默跳过）就地升级：dumpDir 行 + os import。
    if (src.includes(DUMPDIR_V2)) return { status: 'already' };
    if (src.includes(DUMPDIR_V1)) {
      let out = src.replace(DUMPDIR_V1, DUMPDIR_V2);
      if (out.includes(IMPORT_V1)) out = out.replace(IMPORT_V1, IMPORT_INJECT);
      else {
        // v1 import 块行尾差异兜底：逐行插入 os import（幂等判定用 DUMPDIR_V2）
        out = out.replace('import * as __dsh4xxPath from "node:path";', 'import * as __dsh4xxPath from "node:path";\nimport { homedir as __dsh4xxHome } from "node:os";');
      }
      return { status: 'changed', src: out };
    }
    return { status: 'already' }; // marker 在但形态不可识别，保守不改写
  }
  if (!src.includes(ANCHOR) || !src.includes(IMPORT_ANCHOR) || !src.includes(PARAMS_ANCHOR)) {
    return {
      status: 'anchor-missing',
      detail: '未找到 stream() catch / import / buildParams 锚点（pi-ai 版本可能已变化），跳过 ' + (file || '<unknown>'),
    };
  }
  const out = src
    .replace(IMPORT_ANCHOR, IMPORT_INJECT)
    .replace(PARAMS_ANCHOR, PARAMS_INJECT)
    .replace(ANCHOR, INJECT);
  return { status: 'changed', src: out };
}

/**
 * 应用补丁（幂等）。
 */
function patchPiAi4xxDump(nmRoot, log = () => {}, stats) {
  const file = path.join(nmRoot, TARGET_REL);
  if (!fs.existsSync(file)) return 0;
  let src;
  try {
    src = fs.readFileSync(file, 'utf8');
  } catch (err) {
    log('pi-ai 4xx 落盘补丁: 读取失败 ' + file + ': ' + err.message);
    if (stats) stats.failed += 1;
    return 0;
  }
  const result = transform4xxDump(src, file);
  if (result.status === 'already') {
    log('pi-ai 4xx 落盘补丁: 已应用，跳过 ' + file);
    return 0;
  }
  if (result.status === 'anchor-missing') {
    log('pi-ai 4xx 落盘补丁: ' + result.detail);
    if (stats) stats.anchorMissing += 1;
    return 0;
  }
  try {
    writeFileAtomic(file, result.src);
    log('pi-ai 4xx 落盘补丁: 已注入 4xx 请求落盘 ' + file);
    return 1;
  } catch (err) {
    log('pi-ai 4xx 落盘补丁: 写入失败 ' + file + ': ' + err.message);
    if (stats) stats.failed += 1;
  }
  return 0;
}

module.exports = { patchPiAi4xxDump, transform4xxDump, MARKER, TARGET_REL };

if (require.main === module) {
  const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..', 'node_modules');
  const n = patchPiAi4xxDump(root, (m) => console.log(m));
  console.log(n > 0 ? 'patched ' + n + ' file(s)' : 'nothing to patch');
}