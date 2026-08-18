window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-client-ui-permission-presets",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let _deepseek_ai_dsh_client_runtime_client = require("@deepseek-ai/dsh-client-runtime/client");
		let _deepseek_ai_dsh_client_schema_form = require("@deepseek-ai/dsh-client-schema-form");
		//#region lib/types/client/presentation.js
		/** Machine value of the preset that requires an explicit GUI risk gate. */
		const FULL_ACCESS_PRESET = "danger-full-access";
		/**
		* Convert conventional kebab-case preset names into user-facing title case.
		* @param name - host-supplied preset label or key.
		* @returns the title-cased conventional key, or a non-kebab label unchanged.
		*/
		function displayPresetName(name) {
			if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) return name;
			return name.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
		}
		/**
		* Render a permission preset under its product label.
		* @param value - preset machine value.
		* @param name - host-supplied preset name.
		* @returns the Full access product label or the conventional display name.
		*/
		function displayPermissionPreset(value, name) {
			return value === "danger-full-access" ? "Full access" : displayPresetName(name);
		}
		//#endregion
		//#region \0dsh-css:/home/runner/work/deepseek-harness/deepseek-harness/packages/client/ui-permission-presets/src/client/PermissionRow.module.css.mjs
		const css = ".oY77xG_row{border-bottom:1px solid var(--dsw-alias-border-l2);align-items:center;gap:8px;padding:16px 0;display:flex}.oY77xG_rowText{flex-direction:column;flex:1;gap:4px;min-width:0;padding-right:48px;display:flex}.oY77xG_title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}.oY77xG_desc{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;line-height:18px}.oY77xG_selector{background:var(--dsw-alias-bg-module-platform);height:36px;font:inherit;color:var(--dsw-alias-label-primary);cursor:pointer;border:none;border-radius:18px;align-items:center;gap:12px;padding:0 14px;font-size:14px;line-height:22px;display:inline-flex}.oY77xG_selector:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.oY77xG_selector:disabled{cursor:default}.oY77xG_chevron{flex:none}";
		const tagId = "@deepseek-ai/dsh-client-ui-permission-presets/PermissionRow.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-permission-presets";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var PermissionRow_module_css_default = {
			"selector": "oY77xG_selector",
			"row": "oY77xG_row",
			"chevron": "oY77xG_chevron",
			"rowText": "oY77xG_rowText",
			"title": "oY77xG_title",
			"desc": "oY77xG_desc"
		};
		//#endregion
		//#region lib/types/client/PermissionRow.js
		/**
		* Permission preference row: the default preset for subsequently created
		* sessions. Current-session switches remain on the composer `/permission`
		* control.
		*/
		/**
		* Render the new-session Permission default selector.
		* @param props - composed slot props.
		* @returns the row, or null when the host does not expose permission settings.
		*/
		function PermissionRow({ load, select, usePermission, t }) {
			const state = usePermission((snapshot) => snapshot);
			const [open, setOpen] = (0, react.useState)(false);
			const [confirmingFullAccess, setConfirmingFullAccess] = (0, react.useState)(false);
			const [acknowledged, setAcknowledged] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				load();
			}, [load]);
			(0, react.useEffect)(() => {
				if (state.writable && state.status !== "unavailable") return;
				setOpen(false);
				setAcknowledged(false);
				setConfirmingFullAccess(false);
			}, [state.status, state.writable]);
			if (state.status === "unavailable") return null;
			const selected = state.options.find((option) => option.id === state.currentValue);
			const busy = state.status === "loading" || state.status === "saving" || confirmingFullAccess;
			const label = selected?.label ?? (busy ? t("loading") : t("unavailable"));
			const description = state.error ?? t("description");
			return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsxs)("div", {
				className: PermissionRow_module_css_default.row,
				children: [(0, react_jsx_runtime.jsxs)("div", {
					className: PermissionRow_module_css_default.rowText,
					children: [(0, react_jsx_runtime.jsx)("div", {
						className: PermissionRow_module_css_default.title,
						children: t("title")
					}), (0, react_jsx_runtime.jsx)("div", {
						className: PermissionRow_module_css_default.desc,
						role: state.error === null ? void 0 : "alert",
						children: description
					})]
				}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
					open,
					onClose: () => {
						setOpen(false);
					},
					items: state.options.map((option) => ({
						id: option.id,
						label: option.label
					})),
					selectedId: state.currentValue,
					onSelect: (id) => {
						setOpen(false);
						if (id === state.currentValue) return;
						if (id === "danger-full-access") {
							setAcknowledged(false);
							setConfirmingFullAccess(true);
							return;
						}
						select(id);
					},
					align: "end",
					portal: true,
					anchor: (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: PermissionRow_module_css_default.selector,
						"aria-haspopup": "menu",
						"aria-expanded": open,
						disabled: busy || !state.writable || state.options.length === 0,
						onClick: () => {
							setOpen((value) => !value);
						},
						children: [label, (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { className: PermissionRow_module_css_default.chevron })]
					})
				})]
			}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.RiskConfirmation, {
				open: confirmingFullAccess,
				title: t("confirm.title"),
				description: t("confirm.description"),
				acknowledgeLabel: t("confirm.acknowledge"),
				cancelLabel: t("confirm.cancel"),
				confirmLabel: t("confirm.enable"),
				acknowledged,
				disabled: !state.writable || state.status === "saving",
				onAcknowledgedChange: setAcknowledged,
				onCancel: () => {
					setAcknowledged(false);
					setConfirmingFullAccess(false);
				},
				onConfirm: () => {
					setAcknowledged(false);
					setConfirmingFullAccess(false);
					select(FULL_ACCESS_PRESET);
				}
			})] });
		}
		//#endregion
		//#region lib/types/client/locales.js
		/** `settings.permission` namespace dictionaries (the Permission row's copy). */
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"title": "权限",
			"description": "选择新会话的默认权限模式",
			"loading": "加载中",
			"unavailable": "不可用",
			"confirm.title": "确认启用 Full access？",
			"confirm.description": "启用 Full access 后，新会话将减少确认步骤，并且可以直接执行更多操作，包括敏感操作、文件修改或外部命令。仅建议在你信任后续任务时使用。",
			"confirm.acknowledge": "我已了解风险，并愿意继续",
			"confirm.cancel": "取消",
			"confirm.enable": "启用 Full access"
		};
		/** English dictionary, checked complete against the zh key set. */
		const en = {
			"title": "Permission",
			"description": "Choose the default permission mode for new sessions",
			"loading": "Loading",
			"unavailable": "Unavailable",
			"confirm.title": "Enable Full access?",
			"confirm.description": "Full access lets new sessions reduce confirmation steps and perform more actions directly, including sensitive operations, file changes, or external commands. Only use it when you trust subsequent tasks.",
			"confirm.acknowledge": "I understand the risks and want to continue",
			"confirm.cancel": "Cancel",
			"confirm.enable": "Enable Full access"
		};
		/** Simplified Chinese dictionary for the current-session popup gate. */
		const accessZh = {
			"confirm.title": "确认启用 Full access？",
			"confirm.description": "启用 Full access 后，agent 将减少确认步骤，并且可以直接执行更多操作，包括敏感操作、文件修改或外部命令。仅建议在你信任当前任务时使用。",
			"confirm.acknowledge": "我已了解风险，并愿意继续",
			"confirm.cancel": "取消",
			"confirm.enable": "启用 Full access"
		};
		/** English dictionary for the current-session popup gate. */
		const accessEn = {
			"confirm.title": "Enable Full access?",
			"confirm.description": "Full access reduces confirmation steps and lets the agent perform more actions directly, including sensitive operations, file changes, or external commands. Only use it when you trust the current task.",
			"confirm.acknowledge": "I understand the risks and want to continue",
			"confirm.cancel": "Cancel",
			"confirm.enable": "Enable Full access"
		};
		//#endregion
		//#region lib/types/client/settings-store.js
		/**
		* Permission default-settings controller. The host descriptor supplies the
		* current value and the dynamic preset enum; writes target only
		* `defaultPreset` and carry the descriptor revision.
		*/
		/** Permission's settings namespace on the host wire. */
		const PERMISSION_SETTINGS_NS = "permission";
		/**
		* Read the dynamic preset enum encoded by the host's `defaultPreset` schema.
		* @param view - permission namespace descriptor.
		* @returns current value and selectable options.
		*/
		function permissionDefaultOf(view) {
			const value = view.value?.defaultPreset;
			if (typeof value !== "string") throw new Error("permission settings has no defaultPreset value");
			const node = (0, _deepseek_ai_dsh_client_schema_form.nodeAtPath)((0, _deepseek_ai_dsh_client_schema_form.rehydrateSchema)(view.schema), ["defaultPreset"]);
			if (node === void 0) throw new Error("permission settings schema has no defaultPreset field");
			const options = (node.type === "union" ? node.list ?? [] : [node]).flatMap((candidate) => {
				const choice = candidate;
				if (choice.type !== "const" || typeof choice.value !== "string") return [];
				const described = choice.meta?.description;
				return [{
					id: choice.value,
					label: typeof described === "string" && described.length > 0 ? displayPermissionPreset(choice.value, described) : displayPermissionPreset(choice.value, choice.value)
				}];
			});
			if (options.length === 0 || !options.some((option) => option.id === value)) throw new Error("permission settings schema does not advertise its current preset");
			return {
				currentValue: value,
				options
			};
		}
		/** Controller joining Settings reads, writes, and pushed invalidations. */
		var PermissionPresetSettingsController = class {
			api;
			/** Row snapshot consumed through a bound selector hook. */
			store = (0, _deepseek_ai_dsh_client_runtime_client.createSnapshotStore)({
				status: "idle",
				error: null,
				writable: false,
				currentValue: "",
				options: [],
				revision: 0
			});
			generation = 0;
			view;
			/** @param api - Settings wire face. */
			constructor(api) {
				this.api = api;
			}
			/**
			* Refresh the permission descriptor. Latest request wins.
			* @returns nothing; {@link store} carries success or failure.
			*/
			async load() {
				const generation = ++this.generation;
				this.store.update((state) => {
					state.status = "loading";
					state.error = null;
				});
				try {
					const response = await this.api.settings.describe({});
					if (!response.result.ok) throw new Error(response.result.error.message);
					if (generation !== this.generation) return;
					const view = response.result.value.namespaces.find((entry) => entry.ns === PERMISSION_SETTINGS_NS);
					if (view === void 0) {
						this.view = void 0;
						this.store.update((state) => {
							state.status = "unavailable";
							state.writable = false;
							state.currentValue = "";
							state.options = [];
						});
						return;
					}
					this.accept(view, response.result.value.writable);
				} catch (error) {
					if (generation !== this.generation) return;
					this.fail(error);
				}
			}
			/**
			* Persist one preset as the default for subsequently created sessions.
			* @param preset - advertised preset key.
			* @returns nothing; {@link store} carries success or failure.
			*/
			async select(preset) {
				const view = this.view;
				const state = this.store.getSnapshot();
				if (view === void 0 || !state.writable) return;
				const generation = ++this.generation;
				this.store.update((draft) => {
					draft.status = "saving";
					draft.error = null;
				});
				try {
					const response = await this.api.settings.mutate({
						ns: PERMISSION_SETTINGS_NS,
						ops: [{
							op: "set",
							path: ["defaultPreset"],
							value: preset
						}],
						expectedRevision: view.revision
					});
					if (generation !== this.generation) return;
					if (!response.result.ok) throw new Error(response.result.error.message);
					this.accept(response.result.value, true);
				} catch (error) {
					if (generation !== this.generation) return;
					this.fail(error);
				}
			}
			/** Stop in-flight responses from publishing after plugin disposal. */
			dispose() {
				this.generation += 1;
				this.view = void 0;
			}
			accept(view, writable) {
				const resolved = permissionDefaultOf(view);
				this.view = view;
				this.store.update((state) => {
					state.status = "ready";
					state.error = null;
					state.writable = writable;
					state.currentValue = resolved.currentValue;
					state.options = resolved.options;
					state.revision = view.revision;
				});
			}
			fail(error) {
				this.store.update((state) => {
					state.status = "error";
					state.error = error instanceof Error ? error.message : String(error);
				});
			}
		};
		/**
		* Refetch only after the row has opened once.
		* @param controller - permission settings controller.
		*/
		function refreshPermissionIfLoaded(controller) {
			if (controller.store.getSnapshot().status === "idle") return;
			controller.load();
		}
		//#endregion
		//#region lib/types/client/index.js
		/** Required services (cordis fiber inject). */
		const inject = [
			"commandUi",
			"sessions",
			"slots",
			"locale",
			"connection",
			"remote"
		];
		const ACCESS_NS = "permission.access";
		/** Read one session's current permissions projection value (undefined = capability absent). */
		function selectOf(session) {
			return session?.projections.faceOf("permissions").getSnapshot();
		}
		/** Flatten the projection select into popup rows; `custom` is display state, never a target. */
		function optionsOf(value, t) {
			return value.options.filter((option) => option.value !== "custom").map((option) => ({
				id: option.value,
				label: displayPermissionPreset(option.value, option.name),
				...option.description !== void 0 ? { detail: option.description } : {},
				...option.value === value.currentValue ? { active: true } : {},
				...option.value === "danger-full-access" ? { confirmation: {
					title: t("confirm.title"),
					description: t("confirm.description"),
					acknowledgeLabel: t("confirm.acknowledge"),
					cancelLabel: t("confirm.cancel"),
					confirmLabel: t("confirm.enable")
				} } : {}
			}));
		}
		/**
		* Client plugin body: register the /permission popup picker over the
		* permissions projection.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			const command = ctx.get("commandUi");
			const sessions = ctx.sessions;
			ctx.effect(() => {
				const disposers = [ctx.locale.register(ACCESS_NS, "zh", {
					"confirm.title": accessZh["confirm.title"],
					"confirm.description": accessZh["confirm.description"],
					"confirm.acknowledge": accessZh["confirm.acknowledge"],
					"confirm.cancel": accessZh["confirm.cancel"],
					"confirm.enable": accessZh["confirm.enable"]
				}), ctx.locale.register(ACCESS_NS, "en", {
					"confirm.title": accessEn["confirm.title"],
					"confirm.description": accessEn["confirm.description"],
					"confirm.acknowledge": accessEn["confirm.acknowledge"],
					"confirm.cancel": accessEn["confirm.cancel"],
					"confirm.enable": accessEn["confirm.enable"]
				})];
				return () => {
					for (const dispose of disposers) dispose();
				};
			}, "ui-permission: Full access confirmation dictionaries");
			const t = ctx.locale.bind(ACCESS_NS);
			const sessionFor = (session) => sessions.binding(session.sessionId)?.session;
			ctx.effect(() => ctx.locale.register("settings.permission", {
				zh,
				en
			}), "ui-permission: settings row dictionaries");
			const controller = new PermissionPresetSettingsController(ctx.get("connection").api);
			const load = () => controller.load();
			const select = (preset) => controller.select(preset);
			const injected = () => ({
				hooks: { permission: controller.store },
				load,
				select
			});
			ctx.effect(() => {
				const refresh = () => {
					refreshPermissionIfLoaded(controller);
				};
				const disposers = [ctx.remote.$on("settings/document-updated", (ns) => {
					if (ns !== "permission") return;
					refresh();
				}), ctx.on("connection/reset", () => {
					refresh();
				})];
				return () => {
					controller.dispose();
					for (const dispose of disposers) dispose();
				};
			}, "ui-permission: settings invalidations");
			ctx.slots.inject("settings.general.item", () => ctx.slots.register({
				name: "settings.general.item",
				id: "permission",
				order: -20,
				locale: "settings.permission",
				inject: injected
			}, PermissionRow));
			ctx.effect(() => command.decorate({
				name: "permission",
				available: (session) => selectOf(sessionFor(session)) !== void 0,
				ui: {
					kind: "popupSelect",
					options: (session) => {
						const value = selectOf(sessionFor(session));
						if (value === void 0) throw new Error("permission presets are not available on this host");
						return Promise.resolve(optionsOf(value, t));
					},
					onSelect: async (option, session) => {
						const live = sessionFor(session);
						if (live === void 0) throw new Error("this session is not materialized yet");
						const result = await live.command(`/permission ${option.id}`);
						if (!result.ok) throw new Error(`permission switch failed: ${result.error.code}: ${result.error.message}`);
						if (!result.value.matched) throw new Error("the host offers no /permission command");
					}
				}
			}), "ui-permission: /permission decoration");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map