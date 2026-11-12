'use strict';

// 侧栏「打开项目目录」（issue #85）运行时补丁（幂等、锚点不匹配时跳过且绝不
// 损坏文件）。
//
// 背景：dsh 的侧栏项目行 / 会话行 ⋯ 菜单没有「打开项目目录」入口，也无法用
// 右键直接呼出行菜单。本补丁在官方包 dsh-client-ui-workspace 上做外科手术式
// 扩展：
//
//   1. 项目行菜单追加「打开项目目录」（文件夹图标），点击调
//      window.dshDesktop.openPath(path)——0.2.2-rc.1 起重锚为 contextMenus 数据项：
//      target "workspace"、order 200，path 直接取 trigger 目标里的 row.cwd；
//   2. 会话行「打开项目目录」——同一套 contextMenus 数据项，target "session"、
//      order 500；cwd 从 sessions 快照反查（summary.cwd），查不到（孤儿 /
//      未分组会话）或桥缺失时 resolve 返回空数组 = 整行不渲染；
//   3. 右键菜单本身已是上游原生能力（0.2.2-rc.1 引入 ctx.contextMenus 服务，
//      行的 getTriggerProps 同时接右键与 ⋯ 按钮），本补丁历史上自造的
//      onContextMenu / menuRect / getAnchorRect 三项随之整体退役。
//
// 桥 openPath 为本项目 Tauri 宿主自己暴露的能力
// （src-tauri/crates/bridge/dist/bridge-shim.js 里 window.dshDesktop.openPath →
// invoke file_open），不是官方全局对象；桥缺失时（纯浏览器）`?.` 可选链静默
// 降级为无操作，且会话行菜单项直接不渲染。
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
// 1. dsh-client-ui-workspace：项目行 / 会话行菜单 + 右键菜单
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 0.2.2-rc.1 重锚（结构性重构）：上游把两个行菜单都搬到 `ctx.contextMenus`
// 服务上，于是本补丁原来三组锚点整体失效：
//   · 项目行：`workspaceMenuItems` 内联数组 + `<Menu onSelect/getAnchorRect>`
//     + `⋯ 按钮 onClick 里 setMenuRect` 全部删除，改为 `getTriggerProps(...)`
//     （由 useContextMenu() 提供，右键与 ⋯ 共用）+ `openWorkspaceMenu(...)`
//     ——右键菜单成为上游原生能力，本补丁的 onContextMenu / menuRect /
//     getAnchorRect 三项因此整体退役，不再需要注入；
//   · 会话行：内联数组 →（0.2.1）slot 列表 →（0.2.2）
//     `registerSessionMenus(ctx, actions)` 里的 contextMenus 数据项；
//   · 菜单项因此由「组件 + slot 注册」变成纯数据：
//     { id, label, icon?: { key }, separatorBefore?, run }。
// 现在的注入面只剩三处：① 图标键（contextMenu.icon 槽）；② 工作区目标菜单项；
// ③ 会话目标菜单项；另加 zh/en 文案。分组行与未分组行共用同一个 ProjectRow
// （ProjectRowItem(props) 只按 group.workspaceId 分派到 WorkspaceProjectRow /
// UngroupedProjectRow，两者都是 ProjectRow 的薄包装），而 workspace 目标
// 菜单项的上游门控是 `row.workspaceId !== void 0 && row.cwd !== void 0`——
// 未分组桶本来就没有 cwd / workspaceId，上游也不给它 ⋯ 按钮，故它名下没有
// 「打开项目目录」可放（不是本补丁丢了一半）。
// ---------------------------------------------------------------------------

// 1a. 图标：把「打开项目目录」的文件夹图标注册进 contextMenu.icon 槽。
//     0.2.2-rc.2 重锚：`lib/client.js` 已是压缩产物（整包 5 行、对象字面量无空格、
//     键仍是双引号），旧的多行 + 制表符锚点失效。现锚原生图标表最后一条
//     `"workspace.copy":…IconCopyOutlineRegular`（全文件唯一，值与 `}))` 紧邻）。
const UI_ICON_ANCHOR = '"workspace.copy":_deepseek_ai_dsh_client_ui_primitives.IconCopyOutlineRegular';
const UI_ICON_INSERT = [
	'"workspace.copy":_deepseek_ai_dsh_client_ui_primitives.IconCopyOutlineRegular,',
	'// dsh-desktop patch (open project dir): 「打开项目目录」的文件夹图标。',
	'"workspace.openDir":_deepseek_ai_dsh_client_ui_primitives.IconFolderOpenRegular',
].join('\n');

// 1b. 项目行菜单：工作区目标（workspace）的数据项，排在 rename(100) 之后、
//     delete(300) 之前。path 由上游 trigger 已放进 target.value（openWorkspaceMenu
//     的第 2 个实参就是 row.cwd），故不再需要自己反查 cwd。
//     0.2.2-rc.2 压缩形：`register({…}),\`workspace: delete menu action\`);` 单行。
const UI_PROJECT_MENU_ANCHOR = '}),`workspace: delete menu action`);';
const UI_PROJECT_MENU_INSERT = [
	UI_PROJECT_MENU_ANCHOR,
	'// dsh-desktop patch (open project dir): 工作区分组行「打开项目目录」。',
	'ctx.effect(()=>ctx.contextMenus.register({id:`workspace.openDir`,target:`workspace`,order:200,resolve:({path})=>typeof window.dshDesktop?.openPath==="function"&&typeof path==="string"&&path!==""?[{id:`open-folder`,label:ctx.locale.bind(NS)(`menu.openProjectDir`),icon:{key:`workspace.openDir`},run:()=>{window.dshDesktop?.openPath?.(path)}}]:[]}),`workspace: open project directory`);',
].join('\n');

// 1c. 会话行菜单：会话目标（session）的数据项，order 500。cwd 由 sessions 快照
//     反查（summary.cwd）；孤儿 / 未分组会话查不到、或宿主桥缺失（纯浏览器）时
//     resolve 返回空数组 = 整行不渲染。
const UI_SESSION_MENU_ANCHOR = 'register(`id`,450,[],target=>[{id:`copy`,label:t(`menu.sessionId`),icon:{key:`workspace.copy`},separatorBefore:true,run:()=>actions.copySessionId(target.sessionId)}]);';
const UI_SESSION_MENU_INSERT = [
	UI_SESSION_MENU_ANCHOR,
	'// dsh-desktop patch (open project dir): 会话行菜单「打开项目目录」（order 500）。',
	'register(`openDir`,500,[],target=>{const dshSessionCwd=ctx.sessions.list.getSnapshot().byId[target.sessionId]?.cwd;if(typeof window.dshDesktop?.openPath!=="function"||typeof dshSessionCwd!=="string"||dshSessionCwd==="")return[];return[{id:`open-folder`,label:t(`menu.openProjectDir`),icon:{key:`workspace.openDir`},run:()=>{window.dshDesktop?.openPath?.(dshSessionCwd)}}];});',
].join('\n');

// 2. 翻译：zh / en（锚原生 menu.unarchiveSession 行，插入其前，不与其它补丁
//    链式依赖——本补丁插前、workspace-pin 插后，两者顺序无关）。
//    0.2.2-rc.2：字典值改模板字面量、键仍双引号、逗号后无空格。
const UI_ZH_ANCHOR = '"menu.unarchiveSession":`取消归档`,';
const UI_ZH_INSERT = '"menu.openProjectDir":`打开项目目录`,"menu.unarchiveSession":`取消归档`,';
const UI_EN_ANCHOR = '"menu.unarchiveSession":`Unarchive session`,';
const UI_EN_INSERT = '"menu.openProjectDir":`Open project directory`,"menu.unarchiveSession":`Unarchive session`,';

const UI_REPLACEMENTS = [
  { anchor: UI_ICON_ANCHOR, insert: UI_ICON_INSERT },
  { anchor: UI_PROJECT_MENU_ANCHOR, insert: UI_PROJECT_MENU_INSERT },
  { anchor: UI_SESSION_MENU_ANCHOR, insert: UI_SESSION_MENU_INSERT },
  { anchor: UI_ZH_ANCHOR, insert: UI_ZH_INSERT },
  { anchor: UI_EN_ANCHOR, insert: UI_EN_INSERT },
];

// ---------------------------------------------------------------------------
// 工具：在文件中做「锚点必须存在 + 标记幂等」的替换
// ---------------------------------------------------------------------------
function applyReplacements(file, replacements, log, stats, options) {
  let src;
  try {
    src = fs.readFileSync(file, 'utf8');
  } catch (err) {
    log('open-project-dir 补丁: 读取失败 ' + file + ': ' + err.message);
    return false;
  }
  if (src.includes(MARKER)) {
    log('open-project-dir 补丁: 已应用，跳过 ' + file);
    return false;
  }
  for (const { anchor, insert } of replacements) {
    if (!src.includes(anchor)) {
      log('open-project-dir 补丁: 锚点未匹配（dsh 版本可能已变化），跳过 ' + file + ' :: ' + anchor.slice(0, 60));
      if (stats) stats.anchorMissing += 1;
      return false;
    }
    src = src.replace(anchor, insert);
  }
  src = '// ' + MARKER + ': 侧栏「打开项目目录」+ 右键菜单（issue #85）\n' + src;
  try {
    if (options && options.dryRun) {
      log('open-project-dir 补丁: dry-run: 将应用 ' + file);
      return false; // dryRun 不落盘，不计为已写
    }
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
function patchOpenProjectDir(nmRoot, log = () => {}, stats, options) {
  const targets = [
    {
      file: path.join(nmRoot, '@deepseek-ai', 'dsh-client-ui-workspace', 'lib', 'client.js'),
      replacements: UI_REPLACEMENTS,
    },
  ];
  let changed = 0;
  for (const t of targets) {
    if (!fs.existsSync(t.file)) continue;
    if (applyReplacements(t.file, t.replacements, log, stats, options)) changed += 1;
  }
  return changed;
}

/** 测试用：构造一份包含全部 UI 锚点的最小夹具（unit-open-project-dir.test.js 使用）。 */
function buildUiFixture() {
  return UI_REPLACEMENTS.map((r) => r.anchor).join('\n// ---- 夹具分隔 ----\n') + '\n';
}

module.exports = { patchOpenProjectDir, MARKER, buildUiFixture, UI_REPLACEMENTS };

if (require.main === module) {
  const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..', 'node_modules');
  const n = patchOpenProjectDir(root, (m) => console.log(m));
  console.log(n > 0 ? `patched ${n} file(s) — restart DSH Desktop to pick it up` : 'nothing to patch (already up to date)');
}
