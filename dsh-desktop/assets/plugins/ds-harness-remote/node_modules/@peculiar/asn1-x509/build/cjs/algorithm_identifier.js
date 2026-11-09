"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlgorithmIdentifier = void 0;
const tslib_1 = require("tslib");
const asn1_schema_1 = require("@peculiar/asn1-schema");
const bytes_1 = require("@peculiar/utils/bytes");
class AlgorithmIdentifier {
    algorithm = "";
    parameters;
    constructor(params = {}) {
        Object.assign(this, params);
    }
    isEqual(data) {
        return (data instanceof AlgorithmIdentifier &&
            data.algorithm == this.algorithm &&
            ((data.parameters && this.parameters && (0, bytes_1.equal)(data.parameters, this.parameters)) || data.parameters === this.parameters));
    }
}
exports.AlgorithmIdentifier = AlgorithmIdentifier;
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: asn1_schema_1.AsnPropTypes.ObjectIdentifier })
], AlgorithmIdentifier.prototype, "algorithm", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: asn1_schema_1.AsnPropTypes.Any,
        optional: true,
    })
], AlgorithmIdentifier.prototype, "parameters", void 0);
