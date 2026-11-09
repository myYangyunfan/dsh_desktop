"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const reflection_helpers_1 = require("../reflection-helpers");
function injectWithTransform(token, transformer, ...args) {
    return reflection_helpers_1.defineInjectionTokenMetadata(token, {
        transformToken: transformer,
        args: args
    });
}
exports.default = injectWithTransform;
