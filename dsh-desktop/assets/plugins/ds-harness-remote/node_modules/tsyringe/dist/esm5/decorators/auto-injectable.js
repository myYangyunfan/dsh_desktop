import { __extends, __read, __spread } from "tslib";
import { getParamInfo } from "../reflection-helpers";
import { instance as globalContainer } from "../dependency-container";
import { isTokenDescriptor, isTransformDescriptor } from "../providers/injection-token";
import { formatErrorCtor } from "../error-helpers";
function autoInjectable() {
    return function (target) {
        var paramInfo = getParamInfo(target);
        return (function (_super) {
            __extends(class_1, _super);
            function class_1() {
                var args = [];
                for (var _i = 0; _i < arguments.length; _i++) {
                    args[_i] = arguments[_i];
                }
                return _super.apply(this, __spread(args.concat(paramInfo.slice(args.length).map(function (type, index) {
                    var _a, _b, _c;
                    try {
                        if (isTokenDescriptor(type)) {
                            if (isTransformDescriptor(type)) {
                                return type.multiple
                                    ? (_a = globalContainer
                                        .resolve(type.transform)).transform.apply(_a, __spread([globalContainer.resolveAll(type.token)], type.transformArgs)) : (_b = globalContainer
                                    .resolve(type.transform)).transform.apply(_b, __spread([globalContainer.resolve(type.token)], type.transformArgs));
                            }
                            else {
                                return type.multiple
                                    ? globalContainer.resolveAll(type.token)
                                    : globalContainer.resolve(type.token);
                            }
                        }
                        else if (isTransformDescriptor(type)) {
                            return (_c = globalContainer
                                .resolve(type.transform)).transform.apply(_c, __spread([globalContainer.resolve(type.token)], type.transformArgs));
                        }
                        return globalContainer.resolve(type);
                    }
                    catch (e) {
                        var argIndex = index + args.length;
                        throw new Error(formatErrorCtor(target, argIndex, e));
                    }
                })))) || this;
            }
            return class_1;
        }(target));
    };
}
export default autoInjectable;
