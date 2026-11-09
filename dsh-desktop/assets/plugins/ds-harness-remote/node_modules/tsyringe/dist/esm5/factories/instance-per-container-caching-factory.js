export default function instancePerContainerCachingFactory(factoryFunc) {
    var cache = new WeakMap();
    return function (dependencyContainer) {
        var instance = cache.get(dependencyContainer);
        if (instance == undefined) {
            instance = factoryFunc(dependencyContainer);
            cache.set(dependencyContainer, instance);
        }
        return instance;
    };
}
