import { WebmBase, type WebmInput, type WebmOption, type WebmOutput, type WebmTrack } from "./webm";
export declare class WebmCallback extends WebmBase {
    private cb?;
    private queue;
    constructor(tracks: WebmTrack[], options?: WebmOption);
    pipe: (cb: (input: WebmOutput) => Promise<any>) => void;
    inputAudio: (input: WebmInput) => void;
    inputVideo: (input: WebmInput) => void;
    destroy: () => void;
}
/**
 *
 * @param path
 * @returns eol
 */
export declare const saveToFileSystem: (path: string) => (value: WebmOutput) => Promise<boolean>;
