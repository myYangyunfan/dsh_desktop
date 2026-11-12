'use strict';

// ---------------------------------------------------------------------------
// 内置线（v1.0.0，2026-10-08 裁定：`assets/plugins` 整树进安装包）带来的三条
// **只属于交付面**的风险，判据收敛在这里，编排（走盘 / 删除 / 报错）留在调用方
// `dsh-tauri/scripts/stage-plugin-gate.mjs`（① 残留 ② .pnpm ③ 安装态超长）
// 与 `dsh-tauri/scripts/stage-nsis-path-gate.mjs`（④ 构建期 makensis 源路径），
// CI 的五个架构 staging 同口径。
//
// 为什么此前不需要、现在需要：
//   • 旧口径把整个 `assets/plugins` 挡在包外，dev 树里有什么都不影响安装包；
//     现在它是安装包载荷的一部分，本机装错的依赖会原样进包。
//   • 同步面（payload → profile）早就按 `shipsNodeModules` 拒绝残留
//     （见 companion-plugins.js 字段注释：dev 树上一次 pnpm install 就能产出 1.3 万文件的
//     残留树）。交付面必须用**同一份声明**，不能另立口径。
//   • 超长路径是打包器层面的硬失败：NSIS 的 File 指令在 >260 字符处 "failed opening file"
//     直接中断建包（历史实错 abort 于 installer.nsi:15383）。安装态实际长度 =
//     安装根前缀 + payload 相对路径，所以判据要带前缀算，只看相对路径会漏判。
//     2026-10-17 又实测出**第二道同族但独立的墙**——构建机上 makensis 的源路径（未归一化的
//     `..\..\..\` 字面量 + CI 前缀 94 字符），本机前缀短 39 字符永远量不到：见下面
//     NSIS_SOURCE_* 一段。
// ---------------------------------------------------------------------------

/** 最坏情况安装根前缀（currentUser 缺省 `%LOCALAPPDATA%`，但 Program Files 更长更严）。 */
const INSTALL_PREFIX_DEFAULT = 'C:\\Program Files\\DSH Desktop\\resources\\dsh-desktop\\';

/** 上限留 20 字符余量：用户可自选更深的安装目录，260 是打包器的断点而不是我们的判据。 */
const PATH_LIMIT_DEFAULT = 240;

// ---------------------------------------------------------------------------
// 构建期（makensis 源路径）断点——与上面的安装期前缀是**两条独立的墙**。
//
// 2026-10-17 v1.0.4 发布实测：本机 `tauri build` 出包 195,643,131B 全绿，CI 的
// Windows x64 与 ARM64 两个 job 却同点炸在 `installer.nsi:33251`
// `File: failed opening file "…\descriptions\federatedAuthUserInfoRequestNoReturningUserFromFetchedAccounts.md"`，
// 而 v1.0.2/v1.0.3（内核 0.2.0-rc.2）同一条流水线正常出 Windows 包。
// 三条实测定性：
//   ① 墙在**构建机源路径**，不在安装路径：makensis 拿到的是 tauri.conf.json
//      `bundle.resources` 的 from 串**未归一化**的字面量（`…\src\app\..\..\..\package-payload\…`），
//      `..\..\..\` 一个字符都没被吃掉——同一次 CI 里 258 字符的邻居文件正常打进了包，
//      260 字符的中断，259 无实证（字母序在 260 那条之后，永远没走到）。
//   ② 本机前缀只有 30 字符（`D:\workspace\dsh\dsh-tauri\pp\`），CI 是 69
//      （`D:\a\dsh_desktop\dsh_desktop\…`）——**差 39 个字符，本机永远量不到**。
//   ③ 越线的 5 个文件全在 `@deepseek-ai/dsh-experimental-inspector/lib/devtools/
//      models/issues_manager/descriptions/*.md`（Chrome DevTools 前端按 URL 懒取的议题说明文本，
//      rc.2 的该包里 0 命中，0.2.1-rc.1 新增 236 条）——是内核换代带进来的，不是我们的靶文件。
// 所以判据按 CI 前缀算（CI 是发布通道），断点取**已证通过的 258**，
// 259 及以上一律按越线处理；剪除面是下面这份命名清单，清单外越线即拒绝打包——
// 宁可 staging 早失败，也不再让 makensis 跑了 20 分钟 mid-build 炸。
// ---------------------------------------------------------------------------

/** CI（windows-latest）的 workspace 与 tauri 配置目录：前缀常量的两个组成部分。 */
const NSIS_SOURCE_WORKSPACE = 'D:\\a\\dsh_desktop\\dsh_desktop';
const NSIS_SOURCE_CONFIG_DIR = 'dsh-tauri\\src-tauri\\src\\app';

/**
 * staging 相对配置目录的位置（= `tauri.conf.json` `bundle.resources` 的 from 串）。
 * 2026-11-12 结构性修法：原为 `../../../package-payload/dsh-desktop/`（36 字符），
 * 现为 `../../../pp/`（11 字符）——载荷直接铺在 `dsh-tauri/pp/` 下，安装态布局不变
 * （`resources/dsh-desktop/` 由 resources 的 to 半边映射）。一次腾出 25 字符。
 */
const NSIS_SOURCE_FROM_KEY = '../../../pp/';

/** CI（windows-latest）staging 的字面源路径前缀，含结尾分隔符；长度由单测咬住。 */
const NSIS_SOURCE_PREFIX_DEFAULT =
  NSIS_SOURCE_WORKSPACE + '\\' + NSIS_SOURCE_CONFIG_DIR + '\\..\\..\\..\\pp\\';

/**
 * 按 Windows 反斜杠拼出 makensis 口径的源路径前缀（与宿主平台无关）。
 * 门禁在 Linux/macOS runner 上也要跑同一套对账——用 path.sep 拼会让前缀随宿主分叉，
 * 2026-10-18 v1.0.5 首跑就是 Linux/macOS 两个 job 在此误判「前缀对不上」。
 */
function nsisSourcePrefixFrom(fromKey) {
  return NSIS_SOURCE_WORKSPACE + '\\' + NSIS_SOURCE_CONFIG_DIR + '\\'
    + fromKey.split('/').filter((s) => s.length).join('\\') + '\\';
}

/**
 * makensis 只存在于 Windows 构建。Linux/macOS 的 staging 也调同一道门禁（五处同改），
 * 但那里的树永远不会进 NSIS——macOS 本机装的 libreoffice-kit-darwin-arm64 带
 * LibreOffice.app 的长配置名，按 Windows 前缀量就是假阳性（2026-10-18 实测）。
 */
function nsisGateApplies(platform = process.platform) {
  return platform === 'win32';
}

/** makensis 源路径上限：258 实测通过 / 260 实测中断，259 无实证故按越线处理。 */
const NSIS_SOURCE_LIMIT = 258;

/** 越线文件所在目录（DevTools 议题说明文本，运行时按 URL 懒取，删掉不影响装载）。 */
const NSIS_SOURCE_PRUNE_DIR =
  'node_modules/@deepseek-ai/dsh-experimental-inspector/lib/devtools/models/issues_manager/descriptions/';

/**
 * 随包剪除：**目录级**，不是逐名清单。
 *
 * 历史上这里是一份 5 条的命名清单（v1.0.4 那批越线文件）。0.2.2-rc.2 换代时该目录一口气
 * 新增了大量长名议题说明文本，逐名列名已不可维护（一次 91 个越线）；配合 2026-11-12 的
 * staging 前缀结构性缩短（94 → 69 字符），这批文件本身已不再越线，但剪除决定保留：
 * 它们是 Chrome DevTools 前端按 URL 懒取的说明文本，运行时删掉不影响装载，少几 MB 更划算。
 * 门禁按「该目录下全部 .md 不进包」执行，代码见 stage-nsis-path-gate.mjs ②b。
 */
const NSIS_SOURCE_PRUNE_TREES = [
  // LibreOffice 的构建期输入（引擎源码 + *.patch），运行时用不到；program/ 才是运行时资源。
  'node_modules/@deepseek-ai/dsh-office-kit/node_modules/@deepseek-ai/libreoffice-kit-wasm/sources',
  'node_modules/@deepseek-ai/dsh-office-kit/node_modules/@deepseek-ai/libreoffice-kit-win32-x64/sources',
];

/**
 * 交付面应当剪除的插件内层 node_modules（相对 `assets/plugins` 的路径）。
 *
 * @param {Array<{name:string, shipsNodeModules?:boolean}>} plugins 在册配套件（COMPANION_PLUGINS）
 * @param {string[]} presentDirs `assets/plugins` 下实际存在的插件目录名
 * @param {(p:{name:string}) => string} dirNameOf 包名 → 源目录名（复用 companionDirName，别另造）
 * @returns {string[]} 需要删除的 `<dir>/node_modules` 列表
 */
function residueNodeModules(plugins, presentDirs, dirNameOf) {
  const shipped = new Set();
  for (const p of plugins) {
    if (p && p.shipsNodeModules) shipped.add(dirNameOf(p));
  }
  return presentDirs
    .filter((dir) => !shipped.has(dir))
    .map((dir) => dir + '/node_modules');
}

/**
 * 超长路径判据：输入 payload 相对路径（以 `/` 分隔），返回超限项。
 *
 * @param {string[]} relPaths 相对 payload 根的路径，如 `assets/plugins/x/lib/index.js`
 * @param {{prefix?:string, limit?:number}} [opts]
 * @returns {Array<{rel:string, len:number}>} 按长度降序
 */
function overlongFiles(relPaths, opts = {}) {
  const prefix = opts.prefix || INSTALL_PREFIX_DEFAULT;
  const limit = opts.limit || PATH_LIMIT_DEFAULT;
  return relPaths
    .map((rel) => ({ rel, len: (prefix + rel.replace(/\//g, '\\')).length }))
    .filter((r) => r.len > limit)
    .sort((a, b) => b.len - a.len);
}

/** 最长安装路径（用于门禁自述：即便全部合规也把实测值打出来，避免「静默通过」）。 */
function longestInstallPath(relPaths, opts = {}) {
  const prefix = opts.prefix || INSTALL_PREFIX_DEFAULT;
  let top = { rel: '', len: 0 };
  for (const rel of relPaths) {
    const len = (prefix + rel.replace(/\//g, '\\')).length;
    if (len > top.len) top = { rel, len };
  }
  return top;
}

/** 构建期（makensis 源路径）同款判据，前缀/上限钉死为 CI 实测口径——调用方不参与选参数。 */
function overlongSourceFiles(relPaths) {
  return overlongFiles(relPaths, { prefix: NSIS_SOURCE_PREFIX_DEFAULT, limit: NSIS_SOURCE_LIMIT });
}

/** 一条相对路径在 CI 源路径口径下的长度（自述用，避免「静默通过」）。 */
function sourcePathLength(rel) {
  return (NSIS_SOURCE_PREFIX_DEFAULT + rel.replace(/\//g, '\\')).length;
}

module.exports = {
  INSTALL_PREFIX_DEFAULT,
  PATH_LIMIT_DEFAULT,
  NSIS_SOURCE_PREFIX_DEFAULT,
  NSIS_SOURCE_WORKSPACE,
  NSIS_SOURCE_CONFIG_DIR,
  NSIS_SOURCE_FROM_KEY,
  NSIS_SOURCE_LIMIT,
  NSIS_SOURCE_PRUNE_DIR,
  NSIS_SOURCE_PRUNE_TREES,
  nsisSourcePrefixFrom,
  nsisGateApplies,
  residueNodeModules,
  overlongFiles,
  overlongSourceFiles,
  sourcePathLength,
  longestInstallPath,
};
