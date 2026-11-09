import { __awaiter } from "tslib";
import { isClassProvider, isFactoryProvider, isNormalToken, isTokenProvider, isValueProvider } from "./providers";
import { isProvider } from "./providers/provider";
import { isConstructorToken, isTokenDescriptor, isTransformDescriptor } from "./providers/injection-token";
import Registry from "./registry";
import Lifecycle from "./types/lifecycle";
import ResolutionContext from "./resolution-context";
import { formatErrorCtor } from "./error-helpers";
import { DelayedConstructor } from "./lazy-helpers";
import { isDisposable } from "./types/disposable";
import Interceptors from "./interceptors";
export const typeInfo = new Map();
class InternalDependencyContainer {
    constructor(parent) {
        this.parent = parent;
        this._registry = new Registry();
        this.interceptors = new Interceptors();
        this.disposed = false;
        this.disposables = new Set();
    }
    register(token, providerOrConstructor, options = { lifecycle: Lifecycle.Transient }) {
        this.ensureNotDisposed();
        let provider;
        if (!isProvider(providerOrConstructor)) {
            provider = { useClass: providerOrConstructor };
        }
        else {
            provider = providerOrConstructor;
        }
        if (isTokenProvider(provider)) {
            const path = [token];
            let tokenProvider = provider;
            while (tokenProvider != null) {
                const currentToken = tokenProvider.useToken;
                if (path.includes(currentToken)) {
                    throw new Error(`Token registration cycle detected! ${[...path, currentToken].join(" -> ")}`);
                }
                path.push(currentToken);
                const registration = this._registry.get(currentToken);
                if (registration && isTokenProvider(registration.provider)) {
                    tokenProvider = registration.provider;
                }
                else {
                    tokenProvider = null;
                }
            }
        }
        if (options.lifecycle === Lifecycle.Singleton ||
            options.lifecycle == Lifecycle.ContainerScoped ||
            options.lifecycle == Lifecycle.ResolutionScoped) {
            if (isValueProvider(provider) || isFactoryProvider(provider)) {
                throw new Error(`Cannot use lifecycle "${Lifecycle[options.lifecycle]}" with ValueProviders or FactoryProviders`);
            }
        }
        this._registry.set(token, { provider, options });
        return this;
    }
    registerType(from, to) {
        this.ensureNotDisposed();
        if (isNormalToken(to)) {
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
        if (isNormalToken(from)) {
            if (isNormalToken(to)) {
                return this.register(from, {
                    useToken: to
                }, { lifecycle: Lifecycle.Singleton });
            }
            else if (to) {
                return this.register(from, {
                    useClass: to
                }, { lifecycle: Lifecycle.Singleton });
            }
            throw new Error('Cannot register a type name as a singleton without a "to" token');
        }
        let useClass = from;
        if (to && !isNormalToken(to)) {
            useClass = to;
        }
        return this.register(from, {
            useClass
        }, { lifecycle: Lifecycle.Singleton });
    }
    resolve(token, context = new ResolutionContext(), isOptional = false) {
        this.ensureNotDisposed();
        const registration = this.getRegistration(token);
        if (!registration && isNormalToken(token)) {
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
        if (isConstructorToken(token)) {
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
        if (registration.options.lifecycle === Lifecycle.ResolutionScoped &&
            context.scopedResolutions.has(registration)) {
            return context.scopedResolutions.get(registration);
        }
        const isSingleton = registration.options.lifecycle === Lifecycle.Singleton;
        const isContainerScoped = registration.options.lifecycle === Lifecycle.ContainerScoped;
        const returnInstance = isSingleton || isContainerScoped;
        let resolved;
        if (isValueProvider(registration.provider)) {
            resolved = registration.provider.useValue;
        }
        else if (isTokenProvider(registration.provider)) {
            resolved = returnInstance
                ? registration.instance ||
                    (registration.instance = this.resolve(registration.provider.useToken, context))
                : this.resolve(registration.provider.useToken, context);
        }
        else if (isClassProvider(registration.provider)) {
            resolved = returnInstance
                ? registration.instance ||
                    (registration.instance = this.construct(registration.provider.useClass, context))
                : this.construct(registration.provider.useClass, context);
        }
        else if (isFactoryProvider(registration.provider)) {
            resolved = registration.provider.useFactory(this);
        }
        else {
            resolved = this.construct(registration.provider, context);
        }
        if (registration.options.lifecycle === Lifecycle.ResolutionScoped) {
            context.scopedResolutions.set(registration, resolved);
        }
        return resolved;
    }
    resolveAll(token, context = new ResolutionContext(), isOptional = false) {
        this.ensureNotDisposed();
        const registrations = this.getAllRegistrations(token);
        if (!registrations && isNormalToken(token)) {
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
                .filter(registration => !isValueProvider(registration.provider))
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
            if (registrations.some(({ options }) => options.lifecycle === Lifecycle.ContainerScoped)) {
                childContainer._registry.setAll(token, registrations.map(registration => {
                    if (registration.options.lifecycle === Lifecycle.ContainerScoped) {
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
        return __awaiter(this, void 0, void 0, function* () {
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
        if (ctor instanceof DelayedConstructor) {
            return ctor.createProxy((target) => this.resolve(target, context));
        }
        const instance = (() => {
            const paramInfo = typeInfo.get(ctor);
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
        if (isDisposable(instance)) {
            this.disposables.add(instance);
        }
        return instance;
    }
    resolveParams(context, ctor) {
        return (param, idx) => {
            try {
                if (isTokenDescriptor(param)) {
                    if (isTransformDescriptor(param)) {
                        return param.multiple
                            ? this.resolve(param.transform).transform(this.resolveAll(param.token, new ResolutionContext(), param.isOptional), ...param.transformArgs)
                            : this.resolve(param.transform).transform(this.resolve(param.token, context, param.isOptional), ...param.transformArgs);
                    }
                    else {
                        return param.multiple
                            ? this.resolveAll(param.token, new ResolutionContext(), param.isOptional)
                            : this.resolve(param.token, context, param.isOptional);
                    }
                }
                else if (isTransformDescriptor(param)) {
                    return this.resolve(param.transform, context).transform(this.resolve(param.token, context), ...param.transformArgs);
                }
                return this.resolve(param, context);
            }
            catch (e) {
                throw new Error(formatErrorCtor(ctor, idx, e));
            }
        };
    }
    ensureNotDisposed() {
        if (this.disposed) {
            throw new Error("This container has been disposed, you cannot interact with a disposed container");
        }
    }
}
export const instance = new InternalDependencyContainer();
export default instance;
