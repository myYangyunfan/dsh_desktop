window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-client-ui-deliverables",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		let _deepseek_ai_dsh_client_runtime_client = require("@deepseek-ai/dsh-client-runtime/client");
		//#region lib/types/client/turn-deliverables.js
		/**
		* Paths a call view reports having created or changed, by render intent rather
		* than tool name: a diff card, or a generic card whose kind is `edit` (the
		* shape `str_replace_editor`'s insert presents). Every other card produces
		* nothing to open — a read looked, a delete removed, a terminal ran. Only
		* root call views enter this Turn accumulator; nested Code Mode dispatches
		* preserve the pre-assembly behavior and do not contribute independently.
		*/
		function producedPaths(view) {
			if (view === null) return [];
			if (view.card === "diff") return (view.locations ?? []).map((location) => location.path);
			if (view.card === "generic" && view.kind === "edit") return (view.locations ?? []).map((location) => location.path);
			return [];
		}
		/**
		* Files produced by one Turn data value.
		*
		* The source is the mutation tools' own follow-along `locations`, not the
		* closing prose: a produced file must be listed whether or not the model
		* remembered to name it. A mutation is recognized by render intent, not by
		* tool name — a diff card, or a generic card whose `kind` is `edit` (the shape
		* `str_replace_editor`'s insert presents) — so a new mutation tool joins by
		* declaring what it does. Reads contribute nothing (looking at a file does not
		* produce it), and neither do deletes (there is nothing left to open) or
		* failed calls. Paths keep first-seen order and appear once, so a file written
		* and then edited in the same turn is one entry.
		*
		* The Conversation Location index owns turn membership before this function
		* runs, so paths cannot spill across turns and this derivation does not infer
		* boundaries from neighboring presentation Nodes.
		* @param data - engine-published Deliverables data for one Turn.
		* @param seq - closing Assistant seq; later Tool settlements are excluded.
		* @returns Produced paths in first-seen order; empty when the turn wrote nothing.
		*/
		function producedForClosing(data, seq = Number.POSITIVE_INFINITY) {
			if (data === void 0) return [];
			const paths = [];
			const seen = /* @__PURE__ */ new Set();
			for (const produced of data.produced) {
				if (produced.seq > seq || seen.has(produced.path)) continue;
				seen.add(produced.path);
				paths.push(produced.path);
			}
			return paths;
		}
		/**
		* Claim the turn-tail chain only when its closing turn produced files.
		* @param owner - Turn-tail owner currency for the closing assistant.
		* @returns Produced paths as the component's match, or null to decline before mount.
		*/
		function selectProducedFiles(owner) {
			const paths = producedForClosing(owner.turn.data.get("deliverables"), owner.seq);
			return paths.length === 0 ? null : paths;
		}
		/** Turn-local successful mutation accumulator; it publishes no view Node. */
		const deliverablesDefinition = {
			kind: "deliverables",
			match: (event) => {
				if (event.type === "turn/start") return {
					id: String(event.data.turn),
					role: "start"
				};
				if (event.type === "tool/call") return {
					id: String(event.data.turn),
					role: "update"
				};
				if (event.type === "tool/result" && (0, _deepseek_ai_dsh_client_runtime_client.isAppendSurfaceEvent)(event)) return {
					id: String(event.data.turn),
					role: "update"
				};
				return null;
			},
			start: (_context, match) => {
				if (match.event.type !== "turn/start") throw new Error("deliverables start requires turn/start");
				return {
					turn: match.event.data.turn,
					calls: /* @__PURE__ */ new Map(),
					produced: []
				};
			},
			update: (context, match) => {
				if (match.event.type === "tool/call") {
					const calls = new Map(context.state.calls);
					calls.set(String(match.event.data.callId), match.view?.for === "call" ? match.view.view : null);
					return {
						...context.state,
						calls
					};
				}
				if (match.event.type !== "tool/result") return context.state;
				if (match.event.data.message.content[0].isError === true) return context.state;
				const callId = String(match.event.data.message.source.callId);
				const additions = producedPaths(context.state.calls.get(callId) ?? null).map((path) => ({
					seq: match.event.seq,
					path
				}));
				return additions.length === 0 ? context.state : {
					...context.state,
					produced: [...context.state.produced, ...additions]
				};
			},
			buildLocationData: (context, scope) => scope !== "turn" || context.state === void 0 ? null : {
				kind: "turn",
				turn: context.state.turn,
				key: "deliverables",
				value: { produced: context.state.produced }
			}
		};
		/**
		* Trailing path segment, the part that identifies the file at a glance.
		* @param path - Slash- or backslash-separated path.
		* @returns The final segment, or the whole string when separator-free.
		*/
		function basename(path) {
			const at = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
			return at === -1 ? path : path.slice(at + 1);
		}
		/**
		* File-mention vocabulary over one turn's produced paths, for the closing
		* message's prose: an inline-code token opens the file it names. A token
		* resolves by exact path, or by being exactly the basename of exactly one
		* produced path — a basename two paths share stays inert rather than
		* guessing, so a mention link can never open the wrong file or 404.
		* @param paths - The turn's produced paths (tool order, already deduped).
		* @param openFile - The chat view's file opener.
		* @param label - Localizes the accessible open-label for a resolved path.
		* @returns The resolver MarkdownText consumes; the full path rides `title`,
		* the same disambiguator the row's chips carry.
		*/
		function producedFileMentions(paths, openFile, label) {
			return { resolve(value) {
				const path = paths.includes(value) ? value : onlyPathWithBasename(paths, value);
				if (path === void 0) return void 0;
				return {
					open: () => {
						openFile(path);
					},
					label: label(path),
					title: path
				};
			} };
		}
		/** The single produced path whose basename is exactly `value`, else undefined. */
		function onlyPathWithBasename(paths, value) {
			const matches = paths.filter((path) => basename(path) === value);
			return matches.length === 1 ? matches[0] : void 0;
		}
		//#endregion
		//#region \0dsh-css:/home/runner/work/deepseek-harness/deepseek-harness/packages/client/ui-deliverables/src/client/ProducedFiles.module.css.mjs
		const css = ".P4kPIW_root{grid-template-columns:max-content minmax(0,1fr);align-items:center;gap:6px 8px;margin-top:16px;font-size:13px;line-height:22px;display:grid;position:relative}.P4kPIW_label{color:var(--dsw-alias-label-tertiary);grid-area:1/1}.P4kPIW_row{flex-wrap:nowrap;grid-area:1/2;align-items:center;gap:8px;min-width:0;display:flex;overflow:hidden}.P4kPIW_file{text-overflow:ellipsis;white-space:nowrap;background:var(--dsw-alias-interactive-bg-hover);max-width:320px;color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;border:none;border-radius:6px;flex:none;margin:0;padding:0 8px;overflow:hidden}.P4kPIW_file:hover{color:var(--dsw-alias-label-primary);text-decoration:underline}.P4kPIW_file:focus-visible,.P4kPIW_showFolder:focus-visible{box-shadow:inset 0 0 0 2px var(--dsw-alias-border-l3);outline:none}.P4kPIW_more{white-space:nowrap;color:var(--dsw-alias-label-tertiary);flex:none}.P4kPIW_showFolder{color:var(--dsw-alias-label-tertiary);font:inherit;cursor:pointer;background:0 0;border:none;border-radius:4px;grid-area:2/2;justify-self:start;margin:0;padding:0 2px;line-height:20px}.P4kPIW_showFolder:hover{color:var(--dsw-alias-label-secondary);text-decoration:underline}.P4kPIW_measure{visibility:hidden;pointer-events:none;contain:strict;width:0;height:0;position:absolute;overflow:hidden}.P4kPIW_probe{width:max-content;position:absolute;inset:0 auto auto 0}";
		const tagId = "@deepseek-ai/dsh-client-ui-deliverables/ProducedFiles.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-deliverables";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var ProducedFiles_module_css_default = {
			"showFolder": "P4kPIW_showFolder",
			"file": "P4kPIW_file",
			"root": "P4kPIW_root",
			"measure": "P4kPIW_measure",
			"label": "P4kPIW_label",
			"probe": "P4kPIW_probe",
			"row": "P4kPIW_row",
			"more": "P4kPIW_more"
		};
		//#endregion
		//#region lib/types/client/ProducedFiles.js
		/** At most six chips compete for the one-line summary; every other path stays counted. */
		const SHOWN_LIMIT = 6;
		/**
		* Select the largest prefix whose measured chips and exact remainder fit.
		* @param available - usable width of the one-line file lane.
		* @param gap - computed flex gap between adjacent visible items.
		* @param chipWidths - measured widths for the candidate file chips.
		* @param moreWidthsByShown - exact localized remainder width for each shown count.
		* @returns Number of leading chips to render.
		*/
		function fitProducedFiles(available, gap, chipWidths, moreWidthsByShown) {
			if (available <= 0) return chipWidths.length;
			const prefix = [0];
			let prefixWidth = 0;
			for (const width of chipWidths) {
				prefixWidth += width;
				prefix.push(prefixWidth);
			}
			let largestFit = 0;
			for (const [shown, width] of prefix.entries()) {
				const more = moreWidthsByShown[shown];
				const items = shown + (more === void 0 ? 0 : 1);
				if (width + (more ?? 0) + Math.max(0, items - 1) * gap <= available) largestFit = shown;
			}
			return largestFit;
		}
		function moreLabel(t, count) {
			return count === 1 ? t("produced.moreOne") : t("produced.more", { count: String(count) });
		}
		/**
		* Render one turn's produced files as openable chips.
		* @param props - selector-matched paths, the chat view's file opener, and the locale seat.
		* @returns The produced-files row.
		*/
		function ProducedFiles({ matched: paths, openFile, isLoopback, useHostDescription, t }) {
			const hostCanOpenPath = useHostDescription((description) => description?.canOpenPath === true);
			const canOpenPath = isLoopback && hostCanOpenPath;
			const limit = Math.min(paths.length, SHOWN_LIMIT);
			const [shownCount, setShownCount] = (0, react.useState)(limit);
			const rowRef = (0, react.useRef)(null);
			const chipProbes = (0, react.useRef)([]);
			const moreProbe = (0, react.useRef)(null);
			(0, react.useLayoutEffect)(() => {
				const row = rowRef.current;
				const remainderProbe = moreProbe.current;
				/* v8 ignore next -- React attaches both refs before the layout effect runs. */
				if (row === null || remainderProbe === null) return;
				const measure = () => {
					const styles = getComputedStyle(row);
					const gap = Number.parseFloat(styles.columnGap || styles.gap) || 0;
					const chips = chipProbes.current.slice(0, limit).map((probe) => probe.getBoundingClientRect().width);
					const more = Array.from({ length: limit + 1 }, (_, candidate) => {
						if (paths.length === candidate) return void 0;
						remainderProbe.textContent = moreLabel(t, paths.length - candidate);
						return remainderProbe.getBoundingClientRect().width;
					});
					setShownCount(fitProducedFiles(row.clientWidth, gap, chips, more));
				};
				measure();
				if (typeof ResizeObserver === "undefined") return;
				const observer = new ResizeObserver(measure);
				observer.observe(row);
				for (const probe of [...chipProbes.current, moreProbe.current]) if (probe !== null) observer.observe(probe);
				return () => {
					observer.disconnect();
				};
			}, [
				limit,
				paths,
				t
			]);
			const visibleCount = Math.min(shownCount, limit);
			const shown = paths.slice(0, visibleCount);
			const hidden = paths.length - shown.length;
			return (0, react_jsx_runtime.jsxs)("div", {
				className: ProducedFiles_module_css_default.root,
				children: [
					(0, react_jsx_runtime.jsx)("span", {
						className: ProducedFiles_module_css_default.label,
						children: t("produced.label")
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						ref: rowRef,
						className: ProducedFiles_module_css_default.row,
						"data-produced-files-row": true,
						children: [shown.map((path) => (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: ProducedFiles_module_css_default.file,
							title: path,
							"aria-label": t("produced.open", { name: path }),
							onClick: () => {
								openFile(path);
							},
							children: basename(path)
						}, path)), hidden > 0 && (0, react_jsx_runtime.jsx)("span", {
							className: ProducedFiles_module_css_default.more,
							children: moreLabel(t, hidden)
						})]
					}),
					hidden > 0 && canOpenPath && (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: ProducedFiles_module_css_default.showFolder,
						onClick: () => {
							openFile(".");
						},
						children: t("produced.showInFolder")
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: ProducedFiles_module_css_default.measure,
						"aria-hidden": "true",
						children: [paths.slice(0, limit).map((path, index) => (0, react_jsx_runtime.jsx)("button", {
							ref: (node) => {
								chipProbes.current[index] = node;
							},
							type: "button",
							tabIndex: -1,
							className: `${ProducedFiles_module_css_default.file} ${ProducedFiles_module_css_default.probe}`,
							children: basename(path)
						}, path)), (0, react_jsx_runtime.jsx)("span", {
							ref: moreProbe,
							className: `${ProducedFiles_module_css_default.more} ${ProducedFiles_module_css_default.probe}`
						})]
					})
				]
			});
		}
		//#endregion
		//#region lib/types/client/locales.js
		/** `deliverables` namespace dictionaries. */
		/** Dictionary namespace owned by this plugin. */
		const NS = "deliverables";
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"produced.label": "产物",
			"produced.moreOne": "+ 1 个文件",
			"produced.more": "+ {count} 个文件",
			"produced.open": "打开 {name}",
			"produced.showInFolder": "在文件夹中显示"
		};
		/** English dictionary (same key set). */
		const en = {
			"produced.label": "Produced",
			"produced.moreOne": "+ 1 file",
			"produced.more": "+ {count} files",
			"produced.open": "Open {name}",
			"produced.showInFolder": "Show in folder"
		};
		//#endregion
		//#region lib/types/client/index.js
		/** Required services for the tail-slot registration and its dictionaries. */
		const inject = [
			"slots",
			"locale",
			"conversationEvents",
			"connection"
		];
		/**
		* Client plugin body: register the dictionaries and the turn-tail entry.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			const connection = ctx.get("connection");
			ctx.conversationEvents.register(deliverablesDefinition);
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "ui-deliverables: dictionaries");
			ctx.slots.inject("conversation.chat.turnTail", () => ctx.slots.register({
				name: "conversation.chat.turnTail",
				select: selectProducedFiles,
				locale: NS,
				inject: () => ({
					isLoopback: connection.isLoopback,
					hooks: { hostDescription: connection.hostDescription }
				})
			}, ProducedFiles));
			const t = ctx.locale.bind(NS);
			ctx.provide("chatFileMentions", { forClosing(owner) {
				const paths = selectProducedFiles(owner);
				if (paths === null) return void 0;
				return producedFileMentions(paths, owner.openFile, (path) => t("produced.open", { name: path }));
			} });
		}
		//#endregion
		exports.ProducedFiles = ProducedFiles;
		exports.apply = apply;
		exports.inject = inject;
		exports.producedForClosing = producedForClosing;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map