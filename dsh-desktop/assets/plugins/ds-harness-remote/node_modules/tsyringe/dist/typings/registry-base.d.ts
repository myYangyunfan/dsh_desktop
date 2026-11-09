import { InjectionToken } from ".";
export default abstract class RegistryBase<T> {
    protected _registryMap: Map<InjectionToken<any>, T[]>;
    entries(): IterableIterator<[InjectionToken<any>, T[]]>;
    getAll(key: InjectionToken<any>): T[];
    get(key: InjectionToken<any>): T | null;
    set(key: InjectionToken<any>, value: T): void;
    setAll(key: InjectionToken<any>, value: T[]): void;
    has(key: InjectionToken<any>): boolean;
    clear(): void;
    private ensure;
}
