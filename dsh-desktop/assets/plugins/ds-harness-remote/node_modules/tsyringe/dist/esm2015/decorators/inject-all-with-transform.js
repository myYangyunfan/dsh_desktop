import { defineInjectionTokenMetadata } from "../reflection-helpers";
function injectAllWithTransform(token, transformer, ...args) {
    const data = {
        token,
        multiple: true,
        transform: transformer,
        transformArgs: args
    };
    return defineInjectionTokenMetadata(data);
}
export default injectAllWithTransform;
