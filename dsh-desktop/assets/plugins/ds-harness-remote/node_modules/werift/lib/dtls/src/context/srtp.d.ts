import type { SrtpProfile } from "../imports/rtp";
export declare class SrtpContext {
    srtpProfile?: SrtpProfile;
    static findMatchingSRTPProfile(remote: SrtpProfile[], local: SrtpProfile[]): 1 | 7 | undefined;
}
