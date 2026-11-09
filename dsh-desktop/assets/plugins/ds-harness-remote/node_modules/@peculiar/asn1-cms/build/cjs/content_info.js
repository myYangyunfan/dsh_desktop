"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContentInfo = void 0;
const tslib_1 = require("tslib");
const asn1_schema_1 = require("@peculiar/asn1-schema");
class ContentInfo {
    contentType = "";
    content = new ArrayBuffer(0);
    constructor(params = {}) {
        Object.assign(this, params);
    }
}
exports.ContentInfo = ContentInfo;
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: asn1_schema_1.AsnPropTypes.ObjectIdentifier })
], ContentInfo.prototype, "contentType", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: asn1_schema_1.AsnPropTypes.Any,
        context: 0,
    })
], ContentInfo.prototype, "content", void 0);
