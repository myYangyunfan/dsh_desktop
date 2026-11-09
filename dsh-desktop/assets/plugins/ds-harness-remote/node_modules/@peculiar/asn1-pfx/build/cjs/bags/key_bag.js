"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KeyBag = void 0;
const tslib_1 = require("tslib");
const asn1_pkcs8_1 = require("@peculiar/asn1-pkcs8");
const asn1_schema_1 = require("@peculiar/asn1-schema");
let KeyBag = class KeyBag extends asn1_pkcs8_1.PrivateKeyInfo {
};
exports.KeyBag = KeyBag;
exports.KeyBag = KeyBag = tslib_1.__decorate([
    (0, asn1_schema_1.AsnType)({ type: asn1_schema_1.AsnTypeTypes.Sequence })
], KeyBag);
