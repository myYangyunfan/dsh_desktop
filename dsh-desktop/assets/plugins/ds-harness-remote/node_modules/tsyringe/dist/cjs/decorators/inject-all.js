"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const reflection_helpers_1 = require("../reflection-helpers");
function injectAll(token, options) {
    const data = {
        token,
        multiple: true,
        isOptional: options && options.isOptional
    };
    return reflection_helpers_1.defineInjectionTokenMetadata(data);
}
exports.default = injectAll;
