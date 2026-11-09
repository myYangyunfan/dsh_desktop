import { Readable } from "stream";
import { Input, type InputTrack } from "mediabunny";
import { Event } from "../imports/common";
import { MediaStreamTrack } from "../media/track";
import { type SupportedSourceCodec } from "./userMedia/packetizer";
type UserMediaSource = {
    path: string;
    buffer?: never;
    stream?: never;
} | {
    path?: never;
    buffer: Buffer | ArrayBuffer | ArrayBufferView;
    stream?: never;
} | {
    path?: never;
    buffer?: never;
    stream: Readable | ReadableStream<Uint8Array>;
};
export type FileMediaTrackSource = UserMediaSource & {
    loop?: boolean;
};
export declare const getUserMedia: (options: FileMediaTrackSource) => Promise<MediaPlayer>;
declare class MediaPlayer {
    readonly audio?: MediaStreamTrack;
    readonly video?: MediaStreamTrack;
    readonly onError: Event<[Error]>;
    private readonly source;
    private readonly loop;
    private readonly streamId;
    private session?;
    private running?;
    private abortController?;
    private hasStartedPlayback;
    private stopped;
    constructor({ source, loop, streamId, session, }: {
        source: ReplayableUserMediaSource;
        loop: boolean;
        streamId: string;
        session: PlaybackSession;
    });
    start(): Promise<void>;
    stop(): void;
    private run;
    private getOrCreateSession;
    private disposeSession;
}
declare class TrackPlaybackRunner {
    private readonly props;
    constructor(props: PlaybackTrack & {
        mediaStartTimestamp: number;
    });
    play({ startedAt, signal, sourceChanged, }: {
        startedAt: number;
        signal: AbortSignal;
        sourceChanged: boolean;
    }): Promise<void>;
    assertReady(): void;
    private requireNegotiatedCodec;
}
interface PlaybackTrack {
    inputTrack: InputTrack;
    track: MediaStreamTrack;
    sourceCodec: SupportedSourceCodec;
    decoderDescription?: ArrayBuffer | ArrayBufferView | null;
    sourceChannels?: number;
}
interface PlaybackSession {
    input: Input;
    mediaStartTimestamp: number;
    playbackTracks: PlaybackTrack[];
    runners: TrackPlaybackRunner[];
}
type ReplayableUserMediaSource = {
    path: string;
    buffer?: never;
} | {
    path?: never;
    buffer: Buffer;
};
export {};
