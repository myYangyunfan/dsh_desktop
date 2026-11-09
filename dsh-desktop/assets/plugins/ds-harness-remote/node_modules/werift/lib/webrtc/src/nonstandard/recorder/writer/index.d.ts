import type { MediaRecorderOptions } from "..";
import type { MediaStreamTrack } from "../../..";
import type { Event } from "../../../imports/common";
import type { WebmOutput } from "../../../imports/rtpExtra";
export declare abstract class MediaWriter {
    protected props: Partial<MediaRecorderOptions> & {
        path: string;
        stream?: StreamEvent;
    } & {
        path?: string;
        stream: StreamEvent;
    };
    constructor(props: Partial<MediaRecorderOptions> & {
        path: string;
        stream?: StreamEvent;
    } & {
        path?: string;
        stream: StreamEvent;
    });
    start(tracks: MediaStreamTrack[]): Promise<void>;
    stop(): Promise<void>;
}
export type StreamEvent = Event<[WebmOutput]>;
