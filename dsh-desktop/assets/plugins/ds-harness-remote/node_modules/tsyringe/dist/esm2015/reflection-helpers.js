export const INJECTION_TOKEN_METADATA_KEY = "injectionTokens";
export function getParamInfo(target) {
    const params = Reflect.getMetadata("design:paramtypes", target) || [];
    const injectionTokens = Reflect.getOwnMetadata(INJECTION_TOKEN_METADATA_KEY, target) || {};
    Object.keys(injectionTokens).forEach(key => {
        params[+key] = injectionTokens[key];
    });
    return params;
}
export function defineInjectionTokenMetadata(data, transform) {
    return function (target, _propertyKey, parameterIndex) {
        const descriptors = Reflect.getOwnMetadata(INJECTION_TOKEN_METADATA_KEY, target) || {};
        descriptors[parameterIndex] = transform
            ? {
                token: data,
                transform: transform.transformToken,
                transformArgs: transform.args || []
            }
            : data;
        Reflect.defineMetadata(INJECTION_TOKEN_METADATA_KEY, descriptors, target);
    };
}
