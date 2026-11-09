import { __rest } from "tslib";
import { instance as globalContainer } from "../dependency-container";
function registry(registrations) {
    if (registrations === void 0) { registrations = []; }
    return function (target) {
        registrations.forEach(function (_a) {
            var token = _a.token, options = _a.options, provider = __rest(_a, ["token", "options"]);
            return globalContainer.register(token, provider, options);
        });
        return target;
    };
}
export default registry;
