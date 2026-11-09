export default function instancePerContainerCachingFactory(factoryFunc) {
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
