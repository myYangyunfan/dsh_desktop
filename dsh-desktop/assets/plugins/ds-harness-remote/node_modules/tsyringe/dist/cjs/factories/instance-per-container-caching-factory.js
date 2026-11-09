"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function instancePerContainerCachingFactory(factoryFunc) {
    const cache = new WeakMap();
    return (dependencyContainer) => {
        let instance = cache.get(dependencyContainer);
        if (instance == undefined) {
            instance = factoryFunc(dependencyContainer);
            cache.set(dependencyContainer, instance);
        }
        return instance;
    };
}
exports.default = instancePerContainerCachingFactory;
