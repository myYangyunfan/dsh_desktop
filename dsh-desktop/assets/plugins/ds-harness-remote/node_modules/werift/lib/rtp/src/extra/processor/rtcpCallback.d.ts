import { Event } from "../../imports/common";
import type { RtcpPacket } from "../..";
import type { SimpleProcessorCallback } from "./interface";
export type RtcpInput = RtcpPacket;
export interface RtcpOutput {
    rtcp?: RtcpPacket;
    eol?: boolean;
}
export declare class RtcpSourceCallback implements SimpleProcessorCallback<RtcpInput, RtcpOutput> {
    private cb?;
    private destructor?;
    onStopped: Event<any[]>;
    toJSON(): {};
    pipe(cb: (chunk: RtcpOutput) => void, destructor?: () => void): this;
    input: (rtcp: RtcpInput) => void;
    stop(): void;
    destroy: () => void;
}
