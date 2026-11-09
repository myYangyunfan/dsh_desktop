import * as asn1js from "asn1js";
import { BufferSourceLike } from "@peculiar/utils";
import { IAsnConvertible } from "../types";
export declare class OctetString implements IAsnConvertible, ArrayBufferView {
    buffer: ArrayBuffer;
    get byteLength(): number;
    get byteOffset(): number;
    constructor();
    constructor(byteLength: number);
    constructor(bytes: number[]);
    constructor(bytes: BufferSourceLike);
    fromASN(asn: asn1js.OctetString): this;
    toASN(): asn1js.OctetString;
    toSchema(name: string): asn1js.OctetString;
}
