import type { RTCRtpTransceiver } from "./media";
import type { MediaDirection } from "./media/rtpTransceiver";
import { type BundlePolicy, GroupDescription, MediaDescription, SessionDescription } from "./sdp";
import type { RTCDtlsTransport } from "./transport/dtls";
import type { RTCSctpTransport } from "./transport/sctp";
export declare class SDPManager {
    currentLocalDescription?: SessionDescription;
    currentRemoteDescription?: SessionDescription;
    pendingLocalDescription?: SessionDescription;
    pendingRemoteDescription?: SessionDescription;
    readonly cname: string;
    readonly midSuffix: boolean;
    readonly bundlePolicy?: BundlePolicy;
    private seenMid;
    constructor({ cname, midSuffix, bundlePolicy, }: {
        cname: string;
        midSuffix?: boolean;
        bundlePolicy?: BundlePolicy;
    });
    get localDescription(): import("./sdp").RTCSessionDescription | undefined;
    get remoteDescription(): import("./sdp").RTCSessionDescription | undefined;
    /**@private */
    get _localDescription(): SessionDescription | undefined;
    /**@private */
    get _remoteDescription(): SessionDescription | undefined;
    get inactiveRemoteMedia(): MediaDescription | undefined;
    /**
     * MediaDescriptionをトランシーバー用に作成
     */
    createMediaDescriptionForTransceiver(transceiver: RTCRtpTransceiver, direction: MediaDirection): MediaDescription;
    /**
     * MediaDescriptionをSCTP用に作成
     */
    createMediaDescriptionForSctp(sctp: RTCSctpTransport): MediaDescription;
    /**
     * トランスポートの情報をMediaDescriptionに追加
     */
    addTransportDescription(media: MediaDescription, dtlsTransport: RTCDtlsTransport): void;
    /**
     * 一意のMIDを割り当て
     */
    allocateMid(type?: "dc" | "av" | ""): string;
    parseSdp({ sdp, isLocal, signalingState, type, }: {
        sdp: string;
        isLocal: boolean;
        signalingState: string;
        type: "offer" | "answer" | "pranswer";
    }): SessionDescription;
    private validateDescription;
    /**
     * オファーSDPを構築
     */
    buildOfferSdp(transceivers: RTCRtpTransceiver[], sctpTransport: RTCSctpTransport | undefined): SessionDescription;
    /**
     * アンサーSDPを構築
     */
    buildAnswerSdp({ transceivers, sctpTransport, signalingState, }: {
        transceivers: RTCRtpTransceiver[];
        sctpTransport: RTCSctpTransport | undefined;
        signalingState: string;
    }): SessionDescription;
    setLocalDescription(description: SessionDescription): void;
    setRemoteDescription(sessionDescription: RTCSessionDescriptionInit, signalingState: string): SessionDescription | undefined;
    rollbackLocalDescription(signalingState: string): void;
    registerMid(mid: string): void;
    get remoteIsBundled(): GroupDescription | undefined;
    /**
     * ローカルセッション記述を設定し、トランスポート情報を追加する
     */
    setLocal(description: SessionDescription, transceivers: RTCRtpTransceiver[], sctpTransport?: {
        dtlsTransport: RTCDtlsTransport;
        mid?: string;
    }): void;
}
export interface RTCSessionDescriptionInit {
    sdp?: string;
    type?: RTCSdpType;
}
export type RTCSdpType = "answer" | "offer" | "pranswer" | "rollback";
