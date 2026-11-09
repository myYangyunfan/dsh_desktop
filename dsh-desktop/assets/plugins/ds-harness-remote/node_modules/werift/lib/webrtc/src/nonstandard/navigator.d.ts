import { RTCRtpCodecParameters } from "..";
import { MediaStream, MediaStreamTrack } from "../media/track";
import { type DummyAudioOptions, type DummyVideoOptions } from "./dummyMedia";
export declare class Navigator {
    mediaDevices: MediaDevices;
    constructor(props?: ConstructorParameters<typeof MediaDevices>[0]);
}
export declare class MediaDevices extends EventTarget {
    readonly props: MediaDeviceProps;
    video?: MediaStreamTrack;
    audio?: MediaStreamTrack;
    private readonly activeSourceStops;
    constructor(props?: MediaDeviceProps);
    readonly getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
    readonly getDisplayMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
    readonly getUdpMedia: ({ port, codec, }: {
        port: number;
        codec: ConstructorParameters<typeof RTCRtpCodecParameters>[0];
    }) => {
        track: MediaStreamTrack;
        disposer: () => void;
    };
    cleanup(): void;
    private createTrack;
    private createClonedTrack;
    private createDummyTrack;
    private attachTrackStop;
}
interface MediaDeviceProps {
    video?: MediaStreamTrack;
    audio?: MediaStreamTrack;
    dummyMedia?: {
        enabled: boolean;
        audio?: Partial<DummyAudioOptions>;
        video?: Partial<DummyVideoOptions>;
    };
}
interface MediaStreamConstraints {
    audio?: boolean | MediaTrackConstraints;
    peerIdentity?: string;
    preferCurrentTab?: boolean;
    video?: boolean | MediaTrackConstraints;
}
interface MediaTrackConstraints extends MediaTrackConstraintSet {
    advanced?: MediaTrackConstraintSet[];
}
interface MediaTrackConstraintSet {
    aspectRatio?: ConstrainDouble;
    autoGainControl?: ConstrainBoolean;
    channelCount?: ConstrainULong;
    deviceId?: ConstrainDOMString;
    displaySurface?: ConstrainDOMString;
    echoCancellation?: ConstrainBoolean;
    facingMode?: ConstrainDOMString;
    frameRate?: ConstrainDouble;
    groupId?: ConstrainDOMString;
    height?: ConstrainULong;
    noiseSuppression?: ConstrainBoolean;
    sampleRate?: ConstrainULong;
    sampleSize?: ConstrainULong;
    width?: ConstrainULong;
}
type ConstrainDOMString = string | string[] | ConstrainDOMStringParameters;
interface ConstrainDOMStringParameters {
    exact?: string | string[];
    ideal?: string | string[];
}
type ConstrainBoolean = boolean | ConstrainBooleanParameters;
interface ConstrainBooleanParameters {
    exact?: boolean;
    ideal?: boolean;
}
type ConstrainULong = number | ConstrainULongRange;
interface ConstrainULongRange extends ULongRange {
    exact?: number;
    ideal?: number;
}
interface ULongRange {
    max?: number;
    min?: number;
}
type ConstrainDouble = number | ConstrainDoubleRange;
interface ConstrainDoubleRange extends DoubleRange {
    exact?: number;
    ideal?: number;
}
interface DoubleRange {
    max?: number;
    min?: number;
}
export declare const navigator: Navigator;
export {};
