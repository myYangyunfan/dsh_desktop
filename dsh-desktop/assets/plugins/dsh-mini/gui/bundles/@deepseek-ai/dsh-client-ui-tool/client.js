window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-client-ui-tool",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let _deepseek_ai_dsh_client_runtime_client = require("@deepseek-ai/dsh-client-runtime/client");
		//#region lib/types/client/tool/models/tool-call-model.js
		/** Figma row titles per variant (design literals, not translatable copy). */
		const VARIANT_TITLES = {
			search: "Search",
			read: "Read",
			bash: "Bash",
			write: "Write",
			edit: "Edit",
			code: "Code",
			others: "Tool call"
		};
		/**
		* Known tool name -> variant.
		*
		* `cordis_define` is deliberately absent: ui-cordis registers a keyed
		* `tool.call.toolview` entry for it, and a keyed hit REPLACES the generic row
		* (this table is only reached through GenericToolCard, the dispatch fallback in
		* ToolCallTree). An entry here would be unreachable, and a second title for the
		* same call would be a second answer to a question the card already owns.
		*/
		const TOOL_VARIANTS = {
			bash: "bash",
			pwsh: "bash",
			read: "read",
			web_fetch: "read",
			web_search: "search",
			grep: "search",
			glob: "search",
			write: "write",
			edit: "edit",
			run_code: "code",
			cordis_package_inspect: "read",
			cordis_runtime_inspect: "read",
			cordis_run: "others",
			cordis_stop: "others",
			cordis_undefine: "others"
		};
		/** Tool-owned titles that refine a generic row variant without replacing it. */
		const TOOL_TITLES = {
			cordis_package_inspect: "Inspect",
			cordis_runtime_inspect: "Inspect",
			cordis_run: "Run Cordis Plugin",
			cordis_stop: "Stop Cordis Plugin",
			cordis_undefine: "Remove Cordis Plugin",
			pwsh: "Pwsh"
		};
		/**
		* Classify a tool name into its row variant.
		* @param toolName - wire tool name.
		* @returns matching variant, others when unknown.
		*/
		function classifyTool(toolName) {
			return TOOL_VARIANTS[toolName] ?? "others";
		}
		/**
		* Flatten a settled result's content blocks to display text: text blocks
		* verbatim, other block shapes as pretty JSON. Empty content on a failed call
		* falls back to the structured error's `name: code` line.
		* @param node - the settled result node.
		* @returns the flattened result text (may be empty).
		*/
		function resultText(node) {
			const parts = [];
			for (const block of node.content) if (block.type === "text") parts.push(block.text);
			else parts.push(JSON.stringify(block, null, 2));
			if (parts.length === 0 && node.error !== void 0) parts.push(`${node.error.name}: ${node.error.code}`);
			return parts.join("\n");
		}
		function parseArgs(argsRaw) {
			try {
				return JSON.parse(argsRaw);
			} catch {
				return;
			}
		}
		function firstLine(text) {
			const nl = text.indexOf("\n");
			return nl === -1 ? text : text.slice(0, nl);
		}
		function pickString(args, keys) {
			for (const key of keys) {
				const v = args[key];
				if (typeof v === "string" && v !== "") return v;
			}
		}
		/** Summary key preference per variant (args-derived; result-derived summaries are a ledger item). */
		const SUMMARY_KEYS = {
			bash: ["description", "command"],
			read: [
				"path",
				"file_path",
				"url"
			],
			search: [
				"query",
				"pattern",
				"url"
			],
			write: ["path", "file_path"],
			edit: ["path", "file_path"],
			code: ["description"],
			others: []
		};
		/**
		* Strip the workspace root from a workspace-rooted absolute path (display only).
		* @param text - the path to shorten.
		* @param cwd - session workspace root; absent or empty leaves the path unchanged.
		* @returns the path relative to the workspace root, or unchanged when it is not rooted there.
		*/
		function relativizeToCwd(text, cwd) {
			if (cwd === void 0 || cwd === "") return text;
			const root = cwd.replace(/[/\\]+$/, "");
			if (text.startsWith(`${root}/`) || text.startsWith(`${root}\\`)) return text.slice(root.length + 1);
			return text;
		}
		function deriveSummary(variant, argsRaw) {
			const parsed = parseArgs(argsRaw);
			if (typeof parsed !== "object" || parsed === null) return firstLine(argsRaw);
			const args = parsed;
			const picked = pickString(args, SUMMARY_KEYS[variant]);
			if (picked !== void 0) return firstLine(picked);
			for (const v of Object.values(args)) if (typeof v === "string" && v !== "") return firstLine(v);
			return firstLine(argsRaw);
		}
		/** Path keys only — never `url` (web_fetch lands on the read variant). */
		const FILE_PATH_KEYS = ["path", "file_path"];
		/** File-tool variants whose summary may be an openable workspace path. */
		const FILE_PATH_VARIANTS = new Set([
			"read",
			"write",
			"edit"
		]);
		function deriveFilePath(variant, argsRaw) {
			if (!FILE_PATH_VARIANTS.has(variant)) return void 0;
			const parsed = parseArgs(argsRaw);
			if (typeof parsed !== "object" || parsed === null) return void 0;
			const picked = pickString(parsed, FILE_PATH_KEYS);
			return picked === void 0 ? void 0 : firstLine(picked);
		}
		function deriveBody(variant, argsRaw) {
			if (argsRaw === "") return null;
			const parsed = parseArgs(argsRaw);
			if (parsed === void 0) return argsRaw;
			if (variant === "code" && typeof parsed === "object" && parsed !== null) {
				const code = parsed.code;
				if (typeof code === "string" && code !== "") return code;
			}
			return JSON.stringify(parsed, null, 2);
		}
		/**
		* Derive the full row model from a frozen call slice.
		* @param toolName - wire tool name (dispatch-supplied; survives windowless results).
		* @param block - RunningToolCall or ToolResultNode off the snapshot caches.
		* @param cwd - session workspace root; workspace-rooted path summaries display relative to it.
		* @returns the row model.
		*/
		function toolRowModel(toolName, block, cwd) {
			const variant = classifyTool(toolName);
			const done = "kind" in block;
			const argsRaw = (done ? block.call?.argsRaw : block.argsRaw) ?? "";
			const state = !done ? "running" : block.error?.code === "interrupted" ? "stopped" : block.isError ? "error" : "ok";
			const base = argsRaw === "" ? block.callId : relativizeToCwd(deriveSummary(variant, argsRaw), cwd);
			const toolTitle = TOOL_TITLES[toolName];
			const summary = variant === "others" && toolName !== "" && toolTitle === void 0 ? `${toolName} · ${base}` : base;
			const output = done ? resultText(block) || null : null;
			const errorSummary = state === "error" && output !== null ? firstLine(output) : null;
			return {
				variant,
				title: toolTitle ?? VARIANT_TITLES[variant],
				summary,
				filePath: deriveFilePath(variant, argsRaw),
				body: deriveBody(variant, argsRaw),
				output,
				errorSummary,
				state
			};
		}
		//#endregion
		//#region lib/types/client/tool/models/read-card-model.js
		/**
		* Derive the read-card props for a tool call, or null when this call is not a
		* read card and belongs on the generic path.
		*
		* The read card is result-side only, so only a settled call whose result view
		* declares `card:'read'` produces one. Every other case is null — the
		* documented generic-card default:
		*
		* - A running call: it has no result view yet, and a read carries no content at
		*   call time.
		* - A settled call whose result view is not a read card — including a `card`
		*   value this UI version does not know, which arrives over the wire and cannot
		*   be trusted to be one of the compiled variants, and the read tool's own
		*   generic fallback for an error result or a non-envelope body.
		*
		* The label is the read view's `title` when the tool supplied one (the
		* presentation contract's replacement-title rule), otherwise the file path
		* relativized to the session workspace so a workspace-rooted absolute path
		* displays the same short form the row summary shows.
		* @param block - RunningToolCall or ToolResultNode off the snapshot caches.
		* @param sessionCwd - the session workspace root; a workspace-rooted absolute
		*   path label displays relative to it. Absent leaves the path as authored.
		* @returns the read-card props, or null for the generic path.
		*/
		function readCardModel(block, sessionCwd) {
			if (!("kind" in block)) return null;
			const result = block.resultView?.card === "read" ? block.resultView : null;
			if (result === null) return null;
			const lines = result.lines.map((line) => ({
				number: line.number,
				text: line.text
			}));
			return {
				label: result.title ?? relativizeToCwd(result.path, sessionCwd),
				lines,
				totalLines: result.totalLines,
				lang: result.lang
			};
		}
		//#endregion
		//#region lib/types/client/tool/models/diff-card-model.js
		/**
		* Narrow a wire `card:'diff'` view's `diffs` to well-formed hunks. The event
		* view crosses the wire and `toolEventViewSchema` validates only the `card`
		* string, so a version mismatch or an anomalous plugin can deliver a `diff` card
		* whose `diffs` is absent, not an array, or carries malformed hunks. Returning
		* null for any of those routes the block to the generic path instead of letting
		* DiffBlock's `for...of`/`split` throw and crash the row or the details panel.
		* @param diffs - the view's `diffs` field, unverified.
		* @returns the validated hunks, or null when the payload is not usable.
		*/
		function narrowDiffs(diffs) {
			if (!Array.isArray(diffs) || diffs.length === 0) return null;
			const out = [];
			for (const hunk of diffs) {
				if (typeof hunk !== "object" || hunk === null) return null;
				const { path, oldText, newText } = hunk;
				if (typeof path !== "string") return null;
				if (oldText !== null && typeof oldText !== "string") return null;
				if (typeof newText !== "string") return null;
				out.push({
					path,
					oldText,
					newText
				});
			}
			return out;
		}
		/**
		* Derive the diff-card props for a tool call, or null when this call is not a
		* diff card and belongs on the generic path.
		*
		* The result side is authoritative once the call settles: the write/edit tools
		* return the applied contextual hunks there (an edit's real before/after, a
		* create's whole-file diff), which replace the call-time diff derived from the
		* arguments alone. While the call is still running only the call side exists,
		* so a running write/edit shows its intended change. Null is the documented
		* generic-card default and covers every non-diff card — including a `card`
		* value this UI version does not know, which arrives over the wire and cannot
		* be trusted to be one of the compiled variants — and a settled call whose
		* result view is generic (how write/edit keep their execution errors on the
		* generic path).
		*
		* This derivation consumes only `diffs`; the render intent's `title` field is
		* deliberately dropped. The row supplies its own title (`Edit`/`Write · path`
		* from the args), which outranks the view's `title`. A tool that names its own
		* diff header therefore does not surface that text on the Web row.
		* @param block - RunningToolCall or ToolResultNode off the snapshot caches.
		* @returns the diff-card props, or null for the generic path.
		*/
		function diffCardModel(block) {
			if (!("kind" in block)) {
				const call = block.callView?.card === "diff" ? block.callView : null;
				const diffs = call === null ? null : narrowDiffs(call.diffs);
				return diffs === null ? null : { card: { diffs } };
			}
			const result = block.resultView?.card === "diff" ? block.resultView : null;
			const diffs = result === null ? null : narrowDiffs(result.diffs);
			return diffs === null ? null : { card: { diffs } };
		}
		//#endregion
		//#region lib/types/client/tool/models/search-card-model.js
		/**
		* Whether every file group in a matches view is structurally valid: the wire
		* frame carries `shape` and `card` as strings the host schema checks, but not the
		* grouped `files` fields, so a version mismatch or loose producer could deliver
		* `shape: 'matches'` with a missing or malformed `files`. Rendering that would
		* crash {@link SearchBlock} at `.reduce`/`.map`; invalid fields select the
		* generic path instead.
		* @param files - the candidate `files` field off the untrusted result view.
		* @returns whether `files` is a valid {@link SearchFileGroup} array.
		*/
		function isValidFiles(files) {
			return Array.isArray(files) && files.every((file) => typeof file === "object" && file !== null && typeof file.path === "string" && Array.isArray(file.matches) && file.matches.every((match) => typeof match === "object" && match !== null && typeof match.lineNumber === "number" && typeof match.line === "string"));
		}
		/**
		* Flatten a settled tool result's content blocks to their text, joined by
		* newlines. The search view carries no result text — a UI without a card falls
		* back to the raw `tool/result` content — so the truncation recovery footer is
		* read from the block's own content here. Non-text blocks (a search result
		* carries none) are skipped.
		* @param content - the result node's content blocks.
		* @returns the joined text, or undefined when empty.
		*/
		function flattenContent(content) {
			const text = content.filter((block) => block.type === "text" && typeof block.text === "string").map((block) => block.text).join("\n");
			return text === "" ? void 0 : text;
		}
		/**
		* Derive the search-card props for a tool call, or null when this call is not a
		* search card and belongs on the generic path.
		*
		* Only the result side matters: the search card carries no call-time state, so
		* a still-running call (no result view) is null, as is a settled call whose
		* result view is not a search card — including a `card` value this UI version
		* does not know, which arrives over the wire and cannot be trusted to be one of
		* the compiled variants, a `card: 'search'` view whose `shape` is neither
		* `matches` nor `paths` (equally untrusted wire data), and a generic result a
		* `grep`/`glob` failure or nested `run_code` dispatch produces (its text keeps
		* the generic path).
		* @param block - RunningToolCall or ToolResultNode off the snapshot caches.
		* @returns the search-card props, or null for the generic path.
		*/
		function searchCardModel(block) {
			if (!("kind" in block)) return null;
			const result = block.resultView?.card === "search" ? block.resultView : null;
			if (result === null) return null;
			const common = {
				truncated: result.truncated,
				total: result.total
			};
			const recovery = result.truncated ? flattenContent(block.content) : void 0;
			if (result.shape === "matches") {
				if (!isValidFiles(result.files)) return null;
				return {
					title: result.title,
					recovery,
					card: {
						kind: "matches",
						files: result.files,
						...common
					}
				};
			}
			if (result.shape !== "paths") return null;
			if (!Array.isArray(result.paths) || !result.paths.every((path) => typeof path === "string")) return null;
			return {
				title: result.title,
				recovery,
				card: {
					kind: "paths",
					paths: result.paths,
					...common
				}
			};
		}
		//#endregion
		//#region lib/types/client/tool/models/terminal-card-model.js
		/**
		* Pure derivation of the terminal-card props from a frozen call slice: the
		* `card:'terminal'` render intent the shell tools declare arrives on the
		* snapshot as `callView`/`resultView`, and this is the one place that turns
		* that pair into what {@link TerminalBlock} draws. Both conversation render
		* sites (the chat tool row's expanded body and the details panel's Output
		* section) call this, so the command, cwd, output and exit status they show
		* are derived once.
		* @module
		*/
		/**
		* Build the TerminalBlock display copy from the conversation locale seat —
		* the one place the primitive's label surface pairs with this package's
		* dictionary, shared by every terminal render site (chat row, bash row,
		* details panel).
		* @param t - the render site's conversation locale seat.
		* @returns the full label set for {@link TerminalBlockProps}'s `labels`.
		*/
		function terminalBlockLabels(t) {
			return {
				signal: (signal) => t("terminal.signal", { signal }),
				exitCode: (code) => t("terminal.exitCode", { code }),
				running: t("terminal.running"),
				failed: t("terminal.failed"),
				done: t("terminal.done"),
				copy: t("copy"),
				copied: t("copied"),
				noOutput: t("terminal.noOutput"),
				collapseAria: t("terminal.collapseAria"),
				collapse: t("collapse"),
				expandAria: (hidden) => t("terminal.expandAria", { n: hidden }),
				expand: (hidden) => t("terminal.expandRest", { n: hidden })
			};
		}
		/**
		* True when a settled terminal card reports a failing exit — a non-zero code
		* or a terminating signal. The bash tool settles a failing command as a
		* completed call (`isError` stays false: the exit status is result data), so
		* this is the collapsed row's only failure signal; without it the red exit
		* pill would be visible only after expanding the card.
		* @param model - a derived terminal card.
		* @returns whether the card's exit status is a failure.
		*/
		function terminalFailed(model) {
			const { exitCode, signal, running } = model.card;
			return running !== true && (exitCode !== void 0 && exitCode !== 0 || signal !== void 0);
		}
		/**
		* Resolve a terminal view's working directory the way the render-intent
		* contract assigns to the UI bridge: an absolute path is used as-is, a relative
		* one joins under the session workspace, and an omitted one IS the session
		* workspace. A pure presenter cannot see the session cwd, which is why this
		* resolution belongs here rather than in the tool. Without a session cwd there
		* is nothing to resolve against, so a relative path stays as authored and an
		* omitted one stays absent (the prompt row then draws a bare `$`).
		* @param viewCwd - the cwd the terminal call view carries, if any.
		* @param sessionCwd - the session workspace root, if the caller knows it.
		* @returns the working directory for the prompt label, or undefined.
		*/
		function resolveTerminalCwd(viewCwd, sessionCwd) {
			if (viewCwd === void 0 || viewCwd === "") return sessionCwd;
			if (sessionCwd === void 0 || sessionCwd === "") return normalizeSegments(viewCwd);
			return normalizeSegments((0, _deepseek_ai_dsh_client_runtime_client.resolveWorkspacePath)(sessionCwd, viewCwd));
		}
		/**
		* Collapse `.` and `..` segments so the prompt label names the directory the
		* command actually ran in. The bash executor resolves the workdir before
		* running, so a joined `/w/app/..` must display as `w`, not as `..`. Separators
		* are preserved as authored (a Windows path keeps its backslashes) because this
		* value is only ever displayed; a `..` that would climb past the root is
		* dropped, which is what a filesystem does with it. A UNC path's `server` and
		* `share` are part of its root, not poppable segments: Windows cannot climb
		* above a share, so `\\\\server\\share` with a `..` stays there.
		* @param path - a joined or absolute path, possibly carrying `.`/`..` segments.
		* @returns the same path with those segments resolved.
		*/
		function normalizeSegments(path) {
			if (!/(?:^|[/\\])\.\.?(?:[/\\]|$)/.test(path)) return path;
			const unc = /^[/\\]{2}([^/\\]+)[/\\]+([^/\\]+)/.exec(path);
			if (unc !== null) {
				const [matched, server, share] = unc;
				const root = `\\\\${String(server)}\\${String(share)}`;
				const rest = collapse(path.slice(matched.length), true);
				return rest === "" ? root : `${root}\\${rest}`;
			}
			const separator = path.includes("\\") && !path.includes("/") ? "\\" : "/";
			const rooted = /^[/\\]/.test(path);
			const drive = /^[A-Za-z]:/.exec(path)?.[0] ?? "";
			const body = collapse(path.slice(drive.length), rooted || drive !== "", separator);
			const leading = rooted ? separator : "";
			return drive === "" ? `${leading}${body}` : `${drive}${rooted ? leading : separator}${body}`;
		}
		/**
		* Collapse the `.`/`..` segments of a path body against a known root state.
		* @param body - the path after any drive letter or UNC root.
		* @param rooted - the body hangs off a root, so a `..` at its top is dropped
		*   the way a filesystem drops one; without a root the `..` is kept, since it
		*   stays meaningful against a cwd this function cannot see.
		* @param separator - separator to rejoin with (default `/`).
		* @returns the collapsed body, without leading or trailing separators.
		*/
		function collapse(body, rooted, separator = "/") {
			const kept = [];
			for (const segment of body.split(/[/\\]/)) {
				if (segment === "" || segment === ".") continue;
				if (segment === "..") {
					if (kept.length > 0 && kept[kept.length - 1] !== "..") kept.pop();
					else if (!rooted) kept.push(segment);
					continue;
				}
				kept.push(segment);
			}
			return kept.join(separator);
		}
		/**
		* Derive the terminal-card props for a tool call, or null when this call is
		* not a terminal card and belongs on the generic path.
		*
		* The call side supplies the command and its working directory; the result
		* side supplies the captured output and exit status. Three cases produce
		* null, all of them the documented generic-card default:
		*
		* - Neither side declares `card:'terminal'` — including a `card` value this
		*   UI version does not know, which arrives over the wire and therefore
		*   cannot be trusted to be one of the compiled variants.
		* - A settled call whose result view is not a terminal card: the result
		*   presentation decides how the settled call renders, and the bash tool
		*   returns a generic fenced card for an execution error or a background
		*   start, whose text and error styling the generic path preserves.
		*
		* Window truncation can drop the call head from a settled result (see
		* `ToolResultNode.call`/`callView` in dsh-client-runtime), leaving a terminal
		* result with no call side. That still renders: the command falls back to the
		* result view's replacement title, then to an empty command (the prompt line
		* draws bare), and the prompt shows no cwd.
		* @param block - RunningToolCall or ToolResultNode off the snapshot caches.
		* @param sessionCwd - the session workspace root, which resolves an omitted or
		*   relative view cwd (see {@link resolveTerminalCwd}); absent leaves both unresolved.
		* @returns the terminal-card props, or null for the generic path.
		*/
		function terminalCardModel(block, sessionCwd) {
			const call = block.callView?.card === "terminal" ? block.callView : null;
			if (!("kind" in block)) return call === null ? null : {
				description: call.description,
				card: {
					command: call.title,
					cwd: resolveTerminalCwd(call.cwd, sessionCwd),
					output: void 0,
					exitCode: void 0,
					signal: void 0,
					running: true
				}
			};
			const result = block.resultView?.card === "terminal" ? block.resultView : null;
			if (result === null) return null;
			return {
				description: call?.description,
				card: {
					command: result.title ?? call?.title ?? "",
					cwd: call === null ? void 0 : resolveTerminalCwd(call.cwd, sessionCwd),
					output: result.output,
					exitCode: result.exitCode,
					signal: result.signal,
					running: false
				}
			};
		}
		//#endregion
		//#region lib/types/client/tool/models/web-card-model.js
		/**
		* Derive the web-card props for a tool call, or null when this call is not a
		* web card and belongs on the generic path.
		*
		* The result side supplies the whole card: the sources and answer for a
		* `search`, the URL and status for a `fetch`. Cases producing null, all of
		* them the documented generic-card default:
		*
		* - A running call (no `resultView` yet): the web tools keep a generic pending
		*   card, so nothing web-shaped exists until the call settles.
		* - A settled call whose result view is not a web card — including a `card`
		*   value this UI version does not know, which arrives over the wire and so
		*   cannot be trusted to be one of the compiled variants, and a generic result
		*   view (a web tool's error path returns the generic card, whose text the
		*   generic path preserves).
		* - A web card whose `kind` this UI version does not know (a newer host's
		*   value): the wire cannot be trusted to be `search` or `fetch`, so it takes
		*   the generic path rather than rendering as a malformed fetch.
		* @param block - RunningToolCall or ToolResultNode off the snapshot caches.
		* @returns the web-card props, or null for the generic path.
		*/
		function webCardModel(block) {
			if (!("kind" in block)) return null;
			const result = block.resultView;
			if (result?.card !== "web") return null;
			if (result.kind === "search") return {
				kind: "search",
				answer: result.answer,
				sources: result.sources.map((source) => ({
					url: source.url,
					title: source.title,
					snippet: source.snippet,
					publishedAt: source.publishedAt
				})),
				truncated: result.truncated
			};
			if (result.kind === "fetch") return {
				kind: "fetch",
				url: result.url,
				statusCode: result.statusCode,
				truncated: result.truncated
			};
			return null;
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
		//#region \0dsh-css:/home/runner/work/deepseek-harness/deepseek-harness/packages/client/ui-tool/src/client/tool/components/ToolRow.module.css.mjs
		const css$3 = ".o3BgMG_root{flex-direction:column;display:flex}.o3BgMG_row{position:relative;overflow:hidden}.o3BgMG_root[data-state=running] .o3BgMG_row:after{content:\"\";background:linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--dsw-alias-bg-base) 60%, transparent) 55%, transparent 100%);pointer-events:none;width:300px;animation:2.6s ease-out infinite o3BgMG_dsh-tool-row-sweep;position:absolute;top:0;bottom:0;left:0}@keyframes o3BgMG_dsh-tool-row-sweep{0%{left:-300px}90%,to{left:100%}}.o3BgMG_leading{flex-shrink:0}.o3BgMG_root[data-tool^=cordis_] .o3BgMG_leading,.o3BgMG_root[data-tool^=cordis_] .o3BgMG_title{color:var(--dsw-alias-state-business-primary)}.o3BgMG_root[data-tool^=cordis_] .o3BgMG_title{font-weight:500}.o3BgMG_root[data-tool^=cordis_] .o3BgMG_sep{background:var(--dsw-alias-state-business-primary)}.o3BgMG_chevron{color:var(--dsw-alias-label-secondary)}.o3BgMG_title{font-weight:400}.o3BgMG_sep{background:var(--dsw-alias-label-caption);border-radius:1px;flex:none;width:2px;height:2px;margin:0 8px}.o3BgMG_summary{text-overflow:ellipsis;white-space:nowrap;min-width:0;color:var(--dsw-alias-label-tertiary);flex:auto;font-size:14px;line-height:24px;overflow:hidden}.o3BgMG_summarySuffix{white-space:nowrap;color:var(--dsw-alias-label-tertiary);flex:none;margin-left:4px;font-size:14px;line-height:24px}.o3BgMG_fileLink{text-overflow:ellipsis;white-space:nowrap;min-width:0;font:inherit;text-align:left;color:var(--dsw-alias-label-secondary);text-decoration:underline;text-decoration-color:var(--dsw-alias-label-quaternary);text-underline-offset:3px;cursor:pointer;background:0 0;border:none;flex:auto;margin:0;padding:0;font-size:14px;line-height:24px;overflow:hidden}.o3BgMG_fileLink:hover{color:var(--dsw-alias-label-primary);text-decoration-color:currentColor}.o3BgMG_errorSummary{color:var(--dsw-alias-state-error-primary)}.o3BgMG_bodyWrap{flex-direction:column;display:flex}.o3BgMG_inspectButton{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary);cursor:pointer;opacity:0;border-radius:999px;align-self:flex-start;align-items:center;gap:4px;margin:4px 0 2px 4px;padding:2px 8px;font-size:11px;line-height:16px;transition:opacity .1s;display:inline-flex}.o3BgMG_root:hover .o3BgMG_inspectButton,.o3BgMG_inspectButton:focus-visible{opacity:1}.o3BgMG_inspectButton:hover{background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary)}.o3BgMG_bodyScroll{max-height:260px;overflow-y:auto}.o3BgMG_ioCard{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-markdown-code-block);font:var(--dsw-font-markdown-code-block-small);border-radius:12px;flex-direction:column;margin:4px 0 4px 4px;display:flex}.o3BgMG_ioSection{grid-template-columns:max-content 1fr;align-items:baseline;column-gap:14px;max-height:150px;padding:12px 16px;display:grid;overflow-y:auto}.o3BgMG_ioSection::-webkit-scrollbar-thumb{background-clip:padding-box;border:2px solid #0000;border-radius:6px}.o3BgMG_ioSection::-webkit-scrollbar-track{margin:6px 0}.o3BgMG_ioLabel{color:var(--dsw-alias-label-caption);align-self:start;position:sticky;top:0}.o3BgMG_ioDivider{background:var(--dsw-alias-border-l2);flex:none;height:1px}.o3BgMG_ioText{white-space:pre-wrap;word-break:break-word;min-width:0;color:var(--dsw-alias-label-secondary)}.o3BgMG_ioText[data-error]{color:var(--dsw-alias-state-error-primary)}.o3BgMG_codeBody,.o3BgMG_terminalBody,.o3BgMG_diffBody,.o3BgMG_readBody,.o3BgMG_searchBody,.o3BgMG_webBody{margin:4px 0 4px 4px}.o3BgMG_searchRecovery{white-space:pre-wrap;overflow-wrap:anywhere;font:var(--dsw-font-xs-13);color:var(--dsw-alias-label-tertiary);margin:4px 0 4px 4px}.o3BgMG_codeBody{--dsl-code-block-content-font:var(--dsw-font-markdown-code-block-small)}.o3BgMG_terminalBody{--dsl-terminal-font:var(--dsw-font-markdown-code-block-small);--dsl-terminal-line-height:18px;--dsl-terminal-output-max-height:224px;border:1px solid var(--dsw-alias-border-l1)}.o3BgMG_visuallyHidden{clip:rect(0 0 0 0);white-space:nowrap;width:1px;height:1px;position:absolute;overflow:hidden}";
		const tagId$3 = "@deepseek-ai/dsh-client-ui-tool/ToolRow.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$3) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-tool";
			tag.dataset.pluginCss = tagId$3;
			tag.textContent = css$3;
			document.head.appendChild(tag);
		}
		var ToolRow_module_css_default = {
			"chevron": "o3BgMG_chevron",
			"bodyScroll": "o3BgMG_bodyScroll",
			"row": "o3BgMG_row",
			"inspectButton": "o3BgMG_inspectButton",
			"ioSection": "o3BgMG_ioSection",
			"ioText": "o3BgMG_ioText",
			"readBody": "o3BgMG_readBody",
			"ioCard": "o3BgMG_ioCard",
			"searchRecovery": "o3BgMG_searchRecovery",
			"visuallyHidden": "o3BgMG_visuallyHidden",
			"root": "o3BgMG_root",
			"searchBody": "o3BgMG_searchBody",
			"webBody": "o3BgMG_webBody",
			"leading": "o3BgMG_leading",
			"dsh-tool-row-sweep": "o3BgMG_dsh-tool-row-sweep",
			"terminalBody": "o3BgMG_terminalBody",
			"codeBody": "o3BgMG_codeBody",
			"diffBody": "o3BgMG_diffBody",
			"fileLink": "o3BgMG_fileLink",
			"summary": "o3BgMG_summary",
			"title": "o3BgMG_title",
			"errorSummary": "o3BgMG_errorSummary",
			"sep": "o3BgMG_sep",
			"summarySuffix": "o3BgMG_summarySuffix",
			"ioLabel": "o3BgMG_ioLabel",
			"ioDivider": "o3BgMG_ioDivider",
			"bodyWrap": "o3BgMG_bodyWrap"
		};
		//#endregion
		//#region lib/types/client/tool/components/ToolRow.js
		/** Leading-slot state substitution: the tool icon yields to the terminal state
		*  semantic (error = red, interrupted = amber halo). Running keeps the icon —
		*  the row sweep (CSS on data-state) carries the in-flight signal. */
		function leadingFor$1(state, icon) {
			switch (state) {
				case "error": return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: "error" });
				case "stopped": return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: "warning" });
				default: return icon;
			}
		}
		/** Visually hidden run-state label: the StateDot and the CSS sweep are both
		*  aria-hidden / colour-only, so assistive technology needs this text to know a
		*  row is running, failed, or interrupted. null in the ok state (the icon and
		*  summary already describe a settled row). */
		function stateStatus$1(state, t) {
			switch (state) {
				case "running": return t("row.running");
				case "error": return t("row.failed");
				case "stopped": return t("row.stopped");
				default: return null;
			}
		}
		function ToolRow({ t, variant, toolName, icon, title, summary, summarySuffix, body, output, errorSummary, terminal, diff, read, search, web, state, filePath, onOpenFile, inspect }) {
			const [expanded, setExpanded] = (0, react.useState)(false);
			const terminalBody = terminal ?? null;
			const diffBody = diff ?? null;
			const readBody = read ?? null;
			const searchBody = search ?? null;
			const webBody = web ?? null;
			const outputText = output ?? null;
			const expandable = body !== null || outputText !== null || (terminalBody ?? diffBody ?? readBody ?? searchBody ?? webBody) !== null;
			const open = expanded && expandable;
			const status = stateStatus$1(state, t);
			const failureLine = state === "error" ? errorSummary ?? null : null;
			const summaryText = failureLine ?? summary;
			const suffix = failureLine === null ? summarySuffix ?? null : null;
			const fileLink = filePath !== void 0 && onOpenFile !== void 0 && failureLine === null;
			const toggleExpand = () => {
				setExpanded((v) => !v);
			};
			const openFile = (event) => {
				event.stopPropagation();
				if (filePath !== void 0) onOpenFile?.(filePath);
			};
			const fileLinkKeyDown = (event) => {
				if (event.key === "Enter" || event.key === " ") event.stopPropagation();
			};
			const cardBody = variant === "code" ? null : body;
			return (0, react_jsx_runtime.jsxs)("div", {
				className: ToolRow_module_css_default.root,
				"data-variant": variant,
				"data-tool": toolName,
				"data-state": state,
				children: [status !== null && (0, react_jsx_runtime.jsx)("span", {
					className: ToolRow_module_css_default.visuallyHidden,
					children: status
				}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.DisclosureRow, {
					rowClassName: ToolRow_module_css_default.row,
					leadingClassName: ToolRow_module_css_default.leading,
					titleClassName: ToolRow_module_css_default.title,
					chevronClassName: ToolRow_module_css_default.chevron,
					icon: leadingFor$1(state, icon),
					title,
					open,
					expandable,
					expandOnRowClick: true,
					keepContentWhenOpen: true,
					onToggle: toggleExpand,
					collapsedContent: summaryText !== "" && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						(0, react_jsx_runtime.jsx)("span", {
							className: ToolRow_module_css_default.sep,
							"aria-hidden": true
						}),
						fileLink ? (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: ToolRow_module_css_default.fileLink,
							onClick: openFile,
							onKeyDown: fileLinkKeyDown,
							children: summaryText
						}) : (0, react_jsx_runtime.jsx)("span", {
							className: clsx(ToolRow_module_css_default.summary, failureLine !== null && ToolRow_module_css_default.errorSummary),
							children: summaryText
						}),
						suffix !== null && (0, react_jsx_runtime.jsx)("span", {
							className: ToolRow_module_css_default.summarySuffix,
							children: suffix
						})
					] }),
					children: (0, react_jsx_runtime.jsxs)("div", {
						className: ToolRow_module_css_default.bodyWrap,
						children: [terminalBody !== null ? (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.TerminalBlock, {
							...terminalBody.card,
							maxLines: Infinity,
							labels: terminalBlockLabels(t),
							className: ToolRow_module_css_default.terminalBody
						}) : diffBody !== null ? (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.DiffBlock, {
							...diffBody.card,
							maxLines: 8,
							className: ToolRow_module_css_default.diffBody
						}) : readBody !== null ? (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.ReadBlock, {
							...readBody,
							maxLines: 8,
							className: ToolRow_module_css_default.readBody
						}) : searchBody !== null ? (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.SearchBlock, {
							...searchBody.card,
							maxLines: 8,
							className: ToolRow_module_css_default.searchBody
						}), searchBody.recovery !== void 0 && (0, react_jsx_runtime.jsx)("div", {
							className: ToolRow_module_css_default.searchRecovery,
							children: searchBody.recovery
						})] }) : webBody !== null ? (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.WebBlock, {
							...webBody,
							className: ToolRow_module_css_default.webBody
						}) : (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [variant === "code" && body !== null && (0, react_jsx_runtime.jsx)("div", {
							className: ToolRow_module_css_default.bodyScroll,
							children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.CodeBlock, {
								code: body,
								lang: "typescript",
								copyLabel: t("copy"),
								copiedLabel: t("copied"),
								className: ToolRow_module_css_default.codeBody
							})
						}), (cardBody !== null || outputText !== null) && (0, react_jsx_runtime.jsxs)("div", {
							className: ToolRow_module_css_default.ioCard,
							children: [
								cardBody !== null && (0, react_jsx_runtime.jsxs)("div", {
									className: ToolRow_module_css_default.ioSection,
									children: [(0, react_jsx_runtime.jsx)("span", {
										className: ToolRow_module_css_default.ioLabel,
										children: "IN"
									}), (0, react_jsx_runtime.jsx)("span", {
										className: ToolRow_module_css_default.ioText,
										children: cardBody
									})]
								}),
								cardBody !== null && outputText !== null && (0, react_jsx_runtime.jsx)("span", {
									className: ToolRow_module_css_default.ioDivider,
									"aria-hidden": true
								}),
								outputText !== null && (0, react_jsx_runtime.jsxs)("div", {
									className: ToolRow_module_css_default.ioSection,
									children: [(0, react_jsx_runtime.jsx)("span", {
										className: ToolRow_module_css_default.ioLabel,
										children: "OUT"
									}), (0, react_jsx_runtime.jsx)("span", {
										className: ToolRow_module_css_default.ioText,
										"data-error": state === "error" || void 0,
										children: outputText
									})]
								})
							]
						})] }), inspect !== void 0 && (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: ToolRow_module_css_default.inspectButton,
							onClick: inspect,
							children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconInspectOutline12, {}), "Inspect"]
						})]
					})
				})]
			});
		}
		//#endregion
		//#region lib/types/client/tool/toolviews/GenericToolCard.js
		/** Variant leading icons (figma table); all glyphs render at 14 inside the 16px leading box. */
		const VARIANT_ICONS = {
			search: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSearchOutline16, { size: 14 }),
			read: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBrowseOutline16, { size: 14 }),
			bash: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconApiOutline14, { size: 14 }),
			write: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEditOutline16, { size: 14 }),
			edit: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEditOutline16, { size: 14 }),
			code: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCodeOutline16, { size: 14 }),
			others: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSparkle16, { size: 14 })
		};
		function GenericToolCard({ toolName, block, cwd, openFile, inspect, t }) {
			const model = toolRowModel(toolName, block, cwd);
			const terminal = terminalCardModel(block, cwd);
			const read = readCardModel(block, cwd);
			const diff = diffCardModel(block);
			const search = searchCardModel(block);
			const web = webCardModel(block);
			const state = model.state === "ok" && terminal !== null && terminalFailed(terminal) ? "error" : model.state;
			const singleFile = model.filePath !== void 0;
			return (0, react_jsx_runtime.jsx)(ToolRow, {
				t,
				variant: model.variant,
				toolName,
				icon: VARIANT_ICONS[model.variant],
				title: model.title,
				summary: terminal?.description ?? search?.title ?? model.summary,
				body: singleFile ? null : model.body,
				output: model.output,
				errorSummary: model.errorSummary,
				terminal,
				diff,
				read,
				search,
				web,
				state,
				filePath: model.filePath,
				onOpenFile: singleFile ? openFile : void 0,
				inspect
			});
		}
		//#endregion
		//#region \0dsh-css:/home/runner/work/deepseek-harness/deepseek-harness/packages/client/ui-tool/src/client/tool/ToolCallTree.module.css.mjs
		const css$2 = ".ztWv_q_callRow{border-radius:6px}.ztWv_q_subCalls{border-left:1px solid var(--dsw-alias-border-l2);flex-direction:column;gap:4px;margin:4px 0 2px 22px;padding-left:8px;display:flex}";
		const tagId$2 = "@deepseek-ai/dsh-client-ui-tool/ToolCallTree.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$2) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-tool";
			tag.dataset.pluginCss = tagId$2;
			tag.textContent = css$2;
			document.head.appendChild(tag);
		}
		var ToolCallTree_module_css_default = {
			"callRow": "ztWv_q_callRow",
			"subCalls": "ztWv_q_subCalls"
		};
		//#endregion
		//#region lib/types/client/tool/ToolCallTree.js
		/** Root/subcall Tool composition with one keyed atomic dispatch path. */
		/** Resolve a Tool call's wire name from either lifecycle form. */
		function callName(node) {
			return "kind" in node ? node.call?.name ?? "" : node.name;
		}
		/** One atomic call dispatched through the Tool-owned keyed slot. */
		const ToolCall = (0, react.memo)(function ToolCall({ renderSlot, callId, toolName, block, openFile, selected, cwd, inspectCall, t, children }) {
			const owner = (0, react.useMemo)(() => ({
				callId,
				toolName,
				block,
				openFile,
				cwd,
				inspect: () => {
					inspectCall(callId);
				}
			}), [
				callId,
				toolName,
				block,
				openFile,
				cwd,
				inspectCall
			]);
			return (0, react_jsx_runtime.jsxs)("div", {
				className: ToolCallTree_module_css_default.callRow,
				"data-chat-anchor-key": `call:${callId}`,
				"data-chat-call-id": callId,
				"data-selected": selected || void 0,
				children: [renderSlot("tool.call.toolview", owner, {
					entryKey: toolName,
					fallback: (0, react_jsx_runtime.jsx)(GenericToolCard, {
						...owner,
						t
					})
				}), children]
			});
		});
		const ToolCallBranch = (0, react.memo)(function ToolCallBranch({ renderSlot, block, selectedCallId, cwd, openFile, inspectCall, t }) {
			return (0, react_jsx_runtime.jsx)(ToolCall, {
				renderSlot,
				callId: block.callId,
				toolName: callName(block),
				block,
				openFile,
				selected: block.callId === selectedCallId,
				cwd,
				inspectCall,
				t,
				children: block.subCalls.length > 0 ? (0, react_jsx_runtime.jsx)("div", {
					className: ToolCallTree_module_css_default.subCalls,
					"data-subcalls": true,
					children: block.subCalls.map((child) => (0, react_jsx_runtime.jsx)(ToolCallBranch, {
						renderSlot,
						block: child,
						selectedCallId,
						cwd,
						openFile,
						inspectCall,
						t
					}, child.callId))
				}) : null
			});
		});
		/**
		* Render one root Tool call and its recursive children through the same
		* atomic keyed dispatch.
		* @param props - whole-Tool owner data and the Tool-owned child-slot share.
		* @returns the Tool call tree.
		*/
		function ToolCallTree({ renderSlot, node, selectedCallId, cwd, openFile, inspectCall, t }) {
			const block = node.data.root;
			return (0, react_jsx_runtime.jsx)(ToolCallBranch, {
				renderSlot,
				block,
				selectedCallId,
				cwd,
				openFile,
				inspectCall,
				t
			});
		}
		//#endregion
		//#region \0dsh-css:/home/runner/work/deepseek-harness/deepseek-harness/packages/client/ui-tool/src/client/tool/ToolDetails.module.css.mjs
		const css$1 = ".xDAfVq_description{color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xs-13);margin:0 0 6px}.xDAfVq_cardBody{margin:0}.xDAfVq_recovery{white-space:pre-wrap;overflow-wrap:anywhere;color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xs-13);margin:6px 0 0}.xDAfVq_code{background:var(--dsw-alias-markdown-code-block);font-family:var(--ds-font-family-code);color:var(--dsw-alias-label-primary);white-space:pre-wrap;word-break:break-word;border-radius:12px;margin:0;padding:16px;font-size:13px;line-height:22px}.xDAfVq_code[data-error]{color:var(--dsw-alias-state-error-primary)}.xDAfVq_read,.xDAfVq_web{margin:0}.xDAfVq_empty{color:var(--dsw-alias-label-tertiary);padding:8px 0;font-size:13px;line-height:20px}";
		const tagId$1 = "@deepseek-ai/dsh-client-ui-tool/ToolDetails.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-tool";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var ToolDetails_module_css_default = {
			"read": "xDAfVq_read",
			"description": "xDAfVq_description",
			"recovery": "xDAfVq_recovery",
			"web": "xDAfVq_web",
			"code": "xDAfVq_code",
			"empty": "xDAfVq_empty",
			"cardBody": "xDAfVq_cardBody"
		};
		//#endregion
		//#region lib/types/client/tool/ToolDetails.js
		/** Card-aware output body for the selected Tool call in details. */
		/**
		* Render the selected Tool call's structured output when its presentation
		* intent is known, otherwise preserve the flattened result text.
		* @param props - selected call slice, workspace root, and locale seat.
		* @returns the details output body.
		*/
		function ToolDetails({ block, cwd, t }) {
			const terminal = terminalCardModel(block, cwd);
			if (terminal !== null) return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [terminal.description !== void 0 ? (0, react_jsx_runtime.jsx)("div", {
				className: ToolDetails_module_css_default.description,
				children: terminal.description
			}) : null, (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.TerminalBlock, {
				...terminal.card,
				labels: terminalBlockLabels(t),
				className: ToolDetails_module_css_default.cardBody
			})] });
			const read = readCardModel(block, cwd);
			if (read !== null) return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.ReadBlock, {
				...read,
				className: ToolDetails_module_css_default.read
			});
			const diff = diffCardModel(block);
			if (diff !== null) return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.DiffBlock, {
				...diff.card,
				className: ToolDetails_module_css_default.cardBody
			});
			const search = searchCardModel(block);
			if (search !== null) return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.SearchBlock, {
				...search.card,
				className: ToolDetails_module_css_default.cardBody
			}), search.recovery !== void 0 ? (0, react_jsx_runtime.jsx)("div", {
				className: ToolDetails_module_css_default.recovery,
				children: search.recovery
			}) : null] });
			const web = webCardModel(block);
			if (web !== null) {
				const body = "kind" in block ? resultText(block) : "";
				return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.WebBlock, {
					...web,
					className: ToolDetails_module_css_default.web
				}), body !== "" ? (0, react_jsx_runtime.jsx)("pre", {
					className: ToolDetails_module_css_default.code,
					children: body
				}) : null] });
			}
			if (!("kind" in block)) return (0, react_jsx_runtime.jsx)("div", {
				className: ToolDetails_module_css_default.empty,
				children: t("details.running")
			});
			return (0, react_jsx_runtime.jsx)("pre", {
				className: ToolDetails_module_css_default.code,
				"data-error": block.isError || void 0,
				children: resultText(block)
			});
		}
		//#endregion
		//#region lib/types/client/locale.js
		/** Locale namespace supplied by the conversation owner to Tool renderers. */
		const CONVERSATION_NS = "conversation";
		//#endregion
		//#region lib/types/client/tool/toolviews/ask-question-row.js
		function isAnswer(value) {
			return typeof value === "object" && value !== null;
		}
		/** Answered-count summary from the result JSON (a skipped question has
		*  empty `selected` and no `custom`); null when answer fields are invalid. */
		function answeredSummary(text, t) {
			let parsed;
			try {
				parsed = JSON.parse(text);
			} catch {
				return null;
			}
			if (typeof parsed !== "object" || parsed === null) return null;
			const answers = parsed.answers;
			if (!Array.isArray(answers) || !answers.every(isAnswer)) return null;
			const answered = answers.filter((a) => Array.isArray(a.selected) && a.selected.length > 0 || typeof a.custom === "string" && a.custom !== "").length;
			return t("ask.answered", {
				answered,
				total: answers.length
			});
		}
		/** One-line question-interaction row (the whole row toggles the call's
		*  Input/Output sections, ToolRow's unified expand). */
		function AskQuestionRow({ toolName, block, inspect, t }) {
			const model = toolRowModel(toolName, block);
			const code = "kind" in block ? block.error?.code : void 0;
			let summary = model.summary;
			let state = model.state;
			if (code === "ASK_CANCELLED") summary = t("ask.cancelled");
			else if (code === "ASK_ABORTED") {
				summary = t("ask.interrupted");
				state = "stopped";
			} else if (model.state === "running") summary = t("ask.waiting");
			else if ("kind" in block && model.state === "ok") summary = answeredSummary(block.content.filter((b) => b.type === "text").map((b) => b.text).join(""), t) ?? model.summary;
			return (0, react_jsx_runtime.jsx)(ToolRow, {
				t,
				variant: model.variant,
				toolName,
				icon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconQuestionOutline14, {}),
				title: t("ask.rowTitle"),
				summary,
				body: model.body,
				output: model.output,
				state,
				inspect
			});
		}
		/**
		* The ask-question row as a plain registrant plugin following the chat
		* toolview declaration across independent activation and reload lifetimes.
		*/
		const askQuestionToolview = {
			name: "ask-question-toolview",
			inject: ["slots"],
			/**
			* Register the ask-question row into the Tool-owned keyed view slot.
			* @param ctx - registrant context (disposal rides ctx.effect inside slots.register).
			*/
			apply(ctx) {
				ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
					name: "tool.call.toolview",
					key: "ask_user_question",
					locale: CONVERSATION_NS
				}, AskQuestionRow));
			}
		};
		//#endregion
		//#region \0dsh-css:/home/runner/work/deepseek-harness/deepseek-harness/packages/client/ui-tool/src/client/tool/toolviews/bash-sample.module.css.mjs
		const css = ".CY-8Ka_card{flex-direction:column;display:flex}.CY-8Ka_terminal{--dsl-terminal-font:var(--dsw-font-markdown-code-block-small);--dsl-terminal-line-height:18px;--dsl-terminal-output-max-height:224px;border:1px solid var(--dsw-alias-border-l1);margin:4px 0 4px 4px}.CY-8Ka_ioCard{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-markdown-code-block);font:var(--dsw-font-markdown-code-block-small);border-radius:12px;flex-direction:column;margin:4px 0 4px 4px;display:flex}.CY-8Ka_ioSection{grid-template-columns:max-content 1fr;align-items:baseline;column-gap:14px;max-height:150px;padding:12px 16px;display:grid;overflow-y:auto}.CY-8Ka_ioSection::-webkit-scrollbar-thumb{background-clip:padding-box;border:2px solid #0000;border-radius:6px}.CY-8Ka_ioSection::-webkit-scrollbar-track{margin:6px 0}.CY-8Ka_ioLabel{color:var(--dsw-alias-label-caption);align-self:start;position:sticky;top:0}.CY-8Ka_ioDivider{background:var(--dsw-alias-border-l2);flex:none;height:1px}.CY-8Ka_ioText{white-space:pre-wrap;word-break:break-word;min-width:0;color:var(--dsw-alias-label-secondary)}.CY-8Ka_ioText[data-error]{color:var(--dsw-alias-state-error-primary)}.CY-8Ka_root[data-expandable]{cursor:pointer}.CY-8Ka_root{align-items:center;min-width:0;height:24px;display:flex;position:relative;overflow:hidden}.CY-8Ka_root[data-state=running]:after{content:\"\";background:linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--dsw-alias-bg-base) 60%, transparent) 55%, transparent 100%);pointer-events:none;width:300px;animation:2.6s ease-out infinite CY-8Ka_dsh-bash-row-sweep;position:absolute;top:0;bottom:0;left:0}@keyframes CY-8Ka_dsh-bash-row-sweep{0%{left:-300px}90%,to{left:100%}}.CY-8Ka_leading{width:16px;height:16px;color:var(--dsw-alias-label-tertiary);flex:none;justify-content:center;align-items:center;margin-right:6px;display:inline-flex;position:relative}.CY-8Ka_chevron{color:var(--dsw-alias-label-secondary)}.CY-8Ka_iconIdle{opacity:1;transition:opacity .1s;display:inline-flex}.CY-8Ka_chevronHover{opacity:0;margin:auto;transition:opacity .1s;position:absolute;inset:0}.CY-8Ka_root:hover .CY-8Ka_iconIdle{opacity:0}.CY-8Ka_root:hover .CY-8Ka_chevronHover{opacity:1}.CY-8Ka_title{color:var(--dsw-alias-label-secondary);flex:none;font-size:14px;line-height:24px}.CY-8Ka_sep{background:var(--dsw-alias-label-caption);border-radius:1px;flex:none;width:2px;height:2px;margin:0 8px}.CY-8Ka_summary{text-overflow:ellipsis;white-space:nowrap;min-width:0;color:var(--dsw-alias-label-tertiary);flex:auto;font-size:14px;line-height:24px;overflow:hidden}.CY-8Ka_errorSummary{color:var(--dsw-alias-state-error-primary)}.CY-8Ka_bodyWrap{flex-direction:column;display:flex}.CY-8Ka_inspectButton{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary);cursor:pointer;opacity:0;border-radius:999px;align-self:flex-start;align-items:center;gap:4px;margin:4px 0 2px 4px;padding:2px 8px;font-size:11px;line-height:16px;transition:opacity .1s;display:inline-flex}.CY-8Ka_card:hover .CY-8Ka_inspectButton,.CY-8Ka_inspectButton:focus-visible{opacity:1}.CY-8Ka_inspectButton:hover{background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary)}.CY-8Ka_visuallyHidden{clip:rect(0 0 0 0);white-space:nowrap;width:1px;height:1px;position:absolute;overflow:hidden}";
		const tagId = "@deepseek-ai/dsh-client-ui-tool/bash-sample.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-tool";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var bash_sample_module_css_default = {
			"chevron": "CY-8Ka_chevron",
			"dsh-bash-row-sweep": "CY-8Ka_dsh-bash-row-sweep",
			"card": "CY-8Ka_card",
			"ioCard": "CY-8Ka_ioCard",
			"ioDivider": "CY-8Ka_ioDivider",
			"sep": "CY-8Ka_sep",
			"root": "CY-8Ka_root",
			"leading": "CY-8Ka_leading",
			"title": "CY-8Ka_title",
			"errorSummary": "CY-8Ka_errorSummary",
			"chevronHover": "CY-8Ka_chevronHover",
			"summary": "CY-8Ka_summary",
			"terminal": "CY-8Ka_terminal",
			"ioText": "CY-8Ka_ioText",
			"ioSection": "CY-8Ka_ioSection",
			"iconIdle": "CY-8Ka_iconIdle",
			"bodyWrap": "CY-8Ka_bodyWrap",
			"ioLabel": "CY-8Ka_ioLabel",
			"inspectButton": "CY-8Ka_inspectButton",
			"visuallyHidden": "CY-8Ka_visuallyHidden"
		};
		//#endregion
		//#region lib/types/client/tool/toolviews/bash-sample.js
		function leadingFor(state) {
			switch (state) {
				case "error": return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: "error" });
				case "stopped": return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: "warning" });
				default: return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconApiOutline14, { size: 14 });
			}
		}
		/** Visually hidden status — StateDot is aria-hidden; AT needs a text label. */
		function stateStatus(state, t) {
			switch (state) {
				case "running": return t("bash.running");
				case "error": return t("bash.failed");
				case "stopped": return t("bash.stopped");
				default: return null;
			}
		}
		/**
		* Bash row: icon + Bash · {description} in the shared ToolRow chrome, the
		* whole row toggling the command's terminal or generic error card (ToolRow's unified
		* expand interaction, replicated locally per the registrant posture).
		*/
		function BashRow({ toolName, block, sessionId, useSessions, inspect, t }) {
			const model = toolRowModel(toolName, block);
			const terminal = terminalCardModel(block, useSessions((list) => list.byId[sessionId]?.cwd));
			const state = model.state === "ok" && terminal !== null && terminalFailed(terminal) ? "error" : model.state;
			const status = stateStatus(state, t);
			const [expanded, setExpanded] = (0, react.useState)(false);
			const genericError = terminal === null && model.state === "error" && (model.body !== null || model.output !== null);
			const expandable = terminal !== null || genericError;
			const open = expanded && expandable;
			const failureLine = model.state === "error" ? model.errorSummary : null;
			const toggleExpand = () => {
				setExpanded((v) => !v);
			};
			const toggleFromKeyboard = (event) => {
				if (!expandable || event.key !== "Enter" && event.key !== " ") return;
				event.preventDefault();
				toggleExpand();
			};
			const leading = open ? (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { className: bash_sample_module_css_default.chevron }) : expandable ? (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)("span", {
				className: bash_sample_module_css_default.iconIdle,
				children: leadingFor(state)
			}), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { className: clsx(bash_sample_module_css_default.chevron, bash_sample_module_css_default.chevronHover) })] }) : leadingFor(state);
			return (0, react_jsx_runtime.jsxs)("div", {
				className: bash_sample_module_css_default.card,
				children: [(0, react_jsx_runtime.jsxs)("div", {
					className: bash_sample_module_css_default.root,
					"data-sample": "bash",
					"data-variant": "bash",
					"data-state": state,
					"data-expandable": expandable || void 0,
					role: expandable ? "button" : void 0,
					tabIndex: expandable ? 0 : void 0,
					"aria-expanded": expandable ? open : void 0,
					onClick: expandable ? toggleExpand : void 0,
					onKeyDown: expandable ? toggleFromKeyboard : void 0,
					children: [
						(0, react_jsx_runtime.jsx)("span", {
							className: bash_sample_module_css_default.leading,
							children: leading
						}),
						status !== null && (0, react_jsx_runtime.jsx)("span", {
							className: bash_sample_module_css_default.visuallyHidden,
							children: status
						}),
						(0, react_jsx_runtime.jsx)("span", {
							className: bash_sample_module_css_default.title,
							children: model.title
						}),
						(0, react_jsx_runtime.jsx)("span", {
							className: bash_sample_module_css_default.sep,
							"aria-hidden": true
						}),
						(0, react_jsx_runtime.jsx)("span", {
							className: clsx(bash_sample_module_css_default.summary, failureLine !== null && bash_sample_module_css_default.errorSummary),
							children: failureLine ?? terminal?.description ?? model.summary
						})
					]
				}), open && (0, react_jsx_runtime.jsxs)("div", {
					className: bash_sample_module_css_default.bodyWrap,
					children: [terminal !== null ? (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.TerminalBlock, {
						...terminal.card,
						maxLines: Infinity,
						labels: terminalBlockLabels(t),
						className: bash_sample_module_css_default.terminal
					}) : (0, react_jsx_runtime.jsxs)("div", {
						className: bash_sample_module_css_default.ioCard,
						children: [
							model.body !== null && (0, react_jsx_runtime.jsxs)("div", {
								className: bash_sample_module_css_default.ioSection,
								children: [(0, react_jsx_runtime.jsx)("span", {
									className: bash_sample_module_css_default.ioLabel,
									children: "IN"
								}), (0, react_jsx_runtime.jsx)("span", {
									className: bash_sample_module_css_default.ioText,
									children: model.body
								})]
							}),
							model.body !== null && model.output !== null && (0, react_jsx_runtime.jsx)("span", {
								className: bash_sample_module_css_default.ioDivider,
								"aria-hidden": true
							}),
							model.output !== null && (0, react_jsx_runtime.jsxs)("div", {
								className: bash_sample_module_css_default.ioSection,
								children: [(0, react_jsx_runtime.jsx)("span", {
									className: bash_sample_module_css_default.ioLabel,
									children: "OUT"
								}), (0, react_jsx_runtime.jsx)("span", {
									className: bash_sample_module_css_default.ioText,
									"data-error": true,
									children: model.output
								})]
							})
						]
					}), inspect !== void 0 && (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: bash_sample_module_css_default.inspectButton,
						onClick: inspect,
						children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconInspectOutline12, {}), "Inspect"]
					})]
				})]
			});
		}
		/**
		* The sample as a plain registrant plugin. Slot injection follows the chat
		* toolview declaration across independent activation and reload lifetimes.
		*/
		const bashToolviewSample = {
			name: "bash-toolview-sample",
			inject: ["slots"],
			/**
			* Register the bash row into the Tool-owned keyed view slot.
			* @param ctx - registrant context (disposal rides ctx.effect inside slots.register).
			*/
			apply(ctx) {
				ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
					name: "tool.call.toolview",
					key: "bash",
					locale: CONVERSATION_NS
				}, BashRow));
			}
		};
		//#endregion
		//#region lib/types/client/tool/toolviews/file-mutation-row.js
		/**
		* File-mutation row: icon + {Edit,Write} · {path} in the shared ToolRow chrome,
		* with the applied diff as the row's collapsed-by-default card body. The
		* summary is a path link (a file tool's interaction); the host's `openFile`
		* resolves it against the session cwd, so this passes the tool's own path
		* verbatim. An errored mutation has no diff card, so ToolRow surfaces the
		* model-facing error text through its Output section and its first line in the
		* collapsed summary instead.
		*/
		function FileMutationRow({ toolName, block, cwd, openFile, inspect, t }) {
			const model = toolRowModel(toolName, block, cwd);
			const diff = diffCardModel(block);
			return (0, react_jsx_runtime.jsx)(ToolRow, {
				t,
				variant: model.variant,
				toolName,
				icon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEditOutline16, { size: 14 }),
				title: model.title,
				summary: model.summary,
				body: null,
				output: model.output,
				errorSummary: model.errorSummary,
				diff,
				state: model.state,
				filePath: model.filePath,
				onOpenFile: openFile,
				inspect
			});
		}
		/**
		* The file-mutation rows as a plain registrant plugin following the chat
		* toolview declaration across independent activation and reload lifetimes.
		*/
		const fileMutationToolview = {
			name: "file-mutation-toolview",
			inject: ["slots"],
			/**
			* Register the file-mutation row into the Tool-owned keyed view slot
			* under both mutation tool names.
			* @param ctx - registrant context (disposal rides ctx.effect inside slots.register).
			*/
			apply(ctx) {
				ctx.slots.inject("tool.call.toolview", function* () {
					yield ctx.slots.register({
						name: "tool.call.toolview",
						key: "edit",
						locale: CONVERSATION_NS
					}, FileMutationRow);
					yield ctx.slots.register({
						name: "tool.call.toolview",
						key: "write",
						locale: CONVERSATION_NS
					}, FileMutationRow);
				});
			}
		};
		//#endregion
		//#region lib/types/client/tool/toolviews/read-row.js
		/**
		* Read row: icon + Read · {path} in the shared ToolRow chrome, with the file's
		* read card as the row's collapsed-by-default card body. The summary path is an
		* openable host link when the row names a single file.
		*/
		function ReadRow({ toolName, block, cwd, openFile, inspect, t }) {
			const model = toolRowModel(toolName, block, cwd);
			const read = readCardModel(block, cwd);
			return (0, react_jsx_runtime.jsx)(ToolRow, {
				t,
				variant: model.variant,
				toolName,
				icon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBrowseOutline16, { size: 14 }),
				title: model.title,
				summary: model.summary,
				body: null,
				output: model.output,
				errorSummary: model.errorSummary,
				read,
				state: model.state,
				filePath: model.filePath,
				onOpenFile: openFile,
				inspect
			});
		}
		/**
		* The read row as a plain registrant plugin following the atomic Tool-view
		* declaration across independent activation and reload lifetimes.
		*/
		const readToolview = {
			name: "read-toolview",
			inject: ["slots"],
			/**
			* Register the read row into the Tool-owned keyed view slot.
			* @param ctx - registrant context (disposal rides ctx.effect inside slots.register).
			*/
			apply(ctx) {
				ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
					name: "tool.call.toolview",
					key: "read",
					locale: CONVERSATION_NS
				}, ReadRow));
			}
		};
		//#endregion
		//#region lib/types/client/tool/toolviews/search-row.js
		const SEARCH_TITLES = {
			grep: "Grep",
			glob: "Glob"
		};
		/**
		* Search row: icon + Grep/Glob · {summary} in the shared ToolRow chrome, with the
		* completed search's card as the row's collapsed-by-default card body (a capped
		* search's recovery footer rides below it, inside ToolRow). Registered under
		* both `grep` and `glob`; the derived model's `kind` decides the card shape. A
		* settled call with no search card surfaces its model-facing text through
		* ToolRow's Output section, since the keyed SearchRow owns this render slot.
		*/
		function SearchRow({ toolName, block, inspect, t }) {
			const model = toolRowModel(toolName, block);
			const search = searchCardModel(block);
			return (0, react_jsx_runtime.jsx)(ToolRow, {
				t,
				variant: model.variant,
				toolName,
				icon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSearchOutline16, { size: 14 }),
				title: SEARCH_TITLES[toolName] ?? model.title,
				summary: search?.title ?? model.summary,
				body: null,
				output: model.output,
				errorSummary: model.errorSummary,
				search,
				state: model.state,
				inspect
			});
		}
		/**
		* The search view follows the atomic Tool-view declaration across activation
		* and reload. One component registers under both keys because `grep` and
		* `glob` are the same visual object discriminated by the result view's `kind`.
		*/
		const searchToolview = {
			name: "search-toolview",
			inject: ["slots"],
			/**
			* Register the search row into the Tool-owned keyed view slot under both
			* the `grep` and `glob` tool names.
			* @param ctx - registrant context (disposal rides ctx.effect inside slots.register).
			*/
			apply(ctx) {
				ctx.slots.inject("tool.call.toolview", function* () {
					yield ctx.slots.register({
						name: "tool.call.toolview",
						key: "grep",
						locale: CONVERSATION_NS
					}, SearchRow);
					yield ctx.slots.register({
						name: "tool.call.toolview",
						key: "glob",
						locale: CONVERSATION_NS
					}, SearchRow);
				});
			}
		};
		//#endregion
		//#region lib/types/client/tool/toolviews/plan-summary.js
		/**
		* Pure plan derivation for the todo_write row's one-line summary. Several items
		* may be `in_progress` at once — parallel work runs concurrent tasks, so a
		* summary built from one active item would silently drop the rest. The plan
		* strip header derives its own counts inline and shares nothing with this, so
		* this stays inside the toolviews domain rather than in `contract/` (the
		* inter-domain face).
		* @module
		*/
		/**
		* Derive the counts and the active summary from a whole-list snapshot. It names
		* the first `in_progress` item and counts the remaining active ones, so a
		* parallel plan reports how many tasks are running rather than naming one and
		* hiding the others. `activeContent` is null when nothing is in progress, or
		* when the first active item's content is missing, mistyped, or blank once
		* trimmed — the tool's own rule for usable content, applied here because a
		* rejected call keeps its args verbatim. The row then renders the counts alone
		* rather than falling back to the generic tool summary: the counts are already
		* known to be good, and the active-item clause is the only part an unusable
		* name costs.
		* @param todos - the whole list, in model order.
		* @returns the done/total counts and the two summary halves.
		*/
		function planSummary(todos) {
			const active = todos.filter((t) => t.status === "in_progress");
			const first = active[0]?.content;
			const named = typeof first === "string" && first.trim() !== "";
			return {
				done: todos.filter((t) => t.status === "completed").length,
				total: todos.length,
				activeContent: named ? first : null,
				activeExtra: named ? active.length - 1 : 0
			};
		}
		//#endregion
		//#region lib/types/client/tool/toolviews/todo-row.js
		function isItem(value) {
			return typeof value === "object" && value !== null;
		}
		function summarize(argsRaw, t) {
			let parsed;
			try {
				parsed = JSON.parse(argsRaw);
			} catch {
				return null;
			}
			if (typeof parsed !== "object" || parsed === null) return null;
			const todos = parsed.todos;
			if (!Array.isArray(todos) || !todos.every(isItem)) return null;
			const { done, total, activeContent, activeExtra } = planSummary(todos);
			const head = t("todo.completed", {
				done,
				total
			});
			return {
				text: activeContent === null ? head : `${head} · ${activeContent}`,
				extra: activeExtra
			};
		}
		/** One-line plan update row (the whole row toggles the call's Input/Output
		*  sections, ToolRow's unified expand). Non-ok execution states keep the
		*  shared row's dot semantics — a cancelled call wrote no todo/write, so it
		*  must not read as a completed update. */
		function TodoRow({ toolName, block, inspect, t }) {
			const model = toolRowModel(toolName, block);
			const summary = summarize(("kind" in block ? block.call?.argsRaw : block.argsRaw) ?? "", t) ?? {
				text: model.summary,
				extra: 0
			};
			return (0, react_jsx_runtime.jsx)(ToolRow, {
				t,
				variant: model.variant,
				toolName,
				icon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChecklistOutline14, {}),
				title: t("todo.rowTitle"),
				summary: summary.text,
				summarySuffix: summary.extra > 0 ? `+${summary.extra}` : null,
				body: model.body,
				output: model.output,
				errorSummary: model.errorSummary,
				state: model.state,
				inspect
			});
		}
		/**
		* The todo row as a plain registrant plugin following the atomic Tool-view
		* declaration across independent activation and reload lifetimes.
		*/
		const todoToolview = {
			name: "todo-toolview",
			inject: ["slots"],
			/**
			* Register the todo row into the Tool-owned keyed view slot.
			* @param ctx - registrant context (disposal rides ctx.effect inside slots.register).
			*/
			apply(ctx) {
				ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
					name: "tool.call.toolview",
					key: "todo_write",
					locale: CONVERSATION_NS
				}, TodoRow));
			}
		};
		//#endregion
		//#region lib/types/client/tool/toolviews/web-row.js
		/** web_fetch reads one URL; web_search queries. Titles are figma literals. */
		const WEB_TITLES = {
			web_search: "Search",
			web_fetch: "Fetch"
		};
		/**
		* Web row: icon + Search/Fetch · {summary} in the shared ToolRow chrome, with
		* the completed retrieval's web card as the row's collapsed-by-default card
		* body. The row discriminates on `toolName` only to pick its icon and title.
		*/
		function WebRow({ toolName, block, inspect, t }) {
			const model = toolRowModel(toolName, block);
			const web = webCardModel(block);
			const icon = toolName === "web_fetch" ? (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBrowseOutline16, { size: 14 }) : (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconGlobeOutline14, { size: 14 });
			return (0, react_jsx_runtime.jsx)(ToolRow, {
				t,
				variant: model.variant,
				toolName,
				icon,
				title: WEB_TITLES[toolName] ?? model.title,
				summary: model.summary,
				body: null,
				output: model.output,
				errorSummary: model.errorSummary,
				web,
				state: model.state,
				inspect
			});
		}
		/**
		* The web rows follow the atomic Tool-view declaration across activation and
		* reload. One WebRow component registers under both web tool names.
		*/
		const webToolview = {
			name: "web-toolview",
			inject: ["slots"],
			/**
			* Register the web row under both web tool names' keyed toolview holes.
			* @param ctx - registrant context (disposal rides ctx.effect inside slots.register).
			*/
			apply(ctx) {
				ctx.slots.inject("tool.call.toolview", function* () {
					yield ctx.slots.register({
						name: "tool.call.toolview",
						key: "web_search",
						locale: CONVERSATION_NS
					}, WebRow);
					yield ctx.slots.register({
						name: "tool.call.toolview",
						key: "web_fetch",
						locale: CONVERSATION_NS
					}, WebRow);
				});
			}
		};
		//#endregion
		//#region lib/types/client/apply.js
		/** Required service: the slot registry that owns both Tool render seats. */
		const inject = ["slots"];
		/**
		* Mount the whole-Tool renderers and built-in atomic Tool registrations.
		* @param ctx - Client root context.
		*/
		function apply(ctx) {
			ctx.slots.inject("conversation.chat.node", () => ctx.slots.register({
				name: "conversation.chat.node",
				key: "tool-call",
				locale: CONVERSATION_NS,
				children: { "tool.call.toolview": {
					kind: "keyed",
					scope: "session"
				} }
			}, ToolCallTree));
			ctx.slots.inject("conversation.details.tool", () => ctx.slots.register({
				name: "conversation.details.tool",
				locale: CONVERSATION_NS
			}, ToolDetails));
			ctx.plugin(bashToolviewSample);
			ctx.plugin(readToolview);
			ctx.plugin(fileMutationToolview);
			ctx.plugin(searchToolview);
			ctx.plugin(webToolview);
			ctx.plugin(todoToolview);
			ctx.plugin(askQuestionToolview);
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map