import { Event } from "../imports/common";
import { SCTP } from "../../../sctp/src";
import { RTCDataChannel } from "../dataChannel";
import type { RTCDtlsTransport } from "./dtls";
export declare const DEFAULT_MAX_MESSAGE_SIZE = 65536;
export declare class RTCSctpTransport {
    port: number;
    maxMessageSize: number;
    dtlsTransport: RTCDtlsTransport;
    sctp: SCTP;
    readonly onDataChannel: Event<[RTCDataChannel]>;
    readonly id: string;
    mid?: string;
    mLineIndex?: number;
    bundled: boolean;
    dataChannels: {
        [key: number]: RTCDataChannel;
    };
    remoteMaxMessageSize: number;
    private dataChannelQueue;
    private dataChannelId?;
    private eventDisposer;
    constructor(port?: number, maxMessageSize?: number);
    get transport(): RTCDtlsTransport;
    setDtlsTransport(dtlsTransport: RTCDtlsTransport): void;
    private get isServer();
    channelByLabel(label: string): RTCDataChannel | undefined;
    private datachannelReceive;
    dataChannelAddNegotiated(channel: RTCDataChannel): void;
    dataChannelOpen(channel: RTCDataChannel): void;
    private dataChannelFlush;
    private assertSendableMessageSize;
    datachannelSend: (channel: RTCDataChannel, data: Buffer | string) => number;
    getCapabilities(): RTCSctpCapabilities;
    static getCapabilities(maxMessageSize?: number): RTCSctpCapabilities;
    setRemoteMaxMessageSize(maxMessageSize?: number): void;
    setRemotePort(port: number): void;
    start(remotePort: number): Promise<void>;
    stop(): Promise<void>;
    dataChannelClose(channel: RTCDataChannel): void;
}
export declare class RTCSctpCapabilities {
    maxMessageSize: number;
    constructor(maxMessageSize: number);
}
