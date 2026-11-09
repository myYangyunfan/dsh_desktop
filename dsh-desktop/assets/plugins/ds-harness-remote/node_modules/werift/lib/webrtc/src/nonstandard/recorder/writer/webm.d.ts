import { EventDisposer } from "../../../imports/common";
import { MediaWriter } from ".";
import { type MediaStreamTrack } from "../../..";
import { RtpSourceCallback } from "../../../imports/rtpExtra";
export declare class WebmFactory extends MediaWriter {
    rtpSources: RtpSourceCallback[];
    private onEol;
    private ended;
    unSubscribers: EventDisposer;
    start(tracks: MediaStreamTrack[]): Promise<void>;
    stop(): Promise<void>;
}
