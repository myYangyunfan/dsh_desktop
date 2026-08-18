window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-session-log-export",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let _deepseek_ai_dsh_client_runtime_client = require("@deepseek-ai/dsh-client-runtime/client");
		let react_jsx_runtime = require("react/jsx-runtime");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		//#region lib/types/client/controller.js
		/** Browser download state shared by the Session Header button and `/export`. */
		const INITIAL = { bySession: {} };
		/**
		* Collapse an untrusted Session id into the filename convention owned by the host endpoint.
		* @param sessionId - Session whose archive is downloaded.
		* @returns one safe browser download filename.
		*/
		function sessionLogZipFilename(sessionId) {
			return `dsh-session-${String(sessionId).replace(/[^A-Za-z0-9_-]/g, "_")}.zip`;
		}
		/**
		* Hand a Host download URL to the browser download manager.
		* @param url - same-origin Host download URL.
		* @param filename - browser download filename.
		*/
		function downloadUrl(url, filename) {
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = filename;
			anchor.click();
		}
		/** Resolve the browser's Host base with the connection carrier's null-origin fallback. */
		function hostBase() {
			const origin = globalThis.location?.origin;
			return origin !== void 0 && origin !== "null" ? origin : "http://dsh.internal";
		}
		function messageOf(error) {
			return error instanceof Error ? error.message : String(error);
		}
		/** Owns one in-flight browser download per Session and publishes modal state. */
		var SessionLogDownloadController = class {
			fetcher;
			save;
			/** uSES-safe state source shared by every Session-scoped modal contribution. */
			store = (0, _deepseek_ai_dsh_client_runtime_client.createSnapshotStore)(INITIAL);
			active = /* @__PURE__ */ new Map();
			disposed = false;
			/**
			* @param fetcher - HTTP carrier used to read the host-streamed ZIP.
			* @param save - browser save operation.
			*/
			constructor(fetcher = (input, init) => fetch(input, init), save = downloadUrl) {
				this.fetcher = fetcher;
				this.save = save;
			}
			/**
			* Download one Session tree; concurrent gestures for the same Session share one operation.
			* @param sessionId - root Session whose ZIP includes descendants and attachments.
			* @returns after the browser save starts, an error state is published, or a late post-disposal request is ignored.
			*/
			download(sessionId) {
				const existing = this.active.get(sessionId);
				if (existing !== void 0) return existing.done;
				if (this.disposed) return Promise.resolve();
				const abort = new AbortController();
				const done = this.run(sessionId, abort.signal).finally(() => {
					this.active.delete(sessionId);
				});
				this.active.set(sessionId, {
					abort,
					done
				});
				return done;
			}
			/**
			* Close one Session's dialog without cancelling an in-flight browser download.
			* @param sessionId - Session whose modal closes.
			*/
			dismiss(sessionId) {
				const current = this.store.getSnapshot().bySession[String(sessionId)];
				if (current === void 0 || !current.open) return;
				this.publish(sessionId, {
					...current,
					open: false
				});
			}
			/**
			* Abort active fetches and reach quiescence.
			* @returns after every active operation settles.
			*/
			async dispose() {
				this.disposed = true;
				const active = [...this.active.values()];
				for (const operation of active) operation.abort.abort();
				await Promise.allSettled(active.map((operation) => operation.done));
			}
			async run(sessionId, signal) {
				this.publish(sessionId, {
					open: true,
					status: "downloading",
					error: null
				});
				try {
					const url = new URL("/api/session.export", hostBase());
					url.searchParams.set("sessionId", sessionId);
					url.searchParams.set("includeDescendants", "true");
					const response = await this.fetcher(url, {
						method: "HEAD",
						signal
					});
					if (!response.ok) {
						const detail = await response.text().catch(() => "");
						throw new Error(`Export failed: HTTP ${response.status}${detail === "" ? "" : ` ${detail}`}`);
					}
					this.save(url.toString(), sessionLogZipFilename(sessionId));
					const open = this.store.getSnapshot().bySession[String(sessionId)]?.open ?? true;
					this.publish(sessionId, {
						open,
						status: "success",
						error: null
					});
				} catch (error) {
					if (signal.aborted) return;
					const open = this.store.getSnapshot().bySession[String(sessionId)]?.open ?? true;
					this.publish(sessionId, {
						open,
						status: "error",
						error: messageOf(error)
					});
				}
			}
			publish(sessionId, entry) {
				this.store.update((state) => {
					state.bySession = {
						...state.bySession,
						[String(sessionId)]: entry
					};
				});
			}
		};
		//#endregion
		//#region lib/types/client/Dialog.js
		/**
		* Modal shared by the Session Header button and this browser's `/export` command.
		* @param props - Session runtime, bound controller state, actions, and localized copy.
		* @returns the modal portal contribution.
		*/
		function SessionLogDownloadDialog({ sessionId, useSessionLogDownload, dismiss, t }) {
			const entry = useSessionLogDownload((state) => state.bySession[String(sessionId)]);
			const status = entry?.status;
			const open = entry?.open === true;
			const error = status === "error" ? entry?.error || t("dialog.commandFailed") : null;
			return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open,
				onClose: () => {
					dismiss(sessionId);
				},
				title: status === "downloading" ? t("dialog.preparingTitle") : status === "success" ? t("dialog.successTitle") : t("dialog.errorTitle"),
				description: status === "downloading" ? t("dialog.preparingDescription") : status === "success" ? t("dialog.successDescription") : error ?? t("dialog.commandFailed"),
				closeLabel: t("dialog.close"),
				footer: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "primary",
					onClick: () => {
						dismiss(sessionId);
					},
					children: t("dialog.close")
				})
			});
		}
		//#endregion
		//#region \0dsh-css:/home/runner/work/deepseek-harness/deepseek-harness/packages/session-query/session-log-export/src/client/HeaderAction.module.css.mjs
		const css = ".nL4_yW_sessionLogButton{border:1px solid var(--dsw-alias-border-l2);min-width:111px;height:32px;color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);cursor:pointer;background:0 0;border-radius:18px;justify-content:center;align-items:center;gap:4px;padding:6px 12px;font-size:13px;font-weight:400;line-height:20px;display:inline-flex}.nL4_yW_sessionLogButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.nL4_yW_sessionLogButton:disabled{color:var(--dsw-alias-label-dimmed);cursor:wait}.nL4_yW_sessionLogButton span,.nL4_yW_sessionLogButton svg{flex:none}.nL4_yW_sessionLogButton span{white-space:nowrap}";
		const tagId = "@deepseek-ai/dsh-session-log-export/HeaderAction.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-session-log-export";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var HeaderAction_module_css_default = { "sessionLogButton": "nL4_yW_sessionLogButton" };
		//#endregion
		//#region lib/types/client/HeaderAction.js
		/**
		* Render the Session Header export capsule and its shared result dialog.
		* @param props - Session runtime, download controller, and localized dialog copy.
		* @returns the persistent Header action and Session-scoped dialog.
		*/
		function SessionLogDownloadHeaderAction(props) {
			const { sessionId, useSessionLogDownload, request } = props;
			const busy = useSessionLogDownload((state) => state.bySession[String(sessionId)])?.status === "downloading";
			return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: HeaderAction_module_css_default.sessionLogButton,
				disabled: busy,
				"aria-busy": busy,
				onClick: () => {
					request(sessionId);
				},
				children: [(0, react_jsx_runtime.jsx)("span", { children: "Session log" }), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconDownloadOutline16, { size: 12 })]
			}), (0, react_jsx_runtime.jsx)(SessionLogDownloadDialog, { ...props })] });
		}
		//#endregion
		//#region lib/types/client/locales.js
		/** Locale namespace owned by Session export browser feedback. */
		const NS = "session-log-download";
		/** Simplified-Chinese Session export strings. */
		const zh = {
			"dialog.preparingTitle": "正在导出 Session",
			"dialog.preparingDescription": "正在准备包含当前 Session、子 Session 和附件的 ZIP 文件。",
			"dialog.successTitle": "Session 导出已开始下载",
			"dialog.successDescription": "浏览器正在下载 Session ZIP 文件。",
			"dialog.errorTitle": "Session 导出失败",
			"dialog.close": "关闭",
			"dialog.commandFailed": "无法启动 Session 导出。"
		};
		/** English Session export strings. */
		const en = {
			"dialog.preparingTitle": "Exporting Session",
			"dialog.preparingDescription": "Preparing a ZIP containing this Session, its sub-Sessions, and attachments.",
			"dialog.successTitle": "Session download started",
			"dialog.successDescription": "The browser is downloading the Session ZIP.",
			"dialog.errorTitle": "Session export failed",
			"dialog.close": "Close",
			"dialog.commandFailed": "Could not start the Session export."
		};
		//#endregion
		//#region lib/types/client/index.js
		/** Browser plugin owning Session export download state and its shared modal. */
		const inject = ["slots", "locale"];
		/**
		* Provide the download controller and mount its modal into the Session Header.
		* @param ctx - browser context carrying slots and locale services.
		*/
		function apply(ctx) {
			const controller = new SessionLogDownloadController();
			ctx.provide("sessionLogDownload", controller);
			ctx.effect(() => async () => {
				await controller.dispose();
			}, "session-log-download: browser download lifecycle");
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "session-log-download: browser dictionaries");
			ctx.on("command/executed", (sessionId, commandName, result) => {
				if (commandName === "export" && result.kind === "success") controller.download(sessionId);
			});
			ctx.slots.inject("conversation.session.header.utilities", () => ctx.slots.register({
				name: "conversation.session.header.utilities",
				id: "session-log-download",
				locale: NS,
				inject: () => ({
					hooks: { sessionLogDownload: controller.store },
					request: (sessionId) => controller.download(sessionId),
					dismiss: (sessionId) => {
						controller.dismiss(sessionId);
					}
				})
			}, SessionLogDownloadHeaderAction));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map