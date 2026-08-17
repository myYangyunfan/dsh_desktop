'use strict';

// ---------------------------------------------------------------------------
// 运行时补丁定义（唯一实现）。
//
// 「会话列表刷新闪跳修复」（dsh-client-runtime）与「设置暴露白名单补丁」
// （dsh-host-apiproxy）曾同时存在于 main.js（applyRuntimeFlashFix /
// applyPromptExposeFix）与 scripts/sync-companion-plugins.js
// （applyRuntimePatches，--with-patches）两处，是同一份补丁的第三次复制。
// 这里把锚点常量、变换与 WSL / CLI 共用的目标路径收口为唯一数据源，两个
// 入口只保留各自的候选路径选择与日志文案，杜绝漂移。
//
// 变换均为纯函数，字节级输出与旧实现一致；锚点失配时绝不改写文件内容。
// ---------------------------------------------------------------------------

const path = require('node:path');

/** dsh-client-runtime 会话列表刷新闪跳修复（mergeOrderedBaseline 保留本地新会话）。 */
const FLASH_OLD = '(value) => baselineByKey.get(keyOf(value))).filter((value) => value !== void 0);';
const FLASH_NEW = '(value) => baselineByKey.get(keyOf(value)) ?? value).filter((value) => value !== void 0);';

/** 设置暴露白名单（dsh-prompt / 第三方思考 / 识图 / 会话调整）。 */
const SETTINGS_NAMESPACES = ['dsh-prompt', 'dsh-third-party-thinking', 'dsh-vision', 'dsh-conversation-tweaks'];

/** 各补丁目标包内的相对路径（@deepseek-ai/<rel>）。 */
const FLASH_PKG_REL = path.join('dsh-client-runtime', 'lib', 'client.js');
const EXPOSE_PKG_REL = path.join('dsh-host-apiproxy', 'lib', 'index.js');

/**
 * WSL 托管模式 / sync CLI 共用目标：profile fallback + agent 两份副本。
 * bundle 初始化后的 dsh 安装（npm 版）两份副本通常互为同一文件（fallback
 * 符号链接写穿），逐文件幂等判定保证重复目标安全。
 * @param {string} home 目标 dsh 数据目录（WSL 模式为 UNC 等价路径）
 * @param {string} pkgRel @deepseek-ai/<pkgRel>
 * @returns {string[]}
 */
function patchTargets(home, pkgRel) {
  const mk = (root) => path.join(root, 'node_modules', '@deepseek-ai', pkgRel);
  return [
    mk(path.join(home, 'profiles')),
    mk(path.join(home, 'agent')),
  ];
}

// ---------------------------------------------------------------------------
// 运行时补丁候选路径构造（纯函数：路径根由调用方传入，便于单测；main.js 绑定
// 模块级变量）。三种布局与旧实现逐项一致，并补齐同系列补丁的历史覆盖缺口：
//   - localCopyFiles         本地模式三副本（profile fallback → 内置副本 → 更新 overlay）；
//   - guardCopyFiles         防护类补丁四副本（内置副本优先 + overlay 嵌套 dsh
//                            依赖副本 + profile fallback）；
//   - localNodeModulesRoots  包级补丁的 node_modules 根目录列表（extraRoots 用于
//                            WSL 模式追加 WSL agent 直连根，与 patchTargets 的
//                            agent 兜底语义一致）。
// ---------------------------------------------------------------------------

function localCopyFiles(home, appDir, userDataDir, pkgRel) {
  return [
    path.join(home, 'profiles', 'node_modules', '@deepseek-ai', pkgRel),
    path.join(appDir, 'node_modules', '@deepseek-ai', pkgRel),
    path.join(userDataDir, 'agent', 'node_modules', '@deepseek-ai', pkgRel),
  ];
}

function guardCopyFiles(home, appDir, userDataDir, pkgRel) {
  return [
    path.join(appDir, 'node_modules', '@deepseek-ai', pkgRel),
    path.join(userDataDir, 'agent', 'node_modules', '@deepseek-ai', pkgRel),
    path.join(userDataDir, 'agent', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', pkgRel),
    path.join(home, 'profiles', 'node_modules', '@deepseek-ai', pkgRel),
  ];
}

function localNodeModulesRoots(home, appDir, userDataDir, extraRoots = []) {
  return [
    path.join(home, 'profiles', 'node_modules'),
    path.join(appDir, 'node_modules'),
    path.join(userDataDir, 'agent', 'node_modules'),
    ...extraRoots,
  ];
}

/**
 * 闪跳修复变换（纯函数）。锚点失配的 detail 含文件路径，与两个调用方
 * （main.js / 同步脚本）的旧日志文案逐字一致。
 * @returns {{status:'already'} | {status:'anchor-missing', detail: string} | {status:'changed', src: string}}
 */
function transformFlashFix(src, file) {
  if (src.includes(FLASH_NEW)) return { status: 'already' };
  if (!src.includes(FLASH_OLD)) {
    return { status: 'anchor-missing', detail: '未匹配到目标代码（版本可能已变更），跳过 ' + file };
  }
  return { status: 'changed', src: src.replace(FLASH_OLD, FLASH_NEW) };
}

/**
 * 设置暴露白名单变换（纯函数）。只认声明之后最近的 `];`，避免插进文件里
 * 其它数组；缺失的命名空间以与旧实现逐字节一致的格式追加。原数组以尾逗号
 * 收尾（`"x",\n];`）时不重复前导逗号——历史实现无条件前置 `,\n`，遇到带
 * 尾逗号的文件会生成 `,\n,` 双逗号语法错误。
 * @returns {{status:'already'} | {status:'anchor-missing', detail: string} | {status:'changed', src: string, note: string[]}}
 */
function transformExposeFix(src, file) {
  const declIdx = src.indexOf('const WEB_SETTINGS_NAMESPACES = [');
  if (declIdx === -1) {
    return { status: 'anchor-missing', detail: '未找到 WEB_SETTINGS_NAMESPACES（版本可能已变更），跳过 ' + file };
  }
  const closeIdx = src.indexOf('];', declIdx);
  if (closeIdx === -1) {
    return { status: 'anchor-missing', detail: '未匹配到命名空间数组收尾，跳过 ' + file };
  }
  const arrText = src.slice(declIdx, closeIdx);
  const missing = SETTINGS_NAMESPACES.filter((ns) => !arrText.includes('"' + ns + '"'));
  if (missing.length === 0) return { status: 'already' };
  const hasTrailingComma = /,\s*$/.test(arrText);
  const block = (hasTrailingComma ? '\n' : ',\n') + missing.map((ns) => '\t"' + ns + '"').join(',\n') + '\n';
  return { status: 'changed', src: src.slice(0, closeIdx) + block + src.slice(closeIdx), note: missing };
}

module.exports = {
  FLASH_OLD,
  FLASH_NEW,
  SETTINGS_NAMESPACES,
  FLASH_PKG_REL,
  EXPOSE_PKG_REL,
  patchTargets,
  localCopyFiles,
  guardCopyFiles,
  localNodeModulesRoots,
  transformFlashFix,
  transformExposeFix,
};
