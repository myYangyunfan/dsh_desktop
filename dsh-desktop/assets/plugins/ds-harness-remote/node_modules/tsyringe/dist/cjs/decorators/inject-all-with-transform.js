"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const reflection_helpers_1 = require("../reflection-helpers");
function injectAllWithTransform(token, transformer, ...args) {
    const data = {
        token,
        multiple: true,
        transform: transformer,
        transformArgs: args
    };
    return reflection_helpers_1.defineInjectionTokenMetadata(data);
}
exports.default = injectAllWithTransform;
