"use strict";
var RevocationInfoChoices_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RevocationInfoChoices = exports.RevocationInfoChoice = exports.OtherRevocationInfoFormat = exports.id_ri_scvp = exports.id_ri_ocsp_response = exports.id_ri = void 0;
const tslib_1 = require("tslib");
const asn1_schema_1 = require("@peculiar/asn1-schema");
const asn1_x509_1 = require("@peculiar/asn1-x509");
exports.id_ri = `${asn1_x509_1.id_pkix}.16`;
exports.id_ri_ocsp_response = `${exports.id_ri}.2`;
exports.id_ri_scvp = `${exports.id_ri}.4`;
class OtherRevocationInfoFormat {
    otherRevInfoFormat = "";
    otherRevInfo = new ArrayBuffer(0);
    constructor(params = {}) {
        Object.assign(this, params);
    }
}
exports.OtherRevocationInfoFormat = OtherRevocationInfoFormat;
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: asn1_schema_1.AsnPropTypes.ObjectIdentifier })
], OtherRevocationInfoFormat.prototype, "otherRevInfoFormat", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: asn1_schema_1.AsnPropTypes.Any })
], OtherRevocationInfoFormat.prototype, "otherRevInfo", void 0);
let RevocationInfoChoice = class RevocationInfoChoice {
    other = new OtherRevocationInfoFormat();
    constructor(params = {}) {
        Object.assign(this, params);
    }
};
exports.RevocationInfoChoice = RevocationInfoChoice;
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: OtherRevocationInfoFormat,
        context: 1,
        implicit: true,
    })
], RevocationInfoChoice.prototype, "other", void 0);
exports.RevocationInfoChoice = RevocationInfoChoice = tslib_1.__decorate([
    (0, asn1_schema_1.AsnType)({ type: asn1_schema_1.AsnTypeTypes.Choice })
], RevocationInfoChoice);
let RevocationInfoChoices = RevocationInfoChoices_1 = class RevocationInfoChoices extends asn1_schema_1.AsnArray {
    constructor(items) {
        super(items);
        Object.setPrototypeOf(this, RevocationInfoChoices_1.prototype);
    }
};
exports.RevocationInfoChoices = RevocationInfoChoices;
exports.RevocationInfoChoices = RevocationInfoChoices = RevocationInfoChoices_1 = tslib_1.__decorate([
    (0, asn1_schema_1.AsnType)({
        type: asn1_schema_1.AsnTypeTypes.Set,
        itemType: RevocationInfoChoice,
    })
], RevocationInfoChoices);
