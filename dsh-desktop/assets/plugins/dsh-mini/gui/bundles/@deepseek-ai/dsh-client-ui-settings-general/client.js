window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-client-ui-settings-general",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let _deepseek_ai_dsh_client_ui_slots = require("@deepseek-ai/dsh-client-ui-slots");
		let _deepseek_ai_dsh_client_web_react = require("@deepseek-ai/dsh-client-web-react");
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let _deepseek_ai_dsh_client_runtime_client = require("@deepseek-ai/dsh-client-runtime/client");
		//#region ../../../node_modules/.pnpm/clsx@2.1.1/node_modules/clsx/dist/clsx.mjs
		function r(e) {
			var t, f, n = "";
			if ("string" == typeof e || "number" == typeof e) n += e;
			else if ("object" == typeof e) if (Array.isArray(e)) {
				var o = e.length;
				for (t = 0; t < o; t++) e[t] && (f = r(e[t])) && (n && (n += " "), n += f);
			} else for (f in e) e[f] && (n && (n += " "), n += f);
			return n;
		}
		function clsx() {
			for (var e, t, f = 0, n = "", o = arguments.length; f < o; f++) (e = arguments[f]) && (t = r(e)) && (n && (n += " "), n += t);
			return n;
		}
		//#endregion
		//#region \0dsh-css:/home/runner/work/deepseek-harness/deepseek-harness/packages/client/ui-settings-general/src/client/SettingsRoot.module.css.mjs
		const css$3 = ".VOzbGW_trigger{box-sizing:border-box;cursor:pointer;width:calc(100% + 8px);height:34px;color:var(--dsw-alias-label-primary);background:0 0;border:none;border-radius:12px;flex:none;align-items:center;gap:8px;margin:4px -4px;padding:6px 2px 6px 10px;font-family:inherit;font-size:14px;line-height:22px;display:flex;overflow:hidden}.VOzbGW_trigger:hover{background:var(--dsw-alias-interactive-bg-hover)}.VOzbGW_trigger.VOzbGW_rail{border-radius:50%;justify-content:center;gap:0;width:36px;height:36px;margin:8px 0 10px;padding:0}.VOzbGW_triggerLabel{white-space:nowrap;overflow:hidden}.VOzbGW_overlay{z-index:1000;justify-content:center;align-items:center;display:flex;position:fixed;inset:0}.VOzbGW_mask{background:var(--dsw-alias-bg-mask-1);backdrop-filter:var(--dsw-mask-blur);position:absolute;inset:0}.VOzbGW_panel{z-index:1;background:var(--dsw-alias-bg-layer-2);width:800px;max-width:calc(100vw - 48px);height:min(800px,100vh - 48px);box-shadow:var(--dsw-shadow-lv3);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);border-radius:24px;display:flex;position:relative;overflow:hidden}.VOzbGW_nav{box-sizing:border-box;flex-direction:column;flex:none;gap:18px;width:188px;padding:22px 12px 0;display:flex}.VOzbGW_navTitle{color:var(--dsw-alias-label-primary);padding:0 12px;font-size:16px;font-weight:500;line-height:24px}.VOzbGW_navList{flex-direction:column;gap:4px;display:flex}.VOzbGW_navCell{box-sizing:border-box;cursor:pointer;height:40px;color:var(--dsw-alias-label-primary);text-align:left;background:0 0;border:none;border-radius:12px;align-items:center;gap:8px;padding:9px 16px 9px 12px;font-family:inherit;font-size:14px;font-weight:400;line-height:22px;display:flex}.VOzbGW_navCell:hover{background:var(--dsw-specific-sidebar-nav-item-hover)}.VOzbGW_navCell.VOzbGW_active{background:var(--dsw-specific-sidebar-nav-item-active)}.VOzbGW_navIcon{flex:none}.VOzbGW_navLabel{white-space:nowrap;text-overflow:ellipsis;flex:1;min-width:0;overflow:hidden}.VOzbGW_content{flex-direction:column;flex:1;min-width:0;display:flex}.VOzbGW_header{box-sizing:border-box;flex:none;justify-content:space-between;align-items:flex-start;gap:8px;height:54px;padding:20px 14px 8px 10px;display:flex}.VOzbGW_actions{justify-content:flex-end;align-items:center;gap:8px;min-width:0;margin-left:auto;display:flex}.VOzbGW_close{cursor:pointer;width:28px;height:28px;color:var(--dsw-alias-label-primary);background:0 0;border:none;border-radius:28px;justify-content:center;align-items:center;padding:0;display:inline-flex}.VOzbGW_close:hover{background:var(--dsw-alias-interactive-bg-hover)}.VOzbGW_options{flex:1;min-height:0;padding:0 24px 24px;overflow-y:auto}.VOzbGW_hiddenLabel{clip:rect(0 0 0 0);white-space:nowrap;width:1px;height:1px;position:absolute;overflow:hidden}";
		const tagId$3 = "@deepseek-ai/dsh-client-ui-settings-general/SettingsRoot.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$3) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-settings-general";
			tag.dataset.pluginCss = tagId$3;
			tag.textContent = css$3;
			document.head.appendChild(tag);
		}
		var SettingsRoot_module_css_default = {
			"options": "VOzbGW_options",
			"navList": "VOzbGW_navList",
			"panel": "VOzbGW_panel",
			"actions": "VOzbGW_actions",
			"navCell": "VOzbGW_navCell",
			"triggerLabel": "VOzbGW_triggerLabel",
			"active": "VOzbGW_active",
			"navLabel": "VOzbGW_navLabel",
			"navIcon": "VOzbGW_navIcon",
			"trigger": "VOzbGW_trigger",
			"content": "VOzbGW_content",
			"close": "VOzbGW_close",
			"rail": "VOzbGW_rail",
			"nav": "VOzbGW_nav",
			"overlay": "VOzbGW_overlay",
			"navTitle": "VOzbGW_navTitle",
			"header": "VOzbGW_header",
			"hiddenLabel": "VOzbGW_hiddenLabel",
			"mask": "VOzbGW_mask"
		};
		//#endregion
		//#region lib/types/client/SettingsRoot.js
		/**
		* Settings shell root: the sidebar-foot trigger row plus the centered modal
		* panel (figma 501:29947, 1080x700) with the section nav rail. The shell is
		* a pure composition face — every piece of text (trigger label, panel title,
		* close label, sections) arrives from registrants through slots; accessible
		* names resolve to that content (trigger: its own text; dialog:
		* aria-labelledby the title node; close: visually-hidden slot text). Modal
		* open state and the active section id are component-local viewing state;
		* the onboarding coordinator mounts exactly one ordered registrant while the
		* sessions-derived empty-Hero fact is active. Visible dialog chrome belongs
		* to the step, so a mounted-but-deciding step paints nothing here.
		*/
		/** Nav glyph by section id; unknown ids fall back to the settings gear. */
		function navIcon(id) {
			if (id === "models") return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconDataOutline16, {
				className: SettingsRoot_module_css_default.navIcon,
				size: 16
			});
			if (id === "agent-presets") return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconAgentPresetOutline16, {
				className: SettingsRoot_module_css_default.navIcon,
				size: 16
			});
			if (id === "plugins") return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPersonalizationOutline16, {
				className: SettingsRoot_module_css_default.navIcon,
				size: 16
			});
			return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSettingsOutline16, {
				className: SettingsRoot_module_css_default.navIcon,
				size: 16
			});
		}
		/**
		* The modal layer: full-viewport mask + centered panel. Close paths: the
		* header button, a mask click, and document-level Escape (mounted only while
		* open, so the listener lifetime is the panel's).
		*/
		function SettingsPanel({ rows, renderSlot, activeId, onSelect, onClose }) {
			const active = rows.find((r) => r.id === activeId)?.id ?? rows[0]?.id;
			const titleId = (0, react.useId)();
			(0, react.useEffect)(() => {
				const onKeyDown = (e) => {
					if (e.key === "Escape") onClose();
				};
				document.addEventListener("keydown", onKeyDown);
				return () => {
					document.removeEventListener("keydown", onKeyDown);
				};
			}, [onClose]);
			const closeButton = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				closeButton.current?.focus();
			}, []);
			return (0, react_jsx_runtime.jsxs)("div", {
				className: SettingsRoot_module_css_default.overlay,
				role: "presentation",
				children: [(0, react_jsx_runtime.jsx)("div", {
					className: SettingsRoot_module_css_default.mask,
					"aria-hidden": "true",
					onClick: onClose
				}), (0, react_jsx_runtime.jsxs)("div", {
					className: SettingsRoot_module_css_default.panel,
					role: "dialog",
					"aria-modal": "true",
					"aria-labelledby": titleId,
					children: [(0, react_jsx_runtime.jsxs)("nav", {
						className: SettingsRoot_module_css_default.nav,
						children: [(0, react_jsx_runtime.jsx)("div", {
							className: SettingsRoot_module_css_default.navTitle,
							id: titleId,
							children: renderSlot("settings.header", {})
						}), (0, react_jsx_runtime.jsx)("div", {
							className: SettingsRoot_module_css_default.navList,
							children: rows.map((row) => (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: clsx(SettingsRoot_module_css_default.navCell, row.id === active && SettingsRoot_module_css_default.active),
								"aria-current": row.id === active ? "true" : void 0,
								onClick: () => {
									onSelect(row.id);
								},
								children: [navIcon(row.id), (0, react_jsx_runtime.jsx)("span", {
									className: SettingsRoot_module_css_default.navLabel,
									children: row.label
								})]
							}, row.id))
						})]
					}), (0, react_jsx_runtime.jsxs)("div", {
						className: SettingsRoot_module_css_default.content,
						children: [(0, react_jsx_runtime.jsxs)("div", {
							className: SettingsRoot_module_css_default.header,
							children: [(0, react_jsx_runtime.jsx)("div", {
								className: SettingsRoot_module_css_default.actions,
								children: renderSlot("settings.action", {})
							}), (0, react_jsx_runtime.jsxs)("button", {
								ref: closeButton,
								type: "button",
								className: SettingsRoot_module_css_default.close,
								onClick: onClose,
								children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCloseOutline16, { size: 14 }), (0, react_jsx_runtime.jsx)("span", {
									className: SettingsRoot_module_css_default.hiddenLabel,
									children: renderSlot("settings.close", {})
								})]
							})]
						}), (0, react_jsx_runtime.jsx)("div", {
							className: SettingsRoot_module_css_default.options,
							children: active !== void 0 && renderSlot("settings.section", { close: onClose }, { only: active })
						})]
					})]
				})]
			});
		}
		/**
		* Render the settings trigger and panel.
		* @param props - composed slot props (contract/slots.ts).
		* @returns the settings shell element tree.
		*/
		function SettingsRoot(props) {
			const { wide, useSections, useOnboardingSteps, useSessions, renderSlot } = props;
			const [open, setOpen] = (0, react.useState)(false);
			const [activeId, setActiveId] = (0, react.useState)(void 0);
			const [completedOnboarding, setCompletedOnboarding] = (0, react.useState)(() => /* @__PURE__ */ new Set());
			const close = (0, react.useCallback)(() => {
				setOpen(false);
				setActiveId(void 0);
			}, []);
			const openSection = (0, react.useCallback)((id) => {
				setActiveId(id);
				setOpen(true);
			}, []);
			const rows = useSections((s) => s);
			const onboardingSteps = useOnboardingSteps((s) => s);
			const onboardingActive = useSessions((state) => state.phase === "ready" && (state.current === void 0 || state.byId[state.current]?.blank === true));
			const onboardingStep = onboardingActive ? onboardingSteps.find((step) => !completedOnboarding.has(step.id)) : void 0;
			(0, react.useEffect)(() => {
				if (onboardingActive) return;
				setCompletedOnboarding(/* @__PURE__ */ new Set());
			}, [onboardingActive]);
			const completeOnboardingStep = (0, react.useCallback)((id) => {
				setCompletedOnboarding((previous) => {
					if (previous.has(id)) return previous;
					return new Set([...previous, id]);
				});
			}, []);
			return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				(0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: clsx(SettingsRoot_module_css_default.trigger, !wide && SettingsRoot_module_css_default.rail),
					"aria-haspopup": "dialog",
					"aria-expanded": open,
					onClick: () => {
						setOpen(true);
					},
					children: renderSlot("settings.trigger", { wide })
				}),
				open && (0, react_jsx_runtime.jsx)(SettingsPanel, {
					rows,
					renderSlot,
					activeId,
					onSelect: setActiveId,
					onClose: close
				}),
				onboardingStep !== void 0 && renderSlot("settings.onboarding", {
					stepId: onboardingStep.id,
					complete: () => {
						completeOnboardingStep(onboardingStep.id);
					},
					openSection
				}, { only: onboardingStep.id })
			] });
		}
		//#endregion
		//#region \0dsh-css:/home/runner/work/deepseek-harness/deepseek-harness/packages/client/ui-settings-general/src/client/chrome.module.css.mjs
		const css$2 = ".UQsH_q_triggerLabel{white-space:nowrap;overflow:hidden}";
		const tagId$2 = "@deepseek-ai/dsh-client-ui-settings-general/chrome.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$2) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-settings-general";
			tag.dataset.pluginCss = tagId$2;
			tag.textContent = css$2;
			document.head.appendChild(tag);
		}
		var chrome_module_css_default = { "triggerLabel": "UQsH_q_triggerLabel" };
		//#endregion
		//#region lib/types/client/chrome.js
		/**
		* Shell chrome content registered into the shell's trigger/header seats: the
		* trigger row icon + label (figma sidebar foot) and the panel title text.
		* The shell renders the surrounding chrome (button, nav heading row) and
		* reads each entry's `label` option for aria text.
		*/
		/**
		* Render the trigger row content (icon; label only in the wide column).
		* @param props - composed slot props.
		* @returns the trigger content fragment.
		*/
		function TriggerContent({ wide, t }) {
			return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [wide ? (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSettingsOutline16, { size: 16 }) : (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSettingsOutline14, { size: 18 }), wide && (0, react_jsx_runtime.jsx)("span", {
				className: chrome_module_css_default.triggerLabel,
				children: t("trigger")
			})] });
		}
		/**
		* Render the panel title text.
		* @param props - composed slot props.
		* @returns the title text node.
		*/
		function HeaderContent({ t }) {
			return (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: t("title") });
		}
		/**
		* Render the close button's visually-hidden label text.
		* @param props - composed slot props.
		* @returns the label text node.
		*/
		function CloseLabel({ t }) {
			return (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: t("close") });
		}
		//#endregion
		//#region \0dsh-css:/home/runner/work/deepseek-harness/deepseek-harness/packages/client/ui-settings-general/src/client/GeneralSection.module.css.mjs
		const css$1 = "._WvWnq_section{flex-direction:column;width:100%;display:flex}._WvWnq_section>[data-slot=\"settings.general.item\"]>:last-child{border-bottom:none}";
		const tagId$1 = "@deepseek-ai/dsh-client-ui-settings-general/GeneralSection.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-settings-general";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var GeneralSection_module_css_default = { "section": "_WvWnq_section" };
		//#endregion
		//#region lib/types/client/GeneralSection.js
		/**
		* Render the General section content column.
		* @param props - composed slot props (contract/slots.ts).
		* @returns the section element tree.
		*/
		function GeneralSection({ renderSlot }) {
			return (0, react_jsx_runtime.jsx)("div", {
				className: GeneralSection_module_css_default.section,
				children: renderSlot("settings.general.item", {})
			});
		}
		//#endregion
		//#region \0dsh-css:/home/runner/work/deepseek-harness/deepseek-harness/packages/client/ui-settings-general/src/client/SettingsDocumentAction.module.css.mjs
		const css = ".me01iq_action{align-items:center;gap:8px;min-width:0;display:flex}.me01iq_error{max-width:180px;color:var(--dsw-alias-state-error-primary);text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:18px;overflow:hidden}";
		const tagId = "@deepseek-ai/dsh-client-ui-settings-general/SettingsDocumentAction.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-settings-general";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var SettingsDocumentAction_module_css_default = {
			"error": "me01iq_error",
			"action": "me01iq_action"
		};
		//#endregion
		//#region lib/types/client/SettingsDocumentAction.js
		/** Optional settings-header action for opening a file-backed Host document. */
		/**
		* Render the open-document action only after Host metadata confirms document availability.
		* @param props - header owner props, localized copy, and injected document state.
		* @returns the action, or null while unavailable or unresolved.
		*/
		function SettingsDocumentAction({ controller, useSnapshot, t }) {
			const state = useSnapshot((snapshot) => snapshot);
			(0, react.useEffect)(() => {
				controller.load();
			}, [controller]);
			if (state.status !== "ready") return null;
			return (0, react_jsx_runtime.jsxs)("div", {
				className: SettingsDocumentAction_module_css_default.action,
				children: [state.error === null ? null : (0, react_jsx_runtime.jsx)("span", {
					className: SettingsDocumentAction_module_css_default.error,
					role: "alert",
					children: t("openDocument.error")
				}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "outline",
					size: "sm",
					disabled: state.opening,
					onClick: () => {
						controller.open();
					},
					children: t("openDocument")
				})]
			});
		}
		//#endregion
		//#region lib/types/client/settings-document-store.js
		/** State owner for the optional local settings-document action. */
		function messageOf(error) {
			return error instanceof Error ? error.message : String(error);
		}
		/** Loads local-document availability and invokes the pathless Host-owned open operation. */
		var SettingsDocumentStore = class {
			api;
			/** uSES-safe state source shared by the registered header action. */
			store = (0, _deepseek_ai_dsh_client_runtime_client.createSnapshotStore)({
				status: "idle",
				opening: false,
				error: null
			});
			generation = 0;
			/**
			* @param api - loopback settings wire face that reports and opens the provider document.
			*/
			constructor(api) {
				this.api = api;
			}
			/**
			* Load whether the current provider owns a local document.
			* @returns after the latest metadata response updates the store.
			*/
			async load() {
				const generation = ++this.generation;
				this.store.update((state) => {
					state.status = "loading";
					state.error = null;
				});
				try {
					const { result } = await this.api.settings.describe({});
					if (generation !== this.generation) return;
					if (!result.ok) {
						this.store.update((state) => {
							state.status = "unavailable";
							state.error = result.error.message;
						});
						return;
					}
					this.store.update((state) => {
						state.status = result.value.hasDocument ? "ready" : "unavailable";
						state.error = null;
					});
				} catch (error) {
					if (generation !== this.generation) return;
					this.store.update((state) => {
						state.status = "unavailable";
						state.error = messageOf(error);
					});
				}
			}
			/**
			* Open the loaded document once; concurrent gestures collapse behind the in-flight action.
			* @returns after the native-open request settles, or immediately when unavailable/already opening.
			*/
			async open() {
				const current = this.store.getSnapshot();
				if (current.status !== "ready" || current.opening) return;
				this.store.update((state) => {
					state.opening = true;
					state.error = null;
				});
				try {
					const response = await this.api.settings.openDocument({});
					if (!response.result.ok) throw new Error(response.result.error.message);
				} catch (error) {
					this.store.update((state) => {
						state.error = messageOf(error);
					});
				} finally {
					this.store.update((state) => {
						state.opening = false;
					});
				}
			}
		};
		/**
		* Refresh document availability after reconnect only when a surface has already requested it.
		* @param controller - optional loopback document state owner.
		*/
		function refreshDocumentIfLoaded(controller) {
			if (controller === void 0 || controller.store.getSnapshot().status === "idle") return;
			controller.load();
		}
		//#endregion
		//#region lib/types/client/locales.js
		/** Shell chrome and General-nav dictionaries; feature rows own their copy. */
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"trigger": "设置",
			"title": "设置",
			"close": "关闭",
			"openDocument": "打开配置文件",
			"openDocument.error": "无法打开配置文件",
			"general.nav": "通用设置"
		};
		/** English dictionary, checked complete against the zh key set. */
		const en = {
			"trigger": "Settings",
			"title": "Settings",
			"close": "Close",
			"openDocument": "Open configuration file",
			"openDocument.error": "Could not open configuration file",
			"general.nav": "General"
		};
		//#endregion
		//#region lib/types/client/index.js
		/** Dictionary namespace owned by this plugin (shell chrome + General copy). */
		const NS = "settings";
		/**
		* Required services (cordis fiber inject). The target slots are declared by
		* ui-settings' apply, whose activation order relative to this one is NOT
		* constrained; registrations depend on their slots through `slots.inject()`.
		*/
		const inject = [
			"slots",
			"locale",
			"connection"
		];
		/**
		* Register the `settings` dictionaries, the chrome content, and the General
		* section, each once its slot declaration is on the ledger.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "ui-settings-general: dictionaries");
			const t = ctx.locale.bind(NS);
			const connection = ctx.get("connection");
			const documentController = connection.isLoopback ? new SettingsDocumentStore(connection.api) : void 0;
			const documentInjected = documentController === void 0 ? void 0 : (() => {
				const useSnapshot = (0, _deepseek_ai_dsh_client_web_react.bindSnapshotSelector)(documentController.store);
				return () => ({
					controller: documentController,
					useSnapshot
				});
			})();
			ctx.effect(() => ctx.on("connection/reset", () => {
				refreshDocumentIfLoaded(documentController);
			}), "ui-settings-general: metadata invalidations");
			let rowsVersion = -1;
			let rowsRevision = -1;
			let rows = [];
			let onboardingVersion = -1;
			let onboardingSteps = [];
			const shellInjected = () => ({ hooks: {
				sections: {
					getSnapshot: () => {
						const version = ctx.slots.getVersion("settings.section");
						const revision = ctx.locale.getSnapshot().revision;
						if (version !== rowsVersion || revision !== rowsRevision) {
							rowsVersion = version;
							rowsRevision = revision;
							rows = ctx.slots.entries("settings.section").map((e) => ({
								/* v8 ignore next -- list-slot registration requires id (SlotCore rejects an entry without one) */
								id: e.options.id ?? "",
								order: e.options.order ?? 0,
								label: (0, _deepseek_ai_dsh_client_ui_slots.resolveSlotLabel)(e.options.label) ?? ""
							})).sort((a, b) => a.order - b.order);
						}
						return rows;
					},
					subscribe: (listener) => {
						const offLedger = ctx.slots.subscribe("settings.section", listener);
						const offLocale = ctx.locale.subscribe(listener);
						return () => {
							offLedger();
							offLocale();
						};
					}
				},
				onboardingSteps: {
					getSnapshot: () => {
						const version = ctx.slots.getVersion("settings.onboarding");
						if (version !== onboardingVersion) {
							onboardingVersion = version;
							onboardingSteps = ctx.slots.entries("settings.onboarding").map((e) => ({
								/* v8 ignore next -- list-slot registration requires id */
								id: e.options.id ?? "",
								order: e.options.order ?? 0
							})).sort((a, b) => a.order - b.order);
						}
						return onboardingSteps;
					},
					subscribe: (listener) => ctx.slots.subscribe("settings.onboarding", listener)
				}
			} });
			ctx.slots.inject("sidebar.settings", () => ctx.slots.register({
				name: "sidebar.settings",
				children: {
					"settings.trigger": {
						kind: "single",
						scope: "root"
					},
					"settings.header": {
						kind: "single",
						scope: "root"
					},
					"settings.action": {
						kind: "list",
						scope: "root"
					},
					"settings.close": {
						kind: "single",
						scope: "root"
					},
					"settings.section": {
						kind: "list",
						scope: "root"
					},
					"settings.onboarding": {
						kind: "list",
						scope: "root"
					}
				},
				inject: shellInjected
			}, SettingsRoot));
			ctx.slots.inject("settings.trigger", () => ctx.slots.register({
				name: "settings.trigger",
				locale: NS
			}, TriggerContent));
			ctx.slots.inject("settings.header", () => ctx.slots.register({
				name: "settings.header",
				locale: NS
			}, HeaderContent));
			if (documentInjected !== void 0) ctx.slots.inject("settings.action", () => ctx.slots.register({
				name: "settings.action",
				id: "open-document",
				order: 0,
				locale: NS,
				inject: documentInjected
			}, SettingsDocumentAction));
			ctx.slots.inject("settings.close", () => ctx.slots.register({
				name: "settings.close",
				locale: NS
			}, CloseLabel));
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "general",
				order: 0,
				label: () => t("general.nav"),
				locale: NS,
				children: { "settings.general.item": {
					kind: "list",
					scope: "root"
				} }
			}, GeneralSection));
		}
		//#endregion
		exports.SettingsDocumentStore = SettingsDocumentStore;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map