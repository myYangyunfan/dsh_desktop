import { defineInjectionTokenMetadata } from "../reflection-helpers";
function injectWithTransform(token, transformer) {
    var args = [];
    for (var _i = 2; _i < arguments.length; _i++) {
        args[_i - 2] = arguments[_i];
    }
    return defineInjectionTokenMetadata(token, {
        transformToken: transformer,
        args: args
    });
}
export default injectWithTransform;
