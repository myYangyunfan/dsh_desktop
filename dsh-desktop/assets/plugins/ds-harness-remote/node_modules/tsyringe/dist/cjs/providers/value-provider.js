"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValueProvider = void 0;
function isValueProvider(provider) {
    return provider.useValue != undefined;
}
exports.isValueProvider = isValueProvider;
