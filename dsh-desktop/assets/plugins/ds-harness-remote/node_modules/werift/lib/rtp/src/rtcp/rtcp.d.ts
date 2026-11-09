import { RtcpPayloadSpecificFeedback } from "./psfb";
import { RtcpRrPacket } from "./rr";
import { RtcpTransportLayerFeedback } from "./rtpfb";
import { RtcpSourceDescriptionPacket } from "./sdes";
import { RtcpSrPacket } from "./sr";
export type RtcpPacket = RtcpRrPacket | RtcpSrPacket | RtcpPayloadSpecificFeedback | RtcpSourceDescriptionPacket | RtcpTransportLayerFeedback;
export declare class RtcpPacketConverter {
    static deSerialize(data: Buffer): RtcpPacket[];
}
export declare function isRtcp(buf: Buffer): boolean;
