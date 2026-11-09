"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OriginatorInfo = void 0;
const tslib_1 = require("tslib");
const asn1_schema_1 = require("@peculiar/asn1-schema");
const certificate_choices_1 = require("./certificate_choices");
const revocation_info_choice_1 = require("./revocation_info_choice");
class OriginatorInfo {
    certs;
    crls;
    constructor(params = {}) {
        Object.assign(this, params);
    }
}
exports.OriginatorInfo = OriginatorInfo;
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: certificate_choices_1.CertificateSet,
        context: 0,
        implicit: true,
        optional: true,
    })
], OriginatorInfo.prototype, "certs", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: revocation_info_choice_1.RevocationInfoChoices,
        context: 1,
        implicit: true,
        optional: true,
    })
], OriginatorInfo.prototype, "crls", void 0);
