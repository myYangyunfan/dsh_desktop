import { __rest } from "tslib";
import { instance as globalContainer } from "../dependency-container";
function registry(registrations = []) {
    return function (target) {
        registrations.forEach((_a) => {
            var { token, options } = _a, provider = __rest(_a, ["token", "options"]);
            return globalContainer.register(token, provider, options);
        });
        return target;
    };
}
export default registry;
