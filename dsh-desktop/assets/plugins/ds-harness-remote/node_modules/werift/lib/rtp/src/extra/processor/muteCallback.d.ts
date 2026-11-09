import type { SimpleProcessorCallback } from "./interface";
import { MuteHandlerBase, type MuteInput, type MuteOutput } from "./mute";
export declare class MuteCallback extends MuteHandlerBase implements SimpleProcessorCallback<MuteInput, MuteOutput> {
    private cb?;
    destructor?: () => void;
    constructor(props: ConstructorParameters<typeof MuteHandlerBase>[1]);
    pipe: (cb: (input: MuteOutput) => void, destructor?: () => void) => this;
    input: (input: MuteInput) => void;
    destroy: () => void;
}
