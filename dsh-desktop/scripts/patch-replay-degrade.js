'use strict';

// A-4: replayState 降级补丁。
//
// 背景：dsh-llm-pi-ai 的 readReplayState 对旧版本（legacy 会话）写入的
// 非法/未知 replay state 会抛 INVALID_REPLAY_STATE（见 lib/index.js
// invalidReplay()）。toPiAssistant() 未捕获该错误 → 历史会话续聊直接
// 失败卡死（"kind: legacy 会话续聊不出字"）。
//
// 补丁：在 toPiAssistant 内把 replayedAssistant 包进 try/catch，仅当
// err.code === "INVALID_REPLAY_STATE" 时降级为 foreignAssistant(message)
// （丢弃 replay 元数据、按普通 assistant 内容重建历史），其余错误照常
// 上抛，不掩盖真实缺陷。
//
// 幂等标记 REPLAY_MARKER 命中 → already；锚点失配 → anchor-missing 跳过
// （版本变更安全降级，绝不改写）。

const path = require('node:path');

const REPLAY_PKG_REL = path.join('@deepseek-ai', 'dsh-llm-pi-ai', 'lib', 'index.js');

const REPLAY_MARKER = '/* dsh-desktop replay degrade */';

// 锚点：toPiAssistant 的 return 行（tab 缩进，与上游文件一致）。
const REPLAY_ANCHOR_OLD =
  '\treturn source.kind !== "model" || source.replayState === void 0 ? foreignAssistant(message) : replayedAssistant(message, source, source.replayState);';

// 替换产物：marker 行 + try/catch 降级块。
const REPLAY_PATCHED =
  REPLAY_MARKER + '\n' +
  '\ttry {\n' +
  '\t\treturn replayedAssistant(message, source, source.replayState);\n' +
  '\t} catch (err) {\n' +
  '\t\t// LOCAL PATCH: 旧版本写入的非法 replay state 只降级不卡死会话；\n' +
  '\t\t// 真实缺陷（其它 code）照常上抛。\n' +
  '\t\tif (err && err.code === "INVALID_REPLAY_STATE") return foreignAssistant(message);\n' +
  '\t\tthrow err;\n' +
  '\t}';

/**
 * 转换函数（patch-engine 语义）：src → { status, src?, note? }
 * @param {string} src
 * @param {string} file
 * @returns {{status: string, src?: string, detail?: string, note?: string[]}}
 */
function transformReplayDegrade(src, file) {
  if (src.includes(REPLAY_MARKER)) return { status: 'already' };
  if (!src.includes(REPLAY_ANCHOR_OLD)) {
    return {
      status: 'anchor-missing',
      detail: '未找到 toPiAssistant replay 锚点（版本可能已变更），跳过 ' + file,
    };
  }
  return {
    status: 'changed',
    src: src.replace(REPLAY_ANCHOR_OLD, REPLAY_PATCHED),
    note: ['replay 降级'],
  };
}

/**
 * 目标文件构造：与 runtime-patches 本地三副本同构——profile fallback →
 * 内置副本 → overlay agent 副本。
 * @param {string} home ~/.dsh
 * @param {string} appDir resources/app
 * @param {string} userData userData 目录
 * @returns {string[]}
 */
function replayCopyFiles(home, appDir, userData) {
  return [
    path.join(home, 'profiles', 'node_modules', REPLAY_PKG_REL),
    path.join(appDir, 'node_modules', REPLAY_PKG_REL),
    path.join(userData, 'agent', 'node_modules', REPLAY_PKG_REL),
  ];
}

module.exports = {
  REPLAY_PKG_REL,
  REPLAY_MARKER,
  REPLAY_ANCHOR_OLD,
  REPLAY_PATCHED,
  transformReplayDegrade,
  replayCopyFiles,
};