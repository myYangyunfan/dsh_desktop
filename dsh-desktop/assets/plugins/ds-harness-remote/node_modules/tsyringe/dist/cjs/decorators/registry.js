"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const dependency_container_1 = require("../dependency-container");
function registry(registrations = []) {
    return function (target) {
        registrations.forEach((_a) => {
            var { token, options } = _a, provider = tslib_1.__rest(_a, ["token", "options"]);
            return dependency_container_1.instance.register(token, provider, options);
        });
        return target;
    };
}
exports.default = registry;
