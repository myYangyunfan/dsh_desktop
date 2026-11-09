"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CounterSignature = exports.id_counterSignature = void 0;
const tslib_1 = require("tslib");
const asn1_schema_1 = require("@peculiar/asn1-schema");
const signer_info_1 = require("../signer_info");
exports.id_counterSignature = "1.2.840.113549.1.9.6";
let CounterSignature = class CounterSignature extends signer_info_1.SignerInfo {
};
exports.CounterSignature = CounterSignature;
exports.CounterSignature = CounterSignature = tslib_1.__decorate([
    (0, asn1_schema_1.AsnType)({ type: asn1_schema_1.AsnTypeTypes.Sequence })
], CounterSignature);
