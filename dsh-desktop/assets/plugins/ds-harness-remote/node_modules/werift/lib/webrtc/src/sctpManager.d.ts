import { Event } from "./imports/common";
import { RTCDataChannel } from "./dataChannel";
import { type RTCStats } from "./media/stats";
import type { MediaDescription } from "./sdp";
import { RTCSctpTransport } from "./transport/sctp";
export declare class SctpTransportManager {
    sctpTransport?: RTCSctpTransport;
    sctpRemotePort?: number;
    dataChannelsOpened: number;
    dataChannelsClosed: number;
    private dataChannels;
    readonly onDataChannel: Event<[RTCDataChannel]>;
    constructor();
    createSctpTransport(maxMessageSize?: number): RTCSctpTransport;
    createDataChannel(label: string, options?: Partial<{
        maxPacketLifeTime?: number;
        protocol: string;
        maxRetransmits?: number;
        ordered: boolean;
        negotiated: boolean;
        id?: number;
    }>): RTCDataChannel;
    connectSctp(): Promise<void>;
    setRemoteSCTP(remoteMedia: MediaDescription, mLineIndex: number): void;
    close(): Promise<void>;
    getStats(timestamp?: number): Promise<RTCStats[]>;
}
