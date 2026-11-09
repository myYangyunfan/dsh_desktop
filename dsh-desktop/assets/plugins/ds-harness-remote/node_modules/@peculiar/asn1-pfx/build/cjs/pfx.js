"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PFX = void 0;
const tslib_1 = require("tslib");
const asn1_schema_1 = require("@peculiar/asn1-schema");
const asn1_cms_1 = require("@peculiar/asn1-cms");
const mac_data_1 = require("./mac_data");
class PFX {
    version = 3;
    authSafe = new asn1_cms_1.ContentInfo();
    macData = new mac_data_1.MacData();
    constructor(params = {}) {
        Object.assign(this, params);
    }
}
exports.PFX = PFX;
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: asn1_schema_1.AsnPropTypes.Integer })
], PFX.prototype, "version", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: asn1_cms_1.ContentInfo })
], PFX.prototype, "authSafe", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: mac_data_1.MacData,
        optional: true,
    })
], PFX.prototype, "macData", void 0);
