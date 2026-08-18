// dsh-desktop patch (issue #20): web-search baseURL 契约文案已修正
window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-client-ui-settings-plugins",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let _deepseek_ai_dsh_client_ui_slots = require("@deepseek-ai/dsh-client-ui-slots");
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let _deepseek_ai_dsh_client_runtime_client = require("@deepseek-ai/dsh-client-runtime/client");
		//#region \0dsh-css:/home/runner/work/deepseek-harness/deepseek-harness/packages/client/ui-settings-plugins/src/client/fields.module.css.mjs
		const css$2 = ".At1oFq_field{flex-direction:column;gap:6px;padding:12px 0;display:flex}.At1oFq_field+.At1oFq_field{border-top:1px solid var(--dsw-alias-border-l2)}.At1oFq_head{align-items:center;gap:8px;display:flex}.At1oFq_label{min-width:0;color:var(--dsw-alias-label-primary);flex:1;font-size:13px;font-weight:500;line-height:1.5}.At1oFq_badges{align-items:center;gap:8px;display:inline-flex}.At1oFq_badge{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}.At1oFq_badgeMuted{white-space:nowrap;color:var(--dsw-alias-label-tertiary);border-radius:999px;padding:1px 8px;font-size:11px;line-height:17px}.At1oFq_reset{font:inherit;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;padding:0;font-size:12px;line-height:1.5}.At1oFq_reset:hover:not(:disabled){color:var(--dsw-alias-label-primary)}.At1oFq_reset:disabled{cursor:default}.At1oFq_input{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);height:34px;font:inherit;color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 12px;font-size:13px;line-height:1.5}.At1oFq_input:focus-visible{border-color:var(--dsw-alias-brand-primary);outline:none}.At1oFq_input:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}.At1oFq_inputInvalid{border-color:var(--dsw-alias-label-error);}.At1oFq_invalid{color:var(--dsw-alias-label-error);margin:0;font-size:12px;line-height:1.5}.At1oFq_hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}";
		const tagId$2 = "@deepseek-ai/dsh-client-ui-settings-plugins/fields.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$2) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-settings-plugins";
			tag.dataset.pluginCss = tagId$2;
			tag.textContent = css$2;
			document.head.appendChild(tag);
		}
		var fields_module_css_default = {
			"badgeMuted": "At1oFq_badgeMuted",
			"reset": "At1oFq_reset",
			"head": "At1oFq_head",
			"hint": "At1oFq_hint",
			"label": "At1oFq_label",
			"badges": "At1oFq_badges",
			"field": "At1oFq_field",
			"badge": "At1oFq_badge",
			"input": "At1oFq_input",
			"inputInvalid": "At1oFq_inputInvalid",
			"invalid": "At1oFq_invalid"
		};
		//#endregion
		//#region lib/types/client/fields.js
		/**
		* Hand-written controls for the plugin configuration forms. Each renders one
		* field's label, its staged text, whether saving would leave an override, and
		* — when one stands — the reset that stages a clear back to the composition
		* layer. Nothing here writes: a control reports what the user typed, and the
		* card's save is the single point where a draft becomes a document mutation.
		*/
		/**
		* A staged value field. `numeric` only hints the keypad: which drafts a field
		* accepts is decided by its spec, so the control never silently rewrites what
		* the user typed.
		* @param props - the field's copy, its staged text, and the edit actions.
		* @returns the labelled control.
		*/
		function ValueField(props) {
			return (0, react_jsx_runtime.jsxs)("div", {
				className: fields_module_css_default.field,
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						className: fields_module_css_default.head,
						children: [(0, react_jsx_runtime.jsx)("label", {
							className: fields_module_css_default.label,
							htmlFor: props.id,
							children: props.label
						}), props.overridden ? (0, react_jsx_runtime.jsxs)("span", {
							className: fields_module_css_default.badges,
							children: [(0, react_jsx_runtime.jsx)("span", {
								className: fields_module_css_default.badge,
								children: props.overriddenLabel
							}), (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: fields_module_css_default.reset,
								disabled: props.disabled,
								onClick: props.onReset,
								children: props.resetLabel
							})]
						}) : null]
					}),
					(0, react_jsx_runtime.jsx)("input", {
						id: props.id,
						className: props.invalid ? fields_module_css_default.inputInvalid : fields_module_css_default.input,
						type: "text",
						...props.numeric === true ? { inputMode: "numeric" } : {},
						...props.invalid ? { "aria-invalid": true } : {},
						value: props.text,
						placeholder: props.placeholder ?? "",
						disabled: props.disabled,
						onChange: (event) => {
							props.onEdit(event.target.value);
						}
					}),
					(0, react_jsx_runtime.jsx)("p", {
						className: props.invalid ? fields_module_css_default.invalid : fields_module_css_default.hint,
						children: props.invalid ? props.invalidLabel : props.hint
					})
				]
			});
		}
		/**
		* A write-only credential control. The value never rides a response, so the
		* control reports only whether one is configured and starts blank; a blank
		* draft writes nothing, which keeps the stored key rather than clearing it.
		* @param props - the field's copy, its staged text, and the configured state.
		* @returns the labelled control.
		*/
		function SecretField(props) {
			return (0, react_jsx_runtime.jsxs)("div", {
				className: fields_module_css_default.field,
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						className: fields_module_css_default.head,
						children: [(0, react_jsx_runtime.jsx)("label", {
							className: fields_module_css_default.label,
							htmlFor: props.id,
							children: props.label
						}), (0, react_jsx_runtime.jsx)("span", {
							className: fields_module_css_default.badges,
							children: (0, react_jsx_runtime.jsx)("span", {
								className: props.configured ? fields_module_css_default.badge : fields_module_css_default.badgeMuted,
								children: props.stateLabel
							})
						})]
					}),
					(0, react_jsx_runtime.jsx)("input", {
						id: props.id,
						className: fields_module_css_default.input,
						type: "password",
						autoComplete: "off",
						value: props.text,
						disabled: props.disabled,
						onChange: (event) => {
							props.onEdit(event.target.value);
						}
					}),
					(0, react_jsx_runtime.jsx)("p", {
						className: fields_module_css_default.hint,
						children: props.hint
					})
				]
			});
		}
		//#endregion
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
		//#region \0dsh-css:/home/runner/work/deepseek-harness/deepseek-harness/packages/client/ui-settings-plugins/src/client/PluginCard.module.css.mjs
		const css$1 = ".YyYd_a_card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;list-style:none;transition:border-color .16s,background .16s}.YyYd_a_card:hover{border-color:var(--dsw-alias-label-dimmed)}.YyYd_a_cardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}.YyYd_a_header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}.YyYd_a_header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}.YyYd_a_headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}.YyYd_a_name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}.YyYd_a_description{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}.YyYd_a_chevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}.YyYd_a_chevronOpen{transform:rotate(180deg)}.YyYd_a_body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:8px}.YyYd_a_readOnly{color:var(--dsw-alias-label-tertiary);margin:12px 0 0;font-size:12px;line-height:1.5}.YyYd_a_pending{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;flex:none;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}.YyYd_a_footer{border-top:1px solid var(--dsw-alias-border-l2);justify-content:flex-end;align-items:center;gap:8px;padding:12px 0 4px;display:flex}.YyYd_a_failed{min-width:0;color:var(--dsw-alias-label-error);flex:1;margin:0;font-size:12px;line-height:1.5}.YyYd_a_discard,.YyYd_a_save{appearance:none;font:inherit;cursor:pointer;border:1px solid #0000;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5}.YyYd_a_discard{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:0 0}.YyYd_a_discard:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}.YyYd_a_save{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}.YyYd_a_discard:disabled,.YyYd_a_save:disabled{opacity:.4;cursor:default}.YyYd_a_discard:focus-visible,.YyYd_a_save:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}";
		const tagId$1 = "@deepseek-ai/dsh-client-ui-settings-plugins/PluginCard.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-settings-plugins";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var PluginCard_module_css_default = {
			"chevronOpen": "YyYd_a_chevronOpen",
			"failed": "YyYd_a_failed",
			"readOnly": "YyYd_a_readOnly",
			"footer": "YyYd_a_footer",
			"header": "YyYd_a_header",
			"description": "YyYd_a_description",
			"save": "YyYd_a_save",
			"name": "YyYd_a_name",
			"chevron": "YyYd_a_chevron",
			"cardOpen": "YyYd_a_cardOpen",
			"headText": "YyYd_a_headText",
			"card": "YyYd_a_card",
			"pending": "YyYd_a_pending",
			"discard": "YyYd_a_discard",
			"body": "YyYd_a_body"
		};
		//#endregion
		//#region lib/types/client/PluginCard.js
		/**
		* One plugin's card: a header naming the plugin and what its settings govern,
		* disclosing that plugin's controls in place, with the save that writes them.
		*
		* The header is its own button rather than a shared disclosure row because a
		* card stacks its name over its description, while that row lays the two side
		* by side — the layout, not the behavior, is what differs. Disclosure is
		* card-local state: which card a user has open is a reading gesture, not
		* something the Host or the section has any stake in. Staged edits outlive
		* collapsing, so the header marks a card holding unsaved edits.
		*
		* A card renders nothing while its namespace is unavailable: a deployment that
		* does not compose the owning plugin should show no trace of it, rather than a
		* disabled card the user cannot act on.
		*/
		/**
		* Render one plugin card.
		* @param props - the plugin's copy keys, its form state, and its controls.
		* @returns the card, or nothing when the namespace is unavailable.
		*/
		function PluginCard(props) {
			const [open, setOpen] = (0, react.useState)(false);
			const { state } = props;
			if (!state.available) return null;
			const title = props.t(props.titleKey);
			const blocked = !state.dirty || state.invalid || state.saving;
			return (0, react_jsx_runtime.jsxs)("li", {
				className: clsx(PluginCard_module_css_default.card, open && PluginCard_module_css_default.cardOpen),
				children: [(0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: PluginCard_module_css_default.header,
					"aria-expanded": open,
					"aria-label": `${props.t(open ? "collapse" : "expand")}: ${title}`,
					onClick: () => {
						setOpen(!open);
					},
					children: [
						(0, react_jsx_runtime.jsxs)("span", {
							className: PluginCard_module_css_default.headText,
							children: [(0, react_jsx_runtime.jsx)("span", {
								className: PluginCard_module_css_default.name,
								children: title
							}), (0, react_jsx_runtime.jsx)("span", {
								className: PluginCard_module_css_default.description,
								children: props.t(props.descriptionKey)
							})]
						}),
						state.dirty ? (0, react_jsx_runtime.jsx)("span", {
							className: PluginCard_module_css_default.pending,
							children: props.t("unsaved")
						}) : null,
						(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { className: clsx(PluginCard_module_css_default.chevron, open && PluginCard_module_css_default.chevronOpen) })
					]
				}), open ? (0, react_jsx_runtime.jsxs)("div", {
					className: PluginCard_module_css_default.body,
					children: [
						!state.writable ? (0, react_jsx_runtime.jsx)("p", {
							className: PluginCard_module_css_default.readOnly,
							role: "status",
							children: props.t("readOnly")
						}) : null,
						props.children,
						(0, react_jsx_runtime.jsxs)("div", {
							className: PluginCard_module_css_default.footer,
							children: [
								state.failed ? (0, react_jsx_runtime.jsx)("p", {
									className: PluginCard_module_css_default.failed,
									role: "status",
									children: props.t("saveFailed")
								}) : null,
								(0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: PluginCard_module_css_default.discard,
									disabled: !state.dirty || state.saving,
									onClick: props.onDiscard,
									children: props.t("discard")
								}),
								(0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: PluginCard_module_css_default.save,
									disabled: blocked,
									onClick: props.onSave,
									children: props.t(state.saving ? "saving" : "save")
								})
							]
						})
					]
				}) : null]
			});
		}
		//#endregion
		//#region lib/types/client/AgentLoopCard.js
		/**
		* Render the agent-loop card.
		* @param props - locale copy, the card snapshot, and its form actions.
		* @returns the card.
		*/
		function AgentLoopCard(props) {
			const { t } = props;
			const state = props.useAgentLoopCard((snapshot) => snapshot);
			return (0, react_jsx_runtime.jsx)(PluginCard, {
				t,
				titleKey: "agentLoopTitle",
				descriptionKey: "agentLoopDescription",
				state,
				onSave: props.save,
				onDiscard: props.discard,
				children: (0, react_jsx_runtime.jsx)(ValueField, {
					id: "plugin-config-agent-loop-parallel",
					label: t("agentLoopMaxParallel"),
					hint: t("agentLoopMaxParallelHint"),
					overriddenLabel: t("overridden"),
					resetLabel: t("reset"),
					invalidLabel: t("invalidNumber"),
					numeric: true,
					disabled: !state.writable,
					...state.maxParallelToolCalls,
					onEdit: (text) => {
						props.edit("maxParallelToolCalls", text);
					},
					onReset: () => {
						props.resetField("maxParallelToolCalls");
					}
				})
			});
		}
		//#endregion
		//#region lib/types/client/BashCard.js
		/**
		* Render the shell card.
		* @param props - locale copy, the card snapshot, and its form actions.
		* @returns the card.
		*/
		function BashCard(props) {
			const { t } = props;
			const state = props.useBashCard((snapshot) => snapshot);
			const disabled = !state.writable;
			return (0, react_jsx_runtime.jsxs)(PluginCard, {
				t,
				titleKey: "bashTitle",
				descriptionKey: "bashDescription",
				state,
				onSave: props.save,
				onDiscard: props.discard,
				children: [(0, react_jsx_runtime.jsx)(ValueField, {
					id: "plugin-config-bash-timeout",
					label: t("bashTimeoutMs"),
					hint: t("bashTimeoutMsHint"),
					overriddenLabel: t("overridden"),
					resetLabel: t("reset"),
					invalidLabel: t("invalidNumber"),
					numeric: true,
					disabled,
					...state.timeoutMs,
					onEdit: (text) => {
						props.edit("timeoutMs", text);
					},
					onReset: () => {
						props.resetField("timeoutMs");
					}
				}), (0, react_jsx_runtime.jsx)(ValueField, {
					id: "plugin-config-bash-output",
					label: t("bashMaxOutputBytes"),
					hint: t("bashMaxOutputBytesHint"),
					overriddenLabel: t("overridden"),
					resetLabel: t("reset"),
					invalidLabel: t("invalidNumber"),
					numeric: true,
					disabled,
					...state.maxOutputBytes,
					onEdit: (text) => {
						props.edit("maxOutputBytes", text);
					},
					onReset: () => {
						props.resetField("maxOutputBytes");
					}
				})]
			});
		}
		//#endregion
		//#region \0dsh-css:/home/runner/work/deepseek-harness/deepseek-harness/packages/client/ui-settings-plugins/src/client/PluginsSettingsSection.module.css.mjs
		const css = ".pbvGtq_section{max-width:760px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:12px;display:flex}.pbvGtq_heading{margin:0;font-size:18px;font-weight:600}.pbvGtq_intro{color:var(--dsw-alias-label-tertiary);margin:0;font-size:13px}.pbvGtq_tabs{border-bottom:1px solid var(--dsw-alias-border-l2);align-items:flex-end;gap:22px;margin-top:2px;display:flex}.pbvGtq_tab{color:var(--dsw-alias-label-tertiary);font:inherit;cursor:pointer;background:0 0;border:0;padding:7px 1px 9px;font-size:13px;line-height:20px;position:relative}.pbvGtq_tab:hover,.pbvGtq_tab[data-active=true]{color:var(--dsw-alias-label-primary)}.pbvGtq_tab[data-active=true]:after,.pbvGtq_tab:focus-visible:after{background:var(--dsw-alias-label-primary);content:\"\";border-radius:2px 2px 0 0;height:2px;position:absolute;bottom:-1px;left:0;right:0}.pbvGtq_tab:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px;color:var(--dsw-alias-label-primary);border-radius:2px}.pbvGtq_panel{min-width:0;padding-top:2px}.pbvGtq_cards{flex-direction:column;gap:10px;margin:0;padding:0;list-style:none;display:flex}.pbvGtq_empty{color:var(--dsw-alias-label-tertiary);margin:0;font-size:13px}";
		const tagId = "@deepseek-ai/dsh-client-ui-settings-plugins/PluginsSettingsSection.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-settings-plugins";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var PluginsSettingsSection_module_css_default = {
			"heading": "pbvGtq_heading",
			"cards": "pbvGtq_cards",
			"intro": "pbvGtq_intro",
			"tabs": "pbvGtq_tabs",
			"panel": "pbvGtq_panel",
			"empty": "pbvGtq_empty",
			"tab": "pbvGtq_tab",
			"section": "pbvGtq_section"
		};
		//#endregion
		//#region lib/types/client/ConfigurablePluginsTab.js
		/** Render cards registered by plugins that expose editable settings. */
		function ConfigurablePluginsTab({ t, renderSlot, cardCount }) {
			return cardCount === 0 ? (0, react_jsx_runtime.jsx)("p", {
				className: PluginsSettingsSection_module_css_default.empty,
				children: t("empty")
			}) : (0, react_jsx_runtime.jsx)("ul", {
				className: PluginsSettingsSection_module_css_default.cards,
				children: renderSlot("settings.plugin.item", {})
			});
		}
		//#endregion
		//#region lib/types/client/PluginsSettingsSection.js
		/** Plugins settings section: localized tabs around feature-owned pages. */
		/** Render one Plugins page whose contents arrive from feature-owned tabs. */
		function PluginsSettingsSection({ t, renderSlot, useTabs }) {
			const tabsId = (0, react.useId)();
			const tabRefs = (0, react.useRef)([]);
			const rows = useTabs((value) => value);
			const [activeId, setActiveId] = (0, react.useState)();
			const [visitedIds, setVisitedIds] = (0, react.useState)(() => /* @__PURE__ */ new Set());
			const active = rows.find((row) => row.id === activeId)?.id ?? rows[0]?.id;
			(0, react.useEffect)(() => {
				if (active === void 0) return;
				setVisitedIds((previous) => {
					if (previous.has(active)) return previous;
					return new Set([...previous, active]);
				});
			}, [active]);
			return (0, react_jsx_runtime.jsxs)("div", {
				className: PluginsSettingsSection_module_css_default.section,
				children: [
					(0, react_jsx_runtime.jsx)("h2", {
						className: PluginsSettingsSection_module_css_default.heading,
						children: t("title")
					}),
					(0, react_jsx_runtime.jsx)("p", {
						className: PluginsSettingsSection_module_css_default.intro,
						children: t("intro")
					}),
					rows.length === 0 ? (0, react_jsx_runtime.jsx)("p", {
						className: PluginsSettingsSection_module_css_default.empty,
						children: t("empty")
					}) : (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)("div", {
						className: PluginsSettingsSection_module_css_default.tabs,
						role: "tablist",
						"aria-label": t("tabs"),
						children: rows.map((row, index) => {
							const selected = row.id === active;
							return (0, react_jsx_runtime.jsx)("button", {
								ref: (element) => {
									tabRefs.current[index] = element;
								},
								id: `${tabsId}-tab-${row.id}`,
								type: "button",
								role: "tab",
								className: PluginsSettingsSection_module_css_default.tab,
								"aria-selected": selected,
								"aria-controls": `${tabsId}-panel-${row.id}`,
								"data-active": selected ? "true" : void 0,
								tabIndex: selected ? 0 : -1,
								onClick: () => {
									setActiveId(row.id);
								},
								onKeyDown: (event) => {
									let nextIndex;
									switch (event.key) {
										case "ArrowRight":
											nextIndex = (index + 1) % rows.length;
											break;
										case "ArrowLeft":
											nextIndex = (index - 1 + rows.length) % rows.length;
											break;
										case "Home":
											nextIndex = 0;
											break;
										case "End":
											nextIndex = rows.length - 1;
											break;
										default: return;
									}
									event.preventDefault();
									const nextRow = rows[nextIndex];
									const nextTab = tabRefs.current[nextIndex];
									setActiveId(nextRow.id);
									nextTab.focus();
								},
								children: row.label
							}, row.id);
						})
					}), rows.filter((row) => row.id === active || visitedIds.has(row.id)).map((row) => {
						const selected = row.id === active;
						return (0, react_jsx_runtime.jsx)("div", {
							id: `${tabsId}-panel-${row.id}`,
							className: PluginsSettingsSection_module_css_default.panel,
							role: "tabpanel",
							"aria-labelledby": `${tabsId}-tab-${row.id}`,
							hidden: !selected,
							children: renderSlot("settings.plugins.tab", {}, { only: row.id })
						}, row.id);
					})] })
				]
			});
		}
		//#endregion
		//#region lib/types/client/WebSearchCard.js
		/**
		* Render the web-search card.
		* @param props - locale copy, the card snapshot, and its form actions.
		* @returns the card.
		*/
		function WebSearchCard(props) {
			const { t } = props;
			const state = props.useWebSearchCard((snapshot) => snapshot);
			const disabled = !state.writable;
			return (0, react_jsx_runtime.jsxs)(PluginCard, {
				t,
				titleKey: "webSearchTitle",
				descriptionKey: "webSearchDescription",
				state,
				onSave: props.save,
				onDiscard: props.discard,
				children: [
					(0, react_jsx_runtime.jsx)(SecretField, {
						id: "plugin-config-web-search-key",
						label: t("webSearchApiKey"),
						hint: t("webSearchApiKeyHint"),
						disabled: !state.apiKeyWritable,
						text: state.apiKey.text,
						configured: state.apiKeyConfigured,
						stateLabel: state.apiKeyConfigured ? t("webSearchApiKeySet") : t("webSearchApiKeyUnset"),
						onEdit: (text) => {
							props.edit("apiKey", text);
						}
					}),
					(0, react_jsx_runtime.jsx)(ValueField, {
						id: "plugin-config-web-search-endpoint",
						label: t("webSearchBaseUrl"),
						hint: t("webSearchBaseUrlHint"),
						overriddenLabel: t("overridden"),
						resetLabel: t("reset"),
						invalidLabel: t("invalidNumber"),
						disabled,
						...state.baseURL,
						onEdit: (text) => {
							props.edit("baseURL", text);
						},
						onReset: () => {
							props.resetField("baseURL");
						}
					}),
					(0, react_jsx_runtime.jsx)(ValueField, {
						id: "plugin-config-web-search-max-uses",
						label: t("webSearchMaxUses"),
						hint: t("webSearchMaxUsesHint"),
						overriddenLabel: t("overridden"),
						resetLabel: t("reset"),
						invalidLabel: t("invalidNumber"),
						numeric: true,
						disabled,
						...state.maxUses,
						onEdit: (text) => {
							props.edit("maxUses", text);
						},
						onReset: () => {
							props.resetField("maxUses");
						}
					})
				]
			});
		}
		//#endregion
		//#region lib/types/client/card-form.js
		/**
		* Shared form model behind every plugin card.
		*
		* A card stages what the user types and writes it only when they save. Each
		* settings write is a durable, revision-fenced document mutation, so a control
		* that committed as it settled turned one edit into a write the user never
		* asked for and could not preview; staged text makes what is on screen exactly
		* what a save would store.
		*
		* A field shows its effective value — the user layer over the composition
		* layer over the schema default — and whether the user layer carries it. That
		* presence, not a value comparison, is what marks a field overridden: an
		* override equal to the composition default is still an override.
		*/
		/**
		* A whole-number field. An empty draft clears the field; any other draft that
		* is not a finite number blocks the save.
		* @param field - field name inside the namespace section.
		* @returns the field's conversion spec.
		*/
		function numberField(field) {
			return {
				field,
				format: (value) => typeof value === "number" ? String(value) : "",
				parse: (text) => {
					const trimmed = text.trim();
					if (trimmed === "") return { kind: "clear" };
					const parsed = Number(trimmed);
					return Number.isFinite(parsed) ? {
						kind: "set",
						value: parsed
					} : void 0;
				}
			};
		}
		/**
		* A free-text field. An empty draft clears the field, so emptying the control
		* and saving is the same gesture as resetting it.
		* @param field - field name inside the namespace section.
		* @returns the field's conversion spec.
		*/
		function textField(field) {
			return {
				field,
				format: (value) => typeof value === "string" ? value : "",
				parse: (text) => {
					const trimmed = text.trim();
					return trimmed === "" ? { kind: "clear" } : {
						kind: "set",
						value: trimmed
					};
				}
			};
		}
		/**
		* Stages one card's edits over one settings namespace and writes them on save.
		*
		* The form publishes through a snapshot store because slot components read
		* through a snapshot selector, while both the scope and the local drafts
		* change underneath; every projection is rebuilt from the two together.
		*/
		var CardForm = class {
			scope;
			specs;
			secretSpecs;
			staged = /* @__PURE__ */ new Map();
			listeners = /* @__PURE__ */ new Set();
			saving = false;
			failed = false;
			/**
			* @param scope - the bound settings scope for this card's namespace.
			* @param specs - the section fields this card edits.
			* @param secrets - the card's write-only controls, written outside the section.
			*/
			constructor(scope, specs, secrets = []) {
				this.scope = scope;
				this.specs = new Map(specs.map((spec) => [spec.field, spec]));
				this.secretSpecs = new Map(secrets.map((spec) => [spec.field, spec]));
				scope.subscribe(() => {
					this.publish();
				});
			}
			/**
			* Publish a projection of this form, rebuilt whenever the scope or a draft changes.
			* @param project - build the card's state from the form's current reads.
			* @returns the store the card's component reads through its bound selector.
			*/
			bind(project) {
				const store = (0, _deepseek_ai_dsh_client_runtime_client.createSnapshotStore)(project());
				this.listeners.add(() => {
					store.set(project());
				});
				return store;
			}
			/**
			* Read the card-level state: what the Host serves, and what a save would do.
			* @returns the form state every card shares.
			*/
			shell() {
				const snapshot = this.scope.getSnapshot();
				const plan = this.plan();
				return {
					available: snapshot.status === "ready",
					writable: snapshot.writable,
					dirty: plan.length > 0,
					invalid: plan.some((item) => item.run === void 0),
					saving: this.saving,
					failed: this.failed
				};
			}
			/**
			* Read one control's state.
			* @param field - field name of a section field or of a write-only control.
			* @returns the draft text, whether a save would leave an override, and whether it is invalid.
			*/
			field(field) {
				const staged = this.staged.get(field);
				if (this.secretSpecs.has(field)) return {
					text: staged?.text ?? "",
					overridden: false,
					invalid: false
				};
				const spec = this.spec(field);
				if (staged === void 0) return {
					text: spec.format(this.sectionValue(field)),
					overridden: this.stored(field),
					invalid: false
				};
				const write = staged.clear ? { kind: "clear" } : spec.parse(staged.text);
				return {
					text: staged.text,
					overridden: write?.kind === "set",
					invalid: write === void 0
				};
			}
			/**
			* Build the edit, reset, save, and discard actions bound to this form.
			* @returns the actions a card's slot entry injects.
			*/
			actions() {
				return {
					edit: (field, text) => {
						this.stage(field, {
							text,
							clear: false
						});
					},
					resetField: (field) => {
						this.stage(field, {
							text: this.spec(field).format(this.baseValue(field)),
							clear: true
						});
					},
					save: () => {
						this.save();
					},
					discard: () => {
						if (this.staged.size === 0 && !this.failed) return;
						this.staged.clear();
						this.failed = false;
						this.publish();
					}
				};
			}
			/**
			* Write every staged edit, then re-seed from what the Host accepted.
			*
			* The Host is the only authority on whether a value was accepted — its
			* validators own the constraints no schema can express — so the outcome is
			* read back from the section rather than predicted here. A save that did not
			* land keeps its drafts, so the user can correct them instead of retyping.
			* @returns settlement after every write and the read-back.
			*/
			async save() {
				const plan = this.plan();
				const writes = plan.flatMap((item) => item.run === void 0 ? [] : [item.run]);
				if (plan.length === 0 || this.saving || writes.length !== plan.length) return;
				this.saving = true;
				this.failed = false;
				this.publish();
				let landed = true;
				for (const write of writes) landed = await write() && landed;
				if (landed) this.staged.clear();
				this.saving = false;
				this.failed = !landed;
				this.publish();
			}
			/**
			* Every staged edit a save would write. An entry whose draft is not a value
			* its field accepts carries no write: the form is still dirty, and the save
			* refuses rather than dropping the edit.
			* @returns the planned writes, in the order the fields were staged.
			*/
			plan() {
				const plan = [];
				for (const [field, staged] of this.staged) {
					const secret = this.secretSpecs.get(field);
					if (secret !== void 0) {
						const value = staged.text.trim();
						if (value !== "") plan.push({
							field,
							run: () => secret.write(value)
						});
						continue;
					}
					const spec = this.spec(field);
					if (staged.clear) {
						if (this.stored(field)) plan.push({
							field,
							run: () => this.clear(field)
						});
						continue;
					}
					if (staged.text === spec.format(this.sectionValue(field))) continue;
					const write = spec.parse(staged.text);
					if (write === void 0) plan.push({
						field,
						run: void 0
					});
					else if (write.kind === "clear") plan.push({
						field,
						run: () => this.clear(field)
					});
					else plan.push({
						field,
						run: () => this.store(field, write.value)
					});
				}
				return plan;
			}
			async clear(field) {
				await this.scope.unset(field);
				return !this.stored(field);
			}
			async store(field, value) {
				await this.scope.set(field, value);
				return this.userLayer()?.[field] === value;
			}
			stage(field, edit) {
				this.staged.set(field, edit);
				this.failed = false;
				this.publish();
			}
			spec(field) {
				const spec = this.specs.get(field);
				if (spec === void 0) throw new Error(`plugin card has no field ${field}`);
				return spec;
			}
			snapshotOf() {
				return this.scope.getSnapshot();
			}
			sectionValue(field) {
				return this.snapshotOf().value?.[field];
			}
			baseValue(field) {
				return this.snapshotOf().base?.[field];
			}
			userLayer() {
				return this.snapshotOf().user;
			}
			stored(field) {
				const user = this.userLayer();
				return user !== void 0 && Object.hasOwn(user, field);
			}
			publish() {
				for (const listener of this.listeners) listener();
			}
		};
		//#endregion
		//#region lib/types/client/agent-loop-card-controller.js
		/** The agent-loop card's staged form over the `agent-loop` settings namespace. */
		/**
		* Namespace of the agent loop's user-owned settings. Spelled here rather than
		* imported: a client package must not depend on a Host package.
		*/
		const AGENT_LOOP_NS = "agent-loop";
		/** Bridges the `agent-loop` scope onto the card's staged form. */
		var AgentLoopCardController = class {
			form;
			store;
			/** @param scope - the bound settings scope for the `agent-loop` namespace. */
			constructor(scope) {
				this.form = new CardForm(scope, [numberField("maxParallelToolCalls")]);
				this.store = this.form.bind(() => this.projection());
			}
			projection() {
				return {
					...this.form.shell(),
					maxParallelToolCalls: this.form.field("maxParallelToolCalls")
				};
			}
			/**
			* Build the face the card's slot registration injects.
			* @returns the card's snapshot and its form actions.
			*/
			inject() {
				return {
					hooks: { agentLoopCard: this.store },
					...this.form.actions()
				};
			}
		};
		//#endregion
		//#region lib/types/client/bash-card-controller.js
		/** The shell card's staged form over the `bash` settings namespace. */
		/**
		* Namespace of the shell capability. Spelled here rather than imported: a
		* client package must not depend on a Host package, and the executor families
		* that own it spell the same value.
		*/
		const SHELL_NS = "shell";
		/** Bridges the `bash` scope onto the shell card's staged form. */
		var BashCardController = class {
			form;
			store;
			/** @param scope - the bound settings scope for the `bash` namespace. */
			constructor(scope) {
				this.form = new CardForm(scope, [numberField("timeoutMs"), numberField("maxOutputBytes")]);
				this.store = this.form.bind(() => this.projection());
			}
			projection() {
				return {
					...this.form.shell(),
					timeoutMs: this.form.field("timeoutMs"),
					maxOutputBytes: this.form.field("maxOutputBytes")
				};
			}
			/**
			* Build the face the card's slot registration injects.
			* @returns the card's snapshot and its form actions.
			*/
			inject() {
				return {
					hooks: { bashCard: this.store },
					...this.form.actions()
				};
			}
		};
		//#endregion
		//#region lib/types/client/web-search-card-controller.js
		/**
		* The web-search card's staged form over the `web-search-deepseek` settings
		* namespace.
		*
		* The key is the one control that does not live in the section: its literal
		* never rides a response, so the card learns only whether one is configured
		* and writes it through the credentials domain, addressed by the reference the
		* section names. It is still staged with the rest of the form, so one save
		* covers everything the card shows.
		*/
		/**
		* Namespace of the DeepSeek search provider. Spelled here rather than
		* imported: a client package must not depend on a Host package.
		*/
		const WEB_SEARCH_NS = "web-search-deepseek";
		/** Credential reference the provider resolves when the section names none. */
		const DEFAULT_API_KEY_REF = "DEEPSEEK_API_KEY";
		/** Form field the credential control stages under. */
		const API_KEY_FIELD = "apiKey";
		/** Bridges the `web-search-deepseek` scope and the credentials domain onto the card. */
		var WebSearchCardController = class {
			scope;
			api;
			form;
			store;
			credential = {
				ref: "",
				configured: false,
				writable: true
			};
			/**
			* @param scope - the bound settings scope for the `web-search-deepseek` namespace.
			* @param api - wire face used for the credential the section references.
			*/
			constructor(scope, api) {
				this.scope = scope;
				this.api = api;
				this.form = new CardForm(scope, [textField("baseURL"), numberField("maxUses")], [{
					field: API_KEY_FIELD,
					write: (text) => this.writeKey(text)
				}]);
				this.store = this.form.bind(() => this.projection());
				scope.subscribe(() => {
					this.readCredential();
				});
				this.readCredential();
			}
			projection() {
				return {
					...this.form.shell(),
					baseURL: this.form.field("baseURL"),
					maxUses: this.form.field("maxUses"),
					apiKey: this.form.field(API_KEY_FIELD),
					apiKeyConfigured: this.credential.configured,
					apiKeyWritable: this.credential.writable
				};
			}
			/**
			* Ask the credentials domain about the reference the section currently names.
			*
			* The answer is stored with the reference it describes: `apiKeyEnv` can
			* change between the request and its response, and two reads can settle out
			* of order, so a response is published only while it still answers for the
			* reference in force.
			*/
			async readCredential() {
				const ref = refOf(this.scope.getSnapshot());
				if (ref !== this.credential.ref) {
					this.credential = {
						ref,
						configured: false,
						writable: true
					};
					this.store.set(this.projection());
				}
				let response;
				try {
					response = await this.api.credentials.describe({ refs: [ref] });
				} catch (_credentialReadFailure) {
					return;
				}
				if (!response.result.ok || ref !== refOf(this.scope.getSnapshot())) return;
				const view = response.result.value.credentials[ref];
				const next = {
					ref,
					configured: view?.configured ?? false,
					writable: view?.writable ?? true
				};
				if (next.configured === this.credential.configured && next.writable === this.credential.writable) return;
				this.credential = next;
				this.store.set(this.projection());
			}
			/**
			* Re-read after the Host reports a change to the reference this card watches.
			*
			* A key can be written from somewhere else — the Models page addresses the
			* same reference — and the settings section does not change when it is, so
			* without this the badge keeps reporting a state the Host already replaced.
			* @param ref - the reference the Host reports as changed.
			*/
			refreshCredential(ref) {
				if (ref !== this.credential.ref) return;
				this.readCredential();
			}
			/**
			* Build the face the card's slot registration injects.
			* @returns the card's snapshot and its form actions.
			*/
			inject() {
				return {
					hooks: { webSearchCard: this.store },
					...this.form.actions()
				};
			}
			/**
			* Write the staged key, then re-read whether the Host now holds one.
			* @param value - the staged credential literal.
			* @returns whether the Host reports a configured credential afterwards.
			*/
			async writeKey(value) {
				try {
					await this.api.credentials.set({
						ref: refOf(this.scope.getSnapshot()),
						value
					});
				} catch (_credentialWriteFailure) {}
				await this.readCredential();
				return this.credential.configured;
			}
		};
		/**
		* The credential reference the section names, or the provider's default.
		* @param snapshot - the current scope snapshot.
		* @returns the reference to address.
		*/
		function refOf(snapshot) {
			const declared = snapshot.value?.apiKeyEnv;
			return declared !== void 0 && declared.length > 0 ? declared : DEFAULT_API_KEY_REF;
		}
		//#endregion
		//#region lib/types/client/locales.js
		/** Locale bundles for the plugin configuration section and its plugin cards. */
		/** English copy. */
		const en = {
			nav: "Plugins",
			title: "Plugins",
			intro: "Configure and inspect the plugins installed in this deployment.",
			tabs: "Plugin views",
			configurableTab: "Plugin configuration",
			empty: "This deployment exposes no plugin settings.",
			overridden: "Overridden",
			reset: "Reset to default",
			readOnly: "This deployment stores settings read-only.",
			expand: "Show settings",
			collapse: "Hide settings",
			save: "Save",
			saving: "Saving…",
			discard: "Discard",
			unsaved: "Unsaved",
			saveFailed: "The deployment did not accept these values; they were left for you to correct.",
			invalidNumber: "Enter a number, or leave blank to use the default.",
			bashTitle: "Shell",
			bashDescription: "Limits every command the agent runs.",
			bashTimeoutMs: "Command timeout (ms)",
			bashTimeoutMsHint: "How long one command may run before it is terminated.",
			bashMaxOutputBytes: "Output cap per stream (bytes)",
			bashMaxOutputBytesHint: "Output beyond this spills to a temporary file rather than being lost.",
			agentLoopTitle: "Agent loop",
			agentLoopDescription: "How the agent dispatches tool calls.",
			agentLoopMaxParallel: "Parallel tool calls",
			agentLoopMaxParallelHint: "Upper bound on parallel-safe calls running at once within one step.",
			webSearchTitle: "Web search",
			webSearchDescription: "DeepSeek search provider (Anthropic-compatible Messages API).",
			webSearchApiKey: "API key",
			webSearchApiKeyHint: "Stored outside the settings file. Leave blank to keep the current key.",
			webSearchApiKeySet: "A key is configured.",
			webSearchApiKeyUnset: "No key is configured; search is unavailable until one is.",
			webSearchBaseUrl: "Endpoint",
			webSearchBaseUrlHint: "This provider calls the Anthropic-compatible Messages API (POST <base>/messages). Enter that API's base URL; leave blank for the DeepSeek official default.",
			webSearchMaxUses: "Max searches per request",
			webSearchMaxUsesHint: "How many times one request may search before it must answer."
		};
		/** Simplified Chinese copy. */
		const zh = {
			nav: "插件",
			title: "插件",
			intro: "配置和查看本部署已安装的插件。",
			tabs: "插件视图",
			configurableTab: "插件配置",
			empty: "本部署没有开放任何插件设置。",
			overridden: "已覆盖",
			reset: "恢复默认",
			readOnly: "本部署的设置为只读。",
			expand: "展开设置",
			collapse: "收起设置",
			save: "保存",
			saving: "保存中…",
			discard: "放弃修改",
			unsaved: "未保存",
			saveFailed: "本部署没有接受这些值，已保留供你修改。",
			invalidNumber: "请填数字；留空表示使用默认值。",
			bashTitle: "终端",
			bashDescription: "限制 agent 运行的每一条命令。",
			bashTimeoutMs: "命令超时（毫秒）",
			bashTimeoutMsHint: "单条命令允许运行多久，超时即终止。",
			bashMaxOutputBytes: "单流输出上限（字节）",
			bashMaxOutputBytesHint: "超出部分会转存到临时文件，而不是被丢弃。",
			agentLoopTitle: "Agent 循环",
			agentLoopDescription: "Agent 如何派发工具调用。",
			agentLoopMaxParallel: "并行工具调用数",
			agentLoopMaxParallelHint: "同一步内最多同时运行多少个可并行的调用。",
			webSearchTitle: "网页搜索",
			webSearchDescription: "DeepSeek 搜索提供方（Anthropic 兼容 Messages API）。",
			webSearchApiKey: "API Key",
			webSearchApiKeyHint: "不写入设置文件。留空表示保持当前密钥。",
			webSearchApiKeySet: "已配置密钥。",
			webSearchApiKeyUnset: "未配置密钥；配置之前搜索不可用。",
			webSearchBaseUrl: "接口地址",
			webSearchBaseUrlHint: "该提供方通过 Anthropic 兼容 Messages API 请求（POST <基址>/messages）。请填该协议的基址；留空则使用 DeepSeek 官方默认地址。",
			webSearchMaxUses: "单次请求最多搜索次数",
			webSearchMaxUsesHint: "一次请求在必须作答前最多可以搜索多少次。"
		};
		//#endregion
		//#region lib/types/client/index.js
		/**
		* Plugins settings surface, browser half — one section whose feature-owned
		* tabs include configurable Host plugin cards and read-only inventory.
		*
		* The section declares `settings.plugins.tab`; its own `configurable` tab then
		* declares `settings.plugin.item` and renders whatever cards were registered
		* into it. The three cards this package ships are the host-plane sections the
		* deployment already exposes; each binds its namespace through the client
		* settings scope, which keeps them unaware of one another and of other tabs.
		*/
		/** Dictionary namespace owned by this plugin. */
		const NS = "settings.plugins";
		/** Required services (cordis fiber inject). */
		const inject = [
			"slots",
			"locale",
			"connection",
			"remote",
			"settingsScope"
		];
		/**
		* Mount the plugin configuration section and the cards this package ships.
		* @param ctx - the browser plugin context.
		*/
		function apply(ctx) {
			const { api } = ctx.get("connection");
			const t = ctx.locale.bind(NS);
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "ui-settings-plugins: section dictionaries");
			const bash = new BashCardController(ctx.settingsScope.bind({ namespace: SHELL_NS }));
			const agentLoop = new AgentLoopCardController(ctx.settingsScope.bind({ namespace: AGENT_LOOP_NS }));
			const webSearch = new WebSearchCardController(ctx.settingsScope.bind({ namespace: WEB_SEARCH_NS }), api);
			ctx.effect(() => ctx.remote.$on("credentials/updated", (ref) => {
				webSearch.refreshCredential(ref);
			}), "ui-settings-plugins: credential invalidations");
			let tabsVersion = -1;
			let tabsRevision = -1;
			let tabs = [];
			const sectionInjected = () => ({ hooks: { tabs: {
				getSnapshot: () => {
					const version = ctx.slots.getVersion("settings.plugins.tab");
					const revision = ctx.locale.getSnapshot().revision;
					if (version !== tabsVersion || revision !== tabsRevision) {
						tabsVersion = version;
						tabsRevision = revision;
						tabs = ctx.slots.entries("settings.plugins.tab").filter((entry) => (entry.options.id ?? "") !== "all").map((entry) => ({ // dsh-desktop fix: hide inventory tab
							/* v8 ignore next -- list-slot registration requires id */
							id: entry.options.id ?? "",
							order: entry.options.order ?? 0,
							label: (0, _deepseek_ai_dsh_client_ui_slots.resolveSlotLabel)(entry.options.label) ?? ""
						})).sort((a, b) => a.order - b.order);
					}
					return tabs;
				},
				subscribe: (listener) => {
					const offLedger = ctx.slots.subscribe("settings.plugins.tab", listener);
					const offLocale = ctx.locale.subscribe(listener);
					return () => {
						offLedger();
						offLocale();
					};
				}
			} } });
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "plugins",
				order: 15,
				label: () => t("nav"),
				locale: NS,
				inject: sectionInjected,
				children: { "settings.plugins.tab": {
					kind: "list",
					scope: "root"
				} }
			}, PluginsSettingsSection));
			ctx.slots.inject("settings.plugins.tab", () => ctx.slots.register({
				name: "settings.plugins.tab",
				id: "configurable",
				order: 0,
				label: () => t("configurableTab"),
				locale: NS,
				inject: () => ({ cardCount: ctx.slots.entries("settings.plugin.item").length }),
				children: { "settings.plugin.item": {
					kind: "list",
					scope: "root"
				} }
			}, ConfigurablePluginsTab));
			ctx.slots.inject("settings.plugin.item", function* () {
				yield ctx.slots.register({
					name: "settings.plugin.item",
					id: "bash",
					order: 0,
					locale: NS,
					inject: () => bash.inject()
				}, BashCard);
				yield ctx.slots.register({
					name: "settings.plugin.item",
					id: "agent-loop",
					order: 10,
					locale: NS,
					inject: () => agentLoop.inject()
				}, AgentLoopCard);
				yield ctx.slots.register({
					name: "settings.plugin.item",
					id: "web-search",
					order: 20,
					locale: NS,
					inject: () => webSearch.inject()
				}, WebSearchCard);
			});
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map