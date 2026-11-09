"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoleSyntax = void 0;
const tslib_1 = require("tslib");
const asn1_schema_1 = require("@peculiar/asn1-schema");
const asn1_x509_1 = require("@peculiar/asn1-x509");
class RoleSyntax {
    roleAuthority;
    roleName;
    constructor(params = {}) {
        Object.assign(this, params);
    }
}
exports.RoleSyntax = RoleSyntax;
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: asn1_x509_1.GeneralNames,
        implicit: true,
        context: 0,
        optional: true,
    })
], RoleSyntax.prototype, "roleAuthority", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: asn1_x509_1.GeneralName,
        implicit: true,
        context: 1,
    })
], RoleSyntax.prototype, "roleName", void 0);
