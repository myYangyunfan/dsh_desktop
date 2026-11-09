"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isFactoryProvider = void 0;
function isFactoryProvider(provider) {
    return !!provider.useFactory;
}
exports.isFactoryProvider = isFactoryProvider;
