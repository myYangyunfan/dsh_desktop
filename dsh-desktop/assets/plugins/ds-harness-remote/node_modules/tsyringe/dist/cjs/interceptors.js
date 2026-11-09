"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostResolutionInterceptors = exports.PreResolutionInterceptors = void 0;
const registry_base_1 = require("./registry-base");
class PreResolutionInterceptors extends registry_base_1.default {
}
exports.PreResolutionInterceptors = PreResolutionInterceptors;
class PostResolutionInterceptors extends registry_base_1.default {
}
exports.PostResolutionInterceptors = PostResolutionInterceptors;
class Interceptors {
    constructor() {
        this.preResolution = new PreResolutionInterceptors();
        this.postResolution = new PostResolutionInterceptors();
    }
}
exports.default = Interceptors;
