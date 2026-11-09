import * as asn1js from "asn1js";
import { type BufferSourceLike } from "@peculiar/utils";
import { IAsnConvertible } from "../types";
export declare class BitString<T extends number = number> implements IAsnConvertible {
    unusedBits: number;
    value: ArrayBuffer;
    constructor();
    constructor(value: T);
    constructor(value: BufferSourceLike, unusedBits?: number);
    fromASN(asn: asn1js.BitString): this;
    toASN(): asn1js.BitString;
    toSchema(name: string): asn1js.BitString;
    toNumber(): T;
    fromNumber(value: T): void;
}
