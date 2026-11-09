export default function predicateAwareClassFactory(predicate, trueConstructor, falseConstructor, useCaching) {
    if (useCaching === void 0) { useCaching = true; }
    var instance;
    var previousPredicate;
    return function (dependencyContainer) {
        var currentPredicate = predicate(dependencyContainer);
        if (!useCaching || previousPredicate !== currentPredicate) {
            if ((previousPredicate = currentPredicate)) {
                instance = dependencyContainer.resolve(trueConstructor);
            }
            else {
                instance = dependencyContainer.resolve(falseConstructor);
            }
        }
        return instance;
    };
}
