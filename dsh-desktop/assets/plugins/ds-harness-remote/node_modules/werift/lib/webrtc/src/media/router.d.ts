import { type RtcpPacket, type RtpPacket } from "../imports/rtp";
import type { RTCRtpReceiveParameters, RTCRtpSimulcastParameters } from "./parameters";
import { RTCRtpReceiver } from "./rtpReceiver";
import type { RTCRtpSender } from "./rtpSender";
import type { RTCRtpTransceiver } from "./rtpTransceiver";
export declare class RtpRouter {
    ssrcTable: {
        [ssrc: number]: RTCRtpReceiver | RTCRtpSender;
    };
    ridTable: {
        [rid: string]: RTCRtpReceiver | RTCRtpSender;
    };
    extIdUriMap: {
        [id: number]: string;
    };
    constructor();
    registerRtpSender(sender: RTCRtpSender): void;
    private registerRtpReceiver;
    registerRtpReceiverBySsrc(transceiver: RTCRtpTransceiver, params: RTCRtpReceiveParameters): void;
    registerRtpReceiverByRid(transceiver: RTCRtpTransceiver, param: RTCRtpSimulcastParameters, params: RTCRtpReceiveParameters): void;
    routeRtp: (packet: RtpPacket) => void;
    routeRtcp: (packet: RtcpPacket) => void;
}
