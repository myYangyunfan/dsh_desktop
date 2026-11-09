import InjectionToken from "./injection-token";
import Provider from "./provider";
export default interface TokenProvider<T> {
    useToken: InjectionToken<T>;
}
export declare function isTokenProvider<T>(provider: Provider<T>): provider is TokenProvider<any>;
