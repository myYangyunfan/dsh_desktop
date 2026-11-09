"use strict";
var AuthenticatedSafe_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthenticatedSafe = void 0;
const tslib_1 = require("tslib");
const asn1_schema_1 = require("@peculiar/asn1-schema");
const asn1_cms_1 = require("@peculiar/asn1-cms");
let AuthenticatedSafe = AuthenticatedSafe_1 = class AuthenticatedSafe extends asn1_schema_1.AsnArray {
    constructor(items) {
        super(items);
        Object.setPrototypeOf(this, AuthenticatedSafe_1.prototype);
    }
};
exports.AuthenticatedSafe = AuthenticatedSafe;
exports.AuthenticatedSafe = AuthenticatedSafe = AuthenticatedSafe_1 = tslib_1.__decorate([
    (0, asn1_schema_1.AsnType)({
        type: asn1_schema_1.AsnTypeTypes.Sequence,
        itemType: asn1_cms_1.ContentInfo,
    })
], AuthenticatedSafe);
