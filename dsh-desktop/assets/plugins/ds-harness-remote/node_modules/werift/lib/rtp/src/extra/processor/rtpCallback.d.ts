import { Event } from "../../imports/common";
import { RtpPacket } from "../..";
import type { SimpleProcessorCallback } from "./interface";
export type RtpInput = Buffer | RtpPacket;
export interface RtpOutput {
    rtp?: RtpPacket;
    eol?: boolean;
}
export declare class RtpSourceCallback implements SimpleProcessorCallback<RtpInput, RtpOutput> {
    private options;
    private cb?;
    private destructor?;
    onStopped: Event<any[]>;
    stats: {};
    buffer: RtpPacket[];
    bufferFulfilled: boolean;
    constructor(options?: {
        payloadType?: number;
        clearInvalidPTPacket?: boolean;
        initialBufferLength?: number;
    });
    toJSON(): {};
    pipe(cb: (chunk: RtpOutput) => void, destructor?: () => void): this;
    input: (packet: Buffer | RtpPacket) => void;
    stop(): void;
    destroy: () => void;
}
