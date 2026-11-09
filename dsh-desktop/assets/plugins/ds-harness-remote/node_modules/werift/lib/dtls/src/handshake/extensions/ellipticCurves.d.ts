import type { Extension } from "../../typings/domain";
export declare class EllipticCurves {
    static type: number;
    static readonly spec: {
        type: number;
        data: any;
    };
    type: number;
    data: number[];
    constructor(props?: Partial<EllipticCurves>);
    static createEmpty(): EllipticCurves;
    static fromData(buf: Buffer): EllipticCurves;
    static deSerialize(buf: Buffer): EllipticCurves;
    serialize(): Buffer<ArrayBuffer>;
    get extension(): Extension;
}
