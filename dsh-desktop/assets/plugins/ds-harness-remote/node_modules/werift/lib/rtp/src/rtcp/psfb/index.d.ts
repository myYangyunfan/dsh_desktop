import { RtcpHeader } from "../header";
import { FullIntraRequest } from "./fullIntraRequest";
import { PictureLossIndication } from "./pictureLossIndication";
import { ReceiverEstimatedMaxBitrate } from "./remb";
type Feedback = FullIntraRequest | PictureLossIndication | ReceiverEstimatedMaxBitrate;
export declare class RtcpPayloadSpecificFeedback {
    static readonly type = 206;
    readonly type = 206;
    feedback: Feedback;
    constructor(props?: Partial<RtcpPayloadSpecificFeedback>);
    serialize(): Buffer<ArrayBuffer>;
    static deSerialize(data: Buffer, header: RtcpHeader): RtcpPayloadSpecificFeedback;
}
export {};
