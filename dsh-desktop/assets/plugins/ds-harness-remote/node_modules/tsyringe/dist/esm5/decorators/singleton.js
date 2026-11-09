import injectable from "./injectable";
import { instance as globalContainer } from "../dependency-container";
function singleton() {
    return function (target) {
        injectable()(target);
        globalContainer.registerSingleton(target);
    };
}
export default singleton;
