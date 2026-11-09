import { defineInjectionTokenMetadata } from "../reflection-helpers";
function injectWithTransform(token, transformer, ...args) {
    return defineInjectionTokenMetadata(token, {
        transformToken: transformer,
        args: args
    });
}
export default injectWithTransform;
