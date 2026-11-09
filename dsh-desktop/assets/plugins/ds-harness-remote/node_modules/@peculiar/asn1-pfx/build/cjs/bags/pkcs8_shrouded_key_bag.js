"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PKCS8ShroudedKeyBag = void 0;
const tslib_1 = require("tslib");
const asn1_pkcs8_1 = require("@peculiar/asn1-pkcs8");
const asn1_schema_1 = require("@peculiar/asn1-schema");
let PKCS8ShroudedKeyBag = class PKCS8ShroudedKeyBag extends asn1_pkcs8_1.EncryptedPrivateKeyInfo {
};
exports.PKCS8ShroudedKeyBag = PKCS8ShroudedKeyBag;
exports.PKCS8ShroudedKeyBag = PKCS8ShroudedKeyBag = tslib_1.__decorate([
    (0, asn1_schema_1.AsnType)({ type: asn1_schema_1.AsnTypeTypes.Sequence })
], PKCS8ShroudedKeyBag);
