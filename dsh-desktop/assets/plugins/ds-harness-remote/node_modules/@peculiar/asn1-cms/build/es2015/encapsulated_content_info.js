import { __decorate } from "tslib";
import { AsnProp, AsnPropTypes, AsnType, AsnTypeTypes, OctetString } from "@peculiar/asn1-schema";
let EncapsulatedContent = class EncapsulatedContent {
    single;
    any;
    constructor(params = {}) {
        Object.assign(this, params);
    }
};
__decorate([
    AsnProp({ type: OctetString })
], EncapsulatedContent.prototype, "single", void 0);
__decorate([
    AsnProp({ type: AsnPropTypes.Any })
], EncapsulatedContent.prototype, "any", void 0);
EncapsulatedContent = __decorate([
    AsnType({ type: AsnTypeTypes.Choice })
], EncapsulatedContent);
export { EncapsulatedContent };
export class EncapsulatedContentInfo {
    eContentType = "";
    eContent;
    constructor(params = {}) {
        Object.assign(this, params);
    }
}
__decorate([
    AsnProp({ type: AsnPropTypes.ObjectIdentifier })
], EncapsulatedContentInfo.prototype, "eContentType", void 0);
__decorate([
    AsnProp({
        type: EncapsulatedContent,
        context: 0,
        optional: true,
    })
], EncapsulatedContentInfo.prototype, "eContent", void 0);
