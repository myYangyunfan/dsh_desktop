window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-plugin-manager",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const react = require("react");
		const { jsx, jsxs } = require("react/jsx-runtime");

		const L = {
			tab: "管理",
			tabHint: "搜索插件、点击分类标签过滤；配套/其他插件可一键关闭，完全退出并重启 DSH Desktop 后生效。",
			searchPlaceholder: "搜索插件（名称 / id / 描述）…",
			viewCompact: "简洁",
			viewDetail: "详情",
			catAll: "全部",
			groupCompanion: "配套插件",
			groupOther: "其他插件",
			groupCore: "核心组件",
			groupRemoved: "已卸载（可恢复）",
			groupToggleableNote: "可开关",
			groupReadonlyNote: "不可关闭",
			groupRemovedNote: "重启后不再加载",
			groupUpdateable: "可更新",
			groupUpdateableNote: "检测到新版可升级",
			descFallback: "（无描述）",
			badgeEnabled: "已启用",
			badgeDisabled: "已关闭",
			badgePending: "重启后生效",
			badgeFailed: "挂载失败",
			badgePendingLoad: "加载中",
			uninstalledTag: "已卸载",
			loading: "加载中…",
			errorPrefix: "插件清单加载失败：",
			noBridge: "插件管理桥接不可用（请确认已更新到最新版 DSH Desktop）",
			toastFailed: "操作失败：",
			refresh: "刷新",
			noMatch: "没有匹配的插件",
			localOnlyHint: "（清单来自本地文件，实时注册表暂不可用）",
			countSuffix: "个插件",
			checkUpdates: "检查更新",
			checking: "检查更新中…",
			updateAvailable: "可更新",
			upToDate: "已是最新",
			updateBtn: "更新",
			updating: "更新中…",
			updateDone: "已更新，重启后生效",
			updateFailed: "更新失败：",
			updateNoSources: "当前没有可独立更新的插件（其余插件随应用更新）",
			updateFollowsApp: "随应用更新",
			uninstallBtn: "卸载",
			uninstallConfirm: "确认卸载？",
			uninstallDone: "已卸载，重启后生效",
			restoreBtn: "恢复",
			restoreDone: "已恢复，重启后生效",
			actionFailed: "操作失败：",
			// 诊断与备份区块
			diagTitle: "诊断与管理",
			diagHint: "诊断当前 profile 的健康状况；备份/恢复配置（不含插件包与对话记录）。全部为本地操作，不会上传任何数据。",
			diagRun: "运行诊断",
			diagRunning: "诊断中…",
			diagOk: "未发现问题 ✓",
			diagErrors: "错误",
			diagWarnings: "警告",
			diagInfos: "信息",
			diagEmpty: "无",
			diagFail: "诊断运行失败：",
			diagSelfHealTitle: "最近启动自愈",
			diagSelfHealRemoved: "已自动移出启动清单 {0}",
			diagSelfHealDisabled: "已自动禁用 {0}",
			diagSelfHealReset: "已重置补丁配置 {0}",
			backupTitle: "备份配置",
			backupExport: "导出备份…",
			backupExporting: "导出中…",
			backupDone: "已导出备份（{0} 个文件）",
			backupCanceled: "已取消导出",
			backupFail: "导出失败：",
			restoreTitle: "恢复配置",
			restorePick: "选择备份文件恢复…",
			restorePicking: "等待选择…",
			restorePreview: "确认恢复以下内容？",
			restorePreviewFiles: "共 {0} 个文件（{1}）",
			restoreSecretWarn: "⚠ 备份含密钥/敏感配置（settings.yaml / .credentials.yaml 等），恢复将覆盖当前配置。",
			restoreConfirm: "确认恢复",
			restoreAbort: "取消",
			restoreDone2: "已恢复 {0} 个文件，完全退出并重启后生效",
			restoreCanceled: "已取消恢复",
			restoreFail: "恢复失败（已自动回滚）：",
			restartHint: "备份/恢复/诊断均为本地操作，不会上传任何数据。",
			diagLogTitle: "导出诊断日志包",
			diagLogExport: "导出日志包…",
			diagLogExporting: "导出中…",
			diagLogDone: "已导出诊断日志包 （含诊断报告与日志尾部，路径已打码）",
			diagLogCanceled: "已取消导出日志包",
			diagValidTitle: "防砖体检",
			diagValidRun: "体检已安装插件…",
			diagValidRunning: "体检中…",
			diagValidFail: "体检运行失败：",
			diagValidOk: "未发现会导致启动失败的问题 ✓",
			diagValidSummary: "已检查 {0} 个插件包：{1} 个错误，{2} 个警告",
			diagValidConflict: "跨包重复的 loader 条目 id「{0}」（{1}）：下次启动可能失败（duplicate loader entry id）",
			diagValidManifestFail: "无法读取启动清单（profile/package.json），体检结果不可信：",
			diagRemoveBtn: "一键移除失效条目",
			diagRemoveConfirm: "确认移除 {0} 个失效条目？（备份后从启动清单移除，重启生效）",
			diagRemoveDone: "已从启动清单移除：{0}",
			diagOrderTitle: "Bundle 顺序",
			diagOrderHint: "官方内置 bundle 位置固定；社区 bundle 按声明规则与依赖自动排序。",
			diagOrderRun: "检测顺序…",
			diagOrderRunning: "检测中…",
			diagOrderOk: "当前顺序满足所有声明规则 ✓",
			diagOrderConflictN: "{0} 个顺序冲突",
			diagOrderApply: "应用建议顺序",
			diagOrderApplying: "应用中…",
			diagOrderApplied: "已应用建议顺序，重启后生效",
			diagOrderCycle: "规则/依赖存在循环，无法自动排序：",
			diagOrderRestart: "顺序变更需完全退出并重启后生效。",
			// 后端服务健康（组合完整性运行期探测）
			healthTitle: "后端服务健康",
			healthHint: "实时读取内核 Loader 条目（pluginInventory），检测凭据 / 会话 / 模型 / 网关等关键后端服务的挂载状态。缺席通常意味着启动时被静默隔离，会以「保存 key 报错」「会话不保存」等形式延迟暴露——这里让它提前可见。",
			healthRun: "重新检测",
			healthRunning: "检测中…",
			healthOk: "关键后端服务全部在位 ✓",
			healthMissing: "缺席",
			healthFailed: "挂载失败",
			healthDisabled: "已被禁用",
			healthFix: "修复指引：完全退出并重启 DSH Desktop（启动链会自动修复 / 重装缺失组件）。若重启后仍缺席，请在下方「导出诊断日志包」并随反馈附上。",
			healthError: "检测失败：",
			healthNoChannel: "内核插件清单通道不可用（请确认已更新到最新版 DSH Desktop）",
			// 已移除服务提示（issue #176：插件 inject 了运行态不存在的服务 → 永久 pending）
			removedTitle: "已移除的内核服务（插件适配指引）",
			removedHint: "部分老插件的 inject 仍依赖已被新内核移除的服务；这类插件会一直停留在「等待生效(pending)」且不报错。若某插件长期 pending 且依赖下列服务，即为根因。",
			removedSvcPrefix: "依赖已移除服务",
			removedUseInstead: "请作者改用",
			removedPendingNone: "当前没有长期停留在 pending 的插件。",
			removedPendingCount: "检测到 {0} 个插件停留在「等待生效(pending)」：",
			// 无效条目体检（cordis.patch.yml 死条目横幅 + 一键清理；桥缺方法时整块静默隐藏）
			deadScanTitle: "检测到 {0} 条无效插件条目（包不存在）：",
			deadStaleTitle: "另有 {0} 条疑似陈旧的禁用记录（只提示，不参与清理）：",
			deadCleanBtn: "清理",
			deadCleaning: "清理中…",
			deadCleanDone: "已清理，完全退出重启 DSH Desktop 后生效"
		};

		// 关键后端服务清单（运行期形态）：id = 组合 yml 的行 id（loader entryId），
		// module = 行声明的包名（entryId 带嵌套前缀时的兜底匹配键）。
		// 与 scripts/integration/composition-integrity.js 的 criticalServices() 保持
		// 同一职责口径（缺席后果文案一致）；此处仅保留有独立 loader 条目的行
		// （dsh-base / dsh-web-app 两个受保护 bundle 容器在运行期没有条目）。
		const CRITICAL_RUNTIME = [
			{ id: "credentials", module: "@deepseek-ai/dsh-credentials-local", label: "凭据服务", consequence: "保存 / 读取 API key 失败（保存 key 时报 \"credentials service is absent\"）" },
			{ id: "settings", module: "@deepseek-ai/dsh-settings-file", label: "设置文档", consequence: "设置读写失效：模型页 / 偏好保存后不生效或报错" },
			{ id: "llm", module: "@deepseek-ai/dsh-llm", label: "模型调用核心", consequence: "所有模型请求无法发起，对话不可用" },
			{ id: "llm-deepseek", module: "@deepseek-ai/dsh-llm-deepseek", label: "DeepSeek 模型路由", consequence: "官方 DeepSeek 模型全部不可用" },
			{ id: "session", module: "@deepseek-ai/dsh-session", label: "会话域", consequence: "会话创建 / 派发失效，无法开始任何对话" },
			{ id: "session-persistence-jsonl", module: "@deepseek-ai/dsh-session-persistence-jsonl", label: "会话落盘", consequence: "会话不持久化：重启后全部历史丢失" },
			{ id: "sandbox", module: "@deepseek-ai/dsh-sandbox-local", label: "文件边界", consequence: "沙箱判定失效，文件操作权限边界不可用" },
			{ id: "approval", module: "@deepseek-ai/dsh-user-approval", label: "权限审批", consequence: "工具调用的用户审批（允许 / 拒绝）流程失效" },
			{ id: "storage-json", module: "@deepseek-ai/dsh-storage-json", label: "本地存储", consequence: "本地键值存储失效，依赖 storage 域的功能不保存" },
			{ id: "webserver", module: "@deepseek-ai/dsh-host-webserver", label: "本地服务端口", consequence: "页面端口不监听：白屏 / 一直加载" },
			// issue #175：网关行的旧键（api-gateway / @deepseek-ai/dsh-host-apiproxy）是
			// 重构前命名——被移除的是宿主服务 apiProxy（见下方 REMOVED_CAPABILITIES），
			// 网关这一 loader 行本身仍在组合里，只是改名/改包：
			//   node_modules/@deepseek-ai/dsh-base/cordis.patch.yml:45-46
			//     - id: typert-gateway / name: '@deepseek-ai/dsh-api-gateway'
			// 用旧键查 live 注册表永远缺席 → 永久误报红条；删掉该行又会丢掉对网关的
			// 真实监控（真挂了就报绿）。故按实际挂载键修正，与 composition-integrity.js
			// CRITICAL_SERVICES 的 typert-gateway 行（同 label / consequence 口径）对齐。
			{ id: "typert-gateway", module: "@deepseek-ai/dsh-api-gateway", label: "API 网关", consequence: "前后端 RPC 全部哑火，页面所有操作报错" },
			{ id: "plugin-inventory", module: "@deepseek-ai/dsh-host-plugin-inventory", label: "插件清单服务", consequence: "插件清单 / 健康页无数据" },
			{ id: "modules", module: "@deepseek-ai/dsh-client-modules", label: "前端模块表", consequence: "浏览器模块表（window.__DSH_BOOT__）缺失，页面空白" },
			{ id: "connection", module: "@deepseek-ai/dsh-client-connection", label: "前后端传输", consequence: "fetch / SSE 传输断开，页面无法与后端通信" },
			{ id: "web-runtime", module: "@deepseek-ai/dsh-web-app", label: "Web 运行时", consequence: "Web 运行时未挂载，页面无法完成启动" }
		];

		// 已从内核移除的服务登记表（与 scripts/integration/service-absence.js 的
		// REMOVED_SERVICES 保持同源口径；此处只用于 UI 展示适配指引，不参与关键判定）。
		// issue #176：插件若 inject 下列服务，会永远 pending 且无报错。
		const REMOVED_CAPABILITIES = [
			{
				service: "apiProxy",
				label: "API Proxy 服务",
				removedIn: "0.1.2-alpha.5",
				useInstead: ["typertGateway", "webServer"],
				note: "新内核已将 API Proxy 的一元操作下沉到各自的 Remote 归属服务（会话 / 设置 / 凭据 / 模型 / 命令 / 工作区等），统一经 typertGateway 传输；不再有名为 apiProxy 的宿主服务。",
			},
		];

		function bridge() {
			const b = window.dshDesktop;
			if (!b || !b.pluginManager || typeof b.pluginManager.list !== "function") return null;
			return b.pluginManager;
		}

		function diagBridge() {
			const b = window.dshDesktop;
			if (!b || !b.diagBackup) return null;
			return b.diagBackup;
		}

		const badge = (text, color) => jsx("span", {
			style: { fontSize: 11, padding: "1px 8px", borderRadius: 8, border: "1px solid currentColor", color, marginLeft: 6, whiteSpace: "nowrap" },
			children: text
		});

		// 简洁视图卡片网格的窄屏适配（与官方清单页同款：≤680px 收成单列）。
		const PM_CSS_ID = "@deepseek-ai/dsh-plugin-manager/compact-grid.css";
		if (typeof document !== "undefined" && !document.querySelector("style[data-plugin-css=\"" + PM_CSS_ID + "\"]")) {
			const st = document.createElement("style");
			st.dataset.plugin = "@deepseek-ai/dsh-plugin-manager";
			st.dataset.pluginCss = PM_CSS_ID;
			st.textContent = "@media (width <= 680px){.dshpm-cards{grid-template-columns:minmax(0,1fr) !important}}";
			document.head.appendChild(st);
		}

		/** 包名短名（去掉 @scope/ 前缀，如 @deepseek-ai/dsh-balance → dsh-balance）。 */
		const pkgShort = (name) => {
			const s = String(name || "");
			const i = s.indexOf("/");
			return i >= 0 ? s.slice(i + 1) : s;
		};

		/** 迷你开关（简洁视图卡片用）。 */
		const switchControl = (row, on, onToggle, pending) => {
			const disabled = !row.toggleable || pending;
			return jsx("button", {
				type: "button",
				role: "switch",
				"aria-checked": on,
				"aria-label": row.id,
				disabled,
				onClick: (e) => { if (e && e.stopPropagation) e.stopPropagation(); onToggle(row, !on); },
				style: {
					position: "relative",
					width: 32,
					height: 18,
					borderRadius: 999,
					border: "1px solid " + (on ? "var(--dsw-alias-state-success-primary, #4caf7d)" : "var(--dsw-alias-border-l2, rgba(128,128,128,0.35))"),
					background: on ? "color-mix(in srgb, var(--dsw-alias-state-success-primary, #4caf7d) 30%, transparent)" : "transparent",
					cursor: row.toggleable ? "pointer" : "not-allowed",
					flex: "none",
					padding: 0,
					opacity: disabled ? 0.55 : 1
				},
				children: jsx("span", {
					style: {
						position: "absolute",
						top: 2,
						left: on ? 18 : 2,
						width: 12,
						height: 12,
						borderRadius: 999,
						background: on ? "var(--dsw-alias-state-success-primary, #4caf7d)" : "var(--dsw-alias-label-tertiary, rgba(128,128,128,0.6))",
						transition: "left .14s var(--ds-ease-in-out, ease)"
					}
				})
			});
		};

		/** 归一化 live 注册表返回：可能 {ok,value} / {entries} / 数组。 */
		function normalizeLive(result) {
			if (Array.isArray(result)) return result;
			if (result && Array.isArray(result.entries)) return result.entries;
			if (result && result.ok && Array.isArray(result.value)) return result.value;
			if (result && result.ok && result.value && Array.isArray(result.value.entries)) return result.value.entries;
			return null;
		}

		function PluginManagerTab({ list }) {
			const [rows, setRows] = react.useState(null);
			const [error, setError] = react.useState(null);
			const [localOnly, setLocalOnly] = react.useState(false);
			const [pendingId, setPendingId] = react.useState(null);
			// 乐观 UI：点击立即反映到勾选框与「重启后生效」标记（id → 期望值）
			const [pendingMap, setPendingMap] = react.useState({});
			const [query, setQuery] = react.useState("");
			const [view, setView] = react.useState("detail"); // compact | detail
			const [cat, setCat] = react.useState("all"); // all | updateable | companion | other | core | removed
			const [refreshTick, setRefreshTick] = react.useState(0);
			// 更新检查结果：id → {current, latest, hasUpdate, source, applied?}
			const [updateMap, setUpdateMap] = react.useState(null);
			const [checkingUpdates, setCheckingUpdates] = react.useState(false);
			const [updatingId, setUpdatingId] = react.useState(null);
			// 简洁卡片展开详情（点击卡片切换；null = 全部收起）
			const [expanded, setExpanded] = react.useState(null);
				// 卸载两步确认（id → true 表示已点过一次，等待再点确认）
				const [uninstallArmed, setUninstallArmed] = react.useState(null);
				// 无效条目体检（cordis.patch.yml 死条目）：null=未扫描/无死条目
				const [deadScan, setDeadScan] = react.useState(null);
				const [cleaningDead, setCleaningDead] = react.useState(false);
				// 操作结果提示条（成功/失败均走这里，避免借用 error 区）
				const [actionMsg, setActionMsg] = react.useState(null);

			react.useEffect(() => {
				let cancelled = false;
				(async () => {
					setError(null);
					// 1) 本地桥：完整（配套/用户/核心 bundle）+ 描述 + 可开关集合 —— 主数据源
					const b = bridge();
					let mine = [];
					if (b && typeof b.list === "function") {
						try {
							const data = await b.list();
							if (Array.isArray(data)) mine = data;
						} catch (err) {
							console.error("[dsh-plugin-manager] 本地桥 list 失败:", err);
						}
					}
					// 2) live 注册表：尽力补充（核心组件全集），失败不阻塞
					let live = [];
					let liveOk = false;
					try {
						const raw = await list();
						const entries = normalizeLive(raw);
						if (entries) { live = entries; liveOk = true; }
						else console.warn("[dsh-plugin-manager] live list 返回异常形状:", raw);
					} catch (err) {
						console.warn("[dsh-plugin-manager] live list 失败（降级本地清单）:", err);
					}
					if (cancelled) return;

					const toggleableById = new Map(mine.filter((r) => r && r.toggleable).map((r) => [r.id, r]));
					const descById = new Map(mine.map((r) => [r.id, r.description]));
					const liveIds = new Set(live.filter((e) => e && e.entryId !== void 0).map((e) => e.entryId));
					const byId = new Map();
					for (const r of mine) {
						// live 可用时：本地推导的占位核心行（manifest 包名 ≠ 真实 loader 条目 id，
						// 如 dsh-web-app → web-runtime）不展示，避免与「全部」标签对不上；
						// 可开关行即使当前未加载（如已禁用的 balance）也必须展示，否则无法重新打开；
						// 已卸载行（removed）同理必须展示（提供「恢复」入口）。
						if (liveOk && !r.toggleable && !r.removed && !liveIds.has(r.id)) continue;
						if (!byId.has(r.id)) byId.set(r.id, {
							id: r.id,
							title: r.name || r.id,
							enabled: !!r.enabled,
							phase: "",
							description: r.description || "",
							toggleable: !!r.toggleable,
							group: r.group || (r.toggleable ? "companion" : "core"),
							removed: !!r.removed,
							hasConfig: !!r.hasConfig,
							from: "local"
						});
					}
					for (const e of live) {
						if (!e || typeof e !== "object" || e.entryId === void 0) continue;
						const row = byId.get(e.entryId);
						if (row) {
							row.enabled = !!e.enabled;
							row.phase = e.fiberPhase || row.phase;
						} else {
							byId.set(e.entryId, {
								id: e.entryId,
								title: e.moduleName || e.entryId,
								enabled: !!e.enabled,
								phase: e.fiberPhase || "",
								description: descById.get(e.entryId) || "",
								toggleable: toggleableById.has(e.entryId),
								group: toggleableById.has(e.entryId) ? "companion" : "core",
								removed: false,
								hasConfig: false,
								from: "live"
							});
						}
					}
					const mapped = [...byId.values()].sort((a, b) => {
						const ga = a.toggleable ? 0 : 1, gb = b.toggleable ? 0 : 1;
						return ga - gb || a.title.localeCompare(b.title);
					});
					if (!cancelled) {
						setRows(mapped);
						setLocalOnly(!liveOk && mapped.length > 0);
					}
					// 3) 无效条目体检（可选链：桥/壳缺方法即 undefined；失败与取消
					//    一律静默降级——横幅是增强面，绝不阻塞插件清单）。
					try {
						const scan = await (b && b.listDeadEntries?.());
						if (!cancelled && scan && scan.ok) setDeadScan(scan);
					} catch (err) {
						console.warn("[dsh-plugin-manager] 无效条目体检失败（降级隐藏）:", err);
					}
				})();
				return () => { cancelled = true; };
			}, [list, refreshTick]);

			const onToggle = (row, enabled) => {
				const b = bridge();
				if (!b || !row || !row.toggleable) return;
				// 1) 立即反映到 UI（打勾/取消 + 「重启后生效」标记）
				setPendingMap((prev) => ({ ...prev, [row.id]: enabled }));
				setPendingId(row.id);
				// 2) 写盘（失败则回滚 UI 并提示）
				b.setEnabled(row.id, enabled).then((res) => {
					setPendingId(null);
					if (res && res.ok) {
						// pendingMap 保留：重启前一直显示新状态 + 标记
					} else {
						setPendingMap((prev) => {
							const next = { ...prev };
							delete next[row.id];
							return next;
						});
						setError(L.toastFailed + String((res && res.error) || "未知错误"));
					}
				}).catch((err) => {
					setPendingId(null);
					setPendingMap((prev) => {
						const next = { ...prev };
						delete next[row.id];
						return next;
					});
					setError(L.toastFailed + String((err && err.message) || err));
				});
			};

			/** 行当前显示值：有未生效的点击 → 新值；否则实际状态。 */
			const rowValue = (row) => (row.id in pendingMap ? pendingMap[row.id] : row.enabled);
			const rowDirty = (row) => row.id in pendingMap;
			const rowCat = (row) => (row.group === "removed" ? "removed" : row.group || (row.toggleable ? "companion" : "core"));

			/** 是否可更新（检查过且官方有新版本，且尚未更新成功）。 */
			const isUpdateable = (row) => !!updateMap && !!updateMap[row.id] && !!updateMap[row.id].hasUpdate && !updateMap[row.id].applied;

			/** 检查更新（npm 官方+镜像 / GitHub 官方+镜像）。 */
			const doCheckUpdates = () => {
				const b = bridge();
				if (!b || !b.checkUpdates || checkingUpdates) return;
				setCheckingUpdates(true);
				setActionMsg(null);
				b.checkUpdates().then((res) => {
					setCheckingUpdates(false);
					if (!res || !res.ok) {
						setActionMsg(L.updateFailed + String((res && res.error) || "未知错误"));
						return;
					}
					const list = Array.isArray(res.items) ? res.items : [];
					const map = {};
					for (const it of list) map[it.id] = it;
					setUpdateMap(map);
					const n = list.filter((it) => it.hasUpdate).length;
					if (list.length === 0) {
						setActionMsg(L.updateNoSources);
					} else {
						setActionMsg("检查完成：" + (n > 0 ? n + " 个可更新，" : "") + (list.length - n) + " 个已是最新；其余插件随应用更新");
						// 有可更新项时自动切到「可更新」分类，避免在长列表里找
						if (n > 0) setCat("updateable");
					}
				}).catch((err) => {
					setCheckingUpdates(false);
					setActionMsg(L.updateFailed + String((err && err.message) || err));
				});
			};

			/** 更新单个插件：成功后打上「已更新」标记，重启后生效。 */
			const doUpdate = (row) => {
				const b = bridge();
				if (!b || !b.update || updatingId) return;
				setUpdatingId(row.id);
				setActionMsg(null);
				b.update(row.id).then((res) => {
					setUpdatingId(null);
					if (res && res.ok) {
						setUpdateMap((prev) => ({ ...prev, [row.id]: { ...(prev[row.id] || {}), applied: res.version || true } }));
						setActionMsg(L.updateDone + (res.version ? "（v" + res.version + "）" : ""));
					} else {
						setActionMsg(L.updateFailed + String((res && res.error) || "未知错误"));
					}
				}).catch((err) => {
					setUpdatingId(null);
					setActionMsg(L.updateFailed + String((err && err.message) || err));
				});
			};

			/** 卸载（两步确认）或恢复：成功后刷新清单。 */
			const doUninstall = (row) => {
				if (uninstallArmed !== row.id) { setUninstallArmed(row.id); return; }
				setUninstallArmed(null);
				const b = bridge();
				if (!b || !b.uninstall) return;
				b.uninstall(row.id).then((res) => {
					if (res && res.ok) {
						setActionMsg(L.uninstallDone);
						setRefreshTick((t) => t + 1);
					} else {
						setActionMsg(L.actionFailed + String((res && res.error) || "未知错误"));
					}
				}).catch((err) => setActionMsg(L.actionFailed + String((err && err.message) || err)));
			};

			const doRestore = (row) => {
				const b = bridge();
				if (!b || !b.restore) return;
				b.restore(row.id).then((res) => {
					if (res && res.ok) {
						setActionMsg(L.restoreDone);
						setRefreshTick((t) => t + 1);
					} else {
						setActionMsg(L.actionFailed + String((res && res.error) || "未知错误"));
					}
				}).catch((err) => setActionMsg(L.actionFailed + String((err && err.message) || err)));
			};

			/** 一键清理死条目（备份 + 原子写在壳侧完成，壳侧只清理仍判死的 id；
			 *  成功后刷新清单并重扫横幅，提示重启生效）。 */
			const doCleanDead = () => {
				const b = bridge();
				const ids = deadScan && Array.isArray(deadScan.dead) ? deadScan.dead.map((d) => d.id) : [];
				if (!b || !b.removeDeadEntries || cleaningDead || ids.length === 0) return;
				setCleaningDead(true);
				b.removeDeadEntries(ids).then((res) => {
					setCleaningDead(false);
					if (res && res.ok) {
						setDeadScan(null);
						setActionMsg(L.deadCleanDone);
						setRefreshTick((t) => t + 1);
					} else {
						setActionMsg(L.actionFailed + String((res && res.error) || "未知错误"));
					}
				}).catch((err) => {
					setCleaningDead(false);
					setActionMsg(L.actionFailed + String((err && err.message) || err));
				});
			};

			const matches = (row) => {
				if (!query) return true;
				const q = query.toLowerCase();
				return (row.title + " " + row.id + " " + row.description).toLowerCase().includes(q);
			};

			const phaseBadge = (row) => {
				if (row.phase === "failed") return badge(L.badgeFailed, "var(--dsw-alias-state-error-primary, #ff7a85)");
				if (row.phase === "loading" || row.phase === "pending") return badge(L.badgePendingLoad, "var(--dsw-alias-state-info-primary, #5b9bd5)");
				return null;
			};

			/** 行显示名：名称（可读 id）+ 包名（moduleName/package）；匿名 id 退化为只显包名。 */
			const rowName = (row) => (/^[0-9a-f]{8}$/i.test(row.id) ? null : row.id);
			const rowPkg = (row) => row.title;

			/** 简洁视图卡片：单行（名称 + 圆点 + 开关），点击展开详情与操作。 */
			const renderCompactCard = (row) => {
				const on = rowValue(row);
				const failed = row.phase === "failed";
				const removed = rowCat(row) === "removed";
				const isOpen = expanded === row.id;
				const upd = updateMap && updateMap[row.id];
				const dotColor = failed
					? "var(--dsw-alias-state-error-primary, #ff7a85)"
					: on
						? "var(--dsw-alias-state-success-primary, #4caf7d)"
						: "var(--dsw-alias-label-tertiary, rgba(128,128,128,0.5))";
				const name = rowName(row) || rowPkg(row);
				const short = rowName(row) ? pkgShort(rowPkg(row)) : null;
				return jsxs("div", {
					key: row.id,
					onClick: () => setExpanded(isOpen ? null : row.id),
					title: isOpen ? undefined : (row.description || L.descFallback),
					style: {
						display: "flex",
						flexDirection: "column",
						minWidth: 0,
						padding: "10px 12px",
						border: "1px solid " + (isOpen ? "var(--dsw-alias-border-l1, rgba(128,128,128,0.55))" : "var(--dsw-alias-border-l2, rgba(128,128,128,0.35))"),
						borderRadius: 10,
						background: "var(--dsw-alias-bg-layer-3, transparent)",
						cursor: "pointer",
						opacity: on ? 1 : 0.62,
						boxShadow: isOpen ? "var(--dsw-shadow-lv1, 0 4px 12px rgba(0,0,0,0.12))" : undefined
					},
					children: [
						jsxs("div", {
							style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 },
							children: [
								jsxs("span", {
									style: { display: "flex", alignItems: "baseline", minWidth: 0, overflow: "hidden" },
									children: [
										jsx("span", { style: { fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, children: name }),
										short ? jsx("span", { style: { fontSize: 11, opacity: 0.5, marginLeft: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, children: short }) : null,
										removed ? jsx("span", { style: { fontSize: 11, opacity: 0.55, marginLeft: 6 }, children: L.uninstalledTag }) : null
									]
								}),
								jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, flex: "none" }, children: [
									upd && upd.hasUpdate && !upd.applied && !removed
										? badge("↑ " + upd.latest, "var(--dsw-alias-state-info-primary, #5b9bd5)")
										: null,
									rowDirty(row) ? badge(L.badgePending, "var(--dsw-alias-state-info-primary, #5b9bd5)") : null,
									jsx("span", { style: { width: 7, height: 7, borderRadius: 999, background: dotColor, flex: "none" } }),
									switchControl(row, on, onToggle, pendingId === row.id)
								] })
							]
						}),
						isOpen ? jsxs("div", {
							style: { marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--dsw-alias-divider-weak, rgba(128,128,128,0.14))", display: "flex", flexDirection: "column", gap: 8 },
							children: [
								jsx("span", { style: { fontSize: 12, opacity: 0.7, lineHeight: 1.5 }, children: row.description || L.descFallback }),
								jsxs("div", { style: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }, children: [
									on ? badge(L.badgeEnabled, "var(--dsw-alias-state-success-primary, #4caf7d)") : badge(L.badgeDisabled, "var(--dsw-alias-state-warning-primary, #d99a3d)"),
									failed ? badge(L.badgeFailed, "var(--dsw-alias-state-error-primary, #ff7a85)") : null,
									upd && !upd.error ? (upd.hasUpdate && !upd.applied
										? badge(L.updateAvailable + " v" + upd.current + " → v" + upd.latest, "var(--dsw-alias-state-info-primary, #5b9bd5)")
										: (!upd.applied ? badge(L.upToDate + (upd.current ? " v" + upd.current : ""), "var(--dsw-alias-label-tertiary, rgba(128,128,128,0.6))") : null))
										: null,
									rowDirty(row) ? badge(L.badgePending, "var(--dsw-alias-state-info-primary, #5b9bd5)") : null
								] }),
								jsxs("div", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [
									row.group !== "core" && !row.hasConfig && !removed ? jsx("button", {
										type: "button",
										onClick: (e) => { e.stopPropagation(); doUninstall(row); },
										style: linkBtnStyle(uninstallArmed === row.id, false),
										children: uninstallArmed === row.id ? L.uninstallConfirm : L.uninstallBtn
									}) : null,
									removed && row.restorable !== false ? jsx("button", {
										type: "button",
										onClick: (e) => { e.stopPropagation(); doRestore(row); },
										style: linkBtnStyle(false, true),
										children: L.restoreBtn
									}) : null,
									upd && (upd.hasUpdate || upd.applied) && !removed ? jsx("button", {
										type: "button",
										disabled: !!updatingId,
										onClick: (e) => { e.stopPropagation(); doUpdate(row); },
										style: linkBtnStyle(false, true),
										children: upd.applied ? L.updateDone : (updatingId === row.id ? L.updating : L.updateBtn + " v" + upd.latest)
									}) : null
								] })
							]
						}) : null
					]
				});
			};

			/** 操作按钮（卸载两步确认 / 恢复 / 更新）小链接样式。 */
			const linkBtnStyle = (danger, accent) => ({
				fontSize: 11,
				padding: "2px 10px",
				borderRadius: 7,
				cursor: "pointer",
				whiteSpace: "nowrap",
				border: "1px solid " + (danger ? "var(--dsw-alias-state-error-primary, #ff7a85)" : "var(--dsw-alias-border-l2, rgba(128,128,128,0.35))"),
				color: danger ? "var(--dsw-alias-state-error-primary, #ff7a85)" : (accent ? "var(--dsw-alias-state-info-primary, #5b9bd5)" : "inherit"),
				background: "transparent"
			});

			/** 详情视图行：三段式（标题行 / 描述 / 操作行），信息有条理。 */
			const renderDetailRow = (row) => {
				const on = rowValue(row);
				const failed = row.phase === "failed";
				const removed = rowCat(row) === "removed";
				const upd = updateMap && updateMap[row.id];
				return jsxs("div", {
					key: row.id,
					style: { display: "flex", flexDirection: "column", gap: 5, padding: "10px 0", borderBottom: "1px solid var(--dsw-alias-divider-weak, rgba(128,128,128,0.16))", opacity: removed ? 0.62 : 1 },
					children: [
						jsxs("div", { style: { display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", minWidth: 0 }, children: [
							jsx("span", { style: { fontWeight: 600 }, children: rowName(row) || rowPkg(row) }),
							jsx("span", { style: { fontSize: 12, opacity: 0.55, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: rowPkg(row) }),
							on ? badge(L.badgeEnabled, "var(--dsw-alias-state-success-primary, #4caf7d)") : badge(L.badgeDisabled, "var(--dsw-alias-state-warning-primary, #d99a3d)"),
							phaseBadge(row),
							removed ? badge(L.uninstalledTag, "var(--dsw-alias-label-tertiary, rgba(128,128,128,0.6))") : null
						] }),
						jsx("span", { style: { fontSize: 12, opacity: 0.65, lineHeight: 1.5 }, children: row.description || L.descFallback }),
						jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginTop: 2 }, children: [
							jsxs("div", { style: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }, children: [
								rowDirty(row) ? badge(L.badgePending, "var(--dsw-alias-state-info-primary, #5b9bd5)") : null,
								upd && !upd.error && !upd.applied ? (upd.hasUpdate
									? badge(L.updateAvailable + " v" + upd.current + " → v" + upd.latest, "var(--dsw-alias-state-info-primary, #5b9bd5)")
									: badge(L.upToDate + (upd.current ? " v" + upd.current : ""), "var(--dsw-alias-label-tertiary, rgba(128,128,128,0.6))"))
									: null,
								upd && upd.applied ? badge(L.updateDone + (upd.applied !== true ? "（v" + upd.applied + "）" : ""), "var(--dsw-alias-state-success-primary, #4caf7d)") : null
							] }),
							jsxs("div", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [
								upd && (upd.hasUpdate || upd.applied) && !removed ? jsx("button", {
									type: "button",
									disabled: !!updatingId,
									onClick: () => doUpdate(row),
									style: linkBtnStyle(false, true),
									children: upd.applied ? L.updateDone : (updatingId === row.id ? L.updating : L.updateBtn + " v" + upd.latest)
								}) : null,
								row.group !== "core" && !row.hasConfig && !removed ? jsx("button", {
									type: "button",
									onClick: () => doUninstall(row),
									style: linkBtnStyle(uninstallArmed === row.id, false),
									children: uninstallArmed === row.id ? L.uninstallConfirm : L.uninstallBtn
								}) : null,
								removed && row.restorable !== false ? jsx("button", {
									type: "button",
									onClick: () => doRestore(row),
									style: linkBtnStyle(false, true),
									children: L.restoreBtn
								}) : null,
								switchControl(row, on, onToggle, pendingId === row.id)
							] })
						] })
					]
				});
			};

			const renderBody = () => {
				const emptyState = (t) => jsx("div", { style: { fontSize: 12, opacity: 0.6, marginTop: 12, padding: "18px 0", textAlign: "center", border: "1px dashed var(--dsw-alias-border-l2, rgba(128,128,128,0.3))", borderRadius: 10 }, children: t });
				if (error) return jsx("div", { style: { fontSize: 12, color: "var(--dsw-alias-state-error-primary, #ff7a85)", marginTop: 8 }, children: error });
				if (!rows) return jsx("div", { style: { fontSize: 12, opacity: 0.7, marginTop: 8 }, children: L.loading });
				const base = rows.filter(matches);
				if (base.length === 0) return emptyState(L.noMatch);
				const groups = {
					companion: base.filter((r) => rowCat(r) === "companion"),
					other: base.filter((r) => rowCat(r) === "other"),
					core: base.filter((r) => rowCat(r) === "core"),
					removed: base.filter((r) => rowCat(r) === "removed")
				};
				// 「可更新」分类只在真有更新项时有效：更新全部完成后自动回退到「全部」，避免停留在空分类
				const effCat = cat === "updateable" && !base.some(isUpdateable) ? "all" : cat;
				const shown = effCat === "all" ? base : effCat === "updateable" ? base.filter(isUpdateable) : groups[effCat];
				if (shown.length === 0) return emptyState(L.noMatch);
				const compact = view === "compact";
				const group = (title, note, items) => items.length === 0 ? null : jsxs("div", {
					children: [
						jsxs("div", { style: { display: "flex", alignItems: "baseline", gap: 8, margin: "14px 0 2px" }, children: [
							jsx("span", { style: { fontWeight: 600, fontSize: 13 }, children: title }),
							jsx("span", { style: { fontSize: 12, opacity: 0.55 }, children: note }),
							jsx("span", { style: { fontSize: 11, padding: "1px 8px", borderRadius: 999, border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.35))", opacity: 0.7 }, children: items.length })
						] }),
						compact
							? jsx("div", { className: "dshpm-cards", style: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, marginTop: 6 }, children: items.map(renderCompactCard) })
							: items.map(renderDetailRow)
					]
				});
				if (effCat !== "all") {
					const meta = { updateable: [L.groupUpdateable, L.groupUpdateableNote], companion: [L.groupCompanion, L.groupToggleableNote], other: [L.groupOther, L.groupToggleableNote], core: [L.groupCore, L.groupReadonlyNote], removed: [L.groupRemoved, L.groupRemovedNote] };
					const [title, note] = meta[effCat] || [effCat, ''];
					return group(title, note, shown);
				}
				return jsxs("div", {
					children: [
						group(L.groupCompanion, L.groupToggleableNote, groups.companion),
						group(L.groupOther, L.groupToggleableNote, groups.other),
						group(L.groupCore, L.groupReadonlyNote, groups.core),
						group(L.groupRemoved, L.groupRemovedNote, groups.removed)
					]
				});
			};

			/** 分类标签（可点击过滤）。 */
			const chipStyle = (active, hot) => ({
				fontSize: 12,
				padding: "3px 12px",
				borderRadius: 12,
				border: "1px solid " + (active || hot ? "var(--dsw-alias-state-info-primary, #5b9bd5)" : "var(--dsw-alias-border-l2, rgba(128,128,128,0.35))"),
				background: active || hot ? "color-mix(in srgb, var(--dsw-alias-state-info-primary, #5b9bd5) 12%, transparent)" : "transparent",
				color: active || hot ? "var(--dsw-alias-state-info-primary, #5b9bd5)" : "inherit",
				cursor: "pointer"
			});
			const chip = (key, label, count, hot) => jsx("button", {
				type: "button",
				key: key,
				onClick: () => setCat((c) => (c === key ? "all" : key)),
				style: chipStyle(cat === key, hot),
				children: label + " · " + count
			});

			const renderChips = () => {
				if (!rows) return null;
				const base = rows.filter(matches);
				const n = (k) => base.filter((r) => rowCat(r) === k).length;
				const updCount = base.filter(isUpdateable).length;
				return jsxs("div", { style: { display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }, children: [
					chip("all", L.catAll, base.length),
					updCount > 0 ? chip("updateable", L.groupUpdateable, updCount, true) : null,
					chip("companion", L.groupCompanion, n("companion")),
					chip("other", L.groupOther, n("other")),
					chip("core", L.groupCore, n("core")),
					chip("removed", L.groupRemoved, n("removed"))
				] });
			};

			/** 视图切换按钮（简洁 / 详情）：统一选中高亮样式。 */
			const viewBtn = (active, label, onClick) => jsx("button", {
				type: "button",
				onClick: onClick,
				style: { fontSize: 12, padding: "5px 12px", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap", border: "1px solid " + (active ? "var(--dsw-alias-state-info-primary, #5b9bd5)" : "var(--dsw-alias-border-l2, rgba(128,128,128,0.35))"), background: active ? "color-mix(in srgb, var(--dsw-alias-state-info-primary, #5b9bd5) 12%, transparent)" : "transparent", color: active ? "var(--dsw-alias-state-info-primary, #5b9bd5)" : "inherit" },
				children: label
			});
			const msgColor = /失败|错误/.test(actionMsg || "") ? "var(--dsw-alias-state-error-primary, #ff7a85)" : "var(--dsw-alias-state-info-primary, #5b9bd5)";
			// 有可更新项的个数（工具栏「检查更新」按钮据此高亮 + 显示数量）
			const updTotal = updateMap ? Object.values(updateMap).filter((it) => it && it.hasUpdate).length : 0;

			// 无效条目横幅（死条目一键清理；疑似陈旧禁用只透出）。
			const warnColor = "var(--dsw-alias-state-warning-primary, #d99a3d)";
			const deadList = deadScan && Array.isArray(deadScan.dead) ? deadScan.dead : [];
			const staleList = deadScan && Array.isArray(deadScan.stale) ? deadScan.stale : [];
			const deadBanner = deadList.length === 0 ? null : jsxs("div", {
				style: { fontSize: 12, marginTop: 8, padding: "8px 12px", borderRadius: 8, border: "1px solid " + warnColor, background: "color-mix(in srgb, " + warnColor + " 8%, transparent)", color: warnColor, display: "flex", flexDirection: "column", gap: 6 },
				children: [
					jsxs("div", { style: { fontWeight: 600 }, children: [
						"⚠ " + L.deadScanTitle.replace("{0}", String(deadList.length)),
						jsx("button", {
							type: "button",
							disabled: cleaningDead,
							onClick: doCleanDead,
							style: { fontSize: 12, padding: "2px 12px", marginLeft: 10, borderRadius: 7, cursor: cleaningDead ? "default" : "pointer", whiteSpace: "nowrap", border: "1px solid " + warnColor, background: "transparent", color: "inherit", opacity: cleaningDead ? 0.55 : 1 },
							children: cleaningDead ? L.deadCleaning : L.deadCleanBtn
						})
					] }),
					jsx("ul", { style: { margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 2 }, children: deadList.map((d, i) => jsxs("li", { style: { wordBreak: "break-all" }, children: [
						d.id,
						d.name && d.name !== d.id ? "（" + d.name + "）" : ""
					] }, i)) }),
					staleList.length > 0 ? jsx("div", { style: { opacity: 0.8 }, children: L.deadStaleTitle.replace("{0}", String(staleList.length)) + staleList.map((s) => s.id).join("、") }) : null
				]
			});

			return jsxs("div", { children: [
				jsx("span", { style: { fontSize: 12, opacity: 0.65 }, children: L.tabHint }),
				rows ? jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }, children: [
					jsx("input", {
						type: "search",
						placeholder: L.searchPlaceholder,
						value: query,
						onChange: (e) => setQuery(e.target.value),
						style: { flex: 1, maxWidth: 360, fontSize: 13, padding: "5px 10px", borderRadius: 8, border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.35))", background: "transparent", color: "inherit" }
					}),
					jsx("span", { style: { fontSize: 12, opacity: 0.6, whiteSpace: "nowrap" }, children: rows.length + " " + L.countSuffix }),
					jsxs("div", { style: { display: "flex", gap: 4, marginLeft: "auto", flexWrap: "wrap" }, children: [
						viewBtn(view === "compact", L.viewCompact, () => setView("compact")),
						viewBtn(view === "detail", L.viewDetail, () => setView("detail")),
						jsx("button", {
							type: "button",
							disabled: checkingUpdates,
							onClick: doCheckUpdates,
							style: { fontSize: 12, padding: "5px 12px", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap", border: "1px solid " + (checkingUpdates ? "var(--dsw-alias-border-l2, rgba(128,128,128,0.35))" : (updTotal > 0 ? "var(--dsw-alias-state-info-primary, #5b9bd5)" : "var(--dsw-alias-border-l2, rgba(128,128,128,0.35))")), background: checkingUpdates ? "transparent" : (updTotal > 0 ? "color-mix(in srgb, var(--dsw-alias-state-info-primary, #5b9bd5) 12%, transparent)" : "transparent"), color: checkingUpdates ? "inherit" : (updTotal > 0 ? "var(--dsw-alias-state-info-primary, #5b9bd5)" : "inherit") },
							children: checkingUpdates ? L.checking : (updTotal > 0 ? L.checkUpdates + " · " + updTotal : L.checkUpdates)
						}),
						jsx("button", {
							type: "button",
							onClick: () => setRefreshTick((v) => v + 1),
							style: { fontSize: 12, padding: "5px 12px", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap", border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.35))", background: "transparent", color: "inherit" },
							children: L.refresh
						})
					] })
				] }) : null,
				actionMsg ? jsx("div", { style: { fontSize: 12, marginTop: 8, padding: "6px 12px", borderRadius: 8, border: "1px solid " + msgColor, background: "color-mix(in srgb, " + msgColor + " 8%, transparent)", color: msgColor }, children: actionMsg }) : null,
				deadBanner,
				renderChips(),
				localOnly ? jsx("div", { style: { fontSize: 12, opacity: 0.6, marginTop: 6 }, children: L.localOnlyHint }) : null,
				renderBody()
			] });
		}

		/**
		 * 后端服务健康卡（组合完整性运行期探测）。
		 * 数据通道：内核 pluginInventory.list()（dsh-host-plugin-inventory 对
		 * Loader 条目的实时只读投影，含 fiberPhase）。判定：
		 *   条目缺席（missing）  —— Loader 故障隔离把激活失败的 entry 移出树，
		 *                          缺席即「credentials service is absent」类
		 *                          延迟暴露的静默前置形态；
		 *   fiberPhase=failed     —— 挂载失败但仍挂在树上；
		 *   enabled=false         —— 被用户层显式禁用（黄色提示，非红条）。
		 */
		function BackendHealthCard({ list }) {
			const [health, setHealth] = react.useState({ kind: "loading" });
			const [busy, setBusy] = react.useState(false);

			const detect = react.useCallback(() => {
				if (busy) return;
				setBusy(true);
				setHealth({ kind: "loading" });
				Promise.resolve()
					.then(() => (typeof list === "function" ? list() : Promise.reject(new Error(L.healthNoChannel))))
					.then((raw) => {
						const entries = normalizeLive(raw);
						if (!entries) throw new Error("unexpected inventory shape");
						// entryId / moduleName 双键索引（覆写行共享 id，取任一命中即可）。
						const byId = new Map();
						for (const e of entries) {
							if (!e || typeof e !== "object") continue;
							if (e.entryId !== void 0 && !byId.has(e.entryId)) byId.set(e.entryId, e);
							if (e.moduleName !== void 0 && !byId.has(e.moduleName)) byId.set(e.moduleName, e);
						}
						const problems = [];
						for (const c of CRITICAL_RUNTIME) {
							// entryId 优先；嵌套树前缀（group/id）场景按 moduleName 兜底。
							const e = byId.get(c.id) || (c.module ? byId.get(c.module) : void 0);
							if (!e) problems.push({ ...c, problem: L.healthMissing });
							else if (e.fiberPhase === "failed") problems.push({ ...c, problem: L.healthFailed });
							else if (e.enabled === false) problems.push({ ...c, problem: L.healthDisabled });
						}
						setBusy(false);
						setHealth(problems.length === 0 ? { kind: "ok", checked: CRITICAL_RUNTIME.length } : { kind: "bad", problems });
					})
					.catch((err) => {
						setBusy(false);
						setHealth({ kind: "error", message: String((err && err.message) || err) });
					});
			}, [busy, list]);

			// 进入分区即自动检测一次：缺席要「永远可见」，不等用户手点。
			react.useEffect(() => {
				detect();
				// eslint-disable-next-line react-hooks/exhaustive-deps
			}, []);

			const errColor = "var(--dsw-alias-state-error-primary, #ff7a85)";
			const warnColor = "var(--dsw-alias-state-warning-primary, #d99a3d)";
			const okColor = "var(--dsw-alias-state-success-primary, #4caf7d)";
			const body = (() => {
				if (health.kind === "loading") return jsx("div", { style: { fontSize: 12, opacity: 0.6 }, children: L.healthRunning });
				if (health.kind === "error") return jsx("div", { style: { fontSize: 12, color: errColor, wordBreak: "break-all" }, children: "⛔ " + L.healthError + health.message });
				if (health.kind === "ok") return jsx("div", { style: { fontSize: 12, color: okColor }, children: L.healthOk });
				// bad：红条（缺席/挂载失败）或黄条（仅禁用）。
				const hard = health.problems.filter((p) => p.problem !== L.healthDisabled);
				const color = hard.length > 0 ? errColor : warnColor;
				return jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: [
					jsxs("div", { style: { fontSize: 12, fontWeight: 600, color, padding: "8px 10px", borderRadius: 8, border: "1px solid " + color, background: "color-mix(in srgb, " + color + " 10%, transparent)" }, children: [
						hard.length > 0 ? "⛔ " + L.healthMissing + " / " + L.healthFailed + "（" + hard.length + "）" : "⚠ " + L.healthDisabled + "（" + health.problems.length + "）"
					] }),
					jsx("ul", { style: { margin: 0, paddingLeft: 18, fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }, children: health.problems.map((p, i) => jsxs("li", { style: { wordBreak: "break-all" }, children: [
						jsx("span", { style: { fontWeight: 600, color: p.problem === L.healthDisabled ? warnColor : errColor }, children: "「" + p.label + "」" + p.problem + "：" }),
						jsx("span", { children: p.consequence })
					] }, i)) }),
					jsx("div", { style: { fontSize: 12, opacity: 0.75 }, children: L.healthFix })
				] });
			})();

			return jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: [
				jsx("span", { style: { fontSize: 13, fontWeight: 600 }, children: L.healthTitle }),
				jsx("div", { style: { fontSize: 11, opacity: 0.55 }, children: L.healthHint }),
				body,
				jsx("div", { children: jsx("button", {
					type: "button", disabled: busy, onClick: detect,
					style: { fontSize: 12, padding: "5px 12px", borderRadius: 8, cursor: busy ? "default" : "pointer", whiteSpace: "nowrap", border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.35))", background: "transparent", color: "inherit", opacity: busy ? 0.55 : 1 },
					children: busy ? L.healthRunning : L.healthRun
				}) })
			] });
		}

		/**
		 * 已移除服务提示卡（issue #176）。
		 * 纯展示 + 只读：从运行态清单（pluginInventory）统计长期 pending 的插件，
		 * 并列出内核已移除的服务与作者适配指引。不改动 BackendHealthCard 的关键
		 * 服务判定（CRITICAL_RUNTIME）——只新增一块自包含的提示，与 #175 无交叉。
		 */
		function RemovedServiceNoticeCard({ list }) {
			const [entries, setEntries] = react.useState(null);
			const [busy, setBusy] = react.useState(false);
			const detect = react.useCallback(() => {
				if (busy) return;
				setBusy(true);
				Promise.resolve()
					.then(() => (typeof list === "function" ? list() : null))
					.then((raw) => { const e = normalizeLive(raw); setEntries(Array.isArray(e) ? e : []); })
					.catch(() => setEntries([]))
					.finally(() => setBusy(false));
			}, [busy, list]);
			react.useEffect(() => { detect(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
			const warnColor = "var(--dsw-alias-state-warning-primary, #d99a3d)";
			const pending = (entries || []).filter((e) => e && e.fiberPhase === "pending");
			return jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: [
				jsx("div", { style: { fontSize: 11, opacity: 0.55 }, children: L.removedHint }),
				entries === null
					? jsx("div", { style: { fontSize: 12, opacity: 0.6 }, children: L.healthRunning })
					: pending.length === 0
						? jsx("div", { style: { fontSize: 12, color: "var(--dsw-alias-state-success-primary, #4caf7d)" }, children: L.removedPendingNone })
						: jsxs("div", { style: { fontSize: 12, color: warnColor }, children: [
							L.removedPendingCount.replace("{0}", String(pending.length)),
							jsx("ul", { style: { margin: "4px 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 2 }, children: pending.map((e, i) => jsx("li", { style: { wordBreak: "break-all" }, children: String(e.moduleName || e.entryId || "?") }, i)) }),
						] }),
				jsx("ul", { style: { margin: 0, paddingLeft: 18, fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }, children: REMOVED_CAPABILITIES.map((c, i) => jsxs("li", { style: { wordBreak: "break-all" }, children: [
					jsx("span", { style: { fontWeight: 600, color: warnColor }, children: "「" + c.label + "」" + L.removedSvcPrefix + "（" + c.service + "，自 " + c.removedIn + "）：" }),
					jsx("span", { children: c.note + " " + L.removedUseInstead + " " + c.useInstead.join(" / ") + "。" })
				] }, i)) }),
				jsx("div", { children: jsx("button", { type: "button", disabled: busy, onClick: detect, style: { fontSize: 12, padding: "5px 12px", borderRadius: 8, cursor: busy ? "default" : "pointer", whiteSpace: "nowrap", border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.35))", background: "transparent", color: "inherit", opacity: busy ? 0.55 : 1 }, children: busy ? L.healthRunning : L.healthRun }) })
			] });
		}

		/** 设置侧栏「诊断与管理」分区：后端服务健康 / 诊断 / 备份恢复 / 日志包导出 / 防砖体检 / bundle 顺序。 */
		function DiagSection({ list }) {
			const [diagReport, setDiagReport] = react.useState(null);
			const [diagBusy, setDiagBusy] = react.useState(false);
			const [bkBusy, setBkBusy] = react.useState(false);
			const [bkMsg, setBkMsg] = react.useState(null);
			const [restorePreview, setRestorePreview] = react.useState(null);
			const [validReport, setValidReport] = react.useState(null);
			const [validBusy, setValidBusy] = react.useState(false);
			const [validArmed, setValidArmed] = react.useState(false);
			const [orderReport, setOrderReport] = react.useState(null);
			const [orderBusy, setOrderBusy] = react.useState(false);
			const [orderApplied, setOrderApplied] = react.useState(false);

			/** 运行诊断：主进程扫描 patch/bundles/日志/崩溃转储，返回分级报告。 */
			const doRunDiag = () => {
				const d = diagBridge();
				if (!d || !d.runDiagnostics || diagBusy) return;
				setDiagBusy(true);
				d.runDiagnostics().then((res) => {
					setDiagBusy(false);
					if (res && res.ok && res.report) setDiagReport(res.report);
					else setDiagReport({ ok: false, errors: [L.diagFail + String((res && res.error) || "未知错误")], warnings: [], infos: [] });
				}).catch((err) => {
					setDiagBusy(false);
					setDiagReport({ ok: false, errors: [L.diagFail + String((err && err.message) || err)], warnings: [], infos: [] });
				});
			};

			// 进入「诊断与管理」即自动跑一次诊断：诊断结果（含「最近启动自愈」
			// 蓝色条）立即可见，不用等用户手动点「运行诊断」。
			react.useEffect(() => {
				doRunDiag();
				// eslint-disable-next-line react-hooks/exhaustive-deps
			}, []);

			/** 导出备份：弹保存对话框，主进程生成 JSON 备份文件。 */
			const doExportBackup = () => {
				const d = diagBridge();
				if (!d || !d.exportBackup || bkBusy) return;
				setBkBusy(true);
				d.exportBackup().then((res) => {
					setBkBusy(false);
					if (res && res.ok) {
						const base = L.backupDone.replace("{0}", String(res.files));
						const secretN = Array.isArray(res.secretFiles) ? res.secretFiles.length : 0;
						setBkMsg(secretN > 0 ? base + "（含 " + secretN + " 个敏感文件，请妥善保管）" : base);
					}
					else if (res && res.canceled) setBkMsg(L.backupCanceled);
					else setBkMsg(L.backupFail + String((res && res.error) || "未知错误"));
				}).catch((err) => {
					setBkBusy(false);
					setBkMsg(L.backupFail + String((err && err.message) || err));
				});
			};

			/** 恢复流程第一步：选择备份文件并预览内容（主进程不写盘）。 */
			const doPickRestore = () => {
				const d = diagBridge();
				if (!d || !d.previewRestore || bkBusy) return;
				setBkBusy(true);
				d.previewRestore().then((res) => {
					setBkBusy(false);
					if (res && res.ok && res.preview) setRestorePreview(res.preview);
					else if (res && res.canceled) setBkMsg(L.restoreCanceled);
					else setBkMsg(L.restoreFail + String((res && res.error) || "未知错误"));
				}).catch((err) => {
					setBkBusy(false);
					setBkMsg(L.restoreFail + String((err && err.message) || err));
				});
			};

			/** 恢复流程第二步：用主进程签发的一次性令牌确认写入。 */
			const doConfirmRestore = () => {
				const d = diagBridge();
				if (!d || !d.restore || bkBusy) return;
				setBkBusy(true);
				d.restore(restorePreview && restorePreview.token ? restorePreview.token : undefined).then((res) => {
					setBkBusy(false);
					setRestorePreview(null);
					if (res && res.ok) setBkMsg(L.restoreDone2.replace("{0}", String(res.files)));
					else if (res && res.canceled) setBkMsg(L.restoreCanceled);
					else setBkMsg(L.restoreFail + String((res && res.error) || "未知错误"));
				}).catch((err) => {
					setBkBusy(false);
					setRestorePreview(null);
					setBkMsg(L.restoreFail + String((err && err.message) || err));
				});
			};

			const doCancelRestore = () => {
				setRestorePreview(null);
				setBkMsg(L.restoreCanceled);
			};

			/** 一键导出诊断日志包（诊断报告 + 日志尾部，路径打码）。 */
			const doExportDiag = () => {
				const d = diagBridge();
				if (!d || !d.exportDiagnostics || bkBusy) return;
				setBkBusy(true);
				d.exportDiagnostics().then((res) => {
					setBkBusy(false);
					if (res && res.ok) setBkMsg(L.diagLogDone);
					else if (res && res.canceled) setBkMsg(L.diagLogCanceled);
					else setBkMsg(L.diagFail + String((res && res.error) || "未知错误"));
				}).catch((err) => {
					setBkBusy(false);
					setBkMsg(L.diagFail + String((err && err.message) || err));
				});
			};

			/** 防砖体检：检查已装插件的清单/补丁入口/跨包 id 冲突。 */
			const doValidate = () => {
				const d = diagBridge();
				if (!d || !d.validatePlugins || validBusy) return;
				setValidBusy(true);
				setValidArmed(false);
				d.validatePlugins().then((res) => {
					setValidBusy(false);
					if (res && res.ok && res.report) setValidReport(res.report);
					else setValidReport({ ok: false, checked: [], conflicts: [], summary: { errors: 1, warnings: 0 }, loadError: String((res && res.error) || "未知错误") });
				}).catch((err) => {
					setValidBusy(false);
					setValidReport({ ok: false, checked: [], conflicts: [], summary: { errors: 1, warnings: 0 }, loadError: String((err && err.message) || err) });
				});
			};

			/** 一键移除启动清单中的失效 bundle 条目（两步确认；成功后重跑体检反映最新状态）。 */
			const doRemoveBundles = () => {
				const d = diagBridge();
				const list = validReport && Array.isArray(validReport.contractViolations) ? validReport.contractViolations : [];
				if (!d || !d.removeBundle || validBusy || list.length === 0) return;
				if (!validArmed) { setValidArmed(true); return; }
				setValidArmed(false);
				setValidBusy(true);
				d.removeBundle(list).then((res) => {
					setValidBusy(false);
					if (res && res.ok) {
						setBkMsg(L.diagRemoveDone.replace("{0}", String((res.removed || []).length)));
						doValidate(); // 移除后重跑体检，反映最新状态
					} else {
						setBkMsg(L.diagFail + String((res && res.error) || "未知错误"));
					}
				}).catch((err) => {
					setValidBusy(false);
					setBkMsg(L.diagFail + String((err && err.message) || err));
				});
			};

			/** bundle 顺序检测（只读分析 + 建议顺序）。 */
			const doAnalyzeOrder = () => {
				const d = diagBridge();
				if (!d || !d.analyzeOrder || orderBusy) return;
				setOrderBusy(true);
				setOrderApplied(false);
				d.analyzeOrder().then((res) => {
					setOrderBusy(false);
					if (res && res.ok && res.report) setOrderReport(res.report);
					else setOrderReport({ error: String((res && res.error) || "未知错误"), bundles: [], conflicts: [], suggested: null });
				}).catch((err) => {
					setOrderBusy(false);
					setOrderReport({ error: String((err && err.message) || err), bundles: [], conflicts: [], suggested: null });
				});
			};

			/** 应用建议顺序（官方内置保持原位，原子写回 profile package.json）。 */
			const doApplyOrder = () => {
				const d = diagBridge();
				if (!d || !d.applyOrder || orderBusy || !orderReport || !orderReport.suggested || !orderReport.suggested.ok) return;
				setOrderBusy(true);
				d.applyOrder(orderReport.suggested.order).then((res) => {
					setOrderBusy(false);
					if (res && res.ok) {
						setOrderApplied(true);
						setBkMsg(res.changed ? L.diagOrderApplied : "顺序已是最优，无需变更");
					} else {
						setOrderReport({ ...orderReport, applyError: String((res && res.error) || "未知错误") });
					}
				}).catch((err) => {
					setOrderBusy(false);
					setOrderReport({ ...orderReport, applyError: String((err && err.message) || err) });
				});
			};

			const btnStyle = (danger) => ({
				fontSize: 12, padding: "5px 12px", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap",
				border: "1px solid " + (danger ? "var(--dsw-alias-state-error-primary, #ff7a85)" : "var(--dsw-alias-border-l2, rgba(128,128,128,0.35))"),
				background: "transparent", color: danger ? "var(--dsw-alias-state-error-primary, #ff7a85)" : "inherit",
				opacity: 1,
			});
			const actionBtn = (label, onClick, busy, danger) => jsx("button", {
				type: "button", disabled: busy, onClick,
				style: { ...btnStyle(danger), cursor: busy ? "default" : "pointer", opacity: busy ? 0.55 : 1 },
				children: label
			});
			const card = (title, childrenJsx) => jsxs("div", {
				style: { display: "flex", flexDirection: "column", gap: 8, padding: "12px 14px", borderRadius: 10, border: "1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.25))" },
				children: [jsx("span", { style: { fontSize: 13, fontWeight: 600 }, children: title }), childrenJsx]
			});
			const msgColor = /失败|错误/.test(bkMsg || "") ? "var(--dsw-alias-state-error-primary, #ff7a85)" : "var(--dsw-alias-state-info-primary, #5b9bd5)";

			// 诊断报告三色区块渲染
			const diagBody = (() => {
				if (!diagReport) return null;
				const r = diagReport;
				// 兼容两条产出路径：主进程 runDiagnostics 产 {code,message} 对象，前端失败分支产字符串
				const txt = (m) => (m && typeof m === "object" && "message" in m ? String(m.message) : String(m));
				const errs = r.errors || [];
				const warns = r.warnings || [];
				const infos = r.infos || [];
				// 启动自愈历史：模态框/通知是一次性的，这里提供持久回看（主进程
				// 每次自愈写入 userData/self-heal-history.json，随诊断报告带回）。
				const selfHealBox = (items) => {
					if (!items || items.length === 0) return null;
					return jsxs("div", { style: { fontSize: 12, padding: "8px 10px", borderRadius: 8, marginTop: 6, background: "color-mix(in srgb, var(--dsw-alias-state-info-primary, #5b9bd5) 10%, transparent)", color: "var(--dsw-alias-state-info-primary, #5b9bd5)", display: "flex", flexDirection: "column", gap: 3 }, children: [
						jsx("span", { style: { fontWeight: 600 }, children: L.diagSelfHealTitle }),
						items.map((it, i) => jsx("div", { key: i, style: { wordBreak: "break-all" }, children: (it.kind === "overlay" ? L.diagSelfHealDisabled : it.kind === "patch-layer" ? L.diagSelfHealReset : L.diagSelfHealRemoved).replace("{0}", (it.kind === "patch-layer" && it.backup ? String(it.backup).split(/[\\/]/).pop() : (it.names || []).join("、"))) + "（" + new Date(it.ts).toLocaleString() + "）" }))
					] });
				};
				// 自愈历史随报告放在 sections.selfHeal（顶层仅 ok/errors/warnings/infos），
				// 兼容两处取值，避免 r.selfHeal 恒为 undefined 蓝条永不显示。
				const selfHeal = Array.isArray(r.selfHeal) ? r.selfHeal : (r.sections && Array.isArray(r.sections.selfHeal) ? r.sections.selfHeal : []);
				if (r.ok === true) return jsxs("div", { children: [
					selfHealBox(selfHeal),
					jsx("div", { style: { fontSize: 12, color: "var(--dsw-alias-state-success-primary, #4caf7d)", marginTop: 6 }, children: L.diagOk })
				] });
				const section = (title, items, color, icon) => jsxs("div", { style: { marginTop: 6 }, children: [
					jsx("span", { style: { fontSize: 12, fontWeight: 600, color }, children: title + "（" + items.length + "）" }),
					items.length === 0 ? null : jsx("ul", { style: { margin: "4px 0 0", paddingLeft: 18, fontSize: 12 }, children: items.map((m, i) => jsx("li", { key: i, style: { color, margin: "2px 0", wordBreak: "break-all" }, children: icon + " " + txt(m) })) })
				] });
				return jsxs("div", { children: [
					selfHealBox(selfHeal),
					section(L.diagErrors, errs, "var(--dsw-alias-state-error-primary, #ff7a85)", "⛔"),
					section(L.diagWarnings, warns, "var(--dsw-alias-state-warning-primary, #d99a3d)", "⚠"),
					section(L.diagInfos, infos, "var(--dsw-alias-label-tertiary, rgba(128,128,128,0.6))", "ℹ")
				] });
			})();

			// 防砖体检结果渲染
			const validBody = (() => {
				if (!validReport) return null;
				const r = validReport;
				if (r.loadError) return jsx("div", { style: { fontSize: 12, color: "var(--dsw-alias-state-error-primary, #ff7a85)" }, children: L.diagValidFail + r.loadError });
				if (r.manifestError) return jsx("div", { style: { fontSize: 12, color: "var(--dsw-alias-state-error-primary, #ff7a85)", wordBreak: "break-all" }, children: "⛔ " + L.diagValidManifestFail + r.manifestError });
				const s = r.summary || { errors: 0, warnings: 0 };
				return jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }, children: [
					r.ok
						? jsx("div", { style: { color: "var(--dsw-alias-state-success-primary, #4caf7d)" }, children: L.diagValidOk })
						: jsx("div", { style: { color: "var(--dsw-alias-state-error-primary, #ff7a85)", fontWeight: 600 }, children: L.diagValidSummary.replace("{0}", String(r.checked.length)).replace("{1}", String(s.errors)).replace("{2}", String(s.warnings)) }),
					(() => {
						const violations = Array.isArray(r.contractViolations) ? r.contractViolations : [];
						if (violations.length === 0) return null;
						return jsxs("div", { style: { display: "flex", gap: 8, alignItems: "center", marginTop: 2, flexWrap: "wrap" }, children: [
							actionBtn(validArmed ? L.diagRemoveConfirm.replace("{0}", String(violations.length)) : L.diagRemoveBtn + "（" + violations.length + "）", doRemoveBundles, validBusy, true),
							validArmed ? jsx("button", { type: "button", onClick: () => setValidArmed(false), style: btnStyle(false), children: L.restoreAbort }) : null
						] });
					})(),
					r.conflicts.length > 0 ? jsx("ul", { style: { margin: 0, paddingLeft: 16 }, children: r.conflicts.map((c, i) => jsx("li", { key: i, style: { color: "var(--dsw-alias-state-error-primary, #ff7a85)", wordBreak: "break-all" }, children: "⛔ " + L.diagValidConflict.replace("{0}", c.id).replace("{1}", c.owners.join(" / ")) })) }) : null,
					r.checked.length > 0 ? jsx("div", { style: { display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }, children: r.checked.map((c) => {
						if (!c.issues || c.issues.length === 0) return jsx("div", { key: c.name, style: { opacity: 0.85, wordBreak: "break-all" }, children: "✔ " + c.name + (c.source ? "（" + c.source + "）" : "") });
						return jsxs("div", { key: c.name, style: { wordBreak: "break-all" }, children: [
							jsx("span", { children: c.name + "（" + c.source + "）" }),
							jsx("ul", { style: { margin: "2px 0 0", paddingLeft: 16 }, children: c.issues.map((it, i) => jsx("li", { key: i, style: { color: it.level === "error" ? "var(--dsw-alias-state-error-primary, #ff7a85)" : "var(--dsw-alias-state-warning-primary, #d99a3d)" }, children: (it.level === "error" ? "⛔ " : "⚠ ") + it.text })) })
						] });
					}) }) : null
				] });
			})();

			// bundle 顺序结果渲染
			const orderBody = (() => {
				if (!orderReport) return null;
				const r = orderReport;
				if (r.error) return jsx("div", { style: { fontSize: 12, color: "var(--dsw-alias-state-error-primary, #ff7a85)" }, children: "⛔ " + r.error });
				const list = (arr) => jsx("ol", { style: { margin: "4px 0 0", paddingLeft: 20, fontSize: 12, lineHeight: 1.7 }, children: arr.map((n, i) => jsx("li", { key: i, children: n })) });
				return jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }, children: [
					r.conflicts.length === 0 && r.suggested && r.suggested.ok
						? jsx("div", { style: { color: "var(--dsw-alias-state-success-primary, #4caf7d)" }, children: L.diagOrderOk })
						: (r.conflicts.length > 0 ? jsx("div", { style: { color: "var(--dsw-alias-state-warning-primary, #d99a3d)", fontWeight: 600 }, children: "⚠ " + L.diagOrderConflictN.replace("{0}", String(r.conflicts.length)) }) : null),
					r.conflicts.length > 0 ? jsx("ul", { style: { margin: 0, paddingLeft: 16 }, children: r.conflicts.map((c, i) => jsx("li", { key: i, style: { wordBreak: "break-all" }, children: "「" + c.name + "」" + c.reason })) }) : null,
					r.suggested && r.suggested.ok ? jsxs("div", { children: [
						jsx("div", { style: { opacity: 0.7, marginTop: 2 }, children: "建议顺序：" }),
						list(r.suggested.order),
						orderApplied
							? jsx("div", { style: { color: "var(--dsw-alias-state-success-primary, #4caf7d)", marginTop: 4 }, children: L.diagOrderApplied })
							: jsxs("div", { style: { display: "flex", gap: 8, marginTop: 8 }, children: [
								actionBtn(L.diagOrderApply, doApplyOrder, orderBusy, false),
								jsx("span", { style: { fontSize: 11, opacity: 0.55, alignSelf: "center" }, children: L.diagOrderRestart })
							] })
					] }) : null,
					r.suggested && !r.suggested.ok ? jsxs("div", { style: { color: "var(--dsw-alias-state-error-primary, #ff7a85)" }, children: [
						jsx("div", { children: L.diagOrderCycle }),
						list(r.suggested.cycle)
					] }) : null,
					r.applyError ? jsx("div", { style: { color: "var(--dsw-alias-state-error-primary, #ff7a85)" }, children: "⛔ " + r.applyError }) : null
				] });
			})();

			return jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 12 }, children: [
				jsx("div", { style: { fontSize: 12, opacity: 0.6 }, children: L.diagHint }),
				card(L.healthTitle, jsx(BackendHealthCard, { list })),
				card(L.removedTitle, jsx(RemovedServiceNoticeCard, { list })),
				card(L.diagTitle + " — 诊断", jsxs("div", { children: [
					actionBtn(diagBusy ? L.diagRunning : L.diagRun, doRunDiag, diagBusy, false),
					diagBody
				] })),
				card(L.backupTitle, jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }, children: [
					actionBtn(bkBusy ? L.backupExporting : L.backupExport, doExportBackup, bkBusy, false)
				] })),
				card(L.restoreTitle, jsxs("div", { children: [
					jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }, children: [
						actionBtn(bkBusy ? L.restorePicking : L.restorePick, doPickRestore, bkBusy, false)
					] }),
					restorePreview ? jsxs("div", { style: { marginTop: 8, padding: 10, borderRadius: 8, border: "1px solid var(--dsw-alias-state-warning-primary, #d99a3d)", background: "color-mix(in srgb, var(--dsw-alias-state-warning-primary, #d99a3d) 8%, transparent)", fontSize: 12 }, children: [
						jsx("div", { style: { fontWeight: 600 }, children: L.restorePreview }),
						jsx("div", { style: { marginTop: 4, opacity: 0.85, wordBreak: "break-all" }, children: restorePreview.file }),
						jsx("div", { style: { marginTop: 2, opacity: 0.85 }, children: L.restorePreviewFiles.replace("{0}", String(restorePreview.files == null ? 0 : restorePreview.files)).replace("{1}", restorePreview.createdAt ? new Date(restorePreview.createdAt).toLocaleString() : "-") }),
						(restorePreview.secretFiles && restorePreview.secretFiles.length > 0) ? jsx("div", { style: { color: "var(--dsw-alias-state-error-primary, #ff7a85)", marginTop: 6, fontWeight: 600 }, children: L.restoreSecretWarn }) : null,
						jsxs("div", { style: { display: "flex", gap: 8, marginTop: 8 }, children: [
							actionBtn(L.restoreConfirm, doConfirmRestore, bkBusy, true),
							actionBtn(L.restoreAbort, doCancelRestore, false, false)
						] })
					] }) : null
				] })),
				card(L.diagLogTitle, jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }, children: [
					actionBtn(bkBusy ? L.diagLogExporting : L.diagLogExport, doExportDiag, bkBusy, false)
				] })),
				card(L.diagValidTitle, jsxs("div", { children: [
					actionBtn(validBusy ? L.diagValidRunning : L.diagValidRun, doValidate, validBusy, false),
					validBody
				] })),
				card(L.diagOrderTitle, jsxs("div", { children: [
					jsx("div", { style: { fontSize: 11, opacity: 0.55 }, children: L.diagOrderHint }),
					jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }, children: [
						actionBtn(orderBusy ? L.diagOrderRunning : L.diagOrderRun, doAnalyzeOrder, orderBusy, false)
					] }),
					orderBody
				] })),
				bkMsg ? jsx("div", { style: { fontSize: 12, padding: "6px 12px", borderRadius: 8, border: "1px solid " + msgColor, background: "color-mix(in srgb, " + msgColor + " 8%, transparent)", color: msgColor }, children: bkMsg }) : null,
				jsx("div", { style: { fontSize: 11, opacity: 0.5 }, children: L.restartHint })
			] });
		}

		function apply(ctx) {
			const list = async () => {
				const result = await ctx.remote.pluginInventory.list();
				if (!result.ok) throw new Error(`pluginInventory.list failed: ${result.error.code}: ${result.error.message}`);
				return result.value;
			};
			const injected = () => ({ list });
			ctx.slots.inject("settings.plugins.tab", () => ctx.slots.register({
				name: "settings.plugins.tab",
				id: "manage",
				order: 20,
				label: () => L.tab,
				inject: injected
			}, PluginManagerTab), "dsh-plugin-manager: plugins management tab");
			// 「插件」分区下的第二个标签「诊断与管理」（与「管理」并列）：后端服务健康 /
			// 诊断 / 备份恢复 / 日志包导出 / 防砖体检 / bundle 顺序检测与重排。
			// inject 与「管理」标签同源（pluginInventory.list）：健康卡走内核运行期
			// Loader 投影，管理标签走本地桥 + live 注册表合并。
			ctx.slots.inject("settings.plugins.tab", () => ctx.slots.register({
				name: "settings.plugins.tab",
				id: "diag",
				order: 25,
				label: () => L.diagTitle,
				inject: injected
			}, DiagSection), "dsh-plugin-manager: diagnostics & maintenance tab");
		}

		const inject = ["slots", "remote", "remote.pluginInventory"];
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
