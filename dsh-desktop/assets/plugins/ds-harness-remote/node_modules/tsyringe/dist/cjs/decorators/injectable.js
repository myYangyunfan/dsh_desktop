"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const reflection_helpers_1 = require("../reflection-helpers");
const dependency_container_1 = require("../dependency-container");
const dependency_container_2 = require("../dependency-container");
function injectable(options) {
    return function (target) {
        dependency_container_1.typeInfo.set(target, reflection_helpers_1.getParamInfo(target));
        if (options && options.token) {
            if (!Array.isArray(options.token)) {
                dependency_container_2.instance.register(options.token, target);
            }
            else {
                options.token.forEach(token => {
                    dependency_container_2.instance.register(token, target);
                });
            }
        }
    };
}
exports.default = injectable;
