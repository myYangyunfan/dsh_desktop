window.__ModuleLoader__.load({
	id: "dsh-external/dsh-basics-panel",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/locales.ts
		/**
		* zh/en copy for the panel. The copy follows the DSH i18n system: the client
		* apply attaches the locale service (`ctx.locale`) through {@link attachLocale},
		* and `t()` resolves the active locale from it (Host-backed preference wins,
		* switching live). Without an attached service the browser language is used.
		*/
		const zh = {
			nav: "基础能力",
			intro: "可视化并管理 DSH 的 MCP 服务器、技能与规则",
			tabMcp: "MCP 服务器",
			tabSkills: "技能",
			tabRules: "规则",
			tabArchived: "归档会话",
			refresh: "刷新",
			loading: "加载中…",
			error: "加载失败",
			retry: "重试",
			empty: "暂无数据",
			mcpIntro: "DSH 的 MCP 服务器来自配置组合：用户级（profile）与预设级（preset）。切换开关会写入对应配置文件并热重载。",
			mcpNoProject: "DSH 暂无项目级 MCP 组合文件，项目级配置请关注后续版本。",
			mcpScopeProfile: "用户配置",
			mcpScopePreset: "预设",
			mcpReadOnly: "只读",
			mcpConnected: "已连接",
			mcpEnabled: "已启用",
			mcpDisabled: "已禁用",
			mcpNotMounted: "未生效",
			mcpTools: "{count} 个工具",
			mcpToggle: "启用该 MCP 服务器",
			mcpTakesEffectNewSession: "已保存，将在新会话中生效",
			mcpTakesEffectLive: "已保存，热重载生效",
			mcpFieldCommand: "命令",
			mcpFieldArgs: "参数",
			mcpFieldEnv: "环境变量",
			mcpFieldUrl: "地址",
			mcpFieldHeaders: "请求头",
			mcpFieldCwd: "工作目录",
			mcpFieldTransport: "传输",
			mcpFieldTimeout: "调用超时",
			mcpSeconds: "{count} 秒",
			mcpMasked: "已脱敏",
			mcpLoadFailed: "MCP 列表加载失败",
			mcpToggleFailed: "切换失败",
			mcpApplying: "生效中…（等待热重载）",
			mcpNoPresetServers: "当前没有预设级 MCP 服务器：会话预设组合（agent-preset 声明）里没有 mcp-client 行。",
			mcpPresetScoped: "预设作用域（随会话生效）",
			mcpCreate: "新建",
			mcpCreateFailed: "创建失败",
			mcpEmpty: "暂无 MCP 服务器，点击「新建」添加",
			skillsIntro: "按作用域展示全部技能。项目级技能（项目 .dsh/skills）优先级高于用户级，同名技能显示生效版本。",
			skillsSearch: "搜索技能…",
			skillsFilterAll: "全部",
			skillsScopeProject: "项目级",
			skillsScopeCustom: "自定义",
			skillsScopeUser: "用户级",
			skillsScopeBundled: "内置",
			skillsScopeRuntime: "运行时",
			skillsScopeOther: "其他",
			skillsEditable: "可编辑",
			skillsReadonly: "只读",
			skillsModelInvocable: "模型可调用",
			skillsUserInvocable: "用户可调用",
			skillsDisableModel: "禁用模型调用",
			skillsNoSkills: "没有找到技能",
			skillsIncomplete: "部分技能未能完整读取",
			skillsScopeFallback: "未能确定当前会话，已按会话 {session} 的技能作用域展示",
			skillsNoScope: "未找到活动会话：技能作用域无法确定，只能读取全局层；请在会话中重新打开本面板",
			skillsBack: "返回列表",
			skillsName: "名称",
			skillsDescription: "描述",
			skillsWhenToUse: "使用时机",
			skillsMetadata: "元数据 (JSON)",
			skillsBody: "正文",
			skillsSave: "保存",
			skillsCancel: "取消",
			skillsSaved: "已保存，热刷新已生效",
			skillsSaveFailed: "保存失败",
			skillsConflict: "文件已被修改，请刷新后重试",
			skillsLocation: "位置",
			skillsOpen: "编辑",
			close: "关闭",
			rulesIntro: "规则文件（AGENTS.md 兼容指令）决定助手的行为约束：全局规则适用于所有项目与所有会话，项目链规则（项目根至当前目录）优先于全局规则。规则在会话启动时加载，修改后将在新会话中生效。",
			rulesGlobal: "全局规则",
			rulesProject: "项目规则",
			rulesSessionCwd: "当前会话目录",
			rulesProjectRoot: "项目根",
			rulesCreate: "新建规则",
			rulesCreateFailed: "创建失败",
			rulesCreateName: "文件名",
			rulesCreateScope: "作用域",
			rulesScopeGlobal: "全局 (~/.dsh)",
			rulesScopeProject: "项目根",
			rulesScopeCwd: "当前工作目录",
			rulesScopeHintGlobal: "全局规则文件固定为 AGENTS.md",
			rulesScopeHintProject: "写入项目根目录，对整个项目生效",
			rulesScopeHintCwd: "写入当前工作目录，仅该目录生效",
			rulesExists: "该文件已存在，请直接编辑",
			rulesNoRules: "暂无规则文件，点击「新建规则」创建",
			rulesPath: "路径",
			rulesBytes: "{count} 字节",
			rulesEdit: "编辑",
			rulesBack: "返回列表",
			rulesContent: "内容",
			rulesSave: "保存",
			rulesCancel: "取消",
			rulesSaved: "已保存，将在新会话中生效",
			rulesSaveFailed: "保存失败",
			rulesConflict: "文件已被修改，请刷新后重试",
			rulesLoadFailed: "规则列表加载失败",
			archivedIntro: "归档会话不会出现在侧边栏的任何分组里，但会话记录与工作区位置都完整保留。恢复会把会话放回原来的位置；删除会永久移除磁盘上的会话记录，且无法撤销。",
			archivedEmpty: "暂无已归档会话",
			archivedLoadFailed: "归档会话加载失败",
			archivedCount: "共 {count} 个已归档会话",
			archivedTotalSize: "合计 {size}",
			archivedRoot: "会话目录",
			archivedSelectAll: "全选",
			archivedSelected: "已选 {count} 个",
			archivedRestore: "恢复",
			archivedRestoreSelected: "恢复选中",
			archivedDelete: "删除",
			archivedDeleteSelected: "删除选中",
			archivedDeleteAll: "删除全部",
			archivedConfirmRestore: "确认恢复 {count} 个会话？恢复后它们会回到侧边栏原来的位置。",
			archivedConfirmDelete: "确认永久删除 {count} 个会话？磁盘上的会话记录会被移除，且无法恢复。",
			archivedNote: "删除只移除该会话的日志目录、工作区分组记账与归档记录，不会回收已被消息引用的附件等派生数据。",
			archivedConfirm: "确认",
			archivedCancel: "取消",
			archivedWorking: "处理中…",
			archivedRunning: "运行中",
			archivedRunningHint: "该会话的 Agent 正在处理回合（DSH 的 running 状态），不能删除。",
			archivedLoaded: "已装载",
			archivedLoadedHint: "该会话仍在本 DSH 进程的内存里（归档只把它从列表隐藏，并未结束它）。空闲时可以删除。",
			archivedLoadedWarning: "注意：其中 {count} 个会话仍装载在本次 DSH 进程中（空闲未运行）。删除后若客户端仍持有它们，后续写入可能报错或让日志重新落盘。",
			archivedMissing: "文件缺失",
			archivedUntitled: "未命名会话",
			archivedCreatedAt: "创建于 {time}",
			archivedEvents: "{count} 条事件",
			archivedRestored: "已恢复 {count} 个会话",
			archivedDeleted: "已删除 {count} 个会话，释放 {size}",
			archivedSkipped: "跳过 {count} 个：{reasons}",
			archivedStaleSnapshot: "已写入磁盘，但当前 DSH 进程内的归档快照未同步，建议重启 DSH 后确认",
			archivedReadOnly: "面板处于只读模式，无法恢复或删除归档会话",
			archivedUnavailable: "当前部署未挂载工作区注册表（workspaceRegistry），无法管理归档会话",
			archivedNotWritable: "当前 DSH 版本未暴露归档集合的写入通道，只能查看，无法恢复或删除",
			archivedDeleteDisabled: "当前部署已禁用归档会话删除（allowSessionDelete: false）",
			archivedListingFailed: "无法读取会话存储列表，下面的「文件缺失」判断可能不准",
			archivedRefreshHint: "操作后如侧边栏未立即同步，刷新页面即可"
		};
		const en = {
			nav: "Basics Panel",
			intro: "Visualize and manage MCP servers, skills and rules",
			tabMcp: "MCP servers",
			tabSkills: "Skills",
			tabRules: "Rules",
			tabArchived: "Archived sessions",
			refresh: "Refresh",
			loading: "Loading…",
			error: "Failed to load",
			retry: "Retry",
			empty: "Nothing here yet",
			mcpIntro: "DSH MCP servers come from the composition: user (profile) and preset scopes. Toggling writes the config file and hot-reloads it.",
			mcpNoProject: "DSH has no project-level MCP composition file yet; project-level config is planned.",
			mcpScopeProfile: "User config",
			mcpScopePreset: "Preset",
			mcpReadOnly: "Read-only",
			mcpConnected: "Connected",
			mcpEnabled: "Enabled",
			mcpDisabled: "Disabled",
			mcpNotMounted: "Not active",
			mcpTools: "{count} tools",
			mcpToggle: "Enable this MCP server",
			mcpTakesEffectNewSession: "Saved — takes effect for new sessions",
			mcpTakesEffectLive: "Saved — hot-reloaded",
			mcpFieldCommand: "Command",
			mcpFieldArgs: "Args",
			mcpFieldEnv: "Env",
			mcpFieldUrl: "URL",
			mcpFieldHeaders: "Headers",
			mcpFieldCwd: "Working dir",
			mcpFieldTransport: "Transport",
			mcpFieldTimeout: "Call timeout",
			mcpSeconds: "{count}s",
			mcpMasked: "masked",
			mcpLoadFailed: "Failed to load MCP servers",
			mcpToggleFailed: "Toggle failed",
			mcpApplying: "Applying… (waiting for hot reload)",
			mcpNoPresetServers: "No preset-scope MCP servers: no mcp-client row is declared in any session preset composition.",
			mcpPresetScoped: "Preset scope (active per session)",
			mcpCreate: "Add",
			mcpCreateFailed: "Create failed",
			mcpEmpty: "No MCP servers yet — click \"Add\" to create one",
			skillsIntro: "All skills grouped by scope. Project skills outrank user skills; same-name skills show the effective version.",
			skillsSearch: "Search skills…",
			skillsFilterAll: "All",
			skillsScopeProject: "Project",
			skillsScopeCustom: "Custom",
			skillsScopeUser: "User",
			skillsScopeBundled: "Bundled",
			skillsScopeRuntime: "Runtime",
			skillsScopeOther: "Other",
			skillsEditable: "Editable",
			skillsReadonly: "Read-only",
			skillsModelInvocable: "Model-invocable",
			skillsUserInvocable: "User-invocable",
			skillsDisableModel: "Disable model invocation",
			skillsNoSkills: "No skills found",
			skillsIncomplete: "Some skills could not be fully read",
			skillsScopeFallback: "Could not identify the current session; showing the skill scope of session {session}",
			skillsNoScope: "No live session found: the skill scope is unknown, so only the global layer is readable — reopen this panel from a session",
			skillsBack: "Back to list",
			skillsName: "Name",
			skillsDescription: "Description",
			skillsWhenToUse: "When to use",
			skillsMetadata: "Metadata (JSON)",
			skillsBody: "Body",
			skillsSave: "Save",
			skillsCancel: "Cancel",
			skillsSaved: "Saved — hot-reloaded",
			skillsSaveFailed: "Save failed",
			skillsConflict: "The file changed — refresh and retry",
			skillsLocation: "Location",
			skillsOpen: "Edit",
			close: "Close",
			rulesIntro: "Rule files (AGENTS.md-compatible instructions) shape assistant behavior: global rules apply to every project and session, project-chain rules (project root to current dir) take precedence over global ones. Rules load at session start, so edits take effect for new sessions.",
			rulesGlobal: "Global rules",
			rulesProject: "Project rules",
			rulesSessionCwd: "Session cwd",
			rulesProjectRoot: "Project root",
			rulesCreate: "New rule",
			rulesCreateFailed: "Create failed",
			rulesCreateName: "File name",
			rulesCreateScope: "Scope",
			rulesScopeGlobal: "Global (~/.dsh)",
			rulesScopeProject: "Project root",
			rulesScopeCwd: "Current working dir",
			rulesScopeHintGlobal: "The global rule file is fixed to AGENTS.md",
			rulesScopeHintProject: "Writes to the project root, applies to the whole project",
			rulesScopeHintCwd: "Writes to the current working dir, applies there only",
			rulesExists: "This file already exists — edit it directly",
			rulesNoRules: "No rule files yet — click \"New rule\" to create one",
			rulesPath: "Path",
			rulesBytes: "{count} bytes",
			rulesEdit: "Edit",
			rulesBack: "Back to list",
			rulesContent: "Content",
			rulesSave: "Save",
			rulesCancel: "Cancel",
			rulesSaved: "Saved — takes effect for new sessions",
			rulesSaveFailed: "Save failed",
			rulesConflict: "The file changed — refresh and retry",
			rulesLoadFailed: "Failed to load rules",
			archivedIntro: "Archived sessions are hidden from every sidebar grouping while their logs and workspace position stay intact. Restore puts a session back where it was; delete removes its records from disk for good.",
			archivedEmpty: "No archived sessions",
			archivedLoadFailed: "Failed to load archived sessions",
			archivedCount: "{count} archived sessions",
			archivedTotalSize: "{size} total",
			archivedRoot: "Sessions root",
			archivedSelectAll: "Select all",
			archivedSelected: "{count} selected",
			archivedRestore: "Restore",
			archivedRestoreSelected: "Restore selected",
			archivedDelete: "Delete",
			archivedDeleteSelected: "Delete selected",
			archivedDeleteAll: "Delete all",
			archivedConfirmRestore: "Restore {count} sessions? They return to their previous sidebar position.",
			archivedConfirmDelete: "Permanently delete {count} sessions? Their records are removed from disk and cannot be recovered.",
			archivedNote: "Deleting removes the session log directory, its workspace slot, and its archive entry. Derived data such as attachments referenced by messages is not reclaimed.",
			archivedConfirm: "Confirm",
			archivedCancel: "Cancel",
			archivedWorking: "Working…",
			archivedRunning: "Running",
			archivedRunningHint: "This session's Agent is processing a turn (DSH status \"running\"), so it cannot be deleted.",
			archivedLoaded: "Loaded",
			archivedLoadedHint: "This session still sits in this DSH process's memory (archiving only hides it from listings). It can be deleted while idle.",
			archivedLoadedWarning: "Note: {count} of them are still loaded in this DSH process (idle, not running). If a client still holds them, later writes may fail or re-create their logs.",
			archivedMissing: "Missing files",
			archivedUntitled: "Untitled session",
			archivedCreatedAt: "Created {time}",
			archivedEvents: "{count} events",
			archivedRestored: "Restored {count} sessions",
			archivedDeleted: "Deleted {count} sessions, freed {size}",
			archivedSkipped: "Skipped {count}: {reasons}",
			archivedStaleSnapshot: "Written to disk, but this DSH process still holds a stale archive snapshot — restart DSH to confirm",
			archivedReadOnly: "The panel is read-only: archived sessions cannot be restored or deleted",
			archivedUnavailable: "This deployment mounts no workspace registry (workspaceRegistry), so archived sessions cannot be managed",
			archivedNotWritable: "This DSH build exposes no write channel for the archive set: the list is view-only here",
			archivedDeleteDisabled: "Deleting archived sessions is disabled in this deployment (allowSessionDelete: false)",
			archivedListingFailed: "The stored-session listing could not be read, so the \"missing files\" marks below may be inaccurate",
			archivedRefreshHint: "If the sidebar does not update right away, refresh the page"
		};
		/** The dictionary namespace this plugin owns in the DSH locale registry. */
		const LOCALE_NS = "basicsPanel";
		/** The DSH locale service attached by the client apply (absent → browser detection). */
		let localeService;
		/** Attach (or detach, with undefined) the DSH locale service. */
		function attachLocale(service) {
			localeService = service;
		}
		/** The active locale id ('zh' | 'en'). */
		function activeLocale() {
			return localeService?.getSnapshot().active ?? (typeof navigator !== "undefined" ? navigator.language : "") ?? "en";
		}
		/** Translate a copy key; `{name}` placeholders interpolate from `params`. */
		function t(key, params) {
			let text = (activeLocale().toLowerCase().startsWith("zh") ? zh : en)[key];
			if (params !== void 0) for (const [name, value] of Object.entries(params)) text = text.replaceAll(`{${name}}`, String(value));
			return text;
		}
		//#endregion
		//#region src/client/api.ts
		var BasicsApiError = class extends Error {
			code;
			constructor(code, message) {
				super(message);
				this.code = code;
			}
		};
		/**
		* Resolve the session the main view is showing.
		*
		* DSH ≤0.1.6 spelled this as `snapshot.current`; DSH ≥0.1.7 dropped that field
		* and instead counts retentions per consumer source, so the session the main
		* conversation view holds is the row carrying `retainedBy.mainView`. Without
		* this the panel sent an empty session id, the host could not resolve a skill
		* scope, and every skill lives in a preset-scoped layer — so the page listed
		* nothing at all (the MCP page, which needs no session, kept working).
		*/
		function currentSessionId(snap) {
			const legacy = snap.current;
			if (typeof legacy === "string" && legacy !== "" && snap.byId[legacy] !== void 0) return legacy;
			for (const row of Object.values(snap.byId ?? {})) if ((row.retainedBy?.mainView ?? 0) > 0) return row.id;
			return typeof legacy === "string" ? legacy : "";
		}
		/** Read the current session ref for skill scoping. */
		function currentSession(ctx) {
			const snap = ctx.sessions.list.getSnapshot();
			const sessionId = currentSessionId(snap);
			return {
				sessionId,
				cwd: sessionId !== "" ? snap.byId[sessionId]?.cwd : void 0
			};
		}
		async function call(method, payload) {
			let response;
			try {
				response = await fetch(`/basics/api/${method}`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(payload)
				});
			} catch (error) {
				throw new BasicsApiError("internal", `网络请求失败: ${error instanceof Error ? error.message : String(error)}`);
			}
			let body;
			try {
				body = await response.json();
			} catch {
				body = void 0;
			}
			if (body === void 0 || body.ok !== true || body.error !== void 0) throw new BasicsApiError(body?.error?.code ?? "internal", body?.error?.message ?? `HTTP ${response.status}`);
			return body.value;
		}
		function skillPayload(ref, extra) {
			return {
				sessionId: ref.sessionId,
				...ref.cwd !== void 0 ? { cwd: ref.cwd } : {},
				...extra
			};
		}
		const api = {
			skillsList(ref) {
				return call("skills.list", {
					sessionId: ref.sessionId,
					...ref.cwd !== void 0 ? { cwd: ref.cwd } : {}
				});
			},
			skillsGet(ref, name) {
				return call("skills.get", skillPayload(ref, { name }));
			},
			skillsSave(ref, name, expectedMtime, edit) {
				return call("skills.save", skillPayload(ref, {
					name,
					...expectedMtime !== void 0 ? { expectedMtime } : {},
					edit
				}));
			},
			mcpList() {
				return call("mcp.list", {});
			},
			mcpSetEnabled(path, rowId, serverName, enabled, presetId) {
				return call("mcp.setEnabled", {
					path,
					...rowId !== null ? { rowId } : {},
					...presetId !== void 0 ? { presetId } : {},
					serverName,
					enabled
				});
			},
			mcpSave(path, rowId, serverName, patch, presetId) {
				return call("mcp.save", {
					path,
					...rowId !== null ? { rowId } : {},
					...presetId !== void 0 ? { presetId } : {},
					serverName,
					patch
				});
			},
			mcpCreate(path, input) {
				return call("mcp.create", {
					...path !== null ? { path } : {},
					...input
				});
			},
			rulesList(ref) {
				return call("rules.list", {
					sessionId: ref.sessionId,
					...ref.cwd !== void 0 ? { cwd: ref.cwd } : {}
				});
			},
			rulesGet(ref, key) {
				return call("rules.get", skillPayload(ref, { key }));
			},
			rulesSave(ref, key, expectedMtime, content) {
				return call("rules.save", skillPayload(ref, {
					key,
					...expectedMtime !== void 0 ? { expectedMtime } : {},
					content
				}));
			},
			rulesCreate(ref, scope, fileName) {
				return call("rules.create", skillPayload(ref, {
					scope,
					fileName
				}));
			},
			archivedList() {
				return call("archived.list", {});
			},
			archivedRestore(ids) {
				return call("archived.restore", { ids });
			},
			archivedDelete(ids) {
				return call("archived.delete", { ids });
			}
		};
		//#endregion
		//#region \0dsh-css:C:\dsh-tauri-build\remote-probe\dl\bp-src\src\client\panel.module.css.mjs
		const css = "._40z-ja_section{box-sizing:border-box;flex-direction:column;gap:14px;width:100%;height:100%;min-height:0;display:flex;overflow-y:auto}._40z-ja_intro{color:var(--dsw-alias-label-tertiary);margin:0;padding:0 2px;font-size:13px;line-height:20px}._40z-ja_tabs{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);border-radius:12px;flex:none;gap:4px;padding:4px;display:flex}._40z-ja_tab{font:inherit;cursor:pointer;color:var(--dsw-alias-label-secondary);background:0 0;border:none;border-radius:8px;flex:1;padding:7px 12px;font-size:13px;line-height:18px}._40z-ja_tabActive{background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);font-weight:600;box-shadow:0 1px 2px #00000026}._40z-ja_group{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:16px;flex-direction:column;flex:none;gap:8px;padding:16px 18px 18px;display:flex}._40z-ja_groupHeading{color:var(--dsw-alias-label-primary);align-items:baseline;gap:7px;padding:0 2px 4px;font-size:13px;font-weight:600;line-height:20px;display:flex}._40z-ja_groupSub{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:400;line-height:18px;overflow:hidden}._40z-ja_count{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;margin-left:auto;font-size:12px}._40z-ja_row{border-top:1px solid var(--dsw-alias-border-l2);align-items:center;gap:12px;padding:8px 2px;display:flex}._40z-ja_row:first-of-type{border-top:none}._40z-ja_rowText{flex-direction:column;flex:1;gap:2px;min-width:0;display:flex}._40z-ja_title{color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}._40z-ja_desc{color:var(--dsw-alias-label-tertiary);word-break:break-all;font-size:12px;line-height:18px}._40z-ja_control{flex:none;align-items:center;gap:8px;display:flex}._40z-ja_switch{cursor:pointer;display:inline-flex;position:relative}._40z-ja_switchInput{opacity:0;cursor:pointer;width:100%;height:100%;margin:0;position:absolute}._40z-ja_switchTrack{background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);box-sizing:border-box;border-radius:10px;align-items:center;width:34px;height:20px;padding:2px;transition:background .15s;display:inline-flex}._40z-ja_switchThumb{background:var(--dsw-alias-bg-layer-3);border-radius:50%;width:14px;height:14px;transition:transform .15s}._40z-ja_switchInput:checked+._40z-ja_switchTrack{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}._40z-ja_switchInput:checked+._40z-ja_switchTrack ._40z-ja_switchThumb{transform:translate(14px)}._40z-ja_switchInput:disabled+._40z-ja_switchTrack{opacity:.5;cursor:not-allowed}._40z-ja_switchInput:focus-visible+._40z-ja_switchTrack{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}._40z-ja_statusDot{border-radius:50%;flex:none;width:8px;height:8px}._40z-ja_dotConnected{background:#22c55e}._40z-ja_dotEnabled{background:var(--dsw-alias-brand-primary)}._40z-ja_dotDisabled{background:var(--dsw-alias-label-tertiary)}._40z-ja_pill{color:var(--dsw-alias-label-secondary);align-items:center;gap:4px;font-size:12px;line-height:18px;display:inline-flex}._40z-ja_badge{color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);border-radius:999px;padding:1px 8px;font-size:11px;line-height:16px;display:inline-block}._40z-ja_mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}._40z-ja_error{color:#f2a1a1;background:#2a1a1a;border:1px solid #f2a1a1;border-radius:8px;padding:8px 12px;font-size:12px;line-height:18px}._40z-ja_empty{text-align:center;color:var(--dsw-alias-label-tertiary);padding:24px 8px;font-size:13px}._40z-ja_toolbar{flex-wrap:wrap;flex:none;align-items:center;gap:8px;display:flex}._40z-ja_input{flex:1;min-width:160px}._40z-ja_skillList{flex-direction:column;gap:8px;display:flex}._40z-ja_skillRow{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);cursor:pointer;text-align:left;font:inherit;color:inherit;border-radius:12px;align-items:center;gap:10px;padding:10px 12px;display:flex}._40z-ja_skillRow:hover{border-color:var(--dsw-alias-brand-primary)}._40z-ja_skillRowReadonly{cursor:default;opacity:.75}._40z-ja_skillMain{flex-direction:column;flex:1;gap:2px;min-width:0;display:flex}._40z-ja_skillName{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:600;line-height:20px}._40z-ja_skillDesc{color:var(--dsw-alias-label-tertiary);-webkit-line-clamp:2;-webkit-box-orient:vertical;font-size:12px;line-height:18px;display:-webkit-box;overflow:hidden}._40z-ja_editor{flex-direction:column;gap:12px;display:flex}._40z-ja_editorActions{justify-content:flex-end;gap:8px;display:flex}._40z-ja_field{flex-direction:column;gap:4px;display:flex}._40z-ja_fieldLabel{color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:600;line-height:18px}._40z-ja_textarea{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);width:100%;color:var(--dsw-alias-label-primary);font:inherit;resize:vertical;border-radius:10px;padding:10px 12px;font-size:13px}._40z-ja_textareaMono{min-height:180px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}._40z-ja_select{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);width:100%;color:var(--dsw-alias-label-primary);font:inherit;border-radius:10px;padding:8px 12px;font-size:13px}._40z-ja_radioRow{cursor:pointer;align-items:flex-start;gap:9px;padding:6px 2px;display:flex}._40z-ja_radioRow input{accent-color:var(--dsw-alias-brand-primary);margin:3px 0 0}._40z-ja_radioText{flex-direction:column;gap:1px;min-width:0;display:flex}._40z-ja_radioTitle{color:var(--dsw-alias-label-primary);font-size:13px;line-height:18px}._40z-ja_radioDesc{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:17px}._40z-ja_targetPreview{border:1px dashed var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);word-break:break-all;border-radius:10px;padding:8px 12px;font-size:12px;line-height:18px}._40z-ja_button{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;border-radius:8px;padding:7px 16px;font-size:13px}._40z-ja_buttonPrimary{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:#fff}._40z-ja_buttonDanger{color:#f2a1a1;border-color:#f2a1a1}._40z-ja_buttonDanger:not(:disabled):hover{background:#2a1a1a}._40z-ja_button:disabled{opacity:.5;cursor:not-allowed}._40z-ja_checkRow{color:var(--dsw-alias-label-secondary);cursor:pointer;white-space:nowrap;align-items:center;gap:6px;font-size:12px;line-height:18px;display:inline-flex}._40z-ja_checkRow input{accent-color:var(--dsw-alias-brand-primary);margin:0}._40z-ja_archivedRow{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);border-radius:12px;align-items:center;gap:10px;padding:10px 12px;display:flex}._40z-ja_archivedRow>input[type=checkbox]{accent-color:var(--dsw-alias-brand-primary);flex:none;margin:0}._40z-ja_rowActions{flex:none;align-items:center;gap:6px;display:flex}._40z-ja_confirmBar{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-radius:12px;flex-direction:column;gap:8px;padding:12px 14px;font-size:13px;line-height:20px;display:flex}._40z-ja_confirmBarDanger{border-color:#f2a1a1}._40z-ja_note{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}";
		const tagId = "dsh-external/dsh-basics-panel/panel.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-external/dsh-basics-panel";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var panel_module_css_default = {
			"row": "_40z-ja_row",
			"switch": "_40z-ja_switch",
			"skillDesc": "_40z-ja_skillDesc",
			"field": "_40z-ja_field",
			"textarea": "_40z-ja_textarea",
			"radioTitle": "_40z-ja_radioTitle",
			"checkRow": "_40z-ja_checkRow",
			"tab": "_40z-ja_tab",
			"error": "_40z-ja_error",
			"groupHeading": "_40z-ja_groupHeading",
			"rowActions": "_40z-ja_rowActions",
			"skillRow": "_40z-ja_skillRow",
			"toolbar": "_40z-ja_toolbar",
			"tabActive": "_40z-ja_tabActive",
			"confirmBar": "_40z-ja_confirmBar",
			"statusDot": "_40z-ja_statusDot",
			"rowText": "_40z-ja_rowText",
			"textareaMono": "_40z-ja_textareaMono",
			"switchTrack": "_40z-ja_switchTrack",
			"badge": "_40z-ja_badge",
			"dotEnabled": "_40z-ja_dotEnabled",
			"radioRow": "_40z-ja_radioRow",
			"pill": "_40z-ja_pill",
			"select": "_40z-ja_select",
			"group": "_40z-ja_group",
			"targetPreview": "_40z-ja_targetPreview",
			"fieldLabel": "_40z-ja_fieldLabel",
			"dotConnected": "_40z-ja_dotConnected",
			"button": "_40z-ja_button",
			"switchInput": "_40z-ja_switchInput",
			"buttonDanger": "_40z-ja_buttonDanger",
			"empty": "_40z-ja_empty",
			"archivedRow": "_40z-ja_archivedRow",
			"section": "_40z-ja_section",
			"editorActions": "_40z-ja_editorActions",
			"radioDesc": "_40z-ja_radioDesc",
			"buttonPrimary": "_40z-ja_buttonPrimary",
			"confirmBarDanger": "_40z-ja_confirmBarDanger",
			"control": "_40z-ja_control",
			"radioText": "_40z-ja_radioText",
			"title": "_40z-ja_title",
			"desc": "_40z-ja_desc",
			"note": "_40z-ja_note",
			"dotDisabled": "_40z-ja_dotDisabled",
			"input": "_40z-ja_input",
			"tabs": "_40z-ja_tabs",
			"skillList": "_40z-ja_skillList",
			"skillName": "_40z-ja_skillName",
			"groupSub": "_40z-ja_groupSub",
			"count": "_40z-ja_count",
			"skillMain": "_40z-ja_skillMain",
			"switchThumb": "_40z-ja_switchThumb",
			"intro": "_40z-ja_intro",
			"editor": "_40z-ja_editor",
			"skillRowReadonly": "_40z-ja_skillRowReadonly",
			"mono": "_40z-ja_mono"
		};
		//#endregion
		//#region src/client/shared.tsx
		/**
		* Shared presentational primitives: a custom toggle switch (a real checkbox
		* driving a styled track/thumb) and a status dot. Feature components reuse
		* these so the panel stays visually consistent as features are added.
		*/
		/** The custom switch. */
		function Toggle(props) {
			const { checked, onChange, label, disabled } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
				className: panel_module_css_default.switch,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
					type: "checkbox",
					className: panel_module_css_default.switchInput,
					checked,
					disabled: disabled === true,
					"aria-label": label,
					onChange: (event) => {
						onChange(event.currentTarget.checked);
					}
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: panel_module_css_default.switchTrack,
					"aria-hidden": "true",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: panel_module_css_default.switchThumb })
				})]
			});
		}
		/** A colored status dot. */
		function StatusDot(props) {
			const className = props.kind === "connected" ? panel_module_css_default.dotConnected : props.kind === "enabled" ? panel_module_css_default.dotEnabled : panel_module_css_default.dotDisabled;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: `${panel_module_css_default.statusDot} ${className}`,
				"aria-hidden": "true"
			});
		}
		//#endregion
		//#region src/client/features/mcp/McpSection.tsx
		/**
		* MCP feature UI: one group card per source scope, one row per server, each
		* with a status dot, transport badge, enable switch, and an expandable
		* (secret-masked) config detail. Toggling is optimistic and reverts on
		* failure; preset-scope writes show the "new session" hint. The toolbar adds
		* a new server row, which is also the way out of the empty state.
		*/
		function scopeLabel$1(group) {
			return `${group.scope === "profile" ? t("mcpScopeProfile") : t("mcpScopePreset")} · ${group.scopeLabel}`;
		}
		function statusOf(server) {
			if (server.disabled) return {
				kind: "disabled",
				text: t("mcpDisabled")
			};
			if (server.runtime.probe === "unknown") return {
				kind: "enabled",
				text: t("mcpPresetScoped")
			};
			if (server.runtime.mounted && server.runtime.toolCount > 0) return {
				kind: "connected",
				text: `${t("mcpConnected")} · ${t("mcpTools", { count: server.runtime.toolCount })}`
			};
			if (server.runtime.mounted) return {
				kind: "enabled",
				text: t("mcpEnabled")
			};
			return {
				kind: "disabled",
				text: t("mcpNotMounted")
			};
		}
		/** Whether two views address the same composition row. */
		function sameRow(left, right) {
			return left.rowId !== null && left.rowId === right.rowId || left.serverName === right.serverName;
		}
		/** One group's identity: a preset group carries no file path of its own. */
		function groupKey(group) {
			return `${group.scope}:${group.scopeLabel}:${group.path}`;
		}
		/**
		* The preset a group belongs to. One file may declare the same server name in
		* its profile rows and inside a preset declaration, so the host needs this to
		* address the exact row the user clicked.
		*/
		function presetOf(group) {
			return group.scope === "preset" ? group.scopeLabel : void 0;
		}
		/** How long a toggle keeps re-reading the list while the hot reload lands. */
		const TOGGLE_POLL_INTERVAL_MS = 1500;
		const TOGGLE_POLL_TIMEOUT_MS = 15e3;
		function joinArgs(args) {
			if (args === void 0 || args.length === 0) return "";
			return args.map((value) => /\s/.test(value) ? JSON.stringify(value) : value).join(" ");
		}
		function ServerConfig(props) {
			const { server } = props;
			const detail = [];
			detail.push([t("mcpFieldTransport"), server.transport]);
			if (server.command !== void 0) detail.push([t("mcpFieldCommand"), server.command]);
			if (server.args !== void 0 && server.args.length > 0) detail.push([t("mcpFieldArgs"), joinArgs(server.args)]);
			if (server.cwd !== void 0) detail.push([t("mcpFieldCwd"), server.cwd]);
			if (server.url !== void 0) detail.push([t("mcpFieldUrl"), server.url]);
			if (server.toolCallTimeoutMs !== void 0) detail.push([t("mcpFieldTimeout"), t("mcpSeconds", { count: Math.round(server.toolCallTimeoutMs / 1e3) })]);
			const envKeys = server.env === void 0 ? [] : Object.keys(server.env);
			const headerKeys = server.headers === void 0 ? [] : Object.keys(server.headers);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
				detail.map(([label, value]) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.row,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: panel_module_css_default.title,
						children: label
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: `${panel_module_css_default.desc} ${panel_module_css_default.mono}`,
						children: value
					})]
				}, label)),
				envKeys.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.row,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: panel_module_css_default.title,
						children: t("mcpFieldEnv")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: `${panel_module_css_default.desc} ${panel_module_css_default.mono}`,
						children: envKeys.map((key) => `${key}=${t("mcpMasked")}`).join("  ")
					})]
				}),
				headerKeys.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.row,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: panel_module_css_default.title,
						children: t("mcpFieldHeaders")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: `${panel_module_css_default.desc} ${panel_module_css_default.mono}`,
						children: headerKeys.join("  ")
					})]
				})
			] });
		}
		const MASK = "••••";
		function McpEditor(props) {
			const { group, server, onDone } = props;
			const [serverName, setServerName] = (0, react.useState)(server.serverName);
			const [transport, setTransport] = (0, react.useState)(server.transport);
			const [command, setCommand] = (0, react.useState)(server.command ?? "");
			const [argsText, setArgsText] = (0, react.useState)(server.args !== void 0 ? JSON.stringify(server.args) : "");
			const [envText, setEnvText] = (0, react.useState)(server.env !== void 0 ? JSON.stringify(server.env, null, 2) : "");
			const [url, setUrl] = (0, react.useState)(server.url ?? "");
			const [error, setError] = (0, react.useState)(null);
			const [saving, setSaving] = (0, react.useState)(false);
			const save = () => {
				setError(null);
				let args = null;
				if (argsText.trim() !== "") try {
					const value = JSON.parse(argsText);
					if (!Array.isArray(value)) throw new Error("not-array");
					args = value;
				} catch {
					setError("args 必须是 JSON 数组，例如 [\"-y\",\"@x/mcp\"]");
					return;
				}
				let env = null;
				if (envText.trim() !== "") try {
					const value = JSON.parse(envText);
					if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("not-object");
					env = value;
				} catch {
					setError("env 必须是 JSON 对象，例如 {\"KEY\":\"value\"}");
					return;
				}
				if (env !== null) {
					for (const key of Object.keys(env)) if (env[key] === MASK) delete env[key];
				}
				setSaving(true);
				api.mcpSave(group.path, server.rowId, server.serverName, {
					serverName,
					transport,
					command: command.trim() === "" ? null : command,
					args,
					env,
					url: url.trim() === "" ? null : url
				}, presetOf(group)).then(() => {
					onDone(true);
				}).catch((caught) => {
					setError(caught instanceof Error ? caught.message : String(caught));
					setSaving(false);
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.editor,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.field,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.fieldLabel,
							children: "serverName"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: panel_module_css_default.input,
							value: serverName,
							onChange: (event) => {
								setServerName(event.currentTarget.value);
							}
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.field,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.fieldLabel,
							children: "transport"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
							className: panel_module_css_default.input,
							value: transport,
							onChange: (event) => {
								setTransport(event.currentTarget.value);
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "stdio",
									children: "stdio"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "streamable-http",
									children: "streamable-http"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "unknown",
									children: "unknown"
								})
							]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.field,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.fieldLabel,
							children: "command"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: `${panel_module_css_default.input} ${panel_module_css_default.textareaMono}`,
							value: command,
							onChange: (event) => {
								setCommand(event.currentTarget.value);
							}
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.field,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.fieldLabel,
							children: "args（JSON 数组）"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
							className: `${panel_module_css_default.textarea} ${panel_module_css_default.textareaMono}`,
							value: argsText,
							onChange: (event) => {
								setArgsText(event.currentTarget.value);
							}
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.field,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.fieldLabel,
							children: "env（JSON 对象，•••• 保留原值）"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
							className: `${panel_module_css_default.textarea} ${panel_module_css_default.textareaMono}`,
							style: { minHeight: 80 },
							value: envText,
							onChange: (event) => {
								setEnvText(event.currentTarget.value);
							}
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.field,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.fieldLabel,
							children: "url"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: `${panel_module_css_default.input} ${panel_module_css_default.textareaMono}`,
							value: url,
							onChange: (event) => {
								setUrl(event.currentTarget.value);
							}
						})]
					}),
					error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.error,
						role: "alert",
						children: error
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.editorActions,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.button,
							onClick: () => {
								onDone(false);
							},
							children: "取消"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: `${panel_module_css_default.button} ${panel_module_css_default.buttonPrimary}`,
							disabled: saving,
							onClick: save,
							children: "保存"
						})]
					})
				]
			});
		}
		/**
		* The create form: a new `mcp-client` row appended into the first editable
		* patch layer by the host. This is the way out of the empty state — without a
		* row in any composition file the panel has nothing to list or toggle.
		*/
		function McpCreateForm(props) {
			const { onDone } = props;
			const [serverName, setServerName] = (0, react.useState)("");
			const [transport, setTransport] = (0, react.useState)("stdio");
			const [command, setCommand] = (0, react.useState)("");
			const [argsText, setArgsText] = (0, react.useState)("");
			const [envText, setEnvText] = (0, react.useState)("");
			const [url, setUrl] = (0, react.useState)("");
			const [error, setError] = (0, react.useState)(null);
			const [saving, setSaving] = (0, react.useState)(false);
			const create = () => {
				setError(null);
				if (serverName.trim() === "") {
					setError("serverName 不能为空");
					return;
				}
				let args = null;
				if (argsText.trim() !== "") try {
					const value = JSON.parse(argsText);
					if (!Array.isArray(value)) throw new Error("not-array");
					args = value;
				} catch {
					setError("args 必须是 JSON 数组，例如 [\"-y\",\"@x/mcp\"]");
					return;
				}
				let env = null;
				if (envText.trim() !== "") try {
					const value = JSON.parse(envText);
					if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("not-object");
					env = value;
				} catch {
					setError("env 必须是 JSON 对象，例如 {\"KEY\":\"value\"}");
					return;
				}
				setSaving(true);
				api.mcpCreate(null, {
					serverName: serverName.trim(),
					transport,
					...command.trim() === "" ? {} : { command },
					...args === null ? {} : { args },
					...env === null ? {} : { env },
					...url.trim() === "" ? {} : { url }
				}).then(() => {
					onDone(true);
				}).catch((caught) => {
					setError(`${t("mcpCreateFailed")}: ${caught instanceof Error ? caught.message : String(caught)}`);
					setSaving(false);
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.editor,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.groupHeading,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("mcpCreate") })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.field,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.fieldLabel,
							children: "serverName"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: panel_module_css_default.input,
							value: serverName,
							onChange: (event) => {
								setServerName(event.currentTarget.value);
							}
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.field,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.fieldLabel,
							children: "transport"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
							className: panel_module_css_default.select,
							value: transport,
							onChange: (event) => {
								setTransport(event.currentTarget.value);
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: "stdio",
								children: "stdio"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: "streamable-http",
								children: "streamable-http"
							})]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.field,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.fieldLabel,
							children: "command"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: `${panel_module_css_default.input} ${panel_module_css_default.textareaMono}`,
							value: command,
							onChange: (event) => {
								setCommand(event.currentTarget.value);
							}
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.field,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.fieldLabel,
							children: "args（JSON 数组）"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
							className: `${panel_module_css_default.textarea} ${panel_module_css_default.textareaMono}`,
							value: argsText,
							onChange: (event) => {
								setArgsText(event.currentTarget.value);
							}
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.field,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.fieldLabel,
							children: "env（JSON 对象）"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
							className: `${panel_module_css_default.textarea} ${panel_module_css_default.textareaMono}`,
							style: { minHeight: 80 },
							value: envText,
							onChange: (event) => {
								setEnvText(event.currentTarget.value);
							}
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.field,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.fieldLabel,
							children: "url"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: `${panel_module_css_default.input} ${panel_module_css_default.textareaMono}`,
							value: url,
							onChange: (event) => {
								setUrl(event.currentTarget.value);
							}
						})]
					}),
					error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.error,
						role: "alert",
						children: error
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.editorActions,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.button,
							onClick: () => {
								onDone(false);
							},
							children: "取消"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: `${panel_module_css_default.button} ${panel_module_css_default.buttonPrimary}`,
							disabled: saving,
							onClick: create,
							children: t("mcpCreate")
						})]
					})
				]
			});
		}
		function McpSection(_props) {
			const [groups, setGroups] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(null);
			const [expanded, setExpanded] = (0, react.useState)(/* @__PURE__ */ new Set());
			const [busy, setBusy] = (0, react.useState)(/* @__PURE__ */ new Set());
			const [applying, setApplying] = (0, react.useState)(/* @__PURE__ */ new Set());
			const [notice, setNotice] = (0, react.useState)(null);
			const [editing, setEditing] = (0, react.useState)(null);
			const [creating, setCreating] = (0, react.useState)(false);
			const load = () => {
				setError(null);
				api.mcpList().then((result) => {
					setGroups(result.groups);
				}).catch((caught) => {
					setError(`${t("mcpLoadFailed")}: ${caught instanceof Error ? caught.message : String(caught)}`);
				});
			};
			(0, react.useEffect)(load, []);
			const disposed = (0, react.useRef)(false);
			(0, react.useEffect)(() => () => {
				disposed.current = true;
			}, []);
			const keyOf = (group, server) => `${groupKey(group)}::${server.rowId ?? server.serverName}`;
			/**
			* Keep re-reading the list while a just-toggled server runs through the hot
			* reload. Without this the page showed the pre-reload state ("not active")
			* for a server that was in fact connecting, and only a manual refresh
			* corrected it.
			*/
			const pollUntilSettled = (group, server, enabled) => {
				const key = keyOf(group, server);
				const deadline = Date.now() + TOGGLE_POLL_TIMEOUT_MS;
				setApplying((prev) => new Set(prev).add(key));
				const step = async () => {
					if (disposed.current) return;
					const result = await api.mcpList().catch(() => void 0);
					if (disposed.current) return;
					if (result !== void 0) setGroups(result.groups);
					const row = result?.groups.find((item) => groupKey(item) === groupKey(group))?.servers.find((candidate) => sameRow(candidate, server));
					if (row === void 0 || (enabled ? row.disabled === false && (row.runtime.probe !== "global" || row.runtime.toolCount > 0) : row.disabled) || Date.now() >= deadline) {
						setApplying((prev) => {
							const next = new Set(prev);
							next.delete(key);
							return next;
						});
						return;
					}
					window.setTimeout(() => {
						step();
					}, TOGGLE_POLL_INTERVAL_MS);
				};
				window.setTimeout(() => {
					step();
				}, TOGGLE_POLL_INTERVAL_MS);
			};
			const toggle = (group, server, next) => {
				const key = keyOf(group, server);
				if (busy.has(key)) return;
				setNotice(null);
				setGroups((prev) => prev === null ? prev : prev.map((g) => groupKey(g) === groupKey(group) ? {
					...g,
					servers: g.servers.map((s) => sameRow(s, server) ? {
						...s,
						disabled: !next
					} : s)
				} : g));
				setBusy((prev) => new Set(prev).add(key));
				api.mcpSetEnabled(group.path, server.rowId, server.serverName, next, presetOf(group)).then((result) => {
					setNotice(result.takesEffect === "new-session" ? t("mcpTakesEffectNewSession") : t("mcpTakesEffectLive"));
					pollUntilSettled(group, server, next);
				}).catch((caught) => {
					setNotice(`${t("mcpToggleFailed")}: ${caught instanceof BasicsApiError ? caught.message : caught instanceof Error ? caught.message : String(caught)}`);
					setGroups((prev) => prev === null ? prev : prev.map((g) => groupKey(g) === groupKey(group) ? {
						...g,
						servers: g.servers.map((s) => sameRow(s, server) ? {
							...s,
							disabled: server.disabled
						} : s)
					} : g));
				}).finally(() => {
					setBusy((prev) => {
						const next = new Set(prev);
						next.delete(key);
						return next;
					});
				});
			};
			const flipExpanded = (key) => {
				setExpanded((prev) => {
					const next = new Set(prev);
					if (next.has(key)) next.delete(key);
					else next.add(key);
					return next;
				});
			};
			if (groups === null && error === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: panel_module_css_default.empty,
				children: t("loading")
			});
			if (error !== null) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.error,
				role: "alert",
				children: [error, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: { marginTop: 8 },
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: panel_module_css_default.button,
						onClick: load,
						children: t("retry")
					})
				})]
			});
			if (creating) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: panel_module_css_default.intro,
				children: t("mcpIntro")
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(McpCreateForm, { onDone: (created) => {
				setCreating(false);
				if (created) load();
			} })] });
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: panel_module_css_default.intro,
					children: t("mcpIntro")
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: panel_module_css_default.intro,
					children: t("mcpNoProject")
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.toolbar,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: `${panel_module_css_default.button} ${panel_module_css_default.buttonPrimary}`,
						onClick: () => {
							setCreating(true);
						},
						children: t("mcpCreate")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: panel_module_css_default.button,
						onClick: load,
						children: t("refresh")
					})]
				}),
				notice !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.pill,
					children: notice
				}),
				groups !== null && groups.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.empty,
					children: [t("mcpEmpty"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: { marginTop: 8 },
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: `${panel_module_css_default.button} ${panel_module_css_default.buttonPrimary}`,
							onClick: () => {
								setCreating(true);
							},
							children: t("mcpCreate")
						})
					})]
				}),
				groups !== null && groups.length > 0 && groups.every((group) => group.scope === "profile") && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.pill,
					children: t("mcpNoPresetServers")
				}),
				groups?.map((group) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.group,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.groupHeading,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: scopeLabel$1(group) }),
								group.readOnly && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.badge,
									children: t("mcpReadOnly")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.count,
									children: group.servers.length
								})
							]
						}),
						group.path !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: `${panel_module_css_default.groupSub} ${panel_module_css_default.mono}`,
							children: group.path
						}),
						group.servers.map((server) => {
							const key = keyOf(group, server);
							const status = applying.has(key) ? {
								kind: "enabled",
								text: t("mcpApplying")
							} : statusOf(server);
							const isOpen = expanded.has(key);
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.row,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatusDot, { kind: status.kind }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: panel_module_css_default.rowText,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: panel_module_css_default.title,
											children: server.serverName
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: panel_module_css_default.desc,
											children: status.text
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.badge,
										children: server.transport
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: panel_module_css_default.button,
										"aria-expanded": isOpen,
										onClick: () => {
											flipExpanded(key);
										},
										children: isOpen ? "−" : "+"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Toggle, {
										label: t("mcpToggle"),
										checked: !server.disabled,
										disabled: !server.editable || busy.has(key) || applying.has(key),
										onChange: (next) => {
											toggle(group, server, next);
										}
									})
								]
							}), isOpen && (editing === key ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(McpEditor, {
								group,
								server,
								onDone: (saved) => {
									setEditing(null);
									if (saved) load();
								}
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ServerConfig, { server }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.button,
								disabled: !server.editable,
								onClick: () => {
									setEditing(key);
								},
								children: "编辑配置"
							})] }))] }, key);
						})
					]
				}, groupKey(group)))
			] });
		}
		//#endregion
		//#region src/client/features/skills/SkillsSection.tsx
		/**
		* Skills feature UI: a searchable, scope-filtered list grouped by scope, with
		* an inline editor for the editable skills. The editor stages frontmatter
		* fields plus the Markdown body and commits through `skills.save` (the host
		* re-resolves the file path from the registry and rejects a stale mtime).
		*/
		const SCOPE_FILTERS = [
			"all",
			"project",
			"custom",
			"user",
			"bundled",
			"runtime",
			"other"
		];
		function scopeLabel(scope) {
			switch (scope) {
				case "project": return t("skillsScopeProject");
				case "custom": return t("skillsScopeCustom");
				case "user": return t("skillsScopeUser");
				case "bundled": return t("skillsScopeBundled");
				case "runtime": return t("skillsScopeRuntime");
				default: return t("skillsScopeOther");
			}
		}
		function filterLabel(scope) {
			return scope === "all" ? t("skillsFilterAll") : scopeLabel(scope);
		}
		/** Short, readable session label for the scope hint (ids are long and prefixed). */
		function shortSessionId(sessionId) {
			if (sessionId === void 0 || sessionId === "") return "—";
			const tail = sessionId.replace(/^session-/, "");
			return tail.length <= 8 ? tail : `${tail.slice(0, 8)}…`;
		}
		function SkillsSection(props) {
			const { ctx } = props;
			const [groups, setGroups] = (0, react.useState)(null);
			const [complete, setComplete] = (0, react.useState)(true);
			const [scopeSource, setScopeSource] = (0, react.useState)("session");
			const [scopeSession, setScopeSession] = (0, react.useState)(void 0);
			const [error, setError] = (0, react.useState)(null);
			const [search, setSearch] = (0, react.useState)("");
			const [filter, setFilter] = (0, react.useState)("all");
			const [editing, setEditing] = (0, react.useState)(null);
			const load = () => {
				setError(null);
				api.skillsList(currentSession(ctx)).then((result) => {
					setGroups(result.groups);
					setComplete(result.complete);
					setScopeSource(result.scopeSource ?? "session");
					setScopeSession(result.sessionId);
				}).catch((caught) => {
					setError(caught instanceof Error ? caught.message : String(caught));
				});
			};
			(0, react.useEffect)(load, [ctx]);
			if (editing !== null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkillsEditor, {
				ctx,
				name: editing,
				onBack: () => {
					setEditing(null);
					load();
				}
			});
			if (groups === null && error === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: panel_module_css_default.empty,
				children: t("loading")
			});
			if (error !== null) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.error,
				role: "alert",
				children: [
					t("error"),
					": ",
					error,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: { marginTop: 8 },
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.button,
							onClick: load,
							children: t("retry")
						})
					})
				]
			});
			const needle = search.trim().toLowerCase();
			const visible = (groups ?? []).map((group) => ({
				...group,
				skills: group.skills.filter((skill) => (filter === "all" || group.scope === filter) && (needle === "" || skill.name.toLowerCase().includes(needle) || skill.description.toLowerCase().includes(needle)))
			})).filter((group) => group.skills.length > 0);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: panel_module_css_default.intro,
					children: t("skillsIntro")
				}),
				!complete && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.pill,
					children: t("skillsIncomplete")
				}),
				scopeSource === "fallback" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.pill,
					children: t("skillsScopeFallback", { session: shortSessionId(scopeSession) })
				}),
				scopeSource === "none" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.pill,
					children: t("skillsNoScope")
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.toolbar,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						type: "search",
						className: `${panel_module_css_default.input} ${panel_module_css_default.textarea}`,
						style: { padding: "8px 12px" },
						placeholder: t("skillsSearch"),
						value: search,
						onChange: (event) => {
							setSearch(event.currentTarget.value);
						}
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: panel_module_css_default.button,
						onClick: load,
						children: t("refresh")
					})]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.toolbar,
					children: SCOPE_FILTERS.map((scope) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: scope === filter ? `${panel_module_css_default.badge}` : panel_module_css_default.button,
						style: scope === filter ? {
							background: "var(--dsw-alias-brand-primary)",
							color: "#fff"
						} : { padding: "2px 10px" },
						"aria-pressed": scope === filter,
						onClick: () => {
							setFilter(scope);
						},
						children: filterLabel(scope)
					}, scope))
				}),
				visible.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.empty,
					children: t("skillsNoSkills")
				}),
				visible.map((group) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.group,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.groupHeading,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: scopeLabel(group.scope) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.count,
							children: group.skills.length
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.skillList,
						children: group.skills.map((skill) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: skill.editable ? panel_module_css_default.skillRow : `${panel_module_css_default.skillRow} ${panel_module_css_default.skillRowReadonly}`,
							onClick: () => {
								if (skill.editable) setEditing(skill.name);
							},
							title: skill.editable ? t("skillsOpen") : t("skillsReadonly"),
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.skillMain,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: panel_module_css_default.skillName,
											children: skill.name
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: panel_module_css_default.skillDesc,
											children: skill.description
										}),
										skill.location !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: `${panel_module_css_default.desc} ${panel_module_css_default.mono}`,
											children: [
												t("skillsLocation"),
												": ",
												skill.location
											]
										})
									]
								}),
								!skill.editable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.badge,
									children: t("skillsReadonly")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatusDot, { kind: skill.editable ? "enabled" : "disabled" })
							]
						}, skill.name))
					})]
				}, group.scope))
			] });
		}
		function SkillsEditor(props) {
			const { ctx, name, onBack } = props;
			const [detail, setDetail] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(null);
			const [notice, setNotice] = (0, react.useState)(null);
			const [saving, setSaving] = (0, react.useState)(false);
			const [description, setDescription] = (0, react.useState)("");
			const [whenToUse, setWhenToUse] = (0, react.useState)("");
			const [metadata, setMetadata] = (0, react.useState)("");
			const [modelInvocable, setModelInvocable] = (0, react.useState)(true);
			const [userInvocable, setUserInvocable] = (0, react.useState)(true);
			const [body, setBody] = (0, react.useState)("");
			(0, react.useEffect)(() => {
				let cancelled = false;
				api.skillsGet(currentSession(ctx), name).then((result) => {
					if (cancelled) return;
					setDetail(result);
					setDescription(result.description);
					setWhenToUse(result.whenToUse ?? "");
					setMetadata(result.metadata !== void 0 ? JSON.stringify(result.metadata, null, 2) : "");
					setModelInvocable(result.modelInvocable);
					setUserInvocable(result.userInvocable);
					setBody(result.body);
				}).catch((caught) => {
					if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
				});
				return () => {
					cancelled = true;
				};
			}, [ctx, name]);
			const save = () => {
				if (detail === null) return;
				setError(null);
				setNotice(null);
				let parsedMetadata = null;
				if (metadata.trim() !== "") try {
					const value = JSON.parse(metadata);
					if (value !== null && (typeof value !== "object" || Array.isArray(value))) {
						setError(t("skillsMetadata") + " 必须是 JSON 对象");
						return;
					}
					parsedMetadata = value;
				} catch {
					setError(t("skillsMetadata") + " 不是合法 JSON");
					return;
				}
				setSaving(true);
				api.skillsSave(currentSession(ctx), name, detail.mtime, {
					description,
					whenToUse: whenToUse.trim() === "" ? null : whenToUse,
					metadata: parsedMetadata,
					modelInvocable,
					userInvocable,
					body
				}).then(() => {
					setNotice(t("skillsSaved"));
					setSaving(false);
				}).catch((caught) => {
					const message = caught instanceof Error ? caught.message : String(caught);
					setError(`${t("skillsSaveFailed")}: ${message}`);
					setSaving(false);
				});
			};
			if (error !== null) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.error,
				role: "alert",
				children: [
					t("error"),
					": ",
					error,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: { marginTop: 8 },
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.button,
							onClick: onBack,
							children: t("skillsBack")
						})
					})
				]
			});
			if (detail === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: panel_module_css_default.empty,
				children: t("loading")
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.editor,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.groupHeading,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
							t("skillsName"),
							": ",
							detail.name
						] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.badge,
							children: detail.source
						})]
					}),
					detail.path !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: `${panel_module_css_default.groupSub} ${panel_module_css_default.mono}`,
						children: detail.path
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.field,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.fieldLabel,
							children: t("skillsDescription")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
							className: panel_module_css_default.textarea,
							value: description,
							onChange: (event) => {
								setDescription(event.currentTarget.value);
							}
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.field,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.fieldLabel,
							children: t("skillsWhenToUse")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
							className: panel_module_css_default.textarea,
							value: whenToUse,
							onChange: (event) => {
								setWhenToUse(event.currentTarget.value);
							}
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.field,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.fieldLabel,
							children: t("skillsMetadata")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
							className: `${panel_module_css_default.textarea} ${panel_module_css_default.textareaMono}`,
							style: { minHeight: 80 },
							value: metadata,
							placeholder: "{ \"key\": \"value\" }",
							onChange: (event) => {
								setMetadata(event.currentTarget.value);
							}
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.row,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: panel_module_css_default.rowText,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.title,
								children: t("skillsModelInvocable")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.desc,
								children: t("skillsDisableModel")
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Toggle, {
							checked: modelInvocable,
							onChange: setModelInvocable,
							label: t("skillsModelInvocable")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.row,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.rowText,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.title,
								children: t("skillsUserInvocable")
							})
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Toggle, {
							checked: userInvocable,
							onChange: setUserInvocable,
							label: t("skillsUserInvocable")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.field,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.fieldLabel,
							children: t("skillsBody")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
							className: `${panel_module_css_default.textarea} ${panel_module_css_default.textareaMono}`,
							value: body,
							onChange: (event) => {
								setBody(event.currentTarget.value);
							}
						})]
					}),
					notice !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.pill,
						children: notice
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.editorActions,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.button,
							onClick: onBack,
							children: t("skillsCancel")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: `${panel_module_css_default.button} ${panel_module_css_default.buttonPrimary}`,
							disabled: saving,
							onClick: save,
							children: t("skillsSave")
						})]
					})
				]
			});
		}
		//#endregion
		//#region src/client/features/rules/RulesSection.tsx
		/**
		* Rules feature UI: list every DSH rule file (user-global AGENTS.md plus the
		* project-root-to-cwd instruction chain), create a new rule file in one of
		* the allowed scopes, and edit an existing one. The editor stages the whole
		* file content and commits through `rules.save` (the host re-resolves the
		* path from discovery and rejects a stale mtime). Rule baselines load at
		* session start, so saves take effect for new sessions.
		*/
		const RULE_FILE_OPTIONS = [
			"AGENTS.md",
			"CLAUDE.md",
			"AGENTS.local.md",
			"CLAUDE.local.md"
		];
		const SCOPE_OPTIONS = [
			{
				scope: "global",
				title: "rulesScopeGlobal",
				desc: "rulesScopeHintGlobal"
			},
			{
				scope: "project",
				title: "rulesScopeProject",
				desc: "rulesScopeHintProject"
			},
			{
				scope: "cwd",
				title: "rulesScopeCwd",
				desc: "rulesScopeHintCwd"
			}
		];
		function formatSize(bytes) {
			return t("rulesBytes", { count: bytes });
		}
		function formatMtime(mtime) {
			try {
				return new Date(mtime).toLocaleString();
			} catch {
				return String(mtime);
			}
		}
		function RulesSection(props) {
			const { ctx } = props;
			const [groups, setGroups] = (0, react.useState)(null);
			const [cwd, setCwd] = (0, react.useState)("");
			const [projectRoot, setProjectRoot] = (0, react.useState)("");
			const [error, setError] = (0, react.useState)(null);
			const [creating, setCreating] = (0, react.useState)(false);
			const [editingKey, setEditingKey] = (0, react.useState)(null);
			const load = () => {
				setError(null);
				api.rulesList(currentSession(ctx)).then((result) => {
					setGroups(result.groups);
					setCwd(result.cwd);
					setProjectRoot(result.projectRoot);
				}).catch((caught) => {
					setError(caught instanceof Error ? caught.message : String(caught));
				});
			};
			(0, react.useEffect)(load, [ctx]);
			if (editingKey !== null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RulesEditor, {
				ctx,
				ruleKey: editingKey,
				onBack: () => {
					setEditingKey(null);
					load();
				}
			});
			if (creating) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RulesCreateForm, {
				ctx,
				cwd,
				projectRoot,
				onBack: () => {
					setCreating(false);
				},
				onCreate: (key) => {
					setCreating(false);
					setEditingKey(key);
				}
			});
			if (groups === null && error === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: panel_module_css_default.empty,
				children: t("loading")
			});
			if (error !== null) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.error,
				role: "alert",
				children: [
					t("rulesLoadFailed"),
					": ",
					error,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: { marginTop: 8 },
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.button,
							onClick: load,
							children: t("retry")
						})
					})
				]
			});
			const allRules = (groups ?? []).flatMap((group) => group.rules);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: panel_module_css_default.intro,
					children: t("rulesIntro")
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.toolbar,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: `${panel_module_css_default.desc} ${panel_module_css_default.mono}`,
							style: { padding: "0 2px" },
							children: [
								t("rulesSessionCwd"),
								": ",
								cwd
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: `${panel_module_css_default.button} ${panel_module_css_default.buttonPrimary}`,
							onClick: () => {
								setCreating(true);
							},
							children: t("rulesCreate")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.button,
							onClick: load,
							children: t("refresh")
						})
					]
				}),
				allRules.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.empty,
					children: t("rulesNoRules")
				}),
				(groups ?? []).map((group) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.group,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.groupHeading,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: group.scope === "global" ? t("rulesGlobal") : t("rulesProject") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.count,
							children: group.rules.length
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.skillList,
						children: group.rules.map((rule) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: rule.editable ? panel_module_css_default.skillRow : `${panel_module_css_default.skillRow} ${panel_module_css_default.skillRowReadonly}`,
							onClick: () => {
								if (rule.editable) setEditingKey(rule.key);
							},
							title: rule.editable ? t("rulesEdit") : t("skillsReadonly"),
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.skillMain,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: panel_module_css_default.skillName,
											children: rule.fileName
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: `${panel_module_css_default.desc} ${panel_module_css_default.mono}`,
											children: [
												t("rulesPath"),
												": ",
												rule.displayPath
											]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: panel_module_css_default.skillDesc,
											children: [
												rule.size !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: formatSize(rule.size) }),
												rule.size !== void 0 && rule.mtime !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: " · " }),
												rule.mtime !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: formatMtime(rule.mtime) })
											]
										})
									]
								}),
								!rule.editable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.badge,
									children: t("skillsReadonly")
								}),
								rule.editable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.badge,
									children: t("rulesEdit")
								})
							]
						}, rule.key))
					})]
				}, group.scope))
			] });
		}
		/** The create form: pick a scope + candidate file name, then create. */
		function RulesCreateForm(props) {
			const { ctx, cwd, projectRoot, onBack, onCreate } = props;
			const [scope, setScope] = (0, react.useState)("global");
			const [fileName, setFileName] = (0, react.useState)("AGENTS.md");
			const [error, setError] = (0, react.useState)(null);
			const [creating, setCreating] = (0, react.useState)(false);
			const availableFiles = scope === "global" ? ["AGENTS.md"] : RULE_FILE_OPTIONS;
			const effectiveFile = availableFiles.includes(fileName) ? fileName : availableFiles[0] ?? "AGENTS.md";
			const targetPath = scope === "global" ? `~/.dsh/${effectiveFile}` : scope === "project" ? `${projectRoot}/${effectiveFile}` : `${cwd}/${effectiveFile}`;
			const create = () => {
				setError(null);
				setCreating(true);
				api.rulesCreate(currentSession(ctx), scope, effectiveFile).then((result) => {
					onCreate(result.key);
				}).catch((caught) => {
					setError(caught instanceof Error ? caught.message : String(caught));
					setCreating(false);
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.editor,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.groupHeading,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("rulesCreate") })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.field,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.fieldLabel,
							children: t("rulesCreateScope")
						}), SCOPE_OPTIONS.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: panel_module_css_default.radioRow,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "radio",
								name: "rule-scope",
								checked: scope === option.scope,
								onChange: () => {
									setScope(option.scope);
								}
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: panel_module_css_default.radioText,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.radioTitle,
									children: t(option.title)
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.radioDesc,
									children: t(option.desc)
								})]
							})]
						}, option.scope))]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.field,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.fieldLabel,
							children: t("rulesCreateName")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
							className: panel_module_css_default.select,
							value: effectiveFile,
							onChange: (event) => {
								setFileName(event.currentTarget.value);
							},
							children: availableFiles.map((file) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: file,
								children: file
							}, file))
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.targetPreview,
						children: targetPath
					}),
					error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.error,
						role: "alert",
						children: [
							t("rulesCreateFailed"),
							": ",
							error
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.editorActions,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.button,
							onClick: onBack,
							children: t("rulesCancel")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: `${panel_module_css_default.button} ${panel_module_css_default.buttonPrimary}`,
							disabled: creating,
							onClick: create,
							children: t("rulesCreate")
						})]
					})
				]
			});
		}
		/** The editor: whole-file Markdown content with a stale-mtime guard. */
		function RulesEditor(props) {
			const { ctx, ruleKey, onBack } = props;
			const [detail, setDetail] = (0, react.useState)(null);
			const [content, setContent] = (0, react.useState)("");
			const [error, setError] = (0, react.useState)(null);
			const [notice, setNotice] = (0, react.useState)(null);
			const [saving, setSaving] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				let cancelled = false;
				api.rulesGet(currentSession(ctx), ruleKey).then((result) => {
					if (cancelled) return;
					setDetail(result);
					setContent(result.content);
				}).catch((caught) => {
					if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
				});
				return () => {
					cancelled = true;
				};
			}, [ctx, ruleKey]);
			const save = () => {
				if (detail === null) return;
				setError(null);
				setNotice(null);
				setSaving(true);
				api.rulesSave(currentSession(ctx), detail.key, detail.mtime, content).then((result) => {
					setDetail({
						...detail,
						mtime: result.mtime ?? detail.mtime
					});
					setNotice(t("rulesSaved"));
					setSaving(false);
				}).catch((caught) => {
					const message = caught instanceof Error ? caught.message : String(caught);
					setError(`${t("rulesSaveFailed")}: ${message}`);
					setSaving(false);
				});
			};
			if (error !== null && detail === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.error,
				role: "alert",
				children: [
					t("error"),
					": ",
					error,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: { marginTop: 8 },
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.button,
							onClick: onBack,
							children: t("rulesBack")
						})
					})
				]
			});
			if (detail === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: panel_module_css_default.empty,
				children: t("loading")
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.editor,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.groupHeading,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: detail.fileName }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.badge,
								children: detail.scope === "global" ? t("rulesGlobal") : t("rulesProject")
							}),
							detail.mtime !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.count,
								children: formatMtime(detail.mtime)
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: `${panel_module_css_default.groupSub} ${panel_module_css_default.mono}`,
						children: [
							t("rulesPath"),
							": ",
							detail.displayPath
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.field,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.fieldLabel,
							children: t("rulesContent")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
							className: `${panel_module_css_default.textarea} ${panel_module_css_default.textareaMono}`,
							style: { minHeight: 320 },
							value: content,
							onChange: (event) => {
								setContent(event.currentTarget.value);
							}
						})]
					}),
					notice !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.pill,
						children: notice
					}),
					error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.error,
						role: "alert",
						children: error
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.editorActions,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.button,
							onClick: onBack,
							children: t("rulesCancel")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: `${panel_module_css_default.button} ${panel_module_css_default.buttonPrimary}`,
							disabled: saving,
							onClick: save,
							children: t("rulesSave")
						})]
					})
				]
			});
		}
		//#endregion
		//#region src/client/features/archived/ArchivedSection.tsx
		/**
		* Archived-sessions feature UI: list every archived session (the registry's
		* one-way archive set joined with the durable session listing), restore a
		* selection, and delete single rows, a selection, or everything at once.
		*
		* Titles and last-activity come from the client session feed the sidebar uses
		* (`ctx.sessions.list`), so the panel shows exactly the labels the user sees
		* there; the host contributes the storage facts. Every destructive action goes
		* through an inline confirmation that names the count, and the host re-checks
		* each id (archived, not running, artifact found) before touching the disk.
		* A row carries two independent liveness flags: `running` (an Agent is draining
		* turns — deletion is blocked) and `loaded` (the session object merely sits in
		* this process's memory, which archiving never unloads — deletion is allowed
		* behind an explicit warning).
		*/
		/** Fallback batch size when the host does not report its cap. */
		const DEFAULT_BATCH_IDS = 200;
		/** Human-readable byte size (binary units; numbers stay locale-neutral). */
		function formatBytes(bytes) {
			if (bytes < 1024) return `${bytes} B`;
			const units = [
				"KB",
				"MB",
				"GB",
				"TB"
			];
			let value = bytes / 1024;
			let unit = 0;
			while (value >= 1024 && unit < units.length - 1) {
				value /= 1024;
				unit += 1;
			}
			return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit] ?? "KB"}`;
		}
		/** Local time of an epoch-millisecond stamp. */
		function formatTime(time) {
			try {
				return new Date(time).toLocaleString();
			} catch {
				return String(time);
			}
		}
		/**
		* Re-pull the sidebar's session-list baseline (best-effort): a deleted session
		* stays in the client feed until the next pull, and a restored one is already
		* back through the Workspace archive frame.
		*/
		function refreshSessionList(ctx) {
			const refresh = ctx.sessions.refresh;
			if (typeof refresh !== "function") return;
			try {
				refresh.call(ctx.sessions).catch(() => {});
			} catch {}
		}
		function ArchivedSection(props) {
			const { ctx } = props;
			const [data, setData] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(null);
			const [notice, setNotice] = (0, react.useState)(null);
			const [selected, setSelected] = (0, react.useState)([]);
			const [pending, setPending] = (0, react.useState)(null);
			const [busy, setBusy] = (0, react.useState)(false);
			const [titles, setTitles] = (0, react.useState)({});
			/**
			* Reload the list. A user-triggered refresh clears the previous result
			* notice; an action's own reload keeps it (`keepNotice`) so the outcome
			* stays readable.
			*/
			const load = (options) => {
				setError(null);
				if (options?.keepNotice !== true) setNotice(null);
				api.archivedList().then((result) => {
					setData(result);
					const alive = new Set(result.rows.map((row) => row.id));
					setSelected((previous) => previous.filter((id) => alive.has(id)));
				}).catch((caught) => {
					setError(caught instanceof Error ? caught.message : String(caught));
				});
			};
			(0, react.useEffect)(() => {
				const read = () => {
					const snapshot = ctx.sessions.list.getSnapshot();
					const next = {};
					for (const [id, summary] of Object.entries(snapshot.byId)) {
						const label = summary.displayTitle;
						if (typeof label === "string" && label !== "") next[id] = label;
					}
					setTitles(next);
				};
				read();
				return ctx.sessions.list.subscribe(read);
			}, [ctx]);
			(0, react.useEffect)(load, [ctx]);
			const rows = (0, react.useMemo)(() => data?.rows ?? [], [data]);
			const selectedSet = (0, react.useMemo)(() => new Set(selected), [selected]);
			const restorableSelected = rows.filter((row) => selectedSet.has(row.id) && row.restorable).map((row) => row.id);
			const deletableSelected = rows.filter((row) => selectedSet.has(row.id) && row.deletable).map((row) => row.id);
			const deletableAll = rows.filter((row) => row.deletable).map((row) => row.id);
			const allSelected = rows.length > 0 && selected.length === rows.length;
			const toggleAll = () => {
				setSelected(allSelected ? [] : rows.map((row) => row.id));
			};
			const toggleOne = (id) => {
				setSelected((previous) => previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id]);
			};
			/** Run one confirmed action (chunked to the host's batch cap) and fold the result into the notice area. */
			const run = (action) => {
				setBusy(true);
				setNotice(null);
				setError(null);
				const chunkSize = Math.max(1, data?.maxBatchIds ?? DEFAULT_BATCH_IDS);
				const call = action.kind === "delete" ? api.archivedDelete : api.archivedRestore;
				runInBatches(action.ids, chunkSize, call).then((result) => {
					const changed = new Set(result.changed);
					setSelected((previous) => previous.filter((id) => !changed.has(id)));
					setPending(null);
					setBusy(false);
					if (action.kind === "delete" && result.changed.length > 0) refreshSessionList(ctx);
					load({ keepNotice: true });
					setNotice(describeResult(action.kind, result));
				}).catch((caught) => {
					setError(caught instanceof Error ? caught.message : String(caught));
					setPending(null);
					setBusy(false);
				});
			};
			if (data === null && error === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: panel_module_css_default.empty,
				children: t("loading")
			});
			if (error !== null && data === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.error,
				role: "alert",
				children: [
					t("archivedLoadFailed"),
					": ",
					error,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: { marginTop: 8 },
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.button,
							onClick: () => {
								load();
							},
							children: t("retry")
						})
					})
				]
			});
			const list = data;
			const disabled = busy || list.readOnly || !list.writable;
			const pendingIds = new Set(pending?.ids ?? []);
			const pendingLoadedCount = rows.filter((row) => pendingIds.has(row.id) && row.loaded && !row.running).length;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: panel_module_css_default.intro,
					children: t("archivedIntro")
				}),
				!list.mounted && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.error,
					role: "alert",
					children: t("archivedUnavailable")
				}),
				list.mounted && !list.writable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.error,
					role: "alert",
					children: t("archivedNotWritable")
				}),
				list.readOnly && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.error,
					role: "alert",
					children: t("archivedReadOnly")
				}),
				list.listingFailed && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.error,
					role: "alert",
					children: t("archivedListingFailed")
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.toolbar,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: panel_module_css_default.checkRow,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "checkbox",
								checked: allSelected,
								disabled: rows.length === 0,
								"aria-label": t("archivedSelectAll"),
								onChange: toggleAll
							}), t("archivedSelectAll")]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: panel_module_css_default.desc,
							children: [
								t("archivedCount", { count: rows.length }),
								" · ",
								t("archivedTotalSize", { size: formatBytes(list.totalBytes) }),
								selected.length > 0 && ` · ${t("archivedSelected", { count: selected.length })}`
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.button,
							disabled: disabled || restorableSelected.length === 0,
							onClick: () => {
								setPending({
									kind: "restore",
									ids: restorableSelected
								});
							},
							children: t("archivedRestoreSelected")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: `${panel_module_css_default.button} ${panel_module_css_default.buttonDanger}`,
							disabled: disabled || !list.deleteEnabled || deletableSelected.length === 0,
							onClick: () => {
								setPending({
									kind: "delete",
									ids: deletableSelected
								});
							},
							children: t("archivedDeleteSelected")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: `${panel_module_css_default.button} ${panel_module_css_default.buttonDanger}`,
							disabled: disabled || !list.deleteEnabled || deletableAll.length === 0,
							onClick: () => {
								setPending({
									kind: "delete",
									ids: deletableAll
								});
							},
							children: t("archivedDeleteAll")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.button,
							disabled: busy,
							onClick: () => {
								load();
							},
							children: t("refresh")
						})
					]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: `${panel_module_css_default.groupSub} ${panel_module_css_default.mono}`,
					children: [
						t("archivedRoot"),
						": ",
						list.sessionsRoot
					]
				}),
				!list.deleteEnabled && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.note,
					children: t("archivedDeleteDisabled")
				}),
				notice !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.pill,
					children: notice
				}),
				error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.error,
					role: "alert",
					children: error
				}),
				pending !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: pending.kind === "delete" ? `${panel_module_css_default.confirmBar} ${panel_module_css_default.confirmBarDanger}` : panel_module_css_default.confirmBar,
					role: "alertdialog",
					"aria-label": t("archivedConfirm"),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: pending.kind === "delete" ? t("archivedConfirmDelete", { count: pending.ids.length }) : t("archivedConfirmRestore", { count: pending.ids.length }) }),
						pending.kind === "delete" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.note,
							children: t("archivedNote")
						}),
						pending.kind === "delete" && pendingLoadedCount > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.note,
							children: t("archivedLoadedWarning", { count: pendingLoadedCount })
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.editorActions,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.button,
								disabled: busy,
								onClick: () => {
									setPending(null);
								},
								children: t("archivedCancel")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: `${panel_module_css_default.button} ${pending.kind === "delete" ? panel_module_css_default.buttonDanger : panel_module_css_default.buttonPrimary}`,
								disabled: busy,
								onClick: () => {
									run(pending);
								},
								children: busy ? t("archivedWorking") : t("archivedConfirm")
							})]
						})
					]
				}),
				rows.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.empty,
					children: t("archivedEmpty")
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.skillList,
					children: rows.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ArchivedRowItem, {
						row,
						title: titles[row.id],
						checked: selectedSet.has(row.id),
						busy,
						readOnly: list.readOnly || !list.writable,
						deleteEnabled: list.deleteEnabled,
						onToggle: () => {
							toggleOne(row.id);
						},
						onRestore: () => {
							setPending({
								kind: "restore",
								ids: [row.id]
							});
						},
						onDelete: () => {
							setPending({
								kind: "delete",
								ids: [row.id]
							});
						}
					}, row.id))
				}),
				rows.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.note,
					children: t("archivedRefreshHint")
				})
			] });
		}
		/** One archived-session row. */
		function ArchivedRowItem(props) {
			const { row, title, checked, busy, readOnly, deleteEnabled, onToggle, onRestore, onDelete } = props;
			const facts = [];
			if (row.createdAt !== void 0) facts.push(t("archivedCreatedAt", { time: formatTime(row.createdAt) }));
			if (row.sizeBytes !== void 0) facts.push(formatBytes(row.sizeBytes));
			if (row.eventCount !== void 0) facts.push(t("archivedEvents", { count: row.eventCount }));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.archivedRow,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						type: "checkbox",
						checked,
						disabled: busy,
						"aria-label": title ?? row.id,
						onChange: onToggle
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.skillMain,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.skillName,
								children: title ?? (row.id !== "" ? row.id : t("archivedUntitled"))
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: `${panel_module_css_default.desc} ${panel_module_css_default.mono}`,
								children: row.id
							}),
							row.cwd !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: `${panel_module_css_default.desc} ${panel_module_css_default.mono}`,
								children: row.cwd
							}),
							facts.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.desc,
								children: facts.join(" · ")
							})
						]
					}),
					row.running && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: panel_module_css_default.badge,
						title: t("archivedRunningHint"),
						children: t("archivedRunning")
					}),
					!row.running && row.loaded && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: panel_module_css_default.badge,
						title: t("archivedLoadedHint"),
						children: t("archivedLoaded")
					}),
					!row.stored && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: panel_module_css_default.badge,
						children: t("archivedMissing")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.rowActions,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.button,
							disabled: busy || readOnly || !row.restorable,
							onClick: onRestore,
							children: t("archivedRestore")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: `${panel_module_css_default.button} ${panel_module_css_default.buttonDanger}`,
							disabled: busy || readOnly || !deleteEnabled || !row.deletable,
							onClick: onDelete,
							children: t("archivedDelete")
						})]
					})
				]
			});
		}
		/** Build the human-readable summary of one restore/delete result. */
		function describeResult(kind, result) {
			const parts = [kind === "delete" ? t("archivedDeleted", {
				count: result.changed.length,
				size: formatBytes(result.freedBytes)
			}) : t("archivedRestored", { count: result.changed.length })];
			if (result.skipped.length > 0) {
				const reasons = [...new Set(result.skipped.map((item) => item.reason))].join("；");
				parts.push(t("archivedSkipped", {
					count: result.skipped.length,
					reasons
				}));
			}
			if (result.staleSnapshot) parts.push(t("archivedStaleSnapshot"));
			if (result.warning !== void 0) parts.push(result.warning);
			return parts.join(" · ");
		}
		/**
		* Run one mutation over every id, sliced to the host's batch cap, and merge the
		* per-batch results. Batches run sequentially so a failure reports the work
		* already done instead of interleaving writes.
		* @param ids - target session ids (already unique).
		* @param size - maximum ids per call.
		* @param call - the API method to invoke per batch.
		* @returns the merged result of every completed batch.
		*/
		async function runInBatches(ids, size, call) {
			const merged = {
				ok: true,
				changed: [],
				skipped: [],
				archivedIds: [],
				freedBytes: 0,
				staleSnapshot: false
			};
			const warnings = [];
			for (let index = 0; index < ids.length; index += size) {
				const result = await call(ids.slice(index, index + size));
				merged.changed.push(...result.changed);
				merged.skipped.push(...result.skipped);
				merged.freedBytes += result.freedBytes;
				merged.archivedIds = result.archivedIds;
				merged.staleSnapshot = merged.staleSnapshot || result.staleSnapshot;
				if (result.warning !== void 0) warnings.push(result.warning);
			}
			if (warnings.length > 0) merged.warning = [...new Set(warnings)].join("；");
			return merged;
		}
		//#endregion
		//#region src/client/feature-registry.tsx
		/** The ordered feature list. */
		const FEATURES = [
			{
				id: "mcp",
				label: () => t("tabMcp"),
				Component: McpSection
			},
			{
				id: "skills",
				label: () => t("tabSkills"),
				Component: SkillsSection
			},
			{
				id: "rules",
				label: () => t("tabRules"),
				Component: RulesSection
			},
			{
				id: "archived",
				label: () => t("tabArchived"),
				Component: ArchivedSection
			}
		];
		//#endregion
		//#region src/client/panel.tsx
		/**
		* The "基础能力" settings section: a tab bar over the feature registry. Each
		* tab mounts its feature component inside the panel content column; the shell
		* supplies the section's `close` affordance (unused by the panel, which keeps
		* the settings shell open while the user works).
		*/
		function PanelSection(props) {
			const { ctx } = props;
			const [active, setActive] = (0, react.useState)(FEATURES[0]?.id ?? "");
			const Active = (FEATURES.find((item) => item.id === active) ?? FEATURES[0])?.Component;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.section,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: panel_module_css_default.intro,
						children: t("intro")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.tabs,
						role: "tablist",
						children: FEATURES.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							role: "tab",
							"aria-selected": item.id === active,
							className: item.id === active ? `${panel_module_css_default.tab} ${panel_module_css_default.tabActive}` : panel_module_css_default.tab,
							onClick: () => {
								setActive(item.id);
							},
							children: item.label()
						}, item.id))
					}),
					Active !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Active, { ctx })
				]
			});
		}
		//#endregion
		//#region src/client/index.tsx
		/** Services required before mounting (provided by the client runtime). */
		const inject = [
			"slots",
			"sessions",
			"locale"
		];
		/**
		* Client plugin body.
		* @param ctx - the client cordis context (slots, sessions, locale).
		*/
		function apply(ctx) {
			attachLocale(ctx.locale);
			ctx.effect(() => {
				const offZh = ctx.locale.register(LOCALE_NS, "zh", zh);
				const offEn = ctx.locale.register(LOCALE_NS, "en", en);
				return () => {
					offZh();
					offEn();
				};
			}, "dsh-basics-panel: dictionaries");
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "basics-panel",
				order: 200,
				label: () => t("nav"),
				inject: () => ({ ctx })
			}, PanelSection));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client-registry.js.map