import { defineInjectionTokenMetadata } from "../reflection-helpers";
function injectAll(token, options) {
    var data = {
        token: token,
        multiple: true,
        isOptional: options && options.isOptional
    };
    return defineInjectionTokenMetadata(data);
}
export default injectAll;
