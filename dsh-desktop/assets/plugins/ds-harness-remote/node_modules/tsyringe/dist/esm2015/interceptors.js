import RegistryBase from "./registry-base";
export class PreResolutionInterceptors extends RegistryBase {
}
export class PostResolutionInterceptors extends RegistryBase {
}
export default class Interceptors {
    constructor() {
        this.preResolution = new PreResolutionInterceptors();
        this.postResolution = new PostResolutionInterceptors();
    }
}
