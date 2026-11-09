import type { Extension } from "../../typings/domain";
export declare class UseSRTP {
    static type: number;
    static readonly spec: {
        type: number;
        data: any;
    };
    type: number;
    data: Buffer;
    profiles: number[];
    mki: Buffer;
    constructor(props?: Partial<UseSRTP>);
    static create(profiles: number[], mki: Buffer): UseSRTP;
    static deSerialize(buf: Buffer): UseSRTP;
    serialize(): Buffer<ArrayBuffer>;
    static fromData(buf: Buffer): UseSRTP;
    get extension(): Extension;
}
