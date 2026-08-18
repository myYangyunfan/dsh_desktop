window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-client-ui-subagent",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		let _deepseek_ai_dsh_client_runtime_client = require("@deepseek-ai/dsh-client-runtime/client");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		//#region \0dsh-css:/home/runner/work/deepseek-harness/deepseek-harness/packages/client/ui-subagent/src/client/SubagentCatalogAction.module.css.mjs
		const css$1 = ".h8S2Va_root{position:relative}.h8S2Va_trigger{min-height:28px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:0;border-radius:6px;align-items:center;gap:3px;padding:3px 2px;font-size:12px;line-height:18px;display:inline-flex}.h8S2Va_count{margin:0 5px}.h8S2Va_activitySlot{flex:none;width:10px;height:10px;display:inline-flex}.h8S2Va_trigger:hover,.h8S2Va_trigger:focus-visible{color:var(--dsw-alias-label-secondary)}.h8S2Va_trigger svg{transition:transform .12s}.h8S2Va_triggerOpen{transform:rotate(180deg)}.h8S2Va_menu{z-index:100;box-sizing:border-box;background:var(--dsw-specific-menu);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);width:336px;max-width:min(400px,100vw - 32px);max-height:min(560px,100vh - 140px);box-shadow:var(--dsw-shadow-lv3);border-radius:12px;flex-direction:column;padding:4px;display:flex;position:absolute;top:calc(100% + 5px);left:0;overflow:auto}.h8S2Va_node{min-width:0;position:relative}.h8S2Va_menu>.h8S2Va_node{margin-left:-3px}.h8S2Va_row{box-sizing:border-box;width:100%;min-height:50px;color:var(--dsw-alias-label-primary);text-align:left;cursor:pointer;background:0 0;border:0;border-radius:8px;outline:none;align-items:flex-start;gap:8px;padding:7px 8px 7px 11px;font-size:13px;line-height:18px;display:flex;position:relative}.h8S2Va_row:hover>.h8S2Va_clickarea,.h8S2Va_row:focus-visible>.h8S2Va_clickarea{background:var(--dsw-alias-interactive-bg-hover)}.h8S2Va_clickarea{box-sizing:border-box;border-radius:8px;flex:1;align-self:stretch;align-items:flex-start;gap:8px;min-width:0;margin:-7px -8px;padding:7px 8px;display:flex}.h8S2Va_row>[data-state],.h8S2Va_clickarea>[data-state]{margin-top:4px}.h8S2Va_disabled{color:var(--dsw-alias-label-dimmed);cursor:not-allowed}.h8S2Va_disabled:hover{background:0 0}.h8S2Va_loadingRow{cursor:default}.h8S2Va_disclosure,.h8S2Va_disclosureSpace{flex:none;width:14px;height:18px}.h8S2Va_disclosure{color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:0;justify-content:center;align-items:center;padding:0;transition:transform .12s;display:inline-flex}.h8S2Va_disclosure:hover{color:var(--dsw-alias-label-primary)}.h8S2Va_disclosureOpen{transform:rotate(90deg)}.h8S2Va_content{flex-direction:column;flex:1;min-width:0;display:flex}.h8S2Va_label,.h8S2Va_summary{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.h8S2Va_label{color:inherit;font-weight:400}.h8S2Va_summary,.h8S2Va_metrics{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}.h8S2Va_metrics{font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap;flex:none;grid-template-rows:18px 16px;display:grid}.h8S2Va_metricToken{grid-row:1;line-height:18px}.h8S2Va_metricDuration{grid-row:2}.h8S2Va_children{margin-left:18px;padding-left:4px;position:relative}.h8S2Va_children:before,.h8S2Va_children>.h8S2Va_node:before{content:\"\";border-left:1px solid var(--dsw-alias-border-l2);position:absolute;left:0}.h8S2Va_children:before{height:26px;top:-26px}.h8S2Va_children[aria-busy=true]:before{content:none}.h8S2Va_children>.h8S2Va_node:before{top:0;bottom:0;left:-4px}.h8S2Va_children>.h8S2Va_node:last-child:before{height:17px;bottom:auto}.h8S2Va_children>.h8S2Va_node>.h8S2Va_row:before{content:\"\";border-top:1px solid var(--dsw-alias-border-l2);width:14px;position:absolute;top:16px;left:-4px}.h8S2Va_notice,.h8S2Va_error{color:var(--dsw-alias-label-tertiary);padding:10px 12px;font-size:12px;line-height:18px}.h8S2Va_error{color:var(--dsw-alias-state-error-primary);justify-content:space-between;align-items:center;gap:12px;display:flex}.h8S2Va_refresh{color:inherit;cursor:pointer;background:0 0;border:0;border-radius:6px;flex:none;align-items:center;gap:4px;padding:4px 6px;display:inline-flex}.h8S2Va_refresh:hover{background:var(--dsw-alias-interactive-bg-hover)}";
		const tagId$1 = "@deepseek-ai/dsh-client-ui-subagent/SubagentCatalogAction.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-subagent";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var SubagentCatalogAction_module_css_default = {
			"triggerOpen": "h8S2Va_triggerOpen",
			"loadingRow": "h8S2Va_loadingRow",
			"clickarea": "h8S2Va_clickarea",
			"children": "h8S2Va_children",
			"metricToken": "h8S2Va_metricToken",
			"root": "h8S2Va_root",
			"count": "h8S2Va_count",
			"activitySlot": "h8S2Va_activitySlot",
			"node": "h8S2Va_node",
			"menu": "h8S2Va_menu",
			"metrics": "h8S2Va_metrics",
			"notice": "h8S2Va_notice",
			"disclosureOpen": "h8S2Va_disclosureOpen",
			"disclosure": "h8S2Va_disclosure",
			"disabled": "h8S2Va_disabled",
			"error": "h8S2Va_error",
			"content": "h8S2Va_content",
			"label": "h8S2Va_label",
			"row": "h8S2Va_row",
			"summary": "h8S2Va_summary",
			"trigger": "h8S2Va_trigger",
			"refresh": "h8S2Va_refresh",
			"disclosureSpace": "h8S2Va_disclosureSpace",
			"metricDuration": "h8S2Va_metricDuration"
		};
		//#endregion
		//#region lib/types/client/SubagentCatalogAction.js
		function diagnosticReason(entry, t) {
			switch (entry.reason) {
				case "corrupt": return t("diagnostic.corrupt");
				case "unsupported": return t("diagnostic.unsupported");
				case "unavailable": return t("diagnostic.unavailable");
			}
		}
		function treeItems(root) {
			return root === null ? [] : Array.from(root.querySelectorAll("[role=\"treeitem\"]:not([aria-disabled=\"true\"])"));
		}
		/** Compact token count shared in shape with the conversation stats strip. */
		function formatTokens(value) {
			const scaled = (next) => next >= 100 ? String(Math.round(next)) : String(Math.round(next * 10) / 10);
			if (value < 1e3) return String(value);
			if (value < 1e6) return `${scaled(value / 1e3)}K`;
			return `${scaled(value / 1e6)}M`;
		}
		/** Sum the four disjoint durable provider-usage buckets. */
		function tokenTotal(usage) {
			return usage === void 0 ? void 0 : usage.uncachedInputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
		}
		/** Exact whole-second active-turn duration for one catalog row. */
		function activityDuration(summary, activity, now) {
			if (summary === void 0) return void 0;
			const timing = summary.projectionValues?.subagentTiming;
			if (timing === void 0) return void 0;
			if (timing.active === void 0) return timing.settledMs;
			const end = activity === "running" ? now : timing.active.through;
			return timing.settledMs + Math.max(0, end - timing.active.since);
		}
		function splitDuration(ms) {
			const totalSeconds = Math.floor(Math.max(0, ms) / 1e3);
			const totalMinutes = Math.floor(totalSeconds / 60);
			const totalHours = Math.floor(totalMinutes / 60);
			return {
				seconds: totalSeconds % 60,
				minutes: totalMinutes % 60,
				hours: totalHours % 24,
				days: Math.floor(totalHours / 24),
				totalMinutes,
				totalHours
			};
		}
		/** Format a duration with decreasing visual precision at larger scales. */
		function formatDuration(ms, t) {
			const { seconds, minutes, hours, days, totalMinutes, totalHours } = splitDuration(ms);
			if (days >= 365) {
				const years = Math.floor(days / 365);
				const months = Math.floor(days % 365 / 30);
				return months === 0 ? t("duration.years", { years }) : t("duration.yearsMonths", {
					years,
					months
				});
			}
			if (days >= 30) {
				const months = Math.floor(days / 30);
				const remainingDays = days % 30;
				return remainingDays === 0 ? t("duration.months", { months }) : t("duration.monthsDays", {
					months,
					days: remainingDays
				});
			}
			if (days > 0) return hours === 0 ? t("duration.days", { days }) : t("duration.daysHours", {
				days,
				hours
			});
			if (totalHours > 0) return t("duration.hours", {
				hours: totalHours,
				minutes: String(minutes).padStart(2, "0"),
				seconds: String(seconds).padStart(2, "0")
			});
			if (totalMinutes > 0) return t("duration.minutes", {
				minutes: totalMinutes,
				seconds: String(seconds).padStart(2, "0")
			});
			return t("duration.seconds", { seconds });
		}
		/** Preserve exact whole seconds for hover and accessible naming. */
		function formatExactDuration(ms, t) {
			const { seconds, minutes, hours, days } = splitDuration(ms);
			return days === 0 ? formatDuration(ms, t) : t("duration.exactDays", {
				days,
				hours: String(hours).padStart(2, "0"),
				minutes: String(minutes).padStart(2, "0"),
				seconds: String(seconds).padStart(2, "0")
			});
		}
		const NO_DESCENDANTS = {
			count: 0,
			runningCount: 0
		};
		/** Render the known direct-child shape while its authoritative catalog hydrates. */
		function CatalogLoadingRows({ parentSessionId, summaries, level, t }) {
			const children = Object.values(summaries).filter((summary) => summary.origin === "subagent" && summary.parentId === parentSessionId);
			if (children.length === 0) return (0, react_jsx_runtime.jsx)("div", {
				className: SubagentCatalogAction_module_css_default.notice,
				children: t("loading.label")
			});
			return children.map((summary) => (0, react_jsx_runtime.jsx)("div", {
				className: SubagentCatalogAction_module_css_default.node,
				children: (0, react_jsx_runtime.jsxs)("div", {
					role: "treeitem",
					"aria-disabled": "true",
					"aria-level": level,
					"aria-label": t("loading.aria"),
					className: `${SubagentCatalogAction_module_css_default.row} ${SubagentCatalogAction_module_css_default.disabled} ${SubagentCatalogAction_module_css_default.loadingRow}`,
					children: [
						(0, react_jsx_runtime.jsx)("span", { className: SubagentCatalogAction_module_css_default.disclosureSpace }),
						(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: summary.running ? "ongoing" : "done" }),
						(0, react_jsx_runtime.jsx)("span", {
							className: SubagentCatalogAction_module_css_default.content,
							children: (0, react_jsx_runtime.jsx)("span", {
								className: SubagentCatalogAction_module_css_default.label,
								children: t("loading.label")
							})
						})
					]
				})
			}, summary.id));
		}
		/** Render one catalog level and recurse only through explicitly expanded rows. */
		function CatalogRows({ parentSessionId, catalog, catalogs, summaries, expanded, level, now, openChild, refresh, toggleBranch, closeCatalog, t }) {
			const emptyLoading = catalog.state === "loading" && catalog.entries.length === 0;
			const reserveDisclosure = catalog.entries.some((entry) => entry.kind === "child" && entry.hasChildren);
			return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				emptyLoading && (0, react_jsx_runtime.jsx)(CatalogLoadingRows, {
					parentSessionId,
					summaries,
					level,
					t
				}),
				catalog.state === "error" && (0, react_jsx_runtime.jsxs)("div", {
					className: SubagentCatalogAction_module_css_default.error,
					children: [(0, react_jsx_runtime.jsx)("span", { children: catalog.error?.message ?? t("load.error") }), (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: SubagentCatalogAction_module_css_default.refresh,
						onClick: () => {
							refresh(parentSessionId);
						},
						children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRefreshOutline14, {}), t("retry")]
					})]
				}),
				catalog.entries.map((entry) => {
					if (entry.kind === "diagnostic") {
						const reason = diagnosticReason(entry, t);
						return (0, react_jsx_runtime.jsx)("div", {
							className: SubagentCatalogAction_module_css_default.node,
							children: (0, react_jsx_runtime.jsxs)("div", {
								role: "treeitem",
								"aria-disabled": "true",
								"aria-level": level,
								"aria-label": `${entry.id} ${reason}`,
								className: `${SubagentCatalogAction_module_css_default.row} ${SubagentCatalogAction_module_css_default.disabled}`,
								title: reason,
								children: [
									reserveDisclosure && (0, react_jsx_runtime.jsx)("span", { className: SubagentCatalogAction_module_css_default.disclosureSpace }),
									(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: "error" }),
									(0, react_jsx_runtime.jsxs)("span", {
										className: SubagentCatalogAction_module_css_default.content,
										children: [(0, react_jsx_runtime.jsx)("span", {
											className: SubagentCatalogAction_module_css_default.label,
											children: entry.id
										}), (0, react_jsx_runtime.jsx)("span", {
											className: SubagentCatalogAction_module_css_default.summary,
											children: reason
										})]
									})
								]
							})
						}, entry.id);
					}
					const childCatalog = catalogs[entry.id];
					const isExpanded = expanded.has(entry.id);
					const knownLeaf = !entry.hasChildren;
					const childLoading = childCatalog === void 0 || childCatalog.state === "loading" && childCatalog.entries.length === 0;
					const summary = summaries[entry.id];
					const label = entry.label ?? entry.id;
					const mode = entry.mode === "one-shot" ? t("mode.oneShot") : t("mode.continuable");
					const activity = entry.activity === "running" ? t("activity.running") : t("activity.inactive");
					const secondary = [
						summary?.title,
						mode,
						activity
					].filter((value) => value !== void 0).join(" · ");
					const totalTokens = tokenTotal(summary?.projectionValues?.tokenUsage);
					const durationMs = activityDuration(summary, entry.activity, now);
					const tokenMetric = totalTokens === void 0 ? void 0 : `${formatTokens(totalTokens)} tok`;
					const durationMetric = durationMs === void 0 ? void 0 : {
						compact: formatDuration(durationMs, t),
						exact: formatExactDuration(durationMs, t)
					};
					const metrics = [tokenMetric, durationMetric?.exact].filter((value) => value !== void 0).join(" · ");
					const open = () => {
						openChild({
							parentSessionId,
							childSessionId: entry.id,
							mode: entry.mode
						});
						closeCatalog();
					};
					const handleKey = (event) => {
						if (event.key === "Enter" || event.key === " ") {
							event.preventDefault();
							event.stopPropagation();
							open();
						} else if (event.key === "ArrowRight" && !knownLeaf && !isExpanded || event.key === "ArrowLeft" && isExpanded) {
							event.preventDefault();
							event.stopPropagation();
							toggleBranch(entry.id);
						}
					};
					const toggle = (event) => {
						event.preventDefault();
						event.stopPropagation();
						toggleBranch(entry.id);
					};
					return (0, react_jsx_runtime.jsxs)("div", {
						className: SubagentCatalogAction_module_css_default.node,
						children: [(0, react_jsx_runtime.jsxs)("div", {
							role: "treeitem",
							tabIndex: 0,
							"aria-level": level,
							"aria-label": [
								label,
								secondary,
								metrics
							].filter((value) => value !== "").join(" "),
							...knownLeaf ? {} : { "aria-expanded": isExpanded },
							className: SubagentCatalogAction_module_css_default.row,
							onClick: open,
							onKeyDown: handleKey,
							children: [knownLeaf ? reserveDisclosure && (0, react_jsx_runtime.jsx)("span", { className: SubagentCatalogAction_module_css_default.disclosureSpace }) : (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								tabIndex: -1,
								className: `${SubagentCatalogAction_module_css_default.disclosure} ${isExpanded ? SubagentCatalogAction_module_css_default.disclosureOpen : ""}`,
								"aria-label": t(isExpanded ? "branch.collapse" : "branch.expand", { label }),
								onClick: toggle,
								children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronRightOutline14, {})
							}), (0, react_jsx_runtime.jsxs)("div", {
								className: SubagentCatalogAction_module_css_default.clickarea,
								children: [
									(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: entry.activity === "running" ? "ongoing" : "done" }),
									(0, react_jsx_runtime.jsxs)("span", {
										className: SubagentCatalogAction_module_css_default.content,
										children: [(0, react_jsx_runtime.jsx)("span", {
											className: SubagentCatalogAction_module_css_default.label,
											children: label
										}), (0, react_jsx_runtime.jsx)("span", {
											className: SubagentCatalogAction_module_css_default.summary,
											children: secondary
										})]
									}),
									metrics !== "" && (0, react_jsx_runtime.jsxs)("span", {
										className: SubagentCatalogAction_module_css_default.metrics,
										children: [tokenMetric !== void 0 && (0, react_jsx_runtime.jsx)("span", {
											className: SubagentCatalogAction_module_css_default.metricToken,
											children: tokenMetric
										}), durationMetric !== void 0 && (0, react_jsx_runtime.jsx)("span", {
											className: SubagentCatalogAction_module_css_default.metricDuration,
											title: t("duration.exactTitle", { duration: durationMetric.exact }),
											children: durationMetric.compact
										})]
									})
								]
							})]
						}), isExpanded && !knownLeaf && (0, react_jsx_runtime.jsx)("div", {
							role: "group",
							className: SubagentCatalogAction_module_css_default.children,
							"aria-busy": childLoading || void 0,
							children: childCatalog === void 0 ? (0, react_jsx_runtime.jsx)(CatalogLoadingRows, {
								parentSessionId: entry.id,
								summaries,
								level: level + 1,
								t
							}) : (0, react_jsx_runtime.jsx)(CatalogRows, {
								parentSessionId: entry.id,
								catalog: childCatalog,
								catalogs,
								summaries,
								expanded,
								level: level + 1,
								now,
								openChild,
								refresh,
								toggleBranch,
								closeCatalog,
								t
							})
						})]
					}, entry.id);
				})
			] });
		}
		/**
		* Render the current session's direct catalog and lazily expanded descendants.
		* @param props - session standard props plus catalog navigation actions.
		* @returns The action while the catalog is pending or summaries establish descendants.
		*/
		function SubagentCatalogAction({ sessionId, useSessions, openChild, refresh, setCatalogOpen, t }) {
			const catalogs = useSessions((state) => state.subagentsByParent);
			const summaries = useSessions((state) => state.byId);
			const catalog = catalogs[sessionId];
			const [open, setOpen] = (0, react.useState)(false);
			const [now, setNow] = (0, react.useState)(() => Date.now());
			const [expanded, setExpanded] = (0, react.useState)(() => /* @__PURE__ */ new Set());
			const rootRef = (0, react.useRef)(null);
			const triggerRef = (0, react.useRef)(null);
			const observedCatalogs = (0, react.useRef)(/* @__PURE__ */ new Set());
			const setCatalogOpenRef = (0, react.useRef)(setCatalogOpen);
			setCatalogOpenRef.current = setCatalogOpen;
			const healthy = catalog?.entries.filter((entry) => entry.kind === "child") ?? [];
			const descendants = (0, react.useMemo)(() => (0, _deepseek_ai_dsh_client_runtime_client.indexSubagentDescendants)(summaries).get(sessionId) ?? NO_DESCENDANTS, [sessionId, summaries]);
			const descendantCount = Math.max(healthy.length, descendants.count);
			const totalCountKey = descendantCount === 1 ? "count.total.one" : "count.total.other";
			const runningCountKey = descendants.runningCount === 1 ? "count.running.one" : "count.running.other";
			const presentedCatalog = descendants.count > 0 && (catalog === void 0 || catalog.state === "ready" && catalog.entries.length === 0) ? {
				entries: [],
				parentAvailable: catalog?.parentAvailable ?? false,
				state: "loading",
				error: null
			} : catalog;
			const observeCatalog = (parentSessionId, next) => {
				if (next) observedCatalogs.current.add(parentSessionId);
				else observedCatalogs.current.delete(parentSessionId);
				setCatalogOpen(parentSessionId, next);
			};
			const closeAllCatalogs = () => {
				for (const parentSessionId of observedCatalogs.current) setCatalogOpen(parentSessionId, false);
				observedCatalogs.current.clear();
				setExpanded(/* @__PURE__ */ new Set());
			};
			const changeOpen = (next, restoreFocus = false) => {
				setOpen(next);
				if (next) {
					setNow(Date.now());
					observeCatalog(sessionId, true);
				} else closeAllCatalogs();
				if (restoreFocus) queueMicrotask(() => {
					triggerRef.current?.focus();
				});
			};
			const closeBranch = (root) => {
				const closing = /* @__PURE__ */ new Set();
				const visit = (parentSessionId) => {
					if (closing.has(parentSessionId) || !expanded.has(parentSessionId)) return;
					closing.add(parentSessionId);
					const branch = catalogs[parentSessionId];
					for (const entry of branch?.entries ?? []) if (entry.kind === "child") visit(entry.id);
				};
				visit(root);
				for (const parentSessionId of closing) observeCatalog(parentSessionId, false);
				setExpanded((current) => new Set([...current].filter((id) => !closing.has(id))));
			};
			const toggleBranch = (childSessionId) => {
				if (expanded.has(childSessionId)) {
					closeBranch(childSessionId);
					return;
				}
				setExpanded((current) => new Set(current).add(childSessionId));
				observeCatalog(childSessionId, true);
			};
			(0, react.useEffect)(() => {
				if (!open) return;
				const closeOutside = (event) => {
					if (event.target instanceof Node && !rootRef.current?.contains(event.target)) changeOpen(false);
				};
				document.addEventListener("pointerdown", closeOutside);
				return () => {
					document.removeEventListener("pointerdown", closeOutside);
				};
			}, [open]);
			(0, react.useEffect)(() => {
				if (!open || descendants.runningCount === 0) return;
				const timer = setInterval(() => {
					setNow(Date.now());
				}, 1e3);
				return () => {
					clearInterval(timer);
				};
			}, [open, descendants.runningCount]);
			(0, react.useEffect)(() => () => {
				for (const parentSessionId of observedCatalogs.current) setCatalogOpenRef.current(parentSessionId, false);
				observedCatalogs.current.clear();
			}, []);
			const visible = presentedCatalog !== void 0 && (presentedCatalog.state === "error" || presentedCatalog.entries.length > 0 || descendantCount > 0);
			(0, react.useEffect)(() => {
				if (visible || !open) return;
				setOpen(false);
				closeAllCatalogs();
			}, [visible, open]);
			if (!visible) return null;
			const focusAt = (index) => {
				const items = treeItems(rootRef.current);
				if (items.length === 0) return;
				items[(index + items.length) % items.length]?.focus();
			};
			const navigate = (event) => {
				const items = treeItems(rootRef.current);
				const index = items.indexOf(document.activeElement);
				if (event.key === "Escape") {
					event.preventDefault();
					changeOpen(false, true);
				} else if (event.key === "Home") {
					event.preventDefault();
					focusAt(0);
				} else if (event.key === "End") {
					event.preventDefault();
					focusAt(items.length - 1);
				} else if (event.key === "ArrowDown") {
					event.preventDefault();
					focusAt(index + 1);
				} else if (event.key === "ArrowUp") {
					event.preventDefault();
					focusAt(index < 0 ? items.length - 1 : index - 1);
				}
			};
			return (0, react_jsx_runtime.jsxs)("div", {
				className: SubagentCatalogAction_module_css_default.root,
				ref: rootRef,
				onKeyDown: navigate,
				children: [(0, react_jsx_runtime.jsxs)("button", {
					ref: triggerRef,
					type: "button",
					className: SubagentCatalogAction_module_css_default.trigger,
					"aria-haspopup": "tree",
					"aria-expanded": open,
					"aria-label": t(descendants.runningCount > 0 ? runningCountKey : totalCountKey, { count: descendants.runningCount > 0 ? descendants.runningCount : descendantCount }),
					onClick: () => {
						changeOpen(!open);
					},
					onKeyDown: (event) => {
						if (event.key !== "ArrowDown") return;
						event.preventDefault();
						if (!open) changeOpen(true);
						queueMicrotask(() => {
							focusAt(0);
						});
					},
					children: [
						(0, react_jsx_runtime.jsx)("span", {
							className: SubagentCatalogAction_module_css_default.activitySlot,
							children: descendants.runningCount > 0 && (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: "ongoing" })
						}),
						(0, react_jsx_runtime.jsx)("span", {
							className: SubagentCatalogAction_module_css_default.count,
							children: t(totalCountKey, { count: descendantCount })
						}),
						(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { className: open ? SubagentCatalogAction_module_css_default.triggerOpen : void 0 })
					]
				}), open && (0, react_jsx_runtime.jsx)("div", {
					className: SubagentCatalogAction_module_css_default.menu,
					role: "tree",
					"aria-label": t("tree.aria"),
					children: (0, react_jsx_runtime.jsx)(CatalogRows, {
						parentSessionId: sessionId,
						catalog: presentedCatalog,
						catalogs,
						summaries,
						expanded,
						level: 1,
						now,
						openChild,
						refresh,
						toggleBranch,
						closeCatalog: () => {
							changeOpen(false);
						},
						t
					})
				})]
			});
		}
		//#endregion
		//#region \0dsh-css:/home/runner/work/deepseek-harness/deepseek-harness/packages/client/ui-subagent/src/client/SubagentReadOnlyComposer.module.css.mjs
		const css = ".XJ7liG_frame{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);min-height:54px;color:var(--dsw-alias-label-tertiary);border-radius:14px;justify-content:center;align-items:center;gap:8px;margin:0 24px 20px;padding:10px 16px;font-size:13px;line-height:20px;display:flex}.XJ7liG_frame strong{color:var(--dsw-alias-label-primary);font-weight:510}";
		const tagId = "@deepseek-ai/dsh-client-ui-subagent/SubagentReadOnlyComposer.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-subagent";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var SubagentReadOnlyComposer_module_css_default = { "frame": "XJ7liG_frame" };
		//#endregion
		//#region lib/types/client/SubagentReadOnlyComposer.js
		/**
		* Explain why the normal composer is unavailable for an addressed child.
		* @param props - selector-owned read-only reason plus standard slot props.
		* @returns A read-only composer replacement.
		*/
		function SubagentReadOnlyComposer({ matched, t }) {
			const oneShot = matched.reason === "one-shot";
			return (0, react_jsx_runtime.jsxs)("div", {
				className: SubagentReadOnlyComposer_module_css_default.frame,
				role: "status",
				children: [(0, react_jsx_runtime.jsx)("strong", { children: t(oneShot ? "readonly.oneShot.title" : "readonly.title") }), (0, react_jsx_runtime.jsx)("span", { children: t(oneShot ? "readonly.oneShot.body" : "readonly.body") })]
			});
		}
		//#endregion
		//#region lib/types/client/locales.js
		/** `subagent` namespace dictionaries. */
		/** Dictionary namespace owned by this plugin. */
		const NS = "subagent";
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"diagnostic.corrupt": "会话记录损坏",
			"diagnostic.unsupported": "子代理记录版本不受支持",
			"diagnostic.unavailable": "会话记录暂不可用",
			"duration.seconds": "{seconds}秒",
			"duration.minutes": "{minutes}分{seconds}秒",
			"duration.hours": "{hours}小时{minutes}分{seconds}秒",
			"duration.days": "{days}天",
			"duration.daysHours": "{days}天{hours}小时",
			"duration.months": "约{months}个月",
			"duration.monthsDays": "约{months}个月{days}天",
			"duration.years": "约{years}年",
			"duration.yearsMonths": "约{years}年{months}个月",
			"duration.exactDays": "{days}天{hours}小时{minutes}分{seconds}秒",
			"duration.exactTitle": "总活跃耗时：{duration}",
			"loading.label": "正在加载子代理…",
			"loading.aria": "正在加载子代理",
			"load.error": "无法加载子代理",
			"retry": "重试",
			"mode.oneShot": "一次性",
			"mode.continuable": "可继续",
			"activity.running": "正在运行",
			"activity.inactive": "当前未运行",
			"branch.collapse": "收起 {label} 的下级子代理",
			"branch.expand": "展开 {label} 的下级子代理",
			"count.total.one": "{count} 个子代理",
			"count.total.other": "{count} 个子代理",
			"count.running.one": "{count} 个子代理，正在运行",
			"count.running.other": "{count} 个子代理，正在运行",
			"tree.aria": "子代理会话",
			"readonly.oneShot.title": "一次性子代理记录",
			"readonly.title": "此子代理暂时只读",
			"readonly.oneShot.body": "一次性任务不支持后续消息，可在这里查看完整执行记录。",
			"readonly.body": "父会话当前不在线，重新打开父会话后即可继续发送消息。"
		};
		/** English dictionary, key-identical to the Chinese source of truth. */
		const en = {
			"diagnostic.corrupt": "corrupted session record",
			"diagnostic.unsupported": "unsupported subagent record version",
			"diagnostic.unavailable": "session record temporarily unavailable",
			"duration.seconds": "{seconds}s",
			"duration.minutes": "{minutes}m {seconds}s",
			"duration.hours": "{hours}h {minutes}m {seconds}s",
			"duration.days": "{days}d",
			"duration.daysHours": "{days}d {hours}h",
			"duration.months": "~{months}mo",
			"duration.monthsDays": "~{months}mo {days}d",
			"duration.years": "~{years}y",
			"duration.yearsMonths": "~{years}y {months}mo",
			"duration.exactDays": "{days}d {hours}h {minutes}m {seconds}s",
			"duration.exactTitle": "Total active duration: {duration}",
			"loading.label": "Loading subagents…",
			"loading.aria": "Loading subagents",
			"load.error": "Unable to load subagents",
			"retry": "Retry",
			"mode.oneShot": "one-shot",
			"mode.continuable": "continuable",
			"activity.running": "running",
			"activity.inactive": "not running",
			"branch.collapse": "Collapse {label} descendants",
			"branch.expand": "Expand {label} descendants",
			"count.total.one": "{count} subagent",
			"count.total.other": "{count} subagents",
			"count.running.one": "{count} subagent running",
			"count.running.other": "{count} subagents running",
			"tree.aria": "Subagent sessions",
			"readonly.oneShot.title": "One-shot subagent record",
			"readonly.title": "This subagent is read-only for now",
			"readonly.oneShot.body": "One-shot tasks do not accept follow-ups; review the full execution record here.",
			"readonly.body": "The parent session is offline; reopen it to continue sending messages."
		};
		//#endregion
		//#region lib/types/client/index.js
		/** Required services for references, conversation slots, and session navigation. */
		const inject = [
			"inputTriggers",
			"sessions",
			"slots",
			"locale"
		];
		/** Claim the composer for one-shot history or an unavailable continuation owner. */
		function selectReadOnlySubagent(owner) {
			const subagent = owner.session?.subagent;
			if (subagent === void 0 || subagent === null) return null;
			if (subagent.address.mode === "one-shot") return { reason: "one-shot" };
			if (subagent.parentAvailable) return null;
			return owner.session?.running === true ? null : { reason: "parent-unavailable" };
		}
		/**
		* Client plugin body: register the '@' subagent source over the root session list.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "ui-subagent: dictionaries");
			const sessions = ctx.sessions;
			const childLabels = (session, query) => {
				const { byId } = sessions.list.getSnapshot();
				return Object.values(byId).filter((child) => child.parentId === session.sessionId && child.running && child.displayTitle.includes(query)).map((child) => child.displayTitle);
			};
			const source = {
				trigger: "@",
				name: "subagent",
				candidates(session, { query }) {
					return Promise.resolve(childLabels(session, query).map((name) => ({ name })));
				},
				lexicon(session) {
					return childLabels(session, "");
				},
				subscribeLexicon(_session, listener) {
					return sessions.list.subscribe(listener);
				},
				onPick({ candidate }) {
					return { text: `@${candidate.name} ` };
				},
				codec: {
					clipboardText: (ref) => `@${ref}`,
					serialize: (ref) => Promise.resolve(`@${ref}`)
				}
			};
			const inputTriggers = ctx.get("inputTriggers");
			ctx.effect(() => inputTriggers.registerSource(source), "ui-subagent: @ source");
			const catalogActions = (_parentSessionId) => ({
				openChild(address) {
					sessions.openSubagent(address);
				},
				refresh(parentSessionId) {
					sessions.refreshSubagents(parentSessionId);
				},
				setCatalogOpen(parentSessionId, open) {
					sessions.setSubagentCatalogOpen(parentSessionId, open);
				}
			});
			ctx.slots.inject("conversation.session.header.actions", () => ctx.slots.register({
				name: "conversation.session.header.actions",
				id: "subagent-catalog",
				order: 10,
				locale: NS,
				inject: catalogActions
			}, SubagentCatalogAction));
			ctx.slots.inject("conversation.composer", () => ctx.slots.register({
				name: "conversation.composer",
				priority: -10,
				locale: NS,
				select: selectReadOnlySubagent
			}, SubagentReadOnlyComposer));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map