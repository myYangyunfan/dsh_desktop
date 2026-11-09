import * as asn1js from "asn1js";
import { isBufferSource, toArrayBuffer } from "@peculiar/utils";
export class OctetString {
    buffer;
    get byteLength() {
        return this.buffer.byteLength;
    }
    get byteOffset() {
        return 0;
    }
    constructor(param) {
        if (typeof param === "number") {
            this.buffer = new ArrayBuffer(param);
        }
        else {
            if (isBufferSource(param)) {
                this.buffer = toArrayBuffer(param);
            }
            else if (Array.isArray(param)) {
                this.buffer = new Uint8Array(param).buffer;
            }
            else {
                this.buffer = new ArrayBuffer(0);
            }
        }
    }
    fromASN(asn) {
        if (!(asn instanceof asn1js.OctetString)) {
            throw new TypeError("Argument 'asn' is not instance of ASN.1 OctetString");
        }
        this.buffer = toArrayBuffer(asn.valueBlock.valueHex);
        return this;
    }
    toASN() {
        return new asn1js.OctetString({ valueHex: this.buffer });
    }
    toSchema(name) {
        return new asn1js.OctetString({ name });
    }
}
