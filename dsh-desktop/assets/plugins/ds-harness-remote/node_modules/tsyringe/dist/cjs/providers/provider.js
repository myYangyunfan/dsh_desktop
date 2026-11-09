"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isProvider = void 0;
const class_provider_1 = require("./class-provider");
const value_provider_1 = require("./value-provider");
const token_provider_1 = require("./token-provider");
const factory_provider_1 = require("./factory-provider");
function isProvider(provider) {
    return (class_provider_1.isClassProvider(provider) ||
        value_provider_1.isValueProvider(provider) ||
        token_provider_1.isTokenProvider(provider) ||
        factory_provider_1.isFactoryProvider(provider));
}
exports.isProvider = isProvider;
