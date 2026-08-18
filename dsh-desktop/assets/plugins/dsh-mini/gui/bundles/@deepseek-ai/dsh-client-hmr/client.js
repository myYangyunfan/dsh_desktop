window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-client-hmr",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region lib/types/events.js
		/**
		* Wire protocol of the `/plugins/events` dev SSE channel — single source for
		* both halves of this package. Frames still cross a wire boundary: the
		* browser half validates them at its JSON parse point; sharing the type keeps
		* the two ends from drifting, not from parsing.
		*/
		/** System SSE endpoint pushing graph/rebuilt frames (wire protocol constant). */
		const EVENTS_ENDPOINT = "/plugins/events";
		//#endregion
		//#region lib/types/client/index.js
		/** Cordis plugin name. */
		const name = "client-hmr";
		/** Required services: the vendored Loader (entry governance) and the client module system (boot provide, service name `modules`). */
		const inject = ["loader", "modules"];
		/** Find the loader entry whose module specifier is `id` (entry tree ids are random; the package name lives in `options.name`). */
		function findEntry(loader, id) {
			for (const entry of loader.entries()) if (entry.options.name === id) return entry;
		}
		/** Remove every `<style data-plugin>` tag owned by `id` (attribute compared verbatim — no CSS-selector escaping pitfalls). */
		function removeOwnedStyles(id) {
			for (const el of document.querySelectorAll("style[data-plugin]")) if (el.getAttribute("data-plugin") === id) el.remove();
		}
		/**
		* Mount the HMR driver: subscribe to the system SSE channel and hot-swap
		* rebuilt entries.
		* @param ctx - plugin context with `loader` and `modules` available.
		*/
		function apply(ctx) {
			const modLoader = ctx.modules;
			const loader = ctx.loader;
			async function reload(id) {
				const entry = findEntry(loader, id);
				if (entry === void 0) {
					ctx.logger.warn(`client-hmr: rebuilt frame for unknown entry "${id}" (not in the loader tree)`);
					return;
				}
				modLoader.invalidate(id);
				await modLoader.prefetch(id);
				const oldFiber = entry.fiber;
				if (oldFiber !== void 0) {
					const runtime = oldFiber.runtime;
					if (runtime !== null) entry.ctx.registry.delete(runtime.callback);
					while (oldFiber.inertia !== void 0) await oldFiber.inertia;
					delete entry.fiber;
				}
				removeOwnedStyles(id);
				await entry.refresh();
				await entry.fiber?.await();
			}
			let queue = Promise.resolve();
			const handle = (frame) => {
				switch (frame.type) {
					case "rebuilt":
						queue = queue.then(() => reload(frame.id)).catch((error) => {
							ctx.logger.error(`client-hmr: reload of "${frame.id}" failed`);
							ctx.logger.error(error);
						});
						break;
					case "graph": break;
					default: break;
				}
			};
			ctx.effect(() => {
				const source = new EventSource(EVENTS_ENDPOINT);
				source.addEventListener("message", (event) => {
					let frame;
					try {
						frame = JSON.parse(event.data);
					} catch {
						ctx.logger.warn(`client-hmr: unparseable event frame: ${event.data}`);
						return;
					}
					handle(frame);
				});
				return () => {
					source.close();
				};
			}, "client-hmr: event source");
		}
		//#endregion
		exports.EVENTS_ENDPOINT = EVENTS_ENDPOINT;
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map