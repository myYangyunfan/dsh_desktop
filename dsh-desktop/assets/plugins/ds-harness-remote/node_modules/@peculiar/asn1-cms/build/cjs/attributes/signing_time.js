"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SigningTime = exports.id_signingTime = void 0;
const tslib_1 = require("tslib");
const asn1_x509_1 = require("@peculiar/asn1-x509");
const asn1_schema_1 = require("@peculiar/asn1-schema");
exports.id_signingTime = "1.2.840.113549.1.9.5";
let SigningTime = class SigningTime extends asn1_x509_1.Time {
};
exports.SigningTime = SigningTime;
exports.SigningTime = SigningTime = tslib_1.__decorate([
    (0, asn1_schema_1.AsnType)({ type: asn1_schema_1.AsnTypeTypes.Choice })
], SigningTime);
