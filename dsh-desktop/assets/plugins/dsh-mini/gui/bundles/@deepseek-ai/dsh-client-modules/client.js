window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-client-modules",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region lib/types/client/system.js
		/** Default bundle-load hook: same-origin external classic script. */
		const defaultLoadBundle = (url) => new Promise((resolve, reject) => {
			const el = document.createElement("script");
			el.async = true;
			el.src = url;
			el.addEventListener("load", () => {
				el.remove();
				resolve();
			}, { once: true });
			el.addEventListener("error", () => {
				el.remove();
				reject(/* @__PURE__ */ new Error(`client-modules: bundle script ${url} failed to load`));
			}, { once: true });
			document.head.append(el);
		});
		/**
		* A plugin bundle IS its package's client half: `<id>/client` (the exports
		* subpath external bundles emit) and the bare graph id name the same
		* exports, so table lookups normalize the suffix away.
		*/
		const stripClientSuffix = (spec) => spec.endsWith("/client") ? spec.slice(0, -7) : spec;
		/**
		* Claim and inventory the <style> tags a factory injected during
		* materialization: preset-emitted tags arrive pre-tagged with data-plugin;
		* any untagged tag is claimed for the materializing plugin (HMR bookkeeping).
		*/
		const claimStyles = (id) => {
			if (typeof document === "undefined") return [];
			for (const el of document.querySelectorAll("style:not([data-plugin])")) el.setAttribute("data-plugin", id);
			const owned = [];
			for (const el of document.querySelectorAll(`style[data-plugin=${JSON.stringify(id)}]`)) owned.push(el.getAttribute("data-plugin-css") ?? id);
			return owned;
		};
		/**
		* The client module system: state tables plus the arrival/materialization
		* machinery implementing {@link ClientModuleLoader} (whose members carry the
		* contract documentation). Construction indexes the boot rows and installs the
		* `window.__ModuleLoader__` registration sink — once per page.
		*/
		var ClientModuleSystem = class {
			version = "client";
			loadCache = /* @__PURE__ */ new Map();
			seed;
			statics = /* @__PURE__ */ new Map();
			factories = /* @__PURE__ */ new Map();
			/** In-flight prefetch (script load) per id; concurrent callers share it. */
			pendingArrival = /* @__PURE__ */ new Map();
			/** Materialization re-entrancy guard: factory-form CJS cannot deliver partial exports, so a cycle is fatal. */
			materializing = /* @__PURE__ */ new Set();
			graphRows = /* @__PURE__ */ new Map();
			loadBundle;
			/**
			* Build the module system over the parsed boot rows.
			* @param options - Module rows, module-table staticModules, and bundle-load hook.
			*/
			constructor(options) {
				this.seed = new Map(Object.entries(options.staticModules));
				this.loadBundle = options.loadBundle ?? defaultLoadBundle;
				for (const row of options.modules) {
					if (this.graphRows.has(row.id)) throw new Error(`client-modules: duplicate graph entry "${row.id}"`);
					this.graphRows.set(row.id, row);
				}
				const win = globalThis;
				if (win.__ModuleLoader__ !== void 0) throw new Error("client-modules: window.__ModuleLoader__ already installed (double boot?)");
				win.__ModuleLoader__ = { load: (handoff) => {
					if (this.factories.has(handoff.id)) throw new Error(`client-modules: duplicate factory registration for "${handoff.id}" (bundle executed twice without invalidate?)`);
					this.factories.set(handoff.id, handoff.factory);
				} };
			}
			/** Load one graph row so its factory is registered (idempotent per in-flight arrival). */
			arrive(row) {
				const { id, url } = row;
				const pending = this.pendingArrival.get(id);
				if (pending !== void 0) return pending;
				if (this.factories.has(id)) return Promise.resolve();
				const task = this.loadBundle(url).then(() => {
					if (!this.factories.has(id)) throw new Error(`client-modules: bundle ${url} loaded without registering "${id}" via __ModuleLoader__.load`);
				}).finally(() => {
					this.pendingArrival.delete(id);
				});
				this.pendingArrival.set(id, task);
				return task;
			}
			/** Materialize a registered factory (synchronous; memoized in loadCache). */
			materialize(id) {
				const existing = this.loadCache.get(id);
				if (existing !== void 0) return existing;
				const registered = this.factories.get(id);
				/* v8 ignore next -- callers check the factory branch before dispatching here. */
				if (registered === void 0) throw new Error(`client-modules: no registered factory for "${id}"`);
				if (this.materializing.has(id)) throw new Error(`client-modules: require cycle through "${id}" (factory-form CJS cannot deliver partial exports)`);
				this.materializing.add(id);
				try {
					const edges = /* @__PURE__ */ new Set();
					const record = {
						id,
						exports: registered(this.makeRequire(edges)),
						styles: claimStyles(id),
						edges
					};
					this.loadCache.set(id, record);
					return record;
				} finally {
					this.materializing.delete(id);
				}
			}
			/**
			* The synchronous require answered to factories: seed → static → memoized
			* record → registered factory (recursive materialization — this is what
			* makes load order self-resolving). Fetching is async and therefore
			* unreachable from here; an unregistered plugin specifier is loud (and a
			* cross-plugin value import is already a build error upstream).
			*/
			makeRequire(edges) {
				return (spec) => {
					edges.add(spec);
					if (this.seed.has(spec)) return this.seed.get(spec);
					if (this.statics.has(spec)) return this.statics.get(spec);
					const id = stripClientSuffix(spec);
					const record = this.loadCache.get(id);
					if (record !== void 0) return record.exports;
					if (this.factories.has(id)) return this.materialize(id).exports;
					throw new Error(`client-modules: require("${spec}") missed the module table — not a platform seed word, not a shell-own module, and no registered factory (a build-time externals drift, or a forbidden cross-plugin value import)`);
				};
			}
			async import(specifier) {
				if (this.seed.has(specifier)) return this.seed.get(specifier);
				const existing = this.loadCache.get(specifier);
				if (existing !== void 0) return existing.exports;
				if (this.statics.has(specifier)) {
					const exports = this.statics.get(specifier);
					this.loadCache.set(specifier, {
						id: specifier,
						exports,
						styles: [],
						edges: /* @__PURE__ */ new Set()
					});
					return exports;
				}
				if (!this.factories.has(specifier)) {
					const row = this.graphRows.get(specifier);
					if (row === void 0) throw new Error(`client-modules: cannot resolve "${specifier}" — not a seed word, not a shell-own module, and not a row in the boot graph (the runtime mirror of the bundle purity gate)`);
					await this.arrive(row);
				}
				return this.materialize(specifier).exports;
			}
			registerStatic(id, module) {
				if (this.statics.has(id)) throw new Error(`client-modules: shell-own module "${id}" registered twice`);
				this.statics.set(id, module);
			}
			async prefetch(id) {
				if (this.statics.has(id)) return;
				const row = this.graphRows.get(id);
				if (row === void 0) throw new Error(`client-modules: prefetch("${id}") — not a graph entry`);
				await this.arrive(row);
			}
			invalidate(id) {
				this.factories.delete(id);
				this.loadCache.delete(id);
			}
		};
		//#endregion
		//#region lib/types/client/manifest.js
		/**
		* Client module system: the browser peer of Node's internal ESM loader, built
		* as a lazy CJS table. The vendored cordis Loader consumes this object
		* through its `internal` contract (the only call site is `EntryTree.import` →
		* `internal.import`), which keeps entry governance (fiber lifecycle, inject
		* waiting, update/refresh) entirely on the vendored side while this package
		* owns code arrival.
		*
		* Lazy CJS model: executing a plugin bundle only REGISTERS its
		* factory (`window.__ModuleLoader__.load({id, factory})`); every module body
		* side effect — including CSS injection — lives inside the factory closure
		* and runs at materialization, not at script execution. Materialization
		* (factory(require) → exports) happens on first import/require and is
		* memoized in {@link ClientModuleLoader.loadCache}; a factory that requires
		* another registered-but-unmaterialized module materializes it recursively,
		* so load order needs no external sequencing.
		*
		* Resolution branch order (import): seed word → shell instance; memoized
		* record → exports; static registry (shell-own modules, e.g. app-shell) →
		* module; registered factory → materialize; graph row → load + materialize;
		* anything else → throw (loud — the runtime mirror of the
		* build-time bundle purity gate). The synchronous `require` handed to
		* factories walks the same order minus the load branch: loading is async,
		* so only already-registered bundles can be required — and cross-plugin value
		* imports are a build error anyway.
		*
		* This file is the browser-safe contract face (zero node imports): the
		* `__DSH_BOOT__` wire types, the boot-manifest parser, and the boundaries around
		* {@link ClientModuleSystem}. The package root is the host-side service that
		* composes the wire.
		*/
		/**
		* Parse `window.__DSH_BOOT__` into the two consumer views. Wire boundary:
		* a missing or malformed graph throws (the shell shows the loud failure —
		* a page without a valid manifest cannot boot anything).
		* @param wire - the raw `window.__DSH_BOOT__` value.
		* @returns the manifest with optional plugin-view fields normalized.
		*/
		function parseBootManifest(wire) {
			if (typeof wire !== "object" || wire === null) throw new Error("client-modules: window.__DSH_BOOT__ is missing or not an object");
			const graph = wire;
			if (typeof graph.rev !== "string") throw new Error("client-modules: boot manifest rev must be a string");
			if (!Array.isArray(graph.entries)) throw new Error("client-modules: boot manifest entries must be an array");
			const modules = [];
			const plugins = [];
			for (const value of graph.entries) {
				if (typeof value !== "object" || value === null) throw new Error("client-modules: boot manifest entry is not an object");
				const row = value;
				const where = typeof row.id === "string" ? `"${row.id}"` : JSON.stringify(row);
				if (typeof row.id !== "string" || typeof row.url !== "string" || typeof row.rev !== "string") throw new Error(`client-modules: boot manifest entry ${where} must carry string id/url/rev`);
				if (row.inject !== void 0 && (!Array.isArray(row.inject) || row.inject.some((i) => typeof i !== "string"))) throw new Error(`client-modules: boot manifest entry ${where} inject must be a string array`);
				if (row.immediately !== void 0 && typeof row.immediately !== "boolean") throw new Error(`client-modules: boot manifest entry ${where} immediately must be a boolean`);
				modules.push({
					id: row.id,
					url: row.url,
					rev: row.rev
				});
				plugins.push({
					id: row.id,
					inject: row.inject === void 0 ? [] : [...row.inject],
					immediately: row.immediately === true
				});
			}
			return {
				rev: graph.rev,
				modules,
				plugins
			};
		}
		//#endregion
		//#region lib/types/client/index.js
		/**
		* Enroll the kernel-built module system as `ctx.modules`.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			const modules = globalThis.__DSH_MODULES__;
			if (modules === void 0) throw new Error("client-modules: window.__DSH_MODULES__ missing — the shell kernel must construct the module system before plugin boot");
			ctx.reflect.provide("modules", modules);
		}
		//#endregion
		exports.ClientModuleSystem = ClientModuleSystem;
		exports.apply = apply;
		exports.parseBootManifest = parseBootManifest;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map