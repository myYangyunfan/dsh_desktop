import type { CodecFrame } from "./depacketizer";
import type { AVProcessor } from "./interface";
import type { MediaKind } from "./webm";
export type LipsyncInput = {
    frame?: CodecFrame;
    eol?: boolean;
};
export type LipsyncOutput = {
    frame?: CodecFrame;
    eol?: boolean;
};
export declare class LipsyncBase implements AVProcessor<LipsyncInput> {
    private audioOutput;
    private videoOutput;
    private options;
    private id;
    bufferLength: number;
    /**ms */
    baseTime?: number;
    audioBuffer: {
        frame: CodecFrame;
        kind: MediaKind;
        [key: string]: any;
    }[][];
    videoBuffer: {
        frame: CodecFrame;
        kind: MediaKind;
    }[][];
    stopped: boolean;
    /**ms */
    private interval;
    /**ms */
    private bufferDuration;
    private ptime;
    private index;
    private currentTimestamp;
    /**ms */
    private lastCommittedTime;
    private lastExecutionTime;
    private internalStats;
    /**ms */
    private lastFrameReceivedAt;
    constructor(audioOutput: (output: LipsyncOutput) => void, videoOutput: (output: LipsyncOutput) => void, options?: Partial<LipSyncOptions>);
    toJSON(): Record<string, any>;
    private executeTask;
    private stop;
    processAudioInput: ({ frame, eol }: LipsyncInput) => void;
    processVideoInput: ({ frame, eol }: LipsyncInput) => void;
    private processInput;
}
export interface LipSyncOptions {
    /**ms */
    syncInterval: number;
    /**
     * int
     * @description syncInterval * bufferLength = max packet lifetime
     * */
    bufferLength: number;
    fillDummyAudioPacket: Buffer;
    ptime: number;
}
