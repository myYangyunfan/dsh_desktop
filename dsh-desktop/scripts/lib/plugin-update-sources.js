'use strict';

// ---------------------------------------------------------------------------
// 内置插件「检查更新 / 更新」的更新源唯一表（单一数据源）。
//
// 背景：这张表曾在两处各存一份副本——
//   · dsh-tauri/sidecar/cli.js 的 UPDATE_SOURCES（Tauri 活路径）；
//   · dsh-desktop/scripts/plugin-core/index.js 的 updateSources（Electron 遗留装配根）。
// 两份副本一旦漂移，同一插件在两条链上会看到不同的「有没有新版」。现收敛到本
// 模块：sidecar 经 mods.pluginUpdateSources 注入，plugin-core 直接 require。
//
// 键 = loader id（必须存在于 scripts/lib/companion-plugins.js 的
// COMPANION_PLUGINS；unit-plugin-update-sources 咬住这条，防止表里写孤儿 id）。
// 值：
//   { kind: 'npm',    pkg }             → npm registry 的 latest（官方 → npmmirror 回退）
//   { kind: 'github', repo }            → GitHub Releases latest；有资产走资产
//     （sha256 digest 锚点），无资产的 release 由 plugin-manager-update.js 的
//     resolveGithubRelease 判为 archive 模式（源码 zipball，无官方摘要）。
//
// 排除机制：表里保留条目（便于 UI/文档解释「为什么没有它」），但
// isUpdateExcluded(id) 为真者不参与 checkUpdates，update 直接拒绝。
// ---------------------------------------------------------------------------

const UPDATE_SOURCES = Object.freeze({
  // ── 既有两条（side-session 已随「临时对话」退役移出内置清单） ──
  'bili-native': { kind: 'npm', pkg: 'billion-context' },
  // better-sidebar 条目保留但被排除，原因见 UPDATE_EXCLUSIONS。
  'better-sidebar': { kind: 'npm', pkg: 'dsh-better-sidebar' },

  // ── 2026-10-22 新增的随包插件 ──
  'bot': { kind: 'npm', pkg: 'ds-bot' },
  'web-search-free': { kind: 'npm', pkg: 'dsh-free-search' },
  'shop': { kind: 'npm', pkg: 'dsh-plugin-shop' },
  // 该仓库的 Release 没有上传资产（只有 tag_name / tarball_url / zipball_url），
  // 因此走 archive（源码 zipball）模式，无 digest 可校验——不假装校验。
  'network-proxy': { kind: 'github', repo: 'baizhizzl/dsh-network-proxy' },
  'mcp-manager-ui': { kind: 'npm', pkg: 'dsh-toolbox-ui' },
  'dsh-notify': { kind: 'npm', pkg: '@bittersmilezzz/dsh-notify' },
});

/**
 * 不纳入「检查更新 / 更新」管理的条目及原因。
 *
 * better-sidebar 是本地重建件：上游 0.24.2 整包 + 本仓对资源管理器栏头折叠 /
 * 「在本地打开」等行为的修复（见 docs/builtin-plugins-inventory.md §5.2 #3），
 * 而 npm 上的同名包没有这些修复。若按 npm 最新版覆盖，等于把本地修复整块抹掉，
 * 所以它既不参与检查更新，也不允许单独更新；升级只能走本仓 vendored 重建链
 * （.tmp-bs-build 沙箱重跑 build + unit-better-sidebar-* 测试）。
 */
const UPDATE_EXCLUSIONS = Object.freeze({
  'better-sidebar': '本地重建件（vendored 上游 + 本仓修复），npm 更新会覆盖本地修复，故不纳入独立更新管理',
  // ds-bot 是 vendored 定制：上游 patch 会接管 web.searchProvider，本仓只保留 Bot 本体
  // （与 dsh-free-search 共存）；npm 更新会整包覆盖 cordis.patch.yml 与 client 里的
  // dsh-compat 标记，故升级需人工重放 vendored 改动，不交给自动更新。
  bot: '本地 vendored patch（只挂 Bot 本体、不接管 web.searchProvider）；npm 更新会覆盖定制，升级需人工重放',
});

/** 该 loader id 是否被排除在更新管理之外。 */
function isUpdateExcluded(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(UPDATE_EXCLUSIONS, id);
}

/** 排除原因（未排除返回空串）。 */
function updateExclusionReason(id) {
  return isUpdateExcluded(id) ? UPDATE_EXCLUSIONS[id] : '';
}

/** 取单条更新源（未知 / 非字符串返回 null）。 */
function getUpdateSource(id) {
  if (typeof id !== 'string') return null;
  return Object.prototype.hasOwnProperty.call(UPDATE_SOURCES, id) ? UPDATE_SOURCES[id] : null;
}

/**
 * 从插件清单行中筛出「本次应参与检查更新」的行（纯函数，侧车与 plugin-core 共用）：
 *   · 有更新源；
 *   · 未被卸载（removed !== true）；
 *   · 未被排除（isUpdateExcluded）。
 * 顺序与入参一致（Promise.all 并发，但结果顺序稳定）。
 * @param {Array<{id:string, removed?:boolean}>} rows
 * @param {Object} [sources] 更新源表（默认 UPDATE_SOURCES，测试可注入）
 */
function selectUpdateCandidates(rows, sources = UPDATE_SOURCES) {
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    if (!row || typeof row.id !== 'string') return false;
    if (row.removed === true) return false;
    if (isUpdateExcluded(row.id)) return false;
    return Object.prototype.hasOwnProperty.call(sources, row.id);
  });
}

module.exports = {
  UPDATE_SOURCES,
  UPDATE_EXCLUSIONS,
  isUpdateExcluded,
  updateExclusionReason,
  getUpdateSource,
  selectUpdateCandidates,
};
