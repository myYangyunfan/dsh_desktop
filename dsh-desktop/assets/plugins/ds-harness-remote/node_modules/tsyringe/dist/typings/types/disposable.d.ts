export default interface Disposable {
    dispose(): Promise<void> | void;
}
export declare function isDisposable(value: any): value is Disposable;
