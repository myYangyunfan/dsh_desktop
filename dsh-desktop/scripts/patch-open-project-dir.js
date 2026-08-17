'use strict';

// 侧边栏「打开项目目录」运行时补丁（幂等、锚点不匹配时跳过且绝不损坏文件）。
//
// 背景：dsh 侧边栏工作区树的项目行/会话行只有「⋮」按钮菜单，没有右键菜单，
// 也没有「打开项目目录」入口。本补丁在官方包上做外科手术式扩展：
//
//   @deepseek-ai/dsh-client-ui-workspace —— 项目行与会话行的菜单数组各追加
//   「打开项目目录」项（id: "open-folder"），并在行 div 上挂 onContextMenu
//   （preventDefault + 以光标位置弹出同一菜单，走 Menu 的 getAnchorRect），
//    点击调用渲染侧桥 window.__dshDesktopOpenDir（由 dsh-session-manager 等
//    内置插件提供：window.dshDesktop.openPath → 宿主 dsh:file-open IPC →
//    shell.openPath，零新增 IPC）。
//
// 会话行没有 cwd 字段：组树视图由两个调用点把所属分组的 cwd 透传进
// SessionNodeItem（组视图 group.cwd / flat 视图 list.byId 反查）；cwd 为空
// （未分组/流浪会话）时「打开项目目录」项不显示。
//
// 用法：
//   node scripts/patch-open-project-dir.js [<node_modules 根目录>]
// 同时导出 patchOpenProjectDir(nmRoot, log) 供 main.js 启动补丁与 after-pack.js
// 打包补丁复用（覆盖内置副本 / profile fallback / agent overlay / dev）。

const fs = require('node:fs');
const path = require('node:path');
// 原子写与 main.js / 其它补丁脚本共用同一实现（scripts/lib/patch-io.js）。
const { writeFileAtomic } = require('./lib/patch-io');

const MARKER = 'dsh-desktop patch (open project dir)';

// ---------------------------------------------------------------------------
// 1. 项目行（ProjectRowItem）：菜单数组追加「打开项目目录」
// ---------------------------------------------------------------------------
const PROJ_MENU_ANCHOR = '\t\t\t\tid: "delete",\n\t\t\t\tlabel: t("delete.workspace"),\n\t\t\t\ticon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutline16, {}),\n\t\t\t\tdanger: true\n\t\t\t}];';
const PROJ_MENU_INSERT = '\t\t\t\tid: "delete",\n\t\t\t\tlabel: t("delete.workspace"),\n\t\t\t\ticon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutline16, {}),\n\t\t\t\tdanger: true\n\t\t\t}, {\n\t\t\t\t// dsh-desktop patch (open project dir): 打开项目目录。\n\t\t\t\tid: "open-folder",\n\t\t\t\tlabel: t("menu.openProjectDir"),\n\t\t\t\ticon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderOpen16, {})\n\t\t\t}];';

// 2. 项目行 onSelect 分发：放行 open-folder 并转发到渲染侧桥。
const PROJ_SELECT_ANCHOR = 'if (id !== "rename" && id !== "delete") return;\n\t\t\t\t\t\t\t\tif (id === "rename") actions.rename();\n\t\t\t\t\t\t\t\telse actions.delete();';
const PROJ_SELECT_INSERT = 'if (id !== "rename" && id !== "delete" && id !== "open-folder") return;\n\t\t\t\t\t\t\t\tif (id === "rename") actions.rename();\n\t\t\t\t\t\t\t\telse if (id === "delete") actions.delete();\n\t\t\t\t\t\t\t\telse if (id === "open-folder") window.__dshDesktopOpenDir?.(row.cwd);';

// 3. 项目行 div：menuPos 状态 + 右键弹出同一菜单（仅真实工作区行挂右键，
//    未分组 bucket 的 actions 为 undefined，不弹空菜单）。
const PROJ_SELECT_STATE_ANCHOR = 'const [menuOpen, setMenuOpen] = (0, react.useState)(false);\n\t\t\tconst workspaceMenuItems = [{';
const PROJ_SELECT_STATE_INSERT = 'const [menuOpen, setMenuOpen] = (0, react.useState)(false);\n\t\t\t// dsh-desktop patch (open project dir): 右键光标位置（null = 未右键，走 ⋮ 按钮锚点）。\n\t\t\tconst [menuPos, setMenuPos] = (0, react.useState)(null);\n\t\t\tconst workspaceMenuItems = [{';

const PROJ_CTX_ANCHOR = '\t\t\t\tonClick: onToggle,\n\t\t\t\tdraggable: drag !== void 0,';
const PROJ_CTX_INSERT = '\t\t\t\tonClick: onToggle,\n\t\t\t\tonContextMenu: actions === void 0 ? void 0 : (e) => {\n\t\t\t\t\te.preventDefault();\n\t\t\t\t\te.stopPropagation();\n\t\t\t\t\tsetMenuPos({ x: e.clientX, y: e.clientY });\n\t\t\t\t\tsetMenuOpen(true);\n\t\t\t\t},\n\t\t\t\tdraggable: drag !== void 0,';

// 4. 项目行 Menu：portal 模式用光标矩形定位（右键时）；⋮ 按钮点击复位 menuPos。
//    注意：Menu place() 的定位分支读取 r.left / r.bottom / r.right，矩形必须
//    提供完整四边（缺 right/bottom 会让坐标算出 NaN，弹层落回静态位置）。
const PROJ_MENU_RECT_ANCHOR = '\t\t\t\t\t\t\tportal: true,\n\t\t\t\t\t\t\tcloseOnPointerLeave: true,\n\t\t\t\t\t\t\tanchor: (0, react_jsx_runtime.jsx)("button", {';
const PROJ_MENU_RECT_INSERT = '\t\t\t\t\t\t\tportal: true,\n\t\t\t\t\t\t\tcloseOnPointerLeave: true,\n\t\t\t\t\t\t\tgetAnchorRect: menuPos === null ? void 0 : () => ({ left: menuPos.x, top: menuPos.y, right: menuPos.x + 1, bottom: menuPos.y + 1, width: 0, height: 0 }),\n\t\t\t\t\t\t\tanchor: (0, react_jsx_runtime.jsx)("button", {';
// v1 升级：旧矩形缺 right/bottom（NaN 定位 bug，弹层固定在上方）→ 补全四边。
const PROJ_MENU_RECT_UPGRADE_ANCHOR = 'getAnchorRect: menuPos === null ? void 0 : () => ({ left: menuPos.x, top: menuPos.y, width: 0, height: 0 }),';
const PROJ_MENU_RECT_UPGRADE_INSERT = 'getAnchorRect: menuPos === null ? void 0 : () => ({ left: menuPos.x, top: menuPos.y, right: menuPos.x + 1, bottom: menuPos.y + 1, width: 0, height: 0 }),';

const PROJ_BTN_ANCHOR = 'onClick: (e) => {\n\t\t\t\t\t\t\t\t\te.stopPropagation();\n\t\t\t\t\t\t\t\t\tsetMenuOpen((v) => !v);\n\t\t\t\t\t\t\t\t},';
const PROJ_BTN_INSERT = 'onClick: (e) => {\n\t\t\t\t\t\t\t\t\te.stopPropagation();\n\t\t\t\t\t\t\t\t\tsetMenuPos(null);\n\t\t\t\t\t\t\t\t\tsetMenuOpen((v) => !v);\n\t\t\t\t\t\t\t\t},';

// ---------------------------------------------------------------------------
// 5. 会话行（SessionNodeItem）：签名加 cwd prop + menuPos 状态
// ---------------------------------------------------------------------------
const SESS_SIG_ANCHOR = '\t\tfunction SessionNodeItem({ node, currentId, now, onOpen, onRename, onFork, onArchive, drag, flat = false, t }) {';
const SESS_SIG_INSERT = '\t\tfunction SessionNodeItem({ node, currentId, now, onOpen, onRename, onFork, onArchive, drag, flat = false, t, cwd }) {';

const SESS_STATE_ANCHOR = 'const [menuOpen, setMenuOpen] = (0, react.useState)(false);\n\t\t\tconst sessionMenuItems = [';
const SESS_STATE_INSERT = 'const [menuOpen, setMenuOpen] = (0, react.useState)(false);\n\t\t\t// dsh-desktop patch (open project dir): 右键光标位置（null = 未右键，走 ⋮ 按钮锚点）。\n\t\t\tconst [menuPos, setMenuPos] = (0, react.useState)(null);\n\t\t\tconst sessionMenuItems = [';

// 6. 会话行菜单数组：delete 之后追加「打开项目目录」（cwd 为空时不显示）。
const SESS_MENU_ANCHOR = '\t\t\t\t// dsh-desktop patch (session manage): 归档下方增加删除。\n\t\t\t\t{\n\t\t\t\t\tid: "delete",\n\t\t\t\t\tlabel: t("menu.deleteSession")\n\t\t\t\t}\n\t\t\t];';
const SESS_MENU_INSERT = '\t\t\t\t// dsh-desktop patch (session manage): 归档下方增加删除。\n\t\t\t\t{\n\t\t\t\t\tid: "delete",\n\t\t\t\t\tlabel: t("menu.deleteSession")\n\t\t\t\t},\n\t\t\t\t// dsh-desktop patch (open project dir): 有项目目录时追加「打开项目目录」。\n\t\t\t\t...(cwd ? [{\n\t\t\t\t\tid: "open-folder",\n\t\t\t\t\tlabel: t("menu.openProjectDir")\n\t\t\t\t}] : [])\n\t\t\t];';

// 7. 会话行 onSelect 分发：open-folder → 渲染侧桥（cwd 来自新 prop）。
const SESS_SELECT_ANCHOR = '\t\t\t\t\t\t\t\t\tif (id === "delete") window.__dshSessionManager?.deleteSession(node.id);';
const SESS_SELECT_INSERT = '\t\t\t\t\t\t\t\t\tif (id === "delete") window.__dshSessionManager?.deleteSession(node.id);\n\t\t\t\t\t\t\t\t\tif (id === "open-folder") window.__dshDesktopOpenDir?.(cwd);';

// 8. 会话行 div：右键弹出同一菜单。
const SESS_CTX_ANCHOR = '\t\t\t\t\tonClick: () => {\n\t\t\t\t\t\tonOpen(node.id);\n\t\t\t\t\t},\n\t\t\t\t\tdraggable: drag !== void 0,';
const SESS_CTX_INSERT = '\t\t\t\t\tonClick: () => {\n\t\t\t\t\t\tonOpen(node.id);\n\t\t\t\t\t},\n\t\t\t\t\tonContextMenu: (e) => {\n\t\t\t\t\t\te.preventDefault();\n\t\t\t\t\t\te.stopPropagation();\n\t\t\t\t\t\tsetMenuPos({ x: e.clientX, y: e.clientY });\n\t\t\t\t\t\tsetMenuOpen(true);\n\t\t\t\t\t},\n\t\t\t\t\tdraggable: drag !== void 0,';

// 9. 会话行 Menu：portal 模式用光标矩形定位；⋮ 按钮点击复位 menuPos。
const SESS_MENU_RECT_ANCHOR = '\t\t\t\t\t\t\t\tportal: true,\n\t\t\t\t\t\t\t\tcloseOnPointerLeave: true,\n\t\t\t\t\t\t\t\tanchor: (0, react_jsx_runtime.jsx)("button", {';
const SESS_MENU_RECT_INSERT = '\t\t\t\t\t\t\t\tportal: true,\n\t\t\t\t\t\t\t\tcloseOnPointerLeave: true,\n\t\t\t\t\t\t\t\tgetAnchorRect: menuPos === null ? void 0 : () => ({ left: menuPos.x, top: menuPos.y, right: menuPos.x + 1, bottom: menuPos.y + 1, width: 0, height: 0 }),\n\t\t\t\t\t\t\t\tanchor: (0, react_jsx_runtime.jsx)("button", {';
// v1 升级：旧矩形缺 right/bottom（NaN 定位 bug，弹层固定在上方）→ 补全四边。
const SESS_MENU_RECT_UPGRADE_ANCHOR = 'getAnchorRect: menuPos === null ? void 0 : () => ({ left: menuPos.x, top: menuPos.y, width: 0, height: 0 }),';
const SESS_MENU_RECT_UPGRADE_INSERT = 'getAnchorRect: menuPos === null ? void 0 : () => ({ left: menuPos.x, top: menuPos.y, right: menuPos.x + 1, bottom: menuPos.y + 1, width: 0, height: 0 }),';

const SESS_BTN_ANCHOR = 'onClick: (e) => {\n\t\t\t\t\t\t\t\t\t\te.stopPropagation();\n\t\t\t\t\t\t\t\t\t\tsetMenuOpen((v) => !v);\n\t\t\t\t\t\t\t\t\t},';
const SESS_BTN_INSERT = 'onClick: (e) => {\n\t\t\t\t\t\t\t\t\t\te.stopPropagation();\n\t\t\t\t\t\t\t\t\t\tsetMenuPos(null);\n\t\t\t\t\t\t\t\t\t\tsetMenuOpen((v) => !v);\n\t\t\t\t\t\t\t\t\t},';

// 10. 会话行调用点透传 cwd：组树视图（group.cwd）与 flat 视图（list.byId 反查）。
const SESS_GROUP_CALL_ANCHOR = '\t\t\t\t\t\t\t\t\t\treturn (0, react_jsx_runtime.jsx)(SessionNodeItem, {\n\t\t\t\t\t\t\t\t\t\t\tnode,';
const SESS_GROUP_CALL_INSERT = '\t\t\t\t\t\t\t\t\t\treturn (0, react_jsx_runtime.jsx)(SessionNodeItem, {\n\t\t\t\t\t\t\t\t\t\t\tnode,\n\t\t\t\t\t\t\t\t\t\t\t// dsh-desktop patch (open project dir): 透传所属分组的项目目录。\n\t\t\t\t\t\t\t\t\t\t\tcwd: group.cwd,';

const SESS_FLAT_CALL_ANCHOR = '\t\t\t\t\t\treturn (0, react_jsx_runtime.jsx)(SessionNodeItem, {\n\t\t\t\t\t\t\tnode,';
const SESS_FLAT_CALL_INSERT = '\t\t\t\t\t\treturn (0, react_jsx_runtime.jsx)(SessionNodeItem, {\n\t\t\t\t\t\t\tnode,\n\t\t\t\t\t\t\t// dsh-desktop patch (open project dir): 从原始摘要反查项目目录。\n\t\t\t\t\t\t\tcwd: list.byId[node.id]?.cwd,';

// 11. 翻译：中英字典各补一个 key。
const UI_ZH_ANCHOR = '\t\t\t"menu.deleteSession": "删除对话",';
const UI_ZH_INSERT = '\t\t\t"menu.deleteSession": "删除对话",\n\t\t\t"menu.openProjectDir": "打开项目目录",';
const UI_EN_ANCHOR = '\t\t\t"menu.deleteSession": "Delete conversation",';
const UI_EN_INSERT = '\t\t\t"menu.deleteSession": "Delete conversation",\n\t\t\t"menu.openProjectDir": "Open project folder",';

// ---------------------------------------------------------------------------
// 工具：在文件中做「锚点必须存在 + 标记幂等」的替换（与 patch-session-manage
// 同一实现；无历史版本，upgradeRules 恒空，保留参数以对齐调用形态）。
// ---------------------------------------------------------------------------
function applyReplacements(file, replacements, upgradeRules, log) {
  let src;
  try {
    src = fs.readFileSync(file, 'utf8');
  } catch (err) {
    log('open-project-dir 补丁: 读取失败 ' + file + ': ' + err.message);
    return false;
  }
  if (src.includes(MARKER)) {
    let upgraded = false;
    for (const { anchor, insert } of upgradeRules) {
      if (src.includes(anchor)) {
        src = src.replace(anchor, insert);
        upgraded = true;
      }
    }
    if (upgraded) {
      try {
        writeFileAtomic(file, src);
        log('open-project-dir 补丁: 已升级 ' + file);
        return true;
      } catch (err) {
        log('open-project-dir 补丁: 升级写入失败 ' + file + ': ' + err.message);
        return false;
      }
    }
    log('open-project-dir 补丁: 已应用，跳过 ' + file);
    return false;
  }
  for (const { anchor, insert } of replacements) {
    if (!src.includes(anchor)) {
      log('open-project-dir 补丁: 锚点未匹配（dsh 版本可能已变化），跳过 ' + file + ' :: ' + anchor.slice(0, 60));
      return false;
    }
    src = src.replace(anchor, insert);
  }
  src = '// ' + MARKER + ': 侧边栏「打开项目目录」运行时补丁\n' + src;
  try {
    writeFileAtomic(file, src);
    log('open-project-dir 补丁: 已应用 ' + file);
    return true;
  } catch (err) {
    log('open-project-dir 补丁: 写入失败 ' + file + ': ' + err.message);
    return false;
  }
}

/**
 * 对某个 node_modules 根目录应用「打开项目目录」补丁（幂等）。
 * @param {string} nmRoot node_modules 根目录
 * @param {(msg: string) => void} [log]
 * @returns {number} 实际发生修改的文件数
 */
function patchOpenProjectDir(nmRoot, log = () => {}) {
  const targets = [
    {
      file: path.join(nmRoot, '@deepseek-ai', 'dsh-client-ui-workspace', 'lib', 'client.js'),
      replacements: [
        { anchor: PROJ_MENU_ANCHOR, insert: PROJ_MENU_INSERT },
        { anchor: PROJ_SELECT_ANCHOR, insert: PROJ_SELECT_INSERT },
        { anchor: PROJ_SELECT_STATE_ANCHOR, insert: PROJ_SELECT_STATE_INSERT },
        { anchor: PROJ_CTX_ANCHOR, insert: PROJ_CTX_INSERT },
        { anchor: PROJ_MENU_RECT_ANCHOR, insert: PROJ_MENU_RECT_INSERT },
        { anchor: PROJ_BTN_ANCHOR, insert: PROJ_BTN_INSERT },
        { anchor: SESS_SIG_ANCHOR, insert: SESS_SIG_INSERT },
        { anchor: SESS_STATE_ANCHOR, insert: SESS_STATE_INSERT },
        { anchor: SESS_MENU_ANCHOR, insert: SESS_MENU_INSERT },
        { anchor: SESS_SELECT_ANCHOR, insert: SESS_SELECT_INSERT },
        { anchor: SESS_CTX_ANCHOR, insert: SESS_CTX_INSERT },
        { anchor: SESS_MENU_RECT_ANCHOR, insert: SESS_MENU_RECT_INSERT },
        { anchor: SESS_BTN_ANCHOR, insert: SESS_BTN_INSERT },
        { anchor: SESS_GROUP_CALL_ANCHOR, insert: SESS_GROUP_CALL_INSERT },
        { anchor: SESS_FLAT_CALL_ANCHOR, insert: SESS_FLAT_CALL_INSERT },
        { anchor: UI_ZH_ANCHOR, insert: UI_ZH_INSERT },
        { anchor: UI_EN_ANCHOR, insert: UI_EN_INSERT },
      ],
      // v1 → v2 升级：v1 的 getAnchorRect 矩形缺 right/bottom，Menu place()
      // 用 r.bottom/r.right 算坐标得到 NaN，弹层固定在上方不跟随光标。
      upgradeRules: [
        { anchor: PROJ_MENU_RECT_UPGRADE_ANCHOR, insert: PROJ_MENU_RECT_UPGRADE_INSERT },
        { anchor: SESS_MENU_RECT_UPGRADE_ANCHOR, insert: SESS_MENU_RECT_UPGRADE_INSERT },
      ],
    },
  ];
  let changed = 0;
  for (const t of targets) {
    if (!fs.existsSync(t.file)) continue;
    if (applyReplacements(t.file, t.replacements, t.upgradeRules || [], log)) changed += 1;
  }
  return changed;
}

module.exports = { patchOpenProjectDir, MARKER };

if (require.main === module) {
  const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..', 'node_modules');
  const n = patchOpenProjectDir(root, (m) => console.log(m));
  console.log(n > 0 ? `patched ${n} file(s) — restart DSH Desktop to pick it up` : 'nothing to patch (already up to date)');
}