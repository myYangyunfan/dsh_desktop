"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const reflection_helpers_1 = require("../reflection-helpers");
const dependency_container_1 = require("../dependency-container");
const injection_token_1 = require("../providers/injection-token");
const error_helpers_1 = require("../error-helpers");
function autoInjectable() {
    return function (target) {
        const paramInfo = reflection_helpers_1.getParamInfo(target);
        return class extends target {
            constructor(...args) {
                super(...args.concat(paramInfo.slice(args.length).map((type, index) => {
                    try {
                        if (injection_token_1.isTokenDescriptor(type)) {
                            if (injection_token_1.isTransformDescriptor(type)) {
                                return type.multiple
                                    ? dependency_container_1.instance
                                        .resolve(type.transform)
                                        .transform(dependency_container_1.instance.resolveAll(type.token), ...type.transformArgs)
                                    : dependency_container_1.instance
                                        .resolve(type.transform)
                                        .transform(dependency_container_1.instance.resolve(type.token), ...type.transformArgs);
                            }
                            else {
                                return type.multiple
                                    ? dependency_container_1.instance.resolveAll(type.token)
                                    : dependency_container_1.instance.resolve(type.token);
                            }
                        }
                        else if (injection_token_1.isTransformDescriptor(type)) {
                            return dependency_container_1.instance
                                .resolve(type.transform)
                                .transform(dependency_container_1.instance.resolve(type.token), ...type.transformArgs);
                        }
                        return dependency_container_1.instance.resolve(type);
                    }
                    catch (e) {
                        const argIndex = index + args.length;
                        throw new Error(error_helpers_1.formatErrorCtor(target, argIndex, e));
                    }
                })));
            }
        };
    };
}
exports.default = autoInjectable;
