import type { HandshakeType } from "../../handshake/const";
export declare class FragmentedHandshake {
    msg_type: number;
    length: number;
    message_seq: number;
    fragment_offset: number;
    fragment_length: number;
    fragment: Buffer;
    static readonly spec: {
        msg_type: number;
        length: number;
        message_seq: number;
        fragment_offset: number;
        fragment_length: number;
        fragment: any;
    };
    constructor(msg_type: number, length: number, message_seq: number, fragment_offset: number, fragment_length: number, fragment: Buffer);
    get summary(): any;
    static createEmpty(): FragmentedHandshake;
    static deSerialize(buf: Buffer): FragmentedHandshake;
    serialize(): Buffer<ArrayBuffer>;
    chunk(maxFragmentLength?: number): FragmentedHandshake[];
    static assemble(messages: FragmentedHandshake[]): FragmentedHandshake;
    static findAllFragments(fragments: FragmentedHandshake[], type: HandshakeType): FragmentedHandshake[];
}
