"use strict";
var UnprotectedAttributes_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnvelopedData = exports.UnprotectedAttributes = void 0;
const tslib_1 = require("tslib");
const asn1_schema_1 = require("@peculiar/asn1-schema");
const types_1 = require("./types");
const attribute_1 = require("./attribute");
const recipient_infos_1 = require("./recipient_infos");
const originator_info_1 = require("./originator_info");
const encrypted_content_info_1 = require("./encrypted_content_info");
let UnprotectedAttributes = UnprotectedAttributes_1 = class UnprotectedAttributes extends asn1_schema_1.AsnArray {
    constructor(items) {
        super(items);
        Object.setPrototypeOf(this, UnprotectedAttributes_1.prototype);
    }
};
exports.UnprotectedAttributes = UnprotectedAttributes;
exports.UnprotectedAttributes = UnprotectedAttributes = UnprotectedAttributes_1 = tslib_1.__decorate([
    (0, asn1_schema_1.AsnType)({
        type: asn1_schema_1.AsnTypeTypes.Set,
        itemType: attribute_1.Attribute,
    })
], UnprotectedAttributes);
class EnvelopedData {
    version = types_1.CMSVersion.v0;
    originatorInfo;
    recipientInfos = new recipient_infos_1.RecipientInfos();
    encryptedContentInfo = new encrypted_content_info_1.EncryptedContentInfo();
    unprotectedAttrs;
    constructor(params = {}) {
        Object.assign(this, params);
    }
}
exports.EnvelopedData = EnvelopedData;
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: asn1_schema_1.AsnPropTypes.Integer })
], EnvelopedData.prototype, "version", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: originator_info_1.OriginatorInfo,
        context: 0,
        implicit: true,
        optional: true,
    })
], EnvelopedData.prototype, "originatorInfo", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: recipient_infos_1.RecipientInfos })
], EnvelopedData.prototype, "recipientInfos", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: encrypted_content_info_1.EncryptedContentInfo })
], EnvelopedData.prototype, "encryptedContentInfo", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: UnprotectedAttributes,
        context: 1,
        implicit: true,
        optional: true,
    })
], EnvelopedData.prototype, "unprotectedAttrs", void 0);
