import { getParamInfo } from "../reflection-helpers";
import { typeInfo } from "../dependency-container";
import { instance as globalContainer } from "../dependency-container";
function injectable(options) {
    return function (target) {
        typeInfo.set(target, getParamInfo(target));
        if (options && options.token) {
            if (!Array.isArray(options.token)) {
                globalContainer.register(options.token, target);
            }
            else {
                options.token.forEach(function (token) {
                    globalContainer.register(token, target);
                });
            }
        }
    };
}
export default injectable;
