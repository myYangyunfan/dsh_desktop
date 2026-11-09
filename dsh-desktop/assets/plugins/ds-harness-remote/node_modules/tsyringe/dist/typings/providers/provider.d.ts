import ClassProvider from "./class-provider";
import ValueProvider from "./value-provider";
import TokenProvider from "./token-provider";
import FactoryProvider from "./factory-provider";
declare type Provider<T = any> = ClassProvider<T> | ValueProvider<T> | TokenProvider<T> | FactoryProvider<T>;
export declare function isProvider(provider: any): provider is Provider;
export default Provider;
