"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ObjectDigestInfo = exports.DigestedObjectType = void 0;
const tslib_1 = require("tslib");
const asn1_schema_1 = require("@peculiar/asn1-schema");
const asn1_x509_1 = require("@peculiar/asn1-x509");
var DigestedObjectType;
(function (DigestedObjectType) {
    DigestedObjectType[DigestedObjectType["publicKey"] = 0] = "publicKey";
    DigestedObjectType[DigestedObjectType["publicKeyCert"] = 1] = "publicKeyCert";
    DigestedObjectType[DigestedObjectType["otherObjectTypes"] = 2] = "otherObjectTypes";
})(DigestedObjectType || (exports.DigestedObjectType = DigestedObjectType = {}));
class ObjectDigestInfo {
    digestedObjectType = DigestedObjectType.publicKey;
    otherObjectTypeID;
    digestAlgorithm = new asn1_x509_1.AlgorithmIdentifier();
    objectDigest = new ArrayBuffer(0);
    constructor(params = {}) {
        Object.assign(this, params);
    }
}
exports.ObjectDigestInfo = ObjectDigestInfo;
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: asn1_schema_1.AsnPropTypes.Enumerated })
], ObjectDigestInfo.prototype, "digestedObjectType", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: asn1_schema_1.AsnPropTypes.ObjectIdentifier,
        optional: true,
    })
], ObjectDigestInfo.prototype, "otherObjectTypeID", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: asn1_x509_1.AlgorithmIdentifier })
], ObjectDigestInfo.prototype, "digestAlgorithm", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: asn1_schema_1.AsnPropTypes.BitString })
], ObjectDigestInfo.prototype, "objectDigest", void 0);
