"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OctetString = void 0;
const tslib_1 = require("tslib");
const asn1js = tslib_1.__importStar(require("asn1js"));
const utils_1 = require("@peculiar/utils");
class OctetString {
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
            if ((0, utils_1.isBufferSource)(param)) {
                this.buffer = (0, utils_1.toArrayBuffer)(param);
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
        this.buffer = (0, utils_1.toArrayBuffer)(asn.valueBlock.valueHex);
        return this;
    }
    toASN() {
        return new asn1js.OctetString({ valueHex: this.buffer });
    }
    toSchema(name) {
        return new asn1js.OctetString({ name });
    }
}
exports.OctetString = OctetString;
