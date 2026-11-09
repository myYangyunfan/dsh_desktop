"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const reflection_helpers_1 = require("../reflection-helpers");
function inject(token, options) {
    const data = {
        token,
        multiple: false,
        isOptional: options && options.isOptional
    };
    return reflection_helpers_1.defineInjectionTokenMetadata(data);
}
exports.default = inject;
