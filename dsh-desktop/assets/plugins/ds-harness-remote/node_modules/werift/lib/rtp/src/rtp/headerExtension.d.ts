import type { Extension } from "./rtp";
export declare const RTP_EXTENSION_URI: {
    readonly sdesMid: "urn:ietf:params:rtp-hdrext:sdes:mid";
    readonly sdesRTPStreamID: "urn:ietf:params:rtp-hdrext:sdes:rtp-stream-id";
    readonly repairedRtpStreamId: "urn:ietf:params:rtp-hdrext:sdes:repaired-rtp-stream-id";
    readonly transportWideCC: "http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01";
    readonly absSendTime: "http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time";
    readonly dependencyDescriptor: "https://aomediacodec.github.io/av1-rtp-spec/#dependency-descriptor-rtp-header-extension";
    readonly audioLevelIndication: "urn:ietf:params:rtp-hdrext:ssrc-audio-level";
    readonly videoOrientation: "urn:3gpp:video-orientation";
};
export type TransportWideCCPayload = number;
export type AudioLevelIndicationPayload = {
    v: boolean;
    level: number;
};
export interface videoOrientationPayload {
    /**
     Camera: indicates the direction of the camera used for this video stream. It can be used by the MTSI client in
    receiver to e.g. display the received video differently depending on the source camera.
    0: Front-facing camera, facing the user. If camera direction is unknown by the sending MTSI client in the terminal
    then this is the default value used.
    1: Back-facing camera, facing away from the user.
   */
    c: number;
    /**
     F = Flip: indicates a horizontal (left-right flip) mirror operation on the video as sent on the link.
    0: No flip operation. If the sending MTSI client in terminal does not know if a horizontal mirror operation is
    necessary, then this is the default value used.
    1: Horizontal flip operation
     */
    f: number;
    /**
     R1, R0 = Rotation: indicates the rotation of the video as transmitted on the link. The receiver should rotate the video to
    compensate that rotation. E.g. a 90° Counter Clockwise rotation should be compensated by the receiver with a 90°
    Clockwise rotation prior to displaying.
  
      +----+----+-----------------------------------------------+------------------------------+
    | R1 | R0 | Rotation of the video as sent on the link     | Rotation on the receiver      |
    |    |    |                                               | before display                |
    +----+----+-----------------------------------------------+------------------------------+
    |  0 |  0 | 0° rotation                                   | None                         |
    +----+----+-----------------------------------------------+------------------------------+
    |  0 |  1 | 90° Counter Clockwise (CCW) rotation or 270°  | 90° Clockwise (CW) rotation  |
    |    |    | Clockwise (CW) rotation                       |                              |
    +----+----+-----------------------------------------------+------------------------------+
    |  1 |  0 | 180° CCW rotation or 180° CW rotation         | 180° CW rotation             |
    +----+----+-----------------------------------------------+------------------------------+
    |  1 |  1 | 270° CCW rotation or 90° CW rotation          | 90° CCW rotation             |
    +----+----+-----------------------------------------------+------------------------------+
  
     */
    r1: number;
    r0: number;
}
export interface Extensions {
    [uri: string]: any;
}
export declare function rtpHeaderExtensionsParser(extensions: Extension[], extIdUriMap: {
    [id: number]: string;
}): Extensions;
export declare function serializeSdesMid(id: string): Buffer<ArrayBuffer>;
export declare function serializeSdesRTPStreamID(id: string): Buffer<ArrayBuffer>;
export declare function serializeRepairedRtpStreamId(id: string): Buffer<ArrayBuffer>;
export declare function serializeTransportWideCC(transportSequenceNumber: number): Buffer<ArrayBuffer>;
export declare function serializeAbsSendTime(ntpTime: bigint): Buffer<ArrayBuffer>;
export declare function serializeAudioLevelIndication(level: number): Buffer<ArrayBufferLike>;
export declare function deserializeString(buf: Buffer): string;
export declare function deserializeUint16BE(buf: Buffer): number;
export declare function deserializeAbsSendTime(buf: Buffer): any;
export declare function deserializeAudioLevelIndication(buf: Buffer): AudioLevelIndicationPayload;
export declare function deserializeVideoOrientation(payload: Buffer): videoOrientationPayload;
