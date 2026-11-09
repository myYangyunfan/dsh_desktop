import { type Red, RtpPacket } from "../..";
export declare class RedHandler {
    private readonly size;
    private sequenceNumbers;
    push(red: Red, base: RtpPacket): RtpPacket[];
}
