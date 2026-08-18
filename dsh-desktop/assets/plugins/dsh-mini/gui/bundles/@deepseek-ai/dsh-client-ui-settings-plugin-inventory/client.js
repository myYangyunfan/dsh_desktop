window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-client-ui-settings-plugin-inventory",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		//#region \0dsh-css:/home/runner/work/deepseek-harness/deepseek-harness/packages/client/ui-settings-plugin-inventory/src/client/PluginInventorySettingsTab.module.css.mjs
		const css = ".qSYn7G_section{width:100%;max-width:760px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:14px;display:flex}.qSYn7G_catalogHeading h3,.qSYn7G_status,.qSYn7G_failure p{margin:0}.qSYn7G_status,.qSYn7G_failure{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}.qSYn7G_failure{color:var(--dsw-alias-state-error-primary);align-items:center;gap:10px;display:flex}.qSYn7G_failure button{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;background:0 0;border-radius:6px;padding:4px 10px}.qSYn7G_catalog{flex-direction:column;gap:12px;display:flex}.qSYn7G_search{width:100%;color:var(--dsw-alias-label-tertiary);align-items:center;display:flex;position:relative}.qSYn7G_search>svg{pointer-events:none;position:absolute;left:12px}.qSYn7G_search input{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);width:100%;height:36px;color:var(--dsw-alias-label-primary);font:inherit;border-radius:8px;outline:none;padding:0 34px 0 36px;font-size:13px}.qSYn7G_search input::placeholder{color:var(--dsw-alias-label-tertiary)}.qSYn7G_search input:focus-visible{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-business-primary) 18%, transparent)}.qSYn7G_catalogHeading{align-items:baseline;gap:7px;padding:0 2px;display:flex}.qSYn7G_catalogHeading h3{font-size:13px;font-weight:600;line-height:20px}.qSYn7G_catalogHeading span{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;font-size:12px;line-height:18px}.qSYn7G_cards{grid-template-columns:repeat(2,minmax(0,1fr));align-items:start;gap:10px;margin:0;padding:0;list-style:none;display:grid}.qSYn7G_card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:10px;min-width:0;overflow:hidden}.qSYn7G_card[data-open=true]{border-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-shadow-lv1)}.qSYn7G_cardContent{box-sizing:border-box;width:100%;min-height:52px;color:inherit;font:inherit;text-align:left;cursor:pointer;background:0 0;border:0;justify-content:space-between;align-items:center;gap:12px;padding:12px 14px;display:flex}.qSYn7G_cardContent:hover,.qSYn7G_card[data-open=true]>.qSYn7G_cardContent{background:var(--dsw-alias-interactive-bg-hover)}.qSYn7G_cardContent:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}.qSYn7G_cardTitle{text-overflow:ellipsis;white-space:nowrap;min-width:0;font-size:14px;font-weight:600;line-height:20px;overflow:hidden}.qSYn7G_cardTrailing{color:var(--dsw-alias-label-tertiary);flex:none;align-items:center;gap:7px;display:inline-flex}.qSYn7G_statusDot{background:var(--dsw-alias-label-tertiary);border-radius:999px;flex:none;width:7px;height:7px;display:inline-block}.qSYn7G_statusDot[data-phase=active]{background:var(--dsw-alias-state-success-primary)}.qSYn7G_statusDot[data-phase=failed]{background:var(--dsw-alias-state-error-primary)}.qSYn7G_statusDot[data-phase=loading]{background:var(--dsw-alias-state-business-primary)}.qSYn7G_configTag{background:var(--dsw-alias-bg-layer-1);min-height:20px;color:var(--dsw-alias-label-secondary);white-space:nowrap;border-radius:5px;align-items:center;padding:1px 6px;font-size:11px;line-height:16px;display:inline-flex}.qSYn7G_configTag[data-enabled=true]{background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, transparent);color:var(--dsw-alias-state-success-primary)}.qSYn7G_chevron{color:var(--dsw-alias-label-tertiary);flex:none}.qSYn7G_card[data-open=true] .qSYn7G_chevron{transform:rotate(180deg)}.qSYn7G_cardDetails{border-top:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-module-platform);padding:10px 14px 12px}.qSYn7G_entryValue{overflow-wrap:anywhere;color:var(--dsw-alias-label-primary);font-family:var(--ds-font-family-code);font-size:12px;line-height:18px;display:block}.qSYn7G_details{grid-template-columns:76px minmax(0,1fr);gap:6px 10px;margin:8px 0 0;display:grid}.qSYn7G_details div{display:contents}.qSYn7G_details dt{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:17px}.qSYn7G_details dd{overflow-wrap:anywhere;min-width:0;color:var(--dsw-alias-label-secondary);margin:0;font-size:12px;line-height:17px}.qSYn7G_visuallyHidden{clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;width:1px;height:1px;position:absolute;overflow:hidden}@media (prefers-reduced-motion:no-preference){.qSYn7G_chevron{transition:transform .14s var(--ds-ease-in-out)}}@media (width<=680px){.qSYn7G_cards{grid-template-columns:minmax(0,1fr)}}";
		const tagId = "@deepseek-ai/dsh-client-ui-settings-plugin-inventory/PluginInventorySettingsTab.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-settings-plugin-inventory";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var PluginInventorySettingsTab_module_css_default = {
			"cardContent": "qSYn7G_cardContent",
			"visuallyHidden": "qSYn7G_visuallyHidden",
			"configTag": "qSYn7G_configTag",
			"search": "qSYn7G_search",
			"catalogHeading": "qSYn7G_catalogHeading",
			"cards": "qSYn7G_cards",
			"chevron": "qSYn7G_chevron",
			"cardTrailing": "qSYn7G_cardTrailing",
			"status": "qSYn7G_status",
			"section": "qSYn7G_section",
			"catalog": "qSYn7G_catalog",
			"cardTitle": "qSYn7G_cardTitle",
			"entryValue": "qSYn7G_entryValue",
			"failure": "qSYn7G_failure",
			"statusDot": "qSYn7G_statusDot",
			"cardDetails": "qSYn7G_cardDetails",
			"details": "qSYn7G_details",
			"card": "qSYn7G_card"
		};
		//#endregion
		//#region lib/types/client/PluginInventorySettingsTab.js
		const PHASE_KEYS = {
			pending: "pending",
			loading: "loadingPhase",
			active: "active",
			failed: "failed",
			unloading: "unloading"
		};
		/** Localized accessible label for one root Fiber phase. */
		function phaseLabel(phase, t) {
			return phase === null ? t("unobserved") : t(PHASE_KEYS[phase]);
		}
		/** Compact a module specifier without guessing whether its Loader id was generated. */
		function moduleShortName(moduleName) {
			return (moduleName.startsWith("@") ? moduleName.slice(moduleName.indexOf("/") + 1) : moduleName).replace(/^cordis:/, "").replace(/^cordis-plugin-/, "").replace(/^dsh-(?:host-|client-)?/, "");
		}
		/** Whether an inventory row matches the local catalog query. */
		function matches(entry, normalizedQuery) {
			if (normalizedQuery.length === 0) return true;
			return [entry.moduleName, entry.entryId].some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
		}
		/** Render the read-only current Loader inventory. */
		function PluginInventorySettingsTab({ list, t }) {
			const catalogId = (0, react.useId)();
			const [request, setRequest] = (0, react.useState)(0);
			const [query, setQuery] = (0, react.useState)("");
			const [expanded, setExpanded] = (0, react.useState)(null);
			const [state, setState] = (0, react.useState)({ status: "loading" });
			(0, react.useEffect)(() => {
				let current = true;
				Promise.resolve().then(() => list()).then((snapshot) => {
					if (current) setState({
						status: "ready",
						snapshot
					});
				}, () => {
					if (current) setState({ status: "error" });
				});
				return () => {
					current = false;
				};
			}, [list, request]);
			const normalizedQuery = query.trim().toLocaleLowerCase();
			const filteredEntries = (0, react.useMemo)(() => state.status === "ready" ? state.snapshot.entries.filter((entry) => matches(entry, normalizedQuery)) : [], [normalizedQuery, state]);
			(0, react.useEffect)(() => {
				if (expanded !== null && !filteredEntries.some((entry) => entry.entryId === expanded)) setExpanded(null);
			}, [expanded, filteredEntries]);
			const retry = () => {
				setState({ status: "loading" });
				setRequest((value) => value + 1);
			};
			return (0, react_jsx_runtime.jsxs)("div", {
				className: PluginInventorySettingsTab_module_css_default.section,
				"aria-busy": state.status === "loading",
				children: [
					state.status === "loading" ? (0, react_jsx_runtime.jsx)("p", {
						className: PluginInventorySettingsTab_module_css_default.status,
						children: t("loading")
					}) : null,
					state.status === "error" ? (0, react_jsx_runtime.jsxs)("div", {
						className: PluginInventorySettingsTab_module_css_default.failure,
						children: [(0, react_jsx_runtime.jsx)("p", {
							role: "alert",
							children: t("error")
						}), (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: retry,
							children: t("retry")
						})]
					}) : null,
					state.status === "ready" ? (0, react_jsx_runtime.jsxs)("div", {
						className: PluginInventorySettingsTab_module_css_default.catalog,
						children: [
							(0, react_jsx_runtime.jsxs)("label", {
								className: PluginInventorySettingsTab_module_css_default.search,
								children: [
									(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSearchOutline16, { "aria-hidden": "true" }),
									(0, react_jsx_runtime.jsx)("span", {
										className: PluginInventorySettingsTab_module_css_default.visuallyHidden,
										children: t("search")
									}),
									(0, react_jsx_runtime.jsx)("input", {
										type: "search",
										value: query,
										placeholder: t("search"),
										"aria-label": t("search"),
										onChange: (event) => {
											setQuery(event.currentTarget.value);
										}
									})
								]
							}),
							(0, react_jsx_runtime.jsxs)("div", {
								className: PluginInventorySettingsTab_module_css_default.catalogHeading,
								children: [(0, react_jsx_runtime.jsx)("h3", { children: t("catalog") }), (0, react_jsx_runtime.jsx)("span", {
									"data-plugin-count": filteredEntries.length,
									children: filteredEntries.length
								})]
							}),
							state.snapshot.entries.length === 0 ? (0, react_jsx_runtime.jsx)("p", {
								className: PluginInventorySettingsTab_module_css_default.status,
								children: t("empty")
							}) : null,
							state.snapshot.entries.length > 0 && filteredEntries.length === 0 ? (0, react_jsx_runtime.jsx)("p", {
								className: PluginInventorySettingsTab_module_css_default.status,
								children: t("emptySearch")
							}) : null,
							filteredEntries.length > 0 ? (0, react_jsx_runtime.jsx)("ul", {
								className: PluginInventorySettingsTab_module_css_default.cards,
								children: filteredEntries.map((entry) => {
									const status = phaseLabel(entry.fiberPhase, t);
									const title = moduleShortName(entry.moduleName);
									const configuration = t(entry.enabled ? "enabledTag" : "disabledTag");
									const open = expanded === entry.entryId;
									const detailId = `${catalogId}-details-${encodeURIComponent(entry.entryId)}`;
									return (0, react_jsx_runtime.jsxs)("li", {
										className: PluginInventorySettingsTab_module_css_default.card,
										"data-plugin-entry": entry.entryId,
										"data-open": open ? "true" : void 0,
										children: [(0, react_jsx_runtime.jsxs)("button", {
											className: PluginInventorySettingsTab_module_css_default.cardContent,
											type: "button",
											"aria-expanded": open,
											"aria-controls": detailId,
											"aria-label": entry.enabled ? `${title}, ${status}, ${configuration}` : `${title}, ${configuration}`,
											onClick: () => {
												setExpanded((current) => current === entry.entryId ? null : entry.entryId);
											},
											children: [(0, react_jsx_runtime.jsx)("strong", {
												className: PluginInventorySettingsTab_module_css_default.cardTitle,
												title: entry.moduleName,
												children: title
											}), (0, react_jsx_runtime.jsxs)("span", {
												className: PluginInventorySettingsTab_module_css_default.cardTrailing,
												children: [
													entry.enabled ? (0, react_jsx_runtime.jsx)("span", {
														className: PluginInventorySettingsTab_module_css_default.statusDot,
														"data-phase": entry.fiberPhase ?? "unobserved",
														role: "img",
														"aria-label": status,
														title: status
													}) : null,
													(0, react_jsx_runtime.jsx)("span", {
														className: PluginInventorySettingsTab_module_css_default.configTag,
														"data-enabled": entry.enabled ? "true" : "false",
														children: configuration
													}),
													(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, {
														className: PluginInventorySettingsTab_module_css_default.chevron,
														size: 12,
														"aria-hidden": "true"
													})
												]
											})]
										}), open ? (0, react_jsx_runtime.jsxs)("div", {
											className: PluginInventorySettingsTab_module_css_default.cardDetails,
											id: detailId,
											children: [(0, react_jsx_runtime.jsx)("code", {
												className: PluginInventorySettingsTab_module_css_default.entryValue,
												"data-loader-entry": true,
												children: entry.entryId
											}), (0, react_jsx_runtime.jsxs)("dl", {
												className: PluginInventorySettingsTab_module_css_default.details,
												children: [(0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("dt", { children: t("configuration") }), (0, react_jsx_runtime.jsx)("dd", { children: configuration })] }), entry.enabled ? (0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("dt", { children: t("cordis") }), (0, react_jsx_runtime.jsx)("dd", { children: status })] }) : null]
											})]
										}) : null]
									}, entry.entryId);
								})
							}) : null
						]
					}) : null
				]
			});
		}
		//#endregion
		//#region lib/types/client/locales.js
		/** Copy dictionaries for the plugin inventory Settings section. */
		/** Simplified Chinese dictionary and key source of truth. */
		const zh = {
			tab: "插件列表",
			loading: "正在读取插件…",
			error: "暂时无法读取插件。",
			retry: "重试",
			search: "搜索插件",
			catalog: "插件列表",
			empty: "暂无插件。",
			emptySearch: "没有匹配的插件。",
			enabledTag: "已启用",
			disabledTag: "已停用",
			configuration: "配置状态",
			cordis: "Cordis 状态",
			unobserved: "未挂载",
			pending: "等待依赖",
			loadingPhase: "加载中",
			active: "已挂载",
			failed: "挂载失败",
			unloading: "卸载中"
		};
		/** English dictionary checked against the Chinese key set. */
		const en = {
			tab: "Plugin list",
			loading: "Reading plugins…",
			error: "Plugins are temporarily unavailable.",
			retry: "Retry",
			search: "Search plugins",
			catalog: "Plugin list",
			empty: "No plugins are available.",
			emptySearch: "No matching plugins.",
			enabledTag: "Enabled",
			disabledTag: "Disabled",
			configuration: "Configuration",
			cordis: "Cordis status",
			unobserved: "Not mounted",
			pending: "Waiting for dependencies",
			loadingPhase: "Loading",
			active: "Mounted",
			failed: "Mount failed",
			unloading: "Unloading"
		};
		//#endregion
		//#region lib/types/client/index.js
		/** Read-only Host plugin inventory registered into Web Settings. */
		/** Dictionary namespace owned by this plugin. */
		const NS = "settings.pluginInventory";
		/** Services required by the Settings registration and generated Remote face. */
		const inject = [
			"slots",
			"locale",
			"remote",
			"remote.pluginInventory"
		];
		/** Contribute the lazy inventory tab to the Plugins settings section. */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "ui-settings-plugin-inventory: dictionaries");
			const t = ctx.locale.bind(NS);
			const list = async () => {
				const result = await ctx.remote.pluginInventory.list();
				if (!result.ok) throw new Error(`pluginInventory.list failed: ${result.error.code}: ${result.error.message}`);
				return result.value;
			};
			const injected = () => ({ list });
			ctx.slots.inject("settings.plugins.tab", () => ctx.slots.register({
				name: "settings.plugins.tab",
				id: "all",
				order: 10,
				label: () => t("tab"),
				locale: NS,
				inject: injected
			}, PluginInventorySettingsTab));
		}
		//#endregion
		exports.NS = NS;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map