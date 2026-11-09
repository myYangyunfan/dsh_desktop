import { __read, __spread } from "tslib";
var DelayedConstructor = (function () {
    function DelayedConstructor(wrap) {
        this.wrap = wrap;
        this.reflectMethods = [
            "get",
            "getPrototypeOf",
            "setPrototypeOf",
            "getOwnPropertyDescriptor",
            "defineProperty",
            "has",
            "set",
            "deleteProperty",
            "apply",
            "construct",
            "ownKeys"
        ];
    }
    DelayedConstructor.prototype.createProxy = function (createObject) {
        var _this = this;
        var target = {};
        var init = false;
        var value;
        var delayedObject = function () {
            if (!init) {
                value = createObject(_this.wrap());
                init = true;
            }
            return value;
        };
        return new Proxy(target, this.createHandler(delayedObject));
    };
    DelayedConstructor.prototype.createHandler = function (delayedObject) {
        var handler = {};
        var install = function (name) {
            handler[name] = function () {
                var args = [];
                for (var _i = 0; _i < arguments.length; _i++) {
                    args[_i] = arguments[_i];
                }
                args[0] = delayedObject();
                var method = Reflect[name];
                return method.apply(void 0, __spread(args));
            };
        };
        this.reflectMethods.forEach(install);
        return handler;
    };
    return DelayedConstructor;
}());
export { DelayedConstructor };
export function delay(wrappedConstructor) {
    if (typeof wrappedConstructor === "undefined") {
        throw new Error("Attempt to `delay` undefined. Constructor must be wrapped in a callback");
    }
    return new DelayedConstructor(wrappedConstructor);
}
