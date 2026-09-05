// @dsh-external/dsh-session-manager 客户端半边（DSH Desktop 内置）：
//   1. 设置页「归档对话管理」栏：列出全部已归档会话（标题/项目/更新时间），
//      每条提供「恢复」与「删除」；
//   2. 暴露 window.__dshSessionManager 桥，供官方会话行 ⋯ 菜单补丁
//      （patch-session-manage.js 注入的「删除对话」项）调用；该桥是「删除对话」
//      菜单项的显式能力契约——patch-session-manage.js 按此桥是否存在决定是否
//      显示「删除对话」项（桥缺失时隐藏，见 host-capabilities.js）；
//   3. 「打开项目目录」（issue #85）由 patch-open-project-dir.js 注入，现直接
//      引用 preload 宿主能力 window.dshDesktop.openPath；下方 window.__dshDesktopOpenDir
//      别名仅保留给旧版已打补丁文件（向后兼容，可随一个版本周期后移除）。
// 底层 RPC：workspace.unarchiveSession / workspace.deleteSession（由
// patch-session-manage.js 补进 dsh-api-workspace-controller 与 dsh-api-remotes；
// 0.1.2-alpha.1 起会话 RPC 走 @Remote/typert 协议，宿主控制器收口为
// dsh-api-workspace-controller）；客户端经 ctx.workspaces 服务调用（throw 语义），
// 状态更新走官方 host 帧（archived / session-removed），无需重启、无需手动刷新。
window.__ModuleLoader__.load({
	id: "dsh-session-manager",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const react = require("react");
		const { jsx, jsxs } = require("react/jsx-runtime");
		// issue #124：此处曾有对 @deepseek-ai/dsh-client-ui-primitives 的 require 解构
		// bindSnapshotSelector 但从未使用——rc.8 内核的客户端模块表已移除该残留
		// require（并入 dsh-client-ui-renderer），残留 require 会让整个插件树加载
		// 失败，故不再 require（本插件只用 react/jsx-runtime + 原生 button）。

		const NS = "dsh-session-manager";
		const L = {
			nav: "归档对话管理",
			navSub: "管理已归档的对话：可恢复（回到原工作区与顺序）或彻底删除（会话日志与附件一并移除，不可恢复）。删除运行中的会话会被拒绝。",
			empty: "暂无已归档的对话",
			restore: "恢复",
			restoreHint: "把该对话恢复到归档前的位置",
			delete: "删除",
			deleteHint: "彻底删除该对话及其日志（不可恢复）",
			confirmDelete: "确定要彻底删除这个对话吗？会话日志与附件将一并移除，此操作不可恢复。",
			confirmDeleteTitle: "删除对话",
			runningRejected: "该对话正在运行，无法删除：请先停止它再删除",
			ok: "已操作",
			failed: "操作失败",
			timeoutTitle: "后端响应超时",
			timeoutHint: "DSH 服务可能正忙或暂时无响应（输入不显示、内容刷不出来通常也是这个原因）。",
			unknownSession: "未知会话",
			updatedAt: "更新时间",
			workspace: "项目",
			loading: "加载中…",
			unavailable: "设置不可用（需要在本机浏览器中打开）"
		};

		const CSS = [
			".dsm-row{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--dsw-alias-border-l2)}",
			".dsm-main{flex:1;min-width:0}",
			".dsm-title{color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".dsm-meta{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".dsm-actions{flex:none;display:flex;align-items:center;gap:8px}",
			".dsm-empty{color:var(--dsw-alias-label-tertiary);font-size:12px;padding:12px 0}",
			".dsm-btn{padding:5px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);cursor:pointer;font-size:12px;line-height:18px}",
			".dsm-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}",
			".dsm-btn-danger{color:#c43f50;border-color:color-mix(in srgb,#c43f50 35%,transparent)}",
			".dsm-btn-danger:hover{background:color-mix(in srgb,#c43f50 8%,transparent)}"
		].join("");

		function ensureCss() {
			if (typeof document === "undefined") return;
			const tagId = "dsh-session-manager/client.css";
			if (document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]")) return;
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-session-manager";
			tag.dataset.pluginCss = tagId;
			tag.textContent = CSS;
			document.head.appendChild(tag);
		}

		// ------------------------------------------------------------------
		// 数据：workspaces.list（含 archivedSessionIds）+ sessions.list（byId 摘要）
		// ------------------------------------------------------------------
		function useStore(store) {
			const [snap, setSnap] = react.useState(() => store.getSnapshot());
			react.useEffect(() => store.subscribe(() => setSnap(store.getSnapshot())), [store]);
			return snap;
		}

		function useArchivedRows(workspaces, sessions) {
			const wsSnap = useStore(workspaces.list);
			const sessSnap = useStore(sessions.list);
			const archived = wsSnap.archivedSessionIds || [];
			const byId = sessSnap.byId || {};
			const wsBySession = new Map();
			for (const item of wsSnap.items || []) {
				for (const id of item.sessionIds || []) if (!wsBySession.has(id)) wsBySession.set(id, item);
			}
			return archived.map((id) => {
				const summary = byId[id];
				const ws = wsBySession.get(id);
				return {
					id,
					title: summary && summary.title ? summary.title : id,
					cwd: summary && summary.cwd ? summary.cwd : "",
					updatedAt: summary && summary.updatedAt ? summary.updatedAt : 0,
					workspaceTitle: ws ? ws.title : ""
				};
			});
		}

		// ------------------------------------------------------------------
		// RPC 封装（0.1.2-alpha.1：经 ctx.workspaces 服务，throw 语义）
		// ------------------------------------------------------------------
		function isTimeoutError(error) {
			var msg = (error && error.message) || String(error || "");
			return /signal timed out|timeouterror|the operation was aborted/i.test(msg);
		}

		function reportActionError(error) {
			if (isTimeoutError(error)) {
				var restart = window.confirm(
					L.timeoutTitle + "\n\n" + L.timeoutHint +
					"\n\n是否立即重启 DSH 服务？（进行中的生成会中断，历史会话不受影响）"
				);
				if (restart && window.dshDesktop && typeof window.dshDesktop.restartService === "function") {
					try { window.dshDesktop.restartService(); } catch (e) { /* 桥不可用时静默 */ }
				}
				return;
			}
			window.alert(L.failed + ": " + ((error && error.message) || error));
		}

		async function unarchiveSession(context, sessionId) {
			try {
				await context.workspaces.unarchiveSession(sessionId);
				return true;
			} catch (error) {
				reportActionError(error);
				return false;
			}
		}

		async function deleteSession(context, sessionId, { confirmText } = {}) {
			if (!window.confirm(confirmText || L.confirmDelete)) return false;
			try {
				await context.workspaces.deleteSession(sessionId);
				return true;
			} catch (error) {
				const message = (error && error.message) || String(error);
				window.alert(message && /running|live/.test(message) ? L.runningRejected : L.failed + ": " + message);
				return false;
			}
		}

		// ------------------------------------------------------------------
		// 焦点兜底：删除「非当前」会话后输入框光标丢失但可输入。
		// 根因（已实锤，官方缺陷）：composer 的 focus effect 只依赖
		// [locked, sessionId]，而点行菜单删除按钮时同会话内发生的失焦不在覆盖
		// 范围 → 光标消失、输入框却仍启用。这里订阅 sessions.list：检测到
		// 「有会话被删且当前会话未变」后，双 rAF 等 DOM 稳定，把焦点与光标补回
		// composer 输入框；删除当前会话时 current 变化/变 void 0、或输入框处于
		// disabled/readOnly（hero 场景）会自动跳过，不抢焦点。输入框形态两代：
		// <textarea> 与 Lexical contenteditable，都要能认。
		// 纯判断（无 DOM）与恢复动作分离，后者注入 document 便于单测。
		// ------------------------------------------------------------------
		function shouldRestoreFocusAfterRemoval(prev, next) {
			if (!prev || !next || next.phase !== "ready") return false;
			const prevIds = prev.ids || [];
			const nextIds = next.ids || [];
			const removed = prevIds.some((id) => !nextIds.includes(id));
			if (!removed) return false;
			// 当前会话被删（current 变 void 0 或跟随切换）→ 输入框禁读，无需也不应补焦。
			if (next.current === void 0 || next.current !== prev.current) return false;
			return true;
		}

		/** 光标置末尾：<textarea>/<input> 走 selection API，contenteditable 走 Range。
		 *  两者都是「尽力而为」——桩环境或宿主不支持时静默跳过，不影响补焦结果。 */
		function placeCaretAtEnd(field, doc) {
			try {
				if (typeof field.setSelectionRange === "function") {
					const len = field.value ? field.value.length : 0;
					field.setSelectionRange(len, len);
					return;
				}
				if (typeof doc.createRange !== "function") return;
				const win = doc.defaultView;
				const sel = win && typeof win.getSelection === "function" ? win.getSelection() : null;
				if (!sel || typeof sel.removeAllRanges !== "function" || typeof sel.addRange !== "function") return;
				const range = doc.createRange();
				range.selectNodeContents(field);
				range.collapse(false);
				sel.removeAllRanges();
				sel.addRange(range);
			} catch (_) { /* 忽略不支持 selection 的宿主 */ }
		}

		function restoreComposerFocus(doc) {
			const wrap = doc && typeof doc.querySelector === "function" ? doc.querySelector("[data-input-scroll]") : null;
			if (!wrap || typeof wrap.querySelector !== "function") return false;
			// dsh-compat:composer-editable —— 输入框两代都要认：旧内核是 <textarea>，
			// 当前内核换成了 Lexical 的 contenteditable div（实机 [data-input-scroll] 内
			// textarea=0、contenteditable=1）。只查 textarea 会让「删会话后补焦」整条
			// 通道静默失效——函数永远 return false，不报错也不补焦。
			const field = wrap.querySelector("textarea") || wrap.querySelector("[data-composer-input]") || wrap.querySelector("[contenteditable]");
			if (!field || field.disabled || field.readOnly) return false;
			// contenteditable 的「不可编辑」是属性值 false，不是 disabled。
			if (field.isContentEditable === false || field.getAttribute?.("contenteditable") === "false") return false;
			const active = doc.activeElement;
			if (active && active !== doc.body && active !== doc.documentElement) {
				const tag = active.tagName;
				if (tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT" || active.isContentEditable) return false;
				if (active === field) return false;
			}
			field.focus({ preventScroll: true });
			placeCaretAtEnd(field, doc);
			return true;
		}

		function setupComposerFocusGuard(sessions) {
			let prev = sessions.list.getSnapshot();
			return sessions.list.subscribe(() => {
				const next = sessions.list.getSnapshot();
				const shouldRestore = shouldRestoreFocusAfterRemoval(prev, next);
				prev = next;
				if (!shouldRestore) return;
				// 双 rAF：等 React 提交与布局稳定后再查 DOM（删除信号先于重渲染到达）。
				requestAnimationFrame(() => requestAnimationFrame(() => restoreComposerFocus(document)));
			});
		}

		// ------------------------------------------------------------------
		// 设置页面板
		// ------------------------------------------------------------------
		function ArchiveManagerCard(props) {
			const { workspaces, sessions } = props;
			const rows = useArchivedRows(workspaces, sessions);
			const [busy, setBusy] = react.useState(false);
			const fmtTime = (ts) => {
				if (!ts) return "";
				try {
					return new Date(ts).toLocaleString();
				} catch {
					return String(ts);
				}
			};
			const run = async (fn) => {
				if (busy) return;
				setBusy(true);
				try { await fn(); } finally { setBusy(false); }
			};
			return jsxs("div", {
				style: { display: "flex", flexDirection: "column", gap: 4 },
				children: [
					rows.length === 0 ? jsx("div", { className: "dsm-empty", children: L.empty }) : rows.map((row) => jsxs("div", {
						className: "dsm-row",
						key: row.id,
						children: [
							jsxs("div", {
								className: "dsm-main",
								children: [
									jsx("div", { className: "dsm-title", title: row.title, children: row.title }),
									jsx("div", {
										className: "dsm-meta",
										children: [row.workspaceTitle ? L.workspace + ": " + row.workspaceTitle : "", row.cwd ? " · " + row.cwd : "", row.updatedAt ? " · " + L.updatedAt + ": " + fmtTime(row.updatedAt) : ""].join("")
									})
								]
							}),
							jsxs("div", {
								className: "dsm-actions",
								children: [
									jsx("button", {
										type: "button",
										className: "dsm-btn",
										title: L.restoreHint,
										disabled: busy,
										onClick: () => run(() => unarchiveSession({ workspaces }, row.id)),
										children: L.restore
									}),
									jsx("button", {
										type: "button",
										className: "dsm-btn dsm-btn-danger",
										title: L.deleteHint,
										disabled: busy,
										onClick: () => run(() => deleteSession({ workspaces }, row.id)),
										children: L.delete
									})
								]
							})
						]
					}))
				]
			});
		}

		function ArchiveManagerSection(props) {
			return jsxs("div", {
				style: { display: "flex", flexDirection: "column", gap: 16, padding: 16, maxWidth: 640 },
				children: [
					jsx("h2", { children: L.navSub }),
					jsx(ArchiveManagerCard, props)
				]
			});
		}

		// ------------------------------------------------------------------
		// 插件入口：设置栏 + 行菜单桥
		// ------------------------------------------------------------------
		function apply(ctx) {
			ensureCss();

			// 官方会话行 ⋯ 菜单补丁的「删除对话」入口走这里（含确认与错误提示）。
			window.__dshSessionManager = {
				deleteSession: (sessionId) => deleteSession({ workspaces: ctx.workspaces }, String(sessionId)),
				unarchiveSession: (sessionId) => unarchiveSession({ workspaces: ctx.workspaces }, String(sessionId))
			};

			// 「打开项目目录」桥（issue #85）：侧栏项目/会话行菜单 → 宿主
			// shell.openPath。复用 preload 暴露的 dshDesktop.openPath。
			window.__dshDesktopOpenDir = (dir) => window.dshDesktop?.openPath?.(dir);

			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: NS,
				order: 80,
				label: () => L.nav,
				inject: () => ({ workspaces: ctx.workspaces, sessions: ctx.sessions })
			}, ArchiveManagerSection), "dsh-session-manager: archived conversations manager");

			// 焦点兜底（幂等）：随 scope 生命周期自动订阅/清理。
			ctx.effect(() => setupComposerFocusGuard(ctx.sessions),
				"dsh-session-manager: composer focus guard");
		}

		exports.apply = apply;
		exports.inject = ["slots", "settingsScope", "workspaces", "sessions"];
		// 纯函数导出：仅供 node 单测与插件自检（runtime 只消费 apply/inject）。
		exports.focusGuard = { shouldRestoreFocusAfterRemoval, restoreComposerFocus };
		// issue #122/#129 回归锚点：「signal timed out」类裸 DOMException 的人
		// 话化 + 壳层受监管重启出口——选择框/会话操作在后端假死时 30s 超时后
		// 的唯一用户可见恢复路径，必须有单测钉住（timeoutGuard 命名对齐
		// focusGuard 先例）。
		exports.timeoutGuard = { isTimeoutError, reportActionError };
		return module.exports;
	}
});
