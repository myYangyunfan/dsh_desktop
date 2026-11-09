import { Event } from "../../imports/common";
import { GenericNack, type RtpPacket } from "../../imports/rtp";
import type { RTCRtpReceiver } from "../rtpReceiver";
export declare class NackHandler {
    private receiver;
    private newEstSeqNum;
    private _lost;
    private nackLoop;
    readonly onPacketLost: Event<[GenericNack]>;
    mediaSourceSsrc?: number;
    retryCount: number;
    closed: boolean;
    constructor(receiver: RTCRtpReceiver);
    get lostSeqNumbers(): number[];
    private getLost;
    private setLost;
    private removeLost;
    addPacket(packet: RtpPacket): void;
    private pruneLost;
    close(): void;
    private updateRetryCount;
    private sendNack;
}
