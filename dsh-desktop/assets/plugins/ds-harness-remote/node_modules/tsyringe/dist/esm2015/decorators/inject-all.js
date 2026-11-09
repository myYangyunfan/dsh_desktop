import { defineInjectionTokenMetadata } from "../reflection-helpers";
function injectAll(token, options) {
    const data = {
        token,
        multiple: true,
        isOptional: options && options.isOptional
    };
    return defineInjectionTokenMetadata(data);
}
export default injectAll;
