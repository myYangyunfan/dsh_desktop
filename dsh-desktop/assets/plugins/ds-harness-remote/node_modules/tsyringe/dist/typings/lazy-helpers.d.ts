import constructor from "./types/constructor";
export declare class DelayedConstructor<T> {
    private wrap;
    private reflectMethods;
    constructor(wrap: () => constructor<T>);
    createProxy(createObject: (ctor: constructor<T>) => T): T;
    private createHandler;
}
export declare function delay<T>(wrappedConstructor: () => constructor<T>): DelayedConstructor<T>;
