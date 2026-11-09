"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AsnConvert = void 0;
const tslib_1 = require("tslib");
const asn1js = tslib_1.__importStar(require("asn1js"));
const utils_1 = require("@peculiar/utils");
const parser_1 = require("./parser");
const serializer_1 = require("./serializer");
class AsnConvert {
    static serialize(obj) {
        return serializer_1.AsnSerializer.serialize(obj);
    }
    static parse(data, target, options) {
        return parser_1.AsnParser.parse(data, target, options);
    }
    static toString(data, options) {
        const buf = (0, utils_1.isBufferSource)(data) ? (0, utils_1.toArrayBuffer)(data) : AsnConvert.serialize(data);
        const asn = asn1js.fromBER(buf, options?.berOptions);
        if (asn.offset === -1) {
            throw new Error(`Cannot decode ASN.1 data. ${asn.result.error}`);
        }
        return asn.result.toString();
    }
}
exports.AsnConvert = AsnConvert;
