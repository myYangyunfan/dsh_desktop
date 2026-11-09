import { Event } from "../../imports/common";
import type { JitterBufferOptions, LipSyncOptions } from "../../imports/rtpExtra";
import type { MediaStreamTrack } from "../../media/track";
import type { MediaWriter, StreamEvent } from "./writer";
export type { StreamEvent };
export declare class MediaRecorder {
    props: Partial<MediaRecorderOptions> & ({
        numOfTracks: number;
        tracks?: MediaStreamTrack[];
    } | {
        numOfTracks?: number;
        tracks: MediaStreamTrack[];
    }) & ({
        path: string;
        stream?: StreamEvent;
    } | {
        path?: string;
        stream: StreamEvent;
    });
    writer: MediaWriter;
    ext?: string;
    tracks: MediaStreamTrack[];
    started: boolean;
    onError: Event<[Error]>;
    constructor(props: Partial<MediaRecorderOptions> & ({
        numOfTracks: number;
        tracks?: MediaStreamTrack[];
    } | {
        numOfTracks?: number;
        tracks: MediaStreamTrack[];
    }) & ({
        path: string;
        stream?: StreamEvent;
    } | {
        path?: string;
        stream: StreamEvent;
    }));
    addTrack(track: MediaStreamTrack): Promise<void>;
    private start;
    stop(): Promise<void>;
}
export interface MediaRecorderOptions {
    width: number;
    height: number;
    roll: number;
    disableLipSync: boolean;
    disableNtp: boolean;
    defaultDuration: number;
    tracks: MediaStreamTrack[];
    lipsync: Partial<LipSyncOptions>;
    jitterBuffer: Partial<JitterBufferOptions>;
}
