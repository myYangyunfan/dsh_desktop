window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-client-ui-input-trigger",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let _deepseek_ai_cordis = require("@deepseek-ai/cordis");
		let _deepseek_ai_dsh_client_runtime_client = require("@deepseek-ai/dsh-client-runtime/client");
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		//#region lib/types/core/detect.js
		const WORD_CHAR = /[\p{L}\p{N}_]/u;
		const WHITESPACE = /\s/u;
		/**
		* Word-boundary rule: a trigger char opens only at start-of-draft, after
		* whitespace (newlines included), or after punctuation. Two URL carve-outs
		* keep '/' dead inside URLs (both pinned by tests): '/' after a ':' that
		* itself follows a non-whitespace char (scheme separator, `https:/…`), and
		* '/' directly after another '/' (second slash of `//`).
		*/
		function boundaryOk(draft, index, char) {
			if (index === 0) return true;
			const prev = draft.charAt(index - 1);
			if (WHITESPACE.test(prev)) return true;
			if (WORD_CHAR.test(prev)) return false;
			if (char === "/") {
				if (prev === "/") return false;
				if (prev === ":" && index >= 2 && !WHITESPACE.test(draft.charAt(index - 2))) return false;
			}
			return true;
		}
		/**
		* Detect a trigger token at the caret. Scans left from the caret and stops
		* at the first whitespace (the token under edit never spans whitespace);
		* trigger chars failing the guard tier or the word boundary are treated as
		* ordinary token chars and the scan continues (`user@host`, URL slashes).
		* Guard tiers: plain = both chars live; claimed = '/' fully suppressed,
		* '@' live; frozen = none.
		*
		* @param draft - Full draft text.
		* @param caret - Caret offset into `draft`.
		* @param guard - Availability tier derived from the input phase.
		* @returns The hit with `query` = trigger-to-caret slice and `span` =
		* `{start: triggerIndex, end: caret}`; `span.draftRev` is a placeholder `0`
		* — the calling shell stamps the real revision. Null when no trigger is
		* live at the caret.
		*/
		const detectTrigger = (draft, caret, guard) => {
			if (guard.tier === "frozen") return null;
			for (let i = caret - 1; i >= 0; i--) {
				const ch = draft.charAt(i);
				if (WHITESPACE.test(ch)) return null;
				if (ch !== "/" && ch !== "@") continue;
				if (guard.tier === "claimed" && ch === "/") continue;
				if (!boundaryOk(draft, i, ch)) continue;
				return {
					trigger: ch,
					query: draft.slice(i + 1, caret),
					position: draft.search(/\S/) === i ? "leading" : "inline",
					span: {
						start: i,
						end: caret,
						draftRev: 0
					}
				};
			}
			return null;
		};
		//#endregion
		//#region lib/types/core/menu.js
		/** Closed rest state with generation 0; store initializer and test seed. */
		const MENU_CLOSED = {
			open: false,
			hit: null,
			generation: 0,
			groups: [],
			highlight: null
		};
		/**
		* Replace the group roster with pending groups for `sources`, in order.
		* Shell-side step before dispatching `hit` on a fresh menu open.
		*
		* @param state - Current menu state.
		* @param sources - Source names registered for the hit trigger, menu order.
		* @returns State carrying the new pending roster; highlight cleared.
		*/
		function seedGroups(state, sources) {
			return {
				...state,
				groups: sources.map((source) => ({
					source,
					status: "pending",
					items: []
				})),
				highlight: null
			};
		}
		/** Close, preserving the generation so in-flight settlements stay droppable. */
		const closed = (state) => state.open || state.hit !== null || state.groups.length > 0 || state.highlight !== null ? {
			open: false,
			hit: null,
			generation: state.generation,
			groups: [],
			highlight: null
		} : state;
		/** First item of the first non-empty ready group, or null. */
		function firstHighlight(groups) {
			for (const g of groups) if (g.status === "ready" && g.items.length > 0) return {
				source: g.source,
				index: 0
			};
			return null;
		}
		/** The highlight itself when it still points at a ready item, else null. */
		function validHighlight(highlight, groups) {
			if (!highlight) return null;
			const g = groups.find((x) => x.source === highlight.source);
			return g && g.status === "ready" && highlight.index < g.items.length ? highlight : null;
		}
		/** Flatten ready items into (source, index) positions in group order. */
		function positions(groups) {
			const out = [];
			for (const g of groups) {
				if (g.status !== "ready") continue;
				for (let i = 0; i < g.items.length; i++) out.push({
					source: g.source,
					index: i
				});
			}
			return out;
		}
		/** True when every group is ready with zero items (the auto-close condition). */
		const allReadyEmpty = (groups) => groups.every((g) => g.status === "ready" && g.items.length === 0);
		/**
		* Pure menu reducer. `hit` opens a new generation over the seeded roster
		* (null hit closes); `source-settled` outside the current generation, the
		* open menu, or the roster is dropped; a settlement or failure leaving every
		* group ready-and-empty (or no groups) auto-closes; `source-failed` silently
		* removes the group (the shell logs); `move` cycles the highlight across
		* ready items.
		*
		* @param state - Current menu state.
		* @param ev - Menu event.
		* @returns Next state; the same reference when stale or a no-op.
		*/
		const menuReduce = (state, ev) => {
			switch (ev.type) {
				case "hit":
					if (ev.hit === null) return closed(state);
					return {
						open: true,
						hit: ev.hit,
						generation: state.generation + 1,
						groups: state.groups.map((g) => ({
							source: g.source,
							status: "pending",
							items: []
						})),
						highlight: null
					};
				case "source-settled": {
					if (!state.open || ev.generation !== state.generation) return state;
					const idx = state.groups.findIndex((g) => g.source === ev.source);
					if (idx < 0) return state;
					const items = ev.items ?? [];
					const groups = state.groups.map((g, i) => i === idx ? {
						source: g.source,
						status: "ready",
						items
					} : g);
					if (allReadyEmpty(groups)) return closed(state);
					const highlight = validHighlight(state.highlight, groups) ?? firstHighlight(groups);
					return {
						...state,
						groups,
						highlight
					};
				}
				case "source-failed": {
					if (!state.open || ev.generation !== state.generation) return state;
					if (!state.groups.some((g) => g.source === ev.source)) return state;
					const groups = state.groups.filter((g) => g.source !== ev.source);
					if (groups.length === 0 || allReadyEmpty(groups)) return closed(state);
					const highlight = validHighlight(state.highlight, groups) ?? firstHighlight(groups);
					return {
						...state,
						groups,
						highlight
					};
				}
				case "move": {
					if (!state.open) return state;
					const pos = positions(state.groups);
					if (pos.length === 0) return state;
					const hl = state.highlight;
					const at = hl ? pos.findIndex((p) => p.source === hl.source && p.index === hl.index) : -1;
					const next = pos[at < 0 ? ev.dir === 1 ? 0 : pos.length - 1 : (at + ev.dir + pos.length) % pos.length];
					if (next === void 0) return state;
					if (hl && next.source === hl.source && next.index === hl.index) return state;
					return {
						...state,
						highlight: next
					};
				}
				case "close": return closed(state);
			}
		};
		//#endregion
		//#region lib/types/client/controller.js
		/**
		* Per-session trigger pipeline state and orchestration. All mutation stays
		* inside; MenuView renders from {@link InputTriggerController.menu} and routes
		* pointer picks back through {@link InputTriggerController.pick}.
		*/
		var InputTriggerController = class {
			deps;
			/** Menu state store (per-session; survives session switches, dies with the scope). */
			menu = (0, _deepseek_ai_dsh_client_runtime_client.createSnapshotStore)(MENU_CLOSED);
			/**
			* Name of the source opened through the programmatic launcher, or null for
			* trigger-detected/closed menus. Composer chrome subscribes to this store
			* for the launcher's expanded state without owning a second menu model.
			*/
			launcher = (0, _deepseek_ai_dsh_client_runtime_client.createSnapshotStore)(null);
			/**
			* Aggregated hot reference lexicon, grouped by trigger (plain-text-reference decision;
			* see .agents/notes/implemented/architecture/2026-07-25-web-input-machine-and-slash-pipeline.md):
			* sources implementing the lexicon hook are polled with the session
			* projection; undefined answers (roll not hot yet) are skipped; multiple
			* sources on one trigger concatenate in registration order. A snapshot
			* store because rolls change asynchronously (catalog settles, children
			* spawn/exit) — render-side consumers subscribe instead of re-reading a
			* mutable answer.
			*/
			lexicon = (0, _deepseek_ai_dsh_client_runtime_client.createSnapshotStore)(/* @__PURE__ */ new Map());
			/** The authoritative hit: single truth for span CAS material (menu snapshot never carries it alone). */
			hit = null;
			fetch = null;
			disposed = false;
			/** Per-source lexicon unsubscribers (sources without the hook never enter). */
			lexiconOffs = /* @__PURE__ */ new Map();
			constructor(deps) {
				this.deps = deps;
				const projection = this.project();
				for (const src of deps.roster.all()) {
					src.warm?.(projection);
					this.watchLexicon(src, projection);
				}
				this.refreshLexicon();
			}
			/**
			* Feed a draft/caret change through trigger detection and drive the menu.
			* @param draft - full draft text.
			* @param caret - caret offset into `draft`.
			* @param guard - availability tier derived from the input phase.
			* @param draftRev - the input machine's current draft revision, stamped
			* into the hit span for pick-time CAS.
			*/
			track(draft, caret, guard, draftRev) {
				if (this.disposed) return;
				const launched = this.launcher.getSnapshot() !== null;
				this.clearLauncher();
				const raw = detectTrigger(draft, caret, guard);
				if (raw === null) {
					this.hit = null;
					this.stopFetch();
					this.reduce({ type: "close" });
					return;
				}
				const hit = {
					...raw,
					span: {
						...raw.span,
						draftRev
					}
				};
				const prev = this.menu.getSnapshot();
				const same = !launched && prev.open && prev.hit !== null && prev.hit.trigger === hit.trigger && prev.hit.query === hit.query && prev.hit.span.start === hit.span.start && prev.hit.span.end === hit.span.end;
				this.hit = hit;
				if (same) return;
				const roster = this.deps.roster.sources(hit.trigger);
				if (roster.length === 0) {
					this.stopFetch();
					this.reduce({ type: "close" });
					return;
				}
				if (launched || !prev.open || prev.hit === null || prev.hit.trigger !== hit.trigger) this.menu.set(seedGroups(this.menu.getSnapshot(), roster.map((s) => s.name)));
				this.reduce({
					type: "hit",
					hit
				});
				this.fetchCandidates(hit, roster);
			}
			/**
			* Toggle a menu containing exactly one registered source. The supplied hit
			* is a synthetic selection span rather than a typed trigger token, but
			* picks deliberately reuse the ordinary source callback and scoped input
			* mutation pipeline.
			* @param source - registered source name under `hit.trigger`.
			* @param hit - synthetic hit carrying position and pick-time draft CAS.
			*/
			toggleSource(source, hit) {
				if (this.disposed) return;
				if (this.launcher.getSnapshot() === source && this.menu.getSnapshot().open) {
					this.dismiss();
					return;
				}
				const match = this.deps.roster.sources(hit.trigger).find((item) => item.name === source);
				if (match === void 0) {
					this.dismiss();
					return;
				}
				this.stopFetch();
				this.hit = hit;
				this.launcher.set(source);
				this.menu.set(seedGroups(this.menu.getSnapshot(), [source]));
				this.reduce({
					type: "hit",
					hit
				});
				this.fetchCandidates(hit, [match]);
			}
			/**
			* Pointer pick from MenuView: route the clicked candidate through onPick
			* and execute claim/insert outcomes via the scoped input events.
			* @param source - source (group) name.
			* @param index - candidate index within the group.
			*/
			pick(source, index) {
				const state = this.menu.getSnapshot();
				const hit = this.hit;
				if (this.disposed || !state.open || hit === null) return;
				const group = state.groups.find((g) => g.source === source);
				const candidate = group !== void 0 && group.status === "ready" ? group.items[index] : void 0;
				if (candidate === void 0) return;
				const src = this.deps.roster.sources(hit.trigger).find((s) => s.name === source);
				if (src === void 0) return;
				const outcome = src.onPick({
					candidate,
					session: this.project(),
					position: hit.position,
					via: "menu",
					span: hit.span
				});
				this.stopFetch();
				this.reduce({ type: "close" });
				this.execute(outcome, hit.span);
			}
			/**
			* Keyboard arbitration while the menu is open.
			* @param key - intercepted key.
			* @param composing - inside IME composition: everything passes.
			* @returns consumed / pick-highlighted / pass.
			*/
			arbitrate(key, composing) {
				if (composing || this.disposed) return "pass";
				const state = this.menu.getSnapshot();
				if (!state.open) return "pass";
				switch (key) {
					case "up":
						this.reduce({
							type: "move",
							dir: -1
						});
						return "consumed";
					case "down":
						this.reduce({
							type: "move",
							dir: 1
						});
						return "consumed";
					case "escape":
						this.stopFetch();
						this.reduce({ type: "close" });
						return "consumed";
					case "enter":
						if (state.highlight === null) return "pass";
						this.pick(state.highlight.source, state.highlight.index);
						return "pick-highlighted";
				}
			}
			/**
			* Space adjudication over the just-completed leading token: polls sources'
			* matchSpace (hot state, synchronous) and dispatches the outcome itself.
			* @returns true when a claim/insert was actually applied by the input —
			* the caller preventDefaults exactly then.
			*/
			onSpace() {
				const hit = this.hit;
				if (this.disposed || hit === null || hit.position !== "leading") return false;
				const token = hit.trigger + hit.query;
				const projection = this.project();
				for (const src of this.deps.roster.sources(hit.trigger)) {
					if (src.matchSpace === void 0) continue;
					const outcome = src.matchSpace(projection, token);
					if (outcome === void 0) continue;
					if (outcome === "handled") return true;
					return this.execute(outcome, hit.span);
				}
				return false;
			}
			/**
			* Serialize one reference occurrence to its model form via the owning
			* source's codec (prompt serialization: registry → explicit
			* call → await). Owner missing or codec-less rejects — the submit attempt
			* blocks instead of silently downgrading to the clipboard text.
			* @param source - owning source name.
			* @param ref - owner-scoped reference id.
			* @param signal - the submit attempt's abort signal.
			* @returns the model representation (e.g. `<skill>name</skill>`).
			*/
			serializeReference(source, ref, signal) {
				const owner = this.deps.roster.all().find((s) => s.name === source);
				if (owner?.codec === void 0) return Promise.reject(/* @__PURE__ */ new Error(`slash: no serializer for reference source "${source}"`));
				return owner.codec.serialize(ref, signal);
			}
			/**
			* Enter last adjudication: polls sources' matchEnter in registration
			* order, first non-undefined wins. The outcome returns to the caller (the
			* input machine applies it inside the same submit attempt — no event).
			* @param line - trimmed draft; the leading char selects the trigger roster.
			* @param signal - attempt-scoped abort from the input machine.
			* @returns the winning outcome or undefined (default sink). Rejects when a
			* polled source's warmup fails — the caller must not silently downgrade.
			*/
			async adjudicate(line, signal) {
				const projection = this.project();
				for (const src of this.deps.roster.all()) {
					if (signal.aborted) throw signal.reason instanceof Error ? signal.reason : /* @__PURE__ */ new Error("slash adjudication aborted");
					if (src.matchEnter === void 0 || !line.startsWith(src.trigger)) continue;
					const outcome = await src.matchEnter(projection, line, signal);
					if (outcome !== void 0) return outcome;
				}
			}
			/**
			* Drop the menu group of a disposed source (root registry change notification).
			* @param source - the source whose registration was disposed.
			*/
			sourceRemoved(source) {
				const state = this.menu.getSnapshot();
				if (state.open && state.hit !== null && state.hit.trigger === source.trigger) this.reduce({
					type: "source-failed",
					generation: state.generation,
					source: source.name
				});
				this.lexiconOffs.get(source)?.();
				this.lexiconOffs.delete(source);
				this.refreshLexicon();
			}
			/**
			* Admit a source registered after this controller's birth (root registry
			* change notification): warm it and fold its roll into the live lexicon —
			* the constructor-time prewarm covers only the roster present at scope
			* birth.
			* @param source - the newly registered source.
			*/
			sourceAdded(source) {
				const projection = this.project();
				source.warm?.(projection);
				this.watchLexicon(source, projection);
				this.refreshLexicon();
			}
			/** External dismiss (e.g. pointer outside the composer area). */
			dismiss() {
				if (this.disposed) return;
				this.stopFetch();
				this.reduce({ type: "close" });
			}
			/** Scope teardown: close and abort (the service deletes the map entry). */
			dispose() {
				this.disposed = true;
				this.stopFetch();
				this.reduce({ type: "close" });
				this.hit = null;
				for (const off of this.lexiconOffs.values()) off();
				this.lexiconOffs.clear();
			}
			/** The session projection handed to sources (agent-backed identity; constant per scope). */
			project() {
				return { sessionId: this.deps.sessionId };
			}
			/** Execute a claim/insert/text outcome via the scoped input events (actx as dispatch subject); true = the input applied it. */
			execute(outcome, span) {
				const { actx } = this.deps;
				if (outcome === void 0 || outcome === "handled") return false;
				if ("claim" in outcome) return actx.bail(actx, "slash/input-begin-command", {
					claim: outcome.claim,
					span
				}) === true;
				if ("text" in outcome) return actx.bail(actx, "slash/input-insert-text", {
					text: outcome.text,
					span
				}) === true;
				return actx.bail(actx, "slash/input-insert-reference", {
					reference: outcome.insert,
					span
				}) === true;
			}
			/** Re-poll every lexicon-bearing source and publish the aggregated rolls (see the store doc). */
			refreshLexicon() {
				const projection = this.project();
				const rolls = /* @__PURE__ */ new Map();
				for (const src of this.deps.roster.all()) {
					if (src.lexicon === void 0) continue;
					let names;
					try {
						names = src.lexicon(projection);
					} catch (error) {
						console.error(`[ui-input-trigger] source "${src.name}" lexicon failed:`, error);
						continue;
					}
					if (names === void 0) continue;
					const prev = rolls.get(src.trigger);
					rolls.set(src.trigger, prev === void 0 ? names : [...prev, ...names]);
				}
				this.lexicon.set(rolls);
			}
			/** Wire one source's lexicon invalidation channel into refresh (hookless or roll-less sources never notify). */
			watchLexicon(source, projection) {
				if (source.lexicon === void 0 || source.subscribeLexicon === void 0) return;
				this.lexiconOffs.set(source, source.subscribeLexicon(projection, () => {
					this.refreshLexicon();
				}));
			}
			/** Launch the candidate fetch for one hit generation, superseding the previous one. */
			fetchCandidates(hit, roster) {
				this.stopFetch();
				const controller = new AbortController();
				this.fetch = controller;
				const generation = this.menu.getSnapshot().generation;
				const projection = this.project();
				for (const source of roster) source.candidates(projection, {
					query: hit.query,
					position: hit.position,
					signal: controller.signal
				}).then((items) => {
					if (controller.signal.aborted) return;
					this.reduce({
						type: "source-settled",
						generation,
						source: source.name,
						items
					});
				}, (error) => {
					if (controller.signal.aborted) return;
					console.error(`[ui-input-trigger] source "${source.name}" candidates failed:`, error);
					this.reduce({
						type: "source-failed",
						generation,
						source: source.name
					});
				});
			}
			stopFetch() {
				this.fetch?.abort();
				this.fetch = null;
			}
			clearLauncher() {
				if (this.launcher.getSnapshot() !== null) this.launcher.set(null);
			}
			reduce(ev) {
				const cur = this.menu.getSnapshot();
				const next = menuReduce(cur, ev);
				if (next !== cur) this.menu.set(next);
				if (!next.open) this.clearLauncher();
			}
		};
		//#endregion
		//#region lib/types/client/service.js
		/**
		* InputTriggerService (`ctx.inputTriggers`): the root half of the trigger pipeline — the
		* stateless source registry plus the per-session controller map. Every piece
		* of mutable interaction state (hit, menu, fetch) lives on the
		* {@link InputTriggerController}; the service only registers sources, resolves
		* controllers by session scope, and relays roster changes.
		*/
		/** The `ctx.inputTriggers` trigger pipeline service (root registry + controller resolution). */
		var InputTriggerService = class extends _deepseek_ai_cordis.Service {
			static inject = ["sessions"];
			live = {
				sources: [],
				controllers: /* @__PURE__ */ new Map()
			};
			/**
			* @param ctx - owning root context (the service registers itself as `slash`).
			*/
			constructor(ctx) {
				super(ctx, "inputTriggers");
			}
			/**
			* Register one trigger source. Live session controllers are notified so a
			* source arriving after scope birth still warms and joins the lexicon.
			* @param src - the source; (trigger, name) must be unique — duplicates throw.
			* @returns the disposer (callers wrap registration in ctx.effect). Disposal
			* while a controller shows the source's menu group drops that group.
			*/
			registerSource(src) {
				const { live } = this;
				if (live.sources.some((s) => s.trigger === src.trigger && s.name === src.name)) throw new Error(`slash source "${src.trigger}${src.name}" is already registered`);
				live.sources.push(src);
				for (const controller of live.controllers.values()) try {
					controller.sourceAdded(src);
				} catch (error) {
					console.error(`[ui-input-trigger] source "${src.trigger}${src.name}" late-registration setup failed:`, error);
				}
				return () => {
					const at = live.sources.indexOf(src);
					if (at < 0) return;
					live.sources.splice(at, 1);
					for (const controller of live.controllers.values()) controller.sourceRemoved(src);
				};
			}
			/**
			* Resolve the per-session controller for one session scope (lazy; the
			* scope disposer removes and disposes it). Construction warms the source
			* roster once — sessions are always agent-backed, so scope birth is the
			* single prewarm moment.
			* @param actx - session-scope ctx.
			* @returns the resident controller.
			*/
			sessionOf(actx) {
				const id = this.sessions().scopeOf(actx);
				if (id === void 0) throw new Error("slash.sessionOf requires a session scope");
				const { live } = this;
				const existing = live.controllers.get(id);
				if (existing !== void 0) return existing;
				const controller = new InputTriggerController({
					actx,
					sessionId: id,
					roster: {
						sources: (trigger) => live.sources.filter((s) => s.trigger === trigger).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
						all: () => live.sources
					}
				});
				live.controllers.set(id, controller);
				actx.effect(() => () => {
					controller.dispose();
					live.controllers.delete(id);
				}, "slash: session controller");
				return controller;
			}
			sessions() {
				const sessions = this.ctx.get("sessions");
				if (sessions === void 0) throw new Error("ui-input-trigger: sessions service unavailable");
				return sessions;
			}
		};
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
		//#region \0dsh-css:/home/runner/work/deepseek-harness/deepseek-harness/packages/client/ui-input-trigger/src/client/MenuView.module.css.mjs
		const css = "._3e4SsG_menu{z-index:100;--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);border:1px solid var(--dsw-alias-border-inverted);background:var(--dsw-specific-menu);min-width:min(260px,100%);max-width:min(537px,100%);max-height:320px;box-shadow:var(--dsw-shadow-lv3);border-radius:12px;flex-direction:column;padding:4px;display:flex;position:absolute;bottom:calc(100% + 4px);left:0;overflow:hidden}._3e4SsG_viewport{flex-direction:column;min-height:0;display:flex;overflow-y:auto}._3e4SsG_item{cursor:pointer;width:100%;min-height:40px;color:var(--dsw-alias-label-primary);text-align:left;background:0 0;border:none;border-radius:10px;align-items:center;gap:8px;padding:8px 10px;font-size:14px;line-height:22px;display:flex}._3e4SsG_item:hover,._3e4SsG_item._3e4SsG_active{background:var(--dsw-alias-interactive-bg-hover)}._3e4SsG_itemIcon{width:16px;height:16px;color:var(--dsw-alias-label-tertiary);flex:none;justify-content:center;align-items:center;display:inline-flex}._3e4SsG_itemName{text-overflow:ellipsis;white-space:nowrap;flex:none;max-width:40%;overflow:hidden}._3e4SsG_itemDescription{text-overflow:ellipsis;white-space:nowrap;min-width:0;color:var(--dsw-alias-label-tertiary);flex:1;overflow:hidden}._3e4SsG_groupTitle{color:var(--dsw-alias-label-tertiary);padding:8px 10px;font-size:12px;line-height:16px}._3e4SsG_loading{min-height:40px;color:var(--dsw-alias-label-dimmed);align-items:center;padding:8px 10px;font-size:14px;line-height:22px;display:flex}";
		const tagId = "@deepseek-ai/dsh-client-ui-input-trigger/MenuView.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-input-trigger";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var MenuView_module_css_default = {
			"item": "_3e4SsG_item",
			"viewport": "_3e4SsG_viewport",
			"loading": "_3e4SsG_loading",
			"menu": "_3e4SsG_menu",
			"itemDescription": "_3e4SsG_itemDescription",
			"groupTitle": "_3e4SsG_groupTitle",
			"itemName": "_3e4SsG_itemName",
			"itemIcon": "_3e4SsG_itemIcon",
			"active": "_3e4SsG_active"
		};
		//#endregion
		//#region lib/types/client/MenuView.js
		/**
		* Trigger candidate menu: renders the InputTriggerService menu store into the
		* conversation.input.overlay anchor. Closed state renders null (the overlay
		* slot stays mounted); groups render in roster order under localized title
		* rows, pending groups as a loading row; pointer picks route back through
		* the service (combobox pattern — focus never leaves the textarea, so rows
		* are mousedown-handled and the highlight is exposed via
		* aria-activedescendant on the listbox).
		*/
		/** Design cap on the list height (figma SLASH 39:26572 MenuDropdown). */
		const MAX_HEIGHT = 320;
		/** DOM id of one option row (the aria-activedescendant target). */
		function optionId(source, index) {
			return `dsh-slash-option-${source}-${index}`;
		}
		/**
		* Render the candidate menu overlay entry.
		* @param props - injected face (the menu store and the pick route); `t` rides the standard locale seat.
		* @returns the dropdown while open; null while closed.
		*/
		function MenuView({ menu, onPick, onDismiss, t }) {
			const state = (0, react.useSyncExternalStore)((fn) => menu.subscribe(fn), () => menu.getSnapshot());
			const listRef = (0, react.useRef)(null);
			const maxHeight = (0, _deepseek_ai_dsh_client_ui_primitives.useAnchoredMaxHeight)(listRef, MAX_HEIGHT, state);
			const highlight = state.open ? state.highlight : null;
			(0, react.useEffect)(() => {
				if (highlight === null) return;
				document.getElementById(optionId(highlight.source, highlight.index))?.scrollIntoView({ block: "nearest" });
			}, [highlight]);
			(0, react.useEffect)(() => {
				if (!state.open) return;
				const onPointerDown = (ev) => {
					if (!(ev.target instanceof Node)) return;
					if (listRef.current?.contains(ev.target)) return;
					if ((listRef.current?.closest("[data-composer-card]"))?.contains(ev.target)) return;
					onDismiss();
				};
				document.addEventListener("pointerdown", onPointerDown, true);
				return () => {
					document.removeEventListener("pointerdown", onPointerDown, true);
				};
			}, [state.open, onDismiss]);
			if (!state.open) return null;
			return (0, react_jsx_runtime.jsx)("div", {
				ref: listRef,
				className: MenuView_module_css_default.menu,
				style: { maxHeight },
				role: "listbox",
				"aria-label": t("suggestions.aria"),
				"aria-activedescendant": highlight !== null ? optionId(highlight.source, highlight.index) : void 0,
				children: (0, react_jsx_runtime.jsx)("div", {
					className: MenuView_module_css_default.viewport,
					children: state.groups.map((group) => group.status === "ready" && group.items.length === 0 ? null : (0, react_jsx_runtime.jsxs)(react.Fragment, { children: [(0, react_jsx_runtime.jsx)("div", {
						className: MenuView_module_css_default.groupTitle,
						role: "presentation",
						"data-source": group.source,
						children: t(group.source)
					}), group.status === "pending" ? (0, react_jsx_runtime.jsx)("div", {
						className: MenuView_module_css_default.loading,
						"data-source": group.source,
						children: t("loading")
					}) : group.items.map((item, index) => {
						const active = highlight !== null && highlight.source === group.source && highlight.index === index;
						return (0, react_jsx_runtime.jsxs)("button", {
							id: optionId(group.source, index),
							type: "button",
							role: "option",
							"aria-selected": active,
							className: clsx(MenuView_module_css_default.item, active && MenuView_module_css_default.active),
							onMouseDown: (ev) => {
								ev.preventDefault();
								onPick(group.source, index);
							},
							children: [
								item.icon !== void 0 && (0, react_jsx_runtime.jsx)("span", {
									className: MenuView_module_css_default.itemIcon,
									"aria-hidden": true,
									children: item.icon
								}),
								(0, react_jsx_runtime.jsx)("span", {
									className: MenuView_module_css_default.itemName,
									children: item.name
								}),
								item.description !== void 0 && (0, react_jsx_runtime.jsx)("span", {
									className: MenuView_module_css_default.itemDescription,
									children: item.description
								})
							]
						}, `${group.source}:${item.name}`);
					})] }, group.source))
				})
			});
		}
		//#endregion
		//#region lib/types/client/locales.js
		/**
		* `slash.menu` namespace dictionaries: group titles keyed by source name
		* (the lookup chain returns the key itself, so an unknown source shows its
		* raw name), the pending row, and the listbox aria label.
		*/
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"command": "命令",
			"skill": "技能",
			"subagent": "子智能体",
			"loading": "正在加载…",
			"suggestions.aria": "触发候选建议"
		};
		/** English dictionary, checked complete against the zh key set. */
		const en = {
			"command": "Commands",
			"skill": "Skills",
			"subagent": "Subagents",
			"loading": "Loading…",
			"suggestions.aria": "Trigger suggestions"
		};
		//#endregion
		//#region lib/types/client/index.js
		/** Namespace owning the candidate-menu copy. */
		const MENU_NS = "slash.menu";
		/** Required services: controller resolution reads the session scope tree; the menu copy is localized. */
		const inject = ["sessions", "locale"];
		/**
		* Client plugin body: mount the service, then register MenuView into the
		* input overlay once its declarer is up.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.plugin(InputTriggerService);
			ctx.effect(() => ctx.locale.register(MENU_NS, {
				zh,
				en
			}), "ui-input-trigger: menu dictionaries");
			ctx.inject([
				"slots",
				"inputTriggers",
				"sessions"
			], (scope) => {
				const inputTriggers = scope.inputTriggers;
				const sessions = scope.sessions;
				scope.slots.inject("conversation.input.overlay", () => scope.slots.register({
					name: "conversation.input.overlay",
					id: "slash-menu",
					order: 0,
					locale: MENU_NS,
					inject: (sessionId) => {
						const actx = sessions.scope(sessionId);
						if (actx === void 0) throw new Error(`ui-input-trigger: session "${String(sessionId)}" resolved no scope`);
						const controller = inputTriggers.sessionOf(actx);
						return {
							menu: controller.menu,
							onPick: (source, index) => {
								controller.pick(source, index);
							},
							onDismiss: () => {
								controller.dismiss();
							}
						};
					}
				}, MenuView));
			});
		}
		//#endregion
		exports.InputTriggerController = InputTriggerController;
		exports.InputTriggerService = InputTriggerService;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map