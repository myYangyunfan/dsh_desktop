export interface Processor<Input, Output> {
    processInput: (input: Input) => Output[];
    toJSON(): Record<string, any>;
}
export interface AVProcessor<Input> {
    processAudioInput: (input: Input) => void;
    processVideoInput: (input: Input) => void;
    toJSON(): Record<string, any>;
}
export interface SimpleProcessorCallback<Input = any, Output = any> {
    pipe: (cb: (o: Output) => void, destructor?: () => void) => SimpleProcessorCallback<Input, Output>;
    input: (input: Input) => void;
    destroy: () => void;
    toJSON(): Record<string, any>;
}
export declare const SimpleProcessorCallbackBase: <Input, Output, TBase extends new (...args: any[]) => Processor<Input, Output>>(Base: TBase) => {
    new (...args: any[]): {
        cb?: (o: Output) => void;
        destructor?: () => void;
        pipe: (cb: (o: Output) => void, destructor?: () => void) => /*elided*/ any;
        input: (input: Input) => void;
        destroy: () => void;
        processInput: (input: Input) => Output[];
        toJSON(): Record<string, any>;
    };
} & TBase;
