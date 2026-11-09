"use strict";
var ProxyInfo_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProxyInfo = void 0;
const tslib_1 = require("tslib");
const asn1_schema_1 = require("@peculiar/asn1-schema");
const target_1 = require("./target");
let ProxyInfo = ProxyInfo_1 = class ProxyInfo extends asn1_schema_1.AsnArray {
    constructor(items) {
        super(items);
        Object.setPrototypeOf(this, ProxyInfo_1.prototype);
    }
};
exports.ProxyInfo = ProxyInfo;
exports.ProxyInfo = ProxyInfo = ProxyInfo_1 = tslib_1.__decorate([
    (0, asn1_schema_1.AsnType)({
        type: asn1_schema_1.AsnTypeTypes.Sequence,
        itemType: target_1.Targets,
    })
], ProxyInfo);
