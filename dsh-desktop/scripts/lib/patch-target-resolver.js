'use strict';

// ---------------------------------------------------------------------------
// 补丁目标解析器（唯一实现）。
//
// 现状 `localCopyFiles` / `guardCopyFiles` / `slotCompatCopyFiles` /
// `patchTargets` / `localNodeModulesRoots` 五函数散落在
// `scripts/lib/runtime-patches.js`，main.js 再包一层 `runtimeCopyFiles` /
// `runtimeGuardFiles` / `runtimeNodeModulesRoots` 绑定模块级变量。本模块把
// 全部路径构造收口为「一个 resolver + 布局枚举」：每个补丁只声明「包相对
// 路径（pkgRel）+ 布局类型（layout）」，路径归一，杜绝 4~5 处重复落盘漂移。
//
// `ctx = { home, appDir, userDataDir, wslMode }` 为纯参数注入，便于单测；
// main.js 与 CLI 只传 ctx，不再各自构造路径。
//
// 兼容期：为让 sync-companion-plugins.js 与既有单测不断链，本模块同时导出
// 旧签名的五个构造函数（patchTargets / localCopyFiles / guardCopyFiles /
// localNodeModulesRoots / slotCompatCopyFiles / slotCompatPatchTargets），
// runtime-patches.js 据此 re-export 一个版本周期后再删。
// ---------------------------------------------------------------------------

const path = require('node:path');

/** 各补丁目标包内的相对路径（@deepseek-ai/<rel>）。 */
// 0.1.2-alpha.1 起 dsh-client-runtime 分解为 dsh-api-session-controller（Session /
// mergeOrderedBaseline 所在客户端入口）+ dsh-client-store / dsh-client-web。
// 闪跳修复（mergeOrderedBaseline 保留本地新会话）落点迁至 session-controller。
const FLASH_PKG_REL = path.join('dsh-api-session-controller', 'lib', 'client.js');
// K1 credentials-absent 指引落点：dsh-host-apiproxy 分解后，报错文案现由
// dsh-api-settings-controller 透传（credentials 缺席分支）。
const API_SETTINGS_CONTROLLER_PKG_REL = path.join('dsh-api-settings-controller', 'lib', 'index.js');
const CONVERSATION_PKG_REL = path.join('dsh-client-ui-conversation', 'lib', 'client.js');
const SKILL_UI_PKG_REL = path.join('dsh-client-ui-skill', 'lib', 'client.js');
// K25：会话分组「手动排序」拖拽失效修复补丁目标（ViewOptionsMenu /
// SessionNodeItem / commitSessionDrag 所在入口）。
const WORKSPACE_PKG_REL = path.join('dsh-client-ui-workspace', 'lib', 'client.js');
const EXPOSE_PKG_REL = path.join('dsh-host-apiproxy', 'lib', 'index.js');
const PERSISTENCE_PKG_REL = path.join('dsh-session-persistence-jsonl', 'lib', 'index.js');
const SLOT_KEY_COMPAT_PKG_REL = path.join('dsh-client-ui-slots', 'lib', 'index.js');
const SLOT_UNKEYED_COMPAT_PKG_REL = path.join('dsh-cordis-client-runner', 'lib', 'client.js');
const SLOT_COMPAT_PKG_RELS = [SLOT_KEY_COMPAT_PKG_REL, SLOT_UNKEYED_COMPAT_PKG_REL];
const PW_REL = path.join('dsh-tool-pwsh', 'lib', 'index.js');
const BASH_REL = path.join('dsh-tool-bash', 'lib', 'index.js');
// 持久 shell（pwsh / bash persistent）与其 PTY 后端的停止修复补丁目标。
const PWSH_PERSIST_REL = path.join('dsh-tool-pwsh-persistent', 'lib', 'index.js');
const BASH_PERSIST_REL = path.join('dsh-tool-bash-persistent', 'lib', 'index.js');
const PERSISTENT_SHELL_PKG_RELS = [PWSH_PERSIST_REL, BASH_PERSIST_REL];
const TERMINAL_BASH_REL = path.join('dsh-terminal-bash', 'lib', 'index.js');
const CODE_PRESET_REL = path.join('dsh', 'config', 'agent-presets', 'code', 'agent.cordis.yml');
const ATTACH_LOCAL_REL = path.join('dsh-attachment-local', 'lib', 'index.js');
// R7：adapter prepareCall 守卫补丁目标（dsh-llm）：LlmRuntime.prepareCall /
// adapterStream 所在入口（0.1.1-rc.2 起新增 adapter.prepareCall 契约调用点）。
const LLM_PKG_REL = path.join('dsh-llm', 'lib', 'index.js');
// loader 自动隔离补丁目标（cordis-plugin-loader 是 @deepseek-ai scope 下的包）。
const LOADER_PKG_REL = path.join('cordis-plugin-loader', 'lib', 'index.js');
const APP_BOOT_PKG_REL = path.join('dsh-app-boot', 'lib', 'index.js');
// agent-preset 未知 id 回落补丁目标（dsh-agent-presets）：lib/index.js 是运行时
// 经 exports "." 实际加载的入口；lib/invariant.js 为同源产物（锚点文本一致），
// 无人加载但一并覆盖，防未来消费方走 /invariant 出口时漏保护。
const AGENT_PRESET_FALLBACK_PKG_RELS = [
  path.join('dsh-agent-presets', 'lib', 'index.js'),
  path.join('dsh-agent-presets', 'lib', 'invariant.js'),
];
// prompt 插值 name-invalid 字面透传补丁目标（dsh-system-prompt）：lib/index.js
// 是运行时经 exports "." 实际加载的入口（interpolate() 所在，锚点 :117-118）。
// lib/invariant.js 只做注册期变量名/section 名校验（fail() 静默抛），无插值
// 分支，不覆盖。
const PROMPT_CONTEXT_LITERAL_PKG_RELS = [
  path.join('dsh-system-prompt', 'lib', 'index.js'),
];
// api-gateway 缺席指引补丁目标（dsh-client-connection）：lib/index.js 是运行时
// 经 exports "." 实际加载的唯一入口（/api 前缀路由 + fallback fetch 所在），
// apply() 的 apiProxy 缺席分支即锚点。
const API_GATEWAY_ABSENT_PKG_REL = path.join('dsh-client-connection', 'lib', 'index.js');
// #154 第三根因：内核 web UI boot 看门狗补丁目标——dsh-web-frontend 的
// index.html（dist 是内核 Web 服务器实际托管的面；client-compat.js 也注入
// 同一 dist，说明这是可补丁的落点）。
const KERNEL_WEB_INDEX_REL = path.join('dsh-web-frontend', 'dist', 'index.html');
// W1 问题四（WSL 目录选择器误判 native）补丁目标：adaptive 选择器的
// resolver 所在入口（resolveDirectoryPickerBackend 锚点 :65）。
const PICKER_AUTO_PKG_REL = path.join('dsh-host-directory-picker-auto', 'lib', 'index.js');
// Codex CLI 本地二进制回落补丁目标（@openai/codex/bin/codex.js）：非 @deepseek-ai
// scope，pkgRel 含完整 scope 前缀，配套下方 mkPkg 的 scope-agnostic 布局。
const CODEX_BIN_PKG_REL = path.join('@openai', 'codex', 'bin', 'codex.js');
// pi-ai openai-completions 路由（4xx 诊断落盘补丁目标；scope-agnostic 布局）。
const PI_AI_COMPLETIONS_PKG_REL = path.join('@earendil-works', 'pi-ai', 'dist', 'api', 'openai-completions.js');
// Claude Code 子代理适配器补丁目标（@deepseek-ai scope，pkgRel 相对 @deepseek-ai，
// 与其它 PKG_REL 常量一致）。
const CLAUDE_SUBAGENT_PKG_REL = path.join('dsh-subagent-claude-code', 'lib', 'index.js');
// skill 目录兼容补丁目标（dsh-skill-filesystem）：FileSystemSkillProvider 的
// 构造器（customSkillDirs 装配）与 roots()（user 根清单）所在入口，即运行时
// 经 exports "." 实际加载的技能发现 provider。
const SKILL_FS_PKG_REL = path.join('dsh-skill-filesystem', 'lib', 'index.js');

/** @deepseek-ai/<pkgRel> 落点（以 node_modules/@deepseek-ai 根为准）。 */
function mkAi(root, pkgRel) {
  return path.join(root, 'node_modules', '@deepseek-ai', pkgRel);
}

/** node_modules 任意 scope 包内相对路径（pkgRel 已含 scope 前缀，如 @openai/codex/...）。 */
function mkPkg(root, pkgRel) {
  return path.join(root, 'node_modules', pkgRel);
}

/**
 * 布局（layout）—— 每个补丁只声明 pkgRel + layout，路径构造归一。
 * 布局函数签名：(ctx, spec) => string[]；spec.pkgRel 为单文件相对路径，
 * spec.pkgRels 为多文件相对路径（slot-compat / shell-description 共用）。
 */
const LAYOUTS = {
  // 本地模式三副本：profile fallback → app 内置 → agent overlay。
  'runtime-local': (ctx, spec) => [
    mkAi(path.join(ctx.home, 'profiles'), spec.pkgRel),
    mkAi(ctx.appDir, spec.pkgRel),
    mkAi(path.join(ctx.userDataDir, 'agent'), spec.pkgRel),
  ],
  // 通用 node_modules 包文件布局（scope-agnostic）：非 @deepseek-ai scope 的
  // 桌面独有依赖（如 @openai/codex）落点（pkgRel 已含 scope 前缀，与 mkPkg
  // 配套）；三副本同 runtime-local。
  'runtime-local-nm': (ctx, spec) => [
    mkPkg(path.join(ctx.home, 'profiles'), spec.pkgRel),
    mkPkg(ctx.appDir, spec.pkgRel),
    mkPkg(path.join(ctx.userDataDir, 'agent'), spec.pkgRel),
  ],
  // 防护类补丁四副本：app 优先 + overlay 嵌套 dsh + profile fallback。
  'guard': (ctx, spec) => [
    mkAi(ctx.appDir, spec.pkgRel),
    mkAi(path.join(ctx.userDataDir, 'agent'), spec.pkgRel),
    mkAi(path.join(ctx.userDataDir, 'agent', 'node_modules', '@deepseek-ai', 'dsh'), spec.pkgRel),
    mkAi(path.join(ctx.home, 'profiles'), spec.pkgRel),
  ],
  // 内核 Web UI dist 补丁（#154 前端兜底）：dist 目录只存在于 app 内置副本
  // 与 agent overlay（Web 组合由内核 dsh-web-app 的 frontend-static 托管）。
  'web-frontend-dist': (ctx, spec) => [
    mkAi(ctx.appDir, spec.pkgRel),
    mkAi(path.join(ctx.userDataDir, 'agent'), spec.pkgRel),
    mkAi(path.join(ctx.home, 'profiles'), spec.pkgRel),
  ],
  // WSL：profile fallback + agent（UNC 写穿）。
  'wsl': (ctx, spec) => [
    mkAi(path.join(ctx.home, 'profiles'), spec.pkgRel),
    mkAi(path.join(ctx.home, 'agent'), spec.pkgRel),
  ],
  // 包级补丁的 node_modules 根列表（WSL 追加 agent 直连根兜底）。
  'nm-roots': (ctx) => [
    path.join(ctx.home, 'profiles', 'node_modules'),
    path.join(ctx.appDir, 'node_modules'),
    path.join(ctx.userDataDir, 'agent', 'node_modules'),
    ...(ctx.wslMode ? [path.join(ctx.home, 'agent', 'node_modules')] : []),
  ],
  // slot 兼容（本地）：单文件布局。逐文件迭代由 patch-runner 的 applyFile 循环
  // pkgRels 驱动；本布局只处理单个 spec.pkgRel，避免「读完整 pkgRels」导致同一
  // 文件被循环 2 遍重复处理（历史 bug）。顶层三副本 + guard 四副本 + profile/app
  // 嵌套 dsh 依赖副本（去重）。
  'slot-compat': (ctx, spec) => slotCompatFilesFor(ctx, spec.pkgRel),
  // slot 兼容（WSL）：单文件布局（profile fallback + agent + 嵌套 dsh 依赖副本）。
  'slot-compat-wsl': (ctx, spec) => slotCompatFilesForWsl(ctx, spec.pkgRel),
  // profile-boot 防护目标目录（runner 在此 glob `profile-boot-*.js`）。
  'profile-boot-dirs': (ctx) => [
    path.join(ctx.appDir, 'node_modules', '@deepseek-ai', 'dsh', 'lib'),
    path.join(ctx.userDataDir, 'agent', 'node_modules', '@deepseek-ai', 'dsh', 'lib'),
    path.join(ctx.home, 'profiles', 'node_modules', '@deepseek-ai', 'dsh', 'lib'),
  ],
};

/** 嵌套 dsh 依赖副本落点。 */
function nestedAi(root, pkgRel) {
  return path.join(root, 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', pkgRel);
}

/** slot 兼容（本地）单文件目标：runtime-local + guard + profile/app 嵌套副本（去重）。 */
function slotCompatFilesFor(ctx, pkgRel) {
  return [...new Set([
    ...LAYOUTS['runtime-local'](ctx, { pkgRel }),
    ...LAYOUTS['guard'](ctx, { pkgRel }),
    nestedAi(path.join(ctx.home, 'profiles'), pkgRel),
    nestedAi(ctx.appDir, pkgRel),
  ])];
}

/** slot 兼容（WSL）单文件目标：wsl + profile/agent 嵌套副本（去重）。 */
function slotCompatFilesForWsl(ctx, pkgRel) {
  return [...new Set([
    ...LAYOUTS['wsl'](ctx, { pkgRel }),
    nestedAi(path.join(ctx.home, 'profiles'), pkgRel),
    nestedAi(path.join(ctx.home, 'agent'), pkgRel),
  ])];
}

/**
 * 解析单个补丁的落盘文件列表。
 * @param {{home:string, appDir:string, userDataDir:string, wslMode:boolean}} ctx
 * @param {{layout?:string, wslLayout?:string, pkgRel?:string, pkgRels?:string[]}} spec
 * @returns {string[]}
 */
function resolvePatchTargets(ctx, spec) {
  const layoutKey = (spec.wslLayout && ctx.wslMode) ? spec.wslLayout : spec.layout;
  const layout = LAYOUTS[layoutKey];
  if (!layout) return [];
  return layout(ctx, spec);
}

/**
 * 解析包级补丁的 node_modules 根列表（web-search / menu-viewport /
 * session-manage / open-project-dir / session-persistence 用）。
 * @param {{home:string, appDir:string, userDataDir:string, wslMode:boolean}} ctx
 * @param {{layout?:string, wslLayout?:string}} [spec]
 * @returns {string[]}
 */
function resolveNmRoots(ctx, spec = {}) {
  const layoutKey = (spec.wslLayout && ctx.wslMode) ? spec.wslLayout : (spec.layout || 'nm-roots');
  const layout = LAYOUTS[layoutKey] || LAYOUTS['nm-roots'];
  return layout(ctx, spec);
}

// ---------------------------------------------------------------------------
// 旧签名兼容函数（供 runtime-patches.js re-export；main.js 与 CLI 经 resolver
// 走新接口，这些仅保留一个版本周期）。
// ---------------------------------------------------------------------------

function patchTargets(home, pkgRel) {
  return LAYOUTS['wsl']({ home }, { pkgRel });
}

function localCopyFiles(home, appDir, userDataDir, pkgRel) {
  return LAYOUTS['runtime-local']({ home, appDir, userDataDir, wslMode: false }, { pkgRel });
}

function guardCopyFiles(home, appDir, userDataDir, pkgRel) {
  return LAYOUTS['guard']({ home, appDir, userDataDir, wslMode: false }, { pkgRel });
}

function localNodeModulesRoots(home, appDir, userDataDir, extraRoots = []) {
  return [
    path.join(home, 'profiles', 'node_modules'),
    path.join(appDir, 'node_modules'),
    path.join(userDataDir, 'agent', 'node_modules'),
    ...extraRoots,
  ];
}

function slotCompatCopyFiles(home, appDir, userDataDir) {
  const ctx = { home, appDir, userDataDir, wslMode: false };
  const files = [];
  for (const pkgRel of SLOT_COMPAT_PKG_RELS) files.push(...slotCompatFilesFor(ctx, pkgRel));
  return [...new Set(files)];
}

function slotCompatPatchTargets(home) {
  const ctx = { home, wslMode: true };
  const files = [];
  for (const pkgRel of SLOT_COMPAT_PKG_RELS) files.push(...slotCompatFilesForWsl(ctx, pkgRel));
  return [...new Set(files)];
}

module.exports = {
  LAYOUTS,
  FLASH_PKG_REL,
  API_SETTINGS_CONTROLLER_PKG_REL,
  CONVERSATION_PKG_REL,
  SKILL_UI_PKG_REL,
  WORKSPACE_PKG_REL,
  EXPOSE_PKG_REL,
  PERSISTENCE_PKG_REL,
  SLOT_KEY_COMPAT_PKG_REL,
  SLOT_UNKEYED_COMPAT_PKG_REL,
  SLOT_COMPAT_PKG_RELS,
  PW_REL,
  BASH_REL,
  PWSH_PERSIST_REL,
  BASH_PERSIST_REL,
  PERSISTENT_SHELL_PKG_RELS,
  TERMINAL_BASH_REL,
  CODE_PRESET_REL,
  ATTACH_LOCAL_REL,
  LLM_PKG_REL,
  LOADER_PKG_REL,
  APP_BOOT_PKG_REL,
  AGENT_PRESET_FALLBACK_PKG_RELS,
  PROMPT_CONTEXT_LITERAL_PKG_RELS,
  API_GATEWAY_ABSENT_PKG_REL,
  KERNEL_WEB_INDEX_REL,
  PICKER_AUTO_PKG_REL,
  CODEX_BIN_PKG_REL,
  PI_AI_COMPLETIONS_PKG_REL,
  CLAUDE_SUBAGENT_PKG_REL,
  SKILL_FS_PKG_REL,
  resolvePatchTargets,
  resolveNmRoots,
  // 兼容期旧签名（一个版本周期后删除）。
  patchTargets,
  localCopyFiles,
  guardCopyFiles,
  localNodeModulesRoots,
  slotCompatCopyFiles,
  slotCompatPatchTargets,
};
