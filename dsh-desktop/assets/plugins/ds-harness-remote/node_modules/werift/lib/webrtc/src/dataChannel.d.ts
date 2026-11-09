import { Event } from "./imports/common";
import { EventTarget } from "./helper";
import type { RTCSctpTransport } from "./transport/sctp";
import type { Callback, CallbackWithValue } from "./types/util";
export interface DataChannelStats {
    messagesSent: number;
    bytesSent: number;
    messagesReceived: number;
    bytesReceived: number;
}
export declare function getDataChannelMessageSize(data: Buffer | string): number;
export declare class RTCDataChannel extends EventTarget implements DataChannelStats {
    readonly sctp: RTCSctpTransport;
    private readonly parameters;
    readonly sendOpen: boolean;
    readonly statsId: string;
    readonly stateChange: Event<[DCState]>;
    readonly stateChanged: Event<[DCState]>;
    readonly onMessage: Event<[string | Buffer<ArrayBufferLike>]>;
    readonly error: Event<[Error]>;
    readonly bufferedAmountLow: Event<any[]>;
    onopen?: Callback;
    onclose?: Callback;
    onclosing?: Callback;
    onmessage?: CallbackWithValue<MessageEvent>;
    onerror?: CallbackWithValue<RTCErrorEvent>;
    isCreatedByRemote: boolean;
    id: number;
    readyState: DCState;
    bufferedAmount: number;
    private _bufferedAmountLowThreshold;
    messagesSent: number;
    bytesSent: number;
    messagesReceived: number;
    bytesReceived: number;
    constructor(sctp: RTCSctpTransport, parameters: RTCDataChannelParameters, sendOpen?: boolean);
    get ordered(): boolean;
    get maxRetransmits(): number | null;
    get maxPacketLifeTime(): number | null;
    get label(): string;
    get protocol(): string;
    get negotiated(): boolean;
    get bufferedAmountLowThreshold(): number;
    set bufferedAmountLowThreshold(value: number);
    setId(id: number): void;
    setReadyState(state: DCState): void;
    addBufferedAmount(amount: number): void;
    send(data: Buffer | string): void;
    close(): void;
}
export type DCState = "open" | "closed" | "connecting" | "closing";
export declare class RTCDataChannelParameters {
    label: string;
    maxPacketLifeTime?: number;
    maxRetransmits?: number;
    ordered: boolean;
    protocol: string;
    negotiated: boolean;
    id: number;
    constructor(props?: Partial<RTCDataChannelParameters>);
}
export interface MessageEvent {
    data: string | Buffer;
}
export interface RTCErrorEvent {
    error: any;
}
