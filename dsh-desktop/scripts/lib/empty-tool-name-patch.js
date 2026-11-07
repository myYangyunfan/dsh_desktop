'use strict';

// empty-tool-name-patch.js —— 工具调用 name 为空时的可操作指引补丁。
//
// 现象（用户实机反馈）：模型 Think 想调 str_replace_editor，但生成的
// tool-call 里 name 字段为空 ""，后端执行器报 `Error: unknown tool ""`
// 后死循环重试 + repeat-tool-reminder 反复注入，用户只看得到一句无意义的
// 英文死谜语，既不知道是配置问题、也不知道该改哪里。
//
// 根因归属（上游，非本仓库代码引入）：
//   · 报错源在 @deepseek-ai/dsh-tools/lib/index.js 的 ToolNotFoundError
//     构造器——`unknown tool "${toolName}"`（code UNKNOWN_TOOL），对空 name
//     不做任何特判，直接把空串嵌进文案。
//   · 空 name 由上游 pi-ai 三协议适配器逐字透传：openai-completions.js:250
//     解析 `toolCall.function?.name ?? toolCall.custom?.name ?? ""`、
//     openai-responses-shared.js:348 解析 `item.name`、anthropic-messages.js:433
//     解析 `event.content_block.name`——三者对「缺 name / 空 name」一律回落/
//     透传成空串，无防御。dsh-llm-pi-ai 的 toStreamChunks（toolcall_end）又
//     `name: event.toolCall.name` 原样透传到 harness。
//   · 空 name 的三种来源：① 适配器协议不匹配（Chat Completions 的
//     function.name vs Responses 的 output[].name vs Anthropic 的 content_block.name
//     字段错位，配错 api 就解析成空）；② 中转网关（tokenrhythm 等）剥离/损坏
//     tool_call/name 字段；③ 长上下文/高温下模型输出 JSON 崩坏。
//   · 本仓库 pi-ai-credits / pi-ai-reasoning-defaults 补丁均未触碰工具调用
//     解析面（前者改 classifyPiAiError、后者改 resolveModelReasoning），
//     已核实与本现象无关。
//
// 修复（防御，不改上游内核）：在 ToolNotFoundError 构造器对「空/缺失 name」
// 这一个明确异常形态特判，把 `unknown tool ""` 替换为带指引的错误（协议核对
// + 网关排除 + 模型输出崩坏三向指引）。非空 name 的原语义逐字不变（`unknown
// tool "${name}"` 与带 reachableFrom 的两分支与上游输出完全一致）。
//
// 幂等、锚点失配自动退役；与 tool-source-patch.js（持久化层空 id/name 合成）
// 互补——那边保证空 name 不再写坏会话，这边保证空 name 报错可诊断。

const path = require('node:path');
const fs = require('node:fs');
const { applyPatchToFiles } = require('./patch-engine');

/** 目标文件（相对 @deepseek-ai 前缀；dsh-tools 为内核包，走 nm-roots 布局）。 */
const TOOLS_REL = path.join('dsh-tools', 'lib', 'index.js');

/**
 * 解析实际承载 ToolNotFoundError 的文件。
 * 0.2.2-rc.1 起 dsh-tools 由单文件 bundle 拆成 `lib/index.js` + 带内容哈希的
 * 共享 chunk（`lib/shared-<hash>.js`，报错类都搬进 chunk，index.js 只 re-export），
 * 所以锚点不再固定在 index.js。策略：index.js 命中就直接用它；否则扫同目录
 * `lib/*.js`，取含锚点（或已含 marker）的那一个。哈希文件名逐版变化，故不写死。
 * @returns {string[]} 待处理文件绝对路径（无命中时返回 index.js 以保留 anchor-missing 告警）
 */
function resolveTargetFiles(nmRoot) {
  const libDir = path.join(nmRoot, '@deepseek-ai', 'dsh-tools', 'lib');
  const primary = path.join(nmRoot, '@deepseek-ai', TOOLS_REL);
  if (!fs.existsSync(primary)) return [];
  let siblings = [];
  try {
    siblings = fs.readdirSync(libDir).filter((n) => n.endsWith('.js'));
  } catch {
    return [primary];
  }
  const hits = siblings
    .map((n) => path.join(libDir, n))
    .filter((f) => {
      let src;
      try { src = fs.readFileSync(f, 'utf8'); } catch { return false; }
      return src.includes(EMPTY_TOOL_NAME_ANCHOR) || src.includes(EMPTY_TOOL_NAME_MARKER);
    });
  return hits.length > 0 ? hits : [primary];
}

const EMPTY_TOOL_NAME_MARKER = 'dsh-desktop-patch: empty-tool-name-guidance';

// 锚点 = ToolNotFoundError 构造器内唯一一处 super(...) 行（2-tab 缩进，
// `super(reachableFrom === void 0 ? ...)` 全文件仅此一次，已用 node 逐字节核对）。
const EMPTY_TOOL_NAME_ANCHOR = '\t\tsuper(reachableFrom === void 0 ? `unknown tool "${toolName}"` : `unknown tool "${toolName}": ${reachableFrom}`, "UNKNOWN_TOOL");';

// 替换体：只对空/缺失 name 特判 + 三向指引；非空 name 两个分支与上游逐字一致。
const EMPTY_TOOL_NAME_REPLACEMENT = [
  '\t\t/* ' + EMPTY_TOOL_NAME_MARKER + ' — a model, a relay gateway, or a wire-protocol',
  '\t\t * mismatch can deliver a tool call whose name is "" (see tool-source-patch for the',
  '\t\t * persistence side). The bare `unknown tool ""` told the user nothing and the loop',
  '\t\t * retried forever. Special-case only the empty name with actionable guidance. */',
  '\t\tlet message;',
  '\t\tif (typeof toolName !== "string" || toolName.trim().length === 0) {',
  '\t\t\tmessage = "unknown tool: the model emitted a tool call with an empty name ——【工具调用 name 为空】可能原因：① 适配器协议不匹配（在「设置 → 模型」确认该供应商实际使用 Chat Completions / Responses / Anthropic Messages 协议，与所选 api 一致）；② 中转网关（如 tokenrhythm）剥离或损坏了 tool_call/name 字段；③ 长上下文下模型输出 JSON 崩坏。请先核对协议、绕过中转网关直连重试。";',
  '\t\t} else if (reachableFrom === void 0) {',
  '\t\t\tmessage = `unknown tool "${toolName}"`;',
  '\t\t} else {',
  '\t\t\tmessage = `unknown tool "${toolName}": ${reachableFrom}`;',
  '\t\t}',
  '\t\tsuper(message, "UNKNOWN_TOOL");',
].join('\n');

function transformEmptyToolName(src, file) {
  if (src.includes(EMPTY_TOOL_NAME_MARKER)) return { status: 'already' };
  if (!src.includes(EMPTY_TOOL_NAME_ANCHOR)) {
    return { status: 'anchor-missing', detail: '未找到 dsh-tools ToolNotFoundError 构造器 super 锚点（版本可能已变更），跳过 ' + file };
  }
  return { status: 'changed', src: src.replace(EMPTY_TOOL_NAME_ANCHOR, EMPTY_TOOL_NAME_REPLACEMENT) };
}

/**
 * 对某个 node_modules 根目录应用「空工具名指引」补丁（幂等）。
 * @param {string} nmRoot node_modules 根目录
 * @param {(msg: string) => void} [log]
 * @param {{anchorMissing?: number, failed?: number}} [stats]
 * @param {{donePrefix?: boolean, anchorLog?: Function, dryRun?: boolean}} [options]
 * @returns {number} 实际发生修改的文件数
 */
function patchEmptyToolName(nmRoot, log = () => {}, stats, options = {}) {
  const donePrefix = options && options.donePrefix;
  const anchorLog = (options && options.anchorLog) || log;
  const dryRun = options && options.dryRun;
  const files = resolveTargetFiles(nmRoot);
  if (files.length === 0) return 0; // 该根未装 dsh-tools，静默跳过
  return applyPatchToFiles({
    prefix: '空工具名指引补丁',
    files,
    log,
    transform: transformEmptyToolName,
    alreadyLog: (f) => '已应用，跳过 ' + f,
    doneLog: (f) => '已应用空工具名指引 ' + f,
    anchorLog,
    failLog: (f, err) => '空工具名指引补丁失败(' + f + '): ' + err.message,
    donePrefix,
    dryRun,
    dryRunChangedLog: (f) => 'dry-run: 将应用空工具名指引 ' + f,
    stats,
  });
}

module.exports = {
  TOOLS_REL,
  EMPTY_TOOL_NAME_MARKER,
  EMPTY_TOOL_NAME_ANCHOR,
  EMPTY_TOOL_NAME_REPLACEMENT,
  resolveTargetFiles,
  transformEmptyToolName,
  patchEmptyToolName,
};
