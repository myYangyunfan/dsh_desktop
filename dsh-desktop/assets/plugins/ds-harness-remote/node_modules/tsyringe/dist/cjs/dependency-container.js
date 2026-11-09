"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.instance = exports.typeInfo = void 0;
const tslib_1 = require("tslib");
const providers_1 = require("./providers");
const provider_1 = require("./providers/provider");
const injection_token_1 = require("./providers/injection-token");
const registry_1 = require("./registry");
const lifecycle_1 = require("./types/lifecycle");
const resolution_context_1 = require("./resolution-context");
const error_helpers_1 = require("./error-helpers");
const lazy_helpers_1 = require("./lazy-helpers");
const disposable_1 = require("./types/disposable");
const interceptors_1 = require("./interceptors");
exports.typeInfo = new Map();
class InternalDependencyContainer {
    constructor(parent) {
        this.parent = parent;
        this._registry = new registry_1.default();
        this.interceptors = new interceptors_1.default();
        this.disposed = false;
        this.disposables = new Set();
    }
    register(token, providerOrConstructor, options = { lifecycle: lifecycle_1.default.Transient }) {
        this.ensureNotDisposed();
        let provider;
        if (!provider_1.isProvider(providerOrConstructor)) {
            provider = { useClass: providerOrConstructor };
        }
        else {
            provider = providerOrConstructor;
        }
        if (providers_1.isTokenProvider(provider)) {
            const path = [token];
            let tokenProvider = provider;
            while (tokenProvider != null) {
                const currentToken = tokenProvider.useToken;
                if (path.includes(currentToken)) {
                    throw new Error(`Token registration cycle detected! ${[...path, currentToken].join(" -> ")}`);
                }
                path.push(currentToken);
                const registration = this._registry.get(currentToken);
                if (registration && providers_1.isTokenProvider(registration.provider)) {
                    tokenProvider = registration.provider;
                }
                else {
                    tokenProvider = null;
                }
            }
        }
        if (options.lifecycle === lifecycle_1.default.Singleton ||
            options.lifecycle == lifecycle_1.default.ContainerScoped ||
            options.lifecycle == lifecycle_1.default.ResolutionScoped) {
            if (providers_1.isValueProvider(provider) || providers_1.isFactoryProvider(provider)) {
                throw new Error(`Cannot use lifecycle "${lifecycle_1.default[options.lifecycle]}" with ValueProviders or FactoryProviders`);
            }
        }
        this._registry.set(token, { provider, options });
        return this;
    }
    registerType(from, to) {
        this.ensureNotDisposed();
        if (providers_1.isNormalToken(to)) {
            return this.register(from, {
                useToken: to
            });
        }
        return this.register(from, {
            useClass: to
        });
    }
    registerInstance(token, instance) {
        this.ensureNotDisposed();
        return this.register(token, {
            useValue: instance
        });
    }
    registerSingleton(from, to) {
        this.ensureNotDisposed();
        if (providers_1.isNormalToken(from)) {
            if (providers_1.isNormalToken(to)) {
                return this.register(from, {
                    useToken: to
                }, { lifecycle: lifecycle_1.default.Singleton });
            }
            else if (to) {
                return this.register(from, {
                    useClass: to
                }, { lifecycle: lifecycle_1.default.Singleton });
            }
            throw new Error('Cannot register a type name as a singleton without a "to" token');
        }
        let useClass = from;
        if (to && !providers_1.isNormalToken(to)) {
            useClass = to;
        }
        return this.register(from, {
            useClass
        }, { lifecycle: lifecycle_1.default.Singleton });
    }
    resolve(token, context = new resolution_context_1.default(), isOptional = false) {
        this.ensureNotDisposed();
        const registration = this.getRegistration(token);
        if (!registration && providers_1.isNormalToken(token)) {
            if (isOptional) {
                return undefined;
            }
            throw new Error(`Attempted to resolve unregistered dependency token: "${token.toString()}"`);
        }
        this.executePreResolutionInterceptor(token, "Single");
        if (registration) {
            const result = this.resolveRegistration(registration, context);
            this.executePostResolutionInterceptor(token, result, "Single");
            return result;
        }
        if (injection_token_1.isConstructorToken(token)) {
            const result = this.construct(token, context);
            this.executePostResolutionInterceptor(token, result, "Single");
            return result;
        }
        throw new Error("Attempted to construct an undefined constructor. Could mean a circular dependency problem. Try using `delay` function.");
    }
    executePreResolutionInterceptor(token, resolutionType) {
        if (this.interceptors.preResolution.has(token)) {
            const remainingInterceptors = [];
            for (const interceptor of this.interceptors.preResolution.getAll(token)) {
                if (interceptor.options.frequency != "Once") {
                    remainingInterceptors.push(interceptor);
                }
                interceptor.callback(token, resolutionType);
            }
            this.interceptors.preResolution.setAll(token, remainingInterceptors);
        }
    }
    executePostResolutionInterceptor(token, result, resolutionType) {
        if (this.interceptors.postResolution.has(token)) {
            const remainingInterceptors = [];
            for (const interceptor of this.interceptors.postResolution.getAll(token)) {
                if (interceptor.options.frequency != "Once") {
                    remainingInterceptors.push(interceptor);
                }
                interceptor.callback(token, result, resolutionType);
            }
            this.interceptors.postResolution.setAll(token, remainingInterceptors);
        }
    }
    resolveRegistration(registration, context) {
        this.ensureNotDisposed();
        if (registration.options.lifecycle === lifecycle_1.default.ResolutionScoped &&
            context.scopedResolutions.has(registration)) {
            return context.scopedResolutions.get(registration);
        }
        const isSingleton = registration.options.lifecycle === lifecycle_1.default.Singleton;
        const isContainerScoped = registration.options.lifecycle === lifecycle_1.default.ContainerScoped;
        const returnInstance = isSingleton || isContainerScoped;
        let resolved;
        if (providers_1.isValueProvider(registration.provider)) {
            resolved = registration.provider.useValue;
        }
        else if (providers_1.isTokenProvider(registration.provider)) {
            resolved = returnInstance
                ? registration.instance ||
                    (registration.instance = this.resolve(registration.provider.useToken, context))
                : this.resolve(registration.provider.useToken, context);
        }
        else if (providers_1.isClassProvider(registration.provider)) {
            resolved = returnInstance
                ? registration.instance ||
                    (registration.instance = this.construct(registration.provider.useClass, context))
                : this.construct(registration.provider.useClass, context);
        }
        else if (providers_1.isFactoryProvider(registration.provider)) {
            resolved = registration.provider.useFactory(this);
        }
        else {
            resolved = this.construct(registration.provider, context);
        }
        if (registration.options.lifecycle === lifecycle_1.default.ResolutionScoped) {
            context.scopedResolutions.set(registration, resolved);
        }
        return resolved;
    }
    resolveAll(token, context = new resolution_context_1.default(), isOptional = false) {
        this.ensureNotDisposed();
        const registrations = this.getAllRegistrations(token);
        if (!registrations && providers_1.isNormalToken(token)) {
            if (isOptional) {
                return [];
            }
            throw new Error(`Attempted to resolve unregistered dependency token: "${token.toString()}"`);
        }
        this.executePreResolutionInterceptor(token, "All");
        if (registrations) {
            const result = registrations.map(item => this.resolveRegistration(item, context));
            this.executePostResolutionInterceptor(token, result, "All");
            return result;
        }
        const result = [this.construct(token, context)];
        this.executePostResolutionInterceptor(token, result, "All");
        return result;
    }
    isRegistered(token, recursive = false) {
        this.ensureNotDisposed();
        return (this._registry.has(token) ||
            (recursive &&
                (this.parent || false) &&
                this.parent.isRegistered(token, true)));
    }
    reset() {
        this.ensureNotDisposed();
        this._registry.clear();
        this.interceptors.preResolution.clear();
        this.interceptors.postResolution.clear();
    }
    clearInstances() {
        this.ensureNotDisposed();
        for (const [token, registrations] of this._registry.entries()) {
            this._registry.setAll(token, registrations
                .filter(registration => !providers_1.isValueProvider(registration.provider))
                .map(registration => {
                registration.instance = undefined;
                return registration;
            }));
        }
    }
    createChildContainer() {
        this.ensureNotDisposed();
        const childContainer = new InternalDependencyContainer(this);
        for (const [token, registrations] of this._registry.entries()) {
            if (registrations.some(({ options }) => options.lifecycle === lifecycle_1.default.ContainerScoped)) {
                childContainer._registry.setAll(token, registrations.map(registration => {
                    if (registration.options.lifecycle === lifecycle_1.default.ContainerScoped) {
                        return {
                            provider: registration.provider,
                            options: registration.options
                        };
                    }
                    return registration;
                }));
            }
        }
        return childContainer;
    }
    beforeResolution(token, callback, options = { frequency: "Always" }) {
        this.interceptors.preResolution.set(token, {
            callback: callback,
            options: options
        });
    }
    afterResolution(token, callback, options = { frequency: "Always" }) {
        this.interceptors.postResolution.set(token, {
            callback: callback,
            options: options
        });
    }
    dispose() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            this.disposed = true;
            const promises = [];
            this.disposables.forEach(disposable => {
                const maybePromise = disposable.dispose();
                if (maybePromise) {
                    promises.push(maybePromise);
                }
            });
            yield Promise.all(promises);
        });
    }
    getRegistration(token) {
        if (this.isRegistered(token)) {
            return this._registry.get(token);
        }
        if (this.parent) {
            return this.parent.getRegistration(token);
        }
        return null;
    }
    getAllRegistrations(token) {
        if (this.isRegistered(token)) {
            return this._registry.getAll(token);
        }
        if (this.parent) {
            return this.parent.getAllRegistrations(token);
        }
        return null;
    }
    construct(ctor, context) {
        if (ctor instanceof lazy_helpers_1.DelayedConstructor) {
            return ctor.createProxy((target) => this.resolve(target, context));
        }
        const instance = (() => {
            const paramInfo = exports.typeInfo.get(ctor);
            if (!paramInfo || paramInfo.length === 0) {
                if (ctor.length === 0) {
                    return new ctor();
                }
                else {
                    throw new Error(`TypeInfo not known for "${ctor.name}"`);
                }
            }
            const params = paramInfo.map(this.resolveParams(context, ctor));
            return new ctor(...params);
        })();
        if (disposable_1.isDisposable(instance)) {
            this.disposables.add(instance);
        }
        return instance;
    }
    resolveParams(context, ctor) {
        return (param, idx) => {
            try {
                if (injection_token_1.isTokenDescriptor(param)) {
                    if (injection_token_1.isTransformDescriptor(param)) {
                        return param.multiple
                            ? this.resolve(param.transform).transform(this.resolveAll(param.token, new resolution_context_1.default(), param.isOptional), ...param.transformArgs)
                            : this.resolve(param.transform).transform(this.resolve(param.token, context, param.isOptional), ...param.transformArgs);
                    }
                    else {
                        return param.multiple
                            ? this.resolveAll(param.token, new resolution_context_1.default(), param.isOptional)
                            : this.resolve(param.token, context, param.isOptional);
                    }
                }
                else if (injection_token_1.isTransformDescriptor(param)) {
                    return this.resolve(param.transform, context).transform(this.resolve(param.token, context), ...param.transformArgs);
                }
                return this.resolve(param, context);
            }
            catch (e) {
                throw new Error(error_helpers_1.formatErrorCtor(ctor, idx, e));
            }
        };
    }
    ensureNotDisposed() {
        if (this.disposed) {
            throw new Error("This container has been disposed, you cannot interact with a disposed container");
        }
    }
}
exports.instance = new InternalDependencyContainer();
exports.default = exports.instance;
