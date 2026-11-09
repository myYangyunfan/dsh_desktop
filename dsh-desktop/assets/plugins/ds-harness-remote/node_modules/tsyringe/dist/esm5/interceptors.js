import { __extends } from "tslib";
import RegistryBase from "./registry-base";
var PreResolutionInterceptors = (function (_super) {
    __extends(PreResolutionInterceptors, _super);
    function PreResolutionInterceptors() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    return PreResolutionInterceptors;
}(RegistryBase));
export { PreResolutionInterceptors };
var PostResolutionInterceptors = (function (_super) {
    __extends(PostResolutionInterceptors, _super);
    function PostResolutionInterceptors() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    return PostResolutionInterceptors;
}(RegistryBase));
export { PostResolutionInterceptors };
var Interceptors = (function () {
    function Interceptors() {
        this.preResolution = new PreResolutionInterceptors();
        this.postResolution = new PostResolutionInterceptors();
    }
    return Interceptors;
}());
export default Interceptors;
