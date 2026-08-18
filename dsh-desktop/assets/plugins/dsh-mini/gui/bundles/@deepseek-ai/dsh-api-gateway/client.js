window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-api-gateway",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let _deepseek_ai_cordis = require("@deepseek-ai/cordis");
		//#region lib/types/client/index.js
		/**
		* Client projection of generated Typert Remote descriptors. Contributions
		* install traced `remote.<namespace>` services; no JavaScript Proxy
		* participates in method lookup, invocation, or type exposure.
		*/
		/** Required Client services: the Typert registry and the existing Connection carrier. */
		const inject = ["typert", "connection"];
		/**
		* Install the typed Client Remote service.
		* @param ctx - Client Cordis root.
		*/
		function apply(ctx) {
			new ClientRemoteService(ctx);
		}
		var ClientRemoteService = class extends _deepseek_ai_cordis.Service {
			ownerCtx;
			namespaces = /* @__PURE__ */ new Map();
			subscriptions = /* @__PURE__ */ new Map();
			mutations = Promise.resolve();
			constructor(ctx) {
				super(ctx, "remote");
				this.ownerCtx = ctx;
				ctx.effect(() => () => {
					this.subscriptions.clear();
				}, "api-gateway.client.subscriptions");
			}
			async $mount(contribution) {
				const callerCtx = this.ctx;
				const owned = callerCtx.effect(async () => {
					const dispose = await this.enqueue(() => this.mountContribution(callerCtx, contribution));
					return () => this.enqueue(dispose);
				}, `api-gateway.client.$mount(${JSON.stringify(contribution.package)})`);
				await owned;
				return async () => {
					await owned();
				};
			}
			$on(event, listener) {
				const subscription = { listener };
				const owned = this.ctx.effect(() => {
					const listeners = this.listeners(event);
					listeners.push(subscription);
					return () => {
						const at = listeners.indexOf(subscription);
						/* v8 ignore next -- listener */
						if (at >= 0) listeners.splice(at, 1);
					};
				}, `api-gateway.client.$on(${JSON.stringify(event)})`);
				return () => {
					owned();
				};
			}
			/**
			* Deliver one forwarded event in registration order, isolating a listener
			* that fails either synchronously or by rejecting a returned promise; see
			* {@link TypertClientRemote.$dispatch} for the caller contract.
			*/
			$dispatch(event, args) {
				const listeners = this.subscriptions.get(event);
				if (listeners === void 0) return;
				for (const { listener } of [...listeners]) {
					const report = (error) => {
						console.error(`client api: Remote event ${JSON.stringify(event)} listener threw:`, error);
					};
					try {
						const settled = listener(...args);
						if (settled instanceof Promise) settled.catch(report);
					} catch (error) {
						report(error);
					}
				}
			}
			/** Subscriptions for one event name; empty arrays are retained, bounded by the Host's selection. */
			listeners(event) {
				let listeners = this.subscriptions.get(event);
				if (listeners === void 0) {
					listeners = [];
					this.subscriptions.set(event, listeners);
				}
				return listeners;
			}
			enqueue(operation) {
				const result = this.mutations.then(operation, operation);
				this.mutations = result.then(() => void 0, () => void 0);
				return result;
			}
			async mountContribution(callerCtx, contribution) {
				this.validateContribution(contribution);
				const disposeRemote = callerCtx.typert.remotes.register(contribution);
				const installed = [];
				try {
					for (const descriptor of contribution.descriptors) installed.push(await this.install(descriptor));
				} catch (error) {
					for (const dispose of installed.reverse()) await dispose();
					await disposeRemote();
					throw error;
				}
				return async () => {
					for (const dispose of installed.reverse()) await dispose();
					await disposeRemote();
				};
			}
			validateContribution(contribution) {
				const direct = /* @__PURE__ */ new Map();
				const scoped = /* @__PURE__ */ new Map();
				const add = (table, descriptor, kind) => {
					const methods = table.get(descriptor.namespace) ?? /* @__PURE__ */ new Set();
					if (methods.has(descriptor.method)) throw new Error(`client api: contribution repeats ${kind} method ${endpointOf(descriptor)}`);
					methods.add(descriptor.method);
					table.set(descriptor.namespace, methods);
					if ((this.namespaces.get(descriptor.namespace)?.service)?.has(kind, descriptor.method) === true) throw new Error(`client api: ${kind} method ${endpointOf(descriptor)} is already mounted`);
				};
				for (const descriptor of contribution.descriptors) {
					requireStrictDescriptor(descriptor);
					if (descriptor.invocation.kind === "direct") add(direct, descriptor, "direct");
					if (scopedProjection(descriptor) !== void 0) add(scoped, descriptor, "scoped");
				}
				const namespaces = new Set([...direct.keys(), ...scoped.keys()]);
				for (const namespace of namespaces) {
					const service = this.namespaces.get(namespace)?.service;
					if (service === void 0) {
						if (namespace in this) throw new Error(`client api: namespace ${JSON.stringify(namespace)} conflicts with the Remote service`);
						const serviceKey = remoteServiceKey(namespace);
						if (this.ownerCtx.reflect.props[serviceKey]?.type === "accessor" || this.ownerCtx.get(serviceKey) !== void 0) throw new Error(`client api: namespace ${JSON.stringify(namespace)} conflicts with an existing Remote namespace`);
					}
					for (const method of new Set([...direct.get(namespace) ?? [], ...scoped.get(namespace) ?? []])) if (service === void 0) RemoteNamespaceService.assertMethodAvailable(namespace, method);
					else service.assertMethodAvailable(method);
				}
			}
			async install(descriptor) {
				const token = {
					active: true,
					abort: new AbortController()
				};
				const installed = [];
				try {
					if (descriptor.invocation.kind === "direct") installed.push(await this.installDirect(descriptor, token));
					const projection = scopedProjection(descriptor);
					if (projection !== void 0) installed.push(await this.installScoped(descriptor, projection, token));
				} catch (error) {
					token.active = false;
					token.abort.abort();
					for (const dispose of installed.reverse()) await dispose();
					throw error;
				}
				return async () => {
					/* v8 ignore next -- Cordis effect disposers are idempotent and invoke this cleanup at most once. */
					if (!token.active) return;
					token.active = false;
					token.abort.abort();
					for (const dispose of installed.reverse()) await dispose();
				};
			}
			async installDirect(descriptor, token) {
				const namespace = await this.namespace(descriptor.namespace);
				try {
					namespace.service.installDirect(descriptor, token);
				} catch (error) {
					await this.disposeNamespace(descriptor.namespace, namespace);
					throw error;
				}
				return async () => {
					namespace.service.remove("direct", descriptor.method, token);
					await this.disposeNamespace(descriptor.namespace, namespace);
				};
			}
			async installScoped(descriptor, projection, token) {
				const namespace = await this.namespace(descriptor.namespace);
				try {
					namespace.service.installScoped(descriptor, projection, token);
				} catch (error) {
					await this.disposeNamespace(descriptor.namespace, namespace);
					throw error;
				}
				return async () => {
					namespace.service.remove("scoped", descriptor.method, token);
					await this.disposeNamespace(descriptor.namespace, namespace);
				};
			}
			async namespace(name) {
				let namespace = this.namespaces.get(name);
				if (namespace !== void 0) return namespace;
				let service;
				const fiber = this.ownerCtx.plugin({
					name: remoteServiceKey(name),
					apply: (ctx) => {
						service = new RemoteNamespaceService(ctx, name, (direct, scoped, caller, args) => this.invokeMethod(direct, scoped, caller, args));
					}
				});
				try {
					await fiber;
				} catch (error) {
					await fiber.dispose();
					throw error;
				}
				/* v8 ignore next -- a settled namespace fiber synchronously constructs its Service. */
				if (service === void 0) throw new Error(`client api: namespace ${JSON.stringify(name)} did not start`);
				namespace = {
					service,
					dispose: fiber.dispose
				};
				this.namespaces.set(name, namespace);
				return namespace;
			}
			async disposeNamespace(name, namespace) {
				if (!namespace.service.empty || this.namespaces.get(name) !== namespace) return;
				this.namespaces.delete(name);
				await namespace.dispose();
			}
			invokeMethod(direct, scoped, callerCtx, values) {
				if (scoped !== void 0) {
					const identity = this.ownerCtx.typert.contexts.getClient(scoped.projection.context)?.identity(callerCtx);
					if (identity !== void 0) return this.invoke(scoped.descriptor, scoped.projection, scoped.token, callerCtx, values, { value: identity });
				}
				if (direct !== void 0) return this.invoke(direct.descriptor, void 0, direct.token, callerCtx, values);
				if (scoped !== void 0) return this.invoke(scoped.descriptor, scoped.projection, scoped.token, callerCtx, values);
				throw new Error("client api: Remote method is no longer mounted");
			}
			async invoke(descriptor, projection, token, callerCtx, values, boundIdentity) {
				const endpoint = endpointOf(descriptor);
				if (!token.active) return withdrawn(endpoint);
				const expected = descriptor.parameters.length - (projection?.parameterIndex === void 0 ? 0 : 1);
				const hasCallerSignal = descriptor.cancellation !== void 0 && values.length === expected + 1;
				if (values.length !== expected && !hasCallerSignal) {
					const contract = descriptor.cancellation === void 0 ? `${String(expected)} argument(s)` : `${String(expected)} business argument(s) plus an optional AbortSignal`;
					throw new Error(`client api: ${endpoint} expected ${contract}, got ${String(values.length)}`);
				}
				const args = Object.create(null);
				if (projection !== void 0) {
					const binder = boundIdentity === void 0 ? this.ownerCtx.typert.contexts.getClient(projection.context) : void 0;
					if (boundIdentity === void 0 && binder === void 0) throw new Error(`client api: ${endpoint} has no Client Context binder for ${JSON.stringify(projection.context)}`);
					const identity = boundIdentity === void 0 ? binder?.identity(callerCtx) : boundIdentity.value;
					if (identity === void 0) throw new Error(`client api: ${endpoint} requires a ${JSON.stringify(projection.context)} Context`);
					args[projection.wire] = parse(projection.codec, identity, endpoint, projection.wire);
				}
				let valueIndex = 0;
				descriptor.parameters.forEach((parameter, parameterIndex) => {
					if (parameterIndex === projection?.parameterIndex) return;
					const value = parse(parameter.codec, values[valueIndex], endpoint, parameter.wire);
					if (value !== void 0) args[parameter.wire] = value;
					valueIndex += 1;
				});
				const connection = this.ownerCtx.get("connection");
				if (connection === void 0) throw new Error(`client api: ${endpoint} has no active Connection`);
				const callerSignal = hasCallerSignal ? values[expected] : void 0;
				const signal = callerSignal === void 0 ? token.abort.signal : AbortSignal.any([token.abort.signal, callerSignal]);
				try {
					const result = await connection.rpc.call("/api", endpoint, { args }, signal);
					if (!mountActive(token)) return withdrawn(endpoint);
					if (!result.ok) return {
						ok: false,
						error: result.error
					};
					return {
						ok: true,
						value: parse(descriptor.result, result.value, endpoint, "result")
					};
				} catch (error) {
					return carrierFailure(endpoint, error);
				}
			}
		};
		var RemoteNamespaceService = class RemoteNamespaceService extends _deepseek_ai_cordis.Service {
			invokeRemote;
			methods = /* @__PURE__ */ new Map();
			namespace;
			static assertMethodAvailable(namespace, method) {
				if (REMOTE_NAMESPACE_FIELDS.has(method) || method in RemoteNamespaceService.prototype) throw new Error(`client api: method ${JSON.stringify(`${namespace}/${method}`)} conflicts with its namespace service`);
			}
			constructor(ctx, name, invokeRemote) {
				super(ctx, remoteServiceKey(name));
				this.invokeRemote = invokeRemote;
				this.namespace = name;
			}
			assertMethodAvailable(method) {
				RemoteNamespaceService.assertMethodAvailable(this.namespace, method);
				if (method in this && !this.methods.has(method)) throw new Error(`client api: method ${JSON.stringify(`${this.namespace}/${method}`)} conflicts with its namespace service`);
			}
			get empty() {
				return this.methods.size === 0;
			}
			has(kind, method) {
				return this.methods.get(method)?.[kind] !== void 0;
			}
			installDirect(descriptor, token) {
				this.install(descriptor.method, "direct", {
					descriptor,
					token
				});
			}
			installScoped(descriptor, projection, token) {
				this.install(descriptor.method, "scoped", {
					descriptor,
					projection,
					token
				});
			}
			install(method, kind, value) {
				this.assertMethodAvailable(method);
				let record = this.methods.get(method);
				const fresh = record === void 0;
				record ??= {};
				if (fresh) {
					Object.defineProperty(this, method, {
						configurable: true,
						enumerable: true,
						get: function() {
							const callerCtx = this.ctx;
							const current = this.methods.get(method);
							const direct = current?.direct;
							const scoped = current?.scoped;
							return (...args) => {
								return this.invokeRemote(direct, scoped, callerCtx, args);
							};
						}
					});
					this.methods.set(method, record);
				}
				if (kind === "direct") record.direct = value;
				else record.scoped = value;
			}
			remove(kind, method, token) {
				const record = this.methods.get(method);
				const current = record?.[kind];
				/* v8 ignore next -- duplicate live variants are rejected before installation, so no newer token can replace this one. */
				if (record === void 0 || current?.token !== token) return;
				if (kind === "direct") delete record.direct;
				else delete record.scoped;
				if (record.direct !== void 0 || record.scoped !== void 0) return;
				this.methods.delete(method);
				Reflect.deleteProperty(this, method);
			}
		};
		const REMOTE_NAMESPACE_FIELDS = new Set([
			"ctx",
			"empty",
			"invokeRemote",
			"methods",
			"name",
			"namespace"
		]);
		function remoteServiceKey(namespace) {
			return `remote.${namespace}`;
		}
		function endpointOf(descriptor) {
			return `${descriptor.namespace}/${descriptor.method}`;
		}
		function mountActive(token) {
			return token.active;
		}
		function scopedProjection(descriptor) {
			if (descriptor.invocation.kind === "context") return {
				context: descriptor.invocation.context,
				wire: descriptor.invocation.wire,
				codec: descriptor.invocation.codec
			};
			if (descriptor.scope === void 0) return void 0;
			const lookupParameters = descriptor.parameters.map((parameter, index) => ({
				parameter,
				index
			})).filter((candidate) => candidate.parameter.source === "lookup");
			const selected = lookupParameters.length === 1 ? lookupParameters[0] : void 0;
			if (selected === void 0 || selected.parameter.wire !== descriptor.scope.wire || selected.parameter.lookup !== descriptor.scope.context) throw new Error(`client api: generated Remote ${endpointOf(descriptor)} scope must select its only lookup parameter`);
			return {
				context: descriptor.scope.context,
				wire: descriptor.scope.wire,
				codec: selected.parameter.codec,
				parameterIndex: selected.index
			};
		}
		function requireStrictDescriptor(descriptor) {
			const endpoint = endpointOf(descriptor);
			requireStrictCodec(descriptor.result, endpoint, "result");
			for (const parameter of descriptor.parameters) requireStrictCodec(parameter.codec, endpoint, parameter.wire);
			if (descriptor.invocation.kind === "context") requireStrictCodec(descriptor.invocation.codec, endpoint, descriptor.invocation.wire);
		}
		function requireStrictCodec(codec, endpoint, field) {
			if (codec.mode !== "strict") throw new Error(`client api: generated Remote ${endpoint} field ${JSON.stringify(field)} has no strict codec`);
		}
		function parse(codec, value, endpoint, field) {
			if (codec.mode !== "strict") throw new Error(`client api: generated Remote ${endpoint} field ${JSON.stringify(field)} has no strict codec`);
			try {
				return codec.schema.parse(value);
			} catch (cause) {
				throw new Error(`client api: ${endpoint} rejected ${JSON.stringify(field)}`, { cause });
			}
		}
		/** The namespace retired before or during the call, so no request outcome exists. */
		function withdrawn(endpoint) {
			return internalFailure(`client api: Remote method ${endpoint} is no longer mounted`);
		}
		function carrierFailure(endpoint, error) {
			return internalFailure(`client api: ${endpoint} failed: ${error instanceof Error ? error.message : String(error)}`);
		}
		function internalFailure(message) {
			return {
				ok: false,
				error: {
					code: "internal",
					message,
					details: {}
				}
			};
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map