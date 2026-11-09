"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RSAPrivateKey = void 0;
const tslib_1 = require("tslib");
const asn1_schema_1 = require("@peculiar/asn1-schema");
const other_prime_info_1 = require("./other_prime_info");
class RSAPrivateKey {
    version = 0;
    modulus = new ArrayBuffer(0);
    publicExponent = new ArrayBuffer(0);
    privateExponent = new ArrayBuffer(0);
    prime1 = new ArrayBuffer(0);
    prime2 = new ArrayBuffer(0);
    exponent1 = new ArrayBuffer(0);
    exponent2 = new ArrayBuffer(0);
    coefficient = new ArrayBuffer(0);
    otherPrimeInfos;
    constructor(params = {}) {
        Object.assign(this, params);
    }
}
exports.RSAPrivateKey = RSAPrivateKey;
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: asn1_schema_1.AsnPropTypes.Integer })
], RSAPrivateKey.prototype, "version", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: asn1_schema_1.AsnPropTypes.Integer,
        converter: asn1_schema_1.AsnIntegerArrayBufferConverter,
    })
], RSAPrivateKey.prototype, "modulus", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: asn1_schema_1.AsnPropTypes.Integer,
        converter: asn1_schema_1.AsnIntegerArrayBufferConverter,
    })
], RSAPrivateKey.prototype, "publicExponent", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: asn1_schema_1.AsnPropTypes.Integer,
        converter: asn1_schema_1.AsnIntegerArrayBufferConverter,
    })
], RSAPrivateKey.prototype, "privateExponent", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: asn1_schema_1.AsnPropTypes.Integer,
        converter: asn1_schema_1.AsnIntegerArrayBufferConverter,
    })
], RSAPrivateKey.prototype, "prime1", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: asn1_schema_1.AsnPropTypes.Integer,
        converter: asn1_schema_1.AsnIntegerArrayBufferConverter,
    })
], RSAPrivateKey.prototype, "prime2", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: asn1_schema_1.AsnPropTypes.Integer,
        converter: asn1_schema_1.AsnIntegerArrayBufferConverter,
    })
], RSAPrivateKey.prototype, "exponent1", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: asn1_schema_1.AsnPropTypes.Integer,
        converter: asn1_schema_1.AsnIntegerArrayBufferConverter,
    })
], RSAPrivateKey.prototype, "exponent2", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: asn1_schema_1.AsnPropTypes.Integer,
        converter: asn1_schema_1.AsnIntegerArrayBufferConverter,
    })
], RSAPrivateKey.prototype, "coefficient", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: other_prime_info_1.OtherPrimeInfos,
        optional: true,
    })
], RSAPrivateKey.prototype, "otherPrimeInfos", void 0);
