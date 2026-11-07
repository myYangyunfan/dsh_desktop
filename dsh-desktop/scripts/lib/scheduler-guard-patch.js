'use strict';

// scheduler-guard-patch.js —— 工具调度器缺席防崩补丁
//（v0.5.3 用户实测：Cannot read properties of undefined (reading 'prepare')，
// dsh-agent-loop/lib/index.js:193 的 ctx.tools[TOOL_RUNTIME_SCHEDULER].prepare，
// issue #147 同款；工具执行中断/重试后报出）。
//
// 根因（源码定论）：
//   · V8 报错形态实证：报 'prepare' 说明 ctx.tools 是对象、但
//     [TOOL_RUNTIME_SCHEDULER] 取值为 undefined（若 ctx.tools 本身 undefined，
//     报的是 reading 'Symbol(@deepseek-ai/dsh-tools.scheduler)'）。
//   · 该符号是 Symbol(...)（dsh-tools/lib/index.js:2416）——**非 Symbol.for**，
//     副本唯一：进程内一旦出现第二份 @deepseek-ai/dsh-tools 模块实例
//    （插件自带嵌套 node_modules 副本、npm 局部装新版等），两份符号互不相认。
//     tools 服务实例来自 A 副本、agent-loop 用 B 副本的符号去读 → undefined
//     → `.prepare` 炸在工具步中途（用户中断/重试只是把长会话推进到该步的
//     常见时机，与 better-sidebar 客户端加载失败无关——调度器字段挂在内核
//     ToolRuntime 实例上，不随插件注册面增减）。
//   · 另一形态：ctx.tools 解析到非内核 ToolRuntime 的替代对象（同样无该字段）。
//
// 修复（双端，幂等、锚点失配自动退役）：
//   · dsh-agent-loop：四处裸读改为 __dshDesktopScheduler(ctx)——先按模块符号
//     取，miss 则回落 Symbol.for 全局镜像（见下），两者皆无时抛带修复指引的
//     显式错误（替代无从诊断的 'reading prepare' TypeError；不伪造工具结果，
//     保持上游「调度器失败即失败、不合成结果」的语义）。
//   · dsh-tools：ToolRuntime 在自有符号字段旁补挂 Symbol.for 进程全局镜像。
//     这样任意副本提供的 tools 实例都同时带 私有符号 + 全局镜像，跨副本
//     查询经全局镜像命中——真正修复双副本形态，而不只是改报错文案。

const path = require('node:path');
const fs = require('node:fs');
const { applyPatchToFiles } = require('./patch-engine');

const AGENT_LOOP_REL = path.join('dsh-agent-loop', 'lib', 'index.js');
const TOOLS_REL = path.join('dsh-tools', 'lib', 'index.js');

/** 调度器全局镜像符号描述（两端补丁 + 单测共用同一字面量）。 */
const SCHEDULER_GLOBAL_KEY = '@deepseek-ai/dsh-tools.scheduler';

// ---------------------------------------------------------------------------
// dsh-agent-loop：四处裸读 → 解析器（私有符号 → 全局镜像 → 显式报错）
// ---------------------------------------------------------------------------
const SCHEDULER_GUARD_MARKER = 'dsh-desktop compat: cross-copy scheduler lookup guard';

const AGENT_LOOP_IMPORT_OLD = 'import { TOOL_ABORTED_BEFORE_DISPATCH, TOOL_RUNTIME_SCHEDULER } from "@deepseek-ai/dsh-tools";';

/** 插入到 import 行之后的解析器函数体（无前导缩进；单测 eval 此常量做行为验证）。 */
const SCHEDULER_GUARD_FN = [
  '// ' + SCHEDULER_GUARD_MARKER + ' (issue #147 形态).',
  '// ctx.tools[TOOL_RUNTIME_SCHEDULER] reads undefined whenever the resolved',
  '// tools service comes from a different @deepseek-ai/dsh-tools module instance',
  '// than this one (a plugin-bundled nested copy registers under its own private',
  '// Symbol()) or is not the kernel ToolRuntime — the raw read then died as',
  '// "Cannot read properties of undefined (reading \'prepare\')" mid-turn.',
  '// Resolve via the module symbol first, fall back to the process-global',
  '// Symbol.for mirror (installed by the dsh-tools side of this patch), and fail',
  '// loud with an actionable message. Never fabricate tool results.',
  'function __dshDesktopScheduler(ctx) {',
  '\tconst tools = ctx.tools;',
  '\tconst scheduler = tools?.[TOOL_RUNTIME_SCHEDULER] ?? tools?.[Symbol.for("' + SCHEDULER_GLOBAL_KEY + '")];',
  '\tif (scheduler === void 0 || scheduler === null) {',
  '\t\tthrow new Error("dsh-agent-loop: tool runtime scheduler unavailable — ctx.tools is not the kernel ToolRuntime (duplicate @deepseek-ai/dsh-tools copy in-process, or the tools service was replaced). Check plugins bundling their own @deepseek-ai/dsh-tools.");',
  '\t}',
  '\treturn scheduler;',
  '}',
].join('\n');

/** 裸读片段（四处在同文件内逐字相同，全量替换）。 */
const SCHEDULER_READ_OLD = 'ctx.tools[TOOL_RUNTIME_SCHEDULER]';
const SCHEDULER_READ_NEW = '__dshDesktopScheduler(ctx)';

function transformSchedulerGuard(src, file) {
  if (src.includes(SCHEDULER_GUARD_MARKER)) return { status: 'already' };
  const reads = src.split(SCHEDULER_READ_OLD).length - 1;
  if (!src.includes(AGENT_LOOP_IMPORT_OLD) || reads < 4) {
    return {
      status: 'anchor-missing',
      detail: `未找到 dsh-agent-loop 调度器读锚点（import 行或 ${reads}/4 处裸读缺失，版本可能已变更），跳过 ` + file,
    };
  }
  // 先全量替换裸读、再插入解析器——顺序反过来会把解析器注释里的
  // ctx.tools[TOOL_RUNTIME_SCHEDULER] 字样一并改写（自噬）。
  const out = src.split(SCHEDULER_READ_OLD).join(SCHEDULER_READ_NEW)
    .replace(AGENT_LOOP_IMPORT_OLD, AGENT_LOOP_IMPORT_OLD + '\n' + SCHEDULER_GUARD_FN);
  return { status: 'changed', src: out };
}

// ---------------------------------------------------------------------------
// dsh-tools：ToolRuntime 调度器面补挂 Symbol.for 全局镜像
// ---------------------------------------------------------------------------
const SCHEDULER_MIRROR_MARKER = 'dsh-desktop compat: global-symbol scheduler mirror';

const TOOLS_FIELD_OLD = [
  '\t[TOOL_RUNTIME_SCHEDULER] = {',
  '\t\tprepare: (exec) => this.prepareScheduledExecution(exec),',
  '\t\tdispatch: (exec) => this.dispatchScheduledExecution(exec),',
  '\t\tfinalize: (exec, result) => this.finalizeScheduledExecution(exec, result),',
  '\t\tfinish: (exec, result) => this.finishScheduledExecution(exec, result)',
  '\t};',
].join('\n');

/** 追加在调度器字段之后的镜像字段（1-tab 缩进）。 */
const SCHEDULER_MIRROR_FIELD = [
  '\t/**',
  '\t * ' + SCHEDULER_MIRROR_MARKER + '.',
  '\t * Symbol() keys are copy-unique: when a second dsh-tools instance ends up',
  '\t * in-process (a plugin bundling its own nested copy), dsh-agent-loop\'s',
  '\t * module-local symbol misses that instance\'s scheduler field and tool',
  '\t * turns died with "Cannot read properties of undefined (reading',
  '\t * \'prepare\')". Symbol.for is process-global, so the agent-loop guard',
  '\t * resolves the scheduler across copies. Kernel-internal callers keep',
  '\t * using the private symbol.',
  '\t */',
  '\t[Symbol.for("' + SCHEDULER_GLOBAL_KEY + '")] = this[TOOL_RUNTIME_SCHEDULER];',
].join('\n');

const TOOLS_FIELD_NEW = TOOLS_FIELD_OLD + '\n' + SCHEDULER_MIRROR_FIELD;

function transformSchedulerMirror(src, file) {
  if (src.includes(SCHEDULER_MIRROR_MARKER)) return { status: 'already' };
  if (!src.includes(TOOLS_FIELD_OLD)) {
    // 0.2.2-rc.1：上游把 ToolRuntime 的 TOOL_RUNTIME_SCHEDULER 符号字段整块删掉了
    //（dsh-tools 只剩 ToolsService.execute；调度协议收进 lib/pipeline.js + lib/batch.js
    // 的 registry 内部 staged 方法，不再经符号暴露），dsh-agent-loop 也改为
    // this.loopCtx.tools.execute(...)——镜像面与裸读面同时消失，本补丁在上游已无对应语义。
    const obsolete = !src.includes('TOOL_RUNTIME_SCHEDULER');
    return {
      status: 'anchor-missing',
      detail: (obsolete
        ? '上游已移除 ToolRuntime 的 TOOL_RUNTIME_SCHEDULER 调度器字段（0.2.2-rc.1 起调度协议内化，本补丁无锚点可重锚，建议退役），跳过 '
        : '未找到 dsh-tools ToolRuntime 调度器字段锚点（版本可能已变更），跳过 ') + file,
    };
  }
  return { status: 'changed', src: src.replace(TOOLS_FIELD_OLD, TOOLS_FIELD_NEW) };
}

// ---------------------------------------------------------------------------
// 应用入口（patch-session-persistence.js 同款契约：返回变更文件数）
// ---------------------------------------------------------------------------
function patchSchedulerGuard(nmRoot, log = () => {}, stats, options = {}) {
  let changed = 0;
  // CLI 场景经 applyRoot 透传 options：donePrefix=false 输出无前缀单行、
  // anchorLog=warn 把失配走告警通道、dryRun 只判定不落盘；stats 回流
  // anchorMissing/failed 计数。缺省保持原默认（log / true）。
  const donePrefix = options && options.donePrefix;
  const anchorLog = (options && options.anchorLog) || log;
  const dryRun = options && options.dryRun;
  const loopFile = path.join(nmRoot, '@deepseek-ai', AGENT_LOOP_REL);
  if (fs.existsSync(loopFile)) {
    changed += applyPatchToFiles({
      prefix: '调度器防崩补丁',
      files: [loopFile],
      log,
      transform: transformSchedulerGuard,
      alreadyLog: (f) => '已应用，跳过 ' + f,
      doneLog: (f) => '已应用调度器跨副本解析守卫 ' + f,
      anchorLog,
      failLog: (f, err) => '调度器防崩补丁失败(' + f + '): ' + err.message,
      donePrefix,
      dryRun,
      dryRunChangedLog: (f) => 'dry-run: 将应用调度器跨副本解析守卫 ' + f,
      stats,
    });
  }
  const toolsFile = path.join(nmRoot, '@deepseek-ai', TOOLS_REL);
  if (fs.existsSync(toolsFile)) {
    changed += applyPatchToFiles({
      prefix: '调度器镜像补丁',
      files: [toolsFile],
      log,
      transform: transformSchedulerMirror,
      alreadyLog: (f) => '已应用，跳过 ' + f,
      doneLog: (f) => '已应用调度器全局符号镜像 ' + f,
      anchorLog,
      failLog: (f, err) => '调度器镜像补丁失败(' + f + '): ' + err.message,
      donePrefix,
      dryRun,
      dryRunChangedLog: (f) => 'dry-run: 将应用调度器全局符号镜像 ' + f,
      stats,
    });
  }
  return changed;
}

module.exports = {
  AGENT_LOOP_REL,
  TOOLS_REL,
  SCHEDULER_GLOBAL_KEY,
  SCHEDULER_GUARD_MARKER,
  SCHEDULER_GUARD_FN,
  SCHEDULER_MIRROR_MARKER,
  SCHEDULER_MIRROR_FIELD,
  transformSchedulerGuard,
  transformSchedulerMirror,
  patchSchedulerGuard,
};
