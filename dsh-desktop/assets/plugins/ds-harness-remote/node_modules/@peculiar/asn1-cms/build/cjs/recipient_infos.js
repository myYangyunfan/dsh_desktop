"use strict";
var RecipientInfos_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecipientInfos = void 0;
const tslib_1 = require("tslib");
const asn1_schema_1 = require("@peculiar/asn1-schema");
const recipient_info_1 = require("./recipient_info");
let RecipientInfos = RecipientInfos_1 = class RecipientInfos extends asn1_schema_1.AsnArray {
    constructor(items) {
        super(items);
        Object.setPrototypeOf(this, RecipientInfos_1.prototype);
    }
};
exports.RecipientInfos = RecipientInfos;
exports.RecipientInfos = RecipientInfos = RecipientInfos_1 = tslib_1.__decorate([
    (0, asn1_schema_1.AsnType)({
        type: asn1_schema_1.AsnTypeTypes.Set,
        itemType: recipient_info_1.RecipientInfo,
    })
], RecipientInfos);
