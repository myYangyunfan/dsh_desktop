"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function instanceCachingFactory(factoryFunc) {
    let instance;
    return (dependencyContainer) => {
        if (instance == undefined) {
            instance = factoryFunc(dependencyContainer);
        }
        return instance;
    };
}
exports.default = instanceCachingFactory;
