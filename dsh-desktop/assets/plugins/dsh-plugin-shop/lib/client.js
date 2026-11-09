window.__ModuleLoader__.load({
	id: "dsh-plugin-shop",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region \0rolldown/runtime.js
		var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
		//#endregion
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/core.js
		var _a$1;
		function $constructor(name, initializer, params) {
			function init(inst, def) {
				if (!inst._zod) Object.defineProperty(inst, "_zod", {
					value: {
						def,
						constr: _,
						traits: /* @__PURE__ */ new Set()
					},
					enumerable: false
				});
				if (inst._zod.traits.has(name)) return;
				inst._zod.traits.add(name);
				initializer(inst, def);
				const proto = _.prototype;
				const keys = Object.keys(proto);
				for (let i = 0; i < keys.length; i++) {
					const k = keys[i];
					if (!(k in inst)) inst[k] = proto[k].bind(inst);
				}
			}
			const Parent = params?.Parent ?? Object;
			class Definition extends Parent {}
			Object.defineProperty(Definition, "name", { value: name });
			function _(def) {
				var _a;
				const inst = params?.Parent ? new Definition() : this;
				init(inst, def);
				(_a = inst._zod).deferred ?? (_a.deferred = []);
				for (const fn of inst._zod.deferred) fn();
				return inst;
			}
			Object.defineProperty(_, "init", { value: init });
			Object.defineProperty(_, Symbol.hasInstance, { value: (inst) => {
				if (params?.Parent && inst instanceof params.Parent) return true;
				return inst?._zod?.traits?.has(name);
			} });
			Object.defineProperty(_, "name", { value: name });
			return _;
		}
		var $ZodAsyncError = class extends Error {
			constructor() {
				super(`Encountered Promise during synchronous parse. Use .parseAsync() instead.`);
			}
		};
		var $ZodEncodeError = class extends Error {
			constructor(name) {
				super(`Encountered unidirectional transform during encode: ${name}`);
				this.name = "ZodEncodeError";
			}
		};
		(_a$1 = globalThis).__zod_globalConfig ?? (_a$1.__zod_globalConfig = {});
		const globalConfig = globalThis.__zod_globalConfig;
		function config(newConfig) {
			if (newConfig) Object.assign(globalConfig, newConfig);
			return globalConfig;
		}
		//#endregion
		//#region ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/util.js
		function getEnumValues(entries) {
			const numericValues = Object.values(entries).filter((v) => typeof v === "number");
			return Object.entries(entries).filter(([k, _]) => numericValues.indexOf(+k) === -1).map(([_, v]) => v);
		}
		function jsonStringifyReplacer(_, value) {
			if (typeof value === "bigint") return value.toString();
			return value;
		}
		function cached(getter) {
			return { get value() {
				{
					const value = getter();
					Object.defineProperty(this, "value", { value });
					return value;
				}
			} };
		}
		function nullish(input) {
			return input === null || input === void 0;
		}
		function cleanRegex(source) {
			const start = source.startsWith("^") ? 1 : 0;
			const end = source.endsWith("$") ? source.length - 1 : source.length;
			return source.slice(start, end);
		}
		function floatSafeRemainder(val, step) {
			const ratio = val / step;
			const roundedRatio = Math.round(ratio);
			const tolerance = Number.EPSILON * Math.max(Math.abs(ratio), 1);
			if (Math.abs(ratio - roundedRatio) < tolerance) return 0;
			return ratio - roundedRatio;
		}
		const EVALUATING = /* @__PURE__*/ Symbol("evaluating");
		function defineLazy(object, key, getter) {
			let value = void 0;
			Object.defineProperty(object, key, {
				get() {
					if (value === EVALUATING) return;
					if (value === void 0) {
						value = EVALUATING;
						value = getter();
					}
					return value;
				},
				set(v) {
					Object.defineProperty(object, key, { value: v });
				},
				configurable: true
			});
		}
		function assignProp(target, prop, value) {
			Object.defineProperty(target, prop, {
				value,
				writable: true,
				enumerable: true,
				configurable: true
			});
		}
		function mergeDefs(...defs) {
			const mergedDescriptors = {};
			for (const def of defs) {
				const descriptors = Object.getOwnPropertyDescriptors(def);
				Object.assign(mergedDescriptors, descriptors);
			}
			return Object.defineProperties({}, mergedDescriptors);
		}
		function esc(str) {
			return JSON.stringify(str);
		}
		function slugify(input) {
			return input.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
		}
		const captureStackTrace = "captureStackTrace" in Error ? Error.captureStackTrace : (..._args) => {};
		function isObject(data) {
			return typeof data === "object" && data !== null && !Array.isArray(data);
		}
		const allowsEval = /* @__PURE__*/ cached(() => {
			if (globalConfig.jitless) return false;
			if (typeof navigator !== "undefined" && navigator?.userAgent?.includes("Cloudflare")) return false;
			try {
				new Function("");
				return true;
			} catch (_) {
				return false;
			}
		});
		function isPlainObject(o) {
			if (isObject(o) === false) return false;
			const ctor = o.constructor;
			if (ctor === void 0) return true;
			if (typeof ctor !== "function") return true;
			const prot = ctor.prototype;
			if (isObject(prot) === false) return false;
			if (Object.prototype.hasOwnProperty.call(prot, "isPrototypeOf") === false) return false;
			return true;
		}
		function shallowClone(o) {
			if (isPlainObject(o)) return { ...o };
			if (Array.isArray(o)) return [...o];
			if (o instanceof Map) return new Map(o);
			if (o instanceof Set) return new Set(o);
			return o;
		}
		const propertyKeyTypes = /* @__PURE__*/ new Set([
			"string",
			"number",
			"symbol"
		]);
		function escapeRegex(str) {
			return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		}
		function clone(inst, def, params) {
			const cl = new inst._zod.constr(def ?? inst._zod.def);
			if (!def || params?.parent) cl._zod.parent = inst;
			return cl;
		}
		function normalizeParams(_params) {
			const params = _params;
			if (!params) return {};
			if (typeof params === "string") return { error: () => params };
			if (params?.message !== void 0) {
				if (params?.error !== void 0) throw new Error("Cannot specify both `message` and `error` params");
				params.error = params.message;
			}
			delete params.message;
			if (typeof params.error === "string") return {
				...params,
				error: () => params.error
			};
			return params;
		}
		function optionalKeys(shape) {
			return Object.keys(shape).filter((k) => {
				return shape[k]._zod.optin === "optional" && shape[k]._zod.optout === "optional";
			});
		}
		const NUMBER_FORMAT_RANGES = {
			safeint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
			int32: [-2147483648, 2147483647],
			uint32: [0, 4294967295],
			float32: [-34028234663852886e22, 34028234663852886e22],
			float64: [-Number.MAX_VALUE, Number.MAX_VALUE]
		};
		function pick(schema, mask) {
			const currDef = schema._zod.def;
			const checks = currDef.checks;
			if (checks && checks.length > 0) throw new Error(".pick() cannot be used on object schemas containing refinements");
			return clone(schema, mergeDefs(schema._zod.def, {
				get shape() {
					const newShape = {};
					for (const key in mask) {
						if (!(key in currDef.shape)) throw new Error(`Unrecognized key: "${key}"`);
						if (!mask[key]) continue;
						newShape[key] = currDef.shape[key];
					}
					assignProp(this, "shape", newShape);
					return newShape;
				},
				checks: []
			}));
		}
		function omit(schema, mask) {
			const currDef = schema._zod.def;
			const checks = currDef.checks;
			if (checks && checks.length > 0) throw new Error(".omit() cannot be used on object schemas containing refinements");
			return clone(schema, mergeDefs(schema._zod.def, {
				get shape() {
					const newShape = { ...schema._zod.def.shape };
					for (const key in mask) {
						if (!(key in currDef.shape)) throw new Error(`Unrecognized key: "${key}"`);
						if (!mask[key]) continue;
						delete newShape[key];
					}
					assignProp(this, "shape", newShape);
					return newShape;
				},
				checks: []
			}));
		}
		function extend(schema, shape) {
			if (!isPlainObject(shape)) throw new Error("Invalid input to extend: expected a plain object");
			const checks = schema._zod.def.checks;
			if (checks && checks.length > 0) {
				const existingShape = schema._zod.def.shape;
				for (const key in shape) if (Object.getOwnPropertyDescriptor(existingShape, key) !== void 0) throw new Error("Cannot overwrite keys on object schemas containing refinements. Use `.safeExtend()` instead.");
			}
			return clone(schema, mergeDefs(schema._zod.def, { get shape() {
				const _shape = {
					...schema._zod.def.shape,
					...shape
				};
				assignProp(this, "shape", _shape);
				return _shape;
			} }));
		}
		function safeExtend(schema, shape) {
			if (!isPlainObject(shape)) throw new Error("Invalid input to safeExtend: expected a plain object");
			return clone(schema, mergeDefs(schema._zod.def, { get shape() {
				const _shape = {
					...schema._zod.def.shape,
					...shape
				};
				assignProp(this, "shape", _shape);
				return _shape;
			} }));
		}
		function merge(a, b) {
			if (a._zod.def.checks?.length) throw new Error(".merge() cannot be used on object schemas containing refinements. Use .safeExtend() instead.");
			return clone(a, mergeDefs(a._zod.def, {
				get shape() {
					const _shape = {
						...a._zod.def.shape,
						...b._zod.def.shape
					};
					assignProp(this, "shape", _shape);
					return _shape;
				},
				get catchall() {
					return b._zod.def.catchall;
				},
				checks: b._zod.def.checks ?? []
			}));
		}
		function partial(Class, schema, mask) {
			const checks = schema._zod.def.checks;
			if (checks && checks.length > 0) throw new Error(".partial() cannot be used on object schemas containing refinements");
			return clone(schema, mergeDefs(schema._zod.def, {
				get shape() {
					const oldShape = schema._zod.def.shape;
					const shape = { ...oldShape };
					if (mask) for (const key in mask) {
						if (!(key in oldShape)) throw new Error(`Unrecognized key: "${key}"`);
						if (!mask[key]) continue;
						shape[key] = Class ? new Class({
							type: "optional",
							innerType: oldShape[key]
						}) : oldShape[key];
					}
					else for (const key in oldShape) shape[key] = Class ? new Class({
						type: "optional",
						innerType: oldShape[key]
					}) : oldShape[key];
					assignProp(this, "shape", shape);
					return shape;
				},
				checks: []
			}));
		}
		function required(Class, schema, mask) {
			return clone(schema, mergeDefs(schema._zod.def, { get shape() {
				const oldShape = schema._zod.def.shape;
				const shape = { ...oldShape };
				if (mask) for (const key in mask) {
					if (!(key in shape)) throw new Error(`Unrecognized key: "${key}"`);
					if (!mask[key]) continue;
					shape[key] = new Class({
						type: "nonoptional",
						innerType: oldShape[key]
					});
				}
				else for (const key in oldShape) shape[key] = new Class({
					type: "nonoptional",
					innerType: oldShape[key]
				});
				assignProp(this, "shape", shape);
				return shape;
			} }));
		}
		function aborted(x, startIndex = 0) {
			if (x.aborted === true) return true;
			for (let i = startIndex; i < x.issues.length; i++) if (x.issues[i]?.continue !== true) return true;
			return false;
		}
		function explicitlyAborted(x, startIndex = 0) {
			if (x.aborted === true) return true;
			for (let i = startIndex; i < x.issues.length; i++) if (x.issues[i]?.continue === false) return true;
			return false;
		}
		function prefixIssues(path, issues) {
			return issues.map((iss) => {
				var _a;
				(_a = iss).path ?? (_a.path = []);
				iss.path.unshift(path);
				return iss;
			});
		}
		function unwrapMessage(message) {
			return typeof message === "string" ? message : message?.message;
		}
		function finalizeIssue(iss, ctx, config) {
			const message = iss.message ? iss.message : unwrapMessage(iss.inst?._zod.def?.error?.(iss)) ?? unwrapMessage(ctx?.error?.(iss)) ?? unwrapMessage(config.customError?.(iss)) ?? unwrapMessage(config.localeError?.(iss)) ?? "Invalid input";
			const { inst: _inst, continue: _continue, input: _input, ...rest } = iss;
			rest.path ?? (rest.path = []);
			rest.message = message;
			if (ctx?.reportInput) rest.input = _input;
			return rest;
		}
		function getLengthableOrigin(input) {
			if (Array.isArray(input)) return "array";
			if (typeof input === "string") return "string";
			return "unknown";
		}
		function issue(...args) {
			const [iss, input, inst] = args;
			if (typeof iss === "string") return {
				message: iss,
				code: "custom",
				input,
				inst
			};
			return { ...iss };
		}
		//#endregion
		//#region ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/errors.js
		const initializer$1 = (inst, def) => {
			inst.name = "$ZodError";
			Object.defineProperty(inst, "_zod", {
				value: inst._zod,
				enumerable: false
			});
			Object.defineProperty(inst, "issues", {
				value: def,
				enumerable: false
			});
			inst.message = JSON.stringify(def, jsonStringifyReplacer, 2);
			Object.defineProperty(inst, "toString", {
				value: () => inst.message,
				enumerable: false
			});
		};
		const $ZodError = $constructor("$ZodError", initializer$1);
		const $ZodRealError = $constructor("$ZodError", initializer$1, { Parent: Error });
		function flattenError(error, mapper = (issue) => issue.message) {
			const fieldErrors = {};
			const formErrors = [];
			for (const sub of error.issues) if (sub.path.length > 0) {
				fieldErrors[sub.path[0]] = fieldErrors[sub.path[0]] || [];
				fieldErrors[sub.path[0]].push(mapper(sub));
			} else formErrors.push(mapper(sub));
			return {
				formErrors,
				fieldErrors
			};
		}
		function formatError(error, mapper = (issue) => issue.message) {
			const fieldErrors = { _errors: [] };
			const processError = (error, path = []) => {
				for (const issue of error.issues) if (issue.code === "invalid_union" && issue.errors.length) issue.errors.map((issues) => processError({ issues }, [...path, ...issue.path]));
				else if (issue.code === "invalid_key") processError({ issues: issue.issues }, [...path, ...issue.path]);
				else if (issue.code === "invalid_element") processError({ issues: issue.issues }, [...path, ...issue.path]);
				else {
					const fullpath = [...path, ...issue.path];
					if (fullpath.length === 0) fieldErrors._errors.push(mapper(issue));
					else {
						let curr = fieldErrors;
						let i = 0;
						while (i < fullpath.length) {
							const el = fullpath[i];
							if (!(i === fullpath.length - 1)) curr[el] = curr[el] || { _errors: [] };
							else {
								curr[el] = curr[el] || { _errors: [] };
								curr[el]._errors.push(mapper(issue));
							}
							curr = curr[el];
							i++;
						}
					}
				}
			};
			processError(error);
			return fieldErrors;
		}
		//#endregion
		//#region ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/parse.js
		const _parse = (_Err) => (schema, value, _ctx, _params) => {
			const ctx = _ctx ? {
				..._ctx,
				async: false
			} : { async: false };
			const result = schema._zod.run({
				value,
				issues: []
			}, ctx);
			if (result instanceof Promise) throw new $ZodAsyncError();
			if (result.issues.length) {
				const e = new ((_params?.Err) ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
				captureStackTrace(e, _params?.callee);
				throw e;
			}
			return result.value;
		};
		const _parseAsync = (_Err) => async (schema, value, _ctx, params) => {
			const ctx = _ctx ? {
				..._ctx,
				async: true
			} : { async: true };
			let result = schema._zod.run({
				value,
				issues: []
			}, ctx);
			if (result instanceof Promise) result = await result;
			if (result.issues.length) {
				const e = new ((params?.Err) ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
				captureStackTrace(e, params?.callee);
				throw e;
			}
			return result.value;
		};
		const _safeParse = (_Err) => (schema, value, _ctx) => {
			const ctx = _ctx ? {
				..._ctx,
				async: false
			} : { async: false };
			const result = schema._zod.run({
				value,
				issues: []
			}, ctx);
			if (result instanceof Promise) throw new $ZodAsyncError();
			return result.issues.length ? {
				success: false,
				error: new (_Err ?? $ZodError)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
			} : {
				success: true,
				data: result.value
			};
		};
		const safeParse$1 = /* @__PURE__*/ _safeParse($ZodRealError);
		const _safeParseAsync = (_Err) => async (schema, value, _ctx) => {
			const ctx = _ctx ? {
				..._ctx,
				async: true
			} : { async: true };
			let result = schema._zod.run({
				value,
				issues: []
			}, ctx);
			if (result instanceof Promise) result = await result;
			return result.issues.length ? {
				success: false,
				error: new _Err(result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
			} : {
				success: true,
				data: result.value
			};
		};
		const safeParseAsync$1 = /* @__PURE__*/ _safeParseAsync($ZodRealError);
		const _encode = (_Err) => (schema, value, _ctx) => {
			const ctx = _ctx ? {
				..._ctx,
				direction: "backward"
			} : { direction: "backward" };
			return _parse(_Err)(schema, value, ctx);
		};
		const _decode = (_Err) => (schema, value, _ctx) => {
			return _parse(_Err)(schema, value, _ctx);
		};
		const _encodeAsync = (_Err) => async (schema, value, _ctx) => {
			const ctx = _ctx ? {
				..._ctx,
				direction: "backward"
			} : { direction: "backward" };
			return _parseAsync(_Err)(schema, value, ctx);
		};
		const _decodeAsync = (_Err) => async (schema, value, _ctx) => {
			return _parseAsync(_Err)(schema, value, _ctx);
		};
		const _safeEncode = (_Err) => (schema, value, _ctx) => {
			const ctx = _ctx ? {
				..._ctx,
				direction: "backward"
			} : { direction: "backward" };
			return _safeParse(_Err)(schema, value, ctx);
		};
		const _safeDecode = (_Err) => (schema, value, _ctx) => {
			return _safeParse(_Err)(schema, value, _ctx);
		};
		const _safeEncodeAsync = (_Err) => async (schema, value, _ctx) => {
			const ctx = _ctx ? {
				..._ctx,
				direction: "backward"
			} : { direction: "backward" };
			return _safeParseAsync(_Err)(schema, value, ctx);
		};
		const _safeDecodeAsync = (_Err) => async (schema, value, _ctx) => {
			return _safeParseAsync(_Err)(schema, value, _ctx);
		};
		//#endregion
		//#region ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/regexes.js
		/**
		* @deprecated CUID v1 is deprecated by its authors due to information leakage
		* (timestamps embedded in the id). Use {@link cuid2} instead.
		* See https://github.com/paralleldrive/cuid.
		*/
		const cuid = /^[cC][0-9a-z]{6,}$/;
		const cuid2 = /^[0-9a-z]+$/;
		const ulid = /^[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{26}$/;
		const xid = /^[0-9a-vA-V]{20}$/;
		const ksuid = /^[A-Za-z0-9]{27}$/;
		const nanoid = /^[a-zA-Z0-9_-]{21}$/;
		/** ISO 8601-1 duration regex. Does not support the 8601-2 extensions like negative durations or fractional/negative components. */
		const duration$1 = /^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/;
		/** A regex for any UUID-like identifier: 8-4-4-4-12 hex pattern */
		const guid = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;
		/** Returns a regex for validating an RFC 9562/4122 UUID.
		*
		* @param version Optionally specify a version 1-8. If no version is specified, all versions are supported. */
		const uuid = (version) => {
			if (!version) return /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;
			return new RegExp(`^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${version}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`);
		};
		/** Practical email validation */
		const email = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;
		const _emoji$1 = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
		function emoji() {
			return new RegExp(_emoji$1, "u");
		}
		const ipv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
		const ipv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/;
		const cidrv4 = /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/;
		const cidrv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::|([0-9a-fA-F]{1,4})?::([0-9a-fA-F]{1,4}:?){0,6})\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
		const base64 = /^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/;
		const base64url = /^[A-Za-z0-9_-]*$/;
		const httpProtocol = /^https?$/;
		const e164 = /^\+[1-9]\d{6,14}$/;
		const dateSource = `(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))`;
		const date$1 = /*@__PURE__*/ new RegExp(`^${dateSource}$`);
		function timeSource(args) {
			const hhmm = `(?:[01]\\d|2[0-3]):[0-5]\\d`;
			return typeof args.precision === "number" ? args.precision === -1 ? `${hhmm}` : args.precision === 0 ? `${hhmm}:[0-5]\\d` : `${hhmm}:[0-5]\\d\\.\\d{${args.precision}}` : `${hhmm}(?::[0-5]\\d(?:\\.\\d+)?)?`;
		}
		function time$1(args) {
			return new RegExp(`^${timeSource(args)}$`);
		}
		function datetime$1(args) {
			const time = timeSource({ precision: args.precision });
			const opts = ["Z"];
			if (args.local) opts.push("");
			if (args.offset) opts.push(`([+-](?:[01]\\d|2[0-3]):[0-5]\\d)`);
			const timeRegex = `${time}(?:${opts.join("|")})`;
			return new RegExp(`^${dateSource}T(?:${timeRegex})$`);
		}
		const string$1 = (params) => {
			const regex = params ? `[\\s\\S]{${params?.minimum ?? 0},${params?.maximum ?? ""}}` : `[\\s\\S]*`;
			return new RegExp(`^${regex}$`);
		};
		const integer = /^-?\d+$/;
		const number$1 = /^-?\d+(?:\.\d+)?$/;
		const boolean$1 = /^(?:true|false)$/i;
		const _undefined$2 = /^undefined$/i;
		const lowercase = /^[^A-Z]*$/;
		const uppercase = /^[^a-z]*$/;
		//#endregion
		//#region ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/checks.js
		const $ZodCheck = /*@__PURE__*/ $constructor("$ZodCheck", (inst, def) => {
			var _a;
			inst._zod ?? (inst._zod = {});
			inst._zod.def = def;
			(_a = inst._zod).onattach ?? (_a.onattach = []);
		});
		const numericOriginMap = {
			number: "number",
			bigint: "bigint",
			object: "date"
		};
		const $ZodCheckLessThan = /*@__PURE__*/ $constructor("$ZodCheckLessThan", (inst, def) => {
			$ZodCheck.init(inst, def);
			const origin = numericOriginMap[typeof def.value];
			inst._zod.onattach.push((inst) => {
				const bag = inst._zod.bag;
				const curr = (def.inclusive ? bag.maximum : bag.exclusiveMaximum) ?? Number.POSITIVE_INFINITY;
				if (def.value < curr) {
					if (def.inclusive) bag.maximum = def.value;
					else bag.exclusiveMaximum = def.value;
				}
			});
			inst._zod.check = (payload) => {
				if (def.inclusive ? payload.value <= def.value : payload.value < def.value) return;
				payload.issues.push({
					origin,
					code: "too_big",
					maximum: typeof def.value === "object" ? def.value.getTime() : def.value,
					input: payload.value,
					inclusive: def.inclusive,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckGreaterThan = /*@__PURE__*/ $constructor("$ZodCheckGreaterThan", (inst, def) => {
			$ZodCheck.init(inst, def);
			const origin = numericOriginMap[typeof def.value];
			inst._zod.onattach.push((inst) => {
				const bag = inst._zod.bag;
				const curr = (def.inclusive ? bag.minimum : bag.exclusiveMinimum) ?? Number.NEGATIVE_INFINITY;
				if (def.value > curr) {
					if (def.inclusive) bag.minimum = def.value;
					else bag.exclusiveMinimum = def.value;
				}
			});
			inst._zod.check = (payload) => {
				if (def.inclusive ? payload.value >= def.value : payload.value > def.value) return;
				payload.issues.push({
					origin,
					code: "too_small",
					minimum: typeof def.value === "object" ? def.value.getTime() : def.value,
					input: payload.value,
					inclusive: def.inclusive,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckMultipleOf = /*@__PURE__*/ $constructor("$ZodCheckMultipleOf", (inst, def) => {
			$ZodCheck.init(inst, def);
			inst._zod.onattach.push((inst) => {
				var _a;
				(_a = inst._zod.bag).multipleOf ?? (_a.multipleOf = def.value);
			});
			inst._zod.check = (payload) => {
				if (typeof payload.value !== typeof def.value) throw new Error("Cannot mix number and bigint in multiple_of check.");
				if (typeof payload.value === "bigint" ? payload.value % def.value === BigInt(0) : floatSafeRemainder(payload.value, def.value) === 0) return;
				payload.issues.push({
					origin: typeof payload.value,
					code: "not_multiple_of",
					divisor: def.value,
					input: payload.value,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckNumberFormat = /*@__PURE__*/ $constructor("$ZodCheckNumberFormat", (inst, def) => {
			$ZodCheck.init(inst, def);
			def.format = def.format || "float64";
			const isInt = def.format?.includes("int");
			const origin = isInt ? "int" : "number";
			const [minimum, maximum] = NUMBER_FORMAT_RANGES[def.format];
			inst._zod.onattach.push((inst) => {
				const bag = inst._zod.bag;
				bag.format = def.format;
				bag.minimum = minimum;
				bag.maximum = maximum;
				if (isInt) bag.pattern = integer;
			});
			inst._zod.check = (payload) => {
				const input = payload.value;
				if (isInt) {
					if (!Number.isInteger(input)) {
						payload.issues.push({
							expected: origin,
							format: def.format,
							code: "invalid_type",
							continue: false,
							input,
							inst
						});
						return;
					}
					if (!Number.isSafeInteger(input)) {
						if (input > 0) payload.issues.push({
							input,
							code: "too_big",
							maximum: Number.MAX_SAFE_INTEGER,
							note: "Integers must be within the safe integer range.",
							inst,
							origin,
							inclusive: true,
							continue: !def.abort
						});
						else payload.issues.push({
							input,
							code: "too_small",
							minimum: Number.MIN_SAFE_INTEGER,
							note: "Integers must be within the safe integer range.",
							inst,
							origin,
							inclusive: true,
							continue: !def.abort
						});
						return;
					}
				}
				if (input < minimum) payload.issues.push({
					origin: "number",
					input,
					code: "too_small",
					minimum,
					inclusive: true,
					inst,
					continue: !def.abort
				});
				if (input > maximum) payload.issues.push({
					origin: "number",
					input,
					code: "too_big",
					maximum,
					inclusive: true,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckMaxLength = /*@__PURE__*/ $constructor("$ZodCheckMaxLength", (inst, def) => {
			var _a;
			$ZodCheck.init(inst, def);
			(_a = inst._zod.def).when ?? (_a.when = (payload) => {
				const val = payload.value;
				return !nullish(val) && val.length !== void 0;
			});
			inst._zod.onattach.push((inst) => {
				const curr = inst._zod.bag.maximum ?? Number.POSITIVE_INFINITY;
				if (def.maximum < curr) inst._zod.bag.maximum = def.maximum;
			});
			inst._zod.check = (payload) => {
				const input = payload.value;
				if (input.length <= def.maximum) return;
				const origin = getLengthableOrigin(input);
				payload.issues.push({
					origin,
					code: "too_big",
					maximum: def.maximum,
					inclusive: true,
					input,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckMinLength = /*@__PURE__*/ $constructor("$ZodCheckMinLength", (inst, def) => {
			var _a;
			$ZodCheck.init(inst, def);
			(_a = inst._zod.def).when ?? (_a.when = (payload) => {
				const val = payload.value;
				return !nullish(val) && val.length !== void 0;
			});
			inst._zod.onattach.push((inst) => {
				const curr = inst._zod.bag.minimum ?? Number.NEGATIVE_INFINITY;
				if (def.minimum > curr) inst._zod.bag.minimum = def.minimum;
			});
			inst._zod.check = (payload) => {
				const input = payload.value;
				if (input.length >= def.minimum) return;
				const origin = getLengthableOrigin(input);
				payload.issues.push({
					origin,
					code: "too_small",
					minimum: def.minimum,
					inclusive: true,
					input,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckLengthEquals = /*@__PURE__*/ $constructor("$ZodCheckLengthEquals", (inst, def) => {
			var _a;
			$ZodCheck.init(inst, def);
			(_a = inst._zod.def).when ?? (_a.when = (payload) => {
				const val = payload.value;
				return !nullish(val) && val.length !== void 0;
			});
			inst._zod.onattach.push((inst) => {
				const bag = inst._zod.bag;
				bag.minimum = def.length;
				bag.maximum = def.length;
				bag.length = def.length;
			});
			inst._zod.check = (payload) => {
				const input = payload.value;
				const length = input.length;
				if (length === def.length) return;
				const origin = getLengthableOrigin(input);
				const tooBig = length > def.length;
				payload.issues.push({
					origin,
					...tooBig ? {
						code: "too_big",
						maximum: def.length
					} : {
						code: "too_small",
						minimum: def.length
					},
					inclusive: true,
					exact: true,
					input: payload.value,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckStringFormat = /*@__PURE__*/ $constructor("$ZodCheckStringFormat", (inst, def) => {
			var _a, _b;
			$ZodCheck.init(inst, def);
			inst._zod.onattach.push((inst) => {
				const bag = inst._zod.bag;
				bag.format = def.format;
				if (def.pattern) {
					bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
					bag.patterns.add(def.pattern);
				}
			});
			if (def.pattern) (_a = inst._zod).check ?? (_a.check = (payload) => {
				def.pattern.lastIndex = 0;
				if (def.pattern.test(payload.value)) return;
				payload.issues.push({
					origin: "string",
					code: "invalid_format",
					format: def.format,
					input: payload.value,
					...def.pattern ? { pattern: def.pattern.toString() } : {},
					inst,
					continue: !def.abort
				});
			});
			else (_b = inst._zod).check ?? (_b.check = () => {});
		});
		const $ZodCheckRegex = /*@__PURE__*/ $constructor("$ZodCheckRegex", (inst, def) => {
			$ZodCheckStringFormat.init(inst, def);
			inst._zod.check = (payload) => {
				def.pattern.lastIndex = 0;
				if (def.pattern.test(payload.value)) return;
				payload.issues.push({
					origin: "string",
					code: "invalid_format",
					format: "regex",
					input: payload.value,
					pattern: def.pattern.toString(),
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckLowerCase = /*@__PURE__*/ $constructor("$ZodCheckLowerCase", (inst, def) => {
			def.pattern ?? (def.pattern = lowercase);
			$ZodCheckStringFormat.init(inst, def);
		});
		const $ZodCheckUpperCase = /*@__PURE__*/ $constructor("$ZodCheckUpperCase", (inst, def) => {
			def.pattern ?? (def.pattern = uppercase);
			$ZodCheckStringFormat.init(inst, def);
		});
		const $ZodCheckIncludes = /*@__PURE__*/ $constructor("$ZodCheckIncludes", (inst, def) => {
			$ZodCheck.init(inst, def);
			const escapedRegex = escapeRegex(def.includes);
			const pattern = new RegExp(typeof def.position === "number" ? `^.{${def.position}}${escapedRegex}` : escapedRegex);
			def.pattern = pattern;
			inst._zod.onattach.push((inst) => {
				const bag = inst._zod.bag;
				bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
				bag.patterns.add(pattern);
			});
			inst._zod.check = (payload) => {
				if (payload.value.includes(def.includes, def.position)) return;
				payload.issues.push({
					origin: "string",
					code: "invalid_format",
					format: "includes",
					includes: def.includes,
					input: payload.value,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckStartsWith = /*@__PURE__*/ $constructor("$ZodCheckStartsWith", (inst, def) => {
			$ZodCheck.init(inst, def);
			const pattern = new RegExp(`^${escapeRegex(def.prefix)}.*`);
			def.pattern ?? (def.pattern = pattern);
			inst._zod.onattach.push((inst) => {
				const bag = inst._zod.bag;
				bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
				bag.patterns.add(pattern);
			});
			inst._zod.check = (payload) => {
				if (payload.value.startsWith(def.prefix)) return;
				payload.issues.push({
					origin: "string",
					code: "invalid_format",
					format: "starts_with",
					prefix: def.prefix,
					input: payload.value,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckEndsWith = /*@__PURE__*/ $constructor("$ZodCheckEndsWith", (inst, def) => {
			$ZodCheck.init(inst, def);
			const pattern = new RegExp(`.*${escapeRegex(def.suffix)}$`);
			def.pattern ?? (def.pattern = pattern);
			inst._zod.onattach.push((inst) => {
				const bag = inst._zod.bag;
				bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
				bag.patterns.add(pattern);
			});
			inst._zod.check = (payload) => {
				if (payload.value.endsWith(def.suffix)) return;
				payload.issues.push({
					origin: "string",
					code: "invalid_format",
					format: "ends_with",
					suffix: def.suffix,
					input: payload.value,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodCheckOverwrite = /*@__PURE__*/ $constructor("$ZodCheckOverwrite", (inst, def) => {
			$ZodCheck.init(inst, def);
			inst._zod.check = (payload) => {
				payload.value = def.tx(payload.value);
			};
		});
		//#endregion
		//#region ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/doc.js
		var Doc = class {
			constructor(args = []) {
				this.content = [];
				this.indent = 0;
				if (this) this.args = args;
			}
			indented(fn) {
				this.indent += 1;
				fn(this);
				this.indent -= 1;
			}
			write(arg) {
				if (typeof arg === "function") {
					arg(this, { execution: "sync" });
					arg(this, { execution: "async" });
					return;
				}
				const lines = arg.split("\n").filter((x) => x);
				const minIndent = Math.min(...lines.map((x) => x.length - x.trimStart().length));
				const dedented = lines.map((x) => x.slice(minIndent)).map((x) => " ".repeat(this.indent * 2) + x);
				for (const line of dedented) this.content.push(line);
			}
			compile() {
				const F = Function;
				const args = this?.args;
				const lines = [...(this?.content ?? [``]).map((x) => `  ${x}`)];
				return new F(...args, lines.join("\n"));
			}
		};
		//#endregion
		//#region ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/versions.js
		const version = {
			major: 4,
			minor: 4,
			patch: 3
		};
		//#endregion
		//#region ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/schemas.js
		const $ZodType = /*@__PURE__*/ $constructor("$ZodType", (inst, def) => {
			var _a;
			inst ?? (inst = {});
			inst._zod.def = def;
			inst._zod.bag = inst._zod.bag || {};
			inst._zod.version = version;
			const checks = [...inst._zod.def.checks ?? []];
			if (inst._zod.traits.has("$ZodCheck")) checks.unshift(inst);
			for (const ch of checks) for (const fn of ch._zod.onattach) fn(inst);
			if (checks.length === 0) {
				(_a = inst._zod).deferred ?? (_a.deferred = []);
				inst._zod.deferred?.push(() => {
					inst._zod.run = inst._zod.parse;
				});
			} else {
				const runChecks = (payload, checks, ctx) => {
					let isAborted = aborted(payload);
					let asyncResult;
					for (const ch of checks) {
						if (ch._zod.def.when) {
							if (explicitlyAborted(payload)) continue;
							if (!ch._zod.def.when(payload)) continue;
						} else if (isAborted) continue;
						const currLen = payload.issues.length;
						const _ = ch._zod.check(payload);
						if (_ instanceof Promise && ctx?.async === false) throw new $ZodAsyncError();
						if (asyncResult || _ instanceof Promise) asyncResult = (asyncResult ?? Promise.resolve()).then(async () => {
							await _;
							if (payload.issues.length === currLen) return;
							if (!isAborted) isAborted = aborted(payload, currLen);
						});
						else {
							if (payload.issues.length === currLen) continue;
							if (!isAborted) isAborted = aborted(payload, currLen);
						}
					}
					if (asyncResult) return asyncResult.then(() => {
						return payload;
					});
					return payload;
				};
				const handleCanaryResult = (canary, payload, ctx) => {
					if (aborted(canary)) {
						canary.aborted = true;
						return canary;
					}
					const checkResult = runChecks(payload, checks, ctx);
					if (checkResult instanceof Promise) {
						if (ctx.async === false) throw new $ZodAsyncError();
						return checkResult.then((checkResult) => inst._zod.parse(checkResult, ctx));
					}
					return inst._zod.parse(checkResult, ctx);
				};
				inst._zod.run = (payload, ctx) => {
					if (ctx.skipChecks) return inst._zod.parse(payload, ctx);
					if (ctx.direction === "backward") {
						const canary = inst._zod.parse({
							value: payload.value,
							issues: []
						}, {
							...ctx,
							skipChecks: true
						});
						if (canary instanceof Promise) return canary.then((canary) => {
							return handleCanaryResult(canary, payload, ctx);
						});
						return handleCanaryResult(canary, payload, ctx);
					}
					const result = inst._zod.parse(payload, ctx);
					if (result instanceof Promise) {
						if (ctx.async === false) throw new $ZodAsyncError();
						return result.then((result) => runChecks(result, checks, ctx));
					}
					return runChecks(result, checks, ctx);
				};
			}
			defineLazy(inst, "~standard", () => ({
				validate: (value) => {
					try {
						const r = safeParse$1(inst, value);
						return r.success ? { value: r.data } : { issues: r.error?.issues };
					} catch (_) {
						return safeParseAsync$1(inst, value).then((r) => r.success ? { value: r.data } : { issues: r.error?.issues });
					}
				},
				vendor: "zod",
				version: 1
			}));
		});
		const $ZodString = /*@__PURE__*/ $constructor("$ZodString", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.pattern = [...inst?._zod.bag?.patterns ?? []].pop() ?? string$1(inst._zod.bag);
			inst._zod.parse = (payload, _) => {
				if (def.coerce) try {
					payload.value = String(payload.value);
				} catch (_) {}
				if (typeof payload.value === "string") return payload;
				payload.issues.push({
					expected: "string",
					code: "invalid_type",
					input: payload.value,
					inst
				});
				return payload;
			};
		});
		const $ZodStringFormat = /*@__PURE__*/ $constructor("$ZodStringFormat", (inst, def) => {
			$ZodCheckStringFormat.init(inst, def);
			$ZodString.init(inst, def);
		});
		const $ZodGUID = /*@__PURE__*/ $constructor("$ZodGUID", (inst, def) => {
			def.pattern ?? (def.pattern = guid);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodUUID = /*@__PURE__*/ $constructor("$ZodUUID", (inst, def) => {
			if (def.version) {
				const v = {
					v1: 1,
					v2: 2,
					v3: 3,
					v4: 4,
					v5: 5,
					v6: 6,
					v7: 7,
					v8: 8
				}[def.version];
				if (v === void 0) throw new Error(`Invalid UUID version: "${def.version}"`);
				def.pattern ?? (def.pattern = uuid(v));
			} else def.pattern ?? (def.pattern = uuid());
			$ZodStringFormat.init(inst, def);
		});
		const $ZodEmail = /*@__PURE__*/ $constructor("$ZodEmail", (inst, def) => {
			def.pattern ?? (def.pattern = email);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodURL = /*@__PURE__*/ $constructor("$ZodURL", (inst, def) => {
			$ZodStringFormat.init(inst, def);
			inst._zod.check = (payload) => {
				try {
					const trimmed = payload.value.trim();
					if (!def.normalize && def.protocol?.source === httpProtocol.source) {
						if (!/^https?:\/\//i.test(trimmed)) {
							payload.issues.push({
								code: "invalid_format",
								format: "url",
								note: "Invalid URL format",
								input: payload.value,
								inst,
								continue: !def.abort
							});
							return;
						}
					}
					const url = new URL(trimmed);
					if (def.hostname) {
						def.hostname.lastIndex = 0;
						if (!def.hostname.test(url.hostname)) payload.issues.push({
							code: "invalid_format",
							format: "url",
							note: "Invalid hostname",
							pattern: def.hostname.source,
							input: payload.value,
							inst,
							continue: !def.abort
						});
					}
					if (def.protocol) {
						def.protocol.lastIndex = 0;
						if (!def.protocol.test(url.protocol.endsWith(":") ? url.protocol.slice(0, -1) : url.protocol)) payload.issues.push({
							code: "invalid_format",
							format: "url",
							note: "Invalid protocol",
							pattern: def.protocol.source,
							input: payload.value,
							inst,
							continue: !def.abort
						});
					}
					if (def.normalize) payload.value = url.href;
					else payload.value = trimmed;
					return;
				} catch (_) {
					payload.issues.push({
						code: "invalid_format",
						format: "url",
						input: payload.value,
						inst,
						continue: !def.abort
					});
				}
			};
		});
		const $ZodEmoji = /*@__PURE__*/ $constructor("$ZodEmoji", (inst, def) => {
			def.pattern ?? (def.pattern = emoji());
			$ZodStringFormat.init(inst, def);
		});
		const $ZodNanoID = /*@__PURE__*/ $constructor("$ZodNanoID", (inst, def) => {
			def.pattern ?? (def.pattern = nanoid);
			$ZodStringFormat.init(inst, def);
		});
		/**
		* @deprecated CUID v1 is deprecated by its authors due to information leakage
		* (timestamps embedded in the id). Use {@link $ZodCUID2} instead.
		* See https://github.com/paralleldrive/cuid.
		*/
		const $ZodCUID = /*@__PURE__*/ $constructor("$ZodCUID", (inst, def) => {
			def.pattern ?? (def.pattern = cuid);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodCUID2 = /*@__PURE__*/ $constructor("$ZodCUID2", (inst, def) => {
			def.pattern ?? (def.pattern = cuid2);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodULID = /*@__PURE__*/ $constructor("$ZodULID", (inst, def) => {
			def.pattern ?? (def.pattern = ulid);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodXID = /*@__PURE__*/ $constructor("$ZodXID", (inst, def) => {
			def.pattern ?? (def.pattern = xid);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodKSUID = /*@__PURE__*/ $constructor("$ZodKSUID", (inst, def) => {
			def.pattern ?? (def.pattern = ksuid);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodISODateTime = /*@__PURE__*/ $constructor("$ZodISODateTime", (inst, def) => {
			def.pattern ?? (def.pattern = datetime$1(def));
			$ZodStringFormat.init(inst, def);
		});
		const $ZodISODate = /*@__PURE__*/ $constructor("$ZodISODate", (inst, def) => {
			def.pattern ?? (def.pattern = date$1);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodISOTime = /*@__PURE__*/ $constructor("$ZodISOTime", (inst, def) => {
			def.pattern ?? (def.pattern = time$1(def));
			$ZodStringFormat.init(inst, def);
		});
		const $ZodISODuration = /*@__PURE__*/ $constructor("$ZodISODuration", (inst, def) => {
			def.pattern ?? (def.pattern = duration$1);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodIPv4 = /*@__PURE__*/ $constructor("$ZodIPv4", (inst, def) => {
			def.pattern ?? (def.pattern = ipv4);
			$ZodStringFormat.init(inst, def);
			inst._zod.bag.format = `ipv4`;
		});
		const $ZodIPv6 = /*@__PURE__*/ $constructor("$ZodIPv6", (inst, def) => {
			def.pattern ?? (def.pattern = ipv6);
			$ZodStringFormat.init(inst, def);
			inst._zod.bag.format = `ipv6`;
			inst._zod.check = (payload) => {
				try {
					new URL(`http://[${payload.value}]`);
				} catch {
					payload.issues.push({
						code: "invalid_format",
						format: "ipv6",
						input: payload.value,
						inst,
						continue: !def.abort
					});
				}
			};
		});
		const $ZodCIDRv4 = /*@__PURE__*/ $constructor("$ZodCIDRv4", (inst, def) => {
			def.pattern ?? (def.pattern = cidrv4);
			$ZodStringFormat.init(inst, def);
		});
		const $ZodCIDRv6 = /*@__PURE__*/ $constructor("$ZodCIDRv6", (inst, def) => {
			def.pattern ?? (def.pattern = cidrv6);
			$ZodStringFormat.init(inst, def);
			inst._zod.check = (payload) => {
				const parts = payload.value.split("/");
				try {
					if (parts.length !== 2) throw new Error();
					const [address, prefix] = parts;
					if (!prefix) throw new Error();
					const prefixNum = Number(prefix);
					if (`${prefixNum}` !== prefix) throw new Error();
					if (prefixNum < 0 || prefixNum > 128) throw new Error();
					new URL(`http://[${address}]`);
				} catch {
					payload.issues.push({
						code: "invalid_format",
						format: "cidrv6",
						input: payload.value,
						inst,
						continue: !def.abort
					});
				}
			};
		});
		function isValidBase64(data) {
			if (data === "") return true;
			if (/\s/.test(data)) return false;
			if (data.length % 4 !== 0) return false;
			try {
				atob(data);
				return true;
			} catch {
				return false;
			}
		}
		const $ZodBase64 = /*@__PURE__*/ $constructor("$ZodBase64", (inst, def) => {
			def.pattern ?? (def.pattern = base64);
			$ZodStringFormat.init(inst, def);
			inst._zod.bag.contentEncoding = "base64";
			inst._zod.check = (payload) => {
				if (isValidBase64(payload.value)) return;
				payload.issues.push({
					code: "invalid_format",
					format: "base64",
					input: payload.value,
					inst,
					continue: !def.abort
				});
			};
		});
		function isValidBase64URL(data) {
			if (!base64url.test(data)) return false;
			const base64 = data.replace(/[-_]/g, (c) => c === "-" ? "+" : "/");
			return isValidBase64(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
		}
		const $ZodBase64URL = /*@__PURE__*/ $constructor("$ZodBase64URL", (inst, def) => {
			def.pattern ?? (def.pattern = base64url);
			$ZodStringFormat.init(inst, def);
			inst._zod.bag.contentEncoding = "base64url";
			inst._zod.check = (payload) => {
				if (isValidBase64URL(payload.value)) return;
				payload.issues.push({
					code: "invalid_format",
					format: "base64url",
					input: payload.value,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodE164 = /*@__PURE__*/ $constructor("$ZodE164", (inst, def) => {
			def.pattern ?? (def.pattern = e164);
			$ZodStringFormat.init(inst, def);
		});
		function isValidJWT(token, algorithm = null) {
			try {
				const tokensParts = token.split(".");
				if (tokensParts.length !== 3) return false;
				const [header] = tokensParts;
				if (!header) return false;
				const parsedHeader = JSON.parse(atob(header));
				if ("typ" in parsedHeader && parsedHeader?.typ !== "JWT") return false;
				if (!parsedHeader.alg) return false;
				if (algorithm && (!("alg" in parsedHeader) || parsedHeader.alg !== algorithm)) return false;
				return true;
			} catch {
				return false;
			}
		}
		const $ZodJWT = /*@__PURE__*/ $constructor("$ZodJWT", (inst, def) => {
			$ZodStringFormat.init(inst, def);
			inst._zod.check = (payload) => {
				if (isValidJWT(payload.value, def.alg)) return;
				payload.issues.push({
					code: "invalid_format",
					format: "jwt",
					input: payload.value,
					inst,
					continue: !def.abort
				});
			};
		});
		const $ZodNumber = /*@__PURE__*/ $constructor("$ZodNumber", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.pattern = inst._zod.bag.pattern ?? number$1;
			inst._zod.parse = (payload, _ctx) => {
				if (def.coerce) try {
					payload.value = Number(payload.value);
				} catch (_) {}
				const input = payload.value;
				if (typeof input === "number" && !Number.isNaN(input) && Number.isFinite(input)) return payload;
				const received = typeof input === "number" ? Number.isNaN(input) ? "NaN" : !Number.isFinite(input) ? "Infinity" : void 0 : void 0;
				payload.issues.push({
					expected: "number",
					code: "invalid_type",
					input,
					inst,
					...received ? { received } : {}
				});
				return payload;
			};
		});
		const $ZodNumberFormat = /*@__PURE__*/ $constructor("$ZodNumberFormat", (inst, def) => {
			$ZodCheckNumberFormat.init(inst, def);
			$ZodNumber.init(inst, def);
		});
		const $ZodBoolean = /*@__PURE__*/ $constructor("$ZodBoolean", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.pattern = boolean$1;
			inst._zod.parse = (payload, _ctx) => {
				if (def.coerce) try {
					payload.value = Boolean(payload.value);
				} catch (_) {}
				const input = payload.value;
				if (typeof input === "boolean") return payload;
				payload.issues.push({
					expected: "boolean",
					code: "invalid_type",
					input,
					inst
				});
				return payload;
			};
		});
		const $ZodUndefined = /*@__PURE__*/ $constructor("$ZodUndefined", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.pattern = _undefined$2;
			inst._zod.values = /* @__PURE__ */ new Set([void 0]);
			inst._zod.parse = (payload, _ctx) => {
				const input = payload.value;
				if (typeof input === "undefined") return payload;
				payload.issues.push({
					expected: "undefined",
					code: "invalid_type",
					input,
					inst
				});
				return payload;
			};
		});
		const $ZodUnknown = /*@__PURE__*/ $constructor("$ZodUnknown", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.parse = (payload) => payload;
		});
		const $ZodNever = /*@__PURE__*/ $constructor("$ZodNever", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.parse = (payload, _ctx) => {
				payload.issues.push({
					expected: "never",
					code: "invalid_type",
					input: payload.value,
					inst
				});
				return payload;
			};
		});
		function handleArrayResult(result, final, index) {
			if (result.issues.length) final.issues.push(...prefixIssues(index, result.issues));
			final.value[index] = result.value;
		}
		const $ZodArray = /*@__PURE__*/ $constructor("$ZodArray", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.parse = (payload, ctx) => {
				const input = payload.value;
				if (!Array.isArray(input)) {
					payload.issues.push({
						expected: "array",
						code: "invalid_type",
						input,
						inst
					});
					return payload;
				}
				payload.value = Array(input.length);
				const proms = [];
				for (let i = 0; i < input.length; i++) {
					const item = input[i];
					const result = def.element._zod.run({
						value: item,
						issues: []
					}, ctx);
					if (result instanceof Promise) proms.push(result.then((result) => handleArrayResult(result, payload, i)));
					else handleArrayResult(result, payload, i);
				}
				if (proms.length) return Promise.all(proms).then(() => payload);
				return payload;
			};
		});
		function handlePropertyResult(result, final, key, input, isOptionalIn, isOptionalOut) {
			const isPresent = key in input;
			if (result.issues.length) {
				if (isOptionalIn && isOptionalOut && !isPresent) return;
				final.issues.push(...prefixIssues(key, result.issues));
			}
			if (!isPresent && !isOptionalIn) {
				if (!result.issues.length) final.issues.push({
					code: "invalid_type",
					expected: "nonoptional",
					input: void 0,
					path: [key]
				});
				return;
			}
			if (result.value === void 0) {
				if (isPresent) final.value[key] = void 0;
			} else final.value[key] = result.value;
		}
		function normalizeDef(def) {
			const keys = Object.keys(def.shape);
			for (const k of keys) if (!def.shape?.[k]?._zod?.traits?.has("$ZodType")) throw new Error(`Invalid element at key "${k}": expected a Zod schema`);
			const okeys = optionalKeys(def.shape);
			return {
				...def,
				keys,
				keySet: new Set(keys),
				numKeys: keys.length,
				optionalKeys: new Set(okeys)
			};
		}
		function handleCatchall(proms, input, payload, ctx, def, inst) {
			const unrecognized = [];
			const keySet = def.keySet;
			const _catchall = def.catchall._zod;
			const t = _catchall.def.type;
			const isOptionalIn = _catchall.optin === "optional";
			const isOptionalOut = _catchall.optout === "optional";
			for (const key in input) {
				if (key === "__proto__") continue;
				if (keySet.has(key)) continue;
				if (t === "never") {
					unrecognized.push(key);
					continue;
				}
				const r = _catchall.run({
					value: input[key],
					issues: []
				}, ctx);
				if (r instanceof Promise) proms.push(r.then((r) => handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut)));
				else handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut);
			}
			if (unrecognized.length) payload.issues.push({
				code: "unrecognized_keys",
				keys: unrecognized,
				input,
				inst
			});
			if (!proms.length) return payload;
			return Promise.all(proms).then(() => {
				return payload;
			});
		}
		const $ZodObject = /*@__PURE__*/ $constructor("$ZodObject", (inst, def) => {
			$ZodType.init(inst, def);
			if (!Object.getOwnPropertyDescriptor(def, "shape")?.get) {
				const sh = def.shape;
				Object.defineProperty(def, "shape", { get: () => {
					const newSh = { ...sh };
					Object.defineProperty(def, "shape", { value: newSh });
					return newSh;
				} });
			}
			const _normalized = cached(() => normalizeDef(def));
			defineLazy(inst._zod, "propValues", () => {
				const shape = def.shape;
				const propValues = {};
				for (const key in shape) {
					const field = shape[key]._zod;
					if (field.values) {
						propValues[key] ?? (propValues[key] = /* @__PURE__ */ new Set());
						for (const v of field.values) propValues[key].add(v);
					}
				}
				return propValues;
			});
			const isObject$1 = isObject;
			const catchall = def.catchall;
			let value;
			inst._zod.parse = (payload, ctx) => {
				value ?? (value = _normalized.value);
				const input = payload.value;
				if (!isObject$1(input)) {
					payload.issues.push({
						expected: "object",
						code: "invalid_type",
						input,
						inst
					});
					return payload;
				}
				payload.value = {};
				const proms = [];
				const shape = value.shape;
				for (const key of value.keys) {
					const el = shape[key];
					const isOptionalIn = el._zod.optin === "optional";
					const isOptionalOut = el._zod.optout === "optional";
					const r = el._zod.run({
						value: input[key],
						issues: []
					}, ctx);
					if (r instanceof Promise) proms.push(r.then((r) => handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut)));
					else handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut);
				}
				if (!catchall) return proms.length ? Promise.all(proms).then(() => payload) : payload;
				return handleCatchall(proms, input, payload, ctx, _normalized.value, inst);
			};
		});
		const $ZodObjectJIT = /*@__PURE__*/ $constructor("$ZodObjectJIT", (inst, def) => {
			$ZodObject.init(inst, def);
			const superParse = inst._zod.parse;
			const _normalized = cached(() => normalizeDef(def));
			const generateFastpass = (shape) => {
				const doc = new Doc([
					"shape",
					"payload",
					"ctx"
				]);
				const normalized = _normalized.value;
				const parseStr = (key) => {
					const k = esc(key);
					return `shape[${k}]._zod.run({ value: input[${k}], issues: [] }, ctx)`;
				};
				doc.write(`const input = payload.value;`);
				const ids = Object.create(null);
				let counter = 0;
				for (const key of normalized.keys) ids[key] = `key_${counter++}`;
				doc.write(`const newResult = {};`);
				for (const key of normalized.keys) {
					const id = ids[key];
					const k = esc(key);
					const schema = shape[key];
					const isOptionalIn = schema?._zod?.optin === "optional";
					const isOptionalOut = schema?._zod?.optout === "optional";
					doc.write(`const ${id} = ${parseStr(key)};`);
					if (isOptionalIn && isOptionalOut) doc.write(`
        if (${id}.issues.length) {
          if (${k} in input) {
            payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
              ...iss,
              path: iss.path ? [${k}, ...iss.path] : [${k}]
            })));
          }
        }
        
        if (${id}.value === undefined) {
          if (${k} in input) {
            newResult[${k}] = undefined;
          }
        } else {
          newResult[${k}] = ${id}.value;
        }
        
      `);
					else if (!isOptionalIn) doc.write(`
        const ${id}_present = ${k} in input;
        if (${id}.issues.length) {
          payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${k}, ...iss.path] : [${k}]
          })));
        }
        if (!${id}_present && !${id}.issues.length) {
          payload.issues.push({
            code: "invalid_type",
            expected: "nonoptional",
            input: undefined,
            path: [${k}]
          });
        }

        if (${id}_present) {
          if (${id}.value === undefined) {
            newResult[${k}] = undefined;
          } else {
            newResult[${k}] = ${id}.value;
          }
        }

      `);
					else doc.write(`
        if (${id}.issues.length) {
          payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${k}, ...iss.path] : [${k}]
          })));
        }
        
        if (${id}.value === undefined) {
          if (${k} in input) {
            newResult[${k}] = undefined;
          }
        } else {
          newResult[${k}] = ${id}.value;
        }
        
      `);
				}
				doc.write(`payload.value = newResult;`);
				doc.write(`return payload;`);
				const fn = doc.compile();
				return (payload, ctx) => fn(shape, payload, ctx);
			};
			let fastpass;
			const isObject$2 = isObject;
			const jit = !globalConfig.jitless;
			const fastEnabled = jit && allowsEval.value;
			const catchall = def.catchall;
			let value;
			inst._zod.parse = (payload, ctx) => {
				value ?? (value = _normalized.value);
				const input = payload.value;
				if (!isObject$2(input)) {
					payload.issues.push({
						expected: "object",
						code: "invalid_type",
						input,
						inst
					});
					return payload;
				}
				if (jit && fastEnabled && ctx?.async === false && ctx.jitless !== true) {
					if (!fastpass) fastpass = generateFastpass(def.shape);
					payload = fastpass(payload, ctx);
					if (!catchall) return payload;
					return handleCatchall([], input, payload, ctx, value, inst);
				}
				return superParse(payload, ctx);
			};
		});
		function handleUnionResults(results, final, inst, ctx) {
			for (const result of results) if (result.issues.length === 0) {
				final.value = result.value;
				return final;
			}
			const nonaborted = results.filter((r) => !aborted(r));
			if (nonaborted.length === 1) {
				final.value = nonaborted[0].value;
				return nonaborted[0];
			}
			final.issues.push({
				code: "invalid_union",
				input: final.value,
				inst,
				errors: results.map((result) => result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
			});
			return final;
		}
		const $ZodUnion = /*@__PURE__*/ $constructor("$ZodUnion", (inst, def) => {
			$ZodType.init(inst, def);
			defineLazy(inst._zod, "optin", () => def.options.some((o) => o._zod.optin === "optional") ? "optional" : void 0);
			defineLazy(inst._zod, "optout", () => def.options.some((o) => o._zod.optout === "optional") ? "optional" : void 0);
			defineLazy(inst._zod, "values", () => {
				if (def.options.every((o) => o._zod.values)) return new Set(def.options.flatMap((option) => Array.from(option._zod.values)));
			});
			defineLazy(inst._zod, "pattern", () => {
				if (def.options.every((o) => o._zod.pattern)) {
					const patterns = def.options.map((o) => o._zod.pattern);
					return new RegExp(`^(${patterns.map((p) => cleanRegex(p.source)).join("|")})$`);
				}
			});
			const first = def.options.length === 1 ? def.options[0]._zod.run : null;
			inst._zod.parse = (payload, ctx) => {
				if (first) return first(payload, ctx);
				let async = false;
				const results = [];
				for (const option of def.options) {
					const result = option._zod.run({
						value: payload.value,
						issues: []
					}, ctx);
					if (result instanceof Promise) {
						results.push(result);
						async = true;
					} else {
						if (result.issues.length === 0) return result;
						results.push(result);
					}
				}
				if (!async) return handleUnionResults(results, payload, inst, ctx);
				return Promise.all(results).then((results) => {
					return handleUnionResults(results, payload, inst, ctx);
				});
			};
		});
		const $ZodIntersection = /*@__PURE__*/ $constructor("$ZodIntersection", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.parse = (payload, ctx) => {
				const input = payload.value;
				const left = def.left._zod.run({
					value: input,
					issues: []
				}, ctx);
				const right = def.right._zod.run({
					value: input,
					issues: []
				}, ctx);
				if (left instanceof Promise || right instanceof Promise) return Promise.all([left, right]).then(([left, right]) => {
					return handleIntersectionResults(payload, left, right);
				});
				return handleIntersectionResults(payload, left, right);
			};
		});
		function mergeValues(a, b) {
			if (a === b) return {
				valid: true,
				data: a
			};
			if (a instanceof Date && b instanceof Date && +a === +b) return {
				valid: true,
				data: a
			};
			if (isPlainObject(a) && isPlainObject(b)) {
				const bKeys = Object.keys(b);
				const sharedKeys = Object.keys(a).filter((key) => bKeys.indexOf(key) !== -1);
				const newObj = {
					...a,
					...b
				};
				for (const key of sharedKeys) {
					const sharedValue = mergeValues(a[key], b[key]);
					if (!sharedValue.valid) return {
						valid: false,
						mergeErrorPath: [key, ...sharedValue.mergeErrorPath]
					};
					newObj[key] = sharedValue.data;
				}
				return {
					valid: true,
					data: newObj
				};
			}
			if (Array.isArray(a) && Array.isArray(b)) {
				if (a.length !== b.length) return {
					valid: false,
					mergeErrorPath: []
				};
				const newArray = [];
				for (let index = 0; index < a.length; index++) {
					const itemA = a[index];
					const itemB = b[index];
					const sharedValue = mergeValues(itemA, itemB);
					if (!sharedValue.valid) return {
						valid: false,
						mergeErrorPath: [index, ...sharedValue.mergeErrorPath]
					};
					newArray.push(sharedValue.data);
				}
				return {
					valid: true,
					data: newArray
				};
			}
			return {
				valid: false,
				mergeErrorPath: []
			};
		}
		function handleIntersectionResults(result, left, right) {
			const unrecKeys = /* @__PURE__ */ new Map();
			let unrecIssue;
			for (const iss of left.issues) if (iss.code === "unrecognized_keys") {
				unrecIssue ?? (unrecIssue = iss);
				for (const k of iss.keys) {
					if (!unrecKeys.has(k)) unrecKeys.set(k, {});
					unrecKeys.get(k).l = true;
				}
			} else result.issues.push(iss);
			for (const iss of right.issues) if (iss.code === "unrecognized_keys") for (const k of iss.keys) {
				if (!unrecKeys.has(k)) unrecKeys.set(k, {});
				unrecKeys.get(k).r = true;
			}
			else result.issues.push(iss);
			const bothKeys = [...unrecKeys].filter(([, f]) => f.l && f.r).map(([k]) => k);
			if (bothKeys.length && unrecIssue) result.issues.push({
				...unrecIssue,
				keys: bothKeys
			});
			if (aborted(result)) return result;
			const merged = mergeValues(left.value, right.value);
			if (!merged.valid) throw new Error(`Unmergable intersection. Error path: ${JSON.stringify(merged.mergeErrorPath)}`);
			result.value = merged.data;
			return result;
		}
		const $ZodRecord = /*@__PURE__*/ $constructor("$ZodRecord", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.parse = (payload, ctx) => {
				const input = payload.value;
				if (!isPlainObject(input)) {
					payload.issues.push({
						expected: "record",
						code: "invalid_type",
						input,
						inst
					});
					return payload;
				}
				const proms = [];
				const values = def.keyType._zod.values;
				if (values) {
					payload.value = {};
					const recordKeys = /* @__PURE__ */ new Set();
					for (const key of values) if (typeof key === "string" || typeof key === "number" || typeof key === "symbol") {
						recordKeys.add(typeof key === "number" ? key.toString() : key);
						const keyResult = def.keyType._zod.run({
							value: key,
							issues: []
						}, ctx);
						if (keyResult instanceof Promise) throw new Error("Async schemas not supported in object keys currently");
						if (keyResult.issues.length) {
							payload.issues.push({
								code: "invalid_key",
								origin: "record",
								issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
								input: key,
								path: [key],
								inst
							});
							continue;
						}
						const outKey = keyResult.value;
						const result = def.valueType._zod.run({
							value: input[key],
							issues: []
						}, ctx);
						if (result instanceof Promise) proms.push(result.then((result) => {
							if (result.issues.length) payload.issues.push(...prefixIssues(key, result.issues));
							payload.value[outKey] = result.value;
						}));
						else {
							if (result.issues.length) payload.issues.push(...prefixIssues(key, result.issues));
							payload.value[outKey] = result.value;
						}
					}
					let unrecognized;
					for (const key in input) if (!recordKeys.has(key)) {
						unrecognized = unrecognized ?? [];
						unrecognized.push(key);
					}
					if (unrecognized && unrecognized.length > 0) payload.issues.push({
						code: "unrecognized_keys",
						input,
						inst,
						keys: unrecognized
					});
				} else {
					payload.value = {};
					for (const key of Reflect.ownKeys(input)) {
						if (key === "__proto__") continue;
						if (!Object.prototype.propertyIsEnumerable.call(input, key)) continue;
						let keyResult = def.keyType._zod.run({
							value: key,
							issues: []
						}, ctx);
						if (keyResult instanceof Promise) throw new Error("Async schemas not supported in object keys currently");
						if (typeof key === "string" && number$1.test(key) && keyResult.issues.length) {
							const retryResult = def.keyType._zod.run({
								value: Number(key),
								issues: []
							}, ctx);
							if (retryResult instanceof Promise) throw new Error("Async schemas not supported in object keys currently");
							if (retryResult.issues.length === 0) keyResult = retryResult;
						}
						if (keyResult.issues.length) {
							if (def.mode === "loose") payload.value[key] = input[key];
							else payload.issues.push({
								code: "invalid_key",
								origin: "record",
								issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
								input: key,
								path: [key],
								inst
							});
							continue;
						}
						const result = def.valueType._zod.run({
							value: input[key],
							issues: []
						}, ctx);
						if (result instanceof Promise) proms.push(result.then((result) => {
							if (result.issues.length) payload.issues.push(...prefixIssues(key, result.issues));
							payload.value[keyResult.value] = result.value;
						}));
						else {
							if (result.issues.length) payload.issues.push(...prefixIssues(key, result.issues));
							payload.value[keyResult.value] = result.value;
						}
					}
				}
				if (proms.length) return Promise.all(proms).then(() => payload);
				return payload;
			};
		});
		const $ZodEnum = /*@__PURE__*/ $constructor("$ZodEnum", (inst, def) => {
			$ZodType.init(inst, def);
			const values = getEnumValues(def.entries);
			const valuesSet = new Set(values);
			inst._zod.values = valuesSet;
			inst._zod.pattern = new RegExp(`^(${values.filter((k) => propertyKeyTypes.has(typeof k)).map((o) => typeof o === "string" ? escapeRegex(o) : o.toString()).join("|")})$`);
			inst._zod.parse = (payload, _ctx) => {
				const input = payload.value;
				if (valuesSet.has(input)) return payload;
				payload.issues.push({
					code: "invalid_value",
					values,
					input,
					inst
				});
				return payload;
			};
		});
		const $ZodLiteral = /*@__PURE__*/ $constructor("$ZodLiteral", (inst, def) => {
			$ZodType.init(inst, def);
			if (def.values.length === 0) throw new Error("Cannot create literal schema with no valid values");
			const values = new Set(def.values);
			inst._zod.values = values;
			inst._zod.pattern = new RegExp(`^(${def.values.map((o) => typeof o === "string" ? escapeRegex(o) : o ? escapeRegex(o.toString()) : String(o)).join("|")})$`);
			inst._zod.parse = (payload, _ctx) => {
				const input = payload.value;
				if (values.has(input)) return payload;
				payload.issues.push({
					code: "invalid_value",
					values: def.values,
					input,
					inst
				});
				return payload;
			};
		});
		const $ZodTransform = /*@__PURE__*/ $constructor("$ZodTransform", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.optin = "optional";
			inst._zod.parse = (payload, ctx) => {
				if (ctx.direction === "backward") throw new $ZodEncodeError(inst.constructor.name);
				const _out = def.transform(payload.value, payload);
				if (ctx.async) return (_out instanceof Promise ? _out : Promise.resolve(_out)).then((output) => {
					payload.value = output;
					payload.fallback = true;
					return payload;
				});
				if (_out instanceof Promise) throw new $ZodAsyncError();
				payload.value = _out;
				payload.fallback = true;
				return payload;
			};
		});
		function handleOptionalResult(result, input) {
			if (input === void 0 && (result.issues.length || result.fallback)) return {
				issues: [],
				value: void 0
			};
			return result;
		}
		const $ZodOptional = /*@__PURE__*/ $constructor("$ZodOptional", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.optin = "optional";
			inst._zod.optout = "optional";
			defineLazy(inst._zod, "values", () => {
				return def.innerType._zod.values ? /* @__PURE__ */ new Set([...def.innerType._zod.values, void 0]) : void 0;
			});
			defineLazy(inst._zod, "pattern", () => {
				const pattern = def.innerType._zod.pattern;
				return pattern ? new RegExp(`^(${cleanRegex(pattern.source)})?$`) : void 0;
			});
			inst._zod.parse = (payload, ctx) => {
				if (def.innerType._zod.optin === "optional") {
					const input = payload.value;
					const result = def.innerType._zod.run(payload, ctx);
					if (result instanceof Promise) return result.then((r) => handleOptionalResult(r, input));
					return handleOptionalResult(result, input);
				}
				if (payload.value === void 0) return payload;
				return def.innerType._zod.run(payload, ctx);
			};
		});
		const $ZodExactOptional = /*@__PURE__*/ $constructor("$ZodExactOptional", (inst, def) => {
			$ZodOptional.init(inst, def);
			defineLazy(inst._zod, "values", () => def.innerType._zod.values);
			defineLazy(inst._zod, "pattern", () => def.innerType._zod.pattern);
			inst._zod.parse = (payload, ctx) => {
				return def.innerType._zod.run(payload, ctx);
			};
		});
		const $ZodNullable = /*@__PURE__*/ $constructor("$ZodNullable", (inst, def) => {
			$ZodType.init(inst, def);
			defineLazy(inst._zod, "optin", () => def.innerType._zod.optin);
			defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
			defineLazy(inst._zod, "pattern", () => {
				const pattern = def.innerType._zod.pattern;
				return pattern ? new RegExp(`^(${cleanRegex(pattern.source)}|null)$`) : void 0;
			});
			defineLazy(inst._zod, "values", () => {
				return def.innerType._zod.values ? /* @__PURE__ */ new Set([...def.innerType._zod.values, null]) : void 0;
			});
			inst._zod.parse = (payload, ctx) => {
				if (payload.value === null) return payload;
				return def.innerType._zod.run(payload, ctx);
			};
		});
		const $ZodDefault = /*@__PURE__*/ $constructor("$ZodDefault", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.optin = "optional";
			defineLazy(inst._zod, "values", () => def.innerType._zod.values);
			inst._zod.parse = (payload, ctx) => {
				if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
				if (payload.value === void 0) {
					payload.value = def.defaultValue;
					/**
					* $ZodDefault returns the default value immediately in forward direction.
					* It doesn't pass the default value into the validator ("prefault"). There's no reason to pass the default value through validation. The validity of the default is enforced by TypeScript statically. Otherwise, it's the responsibility of the user to ensure the default is valid. In the case of pipes with divergent in/out types, you can specify the default on the `in` schema of your ZodPipe to set a "prefault" for the pipe.   */
					return payload;
				}
				const result = def.innerType._zod.run(payload, ctx);
				if (result instanceof Promise) return result.then((result) => handleDefaultResult(result, def));
				return handleDefaultResult(result, def);
			};
		});
		function handleDefaultResult(payload, def) {
			if (payload.value === void 0) payload.value = def.defaultValue;
			return payload;
		}
		const $ZodPrefault = /*@__PURE__*/ $constructor("$ZodPrefault", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.optin = "optional";
			defineLazy(inst._zod, "values", () => def.innerType._zod.values);
			inst._zod.parse = (payload, ctx) => {
				if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
				if (payload.value === void 0) payload.value = def.defaultValue;
				return def.innerType._zod.run(payload, ctx);
			};
		});
		const $ZodNonOptional = /*@__PURE__*/ $constructor("$ZodNonOptional", (inst, def) => {
			$ZodType.init(inst, def);
			defineLazy(inst._zod, "values", () => {
				const v = def.innerType._zod.values;
				return v ? new Set([...v].filter((x) => x !== void 0)) : void 0;
			});
			inst._zod.parse = (payload, ctx) => {
				const result = def.innerType._zod.run(payload, ctx);
				if (result instanceof Promise) return result.then((result) => handleNonOptionalResult(result, inst));
				return handleNonOptionalResult(result, inst);
			};
		});
		function handleNonOptionalResult(payload, inst) {
			if (!payload.issues.length && payload.value === void 0) payload.issues.push({
				code: "invalid_type",
				expected: "nonoptional",
				input: payload.value,
				inst
			});
			return payload;
		}
		const $ZodCatch = /*@__PURE__*/ $constructor("$ZodCatch", (inst, def) => {
			$ZodType.init(inst, def);
			inst._zod.optin = "optional";
			defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
			defineLazy(inst._zod, "values", () => def.innerType._zod.values);
			inst._zod.parse = (payload, ctx) => {
				if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
				const result = def.innerType._zod.run(payload, ctx);
				if (result instanceof Promise) return result.then((result) => {
					payload.value = result.value;
					if (result.issues.length) {
						payload.value = def.catchValue({
							...payload,
							error: { issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config())) },
							input: payload.value
						});
						payload.issues = [];
						payload.fallback = true;
					}
					return payload;
				});
				payload.value = result.value;
				if (result.issues.length) {
					payload.value = def.catchValue({
						...payload,
						error: { issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config())) },
						input: payload.value
					});
					payload.issues = [];
					payload.fallback = true;
				}
				return payload;
			};
		});
		const $ZodPipe = /*@__PURE__*/ $constructor("$ZodPipe", (inst, def) => {
			$ZodType.init(inst, def);
			defineLazy(inst._zod, "values", () => def.in._zod.values);
			defineLazy(inst._zod, "optin", () => def.in._zod.optin);
			defineLazy(inst._zod, "optout", () => def.out._zod.optout);
			defineLazy(inst._zod, "propValues", () => def.in._zod.propValues);
			inst._zod.parse = (payload, ctx) => {
				if (ctx.direction === "backward") {
					const right = def.out._zod.run(payload, ctx);
					if (right instanceof Promise) return right.then((right) => handlePipeResult(right, def.in, ctx));
					return handlePipeResult(right, def.in, ctx);
				}
				const left = def.in._zod.run(payload, ctx);
				if (left instanceof Promise) return left.then((left) => handlePipeResult(left, def.out, ctx));
				return handlePipeResult(left, def.out, ctx);
			};
		});
		function handlePipeResult(left, next, ctx) {
			if (left.issues.length) {
				left.aborted = true;
				return left;
			}
			return next._zod.run({
				value: left.value,
				issues: left.issues,
				fallback: left.fallback
			}, ctx);
		}
		const $ZodReadonly = /*@__PURE__*/ $constructor("$ZodReadonly", (inst, def) => {
			$ZodType.init(inst, def);
			defineLazy(inst._zod, "propValues", () => def.innerType._zod.propValues);
			defineLazy(inst._zod, "values", () => def.innerType._zod.values);
			defineLazy(inst._zod, "optin", () => def.innerType?._zod?.optin);
			defineLazy(inst._zod, "optout", () => def.innerType?._zod?.optout);
			inst._zod.parse = (payload, ctx) => {
				if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
				const result = def.innerType._zod.run(payload, ctx);
				if (result instanceof Promise) return result.then(handleReadonlyResult);
				return handleReadonlyResult(result);
			};
		});
		function handleReadonlyResult(payload) {
			payload.value = Object.freeze(payload.value);
			return payload;
		}
		const $ZodCustom = /*@__PURE__*/ $constructor("$ZodCustom", (inst, def) => {
			$ZodCheck.init(inst, def);
			$ZodType.init(inst, def);
			inst._zod.parse = (payload, _) => {
				return payload;
			};
			inst._zod.check = (payload) => {
				const input = payload.value;
				const r = def.fn(input);
				if (r instanceof Promise) return r.then((r) => handleRefineResult(r, payload, input, inst));
				handleRefineResult(r, payload, input, inst);
			};
		});
		function handleRefineResult(result, payload, input, inst) {
			if (!result) {
				const _iss = {
					code: "custom",
					input,
					inst,
					path: [...inst._zod.def.path ?? []],
					continue: !inst._zod.def.abort
				};
				if (inst._zod.def.params) _iss.params = inst._zod.def.params;
				payload.issues.push(issue(_iss));
			}
		}
		//#endregion
		//#region ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/registries.js
		var _a;
		var $ZodRegistry = class {
			constructor() {
				this._map = /* @__PURE__ */ new WeakMap();
				this._idmap = /* @__PURE__ */ new Map();
			}
			add(schema, ..._meta) {
				const meta = _meta[0];
				this._map.set(schema, meta);
				if (meta && typeof meta === "object" && "id" in meta) this._idmap.set(meta.id, schema);
				return this;
			}
			clear() {
				this._map = /* @__PURE__ */ new WeakMap();
				this._idmap = /* @__PURE__ */ new Map();
				return this;
			}
			remove(schema) {
				const meta = this._map.get(schema);
				if (meta && typeof meta === "object" && "id" in meta) this._idmap.delete(meta.id);
				this._map.delete(schema);
				return this;
			}
			get(schema) {
				const p = schema._zod.parent;
				if (p) {
					const pm = { ...this.get(p) ?? {} };
					delete pm.id;
					const f = {
						...pm,
						...this._map.get(schema)
					};
					return Object.keys(f).length ? f : void 0;
				}
				return this._map.get(schema);
			}
			has(schema) {
				return this._map.has(schema);
			}
		};
		function registry() {
			return new $ZodRegistry();
		}
		(_a = globalThis).__zod_globalRegistry ?? (_a.__zod_globalRegistry = registry());
		const globalRegistry = globalThis.__zod_globalRegistry;
		//#endregion
		//#region ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/api.js
		// @__NO_SIDE_EFFECTS__
		function _string(Class, params) {
			return new Class({
				type: "string",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _email(Class, params) {
			return new Class({
				type: "string",
				format: "email",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _guid(Class, params) {
			return new Class({
				type: "string",
				format: "guid",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _uuid(Class, params) {
			return new Class({
				type: "string",
				format: "uuid",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _uuidv4(Class, params) {
			return new Class({
				type: "string",
				format: "uuid",
				check: "string_format",
				abort: false,
				version: "v4",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _uuidv6(Class, params) {
			return new Class({
				type: "string",
				format: "uuid",
				check: "string_format",
				abort: false,
				version: "v6",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _uuidv7(Class, params) {
			return new Class({
				type: "string",
				format: "uuid",
				check: "string_format",
				abort: false,
				version: "v7",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _url(Class, params) {
			return new Class({
				type: "string",
				format: "url",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _emoji(Class, params) {
			return new Class({
				type: "string",
				format: "emoji",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _nanoid(Class, params) {
			return new Class({
				type: "string",
				format: "nanoid",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		/**
		* @deprecated CUID v1 is deprecated by its authors due to information leakage
		* (timestamps embedded in the id). Use {@link _cuid2} instead.
		* See https://github.com/paralleldrive/cuid.
		*/
		// @__NO_SIDE_EFFECTS__
		function _cuid(Class, params) {
			return new Class({
				type: "string",
				format: "cuid",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _cuid2(Class, params) {
			return new Class({
				type: "string",
				format: "cuid2",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _ulid(Class, params) {
			return new Class({
				type: "string",
				format: "ulid",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _xid(Class, params) {
			return new Class({
				type: "string",
				format: "xid",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _ksuid(Class, params) {
			return new Class({
				type: "string",
				format: "ksuid",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _ipv4(Class, params) {
			return new Class({
				type: "string",
				format: "ipv4",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _ipv6(Class, params) {
			return new Class({
				type: "string",
				format: "ipv6",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _cidrv4(Class, params) {
			return new Class({
				type: "string",
				format: "cidrv4",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _cidrv6(Class, params) {
			return new Class({
				type: "string",
				format: "cidrv6",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _base64(Class, params) {
			return new Class({
				type: "string",
				format: "base64",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _base64url(Class, params) {
			return new Class({
				type: "string",
				format: "base64url",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _e164(Class, params) {
			return new Class({
				type: "string",
				format: "e164",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _jwt(Class, params) {
			return new Class({
				type: "string",
				format: "jwt",
				check: "string_format",
				abort: false,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _isoDateTime(Class, params) {
			return new Class({
				type: "string",
				format: "datetime",
				check: "string_format",
				offset: false,
				local: false,
				precision: null,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _isoDate(Class, params) {
			return new Class({
				type: "string",
				format: "date",
				check: "string_format",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _isoTime(Class, params) {
			return new Class({
				type: "string",
				format: "time",
				check: "string_format",
				precision: null,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _isoDuration(Class, params) {
			return new Class({
				type: "string",
				format: "duration",
				check: "string_format",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _number(Class, params) {
			return new Class({
				type: "number",
				checks: [],
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _int(Class, params) {
			return new Class({
				type: "number",
				check: "number_format",
				abort: false,
				format: "safeint",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _boolean(Class, params) {
			return new Class({
				type: "boolean",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _undefined$1(Class, params) {
			return new Class({
				type: "undefined",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _unknown(Class) {
			return new Class({ type: "unknown" });
		}
		// @__NO_SIDE_EFFECTS__
		function _never(Class, params) {
			return new Class({
				type: "never",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _lt(value, params) {
			return new $ZodCheckLessThan({
				check: "less_than",
				...normalizeParams(params),
				value,
				inclusive: false
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _lte(value, params) {
			return new $ZodCheckLessThan({
				check: "less_than",
				...normalizeParams(params),
				value,
				inclusive: true
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _gt(value, params) {
			return new $ZodCheckGreaterThan({
				check: "greater_than",
				...normalizeParams(params),
				value,
				inclusive: false
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _gte(value, params) {
			return new $ZodCheckGreaterThan({
				check: "greater_than",
				...normalizeParams(params),
				value,
				inclusive: true
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _multipleOf(value, params) {
			return new $ZodCheckMultipleOf({
				check: "multiple_of",
				...normalizeParams(params),
				value
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _maxLength(maximum, params) {
			return new $ZodCheckMaxLength({
				check: "max_length",
				...normalizeParams(params),
				maximum
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _minLength(minimum, params) {
			return new $ZodCheckMinLength({
				check: "min_length",
				...normalizeParams(params),
				minimum
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _length(length, params) {
			return new $ZodCheckLengthEquals({
				check: "length_equals",
				...normalizeParams(params),
				length
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _regex(pattern, params) {
			return new $ZodCheckRegex({
				check: "string_format",
				format: "regex",
				...normalizeParams(params),
				pattern
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _lowercase(params) {
			return new $ZodCheckLowerCase({
				check: "string_format",
				format: "lowercase",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _uppercase(params) {
			return new $ZodCheckUpperCase({
				check: "string_format",
				format: "uppercase",
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _includes(includes, params) {
			return new $ZodCheckIncludes({
				check: "string_format",
				format: "includes",
				...normalizeParams(params),
				includes
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _startsWith(prefix, params) {
			return new $ZodCheckStartsWith({
				check: "string_format",
				format: "starts_with",
				...normalizeParams(params),
				prefix
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _endsWith(suffix, params) {
			return new $ZodCheckEndsWith({
				check: "string_format",
				format: "ends_with",
				...normalizeParams(params),
				suffix
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _overwrite(tx) {
			return new $ZodCheckOverwrite({
				check: "overwrite",
				tx
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _normalize(form) {
			return /* @__PURE__ */ _overwrite((input) => input.normalize(form));
		}
		// @__NO_SIDE_EFFECTS__
		function _trim() {
			return /* @__PURE__ */ _overwrite((input) => input.trim());
		}
		// @__NO_SIDE_EFFECTS__
		function _toLowerCase() {
			return /* @__PURE__ */ _overwrite((input) => input.toLowerCase());
		}
		// @__NO_SIDE_EFFECTS__
		function _toUpperCase() {
			return /* @__PURE__ */ _overwrite((input) => input.toUpperCase());
		}
		// @__NO_SIDE_EFFECTS__
		function _slugify() {
			return /* @__PURE__ */ _overwrite((input) => slugify(input));
		}
		// @__NO_SIDE_EFFECTS__
		function _array(Class, element, params) {
			return new Class({
				type: "array",
				element,
				...normalizeParams(params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _refine(Class, fn, _params) {
			return new Class({
				type: "custom",
				check: "custom",
				fn,
				...normalizeParams(_params)
			});
		}
		// @__NO_SIDE_EFFECTS__
		function _superRefine(fn, params) {
			const ch = /* @__PURE__ */ _check((payload) => {
				payload.addIssue = (issue$2) => {
					if (typeof issue$2 === "string") payload.issues.push(issue(issue$2, payload.value, ch._zod.def));
					else {
						const _issue = issue$2;
						if (_issue.fatal) _issue.continue = false;
						_issue.code ?? (_issue.code = "custom");
						_issue.input ?? (_issue.input = payload.value);
						_issue.inst ?? (_issue.inst = ch);
						_issue.continue ?? (_issue.continue = !ch._zod.def.abort);
						payload.issues.push(issue(_issue));
					}
				};
				return fn(payload.value, payload);
			}, params);
			return ch;
		}
		// @__NO_SIDE_EFFECTS__
		function _check(fn, params) {
			const ch = new $ZodCheck({
				check: "custom",
				...normalizeParams(params)
			});
			ch._zod.check = fn;
			return ch;
		}
		//#endregion
		//#region ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/to-json-schema.js
		function initializeContext(params) {
			let target = params?.target ?? "draft-2020-12";
			if (target === "draft-4") target = "draft-04";
			if (target === "draft-7") target = "draft-07";
			return {
				processors: params.processors ?? {},
				metadataRegistry: params?.metadata ?? globalRegistry,
				target,
				unrepresentable: params?.unrepresentable ?? "throw",
				override: params?.override ?? (() => {}),
				io: params?.io ?? "output",
				counter: 0,
				seen: /* @__PURE__ */ new Map(),
				cycles: params?.cycles ?? "ref",
				reused: params?.reused ?? "inline",
				external: params?.external ?? void 0
			};
		}
		function process$1(schema, ctx, _params = {
			path: [],
			schemaPath: []
		}) {
			var _a;
			const def = schema._zod.def;
			const seen = ctx.seen.get(schema);
			if (seen) {
				seen.count++;
				if (_params.schemaPath.includes(schema)) seen.cycle = _params.path;
				return seen.schema;
			}
			const result = {
				schema: {},
				count: 1,
				cycle: void 0,
				path: _params.path
			};
			ctx.seen.set(schema, result);
			const overrideSchema = schema._zod.toJSONSchema?.();
			if (overrideSchema) result.schema = overrideSchema;
			else {
				const params = {
					..._params,
					schemaPath: [..._params.schemaPath, schema],
					path: _params.path
				};
				if (schema._zod.processJSONSchema) schema._zod.processJSONSchema(ctx, result.schema, params);
				else {
					const _json = result.schema;
					const processor = ctx.processors[def.type];
					if (!processor) throw new Error(`[toJSONSchema]: Non-representable type encountered: ${def.type}`);
					processor(schema, ctx, _json, params);
				}
				const parent = schema._zod.parent;
				if (parent) {
					if (!result.ref) result.ref = parent;
					process$1(parent, ctx, params);
					ctx.seen.get(parent).isParent = true;
				}
			}
			const meta = ctx.metadataRegistry.get(schema);
			if (meta) Object.assign(result.schema, meta);
			if (ctx.io === "input" && isTransforming(schema)) {
				delete result.schema.examples;
				delete result.schema.default;
			}
			if (ctx.io === "input" && "_prefault" in result.schema) (_a = result.schema).default ?? (_a.default = result.schema._prefault);
			delete result.schema._prefault;
			return ctx.seen.get(schema).schema;
		}
		function extractDefs(ctx, schema) {
			const root = ctx.seen.get(schema);
			if (!root) throw new Error("Unprocessed schema. This is a bug in Zod.");
			const idToSchema = /* @__PURE__ */ new Map();
			for (const entry of ctx.seen.entries()) {
				const id = ctx.metadataRegistry.get(entry[0])?.id;
				if (id) {
					const existing = idToSchema.get(id);
					if (existing && existing !== entry[0]) throw new Error(`Duplicate schema id "${id}" detected during JSON Schema conversion. Two different schemas cannot share the same id when converted together.`);
					idToSchema.set(id, entry[0]);
				}
			}
			const makeURI = (entry) => {
				const defsSegment = ctx.target === "draft-2020-12" ? "$defs" : "definitions";
				if (ctx.external) {
					const externalId = ctx.external.registry.get(entry[0])?.id;
					const uriGenerator = ctx.external.uri ?? ((id) => id);
					if (externalId) return { ref: uriGenerator(externalId) };
					const id = entry[1].defId ?? entry[1].schema.id ?? `schema${ctx.counter++}`;
					entry[1].defId = id;
					return {
						defId: id,
						ref: `${uriGenerator("__shared")}#/${defsSegment}/${id}`
					};
				}
				if (entry[1] === root) return { ref: "#" };
				const defUriPrefix = `#/${defsSegment}/`;
				const defId = entry[1].schema.id ?? `__schema${ctx.counter++}`;
				return {
					defId,
					ref: defUriPrefix + defId
				};
			};
			const extractToDef = (entry) => {
				if (entry[1].schema.$ref) return;
				const seen = entry[1];
				const { ref, defId } = makeURI(entry);
				seen.def = { ...seen.schema };
				if (defId) seen.defId = defId;
				const schema = seen.schema;
				for (const key in schema) delete schema[key];
				schema.$ref = ref;
			};
			if (ctx.cycles === "throw") for (const entry of ctx.seen.entries()) {
				const seen = entry[1];
				if (seen.cycle) throw new Error(`Cycle detected: #/${seen.cycle?.join("/")}/<root>

Set the \`cycles\` parameter to \`"ref"\` to resolve cyclical schemas with defs.`);
			}
			for (const entry of ctx.seen.entries()) {
				const seen = entry[1];
				if (schema === entry[0]) {
					extractToDef(entry);
					continue;
				}
				if (ctx.external) {
					const ext = ctx.external.registry.get(entry[0])?.id;
					if (schema !== entry[0] && ext) {
						extractToDef(entry);
						continue;
					}
				}
				if (ctx.metadataRegistry.get(entry[0])?.id) {
					extractToDef(entry);
					continue;
				}
				if (seen.cycle) {
					extractToDef(entry);
					continue;
				}
				if (seen.count > 1) {
					if (ctx.reused === "ref") {
						extractToDef(entry);
						continue;
					}
				}
			}
		}
		function finalize(ctx, schema) {
			const root = ctx.seen.get(schema);
			if (!root) throw new Error("Unprocessed schema. This is a bug in Zod.");
			const flattenRef = (zodSchema) => {
				const seen = ctx.seen.get(zodSchema);
				if (seen.ref === null) return;
				const schema = seen.def ?? seen.schema;
				const _cached = { ...schema };
				const ref = seen.ref;
				seen.ref = null;
				if (ref) {
					flattenRef(ref);
					const refSeen = ctx.seen.get(ref);
					const refSchema = refSeen.schema;
					if (refSchema.$ref && (ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0")) {
						schema.allOf = schema.allOf ?? [];
						schema.allOf.push(refSchema);
					} else Object.assign(schema, refSchema);
					Object.assign(schema, _cached);
					if (zodSchema._zod.parent === ref) for (const key in schema) {
						if (key === "$ref" || key === "allOf") continue;
						if (!(key in _cached)) delete schema[key];
					}
					if (refSchema.$ref && refSeen.def) for (const key in schema) {
						if (key === "$ref" || key === "allOf") continue;
						if (key in refSeen.def && JSON.stringify(schema[key]) === JSON.stringify(refSeen.def[key])) delete schema[key];
					}
				}
				const parent = zodSchema._zod.parent;
				if (parent && parent !== ref) {
					flattenRef(parent);
					const parentSeen = ctx.seen.get(parent);
					if (parentSeen?.schema.$ref) {
						schema.$ref = parentSeen.schema.$ref;
						if (parentSeen.def) for (const key in schema) {
							if (key === "$ref" || key === "allOf") continue;
							if (key in parentSeen.def && JSON.stringify(schema[key]) === JSON.stringify(parentSeen.def[key])) delete schema[key];
						}
					}
				}
				ctx.override({
					zodSchema,
					jsonSchema: schema,
					path: seen.path ?? []
				});
			};
			for (const entry of [...ctx.seen.entries()].reverse()) flattenRef(entry[0]);
			const result = {};
			if (ctx.target === "draft-2020-12") result.$schema = "https://json-schema.org/draft/2020-12/schema";
			else if (ctx.target === "draft-07") result.$schema = "http://json-schema.org/draft-07/schema#";
			else if (ctx.target === "draft-04") result.$schema = "http://json-schema.org/draft-04/schema#";
			else if (ctx.target === "openapi-3.0") {}
			if (ctx.external?.uri) {
				const id = ctx.external.registry.get(schema)?.id;
				if (!id) throw new Error("Schema is missing an `id` property");
				result.$id = ctx.external.uri(id);
			}
			Object.assign(result, root.def ?? root.schema);
			const rootMetaId = ctx.metadataRegistry.get(schema)?.id;
			if (rootMetaId !== void 0 && result.id === rootMetaId) delete result.id;
			const defs = ctx.external?.defs ?? {};
			for (const entry of ctx.seen.entries()) {
				const seen = entry[1];
				if (seen.def && seen.defId) {
					if (seen.def.id === seen.defId) delete seen.def.id;
					defs[seen.defId] = seen.def;
				}
			}
			if (ctx.external) {} else if (Object.keys(defs).length > 0) {
				if (ctx.target === "draft-2020-12") result.$defs = defs;
				else result.definitions = defs;
			}
			try {
				const finalized = JSON.parse(JSON.stringify(result));
				Object.defineProperty(finalized, "~standard", {
					value: {
						...schema["~standard"],
						jsonSchema: {
							input: createStandardJSONSchemaMethod(schema, "input", ctx.processors),
							output: createStandardJSONSchemaMethod(schema, "output", ctx.processors)
						}
					},
					enumerable: false,
					writable: false
				});
				return finalized;
			} catch (_err) {
				throw new Error("Error converting schema to JSON.");
			}
		}
		function isTransforming(_schema, _ctx) {
			const ctx = _ctx ?? { seen: /* @__PURE__ */ new Set() };
			if (ctx.seen.has(_schema)) return false;
			ctx.seen.add(_schema);
			const def = _schema._zod.def;
			if (def.type === "transform") return true;
			if (def.type === "array") return isTransforming(def.element, ctx);
			if (def.type === "set") return isTransforming(def.valueType, ctx);
			if (def.type === "lazy") return isTransforming(def.getter(), ctx);
			if (def.type === "promise" || def.type === "optional" || def.type === "nonoptional" || def.type === "nullable" || def.type === "readonly" || def.type === "default" || def.type === "prefault") return isTransforming(def.innerType, ctx);
			if (def.type === "intersection") return isTransforming(def.left, ctx) || isTransforming(def.right, ctx);
			if (def.type === "record" || def.type === "map") return isTransforming(def.keyType, ctx) || isTransforming(def.valueType, ctx);
			if (def.type === "pipe") {
				if (_schema._zod.traits.has("$ZodCodec")) return true;
				return isTransforming(def.in, ctx) || isTransforming(def.out, ctx);
			}
			if (def.type === "object") {
				for (const key in def.shape) if (isTransforming(def.shape[key], ctx)) return true;
				return false;
			}
			if (def.type === "union") {
				for (const option of def.options) if (isTransforming(option, ctx)) return true;
				return false;
			}
			if (def.type === "tuple") {
				for (const item of def.items) if (isTransforming(item, ctx)) return true;
				if (def.rest && isTransforming(def.rest, ctx)) return true;
				return false;
			}
			return false;
		}
		/**
		* Creates a toJSONSchema method for a schema instance.
		* This encapsulates the logic of initializing context, processing, extracting defs, and finalizing.
		*/
		const createToJSONSchemaMethod = (schema, processors = {}) => (params) => {
			const ctx = initializeContext({
				...params,
				processors
			});
			process$1(schema, ctx);
			extractDefs(ctx, schema);
			return finalize(ctx, schema);
		};
		const createStandardJSONSchemaMethod = (schema, io, processors = {}) => (params) => {
			const { libraryOptions, target } = params ?? {};
			const ctx = initializeContext({
				...libraryOptions ?? {},
				target,
				io,
				processors
			});
			process$1(schema, ctx);
			extractDefs(ctx, schema);
			return finalize(ctx, schema);
		};
		//#endregion
		//#region ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/json-schema-processors.js
		const formatMap = {
			guid: "uuid",
			url: "uri",
			datetime: "date-time",
			json_string: "json-string",
			regex: ""
		};
		const stringProcessor = (schema, ctx, _json, _params) => {
			const json = _json;
			json.type = "string";
			const { minimum, maximum, format, patterns, contentEncoding } = schema._zod.bag;
			if (typeof minimum === "number") json.minLength = minimum;
			if (typeof maximum === "number") json.maxLength = maximum;
			if (format) {
				json.format = formatMap[format] ?? format;
				if (json.format === "") delete json.format;
				if (format === "time") delete json.format;
			}
			if (contentEncoding) json.contentEncoding = contentEncoding;
			if (patterns && patterns.size > 0) {
				const regexes = [...patterns];
				if (regexes.length === 1) json.pattern = regexes[0].source;
				else if (regexes.length > 1) json.allOf = [...regexes.map((regex) => ({
					...ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0" ? { type: "string" } : {},
					pattern: regex.source
				}))];
			}
		};
		const numberProcessor = (schema, ctx, _json, _params) => {
			const json = _json;
			const { minimum, maximum, format, multipleOf, exclusiveMaximum, exclusiveMinimum } = schema._zod.bag;
			if (typeof format === "string" && format.includes("int")) json.type = "integer";
			else json.type = "number";
			const exMin = typeof exclusiveMinimum === "number" && exclusiveMinimum >= (minimum ?? Number.NEGATIVE_INFINITY);
			const exMax = typeof exclusiveMaximum === "number" && exclusiveMaximum <= (maximum ?? Number.POSITIVE_INFINITY);
			const legacy = ctx.target === "draft-04" || ctx.target === "openapi-3.0";
			if (exMin) {
				if (legacy) {
					json.minimum = exclusiveMinimum;
					json.exclusiveMinimum = true;
				} else json.exclusiveMinimum = exclusiveMinimum;
			} else if (typeof minimum === "number") json.minimum = minimum;
			if (exMax) {
				if (legacy) {
					json.maximum = exclusiveMaximum;
					json.exclusiveMaximum = true;
				} else json.exclusiveMaximum = exclusiveMaximum;
			} else if (typeof maximum === "number") json.maximum = maximum;
			if (typeof multipleOf === "number") json.multipleOf = multipleOf;
		};
		const booleanProcessor = (_schema, _ctx, json, _params) => {
			json.type = "boolean";
		};
		const undefinedProcessor = (_schema, ctx, _json, _params) => {
			if (ctx.unrepresentable === "throw") throw new Error("Undefined cannot be represented in JSON Schema");
		};
		const neverProcessor = (_schema, _ctx, json, _params) => {
			json.not = {};
		};
		const enumProcessor = (schema, _ctx, json, _params) => {
			const def = schema._zod.def;
			const values = getEnumValues(def.entries);
			if (values.every((v) => typeof v === "number")) json.type = "number";
			if (values.every((v) => typeof v === "string")) json.type = "string";
			json.enum = values;
		};
		const literalProcessor = (schema, ctx, json, _params) => {
			const def = schema._zod.def;
			const vals = [];
			for (const val of def.values) if (val === void 0) {
				if (ctx.unrepresentable === "throw") throw new Error("Literal `undefined` cannot be represented in JSON Schema");
			} else if (typeof val === "bigint") {
				if (ctx.unrepresentable === "throw") throw new Error("BigInt literals cannot be represented in JSON Schema");
				else vals.push(Number(val));
			} else vals.push(val);
			if (vals.length === 0) {} else if (vals.length === 1) {
				const val = vals[0];
				json.type = val === null ? "null" : typeof val;
				if (ctx.target === "draft-04" || ctx.target === "openapi-3.0") json.enum = [val];
				else json.const = val;
			} else {
				if (vals.every((v) => typeof v === "number")) json.type = "number";
				if (vals.every((v) => typeof v === "string")) json.type = "string";
				if (vals.every((v) => typeof v === "boolean")) json.type = "boolean";
				if (vals.every((v) => v === null)) json.type = "null";
				json.enum = vals;
			}
		};
		const customProcessor = (_schema, ctx, _json, _params) => {
			if (ctx.unrepresentable === "throw") throw new Error("Custom types cannot be represented in JSON Schema");
		};
		const transformProcessor = (_schema, ctx, _json, _params) => {
			if (ctx.unrepresentable === "throw") throw new Error("Transforms cannot be represented in JSON Schema");
		};
		const arrayProcessor = (schema, ctx, _json, params) => {
			const json = _json;
			const def = schema._zod.def;
			const { minimum, maximum } = schema._zod.bag;
			if (typeof minimum === "number") json.minItems = minimum;
			if (typeof maximum === "number") json.maxItems = maximum;
			json.type = "array";
			json.items = process$1(def.element, ctx, {
				...params,
				path: [...params.path, "items"]
			});
		};
		const objectProcessor = (schema, ctx, _json, params) => {
			const json = _json;
			const def = schema._zod.def;
			json.type = "object";
			json.properties = {};
			const shape = def.shape;
			for (const key in shape) json.properties[key] = process$1(shape[key], ctx, {
				...params,
				path: [
					...params.path,
					"properties",
					key
				]
			});
			const allKeys = new Set(Object.keys(shape));
			const requiredKeys = new Set([...allKeys].filter((key) => {
				const v = def.shape[key]._zod;
				if (ctx.io === "input") return v.optin === void 0;
				else return v.optout === void 0;
			}));
			if (requiredKeys.size > 0) json.required = Array.from(requiredKeys);
			if (def.catchall?._zod.def.type === "never") json.additionalProperties = false;
			else if (!def.catchall) {
				if (ctx.io === "output") json.additionalProperties = false;
			} else if (def.catchall) json.additionalProperties = process$1(def.catchall, ctx, {
				...params,
				path: [...params.path, "additionalProperties"]
			});
		};
		const unionProcessor = (schema, ctx, json, params) => {
			const def = schema._zod.def;
			const isExclusive = def.inclusive === false;
			const options = def.options.map((x, i) => process$1(x, ctx, {
				...params,
				path: [
					...params.path,
					isExclusive ? "oneOf" : "anyOf",
					i
				]
			}));
			if (isExclusive) json.oneOf = options;
			else json.anyOf = options;
		};
		const intersectionProcessor = (schema, ctx, json, params) => {
			const def = schema._zod.def;
			const a = process$1(def.left, ctx, {
				...params,
				path: [
					...params.path,
					"allOf",
					0
				]
			});
			const b = process$1(def.right, ctx, {
				...params,
				path: [
					...params.path,
					"allOf",
					1
				]
			});
			const isSimpleIntersection = (val) => "allOf" in val && Object.keys(val).length === 1;
			json.allOf = [...isSimpleIntersection(a) ? a.allOf : [a], ...isSimpleIntersection(b) ? b.allOf : [b]];
		};
		const recordProcessor = (schema, ctx, _json, params) => {
			const json = _json;
			const def = schema._zod.def;
			json.type = "object";
			const keyType = def.keyType;
			const patterns = keyType._zod.bag?.patterns;
			if (def.mode === "loose" && patterns && patterns.size > 0) {
				const valueSchema = process$1(def.valueType, ctx, {
					...params,
					path: [
						...params.path,
						"patternProperties",
						"*"
					]
				});
				json.patternProperties = {};
				for (const pattern of patterns) json.patternProperties[pattern.source] = valueSchema;
			} else {
				if (ctx.target === "draft-07" || ctx.target === "draft-2020-12") json.propertyNames = process$1(def.keyType, ctx, {
					...params,
					path: [...params.path, "propertyNames"]
				});
				json.additionalProperties = process$1(def.valueType, ctx, {
					...params,
					path: [...params.path, "additionalProperties"]
				});
			}
			const keyValues = keyType._zod.values;
			if (keyValues) {
				const validKeyValues = [...keyValues].filter((v) => typeof v === "string" || typeof v === "number");
				if (validKeyValues.length > 0) json.required = validKeyValues;
			}
		};
		const nullableProcessor = (schema, ctx, json, params) => {
			const def = schema._zod.def;
			const inner = process$1(def.innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			if (ctx.target === "openapi-3.0") {
				seen.ref = def.innerType;
				json.nullable = true;
			} else json.anyOf = [inner, { type: "null" }];
		};
		const nonoptionalProcessor = (schema, ctx, _json, params) => {
			const def = schema._zod.def;
			process$1(def.innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			seen.ref = def.innerType;
		};
		const defaultProcessor = (schema, ctx, json, params) => {
			const def = schema._zod.def;
			process$1(def.innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			seen.ref = def.innerType;
			json.default = JSON.parse(JSON.stringify(def.defaultValue));
		};
		const prefaultProcessor = (schema, ctx, json, params) => {
			const def = schema._zod.def;
			process$1(def.innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			seen.ref = def.innerType;
			if (ctx.io === "input") json._prefault = JSON.parse(JSON.stringify(def.defaultValue));
		};
		const catchProcessor = (schema, ctx, json, params) => {
			const def = schema._zod.def;
			process$1(def.innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			seen.ref = def.innerType;
			let catchValue;
			try {
				catchValue = def.catchValue(void 0);
			} catch {
				throw new Error("Dynamic catch values are not supported in JSON Schema");
			}
			json.default = catchValue;
		};
		const pipeProcessor = (schema, ctx, _json, params) => {
			const def = schema._zod.def;
			const inIsTransform = def.in._zod.traits.has("$ZodTransform");
			const innerType = ctx.io === "input" ? inIsTransform ? def.out : def.in : def.out;
			process$1(innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			seen.ref = innerType;
		};
		const readonlyProcessor = (schema, ctx, json, params) => {
			const def = schema._zod.def;
			process$1(def.innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			seen.ref = def.innerType;
			json.readOnly = true;
		};
		const optionalProcessor = (schema, ctx, _json, params) => {
			const def = schema._zod.def;
			process$1(def.innerType, ctx, params);
			const seen = ctx.seen.get(schema);
			seen.ref = def.innerType;
		};
		//#endregion
		//#region ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/iso.js
		const ZodISODateTime = /*@__PURE__*/ $constructor("ZodISODateTime", (inst, def) => {
			$ZodISODateTime.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		function datetime(params) {
			return /* @__PURE__ */ _isoDateTime(ZodISODateTime, params);
		}
		const ZodISODate = /*@__PURE__*/ $constructor("ZodISODate", (inst, def) => {
			$ZodISODate.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		function date(params) {
			return /* @__PURE__ */ _isoDate(ZodISODate, params);
		}
		const ZodISOTime = /*@__PURE__*/ $constructor("ZodISOTime", (inst, def) => {
			$ZodISOTime.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		function time(params) {
			return /* @__PURE__ */ _isoTime(ZodISOTime, params);
		}
		const ZodISODuration = /*@__PURE__*/ $constructor("ZodISODuration", (inst, def) => {
			$ZodISODuration.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		function duration(params) {
			return /* @__PURE__ */ _isoDuration(ZodISODuration, params);
		}
		//#endregion
		//#region ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/errors.js
		const initializer = (inst, issues) => {
			$ZodError.init(inst, issues);
			inst.name = "ZodError";
			Object.defineProperties(inst, {
				format: { value: (mapper) => formatError(inst, mapper) },
				flatten: { value: (mapper) => flattenError(inst, mapper) },
				addIssue: { value: (issue) => {
					inst.issues.push(issue);
					inst.message = JSON.stringify(inst.issues, jsonStringifyReplacer, 2);
				} },
				addIssues: { value: (issues) => {
					inst.issues.push(...issues);
					inst.message = JSON.stringify(inst.issues, jsonStringifyReplacer, 2);
				} },
				isEmpty: { get() {
					return inst.issues.length === 0;
				} }
			});
		};
		const ZodRealError = /*@__PURE__*/ $constructor("ZodError", initializer, { Parent: Error });
		//#endregion
		//#region ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/parse.js
		const parse = /* @__PURE__ */ _parse(ZodRealError);
		const parseAsync = /* @__PURE__ */ _parseAsync(ZodRealError);
		const safeParse = /* @__PURE__ */ _safeParse(ZodRealError);
		const safeParseAsync = /* @__PURE__ */ _safeParseAsync(ZodRealError);
		const encode = /* @__PURE__ */ _encode(ZodRealError);
		const decode = /* @__PURE__ */ _decode(ZodRealError);
		const encodeAsync = /* @__PURE__ */ _encodeAsync(ZodRealError);
		const decodeAsync = /* @__PURE__ */ _decodeAsync(ZodRealError);
		const safeEncode = /* @__PURE__ */ _safeEncode(ZodRealError);
		const safeDecode = /* @__PURE__ */ _safeDecode(ZodRealError);
		const safeEncodeAsync = /* @__PURE__ */ _safeEncodeAsync(ZodRealError);
		const safeDecodeAsync = /* @__PURE__ */ _safeDecodeAsync(ZodRealError);
		//#endregion
		//#region ../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/classic/schemas.js
		const _installedGroups = /* @__PURE__ */ new WeakMap();
		function _installLazyMethods(inst, group, methods) {
			const proto = Object.getPrototypeOf(inst);
			let installed = _installedGroups.get(proto);
			if (!installed) {
				installed = /* @__PURE__ */ new Set();
				_installedGroups.set(proto, installed);
			}
			if (installed.has(group)) return;
			installed.add(group);
			for (const key in methods) {
				const fn = methods[key];
				Object.defineProperty(proto, key, {
					configurable: true,
					enumerable: false,
					get() {
						const bound = fn.bind(this);
						Object.defineProperty(this, key, {
							configurable: true,
							writable: true,
							enumerable: true,
							value: bound
						});
						return bound;
					},
					set(v) {
						Object.defineProperty(this, key, {
							configurable: true,
							writable: true,
							enumerable: true,
							value: v
						});
					}
				});
			}
		}
		const ZodType = /*@__PURE__*/ $constructor("ZodType", (inst, def) => {
			$ZodType.init(inst, def);
			Object.assign(inst["~standard"], { jsonSchema: {
				input: createStandardJSONSchemaMethod(inst, "input"),
				output: createStandardJSONSchemaMethod(inst, "output")
			} });
			inst.toJSONSchema = createToJSONSchemaMethod(inst, {});
			inst.def = def;
			inst.type = def.type;
			Object.defineProperty(inst, "_def", { value: def });
			inst.parse = (data, params) => parse(inst, data, params, { callee: inst.parse });
			inst.safeParse = (data, params) => safeParse(inst, data, params);
			inst.parseAsync = async (data, params) => parseAsync(inst, data, params, { callee: inst.parseAsync });
			inst.safeParseAsync = async (data, params) => safeParseAsync(inst, data, params);
			inst.spa = inst.safeParseAsync;
			inst.encode = (data, params) => encode(inst, data, params);
			inst.decode = (data, params) => decode(inst, data, params);
			inst.encodeAsync = async (data, params) => encodeAsync(inst, data, params);
			inst.decodeAsync = async (data, params) => decodeAsync(inst, data, params);
			inst.safeEncode = (data, params) => safeEncode(inst, data, params);
			inst.safeDecode = (data, params) => safeDecode(inst, data, params);
			inst.safeEncodeAsync = async (data, params) => safeEncodeAsync(inst, data, params);
			inst.safeDecodeAsync = async (data, params) => safeDecodeAsync(inst, data, params);
			_installLazyMethods(inst, "ZodType", {
				check(...chks) {
					const def = this.def;
					return this.clone(mergeDefs(def, { checks: [...def.checks ?? [], ...chks.map((ch) => typeof ch === "function" ? { _zod: {
						check: ch,
						def: { check: "custom" },
						onattach: []
					} } : ch)] }), { parent: true });
				},
				with(...chks) {
					return this.check(...chks);
				},
				clone(def, params) {
					return clone(this, def, params);
				},
				brand() {
					return this;
				},
				register(reg, meta) {
					reg.add(this, meta);
					return this;
				},
				refine(check, params) {
					return this.check(refine(check, params));
				},
				superRefine(refinement, params) {
					return this.check(superRefine(refinement, params));
				},
				overwrite(fn) {
					return this.check(/* @__PURE__ */ _overwrite(fn));
				},
				optional() {
					return optional(this);
				},
				exactOptional() {
					return exactOptional(this);
				},
				nullable() {
					return nullable(this);
				},
				nullish() {
					return optional(nullable(this));
				},
				nonoptional(params) {
					return nonoptional(this, params);
				},
				array() {
					return array(this);
				},
				or(arg) {
					return union([this, arg]);
				},
				and(arg) {
					return intersection(this, arg);
				},
				transform(tx) {
					return pipe(this, transform(tx));
				},
				default(d) {
					return _default(this, d);
				},
				prefault(d) {
					return prefault(this, d);
				},
				catch(params) {
					return _catch(this, params);
				},
				pipe(target) {
					return pipe(this, target);
				},
				readonly() {
					return readonly(this);
				},
				describe(description) {
					const cl = this.clone();
					globalRegistry.add(cl, { description });
					return cl;
				},
				meta(...args) {
					if (args.length === 0) return globalRegistry.get(this);
					const cl = this.clone();
					globalRegistry.add(cl, args[0]);
					return cl;
				},
				isOptional() {
					return this.safeParse(void 0).success;
				},
				isNullable() {
					return this.safeParse(null).success;
				},
				apply(fn) {
					return fn(this);
				}
			});
			Object.defineProperty(inst, "description", {
				get() {
					return globalRegistry.get(inst)?.description;
				},
				configurable: true
			});
			return inst;
		});
		/** @internal */
		const _ZodString = /*@__PURE__*/ $constructor("_ZodString", (inst, def) => {
			$ZodString.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => stringProcessor(inst, ctx, json, params);
			const bag = inst._zod.bag;
			inst.format = bag.format ?? null;
			inst.minLength = bag.minimum ?? null;
			inst.maxLength = bag.maximum ?? null;
			_installLazyMethods(inst, "_ZodString", {
				regex(...args) {
					return this.check(/* @__PURE__ */ _regex(...args));
				},
				includes(...args) {
					return this.check(/* @__PURE__ */ _includes(...args));
				},
				startsWith(...args) {
					return this.check(/* @__PURE__ */ _startsWith(...args));
				},
				endsWith(...args) {
					return this.check(/* @__PURE__ */ _endsWith(...args));
				},
				min(...args) {
					return this.check(/* @__PURE__ */ _minLength(...args));
				},
				max(...args) {
					return this.check(/* @__PURE__ */ _maxLength(...args));
				},
				length(...args) {
					return this.check(/* @__PURE__ */ _length(...args));
				},
				nonempty(...args) {
					return this.check(/* @__PURE__ */ _minLength(1, ...args));
				},
				lowercase(params) {
					return this.check(/* @__PURE__ */ _lowercase(params));
				},
				uppercase(params) {
					return this.check(/* @__PURE__ */ _uppercase(params));
				},
				trim() {
					return this.check(/* @__PURE__ */ _trim());
				},
				normalize(...args) {
					return this.check(/* @__PURE__ */ _normalize(...args));
				},
				toLowerCase() {
					return this.check(/* @__PURE__ */ _toLowerCase());
				},
				toUpperCase() {
					return this.check(/* @__PURE__ */ _toUpperCase());
				},
				slugify() {
					return this.check(/* @__PURE__ */ _slugify());
				}
			});
		});
		const ZodString = /*@__PURE__*/ $constructor("ZodString", (inst, def) => {
			$ZodString.init(inst, def);
			_ZodString.init(inst, def);
			inst.email = (params) => inst.check(/* @__PURE__ */ _email(ZodEmail, params));
			inst.url = (params) => inst.check(/* @__PURE__ */ _url(ZodURL, params));
			inst.jwt = (params) => inst.check(/* @__PURE__ */ _jwt(ZodJWT, params));
			inst.emoji = (params) => inst.check(/* @__PURE__ */ _emoji(ZodEmoji, params));
			inst.guid = (params) => inst.check(/* @__PURE__ */ _guid(ZodGUID, params));
			inst.uuid = (params) => inst.check(/* @__PURE__ */ _uuid(ZodUUID, params));
			inst.uuidv4 = (params) => inst.check(/* @__PURE__ */ _uuidv4(ZodUUID, params));
			inst.uuidv6 = (params) => inst.check(/* @__PURE__ */ _uuidv6(ZodUUID, params));
			inst.uuidv7 = (params) => inst.check(/* @__PURE__ */ _uuidv7(ZodUUID, params));
			inst.nanoid = (params) => inst.check(/* @__PURE__ */ _nanoid(ZodNanoID, params));
			inst.guid = (params) => inst.check(/* @__PURE__ */ _guid(ZodGUID, params));
			inst.cuid = (params) => inst.check(/* @__PURE__ */ _cuid(ZodCUID, params));
			inst.cuid2 = (params) => inst.check(/* @__PURE__ */ _cuid2(ZodCUID2, params));
			inst.ulid = (params) => inst.check(/* @__PURE__ */ _ulid(ZodULID, params));
			inst.base64 = (params) => inst.check(/* @__PURE__ */ _base64(ZodBase64, params));
			inst.base64url = (params) => inst.check(/* @__PURE__ */ _base64url(ZodBase64URL, params));
			inst.xid = (params) => inst.check(/* @__PURE__ */ _xid(ZodXID, params));
			inst.ksuid = (params) => inst.check(/* @__PURE__ */ _ksuid(ZodKSUID, params));
			inst.ipv4 = (params) => inst.check(/* @__PURE__ */ _ipv4(ZodIPv4, params));
			inst.ipv6 = (params) => inst.check(/* @__PURE__ */ _ipv6(ZodIPv6, params));
			inst.cidrv4 = (params) => inst.check(/* @__PURE__ */ _cidrv4(ZodCIDRv4, params));
			inst.cidrv6 = (params) => inst.check(/* @__PURE__ */ _cidrv6(ZodCIDRv6, params));
			inst.e164 = (params) => inst.check(/* @__PURE__ */ _e164(ZodE164, params));
			inst.datetime = (params) => inst.check(datetime(params));
			inst.date = (params) => inst.check(date(params));
			inst.time = (params) => inst.check(time(params));
			inst.duration = (params) => inst.check(duration(params));
		});
		function string(params) {
			return /* @__PURE__ */ _string(ZodString, params);
		}
		const ZodStringFormat = /*@__PURE__*/ $constructor("ZodStringFormat", (inst, def) => {
			$ZodStringFormat.init(inst, def);
			_ZodString.init(inst, def);
		});
		const ZodEmail = /*@__PURE__*/ $constructor("ZodEmail", (inst, def) => {
			$ZodEmail.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodGUID = /*@__PURE__*/ $constructor("ZodGUID", (inst, def) => {
			$ZodGUID.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodUUID = /*@__PURE__*/ $constructor("ZodUUID", (inst, def) => {
			$ZodUUID.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodURL = /*@__PURE__*/ $constructor("ZodURL", (inst, def) => {
			$ZodURL.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodEmoji = /*@__PURE__*/ $constructor("ZodEmoji", (inst, def) => {
			$ZodEmoji.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodNanoID = /*@__PURE__*/ $constructor("ZodNanoID", (inst, def) => {
			$ZodNanoID.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		/**
		* @deprecated CUID v1 is deprecated by its authors due to information leakage
		* (timestamps embedded in the id). Use {@link ZodCUID2} instead.
		* See https://github.com/paralleldrive/cuid.
		*/
		const ZodCUID = /*@__PURE__*/ $constructor("ZodCUID", (inst, def) => {
			$ZodCUID.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodCUID2 = /*@__PURE__*/ $constructor("ZodCUID2", (inst, def) => {
			$ZodCUID2.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodULID = /*@__PURE__*/ $constructor("ZodULID", (inst, def) => {
			$ZodULID.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodXID = /*@__PURE__*/ $constructor("ZodXID", (inst, def) => {
			$ZodXID.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodKSUID = /*@__PURE__*/ $constructor("ZodKSUID", (inst, def) => {
			$ZodKSUID.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodIPv4 = /*@__PURE__*/ $constructor("ZodIPv4", (inst, def) => {
			$ZodIPv4.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodIPv6 = /*@__PURE__*/ $constructor("ZodIPv6", (inst, def) => {
			$ZodIPv6.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodCIDRv4 = /*@__PURE__*/ $constructor("ZodCIDRv4", (inst, def) => {
			$ZodCIDRv4.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodCIDRv6 = /*@__PURE__*/ $constructor("ZodCIDRv6", (inst, def) => {
			$ZodCIDRv6.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodBase64 = /*@__PURE__*/ $constructor("ZodBase64", (inst, def) => {
			$ZodBase64.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodBase64URL = /*@__PURE__*/ $constructor("ZodBase64URL", (inst, def) => {
			$ZodBase64URL.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodE164 = /*@__PURE__*/ $constructor("ZodE164", (inst, def) => {
			$ZodE164.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodJWT = /*@__PURE__*/ $constructor("ZodJWT", (inst, def) => {
			$ZodJWT.init(inst, def);
			ZodStringFormat.init(inst, def);
		});
		const ZodNumber = /*@__PURE__*/ $constructor("ZodNumber", (inst, def) => {
			$ZodNumber.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => numberProcessor(inst, ctx, json, params);
			_installLazyMethods(inst, "ZodNumber", {
				gt(value, params) {
					return this.check(/* @__PURE__ */ _gt(value, params));
				},
				gte(value, params) {
					return this.check(/* @__PURE__ */ _gte(value, params));
				},
				min(value, params) {
					return this.check(/* @__PURE__ */ _gte(value, params));
				},
				lt(value, params) {
					return this.check(/* @__PURE__ */ _lt(value, params));
				},
				lte(value, params) {
					return this.check(/* @__PURE__ */ _lte(value, params));
				},
				max(value, params) {
					return this.check(/* @__PURE__ */ _lte(value, params));
				},
				int(params) {
					return this.check(int(params));
				},
				safe(params) {
					return this.check(int(params));
				},
				positive(params) {
					return this.check(/* @__PURE__ */ _gt(0, params));
				},
				nonnegative(params) {
					return this.check(/* @__PURE__ */ _gte(0, params));
				},
				negative(params) {
					return this.check(/* @__PURE__ */ _lt(0, params));
				},
				nonpositive(params) {
					return this.check(/* @__PURE__ */ _lte(0, params));
				},
				multipleOf(value, params) {
					return this.check(/* @__PURE__ */ _multipleOf(value, params));
				},
				step(value, params) {
					return this.check(/* @__PURE__ */ _multipleOf(value, params));
				},
				finite() {
					return this;
				}
			});
			const bag = inst._zod.bag;
			inst.minValue = Math.max(bag.minimum ?? Number.NEGATIVE_INFINITY, bag.exclusiveMinimum ?? Number.NEGATIVE_INFINITY) ?? null;
			inst.maxValue = Math.min(bag.maximum ?? Number.POSITIVE_INFINITY, bag.exclusiveMaximum ?? Number.POSITIVE_INFINITY) ?? null;
			inst.isInt = (bag.format ?? "").includes("int") || Number.isSafeInteger(bag.multipleOf ?? .5);
			inst.isFinite = true;
			inst.format = bag.format ?? null;
		});
		function number(params) {
			return /* @__PURE__ */ _number(ZodNumber, params);
		}
		const ZodNumberFormat = /*@__PURE__*/ $constructor("ZodNumberFormat", (inst, def) => {
			$ZodNumberFormat.init(inst, def);
			ZodNumber.init(inst, def);
		});
		function int(params) {
			return /* @__PURE__ */ _int(ZodNumberFormat, params);
		}
		const ZodBoolean = /*@__PURE__*/ $constructor("ZodBoolean", (inst, def) => {
			$ZodBoolean.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => booleanProcessor(inst, ctx, json, params);
		});
		function boolean(params) {
			return /* @__PURE__ */ _boolean(ZodBoolean, params);
		}
		const ZodUndefined = /*@__PURE__*/ $constructor("ZodUndefined", (inst, def) => {
			$ZodUndefined.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => undefinedProcessor(inst, ctx, json, params);
		});
		function _undefined(params) {
			return /* @__PURE__ */ _undefined$1(ZodUndefined, params);
		}
		const ZodUnknown = /*@__PURE__*/ $constructor("ZodUnknown", (inst, def) => {
			$ZodUnknown.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => void 0;
		});
		function unknown() {
			return /* @__PURE__ */ _unknown(ZodUnknown);
		}
		const ZodNever = /*@__PURE__*/ $constructor("ZodNever", (inst, def) => {
			$ZodNever.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => neverProcessor(inst, ctx, json, params);
		});
		function never(params) {
			return /* @__PURE__ */ _never(ZodNever, params);
		}
		const ZodArray = /*@__PURE__*/ $constructor("ZodArray", (inst, def) => {
			$ZodArray.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => arrayProcessor(inst, ctx, json, params);
			inst.element = def.element;
			_installLazyMethods(inst, "ZodArray", {
				min(n, params) {
					return this.check(/* @__PURE__ */ _minLength(n, params));
				},
				nonempty(params) {
					return this.check(/* @__PURE__ */ _minLength(1, params));
				},
				max(n, params) {
					return this.check(/* @__PURE__ */ _maxLength(n, params));
				},
				length(n, params) {
					return this.check(/* @__PURE__ */ _length(n, params));
				},
				unwrap() {
					return this.element;
				}
			});
		});
		function array(element, params) {
			return /* @__PURE__ */ _array(ZodArray, element, params);
		}
		const ZodObject = /*@__PURE__*/ $constructor("ZodObject", (inst, def) => {
			$ZodObjectJIT.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => objectProcessor(inst, ctx, json, params);
			defineLazy(inst, "shape", () => {
				return def.shape;
			});
			_installLazyMethods(inst, "ZodObject", {
				keyof() {
					return _enum(Object.keys(this._zod.def.shape));
				},
				catchall(catchall) {
					return this.clone({
						...this._zod.def,
						catchall
					});
				},
				passthrough() {
					return this.clone({
						...this._zod.def,
						catchall: unknown()
					});
				},
				loose() {
					return this.clone({
						...this._zod.def,
						catchall: unknown()
					});
				},
				strict() {
					return this.clone({
						...this._zod.def,
						catchall: never()
					});
				},
				strip() {
					return this.clone({
						...this._zod.def,
						catchall: void 0
					});
				},
				extend(incoming) {
					return extend(this, incoming);
				},
				safeExtend(incoming) {
					return safeExtend(this, incoming);
				},
				merge(other) {
					return merge(this, other);
				},
				pick(mask) {
					return pick(this, mask);
				},
				omit(mask) {
					return omit(this, mask);
				},
				partial(...args) {
					return partial(ZodOptional, this, args[0]);
				},
				required(...args) {
					return required(ZodNonOptional, this, args[0]);
				}
			});
		});
		function object(shape, params) {
			const def = {
				type: "object",
				shape: shape ?? {},
				...normalizeParams(params)
			};
			return new ZodObject(def);
		}
		const ZodUnion = /*@__PURE__*/ $constructor("ZodUnion", (inst, def) => {
			$ZodUnion.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => unionProcessor(inst, ctx, json, params);
			inst.options = def.options;
		});
		function union(options, params) {
			return new ZodUnion({
				type: "union",
				options,
				...normalizeParams(params)
			});
		}
		const ZodIntersection = /*@__PURE__*/ $constructor("ZodIntersection", (inst, def) => {
			$ZodIntersection.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => intersectionProcessor(inst, ctx, json, params);
		});
		function intersection(left, right) {
			return new ZodIntersection({
				type: "intersection",
				left,
				right
			});
		}
		const ZodRecord = /*@__PURE__*/ $constructor("ZodRecord", (inst, def) => {
			$ZodRecord.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => recordProcessor(inst, ctx, json, params);
			inst.keyType = def.keyType;
			inst.valueType = def.valueType;
		});
		function record(keyType, valueType, params) {
			if (!valueType || !valueType._zod) return new ZodRecord({
				type: "record",
				keyType: string(),
				valueType: keyType,
				...normalizeParams(valueType)
			});
			return new ZodRecord({
				type: "record",
				keyType,
				valueType,
				...normalizeParams(params)
			});
		}
		const ZodEnum = /*@__PURE__*/ $constructor("ZodEnum", (inst, def) => {
			$ZodEnum.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => enumProcessor(inst, ctx, json, params);
			inst.enum = def.entries;
			inst.options = Object.values(def.entries);
			const keys = new Set(Object.keys(def.entries));
			inst.extract = (values, params) => {
				const newEntries = {};
				for (const value of values) if (keys.has(value)) newEntries[value] = def.entries[value];
				else throw new Error(`Key ${value} not found in enum`);
				return new ZodEnum({
					...def,
					checks: [],
					...normalizeParams(params),
					entries: newEntries
				});
			};
			inst.exclude = (values, params) => {
				const newEntries = { ...def.entries };
				for (const value of values) if (keys.has(value)) delete newEntries[value];
				else throw new Error(`Key ${value} not found in enum`);
				return new ZodEnum({
					...def,
					checks: [],
					...normalizeParams(params),
					entries: newEntries
				});
			};
		});
		function _enum(values, params) {
			const entries = Array.isArray(values) ? Object.fromEntries(values.map((v) => [v, v])) : values;
			return new ZodEnum({
				type: "enum",
				entries,
				...normalizeParams(params)
			});
		}
		const ZodLiteral = /*@__PURE__*/ $constructor("ZodLiteral", (inst, def) => {
			$ZodLiteral.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => literalProcessor(inst, ctx, json, params);
			inst.values = new Set(def.values);
			Object.defineProperty(inst, "value", { get() {
				if (def.values.length > 1) throw new Error("This schema contains multiple valid literal values. Use `.values` instead.");
				return def.values[0];
			} });
		});
		function literal(value, params) {
			return new ZodLiteral({
				type: "literal",
				values: Array.isArray(value) ? value : [value],
				...normalizeParams(params)
			});
		}
		const ZodTransform = /*@__PURE__*/ $constructor("ZodTransform", (inst, def) => {
			$ZodTransform.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => transformProcessor(inst, ctx, json, params);
			inst._zod.parse = (payload, _ctx) => {
				if (_ctx.direction === "backward") throw new $ZodEncodeError(inst.constructor.name);
				payload.addIssue = (issue$1) => {
					if (typeof issue$1 === "string") payload.issues.push(issue(issue$1, payload.value, def));
					else {
						const _issue = issue$1;
						if (_issue.fatal) _issue.continue = false;
						_issue.code ?? (_issue.code = "custom");
						_issue.input ?? (_issue.input = payload.value);
						_issue.inst ?? (_issue.inst = inst);
						payload.issues.push(issue(_issue));
					}
				};
				const output = def.transform(payload.value, payload);
				if (output instanceof Promise) return output.then((output) => {
					payload.value = output;
					payload.fallback = true;
					return payload;
				});
				payload.value = output;
				payload.fallback = true;
				return payload;
			};
		});
		function transform(fn) {
			return new ZodTransform({
				type: "transform",
				transform: fn
			});
		}
		const ZodOptional = /*@__PURE__*/ $constructor("ZodOptional", (inst, def) => {
			$ZodOptional.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
			inst.unwrap = () => inst._zod.def.innerType;
		});
		function optional(innerType) {
			return new ZodOptional({
				type: "optional",
				innerType
			});
		}
		const ZodExactOptional = /*@__PURE__*/ $constructor("ZodExactOptional", (inst, def) => {
			$ZodExactOptional.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
			inst.unwrap = () => inst._zod.def.innerType;
		});
		function exactOptional(innerType) {
			return new ZodExactOptional({
				type: "optional",
				innerType
			});
		}
		const ZodNullable = /*@__PURE__*/ $constructor("ZodNullable", (inst, def) => {
			$ZodNullable.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => nullableProcessor(inst, ctx, json, params);
			inst.unwrap = () => inst._zod.def.innerType;
		});
		function nullable(innerType) {
			return new ZodNullable({
				type: "nullable",
				innerType
			});
		}
		const ZodDefault = /*@__PURE__*/ $constructor("ZodDefault", (inst, def) => {
			$ZodDefault.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => defaultProcessor(inst, ctx, json, params);
			inst.unwrap = () => inst._zod.def.innerType;
			inst.removeDefault = inst.unwrap;
		});
		function _default(innerType, defaultValue) {
			return new ZodDefault({
				type: "default",
				innerType,
				get defaultValue() {
					return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
				}
			});
		}
		const ZodPrefault = /*@__PURE__*/ $constructor("ZodPrefault", (inst, def) => {
			$ZodPrefault.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => prefaultProcessor(inst, ctx, json, params);
			inst.unwrap = () => inst._zod.def.innerType;
		});
		function prefault(innerType, defaultValue) {
			return new ZodPrefault({
				type: "prefault",
				innerType,
				get defaultValue() {
					return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
				}
			});
		}
		const ZodNonOptional = /*@__PURE__*/ $constructor("ZodNonOptional", (inst, def) => {
			$ZodNonOptional.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => nonoptionalProcessor(inst, ctx, json, params);
			inst.unwrap = () => inst._zod.def.innerType;
		});
		function nonoptional(innerType, params) {
			return new ZodNonOptional({
				type: "nonoptional",
				innerType,
				...normalizeParams(params)
			});
		}
		const ZodCatch = /*@__PURE__*/ $constructor("ZodCatch", (inst, def) => {
			$ZodCatch.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => catchProcessor(inst, ctx, json, params);
			inst.unwrap = () => inst._zod.def.innerType;
			inst.removeCatch = inst.unwrap;
		});
		function _catch(innerType, catchValue) {
			return new ZodCatch({
				type: "catch",
				innerType,
				catchValue: typeof catchValue === "function" ? catchValue : () => catchValue
			});
		}
		const ZodPipe = /*@__PURE__*/ $constructor("ZodPipe", (inst, def) => {
			$ZodPipe.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => pipeProcessor(inst, ctx, json, params);
			inst.in = def.in;
			inst.out = def.out;
		});
		function pipe(in_, out) {
			return new ZodPipe({
				type: "pipe",
				in: in_,
				out
			});
		}
		const ZodReadonly = /*@__PURE__*/ $constructor("ZodReadonly", (inst, def) => {
			$ZodReadonly.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => readonlyProcessor(inst, ctx, json, params);
			inst.unwrap = () => inst._zod.def.innerType;
		});
		function readonly(innerType) {
			return new ZodReadonly({
				type: "readonly",
				innerType
			});
		}
		const ZodCustom = /*@__PURE__*/ $constructor("ZodCustom", (inst, def) => {
			$ZodCustom.init(inst, def);
			ZodType.init(inst, def);
			inst._zod.processJSONSchema = (ctx, json, params) => customProcessor(inst, ctx, json, params);
		});
		function refine(fn, _params = {}) {
			return /* @__PURE__ */ _refine(ZodCustom, fn, _params);
		}
		function superRefine(fn, params) {
			return /* @__PURE__ */ _superRefine(fn, params);
		}
		//#endregion
		//#region lib/typert.remote-client.js
		const dsh_plugin_shop_shop_catalog_parameter_0$schema = union([_undefined(), object({ "refresh": union([
			_undefined(),
			literal(false),
			literal(true)
		]).optional() })]);
		const dsh_plugin_shop_shop_catalog_result$schema = object({
			"schemaVersion": number(),
			"builtAt": string(),
			"stale": boolean(),
			"plugins": array(object({
				"name": string(),
				"version": string(),
				"integrity": union([literal(null), string()]),
				"publishedAt": union([literal(null), string()]),
				"repository": union([literal(null), string()]),
				"license": union([literal(null), string()]),
				"tier": union([
					literal("verified"),
					literal("verified-stale"),
					literal("community")
				]),
				"metadata": union([literal("declared"), literal("derived")]),
				"review": union([_undefined(), object({
					"reviewedVersion": union([_undefined(), string()]).optional(),
					"reviewedCommit": union([_undefined(), string()]).optional(),
					"reviewedSha256": union([_undefined(), string()]).optional(),
					"repo": union([_undefined(), string()]).optional(),
					"reviewer": string(),
					"reviewCommit": string(),
					"notes": string()
				})]).optional(),
				"catalog": union([_undefined(), object({
					"category": union([
						literal("tool"),
						literal("provider"),
						literal("ui"),
						literal("workflow"),
						literal("integration"),
						literal("theme"),
						literal("other")
					]),
					"summary": object({
						"en": string(),
						"zh": union([_undefined(), string()]).optional()
					}),
					"capabilities": array(string())
				})]).optional(),
				"source": union([literal("npm"), literal("github")]),
				"publisher": union([_undefined(), string()]).optional(),
				"repo": union([_undefined(), string()]).optional(),
				"subdir": union([_undefined(), string()]).optional(),
				"tarball": union([_undefined(), object({
					"url": string(),
					"sha256": string()
				})]).optional(),
				"added": union([_undefined(), string()]).optional(),
				"peers": union([_undefined(), array(string())]).optional(),
				"compatibility": union([_undefined(), object({
					"dsh": union([_undefined(), string()]).optional(),
					"profiles": union([_undefined(), array(string())]).optional()
				})]).optional(),
				"dshPeers": union([_undefined(), record(string(), string())]).optional(),
				"manifestVersion": union([_undefined(), string()]).optional(),
				"engines": union([_undefined(), string()]).optional(),
				"dependencies": union([_undefined(), number()]).optional(),
				"bin": union([_undefined(), array(string())]).optional(),
				"installScripts": union([
					_undefined(),
					literal(false),
					literal(true)
				]).optional(),
				"unpackedSize": union([_undefined(), number()]).optional(),
				"installSize": union([_undefined(), number()]).optional(),
				"archived": union([
					_undefined(),
					literal(false),
					literal(true)
				]).optional(),
				"forked": union([
					_undefined(),
					literal(false),
					literal(true)
				]).optional(),
				"icon": union([_undefined(), string()]).optional()
			})),
			"denied": array(object({
				"name": string(),
				"detail": string(),
				"replacement": union([_undefined(), string()]).optional()
			})),
			"notAShop": union([_undefined(), array(string())]).optional(),
			"stars": record(string(), number()),
			"icons": record(string(), string()),
			"incompatible": record(string(), array(string())),
			"incompatibleHarness": record(string(), object({
				"dsh": union([_undefined(), object({
					"range": string(),
					"running": string()
				})]).optional(),
				"profile": union([_undefined(), object({
					"declared": array(string()),
					"running": string()
				})]).optional(),
				"peers": union([_undefined(), object({
					"refused": record(string(), string()),
					"running": string(),
					"allowCommand": union([literal(null), string()])
				})]).optional()
			}))
		});
		const dsh_plugin_shop_shop_installed_result$schema = array(object({
			"name": string(),
			"source": union([literal("npm"), literal("github")]),
			"repo": union([_undefined(), string()]).optional(),
			"subdir": union([_undefined(), string()]).optional(),
			"installed": string(),
			"latest": union([literal(null), string()]),
			"outdated": boolean(),
			"enabled": boolean(),
			"shadowed": union([_undefined(), literal(true)]).optional()
		}));
		const dsh_plugin_shop_shop_installedSpecs_result$schema = union([literal(null), record(string(), string())]);
		const dsh_plugin_shop_shop_installStart_parameter_0$schema = object({
			"name": string(),
			"version": string(),
			"acknowledged": union([
				_undefined(),
				literal(false),
				literal(true)
			]).optional(),
			"source": union([
				_undefined(),
				literal("npm"),
				literal("github")
			]).optional(),
			"repo": union([_undefined(), string()]).optional(),
			"subdir": union([_undefined(), string()]).optional()
		});
		const dsh_plugin_shop_shop_installStart_result$schema = union([object({
			"ok": literal(true),
			"installId": string(),
			"state": union([
				literal("downloading"),
				literal("running"),
				literal("done"),
				literal("failed")
			])
		}), object({
			"ok": literal(false),
			"code": union([
				literal("not-in-catalog"),
				literal("denied"),
				literal("version-mismatch"),
				literal("needs-acknowledgement"),
				literal("tarball-integrity"),
				literal("ambiguous-identity"),
				literal("name-taken"),
				literal("desktop-profile")
			]),
			"detail": string()
		})]);
		const dsh_plugin_shop_shop_installStatus_parameter_0$schema = object({ "installId": string() });
		const dsh_plugin_shop_shop_installStatus_result$schema = object({
			"found": boolean(),
			"state": union([
				literal("downloading"),
				literal("running"),
				literal("done"),
				literal("failed")
			]),
			"log": array(string()),
			"activation": union([
				_undefined(),
				literal("live"),
				literal("reload"),
				literal("restart")
			]).optional(),
			"restartReason": union([
				_undefined(),
				literal("no-patch"),
				literal("not-simple"),
				literal("host-unsupported"),
				literal("timeout"),
				literal("mount-failed"),
				literal("already-loaded")
			]).optional(),
			"detail": union([_undefined(), string()]).optional(),
			"command": union([_undefined(), string()]).optional()
		});
		const dsh_plugin_shop_shop_restart_result$schema = union([object({
			"ok": literal(true),
			"logFile": union([_undefined(), string()]).optional(),
			"bootId": union([_undefined(), string()]).optional(),
			"pid": union([_undefined(), number()]).optional()
		}), object({
			"ok": literal(false),
			"detail": string()
		})]);
		const dsh_plugin_shop_shop_rollbackStart_parameter_0$schema = object({ "key": string() });
		const dsh_plugin_shop_shop_rollbackStart_result$schema = union([object({
			"ok": literal(true),
			"installId": string(),
			"state": union([
				literal("downloading"),
				literal("running"),
				literal("done"),
				literal("failed")
			])
		}), object({
			"ok": literal(false),
			"code": union([
				literal("not-in-catalog"),
				literal("denied"),
				literal("version-mismatch"),
				literal("needs-acknowledgement"),
				literal("tarball-integrity"),
				literal("ambiguous-identity"),
				literal("name-taken"),
				literal("desktop-profile")
			]),
			"detail": string()
		})]);
		const dsh_plugin_shop_shop_setEnabled_parameter_0$schema = object({
			"name": string(),
			"enabled": boolean()
		});
		const dsh_plugin_shop_shop_setEnabled_result$schema = union([object({
			"ok": literal(true),
			"activation": union([
				literal("live"),
				literal("reload"),
				literal("restart")
			])
		}), object({
			"ok": literal(false),
			"detail": string()
		})]);
		const dsh_plugin_shop_shop_setFavorite_parameter_0$schema = object({
			"key": string(),
			"favorite": boolean()
		});
		const dsh_plugin_shop_shop_setFavorite_result$schema = object({
			"ok": boolean(),
			"detail": union([_undefined(), string()]).optional()
		});
		const dsh_plugin_shop_shop_state_result$schema = object({
			"favorites": array(string()),
			"rollback": record(string(), string())
		});
		const dsh_plugin_shop_shop_uninstallStart_parameter_0$schema = object({ "name": string() });
		const dsh_plugin_shop_shop_uninstallStart_result$schema = union([object({
			"ok": literal(true),
			"installId": string()
		}), object({
			"ok": literal(false),
			"detail": string()
		})]);
		const dsh_plugin_shop_shop_updateStart_parameter_0$schema = object({ "version": string() });
		const dsh_plugin_shop_shop_updateStart_result$schema = union([object({
			"ok": literal(true),
			"installId": string(),
			"state": union([
				literal("downloading"),
				literal("running"),
				literal("done"),
				literal("failed")
			])
		}), object({
			"ok": literal(false),
			"code": union([_undefined(), literal("desktop-manual")]).optional(),
			"detail": string()
		})]);
		const dsh_plugin_shop_shop_version_result$schema = object({
			"installed": string(),
			"latest": union([literal(null), string()]),
			"outdated": boolean(),
			"restartBlocked": union([
				literal(null),
				literal("desktop"),
				literal("from-default-profile"),
				literal("windows"),
				literal("systemd"),
				literal("port-zero")
			]),
			"pendingVersion": union([
				_undefined(),
				literal(null),
				string()
			]).optional(),
			"bootId": union([_undefined(), string()]).optional(),
			"selfUpdate": union([
				_undefined(),
				literal(null),
				literal("dsh-page")
			]).optional()
		});
		const TYPERT_REMOTE = {
			package: "dsh-plugin-shop",
			descriptors: [
				{
					id: "dsh-plugin-shop#shop/catalog",
					service: "shop",
					namespace: "shop",
					method: "catalog",
					invocation: { kind: "direct" },
					parameters: [{
						name: "args",
						wire: "args",
						source: "json",
						acceptsUndefined: true,
						codec: {
							mode: "strict",
							typeSymbol: "dsh-plugin-shop#shop/catalog:args",
							schema: dsh_plugin_shop_shop_catalog_parameter_0$schema,
							create: () => dsh_plugin_shop_shop_catalog_parameter_0$schema
						}
					}],
					result: {
						mode: "strict",
						typeSymbol: "dsh-plugin-shop/types#ShopCatalogResult",
						schema: dsh_plugin_shop_shop_catalog_result$schema,
						create: () => dsh_plugin_shop_shop_catalog_result$schema
					},
					sourceLocation: {
						"file": "packages/dsh-plugin-shop/src/host/index.ts",
						"line": 1384,
						"column": 9
					}
				},
				{
					id: "dsh-plugin-shop#shop/installed",
					service: "shop",
					namespace: "shop",
					method: "installed",
					invocation: { kind: "direct" },
					parameters: [],
					result: {
						mode: "strict",
						typeSymbol: "dsh-plugin-shop#shop/installed:result",
						schema: dsh_plugin_shop_shop_installed_result$schema,
						create: () => dsh_plugin_shop_shop_installed_result$schema
					},
					sourceLocation: {
						"file": "packages/dsh-plugin-shop/src/host/index.ts",
						"line": 2226,
						"column": 9
					}
				},
				{
					id: "dsh-plugin-shop#shop/installedSpecs",
					service: "shop",
					namespace: "shop",
					method: "installedSpecs",
					invocation: { kind: "direct" },
					parameters: [],
					result: {
						mode: "strict",
						typeSymbol: "dsh-plugin-shop#shop/installedSpecs:result",
						schema: dsh_plugin_shop_shop_installedSpecs_result$schema,
						create: () => dsh_plugin_shop_shop_installedSpecs_result$schema
					},
					sourceLocation: {
						"file": "packages/dsh-plugin-shop/src/host/index.ts",
						"line": 2064,
						"column": 9
					}
				},
				{
					id: "dsh-plugin-shop#shop/installStart",
					service: "shop",
					namespace: "shop",
					method: "installStart",
					implementation: "install",
					invocation: { kind: "direct" },
					parameters: [{
						name: "args",
						wire: "args",
						source: "json",
						codec: {
							mode: "strict",
							typeSymbol: "dsh-plugin-shop/types#InstallArgs",
							schema: dsh_plugin_shop_shop_installStart_parameter_0$schema,
							create: () => dsh_plugin_shop_shop_installStart_parameter_0$schema
						}
					}],
					result: {
						mode: "strict",
						typeSymbol: "dsh-plugin-shop/types#ShopInstallResult",
						schema: dsh_plugin_shop_shop_installStart_result$schema,
						create: () => dsh_plugin_shop_shop_installStart_result$schema
					},
					sourceLocation: {
						"file": "packages/dsh-plugin-shop/src/host/index.ts",
						"line": 1511,
						"column": 9
					}
				},
				{
					id: "dsh-plugin-shop#shop/installStatus",
					service: "shop",
					namespace: "shop",
					method: "installStatus",
					invocation: { kind: "direct" },
					parameters: [{
						name: "args",
						wire: "args",
						source: "json",
						codec: {
							mode: "strict",
							typeSymbol: "dsh-plugin-shop#shop/installStatus:args",
							schema: dsh_plugin_shop_shop_installStatus_parameter_0$schema,
							create: () => dsh_plugin_shop_shop_installStatus_parameter_0$schema
						}
					}],
					result: {
						mode: "strict",
						typeSymbol: "dsh-plugin-shop/types#ShopInstallStatusResult",
						schema: dsh_plugin_shop_shop_installStatus_result$schema,
						create: () => dsh_plugin_shop_shop_installStatus_result$schema
					},
					sourceLocation: {
						"file": "packages/dsh-plugin-shop/src/host/index.ts",
						"line": 2040,
						"column": 3
					}
				},
				{
					id: "dsh-plugin-shop#shop/restart",
					service: "shop",
					namespace: "shop",
					method: "restart",
					invocation: { kind: "direct" },
					parameters: [],
					result: {
						mode: "strict",
						typeSymbol: "dsh-plugin-shop/types#ShopRestartResult",
						schema: dsh_plugin_shop_shop_restart_result$schema,
						create: () => dsh_plugin_shop_shop_restart_result$schema
					},
					sourceLocation: {
						"file": "packages/dsh-plugin-shop/src/host/index.ts",
						"line": 2477,
						"column": 9
					}
				},
				{
					id: "dsh-plugin-shop#shop/rollbackStart",
					service: "shop",
					namespace: "shop",
					method: "rollbackStart",
					invocation: { kind: "direct" },
					parameters: [{
						name: "args",
						wire: "args",
						source: "json",
						codec: {
							mode: "strict",
							typeSymbol: "dsh-plugin-shop#shop/rollbackStart:args",
							schema: dsh_plugin_shop_shop_rollbackStart_parameter_0$schema,
							create: () => dsh_plugin_shop_shop_rollbackStart_parameter_0$schema
						}
					}],
					result: {
						mode: "strict",
						typeSymbol: "dsh-plugin-shop/types#ShopInstallResult",
						schema: dsh_plugin_shop_shop_rollbackStart_result$schema,
						create: () => dsh_plugin_shop_shop_rollbackStart_result$schema
					},
					sourceLocation: {
						"file": "packages/dsh-plugin-shop/src/host/index.ts",
						"line": 2157,
						"column": 9
					}
				},
				{
					id: "dsh-plugin-shop#shop/setEnabled",
					service: "shop",
					namespace: "shop",
					method: "setEnabled",
					invocation: { kind: "direct" },
					parameters: [{
						name: "args",
						wire: "args",
						source: "json",
						codec: {
							mode: "strict",
							typeSymbol: "dsh-plugin-shop#shop/setEnabled:args",
							schema: dsh_plugin_shop_shop_setEnabled_parameter_0$schema,
							create: () => dsh_plugin_shop_shop_setEnabled_parameter_0$schema
						}
					}],
					result: {
						mode: "strict",
						typeSymbol: "dsh-plugin-shop/types#ShopSetEnabledResult",
						schema: dsh_plugin_shop_shop_setEnabled_result$schema,
						create: () => dsh_plugin_shop_shop_setEnabled_result$schema
					},
					sourceLocation: {
						"file": "packages/dsh-plugin-shop/src/host/index.ts",
						"line": 1036,
						"column": 9
					}
				},
				{
					id: "dsh-plugin-shop#shop/setFavorite",
					service: "shop",
					namespace: "shop",
					method: "setFavorite",
					invocation: { kind: "direct" },
					parameters: [{
						name: "args",
						wire: "args",
						source: "json",
						codec: {
							mode: "strict",
							typeSymbol: "dsh-plugin-shop#shop/setFavorite:args",
							schema: dsh_plugin_shop_shop_setFavorite_parameter_0$schema,
							create: () => dsh_plugin_shop_shop_setFavorite_parameter_0$schema
						}
					}],
					result: {
						mode: "strict",
						typeSymbol: "dsh-plugin-shop#shop/setFavorite:result",
						schema: dsh_plugin_shop_shop_setFavorite_result$schema,
						create: () => dsh_plugin_shop_shop_setFavorite_result$schema
					},
					sourceLocation: {
						"file": "packages/dsh-plugin-shop/src/host/index.ts",
						"line": 2114,
						"column": 9
					}
				},
				{
					id: "dsh-plugin-shop#shop/state",
					service: "shop",
					namespace: "shop",
					method: "state",
					implementation: "shopState",
					invocation: { kind: "direct" },
					parameters: [],
					result: {
						mode: "strict",
						typeSymbol: "dsh-plugin-shop/types#ShopStateResult",
						schema: dsh_plugin_shop_shop_state_result$schema,
						create: () => dsh_plugin_shop_shop_state_result$schema
					},
					sourceLocation: {
						"file": "packages/dsh-plugin-shop/src/host/index.ts",
						"line": 2079,
						"column": 9
					}
				},
				{
					id: "dsh-plugin-shop#shop/uninstallStart",
					service: "shop",
					namespace: "shop",
					method: "uninstallStart",
					implementation: "uninstall",
					invocation: { kind: "direct" },
					parameters: [{
						name: "args",
						wire: "args",
						source: "json",
						codec: {
							mode: "strict",
							typeSymbol: "dsh-plugin-shop#shop/uninstallStart:args",
							schema: dsh_plugin_shop_shop_uninstallStart_parameter_0$schema,
							create: () => dsh_plugin_shop_shop_uninstallStart_parameter_0$schema
						}
					}],
					result: {
						mode: "strict",
						typeSymbol: "dsh-plugin-shop/types#ShopUninstallResult",
						schema: dsh_plugin_shop_shop_uninstallStart_result$schema,
						create: () => dsh_plugin_shop_shop_uninstallStart_result$schema
					},
					sourceLocation: {
						"file": "packages/dsh-plugin-shop/src/host/index.ts",
						"line": 2371,
						"column": 9
					}
				},
				{
					id: "dsh-plugin-shop#shop/updateStart",
					service: "shop",
					namespace: "shop",
					method: "updateStart",
					invocation: { kind: "direct" },
					parameters: [{
						name: "args",
						wire: "args",
						source: "json",
						codec: {
							mode: "strict",
							typeSymbol: "dsh-plugin-shop#shop/updateStart:args",
							schema: dsh_plugin_shop_shop_updateStart_parameter_0$schema,
							create: () => dsh_plugin_shop_shop_updateStart_parameter_0$schema
						}
					}],
					result: {
						mode: "strict",
						typeSymbol: "dsh-plugin-shop/types#ShopUpdateResult",
						schema: dsh_plugin_shop_shop_updateStart_result$schema,
						create: () => dsh_plugin_shop_shop_updateStart_result$schema
					},
					sourceLocation: {
						"file": "packages/dsh-plugin-shop/src/host/index.ts",
						"line": 2585,
						"column": 9
					}
				},
				{
					id: "dsh-plugin-shop#shop/version",
					service: "shop",
					namespace: "shop",
					method: "version",
					invocation: { kind: "direct" },
					parameters: [],
					result: {
						mode: "strict",
						typeSymbol: "dsh-plugin-shop/types#ShopVersionResult",
						schema: dsh_plugin_shop_shop_version_result$schema,
						create: () => dsh_plugin_shop_shop_version_result$schema
					},
					sourceLocation: {
						"file": "packages/dsh-plugin-shop/src/host/index.ts",
						"line": 2541,
						"column": 9
					}
				}
			]
		};
		//#endregion
		//#region src/client/locales.ts
		/** Copy dictionaries for the shop's page in dsh's main column, its row in the
		* sidebar, and its two buttons on dsh's Plugins page. */
		/** Simplified Chinese dictionary and key source of truth. */
		const zh = {
			/** The shop's name: its sidebar row and its page title (design
			* 2026-10-16-shop-sidebar-page §4.1), one key so the two cannot drift
			* apart. */
			title: "插件商店",
			/** The page's intro line, under its title, as dsh's own pages carry one. */
			intro: "浏览、安装和更新插件。",
			/** The Plugins page's button on the shop's own bundle page (design
			* 2026-10-16-shop-sidebar-page §7). */
			openShop: "打开插件商店",
			/** Its button on a page of a bundle the shelf lists. */
			viewInShop: "在插件商店中查看",
			loading: "正在加载插件列表…",
			error: "插件列表加载失败，请重试。",
			installedLoading: "正在加载已安装插件列表…",
			installedError: "已安装插件列表加载失败，请重试。",
			retry: "重试",
			/** The shop's own error boundary caught a render error; the error's message
			* follows on its own line, and Retry remounts the tab (design
			* 2026-09-26-market-borrowings §4). */
			tabCrashed: "插件商店暂时无法显示，请重试。",
			search: "搜索插件",
			/** One subdued line under the search box when a Chinese query fired a
			* dictionary intent (design 2026-10-08-search-query-expansion §4).
			* `{terms}` is the comma-joined recall terms, without the `#` marker
			* (boundary-only surface detail, not a reader's fact). */
			zhExpansionNote: "同时匹配：{terms}",
			all: "全部",
			catalog: "插件目录",
			catalogStats: "{count} 个插件 · 目录更新于 {date}",
			/** The shelf's order control, and the date each card carries under the two
			* date orders (design 2026-10-12-shelf-orders §4). */
			sortLabel: "排序",
			/** The wide layout's rail headings (design 2026-11-02-shop-widescreen-layout
			* §4): the category group above, the hide-incompatible modifier below. */
			categoriesHeading: "分类",
			filterHeading: "筛选",
			sortStars: "星标最多",
			sortAdded: "最新上架",
			sortUpdated: "最近更新",
			listedOn: "{date} 上架",
			updatedOn: "{date} 更新",
			stars: "{count} 个星标",
			categoryTool: "工具",
			categoryProvider: "模型服务",
			categoryUi: "界面",
			categoryWorkflow: "工作流",
			categoryIntegration: "集成",
			categoryTheme: "主题",
			categoryOther: "其他",
			empty: "暂无插件。",
			emptySearch: "没有找到匹配的插件。试试其他关键词或分类。",
			tierVerified: "已审核",
			tierVerifiedStale: "当前版本未审核",
			tierCommunity: "社区",
			/** The github repository GitHub reports as archived (design 2026-10-08 §1.3).
			* Subdued register, like `tierCommunity`: nothing is wrong with the install
			* itself; the owner has simply frozen the project. */
			archivedBadge: "已归档",
			capabilitiesNote: "权限由作者声明，插件的实际权限可能超出这一范围。",
			install: "安装",
			cancel: "取消",
			dismiss: "知道了",
			/** The copy button beside a failed install's command line (design
			* 2026-11-02-market-borrowings §5). `copied` replaces it only after the
			* clipboard write resolved, so it is never claimed early. */
			copyCommand: "复制命令",
			copied: "已复制",
			/** The fold toggle under a card's collapsed red block. `aria-expanded` plus:
			* open shows the whole block; closed shows two lines of it. This toggle is
			* independent of the card's own header-expand. */
			moreRedLines: "展开",
			lessRedLines: "收起",
			installing: "正在安装…",
			downloading: "正在下载…",
			installedRestartNotice: "已安装，重启 dsh 后生效。",
			incompatibleBadge: "不兼容",
			incompatibleDetail: "缺少所需的组件或插件：{modules}\n此插件可能适用于其他版本的 dsh。",
			/** The author's own `dsh.compatibility`, unmet on this machine (design
			* 2026-09-01 §8.2). Each names BOTH sides — what the author declared and
			* what this dsh runs — because the host sends both, and a bare
			* "unsupported" leaves the reader guessing which side is off. */
			harnessRangeDetail: "作者声明支持 dsh {range}，当前版本为 {running}。",
			harnessProfileDetail: "作者声明支持的配置（profile）：{declared}。当前使用的是 {running}。",
			/** dsh's OWN refusal (0.1.7 on), not the author's claim: the card shows the
			* refused label in the install button's place (design
			* 2026-09-26-dsh-017-readiness, B1, amended 2026-10-14). `{peers}`
			* is each refused peer with the range the package declared. The remedy
			* leads into the exemption command, rendered on its own line after it, and
			* names the Refresh button by its label. */
			harnessPeersDetail: "此插件要求 {peers}，当前的 dsh {running} 不满足要求，无法安装。",
			harnessPeersRemedy: "继续安装可能导致崩溃或数据丢失。若接受这些风险，可在终端运行以下命令，允许安装此版本，然后点击“刷新”：",
			hotNoPatchNotice: "已安装，但未找到可即时加载的插件配置。请重启 dsh 使其生效。",
			hotNotSimpleNotice: "已安装，但插件配置需要重启 dsh 才能加载。",
			hotHostUnsupportedNotice: "已安装，当前环境需要重启 dsh 才能加载插件。",
			hotTimeoutNotice: "已安装，但加载超时。请重启 dsh 使其生效。",
			hotMountFailedNotice: "已安装，但加载失败。请重启 dsh 使其生效。",
			/** No mount was tried: this dsh already loaded the package once, and Node
			* will not load a second copy from the same place (design
			* 2026-09-26-market-borrowings §1). Covers an update and a reinstall alike,
			* so it names the new files rather than a "new version". */
			hotAlreadyLoadedNotice: "已安装。dsh 已加载过此插件，新安装的文件将在重启后生效。",
			installedNoRestartNotice: "已安装并生效，无需重启。",
			installedReloadNotice: "已生效，刷新页面即可看到更改。",
			reload: "刷新页面",
			reloadNote: "更改已在服务器上生效，刷新页面后即可看到。当前页面中未完成的内容会丢失。",
			installFailed: "安装失败",
			installTransportFailed: "安装请求失败，请稍后重试。",
			refresh: "刷新",
			refreshing: "刷新中…",
			refreshFailed: "刷新失败，当前显示的是上次加载的插件列表。",
			staleLabel: "当前显示 {date} 的插件列表",
			showing: "已显示 {shown} 个，共 {total} 个 · 向下滚动加载更多",
			repository: "仓库",
			npmPage: "npm 页面",
			authorLine: "作者：{author}",
			/** The accessible name and tooltip of the size label; the label itself shows
			* the bare figure. "磁盘占用" is the load-bearing phrase — the number is what
			* the install lands on disk, not the download. It replaced "解包后", which
			* was npm's word: a commit-pinned github entry unpacks nothing, its figure
			* being the sum of its git tree's blobs. One phrase now covers both sources
			* and stays true of npm, whose number is unchanged. */
			sizeLabel: "磁盘占用：{size}",
			/** The incompatible filter's label. FIXED — the switch beside it carries the
			* state, so the words name what the switch does and never flip with it. */
			hideIncompatible: "隐藏不兼容 {count}",
			/** The favorites switch (design 2026-11-02-market-borrowings §7), fixed for
			* the same reason `hideIncompatible` is: the switch carries the state. */
			favoritesFilter: "只看收藏",
			favoritesFilterTitle: "只显示已收藏的插件",
			emptyFavoritesFiltered: "匹配的插件都没有收藏。关闭“只看收藏”即可查看。",
			/** What the filter takes away is every card whose badge reads 不兼容 —
			* missing components OR an author's declaration this dsh does not meet —
			* so these three name the badge, not one of its reasons. */
			incompatibleFilterTitle: "隐藏标为不兼容的插件",
			showIncompatibleTitle: "显示标为不兼容的插件",
			emptyIncompatibleFiltered: "匹配的插件都标为不兼容。关闭“隐藏不兼容”即可查看。",
			license: "许可证",
			customLicense: "自定义许可证",
			/** The prepurchase facts' detail rows (design 2026-11-02-market-borrowings
			* §1–§2). `requiresDsh` names the field as dsh's own refusal names it — a
			* manifest path, not a package — and the row prints the range the author
			* wrote, verbatim. */
			requiresDsh: "需要 dsh",
			dependencies: "依赖",
			commands: "提供的命令",
			/** The install-scripts row (design 2026-11-04-borrowings-round-4 §2). The
			* second line states what pnpm does with it, so the fact is not read as a
			* verdict on the script. */
			installScripts: "安装脚本",
			/** The failure report's prefilled issue (design 2026-11-05-failure-report.md). */
			reportProblem: "报告问题",
			installScriptsDeclared: "声明了安装时运行的脚本（pnpm 默认不执行）",
			/** The size label's tooltip for an install that lands more than 50 MB on
			* disk. The figure is already large on screen; this phrase says why it is
			* tinted, without inventing a threshold nobody measured — 50 MB is the
			* figure the competitor's own users proposed. */
			sizeLabelLarge: "磁盘占用较大：{size}",
			reviewedVersionLine: "已审核版本：{reviewed} · 当前版本 {current} 尚未审核",
			reviewedPinLine: "已审核：{pin} · 当前版本 {current} 尚未审核",
			deniedCode: "不允许安装",
			notInCatalogCode: "不在目录中",
			versionMismatchCode: "版本不匹配",
			needsAcknowledgementCode: "需要确认安装",
			tarballIntegrityCode: "压缩包完整性校验失败",
			ambiguousIdentityCode: "无法确定要安装的插件",
			nameTakenCode: "已安装其他同名插件",
			desktopProfileCode: "此配置由桌面版管理",
			nameTakenBadge: "名称冲突",
			nameTakenDetail: "已安装同名插件（{holder}），安装此插件会替换它。\n同一配置中只能安装一个同名插件。若要更换，请先卸载已安装的插件。",
			npmSource: "npm 包",
			githubSource: "GitHub 源码",
			/** The accessible name and the tooltip of a card's version, which say which
			* of three things the printed string is (market borrowings §11): the string
			* alone cannot tell a release tag from a version number, and a short commit
			* printed with a `v` read as one. */
			npmVersionLabel: "npm 版本 {version}",
			commitVersionLabel: "GitHub 提交 {version}",
			releaseVersionLabel: "GitHub 发布版本 {version}",
			/** The badge and the explanation for an installed github entry no catalog
			* row claims (C10 MVP). The mechanism synthesizes a row for ANY github spec
			* with no catalog row — shadowed by a same-named npm package, an unlisted
			* fork, a removed listing, or a same-named conflict with a different repo —
			* so the copy names the catalog fact and lists the causes, rather than
			* claiming the npm-twin one. */
			shadowedBadge: "未在目录中列出",
			shadowedDetail: "此插件已安装，但当前目录未列出它，不影响现有使用。可能是目录只展示了同名 npm 包、插件已下架，或尚未被收录。",
			updatableSection: "有可用更新",
			/** `{version}` is the shelf's own version text (`versionLabel`), which
			* carries the `v` an npm version takes and no other kind does. */
			installedVersion: "已安装 {version}",
			latestVersion: "最新版本 {version}",
			/** The rollback offer on an installed card (design
			* 2026-11-02-market-borrowings §6). `{version}` is the version the record
			* names, formatted by `versionLabel` before it gets here. */
			/** The star's accessible name and tooltip (design 2026-11-02-market-borrowings
			* §7). A fixed pair: the visible glyph is the same in both states, so the
			* label names the action, and `aria-pressed` carries the state. */
			favorite: "收藏",
			unfavorite: "取消收藏",
			rollbackTo: "回到 {version}",
			rollingBack: "正在回滚…",
			rollbackFailed: "回滚失败，请重试。",
			/** The update row's link to what the new version changed (design
			* 2026-11-02-market-borrowings §4): the npm page of the target version, the
			* GitHub compare view, or the repository's releases. */
			whatChanged: "查看变更",
			update: "更新",
			/** The Updatable section's one batch action (design
			* 2026-11-04-borrowings-round-4 §3). `{count}` is the rows it will start. */
			updateAll: "全部更新（{count}）",
			installed: "已安装",
			uninstall: "卸载",
			uninstalling: "正在卸载…",
			uninstallFailed: "卸载失败",
			uninstallTransportFailed: "卸载请求失败，请稍后重试。",
			uninstalledLiveNotice: "已卸载并停止运行，下次启动 dsh 时也不会再加载此插件。",
			uninstalledRestartNotice: "已卸载，重启 dsh 后生效。",
			uninstalledReloadNotice: "已卸载，刷新页面后即可移除界面中的相关内容。下次启动 dsh 时也不会再加载此插件。",
			restart: "重启 dsh",
			restartTitle: "重启 dsh？",
			restartBody: "重启会暂时断开连接，并中断正在进行的对话和任务。服务器就绪后，页面会自动重新连接。",
			restartConfirm: "重启",
			restarting: "正在重启 dsh，服务器就绪后页面会自动刷新…",
			restartFailedNotice: "重启后未能连接到服务器。请运行 dsh web 手动启动；启动日志位于插件商店缓存目录中的 restart.log。",
			/** The same failure, when the host said where the new process writes —
			* which is where a boot that died explains itself (design
			* 2026-09-26-market-borrowings §3). "Or did not stay up": the page now
			* waits for the new server to keep answering, so this also covers a boot
			* that answered and then died. */
			restartFailedLogNotice: "重启后未能连接到服务器，或服务器启动后再次停止。请查看启动日志 {log}，也可运行 dsh web 手动启动。",
			restartTransportFailed: "重启请求失败，请稍后重试。",
			notRestartedNotice: "dsh 尚未重启，当前仍连接到原来的进程，更改尚未生效。请退出正在运行的 dsh，再运行 dsh web。",
			notRestartedPidNotice: "dsh 尚未重启，原来的进程（PID {pid}）仍在运行，更改尚未生效。请运行 kill {pid} 结束该进程；若无法退出，可用 kill -9 {pid} 强制结束。然后运行 dsh web。",
			notRestartedLogNotice: "重启日志：{log}",
			restartBlockedDesktopNotice: "此配置由 DeepSeek Harness 桌面版管理。请重启桌面版以使更改生效。",
			restartBlockedFromDefaultProfileNotice: "dsh 启动时使用了 --from-default-profile 参数。从 dsh 0.2.1 起，这会在重启时按模板重建配置，并删除已安装的所有插件，包括插件商店。请去掉该参数后手动重启 dsh。",
			restartBlockedWindowsNotice: "Windows 上暂不支持从插件商店重启 dsh。请退出 dsh 后重新启动，使更改生效。",
			restartBlockedSystemdNotice: "dsh 由 systemd 服务管理。从插件商店重启可能导致服务停止后无法恢复，请手动重启服务。若要允许从商店重启，可在插件商店配置中设置 allowRestart: true。",
			restartBlockedPortZeroNotice: "dsh 启动时使用了 --port 0 参数，重启后端口会改变，页面无法自动重新连接。请手动重启 dsh，再打开新的地址。",
			updateFailed: "更新失败",
			updateTransportFailed: "更新请求失败，请稍后重试。",
			checkUpdate: "检查更新",
			checkUpdateTitle: "检查是否有新版本",
			updateInDshPage: "在插件页更新",
			updateInDshPageTitle: "商店无法在运行时替换自己。将打开 dsh「插件」页中 dsh-plugin-shop 的详情，在那里点「更新」——dsh 会先移除再安装，失败时恢复旧版本。",
			upToDate: "已是最新版本",
			github: "GitHub",
			enabledSwitch: "启用",
			toggleFailed: "未能更改启用状态，请重试。",
			hotApplyNote: "已生效，无需重启。",
			toggleRestartNote: "已保存，重启 dsh 后生效。"
		};
		/** English dictionary checked against the Chinese key set. */
		const en = {
			title: "Plugin shop",
			intro: "Browse, install, and update plugins.",
			openShop: "Open Plugin shop",
			viewInShop: "View in Plugin shop",
			loading: "Loading plugins…",
			error: "Could not load the plugin catalog. Please try again.",
			installedLoading: "Loading installed plugins…",
			installedError: "Could not load your installed plugins. Please try again.",
			retry: "Retry",
			tabCrashed: "The plugin shop could not display this page. Please try again.",
			search: "Search plugins",
			/** One subdued line under the search box when a Chinese query fired a
			* dictionary intent (design 2026-10-08-search-query-expansion §4). */
			zhExpansionNote: "Also matching: {terms}",
			all: "All",
			catalog: "Plugin catalog",
			catalogStats: "{count} plugins · Catalog updated {date}",
			/** The shelf's order control, and the date each card carries under the two
			* date orders (design 2026-10-12-shelf-orders §4). */
			sortLabel: "Sort",
			/** The wide layout's rail headings (design 2026-11-02-shop-widescreen-layout
			* §4): the category group above, the hide-incompatible modifier below. */
			categoriesHeading: "Categories",
			filterHeading: "Filter",
			sortStars: "Most stars",
			sortAdded: "Newest",
			sortUpdated: "Recently updated",
			listedOn: "Listed {date}",
			updatedOn: "Updated {date}",
			stars: "{count} stars",
			categoryTool: "Tools",
			categoryProvider: "Model providers",
			categoryUi: "Interface",
			categoryWorkflow: "Workflows",
			categoryIntegration: "Integrations",
			categoryTheme: "Themes",
			categoryOther: "Other",
			empty: "No plugins yet.",
			emptySearch: "No matching plugins. Try another search or category.",
			tierVerified: "Reviewed",
			/** The github repository GitHub reports as archived (design 2026-10-08 §1.3).
			* Subdued register: nothing is wrong with the install; the owner has simply
			* frozen the project. */
			archivedBadge: "Archived",
			tierVerifiedStale: "Current version unreviewed",
			tierCommunity: "Community",
			capabilitiesNote: "These permissions are declared by the author. They do not limit what the plugin can access.",
			install: "Install",
			cancel: "Cancel",
			dismiss: "Got it",
			copyCommand: "Copy command",
			copied: "Copied",
			moreRedLines: "Show more",
			lessRedLines: "Show less",
			installing: "Installing…",
			downloading: "Downloading…",
			installedRestartNotice: "Installed. Restart dsh to apply the change.",
			incompatibleBadge: "Incompatible",
			incompatibleDetail: "Missing required components or plugins: {modules}\nThis plugin may need a different version of dsh.",
			harnessRangeDetail: "The author lists support for dsh {range}. You are running {running}.",
			harnessProfileDetail: "The author lists support for these profiles: {declared}. You are using {running}.",
			harnessPeersDetail: "This plugin requires {peers}, which your dsh {running} does not satisfy. Installation is blocked.",
			harnessPeersRemedy: "Installing this version may cause crashes or data loss. If you accept these risks, run this command in a terminal to allow this exact version, then click Refresh:",
			hotNoPatchNotice: "Installed, but no plugin configuration could be loaded immediately. Restart dsh to apply the change.",
			hotNotSimpleNotice: "Installed. This plugin configuration needs a dsh restart to load.",
			hotHostUnsupportedNotice: "Installed. Your environment needs a dsh restart to load the plugin.",
			hotTimeoutNotice: "Installed, but loading timed out. Restart dsh to apply the change.",
			hotMountFailedNotice: "Installed, but the plugin could not load. Restart dsh to apply the change.",
			hotAlreadyLoadedNotice: "Installed. dsh has already loaded this plugin, so the new files will take effect after a restart.",
			installedNoRestartNotice: "Installed and ready to use. No restart needed.",
			installedReloadNotice: "Applied. Reload the page to see the change.",
			reload: "Reload the page",
			reloadNote: "The change is active on the server. Reload the page to see it. Any unfinished work on this page will be lost.",
			installFailed: "Install failed",
			installTransportFailed: "The install request failed. Please try again.",
			refresh: "Refresh",
			refreshing: "Refreshing…",
			refreshFailed: "Could not refresh. Showing the last loaded catalog.",
			staleLabel: "Showing the catalog from {date}",
			showing: "Showing {shown} of {total} · Scroll down to load more",
			repository: "Repository",
			npmPage: "npm page",
			authorLine: "Author: {author}",
			sizeLabel: "{size} on disk",
			hideIncompatible: "Hide incompatible {count}",
			favoritesFilter: "Favorites only",
			favoritesFilterTitle: "Show only plugins you starred",
			emptyFavoritesFiltered: "None of the matching plugins are starred. Turn off \"Favorites only\" to see them.",
			incompatibleFilterTitle: "Hide plugins marked as incompatible",
			showIncompatibleTitle: "Show plugins marked as incompatible",
			emptyIncompatibleFiltered: "All matching plugins are marked as incompatible. Turn off \"Hide incompatible\" to see them.",
			license: "License",
			customLicense: "Custom license",
			requiresDsh: "Requires dsh",
			dependencies: "Dependencies",
			commands: "Commands",
			installScripts: "Install scripts",
			reportProblem: "Report a problem",
			installScriptsDeclared: "Declares a script that runs at install time (pnpm does not run it by default)",
			sizeLabelLarge: "{size} on disk — large",
			reviewedVersionLine: "Reviewed: {reviewed} · Current version {current} has not been reviewed",
			reviewedPinLine: "Reviewed: {pin} · Current version {current} has not been reviewed",
			deniedCode: "Installation blocked",
			notInCatalogCode: "Not in the catalog",
			versionMismatchCode: "Version mismatch",
			needsAcknowledgementCode: "Installation confirmation needed",
			tarballIntegrityCode: "Package integrity check failed",
			ambiguousIdentityCode: "Could not identify the plugin",
			nameTakenCode: "Another plugin with this name is installed",
			desktopProfileCode: "Managed by the desktop app",
			nameTakenBadge: "Name conflict",
			nameTakenDetail: "Another plugin with this name is installed ({holder}). Installing this one would replace it.\nA profile can hold only one plugin of each name. To switch, uninstall the existing plugin first.",
			npmSource: "npm package",
			githubSource: "GitHub source",
			npmVersionLabel: "npm version {version}",
			commitVersionLabel: "GitHub commit {version}",
			releaseVersionLabel: "GitHub release {version}",
			shadowedBadge: "Not in the current catalog",
			shadowedDetail: "This plugin is installed but is not listed in the current catalog. You can keep using it. The catalog may show an npm package of the same name, or this plugin may have been removed or never listed.",
			updatableSection: "Updates available",
			installedVersion: "Installed {version}",
			latestVersion: "Latest version {version}",
			favorite: "Favorite",
			unfavorite: "Remove from favorites",
			rollbackTo: "Roll back to {version}",
			rollingBack: "Rolling back…",
			rollbackFailed: "The rollback failed. Please try again.",
			whatChanged: "What changed",
			update: "Update",
			updateAll: "Update all ({count})",
			installed: "Installed",
			uninstall: "Uninstall",
			uninstalling: "Uninstalling…",
			uninstallFailed: "Uninstall failed",
			uninstallTransportFailed: "The uninstall request failed. Please try again.",
			uninstalledLiveNotice: "Uninstalled and stopped. The plugin will no longer load when dsh starts.",
			uninstalledRestartNotice: "Uninstalled. Restart dsh to finish removing the plugin.",
			uninstalledReloadNotice: "Uninstalled. Reload the page to remove its interface. The plugin will no longer load when dsh starts.",
			restart: "Restart dsh",
			restartTitle: "Restart dsh?",
			restartBody: "Restarting will temporarily disconnect this page and interrupt ongoing conversations and tasks. The page will reconnect automatically when the server is ready.",
			restartConfirm: "Restart",
			restarting: "Restarting dsh. The page will reload when the server is ready…",
			restartFailedNotice: "Could not connect to the server after restarting. Run dsh web to start it manually. See restart.log in the plugin shop cache directory for the startup log.",
			restartFailedLogNotice: "Could not connect to the server after restarting, or the server stopped again. Check the startup log at {log}, or run dsh web to start it manually.",
			restartTransportFailed: "The restart request failed. Please try again.",
			notRestartedNotice: "dsh has not restarted. This page is still connected to the original process, so the change has not taken effect. Quit the running dsh, then run dsh web.",
			notRestartedPidNotice: "dsh has not restarted. The original process (PID {pid}) is still running, so the change has not taken effect. Run kill {pid} to stop it; if it will not exit, use kill -9 {pid} to force it to stop. Then run dsh web.",
			notRestartedLogNotice: "Restart log: {log}",
			restartBlockedDesktopNotice: "This profile is managed by the DeepSeek Harness desktop app. Restart the app to apply the change.",
			restartBlockedFromDefaultProfileNotice: "dsh was started with --from-default-profile. In dsh 0.2.1 and later, restarting with this flag recreates the profile from its template and deletes all installed plugins, including the shop. Restart dsh manually without this flag.",
			restartBlockedWindowsNotice: "Restarting dsh from the plugin shop is not supported on Windows yet. Quit dsh and start it again to apply the change.",
			restartBlockedSystemdNotice: "dsh is managed by systemd. Restarting from the shop could stop the service without bringing it back. Restart the service manually. To allow restarts from the shop, set allowRestart: true in the shop configuration.",
			restartBlockedPortZeroNotice: "dsh was started with --port 0. Its port will change after a restart, so this page cannot reconnect automatically. Restart dsh manually and open the new address.",
			updateFailed: "Update failed",
			updateTransportFailed: "The update request failed. Please try again.",
			checkUpdate: "Check",
			checkUpdateTitle: "Check for updates",
			updateInDshPage: "Update in Plugins",
			updateInDshPageTitle: "The shop cannot replace itself while it is running. This opens dsh-plugin-shop in dsh's Plugins page; press Update there — dsh removes and reinstalls it, restoring the old version if that fails.",
			upToDate: "Up to date",
			github: "GitHub",
			enabledSwitch: "Enable",
			toggleFailed: "Could not change the enabled state. Please try again.",
			hotApplyNote: "Applied. No restart needed.",
			toggleRestartNote: "Saved. Restart dsh to apply the change."
		};
		//#endregion
		//#region src/client/module-table.ts
		/**
		* How long one probe may take before its answer counts as unknown.
		*
		* The work a probe can actually reach is a microtask: a seed-word lookup, or a
		* factory this page already registered. So this bounds a harness that never
		* answers, not work — and it exists because the cost of the alternative is the
		* whole shelf. `refineAgainstModuleTable` promises that a table in any state
		* cannot cost the reader the catalog, and an `import()` that never settles
		* would have made that promise false by leaving the tab with nothing to render
		* (§9's degradation rule: an unavailable fact is silence, never an accusation).
		* A probe per name, not one deadline for the whole refinement: every other
		* name is still judged, and the tab waits at most this long however many names
		* there are.
		*/
		const MODULE_PROBE_TIMEOUT_MS = 2e3;
		/** `outcome`, or null once `ms` has passed — whichever settles first. The
		* timer is cleared either way, so a settled probe leaves nothing pending. */
		function withDeadline(outcome, ms) {
			let timer;
			const deadline = new Promise((resolve) => {
				timer = setTimeout(() => resolve(null), ms);
			});
			return Promise.race([outcome, deadline]).finally(() => {
				if (timer !== void 0) clearTimeout(timer);
			});
		}
		/**
		* The host's verdict less every name the oracle provides.
		*
		* An entry whose list empties is dropped, and an entry ANY of whose names
		* comes back unknown gets no verdict at all — the rule `incompatibilityMap`
		* follows on the host, for the host's reason: an unavailable fact must never
		* read as an accusation, and keeping the rest of a list whose one unknown name
		* was dropped would publish a partial answer as the whole one. Each distinct
		* name is asked once, however many entries declare it. Never rejects: any
		* failure of the oracle is an unknown.
		*/
		async function refineIncompatible(incompatible, provides, timeoutMs = MODULE_PROBE_TIMEOUT_MS) {
			const answers = /* @__PURE__ */ new Map();
			const ask = (spec) => {
				const cached = answers.get(spec);
				if (cached !== void 0) return cached;
				const answer = withDeadline(new Promise((resolve) => {
					resolve(provides(spec));
				}).catch(() => null), timeoutMs);
				answers.set(spec, answer);
				return answer;
			};
			const judged = await Promise.all(Object.entries(incompatible).map(async ([key, names]) => {
				const verdicts = await Promise.all(names.map(ask));
				if (verdicts.some((verdict) => verdict !== true && verdict !== false)) return null;
				const missing = names.filter((_, index) => verdicts[index] === false);
				return missing.length > 0 ? {
					key,
					missing
				} : null;
			}));
			const refined = {};
			for (const row of judged) if (row !== null) refined[row.key] = row.missing;
			return refined;
		}
		/** The harness's own normalization (`stripClientSuffix`): a plugin bundle IS
		* its package's client half, so `x/client` and `x` name one row and one
		* record. Mirrored rather than imported — this package does not depend on
		* `@deepseek-ai/dsh-client-modules`. */
		function stripClientSuffix(spec) {
			return spec.endsWith("/client") ? spec.slice(0, -7) : spec;
		}
		/** The prefix of the one rejection that means "absent":
		* `ClientModuleSystem.import`'s own `client-modules: cannot resolve "<spec>" —
		* not a seed word, not a materialized module, and not a row in the boot
		* graph`. A harness that rewords it makes every probe unknown, which renders
		* as silence — the safe direction, never a false accusation. */
		const CANNOT_RESOLVE = "client-modules: cannot resolve";
		/**
		* An oracle over the live `modules` service, or null when the page offers no
		* usable table.
		*
		* The service is the harness's `ClientModuleLoader`, published to client
		* plugins as `ctx.reflect.provide('modules', …)`. It arrives as unknown-typed
		* foreign state, so only its PUBLIC contract is read, and only after
		* narrowing: `manifest.modules` must be an array, `loadCache` a Map and
		* `import` a function. `seed`, `factories` and `graphRows` exist on the
		* instance too, but they are TypeScript-`private` in the harness's own
		* declarations, and nothing here names them.
		*
		* Per spec, in the table's own order but with every side effect kept out:
		* 1. A graph row provides it, and `import` is NOT called — for a row it
		*    fetches the bundle and runs the module body, and a probe must never be
		*    what loads a plugin. `manifest.modules` is the row index, but it is not
		*    fixed for the page's whole life on every harness build. On 0.1.5-rc.3
		*    `this.manifest = options.manifest` is the constructor's only write, so a
		*    row placed at boot stands unchanged for as long as the page lives. On
		*    0.1.7-rc.2 (`next`) `updateManifest` REPLACES `this.manifest` outright
		*    with a new manifest that no longer lists an uninstalled package, and
		*    `reconcile` removes the plugin from the loader — so UNTIL this page's own
		*    uninstall reconciles, the OLD row still stands in `manifest.modules` and
		*    this step clears the entry falsely; AFTER it reconciles, this step can no
		*    longer be the false clear, because `manifest.modules` has already dropped
		*    the package. The false clear then comes from `prune`, which keeps the
		*    removed id only in the PRIVATE `graphRows` and in `loadCache`, and only
		*    while some retained module still references it — that is step 2 below,
		*    or the side effect of `import` in step 3 (a private graph row this
		*    function cannot see).
		* 2. A `loadCache` record provides it, again without `import`.
		* 3. Otherwise `import(spec, '', {})`, with the spec as written — the seed
		*    holds `react-dom/client` itself, not its stripped form. Resolving means a
		*    seed word, whose lookup has no side effect; rejecting with the
		*    "cannot resolve" message means absent; any other rejection is unknown.
		*
		* A kept-but-unmaterialized row is this function's own remaining blind spot:
		* asked about here, it still reaches step 3's `import` probe, which fetches
		* and runs it — the one side effect this module promises never to cause on
		* its own account. `refineAgainstModuleTable`'s page-removed set is the fix
		* for the one case a page can know about on its own — a name uninstalled
		* through THIS shop, on THIS page, since it loaded — by bypassing this oracle
		* for that name entirely rather than trusting a row that may only be kept. An
		* uninstall made from another tab, another window, or the CLI is not in that
		* set and stays unknown to this page until it reloads.
		*
		* One side-effect path remains: a registered page-local factory that is
		* neither a graph row nor yet materialized, which `import` materializes. That
		* is reachable only for a name the host could not resolve AND the page
		* registered without a row — the shell's own page-local modules are
		* node-resolvable, so the host never lists them. And what it does is what the
		* first real `require` of that name does anyway: run a factory this page
		* registered precisely so it would be materialized, once, memoized in
		* `loadCache`, fetching nothing. It moves that moment earlier; it runs nothing
		* the page did not already hold.
		*/
		function moduleTableOracle(service) {
			if (typeof service !== "object" || service === null) return null;
			let rows;
			let loadCache;
			let probe;
			try {
				const { manifest, loadCache: cache, import: load } = service;
				const modules = typeof manifest === "object" && manifest !== null ? manifest.modules : void 0;
				if (!Array.isArray(modules) || !(cache instanceof Map) || typeof load !== "function") return null;
				rows = /* @__PURE__ */ new Set();
				for (const row of modules) {
					const id = typeof row === "object" && row !== null ? row.id : void 0;
					if (typeof id === "string") rows.add(id);
				}
				loadCache = cache;
				probe = (spec) => Promise.resolve(load.call(service, spec, "", {}));
			} catch {
				return null;
			}
			return async (spec) => {
				const id = stripClientSuffix(spec);
				if (rows.has(id) || loadCache.has(id)) return true;
				try {
					await probe(spec);
					return true;
				} catch (error) {
					return error instanceof Error && error.message.startsWith(CANNOT_RESOLVE) ? false : null;
				}
			};
		}
		/**
		* The host's verdict as this page can stand behind it: refined against the
		* live table, or `{}` — no verdicts at all — when there is no usable table.
		*
		* Never the host's list unrefined. Measured, that list is majority-false on
		* this harness line (see the header), so showing it whenever the table cannot
		* be read would hand the reader a verdict already known to be unreliable;
		* silence is this project's documented degradation — an unavailable fact must
		* never read as an accusation. Never rejects, so a table in any state cannot
		* cost the reader the catalog.
		*
		* `removed` is the page-removed set (design 2026-09-01-harness-compatibility
		* section 9.1): package names this page has uninstalled since it loaded.
		* Every name in it is reported missing exactly
		* as the host said, WITHOUT ever reaching the table — not the rows check, not
		* `loadCache`, not `import` — because a row or a cache record can outlive a
		* restart-free uninstall (`moduleTableOracle`'s header), and the table's own
		* "provided" would be precisely the false clear this set exists to prevent.
		*/
		async function refineAgainstModuleTable(incompatible, service, removed = /* @__PURE__ */ new Set(), timeoutMs = MODULE_PROBE_TIMEOUT_MS) {
			const oracle = moduleTableOracle(service);
			if (oracle === null) return {};
			const withRemoved = async (spec) => removed.has(stripClientSuffix(spec)) ? false : oracle(spec);
			return refineIncompatible(incompatible, withRemoved, timeoutMs);
		}
		//#endregion
		//#region src/shared/install-state.ts
		/** Whether the host is done with this record: it will not change again, and a
		* poller may stop. */
		function isTerminalInstallState(state) {
			return state === "done" || state === "failed";
		}
		//#endregion
		//#region src/client/listeners.ts
		/**
		* The listener plumbing the client's external stores share: the page store
		* and its owed notices (page-store.ts), the flow registries
		* (flow-registry.ts) and the restart monitor (restart-monitor.ts). Each keeps
		* its listeners in a plain `Set`. React subscribes through `listen`, as
		* `useSyncExternalStore` asks, and a change reaches every listener through
		* `notify`.
		*
		* Functions over that `Set`, never an object a store keeps in its place. The
		* restart monitor's store lives on `globalThis`, and a 0.8.x shop hands it
		* over (design 2026-10-16-shop-sidebar-page §6). Its `listeners` is a plain
		* `Set` that the predecessor's own code adds to, deletes from and iterates,
		* so the field's shape is a contract across versions, and these functions
		* take that `Set` as it is.
		*/
		/** The sets a disposed store forgot (`forget`). Held here, never as a mark
		* on the `Set` itself: a store's `Set` is its own, and the restart monitor's
		* is a 0.8.x predecessor's too (above). */
		const forgotten = /* @__PURE__ */ new WeakSet();
		/** Add `listener`, and hand back what removes it. A forgotten set takes
		* none: its store tells nobody anything more, so a listener subscribing in
		* a hot swap's window would only be held. */
		function listen(listeners, listener) {
			if (forgotten.has(listeners)) return () => {};
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		}
		/** Call every listener as the set stands when the call begins. Over a copy,
		* so a listener that subscribes or unsubscribes one while it runs (React
		* re-subscribing in the render the change caused) changes the next notify,
		* never this one. */
		function notify(listeners) {
			for (const listener of [...listeners]) listener();
		}
		/** Drop every listener, and take none again: a disposed store tells nobody
		* anything more. */
		function forget(listeners) {
			listeners.clear();
			forgotten.add(listeners);
		}
		//#endregion
		//#region src/shared/shop-like.ts
		/**
		* Whether a package name reads as a competing plugin marketplace.
		*
		* Shared on purpose. The registry needs it to pick which newly harvested names
		* to send for a market verdict, and the client needs it to hide the ones no
		* verdict has reached yet. When each had a copy they drifted — that is exactly
		* how the shelf came to disagree with its own count — so there is one.
		*
		* It lives under the published package rather than beside the registry because
		* the dependency can only point this way: the package's tsconfig pins
		* `rootDir: "src"`, so nothing outside it can be imported, while the registry
		* scripts are internal and may reach in.
		*
		* This is a NAME heuristic and nothing more. It cannot tell a plugin that
		* stores tea from one that sells plugins — on the live catalog it caught 73
		* names of which 20 were innocent — so `registry/markets.yml` carries the
		* verdict per name and overrides it either way.
		*
		* @module shared/shop-like
		*/
		const SHOP_KEYWORDS = [
			"store",
			"market",
			"mall",
			"shop",
			"marketplace"
		];
		/**
		* Competing plugin marketplaces whose names carry no store/market keyword
		* and so escape the pattern rules below (spec §7.2). Each is a real npm
		* package that presents its own catalog of dsh plugins inside the Harness:
		* `dsh-plugin` is the npm package of github.com/dshplugin/dsh-plugin-hub,
		* `dsh-plugin-hub` and `@lanbaolu/dsh-plugin-hub` are app-store packages,
		* `@mutocenew/dsh-plugin-catalog` ships a plugin directory with agent
		* query tools, and `@dsheval/dsh-top100-plugin` is dsheval.ai's rankings
		* market: "Discover, install and manage DSH-Eval Top100 plugins and Skills
		* in DeepSeek Harness", a Settings panel its own README heads "plugin
		* market" and which installs, updates and uninstalls from that index.
		*
		* A market can be named after anything, so this list only ever grows by
		* someone reading a package: a ranking, a leaderboard, a digest and an
		* index are all shopfronts, and none of those words is a store keyword.
		* Exact names only — nothing here is a pattern.
		*/
		const SHOP_LIKE_NAMES = [
			"dsh-plugin",
			"dsh-plugin-hub",
			"@lanbaolu/dsh-plugin-hub",
			"@mutocenew/dsh-plugin-catalog",
			"@dsheval/dsh-top100-plugin"
		];
		/**
		* Whether a package name reads as a plugin shop (a marketplace for dsh
		* plugins, e.g. `dsh-plugin-shop`, `dsh-store`, `pluginstore`). The shop
		* tab hides these so the market does not list competing markets.
		*
		* Precision over recall: a name merely CONTAINING a keyword segment without
		* a plugin qualifier or a keyword ending (`market-data-provider`,
		* `marketplace-hub`) is NOT a shop plugin, and `dsh-restore` must never
		* match on the substring "store". The keyword list keeps "store" on purpose:
		* it matches other people's package names, not ours.
		*/
		function isShopLike(name) {
			if (SHOP_LIKE_NAMES.includes(name.toLowerCase())) return true;
			const segments = name.toLowerCase().split(/[-_.]+/);
			const hasPlugin = segments.includes("plugin");
			if (segments.some((segment) => /plugin(store|market|mall|shop|marketplace)/.test(segment) || /(store|market|mall|shop|marketplace)plugin/.test(segment))) return true;
			if (segments.some((segment) => segment.startsWith("dsh") && SHOP_KEYWORDS.some((keyword) => segment === `dsh${keyword}`))) return true;
			if (segments.length >= 2 && (segments[0] === "dsh" || segments[0]?.endsWith("/dsh") === true) && SHOP_KEYWORDS.includes(segments[1]) && (segments.length === 2 || segments[2] !== void 0 && [
				"plus",
				"pro",
				"hub",
				"center",
				"centre",
				"max",
				"free",
				"lite"
			].includes(segments[2]))) return true;
			if (segments.filter((segment) => SHOP_KEYWORDS.includes(segment)).length === 0) return false;
			return hasPlugin || SHOP_KEYWORDS.includes(segments.at(-1));
		}
		//#endregion
		//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/internal/constants.js
		var require_constants = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			module.exports = {
				MAX_LENGTH: 256,
				MAX_SAFE_COMPONENT_LENGTH: 16,
				MAX_SAFE_BUILD_LENGTH: 250,
				MAX_SAFE_INTEGER: Number.MAX_SAFE_INTEGER || 
				/* istanbul ignore next */ 9007199254740991,
				RELEASE_TYPES: [
					"major",
					"premajor",
					"minor",
					"preminor",
					"patch",
					"prepatch",
					"prerelease"
				],
				SEMVER_SPEC_VERSION: "2.0.0",
				FLAG_INCLUDE_PRERELEASE: 1,
				FLAG_LOOSE: 2
			};
		}));
		//#endregion
		//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/internal/debug.js
		var require_debug = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			module.exports = typeof process === "object" && process.env && process.env.NODE_DEBUG && /\bsemver\b/i.test(process.env.NODE_DEBUG) ? (...args) => console.error("SEMVER", ...args) : () => {};
		}));
		//#endregion
		//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/internal/re.js
		var require_re = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const { MAX_SAFE_COMPONENT_LENGTH, MAX_SAFE_BUILD_LENGTH, MAX_LENGTH } = require_constants();
			const debug = require_debug();
			exports = module.exports = {};
			const re = exports.re = [];
			const safeRe = exports.safeRe = [];
			const src = exports.src = [];
			const safeSrc = exports.safeSrc = [];
			const t = exports.t = {};
			let R = 0;
			const LETTERDASHNUMBER = "[a-zA-Z0-9-]";
			const safeRegexReplacements = [
				["\\s", 1],
				["\\d", MAX_LENGTH],
				[LETTERDASHNUMBER, MAX_SAFE_BUILD_LENGTH]
			];
			const makeSafeRegex = (value) => {
				for (const [token, max] of safeRegexReplacements) value = value.split(`${token}*`).join(`${token}{0,${max}}`).split(`${token}+`).join(`${token}{1,${max}}`);
				return value;
			};
			const createToken = (name, value, isGlobal) => {
				const safe = makeSafeRegex(value);
				const index = R++;
				debug(name, index, value);
				t[name] = index;
				src[index] = value;
				safeSrc[index] = safe;
				re[index] = new RegExp(value, isGlobal ? "g" : void 0);
				safeRe[index] = new RegExp(safe, isGlobal ? "g" : void 0);
			};
			createToken("NUMERICIDENTIFIER", "0|[1-9]\\d*");
			createToken("NUMERICIDENTIFIERLOOSE", "\\d+");
			createToken("NONNUMERICIDENTIFIER", `\\d*[a-zA-Z-]${LETTERDASHNUMBER}*`);
			createToken("MAINVERSION", `(${src[t.NUMERICIDENTIFIER]})\\.(${src[t.NUMERICIDENTIFIER]})\\.(${src[t.NUMERICIDENTIFIER]})`);
			createToken("MAINVERSIONLOOSE", `(${src[t.NUMERICIDENTIFIERLOOSE]})\\.(${src[t.NUMERICIDENTIFIERLOOSE]})\\.(${src[t.NUMERICIDENTIFIERLOOSE]})`);
			createToken("PRERELEASEIDENTIFIER", `(?:${src[t.NONNUMERICIDENTIFIER]}|${src[t.NUMERICIDENTIFIER]})`);
			createToken("PRERELEASEIDENTIFIERLOOSE", `(?:${src[t.NONNUMERICIDENTIFIER]}|${src[t.NUMERICIDENTIFIERLOOSE]})`);
			createToken("PRERELEASE", `(?:-(${src[t.PRERELEASEIDENTIFIER]}(?:\\.${src[t.PRERELEASEIDENTIFIER]})*))`);
			createToken("PRERELEASELOOSE", `(?:-?(${src[t.PRERELEASEIDENTIFIERLOOSE]}(?:\\.${src[t.PRERELEASEIDENTIFIERLOOSE]})*))`);
			createToken("BUILDIDENTIFIER", `${LETTERDASHNUMBER}+`);
			createToken("BUILD", `(?:\\+(${src[t.BUILDIDENTIFIER]}(?:\\.${src[t.BUILDIDENTIFIER]})*))`);
			createToken("FULLPLAIN", `v?${src[t.MAINVERSION]}${src[t.PRERELEASE]}?${src[t.BUILD]}?`);
			createToken("FULL", `^${src[t.FULLPLAIN]}$`);
			createToken("LOOSEPLAIN", `[v=\\s]*${src[t.MAINVERSIONLOOSE]}${src[t.PRERELEASELOOSE]}?${src[t.BUILD]}?`);
			createToken("LOOSE", `^${src[t.LOOSEPLAIN]}$`);
			createToken("GTLT", "((?:<|>)?=?)");
			createToken("XRANGEIDENTIFIERLOOSE", `${src[t.NUMERICIDENTIFIERLOOSE]}|x|X|\\*`);
			createToken("XRANGEIDENTIFIER", `${src[t.NUMERICIDENTIFIER]}|x|X|\\*`);
			createToken("XRANGEPLAIN", `[v=\\s]*(${src[t.XRANGEIDENTIFIER]})(?:\\.(${src[t.XRANGEIDENTIFIER]})(?:\\.(${src[t.XRANGEIDENTIFIER]})(?:${src[t.PRERELEASE]})?${src[t.BUILD]}?)?)?`);
			createToken("XRANGEPLAINLOOSE", `[v=\\s]*(${src[t.XRANGEIDENTIFIERLOOSE]})(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})(?:${src[t.PRERELEASELOOSE]})?${src[t.BUILD]}?)?)?`);
			createToken("XRANGE", `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAIN]}$`);
			createToken("XRANGELOOSE", `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAINLOOSE]}$`);
			createToken("COERCEPLAIN", `(^|[^\\d])(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}})(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?`);
			createToken("COERCE", `${src[t.COERCEPLAIN]}(?:$|[^\\d])`);
			createToken("COERCEFULL", src[t.COERCEPLAIN] + `(?:${src[t.PRERELEASE]})?(?:${src[t.BUILD]})?(?:$|[^\\d])`);
			createToken("COERCERTL", src[t.COERCE], true);
			createToken("COERCERTLFULL", src[t.COERCEFULL], true);
			createToken("LONETILDE", "(?:~>?)");
			createToken("TILDETRIM", `(\\s*)${src[t.LONETILDE]}\\s+`, true);
			exports.tildeTrimReplace = "$1~";
			createToken("TILDE", `^${src[t.LONETILDE]}${src[t.XRANGEPLAIN]}$`);
			createToken("TILDELOOSE", `^${src[t.LONETILDE]}${src[t.XRANGEPLAINLOOSE]}$`);
			createToken("LONECARET", "(?:\\^)");
			createToken("CARETTRIM", `(\\s*)${src[t.LONECARET]}\\s+`, true);
			exports.caretTrimReplace = "$1^";
			createToken("CARET", `^${src[t.LONECARET]}${src[t.XRANGEPLAIN]}$`);
			createToken("CARETLOOSE", `^${src[t.LONECARET]}${src[t.XRANGEPLAINLOOSE]}$`);
			createToken("COMPARATORLOOSE", `^${src[t.GTLT]}\\s*(${src[t.LOOSEPLAIN]})$|^$`);
			createToken("COMPARATOR", `^${src[t.GTLT]}\\s*(${src[t.FULLPLAIN]})$|^$`);
			createToken("COMPARATORTRIM", `(\\s*)${src[t.GTLT]}\\s*(${src[t.LOOSEPLAIN]}|${src[t.XRANGEPLAIN]})`, true);
			exports.comparatorTrimReplace = "$1$2$3";
			createToken("HYPHENRANGE", `^\\s*(${src[t.XRANGEPLAIN]})\\s+-\\s+(${src[t.XRANGEPLAIN]})\\s*$`);
			createToken("HYPHENRANGELOOSE", `^\\s*(${src[t.XRANGEPLAINLOOSE]})\\s+-\\s+(${src[t.XRANGEPLAINLOOSE]})\\s*$`);
			createToken("STAR", "(<|>)?=?\\s*\\*");
			createToken("GTE0", "^\\s*>=\\s*0\\.0\\.0\\s*$");
			createToken("GTE0PRE", "^\\s*>=\\s*0\\.0\\.0-0\\s*$");
		}));
		//#endregion
		//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/internal/parse-options.js
		var require_parse_options = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const looseOption = Object.freeze({ loose: true });
			const emptyOpts = Object.freeze({});
			const parseOptions = (options) => {
				if (!options) return emptyOpts;
				if (typeof options !== "object") return looseOption;
				return options;
			};
			module.exports = parseOptions;
		}));
		//#endregion
		//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/internal/identifiers.js
		var require_identifiers = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const numeric = /^[0-9]+$/;
			const compareIdentifiers = (a, b) => {
				if (typeof a === "number" && typeof b === "number") return a === b ? 0 : a < b ? -1 : 1;
				const anum = numeric.test(a);
				const bnum = numeric.test(b);
				if (anum && bnum) {
					a = +a;
					b = +b;
				}
				return a === b ? 0 : anum && !bnum ? -1 : bnum && !anum ? 1 : a < b ? -1 : 1;
			};
			const rcompareIdentifiers = (a, b) => compareIdentifiers(b, a);
			module.exports = {
				compareIdentifiers,
				rcompareIdentifiers
			};
		}));
		//#endregion
		//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/classes/semver.js
		var require_semver$1 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const debug = require_debug();
			const { MAX_LENGTH, MAX_SAFE_INTEGER } = require_constants();
			const { safeRe: re, t } = require_re();
			const parseOptions = require_parse_options();
			const { compareIdentifiers } = require_identifiers();
			const isPrereleaseIdentifier = (prerelease, identifier) => {
				const identifiers = identifier.split(".");
				if (identifiers.length > prerelease.length) return false;
				for (let i = 0; i < identifiers.length; i++) if (compareIdentifiers(prerelease[i], identifiers[i]) !== 0) return false;
				return true;
			};
			module.exports = class SemVer {
				constructor(version, options) {
					options = parseOptions(options);
					if (version instanceof SemVer) {
						if (version.loose === !!options.loose && version.includePrerelease === !!options.includePrerelease) return version;
						else version = version.version;
					} else if (typeof version !== "string") throw new TypeError(`Invalid version. Must be a string. Got type "${typeof version}".`);
					if (version.length > MAX_LENGTH) throw new TypeError(`version is longer than ${MAX_LENGTH} characters`);
					debug("SemVer", version, options);
					this.options = options;
					this.loose = !!options.loose;
					this.includePrerelease = !!options.includePrerelease;
					const m = version.trim().match(options.loose ? re[t.LOOSE] : re[t.FULL]);
					if (!m) throw new TypeError(`Invalid Version: ${version}`);
					this.raw = version;
					this.major = +m[1];
					this.minor = +m[2];
					this.patch = +m[3];
					if (this.major > MAX_SAFE_INTEGER || this.major < 0) throw new TypeError("Invalid major version");
					if (this.minor > MAX_SAFE_INTEGER || this.minor < 0) throw new TypeError("Invalid minor version");
					if (this.patch > MAX_SAFE_INTEGER || this.patch < 0) throw new TypeError("Invalid patch version");
					if (!m[4]) this.prerelease = [];
					else this.prerelease = m[4].split(".").map((id) => {
						if (/^[0-9]+$/.test(id)) {
							const num = +id;
							if (num >= 0 && num < MAX_SAFE_INTEGER) return num;
						}
						return id;
					});
					this.build = m[5] ? m[5].split(".") : [];
					this.format();
				}
				format() {
					this.version = `${this.major}.${this.minor}.${this.patch}`;
					if (this.prerelease.length) this.version += `-${this.prerelease.join(".")}`;
					return this.version;
				}
				toString() {
					return this.version;
				}
				compare(other) {
					debug("SemVer.compare", this.version, this.options, other);
					if (!(other instanceof SemVer)) {
						if (typeof other === "string" && other === this.version) return 0;
						other = new SemVer(other, this.options);
					}
					if (other.version === this.version) return 0;
					return this.compareMain(other) || this.comparePre(other);
				}
				compareMain(other) {
					if (!(other instanceof SemVer)) other = new SemVer(other, this.options);
					if (this.major < other.major) return -1;
					if (this.major > other.major) return 1;
					if (this.minor < other.minor) return -1;
					if (this.minor > other.minor) return 1;
					if (this.patch < other.patch) return -1;
					if (this.patch > other.patch) return 1;
					return 0;
				}
				comparePre(other) {
					if (!(other instanceof SemVer)) other = new SemVer(other, this.options);
					if (this.prerelease.length && !other.prerelease.length) return -1;
					else if (!this.prerelease.length && other.prerelease.length) return 1;
					else if (!this.prerelease.length && !other.prerelease.length) return 0;
					let i = 0;
					do {
						const a = this.prerelease[i];
						const b = other.prerelease[i];
						debug("prerelease compare", i, a, b);
						if (a === void 0 && b === void 0) return 0;
						else if (b === void 0) return 1;
						else if (a === void 0) return -1;
						else if (a === b) continue;
						else return compareIdentifiers(a, b);
					} while (++i);
				}
				compareBuild(other) {
					if (!(other instanceof SemVer)) other = new SemVer(other, this.options);
					let i = 0;
					do {
						const a = this.build[i];
						const b = other.build[i];
						debug("build compare", i, a, b);
						if (a === void 0 && b === void 0) return 0;
						else if (b === void 0) return 1;
						else if (a === void 0) return -1;
						else if (a === b) continue;
						else return compareIdentifiers(a, b);
					} while (++i);
				}
				inc(release, identifier, identifierBase) {
					if (release.startsWith("pre")) {
						if (!identifier && identifierBase === false) throw new Error("invalid increment argument: identifier is empty");
						if (identifier) {
							const match = `-${identifier}`.match(this.options.loose ? re[t.PRERELEASELOOSE] : re[t.PRERELEASE]);
							if (!match || match[1] !== identifier) throw new Error(`invalid identifier: ${identifier}`);
						}
					}
					switch (release) {
						case "premajor":
							this.prerelease.length = 0;
							this.patch = 0;
							this.minor = 0;
							this.major++;
							this.inc("pre", identifier, identifierBase);
							break;
						case "preminor":
							this.prerelease.length = 0;
							this.patch = 0;
							this.minor++;
							this.inc("pre", identifier, identifierBase);
							break;
						case "prepatch":
							this.prerelease.length = 0;
							this.inc("patch", identifier, identifierBase);
							this.inc("pre", identifier, identifierBase);
							break;
						case "prerelease":
							if (this.prerelease.length === 0) this.inc("patch", identifier, identifierBase);
							this.inc("pre", identifier, identifierBase);
							break;
						case "release":
							if (this.prerelease.length === 0) throw new Error(`version ${this.raw} is not a prerelease`);
							this.prerelease.length = 0;
							break;
						case "major":
							if (this.minor !== 0 || this.patch !== 0 || this.prerelease.length === 0) this.major++;
							this.minor = 0;
							this.patch = 0;
							this.prerelease = [];
							break;
						case "minor":
							if (this.patch !== 0 || this.prerelease.length === 0) this.minor++;
							this.patch = 0;
							this.prerelease = [];
							break;
						case "patch":
							if (this.prerelease.length === 0) this.patch++;
							this.prerelease = [];
							break;
						case "pre": {
							const base = Number(identifierBase) ? 1 : 0;
							if (this.prerelease.length === 0) this.prerelease = [base];
							else {
								let i = this.prerelease.length;
								while (--i >= 0) if (typeof this.prerelease[i] === "number") {
									this.prerelease[i]++;
									i = -2;
								}
								if (i === -1) {
									if (identifier === this.prerelease.join(".") && identifierBase === false) throw new Error("invalid increment argument: identifier already exists");
									this.prerelease.push(base);
								}
							}
							if (identifier) {
								let prerelease = [identifier, base];
								if (identifierBase === false) prerelease = [identifier];
								if (isPrereleaseIdentifier(this.prerelease, identifier)) {
									const prereleaseBase = this.prerelease[identifier.split(".").length];
									if (isNaN(prereleaseBase)) this.prerelease = prerelease;
								} else this.prerelease = prerelease;
							}
							break;
						}
						default: throw new Error(`invalid increment argument: ${release}`);
					}
					this.raw = this.format();
					if (this.build.length) this.raw += `+${this.build.join(".")}`;
					return this;
				}
			};
		}));
		//#endregion
		//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/parse.js
		var require_parse = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const SemVer = require_semver$1();
			const parse = (version, options, throwErrors = false) => {
				if (version instanceof SemVer) return version;
				try {
					return new SemVer(version, options);
				} catch (er) {
					if (!throwErrors) return null;
					throw er;
				}
			};
			module.exports = parse;
		}));
		//#endregion
		//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/valid.js
		var require_valid$1 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const parse = require_parse();
			const valid = (version, options) => {
				const v = parse(version, options);
				return v ? v.version : null;
			};
			module.exports = valid;
		}));
		//#endregion
		//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/clean.js
		var require_clean = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const parse = require_parse();
			const clean = (version, options) => {
				const s = parse(version.trim().replace(/^[=v]+/, ""), options);
				return s ? s.version : null;
			};
			module.exports = clean;
		}));
		//#endregion
		//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/inc.js
		var require_inc = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const SemVer = require_semver$1();
			const inc = (version, release, options, identifier, identifierBase) => {
				if (typeof options === "string") {
					identifierBase = identifier;
					identifier = options;
					options = void 0;
				}
				try {
					return new SemVer(version instanceof SemVer ? version.version : version, options).inc(release, identifier, identifierBase).version;
				} catch (er) {
					return null;
				}
			};
			module.exports = inc;
		}));
		//#endregion
		//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/diff.js
		var require_diff = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const parse = require_parse();
			const diff = (version1, version2) => {
				const v1 = parse(version1, null, true);
				const v2 = parse(version2, null, true);
				const comparison = v1.compare(v2);
				if (comparison === 0) return null;
				const v1Higher = comparison > 0;
				const highVersion = v1Higher ? v1 : v2;
				const lowVersion = v1Higher ? v2 : v1;
				const highHasPre = !!highVersion.prerelease.length;
				if (!!lowVersion.prerelease.length && !highHasPre) {
					if (!lowVersion.patch && !lowVersion.minor) return "major";
					if (lowVersion.compareMain(highVersion) === 0) {
						if (lowVersion.minor && !lowVersion.patch) return "minor";
						return "patch";
					}
				}
				const prefix = highHasPre ? "pre" : "";
				if (v1.major !== v2.major) return prefix + "major";
				if (v1.minor !== v2.minor) return prefix + "minor";
				if (v1.patch !== v2.patch) return prefix + "patch";
				return "prerelease";
			};
			module.exports = diff;
		}));
		//#endregion
		//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/major.js
		var require_major = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const SemVer = require_semver$1();
			const major = (a, loose) => new SemVer(a, loose).major;
			module.exports = major;
		}));
		//#endregion
		//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/minor.js
		var require_minor = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const SemVer = require_semver$1();
			const minor = (a, loose) => new SemVer(a, loose).minor;
			module.exports = minor;
		}));
		//#endregion
		//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/patch.js
		var require_patch = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const SemVer = require_semver$1();
			const patch = (a, loose) => new SemVer(a, loose).patch;
			module.exports = patch;
		}));
		//#endregion
		//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/prerelease.js
		var require_prerelease = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const parse = require_parse();
			const prerelease = (version, options) => {
				const parsed = parse(version, options);
				return parsed && parsed.prerelease.length ? parsed.prerelease : null;
			};
			module.exports = prerelease;
		}));
		//#endregion
		//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/compare.js
		var require_compare = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const SemVer = require_semver$1();
			const compare = (a, b, loose) => new SemVer(a, loose).compare(new SemVer(b, loose));
			module.exports = compare;
		}));
		//#endregion
		//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/rcompare.js
		var require_rcompare = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const compare = require_compare();
			const rcompare = (a, b, loose) => compare(b, a, loose);
			module.exports = rcompare;
		}));
		//#endregion
		//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/compare-loose.js
		var require_compare_loose = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const compare = require_compare();
			const compareLoose = (a, b) => compare(a, b, true);
			module.exports = compareLoose;
		}));
		//#endregion
		//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/compare-build.js
		var require_compare_build = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const SemVer = require_semver$1();
			const compareBuild = (a, b, loose) => {
				const versionA = new SemVer(a, loose);
				const versionB = new SemVer(b, loose);
				return versionA.compare(versionB) || versionA.compareBuild(versionB);
			};
			module.exports = compareBuild;
		}));
		//#endregion
		//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/sort.js
		var require_sort = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const compareBuild = require_compare_build();
			const sort = (list, loose) => list.sort((a, b) => compareBuild(a, b, loose));
			module.exports = sort;
		}));
		//#endregion
		//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/rsort.js
		var require_rsort = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const compareBuild = require_compare_build();
			const rsort = (list, loose) => list.sort((a, b) => compareBuild(b, a, loose));
			module.exports = rsort;
		}));
		//#endregion
		//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/gt.js
		var require_gt = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const compare = require_compare();
			const gt = (a, b, loose) => compare(a, b, loose) > 0;
			module.exports = gt;
		}));
		//#endregion
		//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/lt.js
		var require_lt = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const compare = require_compare();
			const lt = (a, b, loose) => compare(a, b, loose) < 0;
			module.exports = lt;
		}));
		//#endregion
		//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/eq.js
		var require_eq = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const compare = require_compare();
			const eq = (a, b, loose) => compare(a, b, loose) === 0;
			module.exports = eq;
		}));
		//#endregion
		//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/neq.js
		var require_neq = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const compare = require_compare();
			const neq = (a, b, loose) => compare(a, b, loose) !== 0;
			module.exports = neq;
		}));
		//#endregion
		//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/gte.js
		var require_gte = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const compare = require_compare();
			const gte = (a, b, loose) => compare(a, b, loose) >= 0;
			module.exports = gte;
		}));
		//#endregion
		//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/lte.js
		var require_lte = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const compare = require_compare();
			const lte = (a, b, loose) => compare(a, b, loose) <= 0;
			module.exports = lte;
		}));
		//#endregion
		//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/cmp.js
		var require_cmp = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const eq = require_eq();
			const neq = require_neq();
			const gt = require_gt();
			const gte = require_gte();
			const lt = require_lt();
			const lte = require_lte();
			const cmp = (a, op, b, loose) => {
				switch (op) {
					case "===":
						if (typeof a === "object") a = a.version;
						if (typeof b === "object") b = b.version;
						return a === b;
					case "!==":
						if (typeof a === "object") a = a.version;
						if (typeof b === "object") b = b.version;
						return a !== b;
					case "":
					case "=":
					case "==": return eq(a, b, loose);
					case "!=": return neq(a, b, loose);
					case ">": return gt(a, b, loose);
					case ">=": return gte(a, b, loose);
					case "<": return lt(a, b, loose);
					case "<=": return lte(a, b, loose);
					default: throw new TypeError(`Invalid operator: ${op}`);
				}
			};
			module.exports = cmp;
		}));
		//#endregion
		//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/coerce.js
		var require_coerce = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const SemVer = require_semver$1();
			const parse = require_parse();
			const { safeRe: re, t } = require_re();
			const coerce = (version, options) => {
				if (version instanceof SemVer) return version;
				if (typeof version === "number") version = String(version);
				if (typeof version !== "string") return null;
				options = options || {};
				let match = null;
				if (!options.rtl) match = version.match(options.includePrerelease ? re[t.COERCEFULL] : re[t.COERCE]);
				else {
					const coerceRtlRegex = options.includePrerelease ? re[t.COERCERTLFULL] : re[t.COERCERTL];
					let next;
					while ((next = coerceRtlRegex.exec(version)) && (!match || match.index + match[0].length !== version.length)) {
						if (!match || next.index + next[0].length !== match.index + match[0].length) match = next;
						coerceRtlRegex.lastIndex = next.index + next[1].length + next[2].length;
					}
					coerceRtlRegex.lastIndex = -1;
				}
				if (match === null) return null;
				const major = match[2];
				const minor = match[3] || "0";
				const patch = match[4] || "0";
				const prerelease = options.includePrerelease && match[5] ? `-${match[5]}` : "";
				const build = options.includePrerelease && match[6] ? `+${match[6]}` : "";
				return parse(`${major}.${minor}.${patch}${prerelease}${build}`, options);
			};
			module.exports = coerce;
		}));
		//#endregion
		//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/truncate.js
		var require_truncate = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const parse = require_parse();
			const constants = require_constants();
			const SemVer = require_semver$1();
			const truncate = (version, truncation, options) => {
				if (!constants.RELEASE_TYPES.includes(truncation)) return null;
				const clonedVersion = cloneInputVersion(version, options);
				return clonedVersion && doTruncation(clonedVersion, truncation);
			};
			const cloneInputVersion = (version, options) => {
				const versionStringToParse = version instanceof SemVer ? version.version : version;
				return parse(versionStringToParse, options);
			};
			const doTruncation = (version, truncation) => {
				if (isPrerelease(truncation)) return version.version;
				version.prerelease = [];
				switch (truncation) {
					case "major":
						version.minor = 0;
						version.patch = 0;
						break;
					case "minor": version.patch = 0;
				}
				return version.format();
			};
			const isPrerelease = (type) => {
				return type.startsWith("pre");
			};
			module.exports = truncate;
		}));
		//#endregion
		//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/internal/lrucache.js
		var require_lrucache = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			var LRUCache = class {
				constructor() {
					this.max = 1e3;
					this.map = /* @__PURE__ */ new Map();
				}
				get(key) {
					const value = this.map.get(key);
					if (value === void 0) return;
					else {
						this.map.delete(key);
						this.map.set(key, value);
						return value;
					}
				}
				delete(key) {
					return this.map.delete(key);
				}
				set(key, value) {
					if (!this.delete(key) && value !== void 0) {
						if (this.map.size >= this.max) {
							const firstKey = this.map.keys().next().value;
							this.delete(firstKey);
						}
						this.map.set(key, value);
					}
					return this;
				}
			};
			module.exports = LRUCache;
		}));
		//#endregion
		//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/classes/range.js
		var require_range = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const SPACE_CHARACTERS = /\s+/g;
			module.exports = class Range {
				constructor(range, options) {
					options = parseOptions(options);
					if (range instanceof Range) {
						if (range.loose === !!options.loose && range.includePrerelease === !!options.includePrerelease) return range;
						else return new Range(range.raw, options);
					}
					if (range instanceof Comparator) {
						this.raw = range.value;
						this.set = [[range]];
						this.formatted = void 0;
						return this;
					}
					this.options = options;
					this.loose = !!options.loose;
					this.includePrerelease = !!options.includePrerelease;
					this.raw = range.trim().replace(SPACE_CHARACTERS, " ");
					this.set = this.raw.split("||").map((r) => this.parseRange(r.trim())).filter((c) => c.length);
					if (!this.set.length) throw new TypeError(`Invalid SemVer Range: ${this.raw}`);
					if (this.set.length > 1) {
						const first = this.set[0];
						this.set = this.set.filter((c) => !isNullSet(c[0]));
						if (this.set.length === 0) this.set = [first];
						else if (this.set.length > 1) {
							for (const c of this.set) if (c.length === 1 && isAny(c[0])) {
								this.set = [c];
								break;
							}
						}
					}
					this.formatted = void 0;
				}
				get range() {
					if (this.formatted === void 0) {
						this.formatted = "";
						for (let i = 0; i < this.set.length; i++) {
							if (i > 0) this.formatted += "||";
							const comps = this.set[i];
							for (let k = 0; k < comps.length; k++) {
								if (k > 0) this.formatted += " ";
								this.formatted += comps[k].toString().trim();
							}
						}
					}
					return this.formatted;
				}
				format() {
					return this.range;
				}
				toString() {
					return this.range;
				}
				parseRange(range) {
					range = range.replace(BUILDSTRIPRE, "");
					const memoKey = ((this.options.includePrerelease && FLAG_INCLUDE_PRERELEASE) | (this.options.loose && FLAG_LOOSE)) + ":" + range;
					const cached = cache.get(memoKey);
					if (cached) return cached;
					const loose = this.options.loose;
					const hr = loose ? re[t.HYPHENRANGELOOSE] : re[t.HYPHENRANGE];
					range = range.replace(hr, hyphenReplace(this.options.includePrerelease));
					debug("hyphen replace", range);
					range = range.replace(re[t.COMPARATORTRIM], comparatorTrimReplace);
					debug("comparator trim", range);
					range = range.replace(re[t.TILDETRIM], tildeTrimReplace);
					debug("tilde trim", range);
					range = range.replace(re[t.CARETTRIM], caretTrimReplace);
					debug("caret trim", range);
					let rangeList = range.split(" ").map((comp) => parseComparator(comp, this.options)).join(" ").split(/\s+/).map((comp) => replaceGTE0(comp, this.options));
					if (loose) rangeList = rangeList.filter((comp) => {
						debug("loose invalid filter", comp, this.options);
						return !!comp.match(re[t.COMPARATORLOOSE]);
					});
					debug("range list", rangeList);
					const rangeMap = /* @__PURE__ */ new Map();
					const comparators = rangeList.map((comp) => new Comparator(comp, this.options));
					for (const comp of comparators) {
						if (isNullSet(comp)) return [comp];
						rangeMap.set(comp.value, comp);
					}
					if (rangeMap.size > 1 && rangeMap.has("")) rangeMap.delete("");
					const result = [...rangeMap.values()];
					cache.set(memoKey, result);
					return result;
				}
				intersects(range, options) {
					if (!(range instanceof Range)) throw new TypeError("a Range is required");
					return this.set.some((thisComparators) => {
						return isSatisfiable(thisComparators, options) && range.set.some((rangeComparators) => {
							return isSatisfiable(rangeComparators, options) && thisComparators.every((thisComparator) => {
								return rangeComparators.every((rangeComparator) => {
									return thisComparator.intersects(rangeComparator, options);
								});
							});
						});
					});
				}
				test(version) {
					if (!version) return false;
					if (typeof version === "string") try {
						version = new SemVer(version, this.options);
					} catch (er) {
						return false;
					}
					for (let i = 0; i < this.set.length; i++) if (testSet(this.set[i], version, this.options)) return true;
					return false;
				}
			};
			const cache = new (require_lrucache())();
			const parseOptions = require_parse_options();
			const Comparator = require_comparator();
			const debug = require_debug();
			const SemVer = require_semver$1();
			const { safeRe: re, src, t, comparatorTrimReplace, tildeTrimReplace, caretTrimReplace } = require_re();
			const { FLAG_INCLUDE_PRERELEASE, FLAG_LOOSE } = require_constants();
			const BUILDSTRIPRE = new RegExp(src[t.BUILD], "g");
			const isNullSet = (c) => c.value === "<0.0.0-0";
			const isAny = (c) => c.value === "";
			const isSatisfiable = (comparators, options) => {
				let result = true;
				const remainingComparators = comparators.slice();
				let testComparator = remainingComparators.pop();
				while (result && remainingComparators.length) {
					result = remainingComparators.every((otherComparator) => {
						return testComparator.intersects(otherComparator, options);
					});
					testComparator = remainingComparators.pop();
				}
				return result;
			};
			const parseComparator = (comp, options) => {
				comp = comp.replace(re[t.BUILD], "");
				debug("comp", comp, options);
				comp = replaceCarets(comp, options);
				debug("caret", comp);
				comp = replaceTildes(comp, options);
				debug("tildes", comp);
				comp = replaceXRanges(comp, options);
				debug("xrange", comp);
				comp = replaceStars(comp, options);
				debug("stars", comp);
				return comp;
			};
			const isX = (id) => !id || id.toLowerCase() === "x" || id === "*";
			const invalidXRangeOrder = (M, m, p) => isX(M) && !isX(m) || isX(m) && p && !isX(p);
			const replaceTildes = (comp, options) => {
				return comp.trim().split(/\s+/).map((c) => replaceTilde(c, options)).join(" ");
			};
			const replaceTilde = (comp, options) => {
				const r = options.loose ? re[t.TILDELOOSE] : re[t.TILDE];
				const z = options.includePrerelease ? "-0" : "";
				return comp.replace(r, (_, M, m, p, pr) => {
					debug("tilde", comp, _, M, m, p, pr);
					let ret;
					if (isX(M)) ret = "";
					else if (isX(m)) ret = `>=${M}.0.0${z} <${+M + 1}.0.0-0`;
					else if (isX(p)) ret = `>=${M}.${m}.0${z} <${M}.${+m + 1}.0-0`;
					else if (pr) {
						debug("replaceTilde pr", pr);
						ret = `>=${M}.${m}.${p}-${pr} <${M}.${+m + 1}.0-0`;
					} else ret = `>=${M}.${m}.${p} <${M}.${+m + 1}.0-0`;
					debug("tilde return", ret);
					return ret;
				});
			};
			const replaceCarets = (comp, options) => {
				return comp.trim().split(/\s+/).map((c) => replaceCaret(c, options)).join(" ");
			};
			const replaceCaret = (comp, options) => {
				debug("caret", comp, options);
				const r = options.loose ? re[t.CARETLOOSE] : re[t.CARET];
				const z = options.includePrerelease ? "-0" : "";
				return comp.replace(r, (_, M, m, p, pr) => {
					debug("caret", comp, _, M, m, p, pr);
					let ret;
					if (isX(M)) ret = "";
					else if (isX(m)) ret = `>=${M}.0.0${z} <${+M + 1}.0.0-0`;
					else if (isX(p)) {
						if (M === "0") ret = `>=${M}.${m}.0${z} <${M}.${+m + 1}.0-0`;
						else ret = `>=${M}.${m}.0${z} <${+M + 1}.0.0-0`;
					} else if (pr) {
						debug("replaceCaret pr", pr);
						if (M === "0") {
							if (m === "0") ret = `>=${M}.${m}.${p}-${pr} <${M}.${m}.${+p + 1}-0`;
							else ret = `>=${M}.${m}.${p}-${pr} <${M}.${+m + 1}.0-0`;
						} else ret = `>=${M}.${m}.${p}-${pr} <${+M + 1}.0.0-0`;
					} else {
						debug("no pr");
						if (M === "0") {
							if (m === "0") ret = `>=${M}.${m}.${p} <${M}.${m}.${+p + 1}-0`;
							else ret = `>=${M}.${m}.${p} <${M}.${+m + 1}.0-0`;
						} else ret = `>=${M}.${m}.${p} <${+M + 1}.0.0-0`;
					}
					debug("caret return", ret);
					return ret;
				});
			};
			const replaceXRanges = (comp, options) => {
				debug("replaceXRanges", comp, options);
				return comp.split(/\s+/).map((c) => replaceXRange(c, options)).join(" ");
			};
			const replaceXRange = (comp, options) => {
				comp = comp.trim();
				const r = options.loose ? re[t.XRANGELOOSE] : re[t.XRANGE];
				return comp.replace(r, (ret, gtlt, M, m, p, pr) => {
					debug("xRange", comp, ret, gtlt, M, m, p, pr);
					if (invalidXRangeOrder(M, m, p)) return comp;
					const xM = isX(M);
					const xm = xM || isX(m);
					const xp = xm || isX(p);
					const anyX = xp;
					if (gtlt === "=" && anyX) gtlt = "";
					pr = options.includePrerelease ? "-0" : "";
					if (xM) {
						if (gtlt === ">" || gtlt === "<") ret = "<0.0.0-0";
						else ret = "*";
					} else if (gtlt && anyX) {
						if (xm) m = 0;
						p = 0;
						if (gtlt === ">") {
							gtlt = ">=";
							if (xm) {
								M = +M + 1;
								m = 0;
								p = 0;
							} else {
								m = +m + 1;
								p = 0;
							}
						} else if (gtlt === "<=") {
							gtlt = "<";
							if (xm) M = +M + 1;
							else m = +m + 1;
						}
						if (gtlt === "<") pr = "-0";
						ret = `${gtlt + M}.${m}.${p}${pr}`;
					} else if (xm) ret = `>=${M}.0.0${pr} <${+M + 1}.0.0-0`;
					else if (xp) ret = `>=${M}.${m}.0${pr} <${M}.${+m + 1}.0-0`;
					debug("xRange return", ret);
					return ret;
				});
			};
			const replaceStars = (comp, options) => {
				debug("replaceStars", comp, options);
				return comp.trim().replace(re[t.STAR], "");
			};
			const replaceGTE0 = (comp, options) => {
				debug("replaceGTE0", comp, options);
				return comp.trim().replace(re[options.includePrerelease ? t.GTE0PRE : t.GTE0], "");
			};
			const hyphenReplace = (incPr) => ($0, from, fM, fm, fp, fpr, fb, to, tM, tm, tp, tpr) => {
				if (isX(fM)) from = "";
				else if (isX(fm)) from = `>=${fM}.0.0${incPr ? "-0" : ""}`;
				else if (isX(fp)) from = `>=${fM}.${fm}.0${incPr ? "-0" : ""}`;
				else if (fpr) from = `>=${from}`;
				else from = `>=${from}${incPr ? "-0" : ""}`;
				if (isX(tM)) to = "";
				else if (isX(tm)) to = `<${+tM + 1}.0.0-0`;
				else if (isX(tp)) to = `<${tM}.${+tm + 1}.0-0`;
				else if (tpr) to = `<=${tM}.${tm}.${tp}-${tpr}`;
				else if (incPr) to = `<${tM}.${tm}.${+tp + 1}-0`;
				else to = `<=${to}`;
				return `${from} ${to}`.trim();
			};
			const testSet = (set, version, options) => {
				for (let i = 0; i < set.length; i++) if (!set[i].test(version)) return false;
				if (version.prerelease.length && !options.includePrerelease) {
					for (let i = 0; i < set.length; i++) {
						debug(set[i].semver);
						if (set[i].semver === Comparator.ANY) continue;
						if (set[i].semver.prerelease.length > 0) {
							const allowed = set[i].semver;
							if (allowed.major === version.major && allowed.minor === version.minor && allowed.patch === version.patch) return true;
						}
					}
					return false;
				}
				return true;
			};
		}));
		//#endregion
		//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/classes/comparator.js
		var require_comparator = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const ANY = Symbol("SemVer ANY");
			module.exports = class Comparator {
				static get ANY() {
					return ANY;
				}
				constructor(comp, options) {
					options = parseOptions(options);
					if (comp instanceof Comparator) {
						if (comp.loose === !!options.loose) return comp;
						else comp = comp.value;
					}
					comp = comp.trim().split(/\s+/).join(" ");
					debug("comparator", comp, options);
					this.options = options;
					this.loose = !!options.loose;
					this.parse(comp);
					if (this.semver === ANY) this.value = "";
					else this.value = this.operator + this.semver.version;
					debug("comp", this);
				}
				parse(comp) {
					const r = this.options.loose ? re[t.COMPARATORLOOSE] : re[t.COMPARATOR];
					const m = comp.match(r);
					if (!m) throw new TypeError(`Invalid comparator: ${comp}`);
					this.operator = m[1] !== void 0 ? m[1] : "";
					if (this.operator === "=") this.operator = "";
					if (!m[2]) this.semver = ANY;
					else this.semver = new SemVer(m[2], this.options.loose);
				}
				toString() {
					return this.value;
				}
				test(version) {
					debug("Comparator.test", version, this.options.loose);
					if (this.semver === ANY || version === ANY) return true;
					if (typeof version === "string") try {
						version = new SemVer(version, this.options);
					} catch (er) {
						return false;
					}
					return cmp(version, this.operator, this.semver, this.options);
				}
				intersects(comp, options) {
					if (!(comp instanceof Comparator)) throw new TypeError("a Comparator is required");
					if (this.operator === "") {
						if (this.value === "") return true;
						return new Range(comp.value, options).test(this.value);
					} else if (comp.operator === "") {
						if (comp.value === "") return true;
						return new Range(this.value, options).test(comp.semver);
					}
					options = parseOptions(options);
					if (options.includePrerelease && (this.value === "<0.0.0-0" || comp.value === "<0.0.0-0")) return false;
					if (!options.includePrerelease && (this.value.startsWith("<0.0.0") || comp.value.startsWith("<0.0.0"))) return false;
					if (this.operator.startsWith(">") && comp.operator.startsWith(">")) return true;
					if (this.operator.startsWith("<") && comp.operator.startsWith("<")) return true;
					if (this.semver.version === comp.semver.version && this.operator.includes("=") && comp.operator.includes("=")) return true;
					if (cmp(this.semver, "<", comp.semver, options) && this.operator.startsWith(">") && comp.operator.startsWith("<")) return true;
					if (cmp(this.semver, ">", comp.semver, options) && this.operator.startsWith("<") && comp.operator.startsWith(">")) return true;
					return false;
				}
			};
			const parseOptions = require_parse_options();
			const { safeRe: re, t } = require_re();
			const cmp = require_cmp();
			const debug = require_debug();
			const SemVer = require_semver$1();
			const Range = require_range();
		}));
		//#endregion
		//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/functions/satisfies.js
		var require_satisfies = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const Range = require_range();
			const satisfies = (version, range, options) => {
				try {
					range = new Range(range, options);
				} catch (er) {
					return false;
				}
				return range.test(version);
			};
			module.exports = satisfies;
		}));
		//#endregion
		//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/ranges/to-comparators.js
		var require_to_comparators = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const Range = require_range();
			const toComparators = (range, options) => new Range(range, options).set.map((comp) => comp.map((c) => c.value).join(" ").trim().split(" "));
			module.exports = toComparators;
		}));
		//#endregion
		//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/ranges/max-satisfying.js
		var require_max_satisfying = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const SemVer = require_semver$1();
			const Range = require_range();
			const maxSatisfying = (versions, range, options) => {
				let max = null;
				let maxSV = null;
				let rangeObj = null;
				try {
					rangeObj = new Range(range, options);
				} catch (er) {
					return null;
				}
				versions.forEach((v) => {
					if (rangeObj.test(v)) {
						if (!max || maxSV.compare(v) === -1) {
							max = v;
							maxSV = new SemVer(max, options);
						}
					}
				});
				return max;
			};
			module.exports = maxSatisfying;
		}));
		//#endregion
		//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/ranges/min-satisfying.js
		var require_min_satisfying = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const SemVer = require_semver$1();
			const Range = require_range();
			const minSatisfying = (versions, range, options) => {
				let min = null;
				let minSV = null;
				let rangeObj = null;
				try {
					rangeObj = new Range(range, options);
				} catch (er) {
					return null;
				}
				versions.forEach((v) => {
					if (rangeObj.test(v)) {
						if (!min || minSV.compare(v) === 1) {
							min = v;
							minSV = new SemVer(min, options);
						}
					}
				});
				return min;
			};
			module.exports = minSatisfying;
		}));
		//#endregion
		//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/ranges/min-version.js
		var require_min_version = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const SemVer = require_semver$1();
			const Range = require_range();
			const gt = require_gt();
			const minVersion = (range, loose) => {
				range = new Range(range, loose);
				let minver = new SemVer("0.0.0");
				if (range.test(minver)) return minver;
				minver = new SemVer("0.0.0-0");
				if (range.test(minver)) return minver;
				minver = null;
				for (let i = 0; i < range.set.length; ++i) {
					const comparators = range.set[i];
					let setMin = null;
					comparators.forEach((comparator) => {
						const compver = new SemVer(comparator.semver.version);
						switch (comparator.operator) {
							case ">":
								if (compver.prerelease.length === 0) compver.patch++;
								else compver.prerelease.push(0);
								compver.raw = compver.format();
							case "":
							case ">=":
								if (!setMin || gt(compver, setMin)) setMin = compver;
								break;
							case "<":
							case "<=": break;
							/* istanbul ignore next */
							default: throw new Error(`Unexpected operation: ${comparator.operator}`);
						}
					});
					if (setMin && (!minver || gt(minver, setMin))) minver = setMin;
				}
				if (minver && range.test(minver)) return minver;
				return null;
			};
			module.exports = minVersion;
		}));
		//#endregion
		//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/ranges/valid.js
		var require_valid = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const Range = require_range();
			const validRange = (range, options) => {
				try {
					return new Range(range, options).range || "*";
				} catch (er) {
					return null;
				}
			};
			module.exports = validRange;
		}));
		//#endregion
		//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/ranges/outside.js
		var require_outside = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const SemVer = require_semver$1();
			const Comparator = require_comparator();
			const { ANY } = Comparator;
			const Range = require_range();
			const satisfies = require_satisfies();
			const gt = require_gt();
			const lt = require_lt();
			const lte = require_lte();
			const gte = require_gte();
			const outside = (version, range, hilo, options) => {
				version = new SemVer(version, options);
				range = new Range(range, options);
				let gtfn, ltefn, ltfn, comp, ecomp;
				switch (hilo) {
					case ">":
						gtfn = gt;
						ltefn = lte;
						ltfn = lt;
						comp = ">";
						ecomp = ">=";
						break;
					case "<":
						gtfn = lt;
						ltefn = gte;
						ltfn = gt;
						comp = "<";
						ecomp = "<=";
						break;
					default: throw new TypeError("Must provide a hilo val of \"<\" or \">\"");
				}
				if (satisfies(version, range, options)) return false;
				for (let i = 0; i < range.set.length; ++i) {
					const comparators = range.set[i];
					let high = null;
					let low = null;
					comparators.forEach((comparator) => {
						if (comparator.semver === ANY) comparator = new Comparator(">=0.0.0");
						high = high || comparator;
						low = low || comparator;
						if (gtfn(comparator.semver, high.semver, options)) high = comparator;
						else if (ltfn(comparator.semver, low.semver, options)) low = comparator;
					});
					if (high.operator === comp || high.operator === ecomp) return false;
					if ((!low.operator || low.operator === comp) && ltefn(version, low.semver)) return false;
					else if (low.operator === ecomp && ltfn(version, low.semver)) return false;
				}
				return true;
			};
			module.exports = outside;
		}));
		//#endregion
		//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/ranges/gtr.js
		var require_gtr = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const outside = require_outside();
			const gtr = (version, range, options) => outside(version, range, ">", options);
			module.exports = gtr;
		}));
		//#endregion
		//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/ranges/ltr.js
		var require_ltr = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const outside = require_outside();
			const ltr = (version, range, options) => outside(version, range, "<", options);
			module.exports = ltr;
		}));
		//#endregion
		//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/ranges/intersects.js
		var require_intersects = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const Range = require_range();
			const intersects = (r1, r2, options) => {
				r1 = new Range(r1, options);
				r2 = new Range(r2, options);
				return r1.intersects(r2, options);
			};
			module.exports = intersects;
		}));
		//#endregion
		//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/ranges/simplify.js
		var require_simplify = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const satisfies = require_satisfies();
			const compare = require_compare();
			module.exports = (versions, range, options) => {
				const set = [];
				let first = null;
				let prev = null;
				const v = versions.sort((a, b) => compare(a, b, options));
				for (const version of v) if (satisfies(version, range, options)) {
					prev = version;
					if (!first) first = version;
				} else {
					if (prev) set.push([first, prev]);
					prev = null;
					first = null;
				}
				if (first) set.push([first, null]);
				const ranges = [];
				for (const [min, max] of set) if (min === max) ranges.push(min);
				else if (!max && min === v[0]) ranges.push("*");
				else if (!max) ranges.push(`>=${min}`);
				else if (min === v[0]) ranges.push(`<=${max}`);
				else ranges.push(`${min} - ${max}`);
				const simplified = ranges.join(" || ");
				const original = typeof range.raw === "string" ? range.raw : String(range);
				return simplified.length < original.length ? simplified : range;
			};
		}));
		//#endregion
		//#region ../../node_modules/.pnpm/semver@7.8.5/node_modules/semver/ranges/subset.js
		var require_subset = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			const Range = require_range();
			const Comparator = require_comparator();
			const { ANY } = Comparator;
			const satisfies = require_satisfies();
			const compare = require_compare();
			const subset = (sub, dom, options = {}) => {
				if (sub === dom) return true;
				sub = new Range(sub, options);
				dom = new Range(dom, options);
				let sawNonNull = false;
				OUTER: for (const simpleSub of sub.set) {
					for (const simpleDom of dom.set) {
						const isSub = simpleSubset(simpleSub, simpleDom, options);
						sawNonNull = sawNonNull || isSub !== null;
						if (isSub) continue OUTER;
					}
					if (sawNonNull) return false;
				}
				return true;
			};
			const minimumVersionWithPreRelease = [new Comparator(">=0.0.0-0")];
			const minimumVersion = [new Comparator(">=0.0.0")];
			const simpleSubset = (sub, dom, options) => {
				if (sub === dom) return true;
				if (sub.length === 1 && sub[0].semver === ANY) {
					if (dom.length === 1 && dom[0].semver === ANY) return true;
					else if (options.includePrerelease) sub = minimumVersionWithPreRelease;
					else sub = minimumVersion;
				}
				if (dom.length === 1 && dom[0].semver === ANY) {
					if (options.includePrerelease) return true;
					else dom = minimumVersion;
				}
				const eqSet = /* @__PURE__ */ new Set();
				let gt, lt;
				for (const c of sub) if (c.operator === ">" || c.operator === ">=") gt = higherGT(gt, c, options);
				else if (c.operator === "<" || c.operator === "<=") lt = lowerLT(lt, c, options);
				else eqSet.add(c.semver);
				if (eqSet.size > 1) return null;
				let gtltComp;
				if (gt && lt) {
					gtltComp = compare(gt.semver, lt.semver, options);
					if (gtltComp > 0) return null;
					else if (gtltComp === 0 && (gt.operator !== ">=" || lt.operator !== "<=")) return null;
				}
				for (const eq of eqSet) {
					if (gt && !satisfies(eq, String(gt), options)) return null;
					if (lt && !satisfies(eq, String(lt), options)) return null;
					for (const c of dom) if (!satisfies(eq, String(c), options)) return false;
					return true;
				}
				let higher, lower;
				let hasDomLT, hasDomGT;
				let needDomLTPre = lt && !options.includePrerelease && lt.semver.prerelease.length ? lt.semver : false;
				let needDomGTPre = gt && !options.includePrerelease && gt.semver.prerelease.length ? gt.semver : false;
				if (needDomLTPre && needDomLTPre.prerelease.length === 1 && lt.operator === "<" && needDomLTPre.prerelease[0] === 0) needDomLTPre = false;
				for (const c of dom) {
					hasDomGT = hasDomGT || c.operator === ">" || c.operator === ">=";
					hasDomLT = hasDomLT || c.operator === "<" || c.operator === "<=";
					if (gt) {
						if (needDomGTPre) {
							if (c.semver.prerelease && c.semver.prerelease.length && c.semver.major === needDomGTPre.major && c.semver.minor === needDomGTPre.minor && c.semver.patch === needDomGTPre.patch) needDomGTPre = false;
						}
						if (c.operator === ">" || c.operator === ">=") {
							higher = higherGT(gt, c, options);
							if (higher === c && higher !== gt) return false;
						} else if (gt.operator === ">=" && !c.test(gt.semver)) return false;
					}
					if (lt) {
						if (needDomLTPre) {
							if (c.semver.prerelease && c.semver.prerelease.length && c.semver.major === needDomLTPre.major && c.semver.minor === needDomLTPre.minor && c.semver.patch === needDomLTPre.patch) needDomLTPre = false;
						}
						if (c.operator === "<" || c.operator === "<=") {
							lower = lowerLT(lt, c, options);
							if (lower === c && lower !== lt) return false;
						} else if (lt.operator === "<=" && !c.test(lt.semver)) return false;
					}
					if (!c.operator && (lt || gt) && gtltComp !== 0) return false;
				}
				if (gt && hasDomLT && !lt && gtltComp !== 0) return false;
				if (lt && hasDomGT && !gt && gtltComp !== 0) return false;
				if (needDomGTPre || needDomLTPre) return false;
				return true;
			};
			const higherGT = (a, b, options) => {
				if (!a) return b;
				const comp = compare(a.semver, b.semver, options);
				return comp > 0 ? a : comp < 0 ? b : b.operator === ">" && a.operator === ">=" ? b : a;
			};
			const lowerLT = (a, b, options) => {
				if (!a) return b;
				const comp = compare(a.semver, b.semver, options);
				return comp < 0 ? a : comp > 0 ? b : b.operator === "<" && a.operator === "<=" ? b : a;
			};
			module.exports = subset;
		}));
		//#endregion
		//#region src/shared/identity.ts
		var import_semver = (/* @__PURE__ */ __commonJSMin(((exports, module) => {
			const internalRe = require_re();
			const constants = require_constants();
			const SemVer = require_semver$1();
			const identifiers = require_identifiers();
			module.exports = {
				parse: require_parse(),
				valid: require_valid$1(),
				clean: require_clean(),
				inc: require_inc(),
				diff: require_diff(),
				major: require_major(),
				minor: require_minor(),
				patch: require_patch(),
				prerelease: require_prerelease(),
				compare: require_compare(),
				rcompare: require_rcompare(),
				compareLoose: require_compare_loose(),
				compareBuild: require_compare_build(),
				sort: require_sort(),
				rsort: require_rsort(),
				gt: require_gt(),
				lt: require_lt(),
				eq: require_eq(),
				neq: require_neq(),
				gte: require_gte(),
				lte: require_lte(),
				cmp: require_cmp(),
				coerce: require_coerce(),
				truncate: require_truncate(),
				Comparator: require_comparator(),
				Range: require_range(),
				satisfies: require_satisfies(),
				toComparators: require_to_comparators(),
				maxSatisfying: require_max_satisfying(),
				minSatisfying: require_min_satisfying(),
				minVersion: require_min_version(),
				validRange: require_valid(),
				outside: require_outside(),
				gtr: require_gtr(),
				ltr: require_ltr(),
				intersects: require_intersects(),
				simplifyRange: require_simplify(),
				subset: require_subset(),
				SemVer,
				re: internalRe.re,
				src: internalRe.src,
				tokens: internalRe.t,
				SEMVER_SPEC_VERSION: constants.SEMVER_SPEC_VERSION,
				RELEASE_TYPES: constants.RELEASE_TYPES,
				compareIdentifiers: identifiers.compareIdentifiers,
				rcompareIdentifiers: identifiers.rcompareIdentifiers
			};
		})))();
		/** The registry's uniqueness rule, shared with the presentation layer. */
		function identityKey(identity) {
			return identity.source === "npm" ? `npm:${identity.name}` : `github:${identity.repo ?? identity.name}#${identity.subdir ?? ""}`;
		}
		/** `owner/slug` inside a GitHub reference. */
		const REPO = "([\\w.-]+)\\/([\\w.-]+?)";
		const GITHUB_SHORTHAND = new RegExp(`^github:${REPO}(?:[#&].*)?$`);
		const GITHUB_URL = new RegExp(`^(?:git\\+)?https?:\\/\\/(?:www\\.)?github\\.com\\/${REPO}(?:\\.git)?(?:[\\/?#].*)?$`);
		/**
		* Attribute a profile dependency spec to where its package came from.
		*
		* The single parse: every other function here reads its answer rather than
		* re-applying the regexes, so the grammar cannot be widened in one place and
		* not the other.
		*
		* `null` means this spec is a form the grammar does not cover — `git+ssh://`,
		* `git@github.com:`, a `file:`/`link:` checkout, `workspace:*`, an `npm:`
		* alias to a different package, a non-GitHub URL. Attribution is POSITIVE on
		* both arms and null is never guessed away: reading an unattributable spec as
		* npm is what let an npm entry silently replace a git install, and what
		* printed "already installed from the npm package X" about a local checkout.
		*/
		function parseSpec(spec) {
			if (spec.trim() === "") return null;
			const shorthand = GITHUB_SHORTHAND.exec(spec);
			if (shorthand?.[1] !== void 0 && shorthand[2] !== void 0) return {
				kind: "github",
				repo: `${shorthand[1]}/${shorthand[2]}`
			};
			const url = GITHUB_URL.exec(spec);
			if (url?.[1] !== void 0 && url[2] !== void 0) return {
				kind: "github",
				repo: `${url[1]}/${url[2]}`
			};
			return (0, import_semver.validRange)(spec) !== null ? { kind: "npm" } : null;
		}
		/**
		* Whether two identities of the SAME bundle name are the same install.
		*
		* Deliberately coarser than `identityKey`: a profile records a dependency
		* spec, which carries the repository but not the subdirectory, so this is the
		* finest distinction the installed state can actually support. It ignores
		* `name` — every caller has already matched on it — and answers only "is the
		* thing under that name this one, or a different one?".
		*/
		function sameInstall(a, b) {
			if (a.source !== b.source) return false;
			if (a.source === "npm") return true;
			return a.repo !== void 0 && a.repo.toLowerCase() === b.repo?.toLowerCase();
		}
		function specVerdict(entry, spec) {
			const origin = parseSpec(spec);
			if (origin === null) return "unknown";
			return sameInstall(entry, origin.kind === "npm" ? {
				source: "npm",
				name: entry.name
			} : {
				source: "github",
				name: entry.name,
				repo: origin.repo
			}) ? "same" : "different";
		}
		/** How long a raw spec may be when it is quoted back to a reader as the thing
		* holding a name. A profile manifest is not ours; a pathological value must
		* not become a wall of text in a rejection detail or a card. */
		const HOLDER_SPEC_CAP = 80;
		/**
		* The token naming whatever holds a bundle name, for someone deciding what to
		* do about it.
		*
		* One function for both halves. The host's refusal and the card's badge wrap
		* it in their own sentence — the host in English prose, the card in the
		* reader's language — but the token itself is identical, so the two surfaces
		* can never name one plugin two ways. It is language-neutral for that reason:
		* a github holder is its repository (the only thing that tells it apart from
		* the entry it blocks), an npm holder is `npm:<name>`, and a spec we cannot
		* attribute is quoted verbatim, because saying which string is in the way is
		* the only honest thing left to say about it.
		*/
		function holderLabel(spec, name) {
			const origin = parseSpec(spec);
			if (origin?.kind === "github") return origin.repo;
			if (origin?.kind === "npm") return `npm:${name}`;
			if (spec.trim() === "") return "\"\"";
			return spec.length > HOLDER_SPEC_CAP ? `${spec.slice(0, 79)}…` : spec;
		}
		//#endregion
		//#region src/client/present.ts
		/** The done notice for one activation, as a locale key.
		*
		* A hot-mount reason code names WHY a restart is needed and is meaningful
		* only under `restart`; `live` and `reload` ignore any reason riding along,
		* because rendering one there would tell a reader their reload had failed.
		* An absent or unrecognized reason keeps the generic restart line rather
		* than showing a bare code. */
		function activationNoticeKey(activation, restartReason) {
			if (activation === "live") return "installedNoRestartNotice";
			if (activation === "reload") return "installedReloadNotice";
			switch (restartReason) {
				case "no-patch": return "hotNoPatchNotice";
				case "not-simple": return "hotNotSimpleNotice";
				case "host-unsupported": return "hotHostUnsupportedNotice";
				case "timeout": return "hotTimeoutNotice";
				case "mount-failed": return "hotMountFailedNotice";
				case "already-loaded": return "hotAlreadyLoadedNotice";
				default: return "installedRestartNotice";
			}
		}
		/** The same mapping for an UNINSTALL's done notice.
		*
		* A sibling rather than a `prefix` parameter on `activationNoticeKey`: the
		* two key sets are not parallel — `installedNoRestartNotice` against
		* `uninstalledLiveNotice` — so no prefix derives one from the other. It takes
		* no reason code, because a hot-mount reason explains why a MOUNT could not
		* happen and an uninstall mounts nothing.
		*
		* Here rather than in JSX because this is a pure Activation -> copy decision,
		* and in a component no fixture can reach it: the install side was covered
		* and this one was not, for the whole time both existed. */
		function uninstallActivationNoticeKey(activation) {
			if (activation === "restart") return "uninstalledRestartNotice";
			return activation === "reload" ? "uninstalledReloadNotice" : "uninstalledLiveNotice";
		}
		/** The copy key for one install phase. A function rather than an inline
		* ternary in the JSX so it is unit-testable: the tab's only test seam is a
		* whole-tab render driven by injected RPCs, which cannot be handed one view. */
		function installPhaseKey(phase) {
			return phase === "downloading" ? "downloading" : "installing";
		}
		/** Why the shop cannot restart dsh, as a locale key.
		*
		* A sibling of `activationNoticeKey` and exhaustive for the same reason: the
		* switch has no default, so a reason added to `RestartBlockedReason` is a type
		* error here rather than a card that silently keeps a neighbour's copy. That
		* is the whole point of the type — the single boolean this replaced
		* had ONE string for three causes, and it named systemd, so a Windows reader
		* was told to restart a service they do not run and to set an override that
		* could not have helped. */
		function restartBlockedNoticeKey(reason) {
			switch (reason) {
				case "desktop": return "restartBlockedDesktopNotice";
				case "from-default-profile": return "restartBlockedFromDefaultProfileNotice";
				case "windows": return "restartBlockedWindowsNotice";
				case "systemd": return "restartBlockedSystemdNotice";
				case "port-zero": return "restartBlockedPortZeroNotice";
			}
		}
		/** Tier → locale key, for the entry-card tier badge (§6.2). */
		function tierKey(tier) {
			switch (tier) {
				case "verified": return "tierVerified";
				case "verified-stale": return "tierVerifiedStale";
				case "community": return "tierCommunity";
			}
		}
		/** The peers the Host said this installation does not provide, or none when it
		* said nothing — a plugin that runs here and one the Host could not judge are
		* both rendered as no warning at all. The map is keyed by install identity,
		* never by name, because two entries can share a name. */
		function missingPeersOf(incompatible, key) {
			return incompatible[key] ?? [];
		}
		/** The author's own `dsh.compatibility` that this installation does not meet
		* (design 2026-09-01 §8.2), or undefined when the host gave no verdict. Keyed
		* by install identity, never by name, for the reason `missingPeersOf` is.
		*
		* The map itself may be absent, whatever the result type says: a tab can
		* outlive a shop self-update by one reload and then be talking to the OLD
		* in-process host until dsh restarts, which answers the shape from before the
		* key existed. That is "no verdict", never a crash. */
		function harnessVerdictOf(verdicts, key) {
			return verdicts !== void 0 && Object.hasOwn(verdicts, key) ? verdicts[key] : void 0;
		}
		/**
		* Everything standing in one entry's way, in the order every surface renders
		* it — the card's detail lines, the badge's accessible name, the outdated
		* row's refusal — and the one list the incompatible filter reads, through
		* `readsIncompatible`, and the install button, through `refusesInstall`.
		*
		* The refusals read first. The name conflict leads: it is about a plugin the
		* reader chose and would lose. Then dsh's own refusal, then what this machine
		* is measured to lack, then what the author declared, range before profiles —
		* the order the host's verdict carries its halves.
		*/
		function blockersOf(missing, harness, nameTakenBy) {
			const blockers = [];
			if (nameTakenBy !== void 0) blockers.push({
				kind: "name-taken",
				holder: nameTakenBy
			});
			if (harness?.peers !== void 0) {
				const { refused, running, allowCommand } = harness.peers;
				blockers.push({
					kind: "harness-peers",
					refused,
					running,
					allowCommand
				});
			}
			if (missing.length > 0) blockers.push({
				kind: "missing-peers",
				modules: missing
			});
			if (harness?.dsh !== void 0) blockers.push({
				kind: "harness-range",
				range: harness.dsh.range,
				running: harness.dsh.running
			});
			if (harness?.profile !== void 0) blockers.push({
				kind: "harness-profile",
				declared: harness.profile.declared,
				running: harness.profile.running
			});
			return blockers;
		}
		/**
		* The badge's visible word for these blockers, or null when there are none.
		*
		* "Incompatible" for anything about this harness, whichever reason put it
		* there. A taken name is the more serious condition and names a different
		* remedy, so it decides the word whenever it holds — the card is perfectly
		* compatible, and a different plugin is in the way.
		*/
		function blockerBadgeKey(blockers) {
			if (blockers.length === 0) return null;
			return blockers.some((blocker) => blocker.kind === "name-taken") ? "nameTakenBadge" : "incompatibleBadge";
		}
		/** Whether the badge reads "Incompatible" — exactly the set the incompatible
		* filter counts and takes away. Derived from the badge's own rule, never
		* restated beside it: the filter used to test the peer list by hand, which
		* held only while missing peers were the one reason for the word — a card
		* badged for its declared range would have read "Incompatible" and survived
		* the filter that names it. */
		function readsIncompatible(blockers) {
			return blockerBadgeKey(blockers) === "incompatibleBadge";
		}
		/**
		* Whether this install is refused before it starts, so the card shows the
		* refused label where its button would be, rather than a button for an
		* install that cannot proceed: refused by the host, for a taken name, or by
		* the running dsh, for its harness peers.
		*
		* The second is the one harness reason that blocks (design
		* 2026-09-26-dsh-017-readiness, B1, amending "warn, never block"): dsh 0.1.7
		* refuses the install itself, an npm entry before pnpm runs and a github
		* entry after it, rolling the profile back, and the shop cannot install past
		* it. The verdict is dsh's own rule on the profile's own exemptions, whichever
		* channel the entry comes from (design
		* 2026-09-28-bundle-components-and-github-peers, section 7.3), so the label
		* is dsh's answer given early, never the shop's opinion — and recording the
		* exemption the card shows is what brings the button back.
		*/
		function refusesInstall(blockers) {
			return blockers.some((blocker) => blocker.kind === "name-taken" || blocker.kind === "harness-peers");
		}
		/** The key dsh 0.2.1 lists a package's own `engines.dsh` range under, among
		* the requirements it refuses (design 2026-10-19-dsh-021-readiness, section
		* 4). Cards DO receive it now: the catalog carries `engines` from the 2026-11-02
		* build on (design 2026-11-02-market-borrowings §1), `ownManifest` hands it to
		* dsh's own rule, and a refusal comes back with this key in the map — which is
		* why {@link refusedPeersText} has to render it as `dsh <range>` rather than as
		* a package name. An install-time refusal carries the same key in its own
		* detail (`versionRefusalDetail`), which never passes through here. */
		const ENGINES_DSH = "engines.dsh";
		/**
		* The refused requirements as the refusal's copy names them: each one and the
		* range the package declared, in the order dsh reported them. A peer is named
		* by its package. `engines.dsh` is a manifest path, not a name anyone asked
		* for, so it reads as `dsh` and its range, the way the sentence says "it
		* requires dsh >=0.3.0". A blank range — which dsh refuses — is quoted, or the
		* sentence would name the requirement and nothing it asked for.
		*/
		function refusedPeersText(refused) {
			return Object.entries(refused).map(([name, range]) => `${name === ENGINES_DSH ? "dsh" : name} ${range.trim() === "" ? JSON.stringify(range) : range}`).join(", ");
		}
		/**
		* The plugin already holding this entry's bundle name, if a DIFFERENT one is,
		* named the way the host's refusal names it.
		*
		* `specs` is the profile manifest's dependencies exactly as the install gate
		* reads them (`installedSpecs`), and the verdict is the gate's own function.
		* One rule on one input, so the badge and the refusal cannot disagree. The
		* first version of this derived the answer from `installed()`, which drops
		* every dependency no catalog entry matches — so a fork, a hand install or a
		* delisted holder was invisible here while the host still refused, and the
		* card showed a plain Install button for an install that could not proceed.
		*
		* `undefined` specs means the host could not read the manifest. The answer is
		* undefined there too: the card makes no claim rather than promising a clean
		* install it cannot vouch for.
		*/
		function heldBy(entry, specs) {
			if (specs === void 0 || !Object.hasOwn(specs, entry.name)) return void 0;
			const spec = specs[entry.name];
			if (spec === void 0) return void 0;
			return specVerdict(entry, spec) === "same" ? void 0 : holderLabel(spec, entry.name);
		}
		/** Install rejection code → locale key, for the rejected-state code label
		* (§7.2): every rejection the host can return has a human label here. */
		function rejectionCodeKey(code) {
			switch (code) {
				case "denied": return "deniedCode";
				case "not-in-catalog": return "notInCatalogCode";
				case "version-mismatch": return "versionMismatchCode";
				case "needs-acknowledgement": return "needsAcknowledgementCode";
				case "tarball-integrity": return "tarballIntegrityCode";
				case "ambiguous-identity": return "ambiguousIdentityCode";
				case "name-taken": return "nameTakenCode";
				case "desktop-profile": return "desktopProfileCode";
			}
		}
		/** A commit pin as the registry writes one: forty lowercase hex. */
		const COMMIT_PIN = /^[0-9a-f]{40}$/;
		/**
		* How a version string reads on the shelf, decided by its source and its
		* shape alone (market borrowings §11).
		*
		* Shape, never the entry's `tarball`, because an installed row carries only
		* the pin the shop recorded at install — the catalog `version` of that moment
		* — and no `tarball`. The registry pins a commit as forty lowercase hex and a
		* release by its tag, so the two shapes do not cross; `present.test.ts`
		* checks that against the committed live catalog.
		*
		* - An npm version takes the `v` the shelf has always shown, and only before
		*   a digit: an installed row reports the manifest's spec, and a range there
		*   (`^1.2.3`) is not a version to prefix.
		* - A commit is cut to the seven characters git abbreviates to, with no `v`:
		*   it is not a version number.
		* - A release tag prints exactly as tagged, never cut and never prefixed:
		*   cutting `v0.29.10` to seven characters printed `v0.29.1`, another
		*   version, and the `v` this function no longer adds doubled the tag's own.
		*/
		function versionLabel(source, version) {
			if (source === "npm") return {
				kind: "npm",
				text: /^\d/.test(version) ? `v${version}` : version,
				value: version
			};
			if (COMMIT_PIN.test(version)) {
				const short = version.slice(0, 7);
				return {
					kind: "commit",
					text: short,
					value: short
				};
			}
			return {
				kind: "release",
				text: version,
				value: version
			};
		}
		/** The copy that names a version's kind, for the accessible name and the
		* tooltip; its `{version}` takes {@link VersionLabel.value}. */
		function versionLabelKey(kind) {
			switch (kind) {
				case "npm": return "npmVersionLabel";
				case "commit": return "commitVersionLabel";
				case "release": return "releaseVersionLabel";
			}
		}
		/** The hash pin a stale line names for a repo or release-rescued entry — the
		* reviewed commit, or the reviewed release tarball sha256 (market borrowings
		* §3.1). Shortened to 7 chars like a commit on the card; '' only for a
		* hand-built fixture carrying no pin. The npm form is a version, which
		* {@link versionLabel} prints instead. */
		function reviewHashPin(review) {
			return (review.reviewedCommit ?? review.reviewedSha256 ?? "").slice(0, 7);
		}
		/**
		* Whether the license value is the npm idiom `SEE LICENSE IN <file>` — a
		* valid SPDX form meaning "custom license, text ships in that file". The
		* catalog keeps the author's verbatim value; the shelf renders it as a
		* localized "Custom license" label. Everything else renders verbatim.
		*/
		function isCustomLicense(license) {
			return license !== null && /^SEE LICENSE IN /i.test(license);
		}
		/** The phase a non-terminal state renders as: the WIRE state the host
		* reported (`InstallState`) mapped onto the phase the view carries. Exported
		* because every hook that turns a start or a poll result into a view spells
		* this same mapping, and three hand-copied ternaries are three chances for
		* one of them to drift.
		*
		* Not to be confused with `installPhaseKey`, which is the OTHER direction and
		* a different pair of values: view phase → the locale key to render. They
		* happen to share two spellings today and that is a coincidence of naming,
		* not a reason to fuse them — the wire union and the locale key set are free
		* to diverge. */
		function phaseOf(state) {
			return state === "downloading" ? "downloading" : "installing";
		}
		/** §7.2 once-per-second poll cadence, as a named constant. */
		const INSTALL_POLL_MS = 1e3;
		/**
		* The restart monitor's decision after a probe of the origin.
		*
		* `stableSinceMs` is when the current unbroken run of good answers began —
		* null when the last probe failed, or none has succeeded yet — and both times
		* count from the moment the restart was committed. One answer is not enough:
		* reloading on it is what landed a reader on a boot that died a moment later,
		* a blank page in place of the notice naming the log. So the page reloads
		* only once the run has lasted `RESTART_STABLE_MS`, and the monitor gives up
		* only when no run is under way past `RESTART_WAIT_MS` — which bounds the
		* whole wait at the sum of the two, since a run that began in time either
		* completes or breaks after the deadline.
		*/
		function restartMonitorVerdict(input) {
			if (input.stableSinceMs !== null && input.elapsedMs - input.stableSinceMs >= 8e3) return "reload";
			if (input.stableSinceMs === null && input.elapsedMs > 3e4) return "failed";
			return "wait";
		}
		/**
		* Whether two `version()` answers came from different dsh processes — dsh
		* restarted under the page between them (design §8, 2026-10-06 amendment).
		*
		* A process names itself by `bootId` for as long as it lives, so where either
		* answer carries one, a difference decides: a host older than the field never
		* starts naming itself, and a newer one never stops. Where neither does, only
		* the code they run can differ — one process runs one version, read once at
		* its boot — which still catches the first restart after a self-update from
		* a host older than the field, the one that matters most.
		*/
		function answeredByAnotherProcess(previous, next) {
			if (previous.bootId !== void 0 || next.bootId !== void 0) return previous.bootId !== next.bootId;
			return previous.installed !== next.installed;
		}
		/**
		* Whether an update of the shop has landed and waits for a restart: the
		* profile holds a version other than the one running. A host older than the
		* field sends none, and that reads as waiting: a client newer than its host
		* exists only because the disk holds a newer shop than the process running
		* (design §7.3, 2026-09-27 amendment). The tab's restart offer and the
		* hand-over after a hot swap (design 2026-10-16-shop-sidebar-page §6) read
		* it alike.
		*/
		function updateAwaitsRestart(version) {
			return version.pendingVersion !== null;
		}
		/**
		* Whether dsh restarting under the page settles this receipt: a change that
		* landed and was waiting for exactly that. The page store clears these
		* (page-store.ts, `noteRestarted`) once the answers come from another
		* process, and nothing else — a reload is still owed by a page nobody
		* reloaded, a failure still happened, and a flow still running settles by
		* its own poll.
		*/
		function settledByRestart(view) {
			return view.kind === "done" && view.activation === "restart";
		}
		/** How long the check-update button reports "up to date" after a re-check
		* finds no newer release, before reverting to its idle label. */
		const CHECK_UP_TO_DATE_MS = 3e3;
		/** The next number of cards to show: the current window plus one batch,
		* clamped so the window never claims more cards than the list holds. */
		function nextVisibleCount(visible, total, batch) {
			return Math.min(visible + batch, total);
		}
		/** Pure install view reducer. A `status` event only applies to the install the
		* view is tracking — a status for an install it never started (idle) is an
		* unrelated event and a no-op, like any other event it does not recognize. */
		function reduceInstall(state, event) {
			switch (event.type) {
				case "started": return {
					kind: "running",
					installId: event.installId,
					log: [],
					phase: phaseOf(event.state)
				};
				case "rejected": return {
					kind: "rejected",
					code: event.code,
					detail: event.detail
				};
				case "status": {
					if (state.kind !== "running") return state;
					const { status } = event;
					if (!status.found) return {
						kind: "failed",
						detail: status.detail ?? "The installation record is no longer available. Refresh the shop to check whether the plugin was installed.",
						log: status.log
					};
					if (!isTerminalInstallState(status.state)) return {
						kind: "running",
						installId: state.installId,
						log: status.log,
						phase: phaseOf(status.state)
					};
					if (status.state === "done") return {
						kind: "done",
						activation: status.activation ?? "restart",
						log: status.log,
						...status.restartReason !== void 0 ? { restartReason: status.restartReason } : {},
						...status.detail !== void 0 ? { detail: status.detail } : {}
					};
					return {
						kind: "failed",
						detail: status.detail ?? "",
						log: status.log,
						...status.command !== void 0 ? { command: status.command } : {}
					};
				}
			}
		}
		/**
		* Which order the shelf is in (design 2026-10-12-shelf-orders). `stars` is
		* the default AND the tie-break of both date orders, so the two date orders
		* are stable re-sorts of it rather than orders with comparators of their own.
		*/
		const SHELF_ORDER_KEYS = {
			stars: "sortStars",
			added: "sortAdded",
			updated: "sortUpdated"
		};
		/** The three orders in display order (map insertion order). `readonly`: this
		* is a shared vocabulary, and an order list a caller can push to is a bug
		* waiting for its second caller. */
		const SHELF_ORDERS = Object.keys(SHELF_ORDER_KEYS);
		/** The locale key naming one order (the toggle's buttons). */
		function shelfOrderLocaleKey(order) {
			return SHELF_ORDER_KEYS[order];
		}
		const CATEGORY_KEYS = {
			tool: "categoryTool",
			provider: "categoryProvider",
			ui: "categoryUi",
			workflow: "categoryWorkflow",
			integration: "categoryIntegration",
			theme: "categoryTheme",
			other: "categoryOther"
		};
		/** The locale key for one entry's category — derived entries read as `other`
		* (§6.1: a derived listing has no declared category). */
		function categoryKey(entry) {
			return CATEGORY_KEYS[entry.catalog?.category ?? "other"];
		}
		/** The seven categories in display order (map insertion order). */
		const CATEGORY_ORDER = Object.keys(CATEGORY_KEYS);
		/** The locale key for one bare category value (the filter buttons). */
		function categoryLocaleKey(category) {
			return CATEGORY_KEYS[category];
		}
		/**
		* The npm package page for one entry, or null when there is none to link.
		*
		* The name is untrusted catalog input and this CONSTRUCTS a URL from it, so
		* only a name inside the npm grammar gets a link — one optional `@scope/`
		* segment, then a name, both limited to npm's own character set. Every
		* character that survives that check is already safe in a URL path, so the
		* value is used verbatim: percent-encoding it would only mangle the `@` and
		* the scope separator that npm's own URLs carry literally. Anything else —
		* a traversal, a query, a whole URL smuggled in as a name — answers null and
		* the row renders as plain text, the same rule the repository row applies.
		*
		* A github entry answers null: it is installed from a repo and has no npm
		* package page.
		*/
		/**
		* Whether this entry has a GitHub home the reader could go and inspect.
		*
		* True for a github-source entry — a repository IS its identity — and for an
		* npm entry whose `repository` points at github.com, which is 4892 of the
		* live catalog's 4915 entries. The mark is therefore ordinary and its
		* ABSENCE is the signal: a listed package with no public source to read.
		*
		* `repository` is untrusted catalog input, so the host is PARSED rather than
		* pattern-matched — `evil-github.com` and `github.com.evil.test` both end in
		* the string and neither is GitHub. An unparseable or empty value (two live
		* entries carry one) is simply not a GitHub home.
		*/
		function hasGithubHome(entry) {
			if (entry.source === "github") return true;
			if (entry.repository === null) return false;
			try {
				const host = new URL(entry.repository).hostname.toLowerCase();
				return host === "github.com" || host === "www.github.com";
			} catch {
				return false;
			}
		}
		/**
		* Who put this entry where it is — the fact a reader wants when two listings
		* carry the same text from different hands.
		*
		* The two sources answer it differently and neither is npm's `author` field:
		* that one is free text the publisher writes, and a clone inherits it
		* verbatim. An npm entry answers with the account npm recorded for the
		* version (`publisher`); a github entry answers with its repository owner,
		* which is already half of the `owner/slug` that IS its identity — so nothing
		* new has to be harvested or emitted for it.
		*
		* `repo` reaches the client as an unvalidated string, so the owner is taken
		* only from a value that really is `owner/slug` with an owner GitHub would
		* accept (1-39 chars of alphanumerics and hyphens). Anything else yields
		* null: a misleading fragment is worse than saying nothing, the same rule
		* npmPageUrl applies to a package name.
		*/
		function authorOf(entry) {
			if (entry.source === "github") {
				if (entry.repo === void 0) return null;
				return /^([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/[^/]+$/.exec(entry.repo)?.[1] ?? null;
			}
			return entry.publisher ?? null;
		}
		function npmPageUrl(entry) {
			if (entry.source !== "npm") return null;
			return npmPackageUrl(entry.name);
		}
		/** The npm page of one package name, or null when the name is not one npm
		* could have. The validation lives here, once, because both the entry's own
		* link and the update row's version link build the same path from a name that
		* is untrusted on one of them (`ShopInstalledEntry.name` is a profile
		* manifest key).
		*/
		function npmPackageUrl(name) {
			if (name.length === 0 || name.length > 214) return null;
			if (!/^(@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+$/.test(name)) return null;
			if (name.split("/").some((segment) => segment === "." || segment === ".." || segment === "@")) return null;
			return `https://www.npmjs.com/package/${name}`;
		}
		/** A GitHub `owner/slug`: letters, digits, dot, dash, underscore, one slash. */
		const GITHUB_REPO = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
		/** Whether `repo` is a GitHub identity this code will put in a URL path. The
		* grammar alone admits `.` and `..`, which the URL parser then reads as path
		* segments — the same hole `npmPageUrl` closes on the npm side. */
		function isGithubRepo(repo) {
			return GITHUB_REPO.test(repo) && repo.split("/").every((segment) => segment !== "." && segment !== "..");
		}
		/**
		* The GitHub `owner/slug` a plugin's repository lives on, from either the
		* entry's `repo` (a github source holds it directly) or its `repository` URL
		* (an npm source holds a URL), or null when neither names one this code will
		* put in a URL path (design 2026-11-05-failure-report.md §1).
		*
		* The URL forms npm actually sees are handled: `https://github.com/o/s`,
		* `git+https://…`, `git@github.com:o/s.git` and the `github:o/s` shorthand.
		* Everything else — a GitLab URL, a shorthand that names another host — is
		* null rather than a guess: an issue filed on the wrong repository is worse
		* than no link.
		*/
		function githubSlugOf(repo, repository) {
			if (repo !== null && repo !== void 0 && isGithubRepo(repo)) return repo;
			if (repository === null || repository === void 0) return null;
			const text = repository.trim();
			if (text === "" || text.length > 512) return null;
			const shorthand = /^github:([A-Za-z0-9._-]+\/[A-Za-z0-9._-]+?)(?:\.git)?$/.exec(text);
			if (shorthand !== null) {
				const slug = shorthand[1] ?? "";
				return isGithubRepo(slug) ? slug : null;
			}
			const scp = /^(?:ssh:\/\/)?git@github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(text);
			if (scp !== null) {
				const slug = scp[1] ?? "";
				return isGithubRepo(slug) ? slug : null;
			}
			let url;
			try {
				url = new URL(text.replace(/^git\+/, ""));
			} catch {
				return null;
			}
			if (url.hostname !== "github.com") return null;
			const path = url.pathname.replace(/^\/+/, "").replace(/\/+$/, "").replace(/\.git$/, "");
			return isGithubRepo(path) ? path : null;
		}
		/**
		* How much of a failure a prefilled issue carries. The body is a URL query
		* parameter, and a browser or proxy cuts one off somewhere past a few
		* kilobytes; the last lines of a log are the interesting ones, and the first
		* are the ones a reporter can scroll back for.
		*/
		const REPORT_DETAIL_MAX = 1200;
		const REPORT_LOG_MAX = 1500;
		/** The longest the body may be once URL-encoded, which is what a link pays. */
		const REPORT_ENCODED_MAX = 6e3;
		/** ANSI colour and cursor sequences: a rendered log never shows them, and a
		* pasted issue should not either. */
		const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g;
		/**
		* A prefilled GitHub issue against the plugin's own repository, or null when
		* no honest one can be built (design 2026-11-05-failure-report.md §1).
		*
		* The shop fills in what it knows and says so in the first line, so a
		* reporter is not handed a form that pretends to be complete. It never
		* claims a harness version it does not have: the author asks for
		* `dsh --version` in their template, and a wrong one would send the report
		* down the wrong path.
		*/
		function failureReportUrl(input) {
			if (input.repo === null || !isGithubRepo(input.repo)) return null;
			const keepStart = (text, max) => text.length <= max ? text : `${text.slice(0, max).trimEnd()} … (truncated)`;
			const keepEnd = (text, max) => text.length <= max ? text : `… (truncated; the full log is in the shop)\n${text.slice(text.length - max).trimStart()}`;
			const logSource = input.log.join("\n").replace(ANSI, "").split("\n").filter((line) => line !== "").slice(-20).join("\n");
			const detailSource = input.detail.replace(ANSI, "").trim();
			const verb = input.verb === "update" ? "Update" : "Install";
			let detailMax = REPORT_DETAIL_MAX;
			let logMax = REPORT_LOG_MAX;
			const compose = () => [
				"<!-- The shop filled in what it knows. Edit anything that is wrong. -->",
				"",
				"### What I did",
				`\`${verb}\` \`${input.name}@${input.version}\` from ${input.source}, through the shop.`,
				"",
				"### What happened",
				detailSource === "" ? "(the shop recorded no detail)" : keepStart(detailSource, detailMax),
				"",
				"### Log",
				"```",
				keepEnd(logSource, logMax),
				"```",
				"",
				"### Environment",
				`- dsh-plugin-shop: ${input.shopVersion ?? "unknown"}`,
				"- dsh: <!-- paste the output of `dsh --version` -->"
			].join("\n");
			let body = compose();
			while (encodeURIComponent(body).length > REPORT_ENCODED_MAX) {
				const logShown = Math.min(logMax, logSource.length);
				const detailShown = Math.min(detailMax, detailSource.length);
				if (logShown === 0 && detailShown === 0) break;
				if (logShown >= detailShown) logMax = Math.floor(logShown * .8);
				else detailMax = Math.floor(detailShown * .8);
				body = compose();
			}
			const title = `${verb} failed: ${input.name}@${input.version}`;
			return `https://github.com/${input.repo}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
		}
		/** A version segment safe to put in one URL path piece. */
		const URL_VERSION = /^[A-Za-z0-9._+-]{1,256}$/;
		/**
		* Where an update's changes can be read, or null when no link can be built
		* honestly (design 2026-11-02-market-borrowings §4).
		*
		* Built from the installed row alone, never from `entry.repository`: that
		* field is author-declared text and is not the install source, so a link made
		* from it could send a reader to a repository that serves different code.
		* `row.repo` is the catalog's own github identity, the thing that installed.
		*
		* - npm: the npm page of the target version, which lists its own release
		*   notes when the author wrote them, and its publication date either way.
		* - github commit to commit: the compare view, which is the diff itself.
		* - anything else on github (a release tag, or a value that is not a commit):
		*   the repository's releases, which exists even when no release does.
		*/
		function whatChangedUrl(row) {
			if (row.source === "npm") {
				const base = npmPackageUrl(row.name);
				if (base === null || !URL_VERSION.test(row.latest)) return null;
				return `${base}/v/${row.latest}`;
			}
			if (row.repo === void 0 || !isGithubRepo(row.repo)) return null;
			if (COMMIT_PIN.test(row.installed) && COMMIT_PIN.test(row.latest)) return `https://github.com/${row.repo}/compare/${row.installed}...${row.latest}`;
			if (COMMIT_PIN.test(row.latest)) return `https://github.com/${row.repo}/commit/${row.latest}`;
			if (URL_VERSION.test(row.latest)) return `https://github.com/${row.repo}/releases/tag/${row.latest}`;
			return `https://github.com/${row.repo}/releases`;
		}
		/**
		* One entry's install identity — the value the catalog guarantees unique, and
		* therefore the only safe React key for a shelf card.
		*
		* `name` is NOT unique. The catalog's uniqueness invariant is the install
		* identity (registry `emit.ts` assertCatalogInvariants): `npm:<name>` for an
		* npm entry, `github:<repo>#<subdir>` for a repo one — so two GitHub
		* repositories publishing the same `package.json` name are two legitimate
		* entries under one name, as are two subpackages of one monorepo. How many
		* such names the catalog holds is kept in ONE place — `validateInstall`'s
		* docstring in host/install.ts, with the way to re-derive it — because the
		* copy that stood here had drifted to less than half the real figure.
		*
		* Keying the shelf by name handed React duplicate keys, and React could then
		* no longer match a card to its DOM node: changing the filter left every
		* duplicate orphaned on the page — hundreds of stale cards from the previous
		* category, accumulating with each switch until the tab stopped responding.
		* This mirrors the registry's identity verbatim; the two must not drift.
		*/
		function entryKey(entry) {
			return identityKey(entry);
		}
		/**
		* Whether the shelf lists `entry`: a name the catalog's `notAShop` clears,
		* or one whose name and repository `isShopLike` leaves alone. One rule for
		* the shelf and for the Plugins page's "View in Plugin shop" (design
		* 2026-10-16-shop-sidebar-page §7), so that button never sends a reader to a
		* shelf that hides the plugin.
		*/
		function listedOnShelf(entry, cleared) {
			return cleared.has(entry.name) || !isShopLike(entry.name) && (entry.repo === void 0 || !isShopLike(entry.repo));
		}
		/**
		* An entry's icon as the catalog's data URL, or undefined to draw the default:
		* it declares none, the catalog predates the icons file, or the sidecar
		* degraded and the map does not carry its sha256. The map is keyed by 64-hex
		* sha256, so no name from the catalog is ever used as a lookup here (design
		* 2026-10-23-shop-plugin-icons §7).
		*/
		function iconOf(entry, icons) {
			const sha = entry?.icon;
			if (sha === void 0) return void 0;
			return Object.hasOwn(icons, sha) ? icons[sha] : void 0;
		}
		/**
		* One entry's star count from the sidecar, or undefined when it has none.
		*
		* The sidecar keys a github entry by its repo full name and an npm entry by
		* its package name — two disjoint keyspaces (registry `stars-assemble.ts`).
		* Every reader must go through this one function: the card read the repo key
		* and the shelf sort read the name, so for 2202 of the live catalog's 2210
		* github listings the number deciding a row's position was not the number
		* printed on it. 1590 of them sorted as unstarred — a 4014-star plugin at the
		* bottom of the shelf — and where an unrelated npm package happened to share
		* a listed entry's name, its stars ranked that entry instead: a 1-star
		* plugin held the first page on 13960 stars belonging to another project's
		* repo, one the catalog never even listed.
		*/
		function starsOf(entry, stars) {
			const key = entry.repo ?? entry.name;
			if (!Object.hasOwn(stars, key)) return void 0;
			return stars[key];
		}
		/** One collator for the whole shelf. Passing an options object to
		* localeCompare creates a collator per comparison, which dominates the sort
		* for a catalog with thousands of entries. */
		const NAME_COLLATOR = new Intl.Collator(void 0, { sensitivity: "base" });
		/** Sort the shelf: stars descending, un-starred entries last, name ascending
		* (case-insensitive) on ties (spec 2026-08-26-github-stars-design.md D1).
		* Display-time only — the catalog's own name sort is untouched. */
		function sortByStars(entries, stars) {
			const count = (e) => starsOf(e, stars) ?? -1;
			return [...entries].sort((a, b) => {
				const byStars = count(b) - count(a);
				if (byStars !== 0) return byStars;
				return NAME_COLLATOR.compare(a.name, b.name);
			});
		}
		/** The day form the registry writes into `added` (`emit.ts` E9 enforces it
		* on every build on its side; a catalog is untrusted input on this side). */
		const DAY_FORM = /^\d{4}-\d{2}-\d{2}$/;
		/**
		* The ES date-time form WITH an explicit zone. The zone is required, and not
		* for tidiness: a date-time string with no zone is parsed as LOCAL time, so
		* accepting one would make the shelf's order depend on the machine.
		*/
		const INSTANT_FORM = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/;
		/**
		* One date string as milliseconds, or undefined when it cannot be trusted.
		*
		* The form is checked BEFORE `Date.parse`, and that order is load-bearing:
		* V8 answers a real instant for `2026-02-31T00:00:00Z` (3 March) and for
		* `October 12` (a 2001 date), so `Date.parse` alone is not a validity test.
		*/
		function parseForm(value, form) {
			if (typeof value !== "string" || !form.test(value)) return void 0;
			const ms = Date.parse(value);
			return Number.isNaN(ms) ? void 0 : ms;
		}
		/** `shelfTime` with the catalog's build time already parsed, for the n calls
		* `orderShelf` makes in one pass. */
		function timeOf(entry, order, built) {
			if (order === "stars") return void 0;
			const ms = order === "added" ? parseForm(entry.added, DAY_FORM) : parseForm(entry.publishedAt, INSTANT_FORM);
			if (ms === void 0 || built === void 0 || ms > built) return void 0;
			return ms;
		}
		/**
		* The entry's sort key under a date order, or undefined when it has no usable
		* date (design §3): absent, off-form, unparseable, or later than the catalog's
		* own `builtAt`. Milliseconds since the epoch. `'stars'` carries no date, so
		* this answers undefined for it.
		*/
		function shelfTime(entry, order, builtAt) {
			return timeOf(entry, order, parseForm(builtAt, INSTANT_FORM));
		}
		/**
		* A UTC calendar day for display: "2026-10-12". Derived from the instant the
		* sort ranked by, so a card's label and its position cannot disagree. UTC and
		* never a local getter: a reader in UTC+8 must see the same days the catalog
		* was built in, the calendar the stats row already prints.
		*/
		function utcDay(ms) {
			return new Date(ms).toISOString().slice(0, 10);
		}
		/**
		* The shelf in `order` (design 2026-10-12-shelf-orders §2, §5). `'stars'`
		* returns the array it was handed, so the default path allocates nothing and
		* does not invalidate the memos downstream of it.
		*
		* Each key is computed ONCE per entry rather than inside the comparator, and
		* the sort is stable (ES2019), so entries sharing a date keep the star order
		* they arrived in — which is how the tie-break is defined without a second
		* comparator that could drift from `sortByStars`.
		*/
		function orderShelf(starOrdered, order, builtAt) {
			if (order === "stars") return starOrdered;
			const built = parseForm(builtAt, INSTANT_FORM);
			const keyed = starOrdered.map((entry) => ({
				entry,
				time: timeOf(entry, order, built)
			}));
			keyed.sort((a, b) => {
				if (a.time === void 0) return b.time === void 0 ? 0 : 1;
				if (b.time === void 0) return -1;
				return b.time - a.time;
			});
			return keyed.map((item) => item.entry);
		}
		/** 999 → "999"; 1000 → "1k"; 1234 → "1.2k"; 1500 → "1.5k"; 99999 → "100k". */
		function formatStars(n) {
			if (n < 1e3) return String(n);
			return `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}k`;
		}
		/**
		* One entry's on-disk size as a label: 0 → "0 B", 812 → "812 B",
		* 25283 → "25.3 kB", 847407 → "847.4 kB", 179562863 → "179.6 MB".
		*
		* Decimal kB/MB, not KiB/MiB, because on the npm side the number IS npm's
		* `dist.unpackedSize` and npm's own package page shows it decimal — a reader
		* comparing the shelf against npmjs.com must not find two different figures
		* for one package. A github figure is a different measurement (its git tree's
		* blobs) but not a different unit, so one rule serves both. One fractional
		* digit at every magnitude above a kilobyte, the same rule `formatStars`
		* follows: a column of sizes is read by comparing them down the shelf, and
		* switching precision by magnitude makes that column ragged for no gain.
		*
		* Locale-free by construction (`toFixed`, not `toLocaleString`): the shelf's
		* two languages must not disagree about what a size is, and a decimal comma
		* in one of them would read as a thousands separator in the other.
		*
		* Undefined in, undefined out — an npm publish predating npm 5.6, or an entry
		* the registry could not measure honestly (`tree-size.ts` enumerates each way
		* that happens), and the card renders no label rather than a guess. The caller
		* need not check first.
		*
		* This once read "a github entry", which was true only while the shelf read
		* `unpackedSize` alone. It is not a source distinction any more: every live
		* github entry carries an `installSize`, and the sizeless count the build
		* report prints is owned by `emit.ts` — read it there rather than from a copy
		* here, because it tracks the daily build.
		*/
		function formatSize(bytes) {
			if (bytes === void 0) return void 0;
			if (bytes < 1e3) return `${bytes} B`;
			let value = bytes;
			let unit = "B";
			for (const next of [
				"kB",
				"MB",
				"GB"
			]) {
				if (Number(value.toFixed(1)) < 1e3) break;
				value /= 1e3;
				unit = next;
			}
			return `${value.toFixed(1)} ${unit}`;
		}
		//#endregion
		//#region src/client/flow-registry.ts
		/** The one idle view, so a key the registry holds no flow for and a key it
		* reset to idle hand a memoized consumer the same object. */
		const IDLE_VIEW = { kind: "idle" };
		/** `map` without every entry `drop` selects, or null when it selects none.
		* The copy is made at the first match, so a prune that matches nothing
		* copies nothing, and its caller, handed null, publishes nothing. The
		* registry's `resetWhere` and the page store's owed notices share this
		* contract, so a fourth prune cannot return an empty map instead. */
		function pruned(map, drop) {
			let next = null;
			for (const [key, value] of map) {
				if (!drop(value, key)) continue;
				next ??= new Map(map);
				next.delete(key);
			}
			return next;
		}
		/**
		* @param deps read on every call, so an owner can hand over its latest
		*   functions without rebuilding the registry.
		*/
		function createFlowRegistry(deps, options) {
			let snapshot = {
				views: /* @__PURE__ */ new Map(),
				starting: /* @__PURE__ */ new Set()
			};
			const listeners = /* @__PURE__ */ new Set();
			const startedWith = /* @__PURE__ */ new Map();
			let timer = null;
			let disposed = false;
			const syncTimer = () => {
				const wanted = !disposed && (options.pollUnwatched || listeners.size > 0) && [...snapshot.views.values()].some((view) => view.kind === "running");
				if (wanted && timer === null) timer = setInterval(poll, INSTALL_POLL_MS);
				else if (!wanted && timer !== null) {
					clearInterval(timer);
					timer = null;
				}
			};
			const publish = (next) => {
				if (disposed) return;
				snapshot = next;
				syncTimer();
				notify(listeners);
			};
			const withView = (key, view) => {
				const views = new Map(snapshot.views);
				views.set(key, view);
				return views;
			};
			let asked = 0;
			const folded = /* @__PURE__ */ new Map();
			function poll() {
				for (const [key, view] of snapshot.views) {
					if (view.kind !== "running") continue;
					const { installId } = view;
					asked += 1;
					const number = asked;
					deps().installStatus({ installId }).then((status) => {
						const current = snapshot.views.get(key);
						if (disposed || current === void 0 || current.kind !== "running" || current.installId !== installId) return;
						if (number <= (folded.get(key) ?? 0)) return;
						folded.set(key, number);
						const next = reduceInstall(current, {
							type: "status",
							status
						});
						if (next !== current) publish({
							views: withView(key, next),
							starting: snapshot.starting
						});
						if (next.kind === "running") return;
						folded.delete(key);
						const args = startedWith.get(key);
						startedWith.delete(key);
						if (status.found && isTerminalInstallState(status.state) && args !== void 0) deps().onSettled?.(key, status.state, args);
					}, () => {});
				}
			}
			return {
				getSnapshot: () => snapshot,
				subscribe: (listener) => {
					const unlisten = listen(listeners, listener);
					syncTimer();
					return () => {
						unlisten();
						syncTimer();
					};
				},
				start: async (key, args) => {
					if (disposed || snapshot.starting.has(key)) return;
					startedWith.set(key, args);
					folded.delete(key);
					publish({
						views: withView(key, IDLE_VIEW),
						starting: new Set(snapshot.starting).add(key)
					});
					try {
						const view = await deps().begin(args);
						if (view.kind !== "running") startedWith.delete(key);
						publish({
							views: withView(key, view),
							starting: snapshot.starting
						});
					} finally {
						if (snapshot.starting.has(key)) {
							const starting = new Set(snapshot.starting);
							starting.delete(key);
							publish({
								views: snapshot.views,
								starting
							});
						}
					}
				},
				reset: (key) => {
					if (!snapshot.starting.has(key)) startedWith.delete(key);
					folded.delete(key);
					if (!snapshot.views.has(key)) return;
					const views = new Map(snapshot.views);
					views.delete(key);
					publish({
						views,
						starting: snapshot.starting
					});
				},
				resetWhere: (predicate) => {
					const views = pruned(snapshot.views, predicate);
					if (views === null) return;
					for (const key of snapshot.views.keys()) {
						if (views.has(key)) continue;
						folded.delete(key);
						if (!snapshot.starting.has(key)) startedWith.delete(key);
					}
					publish({
						views,
						starting: snapshot.starting
					});
				},
				dispose: () => {
					disposed = true;
					startedWith.clear();
					folded.clear();
					forget(listeners);
					syncTimer();
				}
			};
		}
		/** The transport rule the three mappings share: a thrown start is a TRANSPORT
		* failure (index.ts's `unwrap` throws the prefixed wire code and message), not a
		* business rejection — `rejected` stays reserved for the host's ShopInstallResult
		* union (§7.2). The transport detail is private (it can name hosts and ports) and
		* never rendered, so the view carries an EMPTY detail and the surface falls back
		* to its localized transport line. Nothing else can reach these catches, because
		* every business union is a resolved value, never a throw. */
		const transportFailed = () => ({
			kind: "failed",
			detail: "",
			log: []
		});
		/** An install's start: the host's business union mapped to the first view. */
		function beginInstall(install) {
			return async (args) => {
				try {
					const result = await install(args);
					if (!result.ok) return {
						kind: "rejected",
						code: result.code,
						detail: result.detail
					};
					return {
						kind: "running",
						installId: result.installId,
						log: [],
						phase: phaseOf(result.state)
					};
				} catch {
					return transportFailed();
				}
			};
		}
		/** A business start: the uninstall's and the shop's own update's. Its
		* refusal is a `failed` view with the host's published detail, never an
		* install `rejected` code: those belong to the install gate, and these
		* unions' refusals carry none. A throw is the transport rule above. The two
		* starts differ only in the phase they open on, which is `phaseFor`. */
		function beginBusiness(rpc, phaseFor) {
			return async (args) => {
				try {
					const result = await rpc(args);
					if (!result.ok) return {
						kind: "failed",
						detail: result.detail,
						log: []
					};
					return {
						kind: "running",
						installId: result.installId,
						log: [],
						phase: phaseFor(result)
					};
				} catch {
					return transportFailed();
				}
			};
		}
		/** An uninstall's start. Its refusals: not in the catalog, not installed.
		* The host reports no phase for an uninstall, which opens on `installing`. */
		function beginUninstall(uninstall) {
			return beginBusiness(uninstall, () => "installing");
		}
		/** The shop's own update's start. Its refusals: a version that is not plain
		* semver, and the desktop profile, whose update belongs to dsh's Plugins
		* page. The flow shows the host's own detail for either and never needs
		* `code`: the version row does not offer this start on that profile. */
		function beginUpdate(updateStart) {
			return beginBusiness(async (args) => {
				const result = await updateStart(args);
				return result.ok ? result : {
					ok: false,
					detail: result.detail
				};
			}, (started) => phaseOf(started.state));
		}
		//#endregion
		//#region src/client/restart-monitor.ts
		/** Registry symbol, so every module instance on the page finds the same store. */
		const STORE_KEY$1 = Symbol.for("dsh-plugin-shop.restart-monitor");
		function monitorStore() {
			const page = globalThis;
			let stored = page[STORE_KEY$1];
			if (stored === void 0) {
				stored = {
					state: null,
					listeners: /* @__PURE__ */ new Set(),
					stop: null
				};
				page[STORE_KEY$1] = stored;
			}
			return Object.assign(stored, {
				carriers: stored.carriers ?? [],
				attempt: stored.attempt ?? null
			});
		}
		/**
		* Whether a shop instance on this page has registered its restart path:
		* every `apply` since 0.8.4 does so before anything can ask for a restart.
		* Read before this instance's own `apply` registers one, a store here names
		* a predecessor — a 0.8.x shop when no page store sits beside it
		* (page-store.ts `readPredecessor`; design 2026-10-16-shop-sidebar-page §6).
		* The store outlives a carrier's withdrawal: a predecessor's teardown
		* withdraws its carrier and leaves the store, and the store is what names it.
		* Only a read: unlike `monitorStore`, it never creates the store.
		*/
		function hasRestartMonitorStore() {
			return globalThis[STORE_KEY$1] !== void 0;
		}
		function settle(store, state) {
			store.state = state;
			notify(store.listeners);
		}
		/** sessionStorage key of the restart this tab last saw committed. Not the
		* page store: the verdict belongs to the page the reload produces, and a
		* reload clears `globalThis`. Not localStorage: it is this tab's restart, and
		* another tab never asked for it. */
		const RECORD_KEY = "dsh-plugin-shop.restart";
		function writeRecord(record) {
			try {
				globalThis.sessionStorage.setItem(RECORD_KEY, JSON.stringify(record));
			} catch {}
		}
		/** The record, or null when there is none this module could have written.
		* Every plugin on the origin shares the tab's sessionStorage, and the pid is
		* rendered into a command the reader is told to run, so each field is
		* checked again on the way back in. */
		function readRecord() {
			let raw;
			try {
				raw = globalThis.sessionStorage.getItem(RECORD_KEY);
			} catch {
				return null;
			}
			if (raw === null) return null;
			let parsed;
			try {
				parsed = JSON.parse(raw);
			} catch {
				return null;
			}
			if (typeof parsed !== "object" || parsed === null) return null;
			const { bootId, pid, logFile } = parsed;
			if (typeof bootId !== "string") return null;
			return {
				bootId,
				...typeof pid === "number" && Number.isSafeInteger(pid) && pid > 0 ? { pid } : {},
				...typeof logFile === "string" ? { logFile } : {}
			};
		}
		function forgetRecord() {
			try {
				globalThis.sessionStorage.removeItem(RECORD_KEY);
			} catch {}
		}
		/** The page's restart, or null when it has committed none. The same object
		* until the state changes, as `useSyncExternalStore` requires. */
		function readRestartMonitor() {
			return monitorStore().state;
		}
		/** Be told when the page's restart changes state. */
		function subscribeRestartMonitor(listener) {
			return listen(monitorStore().listeners, listener);
		}
		/**
		* Watch the origin for the restarted server and reload into it: probe once
		* the grace period is over (the host exits within it, so an answer is the NEW
		* server), and reload only after it has KEPT answering for the stable window.
		* A boot that is about to fail can bind the port and answer before its plugin
		* tree is audited and it exits; reloading on that one answer left the reader
		* on a blank page instead of the notice naming the log (design
		* 2026-09-26-market-borrowings §3). `restartMonitorVerdict` decides; this
		* loop only probes. Probes never overlap: each is scheduled one poll interval
		* after the previous one settled.
		*
		* A restart already being watched is left alone — every offer on the page
		* renders this state, so a second press can only come from a panel that has
		* not re-rendered yet, and a second loop would probe the same origin twice.
		*/
		function startRestartMonitor(options) {
			const store = monitorStore();
			if (store.state?.kind === "restarting") return;
			store.stop?.();
			const { reload, logFile, bootId, pid } = options;
			if (bootId !== void 0) writeRecord({
				bootId,
				...pid === void 0 ? {} : { pid },
				...logFile === void 0 ? {} : { logFile }
			});
			const started = Date.now();
			let stableSince = null;
			let stopped = false;
			let timer;
			const probe = async () => {
				if (Date.now() - started >= 3e3) {
					let up = false;
					try {
						up = (await fetch(globalThis.location.href, { cache: "no-store" })).ok;
					} catch {}
					if (stopped) return;
					const elapsed = Date.now() - started;
					stableSince = up ? stableSince ?? elapsed : null;
					const verdict = restartMonitorVerdict({
						elapsedMs: elapsed,
						stableSinceMs: stableSince
					});
					if (verdict === "reload") {
						store.stop = null;
						reload();
						return;
					}
					if (verdict === "failed") {
						store.stop = null;
						settle(store, logFile === void 0 ? { kind: "failed" } : {
							kind: "failed",
							logFile
						});
						return;
					}
				}
				timer = setTimeout(() => {
					probe();
				}, INSTALL_POLL_MS);
			};
			store.stop = () => {
				stopped = true;
				if (timer !== void 0) clearTimeout(timer);
			};
			timer = setTimeout(() => {
				probe();
			}, INSTALL_POLL_MS);
			settle(store, logFile === void 0 ? { kind: "restarting" } : {
				kind: "restarting",
				logFile
			});
		}
		/**
		* Register one module instance's path to the host; the client half's apply
		* does, with the `restart` it hands the tab. The returned function withdraws
		* it, and has to run BEFORE the mount it rides is disposed: a request still in
		* flight on it is then asked again through the newest live path — at once if
		* one is registered, or as soon as one is — rather than waiting on a call the
		* dispose is about to abort.
		*/
		function registerRestartCarrier(restart) {
			const store = monitorStore();
			const carrier = {
				restart,
				live: true
			};
			store.carriers.push(carrier);
			const attempt = store.attempt;
			if (attempt !== null && !attempt.carrier.live) ask(store, attempt, carrier);
			return () => {
				if (!carrier.live) return;
				carrier.live = false;
				const current = monitorStore();
				current.carriers = current.carriers.filter((each) => each !== carrier);
				const orphaned = current.attempt;
				const next = current.carriers.at(-1);
				if (orphaned !== null && orphaned.carrier === carrier && next !== void 0) ask(current, orphaned, next);
			};
		}
		/**
		* Ask the host to restart, for the page (design §8). The request is the
		* page's from the confirm on, not from the answer: every offer renders it as
		* under way, and a second press joins it rather than asking twice. It rides
		* the newest path a module instance registered, or — where no client half
		* registered one — the pressing tab's own `restart`.
		*
		* Resolves, never rejects, with what the press should show. A commit starts
		* the monitor and is `started`. A refusal and an unreachable host leave
		* nothing under way. A path withdrawn mid-call decides nothing but a commit;
		* the ask on the path that replaced it decides the rest, and that ask
		* finding no host is followed as a restart, since the first ask may have
		* committed and taken its host down with it.
		*/
		function requestRestart(options) {
			const store = monitorStore();
			if (store.state?.kind === "restarting") return Promise.resolve({ kind: "started" });
			return new Promise((resolve) => {
				const pending = store.attempt;
				if (pending !== null) {
					pending.waiters.push(resolve);
					return;
				}
				const carrier = store.carriers.at(-1) ?? {
					restart: options.restart,
					live: true
				};
				const attempt = {
					carrier,
					reload: options.reload,
					reissued: false,
					waiters: [resolve]
				};
				store.attempt = attempt;
				settle(store, { kind: "requesting" });
				ask(store, attempt, carrier);
			});
		}
		/** Carry the request on one path. Its answer decides only while the request
		* is still the page's and that path still carries it — a commit excepted. */
		function ask(store, attempt, carrier) {
			if (attempt.carrier !== carrier) {
				attempt.carrier = carrier;
				attempt.reissued = true;
			}
			(async () => carrier.restart())().then((result) => {
				if (store.attempt !== attempt) return;
				if (result.ok) {
					finish(store, attempt, { kind: "started" });
					startRestartMonitor({
						reload: attempt.reload,
						...typeof result.logFile === "string" ? { logFile: result.logFile } : {},
						...typeof result.bootId === "string" ? { bootId: result.bootId } : {},
						...typeof result.pid === "number" ? { pid: result.pid } : {}
					});
					return;
				}
				if (superseded(attempt, carrier)) return;
				finish(store, attempt, {
					kind: "refused",
					detail: result.detail
				});
				settle(store, null);
			}, () => {
				if (store.attempt !== attempt || superseded(attempt, carrier)) return;
				if (attempt.reissued) {
					finish(store, attempt, { kind: "started" });
					startRestartMonitor({ reload: attempt.reload });
					return;
				}
				finish(store, attempt, { kind: "unreachable" });
				settle(store, null);
			});
		}
		/** Whether a path's answer is one the request has moved past: the path was
		* withdrawn, so the dispose aborted it or the ask that replaced it decides. */
		function superseded(attempt, carrier) {
			return !carrier.live || attempt.carrier !== carrier;
		}
		function finish(store, attempt, outcome) {
			store.attempt = null;
			for (const waiter of attempt.waiters) waiter(outcome);
		}
		/**
		* Judge this tab's last committed restart by the process answering now. The
		* client half hands every `version()` answer here (index.ts), so the verdict
		* is made on the first answer a reloaded page receives, before any tab opens.
		*
		* The same boot as the one that committed is a restart that never happened:
		* the page says so, naming that process, for as long as it keeps answering
		* — across reloads too, since the record stays. Any other answer, an older
		* host's included, is a process that replaced it, and the record is spent.
		* Nothing is judged while this page's own restart is under way: the process
		* that committed answers until it exits, two seconds later.
		*/
		function noteBoot(bootId) {
			const store = monitorStore();
			if (store.state?.kind === "requesting" || store.state?.kind === "restarting") return;
			const record = readRecord();
			if (record === null) return;
			if (record.bootId === bootId) {
				if (store.state?.kind !== "not-restarted") settle(store, {
					kind: "not-restarted",
					...record.pid === void 0 ? {} : { pid: record.pid },
					...record.logFile === void 0 ? {} : { logFile: record.logFile }
				});
				return;
			}
			forgetRecord();
			if (store.state?.kind === "not-restarted") settle(store, null);
		}
		//#endregion
		//#region src/client/page-store.ts
		/** The owed map's key for one switch: `<surface>:<identity>`. */
		function switchKey(surface, identity) {
			return `${surface}:${identity}`;
		}
		/** The identity a switch key names. A surface holds no colon, so it is
		* everything after the first. */
		const identityOf = (key) => key.slice(key.indexOf(":") + 1);
		/** Selects `key`'s receipt: its view, unless that is a flow still running.
		* A running flow settles by its own poll, and resetting it would drop every
		* later answer for it — its settle with them. */
		const receiptOf = (key) => (view, each) => each === key && view.kind !== "running";
		/** The shelf a page opens on: the star order, every category, one batch. */
		const INITIAL_VIEW = {
			query: "",
			category: null,
			order: "stars",
			hideIncompatible: false,
			favoritesOnly: false,
			visibleCount: 48
		};
		/** Whether going from one view to the other changes which cards the shelf
		* shows, or their order. Growing the shelf and opening a card change
		* neither. */
		function reshelves(before, after) {
			return before.query !== after.query || before.category !== after.category || before.order !== after.order || before.hideIncompatible !== after.hideIncompatible || before.favoritesOnly !== after.favoritesOnly;
		}
		/**
		* @param deps read on every call, so the owner can hand over its latest
		*   functions without rebuilding the store.
		* @param options the page's own store polls unwatched; a store a tab builds
		*   for itself does not, and stops with the tab (ShopTab).
		*/
		function createPageStore(deps, options) {
			let snapshot = {
				view: INITIAL_VIEW,
				reverdictPending: false,
				reverdicts: 0,
				settled: 0
			};
			let scrollTop = 0;
			let scrollAnchor = null;
			let pageMounted = false;
			let handover = { showing: false };
			let disposed = false;
			const listeners = /* @__PURE__ */ new Set();
			const publish = (next) => {
				if (disposed) return;
				snapshot = {
					...snapshot,
					...next
				};
				notify(listeners);
			};
			/** The view with `patch` applied, published only when it differs: the
			* view's fields are primitives, so a field-by-field compare is the
			* whole question. One that refilters or reorders the shelf forgets the
			* card the reader was at: the restore then sets the position, which is
			* what the reader last saw, and their next scroll writes a card again. */
			const showView = (patch) => {
				const view = {
					...snapshot.view,
					...patch
				};
				if (Object.keys(view).every((field) => view[field] === snapshot.view[field])) return;
				if (reshelves(snapshot.view, view)) scrollAnchor = null;
				publish({ view });
			};
			let expanded = /* @__PURE__ */ new Set();
			const expandedListeners = /* @__PURE__ */ new Set();
			const publishExpanded = (next) => {
				if (disposed) return;
				expanded = next;
				notify(expandedListeners);
			};
			/** Open one card, and leave it open: a card's own header toggles it, and
			* `expand` opens one from outside it (design
			* 2026-10-16-shop-sidebar-page §5.6). */
			const openCard = (key) => {
				if (!expanded.has(key)) publishExpanded(new Set(expanded).add(key));
			};
			let owed = /* @__PURE__ */ new Map();
			const owedListeners = /* @__PURE__ */ new Set();
			const publishOwed = (next) => {
				if (disposed) return;
				owed = next;
				notify(owedListeners);
			};
			/** A reverdict raised: pending, and counted. */
			const raisedReverdict = () => ({
				reverdictPending: true,
				reverdicts: snapshot.reverdicts + 1
			});
			/** One settle the page reacts to: re-read the installed list and, when the
			* catalog's verdicts may have moved, judge them again. */
			const settle = (reverdict) => {
				publish({
					settled: snapshot.settled + 1,
					...reverdict ? raisedReverdict() : {}
				});
			};
			/** The owed map without one notice kind, or null when it holds none of
			* them (`pruned`), so a caller publishes nothing for an unchanged map. */
			const withoutOwed = (kind) => pruned(owed, (value) => value === kind);
			/** The owed map without any switch of `identities`, on every surface, or
			* null when it holds none. */
			const withoutSwitchesOf = (identities) => pruned(owed, (_, key) => identities.has(identityOf(key)));
			let drops = 0;
			/** By identity: the stamp of the last drop because it left the profile. */
			const leftAt = /* @__PURE__ */ new Map();
			/** The identities the installed list a page last read held: the switches
			* on screen are theirs, and so is any toggle still out. */
			let listed = /* @__PURE__ */ new Set();
			/** `identities` left the profile: their switches owe nothing, and a toggle
			* of one still out re-creates nothing. */
			const leave = (identities) => {
				if (identities.size === 0) return;
				drops += 1;
				for (const identity of identities) leftAt.set(identity, drops);
				const next = withoutSwitchesOf(identities);
				if (next !== null) publishOwed(next);
			};
			const installs = createFlowRegistry(() => ({
				begin: beginInstall(deps().install),
				installStatus: deps().installStatus,
				onSettled: (key, outcome) => {
					if (outcome === "done") uninstalls.resetWhere(receiptOf(key));
					settle(outcome === "done");
				}
			}), options);
			const uninstalls = createFlowRegistry(() => ({
				begin: beginUninstall(deps().uninstall),
				installStatus: deps().installStatus,
				onSettled: (key, outcome, args) => {
					if (outcome !== "done") return;
					installs.resetWhere(receiptOf(key));
					leave(/* @__PURE__ */ new Set([key]));
					deps().noteUninstalled?.(args.name);
					settle(true);
				}
			}), options);
			const self = createFlowRegistry(() => ({
				begin: beginUpdate(deps().updateStart),
				installStatus: deps().installStatus
			}), options);
			return {
				schema: 1,
				installs,
				uninstalls,
				self,
				getSnapshot: () => snapshot,
				subscribe: (listener) => listen(listeners, listener),
				setView: (patch) => {
					showView(patch);
				},
				updateView: (update) => {
					showView(update(snapshot.view));
				},
				isExpanded: (key) => expanded.has(key),
				subscribeExpanded: (listener) => listen(expandedListeners, listener),
				toggleExpanded: (key) => {
					const next = new Set(expanded);
					if (!next.delete(key)) next.add(key);
					publishExpanded(next);
				},
				expand: openCard,
				focus: (name, card) => {
					scrollTop = 0;
					scrollAnchor = null;
					showView({
						query: name,
						category: null,
						hideIncompatible: false,
						favoritesOnly: false,
						visibleCount: 48
					});
					if (card !== null) openCard(card);
				},
				getOwed: (key) => owed.get(key),
				subscribeOwed: (listener) => listen(owedListeners, listener),
				owedEpoch: () => drops,
				setOwed: (key, notice, since) => {
					if ((leftAt.get(identityOf(key)) ?? 0) > since) return;
					const current = owed.get(key);
					if (current === "restart" || current === notice) return;
					publishOwed(new Map(owed).set(key, notice));
				},
				noteInstalled: (identities) => {
					const held = new Set(identities);
					const gone = /* @__PURE__ */ new Set();
					for (const identity of listed) if (!held.has(identity)) gone.add(identity);
					for (const key of owed.keys()) if (!held.has(identityOf(key))) gone.add(identityOf(key));
					listed = held;
					leave(gone);
				},
				clearReverdict: (asked) => {
					if (snapshot.reverdictPending && asked === snapshot.reverdicts) publish({ reverdictPending: false });
				},
				noteRestarted: () => {
					self.resetWhere(settledByRestart);
					installs.resetWhere(settledByRestart);
					uninstalls.resetWhere(settledByRestart);
					const next = withoutOwed("restart");
					if (next !== null) publishOwed(next);
					settle(true);
				},
				recordScroll: (top, anchor = null) => {
					scrollTop = top;
					scrollAnchor = anchor;
				},
				readScroll: () => scrollTop,
				readAnchor: () => scrollAnchor,
				notePageMounted: (mounted) => {
					pageMounted = mounted;
				},
				recordTeardown: () => {
					handover = { showing: pageMounted };
				},
				handover: () => handover,
				dispose: () => {
					disposed = true;
					installs.dispose();
					uninstalls.dispose();
					self.dispose();
					forget(listeners);
					forget(owedListeners);
					forget(expandedListeners);
				}
			};
		}
		/** Registry symbol, so every module instance on the page finds one store. */
		const STORE_KEY = Symbol.for("dsh-plugin-shop.page");
		function occupantOf(held) {
			if (held === void 0) return { kind: "none" };
			if (typeof held === "object" && held !== null && held.schema === 1) return {
				kind: "store",
				store: held
			};
			return {
				kind: "other",
				occupant: held
			};
		}
		/** What a shop applied earlier left on this page: nothing, a store of this
		* schema, or another schema's object. */
		function readPageStore() {
			return occupantOf(globalThis[STORE_KEY]);
		}
		/** Make `store` the page's. Returns what it replaces. */
		function installPageStore(store) {
			const page = globalThis;
			const previous = occupantOf(page[STORE_KEY]);
			page[STORE_KEY] = store;
			return previous;
		}
		/** Read at the very start of `apply`, before this instance puts its own
		* stores on the page. */
		function readPredecessor() {
			const previous = readPageStore();
			if (previous.kind === "none") return hasRestartMonitorStore() ? { kind: "section" } : { kind: "none" };
			if (previous.kind === "other") return {
				kind: "page",
				showing: false
			};
			if (typeof previous.store.handover !== "function") return { kind: "section" };
			return {
				kind: "page",
				showing: previous.store.handover().showing
			};
		}
		/** Stop what the page key held, through the `dispose` it has and no other:
		* an object that claims this schema and lacks one is stopped no more than a
		* schema-2 object is, and neither can throw the shop off the page. */
		function disposeOccupant(occupant) {
			if (occupant.kind === "none") return;
			const held = occupant.kind === "store" ? occupant.store : occupant.occupant;
			if (typeof held?.dispose === "function") held.dispose();
		}
		//#endregion
		//#region \0dsh-plugin-shop-css:61217181
		const css = "/* Shop styles — the shop's own page with its market shelf, and the shop's two\n * buttons on dsh's Plugins page. Every variable read here is a dsh theme\n * alias token (`--dsw-alias-*`), one of the shop's own properties declared in\n * this file (`--shop-*`, `--category-hue`, `--switch-hue`, `--track-hue`), or\n * one of two dsh variables outside the alias set, each read where the shop\n * copies dsh: `--dsh-frame-top-clearance`, so the page head clears the\n * desktop frame as dsh's own pages do, and `--dsw-radius-sm`, because the\n * Plugins page buttons copy dsh's Button (0.1.5-rc.3 lacks that token, and\n * has no Plugins page to draw them on). `state-error` and\n * `state-success` do not exist, so the state-*-primary set stands in for\n * them (measured 2026-10-17 on dsh 0.1.5-rc.3, 0.1.7-rc.2 and 0.2.0-rc.2,\n * which do define `bg-layer-3` and `interactive-bg-hover`, once listed here\n * as missing). The signature is the category spine: one HUE per\n * category (seven fixed hues, not the brand token — the brand resolves to\n * near-black in the light theme, so seven brand opacities read as seven\n * shades of gray), with the category name as the cover label in the same hue. Class names are mapped to content-derived names at bundle time\n * (tsdown.s931c3b_client.s821251_config.s739867_ts) and stubbed in tests; only the keys are relied\n * on.\n *\n * One token rule the theme forces: the background LAYERS do not carry\n * contrast. In the light theme bg-base, bg-layer-1, bg-layer-2 and\n * bg-layer-3 all resolve to the same white; only the dark theme spreads them\n * (950/875/850/800). So a layer-2 fill on a layer-1 ground is invisible for\n * half of all users, and anything whose fill is its ONLY affordance — the\n * loading skeleton, the borderless capability chips — derives its fill from\n * label-primary instead, which inverts with the theme by construction.\n * Elements that also carry a border or text may keep a layer fill.\n * `css-tokens.s931c3b_client.s6bd619_spec.s739867_ts` pins this. */\n\n.s620b40_panel {\n  display: flex;\n  flex-direction: column;\n  gap: 14px;\n  /* The shop's own width decides the shelf's arrangement (design\n   * 2026-11-02-shop-widescreen-layout §3). The container is this tab root,\n   * not `.s960683_shelfBody`: a container query cannot style its own container, and\n   * the rule that turns the shelf body into the rail's grid is exactly that.\n   * Inline size only — the panel's height still follows its content. */\n  container-type: inline-size;\n  /* The two reds every red text in this tab is painted with. dsh's error red\n   * is #ec1313 in the light theme, which measures 4.498:1 as text on white —\n   * a miss of two thousandths — and 3.57:1 on the badge's own 14% red fill\n   * (4.00:1 in dark). Mixing it toward label-primary fixes both, because\n   * label-primary is the theme's foreground pole: it darkens the red on light\n   * surfaces and lightens it on dark ones. Measured in the live app: 90% of\n   * the red is 5.30:1 on white and 5.29:1 on the dark card, and 80% is\n   * 4.98:1 on the badge's tint, 4.92:1 in dark. Computed: 90% is 6.14:1 on\n   * the dark page itself (#151517, `bg-base`), where the self-update's\n   * failure heading sits (4.69:1 on Settings' #2c2c2e, its ground through\n   * 0.8.7), and 80% is 5.23:1 on the uninstall button's 10% hover fill.\n   * Declared here, on the tab root, because a custom property inherits: one\n   * declaration reaches every red element, and a new one cannot be\n   * forgotten. */\n  --shop-error: color-mix(in srgb, var(--dsw-alias-state-error-primary) 90%, var(--dsw-alias-label-primary));\n  --shop-error-on-tint: color-mix(in srgb, var(--dsw-alias-state-error-primary) 80%, var(--dsw-alias-label-primary));\n  /* The amber and the green, mixed the same way for the same reason. dsh's\n   * warn #f59e0b and success #22c55e are one value in both themes and pass\n   * in the dark one, but as text on white they measure 2.15:1 and 2.28:1.\n   * Each derived colour keeps the largest multiple of ten of its hue that\n   * clears every surface it paints, as the reds do. Computed from the live\n   * tokens over every bg layer in both themes: amber at 60% is 4.95:1 on a\n   * plain surface but 4.44:1 on its own 14% tint, so text on an amber tint\n   * takes 50% (5.66:1); green at 60% is 5.18:1 plain and 4.60:1 on its 14%\n   * tint, so one green serves both. */\n  --shop-warn: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 60%, var(--dsw-alias-label-primary));\n  --shop-warn-on-tint: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 50%, var(--dsw-alias-label-primary));\n  --shop-success: color-mix(in srgb, var(--dsw-alias-state-success-primary) 60%, var(--dsw-alias-label-primary));\n  /* The favorite star's set colour. Deliberately NOT `--shop-warn`: that mix\n   * is tuned for text on a tint and reads as dark amber, while a 15 px glyph\n   * is a mark rather than a sentence — it wants the hue, kept bright. 70% is\n   * the brightest mix that still darkens with the light theme instead of\n   * glowing on white (a raw warn token is one value in both palettes). */\n  --shop-star: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 70%, var(--dsw-alias-label-primary));\n  /* The shelf never scrolls sideways: a card too wide for its track wraps\n   * its badges rather than widening the panel.\n   *\n   * Clipped on BOTH axes, with a margin, because `.sf47d01_searchInput` sits at\n   * exactly (0, 0) of this box — it is the first child of `.sfb0d90_toolbar`, itself\n   * the first child here, and this rule carries no padding — so its focus\n   * ring paints ENTIRELY outside the panel.\n   *\n   * Both axes is the load-bearing part: `overflow-clip-margin` is inert\n   * unless the element clips on both. Clipping x alone left the margin doing\n   * nothing — measured against the live app on 0.7.1, the ring reached 0 of\n   * its 3px on the left at every device pixel ratio (1, 1.25, 1.5, 2), while\n   * keeping the full 3px on the right, where the 280px input stops short of\n   * the panel and never meets the clip edge. Raising the margin to 6px\n   * changed nothing; clipping both axes with the SAME 3px restored the whole\n   * ring. A test that reads declarations cannot see that difference, which is\n   * why the first attempt at this shipped broken.\n   *\n   * `clip` is not a scroll container, so this does not bring back the\n   * accidental scrolling `hidden` caused by coercing the other axis to\n   * `auto`. Nothing is lost vertically: the panel's scrollHeight equals its\n   * height and no descendant paints outside the clip rect (measured).\n   * `overflow-x: hidden` stays as the fallback for engines without `clip`,\n   * where the ring is clipped as it was before, never worse. */\n  overflow-x: hidden;\n  overflow: clip;\n  overflow-clip-margin: 3px;\n}\n\n/* The shop's own page in dsh's main column (design\n * 2026-10-16-shop-sidebar-page §4.2), framed as dsh 0.2.0-rc.2 frames its\n * Plugins page — read from that page's stylesheet: the page is the scroll\n * container, its children one centred column (960px then; 1280 since the\n * 2026-11-02 wide layout), and the head clears the desktop title bar. One declaration is the shop's own, `color`:\n * dsh's `.s125266_page` inherits its colour from the shell around it, and the shop's\n * root is not inside dsh's panel stylesheet, so the shop's page states it. */\n.s125266_page {\n  box-sizing: border-box;\n  height: 100%;\n  overflow: auto;\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  gap: 32px;\n  padding: 0 clamp(24px, 4vw, 48px) 48px;\n  color: var(--dsw-alias-label-primary);\n}\n\n/* The head and the shelf share one column, and on 2026-11-02 that column\n * widened from 960 to 1280 so the wide arrangement has room for a rail\n * beside two cards (design 2026-11-02-shop-widescreen-layout §3). A head at\n * 960 over a body at 1280 would read as misaligned. */\n.s125266_page > * {\n  width: 100%;\n  max-width: min(1280px, 100%);\n}\n\n.s9c1070_pageHead {\n  box-sizing: border-box;\n  padding-top: calc(28px + var(--dsh-frame-top-clearance, 0px));\n}\n\n.s475fb9_pageTitle {\n  margin: 0;\n  font-size: 20px;\n  font-weight: 500;\n  line-height: 28px;\n}\n\n/* Secondary, as dsh's own intro: 5.80:1 on the light theme's white. */\n.sa7f73e_pageIntro {\n  margin: 4px 0 0;\n  font-size: 13px;\n  line-height: 20px;\n  color: var(--dsw-alias-label-secondary);\n}\n\n/* The shelf's two arrangements (design 2026-11-02-shop-widescreen-layout\n * §4). Base: today's column — the controls, then the results — with the\n * same 14px the panel used to put between them. The container is `.s620b40_panel`,\n * so these rules are queried from above, not from here. */\n.s960683_shelfBody {\n  display: flex;\n  flex-direction: column;\n  gap: 14px;\n}\n\n/* Narrow: the category chips and the switch are one row, as they are today.\n * `nowrap` is load-bearing — flex line-breaking uses the chips' MAX-content\n * width, so a wrapping row sends the switch to a line of its own the moment\n * the chips do not fit, which is every narrow panel. The bar shrinks and\n * wraps its own chips instead. The bar is a sibling of the switch now, not\n * its parent, so `align-items: flex-end` is what keeps the switch level with\n * the bar's last line rather than floating beside the middle of a two-line\n * block. */\n.sc34345_controls {\n  display: flex;\n  flex-wrap: nowrap;\n  align-items: flex-end;\n  gap: 6px;\n}\n\n/* The rail's headings. Hidden below the threshold, where the controls are one\n * wrapping bar and these words would label nothing; the wide rule reveals\n * them (design 2026-11-02-shop-widescreen-layout §4). */\n.s2c9677_railHeading {\n  display: none;\n  margin: 0;\n  font-size: 11px;\n  font-weight: 600;\n  letter-spacing: 0.08em;\n  text-transform: uppercase;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.sfa80b4_results {\n  display: flex;\n  flex-direction: column;\n  gap: 14px;\n}\n\n\n/* The two buttons on dsh's Plugins page (design 2026-10-16-shop-sidebar-page\n * §7), drawn as that page draws its own small outline buttons beside them —\n * dsh 0.2.0-rc.2's Button, sm + outline: 28px tall, 12px text on an 18px\n * line, 10px of side padding, the small radius, the neutral stroke. That\n * stroke is 0.5px in dsh and 1px here: every border in this stylesheet is,\n * and Chromium paints 0.5px as 1px at every ratio measured. */\n.s8e13a0_detailAction {\n  box-sizing: border-box;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  height: 28px;\n  padding: 0 10px;\n  border: 1px solid var(--dsw-alias-border-l3);\n  border-radius: var(--dsw-radius-sm);\n  background: transparent;\n  color: var(--dsw-alias-label-primary);\n  font-size: 12px;\n  line-height: 18px;\n  cursor: pointer;\n}\n\n.s8e13a0_detailAction:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.s8e13a0_detailAction:focus-visible {\n  outline: 2px solid var(--dsw-alias-brand-primary);\n  outline-offset: 1px;\n}\n\n.sa3deac_stateLine {\n  margin: 0;\n  color: var(--dsw-alias-label-primary);\n  font-size: 13px;\n}\n\n/* Visually hidden but screen-reader readable (the loading copy while the\n * skeleton stands in visually). */\n.s9361fb_srOnly {\n  position: absolute;\n  width: 1px;\n  height: 1px;\n  margin: -1px;\n  padding: 0;\n  border: 0;\n  clip: rect(0 0 0 0);\n  clip-path: inset(50%);\n  overflow: hidden;\n  white-space: nowrap;\n}\n\n/* The loading shelf: ghost cards with the same geometry as the real grid, so\n * the swap to content is a same-shape handoff instead of a jump. */\n.sb1fe4e_skeletonGrid {\n  display: grid;\n  grid-template-columns: 1fr;\n  gap: 8px;\n}\n\n.s8c9105_skeletonCard {\n  position: relative;\n  display: flex;\n  flex-direction: column;\n  border: 1px solid var(--dsw-alias-border-l1);\n  border-radius: 10px;\n  background: var(--dsw-alias-bg-layer-1);\n  overflow: hidden;\n}\n\n/* The shimmer sweep: one gradient band travels across each ghost card while\n * the bars breathe, so the loading state reads as \"the shelf is scanning\". */\n.s8c9105_skeletonCard::after {\n  content: '';\n  position: absolute;\n  inset: 0;\n  background: linear-gradient(\n    100deg,\n    transparent 25%,\n    color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent) 50%,\n    transparent 75%\n  );\n  transform: translateX(-100%);\n  animation: dshShopSkeletonSweep 1.4s ease-in-out infinite;\n  pointer-events: none;\n}\n\n@keyframes dshShopSkeletonSweep {\n  to { transform: translateX(100%); }\n}\n\n.s865ab3_skeletonName {\n  width: 55%;\n  height: 14px;\n  margin: 10px 12px 0;\n  border-radius: 4px;\n  background: color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent);\n}\n\n.s6b4bce_skeletonSummary {\n  width: 92%;\n  height: 12px;\n  margin: 10px 12px 0;\n  border-radius: 4px;\n  background: color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent);\n}\n\n.sf40a9a_skeletonSummaryShort {\n  width: 68%;\n  height: 12px;\n  margin: 6px 12px 10px;\n  border-radius: 4px;\n  background: color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent);\n}\n\n/* The ghost of the action line, right where the real buttons land. */\n.s8e5a8a_skeletonActions {\n  display: block;\n  width: 84px;\n  height: 24px;\n  margin: 0 12px 10px;\n  border-radius: 999px;\n  background: color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent);\n}\n\n.s8c9105_skeletonCard span {\n  animation: dshShopSkeletonPulse 1.6s ease-in-out infinite;\n}\n\n@keyframes dshShopSkeletonPulse {\n  0%, 100% { opacity: 0.5; }\n  50% { opacity: 1; }\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .s8c9105_skeletonCard span { animation: none; opacity: 0.75; }\n  .s8c9105_skeletonCard::after { content: none; }\n}\n\n.s51f04e_actionButton {\n  align-self: flex-start;\n  padding: 5px 14px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 6px;\n  background: var(--dsw-alias-bg-layer-2);\n  color: var(--dsw-alias-label-primary);\n  font-size: 13px;\n  cursor: pointer;\n}\n\n.s51f04e_actionButton:hover {\n  border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, var(--dsw-alias-border-l2));\n  color: var(--dsw-alias-brand-primary);\n}\n\n.s51f04e_actionButton:focus-visible {\n  outline: 2px solid var(--dsw-alias-brand-primary);\n  outline-offset: 1px;\n}\n\n.sfb0d90_toolbar {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n  flex-wrap: wrap;\n}\n\n.s925fc4_toolbarRight {\n  display: flex;\n  align-items: center;\n  gap: 12px;\n  flex-wrap: wrap;\n}\n\n/* The shop's own version, right of the search box: `v0.4.4`, plus the\n * update button when the version check found a newer release. */\n.s5ea3a7_versionBlock {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n}\n\n.sc66a32_versionText {\n  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;\n  font-size: 12px;\n  letter-spacing: 0.02em;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.sccdf7c_updateSelfButton {\n  padding: 2px 10px;\n  border: 1px solid var(--dsw-alias-brand-primary);\n  border-radius: 999px;\n  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent);\n  color: var(--dsw-alias-brand-primary);\n  font-size: 12px;\n  font-weight: 600;\n  cursor: pointer;\n}\n\n.sccdf7c_updateSelfButton:hover {\n  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 20%, transparent);\n}\n\n.sccdf7c_updateSelfButton:focus-visible {\n  outline: 2px solid var(--dsw-alias-brand-primary);\n  outline-offset: 1px;\n}\n\n/* The on-demand re-check next to the version number: a quiet pill; the\n * border and text carry it in the light theme where bg layers are white. */\n.scf8dbb_checkUpdateButton {\n  padding: 2px 10px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 999px;\n  background: var(--dsw-alias-bg-layer-2);\n  color: var(--dsw-alias-label-secondary);\n  font-size: 12px;\n  cursor: pointer;\n}\n\n.scf8dbb_checkUpdateButton:hover {\n  border-color: var(--dsw-alias-label-secondary);\n  color: var(--dsw-alias-label-primary);\n}\n\n.scf8dbb_checkUpdateButton:disabled {\n  opacity: 0.6;\n  cursor: default;\n}\n\n.scf8dbb_checkUpdateButton:focus-visible {\n  outline: 2px solid var(--dsw-alias-brand-primary);\n  outline-offset: 1px;\n}\n\n/* The project's GitHub mark, right of the version row: a quiet icon link.\n * The octocat carries itself — color shift on hover, no text, no border. */\n.s85b663_githubLink {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  padding: 3px;\n  border-radius: 6px;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.s85b663_githubLink:hover {\n  color: var(--dsw-alias-label-primary);\n  background: var(--dsw-alias-bg-layer-2);\n}\n\n.s85b663_githubLink:focus-visible {\n  outline: 2px solid var(--dsw-alias-brand-primary);\n  outline-offset: 1px;\n}\n\n/* The self-update's expanded states (running log / done + restart /\n * failure detail) sit under the toolbar, above the category bar. */\n.s5c8eb8_selfUpdatePanel {\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n  margin-top: 8px;\n}\n\n.sf47d01_searchInput {\n  width: min(280px, 100%);\n  padding: 6px 10px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 6px;\n  background: var(--dsw-alias-bg-layer-1);\n  color: var(--dsw-alias-label-primary);\n  font-size: 13px;\n}\n\n.sf47d01_searchInput:focus-visible {\n  outline: 2px solid var(--dsw-alias-brand-primary);\n  outline-offset: 1px;\n}\n\n/* Subdued line under the search box when a dictionary intent fired (design\n * 2026-10-08-search-query-expansion §4). One fact, no badge. */\n.sdce253_expansionNote {\n  margin: 4px 0 0;\n  font-size: 12px;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.s797744_staleBadge {\n  padding: 2px 8px;\n  border-radius: 999px;\n  background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 14%, transparent);\n  border: 1px solid color-mix(in srgb, var(--dsw-alias-state-warn-primary) 40%, transparent);\n  color: var(--shop-warn-on-tint);\n  font-size: 12px;\n}\n\n.s2b7ed0_categoryBar {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 6px;\n  margin-top: 6px;\n  /* A flex item of `.sc34345_controls` at narrow widths: it may shrink below its\n   * content, so the chips wrap instead of pushing the switch off the line.\n   * It must NOT grow — a growing bar takes the whole line and pushes the\n   * switch to a line of its own, where today the two share one. The wide\n   * rail restores its natural height. */\n  flex: 0 1 auto;\n  min-width: 0;\n}\n\n.s5bccd1_categoryButton {\n  /* The hue this button carries when selected. `All` and `Installed` select by\n   * something other than a category and keep the brand token; the six category\n   * buttons override it from the shared hue table below, so a pressed Tool tab\n   * turns the same blue as a tool card's spine. */\n  --category-hue: var(--dsw-alias-brand-primary);\n  padding: 3px 10px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 999px;\n  background: var(--dsw-alias-bg-layer-1);\n  color: var(--dsw-alias-label-secondary);\n  font-size: 12px;\n  cursor: pointer;\n}\n\n/* Blend text with the theme foreground: darker on light backgrounds, lighter\n * on dark ones. The unblended category hue belongs on the border and fill. */\n.s5bccd1_categoryButton:hover {\n  border-color: color-mix(in srgb, var(--category-hue) 45%, var(--dsw-alias-border-l2));\n  color: color-mix(in srgb, var(--category-hue) 45%, var(--dsw-alias-label-primary) 55%);\n}\n\n/* Selected. Written `.s5bccd1_categoryButton.s7436f6_categoryButtonOn` — TWO classes — so it\n * matches `.s5bccd1_categoryButton:hover`'s specificity and, coming after it, wins.\n * As a bare `.s7436f6_categoryButtonOn` it lost both `border-color` and `color` to the\n * hover rule for as long as the pointer stayed on the tab that had just been\n * clicked, which is precisely when a reader looks for confirmation.\n *\n * EVERY declaration here is a colour: a pressed tab must occupy exactly the\n * same box as an unpressed one, so the bar does not reflow — and with ~9 pills\n * on a wrapping row, one that grows can push the rest onto another line and\n * move the tab out from under the pointer that just clicked it. That is what\n * `font-weight: 600` did (bold metrics are wider than regular), and it is why\n * nothing may be added here that resolves to a length: no padding, no\n * border-width, no font-size, no letter-spacing. `css-tokens.s931c3b_client.s6bd619_spec.s739867_ts`\n * fails the build on one.\n *\n * Nor a second line. An inset ring once doubled this border, and every control\n * in the stylesheet now draws exactly one 1px line, which is also the thinnest\n * the host paints (Chromium draws 0.5px as 1px). What separates pressed from\n * unpressed is lightness instead of thickness: the border is the hue mixed 30%\n * toward label-primary, the theme's foreground pole, so it clears 3:1 against\n * the bar in both themes for every hue — the raw hue measured 1.86:1 on white\n * for `ui` — and the fill under it is 22% of the hue. The `other` tab is the\n * case this is for: its hue IS the neutral gray this file uses for \"no\n * category\", so on the light theme the hue alone barely separates the two. */\n.s5bccd1_categoryButton.s7436f6_categoryButtonOn {\n  border-color: color-mix(in srgb, var(--category-hue) 70%, var(--dsw-alias-label-primary));\n  background: color-mix(in srgb, var(--category-hue) 22%, transparent);\n  color: color-mix(in srgb, var(--category-hue) 45%, var(--dsw-alias-label-primary) 55%);\n}\n\n/* Forced colours replace every colour above with the system palette, which\n * would leave the three colour declarations saying nothing and the pressed tab\n * indistinguishable from its neighbours, so this mode alone gets an outline. */\n@media (forced-colors: active) {\n  .s5bccd1_categoryButton.s7436f6_categoryButtonOn {\n    outline: 2px solid ButtonText;\n    outline-offset: -4px;\n  }\n}\n\n.s5bccd1_categoryButton:focus-visible {\n  outline: 2px solid var(--dsw-alias-brand-primary);\n  outline-offset: 1px;\n}\n\n/* The incompatible filter, at the right edge of the controls row at narrow\n * widths: `margin-left: auto` pushes it past the bar, which shrinks and wraps\n * its own chips (`flex: 0 1 auto`) rather than squeezing the switch. Under\n * the wide layout it is a full-width row under the rail's \"Filter\" heading.\n * It is a MODIFIER, not a ninth category — the categories select what to show\n * and this one subtracts from whatever they selected — so it takes the error\n * hue it filters on rather than joining the hue table.\n *\n * And it is a SWITCH, which is the difference the shape now carries. It used\n * to wear `.s5bccd1_categoryButton`: same pill, same row, same size as the eight tabs,\n * differing only in being red. That reads as a ninth tab, and it is not one —\n * the tabs are choose-one and this is on-or-off. So it drops the pill chrome\n * entirely (no border, no fill, nothing to compete with the row it sits\n * beside) and puts the state in a track, the same one every installed card\n * carries. Nothing here restates the switch geometry; `--switch-hue` is the\n * whole of what this control says about it, and it reaches the label too, so\n * one declaration keeps the word and the track the same colour. */\n.s49785e_incompatibleFilter {\n  --switch-hue: var(--dsw-alias-state-error-primary);\n  margin-left: auto;\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  /* One line at any panel size. A flex row that cannot fit its items shrinks\n   * every one of them, and a switch squeezed below its own content broke its\n   * words mid-label — 只看收 / 藏, 隐藏不兼容 / 3708 — once the favorites\n   * switch shared the row (reported 2026-11-06). Under `nowrap` the label's\n   * min-content is the whole line, which a flex item's automatic minimum will\n   * not shrink below, so the squeeze goes to the bar: its chips wrap. */\n  white-space: nowrap;\n  /* Matches the pills' vertical padding so the bar keeps one line box whether\n   * this control wraps onto a row of its own or shares theirs. */\n  padding: 3px 0;\n  border: 0;\n  background: none;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 12px;\n  cursor: pointer;\n}\n\n/* Hover lifts the word to full contrast and warms the track's border. Scoped\n * to the OFF track: `.s49785e_incompatibleFilter:hover .s3e91a7_switch` outranks `.scf58a9_switchOn`\n * by two classes, so unscoped it would strip the hue from the border at\n * exactly the moment a reader has the pointer on it to check the state. */\n.s49785e_incompatibleFilter:hover {\n  color: var(--dsw-alias-label-primary);\n}\n\n.s49785e_incompatibleFilter:hover .s3e91a7_switch:not(.scf58a9_switchOn) {\n  border-color: color-mix(in srgb, var(--switch-hue) 45%, var(--dsw-alias-border-l2));\n}\n\n/* On. Written with both classes for the reason `.s5bccd1_categoryButton.s7436f6_categoryButtonOn`\n * is: it has to match `:hover`'s specificity and come after it, or the colour\n * reverts under a pointer that has not moved since the click. */\n.s49785e_incompatibleFilter.sace172_incompatibleFilterOn {\n  color: color-mix(in srgb, var(--switch-hue) 45%, var(--dsw-alias-label-primary) 55%);\n}\n\n/* Off here means \"nothing is being taken away\" — the resting state — so the\n * knob steps back to the secondary label. The enable switch keeps the full\n * strength dot, where off means \"this plugin is disabled\" and is worth\n * noticing. In this bar it would be the heaviest mark in a row of hairline\n * pills, and on the light theme it is the WHOLE control: bg-layer-2 is the\n * same white as the panel there, so an off track is a hairline outline with a\n * near-black dot sitting in it. */\n.s49785e_incompatibleFilter .s3e91a7_switch:not(.scf58a9_switchOn) .se04dcb_switchKnob {\n  background: var(--dsw-alias-label-secondary);\n}\n\n/* The ring has no border to trace, so it takes an offset and the pill radius\n * of the tabs it sits beside rather than hugging the text. */\n.s49785e_incompatibleFilter:focus-visible {\n  outline: 2px solid var(--dsw-alias-brand-primary);\n  outline-offset: 2px;\n  border-radius: 999px;\n}\n\n.s8bbbce_updatableHeading {\n  margin: 2px 0 0;\n  font-size: 16px;\n  font-weight: 600;\n  letter-spacing: 0.02em;\n  color: var(--dsw-alias-label-primary);\n}\n/* The Updatable heading and its one batch action on a line (design\n * 2026-11-04-borrowings-round-4 §3). The action sits at the row's end, where\n * the card list's other secondary actions put theirs, and wraps under the\n * heading rather than squeezing it when the column is narrow. */\n.s42f7ef_updatableHead {\n  display: flex;\n  align-items: baseline;\n  justify-content: space-between;\n  gap: 8px 12px;\n  flex-wrap: wrap;\n}\n\n.sdbe244_updateAllButton {\n  flex: 0 0 auto;\n  font-size: 12px;\n  padding: 4px 10px;\n  border-radius: 6px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  background: transparent;\n  color: var(--dsw-alias-label-primary);\n  cursor: pointer;\n}\n\n.sdbe244_updateAllButton:hover {\n  border-color: var(--dsw-alias-brand-primary);\n  color: var(--dsw-alias-brand-primary);\n}\n\n/* The ring every other control in this stylesheet carries. The batch action is\n * the only one in the Updatable header, so it is also the only Tab stop there\n * — without this it would be the one keyboard-reachable control with no\n * visible focus. */\n.sdbe244_updateAllButton:focus-visible {\n  outline: 2px solid var(--dsw-alias-brand-primary);\n  outline-offset: 1px;\n}\n\n.sa7ab40_catalogStatsRow {\n  display: flex;\n  align-items: center;\n  /* The row holds the catalog line, the refresh button and the shelf order's\n   * three pills (design 2026-10-12-shelf-orders §4). Without wrapping, the\n   * last of them overflows the tab at a narrow width. */\n  flex-wrap: wrap;\n  gap: 10px;\n  margin: 6px 0 0;\n}\n\n/* The shelf's order control, at the right end of the stats row. `margin-left:\n * auto` is what puts it there while the line and the refresh button stay\n * left — and it is safe on a wrapping row, unlike a width. */\n.sa52bfa_sortGroup {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  margin-left: auto;\n}\n\n.s411b49_sortLabel {\n  color: var(--dsw-alias-label-secondary);\n  font-size: 12px;\n}\n\n.s4e9afc_catalogStats {\n  margin: 0;\n  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;\n  font-size: 12px;\n  letter-spacing: 0.02em;\n  color: var(--dsw-alias-label-secondary);\n}\n\n/* Sits beside the 12px stats caption, so it is quieter than `.s51f04e_actionButton`:\n * this is an affordance, not a call to action — the catalog reloads on its\n * own at mount and the shelf is already usable without it. Named\n * `catalogRefresh*` (not `reload*`) so it cannot collide with the §4 page\n * reload offer below, which reloads the whole tab rather than refetching\n * the catalog data. */\n.s37ae89_catalogRefreshButton {\n  padding: 1px 9px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 999px;\n  background: transparent;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 11px;\n  line-height: 17px;\n  cursor: pointer;\n}\n\n.s37ae89_catalogRefreshButton:hover:not(:disabled) {\n  border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, var(--dsw-alias-border-l2));\n  color: var(--dsw-alias-brand-primary);\n}\n\n.s37ae89_catalogRefreshButton:disabled {\n  cursor: default;\n  opacity: 0.6;\n}\n\n.s37ae89_catalogRefreshButton:focus-visible {\n  outline: 2px solid var(--dsw-alias-brand-primary);\n  outline-offset: 1px;\n}\n\n.sad310e_catalogRefreshFailed {\n  font-size: 11px;\n  color: var(--shop-warn);\n}\n\n.s3671cd_emptyLine {\n  margin: 0;\n  color: var(--dsw-alias-label-primary);\n  font-size: 13px;\n}\n\n/* The shelf: a responsive grid of cards. `auto-fill` with a 430px minimum\n * gives the two columns the wide layout buys — two tracks and their 12px gap\n * need 872px of results column — and one column below that (design\n * 2026-11-02-shop-widescreen-layout §5). The vertical gap is today's 8px. */\n.s984038_cards {\n  display: grid;\n  grid-template-columns: repeat(auto-fill, minmax(min(430px, 100%), 1fr));\n  max-width: 100%;\n  gap: 8px 12px;\n  list-style: none;\n  margin: 0;\n  padding: 0;\n  animation: dshShopCardsIn 220ms ease;\n}\n\n@keyframes dshShopCardsIn {\n  from { opacity: 0; transform: translateY(3px); }\n  to { opacity: 1; transform: none; }\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .s984038_cards { animation: none; }\n}\n\n/* The shelf's grid item is the <li> carrying a card's identity (ShopPage\n * reads it), not the card, and a grid item's min-width is auto: the 1fr track\n * could then never be narrower than the widest item's min-content, and every\n * card widens to it. Two things reach that width. Content that cannot wrap,\n * on a narrow window. And a card the browser skips (`content-visibility:\n * auto` below), which keeps the width it last rendered at: browsing a wide\n * window and narrowing it left every card 960px wide in a 662px column, its\n * right side clipped by the panel (measured on dsh 0.2.1-rc.2, 0.2.0-rc.2 and\n * 0.1.7-rc.2, 2026-10-22). Until the page took the main column the panel was\n * as wide as Settings made it, and a window resize did not move it. */\n/* The card is this item's child. Without a grid here the item stretches to\n * the row but the card keeps its content height, so the action row's\n * `margin-top: auto` has no free space to absorb and two cards in a row end\n * their buttons on different lines — measured 65px short at a 1280px tab\n * (2026-11-02). A one-row grid stretches the card to the cell. */\n.s984038_cards > li {\n  min-width: 0;\n  display: grid;\n}\n\n.s393112_card {\n  position: relative;\n  display: flex;\n  flex-direction: column;\n  /* The page and the card are both bg-layer-1 — the light theme resolves\n   * every layer token to white — so this border is the card's only edge.\n   * border-l1 is 4% black on white (#f5f5f5), which reads as no edge; l2 is\n   * 10% (#e5e5e5, 1.19:1 against white where l1 was 1.08:1), and in dark it\n   * goes from 6% to 12% white on #232324. */\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 10px;\n  background: var(--dsw-alias-bg-layer-1);\n  overflow: hidden;\n  transition: border-color 120ms ease, transform 120ms ease, box-shadow 120ms ease;\n  /* Off-screen cards skip layout and paint; the placeholder keeps scrollbar\n   * estimation sane before the browser has measured the real height. */\n  content-visibility: auto;\n  contain-intrinsic-size: auto 140px;\n}\n\n/* The sentinel that triggers the next shelf batch: zero visual footprint. */\n.sbcba8e_cardsSentry {\n  height: 1px;\n  margin: 0;\n  padding: 0;\n}\n\n.s527167_showingLine {\n  margin: 0;\n  font-size: 12px;\n  letter-spacing: 0.02em;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.s393112_card:hover {\n  border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, var(--dsw-alias-border-l2));\n  transform: translateY(-1px);\n  box-shadow: 0 2px 8px color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent);\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .s393112_card { transition: none; }\n  .s393112_card:hover { transform: none; }\n}\n\n/* The signature: a spine and cover in the category's own hue. The hues are\n * fixed mid-bright colors that read on both themes; `other` deliberately\n * stays a neutral gray so the fallback category does not compete. */\n.s542978_cardSpine {\n  position: absolute;\n  top: 0;\n  bottom: 0;\n  left: 0;\n  width: 3px;\n  background: var(--category-hue, #8B8E96);\n}\n\n/* The hue table, keyed by `data-category` and read by BOTH surfaces that\n * speak in category colour: a card's spine and badge, and the category bar's\n * own tab. One table, so a tab can never disagree with the cards it filters to\n * — which is the whole point of colouring the tab. `.s5bccd1_categoryButton` sets the\n * brand fallback for `All`/`Installed`; these attribute selectors are one\n * specificity step above it and win wherever the attribute is present. */\n.s393112_card[data-category='tool'], .s5bccd1_categoryButton[data-category='tool'] { --category-hue: #4C8DFF; }\n.s393112_card[data-category='provider'], .s5bccd1_categoryButton[data-category='provider'] { --category-hue: #A78BFA; }\n.s393112_card[data-category='ui'], .s5bccd1_categoryButton[data-category='ui'] { --category-hue: #2DD4BF; }\n.s393112_card[data-category='workflow'], .s5bccd1_categoryButton[data-category='workflow'] { --category-hue: #F59E0B; }\n.s393112_card[data-category='integration'], .s5bccd1_categoryButton[data-category='integration'] { --category-hue: #34D399; }\n.s393112_card[data-category='theme'], .s5bccd1_categoryButton[data-category='theme'] { --category-hue: #F472B6; }\n.s393112_card[data-category='other'], .s5bccd1_categoryButton[data-category='other'] { --category-hue: #8B8E96; }\n\n/* The category sits in the badge row as a quiet chip in the category's own\n * hue — the border carries it where the light theme's white layers cannot\n * (the same lesson as the check button). */\n.sf00430_categoryBadge {\n  padding: 1px 7px;\n  border: 1px solid color-mix(in srgb, var(--category-hue, #8B8E96) 45%, transparent);\n  border-radius: 999px;\n  font-size: 11px;\n  font-weight: 600;\n  letter-spacing: 0.08em;\n  text-transform: uppercase;\n  color: var(--category-hue, #8B8E96);\n  white-space: nowrap;\n}\n\n/* One entry's icon: a 32px tile holding a 24px image (design\n * 2026-10-23-shop-plugin-icons §8.3). The border and radius are dsh's own\n * (`PackageArtwork`'s .s90612f_cardIcon), so a card's icon reads the same here as on\n * dsh's Plugins page. No backplate in either theme (§8.4). */\n.s46420b_entryIcon {\n  box-sizing: border-box;\n  flex: none;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  width: 32px;\n  height: 32px;\n  border: 0.5px solid var(--dsw-alias-border-l3);\n  border-radius: var(--dsw-radius-md);\n  overflow: hidden;\n}\n\n.s30c17d_entryIconImage {\n  width: 24px;\n  height: 24px;\n  object-fit: contain;\n}\n\n.s6d9715_entryHeader {\n  display: flex;\n  flex-direction: row;\n  align-items: flex-start;\n  gap: 12px;\n  min-width: 0;\n  padding: 10px 12px 2px;\n  border: none;\n  background: transparent;\n  color: inherit;\n  font: inherit;\n  text-align: left;\n  cursor: pointer;\n}\n\n.s6d9715_entryHeader:focus-visible {\n  outline: 2px solid var(--dsw-alias-brand-primary);\n  outline-offset: -2px;\n}\n\n/* The name and the badge row, one column inside the header button. The\n * badges used to share the name's row, which at a 430px grid track left the\n * name about 120px; under it they get the full width and the name keeps its\n * line (design 2026-11-02-shop-widescreen-layout §5). */\n.sb177d0_entryHeading {\n  display: flex;\n  flex-direction: column;\n  gap: 3px;\n  min-width: 0;\n  flex: 1 1 auto;\n}\n\n/* The name fills the row and truncates rather than wraps; the badges stay\n * intact on the row under it. */\n.s20ce20_name {\n  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;\n  font-size: 13px;\n  font-weight: 600;\n  flex: 1 1 auto;\n  min-width: 0;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  color: var(--dsw-alias-label-primary);\n}\n\n.sd40dfb_badges {\n  display: flex;\n  align-items: center;\n  flex-wrap: wrap;\n  gap: 6px;\n}\n\n/* The action line: buttons side by side; an active install/uninstall flow\n * (gate, log, notices) takes the full width below them. */\n.s6c1137_cardActions {\n  display: flex;\n  flex-direction: row;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 8px;\n  padding: 8px 12px 10px;\n  /* Grid rows stretch every card to the tallest one, and the card is a flex\n   * column: this takes the leftover height above the buttons, so two cards\n   * in one row end their action rows on the same line (design\n   * 2026-11-02-shop-widescreen-layout §5). */\n  margin-top: auto;\n}\n\n/* The star (design 2026-11-02-market-borrowings §7): a glyph button at the\n * head of the action row, sized to the row's own rhythm. `aria-pressed` plus\n * a fixed pair of labels is the pattern the incompatible switch records — the\n * glyph carries the state, the label names the action. */\n.s7cd7a4_favoriteButton {\n  flex: 0 0 auto;\n  min-width: 28px;\n  height: 28px;\n  padding: 0 6px;\n  border-radius: 8px;\n  border: 1px solid transparent;\n  background: transparent;\n  /* Unstarred: a light grey, dimmer than body text. Mixed toward transparent\n   * rather than named, so it stays \"light\" on the dark theme too — the palette\n   * has no tertiary label token, and `label-secondary` alone reads as body\n   * text rather than as an inactive control. */\n  color: color-mix(in srgb, var(--dsw-alias-label-secondary) 60%, transparent);\n  font-size: 15px;\n  line-height: 1;\n  cursor: pointer;\n}\n\n/* Hover is a faint wash, never a frame: a border here drew a box around a\n * star the reader had just set, which read as a selected tile rather than as\n * a favorite (reported 2026-11-04 from a screenshot where the pointer still\n * rested on the button). The wash only darkens an UNSTARRED star — this rule\n * outranks `.scf50f9_favoriteButtonOn` by specificity, so a `color` here would turn a\n * yellow star grey under the pointer. */\n.s7cd7a4_favoriteButton:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n  color: var(--dsw-alias-label-secondary);\n}\n\n/* The starred state: yellow (design: the reader's two states are grey and\n * yellow). Declared after the hover rule — this rule and `.s7cd7a4_favoriteButton`\n * have the same specificity, so source order decides — and repeated on\n * `:hover` because the hover selector outranks it. */\n.scf50f9_favoriteButtonOn {\n  color: var(--shop-star);\n}\n\n.scf50f9_favoriteButtonOn:hover {\n  color: var(--shop-star);\n}\n\n/* The rollback offer (same design, §6): one button and, on failure, the\n * host's sentence beside it. It sits inside the installed branch, after the\n * label and the badge, so it never displaces the card's primary action. */\n.s273dc3_rollbackGroup {\n  display: inline-flex;\n  align-items: center;\n  gap: 8px;\n  flex-wrap: wrap;\n}\n\n.sc2f4de_rollbackButton {\n  font-size: 12px;\n  padding: 4px 10px;\n  border-radius: 6px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  background: transparent;\n  color: var(--dsw-alias-label-primary);\n  cursor: pointer;\n}\n\n.sc2f4de_rollbackButton:hover {\n  border-color: var(--dsw-alias-brand-primary);\n  color: var(--dsw-alias-brand-primary);\n}\n\n.s3d3d7b_rollbackNote {\n  font-size: 12px;\n  line-height: 1.5;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.s6c1137_cardActions > .s90ee5d_gate,\n.s6c1137_cardActions > .s7360e7_installPanel,\n.s6c1137_cardActions > .s23bc70_installedActions,\n.s6c1137_cardActions > .sd3442a_receipt {\n  flex-basis: 100%;\n}\n\n/* The entry's version, always visible on the card (the expanded detail\n * repeats it in the version row) — the same quiet mono as the toolbar. */\n.s92c63e_cardVersion {\n  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;\n  font-size: 12px;\n  letter-spacing: 0.02em;\n  color: var(--dsw-alias-label-secondary);\n  /* A release tag prints as tagged, never cut to seven characters (market\n   * borrowings §11), and a tag can run to any length. The cap keeps every\n   * tag of up to fourteen characters whole, prerelease suffix included\n   * (`v0.1.0-alpha.0`): fourteen glyphs plus the letter-spacing above come to\n   * about 14.5ch, so the cap is 15ch, not 14. A longer tag ends in an ellipsis,\n   * and the tooltip carries the whole of it. */\n  max-width: 15ch;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n/* The octocat marking a source the reader can read on GitHub, beside the\n * card's version. */\n.s9bbd60_sourceBadge {\n  display: inline-flex;\n  align-items: center;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.s860f8d_tierBadge {\n  padding: 1px 7px;\n  border-radius: 999px;\n  font-size: 11px;\n  line-height: 1.6;\n}\n\n.s860f8d_tierBadge[data-tier='verified'] {\n  color: var(--shop-success);\n  background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 14%, transparent);\n  border: 1px solid color-mix(in srgb, var(--dsw-alias-state-success-primary) 40%, transparent);\n}\n\n.s860f8d_tierBadge[data-tier='verified-stale'] {\n  color: var(--shop-warn-on-tint);\n  background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 14%, transparent);\n  border: 1px solid color-mix(in srgb, var(--dsw-alias-state-warn-primary) 40%, transparent);\n}\n\n.s860f8d_tierBadge[data-tier='community'] {\n  color: var(--dsw-alias-label-secondary);\n  background: var(--dsw-alias-bg-layer-2);\n  border: 1px solid var(--dsw-alias-border-l2);\n}\n\n/* The §C10 shadowed badge: an installed github entry the catalog refuses\n * shadowed-by-npm. Subdued/secondary rather than a warn tint — nothing is\n * wrong with the install itself; the shelf just cannot show it. */\n.s860f8d_tierBadge[data-tier='shadowed'] {\n  color: var(--dsw-alias-label-secondary);\n  background: var(--dsw-alias-bg-layer-2);\n  border: 1px solid var(--dsw-alias-border-l2);\n}\n\n/* The §C5 archived badge: a github repository the owner has frozen.\n * Subdued register, same as shadowed — nothing is wrong with the install;\n * the pinned commit still serves, so the mark is informational only. */\n.s860f8d_tierBadge[data-tier='archived'] {\n  color: var(--dsw-alias-label-secondary);\n  background: var(--dsw-alias-bg-layer-2);\n  border: 1px solid var(--dsw-alias-border-l2);\n}\n\n.sdbb7d3_incompatibleBadge {\n  flex-shrink: 0;\n  padding: 3px 9px;\n  border-radius: 999px;\n  font-size: 12px;\n  white-space: nowrap;\n  /* On the tint, not on the plain surface: this text reads on its own 14% red\n   * fill, where the 90% red would measure 4.21:1 (light) and 4.43:1 (dark). */\n  color: var(--shop-error-on-tint);\n  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 14%, transparent);\n  border: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 40%, transparent);\n}\n\n.se738ec_starsBadge {\n  font-size: 11px;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.s3b39c2_chevron, .s95724c_chevronOpen {\n  color: var(--dsw-alias-label-secondary);\n  transition: transform 120ms ease;\n}\n\n.s95724c_chevronOpen { transform: rotate(180deg); }\n\n@media (prefers-reduced-motion: reduce) {\n  .s3b39c2_chevron, .s95724c_chevronOpen { transition: none; }\n}\n\n.s360005_body {\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n  padding: 0 12px;\n}\n\n.s4e1686_summary {\n  margin: 0;\n  font-size: 13px;\n  line-height: 1.5;\n  color: var(--dsw-alias-label-primary);\n  display: -webkit-box;\n  -webkit-line-clamp: 2;\n  -webkit-box-orient: vertical;\n  overflow: hidden;\n}\n\n.s6701b3_summaryZh {\n  margin: -4px 0 0;\n  font-size: 12px;\n  line-height: 1.5;\n  color: var(--dsw-alias-label-secondary);\n  display: -webkit-box;\n  -webkit-line-clamp: 1;\n  -webkit-box-orient: vertical;\n  overflow: hidden;\n}\n\n/* Expanded cards show the full summary: the clamp is lifted, never raised —\n * a higher number would still truncate the author's text, just later. */\n.s24b80c_summaryExpanded {\n  -webkit-line-clamp: unset;\n  display: block;\n}\n\n.s692202_summaryZhExpanded {\n  -webkit-line-clamp: unset;\n  display: block;\n}\n\n/* `white-space: pre-line` so the newline in the copy is the copy's own: the\n   dictionary decides where the line breaks, and a translator changes it\n   without touching the component. Collapses runs of spaces like `normal`, so\n   only the explicit \\n survives. */\n.s8ce637_incompatibleDetail {\n  margin: 0;\n  font-size: 12px;\n  line-height: 1.5;\n  white-space: pre-line;\n  color: var(--shop-error);\n}\n\n/* The way out of dsh's own refusal: the lead-in, then the exemption command\n * on its own line. */\n/* Block layout rather than flex: Firefox 153 will not line-clamp a container\n * that holds a display:flex child (Chromium 151 does), and the fold's\n * measured goal — \"the whole red block, remedy included, as one unit\" —\n * needs the container to clamp in BOTH engines the shop targets. The 4px\n * rhythm between the lead-in and the command is kept by the margins of the\n * children. */\n.sd54426_remedy {\n  display: block;\n}\n\n.sd54426_remedy > * + * { margin-top: 4px; }\n\n/* The fold under a card's whole red block: two lines by default, a small\n * Refresh-pill-shaped toggle under it. Two containers, one rhythm: the shelf\n * uses `.s432999_foldBlock` collapsed and `.s89b821_foldBlockExpanded` open, and they share\n * one `display: block` (Firefox clamps no flex child inside a -webkit-box).\n * The clamp is on the BLOCK rather than any one line, so a 43-line remedy\n * counts as a unit instead of squashing the harness-peers line to a sliver\n * and hiding the command the reader actually came for. Both containers\n * still render the full block to a screen reader — `white-space: normal`\n * instead of pre-line keeps the copy's own `\\n` visible without forcing the\n * browser to lay the block's pieces like a text node. */\n.s432999_foldBlock {\n  display: block;\n  -webkit-line-clamp: 2;\n  -webkit-box-orient: vertical;\n  display: -webkit-box;\n  overflow: hidden;\n}\n\n.s89b821_foldBlockExpanded { display: block; }\n\n/* The toggle. Geometry and quiet voice are the Refresh pill's\n * (`catalogStatsRow` right beside it on the same screen): one 1px border,\n * 11px text, secondary label, no fill. It is the only one of its kind here,\n * so a class of its own means one function of its own. */\n.s683b1a_foldToggle {\n  /* The pill's own width. Under a card's red block it is an item of the card\n   * body, a column, which stretches every child it is not told otherwise:\n   * 934px against the Refresh pill's 59px at a 1440 window (2026-10-22). */\n  align-self: flex-start;\n  padding: 1px 9px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 999px;\n  background: transparent;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 11px;\n  line-height: 17px;\n  cursor: pointer;\n}\n\n.s683b1a_foldToggle:hover { border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, var(--dsw-alias-border-l2)); }\n.s683b1a_foldToggle:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }\n\n.sf1e1f7_remedyLead {\n  margin: 0;\n  font-size: 12px;\n  line-height: 1.5;\n  color: var(--dsw-alias-label-primary);\n}\n\n/* The exemption command, bound for a terminal unchanged: one click selects\n * all of it, and it wraps anywhere rather than widening the card. A border,\n * not a fill, marks the box: the bg layers are one white in the light theme. */\n.s3617dd_allowCommand {\n  display: block;\n  padding: 6px 8px;\n  border-radius: 6px;\n  background: var(--dsw-alias-bg-base);\n  border: 1px solid var(--dsw-alias-border-l1);\n  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;\n  font-size: 11px;\n  line-height: 1.5;\n  white-space: pre-wrap;\n  word-break: break-all;\n  user-select: all;\n  color: var(--dsw-alias-label-primary);\n}\n\n/* A refused install on a surface that does not state its blockers — the\n * outdated row — writes them out on their own full-width line under the\n * refused label, the command that clears dsh's refusal included. Block,\n * rather than flex: Firefox will not line-clamp a -webkit-box that holds a\n * display:flex child, and the fold this element can sit inside of carries\n * that clamp. The 6px rhythm between the block's lines is carried by the\n * children's margins. */\n.s285915_refusal {\n  display: block;\n  flex-basis: 100%;\n}\n\n.s285915_refusal > * + * { margin-top: 6px; }\n\n.s7b4c84_capabilitiesBlock {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n}\n\n.s9a6ba6_capabilitiesNote {\n  margin: 0;\n  font-size: 11px;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.s923a46_capabilities {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 4px;\n  list-style: none;\n  margin: 0;\n  padding: 0;\n}\n\n.s923a46_capabilities li {\n  padding: 1px 6px;\n  border-radius: 4px;\n  background: color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent);\n  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;\n  font-size: 11px;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.s3644b7_detail {\n  border-top: 1px solid var(--dsw-alias-border-l1);\n  padding-top: 8px;\n}\n\n.s627f22_detailRows {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n  margin: 0;\n}\n\n.s932013_detailRow {\n  display: flex;\n  justify-content: space-between;\n  gap: 12px;\n  font-size: 12px;\n}\n\n.s932013_detailRow dt {\n  color: var(--dsw-alias-label-secondary);\n}\n\n.s932013_detailRow dd {\n  margin: 0;\n  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;\n  overflow-wrap: anywhere;\n  text-align: right;\n  color: var(--dsw-alias-label-primary);\n}\n\n.s932013_detailRow a {\n  color: var(--dsw-alias-brand-primary);\n  text-decoration: none;\n}\n\n.s932013_detailRow a:hover {\n  text-decoration: underline;\n}\n\n.s932013_detailRow a:focus-visible {\n  outline: 2px solid var(--dsw-alias-brand-primary);\n  outline-offset: 1px;\n}\n\n/* What the entry IS rather than what you can do with it — how big it is and\n * who published it — at the right edge of the action row. `margin-left: auto`\n * is what pushes it there, and it lives on this wrapper rather than on either\n * label so the group stays flush right when only one of the two has a value —\n * a packument that named no account has no author, and an entry the registry\n * could not measure honestly has no size. Rarer than it was (every live entry\n * now carries a size, github included), but the wrapper is not what makes it\n * rare: without one, an EMPTY meta group still costs 8px, because\n * `.s6c1137_cardActions` is a flex row with `gap: 8px` and a zero-width item is still\n * an item. The row is a wrapping flex, so an active install flow (which claims\n * the full width) drops the whole group to the next line rather than squeezing\n * it. */\n.s417d77_cardMeta {\n  display: inline-flex;\n  align-items: center;\n  gap: 8px;\n  margin-left: auto;\n  min-width: 0;\n}\n\n/* The on-disk size, left of the author. Mono and tabular so the digits of one\n * figure line up with the digits of another WHEREVER the two land: `.s417d77_cardMeta`\n * is flush right and the author sits outside the size, so a size's x position\n * moves with the author's width and is different again on the many entries\n * that carry no author at all. There is no column to align to, which is why\n * the reason given here is per-figure legibility rather than the column the\n * first version of this comment claimed. Secondary colour, because it\n * qualifies the entry rather than announcing it.\n *\n * `font-variant-numeric` is safe HERE and would not be on a pill: this element\n * has no state rules, so nothing it does can reflow a wrapping row.\n *\n * `.s8ff0b6_shelfDate` shares this rule because it is the same kind of fact — a\n * fixed-width figure a reader compares down the shelf (design\n * 2026-10-12-shelf-orders §4) — and two copies of these declarations would\n * drift. */\n.s90762b_size,\n.s8ff0b6_shelfDate {\n  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;\n  font-variant-numeric: tabular-nums;\n  font-size: 12px;\n  letter-spacing: 0.02em;\n  white-space: nowrap;\n  color: var(--dsw-alias-label-secondary);\n}\n\n/* An install past 50 MB on disk (design 2026-11-02-market-borrowings §2),\n * beside the figure it already prints. The mix, not the raw warn token, is\n * what the contrast suite measures: a colour is only allowed here after it\n * clears the same threshold as every other label on this surface\n * (`css-tokens.s931c3b_client.s6bd619_spec.s739867_ts` fails on a raw token). The tooltip carries the\n * same fact for a reader who cannot see the tint. */\n.sacd098_sizeLarge {\n  color: var(--shop-warn);\n}\n\n/* The publishing account, at the outer end of `.s417d77_cardMeta` on the action row —\n * NOT beside the npm link in the expanded detail, which is where it used to\n * live and what this comment described until the accurate half was deleted\n * with the `margin-left: auto` that moved to `.s417d77_cardMeta`. There is no middot:\n * `.s417d77_cardMeta`'s 8px gap separates it from the size.\n *\n * Secondary label colour carries the distinction — never a background fill,\n * which is invisible in the light theme where every bg-layer token is the\n * same white. */\n.s7877a8_author {\n  color: var(--dsw-alias-label-secondary);\n  font-size: 12px;\n}\n\n.s573a28_reviewedLine {\n  margin: 8px 0 0;\n  padding: 6px 8px;\n  border-radius: 6px;\n  background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 12%, transparent);\n  font-size: 12px;\n  color: var(--shop-warn-on-tint);\n}\n\n/* Install flow. */\n.s7360e7_installPanel {\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n  margin-top: 2px;\n}\n\n/* ONE geometry for everything that occupies the install button's place: the\n * button itself, the confirm/cancel pair beside the restart gate, the installed\n * label, and the refused label. Stated once because a refused label HAS to look\n * like the button it replaces apart from its colour and its text, and four\n * copies of the same five declarations is how they stop looking alike.\n * `cursor: pointer` is NOT here: only the controls that can be pressed take it,\n * while a label renders with the default cursor. */\n.sb518cc_installButton,\n.sfdae08_confirmButton,\n.s5f9442_cancelButton,\n.s912349_installedLabel,\n.s3886c9_refusedLabel {\n  align-self: flex-start;\n  margin: 0;\n  padding: 5px 14px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 6px;\n  font-size: 13px;\n}\n\n.sb518cc_installButton, .sfdae08_confirmButton, .s5f9442_cancelButton {\n  cursor: pointer;\n}\n\n.sb518cc_installButton {\n  border-color: var(--dsw-alias-brand-primary);\n  background: var(--dsw-alias-brand-primary);\n  color: var(--dsw-alias-bg-base);\n}\n\n/* Between the click and the host's answer. The flow ignores a repeat start for\n * the same identity, so this is the visible half of the same fact: a control\n * that says \"not now\" rather than one that looks ready to send a second\n * install. Only the button can be in this state — a label is never pressed. */\n.sb518cc_installButton:disabled {\n  cursor: wait;\n}\n\n.sb518cc_installButton:hover {\n  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 88%, var(--dsw-alias-label-primary));\n}\n\n.sfdae08_confirmButton {\n  border: 1px solid var(--dsw-alias-brand-primary);\n  background: var(--dsw-alias-brand-primary);\n  color: var(--dsw-alias-bg-base);\n}\n\n.sfdae08_confirmButton:hover {\n  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 88%, var(--dsw-alias-label-primary));\n}\n\n.s5f9442_cancelButton {\n  border: 1px solid var(--dsw-alias-border-l2);\n  background: var(--dsw-alias-bg-layer-2);\n  color: var(--dsw-alias-label-primary);\n}\n\n.s5f9442_cancelButton:hover {\n  border-color: var(--dsw-alias-label-secondary);\n}\n\n.sb518cc_installButton:focus-visible, .sfdae08_confirmButton:focus-visible, .s5f9442_cancelButton:focus-visible {\n  outline: 2px solid var(--dsw-alias-brand-primary);\n  outline-offset: 1px;\n}\n\n/* The shelf card of a plugin that is installed and current carries this\n * non-interactive label instead of an install button. Border + text do the\n * work in the light theme, where every bg-layer token resolves to white. */\n.s912349_installedLabel {\n  align-self: flex-start;\n  margin: 0;\n  padding: 5px 14px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 6px;\n  font-size: 13px;\n  color: var(--dsw-alias-label-secondary);\n  background: var(--dsw-alias-bg-layer-2);\n}\n\n/* The refused Install/Update button's replacement: the same box as the button\n * (the geometry rule above), filled solid red, not pressable. The fill is the\n * derived red rather than the raw token because text sits on it — bg-base on\n * `--shop-error` measures 5.31:1 light and 6.14:1 dark — and the raw error red\n * under bg-base text measures 4.498:1, the miss this whole family of fixes\n * exists for. Nothing here changes on hover: it is a statement, not a control,\n * so it keeps the default cursor and its colours. */\n.s3886c9_refusedLabel {\n  border-color: var(--shop-error);\n  background: var(--shop-error);\n  color: var(--dsw-alias-bg-base);\n  white-space: nowrap;\n}\n\n/* An installed card's controls: the installed label or the update button,\n * plus the uninstall button. The install panel's running/failed states are\n * column layouts and sit as one item of this row. */\n.s23bc70_installedActions {\n  display: flex;\n  align-items: flex-start;\n  flex-wrap: wrap;\n  gap: 8px;\n}\n\n/* Uninstall revokes privilege; the quiet outline keeps it from competing\n * with the primary action, and the error tint says \"removes\". */\n.s224fc5_uninstallButton {\n  align-self: flex-start;\n  padding: 5px 14px;\n  border: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 55%, transparent);\n  border-radius: 6px;\n  background: transparent;\n  /* The on-tint red: hovering this button paints a 10% red fill under the\n   * word, where the plain red measures 4.50:1 (light) — the same two\n   * thousandths short of the floor the raw token shipped at. */\n  color: var(--shop-error-on-tint);\n  font-size: 13px;\n  cursor: pointer;\n}\n\n.s224fc5_uninstallButton:hover {\n  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);\n}\n\n.s224fc5_uninstallButton:focus-visible {\n  outline: 2px solid var(--dsw-alias-state-error-primary);\n  outline-offset: 1px;\n}\n\n/* The restart dsh button on a done install: quiet outline, same rank as\n * the other secondary actions. */\n.s95ac3a_restartSelfButton {\n  /* The version row's third state. Geometry matches .scf8dbb_checkUpdateButton and\n   * .sccdf7c_updateSelfButton exactly — the row is one evolving control and a\n   * different pill would read as a different kind of thing. It takes the\n   * emphasised fill rather than the neutral one because at that moment the\n   * restart is the only thing left to do, the same reason Update has it. */\n  padding: 2px 10px;\n  border: 1px solid var(--dsw-alias-brand-primary);\n  border-radius: 999px;\n  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent);\n  color: var(--dsw-alias-brand-primary);\n  font-size: 12px;\n  font-weight: 600;\n  cursor: pointer;\n}\n\n.s95ac3a_restartSelfButton:focus-visible {\n  outline: 2px solid var(--dsw-alias-brand-primary);\n  outline-offset: 1px;\n}\n\n/* The two activation offers share one recipe: a border in an alias token,\n * never a `bg-layer` fill alone — all four bg-layer tokens collapse to the\n * same white under `body` in the light theme, and a fill-only button would\n * vanish there. Grouped rather than copied, because a copy is a rule that\n * can be corrected on one button and left wrong on the other, silently. */\n.s7b3b53_restartButton,\n.s6c804e_reloadButton {\n  align-self: flex-start;\n  padding: 5px 14px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 6px;\n  background: var(--dsw-alias-bg-layer-2);\n  color: var(--dsw-alias-label-primary);\n  font-size: 13px;\n  cursor: pointer;\n}\n\n.s7b3b53_restartButton:hover,\n.s6c804e_reloadButton:hover {\n  border-color: var(--dsw-alias-label-secondary);\n}\n\n.s7b3b53_restartButton:focus-visible,\n.s6c804e_reloadButton:focus-visible {\n  outline: 2px solid var(--dsw-alias-brand-primary);\n  outline-offset: 1px;\n}\n\n/* A settled install's or uninstall's receipt: its log, what happened, and\n * what to do next, stacked. A column, so the log box spans the card as the\n * running and failed views' logs do, rather than being as wide as its longest\n * line (852, 409 and 260px on three cards of one page, 2026-10-22), and the\n * sentence never shares a line with a button it would sit misaligned beside. */\n.sd3442a_receipt {\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n}\n\n/* The buttons under a receipt, a failure, or a reload or restart note, in one\n * row: the offer first (Reload, Restart dsh, Retry) and the way out (Dismiss)\n * beside it. They stood a line apart: Dismiss beside the reload note and\n * Reload under it, or Retry above Dismiss. */\n.s73ce9d_offerActions {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 8px;\n}\n\n/* The §4 reload offer: a notice plus its button, one item of\n * `.s23bc70_installedActions` the way the restart gate is — a column of its own\n * rather than inline with the row. */\n.s1d4318_reloadPanel {\n  display: flex;\n  flex-direction: column;\n  align-items: flex-start;\n  gap: 6px;\n}\n\n\n.s90ee5d_gate {\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n  padding: 10px;\n  border: 1px solid var(--dsw-alias-state-warn-primary);\n  border-radius: 8px;\n  background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 8%, transparent);\n}\n\n.sef1dd3_gateTitle {\n  margin: 0;\n  font-size: 13px;\n  font-weight: 600;\n  color: var(--shop-warn-on-tint);\n}\n\n.sd5e608_gateBody {\n  margin: 0;\n  font-size: 12px;\n  line-height: 1.6;\n  color: var(--dsw-alias-label-primary);\n}\n\n.sd02440_gateWarning {\n  margin: 0;\n  font-size: 12px;\n  line-height: 1.6;\n  white-space: pre-line;\n  color: var(--shop-error);\n}\n\n.s2dc996_gateActions {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 8px;\n}\n\n.s930b5b_installing {\n  margin: 0;\n  font-size: 12px;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.sd2bb29_log {\n  max-height: 160px;\n  overflow: auto;\n  margin: 0;\n  padding: 8px;\n  border-radius: 6px;\n  background: var(--dsw-alias-bg-base);\n  border: 1px solid var(--dsw-alias-border-l1);\n  list-style: none;\n  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;\n  font-size: 11px;\n  line-height: 1.5;\n}\n\n.sd711bc_logLine {\n  white-space: pre-wrap;\n  word-break: break-all;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.s2b5c0b_notice {\n  margin: 0;\n  font-size: 12px;\n  color: var(--shop-success);\n}\n\n.s971ca7_failedHeading {\n  margin: 0;\n  font-size: 12px;\n  font-weight: 600;\n  color: var(--shop-error);\n}\n\n.s6b727d_reportLine {\n  margin: 0;\n  font-size: 12px;\n}\n\n.s5d7267_reportLink {\n  color: var(--dsw-alias-brand-primary);\n  text-decoration: underline;\n}\n\n.s3cc4cd_failedDetail {\n  margin: 0;\n  font-size: 12px;\n  line-height: 1.6;\n  color: var(--dsw-alias-label-primary);\n}\n\n/* A failed install's retry line (design 2026-11-02-market-borrowings §5): the\n * command the executor ran, monospaced and selectable, with a copy button.\n * `min-width: 0` on the code is what lets a long spec wrap inside the card\n * instead of widening it — the card is a grid item and would otherwise take\n * the line's width. */\n.sb7d936_commandLine {\n  display: flex;\n  align-items: flex-start;\n  gap: 8px;\n  margin: 0;\n}\n\n.s998ca3_commandText {\n  flex: 1 1 auto;\n  min-width: 0;\n  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;\n  font-size: 11px;\n  line-height: 1.6;\n  padding: 6px 8px;\n  border-radius: 6px;\n  background: var(--dsw-alias-bg-secondary);\n  color: var(--dsw-alias-label-primary);\n  overflow-wrap: anywhere;\n}\n\n.s3a3192_copyButton {\n  flex: 0 0 auto;\n  font-size: 12px;\n  padding: 4px 10px;\n  border-radius: 6px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  background: transparent;\n  color: var(--dsw-alias-label-primary);\n  cursor: pointer;\n}\n\n.s3a3192_copyButton:hover {\n  border-color: var(--dsw-alias-brand-primary);\n  color: var(--dsw-alias-brand-primary);\n}\n\n.sb623dd_rejectedCode {\n  margin: 0;\n  font-size: 12px;\n  font-weight: 600;\n  color: var(--shop-error);\n}\n\n.s2f1e30_rejectedDetail {\n  margin: 0;\n  font-size: 12px;\n  line-height: 1.6;\n  color: var(--dsw-alias-label-primary);\n}\n\n/* The Updatable section. The class keeps the Host's field name; only the\n   heading the reader sees was renamed. */\n.sbe69dd_outdatedSection {\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n  margin-top: 6px;\n}\n\n.s551425_outdatedList {\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n  list-style: none;\n  margin: 0;\n  padding: 0;\n}\n\n.s13bb63_outdatedRow {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n  flex-wrap: wrap;\n  padding: 10px 12px;\n  border: 1px solid var(--dsw-alias-border-l1);\n  border-radius: 8px;\n  background: var(--dsw-alias-bg-layer-1);\n}\n\n.sa94d32_outdatedInfo {\n  display: flex;\n  flex-direction: row;\n  align-items: center;\n  gap: 10px;\n  min-width: 0;\n}\n\n/* The name and everything under it, beside the icon. */\n.s7a5eac_outdatedText {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n  min-width: 0;\n}\n\n.sa94d32_outdatedInfo strong {\n  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;\n  font-size: 13px;\n  word-break: break-all;\n  color: var(--dsw-alias-label-primary);\n}\n\n.s90a6e2_outdatedVersions {\n  /* Two inline labels with nothing between them in the markup ran together as\n   * `installed v1.0.0latest v2.0.0`: JSX drops the whitespace-only line, and\n   * the per-label class the markup asked for was never defined (singular\n   * against this rule's plural). The container owns the gap, the same idiom\n   * as .sd40dfb_badges — the labels need no class of their own. */\n  display: inline-flex;\n  align-items: center;\n  gap: 8px;\n  font-size: 12px;\n  color: var(--dsw-alias-label-secondary);\n}\n\n/* The update row's \"what changed\" link (design 2026-11-02-market-borrowings\n * §4). It inherits the versions line's size and rides the same gap, so it\n * reads as the third fact on that line; the underline is its only affordance\n * because the surrounding text is not a link. */\n.s546703_whatChanged {\n  color: var(--dsw-alias-brand-primary);\n  text-decoration: underline;\n  text-underline-offset: 2px;\n  white-space: nowrap;\n}\n\n.s546703_whatChanged:hover {\n  text-decoration-thickness: 2px;\n}\n\n/* The §C10 shadowed section. Reuses the outdated list's visual language; only\n * the section spacing and the per-row explanation paragraph are its own. */\n.s11f6e4_shadowedSection {\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n  margin-top: 6px;\n}\n\n.s76e33a_shadowedDetail {\n  margin: 4px 0 0;\n  font-size: 12px;\n  line-height: 1.5;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.s13d9ff_outdatedActions {\n  display: flex;\n  align-items: center;\n  /* The reload offer (§4) mounts inside the switch beside the Update button\n   * and is a two-line block, not a control: without wrapping, a row reading\n   * [switch][notice + Reload][Update] overflowed the Settings dialog the shop\n   * sat in through 0.8.7, and the page's column narrows with the window. */\n  flex-wrap: wrap;\n  gap: 10px;\n}\n\n/* The shop's one switch. It is worn by two controls that mean different\n * things — the enable/disable toggle on an installed card, and the shelf's\n * incompatible filter — so the geometry lives here once and each caller states\n * only its hue.\n *\n * `--switch-hue` is that knob, and it is read from the ANCESTOR rather than\n * declared per state: `.s49785e_incompatibleFilter` sets it once and it reaches the\n * track and the label together, which is what keeps a red switch from sitting\n * under a neutral word. A declaration on `.s3e91a7_switch` itself would shadow the\n * inherited value (an element's own rule beats what it inherits), so the\n * default rides in the `var()` fallback and is resolved once into\n * `--track-hue` instead of being spelled out at each use.\n *\n * `box-sizing` and `padding` are stated because the two callers are different\n * elements — a `<button>`, which the UA gives padding, and a `<span>`, which\n * it does not. Without them the same class renders two sizes, and the knob\n * sits 2px above centre in the taller one. */\n.s3e91a7_switch {\n  --track-hue: var(--switch-hue, var(--dsw-alias-state-success-primary));\n  box-sizing: border-box;\n  display: inline-block;\n  position: relative;\n  width: 32px;\n  height: 18px;\n  padding: 0;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 999px;\n  background: var(--dsw-alias-bg-layer-2);\n  cursor: pointer;\n  transition: background 120ms ease, border-color 120ms ease;\n}\n\n/* The knob's POSITION is the state, which is the reason this control needs no\n * `forced-colors` fallback the way the category pills do: a system palette\n * replaces every colour below and moves nothing. */\n.scf58a9_switchOn {\n  border-color: var(--track-hue);\n  background: color-mix(in srgb, var(--track-hue) 55%, transparent);\n}\n\n.se04dcb_switchKnob {\n  position: absolute;\n  top: 2px;\n  left: 2px;\n  width: 12px;\n  height: 12px;\n  border-radius: 999px;\n  background: var(--dsw-alias-label-primary);\n  transition: transform 120ms ease, background 120ms ease;\n}\n\n.scf58a9_switchOn .se04dcb_switchKnob {\n  transform: translateX(14px);\n  background: var(--dsw-alias-bg-base);\n}\n\n.s3e91a7_switch:focus-visible {\n  outline: 2px solid var(--dsw-alias-brand-primary);\n  outline-offset: 1px;\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .s3e91a7_switch, .se04dcb_switchKnob { transition: none; }\n}\n\n/* The hot enable/disable switch on installed rows: the knob button plus the\n * §8 hot-apply / failure notices rendered beside it. */\n.s494ebe_switchWrap {\n  display: inline-flex;\n  align-items: center;\n  /* Same reason as `.s13d9ff_outdatedActions`: `.s1d4318_reloadPanel`'s own comment calls\n   * itself \"a column of its own rather than inline with the row\", which held\n   * for `.s23bc70_installedActions` and not here until this line. */\n  flex-wrap: wrap;\n  gap: 8px;\n}\n\n/* THE WIDE RULES MUST STAY LAST. Nesting in @container adds no\n * specificity, so between a container rule and a top-level rule of the same\n * selector the source order decides. Placed above `.s2b7ed0_categoryBar`,\n * `.s5bccd1_categoryButton` and the two focus rules, every one of these lost: the\n * rail kept the pills' row, the switch's auto margin and the outside ring,\n * and the geometry-only e2e passed (measured 2026-11-02).\n * `css-tokens.s931c3b_client.s6bd619_spec.s739867_ts` fails if this block moves back up. */\n/* The rail. Two 430px tracks and their 12px gap need 872; the rail and its\n * 24px gap add 256; 12px of margin makes the threshold 1140. Below 872 the\n * grid's own `auto-fill` leaves one column. */\n@container (min-width: 1140px) {\n  .s960683_shelfBody {\n    display: grid;\n    grid-template-columns: 232px minmax(0, 1fr);\n    column-gap: 24px;\n    row-gap: 14px;\n  }\n\n  /* The rail sticks under dsh's frame top rather than scrolling away with\n   * the results. `.s620b40_panel`'s `overflow: clip` is not a scroll container, so\n   * the page stays the scrollport; the e2e proves it (design\n   * 2026-11-02-shop-widescreen-layout §4). */\n  .sc34345_controls {\n    flex-direction: column;\n    align-items: stretch;\n    gap: 8px;\n    position: sticky;\n    top: calc(16px + var(--dsh-frame-top-clearance, 0px));\n    align-self: start;\n    /* The cap subtracts the same clearance the offset adds. Without it a\n     * rail whose content fits the cap hangs clearance - 16px below the\n     * viewport while stuck (measured: 32px at the desktop frame's 48px), and\n     * its last control only comes into view at the very bottom of the page.\n     * The 32px is the 16px above the rail plus 16px below it. */\n    max-height: calc(100vh - 32px - var(--dsh-frame-top-clearance, 0px));\n    overflow: auto;\n  }\n\n  .s2c9677_railHeading {\n    display: block;\n  }\n\n  .s2b7ed0_categoryBar {\n    flex: none;\n    flex-direction: column;\n    align-items: stretch;\n    gap: 4px;\n    /* The 6px belongs to the wrapping row; in the rail the controls' 8px gap\n     * is the whole rhythm above the first button. */\n    margin-top: 0;\n  }\n\n  /* Label left, count right: the two spans the buttons carry. */\n  .s5bccd1_categoryButton {\n    display: flex;\n    justify-content: space-between;\n  }\n\n  /* The rail is a column with `align-items: stretch`, where an auto left\n   * margin would shrink the switch to its content and push it right. */\n  .s49785e_incompatibleFilter {\n    margin-left: 0;\n  }\n\n  /* The rail is a scroll container (`overflow: auto`) and its controls are\n   * flush with its padding box, so a ring drawn OUTSIDE them loses both\n   * vertical segments to the clip — measured: red on the top edge and\n   * corners, nothing on the sides. The inset ring, the idiom\n   * `.s6d9715_entryHeader:focus-visible` already uses, keeps all four sides. */\n  .s5bccd1_categoryButton:focus-visible {\n    outline-offset: -2px;\n  }\n\n  .s49785e_incompatibleFilter:focus-visible {\n    outline-offset: -2px;\n  }\n}\n";
		if (typeof document !== "undefined" && !document.querySelector("style[data-plugin-css=\"61217181\"]")) {
			const tag = document.createElement("style");
			tag.dataset.pluginCss = "61217181";
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var _dsh_plugin_shop_css_61217181_default = {
			"client": "s931c3b_client",
			"config": "s821251_config",
			"ts": "s739867_ts",
			"spec": "s6bd619_spec",
			"panel": "s620b40_panel",
			"shelfBody": "s960683_shelfBody",
			"searchInput": "sf47d01_searchInput",
			"toolbar": "sfb0d90_toolbar",
			"page": "s125266_page",
			"pageHead": "s9c1070_pageHead",
			"pageTitle": "s475fb9_pageTitle",
			"pageIntro": "sa7f73e_pageIntro",
			"controls": "sc34345_controls",
			"railHeading": "s2c9677_railHeading",
			"results": "sfa80b4_results",
			"detailAction": "s8e13a0_detailAction",
			"stateLine": "sa3deac_stateLine",
			"srOnly": "s9361fb_srOnly",
			"skeletonGrid": "sb1fe4e_skeletonGrid",
			"skeletonCard": "s8c9105_skeletonCard",
			"skeletonName": "s865ab3_skeletonName",
			"skeletonSummary": "s6b4bce_skeletonSummary",
			"skeletonSummaryShort": "sf40a9a_skeletonSummaryShort",
			"skeletonActions": "s8e5a8a_skeletonActions",
			"actionButton": "s51f04e_actionButton",
			"toolbarRight": "s925fc4_toolbarRight",
			"versionBlock": "s5ea3a7_versionBlock",
			"versionText": "sc66a32_versionText",
			"updateSelfButton": "sccdf7c_updateSelfButton",
			"checkUpdateButton": "scf8dbb_checkUpdateButton",
			"githubLink": "s85b663_githubLink",
			"selfUpdatePanel": "s5c8eb8_selfUpdatePanel",
			"expansionNote": "sdce253_expansionNote",
			"staleBadge": "s797744_staleBadge",
			"categoryBar": "s2b7ed0_categoryBar",
			"categoryButton": "s5bccd1_categoryButton",
			"categoryButtonOn": "s7436f6_categoryButtonOn",
			"incompatibleFilter": "s49785e_incompatibleFilter",
			"switch": "s3e91a7_switch",
			"switchOn": "scf58a9_switchOn",
			"incompatibleFilterOn": "sace172_incompatibleFilterOn",
			"switchKnob": "se04dcb_switchKnob",
			"updatableHeading": "s8bbbce_updatableHeading",
			"updatableHead": "s42f7ef_updatableHead",
			"updateAllButton": "sdbe244_updateAllButton",
			"catalogStatsRow": "sa7ab40_catalogStatsRow",
			"sortGroup": "sa52bfa_sortGroup",
			"sortLabel": "s411b49_sortLabel",
			"catalogStats": "s4e9afc_catalogStats",
			"catalogRefreshButton": "s37ae89_catalogRefreshButton",
			"catalogRefreshFailed": "sad310e_catalogRefreshFailed",
			"emptyLine": "s3671cd_emptyLine",
			"cards": "s984038_cards",
			"card": "s393112_card",
			"cardsSentry": "sbcba8e_cardsSentry",
			"showingLine": "s527167_showingLine",
			"cardSpine": "s542978_cardSpine",
			"categoryBadge": "sf00430_categoryBadge",
			"cardIcon": "s90612f_cardIcon",
			"entryIcon": "s46420b_entryIcon",
			"entryIconImage": "s30c17d_entryIconImage",
			"entryHeader": "s6d9715_entryHeader",
			"entryHeading": "sb177d0_entryHeading",
			"name": "s20ce20_name",
			"badges": "sd40dfb_badges",
			"cardActions": "s6c1137_cardActions",
			"favoriteButton": "s7cd7a4_favoriteButton",
			"favoriteButtonOn": "scf50f9_favoriteButtonOn",
			"rollbackGroup": "s273dc3_rollbackGroup",
			"rollbackButton": "sc2f4de_rollbackButton",
			"rollbackNote": "s3d3d7b_rollbackNote",
			"gate": "s90ee5d_gate",
			"installPanel": "s7360e7_installPanel",
			"installedActions": "s23bc70_installedActions",
			"receipt": "sd3442a_receipt",
			"cardVersion": "s92c63e_cardVersion",
			"sourceBadge": "s9bbd60_sourceBadge",
			"tierBadge": "s860f8d_tierBadge",
			"incompatibleBadge": "sdbb7d3_incompatibleBadge",
			"starsBadge": "se738ec_starsBadge",
			"chevron": "s3b39c2_chevron",
			"chevronOpen": "s95724c_chevronOpen",
			"body": "s360005_body",
			"summary": "s4e1686_summary",
			"summaryZh": "s6701b3_summaryZh",
			"summaryExpanded": "s24b80c_summaryExpanded",
			"summaryZhExpanded": "s692202_summaryZhExpanded",
			"incompatibleDetail": "s8ce637_incompatibleDetail",
			"remedy": "sd54426_remedy",
			"foldBlock": "s432999_foldBlock",
			"foldBlockExpanded": "s89b821_foldBlockExpanded",
			"foldToggle": "s683b1a_foldToggle",
			"remedyLead": "sf1e1f7_remedyLead",
			"allowCommand": "s3617dd_allowCommand",
			"refusal": "s285915_refusal",
			"capabilitiesBlock": "s7b4c84_capabilitiesBlock",
			"capabilitiesNote": "s9a6ba6_capabilitiesNote",
			"capabilities": "s923a46_capabilities",
			"detail": "s3644b7_detail",
			"detailRows": "s627f22_detailRows",
			"detailRow": "s932013_detailRow",
			"cardMeta": "s417d77_cardMeta",
			"shelfDate": "s8ff0b6_shelfDate",
			"size": "s90762b_size",
			"sizeLarge": "sacd098_sizeLarge",
			"author": "s7877a8_author",
			"reviewedLine": "s573a28_reviewedLine",
			"installButton": "sb518cc_installButton",
			"confirmButton": "sfdae08_confirmButton",
			"cancelButton": "s5f9442_cancelButton",
			"installedLabel": "s912349_installedLabel",
			"refusedLabel": "s3886c9_refusedLabel",
			"uninstallButton": "s224fc5_uninstallButton",
			"restartSelfButton": "s95ac3a_restartSelfButton",
			"restartButton": "s7b3b53_restartButton",
			"reloadButton": "s6c804e_reloadButton",
			"offerActions": "s73ce9d_offerActions",
			"reloadPanel": "s1d4318_reloadPanel",
			"gateTitle": "sef1dd3_gateTitle",
			"gateBody": "sd5e608_gateBody",
			"gateWarning": "sd02440_gateWarning",
			"gateActions": "s2dc996_gateActions",
			"installing": "s930b5b_installing",
			"log": "sd2bb29_log",
			"logLine": "sd711bc_logLine",
			"notice": "s2b5c0b_notice",
			"failedHeading": "s971ca7_failedHeading",
			"reportLine": "s6b727d_reportLine",
			"reportLink": "s5d7267_reportLink",
			"failedDetail": "s3cc4cd_failedDetail",
			"commandLine": "sb7d936_commandLine",
			"commandText": "s998ca3_commandText",
			"copyButton": "s3a3192_copyButton",
			"rejectedCode": "sb623dd_rejectedCode",
			"rejectedDetail": "s2f1e30_rejectedDetail",
			"outdatedSection": "sbe69dd_outdatedSection",
			"outdatedList": "s551425_outdatedList",
			"outdatedRow": "s13bb63_outdatedRow",
			"outdatedInfo": "sa94d32_outdatedInfo",
			"outdatedText": "s7a5eac_outdatedText",
			"outdatedVersions": "s90a6e2_outdatedVersions",
			"whatChanged": "s546703_whatChanged",
			"shadowedSection": "s11f6e4_shadowedSection",
			"shadowedDetail": "s76e33a_shadowedDetail",
			"outdatedActions": "s13d9ff_outdatedActions",
			"switchWrap": "s494ebe_switchWrap"
		};
		//#endregion
		//#region src/client/ShopDetailAction.tsx
		/**
		* The shop's two buttons on dsh's Plugins page (design
		* 2026-10-16-shop-sidebar-page §7), in the head of a detail page, before the
		* page's own switch and uninstall (`plugins.detail.actions`, dsh 0.1.7-rc.2
		* and later): "Open Plugin shop" on the shop's own bundle page, and "View in
		* Plugin shop" on the page of any bundle the shelf lists. Any other subject
		* renders nothing, as the slot's contract asks of an entry.
		*
		* It renders inside dsh's page, so it carries its own error boundary: a
		* throw here costs the reader a button, never dsh's page.
		*/
		/** The shop's own package, whose bundle page gets "Open Plugin shop". */
		const OWN_PACKAGE = "dsh-plugin-shop";
		function ShopDetailAction(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DetailActionBoundary, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DetailActionBody, { ...props }) });
		}
		/** Renders nothing once a child throws: a lost button, never a lost page. A
		* class, because React offers error boundaries in no other form. */
		var DetailActionBoundary = class extends react.Component {
			state = { failed: false };
			static getDerivedStateFromError() {
				return { failed: true };
			}
			componentDidCatch(error, info) {
				console.error("dsh-plugin-shop: the Plugins page button crashed", error, info.componentStack);
			}
			render() {
				return this.state.failed ? null : this.props.children;
			}
		};
		function DetailActionBody({ subject, t, listing, canOpen, openShop, page }) {
			const name = subject.kind === "bundle" ? subject.pkg.name : null;
			const own = name === OWN_PACKAGE;
			const [listed, setListed] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				if (name === null || own) return;
				let cancelled = false;
				listing().then((result) => {
					if (cancelled) return;
					const cleared = new Set(result.notAShop ?? []);
					setListed({
						name,
						keys: result.plugins.filter((entry) => entry.name === name && listedOnShelf(entry, cleared)).map(entryKey)
					});
				}).catch(() => {});
				return () => {
					cancelled = true;
				};
			}, [
				name,
				own,
				listing
			]);
			if (name === null || !canOpen()) return null;
			if (own) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: _dsh_plugin_shop_css_61217181_default.detailAction,
				"data-shop-open-shop": true,
				onClick: openShop,
				children: t("openShop")
			});
			if (listed === null || listed.name !== name || listed.keys.length === 0) return null;
			const only = listed.keys.length === 1 ? listed.keys[0] ?? null : null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: _dsh_plugin_shop_css_61217181_default.detailAction,
				"data-shop-view-in-shop": true,
				onClick: () => {
					page.focus(name, only);
					openShop();
				},
				children: t("viewInShop")
			});
		}
		//#endregion
		//#region src/client/ShopGlyph.tsx
		function ShopGlyph({ size }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 16 16",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 1,
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": "true",
				"data-shop-glyph": true,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M4.7 5.5H11.3Q12.5 5.5 12.632 6.693L13.368 13.307Q13.5 14.5 12.3 14.5H3.7Q2.5 14.5 2.632 13.307L3.368 6.693Q3.5 5.5 4.7 5.5Z" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M5.75 5.5V4.25a2.25 2.25 0 0 1 4.5 0V5.5" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M8 12.75V11.25" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M8 11.25C7.4 10.2 6.6 9.8 5.75 9.75" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M8 11.25C8.6 10.2 9.4 9.8 10.25 9.75" })
				]
			});
		}
		//#endregion
		//#region src/client/useFlows.ts
		/**
		* React's view of a keyed registry of install-shaped flows (flow-registry.ts):
		* start, poll to terminal, reset.
		*
		* Install and uninstall are the same machine. Both fold a
		* `ShopInstallStatusResult` through `reduceInstall` into an `InstallView`,
		* both poll every running identity from one interval, and both must keep a
		* settled outcome after the installed projection that follows it drops the
		* row the panel was mounted on (I-1, §7.2) — which is why the state is keyed
		* by identity here rather than held by the card.
		*
		* They differ in exactly one place: what the STARTING RPC's answer means. An
		* install refusal is a `rejected` view carrying the gate's code; an uninstall
		* refusal is a `failed` view carrying the host's published detail, because
		* `ShopUninstallResult`'s failure variant has no code to populate and those
		* codes belong to the install gate. That difference is the registry's
		* `begin`, and it is the whole of it.
		*
		* The two used to be hand-synced copies — 71 of 84 lines identical. The cost
		* was not theoretical: a single review round had to make the same edit twice
		* (the settle signature, and its call), and the `pending` set below was added
		* to one of them and not the other before this module existed.
		*
		* Since 2026-10-16 the registry is its own module, framework-free, and the
		* polling belongs to it: a component's effect stopped the moment the shop left
		* the screen (design 2026-10-16-shop-sidebar-page §5). This module only
		* renders one, through `useRegistryFlows`.
		*/
		/** Shared empty set, so an idle registry hands out one stable identity. */
		const NO_PENDING = /* @__PURE__ */ new Set();
		/** The keyed-flow face over any registry: one of the page store's, which
		* outlives the component, or one of the store a tab builds for itself when
		* none is handed over (ShopTab). */
		function useRegistryFlows(registry) {
			const { views, starting } = (0, react.useSyncExternalStore)(registry.subscribe, registry.getSnapshot);
			const start = (0, react.useCallback)((key, args) => registry.start(key, args), [registry]);
			const reset = (0, react.useCallback)((key) => {
				registry.reset(key);
			}, [registry]);
			const resetWhere = (0, react.useCallback)((predicate) => {
				registry.resetWhere(predicate);
			}, [registry]);
			const pendingRef = (0, react.useRef)(NO_PENDING);
			const pending = (0, react.useMemo)(() => {
				const next = /* @__PURE__ */ new Set();
				for (const [key, view] of views) if (view.kind !== "idle") next.add(key);
				const previous = pendingRef.current;
				if (previous.size === next.size && [...next].every((key) => previous.has(key))) return previous;
				pendingRef.current = next;
				return next;
			}, [views]);
			const flowCache = (0, react.useRef)(/* @__PURE__ */ new Map());
			const flowClosures = (0, react.useRef)({
				start,
				reset
			});
			return {
				flowFor: (0, react.useCallback)((key) => {
					if (flowClosures.current.start !== start || flowClosures.current.reset !== reset) {
						flowCache.current = /* @__PURE__ */ new Map();
						flowClosures.current = {
							start,
							reset
						};
					}
					const view = views.get(key) ?? IDLE_VIEW;
					const isStarting = starting.has(key);
					const cached = flowCache.current.get(key);
					if (cached !== void 0 && cached.view === view && cached.starting === isStarting) return cached;
					const flow = {
						view,
						starting: isStarting,
						start: (args) => start(key, args),
						reset: () => reset(key)
					};
					flowCache.current.set(key, flow);
					return flow;
				}, [
					views,
					starting,
					start,
					reset
				]),
				resetWhere,
				pending
			};
		}
		//#endregion
		//#region src/client/useUpdateSelf.ts
		/** The one key the self-update registry holds: the shop has one update. */
		const SELF_UPDATE_KEY = "self";
		/** The self-update face over a registry: the keyed-flow face
		* (`useRegistryFlows`) at its one key, so the subscription and the flow's
		* identity are that hook's and nothing here can drift from it. */
		function useRegistrySelf(registry) {
			const { flowFor, resetWhere } = useRegistryFlows(registry);
			const { view, start } = flowFor(SELF_UPDATE_KEY);
			return {
				view,
				start,
				resetWhere
			};
		}
		//#endregion
		//#region src/shared/zh-intents.ts
		/**
		* Word-boundary (token) match: `term` appears in `text` as a standalone
		* word. A non-ASCII-alphanumeric character is a boundary, so `ai-chat` and
		* `AI聊天` hit `ai` while `email`, `main` and `pipeline` do not. The text
		* must already be lowercased; the regex is cached per term because the
		* matcher runs this for every entry on every keystroke.
		*/
		const tokenRegexCache = /* @__PURE__ */ new Map();
		function tokenInText(term, text) {
			let re = tokenRegexCache.get(term);
			if (re === void 0) {
				const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
				re = new RegExp(`(?:^|[^a-z0-9])${escaped}(?![a-z0-9])`, "i");
				tokenRegexCache.set(term, re);
			}
			return re.test(text);
		}
		/**
		* The curated dictionary. Ordered by design §3's measured marginal recall
		* (largest first). Rows trimmed from 2BingLing's eighty-four to eighty by
		* dropping the four whose marginal recall on the 2026-10-08 catalog was
		* single-digit: `农历节日`, `Twitter`, `微博`, `Notion`.
		*
		* To add a row: write the intent's key in Chinese, its triggers (≥ 2 Han
		* characters each, as a defensive rule, so an isolated Han inside someone
		* else's name never fires the intent), its recall terms with `#` where a
		* bare short Latin term would otherwise act like a substring, and one
		* comment line pointing at this document's measured table.
		*/
		const ZH_INTENTS = [
			{
				key: "记忆",
				words: [
					"记忆",
					"记住",
					"想起"
				],
				terms: [
					"#memory",
					"#memories",
					"#remember"
				]
			},
			{
				key: "主题",
				words: [
					"主题",
					"皮肤",
					"外观"
				],
				terms: [
					"#theme",
					"#skin",
					"#appearance",
					"主题",
					"皮肤",
					"外观"
				]
			},
			{
				key: "搜索",
				words: [
					"搜索",
					"查找",
					"查找插件"
				],
				terms: [
					"#search",
					"search-engine",
					"搜索",
					"查找"
				]
			},
			{
				key: "浏览器",
				words: [
					"浏览器",
					"网页",
					"上网"
				],
				terms: [
					"#browser",
					"#web",
					"浏览器",
					"网页"
				]
			},
			{
				key: "AI大模型",
				words: [
					"大模型",
					"llm",
					"gpt",
					"智能体",
					"人工智能"
				],
				terms: [
					"#ai",
					"#llm",
					"#gpt",
					"#agent",
					"大模型",
					"人工智能"
				]
			},
			{
				key: "代码开发",
				words: [
					"代码",
					"编程",
					"开发"
				],
				terms: [
					"#code",
					"#coding",
					"#dev",
					"代码",
					"编程"
				]
			},
			{
				key: "文件管理",
				words: [
					"文件管理",
					"资源管理",
					"文件整理",
					"整理文件",
					"整理",
					"重命名"
				],
				terms: [
					"#file",
					"#files",
					"#explorer",
					"文件",
					"#rename",
					"#renamer",
					"重命名"
				]
			},
			{
				key: "聊天",
				words: [
					"聊天",
					"对话",
					"陪聊"
				],
				terms: [
					"#chat",
					"#chatbot",
					"聊天",
					"对话"
				]
			},
			{
				key: "搜索引擎",
				words: ["搜索引擎"],
				terms: [
					"#search",
					"search-engine",
					"搜索"
				]
			},
			{
				key: "图片",
				words: [
					"图片",
					"相册",
					"壁纸",
					"水印"
				],
				terms: [
					"#image",
					"#images",
					"#photo",
					"#wallpaper",
					"图片",
					"壁纸",
					"相册",
					"视觉理解",
					"图像识别",
					"图片问答",
					"图像处理",
					"水印"
				]
			},
			{
				key: "待办",
				words: [
					"待办",
					"任务管理",
					"清单",
					"todo"
				],
				terms: [
					"#todo",
					"#task",
					"#checklist",
					"待办",
					"任务",
					"清单",
					"任务看板",
					"#kanban"
				]
			},
			{
				key: "终端",
				words: [
					"终端",
					"命令行",
					"shell"
				],
				terms: [
					"#terminal",
					"#shell",
					"#cli",
					"终端",
					"命令行"
				]
			},
			{
				key: "Git",
				words: [
					"git",
					"github",
					"gitee",
					"提交"
				],
				terms: [
					"#git",
					"#github",
					"#gitee",
					"#commit",
					"版本控制"
				]
			},
			{
				key: "系统进程",
				words: [
					"系统",
					"进程",
					"任务管理"
				],
				terms: [
					"#system",
					"#process",
					"系统",
					"进程"
				]
			},
			{
				key: "阅读",
				words: [
					"阅读",
					"电子书",
					"小说"
				],
				terms: [
					"#read",
					"#reader",
					"#ebook",
					"#novel",
					"#epub",
					"阅读",
					"小说"
				]
			},
			{
				key: "记事本",
				words: [
					"记事本",
					"便签",
					"笔记本",
					"记事",
					"笔记"
				],
				terms: [
					"#notes",
					"#note",
					"#notepad",
					"便签",
					"笔记",
					"markdown"
				]
			},
			{
				key: "MCP",
				words: ["mcp", "mcp服务器"],
				terms: [
					"#mcp",
					"mcp-server",
					"#mcp-manager",
					"#mcp-debug"
				]
			},
			{
				key: "代理网络",
				words: [
					"代理",
					"梯子",
					"组网"
				],
				terms: [
					"#proxy",
					"#network",
					"代理",
					"网络",
					"网络代理",
					"内网穿透"
				]
			},
			{
				key: "日志",
				words: ["日志"],
				terms: [
					"#log",
					"#logs",
					"日志"
				]
			},
			{
				key: "提醒",
				words: ["提醒", "通知"],
				terms: [
					"#remind",
					"#reminder",
					"#notification",
					"#notify",
					"提醒",
					"消息通知"
				]
			},
			{
				key: "写作文案",
				words: [
					"写作",
					"文案",
					"改写"
				],
				terms: [
					"#write",
					"#writing",
					"写作",
					"文案",
					"内容创作"
				]
			},
			{
				key: "截图",
				words: [
					"截图",
					"截屏",
					"录屏",
					"屏幕录制",
					"长图"
				],
				terms: [
					"#screenshot",
					"#capture",
					"#screen",
					"截图",
					"录屏",
					"截图工具",
					"长图"
				]
			},
			{
				key: "提示词",
				words: ["提示词", "prompt"],
				terms: [
					"#prompt",
					"提示词管理",
					"提示词优化"
				]
			},
			{
				key: "备份恢复",
				words: ["备份", "恢复"],
				terms: [
					"#backup",
					"#restore",
					"备份",
					"恢复"
				]
			},
			{
				key: "压缩",
				words: ["压缩", "解压"],
				terms: [
					"#zip",
					"#compress",
					"#archive",
					"压缩",
					"解压"
				]
			},
			{
				key: "自动化",
				words: ["自动化", "rpa"],
				terms: [
					"#automation",
					"#automate",
					"#workflow",
					"任务编排",
					"桌面自动化"
				]
			},
			{
				key: "代码审查",
				words: [
					"审查",
					"评审",
					"review"
				],
				terms: [
					"#review",
					"code-review",
					"审查"
				]
			},
			{
				key: "语音合成",
				words: [
					"语音",
					"朗读",
					"tts",
					"配音",
					"声音克隆",
					"克隆声音"
				],
				terms: [
					"#tts",
					"#speech",
					"#voice",
					"语音",
					"朗读",
					"声音克隆"
				]
			},
			{
				key: "视频",
				words: ["视频"],
				terms: [
					"#video",
					"视频",
					"剪辑"
				]
			},
			{
				key: "监控",
				words: ["监控"],
				terms: ["#monitor", "监控"]
			},
			{
				key: "办公文档",
				words: [
					"word",
					"excel",
					"ppt",
					"表格",
					"幻灯片",
					"演示"
				],
				terms: [
					"#excel",
					"#word",
					"#office",
					"#xlsx",
					"表格",
					"幻灯片",
					"#ppt"
				]
			},
			{
				key: "知识库",
				words: [
					"知识库",
					"维基",
					"wiki"
				],
				terms: [
					"#wiki",
					"#knowledge",
					"知识库",
					"维基"
				]
			},
			{
				key: "网盘",
				words: ["网盘", "云盘"],
				terms: [
					"#cloud",
					"#drive",
					"网盘",
					"云盘",
					"#onedrive"
				]
			},
			{
				key: "网络诊断",
				words: [
					"ip",
					"端口",
					"ping"
				],
				terms: [
					"#ip",
					"#port",
					"#tcp",
					"#udp",
					"#ping",
					"端口"
				]
			},
			{
				key: "清理",
				words: [
					"清理",
					"垃圾",
					"瘦身"
				],
				terms: [
					"#clean",
					"#cleanup",
					"清理",
					"垃圾"
				]
			},
			{
				key: "PDF",
				words: ["pdf"],
				terms: ["#pdf"]
			},
			{
				key: "飞书钉钉",
				words: [
					"飞书",
					"钉钉",
					"lark"
				],
				terms: [
					"#feishu",
					"#lark",
					"#dingtalk",
					"飞书",
					"钉钉"
				]
			},
			{
				key: "数据库",
				words: ["数据库", "sql"],
				terms: [
					"#database",
					"#sql",
					"sqlite",
					"mysql",
					"数据库",
					"数据库连接"
				]
			},
			{
				key: "日历日程",
				words: [
					"日历",
					"日程",
					"闹钟",
					"时钟"
				],
				terms: [
					"#calendar",
					"#schedule",
					"#clock",
					"#alarm",
					"日历",
					"日程",
					"时钟"
				]
			},
			{
				key: "音乐",
				words: [
					"音乐",
					"歌曲",
					"听歌"
				],
				terms: [
					"#music",
					"#audio",
					"音乐"
				]
			},
			{
				key: "机器人",
				words: ["机器人"],
				terms: [
					"#bot",
					"#robot",
					"机器人"
				]
			},
			{
				key: "论文文献",
				words: [
					"论文",
					"文献",
					"学术"
				],
				terms: [
					"#paper",
					"#arxiv",
					"#scholar",
					"论文",
					"文献"
				]
			},
			{
				key: "下载",
				words: ["下载"],
				terms: [
					"#download",
					"#downloader",
					"下载"
				]
			},
			{
				key: "健康健身",
				words: [
					"健康",
					"健身",
					"体重"
				],
				terms: [
					"#health",
					"#fitness",
					"健康",
					"健身"
				]
			},
			{
				key: "学习背词",
				words: [
					"学习",
					"背单词",
					"单词",
					"英语"
				],
				terms: [
					"#learn",
					"#study",
					"#vocabulary",
					"#english",
					"学习",
					"单词",
					"英语"
				]
			},
			{
				key: "流程图",
				words: [
					"流程图",
					"图表",
					"绘图"
				],
				terms: [
					"#diagram",
					"#flowchart",
					"#mermaid",
					"流程图",
					"图表"
				]
			},
			{
				key: "报告生成",
				words: [
					"报告生成",
					"周报",
					"日报"
				],
				terms: [
					"#report",
					"报告生成",
					"周报",
					"日报"
				]
			},
			{
				key: "桌宠",
				words: ["桌宠", "桌面宠物"],
				terms: ["#desktop-pet", "桌宠"]
			},
			{
				key: "记账",
				words: [
					"记账",
					"账单",
					"花销"
				],
				terms: [
					"#expense",
					"#billing",
					"记账",
					"账单"
				]
			},
			{
				key: "微信",
				words: [
					"微信",
					"公众号",
					"wechat"
				],
				terms: [
					"wechat",
					"weixin",
					"微信",
					"公众号"
				]
			},
			{
				key: "股票基金",
				words: [
					"股票",
					"基金",
					"a股",
					"行情",
					"炒股"
				],
				terms: [
					"#stock",
					"#finance",
					"股票",
					"基金",
					"行情"
				]
			},
			{
				key: "语音识别",
				words: [
					"语音识别",
					"听写",
					"whisper"
				],
				terms: [
					"#whisper",
					"#asr",
					"#stt",
					"语音识别",
					"听写",
					"语音输入"
				]
			},
			{
				key: "白板",
				words: ["白板", "画布"],
				terms: [
					"#whiteboard",
					"#canvas",
					"白板",
					"画布"
				]
			},
			{
				key: "计算换算",
				words: [
					"计算器",
					"换算",
					"单位",
					"格式转换"
				],
				terms: [
					"#calculator",
					"#convert",
					"计算器",
					"换算",
					"数学计算"
				]
			},
			{
				key: "番茄钟",
				words: [
					"番茄钟",
					"专注",
					"计时"
				],
				terms: [
					"#pomodoro",
					"#focus",
					"#timer",
					"番茄钟",
					"专注",
					"计时"
				]
			},
			{
				key: "游戏",
				words: ["游戏", "摸鱼"],
				terms: [
					"#game",
					"#games",
					"游戏"
				]
			},
			{
				key: "绘画",
				words: [
					"画图",
					"绘画",
					"生图",
					"文生图",
					"画"
				],
				terms: [
					"#draw",
					"#drawing",
					"stable-diffusion",
					"#image-generation",
					"绘画",
					"生图"
				]
			},
			{
				key: "RSS订阅",
				words: ["rss", "订阅"],
				terms: [
					"#rss",
					"#feed",
					"订阅"
				]
			},
			{
				key: "多模态",
				words: ["多模态"],
				terms: [
					"#multimodal",
					"#multi-modal",
					"多模态"
				]
			},
			{
				key: "OCR",
				words: ["ocr", "文字识别"],
				terms: ["#ocr", "文字识别"]
			},
			{
				key: "密码",
				words: ["密码"],
				terms: ["#password", "密码"]
			},
			{
				key: "翻译",
				words: ["翻译", "translate"],
				terms: [
					"#translate",
					"#translation",
					"翻译"
				]
			},
			{
				key: "新闻资讯",
				words: [
					"新闻",
					"资讯",
					"头条",
					"热搜"
				],
				terms: [
					"#news",
					"#feed",
					"#trending",
					"新闻",
					"资讯",
					"热搜",
					"新闻聚合"
				]
			},
			{
				key: "简历",
				words: ["简历"],
				terms: [
					"#resume",
					"#cv",
					"简历"
				]
			},
			{
				key: "邮件",
				words: ["邮件", "邮箱"],
				terms: [
					"#mail",
					"#email",
					"#smtp",
					"邮件"
				]
			},
			{
				key: "随机抽签",
				words: [
					"随机",
					"抽签",
					"骰子"
				],
				terms: [
					"#random",
					"#dice",
					"随机"
				]
			},
			{
				key: "播放器",
				words: ["播放器"],
				terms: ["#player", "播放器"]
			},
			{
				key: "爬虫",
				words: ["爬虫", "抓取"],
				terms: [
					"#crawler",
					"#scraper",
					"#spider",
					"爬虫",
					"抓取"
				]
			},
			{
				key: "加密",
				words: ["加密", "解密"],
				terms: [
					"#encrypt",
					"#crypto",
					"加密"
				]
			},
			{
				key: "视频下载",
				words: [
					"视频下载",
					"youtube",
					"油管",
					"b站",
					"bilibili",
					"哔哩"
				],
				terms: [
					"youtube",
					"bilibili",
					"yt-dlp",
					"哔站"
				]
			},
			{
				key: "Telegram",
				words: ["telegram"],
				terms: ["telegram"]
			},
			{
				key: "数据分析",
				words: ["数据分析", "数据统计"],
				terms: [
					"#data-analysis",
					"#analytics",
					"数据分析",
					"数据统计"
				]
			},
			{
				key: "问卷投票",
				words: [
					"问卷",
					"投票",
					"抽奖"
				],
				terms: [
					"#survey",
					"#poll",
					"#quiz",
					"问卷",
					"投票",
					"抽奖"
				]
			},
			{
				key: "Obsidian",
				words: ["obsidian"],
				terms: ["obsidian"]
			},
			{
				key: "剪贴板",
				words: ["剪贴板"],
				terms: ["#clipboard", "剪贴板"]
			},
			{
				key: "加密货币",
				words: [
					"比特币",
					"加密货币",
					"币圈"
				],
				terms: [
					"#bitcoin",
					"#crypto",
					"#blockchain",
					"加密货币"
				]
			},
			{
				key: "天气",
				words: ["天气"],
				terms: ["#weather", "天气"]
			},
			{
				key: "汇率",
				words: ["汇率", "货币"],
				terms: [
					"#exchange",
					"#currency",
					"汇率"
				]
			},
			{
				key: "思维导图",
				words: ["思维导图"],
				terms: [
					"#mindmap",
					"#mind",
					"思维导图"
				]
			},
			{
				key: "字幕",
				words: ["字幕"],
				terms: ["#subtitle", "字幕"]
			},
			{
				key: "娱乐",
				words: [
					"娱乐",
					"段子",
					"笑话"
				],
				terms: [
					"#fun",
					"#joke",
					"#meme",
					"娱乐",
					"段子"
				]
			},
			{
				key: "面试",
				words: ["面试"],
				terms: ["#interview", "面试"]
			},
			{
				key: "Discord",
				words: ["discord"],
				terms: ["discord"]
			}
		];
		/**
		* Fire every intent whose trigger appears in the query (lowercase, substring),
		* deduplicate the recall vocabulary, and return the query itself first.
		*
		* The call site never has to know whether expansion happened: `terms` is
		* always at least `[query]`. The caller joins these with OR against each
		* entry's searchable fields, in the same `includes`/`tokenInText` grammar
		* as the raw query.
		*/
		function expandZhQuery(rawQuery) {
			const query = (rawQuery ?? "").trim().toLowerCase();
			if (query === "") return {
				query: "",
				intents: [],
				expansions: [],
				terms: [""]
			};
			const intents = [];
			const expansions = [];
			const terms = /* @__PURE__ */ new Set();
			for (const it of ZH_INTENTS) {
				if (!it.words.some((w) => query.includes(w))) continue;
				intents.push(it.key);
				const added = [...new Set(it.terms)].filter((t) => {
					const lower = t.toLowerCase();
					return lower !== "" && lower !== query && !terms.has(lower) && !terms.has(t);
				});
				for (const t of added) terms.add(t);
				expansions.push({
					intent: it.key,
					terms: added
				});
			}
			return {
				query,
				intents,
				expansions,
				terms: [query, ...terms]
			};
		}
		//#endregion
		//#region src/client/useFoldableRedBlock.ts
		/**
		* The fold under a card's whole red block: two lines by default, a small pill
		* that expands it when there is more, and the whole block again on a second
		* press. Three rules keep the fold honest:
		*
		* - It is measured, not declared. The toggle is offered only where the block
		*   itself shows it holds more than the clamp lets through —
		*   `scrollHeight > clientHeight`, read while the block is collapsed. A count
		*   of lines or characters would lie on exactly the narrow window the fold
		*   matters most for.
		* - It is independent of the card's own expand. The header's chevron opens
		*   the author description; the pill opens the red block.
		* - It is visual only. The label's accessible name and tooltip carry the
		*   WHOLE block, folded or open, so a screen reader meets the same facts
		*   either way.
		*
		* The measure runs wherever its answer can change: at mount, on every
		* collapse, when the block's box resizes (a ResizeObserver: the panel
		* narrowing, a font arriving), and when its text changes (a MutationObserver:
		* a verdict that lands after the first paint, or one a refresh withdraws).
		* Both observers are needed. A block already clamped at two lines keeps its
		* height when its content grows, so a ResizeObserver alone never hears the
		* line that pushes it over; and a block that first mounts with no box (a
		* hidden ancestor) changes no text when it is shown.
		*
		* While the block is open nothing is measured: an open block is as tall as
		* its content and fits by construction. Reading that as "nothing to fold" is
		* what once let the press that opened the fold unmount its own toggle.
		*/
		function useFoldableRedBlock() {
			const rootRef = (0, react.useRef)(null);
			const [expandable, setExpandable] = (0, react.useState)(false);
			const [expanded, setExpanded] = (0, react.useState)(false);
			const expandedRef = (0, react.useRef)(false);
			const measure = (0, react.useCallback)(() => {
				const el = rootRef.current;
				if (el === null || expandedRef.current) return;
				setExpandable(el.scrollHeight > el.clientHeight);
			}, []);
			(0, react.useEffect)(() => {
				if (!expanded) measure();
			}, [expanded, measure]);
			(0, react.useEffect)(() => {
				const el = rootRef.current;
				if (el === null) return;
				const observers = [];
				if (typeof ResizeObserver !== "undefined") {
					const resize = new ResizeObserver(measure);
					resize.observe(el);
					observers.push(resize);
				}
				if (typeof MutationObserver !== "undefined") {
					const mutation = new MutationObserver(measure);
					mutation.observe(el, {
						childList: true,
						subtree: true,
						characterData: true
					});
					observers.push(mutation);
				}
				return () => {
					for (const observer of observers) observer.disconnect();
				};
			}, [measure]);
			return {
				rootRef,
				expandable,
				expanded,
				toggle: () => {
					expandedRef.current = !expandedRef.current;
					setExpanded(expandedRef.current);
				}
			};
		}
		//#endregion
		//#region src/client/FoldableRedBlock.tsx
		function FoldableRedBlock({ children, t, attrName }) {
			const { rootRef, expandable, expanded, toggle } = useFoldableRedBlock();
			const kindName = attrName.replace(/^data-shop-/, "");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: expanded ? _dsh_plugin_shop_css_61217181_default.foldBlockExpanded : _dsh_plugin_shop_css_61217181_default.foldBlock,
				[attrName]: true,
				ref: rootRef,
				children
			}), expandable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: _dsh_plugin_shop_css_61217181_default.foldToggle,
				"data-shop-fold": kindName,
				"aria-expanded": expanded,
				onClick: toggle,
				children: expanded ? t("lessRedLines") : t("moreRedLines")
			})] });
		}
		//#endregion
		//#region src/client/EntryIcon.tsx
		/** The artwork an entry without a usable icon draws: dsh's own default,
		* `PluginArtworkDefault` from `dsh-client-ui-primitives` (MIT, DeepSeek — see
		* the dsh repository's LICENSE). Copied rather than imported because
		* 0.1.5-rc.3 exports nothing this build could borrow at run time.
		*
		* A constant data URL drawn through an `<img>`, not inline markup: the SVG
		* carries a gradient addressed by id, so thousands of inline copies would each
		* need one, while an image document is its own namespace and needs none
		* (design 2026-10-23-shop-plugin-icons §8.1). The id inside this string is
		* fixed for the same reason.
		*/
		const DEFAULT_ICON_DATA_URL = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzYiIGhlaWdodD0iMzYiIHZpZXdCb3g9IjAgMCAzNiAzNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJNMjQuNjI5NCA4LjYzNjk2QzI2LjI4NjIgOC42MzcwNSAyNy42Mjk0IDkuOTgwMTYgMjcuNjI5NCAxMS42MzdWMTIuNzgyNUMyNy42MjkyIDE0LjQzOTEgMjYuMjg2MSAxNS43ODI0IDI0LjYyOTQgMTUuNzgyNUgyMy40ODM5QzIyLjY1MTkgMTUuNzgyNSAyMS41NDU0IDE2LjM0NTkgMjEuNTQ1NCAxNy4xNzc4VjE4LjE1NzNDMjEuNTQ1NCAxOC43NzU3IDIyLjIxNiAxOS4xOTY2IDIyLjgzNDUgMTkuMTk2NUgyNC42Mjk0QzI2LjI4NjEgMTkuMTk2NSAyNy42MjkyIDIwLjUzOTggMjcuNjI5NCAyMi4xOTY1VjIzLjk5MjRDMjcuNjI5MiAyNS42NDkxIDI2LjI4NjEgMjYuOTkyNCAyNC42Mjk0IDI2Ljk5MjRIMjIuODM0NUMyMS4xNzc4IDI2Ljk5MjQgMTkuODM0NyAyNS42NDkgMTkuODM0NSAyMy45OTI0VjIyLjE5NjVDMTkuODM0NSAyMS43MTQ4IDE5LjQ5NTcgMjEuMjMyNyAxOS4wMTQgMjEuMjMyN0gxNi40NzkyQzE1Ljc5NzUgMjEuMjMyNyAxNS4zMzc0IDIyLjAwNjEgMTUuMzM3NCAyMi42ODc3VjIzLjgzMzNDMTUuMzM3MyAyNS40OSAxMy45OTQyIDI2LjgzMzMgMTIuMzM3NCAyNi44MzMzSDExLjE5MTlDOS41MzUwOSAyNi44MzMzIDguMTkxOTggMjUuNDkgOC4xOTE4OSAyMy44MzMzVjIyLjY4NzdDOC4xOTE4OSAyMS4wMzA5IDkuNTM1MDQgMTkuNjg3NyAxMS4xOTE5IDE5LjY4NzdIMTIuMzM3NEMxMy4xOTY0IDE5LjY4NzcgMTQuMzk5OSAxOS4wOTU5IDE0LjM5OTkgMTguMjM2OVYxNi4wMTg1QzE0LjM5OTkgMTQuOTUxOCAxNS4yNjQ2IDE0LjA4NzIgMTYuMzMxMiAxNC4wODcySDE5LjQzNUMyMC4wNTk2IDE0LjA4NzIgMjAuNDg0IDEzLjQwNzEgMjAuNDgzOSAxMi43ODI1VjExLjYzN0MyMC40ODM5IDkuOTgwMTEgMjEuODI3IDguNjM2OTYgMjMuNDgzOSA4LjYzNjk2SDI0LjYyOTRaTTEzLjQxMTYgMTEuMjQ2OEMxMy40MTE2IDEyLjY4ODIgMTIuMjQzMSAxMy44NTY3IDEwLjgwMTggMTMuODU2N0M5LjM2MDM3IDEzLjg1NjcgOC4xOTE4OSAxMi42ODgyIDguMTkxODkgMTEuMjQ2OEM4LjE5MTg5IDkuODA1NDQgOS4zNjAzNyA4LjYzNjk2IDEwLjgwMTggOC42MzY5NkMxMi4yNDMxIDguNjM2OTYgMTMuNDExNiA5LjgwNTQ0IDEzLjQxMTYgMTEuMjQ2OFoiIGZpbGw9InVybCgjYSkiLz48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImEiIHgxPSIxNS4xNDgxIiB5MT0iOS45NDE4OCIgeDI9IjE1LjE0ODEiIHkyPSIxMy42Mzc1IiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHN0b3Agc3RvcC1jb2xvcj0iIzU0RUNFNyIvPjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iIzY1OEVGRiIvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPjwvc3ZnPg==";
		/** One entry's icon: a 32px tile holding a 24px image (design §8.3).
		*
		* An author's icon reaches the DOM only here, as this `<img>`'s `src` — a
		* `data:` URL built from bytes the catalog carried. Never `innerHTML`, never
		* an inline `<svg>`: an image document runs no script and loads nothing
		* external, and that is the whole defence for an SVG (§8.5).
		*
		* `onError` swaps a source that will not decode for the default, as dsh's own
		* `PackageArtwork` does. The failed source, not a boolean, is remembered, so a
		* later entry reusing this component instance still tries its own icon.
		*/
		function EntryIcon({ icon }) {
			const [failed, setFailed] = (0, react.useState)(void 0);
			const src = icon === void 0 || icon === failed ? DEFAULT_ICON_DATA_URL : icon;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: _dsh_plugin_shop_css_61217181_default.entryIcon,
				"aria-hidden": "true",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
					className: _dsh_plugin_shop_css_61217181_default.entryIconImage,
					src,
					width: 24,
					height: 24,
					alt: "",
					onError: () => {
						setFailed(icon);
					}
				})
			});
		}
		//#endregion
		//#region src/client/ShopTab.tsx
		/** The shop tab: browse the catalog, detail an entry, install on one click,
		* poll the install to its terminal state (§7.2).
		* Everything the tab renders is text — summaries, capabilities, log lines,
		* details — never markup, so hostile npm descriptions cannot inject (spec
		* §11.3.4): no render path here may ever use dangerouslySetInnerHTML. */
		/** The project's home on GitHub, linked from the toolbar. */
		const SHOP_REPO_URL = "https://github.com/LivXue/dsh-plugin-shop";
		/**
		* An install whose on-disk figure reaches this many bytes is tinted on the
		* card and says so in its tooltip (design 2026-11-02-market-borrowings §2).
		*
		* 50 MB is not measured here: it is the line the competitor's own users
		* proposed after a 21-plugin audit, where the four heaviest entries ran from
		* 18 MB to 216 MB and a reader found out mid-install
		* (dsh-market/dsh-market#1008). The figure is a hint, never a refusal — a
		* large plugin installs exactly as a small one does.
		*/
		const LARGE_INSTALL_BYTES = 52428800;
		/** The class of every root the tab renders, the crash fallback's included:
		* the panel, plus `notranslate`, which with `translate="no"` keeps a browser's
		* page translation out of the text nodes React owns. Translation rewrites
		* those nodes, and React's next commit throws on the ones it no longer finds
		* (design 2026-09-26-market-borrowings §4). The tab renders no portals, so its
		* root is its whole surface. */
		const PANEL_ROOT = `${_dsh_plugin_shop_css_61217181_default.panel} notranslate`;
		/** What the tab is trying to load, and with which catalog cache behavior:
		* a refresh forces the network re-fetch while the stale snapshot stays
		* visible (§10); a retry leaves the error state and starts from loading; a
		* reverdict (design 2026-09-01-harness-compatibility section 9.1) asks
		* again with the host's own snapshot and freshness window — never a network
		* refresh — after an install or uninstall settles `done`, so a badge
		* computed before the mutation does not survive it. Like a refresh, the
		* stale snapshot stays on screen while it runs, and a failed reverdict
		* leaves the screen exactly as it was, with no note — it was never a click
		* the reader made, so there is nothing to report failing. A reverdict
		* carries the page store's `reverdicts` count it was asked at, which its
		* answer hands back to clear it. A refresh or a retry carries the count of
		* a reverdict pending when it was clicked, or null: it supersedes that
		* reverdict's request, and the host judges it after the settle that raised
		* the reverdict, so its answer clears the reverdict, and a failure asks for
		* it again. */
		/** How long a shop left in a background tab may show a stale catalog after
		* the tab comes back to the front (design 2026-11-05-failure-report.md §3).
		* Five minutes is the skin market's interval: long enough that switching
		* windows never spends a request, short enough that a catalogue published
		* while the reader was away is one focus away. */
		const FOCUS_REFRESH_MS = 3e5;
		function ChevronIcon({ open }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				viewBox: "0 0 16 16",
				width: "14",
				height: "14",
				"aria-hidden": "true",
				className: open ? _dsh_plugin_shop_css_61217181_default.chevronOpen : _dsh_plugin_shop_css_61217181_default.chevron,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					fill: "currentColor",
					d: "M3.5 6 8 10.5 12.5 6l1 1L8 12.5 2.5 7l1-1Z"
				})
			});
		}
		/** One entry card: the category spine and cover band, the expandable header
		* (name, tier, category), the plain-text summary in both
		* languages, the self-declared capabilities, the detail section, and the
		* install controls. An installed plugin's card carries its installed row:
		* current → the non-interactive installed label, behind → the update button;
		* uninstalled → the install button. */
		const EntryCard = (0, react.memo)(function EntryCard({ entry, icon, stars, order, shelfDay, installed, missing, harness, nameTakenBy, t, flow, uninstallFlow, restart, restartBlocked, reload, setEnabled, inInstalledView, page, favorite, onFavorite, rollback, shopVersion }) {
			const key = entryKey(entry);
			const [rollbackReceipt, setRollbackReceipt] = (0, react.useState)(null);
			const open = (0, react.useSyncExternalStore)(page.subscribeExpanded, () => page.isExpanded(key));
			const [, rerender] = (0, react.useReducer)((count) => count + 1, 0);
			const blockers = stateBlockers(blockersOf(missing, harness, nameTakenBy), t);
			const detailId = (0, react.useId)();
			const summary = entry.catalog?.summary;
			const npmUrl = npmPageUrl(entry);
			const author = authorOf(entry);
			const size = formatSize(entry.installSize);
			const largeSize = entry.installSize !== void 0 && entry.installSize >= LARGE_INSTALL_BYTES;
			const version = versionLabel(entry.source, entry.version);
			const versionName = t(versionLabelKey(version.kind), { version: version.value });
			const category = entry.catalog?.category ?? "other";
			const installTarget = {
				name: entry.name,
				version: entry.version,
				source: entry.source,
				repo: entry.repo,
				subdir: entry.subdir
			};
			const uninstalling = uninstallFlow.view.kind === "running";
			const removed = uninstallFlow.view.kind === "done";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: _dsh_plugin_shop_css_61217181_default.card,
				"data-shop-entry": entry.name,
				"data-category": category,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: _dsh_plugin_shop_css_61217181_default.cardSpine,
						"aria-hidden": "true"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: _dsh_plugin_shop_css_61217181_default.entryHeader,
						"aria-expanded": open,
						"aria-controls": detailId,
						onClick: () => {
							page.toggleExpanded(key);
							rerender();
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(EntryIcon, { icon }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: _dsh_plugin_shop_css_61217181_default.entryHeading,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: _dsh_plugin_shop_css_61217181_default.name,
									children: entry.name
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: _dsh_plugin_shop_css_61217181_default.badges,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: _dsh_plugin_shop_css_61217181_default.categoryBadge,
											children: t(categoryKey(entry))
										}),
										entry.source === "npm" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: _dsh_plugin_shop_css_61217181_default.sourceBadge,
											"data-shop-source-npm": true,
											role: "img",
											"aria-label": t("npmSource"),
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
												viewBox: "0 0 16 16",
												width: "12",
												height: "12",
												"aria-hidden": "true",
												fill: "currentColor",
												children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
													fillRule: "evenodd",
													d: "M0 0v16h16V0H0zm13 13h-2V6H8v7H3V3h10v10z"
												})
											})
										}),
										hasGithubHome(entry) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: _dsh_plugin_shop_css_61217181_default.sourceBadge,
											"data-shop-source-github": true,
											role: "img",
											"aria-label": t("githubSource"),
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
												viewBox: "0 0 16 16",
												width: "12",
												height: "12",
												"aria-hidden": "true",
												fill: "currentColor",
												children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" })
											})
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: _dsh_plugin_shop_css_61217181_default.cardVersion,
											"data-card-version": true,
											role: "img",
											"aria-label": versionName,
											title: versionName,
											children: version.text
										}),
										entry.tier !== "community" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: _dsh_plugin_shop_css_61217181_default.tierBadge,
											"data-tier": entry.tier,
											children: t(tierKey(entry.tier))
										}),
										entry.archived === true && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: _dsh_plugin_shop_css_61217181_default.tierBadge,
											"data-tier": "archived",
											children: t("archivedBadge")
										}),
										stars !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: _dsh_plugin_shop_css_61217181_default.starsBadge,
											role: "img",
											"aria-label": t("stars", { count: stars }),
											children: ["★ ", formatStars(stars)]
										})
									]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChevronIcon, { open })
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: _dsh_plugin_shop_css_61217181_default.body,
						children: [
							summary !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: open ? `${_dsh_plugin_shop_css_61217181_default.summary} ${_dsh_plugin_shop_css_61217181_default.summaryExpanded}` : _dsh_plugin_shop_css_61217181_default.summary,
								children: summary.en
							}),
							summary?.zh !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: open ? `${_dsh_plugin_shop_css_61217181_default.summaryZh} ${_dsh_plugin_shop_css_61217181_default.summaryZhExpanded}` : _dsh_plugin_shop_css_61217181_default.summaryZh,
								children: summary.zh
							}),
							blockers.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FoldableRedBlock, {
								t,
								attrName: "data-shop-remedy",
								children: blockers.map((blocker) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BlockerLine, {
									blocker,
									className: _dsh_plugin_shop_css_61217181_default.incompatibleDetail,
									surface: "detail"
								}, blocker.kind))
							}),
							open && entry.catalog !== void 0 && entry.catalog.capabilities.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: _dsh_plugin_shop_css_61217181_default.capabilitiesBlock,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: _dsh_plugin_shop_css_61217181_default.capabilitiesNote,
									children: t("capabilitiesNote")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
									className: _dsh_plugin_shop_css_61217181_default.capabilities,
									children: entry.catalog.capabilities.map((capability) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: capability }, capability))
								})]
							}),
							open && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
								id: detailId,
								className: _dsh_plugin_shop_css_61217181_default.detail,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
									className: _dsh_plugin_shop_css_61217181_default.detailRows,
									children: [
										npmUrl !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: _dsh_plugin_shop_css_61217181_default.detailRow,
											"data-shop-npm": true,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("npmPage") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
												href: npmUrl,
												target: "_blank",
												rel: "noopener noreferrer",
												children: npmUrl
											}) })]
										}),
										entry.repository !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: _dsh_plugin_shop_css_61217181_default.detailRow,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("repository") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: /^https?:\/\//.test(entry.repository) ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
												href: entry.repository,
												target: "_blank",
												rel: "noopener noreferrer",
												children: entry.repository
											}) : entry.repository })]
										}),
										entry.license !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: _dsh_plugin_shop_css_61217181_default.detailRow,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("license") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: isCustomLicense(entry.license) ? t("customLicense") : entry.license })]
										}),
										entry.engines !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: _dsh_plugin_shop_css_61217181_default.detailRow,
											"data-shop-engines": true,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("requiresDsh") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: entry.engines.trim() === "" ? JSON.stringify(entry.engines) : entry.engines })]
										}),
										entry.dependencies !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: _dsh_plugin_shop_css_61217181_default.detailRow,
											"data-shop-dependencies": true,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("dependencies") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: entry.dependencies })]
										}),
										entry.bin !== void 0 && entry.bin.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: _dsh_plugin_shop_css_61217181_default.detailRow,
											"data-shop-bin": true,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("commands") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: entry.bin.join(", ") })]
										}),
										entry.installScripts === true && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: _dsh_plugin_shop_css_61217181_default.detailRow,
											"data-shop-install-scripts": true,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("installScripts") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: t("installScriptsDeclared") })]
										})
									]
								}), entry.tier === "verified-stale" && entry.review !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: _dsh_plugin_shop_css_61217181_default.reviewedLine,
									children: entry.review.reviewedVersion !== void 0 ? t("reviewedVersionLine", {
										reviewed: versionLabel("npm", entry.review.reviewedVersion).text,
										current: version.text
									}) : t("reviewedPinLine", {
										pin: reviewHashPin(entry.review),
										current: version.text
									})
								})]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: _dsh_plugin_shop_css_61217181_default.cardActions,
						"data-shop-actions": true,
						children: [
							onFavorite !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: favorite === true ? `${_dsh_plugin_shop_css_61217181_default.favoriteButton} ${_dsh_plugin_shop_css_61217181_default.favoriteButtonOn}` : _dsh_plugin_shop_css_61217181_default.favoriteButton,
								"data-shop-favorite": favorite === true ? "on" : "off",
								"aria-pressed": favorite === true,
								"aria-label": t(favorite === true ? "unfavorite" : "favorite"),
								title: t(favorite === true ? "unfavorite" : "favorite"),
								onClick: onFavorite,
								children: "★"
							}),
							installed === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [uninstallFlow.view.kind !== "idle" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UninstallPanel, {
								name: entry.name,
								t,
								restart,
								restartBlocked,
								reload,
								flow: uninstallFlow
							}, "uninstall"), !inInstalledView && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(InstallPanel, {
								target: installTarget,
								tier: entry.tier,
								blockers,
								blockersStated: true,
								github: githubSlugOf(entry.repo, entry.repository),
								shopVersion,
								flow,
								t,
								restart,
								restartBlocked,
								reload
							}, "install")] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								removed ? null : installed.outdated || flow.view.kind !== "idle" && !(uninstalling && flow.view.kind !== "running") ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(InstallPanel, {
									target: installTarget,
									tier: entry.tier,
									variant: installed.outdated ? "update" : "install",
									locked: uninstalling,
									blockers,
									blockersStated: true,
									github: githubSlugOf(entry.repo, entry.repository),
									shopVersion,
									flow,
									t,
									restart,
									restartBlocked,
									reload
								}, "install") : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: _dsh_plugin_shop_css_61217181_default.installedLabel,
									"data-shop-installed": true,
									children: t("installed")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BlockerBadge, {
									blockers,
									t
								})] }, "installed"),
								rollback !== void 0 && !removed && !uninstalling ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RollbackControl, {
									identity: key,
									version: versionLabel(entry.source, rollback.version).text,
									t,
									start: rollback.start,
									status: rollback.status,
									onSettled: rollback.onSettled,
									onDone: setRollbackReceipt,
									restart,
									restartBlocked,
									reload
								}) : rollbackReceipt !== null && !removed && !uninstalling ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: _dsh_plugin_shop_css_61217181_default.rollbackGroup,
									"data-shop-rollback-done": true,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActivationOffer, {
										activation: rollbackReceipt,
										t,
										restart,
										restartBlocked,
										reload,
										where: "install",
										trailing: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: _dsh_plugin_shop_css_61217181_default.cancelButton,
											"data-shop-rollback-dismiss": true,
											onClick: () => {
												setRollbackReceipt(null);
											},
											children: t("dismiss")
										})
									})
								}) : null,
								!removed && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EnabledSwitch, {
									row: installed,
									surface: "card",
									page,
									t,
									setEnabled,
									restart,
									restartBlocked,
									reload,
									locked: uninstalling
								}, "switch"),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(UninstallPanel, {
									name: entry.name,
									t,
									restart,
									restartBlocked,
									reload,
									flow: uninstallFlow
								}, "uninstall")
							] }),
							(size !== void 0 || author !== null || shelfDay !== void 0) && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: _dsh_plugin_shop_css_61217181_default.cardMeta,
								children: [
									shelfDay !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: _dsh_plugin_shop_css_61217181_default.shelfDate,
										"data-shop-shelf-date": true,
										children: t(order === "added" ? "listedOn" : "updatedOn", { date: shelfDay })
									}),
									size !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: largeSize ? `${_dsh_plugin_shop_css_61217181_default.size} ${_dsh_plugin_shop_css_61217181_default.sizeLarge}` : _dsh_plugin_shop_css_61217181_default.size,
										"data-shop-size": true,
										...largeSize ? { "data-shop-size-large": "" } : {},
										role: "img",
										"aria-label": t(largeSize ? "sizeLabelLarge" : "sizeLabel", { size }),
										title: t(largeSize ? "sizeLabelLarge" : "sizeLabel", { size }),
										children: size
									}),
									author !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: _dsh_plugin_shop_css_61217181_default.author,
										"data-shop-author": true,
										children: t("authorLine", { author })
									})
								]
							})
						]
					})
				]
			});
		});
		/**
		* Everything standing in this entry's way, localized ONCE per surface: the
		* detail paragraphs and the badge summarizing them read this one list, so
		* they can never be built from different inputs.
		*
		* The host sent facts — module names, the declared range and the running
		* version, the declared and the running profile — and the sentences are this
		* dictionary's, in the reader's own language (§4: no copy crosses the RPC).
		*/
		function stateBlockers(blockers, t) {
			return blockers.map((blocker) => {
				const text = blockerText(blocker, t);
				return blocker.kind === "harness-peers" && blocker.allowCommand !== null ? {
					kind: blocker.kind,
					text,
					remedy: {
						lead: t("harnessPeersRemedy"),
						command: blocker.allowCommand
					}
				} : {
					kind: blocker.kind,
					text
				};
			});
		}
		/**
		* One blocker as a surface prints it: its sentence in the surface's own
		* paragraph style, and after it, for a refusal the reader can clear, the
		* lead-in and the command on a line of its own — selectable as a whole, since
		* it goes to a terminal unchanged. `surface` names the attribute a locator
		* reads: the card's detail line, or the warning the gate and the outdated
		* row's refusal print.
		*/
		function BlockerLine({ blocker, className, surface }) {
			const attribute = surface === "detail" ? { "data-shop-incompatible-detail": blocker.kind } : { "data-shop-incompatible-warning": blocker.kind };
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className,
				...attribute,
				children: blocker.text
			}), blocker.remedy !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: _dsh_plugin_shop_css_61217181_default.remedy,
				"data-shop-remedy": blocker.kind,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: _dsh_plugin_shop_css_61217181_default.remedyLead,
					children: blocker.remedy.lead
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
					className: _dsh_plugin_shop_css_61217181_default.allowCommand,
					"data-shop-allow-command": true,
					children: blocker.remedy.command
				})]
			})] });
		}
		/** One blocker's sentence. Exhaustive with no default, so a kind added
		* to `Blocker` is a type error here rather than a line that renders nothing. */
		function blockerText(blocker, t) {
			switch (blocker.kind) {
				case "name-taken": return t("nameTakenDetail", { holder: blocker.holder });
				case "harness-peers": return t("harnessPeersDetail", {
					running: blocker.running,
					peers: refusedPeersText(blocker.refused)
				});
				case "missing-peers": return t("incompatibleDetail", { modules: blocker.modules.join(", ") });
				case "harness-range": return t("harnessRangeDetail", {
					range: blocker.range,
					running: blocker.running
				});
				case "harness-profile": return t("harnessProfileDetail", {
					declared: blocker.declared.join(", "),
					running: blocker.running
				});
			}
		}
		/** The harness-compatibility verdict, rendered beside the control it
		* qualifies. It answers "what happens if I press this", not "what is this",
		* so it belongs to the action row and not among the identity badges in the
		* header — where it also sat inside a <button>, competing with that button's
		* own hit area for the tooltip. Renders nothing when nothing stands in the
		* way. */
		function BlockerBadge({ blockers, t }) {
			const lead = blockers[0];
			const word = blockerBadgeKey(blockers);
			if (lead === void 0 || word === null) return null;
			const detail = blockers.map((blocker) => blocker.text).join("\n");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: _dsh_plugin_shop_css_61217181_default.incompatibleBadge,
				"data-shop-blocker": lead.kind,
				role: "img",
				"aria-label": detail,
				title: detail,
				children: t(word)
			});
		}
		/** One entry's install flow: the button (or the refused LABEL that stands in
		* its place), and the live view — running log, restart notice, failure detail,
		* rejection detail — driven by the page store's install registry. Shared by
		* the catalog cards (`variant: 'install'`) and the outdated rows' update
		* button (`variant: 'update'`, which drives the same install flow for
		* `name@latest`).
		*
		* There is no §9.3 dialog. Until 2026-10-14 a community entry opened an
		* acknowledgement gate first, and that gate was also the only thing standing
		* between a second press and a second RPC — it reopened instead of asking
		* again. What replaced it is one click that carries `acknowledged: true`, and
		* the flow registry's in-flight guard (flow-registry.ts, `starting`), which
		* keeps a second press from becoming a second RPC. The page states the
		* dialog's facts nowhere since 2026-10-15 (the shop design's §7 amendment of
		* that date). */
		/**
		* The command a failed install ran, with a copy button (design
		* 2026-11-02-market-borrowings §5).
		*
		* The line is shown whether or not the clipboard works: on an insecure origin
		* `navigator.clipboard` is absent, and in a jsdom test it is too, so the
		* button degrades to a no-op while the code stays selectable. Nothing is ever
		* claimed as copied when it was not — the label flips only after the write
		* resolved.
		*/
		function CommandLine({ command, t }) {
			const [copied, setCopied] = (0, react.useState)(false);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: _dsh_plugin_shop_css_61217181_default.commandLine,
				"data-shop-command": true,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
					className: _dsh_plugin_shop_css_61217181_default.commandText,
					children: command
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: _dsh_plugin_shop_css_61217181_default.copyButton,
					"data-shop-copy-command": true,
					onClick: () => {
						(async () => {
							try {
								await navigator.clipboard.writeText(command);
								setCopied(true);
							} catch {}
						})();
					},
					children: t(copied ? "copied" : "copyCommand")
				})]
			});
		}
		/**
		* The rollback offer on an installed card (design 2026-11-02-market-borrowings
		* §6): re-install the version this plugin was updated from.
		*
		* Deliberately NOT driven through the install flow registry. That registry's
		* Retry re-sends the panel's own target — the catalog's latest version — so a
		* failed rollback followed by Retry would install the very version the reader
		* is trying to leave. A rollback has one action, one outcome and no retry
		* button it cannot honour, so it polls its own record instead and asks the tab
		* to re-read the installed list once the host says done.
		*/
		function RollbackControl({ identity, version, t, start, status, onSettled, onDone, restart, restartBlocked, reload }) {
			const [state, setState] = (0, react.useState)("idle");
			const [detail, setDetail] = (0, react.useState)("");
			const alive = (0, react.useRef)(true);
			(0, react.useEffect)(() => () => {
				alive.current = false;
			}, []);
			const run = async () => {
				setState("running");
				setDetail("");
				let installId;
				try {
					const result = await start({ key: identity });
					if (!result.ok) {
						if (alive.current) {
							setState("failed");
							setDetail(result.detail);
						}
						return;
					}
					installId = result.installId;
				} catch {
					if (alive.current) {
						setState("failed");
						setDetail("");
					}
					return;
				}
				for (;;) {
					await new Promise((resolve) => setTimeout(resolve, 500));
					if (!alive.current) return;
					let answer;
					try {
						answer = await status({ installId });
					} catch {
						continue;
					}
					if (!alive.current) return;
					if (!answer.found) {
						setState("failed");
						setDetail(answer.detail ?? "");
						return;
					}
					if (answer.state === "failed") {
						setState("failed");
						setDetail(answer.detail ?? "");
						return;
					}
					if (answer.state === "done") {
						setState("idle");
						onDone(answer.activation ?? "restart");
						onSettled();
						return;
					}
				}
			};
			if (state === "running") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: _dsh_plugin_shop_css_61217181_default.rollbackNote,
				"data-shop-rollback-running": true,
				children: t("rollingBack")
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: _dsh_plugin_shop_css_61217181_default.rollbackGroup,
				"data-shop-rollback-group": true,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: _dsh_plugin_shop_css_61217181_default.rollbackButton,
					"data-shop-rollback": true,
					onClick: () => {
						run();
					},
					children: t("rollbackTo", { version })
				}), state === "failed" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: _dsh_plugin_shop_css_61217181_default.rollbackNote,
					"data-shop-rollback-failed": true,
					children: detail === "" ? t("rollbackFailed") : detail
				})]
			});
		}
		function InstallPanel({ target, tier, blockers, blockersStated = false, variant = "install", locked = false, github = null, shopVersion, flow, t, restart, restartBlocked, reload }) {
			const { view: flowView, start, starting, reset } = flow;
			const view = locked && flowView.kind !== "running" ? { kind: "idle" } : flowView;
			const request = {
				...target,
				acknowledged: tier === "verified" ? void 0 : true
			};
			const refused = refusesInstall(blockers);
			const word = blockerBadgeKey(blockers);
			if (view.kind === "running") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: _dsh_plugin_shop_css_61217181_default.installPanel,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: _dsh_plugin_shop_css_61217181_default.installing,
					children: t(installPhaseKey(view.phase))
				}), view.log.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: _dsh_plugin_shop_css_61217181_default.log,
					"data-shop-log": true,
					children: view.log.map((line, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: _dsh_plugin_shop_css_61217181_default.logLine,
						"data-shop-log-line": true,
						children: line
					}, index))
				})]
			});
			if (view.kind === "done") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: _dsh_plugin_shop_css_61217181_default.receipt,
				children: [
					view.log.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: _dsh_plugin_shop_css_61217181_default.log,
						"data-shop-log": true,
						children: view.log.map((line, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: _dsh_plugin_shop_css_61217181_default.logLine,
							"data-shop-log-line": true,
							children: line
						}, index))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: _dsh_plugin_shop_css_61217181_default.notice,
						"data-shop-restart-notice": true,
						children: t(activationNoticeKey(view.activation, view.restartReason))
					}),
					view.detail !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: _dsh_plugin_shop_css_61217181_default.notice,
						"data-shop-done-note": true,
						children: view.detail
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActivationOffer, {
						activation: view.activation,
						t,
						restart,
						restartBlocked,
						reload,
						where: "install",
						trailing: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: _dsh_plugin_shop_css_61217181_default.cancelButton,
							"data-shop-install-dismiss": true,
							onClick: reset,
							children: t("dismiss")
						})
					})
				]
			});
			if (view.kind === "failed") {
				const report = failureReportUrl({
					verb: variant === "update" ? "update" : "install",
					name: target.name,
					version: target.version,
					source: target.source ?? "npm",
					repo: github,
					detail: view.detail === "" ? t("installTransportFailed") : view.detail,
					log: view.log,
					shopVersion
				});
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: _dsh_plugin_shop_css_61217181_default.installPanel,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: _dsh_plugin_shop_css_61217181_default.failedHeading,
							children: t("installFailed")
						}),
						view.log.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: _dsh_plugin_shop_css_61217181_default.log,
							"data-shop-log": true,
							children: view.log.map((line, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: _dsh_plugin_shop_css_61217181_default.logLine,
								"data-shop-log-line": true,
								children: line
							}, index))
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: _dsh_plugin_shop_css_61217181_default.failedDetail,
							children: view.detail === "" ? t("installTransportFailed") : view.detail
						}),
						view.command !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CommandLine, {
							command: view.command,
							t
						}),
						report !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: _dsh_plugin_shop_css_61217181_default.reportLine,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
								className: _dsh_plugin_shop_css_61217181_default.reportLink,
								"data-shop-report": true,
								href: report,
								target: "_blank",
								rel: "noopener noreferrer",
								children: t("reportProblem")
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: _dsh_plugin_shop_css_61217181_default.offerActions,
							"data-shop-offer": true,
							children: refused && word !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: _dsh_plugin_shop_css_61217181_default.cancelButton,
								"data-shop-install-dismiss": true,
								onClick: reset,
								children: t("dismiss")
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: _dsh_plugin_shop_css_61217181_default.installButton,
								"data-shop-install-retry": true,
								disabled: starting,
								onClick: () => {
									start(request);
								},
								children: t("retry")
							})
						})
					]
				});
			}
			if (view.kind === "rejected") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: _dsh_plugin_shop_css_61217181_default.installPanel,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: _dsh_plugin_shop_css_61217181_default.rejectedCode,
						children: t(rejectionCodeKey(view.code))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: _dsh_plugin_shop_css_61217181_default.rejectedDetail,
						children: view.detail
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: _dsh_plugin_shop_css_61217181_default.cancelButton,
						"data-shop-install-dismiss": true,
						onClick: reset,
						children: t("dismiss")
					})
				]
			});
			const update = variant === "update";
			const detail = blockers.map((blocker) => blocker.text).join("\n");
			if (refused && word !== null) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: _dsh_plugin_shop_css_61217181_default.refusedLabel,
				"data-shop-refused": true,
				"data-shop-blocker-kind": blockers[0]?.kind,
				role: "img",
				"aria-label": detail,
				title: detail,
				children: t(word)
			}), !blockersStated && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FoldableRedBlock, {
				t,
				attrName: "data-shop-refusal",
				children: blockers.map((blocker) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BlockerLine, {
					blocker,
					className: _dsh_plugin_shop_css_61217181_default.gateWarning,
					surface: "warning"
				}, blocker.kind))
			})] });
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: _dsh_plugin_shop_css_61217181_default.installButton,
					disabled: starting || locked,
					...update ? { "data-shop-update": true } : { "data-shop-install": true },
					onClick: () => {
						start(request);
					},
					children: t(update ? "update" : "install")
				}),
				blockers.length > 0 && !refused && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BlockerBadge, {
					blockers,
					t
				}),
				!blockersStated && blockers.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FoldableRedBlock, {
					t,
					attrName: "data-shop-blocker-lines",
					children: blockers.map((blocker) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BlockerLine, {
						blocker,
						className: _dsh_plugin_shop_css_61217181_default.gateWarning,
						surface: "warning"
					}, blocker.kind))
				})
			] });
		}
		/** One installed entry's uninstall flow: remove from the profile through the
		* same executor records and poll loop as installs. Uninstalling revokes
		* privilege rather than granting it, so there is no acknowledgement gate —
		* §9.3 is about granting. A business failure (not in the catalog / not
		* installed) lands in the failed view with the host's published detail; a
		* transport failure carries the empty detail and the localized fallback. */
		function UninstallPanel({ name, t, restart, restartBlocked, reload, flow }) {
			const { view, start, reset } = flow;
			if (view.kind === "running") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: _dsh_plugin_shop_css_61217181_default.installPanel,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: _dsh_plugin_shop_css_61217181_default.installing,
					children: t("uninstalling")
				}), view.log.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: _dsh_plugin_shop_css_61217181_default.log,
					"data-shop-log": true,
					children: view.log.map((line, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: _dsh_plugin_shop_css_61217181_default.logLine,
						"data-shop-log-line": true,
						children: line
					}, index))
				})]
			});
			if (view.kind === "done") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: _dsh_plugin_shop_css_61217181_default.receipt,
				children: [
					view.log.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: _dsh_plugin_shop_css_61217181_default.log,
						"data-shop-log": true,
						children: view.log.map((line, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: _dsh_plugin_shop_css_61217181_default.logLine,
							"data-shop-log-line": true,
							children: line
						}, index))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: _dsh_plugin_shop_css_61217181_default.notice,
						"data-shop-uninstall-done": true,
						children: t(uninstallActivationNoticeKey(view.activation))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActivationOffer, {
						activation: view.activation,
						t,
						restart,
						restartBlocked,
						reload,
						where: "uninstall",
						trailing: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: _dsh_plugin_shop_css_61217181_default.cancelButton,
							"data-shop-uninstall-dismiss": true,
							onClick: reset,
							children: t("dismiss")
						})
					})
				]
			});
			if (view.kind === "failed") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: _dsh_plugin_shop_css_61217181_default.installPanel,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: _dsh_plugin_shop_css_61217181_default.failedHeading,
						children: t("uninstallFailed")
					}),
					view.log.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: _dsh_plugin_shop_css_61217181_default.log,
						"data-shop-log": true,
						children: view.log.map((line, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: _dsh_plugin_shop_css_61217181_default.logLine,
							"data-shop-log-line": true,
							children: line
						}, index))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: _dsh_plugin_shop_css_61217181_default.failedDetail,
						children: view.detail === "" ? t("uninstallTransportFailed") : view.detail
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: _dsh_plugin_shop_css_61217181_default.offerActions,
						"data-shop-offer": true,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: _dsh_plugin_shop_css_61217181_default.uninstallButton,
							"data-shop-uninstall-retry": true,
							onClick: () => void start({ name }),
							children: t("retry")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: _dsh_plugin_shop_css_61217181_default.cancelButton,
							"data-shop-uninstall-dismiss": true,
							onClick: reset,
							children: t("dismiss")
						})]
					})
				]
			});
			if (view.kind !== "idle") return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: _dsh_plugin_shop_css_61217181_default.uninstallButton,
				"data-shop-uninstall": true,
				onClick: () => void start({ name }),
				children: t("uninstall")
			});
		}
		/** The page's restart, re-rendering whenever it changes state. Shared by
		* every restart offer and by the version row, in this tab and in whatever
		* tab an HMR swap mounts in its place. */
		function useRestartMonitor() {
			return (0, react.useSyncExternalStore)(subscribeRestartMonitor, readRestartMonitor);
		}
		/** The §8 restart flow (amendment 2026-08-27): after an install, update, or
		* uninstall reports done, this panel offers a restart of dsh. The
		* confirmation gate states the cost — the page disconnects and in-flight
		* conversations/tasks are interrupted — and on confirm the page asks the host
		* (restart-monitor.ts), which commits the two-phase handoff: the host exits,
		* a helper re-runs dsh, and the page's monitor polls the origin after a grace
		* period, refreshing the page once the NEW server keeps answering. A refused
		* restart renders the host's published detail above the offer, which stays;
		* a server that never comes back names the manual command. */
		function RestartPanel({ t, restart, reload, gate, trailing }) {
			const [ownGateOpen, setOwnGateOpen] = (0, react.useState)(false);
			const gateOpen = gate === void 0 ? ownGateOpen : gate.open;
			const setGateOpen = (open) => {
				if (gate === void 0) setOwnGateOpen(open);
				else if (!open) gate.close();
			};
			const [refusal, setRefusal] = (0, react.useState)(null);
			const monitor = useRestartMonitor();
			const onConfirm = async () => {
				setGateOpen(false);
				setRefusal(null);
				const outcome = await requestRestart({
					reload,
					restart
				});
				if (outcome.kind === "refused") setRefusal(outcome.detail);
				else if (outcome.kind === "unreachable") setRefusal(t("restartTransportFailed"));
			};
			const tail = trailing === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: _dsh_plugin_shop_css_61217181_default.offerActions,
				"data-shop-offer": true,
				children: trailing
			});
			if (monitor?.kind === "requesting" || monitor?.kind === "restarting") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: _dsh_plugin_shop_css_61217181_default.notice,
				"data-shop-restarting": true,
				children: t("restarting")
			}), tail] });
			if (monitor?.kind === "failed") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: _dsh_plugin_shop_css_61217181_default.failedDetail,
				"data-shop-restart-error": true,
				children: monitor.logFile === void 0 ? t("restartFailedNotice") : t("restartFailedLogNotice", { log: monitor.logFile })
			}), tail] });
			if (monitor?.kind === "not-restarted") return tail;
			if (gateOpen) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: _dsh_plugin_shop_css_61217181_default.gate,
				"data-shop-restart-gate": true,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: _dsh_plugin_shop_css_61217181_default.gateTitle,
						children: t("restartTitle")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: _dsh_plugin_shop_css_61217181_default.gateBody,
						children: t("restartBody")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: _dsh_plugin_shop_css_61217181_default.gateActions,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: _dsh_plugin_shop_css_61217181_default.confirmButton,
							"data-shop-restart-confirm": true,
							onClick: () => void onConfirm(),
							children: t("restartConfirm")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: _dsh_plugin_shop_css_61217181_default.cancelButton,
							onClick: () => setGateOpen(false),
							children: t("cancel")
						})]
					})
				]
			}), tail] });
			const refused = refusal === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: _dsh_plugin_shop_css_61217181_default.failedDetail,
				"data-shop-restart-error": true,
				children: refusal
			});
			if (gate !== void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [refused, tail] });
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [refused, /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: _dsh_plugin_shop_css_61217181_default.offerActions,
				"data-shop-offer": true,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: _dsh_plugin_shop_css_61217181_default.restartButton,
					"data-shop-restart": true,
					onClick: () => setGateOpen(true),
					children: t("restart")
				}), trailing]
			})] });
		}
		/**
		* The page reloaded into the very process it asked to restart
		* (restart-monitor.ts `noteBoot`): said once, above everything, because
		* whatever asked for the restart — a self-update, a card, a switch — has
		* nothing left on screen after the reload to say it under. It names the
		* process to stop, when the host named it, and the command that starts dsh
		* again; the log holds what the handoff did, which tells an old process that
		* never exited from a new one that died in boot (design §8, 2026-10-06
		* amendment).
		*/
		function NotRestartedNotice({ t, pid, logFile }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: _dsh_plugin_shop_css_61217181_default.selfUpdatePanel,
				"data-shop-not-restarted": true,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: _dsh_plugin_shop_css_61217181_default.failedDetail,
					children: pid === void 0 ? t("notRestartedNotice") : t("notRestartedPidNotice", { pid: String(pid) })
				}), logFile !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: _dsh_plugin_shop_css_61217181_default.failedDetail,
					children: t("notRestartedLogNotice", { log: logFile })
				})]
			});
		}
		/**
		* The §4/§8 offer under a settled install, update or uninstall: a reload
		* when the change is already live on the server and only this page is
		* stale, a restart when the host actually needs one — and can restart at
		* all (§C-1), otherwise the disabled notice says why — and neither when the
		* change landed needing neither.
		*
		* One component rather than the same three lines in each panel. The
		* precedence between the three values is a single rule, and it was written
		* out twice: two places to find when a fourth activation value arrives or
		* the `restartBlocked` gate changes, with nothing to make the second one
		* fail if it were missed.
		*/
		function ActivationOffer({ activation, t, restart, restartBlocked, reload, where, trailing }) {
			if (activation === "reload") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ReloadPanel, {
				t,
				reload,
				where,
				trailing
			});
			const tail = trailing === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: _dsh_plugin_shop_css_61217181_default.offerActions,
				"data-shop-offer": true,
				children: trailing
			});
			if (activation !== "restart") return tail;
			if (restartBlocked === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RestartPanel, {
				t,
				restart,
				reload,
				trailing
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: _dsh_plugin_shop_css_61217181_default.notice,
				"data-shop-restart-disabled": true,
				children: t(restartBlockedNoticeKey(restartBlocked))
			}), tail] });
		}
		/** The §4 reload offer: the server already holds the new state and this tab
		* does not. Never automatic — a reload discards whatever the reader had in
		* flight (a conversation, a form, an upload), and the shop knows a reload
		* would help without knowing that now is a good time. */
		function ReloadPanel({ t, reload, where, trailing }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: _dsh_plugin_shop_css_61217181_default.reloadPanel,
				"data-shop-reload": where,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: _dsh_plugin_shop_css_61217181_default.notice,
					children: t("reloadNote")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: _dsh_plugin_shop_css_61217181_default.offerActions,
					"data-shop-offer": true,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: _dsh_plugin_shop_css_61217181_default.reloadButton,
						onClick: reload,
						children: t("reload")
					}), trailing]
				})]
			});
		}
		/**
		* The hot enable/disable switch (§8). The initial state is the Host's
		* inventory verdict carried on the installed row; the click is optimistic
		* (the value flips on success) and a success renders the §8 hot note. A
		* transport throw renders the localized failure line — its private detail
		* (which can name hosts and ports) never reaches the UI.
		*/
		function EnabledSwitch({ row, surface, page, t, setEnabled, restart, restartBlocked, reload, locked = false }) {
			const [enabled, setEnabledState] = (0, react.useState)(row.enabled);
			const [toggle, setToggle] = (0, react.useState)({ kind: "idle" });
			const owedKey = switchKey(surface, identityKey(row));
			const owed = (0, react.useSyncExternalStore)(page.subscribeOwed, () => page.getOwed(owedKey) ?? "nothing");
			const onToggle = async () => {
				if (toggle.kind === "saving") return;
				const next = !enabled;
				const since = page.owedEpoch();
				setToggle({ kind: "saving" });
				try {
					const result = await setEnabled({
						name: row.name,
						enabled: next
					});
					if (result.ok) {
						setEnabledState(next);
						setToggle({
							kind: "saved",
							live: result.activation === "live"
						});
						if (result.activation === "restart") page.setOwed(owedKey, "restart", since);
						else if (result.activation !== "live") page.setOwed(owedKey, "reload", since);
					} else setToggle({
						kind: "error",
						detail: result.detail || t("toggleFailed")
					});
				} catch {
					setToggle({
						kind: "error",
						detail: t("toggleFailed")
					});
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: _dsh_plugin_shop_css_61217181_default.switchWrap,
				"data-shop-enabled-switch": row.name,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						role: "switch",
						"aria-checked": enabled,
						"aria-label": t("enabledSwitch"),
						"data-shop-toggle": true,
						className: `${_dsh_plugin_shop_css_61217181_default.switch} ${enabled ? _dsh_plugin_shop_css_61217181_default.switchOn : ""}`,
						onClick: () => void onToggle(),
						disabled: toggle.kind === "saving" || locked,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: _dsh_plugin_shop_css_61217181_default.switchKnob })
					}),
					toggle.kind === "saved" && toggle.live && owed === "nothing" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: _dsh_plugin_shop_css_61217181_default.notice,
						"data-shop-hot-apply": true,
						children: t("hotApplyNote")
					}),
					owed === "restart" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: _dsh_plugin_shop_css_61217181_default.notice,
						"data-shop-toggle-restart": true,
						children: t("toggleRestartNote")
					}),
					owed !== "nothing" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActivationOffer, {
						activation: owed,
						t,
						restart,
						restartBlocked,
						reload,
						where: "toggle"
					}),
					toggle.kind === "error" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: _dsh_plugin_shop_css_61217181_default.failedDetail,
						"data-shop-toggle-error": true,
						children: toggle.detail
					})
				]
			});
		}
		/** One outdated install row (§7.3): the name, the installed and latest
		* versions, the hot enable/disable switch, and the update button (the
		* install flow for `name@latest`, reusing `InstallPanel`). The row MUST
		* carry a `latest` string — a catalog truth to compare against; §C10's
		* shadowed rows hold `latest: null` and never reach this control, so the
		* field is narrowed at the parameter. */
		function OutdatedRow({ row, icon, tier, missing, harness, github, shopVersion, t, setEnabled, flowFor, locked, restart, restartBlocked, reload, page }) {
			const changed = whatChangedUrl(row);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: _dsh_plugin_shop_css_61217181_default.outdatedRow,
				"data-shop-outdated-entry": row.name,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: _dsh_plugin_shop_css_61217181_default.outdatedInfo,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(EntryIcon, { icon }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: _dsh_plugin_shop_css_61217181_default.outdatedText,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: _dsh_plugin_shop_css_61217181_default.name,
							children: row.name
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: _dsh_plugin_shop_css_61217181_default.outdatedVersions,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("installedVersion", { version: versionLabel(row.source, row.installed).text }) }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("latestVersion", { version: versionLabel(row.source, row.latest).text }) }),
								changed !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
									className: _dsh_plugin_shop_css_61217181_default.whatChanged,
									"data-shop-what-changed": true,
									href: changed,
									target: "_blank",
									rel: "noopener noreferrer",
									children: t("whatChanged")
								})
							]
						})]
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: _dsh_plugin_shop_css_61217181_default.outdatedActions,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(EnabledSwitch, {
						row,
						surface: "row",
						page,
						t,
						setEnabled,
						restart,
						restartBlocked,
						reload,
						locked
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(InstallPanel, {
						target: {
							name: row.name,
							version: row.latest,
							source: row.source,
							repo: row.repo,
							subdir: row.subdir
						},
						tier,
						variant: "update",
						locked,
						github,
						shopVersion,
						blockers: stateBlockers(blockersOf(missing, harness, void 0), t),
						flow: flowFor(identityKey(row)),
						t,
						restart,
						restartBlocked,
						reload
					})]
				})]
			});
		}
		/** The id the section points its `aria-labelledby` at. A bare `<section>`
		* maps to `generic`, not `region`: without an accessible name landmark
		* navigation skips the update rows, and this `<h2>` — the tab's only
		* heading, rendered last, below the whole shelf — reads as a continuation
		* of the cards above it. */
		const UPDATABLE_HEADING_ID = "dsh-shop-updatable-heading";
		/** The §7.3 installed list, rendered as the "Updatable" section: each row
		* shows both versions, a switch, and an update button. The rows are the
		* installed entries filtered to `outdated` — a current install is already
		* spoken for by its shelf card's installed label, and has no row here. The
		* heading names that filtered content, not the list it came from: it read
		* "Installed" until 2026-09-16, which was the Installed filter's label
		* character for character in both languages, over a strict subset of what
		* that filter selects. Internals stay `outdated` — the Host field name. The
		* tier is looked up from the catalog by install IDENTITY, never by name, and
		* decides whether the update's request carries the acknowledgement (a
		* community entry's does); an entry absent from the catalog is read as
		* community, so its request acknowledges, which the host accepts for any
		* tier. */
		function OutdatedSection({ state, entriesByKey, icons, missingByKey, harnessVerdicts, nameTakenByKey, shopVersion, t, setEnabled, flowFor, uninstallFor, restart, restartBlocked, reload, page }) {
			if (state.kind === "loading") return null;
			if (state.kind === "error") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: _dsh_plugin_shop_css_61217181_default.stateLine,
				"data-shop-outdated-error": true,
				children: t("installedError")
			});
			const outdated = state.entries.filter((entry) => entry.outdated && entry.latest !== null);
			if (outdated.length === 0) return null;
			const updateAll = () => {
				for (const row of outdated) {
					const key = identityKey(row);
					const flow = flowFor(key);
					if (flow.starting || flow.view.kind === "running" || flow.view.kind === "done") continue;
					if (uninstallFor(key).view.kind === "running" || uninstallFor(key).view.kind === "done") continue;
					if (refusesInstall(blockersOf(missingByKey.get(key) ?? [], harnessVerdictOf(harnessVerdicts, key), nameTakenByKey.get(key)))) continue;
					const tier = entriesByKey.get(key)?.tier ?? "community";
					flow.start({
						name: row.name,
						version: row.latest,
						source: row.source,
						...row.repo !== void 0 ? { repo: row.repo } : {},
						...row.subdir !== void 0 ? { subdir: row.subdir } : {},
						acknowledged: tier === "verified" ? void 0 : true
					});
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: _dsh_plugin_shop_css_61217181_default.outdatedSection,
				"data-shop-outdated": true,
				"aria-labelledby": UPDATABLE_HEADING_ID,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: _dsh_plugin_shop_css_61217181_default.updatableHead,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
						className: _dsh_plugin_shop_css_61217181_default.updatableHeading,
						id: UPDATABLE_HEADING_ID,
						children: t("updatableSection")
					}), outdated.length > 1 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: _dsh_plugin_shop_css_61217181_default.updateAllButton,
						"data-shop-update-all": true,
						onClick: updateAll,
						children: t("updateAll", { count: outdated.length })
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
					className: _dsh_plugin_shop_css_61217181_default.outdatedList,
					children: outdated.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(OutdatedRow, {
						row,
						icon: iconOf(entriesByKey.get(identityKey(row)), icons),
						tier: entriesByKey.get(identityKey(row))?.tier ?? "community",
						missing: missingByKey.get(identityKey(row)) ?? [],
						harness: harnessVerdictOf(harnessVerdicts, identityKey(row)),
						github: githubSlugOf(entriesByKey.get(identityKey(row))?.repo, entriesByKey.get(identityKey(row))?.repository) ?? row.repo ?? null,
						shopVersion,
						t,
						setEnabled,
						flowFor,
						locked: uninstallFor(identityKey(row)).view.kind === "running" || uninstallFor(identityKey(row)).view.kind === "done",
						restart,
						restartBlocked,
						reload,
						page
					}) }, identityKey(row)))
				})]
			});
		}
		/** The §C10 shadowed rows: installed github dependencies whose name the
		* catalog now holds as an npm package — the pipeline refused the github
		* entry `shadowed-by-npm`, so it has no shelf card. Rendered as a single
		* strip inside the Installed view, with the badge and the explanation
		* naming the harness fact, and an Uninstall button as the only offered
		* action: there is no catalog truth to compare against, so no Install /
		* Update / Enable / Restart control makes sense. */
		function ShadowedSection({ entries, icons, entriesByKey, t, uninstallFlows, restart, restartBlocked, reload }) {
			const shadowed = entries.filter((entry) => entry.shadowed === true);
			if (shadowed.length === 0) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {
				className: _dsh_plugin_shop_css_61217181_default.shadowedSection,
				"data-shop-shadowed": true,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
					className: _dsh_plugin_shop_css_61217181_default.outdatedList,
					children: shadowed.map((row) => {
						const key = identityKey(row);
						return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: _dsh_plugin_shop_css_61217181_default.outdatedRow,
							"data-shop-shadowed-entry": row.name,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: _dsh_plugin_shop_css_61217181_default.outdatedInfo,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(EntryIcon, { icon: iconOf(entriesByKey.get(identityKey(row)), icons) }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: _dsh_plugin_shop_css_61217181_default.outdatedText,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: _dsh_plugin_shop_css_61217181_default.name,
											children: row.name
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: _dsh_plugin_shop_css_61217181_default.badges,
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: _dsh_plugin_shop_css_61217181_default.tierBadge,
												"data-tier": "shadowed",
												children: t("shadowedBadge")
											})
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											className: _dsh_plugin_shop_css_61217181_default.shadowedDetail,
											children: t("shadowedDetail")
										})
									]
								})]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: _dsh_plugin_shop_css_61217181_default.outdatedActions,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UninstallPanel, {
									name: row.name,
									t,
									restart,
									restartBlocked,
									reload,
									flow: uninstallFlows.flowFor(key)
								})
							})]
						}) }, key);
					})
				})
			});
		}
		/**
		* The shop's own error boundary (design 2026-09-26-market-borrowings §4).
		*
		* The harness catches a crashing slot entry as well, but renders an empty
		* `<div data-slot-error>` that stays until the page reloads: a blank tab, with
		* no message and no way back. This one says what happened and offers a Retry
		* that remounts the tab from scratch. Its fallback carries no `data-shop-tab`,
		* so a crashed tab cannot satisfy anything waiting for a working one. A class,
		* because React offers error boundaries in no other form.
		*/
		var ShopErrorBoundary = class extends react.Component {
			state = { error: null };
			static getDerivedStateFromError(error) {
				return { error: error instanceof Error ? error : new Error(String(error)) };
			}
			componentDidCatch(error, info) {
				console.error("dsh-plugin-shop: the shop tab crashed", error, info.componentStack);
			}
			render() {
				const { error } = this.state;
				if (error === null) return this.props.children;
				const say = (key, fallback) => {
					try {
						return this.props.t(key);
					} catch {
						return fallback;
					}
				};
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: PANEL_ROOT,
					translate: "no",
					"data-shop-crashed": true,
					role: "alert",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: _dsh_plugin_shop_css_61217181_default.stateLine,
							children: say("tabCrashed", en.tabCrashed)
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: _dsh_plugin_shop_css_61217181_default.failedDetail,
							children: error.message
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: _dsh_plugin_shop_css_61217181_default.actionButton,
							onClick: () => this.setState({ error: null }),
							children: say("retry", en.retry)
						})
					]
				});
			}
		};
		/** The shop body inside its own error boundary, as `ShopPage` renders it
		* below the page's head (index.ts registers `ShopPage` in the main column).
		* Exported under the name the body used to carry, so nothing can render the
		* body without the boundary. */
		function ShopTab(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ShopErrorBoundary, {
				t: props.t,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ShopTabBody, { ...props })
			});
		}
		/** The shop tab body: browse, search, refresh, and render one card per
		* entry. Data attributes on the e2e-relevant nodes follow the Task 3 list. */
		function ShopTabBody(props) {
			const { t, catalog, install, installStatus, setEnabled, installed, installedSpecs, uninstall, noteUninstalled, restart, version, onRestarted, updateStart, state: readState, setFavorite: writeFavorite, rollback: startRollback, openUpdatePage, reload: injectedReload, page: injectedPage, onShelfReady } = props;
			const [catalogState, setCatalogState] = (0, react.useState)({ kind: "loading" });
			const [installedState, setInstalledState] = (0, react.useState)({ kind: "loading" });
			/** The install gate's own input, or undefined while it is unknown — loading,
			* failed, or answered `null` by a host that could not read the manifest.
			* Undefined is never read as "nothing is installed": a card makes no claim
			* about a conflict it could not check. */
			const [specs, setSpecs] = (0, react.useState)(void 0);
			/** The reader's stars, by install identity (design
			* 2026-11-02-market-borrowings §7). A set because both the card and the
			* filter ask membership once per entry per render. */
			const [favorites, setFavorites] = (0, react.useState)(() => /* @__PURE__ */ new Set());
			/** Install identity → the version an update replaced (§6), for the rollback
			* offer's label. The spec that installs it is built host-side. */
			const [rollbackVersions, setRollbackVersions] = (0, react.useState)({});
			const [selfVersion, setSelfVersion] = (0, react.useState)(null);
			const restartBlocked = selfVersion?.restartBlocked ?? null;
			const reload = (0, react.useMemo)(() => injectedReload ?? (() => {
				globalThis.location.reload();
			}), [injectedReload]);
			const [selfRestartGate, setSelfRestartGate] = (0, react.useState)(false);
			const ownDeps = (0, react.useRef)({
				install,
				uninstall,
				updateStart,
				installStatus,
				noteUninstalled
			});
			ownDeps.current = {
				install,
				uninstall,
				updateStart,
				installStatus,
				noteUninstalled
			};
			const [ownPage] = (0, react.useState)(() => injectedPage === void 0 ? createPageStore(() => ownDeps.current, { pollUnwatched: false }) : null);
			const page = injectedPage ?? ownPage;
			if (page === null) throw new Error("dsh-plugin-shop: the shop face stopped handing over the page store the tab mounted with");
			const pageState = (0, react.useSyncExternalStore)(page.subscribe, page.getSnapshot);
			const { query, category, order, hideIncompatible, favoritesOnly, visibleCount } = pageState.view;
			const selfUpdate = useRegistrySelf(page.self);
			const restartMonitor = useRestartMonitor();
			const hostPending = selfVersion !== null && updateAwaitsRestart(selfVersion);
			const selfPending = selfUpdate.view.kind === "done" || selfUpdate.view.kind === "idle" && hostPending;
			const [request, setRequest] = (0, react.useState)(() => {
				const { reverdictPending, reverdicts } = page.getSnapshot();
				return reverdictPending ? {
					kind: "reverdict",
					reverdicts
				} : { kind: "initial" };
			});
			const askedFor = (0, react.useRef)(request.kind === "reverdict" ? request.reverdicts : null);
			(0, react.useEffect)(() => {
				if (!pageState.reverdictPending || askedFor.current === pageState.reverdicts) return;
				askedFor.current = pageState.reverdicts;
				setRequest({
					kind: "reverdict",
					reverdicts: pageState.reverdicts
				});
			}, [pageState.reverdictPending, pageState.reverdicts]);
			const pendingReverdict = () => {
				const { reverdictPending, reverdicts } = page.getSnapshot();
				return reverdictPending ? reverdicts : null;
			};
			const [versionReload, setVersionReload] = (0, react.useState)(0);
			const { settled } = pageState;
			const flows = useRegistryFlows(page.installs);
			const uninstallFlows = useRegistryFlows(page.uninstalls);
			(0, react.useEffect)(() => onRestarted?.((fresh) => {
				setSelfVersion(fresh);
				if (injectedPage === void 0) page.noteRestarted();
			}), [
				onRestarted,
				page,
				injectedPage
			]);
			const [reloading, setReloading] = (0, react.useState)(false);
			const [reloadFailed, setReloadFailed] = (0, react.useState)(false);
			const incremental = typeof IntersectionObserver !== "undefined";
			const sentinelRef = (0, react.useRef)(null);
			const filteredLenRef = (0, react.useRef)(0);
			const sortLabelId = (0, react.useId)();
			const pendingRefreshRef = (0, react.useRef)(null);
			const lastLoadedAtRef = (0, react.useRef)(Date.now());
			(0, react.useEffect)(() => {
				const onForeground = () => {
					if (document.visibilityState !== "visible") return;
					if (Date.now() - lastLoadedAtRef.current < FOCUS_REFRESH_MS) return;
					if (pendingRefreshRef.current !== null) return;
					setRequest({
						kind: "refresh",
						reverdicts: null
					});
				};
				document.addEventListener("visibilitychange", onForeground);
				window.addEventListener("focus", onForeground);
				return () => {
					document.removeEventListener("visibilitychange", onForeground);
					window.removeEventListener("focus", onForeground);
				};
			}, []);
			(0, react.useEffect)(() => {
				let cancelled = false;
				if (request.kind !== "refresh" && request.kind !== "reverdict") setCatalogState((current) => current.kind === "ready" ? current : { kind: "loading" });
				if (request.kind === "refresh") pendingRefreshRef.current = request;
				const load = async () => {
					try {
						const result = await catalog(request.kind === "refresh" ? { refresh: true } : request.kind === "reverdict" ? { reverdict: true } : void 0);
						if (!cancelled) {
							lastLoadedAtRef.current = Date.now();
							setCatalogState({
								kind: "ready",
								result
							});
							if (request.kind !== "initial" && request.reverdicts !== null) page.clearReverdict(request.reverdicts);
						}
					} catch {
						if (cancelled) {
							if (request.kind === "refresh" && pendingRefreshRef.current === request) setReloadFailed(true);
							return;
						}
						setCatalogState((current) => current.kind === "ready" ? current : { kind: "error" });
						if (request.kind === "reverdict") page.clearReverdict(request.reverdicts);
						else {
							setReloadFailed(true);
							if (request.kind !== "initial" && request.reverdicts !== null) setRequest({
								kind: "reverdict",
								reverdicts: request.reverdicts
							});
						}
					} finally {
						if (pendingRefreshRef.current === request) pendingRefreshRef.current = null;
						if (!cancelled) setReloading(false);
					}
				};
				load();
				return () => {
					cancelled = true;
				};
			}, [
				catalog,
				request,
				page
			]);
			const shelfShown = (0, react.useRef)(false);
			(0, react.useLayoutEffect)(() => {
				if (shelfShown.current || catalogState.kind !== "ready" || installedState.kind === "loading") return;
				shelfShown.current = true;
				onShelfReady?.();
			}, [
				catalogState,
				installedState,
				onShelfReady
			]);
			(0, react.useEffect)(() => {
				let cancelled = false;
				const load = async () => {
					try {
						const result = await version();
						if (!cancelled) setSelfVersion(result);
					} catch {}
				};
				load();
				return () => {
					cancelled = true;
				};
			}, [version, versionReload]);
			const [checkState, setCheckState] = (0, react.useState)("idle");
			const upToDateTimer = (0, react.useRef)(null);
			(0, react.useEffect)(() => () => {
				if (upToDateTimer.current !== null) clearTimeout(upToDateTimer.current);
			}, []);
			const checkVersion = async () => {
				setCheckState("checking");
				try {
					const result = await version();
					setSelfVersion(result);
					if (result.outdated) setCheckState("idle");
					else {
						setCheckState("up-to-date");
						upToDateTimer.current = setTimeout(() => setCheckState("idle"), CHECK_UP_TO_DATE_MS);
					}
				} catch {
					setCheckState("idle");
				}
			};
			(0, react.useEffect)(() => {
				let cancelled = false;
				const load = async () => {
					try {
						const [entries, held] = await Promise.all([installed(), installedSpecs()]);
						if (cancelled) return;
						setInstalledState({
							kind: "ready",
							entries
						});
						setSpecs(held ?? void 0);
						page.noteInstalled(entries.map(identityKey));
					} catch {
						if (cancelled) return;
						setInstalledState({ kind: "error" });
						setSpecs(void 0);
					}
				};
				load();
				return () => {
					cancelled = true;
				};
			}, [
				installed,
				installedSpecs,
				versionReload,
				settled,
				page
			]);
			(0, react.useEffect)(() => {
				if (readState === void 0) return;
				let cancelled = false;
				(async () => {
					try {
						const result = await readState();
						if (cancelled) return;
						setFavorites(new Set(result.favorites));
						setRollbackVersions(result.rollback);
					} catch {}
				})();
				return () => {
					cancelled = true;
				};
			}, [
				readState,
				versionReload,
				settled
			]);
			const installedByKey = (0, react.useMemo)(() => {
				const map = /* @__PURE__ */ new Map();
				if (installedState.kind === "ready") for (const entry of installedState.entries) map.set(identityKey(entry), entry);
				return map;
			}, [installedState]);
			const stars = (0, react.useMemo)(() => catalogState.kind === "ready" ? catalogState.result.stars : {}, [catalogState]);
			const icons = (0, react.useMemo)(() => catalogState.kind === "ready" ? catalogState.result.icons ?? {} : {}, [catalogState]);
			const starOrder = (0, react.useMemo)(() => catalogState.kind === "ready" ? sortByStars(catalogState.result.plugins, stars) : [], [catalogState, stars]);
			const builtAt = catalogState.kind === "ready" ? catalogState.result.builtAt : "";
			const sortedCatalog = (0, react.useMemo)(() => orderShelf(starOrder, order, builtAt), [
				starOrder,
				order,
				builtAt
			]);
			const browsable = (0, react.useMemo)(() => {
				if (catalogState.kind !== "ready") return [];
				const cleared = new Set(catalogState.result.notAShop ?? []);
				return sortedCatalog.filter((entry) => listedOnShelf(entry, cleared));
			}, [catalogState, sortedCatalog]);
			const missingByKey = (0, react.useMemo)(() => {
				const map = /* @__PURE__ */ new Map();
				if (catalogState.kind === "ready") for (const entry of catalogState.result.plugins) map.set(entryKey(entry), missingPeersOf(catalogState.result.incompatible, entryKey(entry)));
				return map;
			}, [catalogState]);
			const nameTakenByKey = (0, react.useMemo)(() => {
				const map = /* @__PURE__ */ new Map();
				if (catalogState.kind !== "ready") return map;
				for (const entry of catalogState.result.plugins) {
					const holder = heldBy(entry, specs);
					if (holder !== void 0) map.set(entryKey(entry), holder);
				}
				return map;
			}, [catalogState, specs]);
			const harnessVerdicts = (0, react.useMemo)(() => catalogState.kind === "ready" ? catalogState.result.incompatibleHarness : void 0, [catalogState]);
			const badgedIncompatible = (0, react.useCallback)((key) => readsIncompatible(blockersOf(missingByKey.get(key) ?? [], harnessVerdictOf(harnessVerdicts, key), nameTakenByKey.get(key))), [
				missingByKey,
				harnessVerdicts,
				nameTakenByKey
			]);
			const toggleFavorite = (0, react.useCallback)(async (key) => {
				if (writeFavorite === void 0) return;
				const next = !favorites.has(key);
				setFavorites((previous) => {
					const copy = new Set(previous);
					if (next) copy.add(key);
					else copy.delete(key);
					return copy;
				});
				try {
					const result = await writeFavorite({
						key,
						favorite: next
					});
					if (!result.ok) throw new Error(result.detail ?? "");
				} catch {
					setFavorites((previous) => {
						const copy = new Set(previous);
						if (next) copy.delete(key);
						else copy.add(key);
						return copy;
					});
				}
			}, [favorites, writeFavorite]);
			const rollbackOffer = (0, react.useCallback)((key) => {
				return rollbackVersions[key];
			}, [rollbackVersions]);
			const refreshAfterMutation = (0, react.useCallback)(() => {
				setVersionReload((count) => count + 1);
			}, []);
			const deferredQuery = (0, react.useDeferredValue)(query);
			const expansionMemo = (0, react.useMemo)(() => expandZhQuery(deferredQuery), [deferredQuery]);
			const matched = (0, react.useMemo)(() => {
				const q = expansionMemo.query;
				return (category === "installed" ? sortedCatalog : browsable).filter((entry) => {
					if (category === "installed") {
						const key = entryKey(entry);
						if (!installedByKey.has(key) && !uninstallFlows.pending.has(key)) return false;
					} else if (category !== null && categoryKey(entry) !== categoryLocaleKey(category)) return false;
					if (favoritesOnly && category !== "installed" && !favorites.has(entryKey(entry))) return false;
					if (q === "") return true;
					const summaryEn = entry.catalog?.summary.en ?? "";
					const summaryZh = entry.catalog?.summary.zh ?? "";
					const expansion = expansionMemo;
					const name = entry.name.toLowerCase();
					const en = summaryEn.toLowerCase();
					const zh = summaryZh.toLowerCase();
					return expansion.terms.some((term) => term.startsWith("#") ? tokenInText(term.slice(1), name + " " + en + " " + zh) : name.includes(term) || en.includes(term) || zh.includes(term));
				});
			}, [
				sortedCatalog,
				browsable,
				expansionMemo,
				category,
				installedByKey,
				uninstallFlows.pending,
				favoritesOnly,
				favorites
			]);
			const filtered = (0, react.useMemo)(() => hideIncompatible && category !== "installed" ? matched.filter((entry) => !badgedIncompatible(entryKey(entry))) : matched, [
				matched,
				hideIncompatible,
				category,
				badgedIncompatible
			]);
			filteredLenRef.current = filtered.length;
			(0, react.useEffect)(() => {
				if (!incremental) return;
				const node = sentinelRef.current;
				if (node === null) return;
				const observer = new IntersectionObserver((entries) => {
					if (entries.some((entry) => entry.isIntersecting)) page.updateView((view) => ({ visibleCount: nextVisibleCount(view.visibleCount, filteredLenRef.current, 48) }));
				}, { rootMargin: "0px 0px 1200px 0px" });
				observer.observe(node);
				return () => observer.disconnect();
			}, [
				incremental,
				visibleCount,
				filtered.length,
				page
			]);
			const visible = incremental ? filtered.slice(0, visibleCount) : filtered;
			/** The date a card shows under the current order, or undefined under the
			* star order and for an entry with no usable date. Computed from the same
			* `shelfTime` the order keyed on, so a label can never name a date the
			* order ignored. */
			const shelfDayOf = (entry) => {
				const ms = shelfTime(entry, order, builtAt);
				return ms === void 0 ? void 0 : utcDay(ms);
			};
			const categoryCounts = (0, react.useMemo)(() => {
				const counts = /* @__PURE__ */ new Map();
				for (const entry of browsable) {
					const key = categoryKey(entry);
					const bare = CATEGORY_ORDER.find((c) => categoryLocaleKey(c) === key);
					if (bare !== void 0) counts.set(bare, (counts.get(bare) ?? 0) + 1);
				}
				return counts;
			}, [browsable]);
			const installedCount = (0, react.useMemo)(() => sortedCatalog.filter((entry) => installedByKey.has(entryKey(entry))).length, [sortedCatalog, installedByKey]);
			const incompatibleCount = (0, react.useMemo)(() => browsable.filter((entry) => badgedIncompatible(entryKey(entry))).length, [browsable, badgedIncompatible]);
			const entriesByKey = (0, react.useMemo)(() => {
				const map = /* @__PURE__ */ new Map();
				if (catalogState.kind === "ready") for (const entry of catalogState.result.plugins) map.set(entryKey(entry), entry);
				return map;
			}, [catalogState]);
			if (catalogState.kind === "loading") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: PANEL_ROOT,
				translate: "no",
				"data-shop-tab": true,
				"aria-busy": "true",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: _dsh_plugin_shop_css_61217181_default.srOnly,
					children: t("loading")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: _dsh_plugin_shop_css_61217181_default.skeletonGrid,
					"data-shop-skeleton": true,
					"aria-hidden": "true",
					children: Array.from({ length: 8 }, (_, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: _dsh_plugin_shop_css_61217181_default.skeletonCard,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: _dsh_plugin_shop_css_61217181_default.skeletonName }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: _dsh_plugin_shop_css_61217181_default.skeletonSummary }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: _dsh_plugin_shop_css_61217181_default.skeletonSummaryShort }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: _dsh_plugin_shop_css_61217181_default.skeletonActions })
						]
					}, i))
				})]
			});
			if (catalogState.kind === "error") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: PANEL_ROOT,
				translate: "no",
				"data-shop-tab": true,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: _dsh_plugin_shop_css_61217181_default.stateLine,
					children: t("error")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: _dsh_plugin_shop_css_61217181_default.actionButton,
					onClick: () => {
						setRequest({
							kind: "retry",
							reverdicts: pendingReverdict()
						});
						setVersionReload((current) => current + 1);
					},
					children: t("retry")
				})]
			});
			const { result } = catalogState;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: PANEL_ROOT,
				translate: "no",
				"data-shop-tab": true,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: _dsh_plugin_shop_css_61217181_default.toolbar,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "search",
								className: _dsh_plugin_shop_css_61217181_default.searchInput,
								"aria-label": t("search"),
								placeholder: t("search"),
								value: query,
								onChange: (event) => {
									page.setView({
										query: event.target.value,
										visibleCount: 48
									});
								}
							}),
							expansionMemo.intents.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								"data-shop-expansion-note": true,
								className: _dsh_plugin_shop_css_61217181_default.expansionNote,
								children: t("zhExpansionNote", { terms: expansionMemo.terms.slice(1).map((term) => term.startsWith("#") ? term.slice(1) : term).join(", ") })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: _dsh_plugin_shop_css_61217181_default.toolbarRight,
								children: [
									result.stale && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: _dsh_plugin_shop_css_61217181_default.staleBadge,
										children: t("staleLabel", { date: result.builtAt.slice(0, 10) })
									}),
									selfVersion !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: _dsh_plugin_shop_css_61217181_default.versionBlock,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: _dsh_plugin_shop_css_61217181_default.versionText,
											"data-shop-version": true,
											children: ["v", selfVersion.installed]
										}), restartMonitor !== null ? null : selfPending && restartBlocked === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: _dsh_plugin_shop_css_61217181_default.restartSelfButton,
											"data-shop-restart": true,
											onClick: () => setSelfRestartGate(true),
											children: t("restart")
										}) : !selfPending && selfVersion.outdated && selfVersion.latest !== null && selfUpdate.view.kind === "idle" ? selfVersion.selfUpdate === "dsh-page" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: _dsh_plugin_shop_css_61217181_default.updateSelfButton,
											"data-shop-update-desktop": true,
											title: t("updateInDshPageTitle"),
											disabled: openUpdatePage === void 0,
											onClick: openUpdatePage,
											children: t("updateInDshPage")
										}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: _dsh_plugin_shop_css_61217181_default.updateSelfButton,
											"data-shop-update-self": true,
											onClick: () => {
												if (selfVersion.latest !== null) selfUpdate.start({ version: selfVersion.latest });
											},
											children: t("update")
										}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: _dsh_plugin_shop_css_61217181_default.checkUpdateButton,
											"data-shop-check-update": true,
											title: t("checkUpdateTitle"),
											disabled: checkState !== "idle",
											onClick: () => void checkVersion(),
											children: checkState === "up-to-date" ? t("upToDate") : t("checkUpdate")
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
										className: _dsh_plugin_shop_css_61217181_default.githubLink,
										href: SHOP_REPO_URL,
										target: "_blank",
										rel: "noopener noreferrer",
										"aria-label": t("github"),
										"data-shop-github": true,
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
											viewBox: "0 0 16 16",
											width: "16",
											height: "16",
											"aria-hidden": "true",
											fill: "currentColor",
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" })
										})
									})
								]
							})
						]
					}),
					restartMonitor?.kind === "not-restarted" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(NotRestartedNotice, {
						t,
						pid: restartMonitor.pid,
						logFile: restartMonitor.logFile
					}),
					selfUpdate.view.kind === "running" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: _dsh_plugin_shop_css_61217181_default.selfUpdatePanel,
						"data-shop-self-updating": true,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: _dsh_plugin_shop_css_61217181_default.installing,
							children: t(installPhaseKey(selfUpdate.view.phase))
						}), selfUpdate.view.log.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: _dsh_plugin_shop_css_61217181_default.log,
							"data-shop-log": true,
							children: selfUpdate.view.log.map((line, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: _dsh_plugin_shop_css_61217181_default.logLine,
								"data-shop-log-line": true,
								children: line
							}, index))
						})]
					}),
					selfPending && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: _dsh_plugin_shop_css_61217181_default.selfUpdatePanel,
						"data-shop-self-update-done": true,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: _dsh_plugin_shop_css_61217181_default.installedActions,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: _dsh_plugin_shop_css_61217181_default.notice,
									children: t("installedRestartNotice")
								}),
								restartBlocked === null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RestartPanel, {
									t,
									restart,
									reload,
									gate: {
										open: selfRestartGate,
										close: () => setSelfRestartGate(false)
									}
								}),
								restartBlocked !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: _dsh_plugin_shop_css_61217181_default.notice,
									"data-shop-restart-disabled": true,
									children: t(restartBlockedNoticeKey(restartBlocked))
								})
							]
						})
					}),
					selfUpdate.view.kind === "failed" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: _dsh_plugin_shop_css_61217181_default.selfUpdatePanel,
						"data-shop-self-update-failed": true,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: _dsh_plugin_shop_css_61217181_default.failedHeading,
								children: t("updateFailed")
							}),
							selfUpdate.view.log.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: _dsh_plugin_shop_css_61217181_default.log,
								"data-shop-log": true,
								children: selfUpdate.view.log.map((line, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: _dsh_plugin_shop_css_61217181_default.logLine,
									"data-shop-log-line": true,
									children: line
								}, index))
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: _dsh_plugin_shop_css_61217181_default.failedDetail,
								children: selfUpdate.view.detail === "" ? t("updateTransportFailed") : selfUpdate.view.detail
							}),
							selfUpdate.view.command !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CommandLine, {
								command: selfUpdate.view.command,
								t
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: _dsh_plugin_shop_css_61217181_default.cancelButton,
								"data-shop-update-self-dismiss": true,
								onClick: () => {
									selfUpdate.resetWhere((current) => current.kind === "failed");
								},
								children: t("dismiss")
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: _dsh_plugin_shop_css_61217181_default.shelfBody,
						"data-shop-shelf": true,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: _dsh_plugin_shop_css_61217181_default.controls,
							"data-shop-controls": true,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
									className: _dsh_plugin_shop_css_61217181_default.railHeading,
									children: t("categoriesHeading")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: _dsh_plugin_shop_css_61217181_default.categoryBar,
									role: "group",
									"aria-label": t("catalog"),
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
											type: "button",
											className: category === null ? `${_dsh_plugin_shop_css_61217181_default.categoryButton} ${_dsh_plugin_shop_css_61217181_default.categoryButtonOn}` : _dsh_plugin_shop_css_61217181_default.categoryButton,
											"aria-pressed": category === null,
											onClick: () => {
												page.setView({
													category: null,
													visibleCount: 48
												});
											},
											"data-shop-category-all": true,
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("all") }),
												" ",
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: browsable.length })
											]
										}),
										CATEGORY_ORDER.map((key) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
											type: "button",
											className: category === key ? `${_dsh_plugin_shop_css_61217181_default.categoryButton} ${_dsh_plugin_shop_css_61217181_default.categoryButtonOn}` : _dsh_plugin_shop_css_61217181_default.categoryButton,
											"aria-pressed": category === key,
											"data-category": key,
											"data-shop-category-tab": key,
											onClick: () => {
												page.setView({
													category: key,
													visibleCount: 48
												});
											},
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t(categoryLocaleKey(key)) }),
												" ",
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: categoryCounts.get(key) ?? 0 })
											]
										}, key)),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
											type: "button",
											className: category === "installed" ? `${_dsh_plugin_shop_css_61217181_default.categoryButton} ${_dsh_plugin_shop_css_61217181_default.categoryButtonOn}` : _dsh_plugin_shop_css_61217181_default.categoryButton,
											"aria-pressed": category === "installed",
											"data-shop-category-installed": true,
											onClick: () => {
												page.setView({
													category: "installed",
													visibleCount: 48
												});
											},
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("installed") }),
												" ",
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: installedCount })
											]
										})
									]
								}),
								category !== "installed" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
										className: _dsh_plugin_shop_css_61217181_default.railHeading,
										children: t("filterHeading")
									}),
									readState !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
										type: "button",
										role: "switch",
										"aria-checked": favoritesOnly,
										className: favoritesOnly ? `${_dsh_plugin_shop_css_61217181_default.incompatibleFilter} ${_dsh_plugin_shop_css_61217181_default.incompatibleFilterOn}` : _dsh_plugin_shop_css_61217181_default.incompatibleFilter,
										title: t("favoritesFilterTitle"),
										"data-shop-favorites-filter": true,
										onClick: () => {
											page.updateView((view) => ({
												favoritesOnly: !view.favoritesOnly,
												visibleCount: 48
											}));
										},
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: favoritesOnly ? `${_dsh_plugin_shop_css_61217181_default.switch} ${_dsh_plugin_shop_css_61217181_default.switchOn}` : _dsh_plugin_shop_css_61217181_default.switch,
											"aria-hidden": "true",
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: _dsh_plugin_shop_css_61217181_default.switchKnob })
										}), t("favoritesFilter")]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
										type: "button",
										role: "switch",
										"aria-checked": hideIncompatible,
										className: hideIncompatible ? `${_dsh_plugin_shop_css_61217181_default.incompatibleFilter} ${_dsh_plugin_shop_css_61217181_default.incompatibleFilterOn}` : _dsh_plugin_shop_css_61217181_default.incompatibleFilter,
										title: t(hideIncompatible ? "showIncompatibleTitle" : "incompatibleFilterTitle"),
										"data-shop-hide-incompatible": true,
										onClick: () => {
											page.updateView((view) => ({
												hideIncompatible: !view.hideIncompatible,
												visibleCount: 48
											}));
										},
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: hideIncompatible ? `${_dsh_plugin_shop_css_61217181_default.switch} ${_dsh_plugin_shop_css_61217181_default.switchOn}` : _dsh_plugin_shop_css_61217181_default.switch,
											"aria-hidden": "true",
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: _dsh_plugin_shop_css_61217181_default.switchKnob })
										}), t("hideIncompatible", { count: incompatibleCount })]
									})
								] })
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: _dsh_plugin_shop_css_61217181_default.results,
							"data-shop-results": true,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: _dsh_plugin_shop_css_61217181_default.catalogStatsRow,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											className: _dsh_plugin_shop_css_61217181_default.catalogStats,
											"data-shop-catalog-stats": true,
											children: t("catalogStats", {
												count: String(browsable.length),
												date: result.builtAt.slice(0, 10)
											})
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: _dsh_plugin_shop_css_61217181_default.catalogRefreshButton,
											"data-shop-catalog-refresh": true,
											disabled: reloading,
											onClick: () => {
												setReloading(true);
												setReloadFailed(false);
												setRequest({
													kind: "refresh",
													reverdicts: pendingReverdict()
												});
												setVersionReload((current) => current + 1);
											},
											children: reloading ? t("refreshing") : t("refresh")
										}),
										reloadFailed && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: _dsh_plugin_shop_css_61217181_default.catalogRefreshFailed,
											"data-shop-catalog-refresh-failed": true,
											children: t("refreshFailed")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: _dsh_plugin_shop_css_61217181_default.sortGroup,
											role: "group",
											"aria-labelledby": sortLabelId,
											"data-shop-sort": true,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: _dsh_plugin_shop_css_61217181_default.sortLabel,
												id: sortLabelId,
												children: t("sortLabel")
											}), SHELF_ORDERS.map((name) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: order === name ? `${_dsh_plugin_shop_css_61217181_default.categoryButton} ${_dsh_plugin_shop_css_61217181_default.categoryButtonOn}` : _dsh_plugin_shop_css_61217181_default.categoryButton,
												"aria-pressed": order === name,
												"data-shop-order": name,
												onClick: () => {
													page.setView({
														order: name,
														visibleCount: 48
													});
												},
												children: t(shelfOrderLocaleKey(name))
											}, name))]
										})
									]
								}),
								result.plugins.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: _dsh_plugin_shop_css_61217181_default.emptyLine,
									children: t("empty")
								}) : filtered.length === 0 ? category === "installed" && installedState.kind !== "ready" ? installedState.kind === "loading" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: _dsh_plugin_shop_css_61217181_default.emptyLine,
									"data-shop-installed-loading": true,
									children: t("installedLoading")
								}) : null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: _dsh_plugin_shop_css_61217181_default.emptyLine,
									"data-shop-empty": true,
									children: matched.length === 0 ? t("emptySearch") : favoritesOnly && !matched.some((entry) => favorites.has(entryKey(entry))) ? t("emptyFavoritesFiltered") : t("emptyIncompatibleFiltered")
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("ul", {
									className: _dsh_plugin_shop_css_61217181_default.cards,
									children: [visible.map((entry) => {
										const key = entryKey(entry);
										return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", {
											"data-shop-identity": key,
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EntryCard, {
												entry,
												icon: iconOf(entry, icons),
												stars: starsOf(entry, stars),
												order,
												shelfDay: shelfDayOf(entry),
												installed: installedByKey.get(key),
												missing: missingByKey.get(key) ?? [],
												harness: harnessVerdictOf(harnessVerdicts, key),
												nameTakenBy: nameTakenByKey.get(key),
												t,
												flow: flows.flowFor(key),
												uninstallFlow: uninstallFlows.flowFor(key),
												restart,
												restartBlocked,
												reload,
												setEnabled,
												inInstalledView: category === "installed",
												page,
												shopVersion: selfVersion?.installed,
												...writeFavorite !== void 0 ? {
													favorite: favorites.has(key),
													onFavorite: () => {
														toggleFavorite(key);
													}
												} : {},
												...rollbackOffer(key) !== void 0 ? { rollback: {
													version: rollbackOffer(key),
													start: startRollback,
													status: installStatus,
													onSettled: refreshAfterMutation
												} } : {}
											})
										}, key);
									}), incremental && visibleCount < filtered.length && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", {
										ref: sentinelRef,
										className: _dsh_plugin_shop_css_61217181_default.cardsSentry,
										"data-shop-sentry": true,
										"aria-hidden": "true"
									})]
								}), incremental && visibleCount < filtered.length && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: _dsh_plugin_shop_css_61217181_default.showingLine,
									"aria-live": "polite",
									children: t("showing", {
										shown: String(visibleCount),
										total: String(filtered.length)
									})
								})] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(OutdatedSection, {
									state: installedState,
									entriesByKey,
									icons,
									missingByKey,
									harnessVerdicts,
									nameTakenByKey,
									shopVersion: selfVersion?.installed,
									t,
									setEnabled,
									flowFor: flows.flowFor,
									uninstallFor: uninstallFlows.flowFor,
									restart,
									restartBlocked,
									reload,
									page
								}),
								category === "installed" && installedState.kind === "ready" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ShadowedSection, {
									entries: installedState.entries,
									icons,
									entriesByKey,
									t,
									uninstallFlows,
									restart,
									restartBlocked,
									reload
								})
							]
						})]
					})
				]
			});
		}
		//#endregion
		//#region src/client/ShopPage.tsx
		/**
		* The shop's own page in dsh's main column (design
		* 2026-10-16-shop-sidebar-page §4.2), framed as dsh frames its Plugins page:
		* the page is its own scroll container, its head carries the title and the
		* one intro line and clears the desktop title bar, and the body below is
		* `ShopTab`, unchanged.
		*
		* It keeps the reader's scroll position in the page store (design
		* 2026-10-16-shop-sidebar-page §5.7). The position is written on every
		* scroll event — a browser fires at most one a frame, and the store takes it
		* without telling anyone — with the card at the page's top edge. The page
		* goes back there once, when the shelf is on screen again and the installed
		* list has answered, unless the reader moved first: the same card at the
		* same height, held there for a moment while the cards around it render, or
		* the position when that card is no longer on the shelf or the shelf was
		* refiltered since.
		*/
		/** What each card on the shelf carries: its identity (ShopTab), not its
		* name, which two listed entries can share — a fork and its original. */
		const IDENTITY = "data-shop-identity";
		/** The shelf's cards in document order: the children of the one list that
		* holds them, a live collection reached through the first card, so a scroll
		* event never walks the cards' own subtrees. Null while no card is on the
		* page. */
		function cardsOf(scroller) {
			return scroller.querySelector(`[${IDENTITY}]`)?.parentElement?.children ?? null;
		}
		/** The shelf's gap between two cards, in px: `.cards`' `gap` in
		* ShopTab.module.css, as the list's computed row gap reads it. */
		function gapOf(list) {
			const gap = list === null ? NaN : Number.parseFloat(getComputedStyle(list).rowGap);
			return Number.isFinite(gap) ? gap : 0;
		}
		/**
		* Where the reader is on the shelf: the first card whose bottom lies below
		* the page's top edge, and its top relative to that edge. The cards are laid
		* out row-major in document order — one per row before 2026-11-02, two per
		* row since — so their bottoms never fall with their index, and a binary
		* search reads a handful of their rects on each scroll event, never one per
		* card.
		*
		* A card whose top lies below the edge counts only while it lies no further
		* below than the shelf's gap between cards, as when the edge falls in that
		* gap. Further down, the reader is above the shelf, in the head or the
		* toolbar: nothing there lays out at a placeholder height, so the position
		* alone is exact, while a card would pull them down the page whenever the
		* content above the shelf grows meanwhile.
		*/
		function anchorAt(scroller) {
			const cards = cardsOf(scroller);
			if (cards === null) return null;
			const edge = scroller.getBoundingClientRect().top;
			let low = 0;
			let high = cards.length;
			while (low < high) {
				const middle = Math.floor((low + high) / 2);
				if ((cards.item(middle)?.getBoundingClientRect().bottom ?? edge) > edge) high = middle;
				else low = middle + 1;
			}
			const card = cards.item(low);
			const key = card?.getAttribute(IDENTITY) ?? null;
			if (card === null || key === null) return null;
			const offset = card.getBoundingClientRect().top - edge;
			if (offset > 0 && offset > gapOf(card.parentElement)) return null;
			return {
				key,
				offset
			};
		}
		/** The card with `key` on the shelf, matched by iteration: an identity
		* carries `:`, `/` and `#`, which a selector would have to escape. */
		function cardWith(scroller, key) {
			const cards = cardsOf(scroller);
			if (cards === null) return null;
			for (const card of cards) if (card.getAttribute(IDENTITY) === key) return card;
			return null;
		}
		function ShopPage(props) {
			const { t, page } = props;
			const scroller = (0, react.useRef)(null);
			const moved = (0, react.useRef)(false);
			const holding = (0, react.useRef)(null);
			(0, react.useEffect)(() => () => {
				if (holding.current !== null) cancelAnimationFrame(holding.current);
			}, []);
			const restore = (0, react.useCallback)(() => {
				const node = scroller.current;
				if (node === null || moved.current || page === void 0) return;
				const anchor = page.readAnchor();
				const card = anchor === null ? null : cardWith(node, anchor.key);
				if (anchor === null || card === null) {
					node.scrollTop = page.readScroll();
					return;
				}
				const drift = () => card.getBoundingClientRect().top - node.getBoundingClientRect().top - anchor.offset;
				node.style.overflowAnchor = "none";
				node.scrollTop += drift();
				let held = node.scrollTop;
				const until = performance.now() + 500;
				const hold = () => {
					holding.current = null;
					if (moved.current || Math.abs(node.scrollTop - held) >= 1 || !card.isConnected || performance.now() > until) {
						node.style.overflowAnchor = "";
						return;
					}
					const off = drift();
					if (Math.abs(off) >= 1) {
						node.scrollTop += off;
						held = node.scrollTop;
					}
					holding.current = requestAnimationFrame(hold);
				};
				holding.current = requestAnimationFrame(hold);
			}, [page]);
			const cancelRestore = () => {
				moved.current = true;
			};
			(0, react.useEffect)(() => {
				page?.notePageMounted(true);
				return () => {
					page?.notePageMounted(false);
				};
			}, [page]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				ref: scroller,
				className: `${_dsh_plugin_shop_css_61217181_default.page} notranslate`,
				translate: "no",
				"data-shop-page": true,
				onScroll: (event) => {
					page?.recordScroll(event.currentTarget.scrollTop, anchorAt(event.currentTarget));
				},
				onWheel: cancelRestore,
				onTouchStart: cancelRestore,
				onKeyDown: cancelRestore,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
					className: _dsh_plugin_shop_css_61217181_default.pageHead,
					"data-shop-page-head": true,
					"data-window-drag": true,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h1", {
						className: _dsh_plugin_shop_css_61217181_default.pageTitle,
						"data-shop-page-title": true,
						children: t("title")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: _dsh_plugin_shop_css_61217181_default.pageIntro,
						"data-shop-page-intro": true,
						children: t("intro")
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ShopTab, {
					...props,
					onShelfReady: restore
				})]
			});
		}
		//#endregion
		//#region src/client/index.ts
		/** Dictionary namespace owned by this plugin. */
		const NS = "settings.shop";
		/** The id the shop's sidebar row and its main-column page share (design
		* 2026-10-16-shop-sidebar-page §4.1). */
		const SHOP_PANEL = "shop";
		/** The npm package this client belongs to: the bundle dsh's own Plugins page
		* opens for the desktop self-update. */
		const SHOP_PACKAGE = "dsh-plugin-shop";
		/** dsh's own Plugins page (dsh-client-ui-plugin-manager's `PANEL_ID`), the
		* surface that updates a package on the desktop profile. The fallback for a
		* harness without `pluginNavigation`. */
		const DSH_PLUGINS_PANEL = "plugins";
		/** How long a stashed catalog may satisfy a plain open. The host applies the
		* same five-minute freshness window, so the client stash must not outlive it. */
		const WARM_TTL_MS = 3e5;
		/** The boot-time warm fetch: the catalog the tab wants on its first open.
		* Started in apply — the client bundle boots with the web app, long before
		* the user opens the shop — so the host's slow network fetch runs while
		* nobody is looking at the shop, and the tab's mount consumes this promise
		* instead of starting its own fetch. A rejection stays stored (the injected
		* catalog falls back to a fresh call); the extra catch keeps the
		* fire-and-forget from surfacing as an unhandled rejection. Every later
		* result, including an explicit refresh, replaces this timestamped stash. */
		let warmCatalog = null;
		/** Package names THIS PAGE has uninstalled since it loaded (design
		* 2026-09-01-harness-compatibility section 9.1): the module table can still
		* hold a graph row or a `loadCache` record for one after a restart-free
		* uninstall (module-table.ts's header explains why), so
		* the refinement must never clear a name here on the table's say-so — the
		* host's verdict stands unconditionally. Module-level so it survives the tab
		* closing and reopening; reset in `apply` beside `warmCatalog`, because a
		* re-applied bundle is a new page that has uninstalled nothing yet. An
		* uninstall made from another tab, another window, or the CLI is never added
		* here and stays unknown to this page until it reloads. */
		let pageRemoved = /* @__PURE__ */ new Set();
		/** Services required by the page, row and Plugins page button registrations
		* and the Remote mount.
		*
		* `remote.shop` is deliberately ABSENT: this package both mounts its own
		* Remote (the assembly does not know it, §7.3) and consumes it, and cordis
		* will not let one package do both through the inject face. Declaring the
		* face makes the boot's activation gate wait for the `remote.shop` service —
		* which only this package's own apply can register — and the real web boot
		* deadlocked on exactly that ("waiting for service: remote.shop"). The
		* namespace is therefore read through the reflect shop instead (`ctx.get`,
		* see apply), which has no inject requirement. */
		const inject = [
			"remote",
			"slots",
			"locale"
		];
		/** Mount the shop Remote and contribute the shop's page, its sidebar row and
		* its buttons on dsh's Plugins page. */
		async function apply(ctx) {
			const predecessor = readPredecessor();
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "dsh-plugin-shop: dictionaries");
			const dispose = await ctx.remote.$mount(TYPERT_REMOTE);
			let withdrawRestart = () => {};
			ctx.effect(() => () => {
				withdrawRestart();
				return dispose();
			}, "dsh-plugin-shop: shop remote mount");
			const ns = ctx.get("remote.shop");
			if (ns === void 0) throw new Error("dsh-plugin-shop: the shop remote did not register (service \"remote.shop\" missing after $mount)");
			const unwrap = (result) => {
				if (!result.ok) throw new Error(`shop remote: ${result.error.code}: ${result.error.message}`);
				return result.value;
			};
			warmCatalog = null;
			pageRemoved = /* @__PURE__ */ new Set();
			const warmed = Promise.resolve(ns.catalog(void 0)).then((result) => unwrap(result));
			warmCatalog = {
				at: Date.now(),
				result: warmed
			};
			warmed.catch(() => {});
			Promise.resolve(ns.installed()).then((result) => unwrap(result)).catch(() => {});
			let lastVersion = null;
			const restartListeners = /* @__PURE__ */ new Set();
			const version = async () => {
				const result = unwrap(await ns.version());
				noteBoot(result.bootId);
				const previous = lastVersion;
				lastVersion = result;
				if (previous !== null && answeredByAnotherProcess(previous, result)) {
					warmCatalog = null;
					for (const listener of [...restartListeners]) listener(result);
				}
				return result;
			};
			const firstAnswer = version();
			firstAnswer.catch(() => {});
			ctx.on("connection/reset", () => {
				version().catch(() => {});
			});
			const hostCatalog = async (args) => {
				if (args?.refresh === true) {
					const refreshed = unwrap(await ns.catalog({ refresh: true }));
					warmCatalog = {
						at: Date.now(),
						result: Promise.resolve(refreshed)
					};
					return refreshed;
				}
				if (args?.reverdict === true) {
					warmCatalog = null;
					const judged = unwrap(await ns.catalog(void 0));
					warmCatalog = {
						at: Date.now(),
						result: Promise.resolve(judged)
					};
					return judged;
				}
				const warm = warmCatalog;
				if (warm !== null && Date.now() - warm.at < 3e5) try {
					return await warm.result;
				} catch {}
				const fresh = unwrap(await ns.catalog(void 0));
				warmCatalog = {
					at: Date.now(),
					result: Promise.resolve(fresh)
				};
				return fresh;
			};
			let listingRead = null;
			const listing = async () => {
				const warm = warmCatalog;
				if (warm !== null) try {
					return await warm.result;
				} catch {}
				listingRead ??= hostCatalog().finally(() => {
					listingRead = null;
				});
				return listingRead;
			};
			const handOver = async (result) => ({
				...result,
				incompatible: await refineAgainstModuleTable(result.incompatible ?? {}, ctx.get("modules"), pageRemoved)
			});
			const restart = async () => unwrap(await ns.restart());
			withdrawRestart = registerRestartCarrier(restart);
			const install = async (args) => {
				warmCatalog = null;
				return unwrap(await ns.installStart(args));
			};
			const installStatus = async (args) => unwrap(await ns.installStatus(args));
			const uninstall = async (args) => {
				warmCatalog = null;
				return unwrap(await ns.uninstallStart(args));
			};
			const updateStart = async (args) => {
				warmCatalog = null;
				return unwrap(await ns.updateStart(args));
			};
			const state = async () => unwrap(await ns.state());
			const setFavorite = async (args) => unwrap(await ns.setFavorite(args));
			const rollback = async (args) => {
				warmCatalog = null;
				return unwrap(await ns.rollbackStart(args));
			};
			const noteUninstalled = (name) => {
				pageRemoved.add(name);
			};
			const page = createPageStore(() => ({
				install,
				uninstall,
				updateStart,
				installStatus,
				noteUninstalled
			}), { pollUnwatched: true });
			disposeOccupant(installPageStore(page));
			ctx.effect(() => () => {
				page.dispose();
			}, "dsh-plugin-shop: page store");
			restartListeners.add(() => {
				page.noteRestarted();
			});
			const layout = () => ctx.get("layout");
			const selectShopPage = () => {
				const service = layout();
				if (typeof service?.selectPanel !== "function") return;
				try {
					service.selectPanel(SHOP_PANEL);
				} catch {}
			};
			/** Open the shop's own page inside dsh's plugin manager, where its Update
			* button runs the remove → install → restore operation the shop cannot run
			* on itself. `pluginNavigation.openBundle` is the direct route: it selects
			* the Plugins panel, switches to Installed and opens this package's detail
			* page. A harness without that service (before dsh's plugin manager
			* exported it) falls back to selecting the panel itself — one click further
			* from the update, but no dead button. */
			const openDshPluginPage = () => {
				const navigation = ctx.get("pluginNavigation");
				if (typeof navigation?.openBundle === "function") try {
					navigation.openBundle(SHOP_PACKAGE);
					return;
				} catch {}
				const service = layout();
				if (typeof service?.selectPanel !== "function") return;
				try {
					service.selectPanel(DSH_PLUGINS_PANEL);
				} catch {}
			};
			const injected = () => ({
				catalog: async (args) => handOver(await hostCatalog(args)),
				install,
				installStatus,
				setEnabled: async (args) => unwrap(await ns.setEnabled(args)),
				installed: async () => unwrap(await ns.installed()),
				installedSpecs: async () => unwrap(await ns.installedSpecs()),
				uninstall,
				noteUninstalled,
				restart,
				version,
				onRestarted: (listener) => {
					restartListeners.add(listener);
					return () => {
						restartListeners.delete(listener);
					};
				},
				updateStart,
				state,
				setFavorite,
				rollback,
				openUpdatePage: openDshPluginPage,
				page
			});
			ctx.slots.inject("main", () => [ctx.slots.register({
				name: "main",
				key: SHOP_PANEL,
				locale: NS,
				inject: injected
			}, ShopPage), () => {
				page.recordTeardown();
			}]);
			ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
				name: "sidebar.panellist",
				id: SHOP_PANEL,
				order: 5,
				label: () => ctx.locale.bind(NS)("title"),
				locale: NS
			}, ShopGlyph));
			ctx.slots.inject("plugins.detail.actions", () => ctx.slots.register({
				name: "plugins.detail.actions",
				id: SHOP_PANEL,
				order: 0,
				locale: NS,
				inject: () => ({
					listing,
					canOpen: () => typeof layout()?.selectPanel === "function",
					openShop: selectShopPage,
					page
				})
			}, ShopDetailAction));
			if (predecessor.kind === "section" || predecessor.kind === "page" && predecessor.showing) firstAnswer.then((answer) => {
				if (updateAwaitsRestart(answer)) selectShopPage();
			}, () => {});
		}
		//#endregion
		exports.NS = NS;
		exports.SHOP_PANEL = SHOP_PANEL;
		exports.WARM_TTL_MS = WARM_TTL_MS;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map