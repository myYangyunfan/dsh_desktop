import { defineInjectionTokenMetadata } from "../reflection-helpers";
function inject(token, options) {
    var data = {
        token: token,
        multiple: false,
        isOptional: options && options.isOptional
    };
    return defineInjectionTokenMetadata(data);
}
export default inject;
