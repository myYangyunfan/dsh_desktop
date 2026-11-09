"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Clearance = void 0;
const tslib_1 = require("tslib");
const asn1_schema_1 = require("@peculiar/asn1-schema");
const class_list_1 = require("./class_list");
const security_category_1 = require("./security_category");
class Clearance {
    policyId = "";
    classList = new class_list_1.ClassList(class_list_1.ClassListFlags.unclassified);
    securityCategories;
    constructor(params = {}) {
        Object.assign(this, params);
    }
}
exports.Clearance = Clearance;
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({ type: asn1_schema_1.AsnPropTypes.ObjectIdentifier })
], Clearance.prototype, "policyId", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: class_list_1.ClassList,
        defaultValue: new class_list_1.ClassList(class_list_1.ClassListFlags.unclassified),
    })
], Clearance.prototype, "classList", void 0);
tslib_1.__decorate([
    (0, asn1_schema_1.AsnProp)({
        type: security_category_1.SecurityCategory,
        repeated: "set",
    })
], Clearance.prototype, "securityCategories", void 0);
