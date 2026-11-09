import Provider from "./provider";
export default interface ValueProvider<T> {
    useValue: T;
}
export declare function isValueProvider<T>(provider: Provider<T>): provider is ValueProvider<T>;
