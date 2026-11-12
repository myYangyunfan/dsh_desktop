'use strict';

// 侧栏工作区「置顶」运行时补丁（幂等、锚点不匹配时跳过且绝不损坏文件）。
//
// 背景：左侧栏的工作区分组行 ⋯ 菜单只有 重命名/删除/打开项目目录，常用
// 工作区多了以后要靠手动拖拽排前——本补丁给 ⋯ 菜单加「置顶到列表顶部」：
//   · 可多选：置顶的工作区恒排最前，按置顶时间降序（最近置顶在最上）；
//   · 未置顶区保持宿主原序（手动排序/拖拽/最近更新均不受影响）；
//   · 持久化：localStorage（键 dsh-desktop.workspace-pins.v1，值
//     { [workspaceId]: pinMillis }），按工作区 id 记账，重命名不丢；
//   · 未分组桶（无 workspaceId）不显示置顶项；
//   · 视觉：置顶行 folder 图标着主题色 + 标题前主题色小圆点
//     （inline style，零 CSS 注入，深浅主题自动跟随）。
//
// 响应式：模块级 store（map + version + listeners）+ useWorkspacePinVersion
// hook 订阅版本号；SessionTree 把版本号塞进 groups useMemo 的 deps ——
// 切换置顶即时重排，无需整页刷新。
//
// 锚点新鲜度（0.2.2-rc.1 重锚）：
//   · UI_CORE 锚 ProjectRowItem(props) 分派器行（旧的多字段解构签名已不存在）；
//   · UI_HOOKS / UI_FOLDER / UI_TITLE 锚 ProjectRow 本体（分组行与未分组行
//     共用的那个组件，两个薄包装都落到它），全文件唯一整行命中；
//   · UI_MENU 锚原生 workspace.rename 菜单注册的收尾行 —— 0.2.2-rc.1 把项目行
//     菜单整体搬到 ctx.contextMenus 服务，旧的 workspaceMenuItems 数组 /
//     onSelect id guard 两个锚点已消失，菜单项改为数据项注册；
//   · UI_TREE 锚 SessionTree 的 expandedGroups useMemo，UI_DEPS 锚 groups useMemo
//     deps 尾段（含 statuses），两者同函数体，由 verifyVersionScope() 配对校验，
//     不通过则整体放弃本补丁；
//   · UI_ZH/UI_EN 锚原生 "menu.unarchiveSession" 行（本补丁插入其后，
//     open-project-dir 插入其前，两者顺序无关）。
//
// 与 open-project-dir（order 200）互不依赖：两补丁锚点字节区间不重叠，且各自
// insert 都保留自己的锚，任意先后都能命中。
//
// 用法：
//   node scripts/patch-workspace-pin.js [<node_modules 根目录>]
// 同时导出 patchWorkspacePin(nmRoot, log) 供 boot 补丁链与打包复用。

const fs = require('node:fs');
const path = require('node:path');
const { writeFileAtomic } = require('./lib/patch-io');

const MARKER = 'dsh-desktop patch (workspace pin)';

// ---------------------------------------------------------------------------
// 核心 store + 排序逻辑（注入 bundle 的原文；单测直接 eval 本常量验行为，
// 保证「测试验的」与「注入跑的」是同一份代码）。
// ---------------------------------------------------------------------------
const CORE = [
	'// dsh-desktop patch (workspace pin): 工作区置顶 store —— localStorage 持久化',
	'// （键 dsh-desktop.workspace-pins.v1，值 { [workspaceId]: pinMillis }），版本号',
	'// 通知重渲染；置顶行按 pinMillis 降序排最前（最近置顶最上），可多个并存，',
	'// 未置顶区保持宿主原序（手动排序/拖拽不受影响）。未分组桶无 workspaceId，',
	'// 永不参与。损坏/缺位的 localStorage 内容整体忽略（容错优先）。',
	'const DSH_WS_PINS_KEY = "dsh-desktop.workspace-pins.v1";',
	'const dshWorkspacePins = { map: {}, version: 0, listeners: /* @__PURE__ */ new Set() };',
	'try {',
	'	const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(DSH_WS_PINS_KEY);',
	'	if (raw) {',
	'		const parsed = JSON.parse(raw);',
	'		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {',
	'			for (const [k, v] of Object.entries(parsed)) if (typeof v === "number") dshWorkspacePins.map[k] = v;',
	'		}',
	'	}',
	'} catch {}',
	'function dshWorkspacePinState(id) {',
	'	return id !== void 0 && Object.prototype.hasOwnProperty.call(dshWorkspacePins.map, id);',
	'}',
	'function dshToggleWorkspacePin(id) {',
	'	if (id === void 0) return;',
	'	if (Object.prototype.hasOwnProperty.call(dshWorkspacePins.map, id)) delete dshWorkspacePins.map[id];',
	'	else {',
	'		// 同毫秒连点：新 pin 时间戳保证严格大于既有全部（最近置顶恒最上，',
	'		// 排序确定性；与真实时间至多差几个 ms，语义不变）。',
	'		let next = Date.now();',
	'		for (const v of Object.values(dshWorkspacePins.map)) if (v >= next) next = v + 1;',
	'		dshWorkspacePins.map[id] = next;',
	'	}',
	'	try { localStorage.setItem(DSH_WS_PINS_KEY, JSON.stringify(dshWorkspacePins.map)); } catch {}',
	'	dshWorkspacePins.version += 1;',
	'	for (const fn of dshWorkspacePins.listeners) {',
	'		try { fn(); } catch {}',
	'	}',
	'}',
	'function dshUseWorkspacePinVersion() {',
	'	const [v, setV] = (0, react.useState)(dshWorkspacePins.version);',
	'	(0, react.useEffect)(() => {',
	'		const fn = () => setV(dshWorkspacePins.version);',
	'		dshWorkspacePins.listeners.add(fn);',
	'		return () => { dshWorkspacePins.listeners.delete(fn); };',
	'	}, []);',
	'	return v;',
	'}',
	'function dshApplyWorkspacePins(groups) {',
	'	let hasPinned = false;',
	'	for (const g of groups) {',
	'		if (g.workspaceId !== void 0 && Object.prototype.hasOwnProperty.call(dshWorkspacePins.map, g.workspaceId)) { hasPinned = true; break; }',
	'	}',
	'	if (!hasPinned) return groups;',
	'	const pinned = [], rest = [];',
	'	for (const g of groups) {',
	'		if (g.workspaceId !== void 0 && Object.prototype.hasOwnProperty.call(dshWorkspacePins.map, g.workspaceId)) pinned.push(g);',
	'		else rest.push(g);',
	'	}',
	'	pinned.sort((a, b) => dshWorkspacePins.map[b.workspaceId] - dshWorkspacePins.map[a.workspaceId]);',
	'	return [...pinned, ...rest];',
	'}',
].join('\n');

// ---------------------------------------------------------------------------
// dsh-client-ui-workspace/lib/client.js 的外科手术点
// ---------------------------------------------------------------------------

// 1a. store + 排序逻辑注入（模块工厂作用域，ProjectRowItem 分派器之前）。
// 0.2.2-rc.1 重锚：上游把行渲染拆成 ProjectRowItem(props) 分派器 +
// WorkspaceProjectRow / UngroupedProjectRow 两个薄包装，三者最终都渲染同一个
// ProjectRow（真正持有 label / 菜单 / 图标 / 标题的组件）。因此 store 挂在
// 模块作用域（锚分派器行即可），行内注入（1b/1e/1f）挂在 ProjectRow 本体上，
// **分组行与未分组行共用同一处注入**——两半都由这一处覆盖，未分组半边由
// row.workspaceId === void 0 的既有判据排除（上游同样不给它工作区菜单）。
// 1a 的 0.2.2-rc.2 重锚：`lib/client.js` 起改成压缩产物（整包 5 行、函数间无换行、
// 三元式/对象字面量无空格），旧的「多行 + 制表符」锚点整体失效。现锚取函数声明本身
// 的单行字节（全文件唯一），不依赖任何缩进/换行。
const UI_CORE_ANCHOR = 'function ProjectRowItem(props){';
const UI_CORE_INSERT = CORE + '\n' + UI_CORE_ANCHOR;

// 1b. 行内 hooks 区：订阅版本号 + 读取置顶态（无条件 hook，Rules of Hooks 安全）。
// 0.2.2-rc.2：该 label 行仍在 ProjectRow 体内（分组行与未分组行共用），压缩后单行，
// 全文件唯一命中，且紧随 `const row=group;` —— row 已声明。
const UI_HOOKS_ANCHOR = [
	'const label=row.workspaceId===void 0?t(`group.ungrouped`):row.label;',
].join('\n');
const UI_HOOKS_INSERT = [
	'const label=row.workspaceId===void 0?t(`group.ungrouped`):row.label;',
	'// dsh-desktop patch (workspace pin): 订阅版本号驱动重渲染 + 读取置顶态。',
	'dshUseWorkspacePinVersion();',
	'const dshPinned=dshWorkspacePinState(row.workspaceId);',
].join('\n');

// 1c. 菜单项：工作区行 ⋯ 菜单加「置顶/取消置顶」数据项。
// 0.2.2-rc.2 重锚：项目行菜单仍是 ctx.contextMenus 数据项，但整段压缩成一行，
// 注册收尾的 tag 改模板字面量（`}),\`workspace: rename menu action\`);`）。order 200
// 排在 rename(100) 与 delete(300) 之间；未分组桶没有 workspaceId，上游也不为它开
// 工作区菜单，故不显示置顶项（与旧语义一致）。
const UI_MENU_ANCHOR = '}),`workspace: rename menu action`);';
const UI_MENU_INSERT = [
	UI_MENU_ANCHOR,
	'// dsh-desktop patch (workspace pin): 置顶/取消置顶（仅工作区分组行）。',
	'ctx.effect(()=>ctx.contextMenus.register({id:`workspace.pinToggle`,target:`workspace`,order:200,resolve:({workspaceId})=>[{id:dshWorkspacePinState(workspaceId)?`unpin`:`pin`,label:ctx.locale.bind(NS)(dshWorkspacePinState(workspaceId)?`workspace.unpin`:`workspace.pin`),icon:{key:dshWorkspacePinState(workspaceId)?`workspace.unpin`:`workspace.pin`},run:()=>{dshToggleWorkspacePin(workspaceId)}}]}),`workspace: pin menu action`);',
].join('\n');

// 1e. folder 图标：置顶时着主题色（与 folderActive 同色系；active 另有行背景）。
// 0.2.2-rc.2 压缩形：jsx 调用的 props 对象压成一行、`children:` 紧跟其后，
// 故锚只取 `className`+`children` 两段（到 CloseRegular 收尾为止），全文件唯一。
const UI_FOLDER_ANCHOR = "{className:clsx(Rows_module_css_default.slot,Rows_module_css_default.folder,active&&Rows_module_css_default.folderActive),children:row.expanded?(0,react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderOpenRegular,{}):(0,react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderCloseRegular,{})}";
const UI_FOLDER_INSERT = "{className:clsx(Rows_module_css_default.slot,Rows_module_css_default.folder,active&&Rows_module_css_default.folderActive),style:dshPinned?{color:\"var(--dsw-alias-state-business-primary)\"}:void 0,children:row.expanded?(0,react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderOpenRegular,{}):(0,react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderCloseRegular,{})}";

// 1f. 标题前置顶小圆点（inline style，零 CSS 注入；title 是 ellipsis 行内容器）。
// 0.2.2-rc.2 压缩形：项目标题 span 从 jsx 换成 jsxs 以便 children 变数组。
const UI_TITLE_ANCHOR = [
	'{className:Rows_module_css_default.projectText,children:(0,react_jsx_runtime.jsx)(`span`,{className:Rows_module_css_default.title,children:label})}',
].join('\n');
const UI_TITLE_INSERT = [
	'{className:Rows_module_css_default.projectText,children:(0,react_jsx_runtime.jsxs)(`span`,{className:Rows_module_css_default.title,children:[dshPinned&&(0,react_jsx_runtime.jsx)(`span`,{',
	'// dsh-desktop patch (workspace pin): 置顶标记（主题色小圆点）。',
	'style:{flex:\"none\",display:\"inline-block\",width:\"5px\",height:\"5px\",borderRadius:\"50%\",background:\"var(--dsw-alias-state-business-primary)\",margin:\"0 4px 0 0\",verticalAlign:\"middle\"},',
	'\"aria-hidden\":true}),label]})}',
].join('\n');

// 2a. deriveGroups 尾：分组产出经置顶重排。
// 0.2.2-rc.2 重锚：注释在压缩产物里被剥掉，`return groups}` 在 bundle 里出现两次
// （groupByWorkspace 与 deriveGroups），故锚连同紧随其后的下一个函数声明一起取，
// 保证只命中 deriveGroups（SessionTree 的 groups 数据源）。
const UI_SORT_ANCHOR = [
	'return groups}function sessionMemberIds(',
].join('\n');
const UI_SORT_INSERT = [
	'// dsh-desktop patch (workspace pin): 置顶分组压顶（pinMillis 降序），其余保原序。',
	'return dshApplyWorkspacePins(groups)}function sessionMemberIds(',
].join('\n');

// 2b. SessionTree：版本号进作用域。
// 0.1.6 重锚（0.6.5 实爆修复，issue：左侧会话栏空白）：旧锚是
//   `const list = useSessions((s) => s);` +
//   `const pendingInteractions = useSessionPendingInteraction((s) => s);`
// 两行联合锚——0.1.6 把 SessionTree 的数据源「入参化」（list /
// useSessionPendingInteraction 改由父级以 props 传入，函数体内不再调用
// useSessions），该两行全文件只剩 SearchResults 一处。旧锚于是把声明注进了
// SearchResults，而 2c 的 UI_DEPS_ANCHOR 仍命中 SessionTree 的 groups useMemo
// ——SessionTree 引用了未声明的 dshWsPinVersion，首渲染即
// `ReferenceError: dshWsPinVersion is not defined` → sidebar.workspaces 槽位
// 条目崩溃退位 → 左侧会话栏整体空白（用户实报「左边对话栏不显示」）。
// 现锚在 SessionTree 自身的 expandedGroups useMemo，且紧邻 groups useMemo ——
// 声明先于使用。0.2.2-rc.2：整块压缩成一行，锚按压缩字节重录（含尾随 deps 数组）。
const UI_TREE_ANCHOR = "const expandedGroups=(0,react.useMemo)(()=>{const ancestorKeys=new Set(parents.values());return[...workspaces.map(workspace=>workspace.workspaceId),``].filter(key=>groupExpansion[key]??ancestorKeys.has(key))},[groupExpansion,parents,workspaces]);";
const UI_TREE_INSERT = [
	UI_TREE_ANCHOR,
	'// dsh-desktop patch (workspace pin): 版本号进 groups useMemo deps，切置顶即时重排。',
	'const dshWsPinVersion = dshUseWorkspacePinVersion();',
].join('\n');

// 2c. groups useMemo deps：追加版本号（唯一锚；否则置顶切换被 memo 缓存吞掉）。
// 0.2.2-rc.2：压缩后 deps 数组无空格结束（`statuses,expandedGroups,ungroupedSessionIds]);`），
// 带 `]);` 收尾才与 deriveGroups 的入参对象区分开（全文件唯一）。
const UI_DEPS_ANCHOR = "statuses,expandedGroups,ungroupedSessionIds]);";
const UI_DEPS_INSERT = "statuses,expandedGroups,ungroupedSessionIds,\n\t\t\t\tdshWsPinVersion\n\t\t\t]);";
// 3. 翻译：zh / en。rc.2 重锚：旧锚 `menu.openProjectDir` 是 open-project-dir
//    补丁自己的产物（原生 0 命中），属于跨补丁链式依赖；现锚在原生
//    "menu.unarchiveSession" 行，insert 保留锚（本补丁追加其后、open-project-dir
//    插入其前），两补丁任意先后都能命中。
const UI_ZH_ANCHOR = '"menu.unarchiveSession":`取消归档`,';
const UI_ZH_INSERT = [
	'"menu.unarchiveSession":`取消归档`,',
	'"workspace.pin":`置顶到列表顶部`,',
	'"workspace.unpin":`取消置顶`,',
].join('\n');
const UI_EN_ANCHOR = '"menu.unarchiveSession":`Unarchive session`,';
const UI_EN_INSERT = [
	'"menu.unarchiveSession":`Unarchive session`,',
	'"workspace.pin":`Pin to top`,',
	'"workspace.unpin":`Unpin`,',
].join('\n');

const UI_REPLACEMENTS = [
	{ anchor: UI_CORE_ANCHOR, insert: UI_CORE_INSERT },
	{ anchor: UI_HOOKS_ANCHOR, insert: UI_HOOKS_INSERT },
	{ anchor: UI_MENU_ANCHOR, insert: UI_MENU_INSERT },
	{ anchor: UI_FOLDER_ANCHOR, insert: UI_FOLDER_INSERT },
	{ anchor: UI_TITLE_ANCHOR, insert: UI_TITLE_INSERT },
	{ anchor: UI_SORT_ANCHOR, insert: UI_SORT_INSERT },
	{ anchor: UI_TREE_ANCHOR, insert: UI_TREE_INSERT },
	{ anchor: UI_DEPS_ANCHOR, insert: UI_DEPS_INSERT },
	{ anchor: UI_ZH_ANCHOR, insert: UI_ZH_INSERT },
	{ anchor: UI_EN_ANCHOR, insert: UI_EN_INSERT },
];

// ---------------------------------------------------------------------------
// 工具：锚点必须存在 + 标记幂等的替换（与 patch-open-project-dir 同款契约）
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// 作用域校验（0.6.5 实爆回归）：声明与 deps 引用必须在同一个函数体内。
// 旧锚把声明注进了 SearchResults、deps 却留在 SessionTree —— SessionTree 引用
// 未声明的 dshWsPinVersion，首渲染 ReferenceError → sidebar.workspaces 槽位条目
// 崩溃退位 → 左侧会话栏空白。锚点漂移不再靠肉眼发现：这里在落盘前机器校验。
// ---------------------------------------------------------------------------

/** 取 index 处所在的最内层 `function NAME(` 的 NAME。
 *  0.2.2-rc.2：bundle 已压缩成整行，函数声明不再行首——旧版 `^[\t ]*` 行锚在这里
 *  恒 0 命中（enclosingFunctionAt 返回 null → verifyVersionScope 判「无法定位所在函数」
 *  → 整份补丁静默放弃），故去掉行锚（锚点/声明注入都自带换行，函数头语义不变）。 */
function enclosingFunctionAt(src, index) {
	if (index < 0) return null;
	const before = src.slice(0, index);
	const fns = [...before.matchAll(/function ([A-Za-z0-9_$]+)\(/g)];
	return fns.length ? fns[fns.length - 1][1] : null;
}

/**
 * 校验 `const dshWsPinVersion = dshUseWorkspacePinVersion();` 声明与 deps 数组里
 * 的 `dshWsPinVersion` 引用落在同一个（且名为 SessionTree 的）函数体内。
 * @param {string} src 已应用全部替换的源码
 * @returns {{ok: boolean, fn?: string|null, deps?: string|null, why?: string}}
 */
function verifyVersionScope(src) {
	const decl = 'const dshWsPinVersion = dshUseWorkspacePinVersion();';
	const di = src.indexOf(decl);
	if (di < 0) return { ok: false, why: '声明未注入' };
	const depsRel = src.indexOf('\n\t\t\t\tdshWsPinVersion\n', di + decl.length);
	if (depsRel < 0) return { ok: false, why: 'deps 引用未注入' };
	const fn = enclosingFunctionAt(src, di);
	const deps = enclosingFunctionAt(src, depsRel);
	if (fn === null || deps === null) return { ok: false, fn, deps, why: '无法定位所在函数' };
	if (fn !== deps) return { ok: false, fn, deps, why: `声明在 ${fn}、deps 引用在 ${deps}（跨作用域必然 ReferenceError）` };
	// 函数名点名只在真实 bundle 上生效：buildUiFixture 是锚点拼接件（各锚自带
	// 函数头），「最近的函数头」在夹具上没有语义，故夹具只校验同作用域。
	if (src.includes('function SessionTree(') && fn !== 'SessionTree') {
		return { ok: false, fn, deps, why: `目标函数是 ${fn}，期望 SessionTree` };
	}
	return { ok: true, fn, deps };
}

function applyReplacements(file, replacements, log, stats, options) {
	let src;
	try {
		src = fs.readFileSync(file, 'utf8');
	} catch (err) {
		log('workspace-pin 补丁: 读取失败 ' + file + ': ' + err.message);
		return false;
	}
	if (src.includes(MARKER)) {
		log('workspace-pin 补丁: 已应用，跳过 ' + file);
		return false;
	}
	for (const { anchor, insert } of replacements) {
		if (!src.includes(anchor)) {
			log('workspace-pin 补丁: 锚点未匹配（dsh 版本可能已变化），跳过 ' + file + ' :: ' + anchor.slice(0, 60));
			if (stats) stats.anchorMissing += 1;
			return false;
		}
		src = src.replace(anchor, insert);
	}
	const scope = verifyVersionScope(src);
	if (!scope.ok) {
		log('workspace-pin 补丁: 作用域校验失败（锚点漂移，已放弃落盘） ' + file + ' :: ' + scope.why);
		if (stats) stats.anchorMissing += 1;
		return false;
	}
	src = '// ' + MARKER + ': 侧栏工作区置顶（多选、localStorage 持久化）\n' + src;
	try {
		if (options && options.dryRun) {
			log('workspace-pin 补丁: dry-run: 将应用 ' + file);
			return false;
		}
		writeFileAtomic(file, src);
		log('workspace-pin 补丁: 已应用 ' + file);
		return true;
	} catch (err) {
		log('workspace-pin 补丁: 写入失败 ' + file + ': ' + err.message);
		return false;
	}
}

/**
 * 对某个 node_modules 根目录应用「工作区置顶」补丁（幂等）。
 * @param {string} nmRoot node_modules 根目录
 * @param {(msg: string) => void} [log]
 * @returns {number} 实际发生修改的文件数
 */
function patchWorkspacePin(nmRoot, log = () => {}, stats, options) {
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

/**
 * 测试用：构造一份包含全部 UI 锚点的最小夹具（unit-workspace-pin.test.js 使用）。
 * 夹具是锚点拼接件（各锚自带函数头，故「最近的函数头」无语义）——verifyVersionScope
 * 在夹具上只校验「声明与 deps 同作用域」，函数名点名只在真实 bundle 上生效。
 */
function buildUiFixture() {
	return UI_REPLACEMENTS.map((r) => r.anchor).join('\n// ---- 夹具分隔 ----\n') + '\n';
}

module.exports = { patchWorkspacePin, MARKER, buildUiFixture, CORE, UI_REPLACEMENTS, verifyVersionScope };

if (require.main === module) {
	const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..', 'node_modules');
	const n = patchWorkspacePin(root, (m) => console.log(m));
	console.log(n > 0 ? `patched ${n} file(s) — restart DSH Desktop to pick it up` : 'nothing to patch (already up to date)');
}
