import { type LipSyncOptions, LipsyncBase, type LipsyncInput, type LipsyncOutput } from "./lipsync";
export declare class LipsyncCallback extends LipsyncBase {
    private audioCb?;
    private audioDestructor?;
    private videoCb?;
    private videoDestructor?;
    constructor(options?: Partial<LipSyncOptions>);
    pipeAudio: (cb: (input: LipsyncOutput) => void, destructor?: () => void) => void;
    pipeVideo: (cb: (input: LipsyncOutput) => void, destructor?: () => void) => void;
    inputAudio: (input: LipsyncInput) => void;
    inputVideo: (input: LipsyncInput) => void;
    destroy: () => void;
}
