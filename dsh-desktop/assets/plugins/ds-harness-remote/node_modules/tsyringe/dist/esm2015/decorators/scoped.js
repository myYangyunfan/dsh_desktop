import injectable from "./injectable";
import { instance as globalContainer } from "../dependency-container";
export default function scoped(lifecycle, token) {
    return function (target) {
        injectable()(target);
        globalContainer.register(token || target, target, {
            lifecycle
        });
    };
}
