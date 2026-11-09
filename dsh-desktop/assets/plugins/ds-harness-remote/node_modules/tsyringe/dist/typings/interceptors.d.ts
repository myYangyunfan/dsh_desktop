import RegistryBase from "./registry-base";
import { InterceptionOptions } from "./types";
import { PostResolutionInterceptorCallback, PreResolutionInterceptorCallback } from "./types/dependency-container";
export declare type PreResolutionInterceptor = {
    callback: PreResolutionInterceptorCallback;
    options: InterceptionOptions;
};
export declare type PostResolutionInterceptor = {
    callback: PostResolutionInterceptorCallback;
    options: InterceptionOptions;
};
export declare class PreResolutionInterceptors extends RegistryBase<PreResolutionInterceptor> {
}
export declare class PostResolutionInterceptors extends RegistryBase<PostResolutionInterceptor> {
}
export default class Interceptors {
    preResolution: PreResolutionInterceptors;
    postResolution: PostResolutionInterceptors;
}
