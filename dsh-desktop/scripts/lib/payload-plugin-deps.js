'use strict';

// ---------------------------------------------------------------------------
// 内置线（v1.0.0，2026-10-08 裁定：`assets/plugins` 整树进安装包）带来的两条
// **只属于交付面**的风险，判据收敛在这里，编排（走盘 / 删除 / 报错）留在调用方
// `dsh-tauri/scripts/stage-plugin-gate.mjs` 与 CI staging。
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
// ---------------------------------------------------------------------------

/** 最坏情况安装根前缀（currentUser 缺省 `%LOCALAPPDATA%`，但 Program Files 更长更严）。 */
const INSTALL_PREFIX_DEFAULT = 'C:\\Program Files\\DSH Desktop\\resources\\dsh-desktop\\';

/** 上限留 20 字符余量：用户可自选更深的安装目录，260 是打包器的断点而不是我们的判据。 */
const PATH_LIMIT_DEFAULT = 240;

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

module.exports = {
  INSTALL_PREFIX_DEFAULT,
  PATH_LIMIT_DEFAULT,
  residueNodeModules,
  overlongFiles,
  longestInstallPath,
};
