window.__ModuleLoader__.load({
	id: "dsh-better-sidebar",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region \0rolldown/runtime.js
		var __create = Object.create;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getProtoOf = Object.getPrototypeOf;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __copyProps = (to, from, except, desc) => {
			if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
				key = keys[i];
				if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
			return to;
		};
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
			value: mod,
			enumerable: true
		}) : target, mod));
		//#endregion
		let react = require("react");
		react = __toESM(react, 1);
		let react_dom_client = require("react-dom/client");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		let react_dom = require("react-dom");
		/** The title-bar / shell compatibility schemes (see {@link SidebarPrefs.titleBarScheme}). */
		const TITLE_BAR_SCHEMES = [
			"auto",
			"web",
			"preset",
			"custom"
		];
		/** Fallback prefs used whenever the settings document is unreachable or malformed. */
		const SIDEBAR_PREFS_DEFAULTS = {
			openByDefault: false,
			defaultWidthPercent: 35,
			autoOpenSubagent: true,
			autoOpenJobs: true,
			agentTerminalTools: false,
			bottomPanelAutoTerminal: true,
			terminalFontFamily: "",
			terminalFontSize: 13,
			interceptOpenPath: true,
			editorExplorer: true,
			terminalShell: "",
			terminalShellArgs: "",
			titleBarScheme: "auto",
			titleBarPresetId: "",
			customCss: "",
			titleBarCompat: false,
			titleBarStripPx: 40,
			htmlViewerNoSandbox: false,
			htmlViewerDefaultUnsafe: false,
			browserNoSandbox: false,
			browserInterceptLinks: true,
			browserInterceptHttp: true,
			browserInterceptHttps: false,
			tabsEnabled: {},
			viewersEnabled: {},
			pluginSettings: {}
		};
		/** Clamp one width percent into the contract range (shared by schema and client reads). */
		function clampWidthPercent(value) {
			return Math.min(60, Math.max(20, Math.round(value)));
		}
		/** Clamp one terminal font size into the contract range (shared by schema and client reads). */
		function clampTerminalFontSize(value) {
			return Math.min(32, Math.max(9, Math.round(value)));
		}
		/** Clamp one title-bar strip height into the contract range (shared by schema and client reads). */
		function clampTitleBarStrip(value) {
			return Math.min(120, Math.max(0, Math.round(value)));
		}
		/** Whether a viewport width is narrow (mobile). */
		function isNarrowWidth(width) {
			return width < 768;
		}
		/**
		* Live narrow-viewport flag for components. Reads `window.innerWidth` and
		* re-measures on resize (rAF-throttled, the repo's existing drag pattern).
		* Deliberately avoids `matchMedia` (jsdom does not implement it) — the
		* resize listener is equally exact for a breakpoint that never changes
		* while the page is open.
		*/
		function useNarrowViewport() {
			const [narrow, setNarrow] = (0, react.useState)(() => typeof window !== "undefined" && isNarrowWidth(window.innerWidth));
			(0, react.useEffect)(() => {
				if (typeof window === "undefined") return;
				let frame = null;
				const measure = () => {
					frame = null;
					setNarrow(isNarrowWidth(window.innerWidth));
				};
				const onResize = () => {
					if (frame === null) frame = requestAnimationFrame(measure);
				};
				window.addEventListener("resize", onResize);
				return () => {
					window.removeEventListener("resize", onResize);
					if (frame !== null) cancelAnimationFrame(frame);
				};
			}, []);
			return narrow;
		}
		/** Upper bound for the right panel width at a given viewport width: keep at
		* least {@link CENTER_MIN} for the center conversation column. Falls back to
		* PANEL_MAX when the viewport is unknown (SSR/tests). Always ≥ PANEL_MIN. */
		function maxPanelWidthFor(viewportWidth) {
			if (!Number.isFinite(viewportWidth)) return 640;
			return Math.max(280, viewportWidth - 280);
		}
		/** Clamp one Explorer rail width into the contract range. */
		function clampExplorerWidth(value) {
			return Math.min(480, Math.max(140, Math.round(value)));
		}
		let nextIdCounter = 0;
		/** Unique pane/tab id within one state instance. */
		function uid(prefix) {
			nextIdCounter += 1;
			return `${prefix}:${nextIdCounter}`;
		}
		/**
		* The largest numeric suffix across a raw persisted state's counter ids
		* (`pane:N` / `tab:N` / `split:N`). The uid counter is module-global and
		* resets on every reload, so a split minted AFTER a reload would collide
		* with the persisted ids (a fresh "pane:1" beside the persisted "pane:1");
		* mapLeaf would then visit BOTH leaves and every open would land in both
		* panes of the split. Seeding the counter past the persisted ids keeps
		* fresh ids disjoint.
		*/
		function maxCounterId(parsed) {
			let max = 0;
			const consider = (id) => {
				if (typeof id !== "string") return;
				const match = /^(?:pane|tab|split):(\d+)$/.exec(id);
				if (match !== null) max = Math.max(max, Number(match[1]));
			};
			const walk = (node) => {
				if (node === null || typeof node !== "object") return;
				const record = node;
				consider(record.id);
				if (Array.isArray(record.tabs)) {
					for (const tab of record.tabs) if (tab !== null && typeof tab === "object") consider(tab.id);
				}
				if (Array.isArray(record.children)) for (const child of record.children) walk(child);
			};
			walk(parsed?.splits);
			walk(parsed?.bottomSplits);
			return max;
		}
		/** A fresh default state: one seeded tab in one pane, open per the caller's
		* preference. `width` is the caller's preferred panel width (default
		* PANEL_DEFAULT) and `panelOpen` whether the panel starts expanded (default
		* true); the store seeds new sessions from the user's side card prefs.
		* `seed` picks the seeded tab: 'editor-home' places the EMPTY files window
		* (an editor tab with no path whose tree panel starts open,
		* `meta.treeOpen: true`) — in BOTH editorExplorer modes that window is the
		* file explorer page — and 'none' starts with an empty pane (the store
		* passes it when the user disabled the editor tab type in settings). */
		function makeDefaultState(width = 400, panelOpen = true, seed = "editor-home") {
			const leaf = {
				kind: "leaf",
				id: uid("pane"),
				tabs: [],
				active: null
			};
			if (seed === "editor-home") {
				leaf.tabs = [{
					id: uid("tab"),
					type: "editor",
					title: "Files",
					meta: { treeOpen: true }
				}];
				leaf.active = leaf.tabs[0].id;
			}
			const bottomLeaf = {
				kind: "leaf",
				id: uid("pane"),
				tabs: [],
				active: null
			};
			return {
				panelOpen,
				width,
				explorerOpen: true,
				explorerWidth: 240,
				activePane: leaf.id,
				nextTerminal: 1,
				nextBrowser: 1,
				expanded: [],
				splits: leaf,
				bottomOpen: false,
				bottomHeight: 220,
				bottomOpenedOnce: false,
				bottomSplits: bottomLeaf
			};
		}
		/** Whether a tree node (or any descendant) carries the given pane/split id. */
		function treeHasId(node, id) {
			if (node.id === id) return true;
			if (node.kind === "split") return node.children.some((child) => treeHasId(child, id));
			return false;
		}
		/** Which tree owns a pane/split id: 'bottomSplits' when the id lives in the
		*  bottom panel's tree, else 'splits' (the right panel's tree). Ids are
		*  globally unique (the shared uid counter), so an id in neither tree falls
		*  back to the right tree, where tree operations no-op on a missing node —
		*  the pre-bottom-panel behavior. */
		function treeOf(state, id) {
			return treeHasId(state.bottomSplits, id) ? "bottomSplits" : "splits";
		}
		/** Walk the tree and apply `visit` to the leaf with the given id. */
		function mapLeaf(node, paneId, visit) {
			if (node.kind === "leaf") {
				if (node.id === paneId) {
					const copy = {
						...node,
						tabs: [...node.tabs]
					};
					visit(copy);
					return copy;
				}
				return node;
			}
			const split = node;
			return {
				...split,
				sizes: [...split.sizes],
				children: split.children.map((child) => mapLeaf(child, paneId, visit))
			};
		}
		/** The first leaf of the tree (fallback pane when activePane is gone). */
		function firstLeaf(node) {
			if (node.kind === "leaf") return node;
			return firstLeaf(node.children[0]);
		}
		/** Empty every leaf of a tree (the bottom tree after its tabs migrate out). */
		function clearAllTabs(node) {
			if (node.kind === "leaf") return {
				...node,
				tabs: [],
				active: null
			};
			return {
				...node,
				children: node.children.map(clearAllTabs)
			};
		}
		/**
		* Narrow-viewport migration: the bottom panel's tabs are thrown INTO the
		* right sidebar — the "merged display" on mobile is the right panel alone,
		* whose tab strips now carry the bottom tree's tabs (depth-first order,
		* appended to the right tree's FIRST leaf). The bottom tree is emptied (its
		* structure stays — the desktop bottom panel re-renders its welcome cards)
		* and the panel closes. The active pane moves to the right tree's first
		* leaf so every new tab lands in the visible panel.
		*
		* Idempotent: a bottom tree with no tabs and a closed panel returns the
		* same reference. Runs when the viewport enters narrow (see the Sidebar
		* shell); migrating is permanent for the session — the tabs now live in the
		* right tree, exactly like the user "threw them in".
		*/
		function migrateBottomTabs(state) {
			const bottomTabs = allLeaves(state.bottomSplits).flatMap((leaf) => leaf.tabs);
			const activeInBottom = state.activePane !== null && treeHasId(state.bottomSplits, state.activePane);
			if (bottomTabs.length === 0 && !state.bottomOpen && !activeInBottom) return state;
			const target = firstLeaf(state.splits);
			return {
				...state,
				activePane: target.id,
				bottomOpen: false,
				splits: bottomTabs.length > 0 ? mapLeaf(state.splits, target.id, (leaf) => {
					leaf.tabs = [...leaf.tabs, ...bottomTabs];
				}) : state.splits,
				bottomSplits: bottomTabs.length > 0 ? clearAllTabs(state.bottomSplits) : state.bottomSplits
			};
		}
		/** Find the leaf containing a tab id, if any. */
		function leafWithTab(node, tabId) {
			if (node.kind === "leaf") return node.tabs.some((tab) => tab.id === tabId) ? node : void 0;
			for (const child of node.children) {
				const found = leafWithTab(child, tabId);
				if (found !== void 0) return found;
			}
		}
		/** All leaves of the tree, depth-first. */
		function allLeaves(node) {
			if (node.kind === "leaf") return [node];
			return node.children.flatMap(allLeaves);
		}
		/** Whether a tab exists anywhere in a state (either tree, any pane). */
		function tabOpenIn(state, tabId) {
			return allLeaves(state.splits).some((leaf) => leaf.tabs.some((tab) => tab.id === tabId)) || allLeaves(state.bottomSplits).some((leaf) => leaf.tabs.some((tab) => tab.id === tabId));
		}
		/**
		* Split a leaf by inserting a fresh leaf holding `tab` beside it — the
		* VSCode drag-to-edge gesture. `dir` is the split direction ('row' for
		* left/right, 'col' for up/down); `front` places the new leaf first (left/
		* up) or second (right/down).
		* @returns the new tree plus the fresh leaf's id (the drop's active pane).
		*/
		function insertLeafAt(node, paneId, dir, tab, front) {
			const fresh = {
				kind: "leaf",
				id: uid("pane"),
				tabs: [tab],
				active: tab.id
			};
			const leafId = fresh.id;
			return {
				node: mapLeaf(node, paneId, (leaf) => {
					const target = { ...leaf };
					const split = {
						kind: "split",
						id: uid("split"),
						dir,
						sizes: [.5, .5],
						children: front ? [fresh, target] : [target, fresh]
					};
					Object.assign(leaf, split);
				}),
				leafId
			};
		}
		/**
		* The VSCode drag gesture: move a tab out of its pane and either merge it
		* into the target pane (center) or split the target pane with the tab in a
		* fresh leaf (edge). The source pane collapses when it empties.
		*
		* The panes may live in DIFFERENT trees (dragging a tab between the two
		* panels): the tab then leaves its own tree and lands in the other one.
		*/
		function moveTabToEdge(state, fromPane, tabId, toPane, zone) {
			if (fromPane === toPane && zone === "center") return moveTab(state, fromPane, tabId, toPane, -1);
			const key = treeOf(state, fromPane);
			const toKey = treeOf(state, toPane);
			if (key !== toKey) {
				const source = leafWithTab(state[key], tabId);
				if (source === void 0) return state;
				const tab = source.tabs.find((candidate) => candidate.id === tabId);
				let emptied = false;
				let sourceNode = mapLeaf(state[key], source.id, (leaf) => {
					leaf.tabs = leaf.tabs.filter((candidate) => candidate.id !== tabId);
					if (leaf.active === tabId) leaf.active = leaf.tabs[leaf.tabs.length - 1]?.id ?? null;
					if (leaf.tabs.length === 0) emptied = true;
				});
				if (emptied) sourceNode = removeLeafAt(sourceNode, source.id);
				let targetNode = state[toKey];
				let activePane;
				if (zone === "center") {
					targetNode = mapLeaf(targetNode, toPane, (leaf) => {
						leaf.tabs = [...leaf.tabs, tab];
						leaf.active = tab.id;
					});
					activePane = toPane;
				} else {
					const result = insertLeafAt(targetNode, toPane, zone === "left" || zone === "right" ? "row" : "col", tab, zone === "left" || zone === "up");
					targetNode = result.node;
					activePane = result.leafId;
				}
				return {
					...state,
					[key]: sourceNode,
					[toKey]: targetNode,
					activePane
				};
			}
			const node = state[key];
			const source = leafWithTab(node, tabId);
			if (source === void 0) return state;
			const tab = source.tabs.find((candidate) => candidate.id === tabId);
			let emptied = false;
			let splits = mapLeaf(node, source.id, (leaf) => {
				leaf.tabs = leaf.tabs.filter((candidate) => candidate.id !== tabId);
				if (leaf.active === tabId) leaf.active = leaf.tabs[leaf.tabs.length - 1]?.id ?? null;
				if (leaf.tabs.length === 0) emptied = true;
			});
			if (emptied) splits = removeLeafAt(splits, source.id);
			if (zone === "center") {
				splits = mapLeaf(splits, toPane, (leaf) => {
					leaf.tabs = [...leaf.tabs, tab];
					leaf.active = tab.id;
				});
				return {
					...state,
					[key]: splits,
					activePane: toPane
				};
			}
			const result = insertLeafAt(splits, toPane, zone === "left" || zone === "right" ? "row" : "col", tab, zone === "left" || zone === "up");
			return {
				...state,
				[key]: result.node,
				activePane: result.leafId
			};
		}
		/**
		* Remove a leaf from the tree. A split left with one child promotes that
		* child; removing the last leaf yields an empty leaf.
		*/
		function removeLeafAt(node, paneId) {
			if (node.kind === "leaf") return node.id === paneId ? {
				...node,
				tabs: [],
				active: null
			} : node;
			const children = node.children.filter((child) => !(child.kind === "leaf" && child.id === paneId));
			if (children.length === node.children.length) return {
				...node,
				sizes: [...node.sizes],
				children: node.children.map((child) => removeLeafAt(child, paneId))
			};
			if (children.length === 1) return children[0];
			return {
				...node,
				sizes: [...node.sizes],
				children
			};
		}
		/** Close a tab; an emptied leaf is removed (unless it is the only pane). */
		function closeTab(state, paneId, tabId) {
			const key = treeOf(state, paneId);
			let emptied = false;
			const splits = mapLeaf(state[key], paneId, (leaf) => {
				leaf.tabs = leaf.tabs.filter((tab) => tab.id !== tabId);
				if (leaf.active === tabId) leaf.active = leaf.tabs[leaf.tabs.length - 1]?.id ?? null;
				if (leaf.tabs.length === 0) emptied = true;
			});
			return {
				...state,
				[key]: emptied ? removeLeafAt(splits, paneId) : splits
			};
		}
		/** Activate a tab in its pane (the pane's own tree). */
		function activateTab(state, paneId, tabId) {
			const key = treeOf(state, paneId);
			return {
				...state,
				activePane: paneId,
				[key]: mapLeaf(state[key], paneId, (leaf) => {
					if (leaf.tabs.some((tab) => tab.id === tabId)) leaf.active = tabId;
				})
			};
		}
		/** Update the display fields of one open tab (title / path / meta) without
		*  re-opening it. The browser tab persists its current URL and hostname
		*  title through this reducer so a reload restores the visited page. A
		*  missing tab id is a no-op. The tab may live in either tree. */
		function patchTab(state, tabId, patch) {
			let changed = false;
			const walk = (node) => {
				if (node.kind === "leaf") {
					const tabs = node.tabs.map((tab) => {
						if (tab.id !== tabId) return tab;
						changed = true;
						return {
							...tab,
							...patch.title !== void 0 ? { title: patch.title } : {},
							...patch.path !== void 0 ? { path: patch.path } : {},
							...patch.meta !== void 0 ? { meta: patch.meta } : {}
						};
					});
					return tabs === node.tabs ? node : {
						...node,
						tabs
					};
				}
				const children = node.children.map(walk);
				return children === node.children ? node : {
					...node,
					children
				};
			};
			const splits = walk(state.splits);
			const bottomSplits = walk(state.bottomSplits);
			return changed ? {
				...state,
				splits,
				bottomSplits
			} : state;
		}
		/**
		* Land a tab in the active pane (or focus its existing instance by id).
		* Dedup strategies (single-instance, per-path, per-change) are owned by the
		* tab descriptor through {@link BetterSidebarService.openTab} / `dedupeKey`;
		* this reducer only handles the id-based safety net (reconcile and
		* openDiffTab already check existence before calling) and the landing
		* itself — the service's dedupe path delegates here after its dedupeKey
		* check misses.
		*
		* The active pane may live in EITHER tree (pane ids are globally unique):
		* a stale id that survives in neither tree falls back to the right tree's
		* first pane instead of swallowing the open.
		*/
		function openTabInActivePane(state, tab) {
			let targetId = state.activePane ?? firstLeaf(state.splits).id;
			if (!allLeaves(state[treeOf(state, targetId)]).some((leaf) => leaf.id === targetId)) targetId = firstLeaf(state.splits).id;
			const targetKey = treeOf(state, targetId);
			for (const leaf of allLeaves(state.splits).concat(allLeaves(state.bottomSplits))) {
				const existing = leaf.tabs.find((candidate) => candidate.id === tab.id);
				if (existing !== void 0) return activateTab(state, leaf.id, existing.id);
			}
			return {
				...state,
				activePane: targetId,
				[targetKey]: mapLeaf(state[targetKey], targetId, (leaf) => {
					leaf.tabs = [...leaf.tabs, tab];
					leaf.active = tab.id;
				})
			};
		}
		/** Read a tab's meta as a plain record (a malformed / absent meta reads as
		*  empty). Shared by the preview-tab reducers. */
		function metaRecord(tab) {
			return tab.meta !== null && typeof tab.meta === "object" && !Array.isArray(tab.meta) ? tab.meta : {};
		}
		/**
		* Whether a tab is a transient "preview" tab (the VSCode italic editor).
		* The flag rides on `meta.preview` so it persists with the layout and
		* survives a tab move / split / reload — no new SidebarTab field, and the
		* existing meta plumbing (openTab seed, patchTab, sanitize) carries it.
		*/
		function isPreviewTab(tab) {
			return metaRecord(tab).preview === true;
		}
		/** Move a tab from one pane to another (insert at index; -1 appends).
		*  The panes may live in DIFFERENT trees — dragging a tab between the two
		*  panels removes it from its own tree and lands it in the other one. */
		function moveTab(state, fromPane, tabId, toPane, index = -1) {
			const fromKey = treeOf(state, fromPane);
			const toKey = treeOf(state, toPane);
			if (fromKey !== toKey) {
				let moved;
				let emptied = false;
				const source = mapLeaf(state[fromKey], fromPane, (leaf) => {
					const found = leaf.tabs.find((tab) => tab.id === tabId);
					if (found === void 0) return;
					moved = found;
					leaf.tabs = leaf.tabs.filter((tab) => tab.id !== tabId);
					if (leaf.active === tabId) leaf.active = leaf.tabs[leaf.tabs.length - 1]?.id ?? null;
					if (leaf.tabs.length === 0) emptied = true;
				});
				if (moved === void 0) return state;
				const target = mapLeaf(state[toKey], toPane, (leaf) => {
					const insertAt = index >= 0 && index <= leaf.tabs.length ? index : leaf.tabs.length;
					leaf.tabs = [
						...leaf.tabs.slice(0, insertAt),
						moved,
						...leaf.tabs.slice(insertAt)
					];
					leaf.active = moved.id;
				});
				return {
					...state,
					[fromKey]: emptied ? removeLeafAt(source, fromPane) : source,
					[toKey]: target,
					activePane: toPane
				};
			}
			let moved;
			let emptied = false;
			let splits = mapLeaf(state[fromKey], fromPane, (leaf) => {
				const found = leaf.tabs.find((tab) => tab.id === tabId);
				if (found === void 0) return;
				moved = found;
				leaf.tabs = leaf.tabs.filter((tab) => tab.id !== tabId);
				if (leaf.active === tabId) leaf.active = leaf.tabs[leaf.tabs.length - 1]?.id ?? null;
				if (leaf.tabs.length === 0) emptied = true;
			});
			if (moved === void 0) return state;
			if (emptied) splits = removeLeafAt(splits, fromPane);
			splits = mapLeaf(splits, toPane, (leaf) => {
				const insertAt = index >= 0 && index <= leaf.tabs.length ? index : leaf.tabs.length;
				leaf.tabs = [
					...leaf.tabs.slice(0, insertAt),
					moved,
					...leaf.tabs.slice(insertAt)
				];
				leaf.active = moved.id;
			});
			return {
				...state,
				[fromKey]: splits,
				activePane: toPane
			};
		}
		/**
		* Open a diff tab the VSCode way: an existing instance of the same change is
		* focused wherever it lives; otherwise the tab joins the first pane that
		* already holds diff tabs (diff panes are sticky — repeated clicks stack
		* there); on the FIRST diff of a layout the source pane splits vertically so
		* the diff lands in a fresh pane below it ("默认在下半栏新增一个").
		*
		* This is split-tree placement surgery, not registry dispatch: the diff tab
		* descriptor's `dedupeKey` is `(tab) => tab.id`, and the existing-instance
		* check below is exactly that rule — the two agree by construction (asserted
		* in tests). Diff tabs minted by the Git view carry change-derived ids, so
		* the id check is the per-change dedupe.
		* @returns the new state, with the diff pane active.
		*/
		function openDiffTab(state, sourcePaneId, tab) {
			const existingLeaf = leafWithTab(state.splits, tab.id);
			if (existingLeaf !== void 0) return activateTab(state, existingLeaf.id, tab.id);
			const diffLeaf = allLeaves(state.splits).find((leaf) => leaf.tabs.some((candidate) => candidate.type === "diff"));
			if (diffLeaf !== void 0) return {
				...state,
				activePane: diffLeaf.id,
				splits: mapLeaf(state.splits, diffLeaf.id, (leaf) => {
					leaf.tabs = [...leaf.tabs, tab];
					leaf.active = tab.id;
				})
			};
			if (!allLeaves(state.splits).some((leaf) => leaf.id === sourcePaneId)) return openTabInActivePane(state, tab);
			const result = insertLeafAt(state.splits, sourcePaneId, "col", tab, false);
			return {
				...state,
				splits: result.node,
				activePane: result.leafId
			};
		}
		/** Toggle the panel open/closed (opening restores the previous layout). */
		function togglePanel(state) {
			return {
				...state,
				panelOpen: !state.panelOpen
			};
		}
		/** Toggle the bottom panel open/closed (independent of the right panel). */
		function toggleBottomPanel(state) {
			return {
				...state,
				bottomOpen: !state.bottomOpen
			};
		}
		/** Set the panel width (clamped to the contract range; the upper bound
		* reserves {@link CENTER_MIN} for the center conversation column so the panel
		* can never be dragged to cover the whole window). */
		function setWidth(state, width) {
			const max = typeof window !== "undefined" ? maxPanelWidthFor(window.innerWidth) : 640;
			return {
				...state,
				width: Math.min(max, Math.max(280, Math.round(width)))
			};
		}
		/** Set the bottom panel height (clamped to the contract range). The upper
		* bound leaves the center column (the agent output area) at least PANEL_MIN
		* tall — without the cap the bottom panel could swallow the whole viewport
		* and squeeze the conversation to zero height. */
		function setBottomHeight(state, height) {
			const viewport = typeof window !== "undefined" ? window.innerHeight : Infinity;
			const max = Math.max(120, viewport - 280);
			return {
				...state,
				bottomHeight: Math.min(max, Math.max(120, Math.round(height)))
			};
		}
		/** Toggle the persistent Explorer rail (the file-tree column beside the
		*  tabbed workbench) open/closed. The rail is decoupled from any tab, so
		*  hiding it never touches the open editor tabs. */
		function toggleExplorer(state) {
			return {
				...state,
				explorerOpen: !state.explorerOpen
			};
		}
		/** Set the Explorer rail width (clamped to the contract range). */
		function setExplorerWidth(state, width) {
			return {
				...state,
				explorerWidth: clampExplorerWidth(width)
			};
		}
		/** Toggle a directory in the explorer expansion set. */
		function toggleExpanded(state, path) {
			const expanded = state.expanded.includes(path) ? state.expanded.filter((item) => item !== path) : [...state.expanded, path];
			return {
				...state,
				expanded
			};
		}
		/** Adjust one split divider: `i` is the left/top child index, delta in fractions. */
		function resizeSplit(node, splitId, index, delta) {
			if (node.kind === "leaf") return node;
			if (node.id === splitId) {
				const sizes = [...node.sizes];
				const left = Math.min(.92, Math.max(.08, sizes[index] + delta));
				const right = Math.min(.92, Math.max(.08, sizes[index + 1] - delta));
				sizes[index] = left;
				sizes[index + 1] = right;
				return {
					...node,
					sizes
				};
			}
			return {
				...node,
				sizes: [...node.sizes],
				children: node.children.map((child) => resizeSplit(child, splitId, index, delta))
			};
		}
		/** State-level {@link resizeSplit} route: the divider may live in either
		*  tree (split ids are globally unique). */
		function resizeSplitIn(state, splitId, index, delta) {
			const key = treeOf(state, splitId);
			return {
				...state,
				[key]: resizeSplit(state[key], splitId, index, delta)
			};
		}
		/** Prefix marking a tab id as an agent-owned terminal (suffix is the uuid). */
		const AGENT_TAB_PREFIX = "agent:";
		/** Whether a tab id refers to an agent-owned terminal. */
		function isAgentTabId(tabId) {
			return tabId.startsWith(AGENT_TAB_PREFIX);
		}
		/** Extract the agent terminal uuid from an `agent:<uuid>` tab id. */
		function agentUuidOf(tabId) {
			return tabId.slice(6);
		}
		/** Build the sidebar tab id for one agent terminal uuid. */
		function agentTabId(uuid) {
			return `${AGENT_TAB_PREFIX}${uuid}`;
		}
		/**
		* Reconcile the sidebar's agent-terminal tabs with the host's live list.
		* The host pushes the current list of agent terminals (created by the model
		* through the `terminal_create` tool) over a dedicated WebSocket; this
		* reducer mirrors that list into tabs: new uuids get a tab, vanished uuids
		* lose theirs. The agent owns the lifetime — the user closing a tab sends a
		* WS close frame that kills the pty, which fires a change, which converges
		* the view. Idempotent: a no-op when the lists already match.
		* @param state - the current per-session sidebar state.
		* @param agentTerminals - the live agent terminal snapshots from the host.
		* @returns the next state (or the same reference if no change was needed).
		*/
		function reconcileAgentTerminals(state, agentTerminals) {
			const existingAgentTabs = allLeaves(state.splits).concat(allLeaves(state.bottomSplits)).flatMap((leaf) => leaf.tabs).filter((tab) => isAgentTabId(tab.id));
			const existingUuids = new Set(existingAgentTabs.map((tab) => agentUuidOf(tab.id)));
			const serverUuids = new Set(agentTerminals.map((t) => t.uuid));
			const toAdd = agentTerminals.filter((t) => !existingUuids.has(t.uuid));
			const toRemove = existingAgentTabs.filter((tab) => !serverUuids.has(agentUuidOf(tab.id)));
			if (toAdd.length === 0 && toRemove.length === 0) return state;
			let splits = state.splits;
			for (const tab of toRemove) {
				const leaf = leafWithTab(splits, tab.id);
				if (leaf !== void 0) splits = closeTab({
					...state,
					splits
				}, leaf.id, tab.id).splits;
			}
			let next = {
				...state,
				splits
			};
			for (const terminal of toAdd) {
				const tab = {
					id: agentTabId(terminal.uuid),
					type: "terminal",
					title: terminal.title
				};
				next = openTabInActivePane(next, tab);
			}
			return next;
		}
		const STORAGE_PREFIX = "dsh-sidebar:v1";
		/** Default panel width for one viewport: the prefs percent of the window,
		* clamped to the panel floor (a tiny percent must stay usable) and to the
		* viewport (a large one must never cover the whole window). */
		function defaultWidthFor(viewport, percent) {
			return Math.min(maxPanelWidthFor(viewport), Math.max(280, Math.round(viewport * percent / 100)));
		}
		function loadState(sessionId, prefs) {
			try {
				const raw = localStorage.getItem(`${STORAGE_PREFIX}:${sessionId}`);
				if (raw !== null) {
					const parsed = JSON.parse(raw);
					nextIdCounter = maxCounterId(parsed);
					const sanitized = sanitizeState(parsed);
					if (sanitized !== void 0) return sanitized;
				}
			} catch {}
			const viewport = typeof window !== "undefined" ? window.innerWidth : void 0;
			return makeDefaultState(viewport === void 0 ? 400 : defaultWidthFor(viewport, prefs.defaultWidthPercent), prefs.openByDefault && (viewport === void 0 || !isNarrowWidth(viewport)), "none");
		}
		/**
		* Structural validation of one persisted state. A malformed or stale shape
		* (older layouts, hand-edited storage) must fall back to the default instead
		* of crashing the panel on every reload; the restored width is also clamped
		* to the current viewport so a stale fullscreen width can never crush the
		* app shell (margin-right larger than the window) or cover the whole screen.
		* @returns a clean state, or undefined to fall back to the default.
		*/
		function sanitizeState(parsed) {
			if (parsed === null || typeof parsed !== "object") return void 0;
			const record = parsed;
			if (typeof record.panelOpen !== "boolean") return void 0;
			if (typeof record.width !== "number" || !Number.isFinite(record.width)) return void 0;
			if (typeof record.nextTerminal !== "number" || !Number.isInteger(record.nextTerminal) || record.nextTerminal < 1) return;
			const nextBrowser = typeof record.nextBrowser === "number" && Number.isInteger(record.nextBrowser) && record.nextBrowser >= 1 ? record.nextBrowser : 1;
			if (typeof record.activePane !== "string" && record.activePane !== null) return void 0;
			if (!Array.isArray(record.expanded) || record.expanded.some((item) => typeof item !== "string")) return void 0;
			const seen = /* @__PURE__ */ new Set();
			const reid = /* @__PURE__ */ new Map();
			const restoredSplits = sanitizeNode(record.splits, seen, reid);
			if (restoredSplits === void 0) return void 0;
			const splits = pruneEmptyPanes(restoredSplits);
			const bottomOpen = record.bottomOpen === true;
			const maxHeight = typeof window !== "undefined" ? window.innerHeight : Infinity;
			const bottomCap = Math.max(120, maxHeight - 280);
			const rawHeight = typeof record.bottomHeight === "number" && Number.isFinite(record.bottomHeight) ? record.bottomHeight : 220;
			const bottomHeight = Math.min(bottomCap, Math.max(120, Math.round(rawHeight)));
			const bottomSplits = pruneEmptyPanes(sanitizeNode(record.bottomSplits, seen, reid) ?? {
				kind: "leaf",
				id: uid("pane"),
				tabs: [],
				active: null
			});
			const requestedActivePane = typeof record.activePane === "string" ? reid.get(record.activePane) ?? record.activePane : null;
			const activePane = requestedActivePane === null ? null : treeHasId(splits, requestedActivePane) || treeHasId(bottomSplits, requestedActivePane) ? requestedActivePane : firstLeaf(splits).id;
			const maxWidth = typeof window !== "undefined" ? maxPanelWidthFor(window.innerWidth) : Infinity;
			return {
				panelOpen: record.panelOpen,
				width: Math.max(280, Math.min(record.width, maxWidth)),
				explorerOpen: typeof record.explorerOpen === "boolean" ? record.explorerOpen : true,
				explorerWidth: typeof record.explorerWidth === "number" && Number.isFinite(record.explorerWidth) ? clampExplorerWidth(record.explorerWidth) : 240,
				activePane,
				nextTerminal: record.nextTerminal,
				nextBrowser,
				expanded: record.expanded,
				splits,
				bottomOpen,
				bottomHeight,
				bottomOpenedOnce: record.bottomOpenedOnce === true,
				bottomSplits
			};
		}
		/** Collapse persisted split panes left empty after ephemeral diff tabs are dropped. */
		function pruneEmptyPanes(node) {
			const leaves = allLeaves(node);
			if (!leaves.some((leaf) => leaf.tabs.length > 0)) return node;
			return leaves.reduce((tree, leaf) => leaf.tabs.length === 0 ? removeLeafAt(tree, leaf.id) : tree, node);
		}
		/**
		* One tree node id, deduplicated against the ids already seen in this
		* state. Duplicates are exactly the pre-seeding counter-reset corruption
		* (a "pane:1"/"split:1" minted after a reload beside the persisted ones):
		* keeping both would make mapLeaf visit two leaves at once and every open
		* would land in both panes, so the repeat gets a fresh id.
		* @returns the id to use (the original, or a fresh uid for repeats).
		*/
		function uniqueNodeId(id, seen, reid) {
			if (!seen.has(id)) {
				seen.add(id);
				return id;
			}
			const fresh = uid(/^split:\d+$/.test(id) ? "split" : "pane");
			seen.add(fresh);
			reid.set(id, fresh);
			return fresh;
		}
		/** Validate one split-tree node (leaf or split) and rebuild it cleanly. */
		function sanitizeNode(node, seen, reid) {
			if (node === null || typeof node !== "object") return void 0;
			const record = node;
			if (record.kind === "leaf") {
				if (typeof record.id !== "string" || !Array.isArray(record.tabs)) return void 0;
				const tabs = [];
				let droppedDiff = false;
				let droppedHome = false;
				for (const tab of record.tabs) {
					if (tab === null || typeof tab !== "object") return void 0;
					const candidate = tab;
					if (typeof candidate.id !== "string" || typeof candidate.title !== "string") return void 0;
					if (candidate.type === "diff") {
						droppedDiff = true;
						continue;
					}
					if (typeof candidate.type !== "string") return void 0;
					const pathlessEditor = candidate.type === "editor" && !(typeof candidate.path === "string" && candidate.path !== "");
					if (candidate.type === "explorer" || pathlessEditor) {
						droppedHome = true;
						continue;
					}
					tabs.push({
						id: candidate.id,
						type: candidate.type,
						title: candidate.title,
						...typeof candidate.path === "string" ? { path: candidate.path } : {},
						...candidate.meta !== void 0 ? { meta: candidate.meta } : {}
					});
				}
				const active = typeof record.active === "string" ? record.active : null;
				if (active !== null && !tabs.some((tab) => tab.id === active) && !droppedDiff && !droppedHome) return void 0;
				return {
					kind: "leaf",
					id: uniqueNodeId(record.id, seen, reid),
					tabs,
					active: active !== null && tabs.some((tab) => tab.id === active) ? active : null
				};
			}
			if (record.kind === "split") {
				if (typeof record.id !== "string" || record.dir !== "row" && record.dir !== "col") return void 0;
				if (!Array.isArray(record.children) || !Array.isArray(record.sizes)) return void 0;
				const children = [];
				for (const child of record.children) {
					const clean = sanitizeNode(child, seen, reid);
					if (clean === void 0) return void 0;
					children.push(clean);
				}
				if (children.length < 2) return void 0;
				if (record.sizes.length !== children.length || record.sizes.some((size) => typeof size !== "number" || !Number.isFinite(size) || size <= 0)) return;
				return {
					kind: "split",
					id: uniqueNodeId(record.id, seen, reid),
					dir: record.dir,
					sizes: record.sizes,
					children
				};
			}
		}
		/** The session-scoped store: one state per conversation, localStorage-backed. */
		var SidebarStore = class {
			bySession = /* @__PURE__ */ new Map();
			snapshot = {
				sessionId: void 0,
				state: void 0,
				prefs: { ...SIDEBAR_PREFS_DEFAULTS }
			};
			listeners = /* @__PURE__ */ new Set();
			/** Per-session persist debounce timers (v0.12.0+: one per session, so a
			*  targeted open never cancels another session's pending write). */
			persistTimers = /* @__PURE__ */ new Map();
			/** User-facing side card prefs seeding brand-new session states (defaults until the settings RPC resolves). */
			prefs = { ...SIDEBAR_PREFS_DEFAULTS };
			/**
			* External disable (the dsh-web-ui family's aionui-panel provider choice):
			* while true the sidebar must not mount at all. Not part of the snapshot —
			* nothing renders on it; the mount gate and the intercept predicates read
			* it directly.
			*/
			suspended = false;
			/**
			* Set the external-disable flag (from the settings route) and remember it
			* for the mount gate and the intercept predicates.
			*/
			setSuspended(suspended) {
				this.suspended = suspended;
			}
			/** Whether the sidebar is externally disabled (aionui-panel chosen). */
			getSuspended() {
				return this.suspended;
			}
			/**
			* Replace the side card prefs (the settings RPC result / settings page
			* write). Notifies like any store change: the snapshot carries the prefs,
			* so consumers that gate on enable switches (the + menu, derived flows)
			* re-render with the new values immediately.
			*/
			setPrefs(prefs) {
				this.prefs = { ...prefs };
				this.snapshot = {
					...this.snapshot,
					prefs: this.prefs
				};
				this.notify();
			}
			/** The current side card prefs (seeds new sessions; persisted states win). */
			getPrefs() {
				return { ...this.prefs };
			}
			/** Select a session (or none); loads its persisted state. */
			setSession(sessionId) {
				if (this.snapshot.sessionId === sessionId) return;
				if (sessionId === void 0) this.snapshot = {
					sessionId: void 0,
					state: void 0,
					prefs: this.prefs
				};
				else {
					let state = this.bySession.get(sessionId);
					if (state === void 0) {
						state = loadState(sessionId, this.prefs);
						this.bySession.set(sessionId, state);
					} else nextIdCounter = maxCounterId(state);
					this.snapshot = {
						sessionId,
						state,
						prefs: this.prefs
					};
				}
				this.notify();
			}
			subscribe(listener) {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			}
			getSnapshot() {
				return this.snapshot;
			}
			/** Mutate the current session's state (no-op without a session). */
			update(mutator) {
				const sessionId = this.snapshot.sessionId;
				const state = this.snapshot.state;
				if (sessionId === void 0 || state === void 0) return;
				const draft = structuredClone(state);
				mutator(draft);
				this.bySession.set(sessionId, draft);
				this.snapshot = {
					sessionId,
					state: draft,
					prefs: this.prefs
				};
				this.schedulePersist(sessionId, draft);
				this.notify();
			}
			/**
			* Whether a tab still exists in its session's state. Views use this on
			* unmount to tell "the tab was closed" (release the terminal now) from
			* "the tree re-rendered / the conversation switched" (the tab is still
			* open — keep the terminal alive through the host's reconnect grace).
			* Checks the session's own map entry (the current snapshot may already
			* point at another session when a conversation switch unmounts the old
			* one's tabs).
			*/
			tabOpen(sessionId, tabId) {
				const state = this.bySession.get(sessionId) ?? (this.snapshot.sessionId === sessionId ? this.snapshot.state : void 0);
				return state !== void 0 && tabOpenIn(state, tabId);
			}
			/** Apply a pure reducer (returns the next state). */
			reduce(reducer) {
				const sessionId = this.snapshot.sessionId;
				const state = this.snapshot.state;
				if (sessionId === void 0 || state === void 0) return;
				const next = reducer(state);
				if (next === state) return;
				this.bySession.set(sessionId, next);
				this.snapshot = {
					sessionId,
					state: next,
					prefs: this.prefs
				};
				this.schedulePersist(sessionId, next);
				this.notify();
			}
			/**
			* Apply a pure reducer to a TARGET session's state (not the active one),
			* loading it on demand and persisting the result — WITHOUT switching the
			* active snapshot or notifying (the UI must not follow along). Used by the
			* service's targeted `openTab(seed, scope)`: the open lands in the target
			* session's layout and is visible whenever the user switches to it.
			*/
			reduceFor(sessionId, reducer) {
				const counterBefore = nextIdCounter;
				let state = this.bySession.get(sessionId);
				if (state === void 0) {
					state = loadState(sessionId, this.prefs);
					this.bySession.set(sessionId, state);
				} else nextIdCounter = maxCounterId(state);
				const next = reducer(state);
				nextIdCounter = Math.max(nextIdCounter, counterBefore);
				if (next === state) return;
				this.bySession.set(sessionId, next);
				this.schedulePersist(sessionId, next);
			}
			schedulePersist(sessionId, state) {
				const existing = this.persistTimers.get(sessionId);
				if (existing !== void 0) window.clearTimeout(existing);
				const timer = window.setTimeout(() => {
					this.persistTimers.delete(sessionId);
					try {
						localStorage.setItem(`${STORAGE_PREFIX}:${sessionId}`, JSON.stringify(state));
					} catch {}
				}, 200);
				this.persistTimers.set(sessionId, timer);
			}
			notify() {
				for (const listener of [...this.listeners]) listener();
			}
		};
		/**
		* Create one sidebar store instance. Production code calls this only from
		* the client plugin's `apply` (the instance is handed to components as a
		* prop); tests call it directly. No module-level singleton: the store's
		* lifetime belongs to the plugin activation, exactly like the official
		* `createXXXStore()` factory rule.
		*/
		function createSidebarStore() {
			return new SidebarStore();
		}
		//#endregion
		//#region src/client/service.ts
		/** Extract the lowercase extension without leading dot from a path. */
		function extOfPath(path) {
			const at = path.lastIndexOf(".");
			if (at === -1) return "";
			const base = path.slice(at + 1).toLowerCase();
			return base.includes("/") || base.includes("\\") ? "" : base;
		}
		/** The file name of a path (both separators). */
		function baseNameOf(path) {
			const at = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
			return at === -1 ? path : path.slice(at + 1);
		}
		/**
		* Find the tab type that claims an intercepted external-link URL (v0.13.0+).
		* Walks the descriptors in REGISTRATION order and returns the first one
		* that declares `urlTarget` and matches `url`; a throwing predicate is
		* swallowed (console.error, type skipped) so one broken plugin can never
		* break the whole link pipeline. The caller passes the ENABLED tab
		* descriptors (enablement is the caller's prefs domain — filter
		* `service.getTabs()` through `tabsEnabled` before matching) and falls
		* back to the built-in browser tab when nothing claims the URL (the
		* browser never declares `urlTarget` itself, so it can never shadow a
		* plugin claim).
		*/
		function matchUrlTarget(tabs, url) {
			for (const tab of tabs) {
				if (tab.urlTarget === void 0) continue;
				let claimed = false;
				try {
					claimed = tab.urlTarget(url) === true;
				} catch (error) {
					console.error("[dsh-better-sidebar] urlTarget error:", error);
					continue;
				}
				if (claimed) return tab;
			}
		}
		/**
		* The plugin version this service instance reports. Keep in lockstep with
		* `package.json`'s version — `tests/service.spec.ts` asserts the pair.
		*/
		const SIDEBAR_SERVICE_VERSION = "0.15.2";
		/**
		* Monotonic capability list consumers use to gate new API usage (features
		* are never removed). Each string names a v0.12.0+ capability:
		* - 'badge': TabDescriptor.badge
		* - 'tabLifecycle': TabDescriptor.onOpen/onActivate/onClose
		* - 'updateTab': BetterSidebarService.updateTab
		* - 'openFile': BetterSidebarService.openFile
		* - 'targetedOpen': BetterSidebarService.openTab(seed, scope?)
		* - 'stateSubscription': getSnapshot/subscribeState
		* - 'tabMeta': SidebarTab.meta (seeds, createTab, updateTab, persistence)
		* - 'pluginSettings': SidebarSettingsDeclaration.pluginToggles/render
		* - 'urlTarget' (v0.13.0): TabDescriptor.urlTarget (external-link claims)
		* - 'settingSelect': SidebarSettingToggle type 'select' (options/multi)
		*/
		const SIDEBAR_FEATURES = [
			"badge",
			"tabLifecycle",
			"updateTab",
			"openFile",
			"targetedOpen",
			"stateSubscription",
			"tabMeta",
			"pluginSettings",
			"urlTarget",
			"settingSelect"
		];
		/** Run one plugin callback; a throw is logged and never breaks the caller. */
		function safeCall(fn) {
			try {
				fn();
			} catch (error) {
				console.error("[dsh-better-sidebar] plugin callback error:", error);
			}
		}
		/**
		* Create one BetterSidebar service bound to a store. The service owns the
		* tab/viewer registries (Map + listener set) and proxies openTab/closeTab
		* to the store's reducer. One instance per client plugin activation.
		*/
		function createBetterSidebarService(store) {
			const tabs = /* @__PURE__ */ new Map();
			const viewers = /* @__PURE__ */ new Map();
			const listeners = /* @__PURE__ */ new Set();
			const notify = () => {
				for (const fn of [...listeners]) fn();
			};
			const subscribe = (listener) => {
				listeners.add(listener);
				return () => {
					listeners.delete(listener);
				};
			};
			const registerTab = (descriptor) => {
				if (tabs.has(descriptor.id)) throw new Error(`[dsh-better-sidebar] tab type "${descriptor.id}" already registered`);
				tabs.set(descriptor.id, descriptor);
				notify();
				return () => {
					if (tabs.get(descriptor.id) === descriptor) {
						tabs.delete(descriptor.id);
						notify();
					}
				};
			};
			const registerFileViewer = (descriptor) => {
				if (viewers.has(descriptor.id)) throw new Error(`[dsh-better-sidebar] file viewer "${descriptor.id}" already registered`);
				viewers.set(descriptor.id, descriptor);
				notify();
				return () => {
					if (viewers.get(descriptor.id) === descriptor) {
						viewers.delete(descriptor.id);
						notify();
					}
				};
			};
			const getTabs = () => Array.from(tabs.values());
			const getFileViewers = () => Array.from(viewers.values());
			const getTab = (id) => tabs.get(id);
			const isTabEnabled = (id) => store.getPrefs().tabsEnabled[id] !== false;
			const isViewerEnabled = (id) => store.getPrefs().viewersEnabled[id] !== false;
			const matchFileViewer = (path, head) => {
				const ext = extOfPath(path);
				for (const v of Array.from(viewers.values()).sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))) {
					if (!isViewerEnabled(v.id)) continue;
					if (head !== void 0 && v.detect !== void 0) {
						if (v.detect(path, head)) return v;
						if (v.exts.length === 0) continue;
					} else if (v.exts.length === 0) {
						if (v.detect === void 0) return v;
						continue;
					}
					if (v.exts.includes(ext)) return v;
				}
			};
			const openTab = (seed, scope) => {
				if (!isTabEnabled(seed.type)) {
					console.warn(`[dsh-better-sidebar] tab type "${seed.type}" is disabled in the side card settings`);
					return;
				}
				const descriptor = tabs.get(seed.type);
				if (descriptor === void 0) return;
				const targetSessionId = scope?.sessionId ?? store.getSnapshot().sessionId;
				if (targetSessionId === void 0) return;
				const callbackScope = scope ?? { sessionId: targetSessionId };
				const activeSessionId = store.getSnapshot().sessionId;
				const targetsInactiveSession = scope !== void 0 && scope.sessionId !== activeSessionId;
				let created;
				let activated;
				const reducer = (state) => {
					let tab;
					let next;
					if (descriptor.createTab !== void 0) {
						const result = descriptor.createTab(state);
						if (result === null) return state;
						tab = result.tab;
						next = applyDedupe(state, result.tab, descriptor);
						if (result.patch !== void 0) next = {
							...next,
							...result.patch
						};
					} else {
						tab = {
							id: seed.id ?? seed.type,
							type: seed.type,
							title: seed.title ?? (typeof descriptor.title === "function" ? descriptor.title() : descriptor.title),
							...seed.path !== void 0 ? { path: seed.path } : {},
							...seed.diff !== void 0 ? { diff: seed.diff } : {},
							...seed.meta !== void 0 ? { meta: seed.meta } : {}
						};
						next = applyDedupe(state, tab, descriptor);
					}
					const dedupeKey = descriptor.dedupeKey ?? (descriptor.single === true ? () => descriptor.id : void 0);
					const key = dedupeKey?.(tab);
					const inputTabs = allLeaves(state.splits).concat(allLeaves(state.bottomSplits)).flatMap((leaf) => leaf.tabs);
					const existedByKey = key !== void 0 && inputTabs.some((candidate) => candidate.type === tab.type && dedupeKey(candidate) === key);
					const existedById = tabOpenIn(state, tab.id);
					const isCreation = !existedByKey && !existedById;
					let landed = next;
					if (seed.url !== void 0 && isCreation) landed = patchTab(next, tab.id, {
						path: seed.url,
						...seed.title !== void 0 ? { title: seed.title } : {}
					});
					if (isCreation) created = allLeaves(landed.splits).concat(allLeaves(landed.bottomSplits)).flatMap((leaf) => leaf.tabs).find((candidate) => candidate.id === tab.id) ?? tab;
					else {
						const candidates = allLeaves(landed.splits).concat(allLeaves(landed.bottomSplits)).flatMap((leaf) => leaf.tabs);
						activated = key !== void 0 ? candidates.find((candidate) => candidate.type === tab.type && dedupeKey(candidate) === key) : candidates.find((candidate) => candidate.id === tab.id);
						activated ??= tab;
					}
					if (!targetsInactiveSession && typeof window !== "undefined" && (seed.path !== void 0 || seed.url !== void 0)) {
						if (isNarrowWidth(window.innerWidth)) {
							if (!landed.panelOpen) return togglePanel(landed);
						} else if (treeOf(landed, landed.activePane ?? "") === "bottomSplits") {
							if (!landed.bottomOpen) return {
								...landed,
								bottomOpen: true
							};
						} else if (!landed.panelOpen) return togglePanel(landed);
					}
					return landed;
				};
				if (targetsInactiveSession) store.reduceFor(scope.sessionId, reducer);
				else store.reduce(reducer);
				if (created !== void 0) safeCall(() => descriptor.onOpen?.(created, callbackScope));
				else if (activated !== void 0) safeCall(() => descriptor.onActivate?.(activated, callbackScope));
			};
			const closeTab$1 = (tabId, scope) => {
				let closed;
				store.reduce((state) => {
					if (!tabOpenIn(state, tabId)) return state;
					const paneId = findPaneIdOf(state, tabId);
					closed = leafWithTab(state[treeOf(state, paneId)], tabId)?.tabs.find((tab) => tab.id === tabId);
					return closeTab(state, paneId, tabId);
				});
				if (closed !== void 0) {
					const sessionId = scope?.sessionId ?? store.getSnapshot().sessionId;
					if (sessionId !== void 0) {
						const descriptor = tabs.get(closed.type);
						safeCall(() => descriptor?.onClose?.(closed, scope ?? { sessionId }));
					}
				}
			};
			/** The snapshot the store publishes (state/prefs carry the active session). */
			const getSnapshot = () => store.getSnapshot();
			/** Store changes: session switch, state mutations, prefs writes. */
			const subscribeState = (listener) => store.subscribe(listener);
			/** Patch an open tab's display fields (a missing tab id is a no-op). */
			const updateTab = (tabId, patch) => {
				store.reduce((state) => patchTab(state, tabId, {
					...patch.title !== void 0 ? { title: patch.title } : {},
					...patch.path !== void 0 ? { path: patch.path } : {},
					...patch.meta !== void 0 ? { meta: patch.meta } : {}
				}));
			};
			/** Activate an open tab (the tab-bar activation path; fires onActivate). */
			const activateTab$1 = (tabId, scope) => {
				let activated;
				store.reduce((state) => {
					if (!tabOpenIn(state, tabId)) return state;
					const paneId = findPaneIdOf(state, tabId);
					activated = leafWithTab(state[treeOf(state, paneId)], tabId)?.tabs.find((tab) => tab.id === tabId);
					return activateTab(state, paneId, tabId);
				});
				if (activated !== void 0) {
					const sessionId = scope?.sessionId ?? store.getSnapshot().sessionId;
					if (sessionId !== void 0) {
						const descriptor = tabs.get(activated.type);
						safeCall(() => descriptor?.onActivate?.(activated, scope ?? { sessionId }));
					}
				}
			};
			/** Open a file in the sidebar editor of `scope`'s session (title defaults
			*  to the file name; the tab id is path-derived, like the internal
			*  open-path interception, so distinct files open side by side). */
			const openFile = (scope, path, title) => {
				openTab({
					type: "editor",
					title: title ?? baseNameOf(path),
					path,
					id: `editor:${path}`
				}, scope);
			};
			return {
				registerTab,
				registerFileViewer,
				getTabs,
				getFileViewers,
				getTab,
				isTabEnabled,
				isViewerEnabled,
				matchFileViewer,
				openTab,
				closeTab: closeTab$1,
				subscribe,
				version: SIDEBAR_SERVICE_VERSION,
				features: SIDEBAR_FEATURES,
				getSnapshot,
				subscribeState,
				updateTab,
				activateTab: activateTab$1,
				openFile
			};
		}
		/**
		* Apply dedup: if a tab whose `dedupeKey` matches an existing tab of the
		* same type exists, focus it; otherwise land the tab through
		* `openTabInActivePane` (the id safety net + active-pane landing are that
		* reducer's job — not re-implemented here).
		* `single: true` resolves to the id-key sugar when no explicit key is given.
		*/
		function applyDedupe(state, tab, descriptor) {
			const dedupeKey = descriptor.dedupeKey ?? (descriptor.single === true ? () => descriptor.id : void 0);
			const key = dedupeKey?.(tab);
			if (key !== void 0) for (const leaf of allLeaves(state.splits).concat(allLeaves(state.bottomSplits))) {
				const existing = leaf.tabs.find((t) => t.type === tab.type && dedupeKey(t) === key);
				if (existing !== void 0) return activateTab(state, leaf.id, existing.id);
			}
			return openTabInActivePane(state, tab);
		}
		/** Find which pane hosts a tab id ('' if none). Either tree is searched. */
		function findPaneIdOf(state, tabId) {
			for (const leaf of allLeaves(state.splits).concat(allLeaves(state.bottomSplits))) if (leaf.tabs.some((t) => t.id === tabId)) return leaf.id;
			return state.activePane ?? "";
		}
		//#endregion
		//#region src/client/chunk-availability.ts
		/**
		* Chunk availability probes + the auto-retry loop for lazy chunk loads.
		*
		* Split out of chunk-loader.ts as PURE functions and an injectable loop
		* (scheduler / probe / load all replaceable) so the retry policy is unit
		* testable without a DOM, network, or the kernel client runtime
		* (dsh-desktop/scripts/test/unit-better-sidebar-chunk-retry.test.js runs
		* this against lib/chunk-availability.js, the compiled mirror of this
		* file, with node --test).
		*
		* Background (0.5.0 user report): while the kernel process dies/restarts,
		* `window.__DSH_MODULES__` is briefly missing, so a lazy chunk load threw
		* `chunk "editor": client module system unavailable` and the view stayed
		* on its manual-retry error state forever — to a user the sidebar looked
		* bricked. The loop here keeps probing with exponential backoff (2s/4s/
		* 8s/… capped at 30s, unlimited rounds) and wakes subscribed views the
		* moment the module system and chunk come back, so recovery is automatic.
		*/
		/** First auto-retry delay (ms) after the initial load failure. */
		const CHUNK_RETRY_BASE_DELAY_MS = 2e3;
		/** Backoff ceiling (ms) for chunk auto-retry. */
		const CHUNK_RETRY_MAX_DELAY_MS = 3e4;
		/**
		* Delay before the next auto-retry attempt: base * 2^(failedAttempts-1),
		* capped at max. `failedAttempts` counts loads that already failed
		* (1 = right after the first failure → base). Non-positive/non-finite
		* input is treated as 1 (never 0 / NaN / Infinity delay).
		*/
		function nextDelayMs(failedAttempts, base = CHUNK_RETRY_BASE_DELAY_MS, max = CHUNK_RETRY_MAX_DELAY_MS) {
			const n = Number.isFinite(failedAttempts) && failedAttempts >= 1 ? Math.floor(failedAttempts) : 1;
			const b = Number.isFinite(base) && base > 0 ? base : CHUNK_RETRY_BASE_DELAY_MS;
			const m = Number.isFinite(max) && max > 0 ? max : CHUNK_RETRY_MAX_DELAY_MS;
			return Math.min(b * 2 ** (n - 1), Math.max(b, m));
		}
		/**
		* Whether the client module system is present with a callable import —
		* the cheap probe every retry round runs first; while it is down the
		* chunk script is not even fetched. On DSH 0.1.0-rc.8 the shell no longer
		* exposes `window.__DSH_MODULES__`; it injects the system through
		* `ctx.modules`, which the client half mirrors onto the plugin-owned
		* `__dshSidebarModuleSystem__` page global. The legacy `__DSH_MODULES__`
		* global stays a fallback for rc.7-era hosts and the test harness.
		*/
		function isModuleSystemAvailable(globalLike = globalThis) {
			if (globalLike === null || typeof globalLike !== "object") return false;
			const g = globalLike;
			const modules = g.__DSH_MODULES__ ?? g.__dshSidebarModuleSystem__;
			return typeof modules === "object" && modules !== null && typeof modules.import === "function";
		}
		/** Shared error copy for the unavailable case (load + tests assert this). */
		function moduleSystemUnavailableMessage(chunk) {
			return `[dsh-better-sidebar] chunk "${chunk}": client module system unavailable`;
		}
		/**
		* One shared auto-retry loop per chunk: exponential backoff, unlimited
		* rounds, exactly one pending timer however many views subscribe. The
		* loop self-disposes when its last subscriber unsubscribes (a view
		* unmounting can never leak a timer), on success (ready event), or via
		* {@link ChunkRetryLoop.dispose} (plugin HMR reset).
		*
		* Subscriber callbacks are isolated: a throwing view breaks nothing.
		*/
		function createChunkRetryLoop(name, options) {
			const { isAvailable = () => isModuleSystemAvailable(globalThis), attemptLoad, schedule } = options;
			const timer = schedule ?? ((fn, delayMs) => {
				const id = setTimeout(fn, delayMs);
				return () => {
					clearTimeout(id);
				};
			});
			let fails = 1;
			let pending;
			let inFlight = false;
			let done = false;
			const subscribers = /* @__PURE__ */ new Set();
			const emit = (event) => {
				for (const onEvent of [...subscribers]) try {
					onEvent(event);
				} catch (error) {
					console.error(`[dsh-better-sidebar] chunk "${name}" retry subscriber error:`, error);
				}
			};
			const cancelPending = () => {
				if (pending !== void 0) {
					pending();
					pending = void 0;
				}
			};
			const scheduleProbe = () => {
				cancelPending();
				pending = timer(() => {
					probe();
				}, nextDelayMs(fails));
			};
			const finish = () => {
				done = true;
				cancelPending();
			};
			const probe = async () => {
				pending = void 0;
				if (done) return;
				if (!isAvailable()) {
					fails += 1;
					emit({
						attempt: fails,
						ready: false
					});
					scheduleProbe();
					return;
				}
				inFlight = true;
				try {
					await attemptLoad();
				} catch {
					inFlight = false;
					if (done) return;
					fails += 1;
					emit({
						attempt: fails,
						ready: false
					});
					scheduleProbe();
					return;
				}
				inFlight = false;
				finish();
				emit({
					attempt: fails,
					ready: true
				});
			};
			return {
				subscribe(onEvent) {
					if (done) throw new Error(`[dsh-better-sidebar] chunk "${name}" retry loop already finished`);
					subscribers.add(onEvent);
					if (pending === void 0 && !inFlight) scheduleProbe();
					let subscribed = true;
					return () => {
						if (!subscribed) return;
						subscribed = false;
						subscribers.delete(onEvent);
						if (subscribers.size === 0) finish();
					};
				},
				get active() {
					return !done;
				},
				poke() {
					if (done || inFlight) return;
					cancelPending();
					probe();
				},
				dispose() {
					subscribers.clear();
					finish();
				}
			};
		}
		//#endregion
		//#region src/client/chunk-loader.ts
		/**
		* Lazy chunk loader for the client bundle. The heavy preview/terminal
		* libraries (CodeMirror, xterm — the editor/terminal stacks, several MB)
		* live in separate build-time bundles (`lib/client-<name>.js`) fetched only
		* on first use of the feature that needs them, so startup downloads/parses
		* only the ~1MB core bundle. (The office stack — Univer / docx-preview /
		* pptx-renderer — is no longer bundled here: Office previews moved to the
		* recommended office plugin, see plugins-viewers.ts.)
		*
		* How a chunk script works (see tsdown.config.ts chunkBundle):
		*
		*   globalThis.__dshChunks__ = globalThis.__dshChunks__ || {};
		*   globalThis.__dshChunks__["terminal"] = (require) => { ...exports };
		*
		* The script registers its factory on a plugin-owned global registry (NOT
		* through window.__ModuleLoader__.load — the module loader's import() only
		* resolves seed words, shell-own modules, registered factories, and boot
		* graph rows; a chunk id is none of those, so resolution would be version-
		* dependent). Materialization is plugin-owned:
		*
		* 1. inject <script src="/sidebar/bundle/<name>.js"> (classic same-origin
		*    script; the official /plugins/<id>/client.js route cannot serve
		*    arbitrary file names, so the plugin's own host route serves the chunks),
		* 2. read the factory from the global registry,
		* 3. call it with a require that resolves the platform externals through
		*    `__DSH_MODULES__.import(spec)` — the seed-word branch, the one part of
		*    the module system that is stable across versions.
		*
		* Caching contract (three layers, each with a failure path):
		* - In-memory: one in-flight promise per chunk, memoized until
		*   {@link resetChunks}; a failed load removes its entry so the next call
		*   retries from scratch. HMR re-activation keeps the resolved exports of
		*   unchanged chunks (ETag revalidation via
		*   {@link revalidateChunksOnReactivate}) — the next lazy open skips the
		*   re-inject / re-execute.
		* - Script execution: each re-execution overwrites the global registry slot
		*   (assignment, never registration) — no "duplicate factory registration"
		*   class of errors; a failed materialization clears the cache so the retry
		*   re-injects and re-executes.
		* - HTTP: the bundle route revalidates every request (`cache-control:
		*   no-cache` + ETag, 304 when unchanged), so page refreshes and HMR
		*   re-activations never re-download a multi-MB chunk that did not change.
		*
		* HMR: each plugin activation calls {@link revalidateChunksOnReactivate},
		* which HEADs every loaded chunk against the bundle route and keeps the
		* in-memory cache for the ones whose ETag is unchanged (a hot-reloaded core
		* bundle therefore does not re-execute multi-MB chunk scripts). Chunk-only
		* source edits still need a manual page refresh (the HMR poll watches only
		* client.js); an edit that does land while a core HMR happens is caught by
		* the ETag comparison on the next activation.
		*/
		/**
		* The platform externals a chunk bundle may require (mirror of
		* CLIENT_EXTERNALS in tsdown.config.ts — the chunk builds keep these
		* external and the loader resolves them here). A superset is safe: the
		* require only answers what the chunk actually asks for. The shell's static
		* module table seeds React, Cordis, and the UI libraries (primitives/slots);
		* `dsh-client-runtime/client` normalizes onto the runtime package row
		* (stripClientSuffix). dsh-client-web-react / dsh-client-schema-form were
		* dropped in DSH 0.1.0-rc.8 (no rc.8 publish, nothing requires them) — the
		* chunks never asked for them, so they no longer belong here.
		*/
		const CHUNK_EXTERNALS = [
			"react",
			"react/jsx-runtime",
			"react-dom",
			"react-dom/client",
			"cordis",
			"@deepseek-ai/dsh-client-ui-slots",
			"@deepseek-ai/dsh-client-ui-primitives",
			"@deepseek-ai/dsh-client-runtime/client"
		];
		/** Chunk script endpoint served by the plugin host half (src/bundle-route.ts). */
		const CHUNK_URL = (name) => `/sidebar/bundle/${name}.js`;
		/** Bound on the revalidation HEAD round-trip. A timeout fails open (drop +
		*  re-fetch on the next open) so a stuck bundle route can never wedge lazy
		*  chunk loads behind the revalidation barrier. */
		const CHUNK_REVALIDATE_TIMEOUT_MS = 5e3;
		/** The module system injected by the client half at activation (rc.8+). */
		let injectedModuleSystem;
		/**
		* Plugin-owned page global carrying the injected module system across
		* bundle copies: the lazy chunk bundles (client-editor.js etc.) inline their
		* own chunk-loader instance, and rc.8 no longer exposes the shell module
		* system as a page global — so the core bundle's injection must be visible
		* to the chunk copies through a namespace of our own.
		*/
		const MODULE_SYSTEM_GLOBAL = "__dshSidebarModuleSystem__";
		/**
		* Inject the client module system the chunk externals resolve through.
		* Called by the client half's apply() with `ctx.modules` (rc.8+); pass
		* undefined to clear (tests). Survives {@link resetChunks} — the module
		* system is shell state, not chunk state, and stays live across HMR.
		*/
		function setChunkModuleSystem(system) {
			injectedModuleSystem = system;
			const g = globalThis;
			if (system === void 0) delete g[MODULE_SYSTEM_GLOBAL];
			else g[MODULE_SYSTEM_GLOBAL] = system;
		}
		/** Resolve the shell-installed module system (injected, then the plugin
		*  global shared with chunk-bundle copies, then the rc.7 page global). */
		function moduleSystem() {
			const g = globalThis;
			return injectedModuleSystem ?? g[MODULE_SYSTEM_GLOBAL] ?? g.__DSH_MODULES__;
		}
		function chunkRegistry() {
			const g = globalThis;
			return g.__dshChunks__ ??= {};
		}
		const defaultScriptLoader = (src) => new Promise((resolve, reject) => {
			const el = document.createElement("script");
			el.async = true;
			el.src = src;
			el.addEventListener("load", () => {
				el.remove();
				resolve();
			}, { once: true });
			el.addEventListener("error", () => {
				el.remove();
				reject(/* @__PURE__ */ new Error(`[dsh-better-sidebar] chunk script ${src} failed to load`));
			}, { once: true });
			document.head.append(el);
		});
		let scriptLoader = defaultScriptLoader;
		/** Test/dev hook: resolve a chunk without fetching a script (e.g. vitest). */
		const testLoaders = /* @__PURE__ */ new Map();
		/** Memoized externals require, resolved once per page from the seed table. */
		let externalsRequire;
		async function buildExternalsRequire(modules) {
			if (externalsRequire !== void 0) return externalsRequire;
			const entries = await Promise.all(CHUNK_EXTERNALS.map(async (spec) => {
				try {
					return [spec, await modules.import(spec)];
				} catch {
					return [spec, void 0];
				}
			}));
			const table = new Map(entries);
			externalsRequire = (spec) => {
				if (!table.has(spec)) throw new Error(`[dsh-better-sidebar] chunk require('${spec}') missed the module table`);
				return table.get(spec);
			};
			return externalsRequire;
		}
		/** In-flight/memoized chunk loads; a failure removes its entry so a retry re-fetches. */
		const cache = /* @__PURE__ */ new Map();
		/** Chunk names whose exports are currently cached (loaded successfully). */
		const loadedChunks = /* @__PURE__ */ new Set();
		/** ETags observed for loaded chunks (HEAD revalidation, see
		*  {@link revalidateChunksOnReactivate}). */
		const chunkEtags = /* @__PURE__ */ new Map();
		/** Pending revalidation barrier: while set, {@link loadChunk} awaits it
		*  before serving cache (see revalidateChunksOnReactivate). */
		let revalidation = null;
		/** Best-effort ETag capture for revalidation. The script tag itself exposes
		*  no response headers, so after a successful load we HEAD the bundle route
		*  once. Failures (including a stuck route — bounded by the timeout) are
		*  ignored — revalidation then fails open (re-fetch). */
		async function recordEtag(name) {
			try {
				const etag = (await fetch(CHUNK_URL(name), {
					method: "HEAD",
					cache: "no-cache",
					signal: AbortSignal.timeout(CHUNK_REVALIDATE_TIMEOUT_MS)
				})).headers.get("etag");
				if (etag !== null && etag !== "") chunkEtags.set(name, etag);
			} catch {
				chunkEtags.delete(name);
			}
		}
		/**
		* Load (once) and materialize a lazy chunk, returning its module exports.
		* Concurrent callers share one in-flight load; a failure clears the cache
		* entry so the next call retries (the script re-executes and overwrites its
		* global registry slot — assignments are idempotent).
		* @param name - the chunk to load.
		*/
		async function loadChunk(name) {
			if (revalidation !== null) await revalidation;
			const cached = cache.get(name);
			if (cached !== void 0) return cached;
			let task;
			task = (async () => {
				const test = testLoaders.get(name);
				if (test !== void 0) return test();
				const modules = moduleSystem();
				if (modules === void 0) throw new Error(moduleSystemUnavailableMessage(name));
				await scriptLoader(CHUNK_URL(name));
				const factory = chunkRegistry()[name];
				if (typeof factory !== "function") throw new Error(`[dsh-better-sidebar] chunk "${name}" script did not register its factory`);
				const exports = factory(await buildExternalsRequire(modules));
				if (cache.get(name) !== void 0) {
					loadedChunks.add(name);
					recordEtag(name);
				}
				return exports;
			})();
			cache.set(name, task);
			task.catch(() => {
				cache.delete(name);
				loadedChunks.delete(name);
				chunkEtags.delete(name);
			});
			return task;
		}
		/**
		* One auto-retry loop per chunk name (module-level singleton: any number of
		* mounted lazy views for the same chunk share one loop, one timer) — the
		* dedup that keeps HMR/re-mounts from stacking retry rounds.
		*/
		const retryLoops = /* @__PURE__ */ new Map();
		/** The single document visibility listener poking all live loops (lazy). */
		let detachVisibilityPoke;
		function ensureVisibilityPoke() {
			if (detachVisibilityPoke !== void 0) return;
			if (typeof document === "undefined" || typeof document.addEventListener !== "function") return;
			const onVisible = () => {
				if (document.visibilityState !== "visible") return;
				for (const loop of retryLoops.values()) loop.poke();
			};
			document.addEventListener("visibilitychange", onVisible);
			detachVisibilityPoke = () => {
				document.removeEventListener("visibilitychange", onVisible);
				detachVisibilityPoke = void 0;
			};
		}
		function dropVisibilityPokeIfIdle() {
			if (retryLoops.size === 0 && detachVisibilityPoke !== void 0) detachVisibilityPoke();
		}
		function retryLoopFor(name) {
			let loop = retryLoops.get(name);
			if (loop === void 0) {
				loop = createChunkRetryLoop(name, { attemptLoad: async () => {
					await loadChunk(name);
				} });
				retryLoops.set(name, loop);
				ensureVisibilityPoke();
			}
			return loop;
		}
		function dropRetryLoopIfIdle(name, loop) {
			if (retryLoops.get(name) === loop && !loop.active) {
				retryLoops.delete(name);
				dropVisibilityPokeIfIdle();
			}
		}
		/**
		* Subscribe to the chunk's auto-retry loop after a failed load. The loop
		* probes the module system (cheap check) and re-attempts the load every
		* round with exponential backoff (2s → 30s cap, unlimited); events update
		* the view's "waiting" copy, `ready: true` tells it to re-load and
		* hot-recover. Returns the unsubscribe — the view's effect cleanup calls
		* it; when the LAST view of a chunk unsubscribes the loop (and its timer)
		* is dropped entirely.
		*/
		function ensureChunkAutoRetry(name, onEvent) {
			const loop = retryLoopFor(name);
			const unsubscribe = loop.subscribe(onEvent);
			let active = true;
			return () => {
				if (!active) return;
				active = false;
				unsubscribe();
				dropRetryLoopIfIdle(name, loop);
			};
		}
		/**
		* HMR-safe re-activation hook (index.tsx calls this instead of a full
		* reset): keep the resolved exports of every loaded chunk and drop only the
		* ones whose script changed on disk — the bundle route revalidates every
		* request (cache-control: no-cache + ETag), so an unchanged chunk keeps its
		* memory cache and the next lazy open skips the re-inject / re-execute.
		* Fail-open: an unreachable, ETag-less, or timed-out chunk is dropped
		* (re-fetch on next open). Test-registry entries are always cleared
		* (per-test fixtures).
		* A page refresh remains the authoritative reset (the HMR poll watches only
		* client.js; chunk-only edits surface here on the next core re-activation).
		*
		* The returned promise is also a BARRIER for {@link loadChunk}: while a
		* revalidation is pending, every chunk load awaits it before serving cache,
		* so a lazy tab opening mid-revalidation can never render stale exports
		* that the sweep is about to invalidate (CR #232 P1).
		*/
		function revalidateChunksOnReactivate() {
			testLoaders.clear();
			for (const loop of retryLoops.values()) loop.dispose();
			retryLoops.clear();
			dropVisibilityPokeIfIdle();
			const task = (async () => {
				for (const name of [...cache.keys()]) if (!loadedChunks.has(name)) cache.delete(name);
				if (loadedChunks.size === 0) return;
				const stale = [];
				await Promise.all([...loadedChunks].map(async (name) => {
					try {
						const etag = (await fetch(CHUNK_URL(name), {
							method: "HEAD",
							cache: "no-cache",
							signal: AbortSignal.timeout(CHUNK_REVALIDATE_TIMEOUT_MS)
						})).headers.get("etag");
						if (etag !== null && etag !== "" && chunkEtags.get(name) === etag) return;
					} catch {}
					stale.push(name);
				}));
				for (const name of stale) {
					cache.delete(name);
					loadedChunks.delete(name);
					chunkEtags.delete(name);
				}
			})();
			revalidation = task;
			task.finally(() => {
				if (revalidation === task) revalidation = null;
			});
			return task;
		}
		//#endregion
		//#region src/client/locales.ts
		/**
		* Minimal zh/en copy for the sidebar. The copy follows the DSH i18n system:
		* the client apply attaches the locale service (`ctx.locale`, provided by
		* `@deepseek-ai/dsh-client-locale`) through {@link attachLocale}, and
		* `t()`/`isZh()` resolve the active locale from it — the Host-backed
		* `locale.preference` wins over the raw browser language and switches live.
		* Without an attached service (standalone/test compositions) the browser
		* language is used, matching the previous behavior. The dictionaries are
		* also registered into the DSH locale registry under {@link LOCALE_NS}.
		*/
		/** The zh dictionary (also registered into the DSH locale registry under {@link LOCALE_NS}). */
		const zh = {
			files: "文件",
			explorer: "资源管理器",
			git: "源代码管理",
			terminal: "终端",
			editor: "编辑器",
			editorExplorer: "文件打开方式",
			editorExplorerDesc: "控制文件打开方式",
			editorExplorerMerged: "合并",
			editorExplorerMergedDesc: "文件在同一窗口内原地切换；新窗口默认展开文件树",
			editorExplorerSplit: "独立",
			editorExplorerSplitDesc: "无路径窗口即资源管理器（仅文件树）；文件各自新开窗口（带文件树，默认收起）",
			editorTreeToggle: "文件树面板",
			explorerCollapse: "收起文件树",
			explorerExpand: "展开文件树",
			editorPathPlaceholder: "输入文件路径（相对会话目录或绝对路径），Enter 打开",
			editorSearchPlaceholder: "按文件名搜索…",
			editorSearchNoResults: "无匹配文件",
			editorSearchTruncated: "结果过多，仅显示部分匹配",
			editorEmptyHint: "从右侧文件树或上方路径输入框选择文件开始预览",
			openFileNewTab: "在新 Tab 中打开",
			openFileSide: "在侧边打开",
			openWithMenu: "在应用中打开",
			openWithSshSuffix: " (SSH)",
			pinOpenWith: "固定到菜单",
			unpinOpenWith: "取消固定",
			openWithExplorer: "资源管理器",
			openWithVscode: "VS Code",
			openWithCursor: "Cursor",
			openWithZed: "Zed",
			openWithSettingsSshTitle: "SSH 远端主机",
			openWithSettingsSshDesc: "留空为本地工作区；填入 user@host 或 SSH 别名后，VSCode 系打开方式将改用 vscode-remote/ssh-remote 协议，资源管理器 / Zed / 非 VSCode 系自定义编辑器将从菜单隐藏",
			openWithSettingsSshPlaceholder: "user@host 或 SSH 别名",
			openWithSettingsCustomTitle: "自定义编辑器",
			openWithSettingsCustomDesc: "名称 + URL 模板（{path} 占位符）+ 是否 VSCode 系；SSH 模式下仅 VSCode 系可打开远端",
			openWithSettingsAdd: "添加",
			openWithSettingsName: "名称",
			openWithSettingsTemplate: "如 cursor://file/{path}",
			openWithSettingsFamily: "VSCode 系",
			openWithSettingsFamilyDesc: "该编辑器使用 VSCode 的 URL 协议（支持 SSH 远端打开）",
			openWithSettingsRemove: "删除",
			openWithSettingsInvalidHint: "名称或模板（需含 {path} 且以 scheme:// 开头）未填写的编辑器不会出现在菜单中",
			newTab: "新建标签页",
			openExplorer: "资源管理器",
			brokenSymlink: "失效的软链接",
			openGit: "Git 面板",
			newTerminal: "新终端",
			terminalLimit: "终端数量已达上限 (3)",
			close: "关闭",
			closeOtherTabs: "关闭其他页签",
			closeLeftTabs: "关闭左侧页签",
			closeRightTabs: "关闭右侧页签",
			collapse: "折叠侧边栏",
			expand: "展开侧边栏",
			collapseBottomPanel: "折叠底部面板",
			expandBottomPanel: "展开底部面板",
			terminalError: "终端连接失败",
			terminalConnectFailed: "终端多次连接失败",
			terminalRetry: "重试",
			chunkAutoRetryWaiting: "正在等待后端就绪，将自动恢复…（第 {n} 次尝试）",
			fsReadRetryWaiting: "后端暂时不可达，正在自动重试读取…（第 {n} 次）",
			chunkFallbackNotice: "编辑器组件暂不可用，已切换为只读预览",
			terminalDepsFailed: "终端依赖 node-pty 加载失败",
			terminalDepsHint: "在 DSH 所在环境的终端或 cmd 中执行以下命令修复，然后点重试（node-pty 与 DSH 核心保持同一版本）：",
			terminalDepsProfile: "（检测到 profile：{profile}）",
			preview: "预览",
			edit: "编辑",
			mermaidError: "Mermaid 渲染失败",
			mermaidZoomIn: "放大",
			mermaidZoomOut: "缩小",
			mermaidZoomReset: "重置",
			mermaidZoomHint: "滚轮缩放 · 拖拽平移 · Esc 关闭",
			refresh: "刷新",
			save: "保存",
			saved: "已保存",
			unsaved: "未保存",
			saveFailed: "保存失败",
			truncation: "文件过大，仅显示前 512KB",
			binary: "二进制文件，无法预览",
			loading: "加载中…",
			error: "加载失败",
			retry: "重试",
			splitLeft: "向左分栏",
			splitRight: "向右分栏",
			splitUp: "向上分栏",
			splitDown: "向下分栏",
			notRepo: "当前目录不是 git 仓库",
			noChanges: "没有变更",
			stage: "暂存",
			unstage: "取消暂存",
			stageAll: "全部暂存",
			unstageAll: "全部取消暂存",
			commitPlaceholder: "提交信息 (Ctrl+Enter)",
			commit: "提交",
			commitError: "提交失败",
			branch: "分支",
			checkoutError: "切换分支失败",
			history: "历史",
			changes: "变更",
			staged: "已暂存",
			unstaged: "未暂存",
			cancel: "取消",
			diffEmpty: "没有文本差异",
			diffLoadError: "加载差异失败",
			diffBinary: "二进制",
			diffAdded: "新增",
			diffDeleted: "删除",
			diffRenamed: "重命名",
			diffExpand: "展开其余 {count} 行",
			diffCollapse: "收起",
			discard: "放弃更改",
			discardTitle: "放弃更改",
			discardDesc: "将丢弃「{path}」的工作区修改（不可恢复）。",
			viewCommitDiff: "查看提交差异",
			copyShortHash: "复制短哈希",
			copyFullHash: "复制完整哈希",
			copySubject: "复制提交信息",
			revertCommit: "还原此提交",
			revertTitle: "还原此提交",
			revertDesc: "将在当前分支创建一个反转「{subject}」的新提交。",
			cherryPickCommit: "捡取此提交",
			cherryPickTitle: "捡取此提交",
			cherryPickDesc: "将「{subject}」的更改应用到当前分支。",
			timeJustNow: "刚刚",
			timeMinutesAgo: "{n} 分钟前",
			timeHoursAgo: "{n} 小时前",
			timeYesterday: "昨天",
			loadMore: "加载更多",
			historyLoadError: "加载更多历史失败",
			produced: "本次产出",
			producedOpen: "在侧边栏中打开",
			disconnected: "终端连接断开，重连中…",
			exited: "终端进程已退出",
			noSession: "选择一个会话以使用侧边栏",
			pluginNotLoaded: "插件未加载，标签页暂不可用：",
			hiddenFiles: "隐藏文件",
			parent: "上级目录",
			editorBack: "返回上级",
			copied: "已复制",
			copy: "复制",
			footnotes: "脚注",
			newFile: "新文件",
			openEditor: "打开编辑器",
			gitDetail: "查看变更详情",
			referenceFile: "@文件",
			addToConversation: "添加到对话",
			copyRelative: "复制相对地址",
			copyAbsolute: "复制绝对地址",
			download: "下载",
			uploadFiles: "上传文件",
			uploadFolder: "上传文件夹",
			uploadHere: "上传到此处",
			uploadDropHint: "拖拽文件/文件夹到此处上传",
			uploadDropChat: "拖放到聊天区：添加图片到对话",
			uploadTo: "上传到 {dir}",
			uploadingTo: "正在上传到 {dir}…",
			uploadProgress: "正在上传 {done}/{total}: {name}",
			uploadDone: "已上传 {count} 个文件",
			uploadFailed: "上传失败：{error}",
			uploadFailedUnknown: "未知错误",
			uploadTooLarge: "文件过大，超出上传上限",
			uploadCancelled: "上传已取消",
			settingsNav: "侧边卡片",
			settingsIntro: "管理侧边卡片的显示内容与默认行为",
			settingsPopupDesc: "为「{feature}」配置相关选项",
			settingsDone: "完成",
			settingsOpenTitle: "新会话默认打开",
			settingsOpenDesc: "新建会话时自动展开侧边卡片；已存在的会话保持各自布局",
			settingsWidthTitle: "默认宽度占比",
			settingsWidthDesc: "新建会话时侧边卡片占窗口宽度的百分比 (20–60)",
			settingsWidthSuffix: "%",
			settingsOpenPathTitle: "聊天区文件在侧边栏打开",
			settingsOpenPathDesc: "在聊天里点击文件链接（工具行、产物列表、文件提及）时，在侧边栏编辑器中打开，不再调用系统默认应用",
			settingsTitleBarTitle: "位置兼容模式",
			settingsTitleBarDesc: "选择顶栏兼容方案：自动检测（默认，保守）/ DSH官方Web / 已知桌面壳 / 自定义方案（下移距离 + 自定义 CSS）",
			settingsTitleBarStripTitle: "下移距离",
			settingsTitleBarStripDesc: "标题栏条带高度：侧边栏按钮与内容下移的像素数（0–120，默认 40；自定义方案下生效）",
			settingsSchemeAutoTitle: "自动检测",
			settingsSchemeAutoDesc: "保守方案：仅在 Window Controls Overlay 标准 API 可用时按真实标题栏高度让位；网页环境下不做任何修改",
			settingsSchemeWebTitle: "DSH官方Web",
			settingsSchemeWebDesc: "显式声明运行在官方网页版：不做任何适配（连标准 WCO 几何也不适用）",
			settingsSchemeCustomTitle: "自定义方案",
			settingsSchemeCustomDesc: "完全由你控制：注入自定义 CSS（可覆盖内置样式），并指定标题栏下移距离",
			settingsSchemeDetectedSuffix: "已检测",
			settingsCustomCssTitle: "自定义 CSS",
			settingsCustomCssDesc: "追加到页面末尾的样式（同优先级下后写胜出；覆盖 JS 内联变量需用 !important）",
			settingsCustomCssPlaceholder: "/* 例：为自绘标题栏的壳预留 36px */\nhtml[data-dsh-title-bar-height=\"36\"] {\n  --dsh-title-bar-strip: 36px !important;\n}",
			settingsSaveFailed: "保存失败",
			settingsConflict: "设置已被其他窗口修改，请重试",
			binaryNoPreview: "此文件类型不支持预览",
			downloadToView: "下载查看",
			settingsSubagentTitle: "检测到子代理时自动展开任务管理页",
			settingsSubagentDesc: "当前会话产生新的子代理时，自动展开侧边栏并打开任务管理页；关闭后需手动打开",
			settingsJobsTitle: "有新后台任务时自动展开后台任务页",
			settingsJobsDesc: "当前会话出现新的后台任务时，自动展开侧边栏并打开后台任务页（每个新任务都会触发）；关闭后需手动打开",
			settingsToolsTitle: "为模型注入终端工具",
			settingsToolsDesc: "开启后，模型可通过 terminal_create 等 8 个工具创建并操作侧边栏终端（默认关闭）",
			settingsBottomTerminalTitle: "底部面板首次展开自动开终端",
			settingsBottomTerminalDesc: "每次会话中第一次展开底部面板时，尝试在底部面板自动打开一个新终端标签（终端数量上限仍会限制；默认开启）",
			settingsFontFamilyTitle: "终端字体",
			settingsFontFamilyDesc: "自定义终端字体族（CSS font-family，如 \"JetBrains Mono\", monospace；留空跟随主题等宽字体）",
			settingsFontFamilyPlaceholder: "\"JetBrains Mono\", monospace",
			settingsFontSizeTitle: "终端字号",
			settingsFontSizeDesc: "终端字号（9–32，默认 13）",
			settingsFontSizeSuffix: "px",
			settingsShellTitle: "Shell 路径",
			settingsShellDesc: "UI 与模型终端启动的 shell（绝对路径或可执行名）。留空按既有顺序解析：yaml 的 config.shell → $SHELL / 登录 shell / Windows 的 powershell.exe。对之后打开的终端生效",
			settingsShellPlaceholder: "如 /bin/zsh（留空自动解析）",
			settingsShellArgsTitle: "Shell 参数",
			settingsShellArgsDesc: "显式 shell 启动参数，空格分隔；非空时完全替换默认参数（与 yaml 的 shellArgs 契约一致）",
			settingsShellArgsPlaceholder: "如 -l（留空用默认参数）",
			settingsTabsTitle: "侧边栏内容",
			settingsViewersTitle: "文件预览",
			settingsGeneralTitle: "常规",
			settingsPopup: "功能设置",
			settingsViewerCatchAll: "兜底：任意文件",
			viewerImage: "图片",
			viewerPdf: "PDF",
			viewerMarkdown: "Markdown",
			viewerCode: "代码",
			viewerBinary: "二进制下载",
			viewerHtml: "HTML",
			browser: "浏览器",
			browserPlaceholder: "输入网址，例如 example.com",
			browserGo: "前往",
			browserBack: "后退",
			browserForward: "前进",
			browserStart: "输入网址开始浏览（沙箱模式）",
			browserBlockedScheme: "已阻止：仅支持 http/https 链接",
			browserBlockedLoopback: "已阻止：不允许在浏览器中访问本机或内部地址",
			browserInvalid: "无效的网址",
			browserNoSandboxWarning: "沙箱已关闭：当前页面与界面同源，拥有完整会话权限（可在设置中恢复）",
			htmlNoSandboxWarning: "沙箱已关闭：此 HTML 与界面同源，可读取会话文件与内部接口（可在设置中恢复）",
			sandboxStatusOn: "沙箱模式：已启用 · 页面无法访问界面数据与本地文件，登录态与第三方 Cookie 可能不可用",
			sandboxUnlock: "临时解锁（不安全）",
			sandboxRestore: "恢复沙箱",
			settingsHtmlDefaultUnsafeTitle: "HTML 预览默认以非沙箱模式打开（不安全）",
			settingsHtmlDefaultUnsafeDesc: "开启后，每次打开 HTML 文件时预览默认处于非沙箱状态（与界面同源，可读取会话文件与内部接口）；可在状态行临时恢复沙箱",
			settingsHtmlSandboxTitle: "关闭 HTML 预览沙箱（不安全）",
			settingsHtmlSandboxDesc: "关闭后，预览的 HTML 将与界面同源运行，可读取会话文件、本地存储并调用内部接口。仅对完全可信的文件开启",
			settingsBrowserSandboxTitle: "关闭浏览器沙箱（不安全）",
			settingsBrowserSandboxDesc: "关闭后，访问的任何网站都将与界面同源运行，可读取会话数据并冒充你的登录状态。仅对完全可信的站点开启",
			settingsBrowserLinksTitle: "聊天区外链在侧边栏打开",
			settingsBrowserLinksDesc: "开启后，点击聊天或界面中的外链时在侧边栏打开，不再弹出新窗口；HTTP 与 HTTPS 可分别通过下方开关控制；Ctrl/Cmd 点击可临时放行",
			settingsBrowserHttpTitle: "侧边打开HTTP网页",
			settingsBrowserHttpDesc: "开启后，点击聊天或界面中的 HTTP 外链时在侧边栏打开（声明了 urlTarget 的插件页面优先）；Ctrl/Cmd 点击可临时放行",
			settingsBrowserHttpsTitle: "侧边打开HTTPS网页",
			settingsBrowserHttpsDesc: "开启后，点击聊天或界面中的 HTTPS 外链时在侧边栏打开。默认关闭：多数 HTTPS 站点拒绝被嵌入，走系统浏览器更顺畅",
			browserOpenExternal: "在浏览器中打开",
			browserEmbedBlocked: "{host} 拒绝了嵌入请求",
			browserEmbedBlockedDesc: "该站点通过 X-Frame-Options / frame-ancestors 禁止在其它页面中显示，无法在侧边栏内加载。可在浏览器中直接打开",
			browserEmbedAnyway: "仍然加载",
			subagent: "任务管理",
			openSubagent: "任务管理",
			subagentMainAgent: "主代理",
			subagentEmpty: "暂无子代理",
			subagentEmptyDesc: "当前主代理派生的子代理将显示在这里",
			subagentRunning: "运行中",
			subagentInactive: "空闲",
			subagentModeOneShot: "一次性",
			subagentModeContinuable: "可续接",
			subagentCount: "{count} 个子代理",
			subagentCountRunning: "{count} 个子代理 · {running} 运行中",
			subagentDiagCorrupt: "目录损坏",
			subagentDiagUnsupported: "不支持的条目",
			subagentDiagUnavailable: "不可用",
			subagentThinking: "思考中…",
			sideChat: "侧边对话(beta)",
			sideChatNew: "新建对话",
			sideChatUntitled: "新对话",
			sideChatEmpty: "暂无侧边对话",
			sideChatEmptyDesc: "每个侧边对话是标签栏里的独立 Tab，继承当前会话的上下文运行，不会进入主会话",
			sideChatCreating: "正在创建侧边对话…",
			sideChatRetry: "重试",
			sideChatThreads: "切换线程 / 新建",
			sideChatSave: "保存为新会话",
			sideChatSaveTitle: "把该线程提升为顶层会话，出现在主会话列表中",
			sideChatSaved: "已保存为新会话",
			sideChatNoTurn: "至少完成一轮对话后才能保存",
			sideChatPendingDrop: "最后一条未完成的追问不会包含在新会话中",
			sideChatFirstPlaceholder: "输入第一个问题，已继承当前会话上下文…",
			sideChatComposerPlaceholder: "追问…",
			sideChatThinking: "正在深入…",
			sideChatThink: "思考过程",
			sideChatInjection: "已注入上下文",
			sideChatSend: "发送",
			sideChatCancel: "停止",
			sideChatCancelTitle: "中止当前回合（保留队列）",
			sideChatClose: "关闭线程",
			sideChatCloseTitle: "释放线程的 agent（历史保留）",
			sideChatError: "侧边对话出错：{message}",
			jobs: "后台任务",
			jobsCount: "{count} 个后台任务",
			jobsCountRunning: "{count} 个后台任务 · {running} 运行中",
			jobStatusRunning: "运行中",
			jobStatusStopping: "终止中",
			jobStatusCompleted: "已完成",
			jobStatusKilled: "已终止",
			jobStatusFailed: "失败",
			jobDurationSeconds: "{seconds} 秒",
			jobDurationMinutes: "{minutes} 分 {seconds} 秒",
			jobDurationHours: "{hours} 小时 {minutes} 分",
			jobViewOutput: "查看输出",
			jobHideOutput: "收起输出",
			jobNoOutput: "暂无输出",
			jobNotReadYet: "等待模型读取该任务的输出（模型执行 job_output 后，输出会显示在这里）",
			jobOutputTruncated: "输出过长，已截断显示",
			jobOutputError: "输出读取失败",
			jobKill: "终止",
			jobKillConfirm: "再次点击确认终止",
			jobKillError: "终止失败",
			addPluginsTabCard: "添加 Tab 插件",
			addPluginsTabCardDesc: "注册新的侧边栏页面",
			addPluginsViewerCard: "添加预览插件",
			addPluginsViewerCardDesc: "注册新的文件类型预览",
			addPluginsTabDesc: "侧边栏页面（Tab）可以由插件扩展。插件通过 ctx.betterSidebar 服务注册；点击「安装」复制安装命令，粘贴到 DSH 所在环境的终端执行。",
			addPluginsViewerDesc: "文件预览器可以由插件扩展。插件通过 ctx.betterSidebar 服务注册；点击「安装」复制安装命令，粘贴到 DSH 所在环境的终端执行。",
			addPluginsBrowseMore: "在 GitHub 上浏览更多插件（topic: dsh-better-sidebar）",
			addPluginsSearch: "搜索插件名称 / 描述…",
			addPluginsNoMatch: "没有匹配的插件",
			addPluginsRecommended: "推荐插件",
			addPluginsEmpty: "暂未收录插件，欢迎在 GitHub topic 下发布你的插件",
			openPlugin: "跳转",
			copyInstall: "复制安装命令",
			pluginOfficeDesc: "为 better-sidebar 编辑器提供 Office 三件套预览（.docx / .xlsx / .pptx），把重型 Office 渲染库拆出主包、按需安装",
			pluginFlowglassDesc: "实时会话流程图：三列泳道展示用户、助手与工具调用，支持并行分组、子代理支线、逐层钻取和实时状态；安装 better-sidebar 后注册原生「流镜」Tab，未安装时保留独立抽屉",
			pluginGitForgeDesc: "better-sidebar「Git 凭据」Tab：GitHub/Gitea 等 Forge 账号库 + 按项目授权 + push 策略硬拦；token 仅存本地 secrets，不进模型上下文；提供只读 GitForge 工具与 agent HTTPS credential helper",
			pluginGitRemotesDesc: "better-sidebar Git 远程 Tab：看分支/上游/ahead-behind，fetch（可 prune）、ff-only pull、确认后才 push。不替换内置 Git 的暂存/提交，也不提供 force-push 或模型自动推送",
			pluginSentinelDesc: "条件驱动的 agent 唤醒系统：文件/进程/端口/HTTP/命令/webhook 传感器，条件达成自动唤醒休眠会话；注册「哨兵」Tab 展示服务器全局监控表",
			pluginSidebarQaDesc: "基于 better-sidebar 的划选提问tab分页: 对话划选 → 右侧面板提问 → 同工作区独立追问会话（❓追问·主题）：快速无思考模型压缩主对话上下文后与引文一起注入，不打断主对话；追问可嵌套、可继续、可归档",
			pluginSshTunnelDesc: "better-sidebar「SSH 隧道」Tab：多机主机清单 + 按项目授权 + 密钥本地保管；模型工具 SSHManager（exec/SFTP/会话策略）；中央交互终端与双栏 SFTP",
			pluginTurnReviewDesc: "对「刚刚这一回合」的 diff 做 Approve / Request changes 的人闸门：只审上一回合，不 fork 会话；文件按主会话/子代理/未归因分组，按文件勾选打回 + 可选评语，点文件先看回合开始快照 vs 现在的 diff。不是 /rewind",
			pluginVideoPreviewDesc: "在 better-sidebar 编辑器内联预览视频文件（.mp4/.webm/.mov/.mkv/.avi 等），自带支持 HTTP Range（206）的 /video 宿主路由，可拖动进度条、不受 20MB mediaLimit 限制",
			pluginDocsPanelDesc: "DSH 侧边栏里的「全局文档」：全局 Markdown 笔记，任何工作区随时可读——列表点选阅读、悬浮大纲跳转、Chrome / VS Code 外部打开、代码复制，目录可配置（默认 ~/.dsh/docs）"
		};
		/** The en dictionary (key-set-equal to zh, enforced by the type annotation). */
		const en = {
			files: "Files",
			explorer: "Explorer",
			git: "Source Control",
			terminal: "Terminal",
			editor: "Editor",
			editorExplorer: "File open behavior",
			editorExplorerDesc: "Controls how files open",
			editorExplorerMerged: "Merged",
			editorExplorerMergedDesc: "Files switch in place in the same window; new windows start with the tree open",
			editorExplorerSplit: "Separate",
			editorExplorerSplitDesc: "Path-less windows are the standalone explorer (tree only); each file opens its own window (tree docked, closed by default)",
			editorTreeToggle: "File tree panel",
			explorerCollapse: "Collapse explorer",
			explorerExpand: "Expand explorer",
			editorPathPlaceholder: "File path (relative to the session directory or absolute), Enter to open",
			editorSearchPlaceholder: "Search files by name…",
			editorSearchNoResults: "No matching files",
			editorSearchTruncated: "Too many results — showing a partial list",
			editorEmptyHint: "Pick a file from the tree panel or the path input above to start previewing",
			openFileNewTab: "Open in New Tab",
			openFileSide: "Open to the Side",
			openWithMenu: "Open with",
			openWithSshSuffix: " (SSH)",
			pinOpenWith: "Pin to menu",
			unpinOpenWith: "Unpin",
			openWithExplorer: "File Manager",
			openWithVscode: "VS Code",
			openWithCursor: "Cursor",
			openWithZed: "Zed",
			openWithSettingsSshTitle: "SSH remote host",
			openWithSettingsSshDesc: "Empty = local workspace; with a user@host or SSH alias, VSCode-family openers switch to the vscode-remote/ssh-remote protocol and the File Manager / Zed / non-VSCode-family custom editors are hidden from the menu",
			openWithSettingsSshPlaceholder: "user@host or SSH alias",
			openWithSettingsCustomTitle: "Custom editors",
			openWithSettingsCustomDesc: "Name + URL template ({path} placeholder) + VSCode-family flag; in remote mode only VSCode-family editors can open a remote path",
			openWithSettingsAdd: "Add",
			openWithSettingsName: "Name",
			openWithSettingsTemplate: "e.g. cursor://file/{path}",
			openWithSettingsFamily: "VSCode-family",
			openWithSettingsFamilyDesc: "This editor speaks the VSCode URL dialect (supports SSH-remote opens)",
			openWithSettingsRemove: "Remove",
			openWithSettingsInvalidHint: "Editors with a missing name or a template without {path} / scheme:// are not shown in the menu",
			newTab: "New tab",
			openExplorer: "Explorer",
			brokenSymlink: "Broken symlink",
			openGit: "Git panel",
			newTerminal: "New terminal",
			terminalLimit: "Terminal limit reached (3)",
			close: "Close",
			closeOtherTabs: "Close Other Tabs",
			closeLeftTabs: "Close Tabs to the Left",
			closeRightTabs: "Close Tabs to the Right",
			collapse: "Collapse sidebar",
			expand: "Expand sidebar",
			collapseBottomPanel: "Collapse bottom panel",
			expandBottomPanel: "Expand bottom panel",
			terminalError: "Terminal connection failed",
			terminalConnectFailed: "Terminal failed to connect repeatedly",
			terminalRetry: "Retry",
			chunkAutoRetryWaiting: "Waiting for the backend to come back — recovering automatically… (attempt {n})",
			fsReadRetryWaiting: "Backend temporarily unreachable — re-reading automatically… (attempt {n})",
			chunkFallbackNotice: "Editor component unavailable — showing read-only preview",
			terminalDepsFailed: "Terminal dependency node-pty failed to load",
			terminalDepsHint: "Run the command below in a terminal or cmd on the DSH machine to repair it, then retry (node-pty stays in sync with the DSH core version):",
			terminalDepsProfile: " (detected profile: {profile})",
			preview: "Preview",
			edit: "Edit",
			mermaidError: "Mermaid render failed",
			mermaidZoomIn: "Zoom in",
			mermaidZoomOut: "Zoom out",
			mermaidZoomReset: "Reset",
			mermaidZoomHint: "Scroll to zoom · drag to pan · Esc to close",
			refresh: "Refresh",
			save: "Save",
			saved: "Saved",
			unsaved: "Unsaved",
			saveFailed: "Save failed",
			truncation: "File too large — showing the first 512KB",
			binary: "Binary file, preview unavailable",
			loading: "Loading…",
			error: "Failed to load",
			retry: "Retry",
			splitLeft: "Split left",
			splitRight: "Split right",
			splitUp: "Split up",
			splitDown: "Split down",
			notRepo: "This directory is not a git repository",
			noChanges: "No changes",
			stage: "Stage",
			unstage: "Unstage",
			stageAll: "Stage all",
			unstageAll: "Unstage all",
			commitPlaceholder: "Commit message (Ctrl+Enter)",
			commit: "Commit",
			commitError: "Commit failed",
			branch: "Branch",
			checkoutError: "Branch switch failed",
			history: "History",
			changes: "Changes",
			staged: "Staged",
			unstaged: "Unstaged",
			cancel: "Cancel",
			diffEmpty: "No text changes",
			diffLoadError: "Failed to load diff",
			diffBinary: "Binary",
			diffAdded: "Added",
			diffDeleted: "Deleted",
			diffRenamed: "Renamed",
			diffExpand: "Expand {count} more rows",
			diffCollapse: "Collapse",
			discard: "Discard changes",
			discardTitle: "Discard changes",
			discardDesc: "This discards the worktree changes of \"{path}\" (not recoverable).",
			viewCommitDiff: "View commit diff",
			copyShortHash: "Copy short hash",
			copyFullHash: "Copy full hash",
			copySubject: "Copy subject",
			revertCommit: "Revert commit",
			revertTitle: "Revert commit",
			revertDesc: "Create a new commit on the current branch that reverts \"{subject}\".",
			cherryPickCommit: "Cherry-pick commit",
			cherryPickTitle: "Cherry-pick commit",
			cherryPickDesc: "Apply the changes of \"{subject}\" to the current branch.",
			timeJustNow: "just now",
			timeMinutesAgo: "{n} min ago",
			timeHoursAgo: "{n} h ago",
			timeYesterday: "yesterday",
			loadMore: "Load more",
			historyLoadError: "Failed to load more history",
			produced: "Produced",
			producedOpen: "Open in sidebar",
			disconnected: "Terminal disconnected, reconnecting…",
			exited: "Terminal process exited",
			noSession: "Select a conversation to use the sidebar",
			pluginNotLoaded: "Plugin not loaded; tab unavailable:",
			hiddenFiles: "Hidden files",
			parent: "Parent directory",
			editorBack: "Back",
			copied: "Copied",
			copy: "Copy",
			footnotes: "Footnotes",
			newFile: "New file",
			openEditor: "Open editor",
			gitDetail: "View change details",
			referenceFile: "@file",
			addToConversation: "Add to conversation",
			copyRelative: "Copy relative path",
			copyAbsolute: "Copy absolute path",
			download: "Download",
			uploadFiles: "Upload files",
			uploadFolder: "Upload folder",
			uploadHere: "Upload here",
			uploadDropHint: "Drop files/folders here to upload",
			uploadDropChat: "Drop onto the chat to add images",
			uploadTo: "Upload into {dir}",
			uploadingTo: "Uploading into {dir}…",
			uploadProgress: "Uploading {done}/{total}: {name}",
			uploadDone: "Uploaded {count} file(s)",
			uploadFailed: "Upload failed: {error}",
			uploadFailedUnknown: "Unknown error",
			uploadTooLarge: "File too large (over the upload limit)",
			uploadCancelled: "Upload cancelled",
			settingsNav: "Side card",
			settingsIntro: "Manage what the side card shows and how it behaves",
			settingsPopupDesc: "Configure related options for {feature}",
			settingsDone: "Done",
			settingsOpenTitle: "Open by default for new conversations",
			settingsOpenDesc: "Expand the side card automatically for brand-new conversations; existing conversations keep their own layouts",
			settingsWidthTitle: "Default width share",
			settingsWidthDesc: "The side card's default share of the window width for new conversations (20–60)",
			settingsWidthSuffix: "%",
			settingsOpenPathTitle: "Open chat files in the sidebar",
			settingsOpenPathDesc: "Open file links in the chat (tool rows, produced files, mentions) in the sidebar editor instead of the system default app",
			settingsTitleBarTitle: "Position compatibility mode",
			settingsTitleBarDesc: "Pick the title-bar compatibility scheme: auto-detect (default, conservative) / DSH official web / known desktop shells / custom (shift distance + custom CSS)",
			settingsTitleBarStripTitle: "Shift distance",
			settingsTitleBarStripDesc: "Title-bar strip height: how far the sidebar buttons and content move down in px (0–120, default 40; applies under the custom scheme)",
			settingsSchemeAutoTitle: "Auto-detect",
			settingsSchemeAutoDesc: "Conservative: only the standard Window Controls Overlay API contributes (real caption-overlay height); plain web environments get no modification",
			settingsSchemeWebTitle: "DSH official web",
			settingsSchemeWebDesc: "Explicitly declare the official web UI: no adaptation at all (not even standard WCO geometry)",
			settingsSchemeCustomTitle: "Custom",
			settingsSchemeCustomDesc: "Full control: inject custom CSS (can override built-in styles) and set the title-bar shift distance",
			settingsSchemeDetectedSuffix: "detected",
			settingsCustomCssTitle: "Custom CSS",
			settingsCustomCssDesc: "Styles appended at the end of the page (later in the cascade wins ties; use !important to override JS-written inline variables)",
			settingsCustomCssPlaceholder: "/* e.g. reserve 36px for a shell with a custom-drawn title bar */\nhtml[data-dsh-title-bar-height=\"36\"] {\n  --dsh-title-bar-strip: 36px !important;\n}",
			settingsSaveFailed: "Failed to save",
			settingsConflict: "The setting changed in another window — please retry",
			binaryNoPreview: "This file type cannot be previewed",
			downloadToView: "Download to view",
			settingsSubagentTitle: "Auto-open the Tasks page when a subagent appears",
			settingsSubagentDesc: "Expand the side card and open the Tasks page when the current conversation spawns a new subagent; turn off to open it manually",
			settingsJobsTitle: "Auto-open the Jobs page on a new background job",
			settingsJobsDesc: "Expand the side card and open the Jobs page whenever a new background job appears for the current conversation (every new job triggers); turn off to open it manually",
			settingsToolsTitle: "Inject terminal tools for the model",
			settingsToolsDesc: "When enabled, the model can create and drive sidebar terminals through the 8 terminal_* tools (off by default)",
			settingsBottomTerminalTitle: "Auto-open a terminal on the bottom panel's first expansion",
			settingsBottomTerminalDesc: "When the bottom panel is expanded for the first time in a session, try to open a fresh terminal tab there (the terminal quota still applies; on by default)",
			settingsFontFamilyTitle: "Terminal font family",
			settingsFontFamilyDesc: "Custom terminal font family (a CSS font-family stack like \"JetBrains Mono\", monospace; leave empty to follow the theme's monospace font)",
			settingsFontFamilyPlaceholder: "\"JetBrains Mono\", monospace",
			settingsFontSizeTitle: "Terminal font size",
			settingsShellTitle: "Shell path",
			settingsShellDesc: "Shell spawned for UI and model terminals (absolute path or bare executable). Empty keeps the legacy order: yaml config.shell → $SHELL / login shell / Windows powershell.exe. Applies to terminals opened afterwards",
			settingsShellPlaceholder: "e.g. /bin/zsh (empty = auto)",
			settingsShellArgsTitle: "Shell arguments",
			settingsShellArgsDesc: "Explicit shell arguments, space-separated; when non-empty they fully replace the defaults (same contract as the yaml shellArgs)",
			settingsShellArgsPlaceholder: "e.g. -l (empty = defaults)",
			settingsFontSizeDesc: "Terminal font size in px (9–32, default 13)",
			settingsFontSizeSuffix: "px",
			settingsTabsTitle: "Sidebar content",
			settingsViewersTitle: "File viewers",
			settingsGeneralTitle: "General",
			settingsPopup: "Feature settings",
			settingsViewerCatchAll: "Catch-all: any file",
			viewerImage: "Image",
			viewerPdf: "PDF",
			viewerMarkdown: "Markdown",
			viewerCode: "Code",
			viewerBinary: "Binary download",
			viewerHtml: "HTML",
			browser: "Browser",
			browserPlaceholder: "Enter a URL, e.g. example.com",
			browserGo: "Go",
			browserBack: "Back",
			browserForward: "Forward",
			browserStart: "Enter a URL to start browsing (sandbox mode)",
			browserBlockedScheme: "Blocked: only http/https URLs are allowed",
			browserBlockedLoopback: "Blocked: local and internal addresses cannot be browsed here",
			browserInvalid: "Invalid URL",
			browserNoSandboxWarning: "Sandbox off: the current page runs with full GUI privileges (re-enable in settings)",
			htmlNoSandboxWarning: "Sandbox off: this HTML runs with full GUI privileges (re-enable in settings)",
			sandboxStatusOn: "Sandbox mode: on · pages cannot access the GUI's data or local files; logins and third-party cookies may not work",
			sandboxUnlock: "Temporarily disable (unsafe)",
			sandboxRestore: "Restore sandbox",
			settingsHtmlDefaultUnsafeTitle: "Open HTML previews unsandboxed by default (unsafe)",
			settingsHtmlDefaultUnsafeDesc: "When on, every newly opened HTML preview starts in the unsandboxed state (same origin as the GUI — it can read session files and internal APIs); the status row still offers a one-tap restore",
			settingsHtmlSandboxTitle: "Disable HTML preview sandbox (unsafe)",
			settingsHtmlSandboxDesc: "With the sandbox off, previewed HTML runs with the same origin as the GUI: it can read session files, local storage and call internal APIs. Only enable for fully trusted files",
			settingsBrowserSandboxTitle: "Disable browser sandbox (unsafe)",
			settingsBrowserSandboxDesc: "With the sandbox off, any visited site runs with the same origin as the GUI: it can read session data and act as your logged-in session. Only enable for fully trusted sites",
			settingsBrowserLinksTitle: "Open chat external links in the sidebar",
			settingsBrowserLinksDesc: "When on, clicking an external link in the chat or GUI opens the sidebar instead of a new window; HTTP and HTTPS are controlled separately by the switches below; Ctrl/Cmd+click always bypasses",
			settingsBrowserHttpTitle: "Open HTTP pages in the sidebar",
			settingsBrowserHttpDesc: "When on, clicking an HTTP external link in the chat or GUI opens the sidebar (plugin pages declaring urlTarget win); Ctrl/Cmd+click always bypasses",
			settingsBrowserHttpsTitle: "Open HTTPS pages in the sidebar",
			settingsBrowserHttpsDesc: "When on, clicking an HTTPS external link in the chat or GUI opens the sidebar. Off by default: most HTTPS sites refuse to be embedded, so the system browser is the smoother default",
			browserOpenExternal: "Open in browser",
			browserEmbedBlocked: "{host} refused to be embedded",
			browserEmbedBlockedDesc: "The site forbids being displayed inside other pages (X-Frame-Options / frame-ancestors), so it cannot load in the sidebar. Open it directly in your browser instead.",
			browserEmbedAnyway: "Load anyway",
			subagent: "Tasks",
			openSubagent: "Tasks",
			subagentMainAgent: "Main agent",
			subagentEmpty: "No subagents",
			subagentEmptyDesc: "Subagents spawned under the main agent will appear here",
			subagentRunning: "Running",
			subagentInactive: "Inactive",
			subagentModeOneShot: "One-shot",
			subagentModeContinuable: "Continuable",
			subagentCount: "{count} subagents",
			subagentCountRunning: "{count} subagents · {running} running",
			subagentDiagCorrupt: "Corrupt",
			subagentDiagUnsupported: "Unsupported",
			subagentDiagUnavailable: "Unavailable",
			subagentThinking: "Thinking…",
			sideChat: "Side Chat (beta)",
			sideChatNew: "New thread",
			sideChatUntitled: "New thread",
			sideChatEmpty: "No side conversations",
			sideChatEmptyDesc: "Every side conversation is its own tab in the tab strip — it inherits the current session's context and never enters the main conversation",
			sideChatCreating: "Creating side conversation…",
			sideChatRetry: "Retry",
			sideChatThreads: "Switch thread / new",
			sideChatSave: "Save as new session",
			sideChatSaveTitle: "Promote this thread to a top-level session in the main session list",
			sideChatSaved: "Saved as a new session",
			sideChatNoTurn: "Save is available after the first completed turn",
			sideChatPendingDrop: "The last unanswered follow-up will not be included in the saved session",
			sideChatFirstPlaceholder: "Ask the first question — context inherited…",
			sideChatComposerPlaceholder: "Ask a follow-up…",
			sideChatThinking: "Deep diving…",
			sideChatThink: "Thinking",
			sideChatInjection: "Context injected",
			sideChatSend: "Send",
			sideChatCancel: "Stop",
			sideChatCancelTitle: "Abort the running turn (queued work is kept)",
			sideChatClose: "Close thread",
			sideChatCloseTitle: "Release the thread's agent (history is kept)",
			sideChatError: "Side Chat error: {message}",
			jobs: "Background jobs",
			jobsCount: "{count} background jobs",
			jobsCountRunning: "{count} background jobs · {running} running",
			jobStatusRunning: "Running",
			jobStatusStopping: "Stopping",
			jobStatusCompleted: "Completed",
			jobStatusKilled: "Killed",
			jobStatusFailed: "Failed",
			jobDurationSeconds: "{seconds}s",
			jobDurationMinutes: "{minutes}m {seconds}s",
			jobDurationHours: "{hours}h {minutes}m",
			jobViewOutput: "View output",
			jobHideOutput: "Hide output",
			jobNoOutput: "No output yet",
			jobNotReadYet: "Waiting for the model to read this job; its output appears here once the model runs job_output",
			jobOutputTruncated: "Output truncated",
			jobOutputError: "Failed to read output",
			jobKill: "Kill",
			jobKillConfirm: "Click again to confirm kill",
			jobKillError: "Kill failed",
			addPluginsTabCard: "Add tab plugins",
			addPluginsTabCardDesc: "Register a new sidebar page",
			addPluginsViewerCard: "Add preview plugins",
			addPluginsViewerCardDesc: "Register a file-type preview",
			addPluginsTabDesc: "Sidebar pages (tabs) can be extended by plugins. Plugins register through the ctx.betterSidebar service; clicking Install copies the install command — paste it into a terminal where your DSH profile lives and run it.",
			addPluginsViewerDesc: "File previewers can be extended by plugins. Plugins register through the ctx.betterSidebar service; clicking Install copies the install command — paste it into a terminal where your DSH profile lives and run it.",
			addPluginsBrowseMore: "Browse more plugins on GitHub (topic: dsh-better-sidebar)",
			addPluginsSearch: "Search by plugin name or description…",
			addPluginsNoMatch: "No plugins match",
			addPluginsRecommended: "Recommended plugins",
			addPluginsEmpty: "No plugins curated yet — publish yours under the GitHub topic",
			openPlugin: "Open",
			copyInstall: "Copy install command",
			pluginOfficeDesc: "Office-suite preview (.docx / .xlsx / .pptx) for the better-sidebar editor, keeping the heavy Office render libraries out of the core bundle",
			pluginFlowglassDesc: "Live session flowgraph with three lanes for user, assistant, and tool calls, plus parallel groups, sub-agent branches, drill-down, and live status; registers a native Flowglass tab when better-sidebar is installed and keeps its standalone drawer as a fallback",
			pluginGitForgeDesc: "Git Forge tab: GitHub/Gitea (and other forge) account library + per-project grants + hard push policy; tokens stay in local secrets (never in model context); read-only GitForge tool and agent HTTPS credential helper",
			pluginGitRemotesDesc: "Git Remotes tab: branch/upstream/ahead-behind, fetch (optional prune), ff-only pull, and push only after an in-tab confirm. Does not replace the built-in Git stage/commit tab, and does not offer force-push or a model auto-push tool",
			pluginSentinelDesc: "Condition-driven agent wakeup: file/process/port/http/command/webhook sensors wake dormant sessions when conditions fire; registers a \"Sentinel\" tab with the server-wide watch table",
			pluginSidebarQaDesc: "Select-and-ask: Select conversation text → ask in the right-side panel → a dedicated follow-up session (❓追问) in the same workspace; a fast no-thinking model compresses the main context and injects it with the quote, without interrupting the main conversation. Follow-ups nest, continue, and archive",
			pluginSshTunnelDesc: "SSH Tunnel tab: multi-host inventory + per-project grants + local secrets; SSHManager tool (exec/SFTP/session strategies); center interactive terminal and dual-pane SFTP",
			pluginTurnReviewDesc: "A human gate on the just-finished turn: Approve / Request changes per path with an optional comment; paths grouped by main session / subagent / unattributed; inline snapshot-vs-now diff before you decide. No fork, no /rewind",
			pluginVideoPreviewDesc: "Inline video preview (.mp4/.webm/.mov/.mkv/.avi etc.) for the better-sidebar editor, backed by a dedicated /video host route with HTTP Range (206) support — scrubbing works and files are not capped by the 20MB mediaLimit",
			pluginDocsPanelDesc: "Global docs in the DSH sidebar: read your own Markdown notes from any workspace — a file list, an outline, open in Chrome / VS Code, and copy buttons; the docs directory is configurable (default ~/.dsh/docs)"
		};
		/**
		* The dictionary namespace this plugin owns in the DSH locale registry
		* (`'sidebar'` is taken by DSH's own ui-sidebar, hence this distinct name).
		*/
		const LOCALE_NS = "betterSidebar";
		/** The DSH locale service attached by the client apply (absent → browser detection). */
		let localeService;
		/**
		* Attach (or detach, with undefined) the DSH locale service. The sidebar
		* mounts its own React root outside the slot system's locale seat, so the
		* service rides this module-level holder: components keep calling the plain
		* `t()` function, and the Sidebar root's locale subscription re-renders the
		* whole tree on switches.
		*/
		function attachLocale(service) {
			localeService = service;
		}
		/**
		* The active locale id ('zh' | 'en'): the DSH locale service's snapshot when
		* attached, else the browser language.
		*/
		function activeLocale() {
			return localeService?.getSnapshot().active ?? (typeof navigator !== "undefined" ? navigator.language : "") ?? "en";
		}
		/** Translate a copy key; `{name}` placeholders interpolate from `params`. */
		function t(key, params) {
			let text = (activeLocale().toLowerCase().startsWith("zh") ? zh : en)[key];
			if (params !== void 0) for (const [name, value] of Object.entries(params)) text = text.replaceAll(`{${name}}`, String(value));
			return text;
		}
		/** Format an ISO 8601 author date relative to now (刚刚 / N 分钟前 / N 小时前 / 昨天 / date). */
		function relativeTime(iso) {
			const then = Date.parse(iso);
			if (Number.isNaN(then)) return iso;
			const seconds = Math.floor((Date.now() - then) / 1e3);
			if (seconds < 60) return t("timeJustNow");
			if (seconds < 3600) return t("timeMinutesAgo", { n: Math.floor(seconds / 60) });
			if (seconds < 86400) return t("timeHoursAgo", { n: Math.floor(seconds / 3600) });
			if (seconds < 172800) return t("timeYesterday");
			const date = new Date(then);
			const pad = (value) => String(value).padStart(2, "0");
			return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
		}
		//#endregion
		//#region src/client/paths.ts
		/**
		* Path projection helpers shared by the explorer rows: a path relative to
		* the session cwd (for the @-reference button and "copy relative path").
		* The fs-tree joins with '/' even on Windows, so both separators normalize
		* to '/' before comparison.
		*
		* This module is dependency-free (no node:path in the client bundle): the
		* host is the authority for path semantics, so this mirror deliberately
		* accepts a SUPERSET of absolute forms — anything a Windows host would emit
		* (drive letters, UNC) plus POSIX roots. A form the host would reject
		* (e.g. a backslash UNC path on a POSIX host) passes through here and then
		* fails loudly in the host's requireAbsolute instead of being silently
		* joined onto the cwd.
		*/
		/**
		* Mirror of the host's absolute-path notion (see fs-tree.requireAbsolute):
		* POSIX roots, Windows drive letters, and Windows UNC network shares in
		* both backslash (`\\server\share\...`) and forward-slash
		* (`//server/share/...`) form. Deliberately a superset — see the module
		* comment — so a produced UNC path is never joined onto the cwd.
		*/
		function isAbsolutePath(path) {
			return path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path) || /^[\\/]{2}[^\\/]/.test(path);
		}
		/**
		* The path relative to the session's working directory.
		* @param cwd - the explorer root (absolute).
		* @param path - an absolute entry path from the fs-tree.
		* @returns the relative path with '/' separators ('.' for the cwd itself),
		* or `path` unchanged when it lies outside the cwd.
		*
		* The prefix test is case-insensitive: Windows paths (and macOS's
		* case-insensitive volumes) may arrive with different casing than the cwd
		* row, and the containment decision must not depend on it. The returned
		* relative text keeps the caller's own casing.
		*/
		function relativeTo(cwd, path) {
			const base = cwd.replace(/[\\/]+$/, "");
			const norm = (value) => value.replace(/\\/g, "/");
			const nBase = norm(base);
			const nPath = norm(path);
			if (nPath === nBase) return ".";
			if (nPath.toLowerCase().startsWith(`${nBase.toLowerCase()}/`)) return nPath.slice(nBase.length + 1);
			return path;
		}
		//#endregion
		//#region src/client/produced-files.ts
		/**
		* Pure derivation of one turn's produced files from finalized conversation
		* nodes — a structural replica of ui-deliverables' `producedForClosing`
		* (the mutation tools' follow-along `locations`, by render intent: a diff
		* card or a generic edit card; reads/deletes/failures produce nothing).
		* Kept dependency-free so the takeover logic is unit-testable and the
		* replica is easy to diff against upstream when it drifts.
		*/
		/** Paths a tool-result view reports as produced, by render intent. */
		function producedPaths(view) {
			if (view === null || typeof view !== "object") return [];
			const record = view;
			if (!(record.card === "diff" || record.card === "generic" && record.kind === "edit")) return [];
			if (!Array.isArray(record.locations)) return [];
			const paths = [];
			for (const location of record.locations) if (location !== null && typeof location === "object" && typeof location.path === "string") paths.push(location.path);
			return paths;
		}
		/**
		* Files produced by the turn the assistant at `seq` closes. Accumulation
		* resets on turn boundaries (a user message, or a node reporting a different
		* turn number); paths keep first-seen order and appear once.
		* @param nodes - snapshot nodes in surface order (structural, unknown-safe).
		* @param seq - the closing assistant's seq (the render site's anchor).
		* @returns produced paths; empty when the turn wrote nothing.
		*/
		function producedForClosing(nodes, seq) {
			let pending = [];
			let seen = /* @__PURE__ */ new Set();
			let turn;
			for (const node of nodes) {
				if (node === null || typeof node !== "object") continue;
				const record = node;
				if (record.kind === "tool-result") {
					if (record.isError === true) continue;
					for (const path of producedPaths(record.callView)) {
						if (seen.has(path)) continue;
						seen.add(path);
						pending.push(path);
					}
					continue;
				}
				if (record.kind === "user") {
					turn = void 0;
					pending = [];
					seen = /* @__PURE__ */ new Set();
				} else if (typeof record.turn === "number") {
					if (turn !== void 0 && record.turn !== turn) {
						pending = [];
						seen = /* @__PURE__ */ new Set();
					}
					turn = record.turn;
				}
				if (record.kind === "assistant" && record.seq === seq) return pending;
			}
			return [];
		}
		/**
		* Claim the turn-tail chain only when the closing turn produced files.
		* @param owner - the turn-tail owner currency ({nodes, seq}).
		* @returns produced paths as the matched value, or null to decline.
		*/
		function selectProducedFiles(owner) {
			const record = owner;
			if (record === null || typeof record !== "object") return null;
			if (!Array.isArray(record.nodes) || typeof record.seq !== "number") return null;
			const paths = producedForClosing(record.nodes, record.seq);
			return paths.length === 0 ? null : paths;
		}
		/**
		* Resolve a (possibly relative) path against the session cwd for the sidebar.
		* Absolute detection mirrors the host (see client/paths.isAbsolutePath):
		* POSIX roots, drive letters and UNC shares must not be joined onto the cwd.
		*/
		function resolveSidebarPath(cwd, path) {
			if (isAbsolutePath(path)) return path;
			const base = cwd ?? "";
			if (base === "") return path;
			const separator = base.includes("\\") ? "\\" : "/";
			return `${base.replace(/[\\/]+$/, "")}${separator}${path}`;
		}
		//#endregion
		//#region src/client/openpath-intercept.ts
		/**
		* Wrap `workspaces.openPath`: intercepted calls open the file in the sidebar
		* editor instead of the Host OS and resolve as success (the original's
		* callers ignore the result); anything that declines falls through to the
		* original method untouched.
		* @param workspaces - the client workspaces service to wrap.
		* @param deps - per-call takeover decisions.
		* @returns the disposer restoring the original method (HMR-safe).
		*/
		function wrapOpenPath(workspaces, deps) {
			const original = workspaces.openPath;
			workspaces.openPath = (path) => {
				if (deps.takeoverEnabled()) {
					const sessionId = deps.currentSessionId();
					if (sessionId !== void 0) {
						deps.openInSidebar(path, sessionId);
						return Promise.resolve();
					}
				}
				return original.call(workspaces, path);
			};
			return () => {
				workspaces.openPath = original;
			};
		}
		/**
		* Wrap the CURRENT upstream chat file-open funnel: the typed remote
		* `ctx.remote.session.openWorkspacePath({ path })` (see the file header).
		* Intercepted calls open the file in the sidebar editor and resolve as
		* `{ ok: true, value: { opened: true } }` — the remote's success envelope, so
		* the chat's `openFile` resolves exactly like a real host open. Anything that
		* declines falls through to the original remote call untouched.
		*
		* The typed remote installs each method as an ACCESSOR returning a fresh
		* closure (see @deepseek-ai/dsh-api-gateway's RemoteNamespaceService.install),
		* so the wrapper replaces the accessor with a plain value and restores the
		* accessor verbatim on dispose (HMR-safe, like {@link wrapOpenPath}).
		*
		* @param service - the remote `session` namespace service (undefined before
		*   the api-remotes contribution mounts; a no-op in that case).
		* @param deps - per-call takeover decisions.
		* @returns the disposer restoring the original method (HMR-safe).
		*/
		function wrapRemoteOpenWorkspacePath(service, deps) {
			if (service === null || service === void 0) return () => {};
			const descriptor = Object.getOwnPropertyDescriptor(service, "openWorkspacePath");
			let original;
			if (descriptor !== void 0 && typeof descriptor.get === "function") original = descriptor.get.call(service);
			else original = service.openWorkspacePath;
			if (typeof original !== "function") return () => {};
			const wrapped = (request, signal) => {
				if (deps.takeoverEnabled()) {
					const sessionId = deps.currentSessionId();
					const path = request !== null && typeof request === "object" ? request.path : void 0;
					if (sessionId !== void 0 && typeof path === "string" && path !== "") {
						deps.openInSidebar(path, sessionId);
						return Promise.resolve({
							ok: true,
							value: { opened: true }
						});
					}
				}
				return original(request, signal);
			};
			if (descriptor !== void 0 && typeof descriptor.get === "function") {
				Object.defineProperty(service, "openWorkspacePath", {
					configurable: true,
					enumerable: true,
					writable: true,
					value: wrapped
				});
				return () => {
					Object.defineProperty(service, "openWorkspacePath", descriptor);
				};
			}
			const holder = service;
			holder.openWorkspacePath = wrapped;
			return () => {
				holder.openWorkspacePath = original;
			};
		}
		//#endregion
		//#region \0dsh-css:C:\Users\delinger\Desktop\dsh\dsh-desktop\assets\plugins\dsh-better-sidebar\src\client\sidebar.module.css.mjs
		const css$4 = "[data-dsh-panel-host]{z-index:40;pointer-events:none;position:fixed;inset:0}[data-dsh-panel-host][data-dsh-panel-host-degraded]{position:absolute;top:0;left:0}._4ve_2a_toggleCluster{top:calc(3px + env(safe-area-inset-top));z-index:45;pointer-events:auto;flex-direction:row;gap:4px;display:flex;position:absolute;right:10px}._4ve_2a_panel:not(._4ve_2a_panelHidden) ._4ve_2a_tabBar{padding-right:72px}._4ve_2a_toggleButton{width:28px;height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;transition:background var(--ds-transition-duration-slow) var(--ds-ease-in-out), color var(--ds-transition-duration-slow) var(--ds-ease-in-out);background:0 0;border:none;border-radius:50%;justify-content:center;align-items:center;display:flex}._4ve_2a_toggleButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}._4ve_2a_toggleButton:disabled{opacity:.4;cursor:default}._4ve_2a_panel{z-index:40;pointer-events:auto;background:var(--dsw-alias-bg-layer-1);border-left:1px solid var(--dsw-alias-border-l2);padding-bottom:env(safe-area-inset-bottom);transition:transform var(--ds-transition-duration-slow) var(--ds-ease-in-out), width var(--ds-transition-duration-slow) var(--ds-ease-in-out);flex-direction:column;display:flex;position:absolute;top:0;bottom:0;right:0}._4ve_2a_panelHidden{pointer-events:none;visibility:hidden;transition:transform var(--ds-transition-duration-slow) var(--ds-ease-in-out), width var(--ds-transition-duration-slow) var(--ds-ease-in-out), visibility 0s linear var(--ds-transition-duration-slow);transform:translate(102%)}._4ve_2a_panel[data-dragging]{transition:none}._4ve_2a_panelResize{cursor:col-resize;z-index:2;touch-action:none;width:8px;position:absolute;top:0;bottom:0;left:-4px}._4ve_2a_panelResizeActive{background:var(--dsw-alias-interactive-bg-hover-accent)}._4ve_2a_panelBody{flex:1;min-width:0;min-height:0;display:flex}._4ve_2a_bottomPanel{z-index:40;background:var(--dsw-alias-bg-layer-1);border-top:1px solid var(--dsw-alias-border-l2);pointer-events:auto;padding-bottom:env(safe-area-inset-bottom);transition:transform var(--ds-transition-duration-slow) var(--ds-ease-in-out), height var(--ds-transition-duration-slow) var(--ds-ease-in-out);flex-direction:column;display:flex;position:absolute;bottom:0}._4ve_2a_bottomPanelHidden{pointer-events:none;visibility:hidden;transition:transform var(--ds-transition-duration-slow) var(--ds-ease-in-out), height var(--ds-transition-duration-slow) var(--ds-ease-in-out), visibility 0s linear var(--ds-transition-duration-slow);transform:translateY(102%)}._4ve_2a_bottomPanel[data-dragging]{transition:none}._4ve_2a_panel,._4ve_2a_bottomPanel{contain:layout style}body[data-dsh-sidebar-dragging] ._4ve_2a_panel,body[data-dsh-sidebar-dragging] ._4ve_2a_bottomPanel{will-change:transform}._4ve_2a_bottomResize{cursor:row-resize;z-index:2;touch-action:none;height:8px;position:absolute;top:-4px;left:0;right:0}._4ve_2a_bottomResizeActive{background:var(--dsw-alias-interactive-bg-hover-accent)}._4ve_2a_bottomClose{z-index:4;width:28px;height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-radius:50%;flex:none;justify-content:center;align-items:center;padding:0;display:inline-flex;position:absolute;top:3px;right:6px}._4ve_2a_bottomClose:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}._4ve_2a_bottomPanel ._4ve_2a_tabBar{padding-right:40px}._4ve_2a_toggleCluster,._4ve_2a_toggleButton,._4ve_2a_tabBar{-webkit-app-region:no-drag}body[data-dsh-title-bar-compat] ._4ve_2a_toggleCluster{top:calc(var(--dsh-title-bar-strip,40px) + 3px)}body[data-dsh-title-bar-compat] ._4ve_2a_panel{padding-top:var(--dsh-title-bar-strip,40px)}._4ve_2a_cornerHandle{left:-6px;bottom:calc(var(--dsh-sidebar-height,0px) + 6px);z-index:2;cursor:nwse-resize;touch-action:none;width:12px;height:12px;position:absolute}._4ve_2a_cornerHandle:hover,._4ve_2a_cornerHandle[data-dragging]{background:var(--dsw-alias-interactive-bg-hover-accent)}._4ve_2a_iconButton{width:28px;height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-radius:50%;flex:none;justify-content:center;align-items:center;padding:0;display:inline-flex}._4ve_2a_iconButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}._4ve_2a_iconButton:disabled{opacity:.4;cursor:default}._4ve_2a_workbench,._4ve_2a_split{flex:1;min-width:0;min-height:0;display:flex}._4ve_2a_splitRow{flex-direction:row}._4ve_2a_splitCol{flex-direction:column}._4ve_2a_splitChild{display:flex;position:relative;overflow:hidden}._4ve_2a_divider{z-index:3;touch-action:none;flex:none;position:relative}._4ve_2a_dividerRow:after,._4ve_2a_dividerCol:after{content:\"\";background:var(--dsw-alias-border-l2);transition:background var(--ds-transition-duration-slow) var(--ds-ease-in-out);position:absolute}._4ve_2a_dividerRow{cursor:col-resize;width:7px;margin:0 -2px}._4ve_2a_dividerRow:after{width:1px;top:0;bottom:0;left:50%;transform:translate(-50%)}._4ve_2a_dividerCol{cursor:row-resize;height:7px;margin:-2px 0}._4ve_2a_dividerCol:after{height:1px;top:50%;left:0;right:0;transform:translateY(-50%)}._4ve_2a_divider:hover:after,._4ve_2a_dividerActive:after{background:var(--dsw-alias-interactive-bg-hover-accent)}._4ve_2a_pane{background:var(--dsw-alias-bg-base);flex-direction:column;flex:1;min-width:0;min-height:0;display:flex;position:relative}._4ve_2a_paneDrop{outline:1px solid var(--dsw-alias-interactive-bg-hover-accent);outline-offset:-1px}._4ve_2a_dropOverlay{z-index:6;pointer-events:none;background:var(--dsw-alias-interactive-bg-hover-accent);opacity:.5;position:absolute}._4ve_2a_dropLeft{width:25%;top:0;bottom:0;left:0}._4ve_2a_dropRight{width:25%;top:0;bottom:0;right:0}._4ve_2a_dropUp{height:25%;top:0;left:0;right:0}._4ve_2a_dropDown{height:25%;bottom:0;left:0;right:0}._4ve_2a_dropCenter{outline:2px dashed var(--dsw-alias-interactive-bg-hover-accent);outline-offset:-2px;background:0 0;inset:25%}._4ve_2a_paneContent{flex-direction:column;flex:1;min-height:0;display:flex;overflow:hidden}._4ve_2a_paneTab{flex-direction:column;flex:1;min-height:0;display:flex}._4ve_2a_paneTabHidden{display:none}._4ve_2a_paneEmptyCards{flex:1;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));align-content:start;gap:8px;min-height:0;padding:12px;display:grid;overflow:hidden}._4ve_2a_paneCard{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);min-width:0;color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xxs-strong-12);cursor:pointer;text-align:center;border-radius:8px;flex-direction:column;justify-content:center;align-items:center;gap:6px;padding:12px 8px;display:flex}._4ve_2a_paneCard:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}._4ve_2a_paneCard:disabled{opacity:.45;cursor:default}._4ve_2a_tabBar{border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);flex:none;align-items:stretch;height:34px;display:flex}._4ve_2a_tabBarDrop{outline:1px dashed var(--dsw-alias-interactive-bg-hover-accent);outline-offset:-1px}._4ve_2a_tabList{scrollbar-width:none;flex:1;min-width:0;display:flex;overflow-x:auto}._4ve_2a_tabList::-webkit-scrollbar{display:none}._4ve_2a_tab{min-width:64px;max-width:160px;font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-secondary);border-right:1px solid var(--dsw-alias-border-l1);cursor:pointer;user-select:none;background:0 0;flex:none;align-items:center;gap:4px;padding:0 4px 0 10px;display:flex}._4ve_2a_tab:hover{background:var(--dsw-alias-interactive-bg-hover)}._4ve_2a_tabActive{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-active)}._4ve_2a_tabTitle{text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;overflow:hidden}._4ve_2a_tabBadge{min-width:16px;height:15px;font:var(--dsw-font-xxxs-strong-11);background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-brand-primary);border-radius:8px;flex:none;justify-content:center;align-items:center;padding:0 4px;display:inline-flex}._4ve_2a_tabClose{width:18px;height:18px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;border-radius:4px;flex:none;justify-content:center;align-items:center;padding:0;display:inline-flex}._4ve_2a_tabClose:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}._4ve_2a_tabBarPlus{background:var(--dsw-alias-bg-layer-1);width:22px;height:22px;color:var(--dsw-alias-label-tertiary);cursor:pointer;border:none;border-radius:5px;flex:none;justify-content:center;align-self:center;align-items:center;margin:0 6px;padding:0;display:inline-flex;position:sticky;right:0}._4ve_2a_tabBarPlus:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}._4ve_2a_explorer{flex-direction:column;flex:1;min-height:0;display:flex}._4ve_2a_explorerHeader{flex:none;justify-content:space-between;align-items:center;gap:8px;height:36px;padding:0 8px 0 12px;display:flex}._4ve_2a_explorerRoot{font:var(--dsw-font-s-14);color:var(--dsw-alias-label-secondary);text-overflow:ellipsis;white-space:nowrap;overflow:hidden}._4ve_2a_explorerBody{flex:1;min-height:0;padding:2px 6px 8px;overflow:hidden auto}._4ve_2a_explorerRow{box-sizing:border-box;width:100%;max-width:100%;height:34px;font:var(--dsw-font-s-14);color:var(--dsw-alias-label-primary);text-align:left;cursor:pointer;white-space:nowrap;animation:_4ve_2a_dsh-row-in .15s var(--ds-ease-in-out);background:0 0;border:none;border-radius:8px;align-items:center;gap:6px;padding:0 8px;display:flex}._4ve_2a_explorerRow:hover{background:var(--dsw-alias-interactive-bg-hover)}._4ve_2a_explorerDir{font:var(--dsw-font-s-strong-14)}._4ve_2a_explorerHidden{opacity:.45}._4ve_2a_explorerSymlink{color:var(--dsw-alias-label-tertiary);flex:none}._4ve_2a_explorerBroken ._4ve_2a_explorerName{color:var(--dsw-alias-state-error-primary)}._4ve_2a_explorerName{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}._4ve_2a_explorerRef{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);height:20px;color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxxs-strong-11);cursor:pointer;border-radius:999px;flex:none;align-items:center;padding:0 8px;display:none}._4ve_2a_explorerRef:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}._4ve_2a_explorerRow:hover ._4ve_2a_explorerRef,._4ve_2a_explorerRow:focus-within ._4ve_2a_explorerRef{display:inline-flex}._4ve_2a_explorerCopied{font:var(--dsw-font-xxxs-11);color:var(--dsw-alias-label-tertiary);flex:none}._4ve_2a_explorerError{font:var(--dsw-font-xxs-12);color:var(--dsw-alias-state-error-primary);cursor:default}@keyframes _4ve_2a_dsh-row-in{0%{opacity:0}}._4ve_2a_explorerEmpty{font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-tertiary);text-align:center;padding:16px}body{--dsh-file-icon-folder:#b98a3e;--dsh-file-icon-js:#c9a000;--dsh-file-icon-ts:#3178c6;--dsh-file-icon-json:#a4912a;--dsh-file-icon-md:#4f9a50;--dsh-file-icon-css:#c86b2f;--dsh-file-icon-html:#d46a1f;--dsh-file-icon-image:#a855b0}body[data-ds-dark-theme]{--dsh-file-icon-folder:#dcb67a;--dsh-file-icon-js:#e8c44b;--dsh-file-icon-ts:#56a8d8;--dsh-file-icon-json:#cbcb41;--dsh-file-icon-md:#69a864;--dsh-file-icon-css:#d18f52;--dsh-file-icon-html:#e37933;--dsh-file-icon-image:#c586e0}._4ve_2a_explorerIconFolder{color:var(--dsh-file-icon-folder)}._4ve_2a_explorerIconJs{color:var(--dsh-file-icon-js)}._4ve_2a_explorerIconTs{color:var(--dsh-file-icon-ts)}._4ve_2a_explorerIconJson{color:var(--dsh-file-icon-json)}._4ve_2a_explorerIconMd{color:var(--dsh-file-icon-md)}._4ve_2a_explorerIconCss{color:var(--dsh-file-icon-css)}._4ve_2a_explorerIconHtml{color:var(--dsh-file-icon-html)}._4ve_2a_explorerIconImage{color:var(--dsh-file-icon-image)}._4ve_2a_explorerRowDropTarget{background:var(--dsw-alias-interactive-bg-hover);outline:1px dashed var(--dsw-alias-interactive-bg-hover-accent);outline-offset:-1px}._4ve_2a_uploadDropZone{z-index:1001;pointer-events:none;border:2px dashed var(--dsw-alias-interactive-bg-hover-accent);box-shadow:0 0 0 200vmax var(--dsw-alias-bg-mask-drop);animation:_4ve_2a_dsh-row-in .15s var(--ds-ease-in-out);border-radius:10px;justify-content:center;align-items:flex-start;padding:12px;display:flex;position:fixed}._4ve_2a_uploadDropHero{flex-direction:column;align-items:center;gap:10px;max-width:100%;padding-top:8px;display:flex}._4ve_2a_uploadDropZonePill{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);max-width:100%;box-shadow:var(--dsw-shadow-lv2);color:var(--dsw-alias-label-primary);font:var(--dsw-font-xxs-strong-12);border-radius:999px;align-items:center;gap:6px;padding:6px 12px;display:flex}._4ve_2a_uploadDropZoneText{white-space:nowrap;text-overflow:ellipsis;overflow:hidden}._4ve_2a_uploadDropChatHint{z-index:1002;pointer-events:none;animation:_4ve_2a_dsh-row-in .15s var(--ds-ease-in-out);justify-content:center;align-items:center;padding:24px;display:flex;position:fixed;top:0;bottom:0;left:0}._4ve_2a_uploadDropChatCard{text-align:center;max-width:100%;color:var(--dsw-alias-label-primary);font:var(--dsw-font-s-strong-14);flex-direction:column;align-items:center;gap:12px;display:flex}._4ve_2a_uploadOverlay{z-index:30;background:var(--dsw-alias-bg-mask-1);backdrop-filter:var(--dsw-mask-blur);animation:_4ve_2a_dsh-row-in .15s var(--ds-ease-in-out);justify-content:center;align-items:center;display:flex;position:absolute;inset:0}._4ve_2a_uploadOverlayCard{border:1px solid var(--dsw-alias-border-inverted);background:var(--dsw-alias-bg-layer-2);min-width:280px;max-width:min(420px,100% - 48px);box-shadow:var(--dsw-shadow-lv3);border-radius:24px;flex-direction:column;gap:12px;padding:20px 24px;display:flex}._4ve_2a_uploadOverlayTitle{font:var(--dsw-font-s-strong-14);color:var(--dsw-alias-label-primary);align-items:center;gap:8px;display:flex}._4ve_2a_uploadOverlayTitle>svg{flex:none}._4ve_2a_uploadOverlayTitle>span{white-space:nowrap;text-overflow:ellipsis;min-width:0;overflow:hidden}._4ve_2a_uploadOverlayProgress{background:var(--dsw-alias-border-l2);border-radius:3px;height:6px;overflow:hidden}._4ve_2a_uploadOverlayProgressFill{background:var(--dsw-alias-interactive-bg-hover-accent);height:100%;transition:width .15s var(--ds-ease-in-out);border-radius:3px}._4ve_2a_uploadOverlayStatus{min-height:1em;font:var(--dsw-font-xxs-12);font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-tertiary);white-space:nowrap;text-overflow:ellipsis;overflow:hidden}._4ve_2a_uploadOverlayCancel{border:1px solid var(--dsw-alias-border-l2);height:28px;color:var(--dsw-alias-label-primary);font:var(--dsw-font-xxs-strong-12);cursor:pointer;background:0 0;border-radius:8px;align-self:flex-end;padding:0 14px}._4ve_2a_uploadOverlayCancel:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l2)}._4ve_2a_uploadOverlayCancel:disabled{opacity:.4;cursor:default}._4ve_2a_editor{flex-direction:column;flex:1;min-height:0;display:flex}._4ve_2a_editorHeader{border-bottom:1px solid var(--dsw-alias-border-l1);flex:none;align-items:center;gap:6px;padding:4px 8px;display:flex}._4ve_2a_editorBack{width:22px;height:22px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-radius:6px;flex:none;justify-content:center;align-items:center;padding:0;display:inline-flex}._4ve_2a_editorBack:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}._4ve_2a_editorTitle{min-width:0;font:var(--dsw-font-xxs-strong-12);color:var(--dsw-alias-label-secondary);text-overflow:ellipsis;white-space:nowrap;flex:1;overflow:hidden}._4ve_2a_editorPathInput{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);min-width:0;height:28px;color:var(--dsw-alias-label-primary);font:var(--dsw-font-xxs-12);border-radius:6px;flex:1;padding:0 10px}._4ve_2a_editorPathInput:focus{border-color:var(--dsw-alias-border-l2);outline:none}._4ve_2a_editorTreeToggleActive{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-active)}._4ve_2a_editorBody{flex:1;min-height:0;display:flex}._4ve_2a_editorMain{flex-direction:column;flex:1;min-width:0;min-height:0;display:flex}._4ve_2a_editorTreeDock{border-right:1px solid var(--dsw-alias-border-l1);flex:none;min-height:0;display:flex;position:relative}._4ve_2a_editorTreeResize{cursor:col-resize;touch-action:none;z-index:3;width:6px;position:absolute;top:0;bottom:0;right:0}._4ve_2a_editorTreeResize:hover{background:var(--dsw-alias-border-l2)}._4ve_2a_editorTreePanel{flex-direction:column;flex:1;min-width:0;min-height:0;display:flex;position:relative}._4ve_2a_editorTreePanelFull{flex:1}._4ve_2a_explorerRail{border-right:1px solid var(--dsw-alias-border-l1);flex-direction:column;flex:none;min-width:0;min-height:0;display:flex;position:relative}._4ve_2a_explorerRailHeader{border-bottom:1px solid var(--dsw-alias-border-l1);height:30px;color:var(--dsw-alias-label-secondary);flex:none;align-items:center;gap:6px;padding:0 4px 0 10px;display:flex}._4ve_2a_explorerRailTitle{text-overflow:ellipsis;white-space:nowrap;letter-spacing:.04em;text-transform:uppercase;flex:1;min-width:0;font-size:11px;font-weight:600;overflow:hidden}._4ve_2a_explorerRailCollapsed{border-right:1px solid var(--dsw-alias-border-l1);width:30px;min-height:0;color:var(--dsw-alias-label-secondary);flex:none;justify-content:center;align-items:flex-start;padding-top:4px;display:flex}._4ve_2a_editorTreeSearch{border-bottom:1px solid var(--dsw-alias-border-l1);flex:none;align-items:center;gap:4px;padding:6px 8px;display:flex}._4ve_2a_editorSearchInput{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);min-width:0;height:26px;color:var(--dsw-alias-label-primary);font:var(--dsw-font-xxs-12);border-radius:6px;flex:1;padding:0 10px}._4ve_2a_editorSearchInput:focus{border-color:var(--dsw-alias-border-l2);outline:none}._4ve_2a_editorSearchHint{font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-tertiary);padding:8px 12px}._4ve_2a_editorSearchResult{width:100%;color:var(--dsw-alias-label-primary);font:var(--dsw-font-xxs-12);text-align:left;cursor:pointer;text-overflow:ellipsis;white-space:nowrap;background:0 0;border:none;border-radius:6px;padding:4px 8px;display:block;overflow:hidden}._4ve_2a_editorSearchResult:hover{background:var(--dsw-alias-interactive-bg-hover)}._4ve_2a_editorStatus{font:var(--dsw-font-xxxs-11);color:var(--dsw-alias-label-tertiary)}._4ve_2a_editorStatusError{color:var(--dsw-alias-state-error-primary)}._4ve_2a_dirtyDot{background:var(--dsw-alias-state-warn-primary);border-radius:50%;flex:none;width:7px;height:7px}._4ve_2a_editorPlaceholder{font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-tertiary);text-align:center;flex:1;justify-content:center;align-items:center;padding:16px;display:flex}._4ve_2a_orphanedType{opacity:.7;overflow-wrap:anywhere;margin-top:8px;font-size:12px;display:block}._4ve_2a_editorBinary{text-align:center;flex-direction:column;flex:1;justify-content:center;align-items:center;gap:12px;padding:24px 16px;display:flex}._4ve_2a_editorBinaryNotice{font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-tertiary)}._4ve_2a_editorDownloadLink{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:var(--dsw-font-xxs-strong-12);cursor:pointer;transition:background var(--ds-transition-duration-slow) var(--ds-ease-in-out), border-color var(--ds-transition-duration-slow) var(--ds-ease-in-out);border-radius:6px;align-items:center;gap:6px;padding:6px 14px;text-decoration:none;display:inline-flex}._4ve_2a_editorDownloadLink:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l2)}._4ve_2a_editorError{font:var(--dsw-font-xxs-12);color:var(--dsw-alias-state-error-primary);padding:12px 16px}._4ve_2a_editorBanner{font:var(--dsw-font-xxxs-11);color:var(--dsw-alias-state-warn-label);background:var(--dsw-alias-state-warn-tertiary);flex:none;padding:4px 12px}._4ve_2a_sandboxStatus{font:var(--dsw-font-xxxs-11);flex:none;align-items:center;gap:8px;padding:4px 10px;display:flex}._4ve_2a_sandboxStatusOn{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1);border-bottom:1px solid var(--dsw-alias-border-l1)}._4ve_2a_sandboxStatusOff{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);border-bottom:1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, transparent)}._4ve_2a_sandboxDot{background:var(--dsw-alias-state-success-primary);border-radius:50%;flex:none;width:6px;height:6px}._4ve_2a_sandboxStatusOff ._4ve_2a_sandboxDot{background:var(--dsw-alias-state-error-primary)}._4ve_2a_sandboxStatusText{text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;overflow:hidden}._4ve_2a_sandboxAction{border:1px solid var(--dsw-alias-border-l2);font:inherit;color:inherit;cursor:pointer;background:0 0;border-radius:6px;flex:none;padding:2px 8px}._4ve_2a_sandboxAction:hover{background:var(--dsw-alias-interactive-bg-hover)}._4ve_2a_editorHtml{background:var(--dsw-alias-bg-base);border:none;flex:1;width:100%;min-height:0}._4ve_2a_browser{flex-direction:column;flex:1;min-height:0;display:flex}._4ve_2a_browserBar{border-bottom:1px solid var(--dsw-alias-border-l1);flex:none;align-items:center;gap:4px;padding:6px 8px;display:flex}._4ve_2a_browserInput{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);min-width:0;height:28px;color:var(--dsw-alias-label-primary);font:var(--dsw-font-xxs-12);border-radius:6px;flex:1;padding:0 10px}._4ve_2a_browserInput:focus{border-color:var(--dsw-alias-border-l2);outline:none}._4ve_2a_browserMessage{font:var(--dsw-font-xxxs-11);color:var(--dsw-alias-state-warn-label);background:var(--dsw-alias-state-warn-tertiary);flex:none;padding:4px 12px}._4ve_2a_browserFrame{background:var(--dsw-alias-bg-base);border:none;flex:1;width:100%;min-height:0}._4ve_2a_browserStart{text-align:center;min-height:0;font:var(--dsw-font-xs-13);color:var(--dsw-alias-label-tertiary);flex:1;justify-content:center;align-items:center;padding:20px;display:flex}._4ve_2a_browserBlocked{text-align:center;min-height:0;color:var(--dsw-alias-state-warn-primary);flex-direction:column;flex:1;justify-content:center;align-items:center;gap:6px;padding:24px;display:flex}._4ve_2a_browserBlockedTitle{font:var(--dsw-font-xxs-strong-12);color:var(--dsw-alias-label-primary)}._4ve_2a_browserBlockedDesc{max-width:280px;font:var(--dsw-font-xxxs-11);color:var(--dsw-alias-label-secondary)}._4ve_2a_browserBlockedActions{gap:8px;margin-top:6px;display:flex}._4ve_2a_browserBlockedButton{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:var(--dsw-font-xxxs-11);cursor:pointer;border-radius:6px;padding:4px 12px}._4ve_2a_browserBlockedButton:hover{background:var(--dsw-alias-interactive-bg-hover)}._4ve_2a_editorCm{background:0 0;flex:1;min-height:0;overflow:hidden}._4ve_2a_editorCmHidden{display:none}._4ve_2a_editorCm .cm-editor{height:100%}._4ve_2a_editorCm .cm-editor.cm-focused{outline:none}._4ve_2a_editorModeToggle{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:6px;flex:none;align-items:center;gap:2px;padding:2px;display:inline-flex}._4ve_2a_editorModeButton{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxxs-11);cursor:pointer;background:0 0;border:none;border-radius:4px;padding:2px 8px}._4ve_2a_editorModeButton:hover{color:var(--dsw-alias-label-primary)}._4ve_2a_editorModeActive{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}._4ve_2a_editorImageWrap{flex:1;justify-content:center;align-items:center;min-height:0;padding:12px;display:flex;overflow:auto}._4ve_2a_editorImage{object-fit:contain;max-width:100%;max-height:100%}._4ve_2a_editorMd{min-height:0;font:var(--dsw-font-xs-13);--dsh-md-accent:var(--dsw-alias-state-business-primary);--dsh-md-border:var(--dsw-alias-border-l2);--dsh-md-quote-bg:color-mix(in srgb, var(--dsw-alias-state-business-primary) 8%, transparent);--dsh-md-table-head-bg:var(--dsw-alias-interactive-bg-hover);--dsh-md-table-stripe:color-mix(in srgb, var(--dsw-alias-interactive-bg-hover) 45%, transparent);flex:1;padding:10px 14px;overflow-y:auto}._4ve_2a_editorMd h1,._4ve_2a_editorMd h2{border-bottom:1px solid var(--dsh-md-border);color:var(--dsw-alias-label-primary);padding-bottom:.35em;font-weight:700}._4ve_2a_editorMd h3,._4ve_2a_editorMd h4,._4ve_2a_editorMd h5,._4ve_2a_editorMd h6{color:var(--dsw-alias-label-secondary)}._4ve_2a_editorMd a{text-underline-offset:3px}._4ve_2a_editorMd blockquote{border-left:3px solid var(--dsh-md-accent);background:var(--dsh-md-quote-bg);color:var(--dsw-alias-label-secondary);border-radius:0 8px 8px 0;margin:16px 0;padding:6px 14px}._4ve_2a_editorMd blockquote p:last-child{margin-bottom:0}._4ve_2a_editorMd .md-code-block{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-markdown-code-block);border-radius:10px;overflow:hidden}._4ve_2a_editorMd .md-code-block pre{background:var(--dsw-alias-markdown-code-block)!important}._4ve_2a_editorMd th{background:var(--dsh-md-table-head-bg);font-weight:650}._4ve_2a_editorMd th,._4ve_2a_editorMd td{border:1px solid var(--dsh-md-border)}._4ve_2a_editorMd tbody tr:nth-child(2n){background:var(--dsh-md-table-stripe)}._4ve_2a_editorMd li::marker{color:var(--dsh-md-accent)}._4ve_2a_editorMd img{border:1px solid var(--dsw-alias-border-l1);border-radius:8px}._4ve_2a_mermaidWrap{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:6px;margin:6px 0;overflow:hidden}._4ve_2a_mermaidHeader{border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);justify-content:space-between;align-items:center;gap:6px;padding:4px 8px;display:flex}._4ve_2a_mermaidInfo{font:var(--dsw-font-xxxs-strong-11);color:var(--dsw-alias-label-tertiary)}._4ve_2a_mermaidCopy{height:20px;color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xxxs-11);cursor:pointer;background:0 0;border:none;border-radius:4px;align-items:center;gap:4px;padding:0 6px;display:inline-flex}._4ve_2a_mermaidCopy:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}._4ve_2a_mermaidBody{cursor:zoom-in;justify-content:center;padding:10px;display:flex;overflow:auto}._4ve_2a_mermaidBody svg{max-width:100%;height:auto}._4ve_2a_mermaidError{border-bottom:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-state-error-primary);font:var(--dsw-font-xxxs-11);padding:6px 10px}._4ve_2a_mermaidCode{font:var(--dsw-font-xxxs-11);margin:0;padding:8px 10px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;overflow:auto}._4ve_2a_mermaidMarkdown .md-code-block[data-mermaid-processed]{display:contents}._4ve_2a_mermaidModal{z-index:1000;background:var(--dsw-alias-bg-mask-1);backdrop-filter:blur(2px);flex-direction:column;justify-content:center;align-items:center;display:flex;position:fixed;inset:0}._4ve_2a_mermaidModalToolbar{z-index:10;gap:8px;display:flex;position:absolute;top:16px;right:16px}._4ve_2a_mermaidModalButton{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);width:36px;height:36px;color:var(--dsw-alias-label-primary);font:var(--dsw-font-xs-strong-13);cursor:pointer;border-radius:8px;justify-content:center;align-items:center;display:inline-flex}._4ve_2a_mermaidModalButton:hover{background:var(--dsw-alias-interactive-bg-hover)}._4ve_2a_mermaidModalStage{justify-content:center;align-items:center;width:90vw;height:80vh;display:flex;position:relative;overflow:hidden}._4ve_2a_mermaidModalStage svg{cursor:grab;transform-origin:50%;user-select:none;-webkit-user-drag:none;background:var(--dsw-alias-bg-layer-1);border-radius:12px;max-width:none;max-height:none;padding:16px}._4ve_2a_mermaidModalStage svg:active{cursor:grabbing}._4ve_2a_mermaidModalHint{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxxs-11);pointer-events:none;position:absolute;bottom:16px;left:50%;transform:translate(-50%)}._4ve_2a_selectionPopup{z-index:60;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);height:28px;color:var(--dsw-alias-label-primary);font:var(--dsw-font-xxxs-strong-11);white-space:nowrap;cursor:pointer;border-radius:6px;align-items:center;padding:0 10px;display:inline-flex;position:fixed;transform:translate(-50%,calc(-100% - 8px))}._4ve_2a_selectionPopup:hover{background:var(--dsw-alias-interactive-bg-hover)}._4ve_2a_editorPdf{background:var(--dsw-alias-bg-base);flex-direction:column;flex:1;min-height:0;display:flex}._4ve_2a_editorPdfToolbar{border-bottom:1px solid var(--dsw-alias-border-l1);flex:none;justify-content:flex-end;padding:6px 8px;display:flex}._4ve_2a_editorPdfStage{flex:1;min-height:0;display:flex;position:relative}._4ve_2a_editorPdfFrame{background:var(--dsw-alias-bg-base);border:none;flex:1;width:100%;min-height:0}._4ve_2a_editorPdfFrameBlocked{pointer-events:none}._4ve_2a_editorPdfDragShield{z-index:4;pointer-events:none;background:0 0;position:absolute;inset:0}._4ve_2a_editorPdfDragShieldActive{pointer-events:auto}body[data-dsh-tab-dragging] ._4ve_2a_editorPdfFrame{pointer-events:none!important}body[data-dsh-tab-dragging] ._4ve_2a_editorPdfDragShield{pointer-events:auto!important}._4ve_2a_terminalWrap{background:var(--dsw-alias-bg-base);flex-direction:column;flex:1;min-height:0;display:flex;position:relative}._4ve_2a_terminal{flex:1;min-height:0;padding:6px 4px 6px 8px}._4ve_2a_terminal .xterm{height:100%}._4ve_2a_terminalBanner{font:var(--dsw-font-xxxs-11);color:var(--dsw-alias-state-warn-label);background:var(--dsw-alias-state-warn-tertiary);flex-wrap:wrap;flex:none;align-items:center;gap:8px;padding:3px 10px;display:flex}._4ve_2a_terminalBannerUrl{word-break:break-all;opacity:.85;flex-basis:100%;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}._4ve_2a_boundaryError{z-index:50;background:var(--dsw-alias-bg-layer-1);border-left:1px solid var(--dsw-alias-border-l2);font:var(--dsw-font-xxs-12);color:var(--dsw-alias-state-error-primary);flex-direction:column;align-items:flex-start;gap:8px;padding:16px;display:flex;position:fixed;top:0;bottom:0;right:0;overflow:auto}._4ve_2a_terminalRetry{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xxxs-strong-11);cursor:pointer;border-radius:999px;flex:none;padding:1px 8px}._4ve_2a_terminalRetry:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}._4ve_2a_terminalDepsBanner{font:var(--dsw-font-xxs-12);color:var(--dsw-alias-state-warn-label);background:var(--dsw-alias-state-warn-tertiary);flex-direction:column;flex:none;gap:6px;padding:10px;display:flex}._4ve_2a_terminalDepsTitle{font:var(--dsw-font-xxs-strong-12);color:var(--dsw-alias-state-warn-primary)}._4ve_2a_terminalDepsHint{opacity:.9}._4ve_2a_terminalDepsCommandRow{align-items:flex-start;gap:8px;display:flex}._4ve_2a_terminalRepairCommand{white-space:pre-wrap;word-break:break-all;user-select:text;min-width:0;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:4px;flex:1;max-height:160px;margin:0;padding:6px 8px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;line-height:1.5;overflow:auto}._4ve_2a_terminalDepsNote{opacity:.85}._4ve_2a_terminalDepsActions{align-items:center;gap:8px;display:flex}._4ve_2a_tabBoundaryError{min-height:0;font:var(--dsw-font-xxs-12);color:var(--dsw-alias-state-error-primary);flex-direction:column;flex:1;align-items:flex-start;gap:8px;padding:12px 16px;display:flex;overflow:auto}._4ve_2a_git{flex-direction:column;flex:1;min-width:0;min-height:0;display:flex;overflow:hidden auto}._4ve_2a_gitHeader{flex:none;align-items:center;gap:8px;height:36px;padding:0 8px 0 12px;display:flex}._4ve_2a_gitBranchSelect{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);min-width:0;height:26px;color:var(--dsw-alias-label-primary);font:var(--dsw-font-xxs-12);border-radius:6px;flex:1;padding:0 6px}._4ve_2a_gitSection{border-top:1px solid var(--dsw-alias-border-l1)}._4ve_2a_gitSectionHeader{font:var(--dsw-font-xxxs-strong-11);color:var(--dsw-alias-label-tertiary);text-transform:uppercase;justify-content:space-between;align-items:center;padding:6px 12px 4px;display:flex}._4ve_2a_gitLink{font:var(--dsw-font-xxxs-11);color:var(--dsw-alias-brand-primary);cursor:pointer;background:0 0;border:none;padding:0}._4ve_2a_gitLink:hover:not(:disabled){text-decoration:underline}._4ve_2a_gitLink:disabled{opacity:.4;cursor:default}._4ve_2a_gitRow{min-height:34px;animation:_4ve_2a_dsh-row-in .15s var(--ds-ease-in-out);border-radius:8px;align-items:center;gap:6px;margin:0 6px;padding:0 8px;display:flex}._4ve_2a_gitRow:hover{background:var(--dsw-alias-interactive-bg-hover)}._4ve_2a_gitRowSelected{background:var(--dsw-alias-interactive-bg-active)}._4ve_2a_gitRowMain{cursor:pointer;text-align:left;background:0 0;border:none;flex:1;align-items:center;gap:8px;min-width:0;padding:3px 0;display:flex}._4ve_2a_gitBadge{width:20px;height:16px;font:var(--dsw-font-xxxs-strong-11);background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary);border-radius:4px;flex:none;justify-content:center;align-items:center;display:inline-flex}._4ve_2a_gitName{text-overflow:ellipsis;white-space:nowrap;min-width:0;font:var(--dsw-font-s-14);color:var(--dsw-alias-label-primary);flex:1;overflow:hidden}._4ve_2a_gitEmpty{font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-tertiary);padding:4px 12px 8px}._4ve_2a_gitPlaceholder{font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-tertiary);text-align:center;padding:16px}._4ve_2a_gitError{font:var(--dsw-font-xxs-12);color:var(--dsw-alias-state-error-primary);white-space:pre-wrap;padding:8px 12px}._4ve_2a_gitDiff{border-top:1px solid var(--dsw-alias-border-l1);padding:8px}._4ve_2a_gitDiffTab{flex-direction:column;flex:1;min-width:0;min-height:0;display:flex;overflow:hidden auto}._4ve_2a_gitDiffTabHeader{border-bottom:1px solid var(--dsw-alias-border-l1);flex:none;align-items:center;gap:8px;height:36px;padding:0 8px 0 12px;display:flex}._4ve_2a_gitDiffTabTitle{text-overflow:ellipsis;white-space:nowrap;min-width:0;font:var(--dsw-font-xxs-strong-12);color:var(--dsw-alias-label-primary);flex:1;overflow:hidden}._4ve_2a_gitDiffFile{width:100%;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;align-items:baseline;gap:6px;padding:8px 2px 2px;display:flex}._4ve_2a_gitDiffFile:disabled{cursor:default}._4ve_2a_gitDiffFile:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}._4ve_2a_gitDiffFileChevron{color:var(--dsw-alias-label-tertiary);flex:none;transform:rotate(0)}._4ve_2a_gitDiffFileChevronExpanded{transform:rotate(90deg)}._4ve_2a_gitDiffFilePath{font:var(--dsw-font-xxs-strong-12);color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;overflow:hidden}._4ve_2a_gitDiffFileOld{font:var(--dsw-font-xxxs-11);color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;flex:none;max-width:40%;overflow:hidden}._4ve_2a_gitDiffFileTag{border:1px solid var(--dsw-alias-border-l2);font:var(--dsw-font-xxxs-strong-11);color:var(--dsw-alias-label-secondary);border-radius:999px;flex:none;padding:0 6px}._4ve_2a_gitDiffHunk{font:var(--dsw-font-markdown-code-block-small);color:var(--dsw-alias-label-tertiary);gap:8px;padding:3px 2px;display:flex}._4ve_2a_gitDiffHunkHeader{color:var(--dsw-alias-label-secondary);flex:none}._4ve_2a_gitDiffHunkSection{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}._4ve_2a_gitDiffLine{font:var(--dsw-font-markdown-code-block-small);white-space:pre-wrap;overflow-wrap:anywhere;align-items:stretch;min-width:0;line-height:20px;display:flex}._4ve_2a_gitDiffNum{text-align:right;width:36px;color:var(--dsw-alias-label-tertiary);user-select:none;flex:none;padding-right:8px}._4ve_2a_gitDiffCode{flex:1;min-width:0;overflow:visible}._4ve_2a_gitDiffCtx{color:var(--dsw-alias-label-primary)}._4ve_2a_gitDiffDel{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent)}._4ve_2a_gitDiffAdd{color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, transparent)}._4ve_2a_gitDiffMeta{padding-left:2px}._4ve_2a_gitDiffMetaText{font:var(--dsw-font-xxxs-11);color:var(--dsw-alias-label-tertiary);font-style:italic}._4ve_2a_gitDiffExpand{width:100%;font:var(--dsw-font-xxs-12);color:var(--dsw-alias-brand-primary);cursor:pointer;text-align:center;background:0 0;border:none;margin:4px 0;display:block}._4ve_2a_gitDiffExpand:hover{background:var(--dsw-alias-interactive-bg-hover)}._4ve_2a_gitConfirmDesc{font:var(--dsw-font-s-14);color:var(--dsw-alias-label-primary);white-space:pre-wrap;margin:0}._4ve_2a_gitCommit{border-top:1px solid var(--dsw-alias-border-l1);align-items:center;gap:6px;padding:8px 12px;display:flex}._4ve_2a_gitCommitInput{flex:1;min-width:0}._4ve_2a_gitCommitButton{background:var(--dsw-alias-button-primary-fill);height:26px;color:var(--dsw-alias-label-primary-inverted);font:var(--dsw-font-xxs-strong-12);cursor:pointer;border:none;border-radius:6px;flex:none;padding:0 12px}._4ve_2a_gitCommitButton:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}._4ve_2a_gitCommitButton:disabled{opacity:.45;cursor:default}._4ve_2a_gitLogRow{cursor:pointer;border-radius:8px;flex-direction:column;gap:2px;padding:5px 12px;display:flex}._4ve_2a_gitLogRow:hover{background:var(--dsw-alias-interactive-bg-hover)}._4ve_2a_gitLogLine1{align-items:baseline;gap:8px;min-width:0;display:flex}._4ve_2a_gitLogHash{font:var(--dsw-font-markdown-code-block-small);color:var(--dsw-alias-label-tertiary);flex:none}._4ve_2a_gitLogLine2{flex-wrap:wrap;align-items:center;gap:6px;min-width:0;display:flex}._4ve_2a_gitLogRef{border:1px solid var(--dsw-alias-border-l2);font:var(--dsw-font-xxxs-strong-11);color:var(--dsw-alias-brand-primary);white-space:nowrap;border-radius:999px;flex:none;padding:0 5px}._4ve_2a_gitLogSubject{text-overflow:ellipsis;white-space:nowrap;min-width:0;font:var(--dsw-font-s-14);color:var(--dsw-alias-label-primary);flex:1;overflow:hidden}._4ve_2a_gitLogMeta{font:var(--dsw-font-xxxs-11);color:var(--dsw-alias-label-tertiary)}._4ve_2a_gitLogMore{border:1px solid var(--dsw-alias-border-l2);width:calc(100% - 24px);font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border-radius:6px;margin:4px 12px 8px;padding:6px 0;display:block}._4ve_2a_gitLogMore:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}._4ve_2a_gitLogMore:disabled{opacity:.5;cursor:default}._4ve_2a_producedRow{flex-wrap:wrap;align-items:center;gap:8px;padding:4px 0;display:flex}._4ve_2a_producedLabel{font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-tertiary)}._4ve_2a_producedChip{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);max-width:200px;color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xxs-12);cursor:pointer;border-radius:999px;align-items:center;gap:4px;padding:2px 8px;display:inline-flex;overflow:hidden}._4ve_2a_producedChip:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}._4ve_2a_producedChip span{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}._4ve_2a_producedMore{font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-tertiary)}._4ve_2a_toggleButton:focus-visible,._4ve_2a_bottomClose:focus-visible,._4ve_2a_iconButton:focus-visible,._4ve_2a_tab:focus-visible,._4ve_2a_tabClose:focus-visible,._4ve_2a_tabBarPlus:focus-visible,._4ve_2a_paneCard:focus-visible,._4ve_2a_explorerRow:focus-visible,._4ve_2a_explorerRef:focus-visible,._4ve_2a_gitRowMain:focus-visible,._4ve_2a_gitLink:focus-visible,._4ve_2a_gitCommitButton:focus-visible,._4ve_2a_gitLogRow:focus-visible,._4ve_2a_gitLogMore:focus-visible,._4ve_2a_gitDiffFile:focus-visible,._4ve_2a_gitDiffExpand:focus-visible,._4ve_2a_terminalRetry:focus-visible,._4ve_2a_editorModeButton:focus-visible,._4ve_2a_editorDownloadLink:focus-visible,._4ve_2a_editorPptxButton:focus-visible,._4ve_2a_editorDocxZoomRange:focus-visible{outline:2px solid var(--dsw-alias-interactive-bg-hover-accent);outline-offset:-1px}@media (prefers-reduced-motion:reduce){._4ve_2a_panel,._4ve_2a_panelHidden,._4ve_2a_bottomPanel,._4ve_2a_bottomPanelHidden,._4ve_2a_toggleCluster,._4ve_2a_toggleButton,._4ve_2a_tab,._4ve_2a_tabBarPlus,._4ve_2a_paneCard,._4ve_2a_explorerRow,._4ve_2a_gitRow,._4ve_2a_divider,._4ve_2a_dividerRow:after,._4ve_2a_dividerCol:after{transition:none;animation:none}}@media (width<=767px){._4ve_2a_panel:not(._4ve_2a_panelHidden) ._4ve_2a_tabBar{padding-right:40px}._4ve_2a_tab{min-width:48px;max-width:128px}}._4ve_2a_openWithLabel{align-items:center;gap:8px;width:100%;min-width:0;display:flex}._4ve_2a_openWithName{text-overflow:ellipsis;white-space:nowrap;flex:auto;min-width:0;overflow:hidden}._4ve_2a_openWithChevron{color:var(--dsw-alias-label-tertiary);flex:none}._4ve_2a_openWithPin{width:20px;height:20px;color:var(--dsw-alias-label-tertiary);cursor:pointer;border-radius:6px;flex:none;justify-content:center;align-items:center;display:inline-flex}._4ve_2a_openWithPin:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}._4ve_2a_openWithPinActive{color:var(--dsw-alias-state-business-primary)}";
		const tagId$4 = "dsh-better-sidebar/sidebar.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$4) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-better-sidebar";
			tag.dataset.pluginCss = tagId$4;
			tag.textContent = css$4;
			document.head.appendChild(tag);
		}
		var sidebar_module_css_default = {
			"editorTitle": "_4ve_2a_editorTitle",
			"editorCmHidden": "_4ve_2a_editorCmHidden",
			"gitDiffTabTitle": "_4ve_2a_gitDiffTabTitle",
			"dividerCol": "_4ve_2a_dividerCol",
			"selectionPopup": "_4ve_2a_selectionPopup",
			"editorModeActive": "_4ve_2a_editorModeActive",
			"editorTreeSearch": "_4ve_2a_editorTreeSearch",
			"mermaidCopy": "_4ve_2a_mermaidCopy",
			"editorHeader": "_4ve_2a_editorHeader",
			"gitDiffFileOld": "_4ve_2a_gitDiffFileOld",
			"editorTreePanelFull": "_4ve_2a_editorTreePanelFull",
			"uploadOverlay": "_4ve_2a_uploadOverlay",
			"gitConfirmDesc": "_4ve_2a_gitConfirmDesc",
			"tabBarPlus": "_4ve_2a_tabBarPlus",
			"browserBlockedTitle": "_4ve_2a_browserBlockedTitle",
			"panelBody": "_4ve_2a_panelBody",
			"editorPdfToolbar": "_4ve_2a_editorPdfToolbar",
			"explorerName": "_4ve_2a_explorerName",
			"browserBlocked": "_4ve_2a_browserBlocked",
			"git": "_4ve_2a_git",
			"mermaidModalButton": "_4ve_2a_mermaidModalButton",
			"gitSectionHeader": "_4ve_2a_gitSectionHeader",
			"gitLogSubject": "_4ve_2a_gitLogSubject",
			"editorBack": "_4ve_2a_editorBack",
			"sandboxStatus": "_4ve_2a_sandboxStatus",
			"boundaryError": "_4ve_2a_boundaryError",
			"terminal": "_4ve_2a_terminal",
			"browserBar": "_4ve_2a_browserBar",
			"gitDiffHunkSection": "_4ve_2a_gitDiffHunkSection",
			"dirtyDot": "_4ve_2a_dirtyDot",
			"gitCommit": "_4ve_2a_gitCommit",
			"openWithPinActive": "_4ve_2a_openWithPinActive",
			"browserBlockedDesc": "_4ve_2a_browserBlockedDesc",
			"explorerIconMd": "_4ve_2a_explorerIconMd",
			"gitDiffFileChevronExpanded": "_4ve_2a_gitDiffFileChevronExpanded",
			"paneDrop": "_4ve_2a_paneDrop",
			"splitChild": "_4ve_2a_splitChild",
			"browserInput": "_4ve_2a_browserInput",
			"terminalBannerUrl": "_4ve_2a_terminalBannerUrl",
			"sandboxAction": "_4ve_2a_sandboxAction",
			"tab": "_4ve_2a_tab",
			"gitRow": "_4ve_2a_gitRow",
			"split": "_4ve_2a_split",
			"dropUp": "_4ve_2a_dropUp",
			"uploadOverlayCancel": "_4ve_2a_uploadOverlayCancel",
			"gitDiffExpand": "_4ve_2a_gitDiffExpand",
			"paneCard": "_4ve_2a_paneCard",
			"uploadDropZone": "_4ve_2a_uploadDropZone",
			"mermaidInfo": "_4ve_2a_mermaidInfo",
			"editorDocxZoomRange": "_4ve_2a_editorDocxZoomRange",
			"uploadDropZoneText": "_4ve_2a_uploadDropZoneText",
			"editorImage": "_4ve_2a_editorImage",
			"openWithChevron": "_4ve_2a_openWithChevron",
			"openWithName": "_4ve_2a_openWithName",
			"explorerBroken": "_4ve_2a_explorerBroken",
			"uploadOverlayProgress": "_4ve_2a_uploadOverlayProgress",
			"browserFrame": "_4ve_2a_browserFrame",
			"gitDiffTabHeader": "_4ve_2a_gitDiffTabHeader",
			"explorerRailCollapsed": "_4ve_2a_explorerRailCollapsed",
			"bottomResizeActive": "_4ve_2a_bottomResizeActive",
			"terminalBanner": "_4ve_2a_terminalBanner",
			"bottomPanel": "_4ve_2a_bottomPanel",
			"terminalDepsTitle": "_4ve_2a_terminalDepsTitle",
			"gitLogLine1": "_4ve_2a_gitLogLine1",
			"tabBar": "_4ve_2a_tabBar",
			"gitDiffCtx": "_4ve_2a_gitDiffCtx",
			"editorTreeResize": "_4ve_2a_editorTreeResize",
			"editorError": "_4ve_2a_editorError",
			"dropLeft": "_4ve_2a_dropLeft",
			"editorBanner": "_4ve_2a_editorBanner",
			"editorPdf": "_4ve_2a_editorPdf",
			"panelResizeActive": "_4ve_2a_panelResizeActive",
			"explorerIconCss": "_4ve_2a_explorerIconCss",
			"paneTab": "_4ve_2a_paneTab",
			"openWithPin": "_4ve_2a_openWithPin",
			"gitLogMeta": "_4ve_2a_gitLogMeta",
			"explorer": "_4ve_2a_explorer",
			"editorModeButton": "_4ve_2a_editorModeButton",
			"panelResize": "_4ve_2a_panelResize",
			"mermaidError": "_4ve_2a_mermaidError",
			"mermaidHeader": "_4ve_2a_mermaidHeader",
			"gitDiffFileTag": "_4ve_2a_gitDiffFileTag",
			"sandboxStatusText": "_4ve_2a_sandboxStatusText",
			"gitDiffHunkHeader": "_4ve_2a_gitDiffHunkHeader",
			"pane": "_4ve_2a_pane",
			"browser": "_4ve_2a_browser",
			"mermaidModalToolbar": "_4ve_2a_mermaidModalToolbar",
			"editorPlaceholder": "_4ve_2a_editorPlaceholder",
			"mermaidCode": "_4ve_2a_mermaidCode",
			"gitLogMore": "_4ve_2a_gitLogMore",
			"explorerRailTitle": "_4ve_2a_explorerRailTitle",
			"terminalDepsNote": "_4ve_2a_terminalDepsNote",
			"editorPathInput": "_4ve_2a_editorPathInput",
			"editorBinaryNotice": "_4ve_2a_editorBinaryNotice",
			"gitDiffFilePath": "_4ve_2a_gitDiffFilePath",
			"gitDiffNum": "_4ve_2a_gitDiffNum",
			"explorerRail": "_4ve_2a_explorerRail",
			"explorerHidden": "_4ve_2a_explorerHidden",
			"dividerRow": "_4ve_2a_dividerRow",
			"uploadOverlayStatus": "_4ve_2a_uploadOverlayStatus",
			"editorMain": "_4ve_2a_editorMain",
			"editorSearchInput": "_4ve_2a_editorSearchInput",
			"gitError": "_4ve_2a_gitError",
			"editorTreeDock": "_4ve_2a_editorTreeDock",
			"editorPdfDragShieldActive": "_4ve_2a_editorPdfDragShieldActive",
			"producedMore": "_4ve_2a_producedMore",
			"paneEmptyCards": "_4ve_2a_paneEmptyCards",
			"explorerEmpty": "_4ve_2a_explorerEmpty",
			"toggleCluster": "_4ve_2a_toggleCluster",
			"explorerSymlink": "_4ve_2a_explorerSymlink",
			"explorerRailHeader": "_4ve_2a_explorerRailHeader",
			"gitDiffFile": "_4ve_2a_gitDiffFile",
			"editorPptxButton": "_4ve_2a_editorPptxButton",
			"uploadDropHero": "_4ve_2a_uploadDropHero",
			"editorStatus": "_4ve_2a_editorStatus",
			"tabTitle": "_4ve_2a_tabTitle",
			"mermaidBody": "_4ve_2a_mermaidBody",
			"gitDiff": "_4ve_2a_gitDiff",
			"bottomResize": "_4ve_2a_bottomResize",
			"explorerIconJs": "_4ve_2a_explorerIconJs",
			"gitDiffHunk": "_4ve_2a_gitDiffHunk",
			"producedLabel": "_4ve_2a_producedLabel",
			"iconButton": "_4ve_2a_iconButton",
			"gitCommitButton": "_4ve_2a_gitCommitButton",
			"editorSearchResult": "_4ve_2a_editorSearchResult",
			"explorerRef": "_4ve_2a_explorerRef",
			"explorerRoot": "_4ve_2a_explorerRoot",
			"gitDiffAdd": "_4ve_2a_gitDiffAdd",
			"editorPdfStage": "_4ve_2a_editorPdfStage",
			"uploadDropChatHint": "_4ve_2a_uploadDropChatHint",
			"gitPlaceholder": "_4ve_2a_gitPlaceholder",
			"explorerIconFolder": "_4ve_2a_explorerIconFolder",
			"workbench": "_4ve_2a_workbench",
			"terminalRepairCommand": "_4ve_2a_terminalRepairCommand",
			"panel": "_4ve_2a_panel",
			"editorPdfFrameBlocked": "_4ve_2a_editorPdfFrameBlocked",
			"gitDiffCode": "_4ve_2a_gitDiffCode",
			"gitHeader": "_4ve_2a_gitHeader",
			"editorHtml": "_4ve_2a_editorHtml",
			"uploadOverlayProgressFill": "_4ve_2a_uploadOverlayProgressFill",
			"sandboxStatusOff": "_4ve_2a_sandboxStatusOff",
			"editorDownloadLink": "_4ve_2a_editorDownloadLink",
			"gitEmpty": "_4ve_2a_gitEmpty",
			"explorerError": "_4ve_2a_explorerError",
			"gitLogHash": "_4ve_2a_gitLogHash",
			"paneTabHidden": "_4ve_2a_paneTabHidden",
			"editorTreePanel": "_4ve_2a_editorTreePanel",
			"editorBinary": "_4ve_2a_editorBinary",
			"dsh-row-in": "_4ve_2a_dsh-row-in",
			"panelHidden": "_4ve_2a_panelHidden",
			"dropDown": "_4ve_2a_dropDown",
			"gitDiffMetaText": "_4ve_2a_gitDiffMetaText",
			"orphanedType": "_4ve_2a_orphanedType",
			"editorSearchHint": "_4ve_2a_editorSearchHint",
			"bottomClose": "_4ve_2a_bottomClose",
			"gitRowMain": "_4ve_2a_gitRowMain",
			"uploadDropChatCard": "_4ve_2a_uploadDropChatCard",
			"editorPdfDragShield": "_4ve_2a_editorPdfDragShield",
			"browserMessage": "_4ve_2a_browserMessage",
			"gitRowSelected": "_4ve_2a_gitRowSelected",
			"gitDiffLine": "_4ve_2a_gitDiffLine",
			"openWithLabel": "_4ve_2a_openWithLabel",
			"explorerIconImage": "_4ve_2a_explorerIconImage",
			"mermaidModalStage": "_4ve_2a_mermaidModalStage",
			"gitBranchSelect": "_4ve_2a_gitBranchSelect",
			"producedRow": "_4ve_2a_producedRow",
			"producedChip": "_4ve_2a_producedChip",
			"uploadDropZonePill": "_4ve_2a_uploadDropZonePill",
			"tabBadge": "_4ve_2a_tabBadge",
			"splitCol": "_4ve_2a_splitCol",
			"uploadOverlayTitle": "_4ve_2a_uploadOverlayTitle",
			"sandboxStatusOn": "_4ve_2a_sandboxStatusOn",
			"browserBlockedButton": "_4ve_2a_browserBlockedButton",
			"explorerCopied": "_4ve_2a_explorerCopied",
			"dropOverlay": "_4ve_2a_dropOverlay",
			"mermaidModal": "_4ve_2a_mermaidModal",
			"paneContent": "_4ve_2a_paneContent",
			"tabList": "_4ve_2a_tabList",
			"terminalDepsHint": "_4ve_2a_terminalDepsHint",
			"explorerIconTs": "_4ve_2a_explorerIconTs",
			"terminalRetry": "_4ve_2a_terminalRetry",
			"cornerHandle": "_4ve_2a_cornerHandle",
			"splitRow": "_4ve_2a_splitRow",
			"explorerRow": "_4ve_2a_explorerRow",
			"explorerDir": "_4ve_2a_explorerDir",
			"terminalDepsBanner": "_4ve_2a_terminalDepsBanner",
			"gitLogRef": "_4ve_2a_gitLogRef",
			"editorImageWrap": "_4ve_2a_editorImageWrap",
			"editor": "_4ve_2a_editor",
			"gitDiffTab": "_4ve_2a_gitDiffTab",
			"dropRight": "_4ve_2a_dropRight",
			"explorerBody": "_4ve_2a_explorerBody",
			"explorerRowDropTarget": "_4ve_2a_explorerRowDropTarget",
			"tabBarDrop": "_4ve_2a_tabBarDrop",
			"dropCenter": "_4ve_2a_dropCenter",
			"explorerIconHtml": "_4ve_2a_explorerIconHtml",
			"editorStatusError": "_4ve_2a_editorStatusError",
			"terminalWrap": "_4ve_2a_terminalWrap",
			"explorerHeader": "_4ve_2a_explorerHeader",
			"mermaidModalHint": "_4ve_2a_mermaidModalHint",
			"gitDiffFileChevron": "_4ve_2a_gitDiffFileChevron",
			"editorTreeToggleActive": "_4ve_2a_editorTreeToggleActive",
			"editorBody": "_4ve_2a_editorBody",
			"sandboxDot": "_4ve_2a_sandboxDot",
			"editorModeToggle": "_4ve_2a_editorModeToggle",
			"explorerIconJson": "_4ve_2a_explorerIconJson",
			"gitSection": "_4ve_2a_gitSection",
			"dividerActive": "_4ve_2a_dividerActive",
			"gitDiffDel": "_4ve_2a_gitDiffDel",
			"gitName": "_4ve_2a_gitName",
			"gitLogLine2": "_4ve_2a_gitLogLine2",
			"terminalDepsCommandRow": "_4ve_2a_terminalDepsCommandRow",
			"editorMd": "_4ve_2a_editorMd",
			"gitCommitInput": "_4ve_2a_gitCommitInput",
			"browserBlockedActions": "_4ve_2a_browserBlockedActions",
			"mermaidWrap": "_4ve_2a_mermaidWrap",
			"tabBoundaryError": "_4ve_2a_tabBoundaryError",
			"editorCm": "_4ve_2a_editorCm",
			"terminalDepsActions": "_4ve_2a_terminalDepsActions",
			"gitDiffMeta": "_4ve_2a_gitDiffMeta",
			"bottomPanelHidden": "_4ve_2a_bottomPanelHidden",
			"mermaidMarkdown": "_4ve_2a_mermaidMarkdown",
			"toggleButton": "_4ve_2a_toggleButton",
			"tabActive": "_4ve_2a_tabActive",
			"editorPdfFrame": "_4ve_2a_editorPdfFrame",
			"tabClose": "_4ve_2a_tabClose",
			"gitBadge": "_4ve_2a_gitBadge",
			"uploadOverlayCard": "_4ve_2a_uploadOverlayCard",
			"browserStart": "_4ve_2a_browserStart",
			"divider": "_4ve_2a_divider",
			"gitLogRow": "_4ve_2a_gitLogRow",
			"gitLink": "_4ve_2a_gitLink"
		};
		//#endregion
		//#region src/client/intercept.tsx
		/**
		* Interception of the chat's produced-files row: the turn-tail chain entry
		* that replaces ui-deliverables' row when the closing turn produced files.
		* The takeover looks identical (same chip row); the chips open the file in
		* the sidebar instead of the host OS. Priority -1 runs before the default-0
		* deliverables entry; when nothing was produced the selector returns null
		* and the original row renders unchanged.
		*/
		/** Open a file in the sidebar's editor (used by the intercepted row and the explorer). */
		function openSidebarFile(ctx, store, sessionId, path) {
			const summary = ctx.sessions.list.getSnapshot().byId[sessionId];
			const absolute = resolveSidebarPath(summary?.cwd, path);
			const at = Math.max(absolute.lastIndexOf("/"), absolute.lastIndexOf("\\"));
			const title = at === -1 ? absolute : absolute.slice(at + 1);
			ctx.betterSidebar?.openTab({
				type: "editor",
				title,
				path: absolute,
				id: `editor:${absolute}`
			});
		}
		/** The intercepted produced-files row (visual twin of the deliverables chips). */
		function SidebarProducedFiles(props) {
			const { matched, openInSidebar } = props;
			const shown = matched.slice(0, 6);
			const hidden = matched.length - shown.length;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: sidebar_module_css_default.producedRow,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: sidebar_module_css_default.producedLabel,
						children: t("produced")
					}),
					shown.map((path) => {
						const at = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
						const name = at === -1 ? path : path.slice(at + 1);
						return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: sidebar_module_css_default.producedChip,
							title: path,
							onClick: () => {
								openInSidebar(path);
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCodeOutline16, { size: 12 }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: name })]
						}, path);
					}),
					hidden > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: sidebar_module_css_default.producedMore,
						children: ["+", hidden]
					})
				]
			});
		}
		/**
		* Register the turn-tail interception (returns the disposer).
		*
		* The slot is a CHILD slot the host's ui-conversation declares in its
		* `conversation.chat.node` children table (kind: chain, scope: session).
		* Registering it directly races the declaration — the ui-slots core's
		* load-time validation throws "not declared (a parent entry's children
		* table must declare it)" when the parent entry is not on the ledger yet.
		* slots.inject waits for the declaration: the callback runs synchronously
		* when the slot is already declared, otherwise it runs inside the declaring
		* register() call once the declaration commits; declaration collapse
		* disposes the entry and a later declaration re-registers it. This mirrors
		* @deepseek-ai/dsh-client-ui-deliverables' registration of the same slot.
		*/
		function registerTurnTailInterception(ctx, store) {
			return ctx.slots.inject("conversation.chat.turnTail", () => ctx.slots.register({
				name: "conversation.chat.turnTail",
				select: (owner) => {
					if (store.getSuspended()) return null;
					if (store.getPrefs().tabsEnabled["editor"] === false) return null;
					return selectProducedFiles(owner);
				},
				priority: -1,
				registrant: "dsh-better-sidebar",
				inject: (sessionId) => ({ openInSidebar: (path) => {
					openSidebarFile(ctx, store, sessionId, path);
				} })
			}, SidebarProducedFiles));
		}
		/**
		* Register the chat file-open interception for the LEGACY funnel: wraps
		* `ctx.workspaces.openPath` (the older snapshot's single door). Gated by BOTH
		* the `interceptOpenPath` pref and the editor tab's enable switch; declined
		* opens fall through to the original method. Returns the disposer restoring
		* the original (HMR-safe).
		*/
		function registerOpenPathInterception(ctx, store) {
			return wrapOpenPath(ctx.workspaces, openPathDeps(ctx, store));
		}
		/** Shared per-call takeover decisions for both file-open funnels. */
		function openPathDeps(ctx, store) {
			return {
				takeoverEnabled: () => !store.getSuspended() && store.getPrefs().interceptOpenPath !== false && store.getPrefs().tabsEnabled["editor"] !== false,
				currentSessionId: () => ctx.sessions.list.getSnapshot().current,
				openInSidebar: (path, sessionId) => {
					openSidebarFile(ctx, store, sessionId, path);
				}
			};
		}
		/** Resolve the remote `session` namespace service (undefined before the
		*  api-remotes contribution mounts, or when the runtime lacks the typed
		*  remote entirely). The namespace is a DISTINCT cordis service key
		*  (`remote.session`) — not a `.session` property on the `remote` service —
		*  so resolve it directly. */
		function remoteSessionOf(ctx) {
			try {
				const session = ctx.get("remote.session");
				if (session !== void 0 && typeof session.openWorkspacePath === "function") return session;
			} catch {}
			try {
				const session = ctx.get("remote")?.session;
				if (session !== void 0 && typeof session.openWorkspacePath === "function") return session;
			} catch {}
		}
		/**
		* Register the chat file-open interception for the CURRENT funnel: wraps
		* `ctx.remote.session.openWorkspacePath` — the method DSH 0.1.x chat routes
		* every file open through (ui-chat's conversation.view `openFile`). The
		* remote `session` namespace is mounted asynchronously by the api-remotes
		* contribution, so the wrap retries briefly until the method appears and
		* gives up silently if the runtime never exposes it (the legacy wrap is the
		* fallback). Gated by the same prefs as the legacy funnel. Returns the
		* disposer cancelling the retry and restoring the original (HMR-safe).
		*/
		function registerRemoteOpenPathInterception(ctx, store) {
			let disposed = false;
			let disposer;
			let timer;
			let attempts = 0;
			const tryWrap = () => {
				if (disposed) return;
				const session = remoteSessionOf(ctx);
				if (session === void 0 || typeof session.openWorkspacePath !== "function") {
					attempts += 1;
					if (attempts < 50) timer = setTimeout(tryWrap, 100);
					return;
				}
				disposer = wrapRemoteOpenWorkspacePath(session, openPathDeps(ctx, store));
			};
			tryWrap();
			return () => {
				disposed = true;
				if (timer !== void 0) clearTimeout(timer);
				disposer?.();
			};
		}
		//#endregion
		//#region node_modules/.pnpm/clsx@2.1.1/node_modules/clsx/dist/clsx.mjs
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
		//#region src/client/api.ts
		/** One wire failure. */
		var SidebarApiError = class extends Error {
			code;
			constructor(code, message) {
				super(message);
				this.code = code;
			}
		};
		async function call(method, payload, signal) {
			let response;
			try {
				response = await fetch(`/sidebar/api/${method}`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(payload),
					signal
				});
			} catch (error) {
				throw new SidebarApiError("network", error instanceof Error ? error.message : String(error));
			}
			const parsed = await response.json().catch(() => null);
			if (!response.ok || parsed === null || parsed.ok !== true || parsed.value === void 0) throw new SidebarApiError(parsed?.error?.code ?? "http", parsed?.error?.message ?? `HTTP ${response.status}`);
			return parsed.value;
		}
		/**
		* Upload one file to the sidebar's raw upload route: the File goes straight
		* into the POST body (no JSON/base64 re-encoding — the host streams it into
		* the workspace). Failure surfaces as {@link SidebarApiError} with the wire
		* code, exactly like every `/sidebar/api` call. An aborted `signal` rejects
		* with the DOMException as-is (the caller decides whether that is an error).
		*/
		async function fetchUpload(scope, dir, relativePath, body, signal) {
			const params = new URLSearchParams({
				sessionId: scope.sessionId,
				dir,
				relativePath
			});
			if (scope.cwd !== void 0 && scope.cwd !== "") params.set("cwd", scope.cwd);
			let response;
			try {
				response = await fetch(`/sidebar/upload?${params.toString()}`, {
					method: "POST",
					headers: { "content-type": "application/octet-stream" },
					body,
					signal
				});
			} catch (error) {
				if (error instanceof DOMException && error.name === "AbortError") throw error;
				throw new SidebarApiError("network", error instanceof Error ? error.message : String(error));
			}
			const parsed = await response.json().catch(() => null);
			if (!response.ok || parsed === null || parsed.ok !== true || parsed.value === void 0) throw new SidebarApiError(parsed?.error?.code ?? "http", parsed?.error?.message ?? `HTTP ${response.status}`);
			return parsed.value;
		}
		/** Fold a scope into a JSON payload ({cwd} only when present). */
		function scopePayload(scope, extra) {
			return {
				sessionId: scope.sessionId,
				...scope.cwd !== void 0 && scope.cwd !== "" ? { cwd: scope.cwd } : {},
				...extra
			};
		}
		/** The sidebar API surface (session scope threaded through every call). */
		const api = {
			sessionCwd: (scope, signal) => call("session.cwd", scopePayload(scope, {}), signal),
			fsTree: (scope, path, signal) => call("fs.tree", scopePayload(scope, { path }), signal),
			/** Global recursive file-name search rooted at the session cwd (the editor
			*  side panel's search box); matches are cwd-relative '/'-separated paths. */
			fsSearch: (scope, query, signal) => call("fs.search", scopePayload(scope, { query }), signal),
			fsRead: (scope, path, signal) => call("fs.read", scopePayload(scope, { path }), signal),
			fsWrite: (scope, path, content) => call("fs.write", scopePayload(scope, {
				path,
				content
			})),
			/** Upload one file's raw bytes into `dir` (keeps the folder tree via
			*  `relativePath`); the host streams it under the session workspace. */
			uploadFile: (scope, dir, relativePath, body, signal) => fetchUpload(scope, dir, relativePath, body, signal),
			gitStatus: (scope, signal) => call("git.status", scopePayload(scope, {}), signal),
			gitDiff: (scope, path, staged, signal) => call("git.diff", scopePayload(scope, {
				...path !== void 0 ? { path } : {},
				staged
			}), signal),
			gitStage: (scope, path) => call("git.stage", scopePayload(scope, { ...path !== void 0 ? { path } : {} })),
			gitUnstage: (scope, path) => call("git.unstage", scopePayload(scope, { ...path !== void 0 ? { path } : {} })),
			gitCommit: (scope, message) => call("git.commit", scopePayload(scope, { message })),
			gitBranch: (scope, signal) => call("git.branch", scopePayload(scope, {}), signal),
			gitCheckout: (scope, branch) => call("git.checkout", scopePayload(scope, { branch })),
			/** Recent commit history, lazily pageable (skip/count; defaults 0/30). */
			gitLog: (scope, count, skip, signal) => call("git.log", scopePayload(scope, {
				...count !== void 0 ? { count } : {},
				...skip !== void 0 ? { skip } : {}
			}), signal),
			/** Full patch text of one commit (diff display for the history rows). */
			gitCommitDiff: (scope, hash, signal) => call("git.commit-diff", scopePayload(scope, { hash }), signal),
			/** Discard the worktree changes of one file (the index is untouched). */
			gitDiscard: (scope, path) => call("git.discard", scopePayload(scope, { path })),
			/** Revert one commit onto the current branch. */
			gitRevert: (scope, hash) => call("git.revert", scopePayload(scope, { hash })),
			/** Cherry-pick one commit onto the current branch. */
			gitCherryPick: (scope, hash) => call("git.cherry-pick", scopePayload(scope, { hash })),
			/** Release a terminal's process immediately (tab closed; the WS close frame
			*  may be unreachable while the socket is down, so the host also accepts
			*  this explicit route). */
			ptyClose: (scope, tab) => call("pty.close", scopePayload(scope, { tab })),
			/** Release an agent terminal by uuid (tab closed while WS was down). */
			agentPtyClose: (uuid) => call("agent-pty.close", { uuid }),
			/** Terminal dependency status (issue #140): after a WS close 1011 with
			*  reason `pty-deps-missing` the view fetches the full repair details here
			*  (the close reason itself is capped at 123 bytes). */
			terminalDeps: () => call("terminal.deps", {}),
			/**
			* The output the model has read so far for one background job (replayed
			* from the owner session's event log — never the model's job_output
			* cursor). The scope MUST be the job's OWNER session.
			*/
			jobOutput: (scope, id, signal) => call("jobs.output", scopePayload(scope, { id }), signal),
			/** Request cancellation of one background job (live jobs flip to stopping). */
			jobKill: (scope, id, reason) => call("jobs.kill", scopePayload(scope, {
				id,
				...reason !== void 0 ? { reason } : {}
			})),
			/**
			* One batch live-preview fetch for the whole Subagent tree. The payload is
			* the already-resolved topology ROOT (not a session scope); the host
			* enumerates descendants once and folds running children's activity.
			*/
			subagentsLive: (rootSessionId, signal) => call("subagents.live", { rootSessionId }, signal),
			/** Create a Side Chat thread: a child session seeded with the parent's
			*  full log up to now. Empty question = immediate create (Codex-style):
			*  the thread opens empty, the first prompt carries the boundary. */
			sidechatStart: (sessionId, question) => call("sidechat.start", {
				sessionId,
				question: question ?? ""
			}),
			/** Deliver one follow-up message to a Side Chat thread. */
			sidechatPrompt: (childId, text) => call("sidechat.prompt", {
				childId,
				text
			}),
			/** Abort a Side Chat thread's running turn (queued work is preserved). */
			sidechatCancel: (childId) => call("sidechat.cancel", { childId }),
			/** Release a Side Chat thread's live agent (history stays persisted). */
			sidechatDispose: (childId) => call("sidechat.dispose", { childId }),
			/** Live state + agent identity (provider/model/preset) of a thread. */
			sidechatInfo: (childId) => call("sidechat.info", { childId }),
			/** The effective terminal shell and its display name (plugin-global). */
			shellGet: () => call("shell.get", {}),
			/** Read the side card preferences (plugin-global, no session scope). */
			settingsGet: () => call("settings.get", {}),
			/** Merge a patch into the side card preferences (revision-guarded). */
			settingsUpdate: (patch, expectedRevision) => call("settings.update", {
				patch,
				...expectedRevision !== void 0 ? { expectedRevision } : {}
			}),
			/** Probe a URL's response headers (the sidebar browser's embeddability
			*  check; see the host's browser.probe route). */
			browserProbe: (url, signal) => call("browser.probe", { url }, signal),
			/** External open for the file tree's "open with" menu: reveal a path in
			*  the OS file manager, or hand a custom-scheme URL (vscode://, cursor://,
			*  zed://, custom editors) to its registered handler. The host launches
			*  the platform opener (argv, no shell). */
			openExternal: (payload) => call("open.external", payload)
		};
		/** Absolute URL of the media route for one path (images only). */
		function mediaUrl(scope, path) {
			return fileUrl(scope, path, false);
		}
		/** Absolute URL of the download route: serves raw bytes (binary-safe) with
		*  `Content-Disposition: attachment`, so the browser saves the file. */
		function downloadUrl(scope, path) {
			return fileUrl(scope, path, true);
		}
		/** Shared URL builder for the /sidebar/file route (media vs download). */
		function fileUrl(scope, path, download) {
			const params = new URLSearchParams({
				sessionId: scope.sessionId,
				path
			});
			if (scope.cwd !== void 0 && scope.cwd !== "") params.set("cwd", scope.cwd);
			if (download) params.set("download", "1");
			return `/sidebar/file?${params.toString()}`;
		}
		//#endregion
		//#region src/client/binary-download.tsx
		function BinaryDownload(props) {
			const { scope, path } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: sidebar_module_css_default.editorBinary,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: sidebar_module_css_default.editorBinaryNotice,
					children: t("binaryNoPreview")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
					className: sidebar_module_css_default.editorDownloadLink,
					href: downloadUrl(scope, path),
					download: true,
					children: t("downloadToView")
				})]
			});
		}
		//#endregion
		//#region src/client/editor-load.ts
		/** Decode the host's base64 head bytes into the sniffing buffer. */
		function decodeHead(headBase64) {
			const binary = atob(headBase64);
			const bytes = new Uint8Array(binary.length);
			for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
			return bytes;
		}
		/**
		* Dispatch one matched viewer's fetchStrategy. A missing viewer or a
		* `binary-download` strategy both mean "no client-side renderer" → the
		* download UI. `mediaUrlOf` builds the media URL for `mediaUrl`/`none`
		* strategies (pure, but scope-bound — injected by the host).
		*/
		function planFirstMatch(viewer, mediaUrlOf) {
			if (viewer === void 0 || viewer.fetchStrategy === "binary-download") return { kind: "binary" };
			switch (viewer.fetchStrategy) {
				case "mediaUrl":
				case "none": return {
					kind: "render",
					viewer,
					mediaUrl: mediaUrlOf()
				};
				case "custom": return {
					kind: "customLoad",
					viewer
				};
				case "fsRead": return {
					kind: "fetchFsRead",
					viewer
				};
			}
		}
		/**
		* Decide what an fsRead result means for the editor.
		* - Text: the first match stands (content is valid for any fsRead viewer).
		* - Binary: the host head bytes enable a re-match — a `detect` viewer (e.g.
		*   a plugin sniffing a binary format) may claim the file. `custom` viewers
		*   load their own bytes; `mediaUrl`/`none` viewers render the media route;
		*   an fsRead viewer or nothing cannot render binary → download UI.
		*/
		function planFsReadOutcome(viewer, result, rematch, mediaUrlOf) {
			if (!result.binary) return {
				kind: "render",
				viewer,
				content: result.content,
				truncated: result.truncated
			};
			const claimed = result.head === void 0 ? void 0 : rematch(decodeHead(result.head));
			if (claimed !== void 0 && claimed.fetchStrategy === "custom") return {
				kind: "customLoad",
				viewer: claimed
			};
			if (claimed !== void 0 && (claimed.fetchStrategy === "mediaUrl" || claimed.fetchStrategy === "none")) return {
				kind: "render",
				viewer: claimed,
				mediaUrl: mediaUrlOf()
			};
			return { kind: "binary" };
		}
		//#endregion
		//#region src/client/EditorHost.tsx
		/**
		* The editor tab host: the FILE VIEWER for one path. It resolves the file's
		* previewer through the sidebar registry (`matchFileViewer`), fetches bytes
		* per the matched viewer's fetch strategy, and renders its component — or the
		* shared download pane when nothing can render the file.
		*
		* The file tree is no longer hosted here: it is the persistent Explorer rail
		* that lives to the LEFT of the workbench (see ExplorerRail.tsx), decoupled
		* from any tab. So every editor tab carries a real path and renders only the
		* viewer chrome (a path-less tab — a leftover from an older layout the store
		* drops on load — still degrades to the empty-state hint instead of the load
		* flow, so a stale frame never crashes).
		*
		* The path input's Enter routes through `openSidebarFile`, the SAME per-path
		* dedupe open the rail uses: a run of opens accumulates distinct tabs and
		* never replaces one already open (no transient preview slot).
		*
		* The strategy dispatch is pure (planFirstMatch / planFsReadOutcome in
		* editor-load.ts); this component only wires it to the host APIs.
		*/
		function EditorHost(props) {
			const { ctx, store, scope, tab } = props;
			const path = tab.path ?? "";
			const title = tab.title;
			const [load, setLoad] = (0, react.useState)({ status: "loading" });
			const [attempt, setAttempt] = (0, react.useState)(0);
			const failCountRef = (0, react.useRef)(0);
			const failKeyRef = (0, react.useRef)("");
			const loadRef = (0, react.useRef)(load);
			loadRef.current = load;
			const visible = props.visible !== false;
			const prevVisibleRef = (0, react.useRef)(visible);
			(0, react.useEffect)(() => {
				if (!prevVisibleRef.current && visible && loadRef.current.status === "error") setAttempt((a) => a + 1);
				prevVisibleRef.current = visible;
			}, [visible]);
			const showEmpty = path === "";
			/** The header path input's Enter open: the SAME per-path dedupe tab the tree
			*  rail uses, so it focuses an existing tab or appends a new one — never a
			*  preview replacement. */
			const openFile = (absolute) => {
				openSidebarFile(ctx, store, scope.sessionId, absolute);
			};
			const [toolbar, setToolbar] = (0, react.useState)(null);
			const controlsRef = (0, react.useRef)(null);
			const onToolbarState = (0, react.useCallback)((next) => {
				setToolbar((prev) => prev !== null && JSON.stringify(prev) === JSON.stringify(next) ? prev : next);
			}, []);
			const onToolbarControls = (0, react.useCallback)((controls) => {
				controlsRef.current = controls;
			}, []);
			(0, react.useEffect)(() => {
				setToolbar(null);
				if (showEmpty) return;
				let cancelled = false;
				let retryTimer;
				const controller = new AbortController();
				setLoad({ status: "loading" });
				const succeed = () => {
					failCountRef.current = 0;
				};
				const fail = (error) => {
					if (cancelled) return;
					const retryable = error instanceof SidebarApiError && (error.code === "network" || error.code === "http");
					const key = `${scope.sessionId}|${path}`;
					if (failKeyRef.current !== key) {
						failKeyRef.current = key;
						failCountRef.current = 0;
					}
					setLoad({
						status: "error",
						message: error instanceof Error ? error.message : String(error),
						retryable,
						autoAttempt: retryable ? failCountRef.current + 1 : void 0
					});
					if (retryable) {
						failCountRef.current += 1;
						retryTimer = window.setTimeout(() => {
							if (!cancelled) setAttempt((a) => a + 1);
						}, nextDelayMs(failCountRef.current));
					}
				};
				const mediaUrlOf = () => mediaUrl(scope, path);
				const apply = (action) => {
					if (cancelled) return;
					switch (action.kind) {
						case "binary":
							succeed();
							setLoad({ status: "binary" });
							return;
						case "render":
							succeed();
							setLoad({
								status: "ready",
								viewer: action.viewer,
								content: action.content,
								truncated: action.truncated,
								mediaUrl: action.mediaUrl,
								customData: action.customData
							});
							return;
						case "customLoad":
							action.viewer.load?.(path, scope, controller.signal).then((data) => {
								if (cancelled) return;
								succeed();
								setLoad({
									status: "ready",
									viewer: action.viewer,
									customData: data
								});
							}).catch((error) => {
								if (cancelled) return;
								fail(error);
							});
							return;
						case "fetchFsRead":
							api.fsRead(scope, path).then((result) => {
								if (cancelled) return;
								succeed();
								const outcome = planFsReadOutcome(action.viewer, {
									binary: result.kind === "binary",
									content: result.kind === "text" ? result.content : "",
									truncated: result.truncated,
									head: result.kind === "binary" ? result.head : void 0
								}, (head) => ctx.betterSidebar?.matchFileViewer(path, head), mediaUrlOf);
								apply(outcome);
							}).catch((error) => {
								if (cancelled) return;
								fail(error);
							});
							return;
					}
				};
				apply(planFirstMatch(ctx.betterSidebar?.matchFileViewer(path), mediaUrlOf));
				return () => {
					cancelled = true;
					if (retryTimer !== void 0) window.clearTimeout(retryTimer);
					controller.abort();
				};
			}, [
				scope.sessionId,
				scope.cwd,
				path,
				ctx,
				showEmpty,
				attempt
			]);
			const saveLabel = toolbar === null ? "" : toolbar.saveState === "saving" ? t("loading") : toolbar.saveState === "saved" ? t("saved") : toolbar.saveState === "failed" ? t("saveFailed") : "";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: sidebar_module_css_default.editor,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: sidebar_module_css_default.editorHeader,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(EditorPathInput, {
							path,
							cwd: scope.cwd,
							onOpen: openFile
						}, path),
						toolbar?.modes === true && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: sidebar_module_css_default.editorModeToggle,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: clsx(sidebar_module_css_default.editorModeButton, toolbar.mode === "preview" && sidebar_module_css_default.editorModeActive),
								onClick: () => {
									controlsRef.current?.setMode("preview");
								},
								children: t("preview")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: clsx(sidebar_module_css_default.editorModeButton, toolbar.mode === "edit" && sidebar_module_css_default.editorModeActive),
								onClick: () => {
									controlsRef.current?.setMode("edit");
								},
								children: t("edit")
							})]
						}),
						toolbar?.dirty === true && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: sidebar_module_css_default.dirtyDot,
							title: t("unsaved")
						}),
						toolbar?.editable === true && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: sidebar_module_css_default.iconButton,
							"aria-label": t("save"),
							title: `${t("save")} (Ctrl/Cmd+S)`,
							onClick: () => {
								controlsRef.current?.save();
							},
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCheckOutline16, { size: 14 })
						}),
						saveLabel !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: clsx(sidebar_module_css_default.editorStatus, toolbar?.saveState === "failed" && sidebar_module_css_default.editorStatusError),
							children: saveLabel
						})
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: sidebar_module_css_default.editorBody,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: sidebar_module_css_default.editorMain,
						children: [
							showEmpty && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: sidebar_module_css_default.editorPlaceholder,
								children: t("editorEmptyHint")
							}),
							!showEmpty && load.status === "loading" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: sidebar_module_css_default.editorPlaceholder,
								children: t("loading")
							}),
							!showEmpty && load.status === "error" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: sidebar_module_css_default.editorError,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: load.message }),
									load.autoAttempt !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("fsReadRetryWaiting", { n: load.autoAttempt }) }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: sidebar_module_css_default.terminalRetry,
										onClick: () => {
											setAttempt((a) => a + 1);
										},
										children: t("terminalRetry")
									})
								]
							}),
							!showEmpty && load.status === "binary" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BinaryDownload, {
								scope,
								path
							}),
							!showEmpty && load.status === "ready" && (0, react.createElement)(load.viewer.component, {
								ctx,
								store,
								scope,
								path,
								title,
								viewerId: load.viewer.id,
								content: load.content,
								truncated: load.truncated,
								mediaUrl: load.mediaUrl,
								customData: load.customData,
								toolbar: "host",
								onToolbarState,
								onToolbarControls
							})
						]
					})
				})]
			});
		}
		/**
		* The header's path input: shows the current file relative to the session
		* cwd (absolute when outside it). Enter resolves the typed path (relative
		* input joins onto the cwd — the same resolution `openSidebarFile` uses)
		* and opens it through the parent's per-path dedupe open. Escape/blur
		* restores the current value. The parent keys it by `path` so a re-open of
		* the same file remounts and reseeds the draft.
		*/
		function EditorPathInput(props) {
			const { path, cwd, onOpen } = props;
			const display = path === "" ? "" : relativeTo(cwd ?? "", path);
			const [value, setValue] = (0, react.useState)(display);
			const commit = () => {
				const input = value.trim();
				if (input === "" || input === display) {
					setValue(display);
					return;
				}
				onOpen(resolveSidebarPath(cwd, input));
				setValue(display);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
				className: sidebar_module_css_default.editorPathInput,
				value,
				placeholder: t("editorPathPlaceholder"),
				title: path,
				spellCheck: false,
				onChange: (event) => {
					setValue(event.target.value);
				},
				onKeyDown: (event) => {
					if (event.key === "Enter") {
						event.preventDefault();
						commit();
					} else if (event.key === "Escape") setValue(display);
				},
				onBlur: () => {
					setValue(display);
				}
			});
		}
		//#endregion
		//#region src/client/open-with.ts
		/** The default open-with configuration (fresh documents). */
		const OPEN_WITH_DEFAULTS = {
			sshHost: "",
			customEditors: [],
			pinned: []
		};
		/** The built-in open targets, in menu order. */
		const OPEN_WITH_BUILTINS = [
			{
				id: "explorer",
				nameKey: "openWithExplorer",
				name: "",
				kind: "reveal",
				isVscodeFamily: false,
				localOnly: true
			},
			{
				id: "vscode",
				nameKey: "openWithVscode",
				name: "",
				kind: "url",
				urlTemplate: "vscode://file/{path}",
				isVscodeFamily: true,
				localOnly: false
			},
			{
				id: "cursor",
				nameKey: "openWithCursor",
				name: "",
				kind: "url",
				urlTemplate: "cursor://file/{path}",
				isVscodeFamily: true,
				localOnly: false
			},
			{
				id: "zed",
				nameKey: "openWithZed",
				name: "",
				kind: "url",
				urlTemplate: "zed://file/{path}",
				isVscodeFamily: false,
				localOnly: true
			}
		];
		/** Whether a persisted value makes a structurally valid custom-editor row.
		*  Name/template may be empty — the settings panel edits rows in place and
		*  an in-progress row must survive the round-trip; the MENU hides rows that
		*  fail the stricter {@link isValidCustomEditor} check. */
		function isCustomEditor(value) {
			if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
			const record = value;
			return typeof record.id === "string" && record.id !== "" && typeof record.name === "string" && typeof record.urlTemplate === "string" && typeof record.isVscodeFamily === "boolean";
		}
		/**
		* Parse the persisted `openWith` blob (tolerant): malformed fields fall back
		* to the defaults, malformed custom-editor rows are dropped, and pinned ids
		* are kept verbatim (unknown ids are pruned when the targets are resolved —
		* the menu is the only consumer of the resolved list).
		*/
		function parseOpenWithConfig(raw) {
			if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return { ...OPEN_WITH_DEFAULTS };
			const record = raw;
			return {
				sshHost: typeof record.sshHost === "string" ? record.sshHost : "",
				customEditors: Array.isArray(record.customEditors) ? record.customEditors.filter(isCustomEditor) : [],
				pinned: Array.isArray(record.pinned) ? record.pinned.filter((id) => typeof id === "string" && id !== "") : []
			};
		}
		/** Whether a custom editor id belongs to this config (id prefix match). */
		function customIdOf(id) {
			return `custom:${id}`;
		}
		/**
		* The menu-visible open targets, in order (built-ins then custom editors).
		* In SSH mode the local-only targets (the OS file manager, Zed, custom
		* editors without the VSCode dialect) are dropped — they cannot reach a
		* remote path. Unknown pinned ids are pruned here too.
		*/
		function resolveOpenWithTargets(config) {
			const ssh = config.sshHost.trim() !== "";
			return [...OPEN_WITH_BUILTINS, ...config.customEditors.filter(isValidCustomEditor).map((editor) => ({
				id: customIdOf(editor.id),
				name: editor.name,
				kind: "url",
				urlTemplate: editor.urlTemplate,
				isVscodeFamily: editor.isVscodeFamily,
				localOnly: !editor.isVscodeFamily
			}))].filter((target) => !(ssh && target.localOnly));
		}
		/** The SSH hint appended to a target's label in remote mode. */
		function openWithSshActive(config) {
			return config.sshHost.trim() !== "";
		}
		/**
		* The URL to open for one resolved target, or undefined when the target has
		* no URL form (reveal) or the template is malformed. The path is inserted
		* RAW into the template (browsers percent-encode as needed; VSCode-family
		* URL parsers consume the absolute path with its leading slash, e.g.
		* `vscode://file//home/u/f.ts` or `vscode://file/C:/Users/u/f.ts`).
		*/
		function openWithUrl(target, path, config) {
			if (target.kind !== "url" || target.urlTemplate === void 0) return void 0;
			const normalized = normalizeUrlPath(path);
			if (openWithSshActive(config) && target.isVscodeFamily) {
				const scheme = schemeOf(target.urlTemplate);
				if (scheme === void 0) return void 0;
				return `${scheme}://vscode-remote/ssh-remote+${config.sshHost.trim()}${normalized}`;
			}
			if (!target.urlTemplate.includes("{path}") || !hasUrlScheme(target.urlTemplate)) return void 0;
			return target.urlTemplate.replace("{path}", normalized);
		}
		/** Whether a template starts with a `scheme://` prefix (the only shape the
		*  host's external opener accepts and the settings panel suggests). */
		function hasUrlScheme(template) {
			return /^[a-z][a-z0-9+.-]*:\/\//i.test(template);
		}
		/** The scheme of a URL template (the part before the first ':'), or undefined. */
		function schemeOf(template) {
			const at = template.indexOf(":");
			if (at <= 0) return void 0;
			const scheme = template.slice(0, at);
			return /^[a-z][a-z0-9+.-]*$/i.test(scheme) ? scheme : void 0;
		}
		/** Normalize a filesystem path for embedding in a URL (backslashes → '/'). */
		function normalizeUrlPath(path) {
			return path.replace(/\\/g, "/");
		}
		/** A fresh custom-editor id (uuid when available, time-based fallback). */
		function newCustomEditorId() {
			if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
			return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
		}
		/** Validate one custom-editor row before the settings panel accepts it. */
		function isValidCustomEditor(row) {
			return row.name.trim() !== "" && row.urlTemplate.includes("{path}") && /^[a-z][a-z0-9+.-]*:\/\//i.test(row.urlTemplate.trim());
		}
		//#endregion
		//#region \0dsh-css:C:\Users\delinger\Desktop\dsh\dsh-desktop\assets\plugins\dsh-better-sidebar\src\client\SideCardSection.module.css.mjs
		const css$3 = ".JX67oW_section{flex-direction:column;gap:16px;width:100%;max-width:760px;display:flex}.JX67oW_intro{color:var(--dsw-alias-label-tertiary);margin:0;padding:0 2px;font-size:13px;line-height:20px}.JX67oW_group{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:16px;flex-direction:column;flex:none;gap:8px;padding:20px;display:flex}.JX67oW_groupHeading{color:var(--dsw-alias-label-primary);align-items:baseline;gap:7px;padding:0 2px 6px;font-size:13px;font-weight:600;line-height:20px;display:flex}.JX67oW_count{background:var(--dsw-alias-accent-soft,var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;border-radius:999px;padding:1px 8px;font-size:11px;font-weight:500;line-height:16px}.JX67oW_grid{grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;display:grid}.JX67oW_card{border:1px solid var(--dsw-alias-border-l2);min-height:106px;font:inherit;color:inherit;cursor:pointer;background:0 0;border-radius:12px;flex-direction:column;transition:background .12s,border-color .12s;display:flex;position:relative;overflow:hidden}.JX67oW_card:not(.JX67oW_cardOn):hover{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-label-dimmed)}.JX67oW_cardOn{border-color:color-mix(in srgb, var(--dsw-alias-button-primary-fill) 45%, transparent);background:var(--dsw-alias-interactive-bg-active)}.JX67oW_cardMain{border-radius:inherit;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;flex-direction:column;flex:1;gap:6px;padding:12px;display:flex}.JX67oW_cardMain:focus-visible,.JX67oW_cardSettings:focus-visible,.JX67oW_rowGear:focus-visible{outline:2px solid var(--dsw-alias-border-l4);outline-offset:2px}.JX67oW_cardTop{align-items:center;gap:8px;min-width:0;min-height:28px;display:flex}.JX67oW_cardIconChip{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);width:28px;height:28px;color:var(--dsw-alias-label-tertiary);border-radius:8px;flex:none;justify-content:center;align-items:center;display:inline-flex}.JX67oW_cardOn .JX67oW_cardIconChip{border-color:color-mix(in srgb, var(--dsw-alias-button-primary-fill) 35%, transparent);background:color-mix(in srgb, var(--dsw-alias-button-primary-fill) 12%, transparent);color:var(--dsw-alias-button-primary-fill)}.JX67oW_cardTitle{min-width:0;color:var(--dsw-alias-label-secondary);white-space:nowrap;text-overflow:ellipsis;flex:1;font-size:13px;font-weight:600;line-height:20px;overflow:hidden}.JX67oW_cardOn .JX67oW_cardTitle{color:var(--dsw-alias-label-primary)}.JX67oW_cardSwitch{flex:none;align-items:center;display:inline-flex}.JX67oW_cardSwitchTrack{box-sizing:border-box;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;align-items:center;width:30px;height:16px;padding:2px;transition:background .15s,border-color .15s;display:inline-flex}.JX67oW_cardSwitchThumb{background:var(--dsw-alias-label-tertiary);border-radius:50%;width:10px;height:10px;transition:transform .15s,background .15s;display:block}.JX67oW_cardOn .JX67oW_cardSwitchTrack{border-color:var(--dsw-alias-button-primary-fill);background:var(--dsw-alias-button-primary-fill)}.JX67oW_cardOn .JX67oW_cardSwitchThumb{background:var(--dsw-alias-bg-layer-3);transform:translate(14px)}.JX67oW_cardDesc{color:var(--dsw-alias-label-tertiary);white-space:nowrap;text-overflow:ellipsis;font-size:11px;line-height:16px;overflow:hidden}.JX67oW_addCard{border-style:dashed;border-color:var(--dsw-alias-border-l2);text-align:left;align-items:flex-start;padding:12px}.JX67oW_addCard:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-interactive-bg-hover-accent);color:var(--dsw-alias-label-primary)}.JX67oW_addCard:hover .JX67oW_cardTitle{color:var(--dsw-alias-label-primary)}.JX67oW_addCard:hover .JX67oW_cardIconChip{border-color:color-mix(in srgb, var(--dsw-alias-button-primary-fill) 35%, transparent);color:var(--dsw-alias-button-primary-fill)}.JX67oW_addCard:focus-visible{outline:2px solid var(--dsw-alias-border-l4);outline-offset:2px}.JX67oW_cardOn .JX67oW_cardDesc{color:var(--dsw-alias-label-secondary)}.JX67oW_cardSettings{border:0;border-top:1px solid var(--dsw-alias-border-l1);width:100%;color:var(--dsw-alias-label-secondary);font:inherit;text-align:left;cursor:pointer;background:0 0;align-items:center;gap:6px;padding:6px 12px;font-size:11px;font-weight:500;line-height:16px;transition:background .12s,color .12s;display:flex}.JX67oW_cardOn .JX67oW_cardSettings{border-top-color:color-mix(in srgb, var(--dsw-alias-button-primary-fill) 18%, transparent)}.JX67oW_cardSettings:hover{background:var(--dsw-alias-interactive-bg-hover-accent);color:var(--dsw-alias-brand-primary)}.JX67oW_rowGear{border:1px solid var(--dsw-alias-border-l2);width:22px;height:22px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border-radius:6px;flex:none;justify-content:center;align-items:center;padding:0;transition:background .12s,border-color .12s,color .12s;display:inline-flex}.JX67oW_rowGear:hover{border-color:var(--dsw-alias-interactive-bg-hover-accent);background:var(--dsw-alias-interactive-bg-hover-accent);color:var(--dsw-alias-brand-primary)}.JX67oW_row{border-bottom:1px solid var(--dsw-alias-border-l2);justify-content:space-between;align-items:center;gap:16px;padding:12px 2px;display:flex}.JX67oW_row:last-child{border-bottom:none}.JX67oW_rowText{flex-direction:column;gap:4px;min-width:0;display:flex}.JX67oW_title{color:var(--dsw-alias-label-primary);font-size:14px;line-height:22px}.JX67oW_desc{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}.JX67oW_switch{cursor:pointer;flex:none;display:inline-flex;position:relative}.JX67oW_switchInput{opacity:0;width:1px;height:1px;margin:0;position:absolute}.JX67oW_switchTrack{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);border-radius:10px;align-items:center;width:36px;height:20px;padding:2px;transition:background .15s,border-color .15s;display:inline-flex}.JX67oW_switchThumb{background:var(--dsw-alias-label-tertiary);border-radius:50%;width:14px;height:14px;transition:transform .15s,background .15s;display:block}.JX67oW_switch:hover .JX67oW_switchTrack{border-color:var(--dsw-alias-label-dimmed)}.JX67oW_switchInput:checked+.JX67oW_switchTrack{border-color:var(--dsw-alias-button-primary-fill);background:var(--dsw-alias-button-primary-fill)}.JX67oW_switchInput:checked+.JX67oW_switchTrack .JX67oW_switchThumb{background:var(--dsw-alias-bg-layer-3);transform:translate(16px)}.JX67oW_switchInput:focus-visible+.JX67oW_switchTrack{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}.JX67oW_control{flex:none;align-items:center;gap:6px;display:flex}.JX67oW_percentInput{width:76px}.JX67oW_typedInput{width:200px}.JX67oW_typedInputNumber{width:76px}.JX67oW_selectAnchor{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);max-width:220px;color:var(--dsw-alias-label-primary);cursor:pointer;border-radius:8px;align-items:center;gap:6px;padding:4px 8px;font-size:13px;line-height:20px;display:flex}.JX67oW_selectAnchor:hover{border-color:var(--dsw-alias-label-dimmed)}.JX67oW_selectAnchorIcon{flex:none;display:inline-flex}.JX67oW_selectAnchorText{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.JX67oW_selectOption{align-items:center;gap:10px;min-width:200px;display:flex}.JX67oW_selectOptionIcon{color:var(--dsw-alias-label-secondary);flex:none;display:inline-flex}.JX67oW_selectOptionText{flex-direction:column;min-width:0;display:flex}.JX67oW_suffix{color:var(--dsw-alias-label-secondary);font-size:14px;line-height:22px}.JX67oW_cssTextArea{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);width:100%;min-height:120px;color:var(--dsw-alias-label-primary);font-family:var(--ds-font-family-code,monospace);resize:vertical;border-radius:8px;padding:8px 10px;font-size:12px;line-height:1.6}.JX67oW_cssTextArea:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}.JX67oW_popupDialog.JX67oW_popupDialog{width:min(460px,100%)}.JX67oW_popupRows{box-sizing:border-box;scrollbar-width:thin;scrollbar-color:var(--dsw-alias-scrollbar-bg-l2,transparent) transparent;flex-direction:column;gap:8px;width:100%;max-height:min(52vh,440px);padding-right:4px;display:flex;overflow:hidden auto}.JX67oW_popupRows::-webkit-scrollbar{width:6px}.JX67oW_popupRows::-webkit-scrollbar-thumb{background:var(--dsw-alias-scrollbar-bg-l2,var(--dsw-alias-border-l2));border-radius:3px}.JX67oW_popupRows::-webkit-scrollbar-thumb:hover{background:var(--dsw-alias-scrollbar-hover-l2,var(--dsw-alias-label-dimmed))}.JX67oW_popupRow{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;flex:none;justify-content:space-between;align-items:center;gap:16px;min-width:0;padding:12px 14px;transition:border-color .16s,background .16s;display:flex}.JX67oW_popupRow:hover{border-color:var(--dsw-alias-label-dimmed)}.JX67oW_done{appearance:none;font:inherit;cursor:pointer;background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3);border:1px solid #0000;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5}.JX67oW_done:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}.JX67oW_error{color:var(--dsw-alias-state-error-primary);padding:10px 0 2px;font-size:12px;line-height:17px}.JX67oW_pluginModal.JX67oW_pluginModal{width:min(560px,100%)}.JX67oW_pluginList{flex-direction:column;gap:12px;width:100%;display:flex}.JX67oW_pluginTopicBtn{appearance:none;border:1px solid var(--dsw-alias-border-l2);width:100%;font:inherit;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1);cursor:pointer;border-radius:8px;padding:6px 12px;font-size:12px;line-height:18px}.JX67oW_pluginTopicBtn:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-interactive-bg-hover-accent);color:var(--dsw-alias-label-primary)}.JX67oW_pluginTopicBtn:focus-visible{outline:2px solid var(--dsw-alias-border-l4);outline-offset:1px}.JX67oW_pluginEmpty{color:var(--dsw-alias-label-tertiary);padding:20px 2px;font-size:12px;line-height:18px}.JX67oW_pluginEntry{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:12px;flex-direction:column;gap:4px;padding:12px;display:flex}.JX67oW_pluginEntryHead{justify-content:space-between;align-items:center;gap:12px;display:flex}.JX67oW_pluginEntryActions{flex:none;align-items:center;gap:6px;display:inline-flex}.JX67oW_pluginJumpBtn{appearance:none;border:1px solid var(--dsw-alias-border-l2);font:inherit;cursor:pointer;color:var(--dsw-alias-label-secondary);background:0 0;border-radius:8px;flex:none;padding:3px 12px;font-size:12px;line-height:1.5}.JX67oW_pluginJumpBtn:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-interactive-bg-hover-accent);color:var(--dsw-alias-label-primary)}.JX67oW_pluginJumpBtn:focus-visible{outline:2px solid var(--dsw-alias-border-l4);outline-offset:1px}.JX67oW_pluginName{appearance:none;min-width:0;font:inherit;color:var(--dsw-alias-label-primary);text-align:left;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;background:0 0;border:0;padding:0;font-size:13px;font-weight:600;line-height:20px;text-decoration:none;overflow:hidden}.JX67oW_pluginName:hover{color:var(--dsw-alias-button-primary-fill);text-decoration:underline}.JX67oW_pluginDesc{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}.JX67oW_pluginInstall{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);white-space:nowrap;border-radius:8px;padding:6px 10px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;line-height:16px;display:block;overflow-x:auto}.JX67oW_pluginCopyBtn{appearance:none;font:inherit;cursor:pointer;background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3);border:1px solid #0000;border-radius:8px;flex:none;padding:3px 12px;font-size:12px;line-height:1.5}.JX67oW_pluginCopyBtn:hover{background:var(--dsw-alias-button-primary-hover)}.JX67oW_pluginCopyBtn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}@media (prefers-reduced-motion:reduce){.JX67oW_card,.JX67oW_cardSettings,.JX67oW_cardSwitchTrack,.JX67oW_cardSwitchThumb,.JX67oW_rowGear,.JX67oW_popupRow,.JX67oW_switchTrack,.JX67oW_switchThumb{transition:none}}.JX67oW_versionBadge{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);border-radius:999px;align-self:flex-start;align-items:center;gap:8px;padding:4px 12px 4px 14px;font-size:12px;line-height:18px;display:inline-flex}.JX67oW_versionBadgeName{color:var(--dsw-alias-label-primary);font-weight:600}.JX67oW_versionBadgeTag{background:var(--dsw-alias-accent-soft,var(--dsw-alias-border-l2));color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;border-radius:999px;padding:1px 8px}.JX67oW_pluginSearch{box-sizing:border-box;appearance:none;border:1px solid var(--dsw-alias-border-l2);width:100%;font:inherit;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border-radius:8px;padding:6px 10px;font-size:12px;line-height:18px}.JX67oW_pluginSearch::placeholder{color:var(--dsw-alias-label-tertiary)}.JX67oW_pluginSearch:focus-visible{outline:2px solid var(--dsw-alias-border-l4);outline-offset:1px}.JX67oW_pluginEntries{flex-direction:column;gap:10px;max-height:46vh;padding-right:2px;display:flex;overflow:hidden auto}.JX67oW_pluginGroup{flex-direction:column;gap:8px;display:flex}.JX67oW_pluginGroupHeading{color:var(--dsw-alias-label-secondary);padding:2px 2px 0;font-size:12px;font-weight:600;line-height:18px}.JX67oW_openWithEditorRow{grid-template-columns:1fr 1.5fr auto auto;align-items:center;gap:8px;min-width:0;display:grid}.JX67oW_openWithEditorInput,.JX67oW_openWithEditorTemplate{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);width:100%;min-width:0;color:var(--dsw-alias-label-primary);font:inherit;border-radius:8px;padding:5px 8px;font-size:13px;line-height:20px}.JX67oW_openWithEditorInput:focus-visible,.JX67oW_openWithEditorTemplate:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}.JX67oW_openWithFamily{color:var(--dsw-alias-label-secondary);white-space:nowrap;cursor:pointer;align-items:center;gap:5px;font-size:12px;display:inline-flex}.JX67oW_openWithRemove{color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;border-radius:8px;justify-content:center;align-items:center;padding:4px;display:inline-flex}.JX67oW_openWithRemove:hover{color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-bg-layer-2)}.JX67oW_openWithHint{color:var(--dsw-alias-state-error-primary);padding:0 2px;font-size:12px;line-height:17px}";
		const tagId$3 = "dsh-better-sidebar/SideCardSection.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$3) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-better-sidebar";
			tag.dataset.pluginCss = tagId$3;
			tag.textContent = css$3;
			document.head.appendChild(tag);
		}
		var SideCardSection_module_css_default = {
			"section": "JX67oW_section",
			"switch": "JX67oW_switch",
			"selectAnchorText": "JX67oW_selectAnchorText",
			"pluginEntries": "JX67oW_pluginEntries",
			"pluginTopicBtn": "JX67oW_pluginTopicBtn",
			"typedInput": "JX67oW_typedInput",
			"versionBadgeTag": "JX67oW_versionBadgeTag",
			"cardSwitch": "JX67oW_cardSwitch",
			"cardSettings": "JX67oW_cardSettings",
			"pluginDesc": "JX67oW_pluginDesc",
			"pluginJumpBtn": "JX67oW_pluginJumpBtn",
			"selectOptionIcon": "JX67oW_selectOptionIcon",
			"card": "JX67oW_card",
			"selectOptionText": "JX67oW_selectOptionText",
			"versionBadgeName": "JX67oW_versionBadgeName",
			"cardDesc": "JX67oW_cardDesc",
			"pluginSearch": "JX67oW_pluginSearch",
			"openWithFamily": "JX67oW_openWithFamily",
			"cardOn": "JX67oW_cardOn",
			"switchInput": "JX67oW_switchInput",
			"count": "JX67oW_count",
			"cardTop": "JX67oW_cardTop",
			"selectAnchor": "JX67oW_selectAnchor",
			"popupRow": "JX67oW_popupRow",
			"pluginEmpty": "JX67oW_pluginEmpty",
			"cardSwitchThumb": "JX67oW_cardSwitchThumb",
			"popupDialog": "JX67oW_popupDialog",
			"versionBadge": "JX67oW_versionBadge",
			"cardTitle": "JX67oW_cardTitle",
			"pluginGroup": "JX67oW_pluginGroup",
			"cssTextArea": "JX67oW_cssTextArea",
			"typedInputNumber": "JX67oW_typedInputNumber",
			"groupHeading": "JX67oW_groupHeading",
			"grid": "JX67oW_grid",
			"pluginModal": "JX67oW_pluginModal",
			"row": "JX67oW_row",
			"openWithEditorRow": "JX67oW_openWithEditorRow",
			"suffix": "JX67oW_suffix",
			"popupRows": "JX67oW_popupRows",
			"done": "JX67oW_done",
			"addCard": "JX67oW_addCard",
			"pluginEntryHead": "JX67oW_pluginEntryHead",
			"pluginCopyBtn": "JX67oW_pluginCopyBtn",
			"pluginGroupHeading": "JX67oW_pluginGroupHeading",
			"openWithEditorInput": "JX67oW_openWithEditorInput",
			"title": "JX67oW_title",
			"openWithEditorTemplate": "JX67oW_openWithEditorTemplate",
			"intro": "JX67oW_intro",
			"pluginEntry": "JX67oW_pluginEntry",
			"group": "JX67oW_group",
			"cardMain": "JX67oW_cardMain",
			"switchThumb": "JX67oW_switchThumb",
			"error": "JX67oW_error",
			"percentInput": "JX67oW_percentInput",
			"desc": "JX67oW_desc",
			"pluginEntryActions": "JX67oW_pluginEntryActions",
			"selectOption": "JX67oW_selectOption",
			"pluginName": "JX67oW_pluginName",
			"rowText": "JX67oW_rowText",
			"switchTrack": "JX67oW_switchTrack",
			"control": "JX67oW_control",
			"selectAnchorIcon": "JX67oW_selectAnchorIcon",
			"rowGear": "JX67oW_rowGear",
			"openWithRemove": "JX67oW_openWithRemove",
			"pluginInstall": "JX67oW_pluginInstall",
			"cardSwitchTrack": "JX67oW_cardSwitchTrack",
			"openWithHint": "JX67oW_openWithHint",
			"cardIconChip": "JX67oW_cardIconChip",
			"pluginList": "JX67oW_pluginList"
		};
		//#endregion
		//#region src/client/open-with-settings.tsx
		/**
		* The editor tab's custom settings panel ("打开方式"): the file tree's
		* "open with" configuration — the optional SSH host marking the workspace as
		* remote, and the user-defined editors (name + URL template with `{path}` +
		* whether they speak the VSCode URL dialect). Persisted as the editor
		* blob's `openWith` key through the settings popup's `updatePluginSetting`.
		*
		* The popup renders the declarative rows (the editorExplorer picker) ABOVE
		* this panel — SettingsBody renders the custom panel after the row list, so
		* this component owns only its own section.
		*/
		function OpenWithSettings(props) {
			const { pluginSettings, updatePluginSetting } = props;
			const [draft, setDraft] = (0, react.useState)(() => parseOpenWithConfig(pluginSettings.openWith));
			const commit = (next) => {
				setDraft(next);
				updatePluginSetting("openWith", next);
			};
			const setSshHost = (sshHost) => commit({
				...draft,
				sshHost
			});
			const patchCustom = (id, patch) => {
				commit({
					...draft,
					customEditors: draft.customEditors.map((editor) => editor.id === id ? {
						...editor,
						...patch
					} : editor)
				});
			};
			const removeCustom = (id) => {
				commit({
					...draft,
					customEditors: draft.customEditors.filter((editor) => editor.id !== id),
					pinned: draft.pinned.filter((pinnedId) => pinnedId !== `custom:${id}`)
				});
			};
			const addCustom = () => {
				commit({
					...draft,
					customEditors: [...draft.customEditors, {
						id: newCustomEditorId(),
						name: "",
						urlTemplate: "",
						isVscodeFamily: false
					}]
				});
			};
			const hasInvalid = draft.customEditors.some((editor) => !isValidCustomEditor(editor));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: SideCardSection_module_css_default.popupRows,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: SideCardSection_module_css_default.popupRow,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: SideCardSection_module_css_default.rowText,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: SideCardSection_module_css_default.title,
								children: t("openWithSettingsSshTitle")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: SideCardSection_module_css_default.desc,
								children: t("openWithSettingsSshDesc")
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: SideCardSection_module_css_default.typedInput,
							value: draft.sshHost,
							placeholder: t("openWithSettingsSshPlaceholder"),
							spellCheck: false,
							onChange: (event) => {
								setSshHost(event.target.value);
							}
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: SideCardSection_module_css_default.popupRow,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: SideCardSection_module_css_default.rowText,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: SideCardSection_module_css_default.title,
								children: t("openWithSettingsCustomTitle")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: SideCardSection_module_css_default.desc,
								children: t("openWithSettingsCustomDesc")
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: SideCardSection_module_css_default.control,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: SideCardSection_module_css_default.done,
								onClick: addCustom,
								children: t("openWithSettingsAdd")
							})
						})]
					}),
					draft.customEditors.map((editor) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: SideCardSection_module_css_default.openWithEditorRow,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: SideCardSection_module_css_default.openWithEditorInput,
								value: editor.name,
								placeholder: t("openWithSettingsName"),
								spellCheck: false,
								onChange: (event) => {
									patchCustom(editor.id, { name: event.target.value });
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: SideCardSection_module_css_default.openWithEditorTemplate,
								value: editor.urlTemplate,
								placeholder: t("openWithSettingsTemplate"),
								spellCheck: false,
								onChange: (event) => {
									patchCustom(editor.id, { urlTemplate: event.target.value });
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: SideCardSection_module_css_default.openWithFamily,
								title: t("openWithSettingsFamilyDesc"),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									checked: editor.isVscodeFamily,
									onChange: (event) => {
										patchCustom(editor.id, { isVscodeFamily: event.currentTarget.checked });
									}
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("openWithSettingsFamily") })]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: SideCardSection_module_css_default.openWithRemove,
								"aria-label": t("openWithSettingsRemove"),
								title: t("openWithSettingsRemove"),
								onClick: () => {
									removeCustom(editor.id);
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCloseOutline16, { size: 14 })
							})
						]
					}, editor.id)),
					hasInvalid && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: SideCardSection_module_css_default.openWithHint,
						role: "note",
						children: t("openWithSettingsInvalidHint")
					})
				]
			});
		}
		//#endregion
		//#region src/client/lazy-chunk.tsx
		/**
		* Lazy chunk view wrapper: mounts a component that lives in a lazy chunk,
		* showing a loading placeholder while the chunk script loads and an error +
		* retry affordance on failure. Used by the built-in tab/viewer descriptors.
		*
		* Load failures (kernel down → `client module system unavailable`, network
		* blips, …) stay on the error state with the manual retry button, but the
		* view also subscribes to the chunk's shared auto-retry loop
		* ({@link ensureChunkAutoRetry}): a waiting line shows the live attempt
		* count, and when the loop reports `ready` the view re-loads and recovers
		* WITHOUT user action — the 0.5.0 "sidebar bricked after kernel restart"
		* fix (see chunk-availability.ts).
		*
		* Contract note: {@link lazyChunkComponent} returns a plain render-prop
		* function — the descriptor contract is `component: (props) => ReactNode`,
		* and the repo renders descriptors BOTH ways: Sidebar calls
		* `descriptor.component(props)` directly, EditorHost renders it via
		* `createElement`. The wrapper function body therefore contains no hooks;
		* all state lives in the inner {@link LazyChunkView} component.
		*/
		function LazyChunkView({ chunk, pick, props, fallback }) {
			const [attempt, setAttempt] = (0, react.useState)(0);
			const [state, setState] = (0, react.useState)({ status: "loading" });
			(0, react.useEffect)(() => {
				let cancelled = false;
				let stopAutoRetry;
				setState({ status: "loading" });
				loadChunk(chunk).then((mod) => {
					if (cancelled) return;
					const Comp = pick(mod);
					if (Comp === void 0) {
						setState({
							status: "error",
							message: `[dsh-better-sidebar] chunk "${chunk}" is missing its component`
						});
						return;
					}
					setState({
						status: "ready",
						Comp
					});
				}).catch((error) => {
					if (cancelled) return;
					setState({
						status: "error",
						message: error instanceof Error ? error.message : String(error),
						autoAttempt: 1
					});
					stopAutoRetry = ensureChunkAutoRetry(chunk, (event) => {
						if (cancelled) return;
						if (event.ready) {
							setAttempt((current) => current + 1);
							return;
						}
						setState((prev) => prev.status === "error" ? {
							...prev,
							autoAttempt: event.attempt
						} : prev);
					});
				});
				return () => {
					cancelled = true;
					stopAutoRetry?.();
				};
			}, [
				chunk,
				pick,
				attempt
			]);
			if (state.status === "loading") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: sidebar_module_css_default.editorPlaceholder,
				children: t("loading")
			});
			if (state.status === "error") {
				if (fallback !== void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: sidebar_module_css_default.editorBanner,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("chunkFallbackNotice") }),
						state.autoAttempt !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("chunkAutoRetryWaiting", { n: state.autoAttempt }) }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: sidebar_module_css_default.terminalRetry,
							onClick: () => {
								setAttempt((current) => current + 1);
							},
							children: t("terminalRetry")
						})
					]
				}), fallback(props)] });
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: sidebar_module_css_default.editorError,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: state.message }),
						state.autoAttempt !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("chunkAutoRetryWaiting", { n: state.autoAttempt }) }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: sidebar_module_css_default.terminalRetry,
							onClick: () => {
								setAttempt((current) => current + 1);
							},
							children: t("terminalRetry")
						})
					]
				});
			}
			return (0, react.createElement)(state.Comp, props);
		}
		/**
		* Build a descriptor-compatible lazy wrapper for a chunk-resident component.
		* The returned function is the descriptor `component` itself: it returns an
		* element and never calls hooks, so both invocation styles (plain function
		* call and createElement/JSX render) work. `pick` must be a module-level
		* function (stable identity) — an inline lambda would re-trigger the load
		* effect on every render.
		* @param chunk - the chunk name (see chunk-loader.ts).
		* @param pick - select the component from the chunk's exports.
		* @param fallback - optional read-only preview rendered while the chunk is
		*   unavailable (the fsRead viewers pass one so the file stays viewable).
		*/
		function lazyChunkComponent(chunk, pick, fallback) {
			return (props) => (0, react.createElement)(LazyChunkView, {
				chunk,
				pick,
				props,
				fallback
			});
		}
		//#endregion
		//#region src/client/GitView.tsx
		/**
		* The source-control panel: status list (staged vs unstaged), stage/unstage,
		* commit with a message box, branch switch, and a VSCode-like history — rows
		* carry branch decorations, author and relative time. Clicking a changed
		* file or a history row opens a dedicated diff TAB (see {@link DiffTab}),
		* placed below the git pane on first use. File rows and history rows open a
		* right-click context menu with advanced operations (open in editor, discard,
		* revert, cherry-pick, copy paths/hashes). Refresh is manual + on mount/
		* focus (no file watcher — KISS).
		*/
		/** The XY status letters a row badge shows (X = index, Y = worktree). */
		function badgeOf(entry) {
			const index = entry.xy[0];
			const worktree = entry.xy[1];
			if (index !== void 0 && index !== " " && index !== "?") return index;
			if (worktree !== void 0 && worktree !== " " && worktree !== "?") return worktree;
			return "?";
		}
		/** Whether the entry carries STAGED (index) changes — the X letter is set. */
		function isStagedEntry(entry) {
			const index = entry.xy[0];
			return index !== void 0 && index !== " " && index !== "?";
		}
		/** Whether the entry carries UNSTAGED (worktree) changes — the Y letter is set
		*  (untracked `??` counts as unstaged: it is a worktree-only change). A file
		*  with both letters set ('MM') lands in BOTH sections. */
		function isUnstagedEntry(entry) {
			if (entry.xy === "??") return true;
			const worktree = entry.xy[1];
			return worktree !== void 0 && worktree !== " " && worktree !== "?";
		}
		/** Whether the entry is untracked (`??`): git diff never includes it. */
		function isUntracked(entry) {
			return badgeOf(entry) === "?";
		}
		/** The last path segment (tab title for a file's diff). */
		function baseName$1(path) {
			const at = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
			return at === -1 ? path : path.slice(at + 1);
		}
		/** The ref names of one log row's decorations (`HEAD -> main` → `main`), deduped. */
		function refNames(refs) {
			return [...new Set(refs.split(",").map((ref) => ref.trim()).filter((ref) => ref !== "").map((ref) => ref.includes(" -> ") ? ref.slice(ref.indexOf(" -> ") + 4) : ref).map((ref) => ref.startsWith("tag: ") ? ref.slice(5) : ref))];
		}
		/** History batch size: the log loads lazily in pages so a long history never
		*  floods the panel at once (the end of the log is reached by paging). */
		const LOG_BATCH = 20;
		function GitView(props) {
			const { scope, onOpenFile, onOpenDiff } = props;
			const [status, setStatus] = (0, react.useState)(null);
			const [loading, setLoading] = (0, react.useState)(true);
			const [error, setError] = (0, react.useState)(null);
			const [branchNames, setBranchNames] = (0, react.useState)([]);
			const [logEntries, setLogEntries] = (0, react.useState)([]);
			const [commitMsg, setCommitMsg] = (0, react.useState)("");
			const [busy, setBusy] = (0, react.useState)(false);
			const [commitError, setCommitError] = (0, react.useState)(null);
			/** Whether the history was fully paged (a batch shorter than LOG_BATCH). */
			const [logEnded, setLogEnded] = (0, react.useState)(false);
			const [logLoadingMore, setLogLoadingMore] = (0, react.useState)(false);
			/** The open file-row context menu (cursor position for the portaled Menu). */
			const [fileMenu, setFileMenu] = (0, react.useState)(null);
			/** The open history-row context menu. */
			const [historyMenu, setHistoryMenu] = (0, react.useState)(null);
			/** The pending destructive action awaiting confirmation. */
			const [confirm, setConfirm] = (0, react.useState)(null);
			const refresh = (0, react.useCallback)(async () => {
				setLoading(true);
				setError(null);
				try {
					const [statusResult, branchResult, logResult] = await Promise.all([
						api.gitStatus(scope),
						api.gitBranch(scope).catch(() => ({
							current: "",
							names: []
						})),
						api.gitLog(scope, LOG_BATCH, 0).catch(() => [])
					]);
					setStatus(statusResult);
					setBranchNames(branchResult.names);
					setLogEntries(logResult);
					setLogEnded(logResult.length < LOG_BATCH);
				} catch (reason) {
					setError(reason instanceof Error ? reason.message : String(reason));
				} finally {
					setLoading(false);
				}
			}, [scope.sessionId, scope.cwd]);
			(0, react.useEffect)(() => {
				refresh();
			}, [refresh]);
			/** Append the next history page (lazy: only when the user asks for more). */
			const loadMoreLog = async () => {
				if (logLoadingMore || logEnded) return;
				setLogLoadingMore(true);
				try {
					const next = await api.gitLog(scope, LOG_BATCH, logEntries.length);
					setLogEntries((entries) => [...entries, ...next]);
					if (next.length < LOG_BATCH) setLogEnded(true);
				} catch (reason) {
					setCommitError(`${t("historyLoadError")}: ${reason instanceof Error ? reason.message : String(reason)}`);
				} finally {
					setLogLoadingMore(false);
				}
			};
			/** The diff tab for one changed file (one tab per path+side; same id = focused). */
			const openWorktreeDiff = (entry, staged) => {
				onOpenDiff({
					id: `diff:w:${staged ? "s" : "u"}:${entry.path}`,
					type: "diff",
					title: baseName$1(entry.path),
					diff: {
						kind: "worktree",
						path: entry.path,
						staged,
						untracked: isUntracked(entry)
					}
				});
			};
			/** The diff tab for one commit (one tab per commit). */
			const openCommitDiff = (entry) => {
				onOpenDiff({
					id: `diff:c:${entry.hashFull}`,
					type: "diff",
					title: `${entry.hash} ${entry.subject}`,
					diff: {
						kind: "commit",
						hash: entry.hash,
						hashFull: entry.hashFull,
						subject: entry.subject
					}
				});
			};
			const stageEntry = async (entry, staged) => {
				setBusy(true);
				try {
					if (staged) await api.gitUnstage(scope, entry.path);
					else await api.gitStage(scope, entry.path);
					await refresh();
				} finally {
					setBusy(false);
				}
			};
			const stageAll = async (staged) => {
				setBusy(true);
				try {
					if (staged) await api.gitUnstage(scope);
					else await api.gitStage(scope);
					await refresh();
				} finally {
					setBusy(false);
				}
			};
			const commit = async () => {
				const message = commitMsg.trim();
				if (message === "" || busy) return;
				setBusy(true);
				setCommitError(null);
				try {
					await api.gitCommit(scope, message);
					setCommitMsg("");
					await refresh();
				} catch (reason) {
					setCommitError(reason instanceof Error ? reason.message : String(reason));
				} finally {
					setBusy(false);
				}
			};
			const checkout = async (branch) => {
				if (branch === status?.branch || busy) return;
				setBusy(true);
				setCommitError(null);
				try {
					await api.gitCheckout(scope, branch);
					await refresh();
				} catch (reason) {
					setCommitError(`${t("checkoutError")}: ${reason instanceof Error ? reason.message : String(reason)}`);
				} finally {
					setBusy(false);
				}
			};
			/** Run one destructive operation after the confirm modal, then refresh. */
			const runConfirmed = (confirmState) => {
				setConfirm({
					...confirmState,
					onConfirm: async () => {
						setBusy(true);
						setCommitError(null);
						try {
							await confirmState.onConfirm();
							await refresh();
						} catch (reason) {
							setCommitError(reason instanceof Error ? reason.message : String(reason));
						} finally {
							setBusy(false);
						}
					}
				});
			};
			/** Copy `text` to the clipboard (best-effort; no visual feedback needed — the menu closes). */
			const copy = (text) => {
				(0, _deepseek_ai_dsh_client_ui_primitives.writeClipboard)(text);
			};
			const openFileMenu = (event, entry, staged) => {
				event.preventDefault();
				event.stopPropagation();
				setFileMenu({
					entry,
					staged,
					x: event.clientX,
					y: event.clientY
				});
			};
			const openHistoryMenu = (event, entry) => {
				event.preventDefault();
				event.stopPropagation();
				setHistoryMenu({
					entry,
					x: event.clientX,
					y: event.clientY
				});
			};
			const stagedEntries = (status?.entries ?? []).filter(isStagedEntry);
			const unstagedEntries = (status?.entries ?? []).filter(isUnstagedEntry);
			const renderEntry = (entry, staged) => {
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: sidebar_module_css_default.gitRow,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: sidebar_module_css_default.gitRowMain,
						title: entry.path,
						onClick: () => {
							openWorktreeDiff(entry, staged);
						},
						onContextMenu: (event) => {
							openFileMenu(event, entry, staged);
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: sidebar_module_css_default.gitBadge,
							children: badgeOf(entry)
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: sidebar_module_css_default.gitName,
							children: entry.path
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: sidebar_module_css_default.iconButton,
						"aria-label": staged ? t("unstage") : t("stage"),
						title: staged ? t("unstage") : t("stage"),
						disabled: busy,
						onClick: () => {
							stageEntry(entry, staged);
						},
						children: staged ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutline16, {}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBranchOutline16, {})
					})]
				}, `${staged ? "s" : "u"}:${entry.path}`);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: sidebar_module_css_default.git,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: sidebar_module_css_default.gitHeader,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
							className: sidebar_module_css_default.gitBranchSelect,
							value: status?.branch ?? "",
							onChange: (event) => {
								checkout(event.target.value);
							},
							disabled: busy || status !== null && !status.isRepo,
							children: [(status?.branch ?? "") !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: status.branch,
								children: status.branch
							}), branchNames.filter((name) => name !== status?.branch).map((name) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: name,
								children: name
							}, name))]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: sidebar_module_css_default.iconButton,
							"aria-label": t("refresh"),
							title: t("refresh"),
							onClick: () => {
								refresh();
							},
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRefreshOutline16, { size: 14 })
						})]
					}),
					loading && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: sidebar_module_css_default.gitPlaceholder,
						children: t("loading")
					}),
					!loading && error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: sidebar_module_css_default.gitError,
						children: error
					}),
					!loading && status !== null && !status.isRepo && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: sidebar_module_css_default.gitPlaceholder,
						children: t("notRepo")
					}),
					status !== null && status.isRepo && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: sidebar_module_css_default.gitSection,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: sidebar_module_css_default.gitSectionHeader,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
										t("staged"),
										" (",
										stagedEntries.length,
										")"
									] }), stagedEntries.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: sidebar_module_css_default.gitLink,
										disabled: busy,
										onClick: () => {
											stageAll(true);
										},
										children: t("unstageAll")
									})]
								}),
								stagedEntries.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: sidebar_module_css_default.gitEmpty,
									children: t("noChanges")
								}),
								stagedEntries.map((entry) => renderEntry(entry, true))
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: sidebar_module_css_default.gitSection,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: sidebar_module_css_default.gitSectionHeader,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
										t("unstaged"),
										" (",
										unstagedEntries.length,
										")"
									] }), unstagedEntries.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: sidebar_module_css_default.gitLink,
										disabled: busy,
										onClick: () => {
											stageAll(false);
										},
										children: t("stageAll")
									})]
								}),
								unstagedEntries.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: sidebar_module_css_default.gitEmpty,
									children: t("noChanges")
								}),
								unstagedEntries.map((entry) => renderEntry(entry, false))
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: sidebar_module_css_default.gitCommit,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
								className: sidebar_module_css_default.gitCommitInput,
								placeholder: t("commitPlaceholder"),
								value: commitMsg,
								disabled: busy,
								onChange: (event) => {
									setCommitMsg(event.target.value);
									setCommitError(null);
								},
								onKeyDown: (event) => {
									if ((event.ctrlKey || event.metaKey) && event.key === "Enter") commit();
								}
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: sidebar_module_css_default.gitCommitButton,
								disabled: busy || commitMsg.trim() === "" || stagedEntries.length === 0,
								onClick: () => {
									commit();
								},
								children: t("commit")
							})]
						}),
						commitError !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: sidebar_module_css_default.gitError,
							children: commitError
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: sidebar_module_css_default.gitSection,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: sidebar_module_css_default.gitSectionHeader,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("history") })
								}),
								logEntries.map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									role: "button",
									tabIndex: 0,
									className: sidebar_module_css_default.gitLogRow,
									title: `${entry.author} · ${entry.date}\n${entry.hashFull}`,
									onClick: () => {
										openCommitDiff(entry);
									},
									onKeyDown: (event) => {
										if (event.key === "Enter" || event.key === " ") {
											event.preventDefault();
											openCommitDiff(entry);
										}
									},
									onContextMenu: (event) => {
										openHistoryMenu(event, entry);
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: sidebar_module_css_default.gitLogLine1,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: sidebar_module_css_default.gitLogHash,
											children: entry.hash
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: sidebar_module_css_default.gitLogSubject,
											children: entry.subject
										})]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: sidebar_module_css_default.gitLogLine2,
										children: [refNames(entry.refs).map((ref) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: sidebar_module_css_default.gitLogRef,
											children: ref
										}, ref)), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: sidebar_module_css_default.gitLogMeta,
											children: [
												entry.author,
												" · ",
												relativeTime(entry.date)
											]
										})]
									})]
								}, entry.hashFull)),
								!logEnded && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: sidebar_module_css_default.gitLogMore,
									disabled: logLoadingMore || busy,
									onClick: () => {
										loadMoreLog();
									},
									children: logLoadingMore ? t("loading") : t("loadMore")
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
							open: fileMenu !== null,
							onClose: () => {
								setFileMenu(null);
							},
							items: [
								{
									id: "open",
									label: t("openEditor"),
									icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCodeOutline16, { size: 14 })
								},
								fileMenu?.staged === true ? {
									id: "stage",
									label: t("unstage"),
									icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutline16, { size: 14 })
								} : {
									id: "stage",
									label: t("stage"),
									icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBranchOutline16, { size: 14 })
								},
								...fileMenu !== null && !isUntracked(fileMenu.entry) ? [{
									id: "discard",
									label: t("discard"),
									icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutline16, { size: 14 }),
									danger: true
								}] : [],
								{
									type: "separator",
									id: "sep1"
								},
								{
									id: "relative",
									label: t("copyRelative"),
									icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCopyOutline16, { size: 14 })
								},
								{
									id: "absolute",
									label: t("copyAbsolute"),
									icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCopyOutline16, { size: 14 })
								}
							],
							onSelect: (id) => {
								const target = fileMenu;
								if (target === null) return;
								setFileMenu(null);
								if (id === "open") {
									onOpenFile(target.entry.path);
									return;
								}
								if (id === "stage") {
									stageEntry(target.entry, target.staged);
									return;
								}
								if (id === "discard") {
									runConfirmed({
										title: t("discardTitle"),
										description: t("discardDesc", { path: target.entry.path }),
										confirmLabel: t("discard"),
										onConfirm: () => api.gitDiscard(scope, target.entry.path)
									});
									return;
								}
								if (id === "relative") {
									copy(relativeTo(scope.cwd ?? "", target.entry.path));
									return;
								}
								if (id === "absolute") copy(target.entry.path);
							},
							portal: true,
							align: "start",
							getAnchorRect: () => fileMenu === null ? null : new DOMRect(fileMenu.x, fileMenu.y, 0, 0),
							anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
							open: historyMenu !== null,
							onClose: () => {
								setHistoryMenu(null);
							},
							items: [
								{
									id: "view",
									label: t("viewCommitDiff")
								},
								{
									id: "copyShort",
									label: t("copyShortHash"),
									icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCopyOutline16, { size: 14 })
								},
								{
									id: "copyFull",
									label: t("copyFullHash"),
									icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCopyOutline16, { size: 14 })
								},
								{
									id: "copySubject",
									label: t("copySubject"),
									icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCopyOutline16, { size: 14 })
								},
								{
									type: "separator",
									id: "sep2"
								},
								{
									id: "revert",
									label: t("revertCommit"),
									danger: true
								},
								{
									id: "cherryPick",
									label: t("cherryPickCommit"),
									danger: true
								}
							],
							onSelect: (id) => {
								const target = historyMenu;
								if (target === null) return;
								setHistoryMenu(null);
								if (id === "view") {
									openCommitDiff(target.entry);
									return;
								}
								if (id === "copyShort") {
									copy(target.entry.hash);
									return;
								}
								if (id === "copyFull") {
									copy(target.entry.hashFull);
									return;
								}
								if (id === "copySubject") {
									copy(target.entry.subject);
									return;
								}
								if (id === "revert") {
									runConfirmed({
										title: t("revertTitle"),
										description: t("revertDesc", { subject: target.entry.subject }),
										confirmLabel: t("revertCommit"),
										onConfirm: () => api.gitRevert(scope, target.entry.hashFull)
									});
									return;
								}
								if (id === "cherryPick") runConfirmed({
									title: t("cherryPickTitle"),
									description: t("cherryPickDesc", { subject: target.entry.subject }),
									confirmLabel: t("cherryPickCommit"),
									onConfirm: () => api.gitCherryPick(scope, target.entry.hashFull)
								});
							},
							portal: true,
							align: "start",
							getAnchorRect: () => historyMenu === null ? null : new DOMRect(historyMenu.x, historyMenu.y, 0, 0),
							anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
							open: confirm !== null,
							onClose: () => {
								setConfirm(null);
							},
							title: confirm?.title ?? "",
							closeLabel: t("cancel"),
							footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "outline",
								onClick: () => {
									setConfirm(null);
								},
								children: t("cancel")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "primary",
								disabled: busy,
								onClick: () => {
									const pending = confirm;
									if (pending === null) return;
									setConfirm(null);
									pending.onConfirm();
								},
								children: confirm?.confirmLabel ?? ""
							})] }),
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: sidebar_module_css_default.gitConfirmDesc,
								children: confirm?.description
							})
						})
					] })
				]
			});
		}
		//#endregion
		//#region src/client/DiffView.tsx
		/**
		* The real diff surface for the git panel: parses the host's unified diff
		* text (`git diff` / `git show`) and renders it VSCode-style — per-file
		* sections with hunks (`@@ -a,b +c,d @@` headers), old/new line-number
		* gutters, and aligned context / deleted / added rows colored through the
		* DSH tokens. Untracked files produce no `git diff` output, so the caller
		* can pass the file content to render as a full-file addition instead.
		*
		* The parser is a pure function (`parseUnifiedDiff`) so the interesting
		* cases are unit-tested without a DOM.
		*/
		/** Parse the hunk header `@@ -a[,b] +c[,d] @@ section` (section may contain '@@'). */
		function parseHunkHeader(line) {
			const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/.exec(line);
			if (match === null) return null;
			return {
				oldStart: Number(match[1]),
				newStart: Number(match[3]),
				header: match[5] ?? ""
			};
		}
		/**
		* Parse `git diff --no-color` output into file sections and hunks. Rows
		* outside a file section (leading noise) and metadata rows between the
		* `diff --git`/`---`/`+++` headers and the first hunk (index lines, mode
		* changes, rename/similarity lines) are skipped; a section that never
		* reaches a hunk (a mode/rename-only change) stays hunkless so the caller
		* can still draw its path.
		*/
		function parseUnifiedDiff(text) {
			const files = [];
			let current = null;
			let inHunk = false;
			let hunk = null;
			let oldNum = 0;
			let newNum = 0;
			const flushHunk = () => {
				if (current !== null && hunk !== null) current.hunks.push(hunk);
				hunk = null;
				inHunk = false;
			};
			for (const raw of text.split("\n")) {
				if (raw.startsWith("diff --git ")) {
					flushHunk();
					current = {
						oldPath: "",
						newPath: "",
						binary: false,
						hunks: []
					};
					files.push(current);
					continue;
				}
				if (current === null) continue;
				if (raw.startsWith("Binary files ") || raw === "GIT binary patch") {
					flushHunk();
					current.binary = true;
					continue;
				}
				if (raw.startsWith("--- ")) {
					flushHunk();
					current.oldPath = raw.slice(4);
					continue;
				}
				if (raw.startsWith("+++ ")) {
					current.newPath = raw.slice(4);
					continue;
				}
				const header = parseHunkHeader(raw);
				if (header !== null) {
					flushHunk();
					hunk = {
						oldStart: header.oldStart,
						newStart: header.newStart,
						header: header.header,
						lines: []
					};
					oldNum = header.oldStart;
					newNum = header.newStart;
					inHunk = true;
					continue;
				}
				if (!inHunk || hunk === null) continue;
				const marker = raw[0];
				if (marker === "\\") {
					hunk.lines.push({
						kind: "meta",
						text: raw.slice(1),
						oldNum: null,
						newNum: null
					});
					continue;
				}
				if (marker === " ") {
					hunk.lines.push({
						kind: "ctx",
						text: raw.slice(1),
						oldNum,
						newNum
					});
					oldNum += 1;
					newNum += 1;
				} else if (marker === "-") {
					hunk.lines.push({
						kind: "del",
						text: raw.slice(1),
						oldNum,
						newNum: null
					});
					oldNum += 1;
				} else if (marker === "+") {
					hunk.lines.push({
						kind: "add",
						text: raw.slice(1),
						oldNum: null,
						newNum
					});
					newNum += 1;
				} else flushHunk();
			}
			flushHunk();
			return { files };
		}
		/** Build the untracked-file shape: one file, one hunk of pure additions. */
		function untrackedFile(path, content) {
			const lines = [];
			const body = content.endsWith("\n") ? content.slice(0, -1) : content;
			if (body !== "") {
				let num = 1;
				for (const line of body.split("\n")) {
					lines.push({
						kind: "add",
						text: line,
						oldNum: null,
						newNum: num
					});
					num += 1;
				}
			}
			return {
				oldPath: "/dev/null",
				newPath: `b/${path}`,
				binary: false,
				hunks: [{
					oldStart: 0,
					newStart: 1,
					header: "",
					lines
				}]
			};
		}
		/** Strip the `a/` / `b/` prefix git puts on diff paths (not on /dev/null). */
		function displayPath(path) {
			if (path === "/dev/null") return path;
			if (path.startsWith("a/") || path.startsWith("b/")) return path.slice(2);
			return path;
		}
		/** The file header badge: added / deleted / renamed / binary ('' for a plain edit). */
		function fileTag(file) {
			if (file.binary) return t("diffBinary");
			if (file.oldPath === "/dev/null") return t("diffAdded");
			if (file.newPath === "/dev/null") return t("diffDeleted");
			if (displayPath(file.oldPath) !== displayPath(file.newPath)) return t("diffRenamed");
			return null;
		}
		/** Cap the flattened rows like DiffBlock: head + tail, expand button between. */
		const MAX_DIFF_ROWS = 500;
		const TEST_PATH = /(^|\/)(?:__tests__|tests?|specs?|fixtures?|mocks?|snapshots?)(?:\/|$)|\.(?:test|spec)\.[^/]+$/i;
		const DOC_PATH = /(^|\/)(?:docs?|documentation)(?:\/|$)|(^|\/)(?:readme|changelog|contributing|license|authors|notice)(?:\.[^/]*)?$/i;
		const GENERATED_PATH = /(^|\/)(?:dist|build|coverage|generated|vendor|node_modules)(?:\/|$)|(^|\/)(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|composer\.lock|cargo\.lock|poetry\.lock)$/i;
		const SOURCE_PATH = /\.(?:js|jsx|mjs|cjs|ts|tsx|mts|cts|py|pyw|rb|php|java|kt|kts|scala|go|rs|swift|c|h|cc|cpp|cxx|hpp|hh|hxx|cs|fs|fsx|vb|dart|lua|r|ex|exs|erl|hrl|clj|cljs|cljc|groovy|sh|bash|zsh|fish|ps1|sql|vue|svelte|astro|html|htm|css|scss|sass|less)$/i;
		/** Source files open by default; tests, docs, generated files and unknown types stay folded. */
		function defaultExpandedFiles(files) {
			const expanded = /* @__PURE__ */ new Set();
			files.forEach((file, index) => {
				const path = displayPath(file.newPath === "/dev/null" ? file.oldPath : file.newPath);
				if (!file.binary && file.hunks.length > 0 && !TEST_PATH.test(path) && !DOC_PATH.test(path) && !GENERATED_PATH.test(path) && SOURCE_PATH.test(path)) expanded.add(index);
			});
			return expanded;
		}
		function DiffView({ diff, untrackedPath, untrackedContent }) {
			const parsed = (0, react.useMemo)(() => {
				if (untrackedPath !== void 0) return { files: [untrackedFile(untrackedPath, untrackedContent ?? "")] };
				return parseUnifiedDiff(diff);
			}, [
				diff,
				untrackedPath,
				untrackedContent
			]);
			const [expanded, setExpanded] = (0, react.useState)(false);
			const [expandedFiles, setExpandedFiles] = (0, react.useState)(() => defaultExpandedFiles(parsed.files));
			(0, react.useEffect)(() => {
				setExpandedFiles(defaultExpandedFiles(parsed.files));
			}, [parsed]);
			const rows = (0, react.useMemo)(() => {
				const out = [];
				parsed.files.forEach((file, fileIndex) => {
					out.push({
						key: `f${fileIndex}`,
						file,
						fileIndex,
						type: "path"
					});
					if (file.binary || !expandedFiles.has(fileIndex)) return;
					file.hunks.forEach((hunk, hunkIndex) => {
						out.push({
							key: `f${fileIndex}h${hunkIndex}`,
							file,
							fileIndex,
							type: "hunk",
							hunk
						});
						hunk.lines.forEach((line, lineIndex) => {
							out.push({
								key: `f${fileIndex}h${hunkIndex}l${lineIndex}`,
								file,
								fileIndex,
								type: "line",
								hunk,
								line
							});
						});
					});
				});
				return out;
			}, [parsed, expandedFiles]);
			const hidden = rows.length - MAX_DIFF_ROWS;
			const capped = hidden > 0 && !expanded;
			const headLines = Math.ceil(MAX_DIFF_ROWS / 2);
			const tailLines = 250;
			const head = capped ? rows.slice(0, headLines) : rows;
			const tail = capped ? rows.slice(rows.length - tailLines) : [];
			if (rows.length === 0) return null;
			const renderRow = (row) => {
				if (row.type === "path") {
					const tag = fileTag(row.file);
					const from = displayPath(row.file.oldPath);
					const to = displayPath(row.file.newPath);
					const expandable = !row.file.binary && row.file.hunks.length > 0;
					const fileExpanded = expandedFiles.has(row.fileIndex);
					return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: sidebar_module_css_default.gitDiffFile,
						disabled: !expandable,
						"aria-expanded": expandable ? fileExpanded : void 0,
						onClick: () => {
							setExpandedFiles((current) => {
								const next = new Set(current);
								if (next.has(row.fileIndex)) next.delete(row.fileIndex);
								else next.add(row.fileIndex);
								return next;
							});
						},
						children: [
							expandable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								"aria-hidden": "true",
								className: clsx(sidebar_module_css_default.gitDiffFileChevron, fileExpanded && sidebar_module_css_default.gitDiffFileChevronExpanded),
								children: "›"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: sidebar_module_css_default.gitDiffFilePath,
								children: to
							}),
							from !== to && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: sidebar_module_css_default.gitDiffFileOld,
								children: ["← ", from]
							}),
							tag !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: sidebar_module_css_default.gitDiffFileTag,
								children: tag
							})
						]
					}, row.key);
				}
				if (row.type === "hunk") {
					const hunk = row.hunk;
					return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: sidebar_module_css_default.gitDiffHunk,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: sidebar_module_css_default.gitDiffHunkHeader,
							children: [
								"@@ -",
								hunk.oldStart,
								",",
								hunk.lines.filter((l) => l.oldNum !== null).length,
								" +",
								hunk.newStart,
								",",
								hunk.lines.filter((l) => l.newNum !== null).length,
								" @@"
							]
						}), hunk.header !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: sidebar_module_css_default.gitDiffHunkSection,
							children: hunk.header
						})]
					}, row.key);
				}
				const line = row.line;
				const lineClass = line.kind === "del" ? sidebar_module_css_default.gitDiffDel : line.kind === "add" ? sidebar_module_css_default.gitDiffAdd : line.kind === "meta" ? sidebar_module_css_default.gitDiffMeta : sidebar_module_css_default.gitDiffCtx;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: clsx(sidebar_module_css_default.gitDiffLine, lineClass),
					children: line.kind === "meta" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: sidebar_module_css_default.gitDiffMetaText,
						children: line.text
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: sidebar_module_css_default.gitDiffNum,
							children: line.oldNum ?? ""
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: sidebar_module_css_default.gitDiffNum,
							children: line.newNum ?? ""
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: sidebar_module_css_default.gitDiffCode,
							children: line.text
						})
					] })
				}, row.key);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: sidebar_module_css_default.gitDiff,
				children: [
					head.map(renderRow),
					hidden > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: sidebar_module_css_default.gitDiffExpand,
						"aria-expanded": expanded,
						onClick: () => {
							setExpanded((value) => !value);
						},
						children: expanded ? t("diffCollapse") : t("diffExpand", { count: hidden })
					}),
					tail.map(renderRow)
				]
			});
		}
		//#endregion
		//#region src/client/DiffTab.tsx
		/**
		* The diff tab: one change opened from the git panel, like VSCode's diff
		* editor. A worktree ref loads the file's unified diff (`git diff`, staged or
		* not; untracked files — which git diff never covers — render as a full-file
		* addition from their content), a commit ref loads the commit's full patch
		* (`git.show`-style). The header carries a refresh button because the tab
		* stays mounted while the git panel's staging/discard operations change the
		* very content it shows.
		*/
		function DiffTab(props) {
			const { sessionId, cwd, diff } = props;
			const [loading, setLoading] = (0, react.useState)(true);
			const [error, setError] = (0, react.useState)(null);
			const [data, setData] = (0, react.useState)(null);
			const [tick, setTick] = (0, react.useState)(0);
			const refresh = (0, react.useCallback)(() => {
				setTick((value) => value + 1);
			}, []);
			(0, react.useEffect)(() => {
				let cancelled = false;
				const scope = {
					sessionId,
					cwd
				};
				setLoading(true);
				setError(null);
				setData(null);
				const load = async () => {
					try {
						if (diff.kind === "commit") {
							const result = await api.gitCommitDiff(scope, diff.hashFull);
							if (!cancelled) setData({ diff: result.diff });
							return;
						}
						let result = await api.gitDiff(scope, diff.path, diff.staged);
						if (result.diff === "") {
							const other = await api.gitDiff(scope, diff.path, !diff.staged);
							if (other.diff !== "") result = other;
						}
						if (result.diff !== "") {
							if (!cancelled) setData({ diff: result.diff });
							return;
						}
						if (diff.untracked === true && !diff.staged) {
							const text = await api.fsRead(scope, diff.path);
							if (!cancelled) setData(text.kind === "text" ? {
								diff: "",
								untracked: text.content
							} : { diff: "" });
							return;
						}
						if (!cancelled) setData({ diff: "" });
					} catch (reason) {
						if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
					} finally {
						if (!cancelled) setLoading(false);
					}
				};
				load();
				return () => {
					cancelled = true;
				};
			}, [
				sessionId,
				cwd,
				diff,
				tick
			]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: sidebar_module_css_default.gitDiffTab,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: sidebar_module_css_default.gitDiffTabHeader,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: sidebar_module_css_default.gitDiffTabTitle,
							title: diff.kind === "worktree" ? diff.path : `${diff.hash} ${diff.subject}`,
							children: diff.kind === "worktree" ? diff.path : `${diff.hash} ${diff.subject}`
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: sidebar_module_css_default.iconButton,
							"aria-label": t("refresh"),
							title: t("refresh"),
							onClick: refresh,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRefreshOutline16, { size: 14 })
						})]
					}),
					loading && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: sidebar_module_css_default.gitPlaceholder,
						children: t("loading")
					}),
					!loading && error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: sidebar_module_css_default.gitError,
						children: [
							t("diffLoadError"),
							": ",
							error
						]
					}),
					!loading && error === null && data !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [data.untracked !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DiffView, {
						diff: "",
						untrackedPath: diff.kind === "worktree" ? diff.path : "",
						untrackedContent: data.untracked
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DiffView, { diff: data.diff }), data.diff === "" && data.untracked === void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: sidebar_module_css_default.gitEmpty,
						children: t("diffEmpty")
					})] })
				]
			});
		}
		/** The boundary message's opening line — the transcript mapping drops user
		*  rows starting with it (same first line as dsh-sidechain's boundary, so
		*  the two plugins' threads render consistently in either UI). */
		const SIDE_BOUNDARY_PREFIX = "Side conversation boundary";
		/**
		* The boundary prompt delivered as the thread's first user message: the
		* inherited seed is reference context only, never active instruction.
		* Model-facing contract — change only with intent, tests pin the sentences.
		*/
		const SIDE_BOUNDARY_PROMPT = `Side conversation boundary.

Everything before this boundary is inherited history from the parent session: its completed turns, its pending question, and — if the parent was mid-turn — its in-progress output frozen at the moment this side conversation started. It is reference context only. It is not your current task.

Do not continue, execute, or complete any instructions, plans, tool calls, approvals, edits, or requests from before this boundary. Only messages submitted after this boundary are active user instructions for this side conversation.

Mode: this is a continuable side conversation. Your answers stay in this side thread and are viewed in the side panel; they are never delivered into the parent session.`;
		/**
		* Derive the side threads of one parent session from the client session list:
		* durable `origin: 'subagent'` children of the parent whose pinned title
		* carries the thread label prefix (our creation path pins it via
		* sessionTitle.rename; dsh-sidechain threads share the convention, so they
		* are visible here too).
		*/
		function sideThreadRows(byId, sessionId) {
			const rows = [];
			for (const summary of Object.values(byId)) {
				if (summary.origin !== "subagent" || summary.parentId !== sessionId) continue;
				if (!summary.displayTitle.startsWith("Side: ")) continue;
				rows.push({
					id: summary.id,
					title: summary.displayTitle,
					running: summary.running === true
				});
			}
			return rows;
		}
		/** The leading text of a user/message's content (block array or bare string). */
		function messageLeadText(data) {
			const content = data.content;
			const first = Array.isArray(content) ? content[0] : content;
			return typeof first === "string" ? first : typeof first === "object" && first !== null && "text" in first ? String(first.text) : "";
		}
		/**
		* Whether a logged user/message is a CONTEXT INJECTION (the boundary prompt
		* plus the parked in-progress snapshot) rather than a real user message.
		* New threads deliver the injection via `agent.inject` stamped with a
		* non-'user' source kind; threads created before that split carry
		* boundary+question in ONE 'user' message, recognized by the boundary
		* prefix. Both render as one collapsible injection row — never as a user
		* bubble.
		*/
		function isContextInjectionMessage(data) {
			const source = data.source;
			if (source?.kind !== void 0 && source.kind !== "user") return true;
			return messageLeadText(data).startsWith(SIDE_BOUNDARY_PREFIX);
		}
		/** The events a thread produced itself: everything after the LAST
		*  `session/end-seed` marker (the fork-seed boundary). */
		function threadOwnEvents(entries) {
			const events = entries.map((entry) => entry.event);
			for (let index = events.length - 1; index >= 0; index--) if (events[index]?.type === "session/end-seed") return events.slice(index + 1);
			return events;
		}
		/**
		* Whether the thread has at least one completed turn — the save-as-new-
		* session precondition (`session.fork` refuses to fork before the first
		* `turn/end`).
		*/
		function threadHasCompletedTurn(entries) {
			return threadOwnEvents(entries).some((event) => event.type === "turn/end");
		}
		/** Whether the thread ends with a user message that no completed turn
		*  answered yet — such a pending follow-up is NOT carried into the saved
		*  session (the fork cut is the last `turn/end`). */
		function threadTrailingPending(entries) {
			const own = threadOwnEvents(entries);
			let lastUser = -1;
			let lastTurnEnd = -1;
			own.forEach((event, index) => {
				if (event.type === "user/message") lastUser = index;
				if (event.type === "turn/end") lastTurnEnd = index;
			});
			return lastUser > lastTurnEnd;
		}
		//#endregion
		//#region src/client/subagent-detect.ts
		/**
		* Side Chat threads ride the subagent origin (main-list hiding + the RPC
		* ownership fence) but they are NOT subagent topology: they carry the
		* durable 'Side: ' label and live as sidebar tabs. Excluding them here
		* keeps the auto-open trigger and the Subagent page counts clean.
		*/
		function isSideThreadSummary(summary) {
			return summary.origin === "subagent" && summary.displayTitle.startsWith("Side: ");
		}
		/** Count the direct subagent children of one session (durable `origin` rows). */
		function directSubagentCount(byId, sessionId) {
			let count = 0;
			for (const summary of Object.values(byId)) if (summary.origin === "subagent" && summary.parentId === sessionId && !isSideThreadSummary(summary)) count += 1;
			return count;
		}
		/**
		* The main agent of the current session's tree: walk the durable parent
		* chain upward until the first non-subagent session. The Subagent page shows
		* THIS root's full topology regardless of how deep the current selection is
		* (a session whose row is still hydrating, or a broken chain, degrades to
		* the session itself).
		*/
		function rootAncestor(byId, sessionId) {
			if (sessionId === void 0) return void 0;
			const seen = /* @__PURE__ */ new Set();
			let current = byId[sessionId];
			while (current !== void 0 && current.origin === "subagent" && current.parentId !== void 0 && !seen.has(current.id)) {
				seen.add(current.id);
				current = byId[current.parentId];
			}
			return current?.id ?? sessionId;
		}
		/**
		* Collect every catalog branch (an entry with `hasChildren`) reachable from
		* the root — the set of catalogs the always-expanded topology consumes.
		* Cycles fail soft.
		*/
		function collectBranchIds(catalogs, rootId) {
			const out = [];
			const seen = /* @__PURE__ */ new Set();
			const visit = (parentId) => {
				if (seen.has(parentId)) return;
				seen.add(parentId);
				for (const entry of catalogs[parentId]?.entries ?? []) if (entry.kind === "child" && entry.hasChildren) {
					out.push(entry.id);
					visit(entry.id);
				}
			};
			if (rootId !== void 0) visit(rootId);
			return out;
		}
		/**
		* Whether a new direct subagent appeared under `sessionId` between two
		* consecutive list snapshots (the count crossed 0 → >0). Switching to a
		* session that already has subagents yields `false` (its baseline starts at
		* the current count), so the auto-open never fights an existing layout.
		*/
		function detectNewDirectSubagent(prev, next, sessionId) {
			return directSubagentCount(prev.byId, sessionId) === 0 && directSubagentCount(next.byId, sessionId) > 0;
		}
		/**
		* Index every subagent descendant under each ancestor it reaches through an
		* uninterrupted subagent-origin chain (same semantics as the official
		* `indexSubagentDescendants`; cycles fail soft).
		*/
		function countSubagentDescendants(byId, sessionId) {
			const totals = {
				count: 0,
				runningCount: 0
			};
			for (const descendant of Object.values(byId)) {
				if (descendant.origin !== "subagent" || isSideThreadSummary(descendant)) continue;
				const seen = /* @__PURE__ */ new Set();
				let current = descendant;
				while (current?.origin === "subagent" && current.parentId !== void 0 && !seen.has(current.id)) {
					seen.add(current.id);
					if (current.parentId === sessionId) {
						totals.count += 1;
						if (descendant.running === true) totals.runningCount += 1;
						break;
					}
					current = byId[current.parentId];
				}
			}
			return totals;
		}
		//#endregion
		//#region src/client/subagent-jobs.ts
		/** Whether the registry still holds the job open (its duration ticks). */
		function isJobLive(job) {
			return job.status === "running" || job.status === "stopping";
		}
		/**
		* Every session id of the topology tree rooted at `rootId` (the root plus
		* each session whose uninterrupted subagent-origin chain reaches it — same
		* lineage semantics as {@link countSubagentDescendants}; cycles fail soft).
		* Sessions outside the tree (orphans, other trees) are excluded, so the
		* jobs section never shows foreign work.
		*/
		function treeSessionIds(byId, rootId) {
			const ids = /* @__PURE__ */ new Set();
			if (rootId === void 0) return ids;
			for (const summary of Object.values(byId)) {
				const seen = /* @__PURE__ */ new Set();
				let current = summary;
				let reachesRoot = false;
				while (current !== void 0 && !seen.has(current.id)) {
					seen.add(current.id);
					if (current.id === rootId) {
						reachesRoot = true;
						break;
					}
					if (current.origin !== "subagent" || current.parentId === void 0) break;
					current = byId[current.parentId];
				}
				if (reachesRoot) ids.add(summary.id);
			}
			return ids;
		}
		/**
		* Whether a NEW background job appeared for one session between two
		* consecutive list snapshots (a job id the previous snapshot lacked).
		* Unlike the subagent auto-open (0 → N only), ANY new job id triggers: the
		* agent may start several jobs over a session, and each new one should
		* surface the Jobs page (a fresh page load never triggers — its baseline
		* starts at the current snapshot).
		*/
		function detectNewJob(prev, next, sessionId) {
			const prevIds = new Set((prev.jobsBySession?.[sessionId] ?? []).map((job) => job.id));
			return (next.jobsBySession?.[sessionId] ?? []).some((job) => !prevIds.has(job.id));
		}
		/**
		* Collect the background jobs of the whole current tree, owner-labeled.
		* Sessions without a mirror entry contribute nothing; an absent mirror
		* (runtime older than the jobs feed) yields an empty list.
		*/
		function collectTreeJobs(byId, jobsBySession, rootId) {
			const rows = [];
			if (jobsBySession === void 0) return rows;
			for (const sessionId of treeSessionIds(byId, rootId)) {
				const jobs = jobsBySession[sessionId];
				if (jobs === void 0 || jobs.length === 0) continue;
				const ownerTitle = byId[sessionId]?.displayTitle ?? sessionId;
				for (const job of jobs) rows.push({
					ownerSessionId: sessionId,
					ownerTitle,
					job
				});
			}
			return rows;
		}
		/**
		* Live rows first in start order, then settled rows newest-first (mirror of
		* the official ui-jobs ordering); a tie falls back to start order so the
		* sort never depends on the host's map iteration.
		*/
		function orderJobs(rows) {
			return [...rows].sort((left, right) => {
				const liveLeft = isJobLive(left.job);
				if (liveLeft !== isJobLive(right.job)) return liveLeft ? -1 : 1;
				if (liveLeft) return left.job.startedAt - right.job.startedAt;
				const finished = (right.job.finishedAt ?? right.job.startedAt) - (left.job.finishedAt ?? left.job.startedAt);
				return finished !== 0 ? finished : left.job.startedAt - right.job.startedAt;
			});
		}
		/**
		* Status marker semantics. `stopping` and `killed` share the attention
		* color: both mean the work ended (or is ending) on request rather than on
		* its own.
		*/
		function jobDotState(status) {
			switch (status) {
				case "running": return "ongoing";
				case "stopping": return "warning";
				case "completed": return "done";
				case "killed": return "warning";
				case "failed": return "error";
			}
		}
		/** Human status word of one wire status (localized through the passed translator). */
		function jobStatusLabel(status, t) {
			switch (status) {
				case "running": return t("jobStatusRunning");
				case "stopping": return t("jobStatusStopping");
				case "completed": return t("jobStatusCompleted");
				case "killed": return t("jobStatusKilled");
				case "failed": return t("jobStatusFailed");
			}
		}
		/**
		* Elapsed time in at most two adjacent units (mirror of the official
		* ui-jobs duration wording). A background job that outlives an hour is
		* already exceptional, so hours is the widest unit.
		*/
		function formatJobDuration(elapsedMs, t) {
			const total = Math.max(0, Math.floor(elapsedMs / 1e3));
			const seconds = total % 60;
			const minutes = Math.floor(total / 60) % 60;
			const hours = Math.floor(total / 3600);
			if (hours > 0) return t("jobDurationHours", {
				hours,
				minutes
			});
			if (minutes > 0) return t("jobDurationMinutes", {
				minutes,
				seconds
			});
			return t("jobDurationSeconds", { seconds });
		}
		//#endregion
		//#region src/client/icons.tsx
		/**
		* Right-panel toggle glyph (the "侧拉" button): a frame with a filled strip
		* along its RIGHT edge, in the app's outline style (1.5px stroke,
		* currentColor).
		*/
		const IconPanelRightOutline16 = ({ size = 16, className }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
			width: size,
			height: size,
			className,
			viewBox: "0 0 16 16",
			fill: "none",
			xmlns: "http://www.w3.org/2000/svg",
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
				x: "1.5",
				y: "2",
				width: "13",
				height: "12",
				rx: "2.5",
				stroke: "currentColor",
				strokeWidth: "1.5"
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
				x: "10.5",
				y: "3.25",
				width: "2.75",
				height: "9.5",
				rx: "1",
				fill: "currentColor",
				stroke: "none"
			})]
		});
		/**
		* Bottom-panel toggle glyph (the "底栏" button): a frame with a filled strip
		* along its BOTTOM edge, in the app's outline style.
		*/
		const IconPanelBottomOutline16 = ({ size = 16, className }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
			width: size,
			height: size,
			className,
			viewBox: "0 0 16 16",
			fill: "none",
			xmlns: "http://www.w3.org/2000/svg",
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
				x: "1.5",
				y: "2",
				width: "13",
				height: "12",
				rx: "2.5",
				stroke: "currentColor",
				strokeWidth: "1.5"
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
				x: "3.25",
				y: "10",
				width: "9.5",
				height: "2.75",
				rx: "1",
				fill: "currentColor",
				stroke: "none"
			})]
		});
		/**
		* Terminal glyph in the app's outline style (1.5px stroke, currentColor):
		* a rounded frame with a prompt chevron and underscore cursor.
		*/
		const IconTerminalOutline16 = ({ size = 16, className }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
			width: size,
			height: size,
			className,
			viewBox: "0 0 16 16",
			fill: "none",
			xmlns: "http://www.w3.org/2000/svg",
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
					x: "1.5",
					y: "2.5",
					width: "13",
					height: "11",
					rx: "2",
					stroke: "currentColor",
					strokeWidth: "1.5"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M4.5 6.25 6.75 8 4.5 9.75",
					stroke: "currentColor",
					strokeWidth: "1.5",
					strokeLinecap: "round",
					strokeLinejoin: "round"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M8.5 10.4h3",
					stroke: "currentColor",
					strokeWidth: "1.5",
					strokeLinecap: "round"
				})
			]
		});
		/** Diff glyph in the app's outline style: a file frame with a plus and a minus row. */
		const IconDiffOutline16 = ({ size = 16, className }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
			width: size,
			height: size,
			className,
			viewBox: "0 0 16 16",
			fill: "none",
			xmlns: "http://www.w3.org/2000/svg",
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
					x: "1.5",
					y: "1.5",
					width: "13",
					height: "13",
					rx: "2.5",
					stroke: "currentColor",
					strokeWidth: "1.5"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M4 5h3M5.5 3.5v3",
					stroke: "currentColor",
					strokeWidth: "1.5",
					strokeLinecap: "round"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M9.5 12.5h2.5",
					stroke: "currentColor",
					strokeWidth: "1.5",
					strokeLinecap: "round"
				})
			]
		});
		/**
		* Stop glyph for the background-job kill button: a filled square in the
		* app's outline scale (16), the universal "halt this work" mark.
		*/
		const IconStopOutline16 = ({ size = 16, className }) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
			width: size,
			height: size,
			className,
			viewBox: "0 0 16 16",
			fill: "none",
			xmlns: "http://www.w3.org/2000/svg",
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
				x: "4",
				y: "4",
				width: "8",
				height: "8",
				rx: "1.5",
				fill: "currentColor",
				stroke: "none"
			})
		});
		/** Upload glyph in the app's outline style: an arrow rising into a tray
		*  (the file-manager "upload into the workspace" action). */
		const IconUploadOutline16 = ({ size = 16, className }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
			width: size,
			height: size,
			className,
			viewBox: "0 0 16 16",
			fill: "none",
			xmlns: "http://www.w3.org/2000/svg",
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
				d: "M8 10V2.75M4.75 5.5 8 2.25 11.25 5.5",
				stroke: "currentColor",
				strokeWidth: "1.5",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
				d: "M2.75 10.5v2.25A1.25 1.25 0 0 0 4 14h8a1.25 1.25 0 0 0 1.25-1.25V10.5",
				stroke: "currentColor",
				strokeWidth: "1.5",
				strokeLinecap: "round"
			})]
		});
		/** Image viewer glyph: a picture frame with a sun and a mountain. */
		const IconImageOutline16 = ({ size = 16, className }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
			width: size,
			height: size,
			className,
			viewBox: "0 0 16 16",
			fill: "none",
			xmlns: "http://www.w3.org/2000/svg",
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
					x: "1.5",
					y: "2.5",
					width: "13",
					height: "11",
					rx: "2",
					stroke: "currentColor",
					strokeWidth: "1.5"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: "5.5",
					cy: "6",
					r: "1.2",
					stroke: "currentColor",
					strokeWidth: "1.5"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "m3.5 12 3-3 2.25 2.25L11.5 8.5 13 10.5",
					stroke: "currentColor",
					strokeWidth: "1.5",
					strokeLinecap: "round",
					strokeLinejoin: "round"
				})
			]
		});
		/** PDF viewer glyph: a document frame with the "PDF" label. */
		const IconPdfOutline16 = ({ size = 16, className }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
			width: size,
			height: size,
			className,
			viewBox: "0 0 16 16",
			fill: "none",
			xmlns: "http://www.w3.org/2000/svg",
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M3.5 1.5h6.5L13.5 5v9.5h-10z",
					stroke: "currentColor",
					strokeWidth: "1.5",
					strokeLinejoin: "round"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M9.5 1.5V5h4",
					stroke: "currentColor",
					strokeWidth: "1.5",
					strokeLinejoin: "round"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M5 13.5v-3h1.4c.75 0 1.1.32 1.1.85 0 .54-.35.85-1.1.85H5.3",
					stroke: "currentColor",
					strokeWidth: "1.25",
					strokeLinecap: "round",
					strokeLinejoin: "round"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M8.3 13.5v-3h1.05c.8 0 1.35.5 1.35 1.5s-.55 1.5-1.35 1.5z",
					stroke: "currentColor",
					strokeWidth: "1.25",
					strokeLinecap: "round",
					strokeLinejoin: "round"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M11.6 13.5v-3h1.3",
					stroke: "currentColor",
					strokeWidth: "1.25",
					strokeLinecap: "round"
				})
			]
		});
		/** Markdown viewer glyph: the classic "M with a down arrow" badge. */
		const IconMarkdownOutline16 = ({ size = 16, className }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
			width: size,
			height: size,
			className,
			viewBox: "0 0 16 16",
			fill: "none",
			xmlns: "http://www.w3.org/2000/svg",
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
				x: "1.5",
				y: "2.5",
				width: "13",
				height: "11",
				rx: "2",
				stroke: "currentColor",
				strokeWidth: "1.5"
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
				d: "M4 10.5V5.5l2 2.5 2-2.5v5M9.5 10.5v-5l2 2.5 2-2.5v5",
				stroke: "currentColor",
				strokeWidth: "1.5",
				strokeLinecap: "round",
				strokeLinejoin: "round"
			})]
		});
		/** HTML viewer glyph: a document frame with a "‹/›" tag pair. */
		const IconHtmlOutline16 = ({ size = 16, className }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
			width: size,
			height: size,
			className,
			viewBox: "0 0 16 16",
			fill: "none",
			xmlns: "http://www.w3.org/2000/svg",
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M3.5 1.5h6.5L13.5 5v9.5h-10z",
					stroke: "currentColor",
					strokeWidth: "1.5",
					strokeLinejoin: "round"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M9.5 1.5V5h4",
					stroke: "currentColor",
					strokeWidth: "1.5",
					strokeLinejoin: "round"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M5.6 13.2 4.2 10l1.4-3.2M7.4 6.8 8.8 10l-1.4 3.2",
					stroke: "currentColor",
					strokeWidth: "1.25",
					strokeLinecap: "round",
					strokeLinejoin: "round"
				})
			]
		});
		/** Browser tab glyph: a globe with meridians. */
		const IconGlobeOutline16 = ({ size = 16, className }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
			width: size,
			height: size,
			className,
			viewBox: "0 0 16 16",
			fill: "none",
			xmlns: "http://www.w3.org/2000/svg",
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: "8",
					cy: "8",
					r: "6.5",
					stroke: "currentColor",
					strokeWidth: "1.5"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ellipse", {
					cx: "8",
					cy: "8",
					rx: "2.8",
					ry: "6.5",
					stroke: "currentColor",
					strokeWidth: "1.5"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M1.5 8h13M8 1.5c-2.4 1.8-2.4 11.2 0 13M8 1.5c2.4 1.8 2.4 11.2 0 13",
					stroke: "currentColor",
					strokeWidth: "1.5",
					strokeLinecap: "round"
				})
			]
		});
		/** History glyph (thread switcher): a clock with a counterclockwise arrow,
		*  in the app's outline style — the "past conversations" mark. */
		const IconHistoryOutline16 = ({ size = 16, className }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
			width: size,
			height: size,
			className,
			viewBox: "0 0 16 16",
			fill: "none",
			xmlns: "http://www.w3.org/2000/svg",
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M2.4 6.8A5.6 5.6 0 1 1 2.4 9.2",
					stroke: "currentColor",
					strokeWidth: "1.5",
					strokeLinecap: "round"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M2.2 3.4v3.4h3.4",
					stroke: "currentColor",
					strokeWidth: "1.5",
					strokeLinecap: "round",
					strokeLinejoin: "round"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M8 5.4V8l1.9 1.2",
					stroke: "currentColor",
					strokeWidth: "1.5",
					strokeLinecap: "round",
					strokeLinejoin: "round"
				})
			]
		});
		/** Save glyph (save-as-new-session): the classic floppy disk, in the app's
		*  outline style. */
		const IconSaveOutline16 = ({ size = 16, className }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
			width: size,
			height: size,
			className,
			viewBox: "0 0 16 16",
			fill: "none",
			xmlns: "http://www.w3.org/2000/svg",
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M4.2 14.5h7.6a1.2 1.2 0 0 0 1.2-1.2V4.9L10.6 2.5H4.2A1.2 1.2 0 0 0 3 3.7v9.6a1.2 1.2 0 0 0 1.2 1.2z",
					stroke: "currentColor",
					strokeWidth: "1.5",
					strokeLinejoin: "round"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M10 2.5v2.6H5.6V2.5",
					stroke: "currentColor",
					strokeWidth: "1.5",
					strokeLinejoin: "round"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M5.4 14.5v-4.2h5.2v4.2",
					stroke: "currentColor",
					strokeWidth: "1.5",
					strokeLinejoin: "round"
				})
			]
		});
		/**
		* Visual Studio Code brand mark for the file-tree "open with" menu. The
		* path is the Simple Icons `visualstudiocode` glyph (CC0 1.0,
		* simple-icons@11.0.0 — later releases dropped it over Microsoft's brand
		* policy, so it is inlined here rather than pulled from react-icons),
		* rendered monochrome via currentColor to follow the active skin.
		*/
		const IconVscode16 = ({ size = 16, className }) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
			width: size,
			height: size,
			className,
			viewBox: "0 0 24 24",
			fill: "currentColor",
			xmlns: "http://www.w3.org/2000/svg",
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zm-5.146 14.861L10.826 12l7.178-5.448v10.896z" })
		});
		//#endregion
		//#region \0dsh-css:C:\Users\delinger\Desktop\dsh\dsh-desktop\assets\plugins\dsh-better-sidebar\src\client\SubagentView.module.css.mjs
		const css$2 = ".-OIQdq_subagent{flex-direction:column;flex:1;min-height:0;display:flex}.-OIQdq_subagentHeader{flex:none;align-items:center;gap:8px;height:36px;padding:0 8px 0 12px;display:flex}.-OIQdq_subagentTitle{min-width:0;font:var(--dsw-font-s-14);color:var(--dsw-alias-label-secondary);text-overflow:ellipsis;white-space:nowrap;flex:1;overflow:hidden}.-OIQdq_subagentCount{font:var(--dsw-font-xxxs-11);color:var(--dsw-alias-label-tertiary);flex:none}.-OIQdq_subagentRefresh{width:24px;height:24px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-radius:6px;flex:none;justify-content:center;align-items:center;display:inline-flex}.-OIQdq_subagentRefresh:hover{background:var(--dsw-alias-interactive-bg-hover)}.-OIQdq_subagentBody{flex:1;min-height:0;padding:2px 6px 8px;overflow-y:auto}.-OIQdq_subagentRow{box-sizing:border-box;width:100%;min-height:50px;font:var(--dsw-font-s-14);color:var(--dsw-alias-label-primary);text-align:left;cursor:pointer;background:0 0;border:none;border-radius:8px;outline:none;align-items:flex-start;gap:8px;padding:7px 8px 7px 11px;display:flex;position:relative}.-OIQdq_subagentRow:hover,.-OIQdq_subagentRow:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}.-OIQdq_subagentRowActive,.-OIQdq_subagentRowActive:hover,.-OIQdq_subagentRowActive:focus-visible{background:var(--dsw-alias-interactive-bg-active)}.-OIQdq_subagentRowDisabled{color:var(--dsw-alias-label-dimmed);cursor:not-allowed}.-OIQdq_subagentRowDisabled:hover{background:0 0}.-OIQdq_subagentRowLoading{cursor:default}.-OIQdq_subagentDot{margin-top:4px}.-OIQdq_subagentContent{flex-direction:column;flex:1;gap:2px;min-width:0;display:flex}.-OIQdq_subagentLabel,.-OIQdq_subagentSecondary{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.-OIQdq_subagentLabel{color:inherit;font-weight:400}.-OIQdq_subagentSecondary{font:var(--dsw-font-xxxs-11);color:var(--dsw-alias-label-tertiary)}.-OIQdq_subagentLive{min-width:0;font:var(--dsw-font-xxxs-11);color:var(--dsw-alias-label-tertiary);align-items:baseline;gap:4px;display:flex;overflow:hidden}.-OIQdq_subagentLiveTool{font:var(--dsw-font-xxxs-strong-11);color:var(--dsw-alias-label-secondary);flex:none}.-OIQdq_subagentLiveArgs{min-width:0;font-family:var(--ds-font-family-code);font-size:var(--dsw-font-xxxs-11-font-size);line-height:var(--dsw-font-xxxs-11-line-height);color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.-OIQdq_subagentLiveText{-webkit-line-clamp:2;font:var(--dsw-font-xxxs-11);color:var(--dsw-alias-label-secondary);-webkit-box-orient:vertical;display:-webkit-box;overflow:hidden}.-OIQdq_subagentNode{min-width:0;position:relative}.-OIQdq_subagentChildren{margin-left:18px;padding-left:4px;position:relative}.-OIQdq_subagentChildren:before{content:\"\";border-left:1px solid var(--dsw-alias-border-l2);height:26px;position:absolute;top:-26px;left:0}.-OIQdq_subagentChildren[aria-busy=true]:before{content:none}.-OIQdq_subagentChildren>.-OIQdq_subagentNode:before{content:\"\";border-left:1px solid var(--dsw-alias-border-l2);position:absolute;top:0;bottom:0;left:-4px}.-OIQdq_subagentChildren>.-OIQdq_subagentNode:last-child:before{height:17px;bottom:auto}.-OIQdq_subagentChildren>.-OIQdq_subagentNode>.-OIQdq_subagentRow:before{content:\"\";border-top:1px solid var(--dsw-alias-border-l2);width:14px;position:absolute;top:16px;left:-4px}.-OIQdq_subagentEmpty{font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-tertiary);text-align:center;flex-direction:column;gap:2px;padding:16px;display:flex}.-OIQdq_subagentEmptyHint{font:var(--dsw-font-xxxs-11);color:var(--dsw-alias-label-dimmed)}.-OIQdq_subagentError{font:var(--dsw-font-xxs-12);color:var(--dsw-alias-state-error-primary);justify-content:space-between;align-items:center;gap:8px;padding:8px 10px;display:flex}.-OIQdq_subagentErrorRetry{height:24px;color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xxxs-strong-11);cursor:pointer;background:0 0;border:none;border-radius:6px;flex:none;align-items:center;gap:4px;padding:0 8px;display:inline-flex}.-OIQdq_subagentErrorRetry:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.-OIQdq_jobs{border-top:1px solid var(--dsw-alias-border-l2);margin-top:10px;padding-top:8px}.-OIQdq_jobsHeader{align-items:center;gap:8px;height:26px;padding:0 2px;display:flex}.-OIQdq_jobsTitle{min-width:0;font:var(--dsw-font-xxxs-strong-11);color:var(--dsw-alias-label-secondary);text-overflow:ellipsis;white-space:nowrap;flex:1;overflow:hidden}.-OIQdq_jobsCount{font:var(--dsw-font-xxxs-11);color:var(--dsw-alias-label-tertiary);flex:none}.-OIQdq_jobsList{flex-direction:column;gap:2px;margin:0;padding:0;list-style:none;display:flex}.-OIQdq_jobsRow{border-radius:8px;align-items:center;gap:4px;display:flex}.-OIQdq_jobsRow:hover{background:var(--dsw-alias-interactive-bg-hover)}.-OIQdq_jobsRowSettled{opacity:.8}.-OIQdq_jobsRowSelected,.-OIQdq_jobsRowSelected:hover{background:var(--dsw-alias-interactive-bg-active)}.-OIQdq_jobsRowMain{min-width:0;font:var(--dsw-font-s-14);color:var(--dsw-alias-label-primary);text-align:left;cursor:pointer;background:0 0;border:none;border-radius:8px;outline:none;flex:1;align-items:flex-start;gap:8px;padding:6px 8px 6px 11px;display:flex}.-OIQdq_jobsRowMain:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}.-OIQdq_jobsDot{margin-top:5px}.-OIQdq_jobsContent{flex-direction:column;gap:1px;min-width:0;display:flex}.-OIQdq_jobsLabelLine{align-items:center;gap:6px;min-width:0;display:flex}.-OIQdq_jobsKind{text-overflow:ellipsis;white-space:nowrap;border:1px solid var(--dsw-alias-border-l2);max-width:90px;font:var(--dsw-font-xxxs-strong-11);color:var(--dsw-alias-label-tertiary);border-radius:4px;flex:none;padding:0 5px;line-height:14px;overflow:hidden}.-OIQdq_jobsLabel{text-overflow:ellipsis;white-space:nowrap;min-width:0;font-family:var(--ds-font-family-code);font-size:var(--dsw-font-xxxs-11-font-size);line-height:var(--dsw-font-xxxs-11-line-height);color:var(--dsw-alias-label-primary);flex:1;overflow:hidden}.-OIQdq_jobsSecondary{text-overflow:ellipsis;white-space:nowrap;font:var(--dsw-font-xxxs-11);color:var(--dsw-alias-label-tertiary);overflow:hidden}.-OIQdq_jobsKill{width:22px;height:22px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-radius:6px;flex:none;justify-content:center;align-items:center;margin-right:4px;display:inline-flex}.-OIQdq_jobsKill:hover{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent);color:var(--dsw-alias-state-error-primary)}.-OIQdq_jobsKillArmed,.-OIQdq_jobsKillArmed:hover{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent);width:auto;height:20px;color:var(--dsw-alias-state-error-primary);font:var(--dsw-font-xxxs-strong-11);white-space:nowrap;padding:0 8px}.-OIQdq_jobsKill:disabled{opacity:.5;cursor:default}.-OIQdq_jobsKillError{font:var(--dsw-font-xxxs-11);color:var(--dsw-alias-state-error-primary);flex:none;margin-right:4px}.-OIQdq_jobsPane{z-index:1;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);border-radius:8px;margin-top:4px;position:sticky;bottom:0;overflow:hidden;box-shadow:0 -6px 12px -8px #00000059}.-OIQdq_jobsPaneHeader{border-bottom:1px solid var(--dsw-alias-border-l1);align-items:center;gap:6px;height:28px;padding:0 4px 0 10px;display:flex}.-OIQdq_jobsPaneDot{flex:none}.-OIQdq_jobsPaneLabel{text-overflow:ellipsis;white-space:nowrap;min-width:0;font-family:var(--ds-font-family-code);font-size:var(--dsw-font-xxxs-11-font-size);line-height:var(--dsw-font-xxxs-11-line-height);color:var(--dsw-alias-label-primary);flex:1;overflow:hidden}.-OIQdq_jobsPaneStatus{font:var(--dsw-font-xxxs-11);color:var(--dsw-alias-label-tertiary);flex:none}.-OIQdq_jobsPaneClose{width:20px;height:20px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-radius:5px;flex:none;justify-content:center;align-items:center;display:inline-flex}.-OIQdq_jobsPaneClose:hover{background:var(--dsw-alias-interactive-bg-hover)}.-OIQdq_jobsPanePre{max-height:200px;font-family:var(--ds-font-family-code);font-size:var(--dsw-font-xxxs-11-font-size);color:var(--dsw-alias-label-primary);white-space:pre-wrap;word-break:break-word;margin:0;padding:6px 10px;line-height:1.5;overflow:auto}.-OIQdq_jobsPaneHint{font:var(--dsw-font-xxxs-11);color:var(--dsw-alias-label-tertiary);padding:8px 10px}.-OIQdq_jobsPaneError{color:var(--dsw-alias-state-error-primary)}";
		const tagId$2 = "dsh-better-sidebar/SubagentView.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$2) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-better-sidebar";
			tag.dataset.pluginCss = tagId$2;
			tag.textContent = css$2;
			document.head.appendChild(tag);
		}
		var SubagentView_module_css_default = {
			"subagentContent": "-OIQdq_subagentContent",
			"jobsList": "-OIQdq_jobsList",
			"subagentHeader": "-OIQdq_subagentHeader",
			"subagentEmptyHint": "-OIQdq_subagentEmptyHint",
			"subagentLiveTool": "-OIQdq_subagentLiveTool",
			"jobsCount": "-OIQdq_jobsCount",
			"jobsContent": "-OIQdq_jobsContent",
			"subagentLive": "-OIQdq_subagentLive",
			"subagentError": "-OIQdq_subagentError",
			"jobsTitle": "-OIQdq_jobsTitle",
			"jobsRowMain": "-OIQdq_jobsRowMain",
			"subagentBody": "-OIQdq_subagentBody",
			"subagentErrorRetry": "-OIQdq_subagentErrorRetry",
			"jobsDot": "-OIQdq_jobsDot",
			"jobsKillArmed": "-OIQdq_jobsKillArmed",
			"jobsRowSelected": "-OIQdq_jobsRowSelected",
			"subagentCount": "-OIQdq_subagentCount",
			"subagent": "-OIQdq_subagent",
			"subagentRow": "-OIQdq_subagentRow",
			"jobsRowSettled": "-OIQdq_jobsRowSettled",
			"jobsLabel": "-OIQdq_jobsLabel",
			"jobsSecondary": "-OIQdq_jobsSecondary",
			"jobsHeader": "-OIQdq_jobsHeader",
			"subagentLiveText": "-OIQdq_subagentLiveText",
			"jobsKill": "-OIQdq_jobsKill",
			"jobsPane": "-OIQdq_jobsPane",
			"jobsPaneHeader": "-OIQdq_jobsPaneHeader",
			"subagentNode": "-OIQdq_subagentNode",
			"subagentTitle": "-OIQdq_subagentTitle",
			"jobsPaneDot": "-OIQdq_jobsPaneDot",
			"jobsPaneLabel": "-OIQdq_jobsPaneLabel",
			"subagentEmpty": "-OIQdq_subagentEmpty",
			"jobsPaneStatus": "-OIQdq_jobsPaneStatus",
			"jobsPanePre": "-OIQdq_jobsPanePre",
			"subagentRefresh": "-OIQdq_subagentRefresh",
			"jobsLabelLine": "-OIQdq_jobsLabelLine",
			"subagentChildren": "-OIQdq_subagentChildren",
			"jobsKillError": "-OIQdq_jobsKillError",
			"subagentDot": "-OIQdq_subagentDot",
			"jobsPaneClose": "-OIQdq_jobsPaneClose",
			"jobsPaneHint": "-OIQdq_jobsPaneHint",
			"jobsPaneError": "-OIQdq_jobsPaneError",
			"subagentRowDisabled": "-OIQdq_subagentRowDisabled",
			"jobs": "-OIQdq_jobs",
			"subagentLabel": "-OIQdq_subagentLabel",
			"jobsRow": "-OIQdq_jobsRow",
			"jobsKind": "-OIQdq_jobsKind",
			"subagentRowActive": "-OIQdq_subagentRowActive",
			"subagentSecondary": "-OIQdq_subagentSecondary",
			"subagentLiveArgs": "-OIQdq_subagentLiveArgs",
			"subagentRowLoading": "-OIQdq_subagentRowLoading"
		};
		//#endregion
		//#region src/client/SubagentView.tsx
		/**
		* Subagent page: the FULL agent topology of the current tree's main session.
		*
		* The root is resolved by walking the durable parent chain upward from the
		* current session to the first non-subagent session — the MAIN session — and
		* every subagent under it shares this one topology view, no matter how deep
		* the current selection is (including a subagent transcript opened in the
		* main view). The main agent renders as the root node card (click it to jump
		* back to the main session), with its subagents hanging below it in clearly
		* LAYERED levels: tree connector lines (first level included) and per-level
		* indentation show the hierarchy, and the currently-open session is
		* highlighted in place. Every branch is expanded automatically (lazy
		* catalogs hydrate on demand and consume live membership while visible).
		*
		* Each node card carries live status (state dot, durable label, mode and
		* activity); while a child RUNS, its card additionally shows the LAST text
		* output and LAST tool call pulled from its history tail, auto-refreshing
		* every few seconds while the page is visible. Clicking a card jumps
		* straight into the child transcript (`openSubagent`); the page stays open
		* and the topology remains rooted at the main session.
		*/
		/** Refresh cadence of the live "last text + tool call" lines while a child runs. */
		const POLL_MS$1 = 3e3;
		/** Preview cap of one tool-call argument line. */
		const ARGS_PREVIEW = 60;
		/** Refresh cadence of an expanded job-output panel while its job runs. */
		const JOB_POLL_MS = 2e3;
		/** How long the kill button stays armed before it needs re-confirming. */
		const JOB_KILL_ARM_MS = 3e3;
		/** The direct subagent children of one parent (durable `origin` rows;
		*  Side Chat threads ride the same origin but are tab-strip conversations,
		*  never topology). */
		function directChildren(byId, parentSessionId) {
			return Object.values(byId).filter((summary) => summary.origin === "subagent" && summary.parentId === parentSessionId && !isSideThreadSummary(summary));
		}
		/** Human label of one catalog child: durable label, then summary title, then id. */
		function childLabel(entry, summary) {
			return entry.label ?? summary?.displayTitle ?? entry.id;
		}
		function diagnosticReason(entry) {
			switch (entry.reason) {
				case "corrupt": return t("subagentDiagCorrupt");
				case "unsupported": return t("subagentDiagUnsupported");
				case "unavailable": return t("subagentDiagUnavailable");
			}
		}
		/** The secondary line of one card: title · mode · activity (skips empty parts). */
		function cardSecondary(summary, entry) {
			return [
				summary?.displayTitle,
				entry.mode === "one-shot" ? t("subagentModeOneShot") : t("subagentModeContinuable"),
				entry.activity === "running" ? t("subagentRunning") : t("subagentInactive")
			].filter(Boolean).join(" · ");
		}
		/** First `limit` characters with an ellipsis when truncated. */
		function preview(text, limit) {
			return text.length > limit ? `${text.slice(0, limit)}…` : text;
		}
		/** Collapse whitespace for the single-paragraph live-text preview. */
		function flatten(text) {
			return text.replace(/\s+/g, " ").trim();
		}
		/** Disabled "loading…" cards backed by the summary mirror while a catalog hydrates. */
		function CatalogLoadingRows(props) {
			const { parentSessionId, byId, level } = props;
			const children = directChildren(byId, parentSessionId);
			if (children.length === 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: SubagentView_module_css_default.subagentEmpty,
				children: t("loading")
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: children.map((summary) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				role: "treeitem",
				"aria-disabled": "true",
				"aria-level": level,
				"aria-label": t("loading"),
				className: `${SubagentView_module_css_default.subagentRow} ${SubagentView_module_css_default.subagentRowDisabled} ${SubagentView_module_css_default.subagentRowLoading}`,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, {
					state: summary.running === true ? "ongoing" : "done",
					className: SubagentView_module_css_default.subagentDot
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: SubagentView_module_css_default.subagentContent,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: SubagentView_module_css_default.subagentLabel,
						children: t("loading")
					})
				})]
			}, summary.id)) });
		}
		/**
		* The live lines of one RUNNING subagent card: a pure presentation of the
		* batch `subagents.live` activity. The polling lives in one place (the
		* SubagentView hook), not per card. A running child with neither output yet
		* reads "thinking…".
		*/
		function SubagentLiveLines(props) {
			const { live } = props;
			if (live?.text === void 0 && live?.tool === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: SubagentView_module_css_default.subagentLive,
				children: t("subagentThinking")
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [live.tool !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: SubagentView_module_css_default.subagentLive,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: SubagentView_module_css_default.subagentLiveTool,
					children: live.tool.name
				}), live.tool.args !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: SubagentView_module_css_default.subagentLiveArgs,
					children: preview(live.tool.args, ARGS_PREVIEW)
				})]
			}), live.text !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: SubagentView_module_css_default.subagentLiveText,
				children: flatten(live.text)
			})] });
		}
		/**
		* One shared live-preview poller for the whole Subagent tree. Unlike the old
		* per-card `subagents.history` timers, this sends at most ONE `subagents.live`
		* request at a time: a recursive timeout starts only after the previous
		* request settles, so a slow host never sees abort/restart storms.
		*/
		function useSubagentLive(rootId, active) {
			const [live, setLive] = (0, react.useState)({});
			const controllerRef = (0, react.useRef)(void 0);
			(0, react.useEffect)(() => {
				setLive({});
			}, [rootId]);
			(0, react.useEffect)(() => {
				if (rootId === void 0 || !active) return;
				const targetRootId = rootId;
				let disposed = false;
				let timer;
				const schedule = () => {
					if (disposed) return;
					timer = window.setTimeout(() => {
						load();
					}, POLL_MS$1);
				};
				async function load() {
					if (disposed) return;
					const controller = new AbortController();
					controllerRef.current = controller;
					try {
						const result = await api.subagentsLive(targetRootId, controller.signal);
						if (!disposed) setLive(result.live);
					} catch {} finally {
						if (controllerRef.current === controller) controllerRef.current = void 0;
						if (!disposed) schedule();
					}
				}
				load();
				return () => {
					disposed = true;
					if (timer !== void 0) window.clearTimeout(timer);
					controllerRef.current?.abort();
					controllerRef.current = void 0;
				};
			}, [rootId, active]);
			return live;
		}
		/** Render one topology level; branches are always expanded (lazy catalogs). */
		function CatalogRows({ parentSessionId, catalog, catalogs, byId, level, currentSessionId, live, openChild, refresh }) {
			const emptyLoading = catalog?.state === "loading" && catalog.entries.length === 0;
			const visibleEntries = (catalog?.entries ?? []).filter((entry) => {
				if (entry.kind === "child") return !(entry.label?.startsWith("Side: ") ?? false);
				return !(byId[entry.id]?.displayTitle.startsWith("Side: ") ?? false);
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				emptyLoading && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CatalogLoadingRows, {
					parentSessionId,
					byId,
					level
				}),
				catalog?.state === "error" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: SubagentView_module_css_default.subagentError,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: catalog.error?.message ?? t("error") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: SubagentView_module_css_default.subagentErrorRetry,
						onClick: () => {
							refresh(parentSessionId);
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRefreshOutline14, {}), t("retry")]
					})]
				}),
				visibleEntries.map((entry) => {
					if (entry.kind === "diagnostic") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: SubagentView_module_css_default.subagentNode,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							role: "treeitem",
							"aria-disabled": "true",
							"aria-level": level,
							className: `${SubagentView_module_css_default.subagentRow} ${SubagentView_module_css_default.subagentRowDisabled}`,
							title: diagnosticReason(entry),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, {
								state: "error",
								className: SubagentView_module_css_default.subagentDot
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: SubagentView_module_css_default.subagentContent,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: SubagentView_module_css_default.subagentLabel,
									children: entry.id
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: SubagentView_module_css_default.subagentSecondary,
									children: diagnosticReason(entry)
								})]
							})]
						})
					}, entry.id);
					const childCatalog = catalogs[entry.id];
					const knownLeaf = !entry.hasChildren;
					const summary = byId[entry.id];
					const label = childLabel(entry, summary);
					const secondary = cardSecondary(summary, entry);
					const childLoading = childCatalog === void 0 || childCatalog.state === "loading" && childCatalog.entries.length === 0;
					const address = {
						parentSessionId,
						childSessionId: entry.id,
						mode: entry.mode
					};
					const current = entry.id === currentSessionId;
					return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: SubagentView_module_css_default.subagentNode,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							role: "treeitem",
							tabIndex: 0,
							"aria-level": level,
							"aria-label": `${label} ${secondary}`,
							"aria-current": current ? "true" : void 0,
							...knownLeaf ? {} : { "aria-expanded": true },
							className: clsx(SubagentView_module_css_default.subagentRow, current && SubagentView_module_css_default.subagentRowActive),
							onClick: () => {
								openChild(address);
							},
							onKeyDown: (event) => {
								if (event.key === "Enter" || event.key === " ") {
									event.preventDefault();
									event.stopPropagation();
									openChild(address);
								}
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, {
								state: entry.activity === "running" ? "ongoing" : "done",
								className: SubagentView_module_css_default.subagentDot
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: SubagentView_module_css_default.subagentContent,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: SubagentView_module_css_default.subagentLabel,
										children: label
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: SubagentView_module_css_default.subagentSecondary,
										children: secondary
									}),
									entry.activity === "running" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SubagentLiveLines, { live: live[entry.id] })
								]
							})]
						}), !knownLeaf && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							role: "group",
							className: SubagentView_module_css_default.subagentChildren,
							"aria-busy": childLoading || void 0,
							children: childCatalog === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CatalogLoadingRows, {
								parentSessionId: entry.id,
								byId,
								level: level + 1
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CatalogRows, {
								parentSessionId: entry.id,
								catalog: childCatalog,
								catalogs,
								byId,
								level: level + 1,
								currentSessionId,
								live,
								openChild,
								refresh
							})
						})]
					}, entry.id);
				})
			] });
		}
		/**
		* The shared output dock of the jobs section: ONE pane at the bottom of the
		* sidebar body (sticky, terminal-like) shows the SELECTED job's output as
		* the MODEL has read it so far (replayed from the owner session's event
		* log), refreshed every {@link JOB_POLL_MS} while the job runs and the
		* page is visible. The model's `job_output` cursor is never touched — the
		* pane can never steal the agent's bytes, and it stays empty until the
		* agent reads the job. A single dock — not a panel per row — keeps the
		* job list compact and stable when many jobs are running.
		*/
		function JobOutputPane(props) {
			const { ownerSessionId, job, active, onClose } = props;
			const [state, setState] = (0, react.useState)("loading");
			const controllerRef = (0, react.useRef)(void 0);
			const preRef = (0, react.useRef)(null);
			const load = (0, react.useCallback)(async () => {
				controllerRef.current?.abort();
				const controller = new AbortController();
				controllerRef.current = controller;
				try {
					const result = await api.jobOutput({ sessionId: ownerSessionId }, job.id, controller.signal);
					setState(result);
				} catch {
					setState((current) => current === "loading" ? "error" : current);
				}
			}, [ownerSessionId, job.id]);
			(0, react.useEffect)(() => {
				load();
				if (!active || !isJobLive(job)) return;
				const timer = window.setInterval(() => {
					load();
				}, JOB_POLL_MS);
				return () => {
					window.clearInterval(timer);
				};
			}, [
				load,
				active,
				job.status
			]);
			(0, react.useEffect)(() => () => {
				controllerRef.current?.abort();
			}, []);
			(0, react.useEffect)(() => {
				if (!isJobLive(job) || typeof state !== "object" || state.text.length === 0) return;
				const pre = preRef.current;
				if (pre !== null) pre.scrollTop = pre.scrollHeight;
			}, [state, job.status]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: SubagentView_module_css_default.jobsPane,
				role: "region",
				"aria-label": `${job.label} ${t("jobs")}`,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: SubagentView_module_css_default.jobsPaneHeader,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, {
								state: jobDotState(job.status),
								className: SubagentView_module_css_default.jobsPaneDot
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: SubagentView_module_css_default.jobsPaneLabel,
								title: job.label,
								children: job.label
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: SubagentView_module_css_default.jobsPaneStatus,
								children: [jobStatusLabel(job.status, t), job.detail !== void 0 && job.detail !== "" ? ` · ${job.detail}` : ""]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: SubagentView_module_css_default.jobsPaneClose,
								"aria-label": t("close"),
								title: t("close"),
								onClick: onClose,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconStopOutline16, { size: 10 })
							})
						]
					}),
					state === "loading" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: SubagentView_module_css_default.jobsPaneHint,
						children: t("loading")
					}),
					state === "error" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: `${SubagentView_module_css_default.jobsPaneHint} ${SubagentView_module_css_default.jobsPaneError}`,
						children: t("jobOutputError")
					}),
					typeof state === "object" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [state.text.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
						ref: preRef,
						className: SubagentView_module_css_default.jobsPanePre,
						children: state.text
					}) : state.read ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: SubagentView_module_css_default.jobsPaneHint,
						children: t("jobNoOutput")
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: SubagentView_module_css_default.jobsPaneHint,
						children: t("jobNotReadYet")
					}), state.truncated && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: SubagentView_module_css_default.jobsPaneHint,
						children: t("jobOutputTruncated")
					})] })
				]
			});
		}
		/**
		* The background-job section of the Subagent page: every job of the whole
		* current tree (main agent + subagents, owner-labeled), fed by the harness
		* `session/jobs` push mirror. Clicking a row feeds its model-read output to
		* the shared bottom dock (event replay — never the model's cursor); live
		* rows carry a two-click-confirm kill button. Renders nothing while the
		* tree has no jobs.
		*/
		function JobsSection(props) {
			const { byId, jobsBySession, rootId, active } = props;
			const rows = (0, react.useMemo)(() => orderJobs(collectTreeJobs(byId, jobsBySession, rootId)), [
				byId,
				jobsBySession,
				rootId
			]);
			const [selectedId, setSelectedId] = (0, react.useState)(void 0);
			const [armedId, setArmedId] = (0, react.useState)(void 0);
			const [killingId, setKillingId] = (0, react.useState)(void 0);
			const [killErrorId, setKillErrorId] = (0, react.useState)(void 0);
			const [now, setNow] = (0, react.useState)(() => Date.now());
			const selectedRow = (0, react.useMemo)(() => selectedId === void 0 ? void 0 : rows.find((row) => row.job.id === selectedId), [rows, selectedId]);
			const liveCount = (0, react.useMemo)(() => rows.reduce((count, row) => count + (isJobLive(row.job) ? 1 : 0), 0), [rows]);
			const multiOwner = (0, react.useMemo)(() => new Set(rows.map((row) => row.ownerSessionId)).size > 1, [rows]);
			(0, react.useEffect)(() => {
				if (armedId === void 0) return;
				const timer = window.setTimeout(() => {
					setArmedId(void 0);
				}, JOB_KILL_ARM_MS);
				return () => {
					window.clearTimeout(timer);
				};
			}, [armedId]);
			(0, react.useEffect)(() => {
				if (liveCount === 0) return;
				setNow(Date.now());
				const timer = window.setInterval(() => {
					setNow(Date.now());
				}, 1e3);
				return () => {
					window.clearInterval(timer);
				};
			}, [liveCount]);
			(0, react.useEffect)(() => {
				if (selectedId !== void 0 && selectedRow === void 0) setSelectedId(void 0);
			}, [selectedId, selectedRow]);
			const kill = (0, react.useCallback)(async (row) => {
				setKillingId(row.job.id);
				setKillErrorId(void 0);
				try {
					await api.jobKill({ sessionId: row.ownerSessionId }, row.job.id);
				} catch {
					setKillErrorId(row.job.id);
				} finally {
					setKillingId(void 0);
					setArmedId(void 0);
				}
			}, []);
			if (rows.length === 0) return null;
			const countLabel = liveCount > 0 ? t("jobsCountRunning", {
				count: rows.length,
				running: liveCount
			}) : t("jobsCount", { count: rows.length });
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: SubagentView_module_css_default.jobs,
				"aria-label": t("jobs"),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: SubagentView_module_css_default.jobsHeader,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: SubagentView_module_css_default.jobsTitle,
						children: t("jobs")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: SubagentView_module_css_default.jobsCount,
						children: countLabel
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
					className: SubagentView_module_css_default.jobsList,
					"aria-label": t("jobs"),
					children: rows.map((row) => {
						const { job } = row;
						const live = isJobLive(job);
						const selected = selectedId === job.id;
						const armed = armedId === job.id;
						const killing = killingId === job.id;
						const killFailed = killErrorId === job.id;
						const elapsed = live ? now - job.startedAt : (job.finishedAt ?? job.startedAt) - job.startedAt;
						const secondary = [
							...multiOwner ? [row.ownerTitle] : [],
							jobStatusLabel(job.status, t),
							...job.detail !== void 0 && job.detail !== "" ? [job.detail] : [],
							formatJobDuration(elapsed, t)
						].filter(Boolean).join(" · ");
						return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
							className: clsx(SubagentView_module_css_default.jobsRow, !live && SubagentView_module_css_default.jobsRowSettled, selected && SubagentView_module_css_default.jobsRowSelected),
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: SubagentView_module_css_default.jobsRowMain,
									"aria-pressed": selected,
									"aria-label": `${job.label} ${secondary}`,
									onClick: () => {
										setSelectedId(selected ? void 0 : job.id);
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, {
										state: jobDotState(job.status),
										className: SubagentView_module_css_default.jobsDot
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: SubagentView_module_css_default.jobsContent,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: SubagentView_module_css_default.jobsLabelLine,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: SubagentView_module_css_default.jobsKind,
												children: job.kind
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: SubagentView_module_css_default.jobsLabel,
												title: job.label,
												children: job.label
											})]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: SubagentView_module_css_default.jobsSecondary,
											children: secondary
										})]
									})]
								}),
								job.status === "running" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: armed ? `${SubagentView_module_css_default.jobsKill} ${SubagentView_module_css_default.jobsKillArmed}` : SubagentView_module_css_default.jobsKill,
									"aria-label": armed ? t("jobKillConfirm") : t("jobKill"),
									title: armed ? t("jobKillConfirm") : t("jobKill"),
									disabled: killing,
									onClick: (event) => {
										event.stopPropagation();
										if (armed) kill(row);
										else setArmedId(job.id);
									},
									children: armed ? t("jobKillConfirm") : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconStopOutline16, { size: 12 })
								}),
								killFailed && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: SubagentView_module_css_default.jobsKillError,
									children: t("jobKillError")
								})
							]
						}, job.id);
					})
				})]
			}), selectedRow !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(JobOutputPane, {
				ownerSessionId: selectedRow.ownerSessionId,
				job: selectedRow.job,
				active,
				onClose: () => {
					setSelectedId(void 0);
				}
			})] });
		}
		/**
		* The sidebar's Subagent topology page.
		* @param props - current session id, whether the page is actually visible
		*   (active tab + open panel), the client context, and an optional
		*   jump-notify hook fired right before `openSubagent` (lets the sidebar
		*   shell re-open the Subagent page after the conversation switch lands on
		*   the child session).
		* @returns the main agent's topology tree, or the empty/error/loading states.
		*/
		function SubagentView(props) {
			const { sessionId, active, ctx, onOpenChild } = props;
			const sessions = ctx.sessions;
			const list = (0, react.useSyncExternalStore)((0, react.useMemo)(() => (callback) => sessions.list.subscribe(callback), [sessions]), (0, react.useCallback)(() => sessions.list.getSnapshot(), [sessions]));
			const byId = list.byId;
			const catalogs = list.subagentsByParent ?? {};
			const rootId = (0, react.useMemo)(() => rootAncestor(byId, sessionId), [byId, sessionId]);
			const rootCatalog = rootId === void 0 ? void 0 : catalogs[rootId];
			const rootSummary = rootId === void 0 ? void 0 : byId[rootId];
			const live = useSubagentLive(rootId, active);
			/** Catalog owners currently consuming live membership updates. */
			const observedRef = (0, react.useRef)(/* @__PURE__ */ new Set());
			const observe = (0, react.useCallback)((parentSessionId, open) => {
				sessions.setSubagentCatalogOpen?.(parentSessionId, open);
				if (open) observedRef.current.add(parentSessionId);
				else observedRef.current.delete(parentSessionId);
			}, [sessions]);
			(0, react.useEffect)(() => {
				if (rootId === void 0 || !active) return;
				observe(rootId, true);
				return () => {
					for (const parentSessionId of observedRef.current) sessions.setSubagentCatalogOpen?.(parentSessionId, false);
					observedRef.current.clear();
				};
			}, [
				rootId,
				active,
				observe,
				sessions
			]);
			const branches = (0, react.useMemo)(() => collectBranchIds(catalogs, rootId), [catalogs, rootId]);
			(0, react.useEffect)(() => {
				if (!active) return;
				for (const id of branches) if (!observedRef.current.has(id)) observe(id, true);
			}, [
				branches,
				active,
				observe
			]);
			(0, react.useEffect)(() => () => {
				for (const parentSessionId of observedRef.current) sessions.setSubagentCatalogOpen?.(parentSessionId, false);
				observedRef.current.clear();
			}, [sessions]);
			const openChild = (0, react.useCallback)((address) => {
				onOpenChild?.(address);
				try {
					sessions.openSubagent?.(address);
				} catch (error) {
					console.warn("[dsh-better-sidebar] openSubagent failed:", error);
				}
			}, [sessions, onOpenChild]);
			/** Jump back to the main agent (the topology root) from its node. */
			const openMain = (0, react.useCallback)(() => {
				if (rootId === void 0) return;
				try {
					sessions.open?.(rootId);
				} catch (error) {
					console.warn("[dsh-better-sidebar] open session failed:", error);
				}
			}, [sessions, rootId]);
			const refresh = (0, react.useCallback)((parentSessionId) => {
				sessions.refreshSubagents?.(parentSessionId);
			}, [sessions]);
			const totals = (0, react.useMemo)(() => rootId === void 0 ? {
				count: 0,
				runningCount: 0
			} : countSubagentDescendants(byId, rootId), [byId, rootId]);
			const summaryBackedLoading = rootId !== void 0 && (rootCatalog === void 0 || rootCatalog.state === "ready" && rootCatalog.entries.length === 0) && directChildren(byId, rootId).length > 0;
			const readyEmpty = rootCatalog?.state === "ready" && rootCatalog.entries.length === 0 && directChildren(byId, rootId ?? "").length === 0;
			const countLabel = totals.count === 0 ? void 0 : totals.runningCount > 0 ? t("subagentCountRunning", {
				count: totals.count,
				running: totals.runningCount
			}) : t("subagentCount", { count: totals.count });
			/** Arrow-key tree navigation over the visible rows (official catalog recipe). */
			const bodyRef = (0, react.useRef)(null);
			const focusAt = (0, react.useCallback)((index) => {
				const items = bodyRef.current?.querySelectorAll("[role=\"treeitem\"]:not([aria-disabled=\"true\"])") ?? [];
				if (items.length === 0) return;
				items[(index + items.length) % items.length]?.focus();
			}, []);
			const onTreeKeyDown = (0, react.useCallback)((event) => {
				const items = bodyRef.current?.querySelectorAll("[role=\"treeitem\"]:not([aria-disabled=\"true\"])") ?? [];
				const index = Array.prototype.indexOf.call(items, document.activeElement);
				if (event.key === "ArrowDown") {
					event.preventDefault();
					focusAt(index + 1);
				} else if (event.key === "ArrowUp") {
					event.preventDefault();
					focusAt(index < 0 ? items.length - 1 : index - 1);
				} else if (event.key === "Home") {
					event.preventDefault();
					focusAt(0);
				} else if (event.key === "End") {
					event.preventDefault();
					focusAt(items.length - 1);
				}
			}, [focusAt]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: SubagentView_module_css_default.subagent,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: SubagentView_module_css_default.subagentHeader,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: SubagentView_module_css_default.subagentTitle,
							children: [t("subagent"), rootSummary?.displayTitle !== void 0 && rootSummary.displayTitle !== "" ? ` · ${rootSummary.displayTitle}` : ""]
						}),
						countLabel !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: SubagentView_module_css_default.subagentCount,
							children: countLabel
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: SubagentView_module_css_default.subagentRefresh,
							"aria-label": t("refresh"),
							title: t("refresh"),
							disabled: rootId === void 0,
							onClick: () => {
								if (rootId !== void 0) refresh(rootId);
							},
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRefreshOutline14, {})
						})
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					ref: bodyRef,
					className: SubagentView_module_css_default.subagentBody,
					onKeyDown: onTreeKeyDown,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						role: "tree",
						"aria-label": t("subagent"),
						"aria-busy": summaryBackedLoading || void 0,
						children: [
							rootId !== void 0 && rootSummary !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								role: "treeitem",
								tabIndex: 0,
								"aria-level": 0,
								"aria-label": `${rootSummary.displayTitle !== "" ? rootSummary.displayTitle : t("subagentMainAgent")} ${t("subagentMainAgent")}`,
								"aria-current": rootId === sessionId ? "true" : void 0,
								className: clsx(SubagentView_module_css_default.subagentRow, rootId === sessionId && SubagentView_module_css_default.subagentRowActive),
								onClick: openMain,
								onKeyDown: (event) => {
									if (event.key === "Enter" || event.key === " ") {
										event.preventDefault();
										event.stopPropagation();
										openMain();
									}
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, {
									state: rootSummary.running === true ? "ongoing" : "done",
									className: SubagentView_module_css_default.subagentDot
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: SubagentView_module_css_default.subagentContent,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: SubagentView_module_css_default.subagentLabel,
										children: rootSummary.displayTitle !== "" ? rootSummary.displayTitle : t("subagentMainAgent")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: SubagentView_module_css_default.subagentSecondary,
										children: `${t("subagentMainAgent")} · ${rootSummary.running === true ? t("subagentRunning") : t("subagentInactive")}`
									})]
								})]
							}),
							rootId !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: SubagentView_module_css_default.subagentChildren,
								role: "group",
								"aria-busy": summaryBackedLoading || void 0,
								children: [summaryBackedLoading && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CatalogLoadingRows, {
									parentSessionId: rootId,
									byId,
									level: 1
								}), !summaryBackedLoading && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CatalogRows, {
									parentSessionId: rootId,
									catalog: rootCatalog,
									catalogs,
									byId,
									level: 1,
									currentSessionId: sessionId,
									live,
									openChild,
									refresh
								})]
							}),
							readyEmpty && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: SubagentView_module_css_default.subagentEmpty,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: t("subagentEmpty") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: SubagentView_module_css_default.subagentEmptyHint,
									children: t("subagentEmptyDesc")
								})]
							})
						]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(JobsSection, {
						byId,
						jobsBySession: list.jobsBySession,
						rootId,
						active
					})]
				})]
			});
		}
		//#endregion
		//#region src/client/sidechat-transcript.ts
		/** Extract the visible text of a content-block list (`text` blocks verbatim,
		*  joined by blank lines); empty reads `…` so rows never render blank. */
		function blockText(content) {
			const parts = [];
			for (const block of content) {
				if (block === null || typeof block !== "object") continue;
				const candidate = block;
				if (candidate.type === "text" && typeof candidate.text === "string") parts.push(candidate.text);
			}
			const text = parts.join("\n\n");
			return text === "" ? "…" : text;
		}
		/** Cap for a tool row's one-line argument summary (display only). */
		const ARGS_SUMMARY_MAX = 80;
		/** The most identifying argument keys, in priority order (bash's command,
		*  fs tools' paths, search's pattern, …). */
		const ARGS_SUMMARY_KEYS = [
			"command",
			"file_path",
			"path",
			"pattern",
			"query",
			"url",
			"prompt"
		];
		function flatTruncate(text) {
			const flat = text.replace(/\s+/g, " ").trim();
			return flat.length > ARGS_SUMMARY_MAX ? `${flat.slice(0, 79)}…` : flat;
		}
		/**
		* One-line summary of a tool call's raw arguments JSON for the collapsed
		* row: the first identifying string field when the JSON parses, else the
		* flattened raw text; empty when there is nothing worth showing.
		*/
		function toolArgsSummary(args) {
			if (args === void 0) return "";
			try {
				const parsed = JSON.parse(args);
				if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) for (const key of ARGS_SUMMARY_KEYS) {
					const value = parsed[key];
					if (typeof value === "string" && value.trim() !== "") return flatTruncate(value);
				}
			} catch {}
			return flatTruncate(args);
		}
		/** The plain text of a tool/result message (text blocks inside its
		*  `tool-result` content block). */
		function resultTextOf(data) {
			const content = data.message?.content;
			if (!Array.isArray(content)) return "";
			const parts = [];
			for (const block of content) {
				if (block === null || typeof block !== "object") continue;
				const candidate = block;
				if (candidate.type !== "tool-result") continue;
				const inner = candidate.content;
				if (!Array.isArray(inner)) continue;
				for (const item of inner) {
					if (item === null || typeof item !== "object") continue;
					const textItem = item;
					if (textItem.type === "text" && typeof textItem.text === "string") parts.push(textItem.text);
				}
			}
			return parts.join("\n");
		}
		/** Index of the last `session/end-seed` event (fork seed marker), or -1. */
		function lastSeedEnd(events) {
			for (let index = events.length - 1; index >= 0; index--) if (events[index]?.type === "session/end-seed") return index;
			return -1;
		}
		/**
		* Collect the thread's OWN events on first attach: walk backward from the
		* log tail (oldest-first accumulation) until the `session/end-seed` marker
		* surfaces, then keep everything after it.
		*
		* Page size matters: cold reads re-expand persisted chunk-rows into one
		* `assistant/chunk` event per delta, so a single streamed answer can be
		* HUNDREDS of events. A small walk window (the old 8×32 = 256 events) let
		* earlier `tool/call` events fall out of the loaded window — the tool rows
		* vanished on re-entry while the settled text survived. The walk therefore
		* pages big; tail polls stay small.
		*
		* Exhaustion (log start reached without a marker — a thread created before
		* seeding existed, or a pathological log) returns `seedBoundary: 0` so the
		* caller stops re-walking and renders the window as-is.
		*
		* @param fetchPage - one history page (newest-first window ending at
		*   `beforeSeq`, exclusive; omit for the tail page).
		* @param pageCap - safety bound on backward pages.
		*/
		async function collectOwnEvents(fetchPage, pageCap = 40) {
			const collected = [];
			let beforeSeq;
			for (let page = 0; page < pageCap; page++) {
				const events = await fetchPage(beforeSeq);
				if (events.length === 0) return {
					seedBoundary: 0,
					entries: collected
				};
				const olderThan = collected.length > 0 ? collected[0].event.seq : void 0;
				const fresh = olderThan === void 0 ? [...events] : events.filter((entry) => entry.event.seq < olderThan);
				const seedEnd = fresh.findLastIndex((entry) => entry.event.type === "session/end-seed");
				if (seedEnd >= 0) {
					collected.unshift(...fresh.slice(seedEnd + 1));
					return {
						seedBoundary: fresh[seedEnd].event.seq,
						entries: collected
					};
				}
				collected.unshift(...fresh);
				if (fresh.length === 0) return {
					seedBoundary: 0,
					entries: collected
				};
				beforeSeq = fresh[0].event.seq;
			}
			return {
				seedBoundary: 0,
				entries: collected
			};
		}
		/**
		* Map a thread child's history rows onto compact transcript rows: the
		* inherited fork seed is cut at the last `session/end-seed`, context
		* injections map onto a collapsible injection row, `assistant/chunk`
		* deltas accumulate into streaming rows per (turn, step, block) and are
		* superseded by the assembled `assistant/message`, and tool invocations
		* render one expandable line each (arguments, paired result text, failure
		* marker; a still-executing call is marked until its result lands).
		* @param entries - history rows (event + host-computed view) in seq order.
		* @returns display rows in log order.
		*/
		function transcriptRows(entries) {
			const events = entries.map((entry) => entry.event);
			const seedEnd = lastSeedEnd(events);
			const rows = [];
			/** (turn, step, index, kind) key → index of its accumulating stream row. */
			const streamRows = /* @__PURE__ */ new Map();
			/** tool callId → index of its tool row in `rows` (result pairing). */
			const callRows = /* @__PURE__ */ new Map();
			for (let index = 0; index < events.length; index++) {
				if (index <= seedEnd) continue;
				const event = events[index];
				if (event === void 0) continue;
				const data = event.data;
				switch (event.type) {
					case "user/message": {
						const text = blockText(Array.isArray(data.content) ? data.content : []);
						if (isContextInjectionMessage(data)) {
							if (data.source?.kind === "user" && text.startsWith(`${SIDE_BOUNDARY_PROMPT}\n\n`)) {
								rows.push({
									kind: "injection",
									seq: event.seq,
									text: SIDE_BOUNDARY_PROMPT
								});
								const body = text.slice(SIDE_BOUNDARY_PROMPT.length + 2);
								if (body !== "") rows.push({
									kind: "user",
									seq: event.seq,
									text: body
								});
								break;
							}
							rows.push({
								kind: "injection",
								seq: event.seq,
								text
							});
							break;
						}
						rows.push({
							kind: "user",
							seq: event.seq,
							text
						});
						break;
					}
					case "assistant/chunk": {
						const chunk = data.chunk;
						if (chunk === null || typeof chunk !== "object") break;
						const kind = chunk.type === "text-delta" ? "assistant" : chunk.type === "reasoning-delta" ? "reasoning" : null;
						if (kind === null || typeof chunk.text !== "string" || chunk.text === "") break;
						const turn = data.turn;
						const step = data.step;
						const blockIndex = chunk.index;
						const key = `${String(turn)}:${String(step)}:${String(blockIndex)}:${kind}`;
						const existing = streamRows.get(key);
						if (existing !== void 0) {
							const row = rows[existing];
							if (row !== void 0 && row.kind === kind && !row.settled) rows[existing] = {
								...row,
								text: row.text + chunk.text
							};
						} else {
							streamRows.set(key, rows.length);
							rows.push({
								kind,
								seq: event.seq,
								text: chunk.text,
								settled: false
							});
						}
						break;
					}
					case "assistant/message": {
						const prefix = `${String(data.turn)}:${String(data.step)}:`;
						const streamed = [...streamRows.entries()].filter(([key]) => key.startsWith(prefix)).map(([, rowIndex]) => rowIndex);
						for (const key of [...streamRows.keys()]) if (key.startsWith(prefix)) streamRows.delete(key);
						const settled = (Array.isArray(data.message?.content) ? data.message.content : []).flatMap((block) => {
							if (block === null || typeof block !== "object") return [];
							const candidate = block;
							if (candidate.type === "reasoning" && typeof candidate.text === "string" && candidate.text !== "") return [{
								kind: "reasoning",
								seq: event.seq,
								text: candidate.text,
								settled: true
							}];
							if (candidate.type === "text" && typeof candidate.text === "string" && candidate.text !== "") return [{
								kind: "assistant",
								seq: event.seq,
								text: candidate.text,
								settled: true
							}];
							return [];
						});
						if (streamed.length === 0) rows.push(...settled);
						else rows.splice(Math.min(...streamed), streamed.length, ...settled);
						break;
					}
					case "tool/call": {
						const callId = data.callId;
						const name = typeof data.name === "string" ? data.name : "tool";
						const args = typeof data.arguments === "string" ? data.arguments : void 0;
						const rowIndex = rows.length;
						if (typeof callId === "string") callRows.set(callId, rowIndex);
						rows.push({
							kind: "tool",
							seq: event.seq,
							name,
							failed: false,
							args,
							executing: true
						});
						break;
					}
					case "tool/result": {
						const source = data.message;
						const callId = typeof source?.source?.callId === "string" ? source.source.callId : void 0;
						const rowIndex = callId === void 0 ? void 0 : callRows.get(callId);
						const failed = data.error !== void 0;
						const resultText = resultTextOf(data);
						if (rowIndex !== void 0) {
							const row = rows[rowIndex];
							if (row !== void 0 && row.kind === "tool") rows[rowIndex] = {
								...row,
								failed: row.failed || failed,
								resultText: resultText === "" ? row.resultText : resultText,
								executing: false
							};
						} else if (failed || resultText !== "") rows.push({
							kind: "tool",
							seq: event.seq,
							name: callId === void 0 ? "tool" : `tool:${callId.slice(0, 8)}`,
							failed,
							resultText: resultText === "" ? void 0 : resultText
						});
						break;
					}
				}
			}
			return rows;
		}
		//#endregion
		//#region \0dsh-css:C:\Users\delinger\Desktop\dsh\dsh-desktop\assets\plugins\dsh-better-sidebar\src\client\SideChatView.module.css.mjs
		const css$1 = "._1PwmhW_sidechat{flex-direction:column;flex:1;min-height:0;display:flex}._1PwmhW_sidechatDetailHeader{border-bottom:1px solid var(--dsw-alias-hairline);flex:none;align-items:center;gap:4px;min-height:36px;padding:4px 8px 4px 12px;display:flex}._1PwmhW_sidechatHeaderDot{flex:none}._1PwmhW_sidechatHeaderSpacer{flex:1;min-width:0}._1PwmhW_sidechatAgentBadge{border:1px solid var(--dsw-alias-hairline);max-width:55%;font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;border-radius:999px;flex:none;padding:1px 8px;overflow:hidden}._1PwmhW_sidechatIconBtn{width:26px;height:26px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-radius:6px;flex:none;justify-content:center;align-items:center;padding:0;transition:background-color .1s ease-out,color .1s ease-out;display:inline-flex}._1PwmhW_sidechatIconBtn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}._1PwmhW_sidechatIconBtn:disabled{opacity:.4;cursor:default}._1PwmhW_sidechatHero{min-height:0;color:var(--dsw-alias-label-tertiary);text-align:center;flex-direction:column;flex:1;justify-content:center;align-items:center;gap:8px;padding:24px 20px;animation:.2s ease-out _1PwmhW_sidechatFadeIn;display:flex}._1PwmhW_sidechatHeroTitle{font:var(--dsw-font-s-14);color:var(--dsw-alias-label-primary);font-weight:500}._1PwmhW_sidechatHeroDesc{max-width:300px;font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-tertiary);line-height:1.6}._1PwmhW_sidechatPrimaryBtn{background:var(--dsw-alias-button-info-fill,var(--dsw-alias-accent));color:var(--dsw-alias-button-info-label,var(--dsw-alias-accent-ink,#fff));font:var(--dsw-font-s-13);cursor:pointer;border:none;border-radius:999px;flex:none;margin-top:4px;padding:6px 14px;transition:opacity .1s ease-out}._1PwmhW_sidechatPrimaryBtn:hover:not(:disabled){opacity:.88}._1PwmhW_sidechatPrimaryBtn:disabled{opacity:.4;cursor:default}._1PwmhW_sidechatHint{font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-tertiary);flex:none;padding:4px 12px}._1PwmhW_sidechatError{font:var(--dsw-font-xxs-12);color:var(--dsw-alias-danger);flex:none;padding:4px 12px}._1PwmhW_sidechatScroll{flex-direction:column;flex:1;gap:10px;min-height:0;padding:10px 12px;display:flex;overflow-y:auto}._1PwmhW_sidechatScroll>*{animation:.18s ease-out _1PwmhW_sidechatRowIn}._1PwmhW_sidechatUser{background:var(--dsw-specific-bubble,var(--dsw-alias-bg-base));max-width:88%;font:var(--dsw-font-s-14);color:var(--dsw-alias-label-primary);overflow-wrap:anywhere;border-radius:18px;align-self:flex-end;padding:8px 14px}._1PwmhW_sidechatAssistant{font:var(--dsw-font-s-14);color:var(--dsw-alias-label-primary);overflow-wrap:anywhere;align-self:stretch}._1PwmhW_sidechatRow{align-self:stretch}._1PwmhW_sidechatRowLine{font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-tertiary);align-items:center;gap:6px;padding:1px 0;display:flex}._1PwmhW_sidechatRowSummary{cursor:pointer;user-select:none;list-style:none}._1PwmhW_sidechatRowSummary::-webkit-details-marker{display:none}._1PwmhW_sidechatRowSummary:hover{color:var(--dsw-alias-label-secondary)}._1PwmhW_sidechatRowStatic{cursor:default}._1PwmhW_sidechatRowChevron{flex:none;align-items:center;transition:transform .1s ease-out;display:inline-flex}._1PwmhW_sidechatRow[open] ._1PwmhW_sidechatRowChevron{transform:rotate(90deg)}._1PwmhW_sidechatRowLabel{text-overflow:ellipsis;white-space:nowrap;max-width:60%;color:var(--dsw-alias-label-secondary);flex:none;overflow:hidden}._1PwmhW_sidechatRowMono{font-family:var(--dsw-font-mono)}._1PwmhW_sidechatRowMeta{text-overflow:ellipsis;white-space:nowrap;min-width:0;font-family:var(--dsw-font-mono);color:var(--dsw-alias-label-tertiary);flex:1;overflow:hidden}._1PwmhW_sidechatRowFailed ._1PwmhW_sidechatRowLabel,._1PwmhW_sidechatRowFailed ._1PwmhW_sidechatRowMeta{color:var(--dsw-alias-danger)}._1PwmhW_sidechatRowBody{border-left:1px solid var(--dsw-alias-hairline);margin:2px 0 4px 7px;padding:2px 0 2px 10px}._1PwmhW_sidechatRowProse{font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-tertiary);white-space:pre-wrap;overflow-wrap:anywhere;max-height:240px;overflow-y:auto}._1PwmhW_sidechatRowCode{font:var(--dsw-font-xxs-12);font-family:var(--dsw-font-mono);color:var(--dsw-alias-label-secondary);white-space:pre-wrap;overflow-wrap:anywhere;max-height:220px;margin:0;padding:4px 0;overflow-y:auto}._1PwmhW_sidechatRowCode+._1PwmhW_sidechatRowCode{border-top:1px solid var(--dsw-alias-hairline)}._1PwmhW_sidechatShimmerText{background-image:linear-gradient(90deg, var(--dsw-alias-label-tertiary) 0%, var(--dsw-alias-label-primary) 50%, var(--dsw-alias-label-tertiary) 100%);color:#0000;background-size:200% 100%;-webkit-background-clip:text;background-clip:text;animation:2.6s linear infinite _1PwmhW_sidechatSweep}._1PwmhW_sidechatStatus{flex:none;align-items:center;gap:8px;padding:2px 14px 6px;animation:.16s ease-out _1PwmhW_sidechatFadeIn;display:flex}._1PwmhW_sidechatStatusText{font:var(--dsw-font-xxs-12);background-image:linear-gradient(90deg, var(--dsw-alias-label-tertiary) 0%, var(--dsw-alias-label-primary) 50%, var(--dsw-alias-label-tertiary) 100%);color:#0000;background-size:200% 100%;-webkit-background-clip:text;background-clip:text;animation:2.6s linear infinite _1PwmhW_sidechatSweep}._1PwmhW_sidechatComposer{border:1px solid var(--dsw-alias-border-l2-darkmode-thin,var(--dsw-alias-hairline));background:var(--dsw-specific-input-major,var(--dsw-alias-bg-base));box-shadow:var(--dsw-shadow-lv2,none);border-radius:16px;flex-direction:column;flex:none;gap:4px;margin:0 8px 8px;padding:8px 8px 6px 14px;display:flex}._1PwmhW_sidechatComposerInput{box-sizing:border-box;width:100%;color:var(--dsw-alias-label-primary);font:var(--dsw-font-s-14);resize:none;background:0 0;border:none;outline:none;max-height:132px;padding:2px 0;line-height:22px}._1PwmhW_sidechatComposerInput::placeholder{color:var(--dsw-alias-label-tertiary)}._1PwmhW_sidechatComposerBar{flex:none;align-items:center;gap:8px;min-height:28px;display:flex}._1PwmhW_sidechatComposerMeta{min-width:0;font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;flex:1;overflow:hidden}._1PwmhW_sidechatSendBtn{background:var(--dsw-alias-button-info-fill,var(--dsw-alias-accent));width:28px;height:28px;color:var(--dsw-alias-button-info-label,var(--dsw-alias-accent-ink,#fff));cursor:pointer;border:none;border-radius:50%;flex:none;justify-content:center;align-items:center;padding:0;transition:opacity .1s ease-out;animation:.12s ease-out _1PwmhW_sidechatBtnIn;display:inline-flex}._1PwmhW_sidechatSendBtn:hover:not(:disabled){opacity:.88}._1PwmhW_sidechatSendBtn:disabled{opacity:.35;cursor:default}@keyframes _1PwmhW_sidechatRowIn{0%{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}@keyframes _1PwmhW_sidechatFadeIn{0%{opacity:0}to{opacity:1}}@keyframes _1PwmhW_sidechatBtnIn{0%{opacity:0;transform:scale(.85)}to{opacity:1;transform:scale(1)}}@keyframes _1PwmhW_sidechatSweep{0%{background-position:200% 0}to{background-position:-200% 0}}@media (prefers-reduced-motion:reduce){._1PwmhW_sidechatScroll>*,._1PwmhW_sidechatHero,._1PwmhW_sidechatStatus,._1PwmhW_sidechatSendBtn{animation:none}._1PwmhW_sidechatStatusText,._1PwmhW_sidechatShimmerText{color:var(--dsw-alias-label-tertiary);background-image:none;animation:none}._1PwmhW_sidechatRowChevron{transition:none}}";
		const tagId$1 = "dsh-better-sidebar/SideChatView.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-better-sidebar";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var SideChatView_module_css_default = {
			"sidechatRowMeta": "_1PwmhW_sidechatRowMeta",
			"sidechatComposer": "_1PwmhW_sidechatComposer",
			"sidechatComposerMeta": "_1PwmhW_sidechatComposerMeta",
			"sidechatRow": "_1PwmhW_sidechatRow",
			"sidechatComposerBar": "_1PwmhW_sidechatComposerBar",
			"sidechatRowLabel": "_1PwmhW_sidechatRowLabel",
			"sidechatStatus": "_1PwmhW_sidechatStatus",
			"sidechat": "_1PwmhW_sidechat",
			"sidechatHeroDesc": "_1PwmhW_sidechatHeroDesc",
			"sidechatHeaderDot": "_1PwmhW_sidechatHeaderDot",
			"sidechatStatusText": "_1PwmhW_sidechatStatusText",
			"sidechatHeaderSpacer": "_1PwmhW_sidechatHeaderSpacer",
			"sidechatShimmerText": "_1PwmhW_sidechatShimmerText",
			"sidechatRowMono": "_1PwmhW_sidechatRowMono",
			"sidechatRowProse": "_1PwmhW_sidechatRowProse",
			"sidechatIconBtn": "_1PwmhW_sidechatIconBtn",
			"sidechatHeroTitle": "_1PwmhW_sidechatHeroTitle",
			"sidechatRowIn": "_1PwmhW_sidechatRowIn",
			"sidechatError": "_1PwmhW_sidechatError",
			"sidechatHero": "_1PwmhW_sidechatHero",
			"sidechatBtnIn": "_1PwmhW_sidechatBtnIn",
			"sidechatDetailHeader": "_1PwmhW_sidechatDetailHeader",
			"sidechatHint": "_1PwmhW_sidechatHint",
			"sidechatRowLine": "_1PwmhW_sidechatRowLine",
			"sidechatRowBody": "_1PwmhW_sidechatRowBody",
			"sidechatComposerInput": "_1PwmhW_sidechatComposerInput",
			"sidechatSendBtn": "_1PwmhW_sidechatSendBtn",
			"sidechatRowStatic": "_1PwmhW_sidechatRowStatic",
			"sidechatRowChevron": "_1PwmhW_sidechatRowChevron",
			"sidechatScroll": "_1PwmhW_sidechatScroll",
			"sidechatUser": "_1PwmhW_sidechatUser",
			"sidechatRowSummary": "_1PwmhW_sidechatRowSummary",
			"sidechatRowFailed": "_1PwmhW_sidechatRowFailed",
			"sidechatRowCode": "_1PwmhW_sidechatRowCode",
			"sidechatSweep": "_1PwmhW_sidechatSweep",
			"sidechatPrimaryBtn": "_1PwmhW_sidechatPrimaryBtn",
			"sidechatFadeIn": "_1PwmhW_sidechatFadeIn",
			"sidechatAssistant": "_1PwmhW_sidechatAssistant",
			"sidechatAgentBadge": "_1PwmhW_sidechatAgentBadge"
		};
		//#endregion
		//#region src/client/SideChatView.tsx
		/**
		* Side Chat page: Codex-style side conversations for the current session.
		*
		* EVERY side conversation is its own sidebar tab (侧边对话1/2/3 …): the
		* descriptor's createTab mints a fresh tab flagged `autoCreate` and this
		* view creates the EMPTY thread on mount (one click = one conversation,
		* exactly like the Codex app); the composer owns the first message (the
		* host wraps it with the side boundary + the in-progress snapshot parked
		* at creation, and the thread earns its real label — and the tab its
		* title — from that first message). Closing the tab releases the thread's
		* live agent (its history stays persisted); the header menu reopens any
		* existing thread into a tab (deduped by threadId).
		*
		* Each side thread is a child session the plugin created itself with a
		* custom seed (the parent's full log up to the click moment — see
		* sidechat-core.ts). Transport: thread creation/follow-up/cancel/dispose/
		* info go through the plugin's own /sidebar/api sidechat.* routes
		* (subagent-origin identities are fenced from the generic session RPCs);
		* the transcript is polled from the generic session.history RPC (seed-cut
		* at session/end-seed, boundary row dropped, chunk streaming accumulated)
		* — see sidechat-transcript.ts.
		*/
		/** Tail-page size for one transcript poll (events per page). Small on
		*  purpose: streaming polls ride the tail and merge by seq. */
		const PAGE_MESSAGES = 8;
		/** First-attach walk page size: cold reads re-expand chunk-rows into one
		*  event per streamed delta, so a single answer can be hundreds of events —
		*  the walk must page big or earlier tool/call rows fall out of the window. */
		const WALK_PAGE_EVENTS = 200;
		/** Poll cadence while the selected thread is running and the tab visible. */
		const POLL_MS = 2e3;
		/** Textarea auto-grow ceiling (px) — the composer scrolls beyond it. */
		const COMPOSER_MAX_HEIGHT = 132;
		/** The thread a tab is bound to (durable in tab.meta across refreshes). */
		function sidechatThreadIdOf(tab) {
			const meta = tab.meta;
			return typeof meta?.threadId === "string" ? meta.threadId : void 0;
		}
		/** The parked reopen target consumed by the descriptor's createTab (the
		*  service's createTab receives no seed, so a thread-switch parks the id
		*  here and openTab picks it up synchronously — exactly one consume per
		*  park). */
		let parkedReopen;
		/** Park a thread id for the NEXT sidechat openTab to reattach. */
		function parkSidechatReopen(threadId) {
			parkedReopen = threadId;
		}
		/** Consume the parked reopen target (undefined = mint a fresh thread tab). */
		function consumeSidechatSeed() {
			const value = parkedReopen;
			parkedReopen = void 0;
			return value;
		}
		/** In-flight thread creations keyed by tab id (double-mount guard: React
		*  StrictMode / HMR must not mint two threads for one tab). */
		const inFlightStarts = /* @__PURE__ */ new Set();
		/** Merge history entries by event seq (newest wins), log order preserved. */
		function mergeBySeq(previous, incoming) {
			const bySeq = /* @__PURE__ */ new Map();
			for (const entry of previous) bySeq.set(entry.event.seq, entry);
			for (const entry of incoming) bySeq.set(entry.event.seq, entry);
			return [...bySeq.values()].sort((a, b) => a.event.seq - b.event.seq);
		}
		/** The display title of a thread: the durable label minus the 'Side: '
		*  prefix, with the fresh-thread placeholder localized. */
		function threadDisplayTitle(title) {
			if (title === "Side: New thread") return t("sideChatUntitled");
			return title.startsWith("Side: ") ? title.slice(6) : title;
		}
		/**
		* One collapsible context row — the shared Codex-style chrome of tool
		* calls, thinking and context injections: a single quiet line (chevron +
		* label + one-line summary) that expands into an indented body hung on a
		* hairline thread. Rows with nothing to reveal render as a static line.
		*/
		function CollapsibleRow(props) {
			const label = /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: clsx(SideChatView_module_css_default.sidechatRowLabel, props.mono === true && SideChatView_module_css_default.sidechatRowMono, props.streaming === true && SideChatView_module_css_default.sidechatShimmerText),
				children: props.label
			});
			const meta = props.meta !== void 0 && props.meta !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: SideChatView_module_css_default.sidechatRowMeta,
				children: props.meta
			}) : null;
			if (props.children === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: clsx(SideChatView_module_css_default.sidechatRowLine, SideChatView_module_css_default.sidechatRowStatic, props.failed === true && SideChatView_module_css_default.sidechatRowFailed),
				children: [label, meta]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
				className: SideChatView_module_css_default.sidechatRow,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("summary", {
					className: clsx(SideChatView_module_css_default.sidechatRowLine, SideChatView_module_css_default.sidechatRowSummary, props.failed === true && SideChatView_module_css_default.sidechatRowFailed),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: SideChatView_module_css_default.sidechatRowChevron,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronRightOutline14, { size: 12 })
						}),
						label,
						meta
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: SideChatView_module_css_default.sidechatRowBody,
					children: props.children
				})]
			});
		}
		/** One row renderer (React keys ride the source event seq). */
		function renderRow(row, labels) {
			switch (row.kind) {
				case "user": return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: SideChatView_module_css_default.sidechatUser,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, {
						text: row.text,
						labels: labels.markdown
					})
				}, `${row.kind}:${row.seq}`);
				case "assistant": return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: SideChatView_module_css_default.sidechatAssistant,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, {
						text: row.text,
						labels: labels.markdown
					})
				}, `${row.kind}:${row.seq}`);
				case "reasoning": return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CollapsibleRow, {
					label: labels.thinkLabel,
					streaming: !row.settled,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: SideChatView_module_css_default.sidechatRowProse,
						children: row.text
					})
				}, `${row.kind}:${row.seq}`);
				case "injection": return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CollapsibleRow, {
					label: labels.injectionLabel,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: SideChatView_module_css_default.sidechatRowProse,
						children: row.text
					})
				}, `${row.kind}:${row.seq}`);
				case "tool": {
					const body = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [row.args !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
						className: SideChatView_module_css_default.sidechatRowCode,
						children: row.args
					}), row.resultText !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
						className: SideChatView_module_css_default.sidechatRowCode,
						children: row.resultText
					})] });
					return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CollapsibleRow, {
						label: row.name,
						meta: toolArgsSummary(row.args),
						mono: true,
						streaming: row.executing === true,
						failed: row.failed,
						...row.args === void 0 && row.resultText === void 0 ? {} : { children: body }
					}, `${row.kind}:${row.seq}`);
				}
			}
		}
		/** One side conversation tab (one thread per tab, Codex-style). */
		function SideChatView(props) {
			const { ctx, scope, tab, visible } = props;
			const rowLabels = (0, react.useMemo)(() => ({
				copyLabel: t("copy"),
				copiedLabel: t("copied"),
				thinkLabel: t("sideChatThink"),
				injectionLabel: t("sideChatInjection"),
				markdown: {
					code: {
						copyLabel: t("copy"),
						copiedLabel: t("copied")
					},
					footnotes: t("footnotes")
				}
			}), []);
			const list = (0, react.useSyncExternalStore)((0, react.useMemo)(() => (callback) => ctx.sessions.list.subscribe(callback), [ctx]), (0, react.useCallback)(() => ctx.sessions.list.getSnapshot(), [ctx]));
			const threads = (0, react.useMemo)(() => sideThreadRows(list.byId, scope.sessionId), [list, scope.sessionId]);
			const threadId = sidechatThreadIdOf(tab);
			const autoCreate = tab.meta?.autoCreate === true;
			const [composer, setComposer] = (0, react.useState)("");
			const [busy, setBusy] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(null);
			const [saved, setSaved] = (0, react.useState)(false);
			const [revision, setRevision] = (0, react.useState)(0);
			const [info, setInfo] = (0, react.useState)(null);
			const [menuOpen, setMenuOpen] = (0, react.useState)(false);
			const cacheRef = (0, react.useRef)({
				seedBoundary: null,
				entries: []
			});
			const controllerRef = (0, react.useRef)(null);
			const scrollRef = (0, react.useRef)(null);
			const composerRef = (0, react.useRef)(null);
			const summary = threadId === void 0 ? void 0 : list.byId[threadId];
			const running = summary?.running === true;
			/** The agent-identity badge of the thread header (preset · model). */
			const agentBadge = (0, react.useMemo)(() => {
				if (info === null) return "";
				return [info.preset, info.model ?? info.provider].filter(Boolean).join(" · ");
			}, [info]);
			/** Create this tab's thread (immediate-create tabs and hero retries). */
			const startThread = (0, react.useCallback)(async () => {
				if (inFlightStarts.has(tab.id)) return;
				inFlightStarts.add(tab.id);
				setBusy("starting");
				setError(null);
				try {
					const { childId } = await api.sidechatStart(scope.sessionId);
					ctx.betterSidebar?.updateTab(tab.id, { meta: { threadId: childId } });
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				} finally {
					inFlightStarts.delete(tab.id);
					setBusy(null);
				}
			}, [
				ctx,
				scope.sessionId,
				tab.id
			]);
			(0, react.useEffect)(() => {
				if (threadId !== void 0 || !autoCreate || !visible) return;
				startThread();
			}, [
				threadId,
				autoCreate,
				visible,
				startThread
			]);
			(0, react.useEffect)(() => {
				const display = summary?.displayTitle;
				if (display === void 0) return;
				const title = threadDisplayTitle(display);
				if (title !== "" && title !== tab.title) try {
					ctx.betterSidebar?.updateTab(tab.id, { title });
				} catch {}
			}, [
				summary,
				tab.id,
				tab.title,
				ctx
			]);
			/** One transcript pull: the first read walks back to the seed boundary
			*  (big pages — chunk deltas re-expand on cold reads), later reads fetch
			*  one tail page and merge (seq-deduped). */
			const fetchThread = (0, react.useCallback)(async (childId) => {
				controllerRef.current?.abort();
				const controller = new AbortController();
				controllerRef.current = controller;
				const cache = cacheRef.current;
				try {
					if (cache.seedBoundary === null) {
						const walk = await collectOwnEvents(async (beforeSeq) => {
							const response = await ctx.connection.api.sessions.history({
								sessionId: childId,
								maxMessages: WALK_PAGE_EVENTS,
								...beforeSeq === void 0 ? {} : { beforeSeq }
							}, controller.signal);
							if (!response.result.ok) throw new Error("history walk failed");
							return response.result.value.events;
						});
						cache.seedBoundary = walk.seedBoundary;
						cache.entries = mergeBySeq(cache.entries, walk.entries);
					} else {
						const response = await ctx.connection.api.sessions.history({
							sessionId: childId,
							maxMessages: PAGE_MESSAGES
						}, controller.signal);
						if (!response.result.ok) return;
						cache.entries = mergeBySeq(cache.entries, response.result.value.events);
					}
					setRevision((value) => value + 1);
				} catch {}
			}, [ctx]);
			/** The thread header badge pull (live state + preset/model identity). */
			const fetchInfo = (0, react.useCallback)(async (childId) => {
				try {
					setInfo(await api.sidechatInfo(childId));
				} catch {}
			}, []);
			(0, react.useEffect)(() => {
				cacheRef.current = {
					seedBoundary: null,
					entries: []
				};
				controllerRef.current?.abort();
				setError(null);
				setSaved(false);
				setInfo(null);
				if (threadId !== void 0) {
					fetchInfo(threadId);
					window.setTimeout(() => composerRef.current?.focus(), 0);
				}
			}, [threadId, fetchInfo]);
			(0, react.useEffect)(() => {
				if (!visible || threadId === void 0) return;
				fetchThread(threadId);
				if (!running) return;
				const timer = window.setInterval(() => {
					fetchThread(threadId);
					fetchInfo(threadId);
				}, POLL_MS);
				return () => {
					window.clearInterval(timer);
				};
			}, [
				visible,
				threadId,
				running,
				fetchThread,
				fetchInfo
			]);
			(0, react.useEffect)(() => () => {
				controllerRef.current?.abort();
			}, []);
			const rows = (0, react.useMemo)(() => threadId === void 0 ? [] : transcriptRows(cacheRef.current.entries), [threadId, revision]);
			const canSave = threadId !== void 0 && threadHasCompletedTurn(cacheRef.current.entries);
			const trailingPending = threadId !== void 0 && threadTrailingPending(cacheRef.current.entries);
			const freshThread = threadId !== void 0 && rows.length === 0;
			(0, react.useEffect)(() => {
				const scroller = scrollRef.current;
				if (scroller === null) return;
				scroller.scrollTop = scroller.scrollHeight;
			}, [rows.length, threadId]);
			/** Open a NEW thread tab (createTab mints the autoCreate tab; its view
			*  creates the thread on mount). */
			const openNewThread = () => {
				setMenuOpen(false);
				ctx.betterSidebar?.openTab({ type: "sidechat" }, scope);
			};
			/** Switch to an existing thread: parked for createTab, deduped to the
			*  already-open tab when there is one. */
			const openExistingThread = (id) => {
				setMenuOpen(false);
				if (id === threadId) return;
				parkSidechatReopen(id);
				ctx.betterSidebar?.openTab({ type: "sidechat" }, scope);
			};
			const menuItems = (0, react.useMemo)(() => {
				const items = [{
					id: "$new",
					label: t("sideChatNew"),
					icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16, {})
				}];
				if (threads.length > 0) {
					items.push({
						type: "separator",
						id: "$sep"
					});
					for (const row of threads) items.push({
						id: row.id,
						label: threadDisplayTitle(row.title),
						...row.running ? { icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, {
							state: "ongoing",
							size: 8
						}) } : {}
					});
				}
				return items;
			}, [threads]);
			const growComposer = () => {
				const field = composerRef.current;
				if (field === null) return;
				field.style.height = "0px";
				field.style.height = `${Math.min(field.scrollHeight, COMPOSER_MAX_HEIGHT)}px`;
			};
			const handleSend = async () => {
				const text = composer.trim();
				if (text === "" || threadId === void 0 || busy !== null) return;
				setBusy("sending");
				setError(null);
				try {
					await api.sidechatPrompt(threadId, text);
					setComposer("");
					const field = composerRef.current;
					if (field !== null) field.style.height = "";
					fetchThread(threadId);
					fetchInfo(threadId);
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				} finally {
					setBusy(null);
				}
			};
			const handleCancel = async () => {
				if (threadId === void 0 || busy !== null) return;
				try {
					await api.sidechatCancel(threadId);
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				}
			};
			const handleSave = async () => {
				if (threadId === void 0 || !canSave || busy !== null) return;
				setBusy("saving");
				setError(null);
				setSaved(false);
				try {
					if (ctx.sessions.fork === void 0) throw new Error("session fork is unavailable");
					const newId = await ctx.sessions.fork({
						sessionId: threadId,
						increaseTitle: true
					});
					const title = summary === void 0 ? "" : threadDisplayTitle(summary.displayTitle).trim();
					const binding = ctx.sessions.binding?.(newId);
					if (binding !== void 0 && title !== "") await binding.session.rename(title);
					ctx.sessions.open?.(newId);
					setSaved(true);
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				} finally {
					setBusy(null);
				}
			};
			if (threadId === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: SideChatView_module_css_default.sidechat,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: SideChatView_module_css_default.sidechatHero,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconNewChatOutline16, {}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: clsx(SideChatView_module_css_default.sidechatHeroTitle, busy === "starting" && SideChatView_module_css_default.sidechatShimmerText),
							children: busy === "starting" ? t("sideChatCreating") : t("sideChatEmpty")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: SideChatView_module_css_default.sidechatHeroDesc,
							children: t("sideChatEmptyDesc")
						}),
						error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: SideChatView_module_css_default.sidechatError,
							children: t("sideChatError", { message: error })
						}),
						busy !== "starting" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: SideChatView_module_css_default.sidechatPrimaryBtn,
							onClick: () => void startThread(),
							children: error === null ? t("sideChatNew") : t("sideChatRetry")
						})
					]
				})
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: SideChatView_module_css_default.sidechat,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: SideChatView_module_css_default.sidechatDetailHeader,
						children: [
							running && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, {
								state: "ongoing",
								size: 8,
								className: SideChatView_module_css_default.sidechatHeaderDot
							}),
							agentBadge !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: SideChatView_module_css_default.sidechatAgentBadge,
								children: agentBadge
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: SideChatView_module_css_default.sidechatHeaderSpacer }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
								open: menuOpen,
								anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: SideChatView_module_css_default.sidechatIconBtn,
									onClick: () => {
										setMenuOpen((value) => !value);
									},
									title: t("sideChatThreads"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconHistoryOutline16, {})
								}),
								items: menuItems,
								selectedId: threadId,
								onSelect: (id) => {
									id === "$new" ? openNewThread() : openExistingThread(id);
								},
								onClose: () => {
									setMenuOpen(false);
								},
								align: "end",
								portal: true,
								dense: true
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: SideChatView_module_css_default.sidechatIconBtn,
								onClick: () => void handleSave(),
								disabled: !canSave || busy !== null,
								title: `${t("sideChatSave")} — ${t("sideChatSaveTitle")}`,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconSaveOutline16, {})
							})
						]
					}),
					!canSave && !freshThread && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: SideChatView_module_css_default.sidechatHint,
						children: t("sideChatNoTurn")
					}),
					canSave && trailingPending && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: SideChatView_module_css_default.sidechatHint,
						children: t("sideChatPendingDrop")
					}),
					saved && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: SideChatView_module_css_default.sidechatHint,
						children: t("sideChatSaved")
					}),
					error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: SideChatView_module_css_default.sidechatError,
						children: t("sideChatError", { message: error })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						ref: scrollRef,
						className: SideChatView_module_css_default.sidechatScroll,
						children: rows.map((row) => renderRow(row, rowLabels))
					}),
					running && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: SideChatView_module_css_default.sidechatStatus,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, {
							state: "ongoing",
							size: 8
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: SideChatView_module_css_default.sidechatStatusText,
							children: t("sideChatThinking")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: SideChatView_module_css_default.sidechatComposer,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
							ref: composerRef,
							className: SideChatView_module_css_default.sidechatComposerInput,
							value: composer,
							placeholder: freshThread ? t("sideChatFirstPlaceholder") : t("sideChatComposerPlaceholder"),
							rows: 1,
							onChange: (event) => {
								setComposer(event.target.value);
								growComposer();
							},
							onKeyDown: (event) => {
								if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
								event.preventDefault();
								handleSend();
							}
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: SideChatView_module_css_default.sidechatComposerBar,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: SideChatView_module_css_default.sidechatComposerMeta,
								children: running ? "" : agentBadge
							}), running ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: SideChatView_module_css_default.sidechatSendBtn,
								onClick: () => void handleCancel(),
								disabled: busy !== null,
								title: t("sideChatCancelTitle"),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconStopFill16, {})
							}, "stop") : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: SideChatView_module_css_default.sidechatSendBtn,
								onClick: () => void handleSend(),
								disabled: composer.trim() === "" || busy !== null,
								title: t("sideChatSend"),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSendOutline16, {})
							}, "send")]
						})]
					})
				]
			});
		}
		//#endregion
		//#region node_modules/.pnpm/react-icons@5.7.0_react@18.3.1/node_modules/react-icons/lib/iconContext.mjs
		var DefaultContext = {
			color: void 0,
			size: void 0,
			className: void 0,
			style: void 0,
			attr: void 0
		};
		var IconContext = react.default.createContext && /*#__PURE__*/ react.default.createContext(DefaultContext);
		//#endregion
		//#region node_modules/.pnpm/react-icons@5.7.0_react@18.3.1/node_modules/react-icons/lib/iconBase.mjs
		var _excluded = [
			"attr",
			"size",
			"title"
		];
		function _objectWithoutProperties(e, t) {
			if (null == e) return {};
			var o, r, i = _objectWithoutPropertiesLoose(e, t);
			if (Object.getOwnPropertySymbols) {
				var n = Object.getOwnPropertySymbols(e);
				for (r = 0; r < n.length; r++) o = n[r], -1 === t.indexOf(o) && {}.propertyIsEnumerable.call(e, o) && (i[o] = e[o]);
			}
			return i;
		}
		function _objectWithoutPropertiesLoose(r, e) {
			if (null == r) return {};
			var t = {};
			for (var n in r) if ({}.hasOwnProperty.call(r, n)) {
				if (-1 !== e.indexOf(n)) continue;
				t[n] = r[n];
			}
			return t;
		}
		function _extends() {
			return _extends = Object.assign ? Object.assign.bind() : function(n) {
				for (var e = 1; e < arguments.length; e++) {
					var t = arguments[e];
					for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]);
				}
				return n;
			}, _extends.apply(null, arguments);
		}
		function ownKeys(e, r) {
			var t = Object.keys(e);
			if (Object.getOwnPropertySymbols) {
				var o = Object.getOwnPropertySymbols(e);
				r && (o = o.filter(function(r) {
					return Object.getOwnPropertyDescriptor(e, r).enumerable;
				})), t.push.apply(t, o);
			}
			return t;
		}
		function _objectSpread(e) {
			for (var r = 1; r < arguments.length; r++) {
				var t = null != arguments[r] ? arguments[r] : {};
				r % 2 ? ownKeys(Object(t), !0).forEach(function(r) {
					_defineProperty(e, r, t[r]);
				}) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function(r) {
					Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r));
				});
			}
			return e;
		}
		function _defineProperty(e, r, t) {
			return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, {
				value: t,
				enumerable: !0,
				configurable: !0,
				writable: !0
			}) : e[r] = t, e;
		}
		function _toPropertyKey(t) {
			var i = _toPrimitive(t, "string");
			return "symbol" == typeof i ? i : i + "";
		}
		function _toPrimitive(t, r) {
			if ("object" != typeof t || !t) return t;
			var e = t[Symbol.toPrimitive];
			if (void 0 !== e) {
				var i = e.call(t, r || "default");
				if ("object" != typeof i) return i;
				throw new TypeError("@@toPrimitive must return a primitive value.");
			}
			return ("string" === r ? String : Number)(t);
		}
		function Tree2Element(tree) {
			return tree && tree.map((node, i) => /*#__PURE__*/ react.default.createElement(node.tag, _objectSpread({ key: i }, node.attr), Tree2Element(node.child)));
		}
		function GenIcon(data) {
			return (props) => /*#__PURE__*/ react.default.createElement(IconBase, _extends({ attr: _objectSpread({}, data.attr) }, props), Tree2Element(data.child));
		}
		function IconBase(props) {
			var elem = (conf) => {
				var attr = props.attr, size = props.size, title = props.title, svgProps = _objectWithoutProperties(props, _excluded);
				var computedSize = size || conf.size || "1em";
				var className;
				if (conf.className) className = conf.className;
				if (props.className) className = (className ? className + " " : "") + props.className;
				return /*#__PURE__*/ react.default.createElement("svg", _extends({
					stroke: "currentColor",
					fill: "currentColor",
					strokeWidth: "0"
				}, conf.attr, attr, svgProps, {
					className,
					style: _objectSpread(_objectSpread({ color: props.color || conf.color }, conf.style), props.style),
					height: computedSize,
					width: computedSize,
					xmlns: "http://www.w3.org/2000/svg"
				}), title && /*#__PURE__*/ react.default.createElement("title", null, title), props.children);
			};
			return IconContext !== void 0 ? /*#__PURE__*/ react.default.createElement(IconContext.Consumer, null, (conf) => elem(conf)) : elem(DefaultContext);
		}
		//#endregion
		//#region node_modules/.pnpm/react-icons@5.7.0_react@18.3.1/node_modules/react-icons/vsc/index.mjs
		function VscPinned(props) {
			return GenIcon({
				"tag": "svg",
				"attr": {
					"viewBox": "0 0 16 16",
					"fill": "currentColor"
				},
				"child": [{
					"tag": "path",
					"attr": { "d": "M10.0589 2.44511C9.34701 1.73063 8.14697 1.90829 7.67261 2.79839L5.6526 6.58878L2.8419 7.52568C2.6775 7.58048 2.5532 7.71649 2.51339 7.88514C2.47357 8.0538 2.52392 8.23104 2.64646 8.35357L4.79291 10.5L2.14645 13.1465L2 14L2.85356 13.8536L5.50002 11.2071L7.64646 13.3536C7.76899 13.4761 7.94623 13.5265 8.11489 13.4866C8.28354 13.4468 8.41955 13.3225 8.47435 13.1581L9.41143 10.3469L13.1897 8.32423C14.0759 7.84982 14.2538 6.6551 13.5443 5.94305L10.0589 2.44511ZM8.55511 3.2687C8.71323 2.972 9.11324 2.91278 9.35055 3.15094L12.836 6.64889C13.0725 6.88624 13.0131 7.28448 12.7178 7.44262L8.76403 9.55921C8.65137 9.61952 8.56608 9.72068 8.52567 9.84191L7.7815 12.0744L3.92562 8.21853L6.15812 7.47436C6.27966 7.43385 6.38101 7.34823 6.44126 7.23518L8.55511 3.2687Z" },
					"child": []
				}]
			})(props);
		}
		function VscPin(props) {
			return GenIcon({
				"tag": "svg",
				"attr": {
					"viewBox": "0 0 16 16",
					"fill": "currentColor"
				},
				"child": [{
					"tag": "path",
					"attr": { "d": "M13.5 3C13.303 3 13.109 3.038 12.923 3.114L8.481 4.967L5.659 4.026C5.505 3.976 5.339 4.001 5.209 4.095C5.078 4.189 5.001 4.339 5.001 4.5V7H1.257L0.5 7.5L1.257 8H5V10.5C5 10.661 5.077 10.812 5.208 10.905C5.338 11 5.504 11.023 5.658 10.974L8.48 10.033L12.925 11.887C13.109 11.962 13.302 12 13.499 12C14.326 12 14.999 11.327 14.999 10.5V4.5C14.999 3.673 14.326 3 13.499 3H13.5ZM14 10.5C14 10.843 13.615 11.09 13.308 10.962L8.693 9.038C8.631 9.013 8.566 9 8.501 9C8.447 9 8.395 9.009 8.343 9.025L6.001 9.806V5.193L8.343 5.974C8.457 6.011 8.581 6.007 8.694 5.961L13.306 4.038C13.629 3.902 14.001 4.156 14.001 4.499V10.499L14 10.5Z" },
					"child": []
				}]
			})(props);
		}
		function VscLinkExternal(props) {
			return GenIcon({
				"tag": "svg",
				"attr": {
					"viewBox": "0 0 16 16",
					"fill": "currentColor"
				},
				"child": [{
					"tag": "path",
					"attr": { "d": "M15 9.5V12.5C15 13.879 13.879 15 12.5 15H3.5C2.121 15 1 13.879 1 12.5V3.5C1 2.121 2.121 1 3.5 1H6.5C6.776 1 7 1.224 7 1.5C7 1.776 6.776 2 6.5 2H3.5C2.673 2 2 2.673 2 3.5V12.5C2 13.327 2.673 14 3.5 14H12.5C13.327 14 14 13.327 14 12.5V9.5C14 9.224 14.224 9 14.5 9C14.776 9 15 9.224 15 9.5ZM14.5 1H9.5C9.224 1 9 1.224 9 1.5C9 1.776 9.224 2 9.5 2H13.293L9.147 6.146C8.952 6.341 8.952 6.658 9.147 6.853C9.245 6.951 9.373 6.999 9.501 6.999C9.629 6.999 9.757 6.95 9.855 6.853L14.001 2.707V6.5C14.001 6.776 14.225 7 14.501 7C14.777 7 15.001 6.776 15.001 6.5V1.5C15.001 1.224 14.777 1 14.501 1H14.5Z" },
					"child": []
				}]
			})(props);
		}
		function VscFolder(props) {
			return GenIcon({
				"tag": "svg",
				"attr": {
					"viewBox": "0 0 16 16",
					"fill": "currentColor"
				},
				"child": [{
					"tag": "path",
					"attr": { "d": "M2 4.5V6H5.58579C5.71839 6 5.84557 5.94732 5.93934 5.85355L7.29289 4.5L5.93934 3.14645C5.84557 3.05268 5.71839 3 5.58579 3H3.5C2.67157 3 2 3.67157 2 4.5ZM1 4.5C1 3.11929 2.11929 2 3.5 2H5.58579C5.98361 2 6.36514 2.15804 6.64645 2.43934L8.20711 4H12.5C13.8807 4 15 5.11929 15 6.5V11.5C15 12.8807 13.8807 14 12.5 14H3.5C2.11929 14 1 12.8807 1 11.5V4.5ZM2 7V11.5C2 12.3284 2.67157 13 3.5 13H12.5C13.3284 13 14 12.3284 14 11.5V6.5C14 5.67157 13.3284 5 12.5 5H8.20711L6.64645 6.56066C6.36514 6.84197 5.98361 7 5.58579 7H2Z" },
					"child": []
				}]
			})(props);
		}
		function VscFolderOpened(props) {
			return GenIcon({
				"tag": "svg",
				"attr": {
					"viewBox": "0 0 16 16",
					"fill": "currentColor"
				},
				"child": [{
					"tag": "path",
					"attr": { "d": "M2 4.5V9.10022L2.92389 7.5C3.45979 6.5718 4.45017 6 5.52196 6L11.9146 6C11.7087 5.4174 11.1531 5 10.5 5H7C6.86739 5 6.74021 4.94732 6.64645 4.85355L4.93934 3.14645C4.84557 3.05268 4.71839 3 4.58579 3H3.5C2.67157 3 2 3.67157 2 4.5ZM7.06895 13.9953C7.04641 13.9984 7.02339 14 7 14H3.5C2.11929 14 1 12.8807 1 11.5V4.5C1 3.11929 2.11929 2 3.5 2H4.58579C4.98361 2 5.36514 2.15804 5.64645 2.43934L7.20711 4H10.5C11.724 4 12.7426 4.87965 12.958 6.04127C14.605 6.34148 15.5443 8.22106 14.6616 9.75L13.0766 12.4953C12.5407 13.4235 11.5503 13.9953 10.4785 13.9953H7.06895ZM5.52196 7C4.80743 7 4.14718 7.3812 3.78991 8L2.20492 10.7453C1.62757 11.7453 2.34926 12.9953 3.50396 12.9953L10.4785 12.9953C11.193 12.9953 11.8533 12.6141 12.2105 11.9953L13.7955 9.25C14.3729 8.25 13.6512 7 12.4965 7L5.52196 7Z" },
					"child": []
				}]
			})(props);
		}
		function VscFile(props) {
			return GenIcon({
				"tag": "svg",
				"attr": {
					"viewBox": "0 0 16 16",
					"fill": "currentColor"
				},
				"child": [{
					"tag": "path",
					"attr": { "d": "M5 1C3.89543 1 3 1.89543 3 3V13C3 14.1046 3.89543 15 5 15H11C12.1046 15 13 14.1046 13 13V5.41421C13 5.01639 12.842 4.63486 12.5607 4.35355L9.64645 1.43934C9.36514 1.15804 8.98361 1 8.58579 1H5ZM4 3C4 2.44772 4.44772 2 5 2H8V4.5C8 5.32843 8.67157 6 9.5 6H12V13C12 13.5523 11.5523 14 11 14H5C4.44772 14 4 13.5523 4 13V3ZM11.7929 5H9.5C9.22386 5 9 4.77614 9 4.5V2.20711L11.7929 5Z" },
					"child": []
				}]
			})(props);
		}
		//#endregion
		//#region src/client/browser.ts
		/**
		* Decide whether a site can render inside the sidebar iframe. The signals
		* are exactly the ones the BROWSER enforces when it refuses an iframe load:
		* X-Frame-Options DENY/SAMEORIGIN, or a frame-ancestors directive that does
		* not allow `*` ('self' here means the SITE's own origin — never ours, so
		* it also blocks the sidebar). A site we could not reach yields 'unknown'
		* and the plain iframe stays.
		*/
		function embeddabilityOf(probe) {
			if (probe.reachable !== true) return "unknown";
			const xfo = probe.xFrameOptions?.trim().toUpperCase();
			if (xfo === "DENY" || xfo === "SAMEORIGIN") return "blocked";
			if (probe.frameAncestors !== void 0 && !probe.frameAncestors.some((source) => source === "*")) return "blocked";
			return "embeddable";
		}
		/** A loopback hostname (localhost, IPv6 ::1, 127.0.0.0/8, 0.0.0.0). */
		function isLoopbackHostname(hostname) {
			const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
			if (host === "localhost" || host === "::1" || host === "0.0.0.0") return true;
			const parts = host.split(".");
			return parts.length === 4 && parts[0] === "127" && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
		}
		/**
		* Normalize one address-bar input against the navigation policy.
		* @param input - raw user text.
		* @param selfOrigin - the GUI's own origin (window.location.origin). The GUI
		* itself may be browsed in the sidebar (the sandbox keeps it opaque), so it
		* is let through BEFORE the loopback check — its host is normally loopback.
		*/
		/** Schemes that must never reach the iframe, even without `//` (javascript:,
		*  data:, file:, ...). Host:port lookalikes (example.com:8080) are NOT here —
		*  they parse as hosts below. */
		const FORBIDDEN_SCHEMES = /* @__PURE__ */ new Set([
			"javascript",
			"data",
			"file",
			"about",
			"vbscript",
			"blob",
			"mailto",
			"tel",
			"ftp",
			"ftps",
			"ws",
			"wss",
			"sftp",
			"ssh",
			"chrome",
			"chrome-extension",
			"moz-extension",
			"edge",
			"opera",
			"resource",
			"view-source"
		]);
		function normalizeBrowserUrl(input, selfOrigin) {
			const trimmed = input.trim();
			if (trimmed === "") return { kind: "invalid" };
			const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(trimmed);
			let withScheme;
			if (schemeMatch === null) withScheme = `https://${trimmed}`;
			else {
				const scheme = schemeMatch[1].toLowerCase();
				if (scheme === "http" || scheme === "https") withScheme = trimmed;
				else if (FORBIDDEN_SCHEMES.has(scheme)) return {
					kind: "blocked",
					reason: "scheme"
				};
				else withScheme = `https://${trimmed}`;
			}
			let url;
			try {
				url = new URL(withScheme);
			} catch {
				return { kind: "invalid" };
			}
			if (url.protocol !== "http:" && url.protocol !== "https:") return {
				kind: "blocked",
				reason: "scheme"
			};
			try {
				if (url.origin === new URL(selfOrigin).origin) return {
					kind: "ok",
					url: url.href
				};
			} catch {}
			if (isLoopbackHostname(url.hostname)) return {
				kind: "blocked",
				reason: "loopback"
			};
			return {
				kind: "ok",
				url: url.href
			};
		}
		//#endregion
		//#region src/client/SandboxStatusBar.tsx
		/**
		* The live sandbox status row of the two built-in web surfaces (HTML
		* preview and the browser tab): a green "sandbox on" state with a one-tap
		* TEMPORARY unlock, or a RED "sandbox off" state (global setting or the
		* temporary unlock) with a restore action.
		*
		* The temporary unlock is component state only — it never writes the
		* global side card setting (`htmlViewerNoSandbox` / `browserNoSandbox`);
		* it lasts until the surface unmounts (tab switch / file switch) or the
		* user restores the sandbox from the row. When the global setting already
		* drops the sandbox, no unlock/restore action is offered (changing the
		* global setting is the settings page's job) — the red warning stands.
		*/
		function SandboxStatusBar(props) {
			const { sandboxed, local, dangerCopy, onUnlock, onRestore } = props;
			if (sandboxed) {
				const copy = t("sandboxStatusOn");
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: clsx(sidebar_module_css_default.sandboxStatus, sidebar_module_css_default.sandboxStatusOn),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: sidebar_module_css_default.sandboxDot }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: sidebar_module_css_default.sandboxStatusText,
							title: copy,
							children: copy
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: sidebar_module_css_default.sandboxAction,
							onClick: onUnlock,
							children: t("sandboxUnlock")
						})
					]
				});
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: clsx(sidebar_module_css_default.sandboxStatus, sidebar_module_css_default.sandboxStatusOff),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: sidebar_module_css_default.sandboxDot }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: sidebar_module_css_default.sandboxStatusText,
						title: dangerCopy,
						children: dangerCopy
					}),
					local && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: sidebar_module_css_default.sandboxAction,
						onClick: onRestore,
						children: t("sandboxRestore")
					})
				]
			});
		}
		//#endregion
		//#region src/client/BrowserView.tsx
		/**
		* The built-in browser tab: an address bar plus a sandboxed iframe.
		*
		* Security model (see browser.ts + the sandbox tokens below): the iframe is
		* ALWAYS sandboxed without `allow-same-origin` (opaque origin — the visited
		* page can never sit on the GUI's origin, read its storage, or reach
		* /sidebar/api) and without `allow-top-navigation` (a page must not hijack
		* the GUI). The address bar only accepts http(s) and refuses loopback /
		* the GUI's own origin. The side card setting "关闭浏览器沙箱" drops the
		* sandbox attribute entirely for fully trusted sites — the visited page then
		* runs with the GUI's own origin and full session access, so a persistent
		* warning bar renders while it is off.
		*
		* The URL is persisted onto the tab (path/title via the patchTab reducer)
		* so a reload restores the visited page; the back/forward stack only tracks
		* address-bar navigations (in-frame link clicks are cross-origin and
		* invisible — a documented limitation).
		*/
		/**
		* The browser iframe sandbox tokens. NO allow-same-origin (opaque origin —
		* no GUI storage/API access), NO allow-top-navigation (a browsed page must
		* not hijack the GUI). allow-forms/allow-popups/allow-downloads/allow-modals
		* keep login flows working; allow-popups-to-escape-sandbox lets OAuth
		* popups open as normal tabs (they are cross-origin to the GUI either way).
		*/
		const BROWSER_IFRAME_SANDBOX = "allow-scripts allow-forms allow-popups allow-downloads allow-modals allow-popups-to-escape-sandbox";
		function BrowserView(props) {
			const { store, tab } = props;
			const [url, setUrl] = (0, react.useState)(tab.path);
			const [input, setInput] = (0, react.useState)(tab.path ?? "");
			/** Blocked/invalid hint shown under the address bar (null = none). */
			const [message, setMessage] = (0, react.useState)(null);
			/** Address-bar navigation history (in-frame clicks are not tracked). */
			const [history, setHistory] = (0, react.useState)(tab.path !== void 0 ? [tab.path] : []);
			const [cursor, setCursor] = (0, react.useState)(tab.path !== void 0 ? 0 : -1);
			/** Bumped on reload to remount the iframe (also remounts on sandbox flip). */
			const [reloadKey, setReloadKey] = (0, react.useState)(0);
			/** TEMPORARY sandbox unlock for THIS surface only (never writes the global
			*  side card setting; lasts until the tab unmounts or the user restores). */
			const [localUnlock, setLocalUnlock] = (0, react.useState)(false);
			const noSandbox = store.getPrefs().browserNoSandbox === true || localUnlock;
			/** A site that refuses to be embedded (X-Frame-Options / frame-ancestors):
			*  the probe verdict shown instead of the blank iframe. */
			const [embedBlocked, setEmbedBlocked] = (0, react.useState)(null);
			/** The user asked to load the refused site anyway (keeps the plain iframe). */
			const [forceEmbed, setForceEmbed] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				if (url === void 0) return;
				let cancelled = false;
				setEmbedBlocked(null);
				setForceEmbed(false);
				api.browserProbe(url).then((probe) => {
					if (!cancelled && embeddabilityOf(probe) === "blocked") setEmbedBlocked(url);
				}).catch(() => {});
				return () => {
					cancelled = true;
				};
			}, [url]);
			const persist = (nextUrl) => {
				let host = nextUrl;
				try {
					host = new URL(nextUrl).hostname;
				} catch {}
				store.reduce((state) => patchTab(state, tab.id, {
					path: nextUrl,
					title: host
				}));
			};
			const navigateTo = (raw) => {
				const result = normalizeBrowserUrl(raw, window.location.origin);
				if (result.kind === "ok") {
					const next = result.url;
					setUrl(next);
					setInput(next);
					setMessage(null);
					setHistory((previous) => [...previous.slice(0, cursor + 1), next]);
					setCursor((previous) => previous + 1);
					setReloadKey((key) => key + 1);
					persist(next);
					return;
				}
				setMessage(result.kind === "invalid" ? t("browserInvalid") : result.reason === "scheme" ? t("browserBlockedScheme") : t("browserBlockedLoopback"));
			};
			const goBack = () => {
				if (cursor <= 0) return;
				const next = history[cursor - 1];
				setCursor(cursor - 1);
				setUrl(next);
				setInput(next);
				setReloadKey((key) => key + 1);
			};
			const goForward = () => {
				if (cursor >= history.length - 1) return;
				const next = history[cursor + 1];
				setCursor(cursor + 1);
				setUrl(next);
				setInput(next);
				setReloadKey((key) => key + 1);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: sidebar_module_css_default.browser,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: sidebar_module_css_default.browserBar,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: sidebar_module_css_default.iconButton,
								"aria-label": t("browserBack"),
								title: t("browserBack"),
								disabled: cursor <= 0,
								onClick: goBack,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronLeftOutline14, {})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: sidebar_module_css_default.iconButton,
								"aria-label": t("browserForward"),
								title: t("browserForward"),
								disabled: cursor >= history.length - 1,
								onClick: goForward,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronRightOutline14, {})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: sidebar_module_css_default.iconButton,
								"aria-label": t("refresh"),
								title: t("refresh"),
								onClick: () => {
									setReloadKey((key) => key + 1);
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRefreshOutline14, {})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: sidebar_module_css_default.browserInput,
								value: input,
								placeholder: t("browserPlaceholder"),
								spellCheck: false,
								onChange: (event) => {
									setInput(event.target.value);
								},
								onKeyDown: (event) => {
									if (event.key === "Enter") navigateTo(input);
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: sidebar_module_css_default.iconButton,
								"aria-label": t("browserGo"),
								title: t("browserGo"),
								onClick: () => {
									navigateTo(input);
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconLinkOutline14, {})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: sidebar_module_css_default.iconButton,
								"aria-label": t("browserOpenExternal"),
								title: t("browserOpenExternal"),
								disabled: url === void 0,
								onClick: () => {
									if (url !== void 0) window.open(url, "_blank", "noopener");
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(VscLinkExternal, { size: 15 })
							})
						]
					}),
					message !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: sidebar_module_css_default.browserMessage,
						children: message
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SandboxStatusBar, {
						sandboxed: !noSandbox,
						local: localUnlock,
						dangerCopy: t("browserNoSandboxWarning"),
						onUnlock: () => {
							setLocalUnlock(true);
						},
						onRestore: () => {
							setLocalUnlock(false);
						}
					}),
					url === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: sidebar_module_css_default.browserStart,
						children: t("browserStart")
					}) : embedBlocked !== null && !forceEmbed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BrowserEmbedBlocked, {
						url: embedBlocked,
						onOpenInBrowser: () => {
							window.open(embedBlocked, "_blank", "noopener");
						},
						onLoadAnyway: () => {
							setForceEmbed(true);
						}
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("iframe", {
						className: sidebar_module_css_default.browserFrame,
						src: url,
						sandbox: noSandbox ? void 0 : BROWSER_IFRAME_SANDBOX,
						referrerPolicy: "no-referrer",
						allow: "",
						title: url
					}, `${reloadKey}:${noSandbox ? "ns" : "sb"}`)
				]
			});
		}
		/**
		* The embed-refusal panel: shown when the probed site forbids being
		* displayed inside other pages (X-Frame-Options / frame-ancestors) — the
		* iframe would only show the browser's "refused to connect" blank. Explains
		* the reason and offers the real-browser open plus a load-anyway escape.
		* Exported so the copy and the actions are testable without a DOM.
		*/
		function BrowserEmbedBlocked(props) {
			const { url, onOpenInBrowser, onLoadAnyway } = props;
			let host = url;
			try {
				host = new URL(url).hostname;
			} catch {}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: sidebar_module_css_default.browserBlocked,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconWarningOutline16, { size: 16 }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: sidebar_module_css_default.browserBlockedTitle,
						children: t("browserEmbedBlocked", { host })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: sidebar_module_css_default.browserBlockedDesc,
						children: t("browserEmbedBlockedDesc")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: sidebar_module_css_default.browserBlockedActions,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: sidebar_module_css_default.browserBlockedButton,
							onClick: onOpenInBrowser,
							children: t("browserOpenExternal")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: sidebar_module_css_default.browserBlockedButton,
							onClick: onLoadAnyway,
							children: t("browserEmbedAnyway")
						})]
					})
				]
			});
		}
		//#endregion
		//#region src/client/builtins/tabs.tsx
		/**
		* The 7 built-in tab descriptors: the plugin registers its own pages
		* (editor / git / subagent / sidechat / terminal / browser / diff) through
		* the same {@link BetterSidebarService} external plugins use — eating its
		* own dogfood. The terminal descriptor owns its quota (`TERMINAL_LIMIT`)
		* and mints `terminal:<uuid>` ids through `createTab`; the browser mints
		* `browser:<n>` the same way (no quota). The editor IS the files window
		* (the old standalone explorer merged into it).
		*/
		/**
		* Lazy wrapper over the terminal view: xterm (and its stylesheet) is fetched
		* only when a terminal tab is first opened (see chunk-loader.ts). The
		* wrapper keeps the descriptor contract `(props) => ReactNode` — Sidebar
		* calls it as a plain function.
		*
		* TerminalView's props are { scope, tabId, store } — `tabId` is NOT part of
		* TabComponentProps (it carries `tab: SidebarTab` instead), so the
		* descriptor maps it explicitly; a bare pass-through would leave tabId
		* undefined and TerminalView's isAgentTabId(tabId) would crash on
		* `undefined.startsWith` (regression-pinned in tests/lazy-chunk.spec.tsx).
		*/
		const LazyTerminal = lazyChunkComponent("terminal", (mod) => mod.TerminalView);
		/** A client-side uuid for terminal tab identity (not shown in the UI). */
		function terminalUuid() {
			if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
			return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
		}
		/** Count UI-owned terminals (agent:` tabs excluded — they are the model's). */
		function uiTerminalCount(state) {
			return allLeaves(state.splits).flatMap((leaf) => leaf.tabs).filter((tab) => tab.type === "terminal" && !isAgentTabId(tab.id)).length;
		}
		/** The 6 built-in tab descriptors. */
		function builtinTabs(ctx, options = {}) {
			return [
				{
					id: "editor",
					title: () => t("files"),
					icon: (size) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderOpen16, { size }),
					order: 10,
					hidden: false,
					dedupeKey: (tab) => tab.path,
					settings: { render: ({ pluginSettings, updatePluginSetting }) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(OpenWithSettings, {
						pluginSettings,
						updatePluginSetting
					}) },
					component: ({ ctx, store, scope, tab, visible, expanded, onToggleDir, onReferenceFile }) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EditorHost, {
						ctx,
						store,
						scope,
						tab,
						visible,
						expanded: expanded ?? [],
						onToggleDir: onToggleDir ?? (() => {}),
						onReferenceFile: onReferenceFile ?? (() => {})
					})
				},
				{
					id: "git",
					title: () => t("git"),
					icon: (size) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBranchOutline16, { size }),
					order: 20,
					single: true,
					component: ({ ctx, store, scope, onOpenDiff }) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(GitView, {
						scope,
						onOpenFile: (path) => {
							openSidebarFile(ctx, store, scope.sessionId, path);
						},
						onOpenDiff: onOpenDiff ?? (() => {})
					})
				},
				{
					id: "subagent",
					title: () => t("subagent"),
					icon: (size) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconThinkOutline16, { size }),
					order: 30,
					single: true,
					settings: { toggles: [{
						key: "autoOpenSubagent",
						title: () => t("settingsSubagentTitle"),
						desc: () => t("settingsSubagentDesc")
					}, {
						key: "autoOpenJobs",
						title: () => t("settingsJobsTitle"),
						desc: () => t("settingsJobsDesc")
					}] },
					component: ({ ctx, scope, visible, onSubagentJump }) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SubagentView, {
						sessionId: scope.sessionId,
						ctx,
						active: visible,
						onOpenChild: (address) => {
							onSubagentJump?.(address.childSessionId);
						}
					})
				},
				{
					id: "sidechat",
					title: () => t("sideChat"),
					icon: (size) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconNewChatOutline16, { size }),
					order: 35,
					createTab: () => {
						const threadId = consumeSidechatSeed();
						if (threadId !== void 0) return { tab: {
							id: `sidechat:${threadId}`,
							type: "sidechat",
							title: t("sideChat"),
							meta: { threadId }
						} };
						return { tab: {
							id: `sidechat:new-${crypto.randomUUID()}`,
							type: "sidechat",
							title: t("sideChatUntitled"),
							meta: { autoCreate: true }
						} };
					},
					dedupeKey: (tab) => sidechatThreadIdOf(tab),
					onClose: (tab) => {
						const threadId = sidechatThreadIdOf(tab);
						if (threadId !== void 0) api.sidechatDispose(threadId).catch(() => {});
					},
					component: ({ ctx, scope, tab, visible }) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SideChatView, {
						ctx,
						scope,
						tab,
						visible
					})
				},
				{
					id: "terminal",
					title: () => t("terminal"),
					icon: (size) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconTerminalOutline16, { size }),
					order: 40,
					available: (_ctx, _scope, state) => uiTerminalCount(state) < 3,
					settings: { toggles: [
						{
							key: "agentTerminalTools",
							title: () => t("settingsToolsTitle"),
							desc: () => t("settingsToolsDesc")
						},
						{
							key: "bottomPanelAutoTerminal",
							title: () => t("settingsBottomTerminalTitle"),
							desc: () => t("settingsBottomTerminalDesc")
						},
						{
							key: "terminalShell",
							type: "text",
							title: () => t("settingsShellTitle"),
							desc: () => t("settingsShellDesc"),
							placeholder: t("settingsShellPlaceholder")
						},
						{
							key: "terminalShellArgs",
							type: "text",
							title: () => t("settingsShellArgsTitle"),
							desc: () => t("settingsShellArgsDesc"),
							placeholder: t("settingsShellArgsPlaceholder")
						},
						{
							key: "terminalFontFamily",
							type: "text",
							title: () => t("settingsFontFamilyTitle"),
							desc: () => t("settingsFontFamilyDesc"),
							placeholder: t("settingsFontFamilyPlaceholder")
						},
						{
							key: "terminalFontSize",
							type: "number",
							title: () => t("settingsFontSizeTitle"),
							desc: () => t("settingsFontSizeDesc"),
							min: 9,
							max: 32,
							unit: "px"
						}
					] },
					createTab: (state) => {
						if (uiTerminalCount(state) >= 3) return null;
						return {
							tab: {
								id: `terminal:${terminalUuid()}`,
								type: "terminal",
								title: options.terminalTitle?.() ?? t("terminal")
							},
							patch: { nextTerminal: state.nextTerminal + 1 }
						};
					},
					component: ({ tab, scope, store }) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LazyTerminal, {
						scope,
						store,
						tabId: tab.id
					})
				},
				{
					id: "browser",
					title: () => t("browser"),
					icon: (size) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconGlobeOutline16, { size }),
					order: 50,
					settings: { toggles: [
						{
							key: "browserNoSandbox",
							title: () => t("settingsBrowserSandboxTitle"),
							desc: () => t("settingsBrowserSandboxDesc")
						},
						{
							key: "browserInterceptLinks",
							title: () => t("settingsBrowserLinksTitle"),
							desc: () => t("settingsBrowserLinksDesc")
						},
						{
							key: "browserInterceptHttp",
							title: () => t("settingsBrowserHttpTitle"),
							desc: () => t("settingsBrowserHttpDesc")
						},
						{
							key: "browserInterceptHttps",
							title: () => t("settingsBrowserHttpsTitle"),
							desc: () => t("settingsBrowserHttpsDesc")
						}
					] },
					createTab: (state) => ({
						tab: {
							id: `browser:${state.nextBrowser}`,
							type: "browser",
							title: t("browser")
						},
						patch: { nextBrowser: state.nextBrowser + 1 }
					}),
					component: (props) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BrowserView, { ...props })
				},
				{
					id: "diff",
					title: () => t("git"),
					icon: (size) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconDiffOutline16, { size }),
					order: -1,
					hidden: true,
					dedupeKey: (tab) => tab.id,
					component: ({ scope, tab }) => tab.diff === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DiffTab, {
						sessionId: scope.sessionId,
						cwd: scope.cwd,
						diff: tab.diff
					})
				}
			];
		}
		//#endregion
		//#region src/client/PdfView.tsx
		/** Browser-native PDF preview with an always-available download fallback. */
		function PdfView(props) {
			const { scope, path, title } = props;
			const [load, setLoad] = (0, react.useState)({ status: "loading" });
			const [interactionBlocked, setInteractionBlocked] = (0, react.useState)(false);
			const frameRef = (0, react.useRef)(null);
			const shieldRef = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				const controller = new AbortController();
				let objectUrl;
				setLoad({ status: "loading" });
				(async () => {
					try {
						const response = await fetch(mediaUrl(scope, path), { signal: controller.signal });
						if (!response.ok) throw new Error(`HTTP ${response.status}`);
						const bytes = await response.arrayBuffer();
						if (controller.signal.aborted) return;
						objectUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
						setLoad({
							status: "ready",
							url: objectUrl
						});
					} catch (error) {
						if (controller.signal.aborted) return;
						setLoad({
							status: "error",
							message: error instanceof Error ? error.message : String(error)
						});
					}
				})();
				return () => {
					controller.abort();
					if (objectUrl !== void 0) URL.revokeObjectURL(objectUrl);
				};
			}, [
				scope.sessionId,
				scope.cwd,
				path
			]);
			(0, react.useEffect)(() => {
				const block = () => {
					setInteractionBlocked(true);
					if (frameRef.current !== null) frameRef.current.style.pointerEvents = "none";
					if (shieldRef.current !== null) shieldRef.current.style.pointerEvents = "auto";
				};
				const unblock = () => {
					setInteractionBlocked(false);
					if (frameRef.current !== null) frameRef.current.style.pointerEvents = "";
					if (shieldRef.current !== null) shieldRef.current.style.pointerEvents = "none";
				};
				const blockForResize = (event) => {
					const target = event.target;
					if (target instanceof Element && target.closest(`.${sidebar_module_css_default.panelResize}, .${sidebar_module_css_default.divider}`) !== null) block();
				};
				document.addEventListener("dragstart", block, true);
				document.addEventListener("dragend", unblock, true);
				document.addEventListener("drop", unblock, true);
				window.addEventListener("pointerdown", blockForResize, true);
				window.addEventListener("pointerup", unblock, true);
				window.addEventListener("pointercancel", unblock, true);
				window.addEventListener("blur", unblock);
				return () => {
					document.removeEventListener("dragstart", block, true);
					document.removeEventListener("dragend", unblock, true);
					document.removeEventListener("drop", unblock, true);
					window.removeEventListener("pointerdown", blockForResize, true);
					window.removeEventListener("pointerup", unblock, true);
					window.removeEventListener("pointercancel", unblock, true);
					window.removeEventListener("blur", unblock);
				};
			}, []);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: sidebar_module_css_default.editorPdf,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: sidebar_module_css_default.editorPdfToolbar,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
						className: sidebar_module_css_default.editorDownloadLink,
						href: downloadUrl(scope, path),
						download: true,
						children: t("downloadToView")
					})
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: sidebar_module_css_default.editorPdfStage,
					children: [
						load.status === "loading" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: sidebar_module_css_default.editorPlaceholder,
							children: t("loading")
						}),
						load.status === "error" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: sidebar_module_css_default.editorError,
							children: load.message
						}),
						load.status === "ready" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("iframe", {
							ref: frameRef,
							className: clsx(sidebar_module_css_default.editorPdfFrame, interactionBlocked && sidebar_module_css_default.editorPdfFrameBlocked),
							src: load.url,
							title
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							ref: shieldRef,
							className: clsx(sidebar_module_css_default.editorPdfDragShield, interactionBlocked && sidebar_module_css_default.editorPdfDragShieldActive),
							"aria-hidden": "true"
						})
					]
				})]
			});
		}
		//#endregion
		//#region src/client/builtins/viewers.tsx
		/**
		* The 6 built-in file viewer descriptors: every preview surface is a
		* registered viewer (image / pdf / markdown / html / code /
		* binary-download), exactly like external plugins register theirs. Office
		* previews (.docx / .xlsx / .pptx) are NOT built in anymore — they moved to
		* the recommended office plugin (see plugins-viewers.ts), which registers
		* the same ids through this service.
		*
		* The `binary-download` viewer sniffs NUL bytes via `detect` for unknown
		* binaries and serves legacy doc/xls/ppt by extension; `code` is the
		* catch-all (`exts: []`, lowest priority) that claims any file no other
		* viewer did.
		*
		* The heavy viewers (the CodeMirror-backed markdown/html/code) render
		* through {@link lazyChunkComponent} wrappers — their libraries are fetched
		* only when such a file is first opened (see chunk-loader.ts). The
		* descriptor metadata (id/exts/priority/detect) is identical either way,
		* so matching semantics and external-plugin overrides are unaffected; the
		* `component` wrapper keeps the descriptor contract `(props) => ReactNode`.
		*
		* Every viewer carries the declarative settings-surface fields — `title`
		* and `icon` — so the Side card settings page can render the enable/disable
		* inventory without hardcoding (eating our own dogfood).
		*/
		/**
		* Read-only plain-text fallback used when the editor chunk cannot load: the
		* content is already in props (fsRead strategy fetched it through the host),
		* so the file stays viewable (a <pre> with the truncation banner) while the
		* chunk's auto-retry keeps working toward the real CodeMirror editor.
		*/
		function TextFallback(props) {
			const content = props.content ?? "";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [props.truncated === true && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: sidebar_module_css_default.editorBanner,
				children: t("truncation")
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
				style: {
					margin: 0,
					flex: "1 1 auto",
					minHeight: 0,
					overflow: "auto",
					font: "var(--dsw-font-markdown-code-block-small, 12px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace)",
					whiteSpace: "pre-wrap",
					overflowWrap: "anywhere",
					padding: "10px 14px",
					userSelect: "text"
				},
				children: content
			})] });
		}
		/**
		* Lazy wrapper over the chunk-resident viewer component. The `pick`
		* function is module-level (stable identity — the wrapper effect depends
		* on it); the cast bridges the chunk exports record to the descriptor prop
		* shape (the view reads only its own subset of FileViewerProps).
		*/
		const LazyTextEditor = lazyChunkComponent("editor", (mod) => mod.TextEditor, TextFallback);
		/** The 6 built-in file viewer descriptors. */
		function builtinViewers() {
			return [
				{
					id: "image",
					title: () => t("viewerImage"),
					icon: (size) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconImageOutline16, { size }),
					exts: [
						"png",
						"jpg",
						"jpeg",
						"gif",
						"webp",
						"svg",
						"bmp",
						"ico",
						"avif"
					],
					fetchStrategy: "mediaUrl",
					component: ({ mediaUrl: url, title }) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: sidebar_module_css_default.editorImageWrap,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
							className: sidebar_module_css_default.editorImage,
							src: url,
							alt: title
						})
					})
				},
				{
					id: "pdf",
					title: () => t("viewerPdf"),
					icon: (size) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconPdfOutline16, { size }),
					exts: ["pdf"],
					fetchStrategy: "mediaUrl",
					component: ({ scope, path, title }) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PdfView, {
						scope,
						path,
						title
					})
				},
				{
					id: "markdown",
					title: () => t("viewerMarkdown"),
					icon: (size) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconMarkdownOutline16, { size }),
					exts: ["md", "markdown"],
					fetchStrategy: "fsRead",
					component: (props) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LazyTextEditor, { ...props })
				},
				{
					id: "html",
					title: () => t("viewerHtml"),
					icon: (size) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconHtmlOutline16, { size }),
					exts: ["html", "htm"],
					fetchStrategy: "fsRead",
					settings: { toggles: [{
						key: "htmlViewerNoSandbox",
						title: () => t("settingsHtmlSandboxTitle"),
						desc: () => t("settingsHtmlSandboxDesc")
					}, {
						key: "htmlViewerDefaultUnsafe",
						title: () => t("settingsHtmlDefaultUnsafeTitle"),
						desc: () => t("settingsHtmlDefaultUnsafeDesc")
					}] },
					component: (props) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LazyTextEditor, { ...props })
				},
				{
					id: "code",
					title: () => t("viewerCode"),
					icon: (size) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCodeOutline16, { size }),
					exts: [],
					priority: -100,
					fetchStrategy: "fsRead",
					component: (props) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LazyTextEditor, { ...props })
				},
				{
					id: "binary-download",
					title: () => t("viewerBinary"),
					icon: (size) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconDownloadOutline16, { size }),
					exts: [
						"doc",
						"xls",
						"ppt"
					],
					priority: -50,
					fetchStrategy: "binary-download",
					detect: (_path, head) => head.includes(0),
					component: ({ scope, path }) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BinaryDownload, {
						scope,
						path
					})
				}
			];
		}
		//#endregion
		//#region src/client/builtins/index.ts
		/**
		* Register all built-in tabs and viewers with the service. Returns a
		* disposer that unregisters everything (cordis auto-invokes it on fiber
		* disposal). The `ctx` is threaded into tab descriptors that need it
		* (EditorHost reads `ctx.betterSidebar` for file-viewer matching).
		*/
		function registerBuiltins(ctx, service, options = {}) {
			const disposers = [];
			for (const tab of builtinTabs(ctx, options)) disposers.push(service.registerTab(tab));
			for (const viewer of builtinViewers()) disposers.push(service.registerFileViewer(viewer));
			return () => {
				for (const d of disposers) try {
					d();
				} catch {}
			};
		}
		//#endregion
		//#region src/client/conversation-draft.ts
		/**
		* Append `text` to the session's composer draft (space-separated, like the
		* @-mentions). Returns false — and logs — when the conversation service or
		* the session scope is unavailable.
		*/
		function appendToDraft(ctx, sessionId, text) {
			try {
				const actx = ctx.sessions.scope(sessionId);
				if (actx === void 0) return false;
				const conversation = ctx.get("conversation");
				if (conversation === void 0) return false;
				const input = conversation.input.for(actx);
				const draft = input.state.getSnapshot().draft;
				input.setDraft(draft.trim() === "" ? text : `${draft} ${text}`);
				return true;
			} catch (error) {
				console.warn("[dsh-better-sidebar] draft insert failed:", error);
				return false;
			}
		}
		//#endregion
		//#region src/client/TabBar.tsx
		/**
		* The tab strip of one pane: tabs capped at TAB_MAX_WIDTH (ellipsized),
		* overflow scrolls horizontally, a close button per tab, a four-way split
		* button cluster, and the + menu that opens new tabs (explorer / git /
		* terminal). Tabs are draggable; dropping onto another tab inserts before it,
		* dropping on the strip background appends to this pane. Right-clicking a
		* tab opens the tab context menu (close / close others / close to the left /
		* close to the right, all scoped to this pane).
		*/
		/** Drag payload for tab moves (HTML5 DnD dataTransfer). */
		const TAB_DRAG_TYPE = "application/x-dsh-tab";
		function serializeDrag(payload) {
			return JSON.stringify(payload);
		}
		function parseDrag(raw) {
			try {
				const parsed = JSON.parse(raw);
				if (typeof parsed.tabId === "string" && typeof parsed.paneId === "string") return parsed;
				return null;
			} catch {
				return null;
			}
		}
		/** Global tab-drag flag: PDF iframes become non-interactive synchronously. */
		function setTabDragging(active) {
			if (active) document.body.setAttribute("data-dsh-tab-dragging", "");
			else document.body.removeAttribute("data-dsh-tab-dragging");
		}
		function TabBar(props) {
			const { paneId, tabs, active, onActivate, onClose, onNewTab, newTabOptions, onDropTab, getTabIcon, getTabBadge } = props;
			const [menuOpen, setMenuOpen] = (0, react.useState)(false);
			const [tabMenu, setTabMenu] = (0, react.useState)(null);
			const [dragOver, setDragOver] = (0, react.useState)(false);
			const listRef = (0, react.useRef)(null);
			const tabMenuIndex = tabMenu === null ? -1 : tabs.findIndex((tab) => tab.id === tabMenu.tabId);
			const onCloseRef = (0, react.useRef)(onClose);
			const middlePressed = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				onCloseRef.current = onClose;
			});
			(0, react.useEffect)(() => {
				const onMouseUp = (event) => {
					if (event.button !== 1) return;
					const pressed = middlePressed.current;
					middlePressed.current = null;
					if (pressed !== null && pressed.node.isConnected && pressed.node.contains(event.target)) onCloseRef.current(pressed.id);
				};
				window.addEventListener("mouseup", onMouseUp);
				return () => {
					window.removeEventListener("mouseup", onMouseUp);
				};
			}, []);
			(0, react.useEffect)(() => {
				const el = listRef.current;
				if (el === null) return;
				const onWheel = (event) => {
					if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
					if (el.scrollWidth <= el.clientWidth) return;
					event.preventDefault();
					const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? el.clientWidth : 1;
					el.scrollLeft += (event.deltaX + event.deltaY) * unit;
				};
				el.addEventListener("wheel", onWheel, { passive: false });
				return () => {
					el.removeEventListener("wheel", onWheel);
				};
			}, []);
			(0, react.useEffect)(() => {
				const clear = () => {
					setTabDragging(false);
					setDragOver(false);
				};
				window.addEventListener("dragend", clear, true);
				window.addEventListener("drop", clear, true);
				window.addEventListener("blur", clear);
				return () => {
					window.removeEventListener("dragend", clear, true);
					window.removeEventListener("drop", clear, true);
					window.removeEventListener("blur", clear);
				};
			}, []);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: clsx(sidebar_module_css_default.tabBar, dragOver && sidebar_module_css_default.tabBarDrop),
				onDragOver: (event) => {
					event.preventDefault();
					event.stopPropagation();
					setDragOver(true);
				},
				onDragLeave: () => {
					setDragOver(false);
				},
				onDrop: (event) => {
					event.preventDefault();
					event.stopPropagation();
					setDragOver(false);
					setTabDragging(false);
					const payload = parseDrag(event.dataTransfer.getData(TAB_DRAG_TYPE));
					if (payload !== null) onDropTab(payload, null);
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					ref: listRef,
					className: sidebar_module_css_default.tabList,
					children: [
						tabs.map((tab) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: clsx(sidebar_module_css_default.tab, active === tab.id && sidebar_module_css_default.tabActive),
							title: tab.title,
							draggable: true,
							onDragStart: (event) => {
								setTabDragging(true);
								event.dataTransfer.setData(TAB_DRAG_TYPE, serializeDrag({
									tabId: tab.id,
									paneId
								}));
								event.dataTransfer.effectAllowed = "move";
							},
							onDragEnd: () => {
								setTabDragging(false);
								setDragOver(false);
							},
							onDragOver: (event) => {
								event.preventDefault();
								event.stopPropagation();
							},
							onDrop: (event) => {
								event.preventDefault();
								event.stopPropagation();
								setTabDragging(false);
								const payload = parseDrag(event.dataTransfer.getData(TAB_DRAG_TYPE));
								if (payload !== null) onDropTab(payload, tab.id);
							},
							onClick: () => {
								onActivate(tab.id);
							},
							onMouseDown: (event) => {
								if (event.button === 1) {
									event.preventDefault();
									middlePressed.current = {
										id: tab.id,
										node: event.currentTarget
									};
								}
							},
							onContextMenu: (event) => {
								event.preventDefault();
								setMenuOpen(false);
								setTabMenu({
									tabId: tab.id,
									x: event.clientX,
									y: event.clientY
								});
							},
							children: [
								getTabIcon?.(tab) ?? null,
								getTabBadge?.(tab) ?? null,
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: sidebar_module_css_default.tabTitle,
									style: isPreviewTab(tab) ? { fontStyle: "italic" } : void 0,
									children: tab.title
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: sidebar_module_css_default.tabClose,
									"aria-label": t("close"),
									onClick: (event) => {
										event.stopPropagation();
										onClose(tab.id);
									},
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCloseFill14, {})
								})
							]
						}, tab.id)),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
							open: menuOpen,
							onClose: () => {
								setMenuOpen(false);
							},
							items: newTabOptions.map((option) => ({
								id: option.id,
								label: option.label,
								...option.disabled === true ? { disabled: true } : {},
								...option.icon !== void 0 ? { icon: option.icon } : {}
							})),
							onSelect: (id) => {
								onNewTab(id);
								setMenuOpen(false);
							},
							portal: true,
							align: "end",
							anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: sidebar_module_css_default.tabBarPlus,
								"aria-label": t("newTab"),
								title: t("newTab"),
								onClick: () => {
									setMenuOpen((v) => !v);
									setTabMenu(null);
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16, {})
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
							open: tabMenu !== null && tabMenuIndex >= 0,
							onClose: () => {
								setTabMenu(null);
							},
							items: [
								{
									id: "close",
									label: t("close")
								},
								{
									id: "closeOthers",
									label: t("closeOtherTabs"),
									...tabs.length <= 1 ? { disabled: true } : {}
								},
								{
									id: "closeLeft",
									label: t("closeLeftTabs"),
									...tabMenuIndex <= 0 ? { disabled: true } : {}
								},
								{
									id: "closeRight",
									label: t("closeRightTabs"),
									...tabMenuIndex >= tabs.length - 1 ? { disabled: true } : {}
								}
							],
							onSelect: (id) => {
								const target = tabMenu;
								if (target === null) return;
								setTabMenu(null);
								const index = tabs.findIndex((tab) => tab.id === target.tabId);
								if (index < 0) return;
								if (id === "close") onClose(target.tabId);
								else if (id === "closeOthers") {
									for (const tab of tabs) if (tab.id !== target.tabId) onClose(tab.id);
								} else if (id === "closeLeft") for (const tab of tabs.slice(0, index)) onClose(tab.id);
								else if (id === "closeRight") for (const tab of tabs.slice(index + 1)) onClose(tab.id);
							},
							portal: true,
							align: "start",
							getAnchorRect: () => tabMenu === null ? null : new DOMRect(tabMenu.x, tabMenu.y, 0, 0),
							anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {})
						})
					]
				})
			});
		}
		//#endregion
		//#region src/client/frame-batcher.ts
		function createFrameBatcher() {
			let frame = null;
			let task = null;
			const run = () => {
				frame = null;
				const current = task;
				task = null;
				current?.();
			};
			return {
				schedule(next) {
					task = next;
					if (frame === null) frame = requestAnimationFrame(run);
				},
				flushNow() {
					if (frame !== null) {
						cancelAnimationFrame(frame);
						frame = null;
					}
					run();
				},
				dispose() {
					if (frame !== null) {
						cancelAnimationFrame(frame);
						frame = null;
					}
					task = null;
				}
			};
		}
		//#endregion
		//#region src/client/split-pane.tsx
		/**
		* The split-pane workbench: renders the recursive split tree. A split lays
		* children out row- or column-wise with draggable dividers (fractional
		* sizes); a leaf renders its tab strip plus the active tab's content.
		*
		* Splitting is VSCode-style DRAG-TO-EDGE, not buttons: while dragging a tab
		* over a pane, a drop overlay shows five zones — four edges (left/right/up/
		* down) that split the pane with the tab in a fresh leaf, and the center
		* that merges the tab into the pane. The tree and all operations live in
		* state.ts; this file is pure presentation over them.
		*/
		/** One divider: pointer-capture drag translating px deltas into fractions.
		* Deltas are incremental — each move reports the displacement since the
		* previous move — because the store adds every reported delta to the pane
		* sizes; a cumulative (since-pointer-down) delta would be re-added on each
		* move and the divider would run away from the cursor.
		*
		* The moves are BATCHED per frame (createFrameBatcher): a pointer stream
		* fires faster than the display refresh, and applying each move is a store
		* reduce that re-renders both workbenches (terminals, editors, trees) per
		* event — the visible drag lag on slower CPUs (#315). The batch accumulates
		* the incremental deltas in a ref and applies the summed fraction at most
		* once per frame; the sum equals what the per-event application would have
		* produced (the reducer clamps each application, and at a settled position
		* a clamped sum is clamped to the same boundary), so the result is
		* indistinguishable at rest and at most one frame behind the cursor.
		*/
		function Divider(props) {
			const { dir, onResize } = props;
			const last = (0, react.useRef)({
				x: 0,
				y: 0,
				size: 0
			});
			const [dragging, setDragging] = (0, react.useState)(false);
			const pendingDelta = (0, react.useRef)(0);
			const batcher = (0, react.useRef)(createFrameBatcher()).current;
			(0, react.useEffect)(() => () => batcher.dispose(), [batcher]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: clsx(sidebar_module_css_default.divider, dir === "row" ? sidebar_module_css_default.dividerRow : sidebar_module_css_default.dividerCol, dragging && sidebar_module_css_default.dividerActive),
				onPointerDown: (event) => {
					event.preventDefault();
					event.currentTarget.setPointerCapture(event.pointerId);
					const box = event.currentTarget.parentElement?.getBoundingClientRect();
					last.current = {
						x: event.clientX,
						y: event.clientY,
						size: box === void 0 ? 1 : dir === "row" ? box.width : box.height
					};
					setDragging(true);
				},
				onPointerMove: (event) => {
					if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
					const delta = dir === "row" ? event.clientX - last.current.x : event.clientY - last.current.y;
					pendingDelta.current += delta;
					batcher.schedule(() => {
						const accumulated = pendingDelta.current;
						pendingDelta.current = 0;
						if (accumulated !== 0) onResize(accumulated / Math.max(1, last.current.size));
					});
					last.current.x = event.clientX;
					last.current.y = event.clientY;
				},
				onPointerUp: (event) => {
					if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
					batcher.flushNow();
					event.currentTarget.releasePointerCapture(event.pointerId);
					setDragging(false);
				}
			});
		}
		/** Map a pointer position inside a pane to the VSCode drop zone (25% edges). */
		function zoneAt(event, pane) {
			const rect = pane.getBoundingClientRect();
			if (rect.width === 0 || rect.height === 0) return "center";
			const x = (event.clientX - rect.left) / rect.width;
			const y = (event.clientY - rect.top) / rect.height;
			if (x < .25) return "left";
			if (x > .75) return "right";
			if (y < .25) return "up";
			if (y > .75) return "down";
			return "center";
		}
		/** The icon of one openable type card (mirror of the + menu options). */
		/**
		* An empty pane's welcome cards: the openable types as cards, clicked to
		* open (instead of a bare "this pane is empty" message).
		*/
		function PaneEmptyCards(props) {
			const { newTabOptions, onNewTab } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: sidebar_module_css_default.paneEmptyCards,
				children: newTabOptions.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: sidebar_module_css_default.paneCard,
					disabled: option.disabled === true,
					title: option.label,
					onClick: () => {
						onNewTab(option.id);
					},
					children: [option.icon ?? null, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: option.label })]
				}, option.id))
			});
		}
		/** A leaf: tab strip + active content + VSCode-style drop target for tabs. */
		function LeafView(props) {
			const { leaf, newTabOptions, actions, onNewTab, renderTab, getTabIcon, getTabBadge } = props;
			const [dropZone, setDropZone] = (0, react.useState)(null);
			const activeTab = leaf.tabs.find((tab) => tab.id === leaf.active) ?? leaf.tabs[leaf.tabs.length - 1];
			(0, react.useEffect)(() => {
				const clear = () => {
					setDropZone(null);
				};
				window.addEventListener("dragend", clear, true);
				window.addEventListener("drop", clear, true);
				window.addEventListener("blur", clear);
				return () => {
					window.removeEventListener("dragend", clear, true);
					window.removeEventListener("drop", clear, true);
					window.removeEventListener("blur", clear);
				};
			}, []);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: clsx(sidebar_module_css_default.pane, dropZone !== null && sidebar_module_css_default.paneDrop),
				onPointerDown: () => {
					actions.focusPane(leaf.id);
				},
				onDragOver: (event) => {
					event.preventDefault();
					const zone = zoneAt(event, event.currentTarget);
					setDropZone(zone);
				},
				onDragLeave: (event) => {
					if (!event.currentTarget.contains(event.relatedTarget)) setDropZone(null);
				},
				onDrop: (event) => {
					event.preventDefault();
					const zone = dropZone ?? zoneAt(event, event.currentTarget);
					setDropZone(null);
					const payload = parseDrag(event.dataTransfer.getData("application/x-dsh-tab"));
					if (payload !== null) actions.moveTabToEdge(payload, leaf.id, zone);
				},
				children: [
					dropZone !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: clsx(sidebar_module_css_default.dropOverlay, sidebar_module_css_default[`drop${dropZone[0].toUpperCase()}${dropZone.slice(1)}`]) }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TabBar, {
						paneId: leaf.id,
						tabs: leaf.tabs,
						active: leaf.active,
						onActivate: (tabId) => {
							actions.activateTab(leaf.id, tabId);
						},
						onClose: (tabId) => {
							actions.closeTab(leaf.id, tabId);
						},
						onNewTab,
						newTabOptions,
						getTabIcon,
						getTabBadge,
						onDropTab: (payload, before) => {
							if (before === null) actions.moveTabToEdge(payload, leaf.id, "center");
							else actions.moveTabBefore(payload, leaf.id, before);
						}
					}),
					leaf.tabs.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: sidebar_module_css_default.paneContent,
						children: leaf.tabs.map((tab) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: clsx(sidebar_module_css_default.paneTab, tab.id !== activeTab?.id && sidebar_module_css_default.paneTabHidden),
							children: renderTab(tab, tab.id === activeTab?.id, leaf.id)
						}, tab.id))
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PaneEmptyCards, {
						newTabOptions,
						onNewTab
					})
				]
			});
		}
		/** Recursive node renderer. */
		function NodeView(props) {
			const { node, state, newTabOptions, actions, onNewTab, renderTab, getTabIcon, getTabBadge } = props;
			if (node.kind === "leaf") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LeafView, {
				leaf: node,
				newTabOptions,
				actions,
				onNewTab,
				renderTab,
				getTabIcon,
				getTabBadge
			});
			const isRow = node.dir === "row";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: clsx(sidebar_module_css_default.split, isRow ? sidebar_module_css_default.splitRow : sidebar_module_css_default.splitCol),
				children: node.children.map((child, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react.Fragment, { children: [index > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Divider, {
					dir: node.dir,
					onResize: (deltaFrac) => {
						actions.resizeSplit(node.id, index - 1, deltaFrac);
					}
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: sidebar_module_css_default.splitChild,
					style: {
						flexGrow: node.sizes[index],
						flexBasis: 0,
						minWidth: 0,
						minHeight: 0
					},
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(NodeView, {
						node: child,
						state,
						newTabOptions,
						actions,
						onNewTab,
						renderTab,
						getTabIcon,
						getTabBadge
					})
				})] }, child.id))
			});
		}
		/** The workbench: the split tree filling the sidebar body. `tree` selects
		*  which tree renders (the right panel's by default; the bottom panel passes
		*  `state.bottomSplits` — the actions route by pane id, so one action set
		*  serves both). */
		function Workbench(props) {
			const { state, tree, newTabOptions, actions, onNewTab, renderTab, getTabIcon, getTabBadge } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: sidebar_module_css_default.workbench,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(NodeView, {
					node: tree ?? state.splits,
					state,
					newTabOptions,
					actions,
					onNewTab,
					renderTab,
					getTabIcon,
					getTabBadge
				})
			});
		}
		//#endregion
		//#region src/client/prefs.ts
		/** Validate one raw resolved value into {@link SidebarPrefs}. Used for the
		* settings.get payload AND the settings.update response (both carry the
		* layered resolved value); any malformed field falls back to its default.
		* @param value - the raw resolved section from the settings wire.
		* @returns validated prefs (always well-formed).
		*/
		function parsePrefs(value) {
			if (value === null || typeof value !== "object") return { ...SIDEBAR_PREFS_DEFAULTS };
			const record = value;
			return {
				openByDefault: typeof record.openByDefault === "boolean" ? record.openByDefault : SIDEBAR_PREFS_DEFAULTS.openByDefault,
				defaultWidthPercent: typeof record.defaultWidthPercent === "number" && Number.isFinite(record.defaultWidthPercent) ? clampWidthPercent(record.defaultWidthPercent) : SIDEBAR_PREFS_DEFAULTS.defaultWidthPercent,
				autoOpenSubagent: typeof record.autoOpenSubagent === "boolean" ? record.autoOpenSubagent : SIDEBAR_PREFS_DEFAULTS.autoOpenSubagent,
				autoOpenJobs: typeof record.autoOpenJobs === "boolean" ? record.autoOpenJobs : SIDEBAR_PREFS_DEFAULTS.autoOpenJobs,
				agentTerminalTools: typeof record.agentTerminalTools === "boolean" ? record.agentTerminalTools : SIDEBAR_PREFS_DEFAULTS.agentTerminalTools,
				bottomPanelAutoTerminal: typeof record.bottomPanelAutoTerminal === "boolean" ? record.bottomPanelAutoTerminal : SIDEBAR_PREFS_DEFAULTS.bottomPanelAutoTerminal,
				terminalFontFamily: typeof record.terminalFontFamily === "string" ? record.terminalFontFamily : SIDEBAR_PREFS_DEFAULTS.terminalFontFamily,
				terminalShell: typeof record.terminalShell === "string" ? record.terminalShell : SIDEBAR_PREFS_DEFAULTS.terminalShell,
				terminalShellArgs: typeof record.terminalShellArgs === "string" ? record.terminalShellArgs : SIDEBAR_PREFS_DEFAULTS.terminalShellArgs,
				terminalFontSize: typeof record.terminalFontSize === "number" && Number.isFinite(record.terminalFontSize) ? clampTerminalFontSize(record.terminalFontSize) : SIDEBAR_PREFS_DEFAULTS.terminalFontSize,
				interceptOpenPath: typeof record.interceptOpenPath === "boolean" ? record.interceptOpenPath : SIDEBAR_PREFS_DEFAULTS.interceptOpenPath,
				editorExplorer: typeof record.editorExplorer === "boolean" ? record.editorExplorer : SIDEBAR_PREFS_DEFAULTS.editorExplorer,
				titleBarScheme: isTitleBarScheme(record.titleBarScheme) ? record.titleBarScheme : record.titleBarCompat === true || hasLegacyStripValue(record.titleBarStripPx) ? "custom" : "auto",
				titleBarPresetId: typeof record.titleBarPresetId === "string" ? record.titleBarPresetId : SIDEBAR_PREFS_DEFAULTS.titleBarPresetId,
				customCss: typeof record.customCss === "string" ? record.customCss : SIDEBAR_PREFS_DEFAULTS.customCss,
				titleBarCompat: typeof record.titleBarCompat === "boolean" ? record.titleBarCompat : SIDEBAR_PREFS_DEFAULTS.titleBarCompat,
				titleBarStripPx: typeof record.titleBarStripPx === "number" && Number.isFinite(record.titleBarStripPx) ? clampTitleBarStrip(record.titleBarStripPx) : SIDEBAR_PREFS_DEFAULTS.titleBarStripPx,
				htmlViewerNoSandbox: typeof record.htmlViewerNoSandbox === "boolean" ? record.htmlViewerNoSandbox : SIDEBAR_PREFS_DEFAULTS.htmlViewerNoSandbox,
				htmlViewerDefaultUnsafe: typeof record.htmlViewerDefaultUnsafe === "boolean" ? record.htmlViewerDefaultUnsafe : SIDEBAR_PREFS_DEFAULTS.htmlViewerDefaultUnsafe,
				browserNoSandbox: typeof record.browserNoSandbox === "boolean" ? record.browserNoSandbox : SIDEBAR_PREFS_DEFAULTS.browserNoSandbox,
				browserInterceptLinks: typeof record.browserInterceptLinks === "boolean" ? record.browserInterceptLinks : SIDEBAR_PREFS_DEFAULTS.browserInterceptLinks,
				browserInterceptHttp: typeof record.browserInterceptHttp === "boolean" ? record.browserInterceptHttp : SIDEBAR_PREFS_DEFAULTS.browserInterceptHttp,
				browserInterceptHttps: typeof record.browserInterceptHttps === "boolean" ? record.browserInterceptHttps : SIDEBAR_PREFS_DEFAULTS.browserInterceptHttps,
				tabsEnabled: booleanMapOf(record.tabsEnabled),
				viewersEnabled: booleanMapOf(record.viewersEnabled),
				pluginSettings: pluginSettingsMapOf(record.pluginSettings)
			};
		}
		/**
		* Validate the plugin-owned settings map (v0.12.0+): `{ descriptorId: { key:
		* value } }`, nested open maps. Any non-object value (or a malformed whole)
		* falls back to the empty map — the schema defaults already guard the wire
		* shape, this is the client's second line.
		*/
		function pluginSettingsMapOf(value) {
			if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
			const out = {};
			for (const [id, blob] of Object.entries(value)) if (blob !== null && typeof blob === "object" && !Array.isArray(blob)) out[id] = blob;
			return out;
		}
		/**
		* Validate one enable-switch map (per-tab / per-viewer). Only boolean values
		* survive; a non-object or a non-boolean entry falls back to the empty map /
		* drops the entry — an absent key means the feature stays enabled.
		*/
		function booleanMapOf(value) {
			if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
			const out = {};
			for (const [key, item] of Object.entries(value)) if (typeof item === "boolean") out[key] = item;
			return out;
		}
		/** Type guard for the title-bar scheme union (anything else falls back). */
		function isTitleBarScheme(value) {
			return typeof value === "string" && TITLE_BAR_SCHEMES.includes(value);
		}
		/**
		* Whether the legacy document carries an explicit strip value (only
		* reachable through the old gear popup): a stored number different from the
		* default counts as "the user already configured something" and migrates to
		* the `custom` scheme.
		*/
		function hasLegacyStripValue(value) {
			return typeof value === "number" && Number.isFinite(value) && value !== 40;
		}
		/**
		* Read the resolved side card preferences through the plugin's settings route.
		* @param settings - the settings wire face (the plugin api by default).
		* @returns validated prefs, or the schema defaults when the route rejects,
		* the namespace is absent, or a stored value violates the contract.
		*/
		async function loadPrefs(settings) {
			try {
				return parsePrefs((await settings.settingsGet()).value);
			} catch {
				return { ...SIDEBAR_PREFS_DEFAULTS };
			}
		}
		/**
		* Read the external-disable flag from the same settings route: the
		* dsh-web-ui family's aionui-panel provider choice. True only when the host
		* resolved `aionui-panel.rightPanel` to 'aionui-panel' — while true the
		* sidebar must not mount (the two right panels are mutually exclusive). Any
		* failure (route rejected, aionui absent, malformed response) reads false,
		* so a missing family never hides the sidebar.
		* @param settings - the settings wire face (the plugin api by default).
		* @returns the external-disable flag (false on any failure).
		*/
		async function loadExternalDisable(settings) {
			try {
				return (await settings.settingsGet()).externalDisable === true;
			} catch {
				return false;
			}
		}
		//#endregion
		//#region src/client/plugin-settings.ts
		/**
		* Pending-writes queue for the file tree's open-with config: pin toggles and
		* (outside the settings popup) config edits land in the sidebar prefs as
		* `pluginSettings['editor']`. Writes are serialized through one promise chain
		* so a quick burst of pin clicks can never read a stale pluginSettings map
		* and drop an earlier toggle; each write pushes the whole open map patch
		* through the revision-free settings route and adopts the returned document.
		*
		* (The settings popup has its own serialized commit — SideCardSection's —
		* so its rows and this helper rarely race; the shared route's last-write-wins
		* semantics cover the uncommon overlap.)
		*/
		let queue = Promise.resolve();
		/**
		* Merge one plugin-owned settings blob of one descriptor and persist it.
		* @param store - the sidebar store (its prefs are replaced by the write result).
		* @param descriptorId - the descriptor whose blob is patched ('editor' here).
		* @param updater - pure patch function; receives a shallow copy of the blob.
		*/
		function updatePluginSettings(store, descriptorId, updater) {
			queue = queue.then(async () => {
				const prefs = store.getPrefs();
				const next = updater({ ...prefs.pluginSettings[descriptorId] ?? {} });
				const view = await api.settingsUpdate({ pluginSettings: {
					...prefs.pluginSettings,
					[descriptorId]: next
				} });
				store.setPrefs(parsePrefs(view.value));
			}).catch((error) => {
				console.error("open-with settings write failed", error);
			});
		}
		//#endregion
		//#region node_modules/.pnpm/react-icons@5.7.0_react@18.3.1/node_modules/react-icons/si/index.mjs
		function SiZedindustries(props) {
			return GenIcon({
				"tag": "svg",
				"attr": {
					"role": "img",
					"viewBox": "0 0 24 24"
				},
				"child": [{
					"tag": "path",
					"attr": { "d": "M2.25 1.5a.75.75 0 0 0-.75.75v16.5H0V2.25A2.25 2.25 0 0 1 2.25 0h20.095c1.002 0 1.504 1.212.795 1.92L10.764 14.298h3.486V12.75h1.5v1.922a1.125 1.125 0 0 1-1.125 1.125H9.264l-2.578 2.578h11.689V9h1.5v9.375a1.5 1.5 0 0 1-1.5 1.5H5.185L2.562 22.5H21.75a.75.75 0 0 0 .75-.75V5.25H24v16.5A2.25 2.25 0 0 1 21.75 24H1.655C.653 24 .151 22.788.86 22.08L13.19 9.75H9.75v1.5h-1.5V9.375A1.125 1.125 0 0 1 9.375 8.25h5.314l2.625-2.625H5.625V15h-1.5V5.625a1.5 1.5 0 0 1 1.5-1.5h13.19L21.438 1.5z" },
					"child": []
				}]
			})(props);
		}
		function SiCursor(props) {
			return GenIcon({
				"tag": "svg",
				"attr": {
					"role": "img",
					"viewBox": "0 0 24 24"
				},
				"child": [{
					"tag": "path",
					"attr": { "d": "M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23" },
					"child": []
				}]
			})(props);
		}
		//#endregion
		//#region src/client/lang.ts
		/** The lowercased file extension of a path ('' when none). */
		function extOf(path) {
			const at = path.lastIndexOf(".");
			if (at === -1) return "";
			const base = path.slice(at + 1).toLowerCase();
			return base.includes("/") || base.includes("\\") ? "" : base;
		}
		//#endregion
		//#region src/client/upload.ts
		/**
		* File-upload plumbing for the files window: turn a file picker or a drag-drop
		* into per-file raw-byte uploads through the sidebar's `/sidebar/upload` route.
		*
		* Folders keep their tree in both flows: the picker's `webkitdirectory`
		* selection arrives as Files with `webkitRelativePath` filled, and dropped
		* folders — which never surface in `dataTransfer.files` — are traversed via
		* `webkitGetAsEntry`, so the relative path is preserved for every nested file
		* and the host recreates the tree under the chosen directory. The File is
		* streamed straight into the POST body (no base64 inflation); uploads run
		* sequentially so one slow file cannot starve the others, and each result
		* reports its own outcome (the tree keeps going after a failure). An
		* optional `AbortSignal` stops the queue at the next item boundary and
		* aborts the in-flight request; the host cleans up its temp file when the
		* request stream dies.
		*/
		/** Sanitize a relative target: absolute paths, traversal, and empty segments
		*  are rejected (the host enforces the same rules with a 400). */
		function sanitizeRelativePath(rel) {
			if (rel === "" || isAbsolutePath(rel)) return void 0;
			if (rel.split(/[\\/]/).some((s) => s === "" || s === "." || s === "..")) return void 0;
			return rel;
		}
		/** The picker's relative path: webkitRelativePath when present, else the name. */
		function relativePathOf(file) {
			return sanitizeRelativePath(file.webkitRelativePath || file.name || "");
		}
		/** Collect a picker selection (webkitdirectory folders carry relative paths). */
		function uploadItemsFromFiles(files) {
			const items = [];
			for (const file of files) {
				const rel = relativePathOf(file);
				if (rel !== void 0) items.push({
					file,
					relativePath: rel
				});
			}
			return items;
		}
		/** Read one dropped file-system entry into upload items; directories
		*  recurse, prefixing their name onto every descendant's relative path. */
		async function itemsFromEntry(entry, prefix) {
			if (entry.isFile) {
				const file = await new Promise((resolve, reject) => {
					entry.file(resolve, reject);
				});
				const rel = sanitizeRelativePath(prefix + file.name);
				return rel === void 0 ? [] : [{
					file,
					relativePath: rel
				}];
			}
			if (entry.isDirectory) {
				const reader = entry.createReader();
				const entries = [];
				for (;;) {
					const batch = await new Promise((resolve, reject) => {
						reader.readEntries(resolve, reject);
					});
					if (batch.length === 0) break;
					entries.push(...batch);
				}
				return (await Promise.all(entries.map((child) => itemsFromEntry(child, `${prefix}${entry.name}/`)))).flat();
			}
			return [];
		}
		/**
		* Collect a drag-drop payload. Dropped folders do NOT surface in
		* `dataTransfer.files` — they arrive as directory items, so entries are
		* captured via `webkitGetAsEntry` and traversed (draining readEntries
		* batches), keeping each nested file's relative path. MUST be invoked
		* synchronously from the drop handler: the dataTransfer enters protected
		* mode once the event dispatch ends, while the captured entry handles stay
		* readable asynchronously. Falls back to the flat file list when the entry
		* API is unavailable; an entry that fails to read is skipped, not fatal.
		*/
		async function uploadItemsFromDrop(data) {
			if (data === void 0) return [];
			const entries = [...data.items].map((item) => item.kind === "file" ? item.webkitGetAsEntry() : null).filter((entry) => entry !== null);
			if (entries.length === 0) return uploadItemsFromFiles(data.files);
			return (await Promise.all(entries.map((entry) => itemsFromEntry(entry, "").catch(() => [])))).flat();
		}
		/** How long a success hint stays before fading (failures stay until the next action). */
		const UPLOAD_HINT_MS = 3500;
		/**
		* One-line upload progress text: 'Uploading into {dir}…' while no file is in
		* flight, then 'Uploading {done}/{total}: {name}' per file. Shared by the tree
		* hint and the full-window upload overlay.
		*/
		function uploadHintText(done, total, current, dir, t) {
			return current === "" ? t("uploadingTo", { dir }) : t("uploadProgress", {
				done,
				total,
				name: current
			});
		}
		/**
		* Upload every item into `dir` (absolute, inside the session workspace),
		* sequentially, reporting progress as `(done, total, currentRelativePath)`.
		* Resolves with one result per item — never rejects; `signal.aborted` stops
		* the queue at the next item boundary (completed items stay uploaded).
		*/
		async function uploadToDir(scope, dir, items, onProgress, signal) {
			const results = [];
			let done = 0;
			for (const item of items) {
				if (signal?.aborted) break;
				onProgress?.(done, items.length, item.relativePath);
				try {
					if (item.file.size > 134217728) results.push({
						relativePath: item.relativePath,
						ok: false,
						code: "too-large"
					});
					else {
						const res = await api.uploadFile(scope, dir, item.relativePath, item.file, signal);
						results.push({
							relativePath: item.relativePath,
							ok: true,
							path: res.path
						});
					}
				} catch (error) {
					if (error instanceof DOMException && error.name === "AbortError") break;
					results.push({
						relativePath: item.relativePath,
						ok: false,
						code: error instanceof SidebarApiError ? error.code : void 0,
						error: error instanceof Error ? error.message : String(error)
					});
				}
				done++;
			}
			onProgress?.(done, items.length, "");
			return results;
		}
		/** Fold a result list into a one-line status for the tree hint. */
		function summarizeResults(results, t) {
			const okCount = results.filter((r) => r.ok).length;
			const failed = results.find((r) => !r.ok);
			if (failed !== void 0) return t("uploadFailed", { error: failed.code === "too-large" ? t("uploadTooLarge") : failed.error ?? t("uploadFailedUnknown") });
			return t("uploadDone", { count: okCount });
		}
		//#endregion
		//#region src/client/FileTree.tsx
		/**
		* The controlled file tree behind the files window's tree panel (TreePanel
		* wraps it with the search box): a lazy VSCode-style tree rooted at the
		* session's working directory. Levels load on expansion (one API call per
		* directory), directories sort first, hidden entries render dimmed. The
		* expansion set lives in the per-session state (owned by the caller); the
		* caller also owns the refresh affordance — a `refreshTick` bump wipes the
		* level cache so the visible set reloads.
		*
		* Row actions: hovering a row reveals an @-reference button on the far
		* right (appends `@<relative path>` to the composer draft), and right-click
		* opens a context menu: file rows offer the caller's open escapes
		* (full-area preview / new tab, only when the callbacks exist) and a download
		* action (the host serves raw bytes, binary-safe); directory rows offer
		* "upload here"; every row can copy the relative or absolute path (with a
		* brief "copied" label replacing the button after a successful write).
		*
		* Uploads start here (drag-drop or the context menu picker) but run in the
		* caller: every request is reported through `onUploadRequest(dir, items)`
		* (VSCode semantics — a drop on a file row targets its parent directory),
		* and `busy` gates new drags while one upload is in flight.
		*/
		/** Root label: the last path segment (mirror of the host rootLabel). */
		function baseName(path) {
			const trimmed = path.replace(/[\\/]+$/, "");
			const at = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
			return at === -1 ? trimmed : trimmed.slice(at + 1);
		}
		/** The containing directory of an absolute row path (never the root edge here). */
		function parentOf(path) {
			const at = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
			return at <= 0 ? path : path.slice(0, at);
		}
		/** Only OS file drags belong to the upload surface; in-app drags (tab reorder,
		*  split zones) must pass through untouched to the pane's tab-drop handling
		*  (mirror of Sidebar.tsx's panel-host shield gate). */
		function isFileDrag(event) {
			return event.dataTransfer?.types.includes("Files") ?? false;
		}
		/**
		* VS Code-style per-file-type icon tone. Files whose extension the editor
		* already knows how to syntax-highlight get a colored glyph (TypeScript blue,
		* Markdown green, JSON yellow, CSS/HTML orange, images purple, …); folders
		* get their own warm tone; anything else stays the monochrome `currentColor`
		* outline. The colors are CSS variables defined in sidebar.module.css under
		* `body` (light) and `body[data-ds-dark-theme]` (dark), so a theme flip
		* recolors the icons without a re-render.
		*/
		function fileIconClassOf(entry) {
			switch (extOf(entry.name)) {
				case "ts":
				case "tsx":
				case "mts":
				case "cts": return sidebar_module_css_default.explorerIconTs;
				case "js":
				case "jsx":
				case "mjs":
				case "cjs": return sidebar_module_css_default.explorerIconJs;
				case "json":
				case "jsonc": return sidebar_module_css_default.explorerIconJson;
				case "md":
				case "markdown": return sidebar_module_css_default.explorerIconMd;
				case "css": return sidebar_module_css_default.explorerIconCss;
				case "html":
				case "htm": return sidebar_module_css_default.explorerIconHtml;
				case "png":
				case "jpg":
				case "jpeg":
				case "gif":
				case "svg":
				case "webp":
				case "ico":
				case "bmp":
				case "avif": return sidebar_module_css_default.explorerIconImage;
				default: return;
			}
		}
		/** How long the row's "copied" label stays after a successful write. */
		const COPIED_MS = 1200;
		/**
		* The drop overlay's hero art: an arrow rising out of a notched tray
		* (upload zone — the same glyph family as the toolbar's upload icon) and a
		* tilted pair of photo cards (chat zone). Hand-drawn, colored in the
		* palette of DSH's own native drop illustration (#3964FE / #9CE5ED) so the
		* two zones read as one family; the drop overlay is this flow's one brand
		* moment, so it gets color the rest of the UI never does.
		*/
		const UploadDropIllustration = () => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
			width: "64",
			height: "56",
			viewBox: "0 0 64 56",
			fill: "none",
			"aria-hidden": "true",
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M32 28V11",
					stroke: "#3964FE",
					strokeWidth: "5",
					strokeLinecap: "round"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M23 20l9-9 9 9",
					stroke: "#3964FE",
					strokeWidth: "5",
					strokeLinecap: "round",
					strokeLinejoin: "round"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M10 40a4 4 0 0 1 4-4h7l3.2 4.6a5 5 0 0 0 4.1 2.2h7.4a5 5 0 0 0 4.1-2.2L43 36h7a4 4 0 0 1 4 4v2a10 10 0 0 1-10 10H20A10 10 0 0 1 10 42v-2z",
					fill: "#9CE5ED"
				})
			]
		});
		/** The chat zone's art: two tilted photo cards, each with its own
		*  sun-over-mountains motif (the back card carries detail too, so it never
		*  reads as a bare blob). */
		const ChatDropIllustration = () => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
			width: "96",
			height: "76",
			viewBox: "0 0 96 76",
			fill: "none",
			"aria-hidden": "true",
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("g", {
				transform: "rotate(-12 24 34)",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
						x: "6",
						y: "16",
						width: "36",
						height: "36",
						rx: "10",
						fill: "#9CE5ED"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "16",
						cy: "27",
						r: "3.5",
						fill: "white"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M11 44l8-9 6 6 4-4 8 9",
						stroke: "white",
						strokeWidth: "3",
						strokeLinecap: "round",
						strokeLinejoin: "round"
					})
				]
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("g", {
				transform: "rotate(8 61 35)",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
						x: "40",
						y: "12",
						width: "42",
						height: "46",
						rx: "10",
						fill: "#3964FE"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "55",
						cy: "27",
						r: "5",
						fill: "white"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M46 50l10-13 7 8 6-6 9 11",
						stroke: "white",
						strokeWidth: "3.5",
						strokeLinecap: "round",
						strokeLinejoin: "round"
					})
				]
			})]
		});
		function FileTree(props) {
			const { sessionId, cwd, expanded, onToggle, onOpenFile, onOpenFilePermanent, onOpenFileNewTab, onPreviewFile, openWithTargets, openWithPinned, openWithSsh, onOpenWith, onToggleOpenWithPin, onReferenceFile, refreshTick, onUploadRequest, busy } = props;
			const [data, setData] = (0, react.useState)({});
			const dataRef = (0, react.useRef)(data);
			/** The row whose path was just copied ("copied" label replaces its button). */
			const [copiedPath, setCopiedPath] = (0, react.useState)(null);
			/** Open context menu: the row path (and whether it is a directory) plus the cursor position. */
			const [rowMenu, setRowMenu] = (0, react.useState)(null);
			/** Whether a file drag hovers the tree (drives the portaled drop zone). */
			const [dropOver, setDropOver] = (0, react.useState)(false);
			/** The directory a drag is hovering right now (null = body, drop to root). */
			const [dropTarget, setDropTarget] = (0, react.useState)(null);
			/**
			* Enter/leave depth under the tree body. dragenter/dragleave fire per
			* element along the drag path (and bubble), so a counter — DSH InputBar's
			* own pattern — is the flicker-free signal; relatedTarget is unreliable
			* across engines for drag events.
			*/
			const dropDepth = (0, react.useRef)(0);
			/** Explorer body element; its viewport rect anchors the portaled drop zone. */
			const bodyRef = (0, react.useRef)(null);
			/** The body's viewport rect captured at drag entry (null = not measured). */
			const [dropRect, setDropRect] = (0, react.useState)(null);
			/** Context-menu "upload here" target directory. */
			const pendingUploadDir = (0, react.useRef)(void 0);
			const fileInputRef = (0, react.useRef)(null);
			/** Reset all drag state (drop landed, the drag left, or a new drag begins). */
			const resetDrop = () => {
				dropDepth.current = 0;
				setDropOver(false);
				setDropTarget(null);
				setDropRect(null);
			};
			/**
			* Drop handlers: always swallow the event (a dropped file must never open
			* in the browser), then report the target directory to the caller. A drop
			* ends the drag without further leave events, so the depth resets here.
			* The payload collection is async (dropped folders are traversed through
			* their entry handles — captured synchronously inside uploadItemsFromDrop
			* while the dataTransfer is still live), so the request rides a then.
			*/
			const reportDrop = (dir, data) => {
				if (busy) return;
				uploadItemsFromDrop(data).then((items) => {
					if (items.length > 0) onUploadRequest(dir, items);
				});
			};
			const handleBodyDrop = (event) => {
				if (!isFileDrag(event)) return;
				event.preventDefault();
				event.stopPropagation();
				resetDrop();
				if (cwd !== void 0) reportDrop(cwd, event.dataTransfer);
			};
			const handleDirDrop = (event, dir) => {
				if (!isFileDrag(event)) return;
				event.preventDefault();
				event.stopPropagation();
				resetDrop();
				reportDrop(dir, event.dataTransfer);
			};
			const handleFileDrop = (event, path) => {
				handleDirDrop(event, parentOf(path));
			};
			const handleBodyDragEnter = (event) => {
				if (!isFileDrag(event)) return;
				event.preventDefault();
				event.stopPropagation();
				dropDepth.current += 1;
				if (busy) return;
				if (dropDepth.current === 1) {
					const rect = bodyRef.current?.getBoundingClientRect();
					setDropRect(rect === void 0 ? null : {
						top: rect.top,
						left: rect.left,
						width: rect.width,
						height: rect.height
					});
				}
				setDropOver(true);
			};
			const handleBodyDragLeave = () => {
				dropDepth.current = Math.max(0, dropDepth.current - 1);
				if (dropDepth.current > 0) return;
				setDropOver(false);
				setDropTarget(null);
				setDropRect(null);
			};
			const handleBodyDragOver = (event) => {
				if (!isFileDrag(event)) return;
				event.preventDefault();
				event.stopPropagation();
				event.dataTransfer.dropEffect = busy ? "none" : "copy";
				if (busy) return;
				setDropTarget(null);
			};
			const handleRowDragOver = (event, dir) => {
				if (!isFileDrag(event)) return;
				event.preventDefault();
				event.stopPropagation();
				event.dataTransfer.dropEffect = busy ? "none" : "copy";
				if (busy) return;
				setDropTarget(dir);
			};
			const storeLevel = (0, react.useCallback)((path, level) => {
				dataRef.current = {
					...dataRef.current,
					[path]: level
				};
				setData(dataRef.current);
			}, []);
			const loadDir = (0, react.useCallback)((dir) => {
				if (dataRef.current[dir] !== void 0) return;
				storeLevel(dir, {});
				api.fsTree({
					sessionId,
					cwd
				}, dir).then((listing) => {
					storeLevel(dir, { entries: listing.entries });
				}).catch((error) => {
					storeLevel(dir, { error: error instanceof Error ? error.message : String(error) });
				});
			}, [
				sessionId,
				cwd,
				storeLevel
			]);
			const lastTick = (0, react.useRef)(refreshTick);
			(0, react.useEffect)(() => {
				if (lastTick.current === refreshTick) return;
				lastTick.current = refreshTick;
				dataRef.current = {};
				setData({});
			}, [refreshTick]);
			(0, react.useEffect)(() => {
				const root = cwd;
				if (root === void 0) return;
				loadDir(root);
				for (const dir of expanded) loadDir(dir);
			}, [
				cwd,
				expanded,
				refreshTick,
				loadDir
			]);
			/** Copy `text`; on success flip the row's copied label for a moment. */
			const copyPath = (0, react.useCallback)((text, path) => {
				(0, _deepseek_ai_dsh_client_ui_primitives.writeClipboard)(text).then((ok) => {
					if (!ok) return;
					setCopiedPath(path);
					window.setTimeout(() => {
						setCopiedPath((current) => current === path ? null : current);
					}, COPIED_MS);
				});
			}, []);
			/** The row's trailing actions: the @-reference button, or the copied label. */
			const rowActions = (entry) => {
				if (copiedPath === entry.path) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: sidebar_module_css_default.explorerCopied,
					children: t("copied")
				});
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: sidebar_module_css_default.explorerRef,
					"aria-label": t("referenceFile"),
					title: t("referenceFile"),
					onClick: (event) => {
						event.stopPropagation();
						onReferenceFile(entry.path);
					},
					children: t("referenceFile")
				});
			};
			const openRowMenu = (event, path, isDir) => {
				event.preventDefault();
				event.stopPropagation();
				setRowMenu({
					path,
					isDir,
					x: event.clientX,
					y: event.clientY
				});
			};
			/** Download a file through the host route (raw bytes, binary-safe). */
			const downloadFile = (path) => {
				const url = downloadUrl({
					sessionId,
					cwd
				}, path);
				const anchor = document.createElement("a");
				anchor.href = url;
				anchor.style.display = "none";
				document.body.appendChild(anchor);
				anchor.click();
				anchor.remove();
			};
			/** The menu label of one open target: a locale key for the built-ins, the
			*  user's own name for custom editors, plus the SSH hint in remote mode. */
			const openWithLabelOf = (target) => {
				const name = target.nameKey !== void 0 ? t(target.nameKey) : target.name;
				return openWithSsh === true && !target.localOnly ? `${name}${t("openWithSshSuffix")}` : name;
			};
			/**
			* The "open with" menu entries: the pinned targets as DIRECT rows, then
			* the parent row with every target as a nested submenu. Both only render
			* when the caller wired the feature and at least one target is visible.
			*/
			const openWithEntries = () => {
				if (openWithTargets === void 0 || onOpenWith === void 0 || openWithTargets.length === 0) return [];
				const pinnedIds = openWithPinned ?? [];
				/** Brand marks for the built-ins (monochrome silhouettes, currentColor);
				*  reveal gets the folder glyph, custom editors a generic code mark. */
				const itemIcon = (target) => {
					if (target.kind === "reveal") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(VscFolderOpened, { size: 16 });
					if (target.id === "vscode") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconVscode16, { size: 16 });
					if (target.id === "cursor") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SiCursor, { size: 16 });
					if (target.id === "zed") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SiZedindustries, { size: 16 });
					return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCodeOutline16, { size: 16 });
				};
				const pinned = openWithTargets.filter((target) => pinnedIds.includes(target.id)).map((target) => ({
					id: `open-with:${target.id}`,
					label: openWithLabelOf(target),
					icon: itemIcon(target)
				}));
				const submenu = openWithTargets.map((target) => {
					const pinnedNow = pinnedIds.includes(target.id);
					return {
						id: `open-with:${target.id}`,
						label: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: sidebar_module_css_default.openWithLabel,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: sidebar_module_css_default.openWithName,
								children: openWithLabelOf(target)
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								role: "button",
								tabIndex: -1,
								className: clsx(sidebar_module_css_default.openWithPin, pinnedNow && sidebar_module_css_default.openWithPinActive),
								"aria-label": pinnedNow ? t("unpinOpenWith") : t("pinOpenWith"),
								title: pinnedNow ? t("unpinOpenWith") : t("pinOpenWith"),
								onClick: (event) => {
									event.preventDefault();
									event.stopPropagation();
									onToggleOpenWithPin?.(target.id);
								},
								children: pinnedNow ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(VscPinned, { size: 14 }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(VscPin, { size: 14 })
							})]
						}),
						icon: itemIcon(target)
					};
				});
				return [
					...pinned,
					...pinned.length > 0 ? [{
						id: "open-with-sep",
						type: "separator"
					}] : [],
					{
						id: "open-with-menu",
						label: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: sidebar_module_css_default.openWithLabel,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: sidebar_module_css_default.openWithName,
								children: t("openWithMenu")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronRightOutline14, {
								size: 14,
								className: sidebar_module_css_default.openWithChevron,
								"aria-hidden": true
							})]
						}),
						icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(VscLinkExternal, { size: 16 }),
						submenu
					}
				];
			};
			const root = cwd;
			const renderLevel = (dir, depth) => {
				const level = data[dir];
				if (level === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: sidebar_module_css_default.explorerRow,
					style: { paddingLeft: depth * 22 + 6 },
					children: t("loading")
				});
				if (level.error !== void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: clsx(sidebar_module_css_default.explorerRow, sidebar_module_css_default.explorerError),
					style: { paddingLeft: depth * 22 + 6 },
					children: level.error
				});
				return (level.entries ?? []).map((entry) => {
					if (entry.isDir) {
						const isOpen = expanded.includes(entry.path);
						return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							role: "button",
							tabIndex: 0,
							className: clsx(sidebar_module_css_default.explorerRow, sidebar_module_css_default.explorerDir, entry.hidden && sidebar_module_css_default.explorerHidden, dropTarget === entry.path && sidebar_module_css_default.explorerRowDropTarget),
							style: { paddingLeft: depth * 22 + 6 },
							onClick: () => {
								onToggle(entry.path);
							},
							onKeyDown: (event) => {
								if (event.key === "Enter" || event.key === " ") {
									event.preventDefault();
									onToggle(entry.path);
								}
							},
							onDragOver: (event) => {
								handleRowDragOver(event, entry.path);
							},
							onDrop: (event) => {
								handleDirDrop(event, entry.path);
							},
							onContextMenu: (event) => {
								openRowMenu(event, entry.path, true);
							},
							children: [
								isOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(VscFolderOpened, {
									size: 14,
									className: sidebar_module_css_default.explorerIconFolder
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(VscFolder, {
									size: 14,
									className: sidebar_module_css_default.explorerIconFolder
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: sidebar_module_css_default.explorerName,
									children: entry.name
								}),
								entry.isSymlink && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconLinkOutline16, {
									size: 12,
									className: sidebar_module_css_default.explorerSymlink
								}),
								rowActions(entry)
							]
						}), isOpen && renderLevel(entry.path, depth + 1)] }, entry.path);
					}
					return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						role: "button",
						tabIndex: 0,
						className: clsx(sidebar_module_css_default.explorerRow, entry.hidden && sidebar_module_css_default.explorerHidden, entry.broken && sidebar_module_css_default.explorerBroken, dropTarget === parentOf(entry.path) && sidebar_module_css_default.explorerRowDropTarget),
						style: { paddingLeft: depth * 22 + 6 },
						title: entry.broken ? `${entry.path} — ${t("brokenSymlink")}` : entry.path,
						onClick: () => {
							onOpenFile(entry.path);
						},
						onDoubleClick: () => {
							onOpenFilePermanent?.(entry.path);
						},
						onKeyDown: (event) => {
							if (event.key === "Enter" || event.key === " ") {
								event.preventDefault();
								onOpenFile(entry.path);
							}
						},
						onDragOver: (event) => {
							handleRowDragOver(event, parentOf(entry.path));
						},
						onDrop: (event) => {
							handleFileDrop(event, entry.path);
						},
						onContextMenu: (event) => {
							openRowMenu(event, entry.path, false);
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(VscFile, {
								size: 14,
								className: fileIconClassOf(entry)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: sidebar_module_css_default.explorerName,
								children: entry.name
							}),
							entry.isSymlink && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconLinkOutline16, {
								size: 12,
								className: sidebar_module_css_default.explorerSymlink
							}),
							rowActions(entry)
						]
					}, entry.path);
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: bodyRef,
				className: sidebar_module_css_default.explorerBody,
				onDragEnter: handleBodyDragEnter,
				onDragOver: handleBodyDragOver,
				onDragLeave: handleBodyDragLeave,
				onDrop: handleBodyDrop,
				children: [
					root === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: sidebar_module_css_default.explorerEmpty,
						children: t("noSession")
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: clsx(sidebar_module_css_default.explorerRow, dropTarget === root && sidebar_module_css_default.explorerRowDropTarget),
						style: { paddingLeft: 6 },
						onDragOver: (event) => {
							handleRowDragOver(event, root);
						},
						onDrop: (event) => {
							handleDirDrop(event, root);
						},
						onContextMenu: (event) => {
							openRowMenu(event, root, true);
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(VscFolderOpened, {
								size: 14,
								className: sidebar_module_css_default.explorerIconFolder
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: sidebar_module_css_default.explorerName,
								children: baseName(root)
							}),
							copiedPath === root ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: sidebar_module_css_default.explorerCopied,
								children: t("copied")
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: sidebar_module_css_default.explorerRef,
								"aria-label": t("referenceFile"),
								title: t("referenceFile"),
								onClick: (event) => {
									event.stopPropagation();
									onReferenceFile(root);
								},
								children: t("referenceFile")
							})
						]
					}), data[root] !== void 0 && renderLevel(root, 1)] }),
					dropOver && dropRect !== null && (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: sidebar_module_css_default.uploadDropZone,
						style: {
							top: dropRect.top + 2,
							left: dropRect.left + 2,
							width: dropRect.width - 4,
							height: dropRect.height - 4
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: sidebar_module_css_default.uploadDropHero,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(UploadDropIllustration, {}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: sidebar_module_css_default.uploadDropZonePill,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconUploadOutline16, { size: 14 }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: sidebar_module_css_default.uploadDropZoneText,
									children: dropTarget !== null ? t("uploadTo", { dir: dropTarget }) : t("uploadDropHint")
								})]
							})]
						})
					}), dropRect.left >= 200 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: sidebar_module_css_default.uploadDropChatHint,
						style: { width: dropRect.left },
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: sidebar_module_css_default.uploadDropChatCard,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChatDropIllustration, {}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("uploadDropChat") })]
						})
					})] }), document.body),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						ref: fileInputRef,
						type: "file",
						multiple: true,
						style: { display: "none" },
						onChange: (event) => {
							const dir = pendingUploadDir.current ?? root;
							pendingUploadDir.current = void 0;
							if (dir !== void 0 && !busy) onUploadRequest(dir, uploadItemsFromFiles(event.target.files ?? []));
							event.target.value = "";
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
						open: rowMenu !== null,
						onClose: () => {
							setRowMenu(null);
						},
						items: [
							...rowMenu?.isDir === false && onPreviewFile !== void 0 ? [{
								id: "preview",
								label: t("preview"),
								icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(VscFolderOpened, { size: 16 })
							}] : [],
							...rowMenu?.isDir === false && onOpenFileNewTab !== void 0 ? [{
								id: "open-new-tab",
								label: t("openFileNewTab"),
								icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCodeOutline16, { size: 16 })
							}] : [],
							...openWithEntries(),
							...rowMenu?.isDir === false ? [{
								id: "download",
								label: t("download"),
								icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconDownloadOutline16, { size: 16 })
							}] : [],
							...rowMenu?.isDir === true ? [{
								id: "upload-here",
								label: t("uploadHere"),
								icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconUploadOutline16, { size: 16 })
							}] : [],
							{
								id: "relative",
								label: t("copyRelative"),
								icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCopyOutline16, { size: 16 })
							},
							{
								id: "absolute",
								label: t("copyAbsolute"),
								icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCopyOutline16, { size: 16 })
							}
						],
						onSelect: (id) => {
							const target = rowMenu;
							if (target === null) return;
							setRowMenu(null);
							if (id === "open-new-tab") {
								onOpenFileNewTab?.(target.path);
								return;
							}
							if (id === "preview") {
								onPreviewFile?.(target.path);
								return;
							}
							if (id.startsWith("open-with:")) {
								onOpenWith?.(id.slice(10), target.path);
								return;
							}
							if (id === "download") {
								downloadFile(target.path);
								return;
							}
							if (id === "upload-here") {
								pendingUploadDir.current = target.path;
								fileInputRef.current?.click();
								return;
							}
							copyPath(id === "relative" ? relativeTo(cwd ?? "", target.path) : target.path, target.path);
						},
						portal: true,
						align: "start",
						getAnchorRect: () => rowMenu === null ? null : new DOMRect(rowMenu.x, rowMenu.y, 0, 0),
						anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {})
					})
				]
			});
		}
		//#endregion
		//#region src/client/UploadOverlay.tsx
		/**
		* Full-window upload progress over the files tree: a blurred scrim (same mask
		* token as the repo's Modal primitive) with a card showing the target
		* directory, file-level progress, and a cancel button. Esc cancels too —
		* clicking the scrim does not, so a stray click can never abort an upload.
		* Rendered inside TreePanel (absolute inset-0), so it covers only the file
		* window and never the conversation column.
		*/
		function UploadOverlay(props) {
			const { dir, done, total, current, onCancel, cancelling } = props;
			(0, react.useEffect)(() => {
				const onKey = (event) => {
					if (event.key === "Escape") onCancel();
				};
				window.addEventListener("keydown", onKey);
				return () => {
					window.removeEventListener("keydown", onKey);
				};
			}, [onCancel]);
			const percent = total === 0 ? 0 : Math.min(100, Math.round(done / total * 100));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: sidebar_module_css_default.uploadOverlay,
				role: "dialog",
				"aria-modal": "true",
				"aria-label": t("uploadingTo", { dir }),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: sidebar_module_css_default.uploadOverlayCard,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: sidebar_module_css_default.uploadOverlayTitle,
							title: dir,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconUploadOutline16, { size: 16 }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("uploadingTo", { dir }) })]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: sidebar_module_css_default.uploadOverlayProgress,
							role: "progressbar",
							"aria-valuemin": 0,
							"aria-valuemax": total,
							"aria-valuenow": done,
							"aria-valuetext": t("uploadProgress", {
								done,
								total,
								name: current
							}),
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: sidebar_module_css_default.uploadOverlayProgressFill,
								style: { width: `${percent}%` }
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: sidebar_module_css_default.uploadOverlayStatus,
							children: uploadHintText(done, total, current, dir, t)
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: sidebar_module_css_default.uploadOverlayCancel,
							disabled: cancelling,
							onClick: onCancel,
							children: t("cancel")
						})
					]
				})
			});
		}
		//#endregion
		//#region src/client/TreePanel.tsx
		/**
		* The files window's tree surface: a global file-name search box on top
		* (300ms debounce; an in-flight search is aborted by the next keystroke)
		* over either the shared controlled FileTree (empty query) or the flat
		* result list (relative paths; click opens through the caller's primary
		* side-split preview). Owns its refresh tick: the icon next to the search
		* input clears
		* the tree cache. EditorHost docks it as the tab's right panel (wrapped in
		* a drag-resize handle) and provides the file context-menu open escapes.
		*
		* Uploads (header pickers, the tree's drag-drop and "upload here" menu)
		* all funnel through here: one session at a time, shown in a full-window
		* progress overlay with cancel, followed by a tree refresh and a one-line
		* hint under the search row (success fades, failures and cancels stay).
		* OS file drags are shielded at the panel host (see Sidebar.tsx), so a
		* drop over the file window uploads here and never reaches DSH's chat
		* intake.
		*/
		function TreePanel(props) {
			const { sessionId, cwd, expanded, onToggle, onOpenFile, onOpenFilePermanent, onOpenFileNewTab, onPreviewFile, openWithTargets, openWithPinned, openWithSsh, onOpenWith, onToggleOpenWithPin, onReferenceFile, full } = props;
			const [query, setQuery] = (0, react.useState)("");
			const [results, setResults] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(null);
			const [refreshTick, setRefreshTick] = (0, react.useState)(0);
			/** One-line upload status under the search row ('' hides the hint). */
			const [uploadStatus, setUploadStatus] = (0, react.useState)("");
			/** Whether the status line is a failure/cancel (error color, stays visible). */
			const [uploadFailed, setUploadFailed] = (0, react.useState)(false);
			/** The in-flight upload session (null → no overlay, buttons enabled). */
			const [upload, setUpload] = (0, react.useState)(null);
			/** True between the cancel click and the session settling (button disabled). */
			const [cancelling, setCancelling] = (0, react.useState)(false);
			/** Set by cancelUpload; the settle path shows 'upload cancelled' instead of
			*  summarizing the partial results. */
			const cancelledRef = (0, react.useRef)(false);
			const fileInputRef = (0, react.useRef)(null);
			const folderInputRef = (0, react.useRef)(null);
			/** Start one upload session into `dir` (absolute, inside the workspace). */
			const startUpload = (dir, items) => {
				if (items.length === 0 || cwd === void 0 || upload !== null) return;
				cancelledRef.current = false;
				const controller = new AbortController();
				setUploadFailed(false);
				setUploadStatus(uploadHintText(0, items.length, "", dir, t));
				setUpload({
					dir,
					done: 0,
					total: items.length,
					current: "",
					controller
				});
				uploadToDir({
					sessionId,
					cwd
				}, dir, items, (done, total, current) => {
					if (current !== "") setUploadStatus(uploadHintText(done, total, current, dir, t));
					setUpload((session) => session === null ? session : {
						...session,
						done,
						total,
						current
					});
				}, controller.signal).then((results) => {
					setUpload(null);
					setCancelling(false);
					setRefreshTick((tick) => tick + 1);
					if (cancelledRef.current) {
						setUploadStatus(t("uploadCancelled"));
						setUploadFailed(true);
						return;
					}
					const status = summarizeResults(results, t);
					setUploadStatus(status);
					setUploadFailed(results.some((result) => !result.ok));
					if (results.every((result) => result.ok)) window.setTimeout(() => {
						setUploadStatus((current) => current === status ? "" : current);
					}, UPLOAD_HINT_MS);
				});
			};
			/** Cancel the in-flight upload (aborts the request; the host drops its temp). */
			const cancelUpload = () => {
				if (upload === null || cancelling) return;
				cancelledRef.current = true;
				setCancelling(true);
				upload.controller.abort();
			};
			const folderInputProps = { webkitdirectory: "" };
			const needle = query.trim();
			(0, react.useEffect)(() => {
				if (needle === "") {
					setResults(null);
					setError(null);
					return;
				}
				const controller = new AbortController();
				const timer = window.setTimeout(() => {
					api.fsSearch({
						sessionId,
						cwd
					}, needle, controller.signal).then((found) => {
						setResults(found);
						setError(null);
					}).catch((failure) => {
						if (controller.signal.aborted) return;
						setResults(null);
						setError(failure instanceof Error ? failure.message : String(failure));
					});
				}, 300);
				return () => {
					window.clearTimeout(timer);
					controller.abort();
				};
			}, [
				sessionId,
				cwd,
				needle
			]);
			const busy = upload !== null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: clsx(sidebar_module_css_default.editorTreePanel, full === true && sidebar_module_css_default.editorTreePanelFull),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: sidebar_module_css_default.editorTreeSearch,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: sidebar_module_css_default.editorSearchInput,
								value: query,
								placeholder: t("editorSearchPlaceholder"),
								spellCheck: false,
								onChange: (event) => {
									setQuery(event.target.value);
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: sidebar_module_css_default.iconButton,
								"aria-label": t("refresh"),
								title: t("refresh"),
								onClick: () => {
									setRefreshTick((tick) => tick + 1);
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRefreshOutline16, { size: 14 })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: sidebar_module_css_default.iconButton,
								"aria-label": t("uploadFiles"),
								title: t("uploadFiles"),
								disabled: busy,
								onClick: () => {
									fileInputRef.current?.click();
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconUploadOutline16, { size: 14 })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: sidebar_module_css_default.iconButton,
								"aria-label": t("uploadFolder"),
								title: t("uploadFolder"),
								disabled: busy,
								onClick: () => {
									folderInputRef.current?.click();
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderOpen16, { size: 14 })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								ref: fileInputRef,
								type: "file",
								multiple: true,
								style: { display: "none" },
								onChange: (event) => {
									if (cwd !== void 0) startUpload(cwd, uploadItemsFromFiles(event.target.files ?? []));
									event.target.value = "";
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								ref: folderInputRef,
								type: "file",
								multiple: true,
								...folderInputProps,
								style: { display: "none" },
								onChange: (event) => {
									if (cwd !== void 0) startUpload(cwd, uploadItemsFromFiles(event.target.files ?? []));
									event.target.value = "";
								}
							})
						]
					}),
					uploadStatus !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: clsx(sidebar_module_css_default.editorSearchHint, uploadFailed && sidebar_module_css_default.editorError),
						title: uploadStatus,
						children: uploadStatus
					}),
					needle === "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FileTree, {
						sessionId,
						cwd,
						expanded,
						onToggle,
						onOpenFile,
						onOpenFilePermanent,
						onOpenFileNewTab,
						onPreviewFile,
						openWithTargets,
						openWithPinned,
						openWithSsh,
						onOpenWith,
						onToggleOpenWithPin,
						onReferenceFile,
						refreshTick,
						onUploadRequest: startUpload,
						busy
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: sidebar_module_css_default.explorerBody,
						children: [
							error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: clsx(sidebar_module_css_default.editorSearchHint, sidebar_module_css_default.editorError),
								children: error
							}),
							error === null && results === null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: sidebar_module_css_default.editorSearchHint,
								children: t("loading")
							}),
							error === null && results !== null && results.matches.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: sidebar_module_css_default.editorSearchHint,
								children: t("editorSearchNoResults")
							}),
							error === null && results !== null && results.matches.map((rel) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: sidebar_module_css_default.editorSearchResult,
								title: rel,
								onClick: () => {
									onOpenFile(resolveSidebarPath(cwd, rel));
								},
								children: rel
							}, rel)),
							error === null && results?.truncated === true && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: sidebar_module_css_default.editorSearchHint,
								children: t("editorSearchTruncated")
							})
						]
					}),
					upload !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UploadOverlay, {
						dir: upload.dir,
						done: upload.done,
						total: upload.total,
						current: upload.current,
						onCancel: cancelUpload,
						cancelling
					})
				]
			});
		}
		//#endregion
		//#region src/client/ExplorerRail.tsx
		/**
		* The persistent Explorer rail: the file tree column that lives to the LEFT of
		* the tabbed workbench (VSCode's sidebar), inside the panel body. Unlike the
		* old per-tab docked tree it is decoupled from any editor tab — it stays put
		* while files open as tabs beside it, and closing every tab never hides it.
		*
		* It owns only the column chrome (a slim header with a collapse affordance and
		* a right-edge drag handle) and wires the self-contained {@link TreePanel} to
		* the store. Every open gesture (single click, double click, the context
		* menu's "preview" / "open in new tab", search results) funnels through
		* {@link openSidebarFile}, which dedupes per path and lands the tab in the
		* active workbench pane — so a run of clicks accumulates distinct tabs and
		* NEVER replaces a previously opened one (the reported "预览会覆盖旧标签").
		*
		* The "open with" surface mirrors the editor host: it reads the same
		* pluginSettings['editor'] blob so a pin click or a settings edit re-renders
		* the menu immediately.
		*/
		/** Stable empty blob for the editor pluginSettings read (a fresh `?? {}`
		*  would change identity every snapshot and loop useSyncExternalStore). */
		const EMPTY_PLUGIN_BLOB = {};
		function ExplorerRail(props) {
			const { ctx, store, sessionId, cwd, expanded, onToggleDir, onReferenceFile, width, onResize, onCollapse } = props;
			const editorBlob = (0, react.useSyncExternalStore)((0, react.useCallback)((callback) => store.subscribe(callback), [store]), (0, react.useCallback)(() => store.getSnapshot().prefs.pluginSettings["editor"] ?? EMPTY_PLUGIN_BLOB, [store]));
			const openWithConfig = (0, react.useMemo)(() => parseOpenWithConfig(editorBlob.openWith), [editorBlob]);
			const openWithTargets = (0, react.useMemo)(() => resolveOpenWithTargets(openWithConfig), [openWithConfig]);
			const openFile = (0, react.useCallback)((absolute) => {
				if (sessionId === void 0) return;
				openSidebarFile(ctx, store, sessionId, absolute);
			}, [
				ctx,
				store,
				sessionId
			]);
			const openWith = (targetId, absolute) => {
				const target = openWithTargets.find((item) => item.id === targetId);
				if (target === void 0) return;
				if (target.kind === "reveal") {
					api.openExternal({
						action: "reveal",
						path: absolute
					}).catch((error) => {
						console.error("open external failed", error);
					});
					return;
				}
				const url = openWithUrl(target, absolute, openWithConfig);
				if (url === void 0) return;
				api.openExternal({
					action: "url",
					url
				}).catch((error) => {
					console.error("open external failed", error);
				});
			};
			const toggleOpenWithPin = (targetId) => {
				updatePluginSettings(store, "editor", (blob) => {
					const config = parseOpenWithConfig(blob.openWith);
					const pinned = config.pinned.includes(targetId) ? config.pinned.filter((id) => id !== targetId) : [...config.pinned, targetId];
					return {
						...blob,
						openWith: {
							...config,
							pinned
						}
					};
				});
			};
			const [dragWidth, setDragWidth] = (0, react.useState)(null);
			const dragRef = (0, react.useRef)(null);
			const pendingWidthRef = (0, react.useRef)(0);
			const dragBatcher = (0, react.useRef)(createFrameBatcher()).current;
			(0, react.useEffect)(() => () => dragBatcher.dispose(), [dragBatcher]);
			const liveWidth = dragWidth ?? width;
			const onResizeStart = (event) => {
				event.preventDefault();
				event.currentTarget.setPointerCapture?.(event.pointerId);
				dragRef.current = {
					startX: event.clientX,
					startWidth: liveWidth
				};
			};
			const onResizeMove = (event) => {
				const drag = dragRef.current;
				if (drag === null) return;
				pendingWidthRef.current = clampExplorerWidth(drag.startWidth + (event.clientX - drag.startX));
				dragBatcher.schedule(() => setDragWidth(pendingWidthRef.current));
			};
			const onResizeEnd = (event) => {
				const drag = dragRef.current;
				if (drag === null) return;
				dragBatcher.flushNow();
				dragRef.current = null;
				setDragWidth(null);
				onResize(clampExplorerWidth(drag.startWidth + (event.clientX - drag.startX)));
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: sidebar_module_css_default.explorerRail,
				style: { width: liveWidth },
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: sidebar_module_css_default.explorerRailHeader,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderOpen16, { size: 14 }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: sidebar_module_css_default.explorerRailTitle,
								children: t("explorer")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: sidebar_module_css_default.iconButton,
								"aria-label": t("explorerCollapse"),
								title: t("explorerCollapse"),
								onClick: onCollapse,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronLeftOutline14, { size: 14 })
							})
						]
					}),
					sessionId !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TreePanel, {
						full: true,
						sessionId,
						cwd,
						expanded,
						onToggle: onToggleDir,
						onOpenFile: openFile,
						onOpenFilePermanent: openFile,
						onOpenFileNewTab: openFile,
						onPreviewFile: openFile,
						openWithTargets,
						openWithPinned: openWithConfig.pinned,
						openWithSsh: openWithSshActive(openWithConfig),
						onOpenWith: openWith,
						onToggleOpenWithPin: toggleOpenWithPin,
						onReferenceFile
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: sidebar_module_css_default.editorTreeResize,
						role: "separator",
						"aria-orientation": "vertical",
						"aria-label": t("explorer"),
						onPointerDown: onResizeStart,
						onPointerMove: onResizeMove,
						onPointerUp: onResizeEnd,
						onPointerCancel: onResizeEnd
					})
				]
			});
		}
		/** The collapsed rail: a thin strip offering a single affordance to bring the
		*  file tree back. Kept beside the workbench so collapse never reflows the tab
		*  area's right edge and the reopen control is always in the same place. */
		function ExplorerRailCollapsed(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: sidebar_module_css_default.explorerRailCollapsed,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: sidebar_module_css_default.iconButton,
					"aria-label": t("explorerExpand"),
					title: t("explorerExpand"),
					onClick: props.onExpand,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronRightOutline14, { size: 14 })
				})
			});
		}
		//#endregion
		//#region src/client/desktop-env.ts
		let cached;
		/** Read the shell's desktop stamps (memoized per page; SSR-safe). */
		function parseDesktopEnv() {
			if (cached !== void 0) return cached;
			const hasWindow = typeof window !== "undefined";
			const hasPreloadMarker = hasWindow && typeof window.__DSH_DESKTOP_FILE_PATH__ !== "undefined";
			const params = hasWindow ? new URLSearchParams(window.location.search.replace(/^\?/, "")) : new URLSearchParams();
			const modeParam = params.get("dsh-desktop-mode");
			const mode = modeParam === "compatibility" || modeParam === "advanced" ? modeParam : null;
			const platformParam = params.get("dsh-desktop-platform");
			const platform = platformParam !== null && platformParam !== "" ? platformParam.toLowerCase() : null;
			cached = {
				desktop: mode !== null || hasPreloadMarker,
				mode,
				platform,
				titlebarInset: parseTitlebarInset(params.get("dsh-desktop-titlebar-inset") ?? (hasWindow && typeof document !== "undefined" ? document.documentElement.getAttribute("data-dsh-title-bar-height") : null))
			};
			return cached;
		}
		/** Clamp the contract inset parameter into 0–120 (invalid/absent → 0). */
		function parseTitlebarInset(raw) {
			if (raw === null) return 0;
			const parsed = Number(raw);
			if (!Number.isFinite(parsed)) return 0;
			return Math.min(120, Math.max(0, Math.round(parsed)));
		}
		//#endregion
		//#region src/client/wco.ts
		/** Snapshot when the API is unavailable (plain browser / non-overlay shell). */
		const WCO_NONE = Object.freeze({
			present: false,
			height: 0
		});
		let source;
		let snapshot = WCO_NONE;
		let attached = false;
		let sourceListener;
		const listeners = /* @__PURE__ */ new Set();
		function read() {
			if (source === void 0) return WCO_NONE;
			try {
				if (source.visible !== true) return {
					present: false,
					height: 0
				};
				const rect = source.getTitlebarAreaRect();
				const height = Math.round(rect.height);
				return Number.isFinite(height) && height > 0 ? {
					present: true,
					height
				} : {
					present: true,
					height: 0
				};
			} catch {
				return {
					present: false,
					height: 0
				};
			}
		}
		function onGeometryChange() {
			snapshot = read();
			emit();
		}
		function emit() {
			for (const listener of listeners) listener();
		}
		/** Attach the native geometrychange listener (once). */
		function attach() {
			if (attached) return;
			attached = true;
			const candidate = source ?? navigator.windowControlsOverlay;
			if (candidate === void 0) return;
			source = candidate;
			sourceListener = onGeometryChange;
			snapshot = read();
			source.addEventListener("geometrychange", sourceListener);
		}
		/** Detach the native listener (last subscriber left or source swapped). */
		function detach() {
			if (source !== void 0 && sourceListener !== void 0) source.removeEventListener("geometrychange", sourceListener);
			sourceListener = void 0;
			attached = false;
		}
		/** Read the current snapshot (returns the frozen NONE when unavailable). */
		function getWcoSnapshot() {
			return snapshot;
		}
		/**
		* Subscribe to overlay geometry changes. Attaches to the real
		* `navigator.windowControlsOverlay` on first subscribe; the disposer
		* detaches the native listener when the last subscriber leaves.
		*/
		function subscribeWco(onChange) {
			listeners.add(onChange);
			attach();
			return () => {
				listeners.delete(onChange);
				if (listeners.size === 0) detach();
			};
		}
		//#endregion
		//#region src/client/shell-presets.ts
		const PRESETS = [{
			id: "dsh-desktop",
			title: "DeepSeek Harness Desktop",
			desc: "Electron 高级模式（无边框）：macOS 顶栏 20px、Windows 无 WCO 时 32px 标题栏让位",
			stripFor: (env) => {
				if (env.mode !== "advanced") return void 0;
				if (env.platform === "darwin") return 20;
				if (env.platform === "win32") return 32;
			},
			detect: (env) => env.mode === "advanced"
		}];
		/** All built-in shell presets (registration order = settings list order). */
		function getShellPresets() {
			return PRESETS;
		}
		/** One preset by id, or undefined for an unknown/empty id. */
		function getShellPreset(id) {
			return PRESETS.find((preset) => preset.id === id);
		}
		/** The strip the active preset contributes for the given environment. */
		function presetStripFor(preset, env) {
			return preset?.stripFor?.(env);
		}
		//#endregion
		//#region src/client/titlebar-strip.ts
		function computeTitleBarStrip(env, wco, scheme, preset, customStripPx) {
			if (scheme === "web") return 0;
			if (wco.present) return wco.height;
			if (env.titlebarInset > 0) return env.titlebarInset;
			if (scheme === "preset") return presetStripFor(preset, env) ?? 0;
			if (scheme === "custom") return customStripPx;
			return 0;
		}
		//#endregion
		//#region src/client/OrphanedTab.tsx
		function OrphanedTab(props) {
			const { tab } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: sidebar_module_css_default.editor,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: sidebar_module_css_default.editorHeader,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: sidebar_module_css_default.editorTitle,
						title: tab.type,
						children: tab.title
					})
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: sidebar_module_css_default.editorPlaceholder,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("pluginNotLoaded") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
						className: sidebar_module_css_default.orphanedType,
						children: tab.type
					})]
				})]
			});
		}
		//#endregion
		//#region src/client/RenderBoundary.tsx
		/**
		* The generic render error boundary for the sidebar tree: a render error in
		* the wrapped subtree shows a dismissible error strip (retry re-renders the
		* children) instead of blanking the shell. Used at two scopes:
		*
		* - ROOT (index.tsx, `css.boundaryError`): last-resort containment for
		*   errors in the sidebar shell itself (Workbench, drag layout, …) — a full
		*   swap keeps the page alive.
		* - PER-TAB (Sidebar.tsx TabContent, `css.tabBoundaryError`): a crashing
		*   viewer/editor shows a strip inside ITS OWN pane; the toggle cluster, the
		*   other tabs, and the panel itself stay alive (issue #31 — a tab crash
		*   must never take down the whole sidebar).
		*
		* The className prop selects the strip's geometry: the root's full-height
		* fixed rail vs. the tab's pane-filling block.
		*/
		var RenderBoundary = class extends react.Component {
			state = { error: null };
			static getDerivedStateFromError(error) {
				return { error: error instanceof Error ? error.message : String(error) };
			}
			componentDidCatch(error, info) {
				console.error("[dsh-better-sidebar] render error:", error, info.componentStack);
			}
			render() {
				if (this.state.error !== null) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: this.props.className,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["dsh-better-sidebar: ", this.state.error] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: sidebar_module_css_default.terminalRetry,
						onClick: () => {
							this.setState({ error: null });
						},
						children: t("terminalRetry")
					})]
				});
				return this.props.children;
			}
		};
		//#endregion
		//#region src/client/tab-content-memo.ts
		/** True when the cell may skip a re-render (all render-affecting fields
		*  unchanged). Callback/context identities are deliberately ignored: their
		*  captured dependencies are stable or covered by the compared fields
		*  (onReferenceFile → sessionId/cwd, onSubagentJump/onToggleDir → stable
		*  refs/closures, onOpenDiff → paneId). */
		function tabContentCompare(prev, next) {
			return prev.tab === next.tab && prev.paneId === next.paneId && prev.sessionId === next.sessionId && prev.cwd === next.cwd && prev.visible === next.visible && prev.expanded === next.expanded && prev.localeRevision === next.localeRevision && prev.tabsVersion === next.tabsVersion;
		}
		//#endregion
		//#region src/client/Sidebar.tsx
		/**
		* The sidebar shell: panels mounted inside the unified panel host — a
		* fixed, viewport-sized containing block ([data-dsh-panel-host]) appended
		* to document.body — instead of individual fixed-position elements, so a
		* desktop shell's intermediate wrapper transforms can never hijack the
		* panels' fixed containing block (the core AppFrame owns the left sidebar /
		* center / details columns and has no right-side hole for plugins). The
		* right panel hosts the original workbench; the bottom panel hosts a
		* second, independent workbench. The bottom panel squeezes ONLY the center
		* column (the agent output area): it spans from the app shell's own left
		* sidebar to the right panel's left edge, so neither sidebar gives up any
		* position (the right panel keeps its full height). A persistent two-button
		* cluster at the top-right corner toggles each panel; the right panel's
		* width drags from its left edge, the bottom panel's height from its top
		* edge, and the shared corner drags both at once. The whole layout lives in
		* the per-session store, so switching conversations swaps the sidebar.
		*
		* The shell binds the workbench actions to the store and dispatches tab
		* content to the views. New tabs come from the + menu (explorer / git /
		* terminal; editors open from the explorer). Tabs live in one tree only —
		* they never cross panels; only the panel sizes drag against each other.
		*
		* Narrow (mobile, <768px) viewports show ONLY the right sidebar: entering
		* narrow migrates the bottom panel's tabs INTO the right tree
		* (migrateBottomTabs) — one workbench, the bottom tabs thrown into its
		* strips. The right panel becomes a full-width drawer, the bottom panel
		* and its toggle button disappear, and the layout push is disabled (the
		* drawer floats). Widening does not migrate back: the tabs keep living in
		* the right tree.
		*/
		/** How many consecutive reconnect failures stop the agent-terminals push loop
		* (mirror of the terminal view's own cap; the loop restarts on session switch). */
		const FAILURE_LIMIT = 3;
		/**
		* Subagent auto-open debounce (ms). The host delivers a new child's origin
		* and its title in SEPARATE frames: a Side Chat thread's first visible
		* frame still shows a fallback title (no 'Side: ' prefix), so an immediate
		* 0→N decision mistakes it for a genuine subagent and pops the task page.
		* The trigger therefore re-evaluates against the live snapshot once the
		* title frame has had time to land.
		*/
		const AUTO_OPEN_DEBOUNCE_MS = 500;
		/**
		* OS file drags over the sidebar belong to the sidebar, not to the chat:
		* DSH's composer (InputBar) listens for file drags on the DOCUMENT and
		* answers with a full-screen "drop image here" mask plus image intake on
		* drop. Both panel-host render sites swallow the whole event quartet —
		* enter/over/leave/drop — so the region is a black hole to that document
		* listener. All four must be stopped: InputBar keeps an enter/leave depth
		* counter, and a leave that escapes without its matching enter unbalances
		* the count (this was the full-screen mask flickering over the sidebar).
		* The conversation column keeps DSH's native overlay and intake untouched;
		* gated on the 'Files' type so in-app drags (tab reorder, split zones)
		* propagate exactly as before.
		*/
		const swallowOsFileDrag = (event) => {
			if (!(event.dataTransfer?.types.includes("Files") ?? false)) return;
			event.preventDefault();
			event.stopPropagation();
		};
		/** The four drag events a file drag must never carry past the panel host. */
		const osFileDragShield = {
			onDragEnter: swallowOsFileDrag,
			onDragOver: swallowOsFileDrag,
			onDragLeave: swallowOsFileDrag,
			onDrop: swallowOsFileDrag
		};
		/**
		* Append one user-space stylesheet (preset or custom CSS) as a tagged
		* `<style>` element. The tag attribute carries the source identity so the
		* running configuration is inspectable in DevTools; the returned tag is
		* removed by the caller's effect cleanup.
		*/
		function injectUserCss(attr, id, cssText) {
			const tag = document.createElement("style");
			tag.setAttribute(attr, id);
			tag.textContent = cssText;
			document.head.appendChild(tag);
			return tag;
		}
		/** Render the content of one tab (dispatched by type). */
		const TabContent = (0, react.memo)(function TabContent(props) {
			const { tab, sessionId, cwd, expanded, onToggleDir, onReferenceFile, ctx, store, visible, onSubagentJump, onOpenDiff } = props;
			const scope = {
				sessionId,
				cwd
			};
			const descriptor = ctx.betterSidebar?.getTab(tab.type);
			if (descriptor === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(OrphanedTab, {
				ctx,
				store,
				scope,
				tab,
				visible
			});
			return (0, react.createElement)(RenderBoundary, { className: sidebar_module_css_default.tabBoundaryError }, (0, react.createElement)(descriptor.component, {
				ctx,
				store,
				scope,
				tab,
				visible,
				expanded,
				onToggleDir,
				onReferenceFile,
				onOpenDiff,
				onSubagentJump
			}));
		}, tabContentCompare);
		/** The + menu options for the current state, driven by the tab registry.
		* Hidden tabs (editor/diff) never show; `available` returning false shows
		* a disabled row (e.g. terminal at capacity) instead of hiding the option.
		* Tabs the user disabled in the side card settings are filtered out
		* entirely — re-enabling them is the settings page's job. */
		function buildNewTabOptions(state, ctx, scope) {
			const service = ctx.betterSidebar;
			if (service === void 0) return [];
			return service.getTabs().filter((d) => !d.hidden && service.isTabEnabled(d.id)).sort((a, b) => (a.order ?? 100) - (b.order ?? 100)).map((d) => ({
				id: d.id,
				label: typeof d.title === "function" ? d.title() : d.title,
				disabled: !(d.available?.(ctx, scope, state) ?? true),
				icon: typeof d.icon === "function" ? d.icon(16) : d.icon
			}));
		}
		function Sidebar(props) {
			const { ctx, store } = props;
			const localeRevision = (0, react.useSyncExternalStore)((0, react.useMemo)(() => (callback) => ctx.locale.subscribe(callback), [ctx]), (0, react.useCallback)(() => ctx.locale.getSnapshot().active, [ctx]));
			const [tabsVersion, setTabsVersion] = (0, react.useState)(0);
			(0, react.useEffect)(() => {
				const service = ctx.betterSidebar;
				if (service === void 0) return;
				return service.subscribe(() => setTabsVersion((version) => version + 1));
			}, [ctx]);
			const narrow = useNarrowViewport();
			const [keyboardInset, setKeyboardInset] = (0, react.useState)(0);
			(0, react.useEffect)(() => {
				const vv = window.visualViewport;
				if (vv === null || vv === void 0) return;
				let frame = null;
				const measure = () => {
					frame = null;
					const inset = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
					setKeyboardInset(inset > 1 ? Math.round(inset) : 0);
				};
				const onResize = () => {
					if (frame === null) frame = requestAnimationFrame(measure);
				};
				vv.addEventListener("resize", onResize);
				vv.addEventListener("scroll", onResize);
				measure();
				return () => {
					vv.removeEventListener("resize", onResize);
					vv.removeEventListener("scroll", onResize);
					if (frame !== null) cancelAnimationFrame(frame);
				};
			}, []);
			const sessionList = (0, react.useSyncExternalStore)((0, react.useMemo)(() => (callback) => ctx.sessions.list.subscribe(callback), [ctx]), (0, react.useCallback)(() => ctx.sessions.list.getSnapshot(), [ctx]));
			const current = sessionList.current;
			const snapshot = (0, react.useSyncExternalStore)((0, react.useCallback)((callback) => store.subscribe(callback), [store]), (0, react.useCallback)(() => store.getSnapshot(), [store]));
			(0, react.useEffect)(() => {
				store.setSession(current);
			}, [current, store]);
			const state = snapshot.state;
			const sessionId = snapshot.sessionId;
			const summaryCwd = sessionId === void 0 ? void 0 : sessionList.byId[sessionId]?.cwd;
			const collapsed = state === void 0 || !state.panelOpen;
			(0, react.useEffect)(() => {
				if (collapsed) document.body.setAttribute("data-dsh-sidebar-collapsed", "");
				else document.body.removeAttribute("data-dsh-sidebar-collapsed");
				return () => {
					document.body.removeAttribute("data-dsh-sidebar-collapsed");
				};
			}, [collapsed]);
			const desktopEnv = parseDesktopEnv();
			const wco = (0, react.useSyncExternalStore)((0, react.useMemo)(() => subscribeWco, []), getWcoSnapshot);
			const scheme = snapshot.prefs.titleBarScheme;
			const preset = scheme === "preset" ? getShellPreset(snapshot.prefs.titleBarPresetId) : void 0;
			const titleBarStrip = computeTitleBarStrip(desktopEnv, wco, scheme, preset, snapshot.prefs.titleBarStripPx);
			const titleBarCompat = titleBarStrip > 0;
			(0, react.useEffect)(() => {
				const root = document.documentElement;
				if (titleBarCompat) {
					document.body.setAttribute("data-dsh-title-bar-compat", "");
					root.style.setProperty("--dsh-title-bar-strip", `${titleBarStrip}px`);
				} else {
					document.body.removeAttribute("data-dsh-title-bar-compat");
					root.style.removeProperty("--dsh-title-bar-strip");
				}
				return () => {
					document.body.removeAttribute("data-dsh-title-bar-compat");
					root.style.removeProperty("--dsh-title-bar-strip");
				};
			}, [titleBarCompat, titleBarStrip]);
			const presetCss = scheme === "preset" ? preset?.css ?? "" : "";
			const customCss = scheme === "custom" ? snapshot.prefs.customCss : "";
			(0, react.useEffect)(() => {
				const tags = [];
				if (presetCss !== "") tags.push(injectUserCss("data-dsh-preset-css", preset?.id ?? "", presetCss));
				if (customCss !== "") tags.push(injectUserCss("data-dsh-custom-css", "custom", customCss));
				return () => {
					for (const tag of tags) tag.remove();
				};
			}, [
				presetCss,
				customCss,
				preset?.id
			]);
			/**
			* Bottom-panel merge on narrow viewports: whenever a session is current
			* while narrow (mount, session switch, or a desktop→narrow transition),
			* throw the bottom tree's tabs into the right tree. Idempotent — after
			* the first migration the bottom tree is empty and the reducer returns
			* the same reference, so this effect settles immediately.
			*/
			(0, react.useEffect)(() => {
				if (!narrow || sessionId === void 0) return;
				store.reduce(migrateBottomTabs);
			}, [
				narrow,
				sessionId,
				store
			]);
			const [fetchedCwd, setFetchedCwd] = (0, react.useState)(void 0);
			(0, react.useEffect)(() => {
				setFetchedCwd(void 0);
				if (sessionId === void 0 || summaryCwd !== void 0) return;
				let cancelled = false;
				api.sessionCwd({ sessionId }).then((result) => {
					if (!cancelled) setFetchedCwd(result.cwd);
				}).catch(() => {});
				return () => {
					cancelled = true;
				};
			}, [sessionId, summaryCwd]);
			const cwd = summaryCwd ?? fetchedCwd;
			/**
			* Agent terminals push: subscribe to the host's live list of agent-owned
			* terminals for this session (created by the model through the
			* `terminal_create` tool). The host pushes a JSON array on every
			* create / close / exit; the sidebar reconciles the list into tabs
			* (id `agent:<uuid>`, title from the agent). A disconnected socket
			* retries with a short backoff so a refresh or transient drop reattaches
			* the same shell without losing the agent's work — capped like the
			* terminal view's own reconnect loop, so a refused endpoint never spins
			* forever (the next session switch restarts the loop).
			* While the terminal tab type is disabled in settings, pushes are
			* ignored (no auto-added tabs); re-enabling makes the next push converge.
			*/
			(0, react.useEffect)(() => {
				if (sessionId === void 0) return;
				let socket = null;
				let retry;
				let closed = false;
				let failures = 0;
				const connect = () => {
					if (closed) return;
					const url = new URL("/sidebar/ws/agent-terminals", location.origin);
					url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
					url.search = new URLSearchParams({ sessionId }).toString();
					socket = new WebSocket(url.toString());
					socket.onmessage = (event) => {
						if (typeof event.data !== "string") return;
						try {
							const list = JSON.parse(event.data);
							if (!Array.isArray(list)) return;
							store.reduce((s) => ctx.betterSidebar?.isTabEnabled("terminal") === false ? s : reconcileAgentTerminals(s, list));
						} catch {}
					};
					socket.onclose = () => {
						if (closed) return;
						failures += 1;
						if (failures >= FAILURE_LIMIT) {
							console.error("[dsh-better-sidebar] agent-terminals connection failed; stopping reconnect loop", sessionId);
							return;
						}
						retry = window.setTimeout(connect, 2e3);
					};
					socket.onerror = () => {
						socket?.close();
					};
				};
				connect();
				return () => {
					closed = true;
					window.clearTimeout(retry);
					socket?.close();
				};
			}, [sessionId, store]);
			/**
			* Subagent auto-activation: the moment the current conversation spawns its
			* FIRST direct subagent (a 0 → N transition on the list feed), the "auto
			* open" pref is on, and the Subagent tab type is enabled in settings,
			* open the panel (if collapsed) and focus the Subagent page
			* (single-instance: an existing tab is focused, never duplicated).
			* Switching to a session that already has subagents never triggers — its
			* baseline starts at the current count — so a deliberate layout is never
			* fought.
			*
			* The decision is DEBOUNCED (AUTO_OPEN_DEBOUNCE_MS): a Side Chat thread
			* is also a subagent-origin child, and its 'Side: ' title lands one frame
			* after its origin — an immediate check would misread that first frame as
			* a new subagent and pop this page on every thread creation. The timer
			* re-evaluates the ORIGINAL baseline against the live snapshot; by then
			* the title filter (isSideThreadSummary) sees the settled label.
			*/
			const listBaselineRef = (0, react.useRef)(void 0);
			const autoOpenPendingRef = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				const prev = listBaselineRef.current;
				listBaselineRef.current = sessionList;
				if (sessionId === void 0 || prev === void 0) return;
				if (autoOpenPendingRef.current !== null) return;
				if (!detectNewDirectSubagent(prev, sessionList, sessionId)) return;
				const baseline = prev;
				const timer = window.setTimeout(() => {
					autoOpenPendingRef.current = null;
					if (!detectNewDirectSubagent(baseline, ctx.sessions.list.getSnapshot(), sessionId)) return;
					if (!store.getPrefs().autoOpenSubagent) return;
					if (ctx.betterSidebar?.isTabEnabled("subagent") === false) return;
					store.reduce((s) => s.panelOpen ? s : togglePanel(s));
					store.reduce((s) => ({
						...s,
						activePane: firstLeaf(s.splits).id
					}));
					ctx.betterSidebar?.openTab({
						type: "subagent",
						title: t("subagent")
					});
				}, AUTO_OPEN_DEBOUNCE_MS);
				autoOpenPendingRef.current = {
					baseline,
					timer
				};
			}, [
				sessionList,
				sessionId,
				store,
				ctx
			]);
			(0, react.useEffect)(() => () => {
				const pending = autoOpenPendingRef.current;
				if (pending !== null) window.clearTimeout(pending.timer);
				autoOpenPendingRef.current = null;
			}, [sessionId]);
			/**
			* Job auto-activation: the moment a NEW background job appears for the
			* current conversation (a job id the previous snapshot lacked), the
			* auto-open pref is on, and the Jobs tab type is enabled, open the panel
			* (if collapsed) and focus the Jobs page. Unlike the subagent trigger
			* (0 → N only), ANY new job id triggers: the agent may start several
			* jobs in one session, and each should surface. A fresh page load never
			* triggers — its baseline starts at the current snapshot.
			*/
			const jobBaselineRef = (0, react.useRef)(void 0);
			(0, react.useEffect)(() => {
				const prev = jobBaselineRef.current;
				jobBaselineRef.current = sessionList;
				if (sessionId === void 0 || prev === void 0) return;
				if (!detectNewJob(prev, sessionList, sessionId)) return;
				if (!store.getPrefs().autoOpenJobs) return;
				if (ctx.betterSidebar?.isTabEnabled("subagent") === false) return;
				store.reduce((s) => s.panelOpen ? s : togglePanel(s));
				store.reduce((s) => ({
					...s,
					activePane: firstLeaf(s.splits).id
				}));
				ctx.betterSidebar?.openTab({
					type: "subagent",
					title: t("subagent")
				});
			}, [
				sessionList,
				sessionId,
				store,
				ctx
			]);
			/**
			* Topology jump-back: clicking a subagent node on the Subagent page calls
			* the official `openSubagent`, which switches the sidebar to that child
			* session's OWN layout (a fresh child session defaults to the explorer).
			* The README contract says the Subagent page must stay open with the jumped
			* node highlighted — so once the current session becomes the recorded jump
			* target, re-open the Subagent page on top of the child's layout (expanding
			* the panel first if it is collapsed). Only this explicit node click arms
			* the flag, so switching to a subagent session by any other means keeps
			* that session's own layout untouched.
			*/
			const subagentJumpRef = (0, react.useRef)(void 0);
			(0, react.useEffect)(() => {
				const pending = subagentJumpRef.current;
				if (pending === void 0 || sessionId !== pending) return;
				subagentJumpRef.current = void 0;
				store.reduce((s) => s.panelOpen ? s : togglePanel(s));
				store.reduce((s) => ({
					...s,
					activePane: firstLeaf(s.splits).id
				}));
				ctx.betterSidebar?.openTab({
					type: "subagent",
					title: t("subagent")
				});
			}, [
				sessionId,
				store,
				ctx
			]);
			const centerRectRef = (0, react.useRef)({
				left: 0,
				right: 0
			});
			const [centerMeasured, setCenterMeasured] = (0, react.useState)(false);
			const centerColRef = (0, react.useRef)(null);
			const draggingRef = (0, react.useRef)(false);
			const measureCenter = (0, react.useCallback)(() => {
				if (draggingRef.current) return;
				const col = centerColRef.current;
				if (col === null) return;
				if (!col.isConnected) {
					centerColRef.current = null;
					return;
				}
				const rect = col.getBoundingClientRect();
				centerRectRef.current = {
					left: rect.left,
					right: rect.right
				};
				const bottom = bottomRef.current;
				if (bottom !== null) {
					bottom.style.setProperty("left", `${rect.left}px`);
					bottom.style.setProperty("right", `${window.innerWidth - rect.right}px`);
				}
				setCenterMeasured((prev) => prev ? prev : true);
			}, []);
			(0, react.useEffect)(() => {
				let disposed = false;
				let observer;
				const locate = () => {
					if (disposed) return;
					const col = document.querySelector("#root [data-slot=\"conversation\"]")?.parentElement;
					if (col === void 0 || !col.isConnected) {
						if (centerColRef.current !== null) {
							centerColRef.current = null;
							observer?.disconnect();
							observer = void 0;
						}
						return;
					}
					if (centerColRef.current !== col) {
						centerColRef.current = col;
						observer?.disconnect();
						observer = new ResizeObserver(measureCenter);
						observer.observe(col);
						measureCenter();
					}
				};
				locate();
				let locateFrame = null;
				const scheduleLocate = () => {
					if (locateFrame !== null) return;
					if (draggingRef.current) return;
					locateFrame = requestAnimationFrame(() => {
						locateFrame = null;
						locate();
					});
				};
				const watcher = new MutationObserver(scheduleLocate);
				const root = document.getElementById("root");
				if (root !== null) watcher.observe(root, {
					childList: true,
					subtree: true
				});
				const htmlStyleWatcher = new MutationObserver(scheduleLocate);
				htmlStyleWatcher.observe(document.documentElement, {
					attributes: true,
					attributeFilter: ["style"]
				});
				const retry = window.setInterval(locate, 1500);
				return () => {
					disposed = true;
					if (locateFrame !== null) cancelAnimationFrame(locateFrame);
					window.clearInterval(retry);
					observer?.disconnect();
					watcher.disconnect();
					htmlStyleWatcher.disconnect();
					centerColRef.current = null;
				};
			}, [measureCenter, state?.bottomOpen]);
			/**
			* Bottom-panel first-expansion auto terminal: the FIRST time the user
			* expands the bottom panel in a session, try to open a fresh terminal tab
			* there. "Try" is literal — the terminal's own quota and enable switch
			* gate the attempt (a full quota or a disabled terminal type makes it a
			* no-op). Gated on the bottomPanelAutoTerminal pref (the terminal tab's
			* nested settings toggle, default on). Only a false→true TRANSITION fires
			* (a panel persisted open never counts as an expansion), and the session's
			* bottomOpenedOnce flag is set atomically with the first fire so later
			* expansions never repeat it.
			*/
			const bottomWasOpenRef = (0, react.useRef)(void 0);
			(0, react.useEffect)(() => {
				if (narrow) return;
				if (state === void 0) return;
				const wasOpen = bottomWasOpenRef.current;
				bottomWasOpenRef.current = state.bottomOpen;
				if (wasOpen === void 0 || wasOpen || !state.bottomOpen) return;
				if (state.bottomOpenedOnce) return;
				if (store.getPrefs().bottomPanelAutoTerminal === false) return;
				if (ctx.betterSidebar?.isTabEnabled("terminal") === false) return;
				store.reduce((s) => ({
					...s,
					activePane: firstLeaf(s.bottomSplits).id,
					bottomOpenedOnce: true
				}));
				ctx.betterSidebar?.openTab({ type: "terminal" });
			}, [
				state,
				store,
				ctx,
				narrow
			]);
			const panelRef = (0, react.useRef)(null);
			const bottomRef = (0, react.useRef)(null);
			const widthDrag = (0, react.useRef)({
				startX: 0,
				startWidth: 0
			});
			const [draggingWidth, setDraggingWidth] = (0, react.useState)(false);
			const bottomDrag = (0, react.useRef)({
				startY: 0,
				startHeight: 0
			});
			const [draggingBottom, setDraggingBottom] = (0, react.useState)(false);
			const cornerDrag = (0, react.useRef)({
				startX: 0,
				startY: 0,
				startWidth: 0,
				startHeight: 0
			});
			const [draggingCorner, setDraggingCorner] = (0, react.useState)(false);
			const anyDragging = draggingWidth || draggingBottom || draggingCorner;
			(0, react.useEffect)(() => {
				draggingRef.current = anyDragging;
				if (!anyDragging) measureCenter();
			}, [anyDragging, measureCenter]);
			const clampWidth = (width) => Math.min(Math.max(280, Math.round(width)), maxPanelWidthFor(window.innerWidth));
			const clampHeight = (height) => Math.min(Math.max(120, Math.round(height)), Math.max(120, window.innerHeight - 280));
			/** Single writer for the layout-push variables: the app shell gives up
			*  the panel's width/height while open (0 while collapsed) through
			*  layout.css's margins. Every size change — drag frames and committed
			*  state — flows through here so the push never forks between paths. */
			const writeGeometry = (width, height) => {
				document.documentElement.style.setProperty("--dsh-sidebar-width", `${width}px`);
				document.documentElement.style.setProperty("--dsh-sidebar-height", `${height}px`);
			};
			/** Last size a drag actually applied to the DOM (updated by applyDrag).
			*  When a pointer stream dies without any position info (issue #247: an
			*  ultra-fast flick whose release events carried no usable coordinates),
			*  the abort path adopts this instead of rolling back to the pre-drag
			*  value — the DOM's current size is the only truthful record left. */
			const lastDragSize = (0, react.useRef)(null);
			/** Apply a drag size to the DOM without touching React state or the store.
			*  The bottom panel's right edge tracks the right panel's left edge HERE
			*  too — React state only updates on release, so the inline right must be
			*  written directly or the bottom panel would lag the sidebar mid-drag.
			*  The layout push rides the shared writer (writeGeometry). */
			const applyDrag = (width, height) => {
				lastDragSize.current = {
					width,
					height
				};
				panelRef.current?.style.setProperty("width", `${width}px`);
				bottomRef.current?.style.setProperty("height", `${height}px`);
				bottomRef.current?.style.setProperty("right", `${window.innerWidth - centerRectRef.current.right + (width - (state?.width ?? 0))}px`);
				writeGeometry(width, height);
			};
			const dragFrame = (0, react.useRef)(null);
			const pendingDrag = (0, react.useRef)(null);
			const scheduleDrag = (width, height) => {
				pendingDrag.current = {
					width,
					height
				};
				if (dragFrame.current !== null) return;
				dragFrame.current = requestAnimationFrame(() => {
					dragFrame.current = null;
					const pending = pendingDrag.current;
					if (pending !== null) {
						pendingDrag.current = null;
						applyDrag(pending.width, pending.height);
					}
				});
			};
			/** Flush any pending drag write and stop scheduling (the store commit on
			*  pointer up applies the final clamped values). */
			const stopDragScheduling = () => {
				if (dragFrame.current !== null) {
					cancelAnimationFrame(dragFrame.current);
					dragFrame.current = null;
				}
				pendingDrag.current = null;
			};
			/**
			* Finalize a drag on pointer up: flush the LAST drag frame to the DOM
			* synchronously, then commit the SAME clamped values to the store. A fast
			* release cancels the rAF before it ran — without the flush the DOM would
			* sit at the pre-drag size until React re-renders with the committed
			* value, and a value that never made it into a move handler would never
			* be applied at all. The measurement pause ends here too: the center
			* column is re-measured BEFORE the committed re-render lands, so the
			* bottom panel's React-rendered right edge already reflects the new
			* width (otherwise the re-render would re-apply the stale rect — the
			* bottom panel visibly jumps for one frame).
			*/
			const commitDrag = (width, height, reduce) => {
				stopDragScheduling();
				applyDrag(width, height);
				draggingRef.current = false;
				measureCenter();
				store.reduce(reduce);
			};
			/** Set once a drag's pointerup handler commits — premature capture loss
			*  (pointercancel / lostpointercapture without pointerup) must then be told
			*  apart from a normal release. */
			const dragCommitted = (0, react.useRef)(false);
			/**
			* Abort a drag whose pointer stream was interrupted (pointercancel, or
			* capture lost before pointerup): no pointerup will arrive, so without
			* this the dragging state would stick true and center-column measurement
			* would stay paused forever — the bottom panel freezes at stale edges and
			* stops tracking sidebar/app-rail layout changes.
			*
			* A FAST release is the common trigger: browsers merge pointermove bursts,
			* and an ultra-fast flick can cancel the stream before ANY move lands.
			* The commit order is therefore: the LAST KNOWN dragged size (the rAF
			* pending value) first, then the interrupting event's own pointer
			* position (only pointercancel is trusted to carry coordinates —
			* lostpointercapture's coordinates are not guaranteed, so the handlers
			* pass the event only from pointercancel), and finally the size the drag
			* last APPLIED to the DOM (lastDragSize). A drag that produced none of
			* those (pure down+up at the same spot) commits the store's own sizes —
			* a no-op, never an explicit rollback (issue #247: v0.13.1 never reverted
			* an interrupted fast flick; the abort path added in the unified-host
			* refactor did, and that regression is what this ordering removes).
			*
			* Every commit path marks the drag committed, so the interrupt
			* double-fire (pointercancel → lostpointercapture) cannot commit once
			* and then roll the same drag back.
			*/
			const abortDrag = (reset, event) => {
				if (dragCommitted.current) return;
				const pending = pendingDrag.current;
				let width;
				let height;
				if (pending !== null) {
					width = pending.width;
					height = pending.height;
				} else if (event !== void 0) {
					if (draggingWidth) {
						width = clampWidth(widthDrag.current.startWidth + (widthDrag.current.startX - event.clientX));
						height = state?.bottomOpen === true ? Math.min(state.bottomHeight, window.innerHeight) : 0;
					} else if (draggingBottom) {
						width = Math.min(state?.width ?? 0, maxPanelWidthFor(window.innerWidth));
						height = clampHeight(bottomDrag.current.startHeight + (bottomDrag.current.startY - event.clientY));
					} else if (draggingCorner) {
						width = clampWidth(cornerDrag.current.startWidth + (cornerDrag.current.startX - event.clientX));
						height = clampHeight(cornerDrag.current.startHeight + (cornerDrag.current.startY - event.clientY));
					}
				}
				if (width !== void 0 && height !== void 0) {
					dragCommitted.current = true;
					pendingDrag.current = null;
					if (dragFrame.current !== null) {
						cancelAnimationFrame(dragFrame.current);
						dragFrame.current = null;
					}
					applyDrag(width, height);
					draggingRef.current = false;
					measureCenter();
					store.reduce((s) => setBottomHeight(setWidth(s, width), height));
				} else {
					dragCommitted.current = true;
					stopDragScheduling();
					const last = lastDragSize.current;
					const adoptedWidth = !narrow && state?.panelOpen === true ? Math.min(last?.width ?? state?.width ?? 0, maxPanelWidthFor(window.innerWidth)) : 0;
					const adoptedHeight = !narrow && state?.bottomOpen === true ? Math.min(last?.height ?? state?.bottomHeight ?? 0, window.innerHeight) : 0;
					applyDrag(adoptedWidth, adoptedHeight);
					draggingRef.current = false;
					measureCenter();
					store.reduce((s) => setBottomHeight(setWidth(s, adoptedWidth), adoptedHeight));
				}
				reset();
			};
			(0, react.useEffect)(() => {
				const width = !narrow && snapshot.state?.panelOpen === true ? Math.min(snapshot.state.width, maxPanelWidthFor(window.innerWidth)) : 0;
				const height = !narrow && snapshot.state?.bottomOpen === true ? Math.min(snapshot.state.bottomHeight, window.innerHeight) : 0;
				writeGeometry(width, height);
			}, [
				narrow,
				snapshot.state?.panelOpen,
				snapshot.state?.width,
				snapshot.state?.bottomOpen,
				snapshot.state?.bottomHeight
			]);
			(0, react.useEffect)(() => {
				return () => {
					document.documentElement.style.removeProperty("--dsh-sidebar-width");
					document.documentElement.style.removeProperty("--dsh-sidebar-height");
				};
			}, []);
			(0, react.useEffect)(() => {
				if (anyDragging) document.body.setAttribute("data-dsh-sidebar-dragging", "");
				else document.body.removeAttribute("data-dsh-sidebar-dragging");
			}, [anyDragging]);
			const actions = (0, react.useMemo)(() => ({
				closeTab: (paneId, tabId) => {
					const current = store.getSnapshot().state;
					const tab = (current === void 0 ? void 0 : leafWithTab(current.splits, tabId) ?? leafWithTab(current.bottomSplits, tabId))?.tabs.find((candidate) => candidate.id === tabId);
					ctx.betterSidebar?.closeTab(tabId, sessionId === void 0 ? void 0 : {
						sessionId,
						cwd
					});
					if (tab?.type === "terminal") {
						if (isAgentTabId(tabId)) {
							const uuid = agentUuidOf(tabId);
							api.agentPtyClose(uuid).catch(() => {});
						} else if (sessionId !== void 0) api.ptyClose({
							sessionId,
							cwd
						}, tabId).catch(() => {});
					}
				},
				activateTab: (paneId, tabId) => {
					ctx.betterSidebar?.activateTab(tabId, sessionId === void 0 ? void 0 : {
						sessionId,
						cwd
					});
				},
				focusPane: (paneId) => {
					store.reduce((s) => ({
						...s,
						activePane: paneId
					}));
				},
				moveTabToEdge: (payload, toPane, zone) => {
					store.reduce((s) => moveTabToEdge(s, payload.paneId, payload.tabId, toPane, zone));
				},
				moveTabBefore: (payload, toPane, beforeTabId) => {
					store.reduce((s) => {
						let index = -1;
						const source = leafWithTab(s.splits, beforeTabId);
						if (source !== void 0 && source.id === toPane) index = source.tabs.findIndex((tab) => tab.id === beforeTabId);
						return moveTab(s, payload.paneId, payload.tabId, toPane, index);
					});
				},
				resizeSplit: (splitId, index, deltaFrac) => {
					store.reduce((s) => resizeSplitIn(s, splitId, index, deltaFrac));
				}
			}), [
				store,
				sessionId,
				cwd
			]);
			/**
			* The explorer's @-reference button: append `@<relative path>` to the
			* session's composer draft (space-separated). The conversation service is
			* resolved lazily through `ctx.get` (the inject-free read — the app's own
			* plugins read 'conversation' the same way); a missing service or scope
			* degrades to a logged no-op, never a crash. Defined above the no-session
			* early return — a hook must never sit behind a conditional return
			* (React counts hooks per render).
			*/
			const referenceInChat = (0, react.useCallback)((path) => {
				if (sessionId === void 0) return;
				appendToDraft(ctx, sessionId, `@${relativeTo(cwd ?? "", path)}`);
			}, [
				ctx,
				sessionId,
				cwd
			]);
			if (state === void 0 || sessionId === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				"data-dsh-panel-host": true,
				...osFileDragShield,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: sidebar_module_css_default.toggleCluster,
					"data-dsh-toggle-cluster": true,
					children: [!narrow && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
						label: t("noSession"),
						side: "bottom",
						delayMs: 500,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: sidebar_module_css_default.toggleButton,
							disabled: true,
							"aria-label": t("noSession"),
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconPanelBottomOutline16, {})
						})
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
						label: t("noSession"),
						side: "bottom",
						delayMs: 500,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: sidebar_module_css_default.toggleButton,
							disabled: true,
							"aria-label": t("noSession"),
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconPanelRightOutline16, {})
						})
					})]
				})
			});
			const onNewTab = (optionId) => {
				const service = ctx.betterSidebar;
				const descriptor = service?.getTab(optionId);
				if (descriptor === void 0) return;
				const title = typeof descriptor.title === "function" ? descriptor.title() : descriptor.title;
				service.openTab({
					type: optionId,
					title
				}, {
					sessionId,
					cwd
				});
			};
			/**
			* The explorer's @-reference button: append `@<relative path>` to the
			* session's composer draft (space-separated). Resolves the session-scope
			* ctx and the conversation input service at click time; a missing service
			* or scope degrades to a logged no-op, never a crash.
			*/
			/** The tab icon from the tab-type registry (shared by every workbench). */
			const tabIconOf = (tab) => {
				const descriptor = ctx.betterSidebar?.getTab(tab.type);
				if (descriptor === void 0) return null;
				return typeof descriptor.icon === "function" ? descriptor.icon(14) : descriptor.icon;
			};
			/**
			* The tab badge from the tab-type registry: a count (99+ capped) or a
			* short text pill. A throwing badge is swallowed (no pill) — the tab
			* strip must never break because a plugin's badge computation failed.
			*/
			const tabBadgeOf = (tab) => {
				const descriptor = ctx.betterSidebar?.getTab(tab.type);
				if (descriptor?.badge === void 0) return null;
				let value;
				try {
					value = descriptor.badge(ctx, {
						sessionId,
						cwd
					}, state);
				} catch (error) {
					console.error("[dsh-better-sidebar] tab badge error:", error);
					return null;
				}
				if (value === null || value === void 0 || value === "") return null;
				const text = typeof value === "number" ? value > 99 ? "99+" : String(value) : String(value);
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: sidebar_module_css_default.tabBadge,
					children: text
				});
			};
			/**
			* Render one tab's content. `active` (from the workbench) tells whether
			* this tab is the active one in its pane; combined with the panel's
			* open/closed state it gates live views (the Subagent topology pauses its
			* polling while the page is not actually visible). The pane id travels
			* with the tab so diff tabs can split below their source pane.
			*/
			const renderTab = (tab, active, paneId, bottom = false) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TabContent, {
				tab,
				paneId,
				sessionId,
				cwd,
				expanded: state.expanded,
				onToggleDir: (path) => {
					store.reduce((s) => toggleExpanded(s, path));
				},
				onReferenceFile: referenceInChat,
				ctx,
				store,
				visible: bottom ? state.bottomOpen && active : state.panelOpen && active,
				onSubagentJump: (childSessionId) => {
					subagentJumpRef.current = childSessionId;
				},
				onOpenDiff: (diffTab) => {
					store.reduce((s) => openDiffTab(s, paneId, diffTab));
				},
				localeRevision,
				tabsVersion
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				"data-dsh-panel-host": true,
				...osFileDragShield,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: sidebar_module_css_default.toggleCluster,
						"data-dsh-toggle-cluster": true,
						children: [!narrow && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
							label: state.bottomOpen ? t("collapseBottomPanel") : t("expandBottomPanel"),
							side: "bottom",
							delayMs: 500,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: sidebar_module_css_default.toggleButton,
								"aria-label": state.bottomOpen ? t("collapseBottomPanel") : t("expandBottomPanel"),
								onClick: () => {
									store.reduce(toggleBottomPanel);
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconPanelBottomOutline16, {})
							})
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
							label: state.panelOpen ? t("collapse") : t("expand"),
							side: "bottom",
							delayMs: 500,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: sidebar_module_css_default.toggleButton,
								"aria-label": state.panelOpen ? t("collapse") : t("expand"),
								onClick: () => {
									store.reduce(togglePanel);
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconPanelRightOutline16, {})
							})
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						ref: panelRef,
						className: clsx(sidebar_module_css_default.panel, !state.panelOpen && sidebar_module_css_default.panelHidden),
						"data-dsh-panel": true,
						style: {
							width: narrow ? "100vw" : Math.min(state.width, maxPanelWidthFor(window.innerWidth)),
							bottom: narrow && keyboardInset > 0 ? `${keyboardInset}px` : void 0
						},
						"data-dragging": anyDragging || void 0,
						children: [
							!narrow && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: clsx(sidebar_module_css_default.panelResize, draggingWidth && sidebar_module_css_default.panelResizeActive),
								onPointerDown: (event) => {
									event.preventDefault();
									event.currentTarget.setPointerCapture(event.pointerId);
									dragCommitted.current = false;
									widthDrag.current = {
										startX: event.clientX,
										startWidth: state.width
									};
									setDraggingWidth(true);
								},
								onPointerMove: (event) => {
									if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
									const { startX, startWidth } = widthDrag.current;
									const width = clampWidth(startWidth + (startX - event.clientX));
									const height = state.bottomOpen ? Math.min(state.bottomHeight, window.innerHeight) : 0;
									scheduleDrag(width, height);
								},
								onPointerUp: (event) => {
									if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
									if (dragCommitted.current) return;
									dragCommitted.current = true;
									event.currentTarget.releasePointerCapture(event.pointerId);
									const { startX, startWidth } = widthDrag.current;
									const width = clampWidth(startWidth + (startX - event.clientX));
									const height = state.bottomOpen ? Math.min(state.bottomHeight, window.innerHeight) : 0;
									commitDrag(width, height, (s) => setWidth(s, width));
									setDraggingWidth(false);
								},
								onPointerCancel: (event) => {
									abortDrag(() => setDraggingWidth(false), event);
								},
								onLostPointerCapture: () => {
									abortDrag(() => setDraggingWidth(false));
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: sidebar_module_css_default.panelBody,
								children: [snapshot.prefs.tabsEnabled["editor"] !== false && (state.explorerOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ExplorerRail, {
									ctx,
									store,
									sessionId,
									cwd,
									expanded: state.expanded,
									onToggleDir: (path) => {
										store.reduce((s) => toggleExpanded(s, path));
									},
									onReferenceFile: referenceInChat,
									width: state.explorerWidth,
									onResize: (width) => {
										store.reduce((s) => setExplorerWidth(s, width));
									},
									onCollapse: () => {
										store.reduce(toggleExplorer);
									}
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ExplorerRailCollapsed, { onExpand: () => {
									store.reduce(toggleExplorer);
								} })), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Workbench, {
									state,
									newTabOptions: buildNewTabOptions(state, ctx, {
										sessionId,
										cwd
									}),
									actions,
									onNewTab,
									renderTab,
									getTabIcon: tabIconOf,
									getTabBadge: tabBadgeOf
								})]
							}),
							!narrow && state.panelOpen && state.bottomOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: sidebar_module_css_default.cornerHandle,
								"data-dragging": draggingCorner || void 0,
								onPointerDown: (event) => {
									event.preventDefault();
									event.currentTarget.setPointerCapture(event.pointerId);
									dragCommitted.current = false;
									cornerDrag.current = {
										startX: event.clientX,
										startY: event.clientY,
										startWidth: state.width,
										startHeight: state.bottomHeight
									};
									setDraggingCorner(true);
								},
								onPointerMove: (event) => {
									if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
									const { startX, startY, startWidth, startHeight } = cornerDrag.current;
									const width = clampWidth(startWidth + (startX - event.clientX));
									const height = clampHeight(startHeight + (startY - event.clientY));
									scheduleDrag(width, height);
								},
								onPointerUp: (event) => {
									if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
									if (dragCommitted.current) return;
									dragCommitted.current = true;
									event.currentTarget.releasePointerCapture(event.pointerId);
									const { startX, startY, startWidth, startHeight } = cornerDrag.current;
									const width = clampWidth(startWidth + (startX - event.clientX));
									const height = clampHeight(startHeight + (startY - event.clientY));
									commitDrag(width, height, (s) => setBottomHeight(setWidth(s, width), height));
									setDraggingCorner(false);
								},
								onPointerCancel: (event) => {
									abortDrag(() => setDraggingCorner(false), event);
								},
								onLostPointerCapture: () => {
									abortDrag(() => setDraggingCorner(false));
								}
							})
						]
					}),
					!narrow && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						ref: bottomRef,
						className: clsx(sidebar_module_css_default.bottomPanel, !state.bottomOpen && sidebar_module_css_default.bottomPanelHidden),
						"data-dsh-panel": true,
						"data-dsh-bottom-panel": true,
						style: {
							height: Math.min(state.bottomHeight, window.innerHeight),
							left: centerRectRef.current.left,
							bottom: keyboardInset > 0 ? `${keyboardInset}px` : void 0,
							right: window.innerWidth - centerRectRef.current.right,
							borderRight: state.panelOpen ? "1px solid var(--dsw-alias-border-l2)" : void 0,
							visibility: centerMeasured ? void 0 : "hidden"
						},
						"data-dragging": draggingBottom || draggingCorner || void 0,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: clsx(sidebar_module_css_default.bottomResize, draggingBottom && sidebar_module_css_default.bottomResizeActive),
								onPointerDown: (event) => {
									event.preventDefault();
									event.currentTarget.setPointerCapture(event.pointerId);
									dragCommitted.current = false;
									bottomDrag.current = {
										startY: event.clientY,
										startHeight: state.bottomHeight
									};
									setDraggingBottom(true);
								},
								onPointerMove: (event) => {
									if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
									const { startY, startHeight } = bottomDrag.current;
									const height = clampHeight(startHeight + (startY - event.clientY));
									scheduleDrag(Math.min(state.width, maxPanelWidthFor(window.innerWidth)), height);
								},
								onPointerUp: (event) => {
									if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
									if (dragCommitted.current) return;
									dragCommitted.current = true;
									event.currentTarget.releasePointerCapture(event.pointerId);
									const { startY, startHeight } = bottomDrag.current;
									const height = clampHeight(startHeight + (startY - event.clientY));
									commitDrag(Math.min(state.width, maxPanelWidthFor(window.innerWidth)), height, (s) => setBottomHeight(s, height));
									setDraggingBottom(false);
								},
								onPointerCancel: (event) => {
									abortDrag(() => setDraggingBottom(false), event);
								},
								onLostPointerCapture: () => {
									abortDrag(() => setDraggingBottom(false));
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
								label: t("collapseBottomPanel"),
								side: "bottom",
								delayMs: 500,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: sidebar_module_css_default.bottomClose,
									"aria-label": t("collapseBottomPanel"),
									onClick: () => {
										store.reduce(toggleBottomPanel);
									},
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCloseFill14, {})
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: sidebar_module_css_default.panelBody,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Workbench, {
									state,
									tree: state.bottomSplits,
									newTabOptions: buildNewTabOptions(state, ctx, {
										sessionId,
										cwd
									}),
									actions,
									onNewTab,
									renderTab: (tab, active, paneId) => renderTab(tab, active, paneId, true),
									getTabIcon: tabIconOf,
									getTabBadge: tabBadgeOf
								})
							})
						]
					})
				]
			});
		}
		//#endregion
		//#region src/client/link-intercept.ts
		/**
		* Chat/GUI external-link interception: clicking an http(s) link that points
		* OUTSIDE the GUI (chat messages, tool rows, prose mentions) opens the
		* sidebar instead of a new browser tab. Gated by the caller through
		* `takeoverEnabled(url)` — the `browserInterceptLinks` master, the URL's
		* protocol flag (`browserInterceptHttp` / `browserInterceptHttps`) and the
		* target tab's enable switch — and a Ctrl/Cmd/Shift/Alt-modified click
		* always bypasses the takeover so the user can still force a real browser
		* tab.
		*
		* Only the GUI's OWN document is watched — links inside the browser tab's
		* sandboxed iframe live in another document and never bubble here (and
		* their clicks must keep working inside the sidebar).
		*/
		/** The pure decision: the URL to open in the sidebar, or null to let the
		*  click fall through. Extracted so the policy is unit-testable without a
		*  DOM. `anchorHref` must be the ABSOLUTE href (`<a>.href` already is).
		*  The protocol/same-origin policy lives HERE; the prefs gates (master +
		*  protocol flags + target enablement) live in the caller's
		*  `takeoverEnabled(url)` callback. */
		function shouldInterceptLink(anchorHref, selfOrigin) {
			let url;
			try {
				url = new URL(anchorHref);
			} catch {
				return null;
			}
			if (url.protocol !== "http:" && url.protocol !== "https:") return null;
			try {
				if (url.origin === new URL(selfOrigin).origin) return null;
			} catch {}
			return url.href;
		}
		/** Whether a left-click may be taken over (unmodified left click only). */
		function isPlainLeftClick(event) {
			return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
		}
		/**
		* Register the document-level click capture that funnels external links
		* into the sidebar. Returns the disposer (HMR-safe).
		*/
		function registerLinkInterception(opts) {
			const onClick = (event) => {
				if (!isPlainLeftClick(event)) return;
				if (event.defaultPrevented) return;
				const target = event.target;
				if (target === null || typeof target.closest !== "function") return;
				const anchor = target.closest("a[href]");
				if (anchor === null) return;
				const url = shouldInterceptLink(anchor.href, opts.selfOrigin);
				if (url === null) return;
				if (!opts.takeoverEnabled(new URL(url))) return;
				event.preventDefault();
				opts.openInSidebar(url);
			};
			document.addEventListener("click", onClick, true);
			return () => {
				document.removeEventListener("click", onClick, true);
			};
		}
		//#endregion
		//#region src/client/ime-guard.ts
		/**
		* IME-composition key guard.
		*
		* While a Chinese/Japanese/Korean input method is composing (the user is
		* picking a candidate from the IME window), every pressed key BELONGS to the
		* input method: arrows move the candidate highlight, Enter/Space confirm the
		* composition, Escape cancels it. Page code must not process those keys —
		* a component that does (a number stepper calling preventDefault() on
		* ArrowUp/ArrowDown, a submit handler reacting to Enter, ...) silently
		* breaks the IME: candidates stop responding, the composition gets torn
		* apart, and only bare letters come out.
		*
		* This guard enforces that rule at the document boundary: a capture-phase
		* keydown/keyup listener that stops the event from propagating further
		* whenever a composition is in progress. Because it runs in the capture
		* phase on `document` — the outermost node — it fires BEFORE React's
		* delegated handlers (attached at the root container) and before any native
		* target/bubble listener, so an inlined third-party component (e.g. the
		* Univer office UI bundled into this plugin) can never intercept
		* composition keys. The browser's native IME processing is untouched:
		* stopPropagation only silences page JS, not the default action.
		*
		* The composition signal follows the DSH core convention (InputBar's IME
		* guard, issue #535): `isComposing` for modern engines, keyCode 229 as the
		* legacy signal engines emit without isComposing.
		*/
		/** The pure decision: is this keyboard event part of an IME composition? */
		function isImeComposition(event) {
			return event.isComposing || event.keyCode === 229;
		}
		/**
		* Register the document-level capture guard. Returns the disposer
		* (HMR-safe; call through `ctx.effect`).
		*/
		function registerImeGuard() {
			const onKey = (event) => {
				if (isImeComposition(event)) event.stopPropagation();
			};
			document.addEventListener("keydown", onKey, true);
			document.addEventListener("keyup", onKey, true);
			return () => {
				document.removeEventListener("keydown", onKey, true);
				document.removeEventListener("keyup", onKey, true);
			};
		}
		//#endregion
		//#region src/client/settings-nav-icon.ts
		/**
		* Mark this plugin's row in the DSH settings navigation so its bundled CSS
		* can replace the shell's fallback gear with the Side card glyph.
		*
		* DSH 0.1.x projects only `id`, `order`, and `label` from a
		* `settings.section` registration, then chooses icons inside the settings
		* shell from a closed list of built-in ids. Until that public contract grows
		* an icon field, the plugin identifies only its own localized row after the
		* dialog mounts. The marker owns no shell structure and is removed on fiber
		* disposal, so the adaptation remains HMR-safe.
		*/
		const SETTINGS_NAV_MARKER = "data-dsh-better-sidebar-settings-nav";
		/**
		* Keep the marker on the settings-nav button whose visible text is this
		* plugin's current localized section label.
		* @param label - locale-aware label resolver used by the section registration.
		* @returns disposer that disconnects observation and removes owned markers.
		*/
		function registerSettingsNavIcon(label) {
			let disposed = false;
			const sync = () => {
				if (disposed) return;
				const currentLabel = label().trim();
				const buttons = document.querySelectorAll("[role=\"dialog\"] nav button");
				for (const button of buttons) if (currentLabel.length > 0 && button.textContent?.trim() === currentLabel) button.setAttribute(SETTINGS_NAV_MARKER, "");
				else button.removeAttribute(SETTINGS_NAV_MARKER);
			};
			sync();
			const observer = new MutationObserver(sync);
			observer.observe(document.body, {
				childList: true,
				subtree: true,
				characterData: true
			});
			return () => {
				disposed = true;
				observer.disconnect();
				document.querySelectorAll(`[${SETTINGS_NAV_MARKER}]`).forEach((element) => {
					element.removeAttribute(SETTINGS_NAV_MARKER);
				});
			};
		}
		//#endregion
		//#region src/client/plugins-shared.ts
		/**
		* Shared vocabulary of the recommended plugin catalogs: the entry shape and
		* the GitHub topic URL. The two catalogs live in sibling modules —
		* `plugins-tabs.ts` (tab registrations) and `plugins-viewers.ts` (file
		* previewer registrations) — and are shown in the two "add plugin" modals
		* (Side card settings → the dashed cards at the end of the 侧边栏内容 /
		* 文件预览 grids).
		*/
		/** The GitHub topic page listing every repo tagged `dsh-better-sidebar`. */
		const PLUGIN_TOPIC_URL = "https://github.com/topics/dsh-better-sidebar";
		//#endregion
		//#region src/client/plugins-tabs.ts
		/**
		* The built-in catalog of TAB-registration plugins (sidebar pages),
		* shown in the "add tab plugin" modal (Side card settings → 侧边栏内容 grid
		* → the dashed card). Adding an entry: append one object here (unique
		* `id` = npm package name, `url` = GitHub repo, `description` =
		* i18n-friendly (add a `pluginXxxDesc` key in locales.ts), `install` = the
		* full one-line install script — it starts with `cd ~/.dsh` so the install
		* runs with the DSH home as the working directory). Data integrity is
		* guarded by `tests/plugin-list.spec.ts`.
		*/
		/** Tab-registration plugins (alphabetical order). */
		const builtinTabPlugins = [
			{
				id: "@dsh-external/dsh-sentinel",
				name: "dsh-sentinel 唤醒系统",
				url: "https://github.com/fuhefei/dsh-sentinel",
				description: () => t("pluginSentinelDesc"),
				install: "cd ~/.dsh && dsh plugin --profile web add \"github:fuhefei/dsh-sentinel#v0.7.0\""
			},
			{
				id: "dsh-docs-panel",
				name: "dsh-docs-panel 全局文档",
				url: "https://github.com/mlosun/dsh-docs-panel",
				description: () => t("pluginDocsPanelDesc"),
				install: "cd ~/.dsh && dsh plugin --profile web add dsh-better-sidebar && dsh plugin --profile web add dsh-docs-panel"
			},
			{
				id: "dsh-flowglass",
				name: "dsh-flowglass 流镜",
				url: "https://github.com/Iwctwbh/dsh-flowglass",
				description: () => t("pluginFlowglassDesc"),
				install: "cd ~/.dsh && dsh plugin --profile web add dsh-better-sidebar && dsh plugin --profile web add dsh-flowglass"
			},
			{
				id: "dsh-git-forge",
				name: "dsh-git-forge Git 凭据",
				url: "https://github.com/thirsty5034/dsh-git-forge",
				description: () => t("pluginGitForgeDesc"),
				install: "cd ~/.dsh && dsh plugin --profile web add dsh-better-sidebar && dsh plugin --profile web add \"dsh-git-forge@github:thirsty5034/dsh-git-forge\""
			},
			{
				id: "dsh-git-remotes",
				name: "dsh-git-remotes Git 远程",
				url: "https://github.com/yq04/dsh-git-remotes",
				description: () => t("pluginGitRemotesDesc"),
				install: "cd ~/.dsh && dsh plugin --profile web add dsh-better-sidebar && dsh plugin --profile web add git+https://github.com/yq04/dsh-git-remotes.git"
			},
			{
				id: "dsh-sidebar-qa",
				name: "dsh-sidebar-qa 划选追问",
				url: "https://github.com/ChenRuoT/dsh-sidebar-qa",
				description: () => t("pluginSidebarQaDesc"),
				install: "cd ~/.dsh && dsh plugin --profile web add dsh-better-sidebar && dsh plugin --profile web add git+https://github.com/ChenRuoT/dsh-sidebar-qa.git"
			},
			{
				id: "dsh-ssh-tunnel",
				name: "dsh-ssh-tunnel SSH 隧道",
				url: "https://github.com/thirsty5034/dsh-ssh-tunnel",
				description: () => t("pluginSshTunnelDesc"),
				install: "cd ~/.dsh && dsh plugin --profile web add dsh-better-sidebar && dsh plugin --profile web add \"dsh-ssh-tunnel@github:thirsty5034/dsh-ssh-tunnel\""
			},
			{
				id: "dsh-turn-review",
				name: "dsh-turn-review 本轮审查",
				url: "https://github.com/yq04/dsh-turn-review",
				description: () => t("pluginTurnReviewDesc"),
				install: "cd ~/.dsh && dsh plugin --profile web add dsh-better-sidebar && dsh plugin --profile web add git+https://github.com/yq04/dsh-turn-review.git"
			}
		];
		//#endregion
		//#region src/client/plugins-viewers.ts
		/**
		* The built-in catalog of FILE-PREVIEWER plugins (file-type previewers),
		* shown in the "add preview plugin" modal (Side card settings → 文件预览
		* grid → the dashed card). Adding an entry: append one object here (unique
		* `id` = npm package name, `url` = GitHub repo, `description` =
		* i18n-friendly, `install` = the full shell command pre-filled into the
		* install terminal — it starts with `cd ~/.dsh` so the install runs with
		* the DSH home as the working directory). Data integrity is guarded by
		* `tests/plugin-list.spec.ts`.
		*/
		/** File-previewer plugins (alphabetical order). */
		const builtinViewerPlugins = [{
			id: "@huanlin/dsh-plugin-better-sidebar-plugin-office",
			name: "Office 预览插件",
			url: "https://github.com/HuanLinOTO/dsh-plugin-better-sidebar-plugin-office",
			description: () => t("pluginOfficeDesc"),
			install: "cd ~/.dsh && dsh plugin --profile web add @huanlin/dsh-plugin-better-sidebar-plugin-office"
		}, {
			id: "dsh-video-preview",
			name: "视频预览插件",
			url: "https://github.com/zemul/dsh-video-preview",
			description: () => t("pluginVideoPreviewDesc"),
			install: "cd ~/.dsh && dsh plugin --profile web add dsh-video-preview"
		}];
		//#endregion
		//#region src/client/add-plugin-modal.tsx
		/**
		* The "add plugin" modals (Side card settings → the dashed cards at the
		* end of the 侧边栏内容 / 文件预览 grids): declare that the sidebar's
		* extension points — tab pages and file previewers — are open to plugins
		* (registered through `ctx.betterSidebar`), point at the GitHub topic page
		* for discovery, and show the repo's recommended plugin catalog of the
		* matching kind (name / url / description / install script).
		*
		* Per entry there are two actions:
		* - 「跳转」opens the plugin's repo in a REAL new browser tab (window.open
		*   — a button, so the sidebar link takeover cannot reroute it);
		* - 「安装」only COPIES the install script to the clipboard (writeClipboard)
		*   with a transient "已复制" feedback on the button — the user pastes and
		*   runs it wherever they manage their DSH profile. No terminal is opened,
		*   nothing is closed, nothing can fail outward.
		*
		* The body is extracted as {@link PluginListBody} so tests render it
		* directly — the Modal primitive runs hooks unconditionally, so an open
		* Modal must never be renderToString'd (same rule as the settingsFor popup
		* in SideCardSection); the modal itself mounts only while open.
		*/
		/** The catalog of one kind (kept in two repo files: plugins-tabs.ts /
		*  plugins-viewers.ts). */
		function catalogOf(kind) {
			return kind === "tab" ? builtinTabPlugins : builtinViewerPlugins;
		}
		/** How long the "已复制" feedback stays on the copy button. */
		const COPIED_FEEDBACK_MS = 1500;
		/** The modal body: the GitHub topic button + the recommended plugin list
		*  with per-entry jump/copy buttons (extracted for direct testing). */
		function PluginListBody(props) {
			const { service, kind } = props;
			const [copiedId, setCopiedId] = (0, react.useState)(null);
			const [query, setQuery] = (0, react.useState)("");
			const catalog = catalogOf(kind);
			const needle = query.trim().toLowerCase();
			const matches = (entry) => {
				if (needle === "") return true;
				const description = typeof entry.description === "function" ? entry.description() : entry.description;
				return entry.name.toLowerCase().includes(needle) || entry.id.toLowerCase().includes(needle) || description.toLowerCase().includes(needle);
			};
			const filtered = catalog.filter(matches);
			const groups = /* @__PURE__ */ new Map();
			for (const entry of filtered) {
				const key = entry.category === void 0 ? void 0 : typeof entry.category === "function" ? entry.category() : entry.category;
				const list = groups.get(key);
				if (list === void 0) groups.set(key, [entry]);
				else list.push(entry);
			}
			/** Copy the entry's install script to the clipboard and flash the button's
			*  "已复制" label for a moment. The feedback ONLY appears after a
			*  successful write — when the clipboard is unavailable or denied
			*  (writeClipboard resolves false) nothing is shown, so the user is never
			*  told to paste a command that was not placed on the clipboard. Never
			*  closes anything, never throws outward. */
			const copy = async (entry) => {
				if (!await (0, _deepseek_ai_dsh_client_ui_primitives.writeClipboard)(entry.install)) return;
				setCopiedId(entry.id);
				window.setTimeout(() => {
					setCopiedId((current) => current === entry.id ? null : current);
				}, COPIED_FEEDBACK_MS);
			};
			/** Open the plugin's repo in a REAL new browser tab (window.open — a
			*  button, so the sidebar link takeover cannot reroute it). */
			const jump = (entry) => {
				window.open(entry.url, "_blank", "noopener");
			};
			/** One catalog row (extracted so the group render stays flat). */
			const renderEntry = (entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: SideCardSection_module_css_default.pluginEntry,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: SideCardSection_module_css_default.pluginEntryHead,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: SideCardSection_module_css_default.pluginName,
							"aria-label": `${t("openPlugin")}: ${entry.name}`,
							onClick: () => {
								jump(entry);
							},
							children: entry.name
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: SideCardSection_module_css_default.pluginEntryActions,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: SideCardSection_module_css_default.pluginJumpBtn,
								"aria-label": `${t("openPlugin")}: ${entry.name}`,
								onClick: () => {
									jump(entry);
								},
								children: t("openPlugin")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: SideCardSection_module_css_default.pluginCopyBtn,
								"aria-label": `${t("copyInstall")}: ${entry.name}`,
								onClick: () => {
									copy(entry);
								},
								children: copiedId === entry.id ? t("copied") : t("copy")
							})]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: SideCardSection_module_css_default.pluginDesc,
						children: typeof entry.description === "function" ? entry.description() : entry.description
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
						className: SideCardSection_module_css_default.pluginInstall,
						children: entry.install
					})
				]
			}, entry.id);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: SideCardSection_module_css_default.pluginList,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: SideCardSection_module_css_default.pluginTopicBtn,
						onClick: () => {
							window.open(PLUGIN_TOPIC_URL, "_blank", "noopener");
						},
						children: t("addPluginsBrowseMore")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						type: "search",
						className: SideCardSection_module_css_default.pluginSearch,
						placeholder: t("addPluginsSearch"),
						"aria-label": t("addPluginsSearch"),
						value: query,
						onChange: (event) => {
							setQuery(event.currentTarget.value);
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: SideCardSection_module_css_default.groupHeading,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("addPluginsRecommended") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: SideCardSection_module_css_default.count,
							children: filtered.length
						})]
					}),
					catalog.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: SideCardSection_module_css_default.pluginEmpty,
						children: t("addPluginsEmpty")
					}) : filtered.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: SideCardSection_module_css_default.pluginEmpty,
						children: t("addPluginsNoMatch")
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: SideCardSection_module_css_default.pluginEntries,
						children: [...groups.entries()].map(([category, entries]) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: SideCardSection_module_css_default.pluginGroup,
							children: [category !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: SideCardSection_module_css_default.pluginGroupHeading,
								children: category
							}), entries.map(renderEntry)]
						}, category ?? "\0"))
					})
				]
			});
		}
		/** The modal itself (mounted only while open — see the module comment). */
		function AddPluginModal(props) {
			const { service, onClose, kind } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: true,
				onClose,
				title: kind === "tab" ? t("addPluginsTabCard") : t("addPluginsViewerCard"),
				description: kind === "tab" ? t("addPluginsTabDesc") : t("addPluginsViewerDesc"),
				closeLabel: t("close"),
				className: SideCardSection_module_css_default.pluginModal,
				footer: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: SideCardSection_module_css_default.done,
					onClick: onClose,
					children: t("settingsDone")
				}),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PluginListBody, {
					service,
					kind
				})
			});
		}
		//#endregion
		//#region src/client/SideCardSection.tsx
		/**
		* "Side card" settings section: the user-facing preferences for the sidebar
		* panel, rendered natively in the DSH Settings shell (nav label "Side card").
		*
		* The section is DECLARATIVE — it renders the enable/disable inventory from
		* the sidebar service's registries instead of hardcoding rows:
		*  - 常规: new conversations open the panel by default (a toggle row), the
		*    default panel width as a percent of the window (number input row), and
		*    the open-path interception toggle — the DSH settings-row recipe
		*    (title/desc left + control right, hairline separators).
		*  - 侧边栏内容: one SMALL CARD per REGISTERED tab type (built-ins and
		*    external plugins alike), laid out in a responsive grid that wraps
		*    several cards per row — icon chip + title + type id, clicked to toggle
		*    the switch persisted in `prefs.tabsEnabled[id]`.
		*  - 文件预览: one SMALL CARD per REGISTERED file viewer — icon chip + title
		*    + the extensions it covers, clicked to toggle `prefs.viewersEnabled[id]`.
		*
		* Every group lives in a container card (the DSH PluginCard recipe: l2
		* hairline, 16px radius, layer-3 fill) with a heading and an inventory count
		* badge (the settings catalogHeading recipe); the section opens with a
		* one-line intro (the DSH section heading+intro recipe).
		*
		* A card's on/off state is its VISUAL STATE: enabled = highlighted (brand
		* border + tinted fill + a compact switch knob at the card's far right),
		* disabled = neutral and dimmed. Features that declare
		* `settings.toggles` carry a labeled settings strip at the card's bottom
		* edge that opens a native Modal (wider than the primitive default) with
		* the related settings as title/desc + custom-switch rows and a Done
		* footer; the popup body scrolls internally when a feature declares many
		* rows (e.g. Terminal's six). The toggles themselves are custom
		* switches: a real checkbox (native semantics and focus) driving a styled
		* track/thumb.
		*
		* Writes ride the plugin's own fenced settings route (the host calls the
		* settings seam in-process — the DSH settings RPC domain does not serve
		* third-party namespaces to configuration clients); the shared SidebarStore
		* is refreshed on success so the very next brand-new session seeds from the
		* new values and the sidebar's consumption points (the + menu, derived
		* flows) re-render immediately. Any failure reverts the optimistic UI and
		* shows the wire error inline — a broken settings surface never crashes the
		* shell.
		*/
		/** Map one wire failure to the inline message (the conflict gets friendly copy). */
		function messageOf(error) {
			if (error instanceof Error && "code" in error && error.code === "settings-conflict") return `${t("settingsSaveFailed")} ${t("settingsConflict")}`;
			return `${t("settingsSaveFailed")} ${error instanceof Error ? error.message : String(error)}`;
		}
		/** Resolve an i18n-friendly string-or-function value. */
		function textOf(value) {
			if (value === void 0) return "";
			return typeof value === "function" ? value() : value;
		}
		/** Resolve a descriptor icon (ReactNode or size function). */
		function iconOf(icon, size) {
			if (icon === void 0) return null;
			return typeof icon === "function" ? icon(size) : icon;
		}
		/** Tab inventory order: hidden types (editor/diff) last, then + menu order. */
		function tabOrder(a, b) {
			if (a.hidden !== b.hidden) return a.hidden === true ? 1 : -1;
			return (a.order ?? 100) - (b.order ?? 100);
		}
		/**
		* The scheme dropdown's current value: the plain scheme, or `preset:<id>`
		* while a preset is active. Falls back to `auto` when the stored preset id
		* is no longer registered (the strip resolves to 0 then anyway).
		*/
		function titleBarSchemeValue(prefs) {
			if (prefs.titleBarScheme !== "preset") return prefs.titleBarScheme;
			const preset = getShellPreset(prefs.titleBarPresetId);
			return preset !== void 0 ? `preset:${preset.id}` : "auto";
		}
		/** Viewer inventory order: priority desc (the catch-all `code` comes last). */
		function viewerOrder(a, b) {
			return (b.priority ?? 0) - (a.priority ?? 0);
		}
		/** Whether a feature declares any secondary settings (gear button shows). */
		function hasSettings(feature) {
			const settings = feature.settings;
			return settings !== void 0 && ((settings.toggles?.length ?? 0) > 0 || (settings.pluginToggles?.length ?? 0) > 0 || settings.render !== void 0);
		}
		/** A feature's display name (viewers fall back to their id). */
		function featureNameOf(feature) {
			return textOf("title" in feature ? feature.title : void 0) || feature.id;
		}
		/**
		* Merge one plugin-owned setting into a pluginSettings map (pure, v0.12.0+).
		* Sequential merges are additive: each call spreads the map it was GIVEN,
		* so building from the latest optimistic map keeps earlier keys intact
		* (two same-tick writes must not drop each other).
		*/
		function mergePluginSetting(pluginSettings, descriptorId, key, value) {
			return {
				...pluginSettings,
				[descriptorId]: {
					...pluginSettings[descriptorId] ?? {},
					[key]: value
				}
			};
		}
		/**
		* Render a custom settings panel (`settings.render`) with error containment:
		* a throwing panel shows an inline error line instead of breaking the whole
		* settings page.
		*/
		function SettingsRender(props) {
			let content;
			try {
				content = props.render(props.renderProps);
			} catch (error) {
				content = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: SideCardSection_module_css_default.error,
					role: "alert",
					children: [
						t("settingsSaveFailed"),
						" ",
						error instanceof Error ? error.message : String(error)
					]
				});
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: content });
		}
		/**
		* The custom switch: a real checkbox (hidden, native semantics and focus)
		* driving a styled track/thumb. Used by the general toggle rows and the
		* secondary settings popup rows.
		*/
		function Switch(props) {
			const { checked, onChange, label } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
				className: SideCardSection_module_css_default.switch,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
					type: "checkbox",
					className: SideCardSection_module_css_default.switchInput,
					checked,
					"aria-label": label,
					onChange: (event) => {
						onChange(event.currentTarget.checked);
					}
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: SideCardSection_module_css_default.switchTrack,
					"aria-hidden": "true",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: SideCardSection_module_css_default.switchThumb })
				})]
			});
		}
		/**
		* The body of a feature's secondary settings popup: one row (title/desc +
		* control) per declared setting. Switches render the custom switch; text and
		* number rows render a free-form / numeric input committed on blur/Enter
		* (clamped to the declared min/max). Extracted so the rows are testable
		* without opening the Modal (the Modal portal renders only while open).
		*/
		function FeatureSettingsRows(props) {
			const { toggles, prefs, onToggle, onCommit, onSelectValue, valueSource } = props;
			const read = valueSource ?? ((key) => prefs[key]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: SideCardSection_module_css_default.popupRows,
				children: toggles.map((toggle) => {
					const title = textOf(toggle.title);
					if (toggle.type === "select") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SelectRow, {
						toggle,
						title,
						value: read(toggle.key),
						onSelectValue
					}, toggle.key);
					if ((toggle.type ?? "switch") === "switch") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: SideCardSection_module_css_default.popupRow,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: SideCardSection_module_css_default.rowText,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: SideCardSection_module_css_default.title,
								children: title
							}), textOf(toggle.desc) !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: SideCardSection_module_css_default.desc,
								children: textOf(toggle.desc)
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Switch, {
							label: title,
							checked: read(toggle.key) === true,
							onChange: (next) => {
								onToggle(toggle, next);
							}
						})]
					}, toggle.key);
					const value = String(read(toggle.key) ?? "");
					return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TypedRow, {
						toggle,
						title,
						value,
						onCommit
					}, `${toggle.key}:${value}`);
				})
			});
		}
		/**
		* One text/number row: a controlled input whose draft is local state,
		* committed on blur/Enter through the parent's onCommit. The parent's
		* canonical return is adopted (clamped numbers, stored value for invalid
		* input); a `unit` suffix renders after the input (e.g. 'px').
		*/
		function TypedRow(props) {
			const { toggle, title, value, onCommit } = props;
			const [draft, setDraft] = (0, react.useState)(value);
			const commit = () => {
				const canonical = onCommit?.(toggle, draft) ?? draft;
				setDraft(canonical);
			};
			const number = toggle.type === "number";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: SideCardSection_module_css_default.popupRow,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: SideCardSection_module_css_default.rowText,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: SideCardSection_module_css_default.title,
						children: title
					}), textOf(toggle.desc) !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: SideCardSection_module_css_default.desc,
						children: textOf(toggle.desc)
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: SideCardSection_module_css_default.control,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
						type: number ? "number" : "text",
						className: number ? SideCardSection_module_css_default.typedInputNumber : SideCardSection_module_css_default.typedInput,
						value: draft,
						min: toggle.min,
						max: toggle.max,
						step: 1,
						placeholder: toggle.placeholder,
						"aria-label": title,
						onChange: (event) => {
							setDraft(event.currentTarget.value);
						},
						onBlur: commit,
						onKeyDown: (event) => {
							if (event.key === "Enter") event.currentTarget.blur();
						}
					}), toggle.unit !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: SideCardSection_module_css_default.suffix,
						children: toggle.unit
					})]
				})]
			});
		}
		/**
		* The multi-line custom-CSS input (scheme `custom`): a monospace textarea
		* whose draft is local state, committed on blur or Cmd/Ctrl+Enter through
		* the parent's handler. Keyed by the stored value so an external commit
		* remounts it with the canonical text (same pattern as TypedRow).
		*/
		function CssDraft(props) {
			const { value, onCommit, label, placeholder } = props;
			const [draft, setDraft] = (0, react.useState)(value);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
				className: SideCardSection_module_css_default.cssTextArea,
				rows: 6,
				value: draft,
				placeholder,
				"aria-label": label,
				spellCheck: false,
				onChange: (event) => {
					setDraft(event.currentTarget.value);
				},
				onBlur: () => {
					onCommit(draft);
				},
				onKeyDown: (event) => {
					if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) event.currentTarget.blur();
				}
			});
		}
		/**
		* The reusable dropdown — the primitives Menu, NOT a native <select>: a
		* closed anchor button (picked option text + chevron) opening one Menu item
		* per option (big-icon cards when any option carries an icon). Single-pick
		* commits the option's value and closes; `multi` toggles membership and
		* commits the picked values as an array (in options order), staying open.
		* Shared by the declarative select rows (SelectRow) and the title-bar
		* scheme dropdown on the General row.
		*/
		function SelectMenu(props) {
			const { label, value, options, multi, onSelect, placeholder } = props;
			const [open, setOpen] = (0, react.useState)(false);
			const hasIcons = options.some((option) => option.icon !== void 0);
			const picked = multi ? Array.isArray(value) ? value : [] : [value];
			const selected = options.filter((option) => picked.includes(option.value));
			/** Commit one picked option (toggle semantics under multi). */
			const pick = (index) => {
				const option = options[index];
				if (option === void 0) return;
				if (!multi) {
					onSelect(option.value);
					setOpen(false);
					return;
				}
				const current = Array.isArray(value) ? [...value] : [];
				const at = current.indexOf(option.value);
				if (at >= 0) current.splice(at, 1);
				else current.push(option.value);
				onSelect(options.filter((o) => current.includes(o.value)).map((o) => o.value));
			};
			const anchor = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: SideCardSection_module_css_default.selectAnchor,
				"aria-label": label,
				"aria-haspopup": "listbox",
				"aria-expanded": open,
				onClick: () => {
					setOpen((now) => !now);
				},
				children: [
					!multi && hasIcons && selected[0] !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: SideCardSection_module_css_default.selectAnchorIcon,
						children: iconOf(selected[0].icon, 16)
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: SideCardSection_module_css_default.selectAnchorText,
						children: selected.length === 0 ? placeholder ?? "—" : selected.map((option) => textOf(option.title)).join(", ")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { size: 12 })
				]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
				open,
				anchor,
				items: options.map((option, index) => ({
					id: String(index),
					label: hasIcons ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: SideCardSection_module_css_default.selectOption,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: SideCardSection_module_css_default.selectOptionIcon,
							children: iconOf(option.icon, 24)
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: SideCardSection_module_css_default.selectOptionText,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: SideCardSection_module_css_default.title,
								children: textOf(option.title)
							}), textOf(option.desc) !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: SideCardSection_module_css_default.desc,
								children: textOf(option.desc)
							})]
						})]
					}) : textOf(option.title)
				})),
				selectedId: !multi && selected[0] !== void 0 ? String(options.indexOf(selected[0])) : void 0,
				selectedIds: multi ? selected.map((option) => String(options.indexOf(option))) : void 0,
				onSelect: (id) => {
					pick(Number(id));
				},
				onClose: () => {
					setOpen(false);
				},
				portal: true
			});
		}
		/**
		* One select row: a dropdown over the toggle's declared `options` (the
		* shared SelectMenu). When any option carries an icon, the dropdown renders
		* big-icon option cards (icon + title + desc) and the closed anchor shows
		* the selected option's icon as well; without icons both are a single line
		* of text. Single-pick commits the option's value and closes; `multi`
		* toggles membership, commits the picked values as an array (in options
		* order), and stays open.
		*/
		function SelectRow(props) {
			const { toggle, title, value, onSelectValue } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: SideCardSection_module_css_default.popupRow,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: SideCardSection_module_css_default.rowText,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: SideCardSection_module_css_default.title,
						children: title
					}), textOf(toggle.desc) !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: SideCardSection_module_css_default.desc,
						children: textOf(toggle.desc)
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: SideCardSection_module_css_default.control,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SelectMenu, {
						label: title,
						value,
						options: toggle.options ?? [],
						multi: toggle.multi === true,
						onSelect: (next) => {
							onSelectValue?.(toggle, next);
						}
					})
				})]
			});
		}
		/**
		* The secondary settings popup body of one feature (tab or viewer):
		* - the host-prefs `toggles` rows, then the plugin-owned `pluginToggles`
		*   rows (their values live in `pluginSettings[feature.id]`, projected onto
		*   the prefs face so the shared row renderer reads them);
		* - `settings.render` (custom panel) AFTER those rows when declared — the
		*   custom panel is an extension of the row list, not a replacement, so a
		*   feature can keep its declarative rows (e.g. the editor's
		*   open-behavior picker) and still ship a custom configuration area.
		*/
		function SettingsBody(props) {
			const { feature, prefs, store, service, onToggle, onCommit, onSelectValue, onPluginToggle, onPluginCommit, onPluginSelectValue, onPluginWrite, onClose } = props;
			const render = feature.settings?.render;
			const toggles = feature.settings?.toggles ?? [];
			const pluginToggles = feature.settings?.pluginToggles ?? [];
			if (render === void 0 && toggles.length === 0 && pluginToggles.length === 0) return null;
			const pluginBlob = prefs.pluginSettings[feature.id] ?? {};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [(toggles.length > 0 || pluginToggles.length > 0) && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: SideCardSection_module_css_default.popupRows,
				children: [toggles.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FeatureSettingsRows, {
					toggles,
					prefs,
					onToggle,
					onCommit,
					onSelectValue
				}), pluginToggles.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FeatureSettingsRows, {
					toggles: pluginToggles,
					prefs,
					onToggle: onPluginToggle,
					onCommit: onPluginCommit,
					onSelectValue: onPluginSelectValue,
					valueSource: (key) => pluginBlob[key]
				})]
			}), render !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingsRender, {
				render,
				renderProps: {
					store,
					service,
					prefs,
					pluginSettings: prefs.pluginSettings[feature.id] ?? {},
					updatePluginSetting: onPluginWrite,
					close: onClose
				}
			})] });
		}
		/**
		* Render the Side card preferences section.
		* @param props - composed slot props (runtime share + injected store/service).
		* @returns the section element tree.
		*/
		function SideCardSection({ store, service }) {
			const [prefs, setPrefs] = (0, react.useState)(() => store.getPrefs());
			const [widthDraft, setWidthDraft] = (0, react.useState)(String(store.getPrefs().defaultWidthPercent));
			const [error, setError] = (0, react.useState)(null);
			const [settingsFor, setSettingsFor] = (0, react.useState)(null);
			const [stripSettingsOpen, setStripSettingsOpen] = (0, react.useState)(false);
			const detectedEnv = (0, react.useMemo)(() => parseDesktopEnv(), []);
			const [addPluginsOpen, setAddPluginsOpen] = (0, react.useState)(null);
			const optimisticRef = (0, react.useRef)(prefs);
			(0, react.useEffect)(() => {
				optimisticRef.current = prefs;
			}, [prefs]);
			const [tabs, setTabs] = (0, react.useState)(() => [...service.getTabs()].sort(tabOrder));
			const [viewers, setViewers] = (0, react.useState)(() => [...service.getFileViewers()].sort(viewerOrder));
			(0, react.useEffect)(() => service.subscribe(() => {
				setTabs([...service.getTabs()].sort(tabOrder));
				setViewers([...service.getFileViewers()].sort(viewerOrder));
			}), [service]);
			const revisionRef = (0, react.useRef)(void 0);
			const dirtyRef = (0, react.useRef)(false);
			const inFlightRef = (0, react.useRef)(Promise.resolve());
			(0, react.useEffect)(() => {
				let cancelled = false;
				api.settingsGet().then((view) => {
					if (cancelled) return;
					revisionRef.current = view.revision;
					if (dirtyRef.current) return;
					const next = parsePrefs(view.value);
					setPrefs(next);
					setWidthDraft(String(next.defaultWidthPercent));
				}).catch(() => {});
				return () => {
					cancelled = true;
				};
			}, []);
			/** Persist one patch through the settings route (serialized, revision-guarded). */
			const commit = (patch) => {
				dirtyRef.current = true;
				const run = inFlightRef.current.then(async () => {
					const view = await api.settingsUpdate({ ...patch }, revisionRef.current);
					const next = parsePrefs(view.value);
					revisionRef.current = view.revision;
					store.setPrefs(next);
					return next;
				});
				inFlightRef.current = run.then(() => void 0, () => void 0);
				return run.then((next) => ({
					ok: true,
					prefs: next
				}), (caught) => {
					setError(messageOf(caught));
					return {
						ok: false,
						prefs
					};
				});
			};
			/** Settle one commit: success adopts the server values, failure reverts. */
			const applyOutcome = (previous, outcome) => {
				const settled = outcome.ok ? outcome.prefs : previous;
				setPrefs(settled);
				setWidthDraft(String(settled.defaultWidthPercent));
			};
			/** Optimistically apply one pref patch, then commit (revert on failure). */
			const applyPref = (patch) => {
				const previous = optimisticRef.current;
				const next = {
					...previous,
					...patch
				};
				optimisticRef.current = next;
				setPrefs(next);
				setError(null);
				commit(patch).then((outcome) => applyOutcome(previous, outcome));
			};
			const onToggle = (next) => {
				applyPref({ openByDefault: next });
			};
			/** Flip one per-tab enable switch (merge into the tabsEnabled map). */
			const onToggleTab = (id, next) => {
				applyPref({ tabsEnabled: {
					...optimisticRef.current.tabsEnabled,
					[id]: next
				} });
			};
			/** Flip one per-viewer enable switch (merge into the viewersEnabled map). */
			const onToggleViewer = (id, next) => {
				applyPref({ viewersEnabled: {
					...optimisticRef.current.viewersEnabled,
					[id]: next
				} });
			};
			/** Flip one declaratively-declared toggle (a SidebarPrefs boolean field). */
			const onToggleSetting = (toggle, next) => {
				applyPref({ [toggle.key]: next });
			};
			/** Commit one declaratively-declared select row (the option's value, or an
			*  array of values under `multi`). */
			const onSelectSetting = (toggle, next) => {
				applyPref({ [toggle.key]: next });
			};
			/**
			* Commit one declaratively-declared text/number row. Numbers are parsed
			* and clamped to the toggle's declared min/max (an unparsable input falls
			* back to the CURRENT stored value, mirroring the width row); text rows
			* persist as-is (empty is meaningful, e.g. the theme-default font).
			* Returns the canonical value the row should display.
			*/
			const onCommitSetting = (toggle, raw) => {
				if (toggle.type === "number") {
					const parsed = Number(raw);
					const fallback = String(prefs[toggle.key] ?? "");
					if (!Number.isFinite(parsed)) return fallback;
					let clamped = Math.round(parsed);
					if (toggle.min !== void 0) clamped = Math.max(toggle.min, clamped);
					if (toggle.max !== void 0) clamped = Math.min(toggle.max, clamped);
					applyPref({ [toggle.key]: clamped });
					return String(clamped);
				}
				applyPref({ [toggle.key]: raw });
				return raw;
			};
			/**
			* Pick the title-bar / shell compatibility scheme. Mirrors the legacy
			* `titleBarCompat` flag (true = anything but the conservative auto) so
			* documents stay readable by older plugin versions.
			*/
			/**
			* Pick the title-bar / shell compatibility scheme from the dropdown. The
			* option values are `auto` | `web` | `custom` | `preset:<id>`; selecting
			* a preset stores both the scheme and its id. Mirrors the legacy
			* `titleBarCompat` flag (true for preset/custom) so documents stay
			* readable by older plugin versions.
			*/
			const onSchemeSelect = (value) => {
				if (typeof value !== "string") return;
				if (value === "auto" || value === "web" || value === "custom") {
					applyPref({
						titleBarScheme: value,
						titleBarCompat: value === "custom"
					});
					return;
				}
				if (value.startsWith("preset:") && getShellPreset(value.slice(7)) !== void 0) applyPref({
					titleBarScheme: "preset",
					titleBarPresetId: value.slice(7),
					titleBarCompat: true
				});
			};
			/** Commit the free-form custom CSS (scheme `custom`). */
			const commitCustomCss = (raw) => {
				applyPref({ customCss: raw });
			};
			/** Persist one plugin-owned setting of one descriptor (merged into the pluginSettings blob). */
			const applyPluginSetting = (descriptorId, key, value) => {
				applyPref({ pluginSettings: mergePluginSetting(optimisticRef.current.pluginSettings, descriptorId, key, value) });
			};
			/** Flip one plugin-owned switch row (same row shape, plugin-scoped key). */
			const onPluginToggle = (descriptorId, toggle, next) => {
				applyPluginSetting(descriptorId, toggle.key, next);
			};
			/** Commit one plugin-owned text/number row (clamped like the host rows). */
			const onPluginCommitSetting = (descriptorId, toggle, raw) => {
				if (toggle.type === "number") {
					const parsed = Number(raw);
					const blob = prefs.pluginSettings[descriptorId] ?? {};
					const fallback = String(blob[toggle.key] ?? "");
					if (!Number.isFinite(parsed)) return fallback;
					let clamped = Math.round(parsed);
					if (toggle.min !== void 0) clamped = Math.max(toggle.min, clamped);
					if (toggle.max !== void 0) clamped = Math.min(toggle.max, clamped);
					applyPluginSetting(descriptorId, toggle.key, clamped);
					return String(clamped);
				}
				applyPluginSetting(descriptorId, toggle.key, raw);
				return raw;
			};
			const commitWidth = () => {
				const parsed = Number(widthDraft);
				if (!Number.isFinite(parsed)) {
					setWidthDraft(String(prefs.defaultWidthPercent));
					return;
				}
				const clamped = clampWidthPercent(parsed);
				const previous = prefs;
				setPrefs({
					...previous,
					defaultWidthPercent: clamped
				});
				setWidthDraft(String(clamped));
				setError(null);
				commit({ defaultWidthPercent: clamped }).then((outcome) => applyOutcome(previous, outcome));
			};
			/**
			* One SMALL toggle card for the responsive inventory grid: the card's main
			* area is the switch (click to flips, visual state IS the state), the icon
			* sits in a rounded chip, the check badge pins to the far right, and a
			* feature that declares related settings gets a labeled SETTINGS STRIP
			* across the card's bottom edge (gear icon + text) opening its settings
			* popup — discoverable at rest, not a hover-only ghost corner button.
			*/
			const renderCard = (props) => {
				const hasSettings = props.onOpenSettings !== void 0;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: clsx(SideCardSection_module_css_default.card, props.enabled && SideCardSection_module_css_default.cardOn),
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: SideCardSection_module_css_default.cardMain,
						"aria-pressed": props.enabled,
						title: props.desc,
						onClick: () => {
							props.onToggle(!props.enabled);
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: SideCardSection_module_css_default.cardTop,
							children: [
								props.icon !== null && props.icon !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: SideCardSection_module_css_default.cardIconChip,
									children: props.icon
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: SideCardSection_module_css_default.cardTitle,
									children: props.title
								}),
								props.enabled && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: SideCardSection_module_css_default.cardSwitch,
									"aria-hidden": "true",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: SideCardSection_module_css_default.cardSwitchTrack,
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: SideCardSection_module_css_default.cardSwitchThumb })
									})
								})
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: SideCardSection_module_css_default.cardDesc,
							children: props.desc
						})]
					}), hasSettings && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: SideCardSection_module_css_default.cardSettings,
						"aria-label": `${props.title} ${t("settingsPopup")}`,
						onClick: props.onOpenSettings,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSettingsOutline16, { size: 12 }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("settingsPopup") })]
					})]
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: SideCardSection_module_css_default.section,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: SideCardSection_module_css_default.intro,
						children: t("settingsIntro")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: SideCardSection_module_css_default.versionBadge,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: SideCardSection_module_css_default.versionBadgeName,
							children: "DSH-better-sidebar"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: SideCardSection_module_css_default.versionBadgeTag,
							children: ["v", service.version]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: SideCardSection_module_css_default.group,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: SideCardSection_module_css_default.groupHeading,
								children: t("settingsGeneralTitle")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: SideCardSection_module_css_default.row,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: SideCardSection_module_css_default.rowText,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: SideCardSection_module_css_default.title,
										children: t("settingsOpenTitle")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: SideCardSection_module_css_default.desc,
										children: t("settingsOpenDesc")
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Switch, {
									label: t("settingsOpenTitle"),
									checked: prefs.openByDefault,
									onChange: onToggle
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: SideCardSection_module_css_default.row,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: SideCardSection_module_css_default.rowText,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: SideCardSection_module_css_default.title,
										children: t("settingsWidthTitle")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: SideCardSection_module_css_default.desc,
										children: t("settingsWidthDesc")
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: SideCardSection_module_css_default.control,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
										type: "number",
										className: SideCardSection_module_css_default.percentInput,
										value: widthDraft,
										min: 20,
										max: 60,
										step: 1,
										"aria-label": t("settingsWidthTitle"),
										onChange: (event) => {
											setWidthDraft(event.currentTarget.value);
										},
										onBlur: commitWidth,
										onKeyDown: (event) => {
											if (event.key === "Enter") event.currentTarget.blur();
										}
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: SideCardSection_module_css_default.suffix,
										children: t("settingsWidthSuffix")
									})]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: SideCardSection_module_css_default.row,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: SideCardSection_module_css_default.rowText,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: SideCardSection_module_css_default.title,
										children: t("settingsOpenPathTitle")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: SideCardSection_module_css_default.desc,
										children: t("settingsOpenPathDesc")
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Switch, {
									label: t("settingsOpenPathTitle"),
									checked: prefs.interceptOpenPath,
									onChange: (next) => {
										applyPref({ interceptOpenPath: next });
									}
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: SideCardSection_module_css_default.row,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: SideCardSection_module_css_default.rowText,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: SideCardSection_module_css_default.title,
										children: t("settingsTitleBarTitle")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: SideCardSection_module_css_default.desc,
										children: t("settingsTitleBarDesc")
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: SideCardSection_module_css_default.control,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SelectMenu, {
										label: t("settingsTitleBarTitle"),
										value: titleBarSchemeValue(prefs),
										options: [
											{
												value: "auto",
												title: t("settingsSchemeAutoTitle"),
												desc: t("settingsSchemeAutoDesc")
											},
											{
												value: "web",
												title: t("settingsSchemeWebTitle"),
												desc: t("settingsSchemeWebDesc")
											},
											...getShellPresets().map((preset) => ({
												value: `preset:${preset.id}`,
												title: preset.title,
												desc: preset.detect?.(detectedEnv) === true ? `${preset.desc}（${t("settingsSchemeDetectedSuffix")}）` : preset.desc
											})),
											{
												value: "custom",
												title: t("settingsSchemeCustomTitle"),
												desc: t("settingsSchemeCustomDesc")
											}
										],
										onSelect: onSchemeSelect
									}), prefs.titleBarScheme === "custom" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: SideCardSection_module_css_default.rowGear,
										"aria-label": `${t("settingsTitleBarTitle")} ${t("settingsPopup")}`,
										title: t("settingsPopup"),
										onClick: () => {
											setStripSettingsOpen(true);
										},
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSettingsOutline16, { size: 14 })
									})]
								})]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: SideCardSection_module_css_default.group,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: SideCardSection_module_css_default.groupHeading,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("settingsTabsTitle") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: SideCardSection_module_css_default.count,
								children: tabs.length
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: SideCardSection_module_css_default.grid,
							children: [tabs.map((tab) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react.Fragment, { children: renderCard({
								title: textOf(tab.title),
								desc: tab.id,
								icon: iconOf(tab.icon, 16),
								enabled: prefs.tabsEnabled[tab.id] !== false,
								onToggle: (next) => {
									onToggleTab(tab.id, next);
								},
								onOpenSettings: prefs.tabsEnabled[tab.id] !== false && hasSettings(tab) ? () => {
									setSettingsFor(tab);
								} : void 0
							}) }, tab.id)), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: clsx(SideCardSection_module_css_default.card, SideCardSection_module_css_default.addCard),
								onClick: () => {
									setAddPluginsOpen("tab");
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: SideCardSection_module_css_default.cardTop,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: SideCardSection_module_css_default.cardIconChip,
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16, { size: 16 })
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: SideCardSection_module_css_default.cardTitle,
										children: t("addPluginsTabCard")
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: SideCardSection_module_css_default.cardDesc,
									children: t("addPluginsTabCardDesc")
								})]
							})]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: SideCardSection_module_css_default.group,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: SideCardSection_module_css_default.groupHeading,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("settingsViewersTitle") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: SideCardSection_module_css_default.count,
								children: viewers.length
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: SideCardSection_module_css_default.grid,
							children: [viewers.map((viewer) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react.Fragment, { children: renderCard({
								title: textOf(viewer.title) || viewer.id,
								desc: viewer.exts.length === 0 ? t("settingsViewerCatchAll") : viewer.exts.join(" · "),
								icon: iconOf(viewer.icon, 16),
								enabled: prefs.viewersEnabled[viewer.id] !== false,
								onToggle: (next) => {
									onToggleViewer(viewer.id, next);
								},
								onOpenSettings: prefs.viewersEnabled[viewer.id] !== false && hasSettings(viewer) ? () => {
									setSettingsFor(viewer);
								} : void 0
							}) }, viewer.id)), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: clsx(SideCardSection_module_css_default.card, SideCardSection_module_css_default.addCard),
								onClick: () => {
									setAddPluginsOpen("viewer");
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: SideCardSection_module_css_default.cardTop,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: SideCardSection_module_css_default.cardIconChip,
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16, { size: 16 })
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: SideCardSection_module_css_default.cardTitle,
										children: t("addPluginsViewerCard")
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: SideCardSection_module_css_default.cardDesc,
									children: t("addPluginsViewerCardDesc")
								})]
							})]
						})]
					}),
					settingsFor !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
						open: true,
						onClose: () => {
							setSettingsFor(null);
						},
						title: featureNameOf(settingsFor),
						description: t("settingsPopupDesc", { feature: featureNameOf(settingsFor) }),
						closeLabel: t("close"),
						className: SideCardSection_module_css_default.popupDialog,
						footer: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: SideCardSection_module_css_default.done,
							onClick: () => {
								setSettingsFor(null);
							},
							children: t("settingsDone")
						}),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingsBody, {
							feature: settingsFor,
							prefs,
							onToggle: onToggleSetting,
							onCommit: onCommitSetting,
							onSelectValue: onSelectSetting,
							onPluginToggle: (toggle, next) => {
								onPluginToggle(settingsFor.id, toggle, next);
							},
							onPluginCommit: (toggle, raw) => onPluginCommitSetting(settingsFor.id, toggle, raw),
							onPluginSelectValue: (toggle, next) => {
								applyPluginSetting(settingsFor.id, toggle.key, next);
							},
							onPluginWrite: (key, value) => {
								applyPluginSetting(settingsFor.id, key, value);
							},
							onClose: () => {
								setSettingsFor(null);
							},
							store,
							service
						})
					}),
					stripSettingsOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
						open: true,
						onClose: () => {
							setStripSettingsOpen(false);
						},
						title: t("settingsTitleBarTitle"),
						description: t("settingsPopupDesc", { feature: t("settingsTitleBarTitle") }),
						closeLabel: t("close"),
						className: SideCardSection_module_css_default.popupDialog,
						footer: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: SideCardSection_module_css_default.done,
							onClick: () => {
								setStripSettingsOpen(false);
							},
							children: t("settingsDone")
						}),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: SideCardSection_module_css_default.popupRows,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FeatureSettingsRows, {
								toggles: [{
									key: "titleBarStripPx",
									type: "number",
									title: () => t("settingsTitleBarStripTitle"),
									desc: () => t("settingsTitleBarStripDesc"),
									min: 0,
									max: 120,
									unit: "px"
								}],
								prefs,
								onToggle: onToggleSetting,
								onCommit: onCommitSetting
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CssDraft, {
								value: prefs.customCss,
								label: t("settingsCustomCssTitle"),
								placeholder: t("settingsCustomCssPlaceholder"),
								onCommit: commitCustomCss
							}, prefs.customCss)]
						})
					}),
					addPluginsOpen !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AddPluginModal, {
						service,
						onClose: () => {
							setAddPluginsOpen(null);
						},
						kind: addPluginsOpen
					}),
					error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: SideCardSection_module_css_default.error,
						role: "alert",
						children: error
					})
				]
			});
		}
		//#endregion
		//#region \0dsh-css:C:\Users\delinger\Desktop\dsh\dsh-desktop\assets\plugins\dsh-better-sidebar\src\client\layout.css.mjs
		const css = "/**\r\n * Layout push: when a panel is open it OCCUPIES the layout instead of\r\n * floating over it — the app shell (#root, the AppFrame three-column grid)\r\n * gives up space. Only the center column is flexible (1fr), so the right\r\n * panel's width squeeze (margin-right on #root) lands exactly on the\r\n * conversation output and the input bar, like a VSCode sidebar.\r\n *\r\n * The width rides `calc(100% - var(...))` instead of a bare margin on a\r\n * full-width box: some desktop shells (DSH Desktop, #208) set #root to\r\n * width:100%, where a margin would overflow the viewport additively —\r\n * the calc keeps the box at exactly 100% minus the push in every shell.\r\n * Width and margin transition in lockstep (same variable, same duration\r\n * and easing), so expand/collapse animates the content width exactly as\r\n * the bare-margin version did.\r\n *\r\n * The bottom panel squeezes ONLY the center column — it must not cover the\r\n * app's own left sidebar or the right panel. The anchor is the frame's\r\n * center grid item via its stable data attribute ([data-pane=\"conversation\"]\r\n * on the centerCol inside [data-dsh-frame]), not a positional path: the\r\n * frame's child order also contains an overlay layer and drag handles\r\n * (verified against a live DSH 0.1.x page), so nth-child is brittle. A\r\n * stretched grid item shrinks by its margins, so the conversation content\r\n * (output + input bar) lifts without touching the sidebars.\r\n *\r\n * The sizes ride CSS variables updated by the Sidebar shell (0 while\r\n * collapsed); expand/collapse animates both the margins and the panel\r\n * slides on the same theme duration. Drags disable the transition so the\r\n * layout tracks the pointer.\r\n */\r\n#root {\r\n  margin-right: var(--dsh-sidebar-width, 0px);\r\n  width: calc(100% - var(--dsh-sidebar-width, 0px));\r\n  transition:\r\n    margin-right var(--ds-transition-duration-slow) var(--ds-ease-in-out),\r\n    width var(--ds-transition-duration-slow) var(--ds-ease-in-out);\r\n}\r\n\r\n/* The AppFrame's center column, anchored by data attributes (see above).\r\n   Composite selector: DSH 0.1.x versions name the center grid item\r\n   `[data-pane=\"conversation\"]`, while rc.8-era shells put a\r\n   `[data-slot=\"conversation\"]` child inside it — both selectors resolve to\r\n   the SAME element on live pages (verified), and keeping both future-proofs\r\n   the rule against a host rename without touching shell-specific markup. */\r\n#root [data-dsh-frame] > [data-pane=\"conversation\"],\r\n#root :has(> [data-slot=\"conversation\"]) {\r\n  margin-bottom: var(--dsh-sidebar-height, 0px);\r\n  transition: margin-bottom var(--ds-transition-duration-slow) var(--ds-ease-in-out);\r\n}\r\n\r\n/* When the sidebar is collapsed, the toggle cluster reclaims the top-right\r\n   corner. Push the DSH session header's right padding out so its right-aligned\r\n   utilities (the \"Session log\" download capsule) yield the corner instead of\r\n   hiding under the cluster. The header default right-pads 28px; the 2-button\r\n   cluster spans right 10→70px, so 78px clears it with an 8px gap. Anchor on\r\n   the header's slot host wrapper ([data-slot=\"conversation.session.header\"])\r\n   rather than a positional path: DSH 0.1.x nests the header several levels\r\n   under the center column. The Sidebar shell toggles the body attribute with\r\n   the panel open state. */\r\nbody[data-dsh-sidebar-collapsed] [data-slot=\"conversation.session.header\"] > header {\r\n  padding-right: 78px;\r\n}\r\n\r\nbody[data-dsh-sidebar-dragging] #root,\r\nbody[data-dsh-sidebar-dragging] #root [data-dsh-frame] > [data-pane=\"conversation\"],\r\nbody[data-dsh-sidebar-dragging] #root :has(> [data-slot=\"conversation\"]) {\r\n  transition: none;\r\n}\r\n\r\n/* DSH 0.1.x gives external settings sections a generic gear and exposes no\r\n   icon field in the settings.section contract. settings-nav-icon.ts marks\r\n   only this plugin's localized row; render the requested Lucide\r\n   gallery-horizontal-end SVG as a currentColor mask so it follows the native\r\n   nav hover/active colors without changing the shell's 16px icon rhythm. */\r\n[data-dsh-better-sidebar-settings-nav] > svg:first-child {\r\n  display: none;\r\n}\r\n\r\n[data-dsh-better-sidebar-settings-nav]::before {\r\n  content: '';\r\n  flex: none;\r\n  width: 16px;\r\n  height: 16px;\r\n  background: currentColor;\r\n  -webkit-mask: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M2 7v10'/%3E%3Cpath d='M6 5v14'/%3E%3Crect width='12' height='18' x='10' y='3' rx='2'/%3E%3C/svg%3E\") center / contain no-repeat;\r\n  mask: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M2 7v10'/%3E%3Cpath d='M6 5v14'/%3E%3Crect width='12' height='18' x='10' y='3' rx='2'/%3E%3C/svg%3E\") center / contain no-repeat;\r\n}\r\n\r\n@media (prefers-reduced-motion: reduce) {\r\n  #root,\r\n  #root [data-dsh-frame] > [data-pane=\"conversation\"],\r\n  #root :has(> [data-slot=\"conversation\"]) {\r\n    transition: none;\r\n  }\r\n}\r\n";
		const tagId = "dsh-better-sidebar/layout.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-better-sidebar";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		//#endregion
		//#region src/client/index.tsx
		/**
		* Client half of dsh-better-sidebar: resolves the user's "Side card"
		* preferences through the plugin's own fenced settings route, mounts the
		* right sidebar portal (inside an error boundary so a rendering failure
		* shows an error strip instead of a blank panel), registers the turn-tail
		* interception, and contributes the Side card settings section to the DSH
		* Settings shell. Requires the runtime's slots and sessions services; the
		* bundle itself is a module-table consumer only (react + ui-primitives +
		* xterm, all provided or inlined).
		*/
		/** Services required before mounting (provided by the client runtime; the
		*  locale service backs the sidebar's copy — see locales.ts). `modules`
		*  (rc.8+) is the client module system the chunk loader resolves its
		*  externals through — Cordis guards service access without inject. */
		const inject = [
			"slots",
			"sessions",
			"connection",
			"workspaces",
			"locale",
			"modules"
		];
		/**
		* Error boundary over the sidebar tree (root scope): a render error in the
		* sidebar SHELL itself must never blank the page silently — the shared
		* RenderBoundary shows a dismissible error strip and logs the stack. The
		* per-tab scope (Sidebar.tsx) catches viewer/editor crashes first; this root
		* boundary stays as the last resort for Workbench/shell errors.
		*/
		/**
		* Client plugin body.
		* @param ctx - the client cordis context (slots, sessions).
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
			}, "dsh-better-sidebar: dictionaries");
			const sidebarStore = createSidebarStore();
			const service = createBetterSidebarService(sidebarStore);
			ctx.provide("betterSidebar", service);
			const fallbackTitle = t("terminal");
			let terminalTitle = fallbackTitle;
			api.shellGet().then(({ name }) => {
				terminalTitle = name;
				const snapshot = service.getSnapshot();
				if (snapshot.state === void 0) return;
				const tabs = allLeaves(snapshot.state.splits).concat(allLeaves(snapshot.state.bottomSplits)).flatMap((leaf) => leaf.tabs);
				for (const tab of tabs) if (tab.type === "terminal" && !isAgentTabId(tab.id) && tab.title === fallbackTitle) service.updateTab(tab.id, { title: name });
			}).catch(() => {});
			ctx.effect(() => registerBuiltins(ctx, service, { terminalTitle: () => terminalTitle }), "dsh-better-sidebar: register built-in tabs and viewers");
			const fail = (phase, error) => {
				console.error(`[dsh-better-sidebar] ${phase} error:`, error);
				try {
					const bar = document.createElement("div");
					bar.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:2147483000;max-width:70vw;padding:8px 12px;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:#f2a1a1;background:#1b1b22;border:1px solid #f2a1a1;border-radius:8px;white-space:pre-wrap";
					bar.textContent = `[dsh-better-sidebar] ${phase} error: ${error instanceof Error ? error.message : String(error)}`;
					document.body.appendChild(bar);
				} catch {}
			};
			try {
				setChunkModuleSystem(ctx.modules);
				revalidateChunksOnReactivate();
				ctx.effect(() => {
					let disposed = false;
					let root;
					let host;
					let mounted = false;
					let bodyObserver;
					let hostCheckFrame = null;
					const unmount = () => {
						if (!mounted) return;
						mounted = false;
						bodyObserver?.disconnect();
						bodyObserver = void 0;
						if (hostCheckFrame !== null) {
							cancelAnimationFrame(hostCheckFrame);
							hostCheckFrame = null;
						}
						root?.unmount();
						root = void 0;
						host?.remove();
						host = void 0;
					};
					/** Re-attach the host if the page (a desktop shell wrapper, SPA
					*  navigation, …) ever removes it from <body>. Cheap: childList only,
					*  no subtree, no attribute filtering. */
					const guardAnchor = () => {
						if (bodyObserver !== void 0) return;
						bodyObserver = new MutationObserver(() => {
							if (host !== void 0 && !document.body.contains(host)) document.body.appendChild(host);
						});
						bodyObserver.observe(document.body, { childList: true });
					};
					/** One-shot geometry self-check: if the host page transforms
					*  <html>/<body> itself (exotic shells), a fixed panel host would
					*  track the transformed box instead of the viewport. Flip the
					*  degraded mode and pin the host to the viewport every frame until
					*  the ancestor transform is actually gone. The normal path (no
					*  page-level transform) never runs the sync loop. */
					const scheduleHostCheck = () => {
						hostCheckFrame ??= requestAnimationFrame(() => {
							hostCheckFrame = null;
							const layer = host?.querySelector("[data-dsh-panel-host]");
							if (layer === null || layer === void 0) return;
							const rect = layer.getBoundingClientRect();
							if (!(Math.abs(rect.left) > 8 || Math.abs(rect.top) > 8 || Math.abs(rect.width - window.innerWidth) > 8 || Math.abs(rect.height - window.innerHeight) > 8)) {
								layer.removeAttribute("data-dsh-panel-host-degraded");
								layer.style.transform = "";
								return;
							}
							layer.setAttribute("data-dsh-panel-host-degraded", "");
							console.warn("[dsh-better-sidebar] panel host geometry mismatch — a page-level transform was detected; using degraded viewport sync");
							let applied = {
								x: 0,
								y: 0
							};
							const sync = () => {
								const r = layer.getBoundingClientRect();
								const rawLeft = r.left - applied.x;
								const rawTop = r.top - applied.y;
								if (Math.abs(rawLeft) <= 1 && Math.abs(rawTop) <= 1 && Math.abs(r.width - window.innerWidth) <= 1 && Math.abs(r.height - window.innerHeight) <= 1) {
									layer.removeAttribute("data-dsh-panel-host-degraded");
									layer.style.transform = "";
									return;
								}
								const next = {
									x: -rawLeft,
									y: -rawTop
								};
								if (next.x !== applied.x || next.y !== applied.y) {
									applied = next;
									layer.style.transform = `translate(${applied.x}px, ${applied.y}px)`;
								}
								hostCheckFrame = requestAnimationFrame(sync);
							};
							hostCheckFrame = requestAnimationFrame(sync);
						});
					};
					const mount = () => {
						if (mounted || disposed) return;
						try {
							host = document.createElement("div");
							host.setAttribute("data-dsh-better-sidebar", "");
							document.body.appendChild(host);
							root = (0, react_dom_client.createRoot)(host);
							root.render((0, react.createElement)(RenderBoundary, { className: sidebar_module_css_default.boundaryError }, (0, react.createElement)(Sidebar, {
								ctx,
								store: sidebarStore
							})));
							mounted = true;
							guardAnchor();
							scheduleHostCheck();
						} catch (error) {
							fail("mount", error);
						}
					};
					const sync = async () => {
						if (disposed) return;
						const prefs = await Promise.race([loadPrefs(api), new Promise((resolve) => {
							window.setTimeout(() => resolve(null), 2e3);
						})]);
						if (prefs !== null) sidebarStore.setPrefs(prefs);
						if (disposed) return;
						const suspended = await loadExternalDisable(api);
						if (disposed) return;
						sidebarStore.setSuspended(suspended);
						if (suspended) unmount();
						else mount();
					};
					sync();
					const offRemote = ctx.get("remote")?.$on?.("settings/document-updated", () => {
						sync();
					});
					return () => {
						disposed = true;
						offRemote?.();
						unmount();
					};
				}, "dsh-better-sidebar: sidebar mount");
				ctx.effect(() => {
					try {
						return registerTurnTailInterception(ctx, sidebarStore);
					} catch (error) {
						fail("interception", error);
						return;
					}
				}, "dsh-better-sidebar: turn-tail interception");
				ctx.effect(() => {
					try {
						return registerOpenPathInterception(ctx, sidebarStore);
					} catch (error) {
						fail("interception", error);
						return;
					}
				}, "dsh-better-sidebar: open-path interception");
				ctx.effect(() => {
					try {
						return registerRemoteOpenPathInterception(ctx, sidebarStore);
					} catch (error) {
						fail("interception", error);
						return;
					}
				}, "dsh-better-sidebar: remote open-path interception");
				ctx.effect(() => {
					try {
						const urlTargetOf = (url) => {
							const prefs = sidebarStore.getPrefs();
							return matchUrlTarget(service.getTabs().filter((tab) => prefs.tabsEnabled[tab.id] !== false), url)?.id;
						};
						return registerLinkInterception({
							takeoverEnabled: (url) => {
								if (sidebarStore.getSuspended()) return false;
								const prefs = sidebarStore.getPrefs();
								if (prefs.browserInterceptLinks === false) return false;
								if (!(url.protocol === "https:" ? prefs.browserInterceptHttps !== false : prefs.browserInterceptHttp !== false)) return false;
								return urlTargetOf(url) !== void 0 || prefs.tabsEnabled["browser"] !== false;
							},
							openInSidebar: (url) => {
								let title;
								try {
									title = new URL(url).hostname;
								} catch {}
								const type = urlTargetOf(new URL(url)) ?? "browser";
								ctx.betterSidebar?.openTab({
									type,
									url,
									title
								});
							},
							selfOrigin: window.location.origin
						});
					} catch (error) {
						fail("interception", error);
						return;
					}
				}, "dsh-better-sidebar: link interception");
				ctx.effect(() => {
					try {
						return registerImeGuard();
					} catch (error) {
						fail("ime guard", error);
						return;
					}
				}, "dsh-better-sidebar: IME composition guard");
				ctx.effect(() => registerSettingsNavIcon(() => t("settingsNav")), "dsh-better-sidebar: settings navigation icon");
				ctx.slots.inject("settings.section", () => ctx.slots.register({
					name: "settings.section",
					id: "better-sidebar",
					order: 100,
					label: () => t("settingsNav"),
					inject: () => ({
						store: sidebarStore,
						service
					})
				}, SideCardSection));
			} catch (error) {
				fail("load", error);
			}
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map