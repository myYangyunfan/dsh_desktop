import * as asn1js from "asn1js";
import { isBufferSource, toArrayBuffer } from "@peculiar/utils";
import { AsnParser } from "./parser";
import { AsnSerializer } from "./serializer";
export class AsnConvert {
    static serialize(obj) {
        return AsnSerializer.serialize(obj);
    }
    static parse(data, target, options) {
        return AsnParser.parse(data, target, options);
    }
    static toString(data, options) {
        const buf = isBufferSource(data) ? toArrayBuffer(data) : AsnConvert.serialize(data);
        const asn = asn1js.fromBER(buf, options?.berOptions);
        if (asn.offset === -1) {
            throw new Error(`Cannot decode ASN.1 data. ${asn.result.error}`);
        }
        return asn.result.toString();
    }
}
