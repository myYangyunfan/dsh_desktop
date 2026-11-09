export default function predicateAwareClassFactory(predicate, trueConstructor, falseConstructor, useCaching = true) {
    let instance;
    let previousPredicate;
    return (dependencyContainer) => {
        const currentPredicate = predicate(dependencyContainer);
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
