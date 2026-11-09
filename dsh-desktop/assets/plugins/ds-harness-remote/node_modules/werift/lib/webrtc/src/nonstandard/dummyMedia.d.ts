import { MediaStreamTrack } from "../media/track";
export interface DummyAudioOptions {
    packetIntervalMs: number;
}
export interface DummyVideoOptions {
    fps: number;
    keyframeIntervalFrames: number;
}
export interface DummySource {
    stop(): void;
}
export declare function createDummyAudioTrack(options?: Partial<DummyAudioOptions>): {
    track: MediaStreamTrack;
    source: DummySource;
};
export declare function createDummyVideoTrack(options?: Partial<DummyVideoOptions>): {
    track: MediaStreamTrack;
    source: DummySource;
};
