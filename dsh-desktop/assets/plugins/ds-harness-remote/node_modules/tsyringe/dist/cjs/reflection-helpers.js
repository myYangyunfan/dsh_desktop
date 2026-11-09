"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defineInjectionTokenMetadata = exports.getParamInfo = exports.INJECTION_TOKEN_METADATA_KEY = void 0;
exports.INJECTION_TOKEN_METADATA_KEY = "injectionTokens";
function getParamInfo(target) {
    const params = Reflect.getMetadata("design:paramtypes", target) || [];
    const injectionTokens = Reflect.getOwnMetadata(exports.INJECTION_TOKEN_METADATA_KEY, target) || {};
    Object.keys(injectionTokens).forEach(key => {
        params[+key] = injectionTokens[key];
    });
    return params;
}
exports.getParamInfo = getParamInfo;
function defineInjectionTokenMetadata(data, transform) {
    return function (target, _propertyKey, parameterIndex) {
        const descriptors = Reflect.getOwnMetadata(exports.INJECTION_TOKEN_METADATA_KEY, target) || {};
        descriptors[parameterIndex] = transform
            ? {
                token: data,
                transform: transform.transformToken,
                transformArgs: transform.args || []
            }
            : data;
        Reflect.defineMetadata(exports.INJECTION_TOKEN_METADATA_KEY, descriptors, target);
    };
}
exports.defineInjectionTokenMetadata = defineInjectionTokenMetadata;
