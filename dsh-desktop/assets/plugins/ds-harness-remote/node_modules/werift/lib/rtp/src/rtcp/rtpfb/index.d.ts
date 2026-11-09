import type { RtcpHeader } from "../header";
import { GenericNack } from "./nack";
import { TransportWideCC } from "./twcc";
type Feedback = GenericNack | TransportWideCC;
export declare class RtcpTransportLayerFeedback {
    static readonly type = 205;
    readonly type = 205;
    feedback: Feedback;
    header: RtcpHeader;
    constructor(props?: Partial<RtcpTransportLayerFeedback>);
    serialize(): Buffer<ArrayBuffer>;
    static deSerialize(data: Buffer, header: RtcpHeader): RtcpTransportLayerFeedback;
}
export {};
