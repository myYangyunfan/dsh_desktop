import type { HashAlgorithms, SignatureAlgorithms } from "../../cipher/const";
export declare class Signature {
    static type: number;
    static readonly spec: {
        type: number;
        data: any;
    };
    type: number;
    data: {
        hash: HashAlgorithms;
        signature: SignatureAlgorithms;
    }[];
    constructor(props?: Partial<Signature>);
    static createEmpty(): Signature;
    static deSerialize(buf: Buffer): Signature;
    serialize(): Buffer<ArrayBuffer>;
    static fromData(buf: Buffer): Signature;
    get extension(): {
        type: number;
        data: Buffer<ArrayBuffer>;
    };
}
