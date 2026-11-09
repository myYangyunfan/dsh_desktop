"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EncapsulatedContentInfo = exports.EncapsulatedContent = void 0;
const tslib_1 = require("tslib");
const asn1_schema_1 = require("@peculiar/asn1-schema");
let EncapsulatedContent = class EncapsulatedContent {
    single;
    any;
    constructor(params = {}) {
        Object.assign(this, params);
    }
};
exports.EncapsulatedContent = EncapsulatedContent;
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: asn1_schema_1.OctetString })
], EncapsulatedContent.prototype, "single", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: asn1_schema_1.AsnPropTypes.Any })
], EncapsulatedContent.prototype, "any", void 0);
exports.EncapsulatedContent = EncapsulatedContent = tslib_1.__decorate([
    (0, asn1_schema_1.AsnType)({ type: asn1_schema_1.AsnTypeTypes.Choice })
], EncapsulatedContent);
class EncapsulatedContentInfo {
    eContentType = "";
    eContent;
    constructor(params = {}) {
        Object.assign(this, params);
    }
}
exports.EncapsulatedContentInfo = EncapsulatedContentInfo;
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: asn1_schema_1.AsnPropTypes.ObjectIdentifier })
], EncapsulatedContentInfo.prototype, "eContentType", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: EncapsulatedContent,
        context: 0,
        optional: true,
    })
], EncapsulatedContentInfo.prototype, "eContent", void 0);
