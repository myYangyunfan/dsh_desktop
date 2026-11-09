import { type BufferSourceLike } from "@peculiar/utils";
import { IEmptyConstructor, IAsnParseOptions } from "./types";
export declare class AsnConvert {
    static serialize(obj: unknown): ArrayBuffer;
    static parse<T>(data: BufferSourceLike, target: IEmptyConstructor<T>, options?: IAsnParseOptions): T;
    /**
     * Returns a string representation of an ASN.1 encoded data
     * @param data ASN.1 encoded buffer source
     * @param options Optional parsing options forwarded to `asn1js.fromBER`
     * @returns String representation of ASN.1 structure
     */
    static toString(data: BufferSourceLike, options?: IAsnParseOptions): string;
    /**
     * Returns a string representation of an ASN.1 schema
     * @param obj Object which can be serialized to ASN.1 schema
     * @param options Optional parsing options forwarded to `asn1js.fromBER`
     * @returns String representation of ASN.1 structure
     */
    static toString(obj: unknown, options?: IAsnParseOptions): string;
}
